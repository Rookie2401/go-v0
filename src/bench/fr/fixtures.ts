/**
 * French fixtures: the shared loader and evaluator (test/adapters/french-fixtures.test.ts and scripts/fr-fixtures-check.mts).
 *
 * The fixtures (data/benchmarks/fr/fixtures/*.json) were written from French grammar and checked against the kaikki.org
 * French extract, WITHOUT reading the adapter. Every judgement is an AI's; nothing is native-reviewed (see the README there).
 * Pure functions: the adapter is passed in; only `loadFixtures` touches the disk.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LanguageAdapter, RawToken } from '../../core/adapters';
import type { PartOfSpeech } from '../../core/model';

export interface FixtureExpect {
  lemma?: string;
  pos?: PartOfSpeech;
  features?: Record<string, string>;
  /** A construction id of docs/french/PLAN.md "CONTEXT"; a `detectPatterns` key covering the target token. */
  construction?: string;
  /** A phrase display string; a `detectPhrases` display covering the target token. */
  phrase?: string;
  /** Lemmas of the halves of a contraction or of a verb with its clitics, in order. */
  parts?: string[];
  /** Orthography cases: the exact word-token surfaces the sentence is cut into. */
  tokens?: string[];
  /** A trap: the FIRST reading must not have this lemma. */
  notLemma?: string;
}

export interface FixtureCase {
  id: string;
  sentence: string;
  target: string;
  occurrence?: number;
  expect: FixtureExpect;
  alsoAcceptPos?: PartOfSpeech[];
  source: 'grammar' | 'kaikki' | 'ud';
  level: 'core' | 'advanced';
  why: string;
}

export interface FixtureFile { category: string; note: string; cases: FixtureCase[] }

export const CATEGORIES = ['orthography', 'nominal', 'verbal', 'compound-tenses', 'pronouns', 'negation', 'relatives', 'literary', 'ambiguity'] as const;
export const MINIMUMS: Record<string, number> = {
  orthography: 40, nominal: 50, verbal: 90, 'compound-tenses': 40, pronouns: 45, negation: 25, relatives: 25, literary: 40, ambiguity: 30,
};

/** The conventional feature keys and values (src/adapters/french/types.ts). */
export const FEATURE_VALUES: Record<string, readonly string[]> = {
  VerbForm: ['Fin', 'Inf', 'Part'],
  Mood: ['Ind', 'Sub', 'Cnd', 'Imp'],
  Tense: ['Pres', 'Imp', 'Past', 'Fut'],
  Person: ['1', '2', '3'],
  Number: ['Sing', 'Plur'],
  Gender: ['Masc', 'Fem'],
  Definite: ['Def', 'Ind'],
  PronType: ['Art', 'Prs', 'Dem', 'Rel', 'Int', 'Ind', 'Neg', 'Part'],
  Poss: ['Yes'],
  Reflex: ['Yes'],
  Polarity: ['Neg'],
  Case: ['Nom', 'Acc', 'Dat'],
  NumType: ['Card', 'Ord'],
};

export const POS_VALUES: readonly string[] = ['NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CONJ', 'SCONJ', 'PART', 'NUM', 'INTJ', 'CLF', 'PUNCT', 'X'];

export function loadFixtures(dir: string): FixtureFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as FixtureFile);
}

export interface FixtureGot {
  /** The word tokens of the sentence (surfaces). */
  tokens: string[];
  targetIndex?: number;
  firstReading?: { lemma?: string; pos?: string; morph: Record<string, string> };
  judgedReading?: { lemma?: string; pos?: string; morph: Record<string, string>; rank: number };
  readings: string[];
  constructions: string[];
  phrases: string[];
  parts?: string[];
}

export interface FixtureResult { id: string; category?: string; level?: string; ok: boolean; failed: string[]; got: FixtureGot }

const fmt = (c: { lemma?: string; pos?: string; morph: Record<string, string> }): string =>
  `${c.lemma ?? '?'}/${c.pos ?? '?'} ${Object.entries(c.morph).map(([k, v]) => `${k}=${v}`).join('|')}`;

