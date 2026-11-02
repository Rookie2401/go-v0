import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { readingRelevanceForUnit } from '../../../packages/goreview/src/planner/reading-relevance';

const NOW = '2026-11-01T12:00:00.000Z';
const unitId = 'lemma:he:דָּבָר:NOUN';
function reading(id: string, over: Partial<GoEvent> = {}): GoEvent {
  const [kind, locator] = id.split('|');
  return {
    id, v: 3, learnerId: 'learner', enrolmentId: 'enrolment', languageId: 'he', at: '2026-10-31T12:00:00.000Z',
    producer: { app: 'golearn-app', version: '1', deviceId: 'device' }, kind: 'EncounterRecorded',
    subject: { itemIds: [unitId], sentenceKey: `hash-${id}`, sourceRef: { kind: kind as 'ebook', title: 'private title', locator } },
    payload: { contextKind: 'sentence', language: { languageId: 'he', basis: 'book-metadata', confidence: 0.95, override: false } },
    ...over,
  } as GoEvent;
}

describe('reading relevance priority inputs', () => {
  it('counts recent sentence context across identified sources without returning source details', () => {
    const projection = new Map([[unitId, { encounters: 4, lastSeenAt: NOW }]]);
    const result = readingRelevanceForUnit([reading('ebook|chapter-a'), reading('ebook|chapter-b')], unitId, 'he', NOW, projection);
    expect(result).toEqual({ readingRelevance: 2 / 3, recentExposure: 2 / 3, recentContexts: 2, recentSources: 2 });
    expect(JSON.stringify(result)).not.toContain('private title');
    expect(JSON.stringify(result)).not.toContain('chapter-a');
  });

  it('ignores old, ambiguous, unconfirmed, wrong-language, source-free and conflicting events', () => {
    const badIdA = reading('conflict|chapter');
    const badIdB = { ...badIdA, payload: { contextKind: 'fragment' } };
    const projection = new Map([[unitId, { encounters: 4, lastSeenAt: NOW }]]);
    const result = readingRelevanceForUnit([
      reading('old|chapter', { at: '2026-09-01T12:00:00.000Z' }),
      reading('fragment|chapter', { payload: { contextKind: 'fragment' } }),
      reading('unconfirmed|chapter', { kind: 'SelectionLookedUp', payload: { contextKind: 'sentence', contextConfidence: 0.9, unconfirmed: true } }),
      reading('weak-language|chapter', { payload: { contextKind: 'sentence', language: { basis: 'book-metadata', confidence: 0.2 } } }),
      reading('wrong-language|chapter', { languageId: 'el' }),
      reading('no-source|chapter', { subject: { itemIds: [unitId] } }),
      badIdA, badIdB,
    ], unitId, 'he', NOW, projection);
    expect(result).toEqual({ readingRelevance: 0, recentExposure: 0, recentContexts: 0, recentSources: 0 });
  });

  it('requires current authoritative knowledge and caps context evidence by projected encounters', () => {
    const contexts = ['chapter-a', 'chapter-b', 'chapter-c'].map(locator => reading(`ebook|${locator}`));
    expect(readingRelevanceForUnit(contexts, unitId, 'he', NOW)).toMatchObject({ readingRelevance: 0 });
    const oneEncounter = new Map([[unitId, { encounters: 1, lastSeenAt: NOW }]]);
    expect(readingRelevanceForUnit(contexts, unitId, 'he', NOW, oneEncounter)).toMatchObject({ recentContexts: 1, recentSources: 1, readingRelevance: 1 / 3 });
    const notCurrent = new Map([[unitId, { encounters: 3, lastSeenAt: '2026-10-01T00:00:00.000Z' }]]);
    expect(readingRelevanceForUnit(contexts, unitId, 'he', NOW, notCurrent).readingRelevance).toBe(0);
  });

  it('accepts anonymous hashed sentence contexts and real Biblia verse exposure events without retaining source identifiers', () => {
    const projection = new Map([[unitId, { encounters: 3, lastSeenAt: NOW }]]);
    const anonymousLookup = {
      ...reading('anonymous-lookup'), kind: 'SelectionLookedUp' as const,
      subject: { itemIds: [unitId], sentenceKey: 'sentence-hash-1' },
      payload: { contextKind: 'sentence', contextConfidence: 0.7, unconfirmed: false,
        language: { languageId: 'he', basis: 'override', confidence: 1, override: true } },
    } as GoEvent;
    const result = readingRelevanceForUnit([anonymousLookup], unitId, 'he', NOW, projection);
    expect(result).toMatchObject({ readingRelevance: 1 / 3, recentContexts: 1, recentSources: 0 });

    const bible = ['Gen.1.2', 'Exod.2.1', '1Thess.1.1'].map((verse, index) => ({
      id: `biblia-${index}`, v: 3, learnerId: 'learner', enrolmentId: 'enrolment', languageId: 'he', at: '2026-10-31T12:00:00.000Z',
      producer: { app: 'golearn-ext' as const, version: '1', deviceId: 'device', surface: 'biblia-reading' },
      kind: 'EncounterRecorded' as const, subject: { itemIds: [unitId] },
      payload: { contextKind: 'sentence', readerId: 'biblia-reader',
        language: { languageId: 'he', basis: 'override', confidence: 1, override: true, source: `biblia:${verse}` } },
    }));
    const biblical = readingRelevanceForUnit(bible, unitId, 'he', NOW, projection);
    expect(biblical).toMatchObject({ readingRelevance: 1, recentContexts: 3, recentSources: 3 });
    expect(JSON.stringify(biblical)).not.toMatch(/Gen|Exod|Thess|biblia-reader/);
  });
});
