/**
 * The facts provider: the only place GoReview reads the Repository's units, the language pack and the adapter to learn
 * what an exercise may say about a unit. Builders never reach past the `UnitFacts` it returns, and nothing here invents:
 * a gloss that no source states, a sentence the pack does not hold, a feature the adapter did not read all stay absent
 * and the builders refuse.
 *
 * Sources, and only these:
 *   the Repository          the unit, its relations and analyses (status is the Repository's, never recomputed when it is present)
 *   the pack manifest       the validation sentences, the feature vocabulary and explanations, the constructions
 *   the pack tutorial       its passage and example sentences (owner-authored, machine-drafted)
 *   the pack runtime        dictionary senses with attribution (Wiktionary via kaikki.org, CC BY-SA 4.0)
 *   the adapter             the word list's gloss for the lemma, every form's reading, the phrase rules
 * No sentence from a commercial book is ever read here: the sentence pool is the two owner-authored sources above.
 */
import { STATUS_RANK, unitIds } from '../../../repository-contract/src';
import type { AnalysisStatus, FormAnalysis, LinguisticUnit, UnitRelation } from '../../../repository-contract/src';
import { statusOf } from '../../../language-packs/src/analysis';
import { SQ_TUTORIAL } from '../../../language-packs/src/tutorial/sq';
import type { GrammarConstruction, PackManifest } from '../../../language-packs/src/manifest';
import type { GlossResult } from '../../../language-packs/src/runtime';
import type { Tutorial } from '../../../language-packs/src/tutorial/types';
import type { AnalysisCandidate, AnalyzedToken, PhraseCandidate, RawToken } from '../../../../src/core';
import type { ExampleSentence, FactsProvider } from '../types';
import type { ExampleReading, FeatureDef, FormGroup, FormInfo, ReviewFacts } from './review-facts';

// ───────────────────────────── dependencies ─────────────────────────────

/** What the facts need of a language adapter (the Albanian adapter satisfies it as it is). */
export interface FactsAdapter {
  tokenize(sentence: string): RawToken[];
  analyze(tokens: RawToken[]): AnalyzedToken[];
  normalize(surface: string): string;
  describeMorph?(morph: Record<string, string>, pos?: AnalysisCandidate['pos']): string;
  detectPhrases?(tokens: RawToken[], analyses: AnalyzedToken[]): PhraseCandidate[];
  pronunciation?(token: RawToken, analysis?: AnalyzedToken): { notes?: string[] };
}

export interface RepositoryUnit { unit: LinguisticUnit; relations: UnitRelation[]; analyses: FormAnalysis[] }

/**
 * Which manifest construction a feature structure realises. The manifest names constructions in prose only
 * (`definite-accusative-singular`), so the pattern that connects them to the analyser's features lives here, per pack.
 */
export interface ConstructionPattern {
  id: string;
  pos?: string;
  /** Every feature must equal the form's (single-valued) feature. */
  features?: Record<string, string>;
  /** For constructions identified by the lemma's shape (an adjective cited with its linking article). */
  lemmaPattern?: RegExp;
}

export const SQ_CONSTRUCTION_PATTERNS: ConstructionPattern[] = [
  { id: 'definite-accusative-singular', pos: 'NOUN', features: { Case: 'Acc', Definite: 'Def', Number: 'Sing' } },
  { id: 'definite-nominative-singular', pos: 'NOUN', features: { Case: 'Nom', Definite: 'Def', Number: 'Sing' } },
  { id: 'definite-plural', pos: 'NOUN', features: { Definite: 'Def', Number: 'Plur' } },
  { id: 'definite-noun-ending', pos: 'NOUN', features: { Definite: 'Def' } },
  { id: 'linking-article-adjective', pos: 'ADJ', lemmaPattern: /^(?:i|e|të|së) / },
];

export interface FactsProviderDeps {
  /** The Repository lookup (`RepositoryApi.unit` adapted, or a fake): undefined when the Repository does not know the unit. */
  unit(unitId: string): Promise<RepositoryUnit | undefined>;
  pack: { manifest: PackManifest; runtime: { gloss(lemma: string, pos?: string): Promise<GlossResult | undefined> } };
  adapter: FactsAdapter;
  /** The pack's orientation (its passage and example sentences). Default: the Albanian tutorial for `sq`, none otherwise. */
  tutorial?: Tutorial | null;
  constructionPatterns?: ConstructionPattern[];
  /** For a unit the Repository has not stored yet. Default: the system clock. */
  now?: () => string;
  /** At most this many dictionary senses are taken (default 6). */
  maxDictionarySenses?: number;
}

