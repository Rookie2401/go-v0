/**
 * The Arabic DECK AUDIT harness: builds a GoReview deck through the REAL path from texts and counts what was admitted.
 *
 *   text -> the extension's own word naming (packages/golearn-extension/src/active/scan.ts `wordsOfText`: the unit ids it records) with the whole
 *   Arabic index installed (the extension has it) -> encounter events -> the Repository's folds (knowledge) -> the units a Repository would hold
 *   (`resolveSelection`: a bare form is registered by the extension's `registerSurfaces`; a lemma id never is) -> GoReview recovery of the absent
 *   units from the pack facts (core + the shards the units need, loaded by GoReview's own loader) -> the engine's ranking of the stored units ->
 *   GoReview intake (the facts provider, rules 1-10) -> the admitted cards.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { arAdapter } from '../../src/adapters/ar';
import { AR_CLOSED } from '../../src/adapters/arabic/closed';
import { arDeckSenseWhenAbsent, arLemmaRow } from '../../src/adapters/arabic/deck';
import { resetArabicIndexes } from '../../src/adapters/arabic/index-store';
import { arAnalyze } from '../../src/adapters/arabic/sentence';
import { arHeadForm, arKey } from '../../src/adapters/arabic/text';
import { installFullIndex } from '../../scripts/ar-deck-limits-lib.mts';
import { wordsOfText } from '../../packages/golearn-extension/src/active/scan';
import { CONTRACT_VERSION, type GoEvent, type ReviewCandidate } from '../../packages/repository-contract/src';
import { foldEvents } from '../../packages/repository-engine/src';
import { rankCandidates } from '../../packages/repository-local/src/ranking';
import { resolveSelection } from '../../packages/repository-linguistics/src';
import type { RepositoryApi, VocabularyItem } from '../../packages/repository-service/src/api';
import { createReviewEngine } from '../../packages/goreview/app/engine';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import { DEFAULT_PREFERENCES } from '../../packages/goreview/app/state';
import { evidenceFor, ratingFor, registry } from '../../packages/goreview/src';
import { acceptedMeanings } from '../../packages/goreview/src/exercises/shared';
import { createPackRuntime } from '../../packages/language-packs/src/runtime';
import { packFor } from '../../packages/language-packs/src';

export const NOW = '2026-11-25T12:00:00.000Z';
const ENROLMENT = 'ar-audit-enrolment';
const LEARNER = 'ar-audit-learner';
const PUBLIC = path.resolve(__dirname, '../../public');

export interface GoldToken { surface: string; lemma: string | null; pos: string | null; meaning: string | null }
export interface GoldSentence { id: string; register: string; text: string; tokens: GoldToken[] }
export interface AuditText { id: string; text: string; gold?: GoldToken[] }

export interface Behind { sentence: string; surface: string; gold?: GoldToken }
export interface Card {
  unitId: string; kind: 'lemma' | 'form'; head: string; pos?: string; decision: string;
  glosses: string[]; behind: Behind[];
  /** what is wrong with it, if anything (empty = nothing found) */
  problems: string[];
  /** 'unchecked' when no gold token stands behind it */
  checked: boolean;
}
export interface HeldWord { key: string; surface: string; unitIds: string[]; reason: string; limit: string }
export interface AuditResult {
  words: number; distinctWords: number; cards: Card[]; held: HeldWord[]; formCards: number;
  candidatesStillThere: number; readingsKept: number;
  figures: { admitted: number; false: number; unknownOrFragment: number; formCards: number; held: number; heldShare: number; heldByReason: Record<string, number>; unchecked: number };
}

/** The assets as a server would serve them; `patchLex` rewrites the `lex` of named lemma rows ("head|POS" -> "Sense=Rev") in every shard it serves: the "same row, reviewed" proof. */
const makeFiles = (patchLex: Record<string, string> = {}): typeof fetch => (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  const file = path.join(PUBLIC, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('not found', { status: 404 });
  const bytes = fs.readFileSync(file);
  if (!file.endsWith('.gz')) return new Response(bytes);
  const raw = zlib.gunzipSync(bytes);
  if (!Object.keys(patchLex).length) return new Response(raw);
  const shard = JSON.parse(raw.toString('utf8')) as { lemmas?: Record<string, string[]> };
  for (const [k, lex] of Object.entries(patchLex)) if (shard.lemmas?.[k]) shard.lemmas[k][3] = lex;
  return new Response(JSON.stringify(shard));
}) as typeof fetch;
const files = makeFiles();

