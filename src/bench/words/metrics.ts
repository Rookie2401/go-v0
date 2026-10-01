/**
 * Word-segmentation metrics: boundary precision / recall / F1 (micro, overall and per stratum), word-level
 * precision / recall / F1 (a word is right only when both its edges are), sentence exact-match rate, and the
 * errors themselves: every sentence with an error is retained, with the differing spans classified.
 */
import { prf, setCounts, wordSpans, wordsOf, type Prf } from '../shared';
import { toEditingLine } from '../gold/format';
import type { GoldSentence } from '../gold/types';
import type { WordSystem } from './systems';

export interface Metrics {
  sentences: number;
  exact: number;
  exactRate: number;
  boundary: Prf;
  word: Prf;
}

export type ErrorKind = 'over-split' | 'under-split' | 'shifted';

export interface ErrorSpan {
  kind: ErrorKind;
  start: number;
  end: number;
  /** The gold words and the system's words over the same stretch of text. */
  gold: string[];
  system: string[];
}

export interface ErrorCase {
  id: string;
  stratum: string;
  text: string;
  gold: string;
  system: string;
  diffs: ErrorSpan[];
}

// ───────────────────────────── one sentence ─────────────────────────────

export interface SentenceScore {
  boundary: { tp: number; fp: number; fn: number };
  word: { tp: number; fp: number; fn: number };
  exact: boolean;
}

export function scoreSentence(text: string, gold: readonly number[], system: readonly number[]): SentenceScore {
  const b = setCounts(gold, system);
  const gw = wordSpans(text, gold);
  const sw = wordSpans(text, system);
  const key = (s: { start: number; end: number }) => `${s.start}:${s.end}`;
  const gset = new Set(gw.map(key));
  let wtp = 0;
  for (const w of sw) if (gset.has(key(w))) wtp++;
  return {
    boundary: b,
    word: { tp: wtp, fp: sw.length - wtp, fn: gw.length - wtp },
    exact: b.fp === 0 && b.fn === 0,
  };
}

/**
 * The differing stretches of one sentence. Cut the text at every boundary both sides agree on; inside each
 * piece where they differ the system either put extra cuts where gold has none (over-split), left out cuts gold has
 * (under-split), or both (shifted).
 */
export function diffBoundaries(text: string, gold: readonly number[], system: readonly number[]): ErrorSpan[] {
  const s = new Set(system);
  const common = [0, ...gold.filter((b) => s.has(b)), text.length];
  const out: ErrorSpan[] = [];
  for (let k = 0; k + 1 < common.length; k++) {
    const lo = common[k];
    const hi = common[k + 1];
    const gIn = gold.filter((b) => b > lo && b < hi);
    const sIn = system.filter((b) => b > lo && b < hi);
    if (gIn.length === 0 && sIn.length === 0) continue;
    const rel = (xs: number[]) => xs.map((b) => b - lo);
    const piece = text.slice(lo, hi);
    const kind: ErrorKind = gIn.length === 0 ? 'over-split' : sIn.length === 0 ? 'under-split' : 'shifted';
    out.push({ kind, start: lo, end: hi, gold: wordsOf(piece, rel(gIn)), system: wordsOf(piece, rel(sIn)) });
  }
  return out;
}

// ───────────────────────────── a set of sentences ─────────────────────────────

export interface SystemReport {
  system: string;
  label: string;
  kind: WordSystem['kind'];
  overall: Metrics;
  byStratum: Record<string, Metrics>;
  /** Number of error spans by kind. */
  errorKinds: Record<ErrorKind, number>;
  errors: ErrorCase[];
}

interface Acc { sentences: number; exact: number; b: { tp: number; fp: number; fn: number }; w: { tp: number; fp: number; fn: number } }
const newAcc = (): Acc => ({ sentences: 0, exact: 0, b: { tp: 0, fp: 0, fn: 0 }, w: { tp: 0, fp: 0, fn: 0 } });
const finish = (a: Acc): Metrics => ({
  sentences: a.sentences,
  exact: a.exact,
  exactRate: a.sentences ? a.exact / a.sentences : 0,
  boundary: prf(a.b.tp, a.b.fp, a.b.fn),
  word: prf(a.w.tp, a.w.fp, a.w.fn),
});

export function evaluateSystem(gold: readonly GoldSentence[], system: WordSystem): SystemReport {
  const all = newAcc();
  const per = new Map<string, Acc>();
  const errors: ErrorCase[] = [];
  const errorKinds: Record<ErrorKind, number> = { 'over-split': 0, 'under-split': 0, shifted: 0 };
  for (const g of gold) {
    const sysB = system.segment(g.text, g.id);
    const sc = scoreSentence(g.text, g.boundaries, sysB);
    let stratumAcc = per.get(g.stratum);
    if (!stratumAcc) { stratumAcc = newAcc(); per.set(g.stratum, stratumAcc); }
    for (const acc of [all, stratumAcc]) {
      acc.sentences++;
      if (sc.exact) acc.exact++;
      for (const k of ['tp', 'fp', 'fn'] as const) { acc.b[k] += sc.boundary[k]; acc.w[k] += sc.word[k]; }
    }
    if (!sc.exact) {
      const diffs = diffBoundaries(g.text, g.boundaries, sysB);
      for (const d of diffs) errorKinds[d.kind]++;
      errors.push({
        id: g.id, stratum: g.stratum, text: g.text,
        gold: toEditingLine(g.text, g.boundaries), system: toEditingLine(g.text, sysB), diffs,
      });
    }
  }
  const byStratum: Record<string, Metrics> = {};
  for (const [k, v] of [...per.entries()].sort((a, b) => a[0].localeCompare(b[0]))) byStratum[k] = finish(v);
  return { system: system.name, label: system.label, kind: system.kind, overall: finish(all), byStratum, errorKinds, errors };
}

// ───────────────────────────── error patterns ─────────────────────────────

export interface ErrorPattern { kind: ErrorKind; gold: string; system: string; count: number; example: string }

/** The most frequent error patterns: the same gold words cut the same wrong way, counted across sentences. */
export function topErrorPatterns(errors: readonly ErrorCase[], limit = 50): ErrorPattern[] {
  const map = new Map<string, ErrorPattern>();
  for (const e of errors) {
    for (const d of e.diffs) {
      const gold = d.gold.join('|');
      const system = d.system.join('|');
      const key = `${d.kind}\u0000${gold}\u0000${system}`;
      const cur = map.get(key);
      if (cur) cur.count++;
      else map.set(key, { kind: d.kind, gold, system, count: 1, example: e.id });
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind) || a.gold.localeCompare(b.gold) || a.system.localeCompare(b.system))
    .slice(0, limit);
}
