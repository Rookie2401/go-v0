import { describe, expect, it } from 'vitest';
import { fallbackMorphologyLine } from '../../packages/golearn-extension/src/parser/morphology';

describe('extension parser morphology fallback', () => {
  it('keeps each available feature when a pack cannot describe a form', () => {
    expect(fallbackMorphologyLine('NOUN', { Case: 'Acc', Definite: 'Def', Gender: 'Fem', Number: 'Sing' }))
      .toBe('noun · fem · acc · def · sg');
    expect(fallbackMorphologyLine('VERB', { Person: '1', Number: 'Sing', Tense: 'Past' }))
      .toBe('verb · 1sg · past');
  });

  it('returns the part of speech alone when no features are present', () => {
    expect(fallbackMorphologyLine('VERB', {})).toBe('verb');
    expect(fallbackMorphologyLine(undefined, {})).toBeUndefined();
  });
});
