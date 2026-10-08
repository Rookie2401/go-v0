/**
 * The two advisory ladder checks that apply to every language and are NEVER errors (docs/norway/SPEC.md section 11):
 *   orphan      a lemma first met in a unit and never met again in any later unit (> 15 % of a unit's new lemmas -> warning)
 *   recurrence  the median second gap between a unit's new lemmas' meetings is shorter than the first (intervals do not widen)
 * Small synthetic Spanish ladders run through the real Spanish adapter; every unit is exactly 100 running words so that the word
 * distances are known by hand.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import type { CorpusDocument } from '../../src/ingest';
import { measureLadder, orphansOf, recurrenceOf } from '../../src/ladder';
import type { Finding, LoadedLadder } from '../../src/ladder';

const adapter = createAdapterRegistry().get('es');

/** Known words (4 head encounters each), and fresh words that are new wherever they first appear. */
const K = ['niño', 'perro', 'gato', 'ciudad', 'mesa', 'libro', 'agua', 'pan', 'árbol', 'mujer', 'hombre', 'día', 'ver', 'tener', 'querer', 'buscar', 'comer', 'leer', 'grande', 'pequeño', 'bueno', 'aquí', 'hoy', 'mucho'];
const N = ['zorro', 'lobo', 'nube', 'río', 'bosque', 'luna', 'viento', 'lluvia', 'fuego', 'piedra', 'hierba', 'flor', 'rama', 'sombra', 'camino', 'ventana'];

const cyc = (list: string[], n: number, offset = 0): string[] => Array.from({ length: n }, (_, i) => list[(i + offset) % list.length]);
const asDoc = (id: string, words: string[]): CorpusDocument => {
  const sentences: Array<{ text: string }> = [];
  for (let i = 0; i < words.length; i += 7) sentences.push({ text: words.slice(i, i + 7).join(' ') + '.' });
  return { schemaVersion: 2, id, lang: 'es', title: id, contentType: 'story', sections: [{ paragraphs: [{ sentences }] }] } as unknown as CorpusDocument;
};

/** A 100-word unit of known words with `words` written over positions at, at+1, ... (0-based running-word positions). */
const unit = (id: string, ...inserts: Array<{ at: number; words: string[] }>): CorpusDocument => {
  const w = cyc(K, 100, id.length * 5);
  for (const ins of inserts) w.splice(ins.at, ins.words.length, ...ins.words);
  return asDoc(id, w);
};
const plain = (id: string): CorpusDocument => unit(id);

const head = asDoc('head', [...[0, 5, 11, 17].flatMap((o) => cyc(K, 24, o))]); // 96 words, every K lemma 4 times

const ladder = (docs: CorpusDocument[]): LoadedLadder => ({
  ladder: { lang: 'es', version: 1, after: 'stage0', units: docs.map((_d, i) => ({ id: `u${i}`, stage: 'a1-1' as const, kind: 'controlled' as const, domain: 'narrative' })) },
  head: [{ id: 'stage0:head', title: 'head', doc: head }],
  units: docs.map((d, i) => ({ unit: { id: `u${i}`, stage: 'a1-1' as const, kind: 'controlled' as const, domain: 'narrative' }, doc: d, status: 'ok' as const })),
});
const run = (docs: CorpusDocument[]) => measureLadder('es', ladder(docs), { adapter });
const of = (findings: Finding[], check: string, unitId?: string) => findings.filter((f) => f.check === check && (unitId === undefined || f.unit === unitId));

const five = (from: number) => N.slice(from, from + 5);

describe('orphans', () => {
  it('a unit whose new lemmas never come back is warned about (count, share and examples in the message), and only warned', () => {
    const r = run([unit('a0', { at: 40, words: five(0) }), plain('a1'), plain('a2'), plain('a3'), plain('a4')]);
    expect(r.rows[0].newLemmas).toBe(5);
    expect(r.rows[0].orphans).toBe(5);
    const f = of(r.findings, 'orphan', 'u0');
    expect(f).toHaveLength(1);
    expect(f[0].level).toBe('warning');
    expect(f[0].message).toMatch(/5 of 5 new lemmas \(100\.0 %\) are never met again/);
    expect(f[0].message).toContain('zorro');
    expect(r.errors).toBe(0);
    expect(r.advice.orphans).toMatchObject({ judgedUnits: 1, newLemmas: 5, orphanLemmas: 5, unitsOverThreshold: 1 });
    expect(r.advice.orphans.worst[0]).toMatchObject({ unit: 'u0', orphans: 5, newLemmas: 5, share: 1 });
  });

  it('a unit whose new lemmas come back in a later unit is not warned about', () => {
    const r = run([unit('b0', { at: 40, words: five(0) }), plain('b1'), unit('b22', { at: 10, words: five(0) }), plain('b3'), plain('b4')]);
    expect(r.rows[0].orphans).toBe(0);
    expect(of(r.findings, 'orphan', 'u0')).toEqual([]);
  });

  it('the threshold is 15 % of the unit\'s new lemmas: 1 of 7 (14.3 %) passes, 2 of 7 (28.6 %) warns', () => {
    const seven = N.slice(0, 7);
    const back = (n: number) => unit('c22', { at: 10, words: seven.slice(0, n) });
    const one = run([unit('c0', { at: 40, words: seven }), plain('c1'), back(6), plain('c3'), plain('c4')]);
    expect(one.rows[0].orphans).toBe(1);
    expect(of(one.findings, 'orphan', 'u0')).toEqual([]);
    const two = run([unit('c0', { at: 40, words: seven }), plain('c1'), back(5), plain('c3'), plain('c4')]);
    expect(two.rows[0].orphans).toBe(2);
    expect(of(two.findings, 'orphan', 'u0')).toHaveLength(1);
  });

  it('a unit with fewer than 3 readable units after it is not judged (the end of a ladder has nothing to come back in)', () => {
    const r = run([plain('d0'), plain('d1'), unit('d2', { at: 40, words: five(0) }), plain('d3'), plain('d4')]);
    expect(r.rows[2].newLemmas).toBe(5);
    expect(r.rows[2].orphans).toBeNull();
    expect(of(r.findings, 'orphan')).toEqual([]);
  });

  it('orphansOf: later means a later unit; the unit itself and Stage 0 do not count', () => {
    const mk = (words: string[]) => ({ words: words.length, auto: 0, lemmas: new Map(words.map((w) => [w, 1])), patterns: new Set<string>(), positions: new Map(words.map((w, i) => [w, [i]])) });
    const stats = [mk(['a', 'b', 'c']), mk(['x']), mk(['b'])];
    expect(orphansOf(0, ['a', 'b', 'c'], stats)).toEqual(['a', 'c']);
    expect(orphansOf(1, ['x'], stats)).toEqual(['x']);
    expect(orphansOf(2, ['b'], stats)).toEqual(['b']);
  });
});

