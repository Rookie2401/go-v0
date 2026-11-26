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
