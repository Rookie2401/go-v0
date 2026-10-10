/** GoLearn Active: the six knowledge levels (new, seen, recognized, familiar, known, automatic), read from the learner model's rows with the thresholds of levels.ts. */
import { describe, expect, it } from 'vitest';
import { ACTIVE_LEVELS, LEVEL_LEGEND, LEVEL_RULES, encountersOfRows, levelOfRow, levelOfRows } from '../../packages/golearn-extension/src/active/levels';
import { KNOWLEDGE_LEVELS, KNOWLEDGE_LEVEL_WORDS } from '../../packages/repository-contract/src/knowledge-levels';
import type { DimView, KnowledgeView } from '../../packages/golearn-extension/src/protocol';

const dim = (over: Partial<DimView>): DimView => ({ score: 0, confidence: 0, observations: 0, positive: 0, negative: 0, ...over });
const row = (dims: KnowledgeView['dimensions'], over: Partial<KnowledgeView> = {}): KnowledgeView => ({ unitId: 'lemma:sq:x:NOUN', dimensions: dims, ...over });

describe('levelOfRow', () => {
  it('no row is no level (the word is then "new" by the rows rule below); a row with nothing observed is new', () => {
    expect(levelOfRow(undefined)).toBeUndefined();
    expect(levelOfRow(row({}))).toBe('new');
    expect(levelOfRow(row({ exposure: dim({ observations: 0 }) }))).toBe('new');
  });

  it('exposure alone is "seen"; so is any other observation that shows nothing about reading (listening, grammar)', () => {
    expect(levelOfRow(row({ exposure: dim({ observations: 1 }) }))).toBe('seen');
    expect(levelOfRow(row({ listeningRecognition: dim({ observations: 3, score: 0.9 }) }))).toBe('seen');
    expect(levelOfRow(row({ grammaticalUnderstanding: dim({ observations: 3, score: 0.9 }) }))).toBe('seen');
  });

  it('assisted recognition, or reading recognition observed once, is "recognized"', () => {
    expect(levelOfRow(row({ exposure: dim({ observations: 5 }), assistedRecognition: dim({ observations: 1, score: 0.3 }) }))).toBe('recognized');
    expect(levelOfRow(row({ readingRecognition: dim({ observations: 1, score: 0.4 }) }))).toBe('recognized');
    expect(levelOfRow(row({ readingRecognition: dim({ observations: 1, score: 0.95 }) }))).toBe('recognized'); // one observation is not yet "familiar"
  });

  it(`"familiar" needs reading recognition ≥ ${LEVEL_RULES.familiar.minScore} over ≥ ${LEVEL_RULES.familiar.minObservations} observations; a lower score stays "recognized"`, () => {
    expect(levelOfRow(row({ readingRecognition: dim({ observations: 2, score: 0.6 }) }))).toBe('familiar');
    expect(levelOfRow(row({ readingRecognition: dim({ observations: 3, score: 0.79 }) }))).toBe('familiar');
    expect(levelOfRow(row({ readingRecognition: dim({ observations: 4, score: 0.59 }) }))).toBe('recognized');
  });

  it(`"known" needs reading recognition ≥ ${LEVEL_RULES.known.minScore} over ≥ ${LEVEL_RULES.known.minObservations} observations`, () => {
    expect(levelOfRow(row({ readingRecognition: dim({ observations: 4, score: 0.8 }) }))).toBe('known');
    expect(levelOfRow(row({ readingRecognition: dim({ observations: 3, score: 0.95 }) }))).toBe('familiar');
  });

  it(`"automatic" needs productive retrieval or contextual production ≥ ${LEVEL_RULES.automatic.minScore} over ≥ ${LEVEL_RULES.automatic.minObservations} observations, and outranks everything`, () => {
    expect(levelOfRow(row({ productiveRetrieval: dim({ observations: 2, score: 0.7 }) }))).toBe('automatic');
    expect(levelOfRow(row({ contextualProduction: dim({ observations: 2, score: 0.9 }), readingRecognition: dim({ observations: 9, score: 0.9 }) }))).toBe('automatic');
    expect(levelOfRow(row({ productiveRetrieval: dim({ observations: 1, score: 0.9 }), exposure: dim({ observations: 1 }) }))).toBe('seen');
    expect(levelOfRow(row({ productiveRetrieval: dim({ observations: 3, score: 0.2 }), exposure: dim({ observations: 1 }) }))).toBe('seen');
  });

  it('a level the engine sent is used as it stands, whatever the dimensions say', () => {
    expect(levelOfRow(row({ readingRecognition: dim({ observations: 9, score: 0.99 }) }, { level: 'seen' }))).toBe('seen');
    expect(levelOfRow(row({}, { level: 'automatic' }))).toBe('automatic');
  });
});

