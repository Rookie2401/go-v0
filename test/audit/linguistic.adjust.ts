/**
 * The ADJUSTED scoring of the audit (helper, not a test file). The fixture was frozen BEFORE the adapter ran on it. The
 * first run showed that some disagreements are differences of annotation scheme (or the audit author's own slips), not
 * mistakes of the adapter. They are neutralised here, one by one and in the open, and every figure is reported twice:
 * STRICT (the fixture as written, `linguistic.measure.ts`) and ADJUSTED (the rules below).
 */
import type { FeatVerdict, GoldSentence, GoldWord, ReadingVerdict, SentenceResult, WordResult } from './linguistic.measure';
import { featVerdict, judgeReading, nfc, pct } from './linguistic.measure';

export const ADJUSTMENTS = [
  { id: 'A1', what: 'The adapter tagset spells the coordinating conjunction CONJ, the fixture CCONJ (dhe, prandaj).' },
  { id: 'A2', what: 'All four linking articles (i, e, të, së) are cited under the lemma i; the fixture expected the form itself.' },
  { id: 'A3', what: 'The adapter often reads a linking article as the first piece of its adjective unit (lemma "i kuq", ADJ, unit.pieces); that counts as the article being read correctly.' },
  { id: 'A4', what: 'The adapter gives no Case to adjectives or articles (it gives Gender and Number); the fixture asserted Case there. Not scored; listed under "not offered".' },
  { id: 'A6', what: 'u29 Ia is the fused pair i + e; the adapter reads it as two parts (lemma ai, dative + accusative), which is right; the fixture expected the lemma ia.' },
  { id: 'A5', what: 'u62 tonë: the fixture asserted Person=1 Number=Plur (the possessor); the adapter, like Universal Dependencies, gives the number of the thing possessed. The fixture was wrong; those two features are dropped.' },
] as const;

export const ARTICLES = new Set(['i', 'e', 'të', 'së']);
export const isArticleGold = (g: GoldWord): boolean => ARTICLES.has(nfc(g.form)) && g.feats.Gender !== undefined && g.pos.includes('DET');

export function adjustedGold(g: GoldWord, sentenceId: string): GoldWord {
  const feats = { ...g.feats };
  const pos = g.pos.flatMap((p) => (p === 'CCONJ' ? ['CCONJ', 'CONJ'] : [p]));
  if (g.pos.includes('ADJ') || isArticleGold(g)) delete feats.Case;
  const lemma = sentenceId === 'u29' && g.form === 'Ia' ? [...g.lemma, 'ai'] : g.lemma;
  if (sentenceId === 'u62' && g.form === 'tonë') { delete feats.Number; delete feats.Person; }
  return { ...g, lemma, pos, feats };
}

export function judgeAdjustedWith(w: { sentence: string; gold: GoldWord; tokenIndex: number }, c: WordResult['top']): ReadingVerdict {
  const g = adjustedGold(w.gold, w.sentence);
  if (isArticleGold(w.gold)) {
    const inUnit = !!c?.unit?.pieces?.includes(w.tokenIndex);
    const lemma = !!c?.lemma && (ARTICLES.has(nfc(c.lemma)) || inUnit);
    const pos = !!c?.pos && (c.pos === 'DET' || c.pos === 'PART' || inUnit);
    const feats: Record<string, FeatVerdict> = {};
    for (const [k, v] of Object.entries(g.feats)) feats[k] = featVerdict(v, c?.morph?.[k]);
    const vs = Object.values(feats);
    return { lemma, pos, feats, featsExact: vs.every((x) => x === 'exact'), featsLenient: vs.every((x) => x === 'exact' || x === 'union') };
  }
  return judgeReading(g, c);
}
export const judgeAdjusted = (w: WordResult): ReadingVerdict => judgeAdjustedWith(w, w.top);
export const adjOk = (v: ReadingVerdict): boolean => v.lemma && v.pos && v.featsLenient;

/** Constructions that really are in the sentence but that the fixture did not list before the run (each judged by reading the sentence). */
export const PATTERN_COMPLETIONS: Record<string, string[]> = {
  u29: ['clitic-doubling'], u32: ['non-active-present'], u67: ['non-active-present'],
  u39: ['linking-article-adjective'], u56: ['linking-article-adjective'], u62: ['possessive-after-noun'],
};
export function adjustedPatterns(g: GoldSentence): string[] {
  const set = new Set(g.patterns);
  if (g.words.some((w) => w.feats.Definite === 'Def')) set.add('definite-noun-ending');
  for (const p of PATTERN_COMPLETIONS[g.id] ?? []) set.add(p);
  return [...set];
}

const rate = (n: number, d: number) => ({ n, d, pct: pct(n, d) });

