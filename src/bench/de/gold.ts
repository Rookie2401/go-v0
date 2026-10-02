/**
 * The German gold sets: one evaluator for the test (test/integration/german-gold.test.ts) and the report
 * (scripts/de-gold.mts), so that a score quoted in a document is the score the test saw.
 *
 * A sentence is CORRECT when every expectation on it holds. Each expectation that does not hold is a failure with a
 * stable KEY ("Der: Case=Nom", "+passive", "-modal-particle") and a detail in words. A sentence the adapter is known
 * not to get right is listed in data/benchmarks/de/known-limits.json with its reason AND the exact keys expected to
 * fail; `compareWithLimit` then says what appeared (a regression inside a sentence that was already failing) and what
 * was resolved. Correctness scores count correct sentences only: a known limit is never counted as correct.
 */
import type { AnalysisCandidate, LanguageAdapter, PartOfSpeech } from '../../core';

export interface GoldPart { text?: string; lemma?: string; kind?: string }
export interface GoldToken {
  form: string; nth?: number; lemma?: string | string[]; pos?: PartOfSpeech | PartOfSpeech[];
  /** Features that must be exactly this value. */
  morph?: Record<string, string>;
  /** Features whose value set must include this value. */
  includes?: Record<string, string>;
  /** Features that must stay open between at least these values. */
  ambiguous?: Record<string, string[]>;
  unitWith?: string[]; notUnit?: boolean; parts?: GoldPart[]; noPartKind?: string;
  orthography?: { modern: string; period: string }; noOrthography?: boolean; hasRole?: boolean;
  /** The first reading must (true) or must not (false) be marked unconfirmed. */
  unconfirmed?: boolean;
  /** The first reading must carry no gloss (a guess never invents a meaning). */
  noGloss?: boolean;
}
export interface GoldSentence {
  id: string; category: string; text: string; note?: string; disputed?: string; segments?: number;
  tokens?: GoldToken[]; constructions?: string[]; notConstructions?: string[];
}
export interface GoldFile { schema: number; language: string; note?: string; provenance?: string; corrections?: string[]; sentences: GoldSentence[] }

export interface GoldFailure { key: string; detail: string }

/** A known limit: why, and exactly which expectations fail. */
export interface KnownLimit { reason: string; expected: string[] }
export type KnownLimits = Record<string, KnownLimit>;

const values = (v: string | undefined) => (v ?? '').split(',').filter(Boolean);
const list = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);

