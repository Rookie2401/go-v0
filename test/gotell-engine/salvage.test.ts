/**
 * The salvaged legacy helpers, now adapter-agnostic: they work on the pack runtime's adapter and know no language but by name.
 */
import { describe, expect, it } from 'vitest';
import {
  CHRONOLOGY, CONCEPTS, NEGATORS, applyEdits, applyEditsDetailed, checkerCoverage, conceptsForToken, diffSentences, introducedIndexes, meaningChanges, negatorsIn,
  parse, planRepairs, validateProposalShape,
} from '../../packages/gotell/src/salvage';
import { sqAdapter } from '../../src/adapters/sq';

const p = (s: string) => parse(sqAdapter, s);

describe('diffSentences', () => {
  it('pairs adjacent removed/added sentences into changed, and keeps anchors', () => {
    expect(diffSentences(['A.', 'B.', 'C.'], ['A.', 'B2.', 'C.'])).toEqual([
      { kind: 'same', a: 'A.', b: 'A.' }, { kind: 'changed', a: 'B.', b: 'B2.' }, { kind: 'same', a: 'C.', b: 'C.' },
    ]);
    expect(diffSentences(['A.'], ['A.', 'B.']).map((e) => e.kind)).toEqual(['same', 'added']);
    expect(diffSentences(['A.', 'B.'], ['A.']).map((e) => e.kind)).toEqual(['same', 'removed']);
  });
});

describe('meaningChanges', () => {
  it('negation: removed, added, swapped', () => {
    expect(meaningChanges('sq', p('Unë nuk lexoj.'), p('Unë lexoj.'))[0]).toMatch(/Removes the negation/);
    expect(meaningChanges('sq', p('Unë lexoj.'), p('Unë nuk lexoj.'))[0]).toMatch(/Adds a negation/);
    expect(meaningChanges('sq', p('Unë dua të nuk shkoj.'), p('Unë dua të mos shkoj.'))[0]).toMatch(/"nuk" becomes "mos"/);
    expect(negatorsIn('sq', p('Unë nuk lexoj.'))).toEqual(['nuk']);
  });

  it('chronology: a dropped or swapped time word', () => {
    expect(meaningChanges('sq', p('Unë lexoj tani.'), p('Unë lexoj.'))[0]).toMatch(/Drops the time word "tani"/);
    expect(meaningChanges('sq', p('Unë lexoj tani.'), p('Unë lexoj dje.'))[0]).toMatch(/"tani" becomes "dje"/);
  });

  it('key terms: believe is not know', () => {
    expect(meaningChanges('sq', p('Unë besoj Jezusin.'), p('Unë njoh Jezusin.'))[0]).toMatch(/Changes a key term/);
  });

  it('nothing is reported when nothing changed in meaning, and nothing is known for a language without tables', () => {
    expect(meaningChanges('sq', p('Unë lexoj librin.'), p('Unë lexoj librin.'))).toEqual([]);
    expect(meaningChanges('xx', p('Unë nuk lexoj.'), p('Unë lexoj.'))).toEqual([]); // no table: silent, not wrong
  });

  it('the data is plain: concept tables for the pack languages, keyed by string', () => {
    expect(NEGATORS.sq).toContain('nuk');
    expect(CHRONOLOGY.sq).toContain('tani');
    expect(CONCEPTS.believe.keyTerm).toBe(true);
    expect(conceptsForToken('sq', 'besoj')).toContain('believe');
    expect(conceptsForToken('xx', 'besoj')).toEqual([]);
  });
});

describe('checkerCoverage', () => {
  it('states the real Albanian adapter’s own support record', () => {
    const c = checkerCoverage(sqAdapter);
    expect(c).toMatch(/^GoTell's Albanian checker has limited coverage\./);
    expect(c).toMatch(/Known limits: /);
  });

  it('says so when a language has no checks, or no declared support', () => {
    expect(checkerCoverage({ ...sqAdapter, support: { ...sqAdapter.support, productionChecks: 'none' } })).toMatch(/no automatic writing checks for Albanian/);
    expect(checkerCoverage({ ...sqAdapter, support: undefined } as never)).toMatch(/has not been told what its Albanian checker covers/);
  });
});

describe('edits and repairs', () => {
  it('applyEdits refuses overlap; deleting a word takes one neighbouring space', () => {
    expect(applyEdits('a b c', [{ start: 0, end: 3, replacement: 'x' }, { start: 2, end: 5, replacement: 'y' }])).toBeUndefined();
    expect(applyEdits('Unë nuk lexoj', [{ start: 4, end: 7, replacement: '' }])).toBe('Unë lexoj');
  });

  it('applyEditsDetailed says where each edit landed', () => {
    const r = applyEditsDetailed('Unë lexon librin.', [{ start: 4, end: 9, replacement: 'lexoj' }, { start: 10, end: 16, replacement: 'libër' }])!;
    expect(r.text).toBe('Unë lexoj libër.');
    expect(r.spans.map((s) => r.text.slice(s.start, s.end))).toEqual(['lexoj', 'libër']);
    expect(applyEditsDetailed('abc', [{ start: 0, end: 5, replacement: 'x' }])).toBeUndefined();
  });

  it('planRepairs: combined when every error has a replacement, else one by one, never an unchanged text', () => {
    const t = 'Unë lexon librin.';
    const a = { suggestion: { start: 4, end: 9, replacement: 'lexoj' } };
    const b = { suggestion: { start: 10, end: 16, replacement: 'libër' } };
    expect(planRepairs(t, [a, b])).toHaveLength(1);
    expect(planRepairs(t, [a, {}])).toHaveLength(1);
    expect(planRepairs(t, [a, {}])[0].errorIndexes).toEqual([0]);
    expect(planRepairs(t, [{ suggestion: { start: 4, end: 9, replacement: 'lexon' } }])).toEqual([]);
    expect(planRepairs(t, [])).toEqual([]);
  });

  it('introducedIndexes finds the words a suggestion adds (multiset)', () => {
    const o = p('Unë lexoj.');
    const s = p('Unë lexoj librin.');
    expect(introducedIndexes(o, s).map((i) => s.tokens[i].surface)).toEqual(['librin']);
  });
});

describe('validateProposalShape', () => {
  it('accepts one short sentence with a confidence in 0..1', () => {
    expect(validateProposalShape({ suggested: ' Unë lexoj. ', explanation: ' ok ', confidence: 0.5 })).toEqual({ ok: true, proposal: { suggested: 'Unë lexoj.', explanation: 'ok', confidence: 0.5 } });
  });
  it('rejects every malformed shape with a reason', () => {
    for (const bad of [null, 3, {}, { suggested: '', explanation: '', confidence: 1 }, { suggested: 'a\nb', explanation: '', confidence: 1 }, { suggested: 'a', explanation: 5, confidence: 1 }, { suggested: 'a', explanation: '', confidence: 2 }, { suggested: 'a', explanation: '', confidence: NaN }, { suggested: 'x'.repeat(900), explanation: '', confidence: 1 }, { suggested: 'a', explanation: 'x'.repeat(500), confidence: 1 }]) {
      const r = validateProposalShape(bad);
      expect(r.ok, JSON.stringify(bad)?.slice(0, 40)).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(3);
    }
  });
});