export function evaluateFixture(adapter: LanguageAdapter, c: FixtureCase): FixtureResult {
  const failed: string[] = [];
  const got: FixtureGot = { tokens: [], readings: [], constructions: [], phrases: [] };
  const raw: RawToken[] = adapter.tokenize(c.sentence);
  const words = raw.filter((t) => t.isWord);
  got.tokens = words.map((t) => t.surface);
  const e = c.expect;

  if (e.tokens && JSON.stringify(e.tokens) !== JSON.stringify(got.tokens)) failed.push('tokens');

  const wantKey = adapter.normalize(c.target);
  const occurrence = c.occurrence ?? 1;
  let seen = 0;
  let idx = -1;
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i]!;
    if (!t.isWord) continue;
    if (adapter.normalize(t.surface) === wantKey) {
      seen++;
      if (seen === occurrence) { idx = i; break; }
    }
  }
  const needsToken = e.lemma !== undefined || e.pos !== undefined || e.features || e.construction || e.phrase || e.parts || e.notLemma;
  if (idx < 0) {
    if (needsToken) failed.push('target');
    return { id: c.id, ok: failed.length === 0, failed, got };
  }
  got.targetIndex = idx;

  const needsAnalysis = needsToken;
  if (!needsAnalysis) return { id: c.id, ok: failed.length === 0, failed, got };

  const analyzed = adapter.analyze(raw);
  const cands = analyzed[idx]?.candidates ?? [];
  got.readings = cands.map(fmt);
  if (cands[0]) got.firstReading = { lemma: cands[0].lemma, pos: cands[0].pos, morph: cands[0].morph };

  const accepted = new Set<string>([...(e.pos ? [e.pos] : []), ...(c.alsoAcceptPos ?? [])]);
  const wantLemma = e.lemma === undefined ? undefined : adapter.normalize(e.lemma);
  const lemmaOf = (l?: string) => (l === undefined ? undefined : adapter.normalize(l));

  let rank = -1;
  if (wantLemma !== undefined) {
    const withLemma = cands.map((x, i) => ({ x, i })).filter(({ x }) => lemmaOf(x.lemma) === wantLemma);
    if (!withLemma.length) failed.push('lemma');
    else {
      const ok = accepted.size ? withLemma.find(({ x }) => x.pos && accepted.has(x.pos)) : withLemma[0];
      if (!ok) { failed.push('pos'); rank = withLemma[0]!.i; }
      else rank = ok.i;
    }
  } else if (accepted.size) {
    const hit = cands.findIndex((x) => x.pos && accepted.has(x.pos));
    if (hit < 0) failed.push('pos'); else rank = hit;
  } else rank = cands.length ? 0 : -1;

  const judged = rank >= 0 ? cands[rank] : undefined;
  if (judged) got.judgedReading = { lemma: judged.lemma, pos: judged.pos, morph: judged.morph, rank };

  if ((wantLemma !== undefined || accepted.size) && !failed.includes('lemma') && !failed.includes('pos') && rank > 0) failed.push('first');

  if (e.features) {
    for (const [k, v] of Object.entries(e.features)) {
      const have = (judged?.morph[k] ?? '').split(',').filter(Boolean);
      const wants = v.split(',');
      if (!judged || !wants.every((w) => have.includes(w))) failed.push(`feature:${k}`);
    }
  }
  if (e.parts) {
    const have = (judged?.parts ?? []).map((p) => p.lemma ?? p.text);
    if (JSON.stringify(have.map((s) => adapter.normalize(s))) !== JSON.stringify(e.parts.map((s) => adapter.normalize(s)))) failed.push('parts');
    got.parts = have;
  }
  if (e.notLemma !== undefined && cands[0] && lemmaOf(cands[0].lemma) === adapter.normalize(e.notLemma)) failed.push('notLemma');

  if (e.construction) {
    const pats = adapter.detectPatterns(raw, analyzed);
    got.constructions = pats.filter((p) => p.tokenIndexes.includes(idx)).map((p) => p.key);
    if (!got.constructions.includes(e.construction)) failed.push('construction');
  }
  if (e.phrase) {
    const phr = adapter.detectPhrases(raw, analyzed);
    got.phrases = phr.filter((p) => p.tokenIndexes.includes(idx)).map((p) => p.display);
    if (!got.phrases.some((d) => adapter.normalize(d) === adapter.normalize(e.phrase!))) failed.push('phrase');
  }
  return { id: c.id, ok: failed.length === 0, failed, got };
}

export interface Summary { total: number; ok: number; byCategory: Record<string, { total: number; ok: number; core: { total: number; ok: number }; advanced: { total: number; ok: number } }> }

/** Per category and level. `results` carry category/level; `evaluateAll` fills them. */
export function summarise(results: FixtureResult[]): Summary {
  const s: Summary = { total: 0, ok: 0, byCategory: {} };
  for (const r of results) {
    const cat = r.category ?? '?';
    const b = (s.byCategory[cat] ??= { total: 0, ok: 0, core: { total: 0, ok: 0 }, advanced: { total: 0, ok: 0 } });
    const lv = r.level === 'advanced' ? b.advanced : b.core;
    s.total++; b.total++; lv.total++;
    if (r.ok) { s.ok++; b.ok++; lv.ok++; }
  }
  return s;
}

export function evaluateAll(adapter: LanguageAdapter, files: FixtureFile[]): FixtureResult[] {
  const out: FixtureResult[] = [];
  for (const f of files) for (const c of f.cases) {
    let r: FixtureResult;
    try { r = evaluateFixture(adapter, c); } catch (err) { r = { id: c.id, ok: false, failed: ['exception'], got: { tokens: [], readings: [String(err)], constructions: [], phrases: [] } }; }
    out.push({ ...r, category: f.category, level: c.level });
  }
  return out;
}

export function formatSummary(s: Summary): string {
  const lines = [`French fixtures: ${s.ok}/${s.total} pass`];
  for (const [cat, b] of Object.entries(s.byCategory)) {
    lines.push(`  ${cat.padEnd(16)} ${String(b.ok).padStart(3)}/${String(b.total).padEnd(3)}  core ${b.core.ok}/${b.core.total}  advanced ${b.advanced.ok}/${b.advanced.total}`);
  }
  return lines.join('\n');
}