/** Every expectation of one gold sentence that does not hold. Empty = the sentence is correct. */
export function failuresOf(de: LanguageAdapter, s: GoldSentence): GoldFailure[] {
  const out: GoldFailure[] = [];
  const same = (a: string | undefined, b: string) => a !== undefined && de.normalize(a) === de.normalize(b);
  if (s.segments !== undefined) {
    const n = de.segmentSentences(s.text).length;
    if (n !== s.segments) out.push({ key: 'segments', detail: `sentences: expected ${s.segments}, got ${n}` });
  }
  if (!s.tokens && !s.constructions && !s.notConstructions) return out;
  const tokens = de.tokenize(s.text);
  const analyses = de.analyze(tokens);
  for (const g of s.tokens ?? []) {
    const name = g.nth ? `${g.form}[${g.nth}]` : g.form;
    const hits = tokens.map((t, i) => (t.surface === g.form ? i : -1)).filter((i) => i >= 0);
    const i = hits[g.nth ?? 0];
    if (i === undefined) { out.push({ key: `${name}: token`, detail: `${name}: no such token` }); continue; }
    const c: AnalysisCandidate | undefined = analyses[i].candidates[0];
    if (!c) { out.push({ key: `${name}: reading`, detail: `${name}: no reading` }); continue; }
    const say = (key: string, what: string) => out.push({ key: `${name}: ${key}`, detail: `${name}: ${what} (got ${c.lemma ?? '—'}/${c.pos ?? '—'} ${JSON.stringify(c.morph)})` });
    if (g.lemma !== undefined && !list(g.lemma).some((l) => same(c.lemma, l))) say('lemma', `lemma should be ${list(g.lemma).join(' or ')}`);
    if (g.pos !== undefined && !list(g.pos).includes(c.pos as PartOfSpeech)) say('pos', `part of speech should be ${list(g.pos).join(' or ')}`);
    for (const [k, v] of Object.entries(g.morph ?? {})) if (c.morph[k] !== v) say(`${k}=${v}`, `${k} should be exactly ${v}`);
    for (const [k, v] of Object.entries(g.includes ?? {})) if (!values(c.morph[k]).includes(v)) say(`${k} includes ${v}`, `${k} should include ${v}`);
    for (const [k, vs] of Object.entries(g.ambiguous ?? {})) if (!vs.every((v) => values(c.morph[k]).includes(v))) say(`${k} open`, `${k} should stay open between ${vs.join(' and ')}`);
    if (g.unitWith) {
      const pieces = (c.unit?.pieces ?? []).map((p) => tokens[p]?.surface);
      if (!c.unit) say('unit', `should be a piece of a unit with ${g.unitWith.join(', ')}`);
      else if (![g.form, ...g.unitWith].every((f) => pieces.includes(f))) say('unit', `unit should join ${[g.form, ...g.unitWith].join(' + ')}, joins ${pieces.join(' + ')}`);
    }
    if (g.notUnit && c.unit) say('not a unit', `should not be a piece of a unit (${c.unit.display})`);
    if (g.parts) {
      let at = 0;
      for (const want of g.parts) {
        const found = (c.parts ?? []).findIndex((p, k) => k >= at
          && (want.text === undefined || same(p.text, want.text)) && (want.lemma === undefined || same(p.lemma, want.lemma)) && (want.kind === undefined || p.kind === want.kind));
        if (found < 0) { say('parts', `parts should contain ${JSON.stringify(want)} in order, has ${JSON.stringify((c.parts ?? []).map((p) => ({ text: p.text, lemma: p.lemma, kind: p.kind })))}`); break; }
        at = found + 1;
      }
    }
    if (g.noPartKind && (c.parts ?? []).some((p) => p.kind === g.noPartKind)) say(`no part ${g.noPartKind}`, `should have no part of kind ${g.noPartKind}`);
    if (g.orthography) {
      if (!c.orthography) say('orthography', `should be related to today's spelling ${g.orthography.modern}`);
      else if (!same(c.orthography.modern, g.orthography.modern) || c.orthography.period !== g.orthography.period) say('orthography', `older spelling should be ${g.orthography.modern} (${g.orthography.period}), is ${c.orthography.modern} (${c.orthography.period})`);
    }
    if (g.noOrthography && c.orthography) say('no orthography', `is today's spelling and should have no spelling relation (has ${c.orthography.modern})`);
    if (g.hasRole && !(c.role && c.role.trim())) say('role', 'should say what the word does (role)');
    if (g.unconfirmed !== undefined && Boolean(c.unconfirmed) !== g.unconfirmed) say(g.unconfirmed ? 'unconfirmed' : 'confirmed', g.unconfirmed ? 'should be marked unconfirmed' : 'should be a confirmed reading');
    if (g.noGloss && c.gloss) say('no gloss', `a guess must not carry a meaning (has "${c.gloss}")`);
  }
  if (s.constructions || s.notConstructions) {
    const keys = new Set(de.detectPatterns(tokens, analyses).map((p) => p.key));
    for (const k of s.constructions ?? []) if (!keys.has(k)) out.push({ key: `+${k}`, detail: `construction ${k} not recognised (found: ${[...keys].join(', ') || 'none'})` });
    for (const k of s.notConstructions ?? []) if (keys.has(k)) out.push({ key: `-${k}`, detail: `construction ${k} should not be recognised` });
  }
  return out;
}

/** How many separate facts a gold sentence states (each can hold or fail on its own). */
export function expectationCount(s: GoldSentence): number {
  let n = s.segments !== undefined ? 1 : 0;
  for (const g of s.tokens ?? []) {
    n += (g.lemma !== undefined ? 1 : 0) + (g.pos !== undefined ? 1 : 0)
      + Object.keys(g.morph ?? {}).length + Object.keys(g.includes ?? {}).length + Object.keys(g.ambiguous ?? {}).length
      + (g.unitWith ? 1 : 0) + (g.notUnit ? 1 : 0) + (g.parts ? 1 : 0) + (g.noPartKind ? 1 : 0)
      + (g.orthography ? 1 : 0) + (g.noOrthography ? 1 : 0) + (g.hasRole ? 1 : 0) + (g.unconfirmed !== undefined ? 1 : 0) + (g.noGloss ? 1 : 0);
  }
  return n + (s.constructions?.length ?? 0) + (s.notConstructions?.length ?? 0);
}

