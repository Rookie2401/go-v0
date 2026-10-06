import { describe, expect, it } from 'vitest';
import { analyzeStageTransition, type StageExposure } from '../../src/course/transitionAnalysis';
const exposure = (over: Partial<StageExposure> = {}): StageExposure => ({ stageId: 's1', lang: 'de', publishedTexts: 10,
  publishedWorks: 10, tokens: 1000, medianWorkLength: 100, forms: { haus: 10 }, lemmas: { haus: 10 },
  patterns: { present: 10 }, genres: ['narrative'], registers: ['standard'], orthographies: ['current'], analysedTokenShare: 1, ...over });
describe('curriculum transition diagnostics', () => {
  it('does not disguise an unavailable next stage', () => {
    expect(analyzeStageTransition(exposure(), exposure({ stageId: 's2', publishedTexts: 0 })).risk).toBe('broken');
  });
  it('explains simultaneous vocabulary, length, grammar and historical-register jumps', () => {
    const result = analyzeStageTransition(exposure(), exposure({ stageId: 's2', medianWorkLength: 800,
      lemmas: { haus: 69, fremd: 31 }, patterns: { relative: 10 }, registers: ['archaic'] }));
    expect(result.risk).toBe('high'); expect(result.newLemmaDensity).toBe(.31);
    expect(result.reasons.join(' ')).toMatch(/8.0×/); expect(result.reasons.join(' ')).toMatch(/constructions/);
    expect(result.reasons.join(' ')).toMatch(/archaic/);
  });
  it('reports missing analyses as uncertainty and never compares unlike languages', () => {
    expect(analyzeStageTransition(exposure(), exposure({ lemmas: {}, patterns: {}, analysedTokenShare: 0 })).newLemmaDensity).toBeNull();
    expect(() => analyzeStageTransition(exposure(), exposure({ lang: 'th' }))).toThrow(/one language/);
  });
});
