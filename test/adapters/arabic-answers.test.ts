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

describe('second pass (the fresh text, 2026-11-26)', () => {
  it('an open-class word drops a bare function word cut from a list, the examples after "e.g.", and a grammar description', () => {
    expect(arCleanSense('to become acquainted, with, to meet')).toBe('to become acquainted, to meet');
    expect(arCleanSense('(with فَ (fa, "then")) and then, and; thereupon, whereupon')).not.toMatch(/(^|, |; )and$/u);
    expect(arCleanSense('to break, break apart, tear, snap (intransitive), e.g., a rope, a string)')).toBe('to break, break apart, tear, snap (intransitive)');
    expect(arCleanSense('having a copulative effect, usually inserted when both the مُبْتَدَأ and خَبَر are definite.')).toBe('');
  });
  it('a closed-class word keeps its function words (with, in, to are its meanings)', () => {
    expect(arCleanSense('with, together with', { functionWords: false })).toBe('with, together with');
  });
  it('transliterated English names of a thing are GENUINE and kept: qanun, kanoon, ganoun (the instrument), husainiya', () => {
    expect(arCleanSense('qanun, kanoon, or ganoun (a musical instrument similar to a zither)')).toContain('qanun');
    expect(arCleanSense('husainiya')).toBe('husainiya');
  });
});

describe('each item of a sense is judged on its own', () => {
  it('a long item is dropped, the short ones of the same sense stay: صَبَاح gives "morning"', () => {
    expect(arCleanSense('the time from sunrise to noon, morning')).toBe('morning');
    expect(arCleanSense('the time from morning twilight to sunrise, dayspring')).toBe('dayspring');
    expect(arCleanSense('the time from sunrise to noon')).toBe('the time from sunrise to noon');
  });
  it('prose with a capitalised item is not cut into a list', () => {
    expect(arCleanSense('a city in the north of Egypt, Africa')).toBe('a city in the north of Egypt, Africa');
  });
});

describe('two mechanical filters (batch 11)', () => {
  it('drops an alternative with a quotation mark, and one that begins "forms the" or "being"', () => {
    expect(arCleanSense('master, \u201Cprincess, lady')).toBe('master, lady');
    expect(arCleanSense('title, "anything that serves as an indication"')).toBe('title');
    expect(arCleanSense('to be, forms the past perfect, past continuous')).toBe('to be, past continuous');
    expect(arCleanSense('cold, being later occurring, chill')).toBe('cold, chill');
    expect(arCleanSense("don't, can't")).toBe("don't, can't");
  });
});

describe('batch 13: a lost opening bracket, and "or ..." continuations', () => {
  it('a sense with a closing bracket and no opening one keeps only its first item', () => {
    expect(arCleanSense('to stay away, fail to arrive or appear yield, success, supplies, etc)')).toBe('to stay away');
    expect(arCleanSense('to cover (an event, an occasion), to describe')).toBe('to cover (an event, an occasion), to describe');
  });
  it('an alternative that begins with "or" or "and" is a continuation, not a meaning', () => {
    expect(arCleanSense('to hold close, or loving, communion')).toBe('to hold close, communion');
  });
});
