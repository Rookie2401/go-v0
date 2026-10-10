/** GoLearn Active: the four underline levels, read from the learner model's rows with the thresholds of levels.ts. */
import { describe, expect, it } from 'vitest';
import { ACTIVE_LEVELS, LEVEL_LEGEND, LEVEL_RULES, levelOfRow, levelOfRows } from '../../packages/golearn-extension/src/active/levels';
import type { DimView, KnowledgeView } from '../../packages/golearn-extension/src/protocol';

const dim = (over: Partial<DimView>): DimView => ({ score: 0, confidence: 0, observations: 0, positive: 0, negative: 0, ...over });
const row = (dims: KnowledgeView['dimensions']): KnowledgeView => ({ unitId: 'lemma:sq:x:NOUN', dimensions: dims });

describe('levelOfRow', () => {
  it('no row, or a row with nothing observed, is no level (no mark)', () => {
    expect(levelOfRow(undefined)).toBeUndefined();
    expect(levelOfRow(row({}))).toBeUndefined();
    expect(levelOfRow(row({ exposure: dim({ observations: 0 }) }))).toBeUndefined();
  });

  it('exposure alone is "met"', () => {
    expect(levelOfRow(row({ exposure: dim({ observations: 1 }) }))).toBe('met');
  });

  it('assisted recognition is "assisted", above mere exposure', () => {
    expect(levelOfRow(row({ exposure: dim({ observations: 5 }), assistedRecognition: dim({ observations: 1, score: 0.3 }) }))).toBe('assisted');
  });

  it(`"known" needs reading recognition ≥ ${LEVEL_RULES.known.minScore} over ≥ ${LEVEL_RULES.known.minObservations} observations; one observation or a low score stays below`, () => {
    expect(levelOfRow(row({ readingRecognition: dim({ observations: 2, score: 0.6 }) }))).toBe('known');
    expect(levelOfRow(row({ readingRecognition: dim({ observations: 1, score: 0.95 }) }))).toBe('met');
    expect(levelOfRow(row({ readingRecognition: dim({ observations: 4, score: 0.59 }) }))).toBe('met');
    expect(levelOfRow(row({ assistedRecognition: dim({ observations: 1 }), readingRecognition: dim({ observations: 4, score: 0.59 }) }))).toBe('assisted');
  });

  it(`"produced" needs productive retrieval or contextual production ≥ ${LEVEL_RULES.produced.minScore}, and outranks everything`, () => {
    expect(levelOfRow(row({ productiveRetrieval: dim({ observations: 1, score: 0.6 }) }))).toBe('produced');
    expect(levelOfRow(row({ contextualProduction: dim({ observations: 1, score: 0.7 }), readingRecognition: dim({ observations: 9, score: 0.9 }) }))).toBe('produced');
    expect(levelOfRow(row({ productiveRetrieval: dim({ observations: 3, score: 0.2 }), exposure: dim({ observations: 1 }) }))).toBe('met');
  });

  it('listening and grammar dimensions alone do not mark a word in reading', () => {
    expect(levelOfRow(row({ listeningRecognition: dim({ observations: 3, score: 0.9 }) }))).toBeUndefined();
    expect(levelOfRow(row({ grammaticalUnderstanding: dim({ observations: 3, score: 0.9 }) }))).toBeUndefined();
  });
});

describe('levelOfRows', () => {
  it('takes the highest level over the lemma row and the form row', () => {
    expect(levelOfRows([row({ exposure: dim({ observations: 1 }) }), row({ readingRecognition: dim({ observations: 2, score: 0.8 }) })])).toBe('known');
    expect(levelOfRows([undefined, undefined])).toBeUndefined();
    expect(levelOfRows([])).toBeUndefined();
  });
});

describe('the legend', () => {
  it('names every level once, in order from the faintest, and states the thresholds it uses', () => {
    expect(ACTIVE_LEVELS).toEqual(['met', 'assisted', 'known', 'produced']);
    for (const l of ACTIVE_LEVELS) { expect(LEVEL_LEGEND[l].title).toBeTruthy(); expect(LEVEL_LEGEND[l].style).toBeTruthy(); }
    expect(LEVEL_LEGEND.known.detail).toContain(String(LEVEL_RULES.known.minScore));
    expect(LEVEL_LEGEND.known.detail).toContain(`${LEVEL_RULES.known.minObservations}+`);
  });
});