/**
 * MEANINGS A PERSON HAS DECIDED ARE THE SAME THING although the keyword check cannot see it. Visible on purpose: every entry says who decided and why,
 * the summary line prints the size of this table, and a card counts as correct through it only when lemma, gold meaning AND the meaning shown all match.
 */
export const REVIEWED_EQUIVALENT_MEANINGS: ReadonlyArray<{ lemma: string; goldMeaning: string; shown: string; decidedBy: string; why: string }> = [
  { lemma: '\u0648\u0650\u0632\u064E\u0627\u0631\u064E\u0629', goldMeaning: 'ministry', shown: 'a government department', decidedBy: 'the lead (release manager), fix batch 1, 2026-11-26',
    why: 'a ministry is a government department; the card shows the modern sense in the source\'s own words (the source lists "the office, responsibility, or burden of ministry", an archaic sense, and "a government department")' },
];
const STOP = new Set(['to', 'a', 'an', 'the', 'of', 'be', 'or', 'and', 'in', 'is']);
/** A word without its plural / third-person s (towards = toward, ministers = minister). */
const stem = (w: string): string => (w.length > 3 ? w.replace(/s$/u, '') : w);
const wordsOf = (s: string): string[] => s.toLowerCase().split(/[^a-z]+/u).filter(Boolean).map(stem);
const contentWords = (s: string): string[] => wordsOf(s).filter((w) => !STOP.has(w));
/**
 * The leading meaning shares a content word with one of the gold alternatives ("a/b"), after dropping to / a / the. A function word is its own
 * meaning ("in", "to", "to be"): when the leading meaning or the alternative has no content word left, the words themselves are compared.
 */
export function meaningFits(lead: string, gold: string): boolean {
  const have = new Set(contentWords(lead));
  const all = new Set(wordsOf(lead));
  return gold.split('/').some((alt) => contentWords(alt).some((w) => have.has(w))
    || ((contentWords(lead).length === 0 || contentWords(alt).length === 0) && wordsOf(alt).some((w) => all.has(w))));
}
const LABELLED = /\b(archaic|obsolete|dated|rare|dialectal|dialect|historical)\b/iu;

const event = (id: string, unitId: string, n: number, at: string): GoEvent => ({
  id: `event:${unitId}:${n}`, v: CONTRACT_VERSION, learnerId: LEARNER, enrolmentId: ENROLMENT, languageId: 'ar', at,
  producer: { app: 'golearn-ext', version: '0.1.0', deviceId: 'audit-device', surface: 'reading' },
  kind: 'EncounterRecorded', subject: { itemIds: [unitId] },
  payload: { tokenCount: 8, contextKind: 'sentence', contextConfidence: 1, readerId: 'audit', language: { languageId: 'ar', varietyId: 'ar-standard', basis: 'override', confidence: 1, source: `audit:${id}`, override: true } },
  dedupeKey: `ar-audit:${unitId}:${n}`,
});

export interface RunOptions {
  /** the merge simulation: an index row with no `Sense` key is read as One (labelled in every report that uses it) */
  senseWhenAbsent?: 'One';
  /** "head|POS" -> the `lex` string its index row is served with (e.g. "Sense=Ord", "Sense=Rev") */
  patchLex?: Record<string, string>;
}

/** The ids a GoReview-bound card names. */
const parseLemmaId = (id: string): { head: string; pos?: string } => {
  const body = id.slice('lemma:ar:'.length);
  const m = /^(.*):([A-Z]+)$/u.exec(body);
  return m ? { head: m[1], pos: m[2] } : { head: body };
};

function adapterReadOnGoReviewSide(head: string): string {
  const c = arAdapter.analyze(arAdapter.tokenize(head)).find((a) => a.token.isWord)?.candidates[0];
  return c ? `${c.lemma} ${c.confidence} ${String(c.notes?.identity ?? '')} ${String(c.notes?.deckLimit ?? 'unmarked')}` : 'none';
}

