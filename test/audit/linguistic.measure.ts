/**
 * Measurement harness of the linguistic accuracy audit (helper, not a test file). It runs the Albanian adapter and the
 * layers on top of it over `fixtures/albanian-unseen.json` and returns plain numbers plus every disagreement.
 *
 * The expectations in the fixture are the audit author's, a language MODEL's: they are not a native speaker's judgement
 * and nothing here makes them gold. "Accuracy" below means "agreement with this model's reading of the sentence".
 */
import fs from 'node:fs';
import path from 'node:path';
import { sqAdapter } from '../../src/adapters/sq';
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../src/core';

export interface GoldWord {
  form: string; lemma: string[]; pos: string[]; feats: Record<string, string>; conf: 'c' | 'u'; amb?: boolean;
}
export interface GoldSentence {
  id: string; category: string; text: string; tokens: string[]; words: GoldWord[];
  phrases: Array<{ text: string; conf: 'c' | 'u' }>; patterns: string[]; sentences: number; note?: string;
}
export interface GoldError { id: string; category: string; text: string; fix: string; fixOk: string[]; detectable: boolean }
export interface Fixture {
  about: string; sentences: GoldSentence[];
  gheg: Array<{ id: string; text: string; note: string; expectLemmas: Record<string, string>; conf: 'u' }>;
  production: { errors: GoldError[]; correct: string[] };
}

export const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/albanian-unseen.json');
export const loadFixture = (): Fixture => JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as Fixture;

export const nfc = (s: string): string => s.normalize('NFC').toLocaleLowerCase('sq');
export const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((1000 * n) / d) / 10);

// ───────────────────────────── word-level comparison ─────────────────────────────

export type FeatVerdict = 'exact' | 'union' | 'missing' | 'wrong';
export function featVerdict(want: string, got: string | undefined): FeatVerdict {
  if (got === undefined || got === '') return 'missing';
  if (got === want) return 'exact';
  const parts = got.split(',').map((x) => x.trim());
  return parts.length > 1 && parts.includes(want) ? 'union' : 'wrong';
}

export interface ReadingVerdict { lemma: boolean; pos: boolean; feats: Record<string, FeatVerdict>; featsExact: boolean; featsLenient: boolean }
export function judgeReading(g: GoldWord, c: AnalysisCandidate | undefined): ReadingVerdict {
  const lemma = !!c?.lemma && g.lemma.map(nfc).includes(nfc(c.lemma));
  const pos = !!c?.pos && g.pos.includes(c.pos);
  const feats: Record<string, FeatVerdict> = {};
  for (const [k, v] of Object.entries(g.feats)) feats[k] = featVerdict(v, c?.morph?.[k]);
  const vs = Object.values(feats);
  return { lemma, pos, feats, featsExact: vs.every((x) => x === 'exact'), featsLenient: vs.every((x) => x === 'exact' || x === 'union') };
}
const readingOk = (v: ReadingVerdict): boolean => v.lemma && v.pos && v.featsLenient;
/** A reading counts as the gold one only when lemma, POS and every asserted feature agree, a union containing the value counting. */
export const matchesGold = (g: GoldWord, c: AnalysisCandidate | undefined): boolean => readingOk(judgeReading(g, c));

// ───────────────────────────── pronunciation (independent letter scan) ─────────────────────────────

/** Letters an English reader does not sound as written, found by a greedy digraph scan written for this audit. */
const DIGRAPHS = ['dh', 'gj', 'll', 'nj', 'rr', 'sh', 'th', 'xh', 'zh'];
const NOT_AS_ENGLISH = new Set(['ë', 'ç', 'c', 'dh', 'gj', 'j', 'll', 'nj', 'q', 'rr', 'sh', 'th', 'x', 'xh', 'y', 'zh']);
export function expectedPronunciationLetters(word: string): string[] {
  const w = nfc(word);
  const out = new Set<string>();
  for (let i = 0; i < w.length;) {
    const two = w.slice(i, i + 2);
    if (DIGRAPHS.includes(two)) { if (NOT_AS_ENGLISH.has(two)) out.add(two); i += 2; continue; }
    const one = w[i];
    if (NOT_AS_ENGLISH.has(one)) out.add(one);
    i += 1;
  }
  return [...out].sort();
}

// ───────────────────────────── the adapter run ─────────────────────────────

export interface WordResult {
  sentence: string; index: number; gold: GoldWord; surface: string; tokenIndex: number;
  top?: AnalysisCandidate; candidates: AnalysisCandidate[]; verdict: ReadingVerdict;
  covered: boolean; // the word list vouches for the word (a reading with a lemma that is not a guess by ending)
  anyCandidateMatches: boolean;
  isolatedTop?: AnalysisCandidate; isolatedDistinct: number; isolatedMatches: boolean;
}
export interface SentenceResult {
  gold: GoldSentence; tokens: RawToken[]; analyses: AnalyzedToken[]; tokensExact: boolean; gotTokens: string[];
  sentencesGot: number; words: WordResult[];
  phrases: Array<{ gold: string; expected: number[]; exact: boolean; partial: boolean; got: string[] }>;
  extraPhrases: Array<{ display: string; text: string; kind: string }>;
  patternsGot: string[]; patternsMissing: string[]; patternsExtra: string[];
  pronunciation: Array<{ word: string; expected: string[]; got: string[]; ok: boolean }>;
}