export interface LimitComparison {
  /** Failures the limit records and that still occur. */
  still: string[];
  /** Failures that occur and the limit does not record: a regression inside a sentence that was already failing. */
  appeared: string[];
  /** Failures the limit records and that no longer occur. */
  resolved: string[];
}
export function compareWithLimit(actual: readonly GoldFailure[], limit: KnownLimit): LimitComparison {
  const now = new Set(actual.map((f) => f.key));
  const expected = new Set(limit.expected);
  return {
    still: [...expected].filter((k) => now.has(k)),
    appeared: [...now].filter((k) => !expected.has(k)),
    resolved: [...expected].filter((k) => !now.has(k)),
  };
}

export type SentenceStanding = 'correct' | 'known-limit' | 'known-limit-changed' | 'known-limit-resolved' | 'regression';
export interface SentenceResult { sentence: GoldSentence; failures: GoldFailure[]; standing: SentenceStanding; comparison?: LimitComparison }
export interface RoundResult {
  name: string; total: number;
  /** Sentences on which every expectation holds. This, and nothing else, is the correctness score. */
  correct: number;
  /** Failing sentences recorded as known limits (whether or not their signature still matches). */
  knownLimits: number;
  /** Failing sentences that are not recorded at all. */
  regressions: number;
  byCategory: Array<{ category: string; total: number; correct: number }>;
  /** Stated facts in the round, and how many of them hold (a missing token or reading is counted as one failed fact). */
  expectations: number;
  expectationsHeld: number;
  results: SentenceResult[];
}

export function evaluateRound(de: LanguageAdapter, name: string, sentences: readonly GoldSentence[], limits: KnownLimits): RoundResult {
  const results: SentenceResult[] = sentences.map((sentence) => {
    const failures = failuresOf(de, sentence);
    const limit = limits[sentence.id];
    if (!limit) return { sentence, failures, standing: failures.length ? 'regression' : 'correct' };
    const comparison = compareWithLimit(failures, limit);
    const standing: SentenceStanding = failures.length === 0 ? 'known-limit-resolved'
      : comparison.appeared.length || comparison.resolved.length ? 'known-limit-changed' : 'known-limit';
    return { sentence, failures, standing, comparison };
  });
  const by = new Map<string, { total: number; correct: number }>();
  for (const r of results) {
    const row = by.get(r.sentence.category) ?? { total: 0, correct: 0 };
    row.total += 1; if (r.failures.length === 0) row.correct += 1;
    by.set(r.sentence.category, row);
  }
  return {
    name, total: results.length,
    correct: results.filter((r) => r.failures.length === 0).length,
    knownLimits: results.filter((r) => r.failures.length > 0 && limits[r.sentence.id]).length,
    regressions: results.filter((r) => r.standing === 'regression').length,
    byCategory: [...by.entries()].map(([category, v]) => ({ category, ...v })),
    expectations: sentences.reduce((n, x) => n + expectationCount(x), 0),
    expectationsHeld: results.reduce((n, r) => n + Math.max(0, expectationCount(r.sentence) - r.failures.length), 0),
    results,
  };
}

/** The line a status document quotes: correctness first, then what the failing sentences are. */
export function roundLine(r: RoundResult): string {
  const pct = r.total ? ((100 * r.correct) / r.total).toFixed(1) : '0.0';
  const facts = r.expectations ? ((100 * r.expectationsHeld) / r.expectations).toFixed(1) : '0.0';
  return `${r.name}: ${r.correct} of ${r.total} sentences correct (${pct} %); ${r.expectationsHeld} of ${r.expectations} stated facts hold (${facts} %); ${r.knownLimits} recorded as known limits, ${r.regressions} unrecorded failures. `
    + r.byCategory.map((c) => `${c.category} ${c.correct}/${c.total}`).join('; ');
}