export async function runDeckAudit(texts: AuditText[], opts: RunOptions = {}): Promise<AuditResult> {
  arDeckSenseWhenAbsent(opts.senseWhenAbsent);
  // 1. the extension's side: the whole index, the ids it records
  installFullIndex();
  const words: Array<{ surface: string; ids: string[]; known: boolean; sentence: string; gold?: GoldToken }> = [];
  const ctxTop = new Map<string, import('../../src/core').AnalysisCandidate | undefined>();
  const headTop = new Map<string, import('../../src/core').AnalysisCandidate | undefined>();
  let rawReadings = 0;
  let keptReadings = 0;
  for (const t of texts) {
    const found = wordsOfText(t.text, arAdapter, 'ar');
    if (t.gold && found.length !== t.gold.length) throw new Error(`${t.id}: ${found.length} words, ${t.gold.length} gold tokens`);
    found.forEach((w, i) => {
      if (t.gold && t.gold[i].surface !== w.surface) throw new Error(`${t.id}: word ${i} is ${w.surface}, gold says ${t.gold[i].surface}`);
      words.push({ surface: w.surface, ids: w.ids, known: w.known, sentence: t.id, ...(t.gold ? { gold: t.gold[i] } : {}) });
    });
    // "stays readable on the GoLearn card": every word still has its readings, with their confidences, after the marks
    const toks = arAdapter.tokenize(t.text);
    const raw = arAnalyze(toks);
    arAdapter.analyze(toks).forEach((a, i) => { if (a.token.isWord && raw[i].candidates.length) { rawReadings++; if (a.candidates.length === raw[i].candidates.length && a.candidates.every((c, k) => c.lemma === raw[i].candidates[k].lemma && c.confidence === raw[i].candidates[k].confidence)) keptReadings++; } });
    for (const a of arAdapter.analyze(toks)) if (a.token.isWord) ctxTop.set(arKey(a.token.surface), a.candidates[0]);
  }
  const ids = [...new Set(words.flatMap((w) => w.ids))];
  for (const id of ids) if (id.startsWith('lemma:ar:')) { const h = parseLemmaId(id).head; headTop.set(id, arAdapter.analyze(arAdapter.tokenize(h)).find((a) => a.token.isWord)?.candidates[0]); }
  const behind = (id: string): Behind[] => words.filter((w) => w.ids.includes(id)).map((w) => ({ sentence: w.sentence, surface: w.surface, ...(w.gold ? { gold: w.gold } : {}) }));

  // 2. the Repository's side
  const events = ids.flatMap((id, i) => [0, 1, 2].map((n) => event(`${i}`, id, n, new Date(Date.parse(NOW) - (3 - n) * 3_600_000).toISOString())));
  const knowledge = foldEvents(events, { modelVersion: 'projection@7' });
  const stored = new Map<string, ReturnType<typeof resolveSelection>>();
  for (const id of ids) if (id.startsWith('form:ar:')) stored.set(id, resolveSelection({ languageId: 'ar', surface: id.slice('form:ar:'.length), now: NOW }));
  const recUnit = (id: string) => { const r = stored.get(id); return r ? { unit: r.units.find((u) => u.unitId === r.formId) ?? r.units[0], relations: r.relations, analyses: [r.analysis] } : undefined; };
  const api = {
    async units(batch: string[]) {
      const units: Record<string, unknown> = {};
      const missing: string[] = [];
      for (const id of batch) { const r = recUnit(id); if (r) units[id] = r; else missing.push(id); }
      return { ok: true, status: 200, data: { units, missing } };
    },
    async unit(id: string) { const r = recUnit(id); return r ? { ok: true, status: 200, data: r } : { ok: false, status: 404, error: 'not-found', message: 'not found', body: {} }; },
    async listEnrolments() { return { ok: true, status: 200, data: { enrolments: [{ enrolmentId: ENROLMENT, learnerId: LEARNER, languageId: 'ar', varietyId: 'ar-standard', packId: 'pack:ar', packVersion: '1', goals: [{ kind: 'reading' }], startedAt: NOW }] } }; },
  } as unknown as RepositoryApi;

  // 3. GoReview's side: the product's own loader starts from the core and loads the shards the units need
  resetArabicIndexes((idx) => idx === 'ar-core');
  const prefs = { ...DEFAULT_PREFERENCES('ar'), varietyId: 'ar-standard', maxNew: 5000, dailyNewLimit: 5000, cardsPerDeck: 5000 };
  const served = makeFiles(opts.patchLex);
  const factsFor = packFactsFor({ fetch: served, baseUrl: 'http://assets.local/' });
  const engine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, now: () => NOW, random: () => 0, factsFor });
  const unresolved: VocabularyItem[] = knowledge.filter((k) => !stored.has(k.unitId)).map((k) => ({ knowledge: k, surfaceForms: [], sources: [] }));
  const recovered = await engine.recoverCandidates!({ api, enrolmentId: ENROLMENT, languageId: 'ar', varietyId: 'ar-standard', prefs, events, deck: [], knowledge, unresolvedVocabulary: unresolved, existingCandidates: [], now: NOW });
  const storedRows = knowledge.filter((k) => stored.has(k.unitId));
  const units = new Map(storedRows.map((k) => [k.unitId, recUnit(k.unitId)!.unit]));
  const analyses = new Map(storedRows.map((k) => [k.unitId, recUnit(k.unitId)!.analyses]));
  const storedCandidates: ReviewCandidate[] = rankCandidates({ rows: storedRows, units, analyses, realizedBy: new Map(), cards: new Map(), goals: [{ kind: 'reading' }] as never, now: NOW, limit: storedRows.length || 1, objectiveDimensions: ['readingRecognition'] });
  const candidates = [...recovered.candidates, ...storedCandidates];
  const intake = await engine.intake({ api, candidates, knowledge, deck: [], saved: new Set(), prefs, audio: { available: false, eligibleForEvidence: false, reason: 'no audio' }, now: NOW, events });
  const admitted = intake.filter((o) => o.proposed && (o.decision === 'test-now' || o.decision === 'test-later'));

  // 4. check EVERY admitted card against the index, the gold and the facts the card is built from
  const provider = factsFor('ar', api)!;
  const runtime = createPackRuntime(packFor('ar')!, { fetch: files, baseUrl: 'http://assets.local/' });
  const cards: Card[] = [];
  for (const o of admitted) {
    const kind = o.unitId.startsWith('lemma:ar:') ? 'lemma' : 'form';
    const { head, pos } = kind === 'lemma' ? parseLemmaId(o.unitId) : { head: o.unitId.slice('form:ar:'.length), pos: undefined };
    const facts = await provider.factsFor(o.unitId, 'ar');
    const glosses = facts?.glosses ?? [];
    const problems: string[] = [];
    const b = behind(o.unitId);
    if (kind === 'form') problems.push('a FORM card was admitted');
    else {
      const row = pos ? arLemmaRow(head, pos) : undefined;
      const closed = pos ? [...Object.values(AR_CLOSED)].some((l) => l.some((e) => arHeadForm(e.lemma, e.pos) === arHeadForm(head, pos) && e.gloss)) : false;
      if (!pos || (!row && !closed)) problems.push('headword is not an entry of the index or the closed table');
      else if (!(row?.[1] ?? '').trim() && !closed) problems.push('no English meaning in the index');
      if (!glosses.length || !glosses[0].trim()) problems.push('the card shows no meaning');
      if (/^(?:lemma|form):/u.test(head) || arKey(head).length < 2) problems.push('a fragment');
      if (['و', 'ف', 'ب', 'ل', 'ك', 'س', 'ال'].includes(arKey(head))) problems.push('a clitic or particle fragment');
      const golds = b.map((x) => x.gold).filter((g): g is GoldToken => !!g);
      for (const g of golds) {
        if (g.lemma && arKey(g.lemma) !== arKey(head)) problems.push(`gold lemma ${g.lemma} for ${g.surface}, card ${head}`);
        if (g.meaning && glosses[0] && !meaningFits(glosses[0], g.meaning) && !REVIEWED_EQUIVALENT_MEANINGS.some((e) => e.lemma === head && e.goldMeaning === g.meaning && e.shown === glosses[0])) problems.push(`leading meaning "${glosses[0]}" does not fit gold "${g.meaning}" (${g.surface})`);
      }
      if (glosses[0] && /(^|\s)\d+\.\s/u.test(glosses[0])) problems.push(`the first meaning is a numbered merge of several entries: "${glosses[0]}"`);
      if (glosses[0]) {
        const verb = pos === 'VERB' || pos === 'AUX';
        if (verb && !/^to /iu.test(glosses[0].replace(/^\d+\.\s*/u, ''))) problems.push(`a VERB card whose leading meaning "${glosses[0]}" does not begin "to "`);
        if (!verb && pos && /^to /iu.test(glosses[0].replace(/^\d+\.\s*/u, ''))) problems.push(`a ${pos} card whose leading meaning "${glosses[0]}" begins "to "`);
        try {
          const g = await runtime.gloss(head, pos);
          const shown = g?.senses.find((s) => s.gloss.trim().toLowerCase() === glosses[0].replace(/^\d+\.\s*/u, '').trim().toLowerCase());
          const labelled = (shown?.tags ?? []).some((t) => LABELLED.test(t));
          const clean = (g?.senses ?? []).some((s) => !(s.tags ?? []).some((t) => LABELLED.test(t)));
          if (labelled && clean) problems.push(`the leading sense "${glosses[0]}" is labelled ${(shown?.tags ?? []).join('/')} while another sense is not`);
        } catch { /* no dictionary record: nothing to read labels from */ }
      }
    }
    if (kind === 'lemma' && facts) {
      const cand0 = arAdapter.analyze(arAdapter.tokenize(head)).find((a) => a.token.isWord)?.candidates.find((c) => c.lemma === head && c.pos === pos);
      // the card leads with the reading's own gloss (a hand gloss of the closed table included)
      if (cand0?.gloss && glosses[0] !== cand0.gloss) problems.push(`the card leads with "${glosses[0]}", not with the reading's gloss "${cand0.gloss}"`);
      // no answer comes from a sibling entry of the same headword, and none is a truncated alternative
      const accepted = acceptedMeanings(facts);
      const sibling = String(cand0?.notes?.homonymMeanings ?? '').replace(/^[^:]*:\s*/u, '').split(/\s*[;|]\s*/u).map((x) => x.trim().toLowerCase()).filter(Boolean);
      for (const a of accepted) if (sibling.includes(a.toLowerCase())) problems.push(`an accepted answer "${a}" belongs to another entry of the headword`);
    }
    cards.push({ unitId: o.unitId, kind, head, ...(pos ? { pos } : {}), decision: o.decision, glosses, behind: b, problems, checked: b.some((x) => x.gold?.lemma || x.gold?.meaning) });
  }

  // 5. what was held back, by distinct word (an Arabic written key), and why
  const admittedIds = new Set(cards.map((c) => c.unitId));
  const byKey = new Map<string, { surface: string; ids: Set<string>; sample: typeof words[number] }>();
  for (const w of words) { const k = arKey(w.surface); const e = byKey.get(k) ?? { surface: w.surface, ids: new Set<string>(), sample: w }; w.ids.forEach((i) => e.ids.add(i)); byKey.set(k, e); }
  const held: HeldWord[] = [];
  const whyDropped = new Map<string, string>();
  for (const id of ids) if (id.startsWith('lemma:ar:') && !candidates.some((c) => c.unitId === id)) {
    const fx = await provider.factsFor(id, 'ar');
    const head = parseLemmaId(id).head;
    const rd = adapterReadOnGoReviewSide(head);
    whyDropped.set(id, fx ? `facts ${fx.status}; reading there: ${rd}` : `no facts; reading there: ${rd}`);
  }
  for (const [key, e] of byKey) {
    const idList = [...e.ids];
    if (idList.some((i) => admittedIds.has(i))) continue;
    // the reading the card for this word would rest on: the lemma head alone when a lemma id exists, else the word in its text
    const lemmaId = idList.find((i) => i.startsWith('lemma:ar:'));
    const top = lemmaId ? headTop.get(lemmaId) : ctxTop.get(key);
    const out = lemmaId ? intake.find((o) => o.unitId === lemmaId) : undefined;
    const asked = !!lemmaId && candidates.some((c) => c.unitId === lemmaId);
    const marked = top?.notes?.deckLimit;
    const limit = marked ? String(marked) : out ? `intake:${out.decision}` : lemmaId ? (asked ? 'not-recovered' : 'recovery-dropped') : top ? 'form-only' : 'no-reading';
    const reason = !marked && lemmaId && whyDropped.has(lemmaId) ? whyDropped.get(lemmaId)! : marked ? String(top?.notes?.reviewReason) : out ? `${out.decision}: ${out.reasons[0] ?? ''}` : lemmaId ? 'no candidate was recovered for it' : top ? 'a bare form is not drilled' : 'no reading';
    held.push({ key, surface: e.surface, unitIds: idList, reason, limit });
  }
  const heldByReason: Record<string, number> = {};
  for (const h of held) heldByReason[h.limit] = (heldByReason[h.limit] ?? 0) + 1;
  const bad = cards.filter((c) => c.problems.length);
  const fragment = (c: Card): boolean => c.problems.some((p) => /not an entry|fragment|no English meaning|shows no meaning|FORM card/u.test(p));
  return {
    words: words.length, distinctWords: byKey.size, cards, held, formCards: cards.filter((c) => c.kind === 'form').length,
    candidatesStillThere: keptReadings, readingsKept: rawReadings,
    figures: {
      admitted: cards.length, false: bad.filter((c) => !fragment(c)).length, unknownOrFragment: bad.filter(fragment).length, formCards: cards.filter((c) => c.kind === 'form').length,
      held: held.length, heldShare: byKey.size ? held.length / byKey.size : 0, heldByReason, unchecked: cards.filter((c) => !c.checked).length,
    },
  };
}