describe('recurrence intervals', () => {
  // unit length 100 words, head 96 words: unit 0 starts at 96 + 6 (the six words H are not used here) -> offsets are checked through gaps only
  it('widening intervals: no warning, and the medians are the hand-computed gaps (60 then 240 words)', () => {
    // each lemma i: unit 0 at 40+i, unit 1 at i, unit 3 at 40+i  ->  gap1 = (100-40)+0 = 60, gap2 = 3 units later: 240
    const r = run([
      unit('w0', { at: 40, words: five(0) }), unit('w1', { at: 0, words: five(0) }), plain('w22'), unit('w3', { at: 40, words: five(0) }), plain('w4'),
    ]);
    expect(r.rows[0].gaps).toEqual({ lemmas: 5, first: 60, second: 240 });
    expect(of(r.findings, 'recurrence')).toEqual([]);
    expect(r.advice.recurrence.nonWidening).toBe(0);
  });

  it('intervals that do not widen: a warning naming both medians (150 then 10 words), and only a warning', () => {
    // unit 0 at 40+i, unit 1 at 90+i, unit 2 at i  ->  gap1 = 60 + 90 = 150, gap2 = 10 + 0 = 10
    const r = run([
      unit('x0', { at: 40, words: five(0) }), unit('x1', { at: 90, words: five(0) }), unit('x22', { at: 0, words: five(0) }), plain('x3'), plain('x4'),
    ]);
    expect(r.rows[0].gaps).toEqual({ lemmas: 5, first: 150, second: 10 });
    const f = of(r.findings, 'recurrence', 'u0');
    expect(f).toHaveLength(1);
    expect(f[0].level).toBe('warning');
    expect(f[0].message).toMatch(/median first gap 150 words, median second gap 10 words \(over 5 lemmas/);
    expect(r.errors).toBe(0);
    expect(r.advice.recurrence).toMatchObject({ judgedUnits: 1, nonWidening: 1 });
    expect(r.advice.recurrence.worst[0]).toMatchObject({ unit: 'u0', first: 150, second: 10 });
  });

  it('equal gaps are not a warning (only a SHORTER second median is)', () => {
    const r = run([
      unit('y0', { at: 40, words: five(0) }), unit('y1', { at: 40, words: five(0) }), unit('y22', { at: 40, words: five(0) }), plain('y3'), plain('y4'),
    ]);
    expect(r.rows[0].gaps).toEqual({ lemmas: 5, first: 100, second: 100 });
    expect(of(r.findings, 'recurrence')).toEqual([]);
  });

  it('fewer than 5 lemmas met three times: not judged, no gaps, no warning', () => {
    const four = N.slice(0, 4);
    const r = run([unit('z0', { at: 40, words: four }), unit('z1', { at: 90, words: four }), unit('z22', { at: 0, words: four }), plain('z3'), plain('z4')]);
    expect(r.rows[0].newLemmas).toBe(4);
    expect(r.rows[0].gaps).toBeNull();
    expect(of(r.findings, 'recurrence')).toEqual([]);
  });

  it('recurrenceOf: lemmas met twice have no second gap; meetings inside the unit itself count', () => {
    const mk = (m: Record<string, number[]>, words: number) => ({ words, auto: 0, lemmas: new Map(Object.entries(m).map(([l, p]) => [l, p.length])), patterns: new Set<string>(), positions: new Map(Object.entries(m)) });
    const stats = [mk({ a: [0, 2], b: [1] }, 10), mk({ a: [5], b: [9] }, 10), mk({}, 10)];
    const { first, second } = recurrenceOf(0, ['a', 'b'], stats, [100, 110, 120]);
    expect(first).toEqual([2]); // a: t = 100, 102, 115 -> gaps 2 and 13; b has two meetings only
    expect(second).toEqual([13]);
  });
});

describe('the advice never fails a ladder', () => {
  it('a ladder full of orphans and shrinking intervals still has zero errors', () => {
    const r = run([unit('e0', { at: 40, words: five(0) }), unit('e1', { at: 90, words: five(0) }), unit('e22', { at: 0, words: five(0) }), unit('e3', { at: 40, words: five(5) }), plain('e4'), plain('e5'), plain('e6')]);
    expect(r.findings.filter((f) => f.check === 'orphan' || f.check === 'recurrence').every((f) => f.level === 'warning')).toBe(true);
    expect(r.findings.some((f) => f.check === 'orphan')).toBe(true);
    expect(r.findings.some((f) => f.check === 'recurrence')).toBe(true);
    expect(r.errors).toBe(0);
  });
});
