// @vitest-environment node
/**
 * The worker after the browser stopped it (it does after ~30 s idle), with a large device history (the owner, 2026-11-09: the card said "Could not
 * save that: the background did not answer" and "Encounter not recorded"). Measured with 12,000 events: the woken worker took 10-12 s to answer its
 * status and 5-13 s more to open the device Repository, because every read went through `get(null)` (the whole of chrome.storage.local: the
 * history, the queue, the dictionary pages) and the language and the recording both waited for the Repository to open.
 * Here a second worker is started over the first one's storage, and reading the Repository's rows is made slow.
 */
import { describe, expect, it } from 'vitest';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { ENROLMENTS_KEY, LOCAL_PREFIX } from '../../packages/golearn-extension/src/background/localRepo';
import { LOCAL_COPY_WAIT_MS } from '../../packages/golearn-extension/src/background/recorder';
import { adaptStorageArea, createMemoryArea, getByPrefix } from '../../packages/repository-sync/src';
import { createRig, pendingEvent } from './rig';

const SLOW_MS = 5000;

/** A worker woken over `from`'s storage, where reading the device Repository's rows takes SLOW_MS (a large history), and chrome's getKeys exists. */
async function wokenOver(from: ReturnType<typeof createRig>) {
  const rig = createRig();
  const area = rig.fake.local as unknown as { get(k: string | string[] | null): Promise<Record<string, unknown>>; getKeys?: () => Promise<string[]> };
  const get = area.get.bind(area);
  const fullReads = { count: 0 };
  area.get = async (keys) => {
    if (keys === null) fullReads.count++;
    const many = keys === null || (Array.isArray(keys) && keys.some((k) => k.startsWith(LOCAL_PREFIX)));
    if (many) await new Promise((r) => setTimeout(r, SLOW_MS));
    return get(keys);
  };
  area.getKeys = async () => Object.keys(await get(null));
  await rig.fake.local.set(await from.fake.local.get(null));
  return { rig, fullReads, rawGet: get };
}

describe('a woken worker with a large device history', () => {
  it('answers a recording without waiting for the device Repository to open; the Repository files it afterwards', async () => {
    const first = createRig();
    await first.page({ type: MSG.localRepo, op: 'enrol', languageId: 'sq' });
    await first.content({ type: MSG.record, event: pendingEvent('libër') });
    const { rig, rawGet } = await wokenOver(first);
    const t0 = Date.now();
    const event = pendingEvent('shtëpinë');
    const r = await rig.content({ type: MSG.record, event });
    expect(r).toMatchObject({ ok: true });
    expect(Date.now() - t0).toBeLessThan(LOCAL_COPY_WAIT_MS + 1500); // before: it waited for the Repository (here 5 s; with the owner's history, past the card's 4 s)
    // the event is in the worker's own log and queue at once, and in the device Repository once it has opened
    const rows = await rawGet(null);
    expect(Object.keys(rows).filter((k) => k.startsWith('queue:')).length).toBeGreaterThan(0);
    await new Promise((res) => setTimeout(res, SLOW_MS + 1500));
    const exported = await rig.page({ type: MSG.localRepo, op: 'export' });
    expect(exported.events.map((e: { id: string }) => e.id)).toContain(event.id);
  }, 40_000);

  it('says which language the learner reads in from the kept enrolment summary while the Repository opens', async () => {
    const first = createRig();
    await first.page({ type: MSG.localRepo, op: 'enrol', languageId: 'sq' });
    expect((await first.fake.local.get(ENROLMENTS_KEY))[ENROLMENTS_KEY]).toEqual([expect.objectContaining({ languageId: 'sq', explicit: true })]);
    const { rig } = await wokenOver(first);
    const t0 = Date.now();
    const status = await rig.content({ type: MSG.status });
    expect(status).toMatchObject({ ok: true, languageId: 'sq' });
    expect(Date.now() - t0).toBeLessThan(1500); // before: the status opened the Repository first
  }, 20_000);
});