const readingKey = (c: AnalysisCandidate): string => `${c.lemma}|${c.pos}|${JSON.stringify(c.morph)}`;

export function runAdapter(fx: Fixture = loadFixture()): SentenceResult[] {
  return fx.sentences.map((g) => {
    const tokens = sqAdapter.tokenize(g.text);
    const analyses = sqAdapter.analyze(tokens);
    const gotTokens = tokens.map((t) => t.surface);
    const wordIdx = tokens.map((t, i) => (t.isWord ? i : -1)).filter((i) => i >= 0);
    const words: WordResult[] = g.words.map((gw, k) => {
      const ti = wordIdx[k];
      const a = ti === undefined ? undefined : analyses[ti];
      const cands = a?.candidates ?? [];
      const top = cands[0];
      const iso = ti === undefined ? [] : sqAdapter.analyze(sqAdapter.tokenize(tokens[ti].surface))[0]?.candidates ?? [];
      return {
        sentence: g.id, index: k, gold: gw, surface: tokens[ti]?.surface ?? '', tokenIndex: ti,
        top, candidates: cands, verdict: judgeReading(gw, top),
        covered: cands.some((c) => !!c.lemma && !c.unconfirmed),
        anyCandidateMatches: cands.some((c) => matchesGold(gw, c)),
        isolatedTop: iso[0], isolatedDistinct: new Set(iso.map(readingKey)).size, isolatedMatches: matchesGold(gw, iso[0]),
      };
    });
    // phrases
    const phr = sqAdapter.detectPhrases(tokens, analyses);
    const wordTokenNorm = wordIdx.map((i) => nfc(tokens[i].surface));
    const used = new Set<number>();
    const phrases = g.phrases.map((p) => {
      const seq = p.text.split(/\s+/u).map(nfc);
      let start = -1;
      for (let i = 0; i + seq.length <= wordTokenNorm.length; i++) if (seq.every((s, j) => wordTokenNorm[i + j] === s)) { start = i; break; }
      const expected = start < 0 ? [] : seq.map((_, j) => wordIdx[start + j]);
      const hit = phr.map((x, xi) => ({ x, xi })).filter(({ x }) => x.tokenIndexes.some((t) => expected.includes(t)));
      const exact = hit.some(({ x }) => x.tokenIndexes.length === expected.length && x.tokenIndexes.every((t) => expected.includes(t)));
      hit.forEach(({ xi }) => used.add(xi));
      return { gold: p.text, expected, exact, partial: !exact && hit.length > 0, got: hit.map(({ x }) => x.display) };
    });
    const extraPhrases = phr.map((x, xi) => ({ x, xi })).filter(({ xi }) => !used.has(xi))
      .map(({ x }) => ({ display: x.display, text: x.tokenIndexes.map((t) => tokens[t].surface).join(' '), kind: x.kind }));
    // patterns
    const pats = sqAdapter.detectPatterns(tokens, analyses);
    const patternsGot = [...new Set(pats.map((p) => p.key))];
    // pronunciation
    const pronunciation = wordIdx.map((ti) => {
      const notes = sqAdapter.pronunciation(tokens[ti], analyses[ti]).notes ?? [];
      const got = notes.map((n) => n.split(':')[0].trim()).sort();
      const expected = expectedPronunciationLetters(tokens[ti].surface);
      return { word: tokens[ti].surface, expected, got, ok: JSON.stringify(got) === JSON.stringify(expected) };
    });
    return {
      gold: g, tokens, analyses, gotTokens, tokensExact: JSON.stringify(gotTokens) === JSON.stringify(g.tokens),
      sentencesGot: sqAdapter.segmentSentences(g.text).length, words, phrases, extraPhrases,
      patternsGot, patternsMissing: g.patterns.filter((p) => !patternsGot.includes(p)), patternsExtra: patternsGot.filter((p) => !g.patterns.includes(p)),
      pronunciation,
    };
  });
}

// ───────────────────────────── aggregation ─────────────────────────────

export interface Rate { n: number; d: number; pct: number }
const rate = (n: number, d: number): Rate => ({ n, d, pct: pct(n, d) });

