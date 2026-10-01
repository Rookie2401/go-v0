import { describe, expect, it } from 'vitest';
import {
  canonicalBoundaries, fnv1a, isBreakable, prf, seededShuffle, wordSpans, wordsOf,
} from '../../src/bench/shared';
import {
  diffBoundaries, evaluateSystem, scoreSentence, topErrorPatterns,
} from '../../src/bench/words/metrics';
import { markdownTable } from '../../src/bench/words/report';
import type { WordSystem } from '../../src/bench/words/systems';
import type { GoldSentence } from '../../src/bench/gold/types';

/** Latin letters make the offsets easy to count by hand; the metrics do not care about the script. */
const gold = (id: string, stratum: string, text: string, boundaries: number[]): GoldSentence => ({
  id, lang: 'th', stratum, text, boundaries,
  source: { title: 't', licence: 'l', rights: 'rights-safe' }, tokenizedBy: 'test',
});

const fixed = (name: string, byId: Record<string, number[]>): WordSystem => ({
  name, label: 'test', kind: 'ours', segment: (_t, id) => byId[id as string] ?? [],
});

describe('shared helpers', () => {
  it('canonicalBoundaries moves a cut past whitespace and drops the first word start, the end and duplicates', () => {
    expect(canonicalBoundaries('ab cd', [2])).toEqual([3]);
    expect(canonicalBoundaries('ab cd', [0, 3, 3, 5])).toEqual([3]);
    expect(canonicalBoundaries('  ab cd', [2, 5])).toEqual([5]);
    expect(canonicalBoundaries('abcdef', [4, 2])).toEqual([2, 4]);
  });

  it('wordSpans trims whitespace and never makes a whitespace word', () => {
    expect(wordsOf('ab  cd ef', [4, 7])).toEqual(['ab', 'cd', 'ef']);
    expect(wordSpans('ab cd', [3])).toEqual([{ start: 0, end: 2 }, { start: 3, end: 5 }]);
  });

  it('prf: 0 / 0 is 1, F1 is the harmonic mean', () => {
    expect(prf(0, 0, 0)).toMatchObject({ precision: 1, recall: 1, f1: 1 });
    const x = prf(2, 1, 0);
    expect(x.precision).toBeCloseTo(2 / 3);
    expect(x.recall).toBe(1);
    expect(x.f1).toBeCloseTo(0.8);
    expect(prf(0, 2, 2).f1).toBe(0);
  });

  it('isBreakable refuses clusters, following vowels, tone marks and the place after a leading vowel', () => {
    const t = 'เกี่ยว'; // เ ก ี ่ ย ว
    expect([1, 2, 3, 4, 5].map((i) => isBreakable(t, i))).toEqual([false, false, false, true, true]);
    expect(isBreakable('ทำ', 1)).toBe(false);
    expect(isBreakable('ตาม', 1)).toBe(false); // ตา|ม is fine at 2, but า follows ต: never before า
    expect(isBreakable('ตาม', 2)).toBe(true);
  });

  it('the seeded shuffle and the hash are deterministic', () => {
    const xs = Array.from({ length: 20 }, (_, i) => i);
    expect(seededShuffle(xs, 7)).toEqual(seededShuffle(xs, 7));
    expect(seededShuffle(xs, 7)).not.toEqual(seededShuffle(xs, 8));
    expect([...seededShuffle(xs, 7)].sort((a, b) => a - b)).toEqual(xs);
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('metrics, computed by hand', () => {
  it('over-splitting: gold ab|cd|ef, system ab|c|d|ef', () => {
    // boundaries gold {2,4}, system {2,3,4}: tp 2, fp 1, fn 0. words gold ab,cd,ef; system ab,c,d,ef: tp 2 (ab, ef)
    const s = scoreSentence('abcdef', [2, 4], [2, 3, 4]);
    expect(s.boundary).toEqual({ tp: 2, fp: 1, fn: 0 });
    expect(s.word).toEqual({ tp: 2, fp: 2, fn: 1 });
    expect(s.exact).toBe(false);
    expect(diffBoundaries('abcdef', [2, 4], [2, 3, 4])).toEqual([{ kind: 'over-split', start: 2, end: 4, gold: ['cd'], system: ['c', 'd'] }]);
  });

  it('under-splitting: gold ab|cd|ef, system ab|cdef', () => {
    const s = scoreSentence('abcdef', [2, 4], [2]);
    expect(s.boundary).toEqual({ tp: 1, fp: 0, fn: 1 });
    expect(s.word).toEqual({ tp: 1, fp: 1, fn: 2 });
    expect(diffBoundaries('abcdef', [2, 4], [2])).toEqual([{ kind: 'under-split', start: 2, end: 6, gold: ['cd', 'ef'], system: ['cdef'] }]);
  });

  it('a shifted boundary is both a false positive and a false negative', () => {
    const s = scoreSentence('abcdef', [3], [4]);
    expect(s.boundary).toEqual({ tp: 0, fp: 1, fn: 1 });
    expect(diffBoundaries('abcdef', [3], [4])[0]).toMatchObject({ kind: 'shifted', gold: ['abc', 'def'], system: ['abcd', 'ef'] });
  });

  it('whitespace is not a word: a system cut on the space equals a cut after it', () => {
    const s = scoreSentence('ab cd', [3], canonicalBoundaries('ab cd', [2]));
    expect(s.exact).toBe(true);
    expect(s.word).toEqual({ tp: 2, fp: 0, fn: 0 });
  });

  it('micro averages, per-stratum tables and exact-match rate over several sentences', () => {
    const g = [
      gold('a', 'one', 'abcdef', [2, 4]),
      gold('b', 'one', 'abcd', [2]),
      gold('c', 'two', 'abcdef', [3]),
    ];
    const sys = fixed('fx', { a: [2, 3, 4], b: [2], c: [] });
    const r = evaluateSystem(g, sys);
    // boundaries: a tp2 fp1 fn0; b tp1; c tp0 fn1  -> tp 3, fp 1, fn 1
    expect(r.overall.boundary).toMatchObject({ tp: 3, fp: 1, fn: 1 });
    expect(r.overall.boundary.precision).toBeCloseTo(0.75);
    expect(r.overall.boundary.recall).toBeCloseTo(0.75);
    expect(r.overall.boundary.f1).toBeCloseTo(0.75);
    expect(r.overall.exact).toBe(1); // only b is exact
    expect(r.overall.exactRate).toBeCloseTo(1 / 3);
    expect(r.byStratum.one.boundary).toMatchObject({ tp: 3, fp: 1, fn: 0 });
    expect(r.byStratum.one.exactRate).toBeCloseTo(0.5);
    expect(r.byStratum.two.boundary).toMatchObject({ tp: 0, fp: 0, fn: 1 });
    expect(r.byStratum.two.boundary.f1).toBe(0);
    expect(Object.keys(r.byStratum)).toEqual(['one', 'two']);
  });

  it('keeps EVERY sentence with an error, with gold, system and the classified spans', () => {
    const g = [gold('a', 's', 'abcdef', [2, 4]), gold('b', 's', 'abcd', [2]), gold('c', 's', 'abcdef', [3])];
    const r = evaluateSystem(g, fixed('fx', { a: [2, 3, 4], b: [2], c: [] }));
    expect(r.errors.map((e) => e.id)).toEqual(['a', 'c']);
    expect(r.errors[0]).toMatchObject({ gold: 'ab|cd|ef', system: 'ab|c|d|ef', text: 'abcdef' });
    expect(r.errors[1].diffs[0].kind).toBe('under-split');
    expect(r.errorKinds).toEqual({ 'over-split': 1, 'under-split': 1, shifted: 0 });
  });

  it('counts the most frequent error patterns across sentences, ties broken alphabetically', () => {
    const g = [gold('a', 's', 'abcdef', [2, 4]), gold('b', 's', 'xxcdyy', [2, 4]), gold('c', 's', 'ghijkl', [3])];
    const r = evaluateSystem(g, fixed('fx', { a: [2, 3, 4], b: [2, 3, 4], c: [] }));
    const top = topErrorPatterns(r.errors, 5);
    expect(top[0]).toMatchObject({ kind: 'over-split', gold: 'cd', system: 'c|d', count: 2 });
    expect(top[1].count).toBe(1);
    expect(topErrorPatterns(r.errors, 1)).toHaveLength(1);
  });

  it('the markdown table has one row per system and stratum plus an all row, with percentages', () => {
    const r = evaluateSystem([gold('a', 's', 'abcdef', [2, 4])], fixed('fx', { a: [2, 4] }));
    const md = markdownTable([r]);
    expect(md).toContain('| s | fx | 1 | 100.00 | 100.00 | 100.00 |');
    expect(md).toContain('| **all** | fx |');
  });
});
