/**
 * GoReview's own setup (#/setup) lists languages from packages/goreview/app/languageChoices.ts, a copy of GoLearn setup's view
 * (packages/golearn-extension/app/languages.ts): GoReview may not import from the extension (test/audit/conformance.structure.test.ts).
 * This keeps the two lists identical, so a learner sees the same languages, names, levels and choices in both setups.
 */
import { describe, expect, it } from 'vitest';
import { languagesOf as golearnLanguages, levelWords as golearnLevelWords } from '../../packages/golearn-extension/app/languages';
import { languagesOf as goreviewLanguages, levelWords as goreviewLevelWords } from '../../packages/goreview/app/languageChoices';

describe("GoReview's language list mirrors GoLearn setup's", () => {
  it('gives the same rows, in the same order, with the same choices', () => {
    expect(goreviewLanguages()).toEqual(golearnLanguages());
  });

  it('says the same words for every level', () => {
    for (const level of ['planned', 'experimental', 'reference'] as const) {
      for (const validation of ['production-validated', 'incomplete', 'machine-drafted', 'none']) {
        expect(goreviewLevelWords(level as never, validation), `${level}/${validation}`).toBe(golearnLevelWords(level as never, validation));
      }
    }
  });
});
