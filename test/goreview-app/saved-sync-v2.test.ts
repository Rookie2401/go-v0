import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import type { AppContext } from '../../packages/goreview/app/context';
import type { SavedDeck } from '../../packages/goreview/app/deckModel';
import { recordSavedDeckChange, sharedSavedDecks } from '../../packages/goreview/app/savedDeckSync';

function fixture() {
  const events: GoEvent[] = [];
  let clock = '2026-10-27T10:00:00.000Z', seq = 0;
  const ctx = {
    deps: { newId: () => String(++seq) },
    eventContext: async () => ({ learnerId: 'L', enrolmentId: 'E', languageId: 'sq', deviceId: 'D', appVersion: 'test', now: clock }),
    events: async () => [...events],
    record: async (input: GoEvent[]) => { events.push(...input); return { refused: [] }; },
  } as unknown as AppContext;
  const deck: SavedDeck = { id: 'collection', languageId: 'sq', savedAt: clock, items: [
    { itemId: 'card:written-recognition:lemma:sq:zog:NOUN', unitId: 'lemma:sq:zog:NOUN', unitKind: 'lexeme', label: 'zog', dimension: 'written-recognition', family: 'written-recognition' },
  ] };
  return { ctx, events, deck, tick: () => { clock = '2026-10-27T10:01:00.000Z'; } };
}
describe('Repository-backed saved collection operations', () => {
  it('makes an explicitly saved collection visible to a second local store without creating a scheduling card', async () => {
    const f = fixture();
    await recordSavedDeckChange(f.ctx, 'save', f.deck);
    expect(f.events.map(e => e.kind)).toEqual(['PreferenceChanged']);
    expect((await sharedSavedDecks(f.ctx, 'L', 'sq', []))[0].items).toEqual(f.deck.items);
    expect(f.events[0].evidence?.quality).toBe('none');
  });
  it('keeps a remove tombstone effective despite old local copies, duplicate delivery and reverse arrival', async () => {
    const f = fixture();
    await recordSavedDeckChange(f.ctx, 'save', f.deck); f.tick();
    await recordSavedDeckChange(f.ctx, 'remove', f.deck);
    f.events.push(structuredClone(f.events[0])); f.events.reverse();
    expect(await sharedSavedDecks(f.ctx, 'L', 'sq', [f.deck])).toEqual([]);
  });
  it('preserves local legacy collections until explicit export and isolates learner/language', async () => {
    const f = fixture();
    expect(await sharedSavedDecks(f.ctx, 'L', 'sq', [f.deck])).toEqual([f.deck]);
    expect(f.events).toEqual([]);
    await recordSavedDeckChange(f.ctx, 'save', f.deck);
    expect(await sharedSavedDecks(f.ctx, 'other', 'sq', [])).toEqual([]);
    expect(await sharedSavedDecks(f.ctx, 'L', 'de', [])).toEqual([]);
  });
  it('does not claim a synchronized save when recording is refused', async () => {
    const f = fixture();
    f.ctx.record = async () => ({ refused: [{ eventId: 'blocked', issues: ['storage refused'] }] } as never);
    await expect(recordSavedDeckChange(f.ctx, 'save', f.deck)).rejects.toThrow('storage refused');
  });
});

it('refuses a shared saved entry whose exercise family does not assess its scheduling dimension',async()=>{
 const f=fixture();await recordSavedDeckChange(f.ctx,'save',f.deck);
 const value=f.events[0].payload.value as {items:Array<{family:string}>};value.items[0].family='audio-to-meaning';
 expect(await sharedSavedDecks(f.ctx,'L','sq',[])).toEqual([]);
});
