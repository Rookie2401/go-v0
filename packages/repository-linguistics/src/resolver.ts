/**
 * resolveSelection — a selected word (with its sentence when there is one) becomes linguistic units, relations and a
 * FormAnalysis that keeps every reading. Pure: it reads the adapter and writes nothing. Ids come from the contract's
 * `unitIds`, so the extension and the engine agree on them.
 *
 * Albanian only. Any other language, or a surface with no Latin letter, gets a single provisional `form` unit.
 */
import { sqAdapter } from '../../../src/adapters/sq';
import type { AnalysisCandidate as AdapterCandidate, AnalyzedToken, PhraseCandidate, RawToken } from '../../../src/core';
import { unitIds } from '../../repository-contract/src';
import type {
  AnalysisCandidate, AnalysisStatus, FormAnalysis, LinguisticUnit, ProvenanceSource, UnitKind, UnitProvenance, UnitRelation,
} from '../../repository-contract/src';
import { albanianPack, ALBANIAN_PACK_ID, genericPack } from './packs';

export interface ResolveInput {
  languageId: string;
  surface: string;
  sentence?: string;
  sentenceKey?: string;
  selStart?: number;
  selEnd?: number;
  now: string;
}

export interface Resolution {
  formId: string;
  units: LinguisticUnit[];
  relations: UnitRelation[];
  analysis: FormAnalysis;
  coverage: { known: boolean; notes: string[] };
}

/** Two readings this close in confidence are treated as competing. */
export const CLOSE = 0.15;
/** The confidence from which a hand-lexicon / dictionary reading is `high-confidence`. */
export const HIGH_CONFIDENCE = 0.85;
export const SQ_VARIETY = 'sq-standard';

// ───────────────────────────── status ─────────────────────────────

export interface StatusOptions {
  /** The adapter's source says a person (a native speaker) reviewed this data. */
  reviewedByPerson?: boolean;
  /** The reading is a guess from the ending of a word the list does not know. */
  unconfirmed?: boolean;
}

const sameReading = (a: AnalysisCandidate, b: AnalysisCandidate): boolean =>
  (a.lexemeId ?? '') === (b.lexemeId ?? '') && unitIds.featureKey(a.features ?? {}) === unitIds.featureKey(b.features ?? {});

/**
 * The one place that decides a reading's status. `candidate` is one of `all`.
 *  - verified: a person reviewed the source (never true today: the adapter's sources are machine-drafted);
 *  - conflicted: another reading with a different lemma or different features is within 0.15 of the top confidence
 *    while this reading is too;
 *  - high-confidence: hand lexicon / dictionary, confidence >= 0.85, and no other reading within 0.15 of it;
 *  - provisional: everything else (rule-only, unconfirmed, or confidence < 0.85).
 * `invalidated` is never returned: only an explicit invalidation produces it.
 */
export function statusFor(candidate: AnalysisCandidate, all: AnalysisCandidate[], opts: StatusOptions = {}): AnalysisStatus {
  if (opts.reviewedByPerson || candidate.provenance.source === 'reviewer') return 'verified';
  const others = all.filter((c) => c !== candidate);
  const top = Math.max(candidate.confidence, ...others.map((c) => c.confidence));
  if (candidate.confidence >= top - CLOSE && others.some((c) => c.confidence >= top - CLOSE && !sameReading(c, candidate))) return 'conflicted';
  const lexical = candidate.provenance.source === 'hand-lexicon' || candidate.provenance.source === 'dictionary';
  if (lexical && !opts.unconfirmed && candidate.confidence >= HIGH_CONFIDENCE && !others.some((c) => Math.abs(c.confidence - candidate.confidence) <= CLOSE)) return 'high-confidence';
  return 'provisional';
}

// ───────────────────────────── helpers ─────────────────────────────

const hasLatinLetter = (s: string): boolean => /\p{Script=Latin}/u.test(s);
const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const squash = (s: string): string => s.replace(/\s+/gu, ' ').trim();
const isLetter = (ch: string | undefined): boolean => !!ch && /[\p{L}\p{M}\p{N}]/u.test(ch);

/** FNV-1a 64-bit over UTF-8, 12 hex digits: the sentence identity the extension and the engine already use. */
function sentenceKeyOf(exactText: string): string {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(exactText)) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, '0').slice(0, 12);
}