/** A `unit` dependency that can be told which units are about to be asked for, so they come in a few calls instead of one each (audit PF-02). */
export type UnitLookup = FactsProviderDeps['unit'] & { prime?(unitIds: string[]): Promise<void> };

/** The ids per `POST /units/batch` call (the service's limit). */
export const UNIT_BATCH_SIZE = 50;
/** A primed answer is used within this long of being fetched (a unit the facts never asked for must not be read later, stale). */
const PRIMED_TTL_MS = 30_000;

/**
 * Adapts the typed Repository client (`RepositoryApi.unit`) to the `unit` dependency. When the client also has `units` (several in one call),
 * the returned lookup has `prime(ids)`: it fetches the ids in chunks of 50 and the following lookups of those ids are answered from that
 * answer, each ONCE (the entry is consumed, so a later session never reads a stale unit). Any failure of the batch leaves the single-unit route to answer.
 */
export function repositoryLookup(api: {
  unit(unitId: string): Promise<{ ok: true; data: RepositoryUnit } | { ok: false }>;
  units?(unitIds: string[]): Promise<{ ok: true; data: { units: Record<string, RepositoryUnit>; missing: string[] } } | { ok: false }>;
}): UnitLookup {
  const primed = new Map<string, { at: number; unit: RepositoryUnit | undefined }>();
  const lookup: UnitLookup = async (unitId) => {
    const hit = primed.get(unitId);
    if (hit) { primed.delete(unitId); if (Date.now() - hit.at < PRIMED_TTL_MS) return hit.unit; }
    try {
      const r = await api.unit(unitId);
      return r.ok ? r.data : undefined;
    } catch {
      return undefined;
    }
  };
  const many = api.units;
  if (many) {
    lookup.prime = async (unitIds) => {
      const wanted = [...new Set(unitIds)];
      for (let i = 0; i < wanted.length; i += UNIT_BATCH_SIZE) {
        const chunk = wanted.slice(i, i + UNIT_BATCH_SIZE);
        try {
          const r = await many.call(api, chunk);
          if (!r.ok) continue;
          for (const id of chunk) primed.set(id, { at: Date.now(), unit: r.data.units[id] });   // an id the service does not know is answered as unknown, without a second call
        } catch { /* the single-unit route answers instead */ }
      }
    };
  }
  return lookup;
}

// ───────────────────────────── small helpers ─────────────────────────────

const MAX_EXAMPLES = 8;

const flat = (morph: Record<string, unknown> | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const k of Object.keys(morph ?? {}).sort()) {
    const v = (morph as Record<string, unknown>)[k];
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
};

const isSentenceLike = (s: string): boolean => /\s/u.test(s) && /[.!?…]$/u.test(s.trim());

const rankOf = (s: AnalysisStatus): number => STATUS_RANK[s];

const VERBAL = new Set(['VERB', 'AUX']);
const NOMINAL = new Set(['NOUN', 'PROPN']);
const posCompatible = (a: string, b: string): boolean => a === b || (VERBAL.has(a) && VERBAL.has(b)) || (NOMINAL.has(a) && NOMINAL.has(b));

function parseLemmaId(id: string, lang: string): { lemma: string; pos?: string } | undefined {
  const prefix = `lemma:${lang}:`;
  if (!id.startsWith(prefix)) return undefined;
  const rest = id.slice(prefix.length);
  const m = /^(.*):([A-Z]+)$/u.exec(rest);
  return m ? { lemma: m[1], pos: m[2] } : { lemma: rest };
}

