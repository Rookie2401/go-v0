import { describe, expect, it } from 'vitest';
import { CONCEPTS, conceptsForToken, diffSentences, englishConcepts, lexemesFor, tagSection } from '../../src/gotell';
import { LANGUAGES } from '../../src/core';
import type { LanguageCode } from '../../src/core';

describe('concept tables', () => {
  it('match key terms by stem/form per language (Latin, Thai substring, Devanagari)', () => {
    expect(conceptsForToken('es', 'perdonó')).toContain('forgive');
    expect(conceptsForToken('es', 'arrepentí')).toContain('repent');
    expect(conceptsForToken('es', 'creo')).toEqual(['believe']);
    expect(conceptsForToken('es', 'sé')).toEqual(['know']);
    expect(conceptsForToken('es', 'crear')).toEqual([]); // no false positive on the "cre-" stem
    expect(conceptsForToken('es', 'x', 'conocer')).toContain('know'); // via lemma
    expect(conceptsForToken('de', 'vergeben')).toContain('forgive');
    expect(conceptsForToken('de', 'Schuld'.toLowerCase())).toContain('guilt');
    expect(conceptsForToken('th', 'พระคุณ')).toContain('grace');
    expect(conceptsForToken('th', 'ความผิด')).toContain('guilt');
    expect(conceptsForToken('hi', 'पाप')).toContain('sin');
    expect(conceptsForToken('hi', 'क्षमा')).toContain('forgive');
    expect(conceptsForToken('sq', 'mëkatet')).toContain('sin');
  });

  it('every language covers the ten key terms from the plan', () => {
    const plan = ['know', 'believe', 'trust', 'repent', 'regret', 'guilt', 'conviction', 'salvation', 'forgive', 'grace'] as const;
    for (const lang of LANGUAGES as readonly LanguageCode[]) {
      for (const c of plan) {
        expect(CONCEPTS[c].keyTerm).toBe(true);
        expect(lexemesFor(lang, c).length, `${lang}:${c}`).toBeGreaterThan(0);
      }
    }
  });

  it('English intent words map to concepts in order of appearance, without substring false positives', () => {
    expect(englishConcepts('I knew Jesus but did not understand my sin').map((c) => c.concept)).toEqual(['know', 'jesus', 'understand', 'sin']);
    expect(englishConcepts('since singing is single').map((c) => c.concept)).toEqual([]);
  });

  it('section tagging: highest concept weight wins, confidence is derived from the evidence, none without evidence', () => {
    const t = (...ws: string[]) => ws.map((w) => ({ normalized: w }));
    expect(tagSection('es', t('me', 'arrepentí'))).toEqual({ section: 'repentance', confidence: 1 });
    expect(tagSection('es', t('la', 'casa'))).toBeUndefined();
    const mixed = tagSection('es', t('joven', 'jesús'))!; // childhood 2 vs knowledge 1
    expect(mixed.section).toBe('childhood');
    expect(mixed.confidence).toBeCloseTo((2 / 3) * 1, 2);
  });
});

describe('diffSentences', () => {
  it('pairs runs into changed and keeps unmatched ones as added/removed', () => {
    expect(diffSentences(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
      { kind: 'same', a: 'a', b: 'a' }, { kind: 'changed', a: 'b', b: 'x' }, { kind: 'same', a: 'c', b: 'c' },
    ]);
    expect(diffSentences(['a'], ['a', 'b', 'c'])).toEqual([{ kind: 'same', a: 'a', b: 'a' }, { kind: 'added', b: 'b' }, { kind: 'added', b: 'c' }]);
    expect(diffSentences(['a', 'b'], [])).toEqual([{ kind: 'removed', a: 'a' }, { kind: 'removed', a: 'b' }]);
    expect(diffSentences([], [])).toEqual([]);
  });
});