describe('levelOfRows', () => {
  it('takes the highest level over the lemma row and the form row; a word with no row or no encounter is "new"', () => {
    expect(levelOfRows([row({ exposure: dim({ observations: 1 }) }), row({ readingRecognition: dim({ observations: 4, score: 0.9 }) })])).toBe('known');
    expect(levelOfRows([undefined, undefined])).toBe('new');
    expect(levelOfRows([])).toBe('new');
    expect(levelOfRows([row({})])).toBe('new');
  });

  it('the learner’s own mark decides outright (the newest among the rows wins), and a mark stored before the six levels keeps its meaning', () => {
    const evidence = row({ readingRecognition: dim({ observations: 5, score: 0.9 }) });
    expect(levelOfRows([{ ...evidence, selfMark: { mark: 'new', at: '2026-10-10T10:00:00.000Z' } }])).toBe('new');
    expect(levelOfRows([{ ...row({}), selfMark: { mark: 'familiar', at: '2026-10-10T10:00:00.000Z' } }])).toBe('familiar');
    expect(levelOfRows([{ ...row({}), selfMark: { mark: 'automatic', at: '2026-10-10T10:00:00.000Z' } }])).toBe('automatic');
    // the three older words: learning → new, productive → known (the word `known` is the level known)
    expect(levelOfRows([{ ...evidence, selfMark: { mark: 'learning', at: '2026-10-10T10:00:00.000Z' } }])).toBe('new');
    expect(levelOfRows([{ ...row({}), selfMark: { mark: 'productive', at: '2026-10-10T10:00:00.000Z' } }])).toBe('known');
    expect(levelOfRows([
      { ...row({}), selfMark: { mark: 'automatic', at: '2026-10-10T09:00:00.000Z' } },
      { ...row({}), selfMark: { mark: 'seen', at: '2026-10-10T11:00:00.000Z' } },
    ])).toBe('seen');
  });
});

describe('encountersOfRows', () => {
  it('sums the observations over the dimensions of a row, and takes the larger of the lemma row and the form row (they describe the same meetings)', () => {
    const lemma = row({ exposure: dim({ observations: 3 }), assistedRecognition: dim({ observations: 1 }) });
    const form = row({ exposure: dim({ observations: 2 }) });
    expect(encountersOfRows([lemma, form])).toBe(4);
    expect(encountersOfRows([form])).toBe(2);
    expect(encountersOfRows([undefined, undefined])).toBe(0);
    expect(encountersOfRows([])).toBe(0);
  });

  it('the engine’s own count is used when a row carries it', () => {
    expect(encountersOfRows([row({ exposure: dim({ observations: 9 }) }, { encounters: 5 }), row({}, { encounters: 2 })])).toBe(5);
  });
});

describe('the legend', () => {
  it('names the six levels once each, in order from the least established, with the contract’s words and a style', () => {
    expect(ACTIVE_LEVELS).toEqual(['new', 'seen', 'recognized', 'familiar', 'known', 'automatic']);
    expect(ACTIVE_LEVELS).toEqual(KNOWLEDGE_LEVELS);
    for (const l of ACTIVE_LEVELS) {
      expect(LEVEL_LEGEND[l].title).toBe(KNOWLEDGE_LEVEL_WORDS[l].title);
      expect(LEVEL_LEGEND[l].detail).toBe(KNOWLEDGE_LEVEL_WORDS[l].detail);
      expect(LEVEL_LEGEND[l].style).toBeTruthy();
    }
  });
});
