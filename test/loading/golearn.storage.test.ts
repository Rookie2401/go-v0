// @vitest-environment node
/**
 * The learner never waits for a read of the WHOLE chrome.storage.local (2026-11-10: about 15 MB at 12,000 events; reads are serialised, so every
 * small read queued behind one). The language switch, a found gloss, a recorded lookup and a profile request read only the rows they name.
 * The fake storage lists its keys alone, as chrome's does (getKeys, Chrome 130+), and counts every whole read and every large read of other rows.
 */
import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { adaptStorageArea, createLocalQueue, QUEUE_PREFIX } from '../../packages/repository-sync/src';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { createRecorder, localLearnerId, localEnrolmentId } from '../../packages/golearn-extension/src/background/recorder';
import { PENDING_IDENTITY, buildSelectionEvent, createMemoryStorageArea, createStorageEncounterStore, EVENT_KEY_PREFIX } from '../../packages/golearn-extension/src/store';
import { createRig, ATTRIBUTION, type Rig } from '../extension/rig';

const REPO = 'golearn:repo:';
const SHARD = 'pack:shard:';

interface Reads { whole: number; large: number }
/** Makes the fake list its keys alone (as chrome's getKeys) and counts the whole reads and the reads of more than 50 keys. */
function counted(allowed: string, area: { get: (k?: string | string[] | null) => Promise<Record<string, unknown>> } & { dump(): Record<string, unknown> }): Reads {
  const reads: Reads = { whole: 0, large: 0 };
  const get = area.get.bind(area);
  const a = area as unknown as Record<string, unknown>;
  a.get = async (keys?: string | string[] | null) => {
    if (keys == null) reads.whole++;
    else if (Array.isArray(keys) && keys.length > 50 && !keys.every((k) => k.startsWith(allowed))) reads.large++;
    return get(keys);
  };
  a.getKeys = async () => Object.keys(area.dump());
  return reads;
}

const cardOf = (languageId: string, unit: string, word: string): any => ({
  languageId, surface: word, itemIds: [unit], packId: `pack:${languageId}`, analyzerId: 'test', confidence: 0.9, constructions: [], pronunciation: [], phrases: [],
  tokenCount: 1, provenance: 'dictionary', unconfirmed: false, context: { kind: 'sentence', confidence: 0.9, sentence: `x ${word} y`, sentenceKey: `s-${word}`, selStart: 2, selEnd: 2 + word.length },
});
const lookup = (lang: string, unit: string, word: string, sessionId = 's1'): GoEvent =>
  buildSelectionEvent({ card: cardOf(lang, unit, word), readerId: 'web-generic', identity: { ...PENDING_IDENTITY }, version: '0.1.0', sessionId, now: new Date(Date.now() - 60_000) } as any);

async function bigHistory(rig: Rig): Promise<void> {
  const rows: Record<string, unknown> = {};
  for (let i = 0; i < 2000; i++) rows[`${REPO}junk:${i}`] = { n: i };
  for (let i = 0; i < 200; i++) rows[`${SHARD}x/${i % 2 ? 'sq' : 'de'}/s-${i}`] = { text: '{}', at: 1, url: 'u', ...(i % 4 === 1 ? { attribution: 'old' } : {}) };
  await rig.fake.local.set(rows);
}

async function signedIn(allowed = REPO): Promise<{ rig: Rig; reads: Reads }> {
  const rig = createRig();
  await rig.signUp();
  await rig.connect();
  await rig.fireTimers();
  expect((await rig.page({ type: MSG.enrol, languageId: 'de', packId: 'pack:de', packVersion: '1', goals: [{ kind: 'reading' }] })).ok).toBe(true);
  expect(await rig.page({ type: MSG.useLanguage, languageId: 'sq' })).toMatchObject({ ok: true });
  await rig.page({ type: MSG.status });
  await bigHistory(rig);
  const reads = counted(allowed, rig.fake.local as never);
  return { rig, reads };
}