export function summarizeAdjusted(res: SentenceResult[]) {
  const words = res.flatMap((r) => r.words);
  const j = words.map((w) => ({ w, v: judgeAdjusted(w) }));
  const withFeats = j.filter(({ w }) => Object.keys(adjustedGold(w.gold, w.sentence).feats).length > 0);
  const known = j.filter(({ w }) => w.covered);
  const conf = j.filter(({ w }) => w.gold.conf === 'c');
  const notOffered: Record<string, number> = {};
  const perFeature: Record<string, Record<FeatVerdict, number>> = {};
  for (const { v } of j) for (const [k, x] of Object.entries(v.feats)) {
    (perFeature[k] ??= { exact: 0, union: 0, missing: 0, wrong: 0 })[x] += 1;
    if (x === 'missing') notOffered[k] = (notOffered[k] ?? 0) + 1;
  }
  const pats = res.map((r) => ({ want: adjustedPatterns(r.gold), got: r.patternsGot }));
  const wantN = pats.reduce((a, p) => a + p.want.length, 0);
  const found = pats.reduce((a, p) => a + p.want.filter((k) => p.got.includes(k)).length, 0);
  const extra = pats.reduce((a, p) => a + p.got.filter((k) => !p.want.includes(k)).length, 0);
  const amb = j.filter(({ w }) => w.gold.amb);
  const bin = (lo: number, hi: number) => { const b = j.filter(({ w }) => (w.top?.confidence ?? 0) >= lo && (w.top?.confidence ?? 0) < hi); return rate(b.filter(({ v }) => adjOk(v)).length, b.length); };
  return {
    calibration: { high: bin(0.85, 1.01), mid: bin(0.6, 0.85), low: bin(0.0001, 0.6), none: rate(j.filter(({ w }) => !w.top).length, j.length) },
    lemma: rate(j.filter(({ v }) => v.lemma).length, j.length),
    lemmaConfident: rate(conf.filter(({ v }) => v.lemma).length, conf.length),
    lemmaKnown: rate(known.filter(({ v }) => v.lemma).length, known.length),
    pos: rate(j.filter(({ v }) => v.pos).length, j.length),
    posKnown: rate(known.filter(({ v }) => v.pos).length, known.length),
    morphExact: rate(withFeats.filter(({ v }) => v.featsExact).length, withFeats.length),
    morphLenient: rate(withFeats.filter(({ v }) => v.featsLenient).length, withFeats.length),
    morphExactKnown: rate(withFeats.filter(({ w, v }) => w.covered && v.featsExact).length, withFeats.filter(({ w }) => w.covered).length),
    wholeReading: rate(j.filter(({ v }) => adjOk(v)).length, j.length),
    wholeReadingKnown: rate(known.filter(({ v }) => adjOk(v)).length, known.length),
    perFeature, notOffered,
    ambiguity: {
      flagged: amb.length,
      correctInContext: rate(amb.filter(({ v }) => adjOk(v)).length, amb.length),
      correctInIsolation: rate(amb.filter(({ w }) => adjOk(judgeAdjustedWith(w, w.isolatedTop))).length, amb.length),
      contextFixed: amb.filter(({ w, v }) => !adjOk(judgeAdjustedWith(w, w.isolatedTop)) && adjOk(v)).length,
      contextBroke: amb.filter(({ w, v }) => adjOk(judgeAdjustedWith(w, w.isolatedTop)) && !adjOk(v)).length,
      rightReadingNotInList: amb.filter(({ w }) => !w.candidates.some((c) => adjOk(judgeAdjustedWith(w, c)))).length,
    },
    patterns: { expected: wantN, found, recall: pct(found, wantN), extraFired: extra },
  };
}

/** Every adjusted disagreement, one line each (for the report and the test's pinned list). */
export function disagreements(res: SentenceResult[]): Array<{ id: string; word: string; gold: string; got: string; kind: string }> {
  const out: Array<{ id: string; word: string; gold: string; got: string; kind: string }> = [];
  for (const r of res) for (const w of r.words) {
    const v = judgeAdjusted(w);
    if (adjOk(v)) continue;
    const t = w.top;
    const g = adjustedGold(w.gold, w.sentence);
    const bad = Object.entries(v.feats).filter(([, x]) => x === 'wrong' || x === 'missing').map(([k, x]) => `${k}:${x}`);
    const kind = !t ? 'no reading' : t.unconfirmed ? 'guess by ending' : !v.lemma ? 'wrong lemma' : !v.pos ? 'wrong POS' : bad.length ? `feature ${bad.join(',')}` : 'other';
    out.push({
      id: r.gold.id, word: w.surface,
      gold: `${g.lemma[0]}/${g.pos[0]} ${Object.entries(g.feats).map(([k, x]) => `${k}=${x}`).join(';')}`,
      got: t ? `${t.lemma}/${t.pos} ${Object.entries(t.morph ?? {}).filter(([k]) => k in g.feats).map(([k, x]) => `${k}=${x}`).join(';')}` : '(none)', kind,
    });
  }
  return out;
}
