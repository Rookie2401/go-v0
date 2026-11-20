import { describe, expect, it } from 'vitest';
import { morphologyLine } from '../../src/golearn/analysis';

describe('generic morphology line', () => {
  it('keeps every analyser feature available when a pack has no readable description', () => {
    expect(morphologyLine({
      pos: 'NOUN',
      morph: { Case: 'Acc', Definite: 'Def', Gender: 'Fem', Number: 'Sing' },
    })).toBe('noun · fem · acc · def · sg');
  });

  it('falls back to the part of speech when the analyser has no features', () => {
    expect(morphologyLine({ pos: 'VERB', morph: {} })).toBe('verb');
  });
});