const settle = async (rig: Rig): Promise<void> => { await rig.fireTimers(); await new Promise((r) => setTimeout(r, 50)); };

describe('no whole-storage read on a path the learner waits on', () => {
  it('(a) a language switch, with a lookup in the new language waiting in the queue', async () => {
    const { rig, reads } = await signedIn();
    // a German lookup while Albanian is selected stays on the device under the local pseudonym, in the log and in the queue
    expect(await rig.content({ type: MSG.record, event: lookup('de', 'lemma:de:Haus:NOUN', 'Haus') })).toMatchObject({ ok: true, attributed: 'local' });
    reads.whole = 0; reads.large = 0;
    expect(await rig.page({ type: MSG.useLanguage, languageId: 'de' })).toMatchObject({ ok: true, languageId: 'de' });
    await settle(rig);
    const dump = rig.fake.local.dump();
    const queued = Object.entries(dump).filter(([k]) => k.startsWith(QUEUE_PREFIX)).map(([, v]) => (v as { event: GoEvent }).event);
    expect(queued.every((e) => !e.learnerId.startsWith('local:'))).toBe(true); // the reattribution still happened (what is queued still, and what was sent)
    expect(Object.keys(dump).some((k) => k.startsWith(EVENT_KEY_PREFIX))).toBe(true);
    const logged = Object.entries(dump).filter(([k]) => k.startsWith(EVENT_KEY_PREFIX)).map(([, v]) => v as GoEvent);
    expect(logged.every((e) => !e.learnerId.startsWith('local:'))).toBe(true);
    expect(reads).toEqual({ whole: 0, large: 0 });
  });

  it('(b) a gloss that finds an entry stamps the attribution on that language\'s cached pages only', async () => {
    const { rig, reads } = await signedIn(SHARD);
    reads.whole = 0; reads.large = 0;
    const r = await rig.content({ type: MSG.gloss, lemma: 'shtëpi', pos: 'NOUN', languageId: 'sq' });
    expect(r).toMatchObject({ ok: true, found: true });
    await settle(rig);
    const shards = Object.entries(rig.fake.local.dump()).filter(([k]) => k.startsWith(`${SHARD}x/sq/`)).map(([, v]) => v as { attribution?: string });
    expect(shards.length).toBe(100);
    expect(shards.every((s) => s.attribution === ATTRIBUTION)).toBe(true);
    const de = Object.entries(rig.fake.local.dump()).filter(([k]) => k.startsWith(`${SHARD}x/de/`)).map(([, v]) => v as { attribution?: string });
    expect(de.every((s) => s.attribution === undefined)).toBe(true);
    expect(reads).toEqual({ whole: 0, large: 0 });
  });

  it('(c) recording a lookup', async () => {
    const { rig, reads } = await signedIn();
    reads.whole = 0; reads.large = 0;
    expect(await rig.content({ type: MSG.record, event: lookup('sq', 'lemma:sq:shtëpi:NOUN', 'shtëpi', 's2') })).toMatchObject({ ok: true, attributed: 'account' });
    await settle(rig);
    expect(reads).toEqual({ whole: 0, large: 0 });
  });

  it('(d) a profile request', async () => {
    const { rig, reads } = await signedIn();
    reads.whole = 0; reads.large = 0;
    expect((await rig.content({ type: MSG.profile, unitIds: ['lemma:sq:shtëpi:NOUN'], languageId: 'sq' })).ok).toBe(true);
    expect(reads).toEqual({ whole: 0, large: 0 });
  });
});

