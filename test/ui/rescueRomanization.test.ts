/**
 * The romanization rescue and the part-of-speech wording of the word sheet (pure helpers in src/ui/reader/assistance.ts).
 * With the real Hindi adapter: a word is romanized as a word ("ghar"), never as its written units joined ("gha-r").
 */
import { describe, expect, it } from 'vitest';
import type { SyllableAnalysis } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { posWord, rescueRomanization } from '../../src/ui/reader/assistance';

const unit = (text: string, romanization: string | undefined, ending?: SyllableAnalysis['ending']): SyllableAnalysis =>
  ({ text, romanization, confidence: 0.9, ...(ending !== undefined ? { ending } : {}) }) as SyllableAnalysis;

describe('rescueRomanization', () => {
  it('syllables (units that state an ending) are joined with a hyphen, and the whole-word romanization is not asked for', () => {
    let asked = 0;
    const r = rescueRomanization([unit('แม่', 'mâe', 'live'), unit('น้ำ', 'náam', 'live')], () => { asked++; return 'x'; });
    expect(r).toBe('mâe-náam');
    expect(asked).toBe(0);
  });

  it('written units that are not syllables give the word as a whole when the adapter has it', () => {
    expect(rescueRomanization([unit('घ', 'gha'), unit('र', 'r')], () => 'ghar')).toBe('ghar');
  });

  it('falls back to the joined units, then to the notes, then to nothing', () => {
    expect(rescueRomanization([unit('घ', 'gha'), unit('र', 'r')], () => undefined)).toBe('gha-r');
    expect(rescueRomanization([unit('घ', undefined)], () => undefined, 'ghar')).toBe('ghar');
    expect(rescueRomanization([unit('घ', undefined)], () => undefined)).toBeUndefined();
    expect(rescueRomanization([], () => 'x', undefined)).toBeUndefined();
  });

  it('with the real Hindi adapter: घर is "ghar", किताब is "kitāb", and a word the rules are unsure of gets no romanization', () => {
    const hi = createAdapterRegistry().get('hi');
    const of = (word: string) => {
      const tok = hi.tokenize(word)[0];
      return rescueRomanization(hi.decode!(word), () => hi.pronunciation(tok).transliteration);
    };
    expect(of('घर')).toBe('ghar');
    expect(of('किताब')).toBe('kitāb');
    expect(of('लड़का')).not.toMatch(/-/);
    for (const u of hi.decode!('घर')) expect(u.ending).toBeUndefined(); // akṣaras are not syllables
  });
});

describe('posWord', () => {
  it('says the tags a learner would not recognise in plain words and leaves the familiar ones', () => {
    expect(posWord('NOUN')).toBe('noun');
    expect(posWord('VERB')).toBe('verb');
    expect(posWord('PROPN')).toBe('name');
    expect(posWord('AUX')).toBe('helping verb');
    expect(posWord('ADP')).toBe('preposition or postposition');
    expect(posWord('SCONJ')).toMatch(/conjunction/);
    expect(posWord('PART')).toBe('particle');
  });
});
