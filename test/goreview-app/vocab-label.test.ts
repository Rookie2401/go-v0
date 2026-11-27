// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { vocabLabel } from '../../packages/goreview/app/deckModel';

describe('the word a vocabulary row shows', () => {
  it('is the unit’s label, or the word inside the id; never the id itself', () => {
    expect(vocabLabel('مَدِينَة', 'lemma:ar:مَدِينَة:NOUN')).toBe('مَدِينَة');
    expect(vocabLabel(undefined, 'lemma:ar:أسبوع:NOUN')).toBe('أسبوع');
    expect(vocabLabel('', 'form:ar:كتب')).toBe('كتب');
    expect(vocabLabel('lemma:ar:أسبوع:NOUN', 'lemma:ar:أسبوع:NOUN')).toBe('أسبوع');
    expect(vocabLabel('form:ru:книга', 'form:ru:книга')).toBe('книга');
    expect(vocabLabel('book: a thing', 'lemma:en:x:NOUN')).toBe('book: a thing');
  });
});

describe('the vocabulary screen', () => {
  it('titles a unit with no label by the word inside its id (Arabic: with its vowels), never by the id', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../packages/goreview/app/screens/vocabulary.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/const title = displayLemma\(item\.unit\?\.languageId \?\? activeIdentity\.languageId, vocabLabel\(item\.unit\?\.label, unitId\)\)/); // Korean's displayLemma around Arabic's vocabLabel
    expect(src).not.toMatch(/item\.unit\?\.label \|\| unitId/);
  });
});
