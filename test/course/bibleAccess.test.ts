import { describe, expect, it } from 'vitest';
import { BIBLE_ACCESS, bibleAccessFor } from '../../src/course/bibleAccess';

describe('Bible access registry', () => {
  it('covers the course languages with one explicit route each', () => {
    expect(Object.keys(BIBLE_ACCESS).sort()).toEqual(['de', 'el', 'es', 'he', 'hi', 'la', 'nb', 'nn', 'sq', 'th']);
    for (const access of Object.values(BIBLE_ACCESS)) {
      expect(access.sourceUrl).toMatch(/^https:\/\//);
      expect(access.method.length).toBeGreaterThan(20);
      expect(access.importMethod.length).toBeGreaterThan(20);
    }
  });

  it('keeps Albanian personal-copy access separate from the bundled editions', () => {
    expect(bibleAccessFor('sq')).toMatchObject({ status: 'linked-online', edition: 'AL' });
    expect(bibleAccessFor('sq').historicalVarieties).toEqual(['Gheg (Kristoforidhi)', 'Tosk (Kristoforidhi)']);
    expect(Object.values(BIBLE_ACCESS).filter((x) => x.status === 'bundled')).toHaveLength(5);
  });
});
