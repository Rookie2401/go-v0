/**
 * The card's word analysis for Arabic (src/adapters/arabic/word-analysis.ts): the English of a verb form, a form that is two cells at
 * once told as both, and the expanded analysis. Marks are built from the named constants.
 */
import { describe, expect, it } from 'vitest';
import { arInflectedMeaning, arVerbCells, arabicWordAnalysis } from '../../src/adapters/arabic/word-analysis';
import { DAMMA, FATHA, SUKUN } from '../../src/adapters/arabic/text';

const kataba = `ك${FATHA}ت${FATHA}ب${FATHA}`;
const taktubu = `ت${FATHA}ك${SUKUN}ت${DAMMA}ب${DAMMA}`;

describe('arVerbCells', () => {
  it('pairs person with the right gender: the imperfect is she or you (m.), never "you (f.)" or "he"', () => {
    const cells = arVerbCells({ Aspect: 'Imp', Mood: 'Ind', Voice: 'Act', Person: '2,3', Gender: 'Fem,Masc', Number: 'Sing' });
    expect(cells.map((c) => `${c.Person}${c.Gender ?? ''}`)).toEqual(['3Fem', '2Masc']);
  });
  it('the unvocalized perfect كتبت is I, she, you (m.) and you (f.)', () => {
    const cells = arVerbCells({ Aspect: 'Perf', Voice: 'Act', Person: '1,2,3', Gender: 'Fem,Masc', Number: 'Sing' });
    expect(cells.map((c) => `${c.Person}${c.Gender ?? ''}`)).toEqual(['1', '3Fem', '2Masc', '2Fem']);
  });
  it('a reading with no union is one cell, and an unknown union is left whole', () => {
    expect(arVerbCells({ Aspect: 'Perf', Person: '3', Gender: 'Masc', Number: 'Sing' })).toHaveLength(1);
    const odd = arVerbCells({ Aspect: 'Imp', Person: '1,3', Number: 'Plur' });
    expect(odd).toHaveLength(1);
    expect(odd[0].Person).toBe('1,3');
  });
});

describe('the English of a form', () => {
  it('writes the perfect as a past and the imperfect as a present, from the citation', () => {
    expect(arInflectedMeaning({ Aspect: 'Perf', Voice: 'Act', Person: '3', Gender: 'Masc', Number: 'Sing' }, 'to write')).toBe('He wrote');
    expect(arInflectedMeaning({ Aspect: 'Imp', Mood: 'Ind', Voice: 'Act', Person: '3', Gender: 'Masc', Number: 'Plur' }, 'to write')).toBe('They write');
    expect(arInflectedMeaning({ Aspect: 'Perf', Voice: 'Pass', Person: '3', Gender: 'Masc', Number: 'Sing' }, 'to write')).toMatch(/^(He|It) was written$/);
    expect(arInflectedMeaning({ Mood: 'Imp', Voice: 'Act', Person: '2', Gender: 'Masc', Number: 'Sing' }, 'to say')).toMatch(/^Say/);
  });
  it('says both cells of a form that is two at once', () => {
    const text = arInflectedMeaning({ Aspect: 'Imp', Mood: 'Ind', Voice: 'Act', Person: '2,3', Gender: 'Fem,Masc', Number: 'Sing' }, 'to write');
    expect(text).toBe('She writes / you write');
  });
  it('writes nothing when the features do not describe one form, or the citation is not a verb phrase', () => {
    expect(arInflectedMeaning({ Aspect: 'Imp,Perf', Person: '3', Number: 'Sing' }, 'to write')).toBeUndefined();
    expect(arInflectedMeaning({ Aspect: 'Perf', Person: '3', Gender: 'Masc', Number: 'Sing' }, undefined)).toBeUndefined();
  });
});

describe('arabicWordAnalysis', () => {
  it('keeps the two cells of تَكْتُبُ as ONE reading whose English names both, with no "other reading" that pairs the wrong gender', () => {
    const a = arabicWordAnalysis({ surface: taktubu, lemma: kataba, pos: 'VERB', lemmaGloss: 'to write', morph: { Aspect: 'Imp', Mood: 'Ind', Voice: 'Act', Person: '2,3', Gender: 'Fem,Masc', Number: 'Sing' }, confidence: 0.9 });
    expect(a.language).toBe('ar');
    expect(a.inflectedMeaning?.text).toBe('She writes / you write');
    expect(a.ambiguity).toEqual([]);
    expect(a.grammaticalFeatures.find((f) => f.key === 'Person')?.value).toBe('2/3');
    expect(a.formAnalysis?.lines.some((l) => l.key === 'agreement')).toBe(true);
  });
  it('gives a noun its lemma meaning and no invented form meaning', () => {
    const a = arabicWordAnalysis({ surface: 'كتاب', lemma: `كِت${FATHA}اب`, pos: 'NOUN', lemmaGloss: 'book', morph: { Number: 'Sing' }, confidence: 0.7 });
    expect(a.lexicalMeaning?.text).toBe('book');
    expect(a.inflectedMeaning).toBeNull();
  });
  it('says an attached object and a leading "and"', () => {
    const a = arabicWordAnalysis({
      surface: 'وكتبه', lemma: kataba, pos: 'VERB', lemmaGloss: 'to write', confidence: 0.6,
      morph: { Aspect: 'Perf', Voice: 'Act', Person: '3', Gender: 'Masc', Number: 'Sing' },
      parts: [{ text: 'و', role: 'and', pos: 'CONJ', lemma: 'و' }, { text: 'كتب', role: 'stem' }, { text: 'ه', role: 'him / it', pos: 'PRON', morph: { Person: '3', Gender: 'Masc', Number: 'Sing' } }],
    });
    expect(a.inflectedMeaning?.text).toBe('And he wrote him/it');
    expect(a.formAnalysis?.components.map((c) => c.role)).toEqual(['and', 'stem', 'him / it']);
  });
});
