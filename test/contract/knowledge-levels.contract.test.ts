// @vitest-environment node
/** Contract: the six knowledge levels, the marks an ItemMarked may carry (levels + legacy words + bookmarks), and the unchanged vocabulary. */
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION, ITEM_MARKS, KNOWLEDGE_LEVELS, KNOWLEDGE_LEVEL_RANK, KNOWLEDGE_LEVEL_WORDS, LEGACY_MARK_LEVEL, isKnowledgeLevel, levelOfMark, validateEvent, validatePayload,
} from '../../packages/repository-contract/src';
import type { GoEvent } from '../../packages/repository-contract/src';

const markEvent = (mark: unknown): GoEvent => ({
  id: 'ev-1', v: CONTRACT_VERSION, learnerId: 'l', enrolmentId: 'e', languageId: 'sq', at: '2026-10-10T10:00:00.000Z',
  producer: { app: 'golearn-ext', version: '1', deviceId: 'd' }, kind: 'ItemMarked', subject: { itemIds: ['lemma:sq:shtepi:NOUN'] }, payload: { mark },
});

describe('the six levels', () => {
  it('are New, Seen, Recognized, Familiar, Known, Automatic, in order, with words for the learner', () => {
    expect(KNOWLEDGE_LEVELS).toEqual(['new', 'seen', 'recognized', 'familiar', 'known', 'automatic']);
    expect(KNOWLEDGE_LEVELS.map((l) => KNOWLEDGE_LEVEL_RANK[l])).toEqual([0, 1, 2, 3, 4, 5]);
    expect(KNOWLEDGE_LEVELS.map((l) => KNOWLEDGE_LEVEL_WORDS[l].title)).toEqual(['New', 'Seen', 'Recognized', 'Familiar', 'Known', 'Automatic']);
    expect(isKnowledgeLevel('familiar')).toBe(true);
    expect(isKnowledgeLevel('learning')).toBe(false);
  });
});

describe('ItemMarked accepts the levels, the legacy words and the bookmarks', () => {
  it('validates every level word, learning / known / productive, saved and ignore', () => {
    for (const m of [...KNOWLEDGE_LEVELS, 'learning', 'known', 'productive', 'saved', 'ignore']) expect(validateEvent(markEvent(m)), m).toEqual([]);
    expect(new Set(ITEM_MARKS)).toEqual(new Set([...KNOWLEDGE_LEVELS, 'learning', 'productive', 'saved', 'ignore']));
  });

  it('refuses anything else, with the path of the mark', () => {
    for (const m of ['mastered', 'NEW', '', 3, null, undefined, 'recognised']) {
      const issues = validateEvent(markEvent(m));
      expect(issues.map((i) => i.path), String(m)).toContain('payload.mark');
    }
    expect(validatePayload('ItemMarked', { mark: 'automatic' })).toEqual([]);
    expect(validatePayload('ItemMarked', { mark: 'nonsense' }).map((i) => i.path)).toContain('payload.mark');
  });
});

describe('legacy marks keep their meaning', () => {
  it('learning = new, productive = known; a level word is itself (the word known is read as the level known)', () => {
    expect(levelOfMark('learning')).toBe('new');
    expect(levelOfMark('productive')).toBe('known');
    expect(LEGACY_MARK_LEVEL.known).toBe('recognized'); // what "I recognise it" meant when the card had three choices
    for (const l of KNOWLEDGE_LEVELS) expect(levelOfMark(l)).toBe(l);
  });
});
