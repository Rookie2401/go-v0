import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeMorphGnt } from '../../src/adapters/greek/morphgnt';
import type { GreekFormIndex } from '../../src/adapters/greek/index-store';
import { greekInflectedMeaning, greekWordAnalysis } from '../../src/adapters/greek/word-analysis';

const morph = (tense: string, person = '1', number = 'Sing') => ({ VerbForm: 'Fin', Tense: tense, Voice: 'Act', Mood: 'Ind', Person: person, Number: number });
const fullIndexPath = 'public/lexicon/el/koine-index.json';
const hasFullIndex = existsSync(fullIndexPath);
const fullIndex = hasFullIndex ? JSON.parse(readFileSync(fullIndexPath, 'utf8')) as GreekFormIndex : undefined;

describe('Greek finite verb English realization', () => {
  it('uses supplied analyzer features and a simple citation gloss, preserving citation and lexical meanings separately', () => {
    const result = greekWordAnalysis({ surface: 'Ἀγαπήσεις', lemma: 'ἀγαπάω', lemmaGloss: 'I love', morph: morph('Fut', '2') });
    expect(result.inflectedMeaning?.text).toBe('You will love');
    expect(result.lexicalMeaning?.text).toBe('to love');
  });

  it('realizes person, number, and present/future only for supported finite active indicative features', () => {
    const samples: Array<[string, string, string, string, string]> = [
      ['x', 'Pres', '1', 'Sing', 'I love'], ['x', 'Pres', '2', 'Sing', 'You love'],
      ['x', 'Pres', '3', 'Sing', 'He, she, or it loves'], ['x', 'Pres', '1', 'Plur', 'We love'],
      ['x', 'Pres', '2', 'Plur', 'You love'], ['x', 'Pres', '3', 'Plur', 'They love'],
      ['x', 'Fut', '1', 'Sing', 'I will love'], ['x', 'Fut', '2', 'Sing', 'You will love'],
      ['x', 'Fut', '3', 'Sing', 'He, she, or it will love'], ['x', 'Fut', '1', 'Plur', 'We will love'],
      ['x', 'Fut', '2', 'Plur', 'You will love'], ['x', 'Fut', '3', 'Plur', 'They will love'],
    ];
    for (const [surface, tense, person, number, expected] of samples) {
      expect(greekInflectedMeaning(surface, 'ἀγαπάω', morph(tense, person, number), 'I love')).toBe(expected);
    }
  });

  it('uses an explicit irregular English third-person form and a source gloss for an unlisted lemma', () => {
    expect(greekInflectedMeaning('ἔχει', 'ἔχω', morph('Pres', '3'), 'I have')).toBe('He, she, or it has');
    expect(greekInflectedMeaning('πιστεύει', 'πιστεύω', morph('Pres', '3'), 'I believe')).toBe('He, she, or it believes');
  });

  it('rejects unsupported tense, mood, voice, person, number, missing features, blank surface, and unsafe glosses', () => {
    const unknowns = [
      greekInflectedMeaning('x', 'ἀγαπάω', morph('Aor'), 'I love'),
      greekInflectedMeaning('x', 'ἀγαπάω', { ...morph('Pres'), Mood: 'Sub' }, 'I love'),
      greekInflectedMeaning('x', 'ἀγαπάω', { ...morph('Pres'), Voice: 'Mid' }, 'I love'),
      greekInflectedMeaning('x', 'ἀγαπάω', { ...morph('Pres'), Person: '0' }, 'I love'),
      greekInflectedMeaning('x', 'ἀγαπάω', { ...morph('Pres'), Number: 'Dual' }, 'I love'),
      greekInflectedMeaning('x', 'ἀγαπάω', { VerbForm: 'Fin', Tense: 'Pres', Voice: 'Act', Mood: 'Ind', Number: 'Sing' }, 'I love'),
      greekInflectedMeaning('', 'ἀγαπάω', morph('Pres'), 'I love'),
      greekInflectedMeaning('x', 'ἀγαπάω', morph('Pres'), 'I will'),
      greekInflectedMeaning('x', 'ἀγαπάω', morph('Pres'), 'I can'),
      greekInflectedMeaning('x', 'ἀγαπάω', morph('Pres'), 'I am'),
      greekInflectedMeaning('x', 'ἀγαπάω', morph('Pres'), 'I love; I greet'),
      greekWordAnalysis({ surface: 'ἀγαπῶ', lemma: 'ἀγαπάω', pos: 'NOUN', lemmaGloss: 'I love', morph: morph('Pres') }).inflectedMeaning?.text,
    ];
    expect(unknowns).toEqual(Array(unknowns.length).fill(undefined));
  });

  it('does not manufacture an ambiguity from semantically duplicate analyzer candidates', () => {
    const base = morph('Fut', '2');
    const result = greekWordAnalysis({ surface: 'ἀγαπήσεις', lemma: 'ἀγαπάω', lemmaGloss: 'I love', morph: base,
      alternatives: [{ morph: { ...base } }, { morph: { ...base, VerbForm: undefined as unknown as string } }] });
    expect(result.inflectedMeaning?.text).toBe('You will love');
    expect(result.ambiguity).toEqual([]);
  });

  it('retains a genuinely different mood analysis as an alternative', () => {
    const result = greekWordAnalysis({ surface: 'ἀγαπῶ', lemma: 'ἀγαπάω', pos: 'VERB', lemmaGloss: 'I love', morph: morph('Pres'),
      alternatives: [{ morph: { ...morph('Pres'), Mood: 'Sub' } }] });
    expect(result.inflectedMeaning?.text).toBe('I love');
    expect(result.ambiguity).toContain('I love');
    expect(result.ambiguity.some((meaning) => meaning.includes('Mood=Sub'))).toBe(true);
  });

  it.skipIf(!hasFullIndex)('realizes supported readings from the full index and leaves compound glosses unknown', () => {
    const picks = [
      ['ἀγαπάω', 'ἀγαπήσεις', 'Fut', '2', 'Sing', 'You will love'],
      ['γράφω', 'γράψω', 'Fut', '1', 'Sing', 'I will write'],
      ['ἀγοράζω', 'ἀγοράζει', 'Pres', '3', 'Sing', 'He, she, or it buys'],
    ] as const;
    for (const [lemma, form, tense, person, number, expected] of picks) {
      const rows = fullIndex!.forms[form];
      const row = rows?.find(([id, code]) => id === lemma && decodeMorphGnt(code, lemma).morph.Tense === tense && decodeMorphGnt(code, lemma).morph.Person === person && decodeMorphGnt(code, lemma).morph.Number === number);
      expect(row, `${form} should be an indexed MorphGNT reading`).toBeDefined();
      const reading = decodeMorphGnt(row![1], lemma);
      const gloss = fullIndex!.lemmas[lemma]?.[1];
      expect(greekInflectedMeaning(form, lemma, reading.morph, gloss)).toBe(expected);
    }
    const have = fullIndex!.forms['ἔχει'].find(([id, code]) => id === 'ἔχω' && decodeMorphGnt(code, id).morph.Tense === 'Pres' && decodeMorphGnt(code, id).morph.Person === '3');
    expect(have).toBeDefined();
    expect(greekInflectedMeaning('ἔχει', 'ἔχω', decodeMorphGnt(have![1], 'ἔχω').morph, fullIndex!.lemmas['ἔχω'][1])).toBeUndefined();
    const gal = greekWordAnalysis({ surface: 'ἀγαπήσεις', lemma: 'ἀγαπάω', lemmaGloss: fullIndex!.lemmas['ἀγαπάω'][1], morph: morph('Fut', '2'), references: ['GAL.5.14'] });
    expect(gal.inflectedMeaning?.text).toBe('You will love');
    expect(gal.contextualMeaning?.text).toBe('You shall love');
  });
});