describe('the storage port', () => {
  it('reads one prefix\'s rows from the keys alone where the browser lists keys (no read of every row); without getKeys, as before', async () => {
    const backing = createMemoryArea();
    await backing.set({ 'a:1': 1, 'a:2': 2, 'b:1': 'big' });
    let fullReads = 0;
    const chromeLike = {
      get: (k: string | string[] | null) => { if (k === null) fullReads++; return backing.get(k); },
      set: (i: Record<string, unknown>) => backing.set(i), remove: (k: string | string[]) => backing.remove(k),
      getKeys: async () => Object.keys(backing.dump()),
    };
    const area = adaptStorageArea(chromeLike);
    expect(await area.list('a:')).toEqual(['a:1', 'a:2']);
    expect(await area.getPrefix!('a:')).toEqual({ 'a:1': 1, 'a:2': 2 });
    expect(await getByPrefix(area, 'a:')).toEqual([['a:1', 1], ['a:2', 2]]);
    expect(fullReads).toBe(0);
    const older = adaptStorageArea({ get: chromeLike.get, set: chromeLike.set, remove: chromeLike.remove });
    expect(await older.getPrefix!('a:')).toEqual({ 'a:1': 1, 'a:2': 2 });
    expect(fullReads).toBe(1);
  });
});

describe('the worker opens the device Repository when something needs it, not on every wake (2026-11-10)', () => {
  /** A worker over an empty storage whose reads of the device Repository's rows are counted (the whole-storage read and any read naming a repo key). */
  function counted() {
    const rig = createRig();
    const area = rig.fake.local as unknown as { get(k: string | string[] | null): Promise<Record<string, unknown>> };
    const get = area.get.bind(area);
    const reads = { count: 0 };
    area.get = async (keys) => {
      if (keys === null || (Array.isArray(keys) && keys.some((k) => k.startsWith(LOCAL_PREFIX)))) reads.count++;
      return get(keys);
    };
    return { rig, reads };
  }
  const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

  it('a worker start reads none of the Repository\'s rows; the sync alarm waking it signed out (nothing queued) reads none either', async () => {
    const { rig, reads } = counted();
    await settle();
    expect(reads.count).toBe(0); // before: register() opened it at once
    rig.fake.alarmEvent.fire({ name: 'golearn-sync' } as never);
    await settle();
    expect(reads.count).toBe(0);
  });

  it.each([
    ['a keep-warm ping', { type: MSG.keepWarm }],
    ['the page\'s status question', { type: MSG.status }],
    ['the page\'s Active question', { type: MSG.active, op: 'get' }],
    ['the learner-model question', { type: MSG.profile, unitIds: ['form:sq:libër'], languageId: 'sq' }],
  ])('%s starts the open', async (_name, message) => {
    const { rig, reads } = counted();
    await settle();
    const reply = await rig.content(message);
    expect(reply).toBeDefined();
    await settle();
    expect(reads.count).toBeGreaterThan(0);
  });

  it('the keep-warm ping is answered at once, even while the Repository is still opening (a slow read)', async () => {
    const { rig } = counted();
    const area = rig.fake.local as unknown as { get(k: string | string[] | null): Promise<Record<string, unknown>> };
    const get = area.get.bind(area);
    area.get = async (keys) => { if (keys === null) await new Promise((r) => setTimeout(r, 3000)); return get(keys); };
    const t0 = Date.now();
    expect(await rig.content({ type: MSG.keepWarm })).toEqual({ ok: true });
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('the first recording after a wake still starts the open, so the event is filed', async () => {
    const first = createRig();
    await first.page({ type: MSG.localRepo, op: 'enrol', languageId: 'sq' });
    const { rig, fullReads } = await wokenOver(first);
    await settle();
    expect(fullReads.count).toBe(0); // the woken worker has not read the history yet
    const event = pendingEvent('libër');
    expect(await rig.content({ type: MSG.record, event })).toMatchObject({ ok: true });
    await new Promise((res) => setTimeout(res, SLOW_MS + 1500));
    const exported = await rig.page({ type: MSG.localRepo, op: 'export' });
    expect(exported.events.map((e: { id: string }) => e.id)).toContain(event.id);
  }, 40_000);
});
