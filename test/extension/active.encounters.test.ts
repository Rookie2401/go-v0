import { describe, expect, it } from 'vitest';
import { hiAdapter } from '../../src/adapters/hi';
import { CONTENT_EVENT_KINDS } from '../../packages/golearn-extension/src/background/recorder';
import { limitEventWords } from '../../packages/golearn-extension/src/background/wordids';
import { buildEncounterEvent, createMemoryEncounterStore } from '../../packages/golearn-extension/src/store';

const IDENTITY = { learnerId: 'local:device', enrolmentId: 'local-enrolment:hi', deviceId: 'device' };
const VERSION = hiAdapter.version ?? '6';

describe('Hindi Active exposure event contract', () => {
  it('persists every distinct word from an original authored passage without long-selection trimming', async () => {
    const passage = 'परमेश्वर प्रेम है और वह हमें शान्ति देता है।';
    const tokens = hiAdapter.tokenize(passage).filter((t) => t.isWord);
    const analyses = hiAdapter.analyze(tokens);
    const groups = tokens.map((t, i) => {
      const c = analyses[i]?.candidates?.[0];
      const lemma = c?.lemma && !c.unconfirmed && c.confidence >= 0.5 ? `lemma:hi:${c.lemma}${c.pos ? ':' + c.pos : ''}` : undefined;
      return [...new Set([`form:hi:${hiAdapter.normalize(t.surface)}`, ...(lemma ? [lemma] : [])])];
    });
    const store = createMemoryEncounterStore();
    for (const [i, itemIds] of groups.entries()) {
      const event = buildEncounterEvent({ languageId: 'hi', itemIds, readerId: 'web-generic', identity: IDENTITY, version: VERSION, sessionId: 'active-test', now: new Date(1_000 + i) });
      expect(event.kind).toBe('EncounterRecorded');
      expect(limitEventWords(event).subject.itemIds).toEqual(itemIds);
      expect((await store.append(event)).ok).toBe(true);
    }
    const rows = await store.list();
    expect(rows).toHaveLength(new Set(groups.map((g) => g.join(','))).size);
    expect(new Set(rows.flatMap((e) => e.subject.itemIds ?? []))).toEqual(new Set(groups.flat()));
    expect(rows.every((e) => !(e.payload as Record<string, unknown>).surface)).toBe(true);
  });

  it('allows exposure events through the content recorder and deduplicates a repeated encounter', async () => {
    expect(CONTENT_EVENT_KINDS).toContain('EncounterRecorded');
    const store = createMemoryEncounterStore();
    const event = buildEncounterEvent({ languageId: 'hi', itemIds: ['form:hi:प्रेम'], readerId: 'web-generic', identity: IDENTITY, version: VERSION, sessionId: 'active-repeat', now: new Date(2_000) });
    expect((await store.append(event)).ok).toBe(true);
    expect((await store.append(event)).duplicate).toBe(true);
    expect(await store.count()).toBe(1);
  });
});