export const analysisIdOf = (formId: string, sentenceKey: string | undefined, analyzerId: string): string =>
  `analysis:${formId}@${sentenceKey ?? 'none'}@${analyzerId}`;

function genericResolution(input: ResolveInput, note: string): Resolution {
  const lang = input.languageId || 'und';
  const surface = (input.surface ?? '').normalize('NFC').trim();
  const pack = genericPack(lang);
  const formId = unitIds.form(lang, surface.toLowerCase() || '(empty)');
  const provenance: UnitProvenance = { source: 'parser', ref: 'generic', confidence: 0.1 };
  const unit: LinguisticUnit = {
    unitId: formId, kind: 'form', languageId: lang, label: surface || '(empty)', packId: pack.packId, packVersion: pack.version,
    provenance, status: 'provisional', createdAt: input.now,
  };
  const analysis: FormAnalysis = {
    analysisId: analysisIdOf(formId, undefined, pack.analyzerId), formId, languageId: lang,
    candidates: [{ confidence: 0.1, provenance }], chosen: 0, status: 'provisional',
    analyzerId: pack.analyzerId, packId: pack.packId, packVersion: pack.version, createdAt: input.now,
  };
  return { formId, units: [unit], relations: [], analysis, coverage: { known: false, notes: [note] } };
}

function provenanceOf(c: AdapterCandidate): { source: ProvenanceSource; ref: string; reviewed: boolean } {
  const info = c.sourceId ? sqAdapter.sources?.[c.sourceId] : undefined;
  const ref = c.sourceId ?? `adapter-sq@${sqAdapter.version}`;
  const reviewed = info?.reviewStatus === 'native-reviewed';
  let source: ProvenanceSource;
  if (c.unconfirmed || c.origin === 'rule' || (!c.origin && c.notes?.source === 'rule')) source = 'rule';
  else if (c.origin === 'dictionary') source = 'dictionary';
  else if (c.origin === 'reviewed') source = 'reviewer';
  else if (c.origin === 'hand' || !c.origin) source = 'hand-lexicon';
  else source = 'parser';
  return { source, ref, reviewed };
}

/** The adapter's morph structure as flat string key→value; anything that is not a non-empty string is dropped. */
function flatFeatures(morph: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(morph ?? {}).sort()) {
    const v = (morph as Record<string, unknown>)[k];
    if (typeof v === 'string' && v) out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
  }
  return out;
}

function describe(c: AdapterCandidate): string | undefined {
  try { return sqAdapter.describeMorph?.(c.morph, c.pos) || undefined; } catch { return undefined; }
}

interface Located { text: string; selStart: number; selEnd: number; inContext: boolean; note?: string }

/** Where the selection sits: by offsets when they match the surface, else the first whole-word occurrence, else alone. */
function locate(surface: string, sentence: string | undefined, selStart?: number, selEnd?: number): Located {
  if (sentence === undefined || sentence === '') return { text: surface, selStart: 0, selEnd: surface.length, inContext: false };
  const s = sentence.normalize('NFC');
  if (selStart !== undefined && selEnd !== undefined && squash(s.slice(selStart, selEnd)) === squash(surface) && selEnd > selStart) {
    return { text: s, selStart, selEnd, inContext: true };
  }
  let at = -1;
  for (let from = 0; ;) {
    const i = s.indexOf(surface, from);
    if (i < 0) break;
    if (at < 0) at = i;
    if (!isLetter(s[i - 1]) && !isLetter(s[i + surface.length])) { at = i; break; }
    from = i + 1;
  }
  if (at >= 0) return { text: s, selStart: at, selEnd: at + surface.length, inContext: true };
  return { text: surface, selStart: 0, selEnd: surface.length, inContext: false, note: 'The selection was not found in the sentence given, so the word was read alone.' };
}

class UnitBag {
  private map = new Map<string, LinguisticUnit>();
  add(u: LinguisticUnit): void {
    const old = this.map.get(u.unitId);
    if (!old) this.map.set(u.unitId, u);
  }
  get(id: string): LinguisticUnit | undefined { return this.map.get(id); }
  all(): LinguisticUnit[] { return [...this.map.values()]; }
}