export function summarize(res: SentenceResult[]) {
  const words = res.flatMap((r) => r.words);
  const content = words.filter((w) => w.gold.pos.some((p) => ['NOUN', 'VERB', 'ADJ', 'PROPN'].includes(p)));
  const confident = words.filter((w) => w.gold.conf === 'c');
  const featKeys = new Map<string, Record<FeatVerdict, number>>();
  for (const w of words) for (const [k, v] of Object.entries(w.verdict.feats)) {
    const row = featKeys.get(k) ?? { exact: 0, union: 0, missing: 0, wrong: 0 };
    row[v] += 1;
    featKeys.set(k, row);
  }
  const withFeats = words.filter((w) => Object.keys(w.gold.feats).length > 0);
  const known = words.filter((w) => w.covered);
  const amb = words.filter((w) => w.gold.amb);
  const ambReal = amb.filter((w) => w.isolatedDistinct > 1);
  const flips = ambReal.filter((w) => w.isolatedTop && w.top && readingKey(w.isolatedTop) !== readingKey(w.top));
  const perFeature: Record<string, Record<FeatVerdict, number>> = {};
  for (const [k, v] of [...featKeys].sort(([a], [b]) => a.localeCompare(b))) perFeature[k] = v;
  const phraseGold = res.flatMap((r) => r.phrases.map((p, i) => ({ ...p, conf: r.gold.phrases[i].conf })));
  const phraseCore = phraseGold.filter((p) => p.conf === 'c');
  const expectedPatterns = res.reduce((a, r) => a + r.gold.patterns.length, 0);
  const foundPatterns = res.reduce((a, r) => a + r.gold.patterns.filter((p) => r.patternsGot.includes(p)).length, 0);
  const pron = res.flatMap((r) => r.pronunciation);
  return {
    sentences: res.length, words: words.length, confidentWords: confident.length,
    tokenization: rate(res.filter((r) => r.tokensExact).length, res.length),
    tokenCount: rate(res.reduce((a, r) => a + r.gold.tokens.filter((t, i) => r.gotTokens[i] === t).length, 0), res.reduce((a, r) => a + r.gold.tokens.length, 0)),
    sentenceSegmentation: rate(res.filter((r) => r.sentencesGot === r.gold.sentences).length, res.length),
    coverage: rate(known.length, words.length),
    lemma: rate(words.filter((w) => w.verdict.lemma).length, words.length),
    lemmaConfident: rate(confident.filter((w) => w.verdict.lemma).length, confident.length),
    lemmaKnown: rate(known.filter((w) => w.verdict.lemma).length, known.length),
    lemmaContent: rate(content.filter((w) => w.verdict.lemma).length, content.length),
    pos: rate(words.filter((w) => w.verdict.pos).length, words.length),
    posConfident: rate(confident.filter((w) => w.verdict.pos).length, confident.length),
    posKnown: rate(known.filter((w) => w.verdict.pos).length, known.length),
    lemmaAndPos: rate(words.filter((w) => w.verdict.lemma && w.verdict.pos).length, words.length),
    morphExact: rate(withFeats.filter((w) => w.verdict.featsExact).length, withFeats.length),
    morphLenient: rate(withFeats.filter((w) => w.verdict.featsLenient).length, withFeats.length),
    morphExactAll: rate(withFeats.filter((w) => w.verdict.lemma && w.verdict.pos && w.verdict.featsExact).length, withFeats.length),
    morphExactConfident: rate(withFeats.filter((w) => w.gold.conf === 'c' && w.verdict.featsExact).length, withFeats.filter((w) => w.gold.conf === 'c').length),
    perFeature,
    goldReadingInList: rate(words.filter((w) => w.anyCandidateMatches).length, words.length),
    ambiguity: {
      flagged: amb.length, trulyAmbiguousInAdapter: ambReal.length,
      correctInContext: rate(amb.filter((w) => matchesGold(w.gold, w.top)).length, amb.length),
      correctInIsolation: rate(amb.filter((w) => w.isolatedMatches).length, amb.length),
      contextChangedTop: flips.length,
      contextFixed: flips.filter((w) => !w.isolatedMatches && matchesGold(w.gold, w.top)).length,
      contextBroke: flips.filter((w) => w.isolatedMatches && !matchesGold(w.gold, w.top)).length,
      goldNotAmongCandidates: amb.filter((w) => !w.anyCandidateMatches).length,
    },
    phrases: {
      expectedCore: phraseCore.length, foundExactCore: phraseCore.filter((p) => p.exact).length, foundPartialCore: phraseCore.filter((p) => p.partial).length,
      expectedAll: phraseGold.length, foundExactAll: phraseGold.filter((p) => p.exact).length,
      extra: res.reduce((a, r) => a + r.extraPhrases.length, 0),
    },
    patterns: { expected: expectedPatterns, found: foundPatterns, extra: res.reduce((a, r) => a + r.patternsExtra.length, 0), withRole: words.filter((w) => w.candidates.some((c) => !!c.role)).length },
    pronunciation: { words: pron.length, letterSetCorrect: pron.filter((p) => p.ok).length, wordsNeedingNotes: pron.filter((p) => p.expected.length > 0).length, wordsWithNotes: pron.filter((p) => p.got.length > 0).length },
  };
}
