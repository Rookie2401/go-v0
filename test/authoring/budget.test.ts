import { describe, expect, it } from 'vitest';
import { analyseCorpus } from '../../src/authoring/analyse';
import { checkBudget, type BudgetOptions } from '../../src/authoring/budget';
import { stageOfFromMap } from '../../src/authoring/select';
import { fakeAdapter, mkDoc, seq } from './fake';
import type { CorpusDocument } from '../../src/ingest/format';

const stageOf = stageOfFromMap({ 'work-a': '0', 'work-b': '1' });
const run = (docs: CorpusDocument[], budgets: Record<string, number>, opts?: BudgetOptions) =>
  checkBudget(analyseCorpus(docs, fakeAdapter, { stageOf }), budgets, opts);
const kinds = (r: ReturnType<typeof run>) => r.findings.map((f) => f.kind);

// stage 0: w1..w5 (5 lemmas) in 30 words; stage 1: w6..w10 (5 more) in 30 words
const base = (): CorpusDocument[] => [
  mkDoc('a', [seq(30, { 0: 'w1', 1: 'w2', 2: 'w3', 3: 'w4', 4: 'w5' })], { slug: 'work-a' }),
  mkDoc('b', [seq(30, { 0: 'w6', 1: 'w7', 2: 'w8', 3: 'w9', 4: 'w10' })], { slug: 'work-b' }),
];

describe('cumulative lemma ceilings', () => {
  it('passes when the cumulative count is at or under each ceiling', () => {
    const r = run(base(), { '0': 6, '1': 11 }); // 'filler' counts too: 6 and 11
    expect(kinds(r)).not.toContain('over-budget');
    expect(r.stages.map((s) => [s.stage, s.cumulative, s.ceiling])).toEqual([['0', 6, 6], ['1', 11, 11]]);
  });

  it('flags a stage over its ceiling as an error: by how many and which lemmas were added last', () => {
    const r = run(base(), { '0': 4, '1': 100 }, { exemptPos: ['PART'] });
    const f = r.findings.find((x) => x.kind === 'over-budget')!;
    expect(f).toMatchObject({ severity: 'error', stage: '0', over: 1, lastAdded: ['w5|NOUN'] });
    expect(r.errors).toBe(1);
  });

  it('measures the second stage cumulatively (the first stage counts too)', () => {
    const r = run(base(), { '0': 100, '1': 8 }, { exemptPos: ['PART'] });
    const f = r.findings.find((x) => x.kind === 'over-budget')!;
    expect(f).toMatchObject({ stage: '1', over: 2, lastAdded: ['w9|NOUN', 'w10|NOUN'] });
  });

  it('counts function words unless their part of speech is exempt, and says which', () => {
    const docs = [mkDoc('a', ['el y la gato'], { slug: 'work-a' })]; // el (DET), y (CONJ), gato → 3 lemmas
    expect(run(docs, { '0': 2 }).findings.map((f) => f.kind)).toContain('over-budget');
    expect(run(docs, { '0': 2 }).counted).toMatch(/function words are counted/);
    const exempt = run(docs, { '0': 1 }, { exemptPos: ['DET', 'CONJ'] });
    expect(kinds(exempt)).not.toContain('over-budget');
    expect(exempt.counted).toMatch(/exempt.*DET, CONJ/);
    expect(exempt.exemptPos).toEqual(['DET', 'CONJ']);
  });

  it('ignores stages without a ceiling and ceilings of stages the corpus does not have', () => {
    expect(kinds(run(base(), { '7': 1 }, { maxNewPer100: 1000 }))).toEqual([]);
  });
});

describe('per-text findings', () => {
  it('dense: more than 12 (default) new lemmas per 100 words is a warning; the option moves the limit', () => {
    const docs = [mkDoc('a', [seq(100, { 0: 'w1', 1: 'w2', 2: 'w3', 3: 'w4', 4: 'w5', 5: 'w6', 6: 'w7', 7: 'w8', 8: 'w9', 9: 'w10', 10: 'w11', 11: 'w12' })], { slug: 'work-a' })]; // 12 + filler = 13 new
    const r = run(docs, {});
    const f = r.findings.find((x) => x.kind === 'dense')!;
    expect(f).toMatchObject({ severity: 'warning', docId: 'a' });
    expect(f.newPer100).toBeCloseTo(13, 5);
    expect(kinds(run(docs, {}, { exemptPos: ['PART'] }))).not.toContain('dense'); // exactly 12: not more than 12
    expect(kinds(run(docs, {}, { maxNewPer100: 20 }))).not.toContain('dense');
  });

  it('unread tokens are errors and guesses warnings, each with document and sentence', () => {
    const r = run([mkDoc('a', ['el gato.', 'el zzz casi.'], { slug: 'work-a' })], {}, { maxNewPer100: 1000 });
    const unread = r.findings.find((f) => f.kind === 'unread')!;
    const guess = r.findings.find((f) => f.kind === 'guess')!;
    expect(unread).toMatchObject({ severity: 'error', docId: 'a', sentence: 1, form: 'zzz' });
    expect(guess).toMatchObject({ severity: 'warning', docId: 'a', sentence: 1, form: 'casi' });
    expect(unread.message).toContain('a s2');
    expect([r.errors, r.warnings]).toEqual([1, 1]);
  });

  it('a document with no stage is a warning', () => {
    const r = run([mkDoc('a', ['el gato.'], { slug: 'nowhere' })], {});
    expect(r.findings.find((f) => f.kind === 'no-stage')).toMatchObject({ severity: 'warning', docId: 'a' });
    expect(r.errors).toBe(0);
  });

  it('a clean corpus has no findings', () => {
    const r = run([mkDoc('a', ['el gato y el libro.'], { slug: 'work-a' }), mkDoc('b', ['el gato y el libro.'], { slug: 'work-b' })], { '0': 10, '1': 10 }, { maxNewPer100: 100 });
    expect(r.findings).toEqual([]);
  });
});