class RelationBag {
  private map = new Map<string, UnitRelation>();
  add(r: UnitRelation): void {
    const k = `${r.fromId}|${r.relation}|${r.toId}`;
    const old = this.map.get(k);
    if (!old || r.confidence > old.confidence) this.map.set(k, r);
  }
  all(): UnitRelation[] { return [...this.map.values()]; }
}

// ───────────────────────────── the resolver ─────────────────────────────

export function resolveSelection(input: ResolveInput): Resolution {
  try {
    const surface = (input.surface ?? '').normalize('NFC').trim();
    if (input.languageId !== 'sq') return genericResolution(input, `No analyzer for language "${input.languageId}" in the Repository: only the form is recorded.`);
    if (!hasLatinLetter(surface)) return genericResolution(input, 'This selection has no Latin letters: the Albanian word list does not apply to it.');
    return resolveAlbanian(input, surface);
  } catch (e) {
    return genericResolution(input, `The analyzer failed (${e instanceof Error ? e.message : String(e)}); only the form is recorded.`);
  }
}

function resolveAlbanian(input: ResolveInput, surface: string): Resolution {
  const pack = albanianPack();
  const packId = ALBANIAN_PACK_ID;
  const packVersion = pack.version;
  const notes: string[] = [];

  const where = locate(surface, input.sentence, input.selStart, input.selEnd);
  if (where.note) notes.push(where.note);
  const tokens: RawToken[] = sqAdapter.tokenize(where.text);
  const analyzed: AnalyzedToken[] = sqAdapter.analyze(tokens);
  const selected: number[] = [];
  tokens.forEach((t, i) => { if (t.isWord && t.start < where.selEnd && t.end > where.selStart) selected.push(i); });

  const sentenceKey = where.inContext ? (input.sentenceKey ?? sentenceKeyOf(where.text.trim())) : undefined;
  if (!where.inContext) notes.push('No sentence context: the word was read alone, so neighbouring words could not help choose a reading.');

  if (!selected.length) return genericResolution(input, 'No word was found in the selection (only punctuation or numerals).');

  const phrases: PhraseCandidate[] = (() => {
    try {
      const set = new Set(selected);
      return sqAdapter.detectPhrases(tokens, analyzed).filter((p) => p.tokenIndexes.some((i) => set.has(i)));
    } catch { return []; }
  })();

  const single = selected.length === 1;
  const formNorm = single ? tokens[selected[0]].normalized : selected.map((i) => tokens[i].normalized).join(' ');
  const formId = unitIds.form('sq', formNorm);
  const formLabel = single ? tokens[selected[0]].surface : surface;
  const units = new UnitBag();
  const rels = new RelationBag();
  const analyzerId = analyzed[selected[0]]?.analyzer ?? `adapter-sq@${sqAdapter.version}`;

  // ── the candidates of the analysis ──
  const candidates: AnalysisCandidate[] = [];
  const statuses: AnalysisStatus[] = [];
  const adapterCands: AdapterCandidate[] = single ? analyzed[selected[0]].candidates : [];
  const prov: UnitProvenance[] = [];

  if (single) {
    const draft: AnalysisCandidate[] = adapterCands.map((c) => {
      const p = provenanceOf(c);
      const lexemeId = c.lemma ? unitIds.lexeme('sq', c.lemma, c.pos) : undefined;
      const features = flatFeatures(c.morph);
      return {
        ...(lexemeId ? { lexemeId } : {}),
        features,
        ...(c.role ? { role: c.role } : {}),
        confidence: clamp01(c.confidence),
        provenance: { source: p.source, ref: p.ref, confidence: clamp01(c.confidence) },
      };
    });
    // senses and constructions need the ids, so they are attached in a second pass
    const senseOf = new Map<string, string[]>(); // lexemeId → distinct glosses in order
    adapterCands.forEach((c, i) => {
      const cand = draft[i];
      const lex = cand.lexemeId;
      if (lex && c.gloss && !c.unconfirmed) {
        const list = senseOf.get(lex) ?? [];
        let n = list.indexOf(c.gloss);
        if (n < 0) { list.push(c.gloss); n = list.length - 1; }
        senseOf.set(lex, list);
        cand.senseId = unitIds.sense(lex, n + 1);
      }
      const feats = cand.features ?? {};
      if (c.pos && Object.keys(feats).length) cand.constructionIds = [unitIds.morph('sq', c.pos, unitIds.featureKey(feats))];
    });
    draft.forEach((cand, i) => {
      const c = adapterCands[i];
      const p = provenanceOf(c);
      candidates.push(cand);
      statuses.push(statusFor(cand, draft, { reviewedByPerson: p.reviewed, unconfirmed: !!c.unconfirmed }));
      prov.push(cand.provenance);
    });
  } else {
    const whole = phrases.find((p) => selected.every((i) => p.tokenIndexes.includes(i)));
    if (whole) {
      const cand: AnalysisCandidate = {
        constructionIds: [unitIds.phrase('sq', whole.pattern)],
        confidence: clamp01(whole.confidence),
        provenance: { source: 'hand-lexicon', ref: `adapter-sq@${sqAdapter.version}:phrases`, confidence: clamp01(whole.confidence) },
      };
      candidates.push(cand);
      statuses.push(statusFor(cand, [cand]));
      prov.push(cand.provenance);
      notes.push(`The selection matches the phrase entry "${whole.display}".`);
    } else {
      notes.push(`${selected.length} words were selected and no phrase entry covers them: select one word to see its readings.`);
    }
  }

  // chosen = highest confidence, the first on a tie
  let chosen: number | undefined;
  candidates.forEach((c, i) => { if (chosen === undefined || c.confidence > candidates[chosen].confidence) chosen = i; });

  // ── units and relations ──
  const bestFor = (pred: (c: AnalysisCandidate) => boolean): number | undefined => {
    let b: number | undefined;
    candidates.forEach((c, i) => { if (pred(c) && (b === undefined || c.confidence > candidates[b].confidence)) b = i; });
    return b;
  };
  const stamp = (kind: UnitKind, unitId: string, label: string, i: number, extra: Partial<LinguisticUnit> = {}): LinguisticUnit => ({
    unitId, kind, languageId: 'sq', label, packId, packVersion, provenance: prov[i], status: statuses[i], createdAt: input.now, ...extra,
  });

  // the form
  const formIdx = chosen;
  const chosenCand = formIdx === undefined ? undefined : candidates[formIdx];
  const chosenAdapter = single && formIdx !== undefined ? adapterCands[formIdx] : undefined;
  const formUnit: LinguisticUnit = formIdx === undefined
    ? {
      unitId: formId, kind: 'form', languageId: 'sq', label: formLabel, packId, packVersion, createdAt: input.now,
      provenance: { source: 'parser', ref: `adapter-sq@${sqAdapter.version}`, confidence: 0 }, status: 'provisional',
    }
    : stamp('form', formId, formLabel, formIdx, {
      scriptId: 'Latn',
      ...(chosenAdapter?.pos ? { pos: chosenAdapter.pos } : {}),
      ...(chosenCand?.features && Object.keys(chosenCand.features).length ? { features: chosenCand.features } : {}),
    });
  units.add(formUnit);

  if (single) {
    candidates.forEach((cand, i) => {
      const c = adapterCands[i];
      // lexeme
      if (cand.lexemeId && c.lemma) {
        const best = bestFor((x) => x.lexemeId === cand.lexemeId)!;
        units.add(stamp('lexeme', cand.lexemeId, c.lemma, best, { scriptId: 'Latn', ...(c.pos ? { pos: c.pos } : {}) }));
        rels.add({ fromId: formId, relation: 'form-of', toId: cand.lexemeId, confidence: cand.confidence, provenance: cand.provenance, status: statuses[i] });
        // sense
        if (cand.senseId && c.gloss) {
          const sBest = bestFor((x) => x.senseId === cand.senseId)!;
          units.add(stamp('sense', cand.senseId, c.gloss, sBest, { ...(c.pos ? { pos: c.pos } : {}) }));
          rels.add({ fromId: cand.senseId, relation: 'sense-of', toId: cand.lexemeId, confidence: cand.confidence, provenance: cand.provenance, status: statuses[i] });
        }
      }
      // morphological construction
      const cid = cand.constructionIds?.[0];
      if (cid && c.pos) {
        const mBest = bestFor((x) => !!x.constructionIds?.includes(cid))!;
        units.add(stamp('morph-construction', cid, describe(c) ?? unitIds.featureKey(cand.features ?? {}), mBest, { pos: c.pos, features: cand.features }));
        rels.add({ fromId: formId, relation: 'realizes', toId: cid, confidence: cand.confidence, provenance: cand.provenance, status: statuses[i] });
      }
      if (c.unconfirmed) notes.push('Not in the word list: the lemma is a guess from the ending and no meaning is given.');
      if (typeof c.notes?.disputed === 'string') notes.push(`Sources disagree: ${c.notes.disputed}`);
    });
  }

  // multiword expressions covering the selection
  for (const p of phrases) {
    const pid = unitIds.phrase('sq', p.pattern);
    const pc: AnalysisCandidate = {
      confidence: clamp01(p.confidence),
      provenance: { source: 'hand-lexicon', ref: `adapter-sq@${sqAdapter.version}:phrases`, confidence: clamp01(p.confidence) },
    };
    const pStatus = statusFor(pc, [pc]);
    units.add({
      unitId: pid, kind: 'multiword', languageId: 'sq', label: p.display, features: { kind: p.kind }, packId, packVersion,
      provenance: pc.provenance, status: pStatus, createdAt: input.now,
    });
    rels.add({ fromId: pid, relation: 'contains', toId: formId, confidence: pc.confidence, provenance: pc.provenance, status: pStatus });
    for (const u of units.all()) {
      if (u.kind === 'lexeme') rels.add({ fromId: pid, relation: 'contains', toId: u.unitId, confidence: pc.confidence, provenance: pc.provenance, status: pStatus });
    }
    if (p.gloss) {
      const sid = unitIds.sense(pid, 1);
      units.add({
        unitId: sid, kind: 'sense', languageId: 'sq', label: p.gloss, packId, packVersion, provenance: pc.provenance, status: pStatus, createdAt: input.now,
      });
      rels.add({ fromId: pid, relation: 'idiomatic-meaning', toId: sid, confidence: pc.confidence, provenance: pc.provenance, status: pStatus });
    }
  }

  // pronunciation, only when the adapter has something to say
  if (single) {
    let pron: string[] = [];
    try { pron = sqAdapter.pronunciation(tokens[selected[0]], analyzed[selected[0]]).notes ?? []; } catch { pron = []; }
    for (const note of pron) {
      const letters = note.split(':')[0].trim() || 'note';
      const uid = unitIds.pronunciation('sq', SQ_VARIETY, letters);
      const pp: AnalysisCandidate = { confidence: 0.8, provenance: { source: 'hand-lexicon', ref: `adapter-sq@${sqAdapter.version}`, confidence: 0.8 } };
      const st = statusFor(pp, [pp]);
      units.add({
        unitId: uid, kind: 'pronunciation-pattern', languageId: 'sq', varietyId: SQ_VARIETY, scriptId: 'Latn', label: note, packId, packVersion,
        provenance: pp.provenance, status: st, createdAt: input.now,
      });
      rels.add({ fromId: formId, relation: 'pronounced-as', toId: uid, confidence: pp.confidence, provenance: pp.provenance, status: st, varietyId: SQ_VARIETY });
    }
  }

  // ── analysis + coverage ──
  const analysisStatus: AnalysisStatus = chosen === undefined ? 'provisional' : statuses[chosen];
  const analysis: FormAnalysis = {
    analysisId: analysisIdOf(formId, sentenceKey, analyzerId), formId, languageId: 'sq',
    ...(sentenceKey ? { sentenceKey } : {}),
    candidates, ...(chosen === undefined ? {} : { chosen }), status: analysisStatus,
    analyzerId, packId, packVersion, createdAt: input.now,
  };

  const known = single && adapterCands.some((c) => !c.unconfirmed && !!c.lemma);
  if (single && !adapterCands.length) notes.push('Not an entry of the Albanian word list and the rules found no reading: the word is unknown to this pack.');
  if (candidates.length > 1) {
    const distinct = new Set(candidates.map((c) => c.lexemeId ?? '')).size;
    notes.push(`${candidates.length} readings kept (${distinct} lexeme${distinct === 1 ? '' : 's'}); the chosen one has the highest confidence.`);
  }
  if (chosen !== undefined && analysisStatus === 'conflicted') notes.push('Competing readings are close in confidence: none is presented as certain.');
  return { formId, units: units.all(), relations: rels.all(), analysis, coverage: { known, notes: [...new Set(notes)] } };
}