function parseMorphId(id: string, lang: string): { pos: string; featureKey: string; features: Record<string, string> } | undefined {
  const m = /^morph:([^:]+):([^:]+):(.*)$/u.exec(id);
  if (!m || m[1] !== lang) return undefined;
  const features: Record<string, string> = {};
  for (const pair of m[3].split('|')) {
    const i = pair.indexOf('=');
    if (i > 0) features[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return { pos: m[2], featureKey: m[3], features };
}

// ───────────────────────────── the sentence index ─────────────────────────────

interface Occ {
  surface: string;
  normalized: string;
  start: number;
  end: number;
  tokenIndex: number;
  cands: AnalysisCandidate[];
  top?: AnalysisCandidate;
  status: AnalysisStatus;
  features: Record<string, string>;
}
interface Sent { text: string; source: ExampleSentence['source']; occs: Occ[]; phrases: PhraseCandidate[]; tokens: RawToken[] }

// ───────────────────────────── the provider ─────────────────────────────

export function createFactsProvider(deps: FactsProviderDeps): FactsProvider & { prime(unitIds: string[]): Promise<void> } {
  const { adapter, pack } = deps;
  const manifest = pack.manifest;
  const lang = manifest.languageId;
  const now = deps.now ?? (() => new Date().toISOString());
  const maxDict = deps.maxDictionarySenses ?? 6;
  const tutorial = deps.tutorial === undefined ? (lang === 'sq' ? SQ_TUTORIAL : null) : deps.tutorial;
  const patterns = deps.constructionPatterns ?? (lang === 'sq' ? SQ_CONSTRUCTION_PATTERNS : []);

  // the vocabulary of the pack's grammar
  const featureDefs: Record<string, FeatureDef> = {};
  for (const f of manifest.grammar.features) featureDefs[f.key] = { label: f.label, values: { ...f.values }, explain: f.explain };

  let sentencesCache: Sent[] | undefined;
  const sentences = (): Sent[] => {
    if (sentencesCache) return sentencesCache;
    const texts: Array<{ text: string; source: ExampleSentence['source'] }> = [];
    const seen = new Set<string>();
    const add = (text: string | undefined, source: ExampleSentence['source']): void => {
      const t = (text ?? '').normalize('NFC').trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      texts.push({ text: t, source });
    };
    for (const c of manifest.validation) add(c.sentence, 'pack-validation');
    for (const step of tutorial?.steps ?? []) {
      for (const s of step.passage?.sentences ?? []) add(s.text, 'pack-tutorial');
      for (const e of step.examples ?? []) if (isSentenceLike(e.surface)) add(e.surface, 'pack-tutorial');
      if (step.practice) add(step.practice.sentence, 'pack-tutorial');
    }
    sentencesCache = texts.map(({ text, source }) => {
      let tokens: RawToken[] = [];
      let analysed: AnalyzedToken[] = [];
      let phrases: PhraseCandidate[] = [];
      try {
        tokens = adapter.tokenize(text);
        analysed = adapter.analyze(tokens);
        phrases = adapter.detectPhrases ? adapter.detectPhrases(tokens, analysed) : [];
      } catch { /* a sentence the adapter cannot read contributes nothing */ }
      const occs: Occ[] = [];
      analysed.forEach((a, i) => {
        if (!a.token.isWord) return;
        const top = a.candidates[0];
        occs.push({
          surface: a.token.surface, normalized: a.token.normalized, start: a.token.start, end: a.token.end, tokenIndex: i,
          cands: a.candidates, ...(top ? { top } : {}), status: top ? statusOf(top, a.candidates) : 'provisional', features: flat(top?.morph),
        });
      });
      return { text, source, occs, phrases, tokens };
    });
    return sentencesCache;
  };

  const lemmaMatches = (o: Occ, lemma: string, pos?: string): boolean => !!o.top && o.top.lemma === lemma && (!pos || o.top.pos === pos);

  const readingOf = (o: Occ): ExampleReading => {
    const pos = o.top?.pos;
    const constructionId = pos && Object.keys(o.features).length ? unitIds.morph(lang, pos, unitIds.featureKey(o.features)) : undefined;
    return { surface: o.surface, ...(o.top?.lemma ? { lemma: o.top.lemma } : {}), ...(pos ? { pos } : {}), features: o.features, status: o.status, ...(constructionId ? { constructionId } : {}) };
  };

  const exampleOf = (s: Sent, o: Occ): ExampleSentence => ({ text: s.text, source: s.source, surface: s.text.slice(o.start, o.end), start: o.start, end: o.end });

  function collect(pred: (o: Occ) => boolean): { examples: ExampleSentence[]; readings: ExampleReading[] } {
    const examples: ExampleSentence[] = [];
    const readings: ExampleReading[] = [];
    for (const s of sentences()) {
      for (const o of s.occs) {
        if (!pred(o)) continue;
        if (examples.length >= MAX_EXAMPLES) return { examples, readings };
        examples.push(exampleOf(s, o));
        readings.push(readingOf(o));
        break; // one occurrence per sentence is enough to make an exercise
      }
    }
    return { examples, readings };
  }

  /** Every form of a lemma that the pack's sentences show, best reading per form, `conflicted` forms left out. */
  function formsOfLemma(lemma: string, pos?: string): FormInfo[] {
    const best = new Map<string, Occ>();
    for (const s of sentences()) {
      for (const o of s.occs) {
        if (!lemmaMatches(o, lemma, pos)) continue;
        const old = best.get(o.normalized);
        if (!old || rankOf(o.status) > rankOf(old.status)) best.set(o.normalized, o);
      }
    }
    const out: FormInfo[] = [];
    for (const [surface, o] of best) {
      if (o.status === 'conflicted' || o.status === 'invalidated') continue;
      const p = o.top?.pos;
      const constructionId = p && Object.keys(o.features).length ? unitIds.morph(lang, p, unitIds.featureKey(o.features)) : undefined;
      out.push({ surface, features: o.features, status: o.status, ...(constructionId ? { constructionId } : {}) });
    }
    return out;
  }

  /** The adapter's reading of a lemma written alone: the best candidate whose lemma is `lemma`, with its token's other candidates. */
  function readLemma(lemma: string, pos?: string): { cand?: AnalysisCandidate; all: AnalysisCandidate[]; token?: RawToken; analysis?: AnalyzedToken } {
    try {
      const tokens = adapter.tokenize(lemma);
      const analysed = adapter.analyze(tokens);
      let best: { cand: AnalysisCandidate; a: AnalyzedToken } | undefined;
      for (const a of analysed) {
        if (!a.token.isWord) continue;
        for (const c of a.candidates) {
          if (c.lemma !== lemma || (pos && c.pos !== pos)) continue;
          if (!best || c.confidence > best.cand.confidence) best = { cand: c, a };
        }
      }
      return best ? { cand: best.cand, all: best.a.candidates, token: best.a.token, analysis: best.a } : { all: [] };
    } catch {
      return { all: [] };
    }
  }

  /** Readings of the written form with a different lemma or part of speech, each with the word list's gloss. */
  function otherReadings(surface: string, lemma: string, pos?: string): NonNullable<ReviewFacts['alternativeReadings']> {
    try {
      const analysed = adapter.analyze(adapter.tokenize(surface)).filter((a) => a.token.isWord);
      const by = new Map<string, { lemma: string; pos?: string; glosses: string[] }>();
      for (const a of analysed) {
        for (const c of a.candidates) {
          if (!c.lemma || c.unconfirmed || !c.gloss) continue;
          if (c.lemma === lemma && (!pos || c.pos === pos)) continue;
          const key = `${c.lemma}|${c.pos ?? ''}`;
          const e = by.get(key) ?? { lemma: c.lemma, ...(c.pos ? { pos: c.pos } : {}), glosses: [] };
          if (!e.glosses.includes(c.gloss)) e.glosses.push(c.gloss);
          by.set(key, e);
        }
      }
      return [...by.values()];
    } catch {
      return [];
    }
  }

  async function glossesOf(lemma: string, pos: string | undefined, lexicon: string[]): Promise<{ glosses: string[]; lexiconCount: number; attribution?: string }> {
    const glosses = [...new Set(lexicon.filter((g) => g && g.trim()))];
    const lexiconCount = glosses.length;
    let attribution: string | undefined;
    try {
      const d = await pack.runtime.gloss(lemma, pos);
      if (d && d.senses.length) {
        const have = new Set(glosses.map((g) => g.normalize('NFC').toLowerCase()));
        let taken = 0;
        for (const sense of d.senses) {
          if (taken >= maxDict) break;
          // the runtime's `pos` is only a preference; a sense of another part of speech is another word (çaj "tea" is not çaj "to split")
          if (pos && sense.pos && !posCompatible(pos, sense.pos)) continue;
          const g = (sense.gloss ?? '').trim();
          if (!g || have.has(g.normalize('NFC').toLowerCase())) continue;
          glosses.push(g);
          have.add(g.normalize('NFC').toLowerCase());
          taken += 1;
        }
        if (taken > 0) attribution = d.attribution || manifest.lexical.dictionary?.attribution;
      }
    } catch { /* an absent dictionary leaves the word-list gloss alone */ }
    return { glosses, lexiconCount, ...(attribution ? { attribution } : {}) };
  }

  function explanationsFor(features: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(features)) {
      const def = manifest.grammar.features.find((f) => f.key === k);
      if (!def) continue;
      const names = v.split(',').map((x) => x.trim()).filter(Boolean).map((x) => def.values[x]).filter((n): n is string => !!n);
      out[`${k}=${v}`] = `${names.length ? `${def.label}: ${names.join(' or ')}. ` : `${def.label}. `}${def.explain}`;
    }
    return out;
  }

  function matchConstruction(pos: string | undefined, features: Record<string, string>, lemma?: string): GrammarConstruction | undefined {
    let best: { c: GrammarConstruction; weight: number } | undefined;
    for (const p of patterns) {
      const c = manifest.grammar.constructions.find((x) => x.id === p.id);
      if (!c) continue;
      if (p.pos && p.pos !== pos) continue;
      if (p.lemmaPattern && !(lemma && p.lemmaPattern.test(lemma))) continue;
      const need = Object.entries(p.features ?? {});
      if (need.some(([k, v]) => features[k] !== v)) continue;
      const weight = need.length + (p.lemmaPattern ? 1 : 0);
      if (!best || weight > best.weight) best = { c, weight };
    }
    return best?.c;
  }

  const describe = (features: Record<string, string>, pos?: string): string | undefined => {
    if (!Object.keys(features).length) return undefined;
    try { return adapter.describeMorph?.(features, pos as AnalysisCandidate['pos']) || undefined; } catch { return undefined; }
  };

  const pronunciationOf = (token: RawToken | undefined, analysis?: AnalyzedToken): string[] => {
    if (!token) return [];
    try { return adapter.pronunciation?.(token, analysis)?.notes ?? []; } catch { return []; }
  };

  const synth = (kind: LinguisticUnit['kind'], unitId: string, label: string, status: AnalysisStatus, source: LinguisticUnit['provenance']['source'], confidence: number, extra: Partial<LinguisticUnit> = {}): LinguisticUnit => ({
    unitId, kind, languageId: lang, label, packId: manifest.packId, packVersion: manifest.version,
    provenance: { source, ref: `goreview-facts:pack-derived@${manifest.analyzer.id}`, confidence }, status, createdAt: now(), ...extra,
  });

  const sourceOf = (c: AnalysisCandidate | undefined): LinguisticUnit['provenance']['source'] =>
    !c ? 'parser' : c.unconfirmed || c.origin === 'rule' || (!c.origin && c.notes?.source === 'rule') ? 'rule' : c.origin === 'dictionary' ? 'dictionary' : c.origin === 'reviewed' ? 'reviewer' : 'hand-lexicon';

  const inWordList = (c: AnalysisCandidate | undefined): boolean => !!c && !c.unconfirmed && c.origin !== 'rule' && !(!c.origin && c.notes?.source === 'rule');

  // ───────── lemma ─────────
  async function lemmaFacts(unitId: string, rec: RepositoryUnit | undefined): Promise<ReviewFacts | undefined> {
    const parsed = parseLemmaId(unitId, lang);
    if (!parsed) return undefined;
    const lemma = rec?.unit.label || parsed.lemma;
    const pos = rec?.unit.pos ?? parsed.pos;
    const read = readLemma(lemma, pos);
    if (!rec && !read.cand) return undefined;
    // a lemma competes only with readings of OTHER words: its own inflected readings (Nom,Acc vs Acc …) are not a conflict about the lemma
    const rivals = read.all.filter((c) => c !== read.cand && (c.lemma !== read.cand!.lemma || c.pos !== read.cand!.pos));
    const unit = rec?.unit ?? synth('lexeme', unitId, lemma, statusOf(read.cand!, [read.cand!, ...rivals]), sourceOf(read.cand), read.cand!.confidence, pos ? { pos } : {});
    const forms = formsOfLemma(lemma, pos);
    const { examples, readings } = collect((o) => lemmaMatches(o, lemma, pos));
    const lexGloss = read.cand && !read.cand.unconfirmed && read.cand.gloss ? [read.cand.gloss] : [];
    const g = await glossesOf(lemma, pos, lexGloss);
    const constructionIds = [...new Set(forms.map((f) => f.constructionId).filter((c): c is string => !!c))];
    const group: FormGroup = { lemma, ...(pos ? { pos } : {}), forms };
    const featureDefsUsed: Record<string, FeatureDef> = { ...featureDefs };
    return {
      unit, relations: rec?.relations ?? [], analyses: rec?.analyses ?? [], status: unit.status,
      lemma, ...(pos ? { pos } : {}),
      glosses: g.glosses, ...(g.attribution ? { glossAttribution: g.attribution } : {}),
      constructionIds, featureExplanations: {},
      siblingForms: forms.map((f) => ({ surface: f.surface, features: f.features })),
      exampleSentences: examples, pronunciationNotes: pronunciationOf(read.token, read.analysis),
      ...(rec ? {} : { derivedFromPack: true }),
      source: unit.provenance.source, lemmaInWordList: inWordList(read.cand), lexiconGlossCount: g.lexiconCount,
      featureDefs: featureDefsUsed, exampleReadings: readings, formGroups: [group],
      alternativeReadings: otherReadings(lemma, lemma, pos),
    };
  }

  // ───────── form ─────────
  async function formFacts(unitId: string, rec: RepositoryUnit | undefined): Promise<ReviewFacts | undefined> {
    const formNorm = unitId.slice(`form:${lang}:`.length);
    if (!formNorm) return undefined;
    const label = rec?.unit.label || formNorm;

    // the lemma: the Repository's form-of relation, else the chosen analysis, else the pack's own sentences, else the form alone
    let lemma: string | undefined;
    let lemmaPos: string | undefined;
    const rels = (rec?.relations ?? []).filter((r) => r.fromId === unitId && r.relation === 'form-of' && r.status !== 'invalidated').sort((a, b) => b.confidence - a.confidence);
    const fromRel = rels.length ? parseLemmaId(rels[0].toId, lang) : undefined;
    if (fromRel) { lemma = fromRel.lemma; lemmaPos = fromRel.pos; }
    if (!lemma && rec) {
      for (const a of rec.analyses) {
        const c = a.candidates[a.chosen ?? 0];
        const p = c?.lexemeId ? parseLemmaId(c.lexemeId, lang) : undefined;
        if (p) { lemma = p.lemma; lemmaPos = p.pos; break; }
      }
    }
    let alone: AnalyzedToken | undefined;
    try { alone = adapter.analyze(adapter.tokenize(label)).find((a) => a.token.isWord); } catch { alone = undefined; }
    if (!lemma) {
      const o = sentences().flatMap((s) => s.occs).find((x) => x.normalized === formNorm && x.top?.lemma);
      const c = o?.top ?? alone?.candidates[0];
      if (c?.lemma) { lemma = c.lemma; lemmaPos = c.pos; }
    }
    if (!rec && !lemma && !alone?.candidates.length) return undefined;

    const pos = rec?.unit.pos ?? lemmaPos;
    const occFilter = (o: Occ): boolean => o.normalized === formNorm && (!lemma || lemmaMatches(o, lemma, lemmaPos));
    const { examples, readings } = collect(occFilter);

    let features: Record<string, string> | undefined = rec?.unit.features && Object.keys(rec.unit.features).length ? flat(rec.unit.features) : undefined;
    if (!features && rec) {
      for (const a of rec.analyses) { const f = a.candidates[a.chosen ?? 0]?.features; if (f && Object.keys(f).length) { features = flat(f); break; } }
    }
    if (!features) features = readings[0]?.features ?? flat(alone?.candidates[0]?.morph);
    const topAlone = alone?.candidates[0];
    const status: AnalysisStatus = rec ? rec.unit.status : topAlone ? statusOf(topAlone, alone!.candidates) : 'provisional';
    const unit = rec?.unit ?? synth('form', unitId, label, status, sourceOf(topAlone), topAlone?.confidence ?? 0, { ...(pos ? { pos } : {}), ...(Object.keys(features).length ? { features } : {}) });

    const read = lemma ? readLemma(lemma, lemmaPos) : { all: [] as AnalysisCandidate[] };
    const lexCand = read.cand;
    const lexGloss: string[] = lexCand && !lexCand.unconfirmed && lexCand.gloss ? [lexCand.gloss] : [];
    if (!lexGloss.length) {
      const c = sentences().flatMap((s) => s.occs).find((x) => x.normalized === formNorm && x.top?.gloss && !x.top.unconfirmed)?.top;
      if (c?.gloss) lexGloss.push(c.gloss);
    }
    const g: Awaited<ReturnType<typeof glossesOf>> = lemma ? await glossesOf(lemma, lemmaPos ?? pos, lexGloss) : { glosses: lexGloss, lexiconCount: lexGloss.length };
    const siblings = lemma ? formsOfLemma(lemma, lemmaPos).filter((f) => f.surface !== formNorm) : [];
    const constructionId = pos && Object.keys(features).length ? unitIds.morph(lang, pos, unitIds.featureKey(features)) : undefined;
    const matched = matchConstruction(pos, features, lemma);
    const own: FormInfo[] = lemma ? formsOfLemma(lemma, lemmaPos) : [];
    const morphDescription = describe(features, pos);

    return {
      unit, relations: rec?.relations ?? [], analyses: rec?.analyses ?? [], status,
      ...(lemma ? { lemma } : {}), ...(pos ? { pos } : {}),
      ...(Object.keys(features).length ? { features } : {}),
      glosses: g.glosses, ...(g.attribution ? { glossAttribution: g.attribution } : {}),
      constructionIds: constructionId ? [constructionId] : [],
      ...(matched ? { constructionLabel: matched.label, constructionExplanation: `${matched.label}. ${matched.explain}` } : {}),
      featureExplanations: explanationsFor(features),
      siblingForms: siblings.map((f) => ({ surface: f.surface, features: f.features })),
      exampleSentences: examples, pronunciationNotes: pronunciationOf(alone?.token, alone),
      ...(rec ? {} : { derivedFromPack: true }),
      source: unit.provenance.source, lemmaInWordList: inWordList(lexCand), lexiconGlossCount: g.lexiconCount,
      ...(morphDescription ? { morphDescription } : {}),
      featureDefs, exampleReadings: readings,
      formGroups: lemma ? [{ lemma, ...(lemmaPos ?? pos ? { pos: lemmaPos ?? pos } : {}), forms: own }] : [],
      alternativeReadings: lemma ? otherReadings(label, lemma, lemmaPos) : [],
    };
  }

  // ───────── morphological construction ─────────
  async function constructionFacts(unitId: string, rec: RepositoryUnit | undefined): Promise<ReviewFacts | undefined> {
    const parsed = parseMorphId(unitId, lang);
    if (!parsed) return undefined;
    const features = rec?.unit.features && Object.keys(rec.unit.features).length ? flat(rec.unit.features) : parsed.features;
    const pos = rec?.unit.pos ?? parsed.pos;
    if (!rec && !Object.keys(features).length) return undefined;
    const key = unitIds.featureKey(features);
    const realises = (o: Occ): boolean => o.top?.pos === pos && unitIds.featureKey(o.features) === key;
    const { examples, readings } = collect(realises);
    const forms = new Map<string, { surface: string; features: Record<string, string> }>();
    const lemmas = new Map<string, string | undefined>();
    for (const s of sentences()) for (const o of s.occs) {
      if (!realises(o)) continue;
      if (!forms.has(o.normalized)) forms.set(o.normalized, { surface: o.normalized, features: o.features });
      if (o.top?.lemma) lemmas.set(o.top.lemma, o.top.pos);
    }
    const groups: FormGroup[] = [...lemmas].map(([lemma, p]) => ({ lemma, ...(p ? { pos: p } : {}), forms: formsOfLemma(lemma, p) })).filter((gr) => gr.forms.length > 0);
    const status: AnalysisStatus = rec?.unit.status ?? 'provisional';
    const unit = rec?.unit ?? synth('morph-construction', unitId, describe(features, pos) ?? key, status, 'rule', 0.5, { pos, features });
    const matched = matchConstruction(pos, features);
    const morphDescription = describe(features, pos);
    return {
      unit, relations: rec?.relations ?? [], analyses: rec?.analyses ?? [], status, pos, features,
      glosses: [], constructionIds: [unitId],
      constructionLabel: matched?.label ?? unit.label,
      ...(matched ? { constructionExplanation: `${matched.label}. ${matched.explain}` } : {}),
      featureExplanations: explanationsFor(features),
      siblingForms: [...forms.values()],
      exampleSentences: examples, pronunciationNotes: [],
      ...(rec ? {} : { derivedFromPack: true }),
      source: unit.provenance.source, lemmaInWordList: false, lexiconGlossCount: 0,
      ...(morphDescription ? { morphDescription } : {}),
      featureDefs, exampleReadings: readings, formGroups: groups, alternativeReadings: [],
    };
  }

  // ───────── multiword ─────────
  async function phraseFacts(unitId: string, rec: RepositoryUnit | undefined): Promise<ReviewFacts | undefined> {
    const suffix = unitId.slice(`phrase:${lang}:`.length);
    if (!suffix) return undefined;
    const examples: ExampleSentence[] = [];
    const readings: ExampleReading[] = [];
    let hit: PhraseCandidate | undefined;
    for (const s of sentences()) {
      for (const p of s.phrases) {
        if (p.pattern.join('_') !== suffix) continue;
        const toks = p.tokenIndexes.map((i) => s.tokens[i]).filter((t): t is RawToken => !!t);
        if (!toks.length) continue;
        const start = Math.min(...toks.map((t) => t.start));
        const end = Math.max(...toks.map((t) => t.end));
        hit ??= p;
        if (examples.length < MAX_EXAMPLES) {
          examples.push({ text: s.text, source: s.source, surface: s.text.slice(start, end), start, end });
          readings.push({ surface: s.text.slice(start, end), features: {}, status: rec?.unit.status ?? 'provisional' });
        }
        break;
      }
    }
    if (!rec && !hit) return undefined;
    // the Repository's own gloss of the expression, when the pack's sentences do not show it
    let repoGloss: string | undefined;
    if (rec) {
      const rel = rec.relations.find((r) => r.fromId === unitId && r.relation === 'idiomatic-meaning');
      if (rel) { try { repoGloss = (await deps.unit(rel.toId))?.unit.label; } catch { repoGloss = undefined; } }
    }
    const gloss = hit?.gloss ?? repoGloss;
    const display = hit?.display ?? rec?.unit.label ?? suffix;
    const kind = hit?.kind ?? rec?.unit.features?.kind;
    const status: AnalysisStatus = rec?.unit.status ?? 'provisional';
    const unit = rec?.unit ?? synth('multiword', unitId, display, status, 'hand-lexicon', hit?.confidence ?? 0.5, kind ? { features: { kind } } : {});
    return {
      unit, relations: rec?.relations ?? [], analyses: rec?.analyses ?? [], status,
      glosses: gloss ? [gloss] : [], constructionIds: [], featureExplanations: {}, siblingForms: [],
      phrase: { display, ...(gloss ? { gloss } : {}), ...(kind ? { kind } : {}) },
      exampleSentences: examples, pronunciationNotes: [],
      ...(rec ? {} : { derivedFromPack: true }),
      source: unit.provenance.source, lexiconGlossCount: gloss ? 1 : 0, featureDefs, exampleReadings: readings, formGroups: [], alternativeReadings: [],
    };
  }

  return {
    /** Asks the Repository for these units in a few calls; the `factsFor` calls that follow use that answer. A no-op when the lookup cannot batch. */
    async prime(unitIds) { try { await (deps.unit as UnitLookup).prime?.(unitIds); } catch { /* factsFor asks one by one */ } },
    async factsFor(unitId, languageId) {
      try {
        if (languageId !== lang || typeof unitId !== 'string') return undefined;
        let rec: RepositoryUnit | undefined;
        try { rec = await deps.unit(unitId); } catch { rec = undefined; }
        if (rec && rec.unit.unitId !== unitId) rec = undefined;
        if (unitId.startsWith('lemma:')) return await lemmaFacts(unitId, rec);
        if (unitId.startsWith('form:')) return await formFacts(unitId, rec);
        if (unitId.startsWith('morph:')) return await constructionFacts(unitId, rec);
        if (unitId.startsWith('phrase:')) return await phraseFacts(unitId, rec);
        return undefined;
      } catch {
        return undefined;
      }
    },
  };
}