describe('the same rows give the same results and the same writes as before', () => {
  function seeded() {
    const area = createMemoryStorageArea();
    const ev = (id: string, lang: string, learnerId: string, kind = 'SelectionLookedUp'): GoEvent => ({ ...lookup(lang, `lemma:${lang}:w:NOUN`, 'w', id), id, learnerId, enrolmentId: localEnrolmentId(lang), kind } as GoEvent);
    const L = localLearnerId('dev');
    const events = [ev('e1', 'de', L), ev('e2', 'es', L), ev('e3', 'de', L, 'ItemMarked'), ev('e4', 'de', 'acct-1')];
    const rows: Record<string, unknown> = { 'other:x': 1, 'pack:shard:big/de/1': { text: 'x' }, 'golearn:repo:meta': { a: 1 } };
    events.forEach((e, i) => { rows[`${EVENT_KEY_PREFIX}${e.id}`] = e; rows[`${QUEUE_PREFIX}${String(i + 1).padStart(8, '0')}`] = { event: e, ord: i + 1, enqueuedAt: 't', attempts: 0 }; });
    rows[`${QUEUE_PREFIX}00000099`] = { damaged: true };
    return { area, rows, events };
  }
  const recorderOver = (area: ReturnType<typeof createMemoryStorageArea>, withKeys: boolean) => {
    if (withKeys) (area as unknown as Record<string, unknown>).getKeys = async () => Object.keys(area.dump());
    return createRecorder({ area, queue: createLocalQueue(adaptStorageArea(area)), session: {} as never, deviceId: async () => 'dev', version: '1' });
  };
  const L = localLearnerId('dev');

  for (const withKeys of [true, false]) {
    it(`reattributeQueued: language and kind filter, damaged rows left alone, other rows untouched (area ${withKeys ? 'lists keys' : 'reads everything'})`, async () => {
      const { area, rows } = seeded();
      await area.set(rows);
      const before = area.dump();
      const rec = recorderOver(area, withKeys);
      expect(await rec.reattributeQueued('acct-1', 'enrol-de', 'de', 'ItemMarked')).toBe(1);
      const afterMarks = area.dump();
      const changedKeys = Object.keys(afterMarks).filter((k) => JSON.stringify(afterMarks[k]) !== JSON.stringify(before[k]));
      expect(changedKeys.sort()).toEqual([`${EVENT_KEY_PREFIX}e3`, `${QUEUE_PREFIX}00000003`]);
      expect((afterMarks[`${EVENT_KEY_PREFIX}e3`] as GoEvent)).toMatchObject({ learnerId: 'acct-1', enrolmentId: 'enrol-de' });
      expect(await rec.reattributeQueued('acct-1', 'enrol-de', 'de')).toBe(1); // e1 only: e3 is the account's now, e2 is Spanish, e4 was never local
      const after = area.dump();
      expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
      const moved = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])).sort();
      expect(moved).toEqual([`${EVENT_KEY_PREFIX}e1`, `${EVENT_KEY_PREFIX}e3`, `${QUEUE_PREFIX}00000001`, `${QUEUE_PREFIX}00000003`]);
      expect(after[`${QUEUE_PREFIX}00000099`]).toEqual({ damaged: true });
      expect((after[`${EVENT_KEY_PREFIX}e2`] as GoEvent).learnerId).toBe(L);
    });

    it(`the encounter store's list, count, export and clear see the event rows only, in the same order (area ${withKeys ? 'lists keys' : 'reads everything'})`, async () => {
      const { area, rows, events } = seeded();
      await area.set(rows);
      if (withKeys) (area as unknown as Record<string, unknown>).getKeys = async () => Object.keys(area.dump());
      const store = createStorageEncounterStore(area);
      const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
      expect((await store.list()).map((e) => e.id)).toEqual(sorted.map((e) => e.id));
      expect(await store.count()).toBe(4);
      expect(JSON.parse(await store.exportRows()).map((e: GoEvent) => e.id)).toEqual(sorted.map((e) => e.id));
      expect(await store.clear()).toBe(4);
      expect(Object.keys(area.dump()).some((k) => k.startsWith(EVENT_KEY_PREFIX))).toBe(false);
      expect(Object.keys(area.dump()).filter((k) => !k.startsWith(QUEUE_PREFIX)).sort()).toEqual(['golearn:repo:meta', 'other:x', 'pack:shard:big/de/1']);
    });
  }
});
