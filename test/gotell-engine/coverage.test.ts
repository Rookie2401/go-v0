/**
 * The coverage statement as one line plus details: a pure function over the analysed sentences, tested on the real Albanian checker
 * and on hand-made parts. The line is a summary; every word of the adapter's statement is still in the details.
 */
import { describe, expect, it } from 'vitest';
import { sqAdapter } from '../../src/adapters/sq';
import { CHECKED_AREAS, summariseCoverage } from '../../packages/gotell/src/engine';
import { checkerCoverage } from '../../packages/gotell/src/salvage';
import type { CoverageParts } from '../../packages/gotell/src/types';
import { realAnalyzer } from './helpers';

const analyzer = realAnalyzer();
const real = analyzer.analyzeDraft('d1', 'Unë shkoj te libër. Unë lexoj librin.');

describe('summariseCoverage on the real Albanian checker', () => {
  const s = summariseCoverage(real.sentences, 'sq');

  it('is one short line naming what is checked and how many areas are not', () => {
    expect(s.line).toBe(`Checked: definiteness, case, agreement, conjugation, particles. Not checked: ${sqAdapter.support.limitations.length} other areas — see details.`);
    expect(s.line.length).toBeLessThan(200);
    expect(s.checked).toEqual(['definiteness', 'case', 'agreement', 'conjugation', 'particles']);
    expect(s.notChecked).toBe(sqAdapter.support.limitations.length);
  });

  it('keeps every limit, in full, in the details, after the headline that says what "nothing found" means', () => {
    // one headline per kind of sentence (one with a finding, one without), then the limits
    expect(s.details).toHaveLength(2 + s.notChecked);
    expect(s.details[0]).toMatch(/does not mean the sentence is now correct/);
    expect(s.details[1]).toMatch(/found nothing in this sentence; that does not show the sentence is correct/);
    for (const limit of sqAdapter.support.limitations) expect(s.details).toContain(limit);
    expect(s.details.join(' ')).toMatch(/idiomaticity/);
  });

  it('merges the sentences: the same statement is not repeated for every sentence', () => {
    const one = summariseCoverage([real.sentences[0]], 'sq');
    expect(one.notChecked).toBe(s.notChecked);
    // two sentences, two headlines (one issue, one clean), the same limits
    expect(s.details.filter((d) => sqAdapter.support.limitations.includes(d))).toHaveLength(s.notChecked);
  });

  it('the checked areas are real: each is something the real checker reports on pinned sentences', () => {
    const cats = new Set<string>();
    for (const text of ['Unë shkoj te libër.', 'Unë shkoj në shtëpia.', 'Unë kam një shtëpi e madh.', 'Unë lexon librin.', 'Unë dua të nuk shkoj.']) {
      for (const sent of analyzer.analyzeDraft('d', text).sentences) for (const i of sent.issues) cats.add(i.category);
    }
    // 'particles' is the plural of the checker's category 'particle'
    for (const area of CHECKED_AREAS.sq) expect(cats.has(area === 'particles' ? 'particle' : area), `${area} should be reported on some pinned sentence`).toBe(true);
  });

  it('still lists the whole old statement: the string form is unchanged', () => {
    expect(real.sentences[0].checkerCoverage).toBe(checkerCoverage(sqAdapter));
  });
});

describe('summariseCoverage on hand-made parts', () => {
  const parts = (over: Partial<CoverageParts> = {}): { checkerCoverage: string; coverageParts: CoverageParts } => ({
    checkerCoverage: 'x', coverageParts: { headline: 'The checker is narrow.', limits: ['No idioms.', 'No register.'], checked: true, ...over },
  });

  it('counts one area in the singular', () => {
    expect(summariseCoverage([parts({ limits: ['Only one.'] })], 'sq').line).toMatch(/Not checked: 1 other area — see details\.$/);
  });

  it('says plainly when the checked areas are not recorded for a language', () => {
    const s = summariseCoverage([parts()], 'xx');
    expect(s.line).toBe('What the checker covers is not recorded for this language. Not checked: 2 other areas — see details.');
    expect(s.checked).toEqual([]);
  });

  it('when nothing was checked, the line is the headline itself and claims no checked areas', () => {
    const s = summariseCoverage([parts({ headline: 'The checker stopped on this sentence (boom), so nothing in it was checked.', checked: false })], 'sq');
    expect(s.line).toMatch(/^The checker stopped/);
    expect(s.line).not.toMatch(/Checked:/);
    expect(s.checked).toEqual([]);
  });

  it('a short statement with no limits is its own line and has no details', () => {
    const s = summariseCoverage([parts({ limits: [] })], 'sq');
    expect(s.line).toBe('The checker is narrow.');
    expect(s.details).toEqual([]);
  });

  it('falls back to the old string form, splitting at the known-limits marker and losing nothing', () => {
    const s = summariseCoverage([{ checkerCoverage: 'Narrow checker. Known limits: No idioms. No register.' }], 'sq');
    expect(s.details).toEqual(['Narrow checker.', 'No idioms. No register.']);
    expect(s.notChecked).toBe(1);
    const plain = summariseCoverage([{ checkerCoverage: 'The checker cannot see word choice or tense.' }], 'sq');
    expect(plain.line).toBe('The checker cannot see word choice or tense.');
  });

  it('is empty for no sentences or empty statements', () => {
    expect(summariseCoverage([], 'sq')).toEqual({ line: '', details: [], checked: [], notChecked: 0 });
    expect(summariseCoverage([{ checkerCoverage: '  ' }], 'sq').line).toBe('');
  });
});
