/**
 * What an Arabic lemma card may take from the dictionary (src/adapters/arabic/answers.ts): senses of ONE headword only, and only alternatives that are meanings.
 * The samples are the bad answers an independent reader found on the second text (2026-11-26).
 */
import { describe, expect, it } from 'vitest';
import { arCleanSense, arUnitRecords, isFragmentAlternative } from '../../src/adapters/arabic/answers';

const same = (a: string, b: string): boolean => a === b || (['VERB', 'AUX'].includes(a) && ['VERB', 'AUX'].includes(b)) || (['NOUN', 'PROPN'].includes(a) && ['NOUN', 'PROPN'].includes(b));
const rec = (head: string, p: string, ...gs: string[]) => ({ p, f: [{ f: head, t: ['canonical'] }], s: gs.map((g) => ({ g })) });

describe('class (a): one headword, by the vocalized head and the part of speech', () => {
  const AB = 'أَب', ABB = 'أَبّ';
  const BALAGHA = 'بَلَغَ', BALLAGHA = 'بَلَّغَ';
  const HUMA = 'هُمَا', BOUND = 'ـهُمَا';
  it('a doubled consonant is another word: أَب is not أَبّ, بَلَغَ is not بَلَّغَ', () => {
    expect(arUnitRecords([rec(AB, 'NOUN', 'father'), rec(ABB, 'NOUN', 'fodder')], AB, 'NOUN', same).map((r) => r.s![0].g)).toEqual(['father']);
    expect(arUnitRecords([rec(BALAGHA, 'VERB', 'to reach'), rec(BALLAGHA, 'VERB', 'to inform')], BALAGHA, 'VERB', same).map((r) => r.s![0].g)).toEqual(['to reach']);
  });
  it('a bound form (a leading dash) and another part of speech are other headwords; a record with no canonical head gives nothing', () => {
    expect(arUnitRecords([rec(HUMA, 'PRON', 'they both'), rec(BOUND, 'PRON', 'them, their')], HUMA, 'PRON', same).map((r) => r.s![0].g)).toEqual(['they both']);
    expect(arUnitRecords([rec(AB, 'VERB', 'x')], AB, 'NOUN', same)).toEqual([]);
    expect(arUnitRecords([{ p: 'NOUN', s: [{ g: 'x' }] }], AB, 'NOUN', same)).toEqual([]);
  });
});

describe('class (b): only meanings', () => {
  it.each([
    'In reduplication, expresses English each other', 'plural', 'plural: شرط', 'verbal noun of مسح', 'geodesy etc.',
    'enjoined: followed by على', 'the lift(s).', 'them .', 'plural of x', 'used to indicate order', 'as in alternative questions', 'indicates a suggestion',
  ])('is cleaned away or of its fragment: %s', (sense) => {
    const out = arCleanSense(sense);
    expect(out).not.toMatch(/\p{Script=Arabic}|:|etc\b|\s\.|^plural$|reduplication/iu);
  });
  it('keeps what is a meaning, and drops only the fragment among them', () => {
    expect(arCleanSense('some, part')).toBe('some, part');
    expect(arCleanSense('art of surveying, verbal noun of مَسَحَ, geometry, geodesy etc.')).toBe('art of surveying, geometry');
    expect(arCleanSense('the sky/skies; the heaven(s), space, the lift(s).')).toBe('the sky/skies; the heaven(s), space, the lift(s)');
    expect(arCleanSense('to be necessary, have to be; must')).toBe('to be necessary, have to be; must');
    expect(isFragmentAlternative('3.5 mm jack')).toBe(false);
    expect(isFragmentAlternative('in the morning')).toBe(false);
  });
});
