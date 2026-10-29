// @vitest-environment node
/**
 * Offline / failure audit — a corrupted local cache (brief §23). The device's storage is damaged between two runs of the app
 * (garbage JSON, a wrong type, a half-written row, a lost key) and the app is started again. The question each time: does it
 * come back, and is the durable queue (the learner's unsent evidence) still delivered, exactly once?
 *
 * Stores of the app under test: chrome.storage.local / .session for the GoLearn worker, localStorage (JSON text) for GoReview;
 * IndexedDB / Dexie is not used by any of the Go packages (the legacy `src/` app only), so it is not tested here. The Repository
 * is the real one (memory store: the corruption is on the device, the server side is store-independent and covered elsewhere).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalQueue, createMemoryArea, QUEUE_PREFIX } from '../../packages/repository-sync/src';
import { createWebKeyValueArea } from '../../packages/goreview/app/state';
import {
  PASSWORD, createNet, createPracticeDevice, createStack, fakeLocalStorage, lookup, review, serverEvents, signUp,
  type Stack,
} from './privacy.support';
import { accountFor, createWorkerRig } from './offline.support';

const stacks: Stack[] = [];
const make = (): Stack => { const s = createStack('memory'); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const countOf = async (s: Stack, learnerId: string, id: string): Promise<number> => (await serverEvents(s, learnerId)).filter((e) => e.id === id).length;

// ───────────────────────────── the GoLearn worker over chrome.storage ─────────────────────────────

async function worker() {
  const s = make();
  const net = createNet(s);
  const a = await accountFor(s, 'ana@example.com');
  const rig = createWorkerRig(s, net);
  expect((await rig.connect(a.email)).ok).toBe(true);
  net.down = true;
  const e1 = await rig.recordLookup('shtëpinë');
  const e2 = await rig.recordLookup('libër', 'Unë lexoj një libër.');
  return { s, net, a, rig, ids: [e1.eventId, e2.eventId] };
}
type Worker = Awaited<ReturnType<typeof worker>>;
/** Damage the storage, kill the worker, bring the network back, restart. */
async function damage(w: Worker, hurt: (local: Worker['rig']['fake']['local'], session: Worker['rig']['fake']['sessionArea']) => Promise<void>): Promise<void> {
  await hurt(w.rig.fake.local, w.rig.fake.sessionArea);
  w.rig.restart();
  w.net.down = false;
  w.rig.advance(10 * 60_000);
}
const answers = async (w: Worker): Promise<{ status: any; sync: any }> => ({ status: await w.rig.page({ type: 'golearn:status' }), sync: await w.rig.page({ type: 'golearn:sync-now' }) });

describe('GoLearn worker: damage that does not matter', () => {
  const harmless: Array<[string, Array<[string, unknown]>, 'local' | 'session']> = [
    ['settings are garbage', [['golearn:settings', 'garbage']], 'local'],
    ['settings are a number', [['golearn:settings', 42]], 'local'],
    ['the sync-status row is garbage', [['golearn:sync-status', 'garbage']], 'local'],
    ['the sync-status row is null', [['golearn:sync-status', null]], 'local'],
    ['a local-log row is a string', [['golearn:event:bad1', 'garbage']], 'local'],
    ['a local-log row is null', [['golearn:event:bad2', null]], 'local'],
    ['a local-log row is an empty object', [['golearn:event:bad3', {}]], 'local'],
    ['a rejected-events row is garbage', [['rejected:bad', 'garbage']], 'local'],
    ['dictionary shards are garbage', [['pack:shard:sq/s-00', 'garbage'], ['pack:shard:x', { text: 5 }]], 'local'],
    ['the session-area caches are garbage', [['golearn:prefs:sq', 'x'], ['golearn:know:lemma:sq:libër:NOUN', 'x']], 'session'],
  ];
  it.each(harmless)('%s: the worker starts, answers, records a new event and delivers the old ones exactly once', async (_name, rows, where) => {
    const w = await worker();
    await damage(w, async (local, session) => { await (where === 'local' ? local : session).set(Object.fromEntries(rows)); });
    const { status, sync } = await answers(w);
    expect(status.ok).toBe(true);
    expect(sync.ok).toBe(true);
    const fresh = await w.rig.recordLookup('çajin', 'Beni pi çajin.');
    expect(fresh.reply.ok).toBe(true);
    await w.rig.page({ type: 'golearn:sync-now' });
    for (const id of [...w.ids, fresh.eventId]) expect(await countOf(w.s, w.a.learnerId, id), id).toBe(1);
  });

  it('a queued event whose content is damaged (valid row, invalid event) is refused by the service and kept aside as a rejected row; every other event is delivered', async () => {
    const w = await worker();
    const key = `queue:${w.ids[0]}`;
    await damage(w, async (local) => { const row = (await local.get(key))[key] as { event: { payload: unknown } }; row.event.payload = 'oops'; await local.set({ [key]: row }); });
    const { status, sync } = await answers(w);
    expect(status.ok).toBe(true);
    expect(sync.ok).toBe(true);
    expect(await countOf(w.s, w.a.learnerId, w.ids[0])).toBe(0);
    expect(await countOf(w.s, w.a.learnerId, w.ids[1])).toBe(1);
    const st = await w.rig.page({ type: 'golearn:status' });
    expect(st.sync.rejected).toBe(1);                                                // reported, not silently dropped
    expect(Object.keys(await w.rig.fake.local.get(null))).toContain(`rejected:${w.ids[0]}`);
  });

  it('a queue row that lost its order counter (`ord`) is still sent', async () => {
    const w = await worker();
    const key = `queue:${w.ids[0]}`;
    await damage(w, async (local) => { const row = (await local.get(key))[key] as Record<string, unknown>; delete row.ord; await local.set({ [key]: row }); });
    expect((await answers(w)).sync.ok).toBe(true);
    for (const id of w.ids) expect(await countOf(w.s, w.a.learnerId, id)).toBe(1);
  });
});

describe('GoLearn worker: damage to the session or the service address', () => {
  it('a damaged session record is read as "not signed in" (honest), events recorded meanwhile stay on the device, and signing in again sends every one exactly once', async () => {
    const w = await worker();
    await damage(w, async (local) => { await local.set({ 'golearn:session': 'garbage' }); });
    const st = await w.rig.page({ type: 'golearn:status' });
    expect(st).toMatchObject({ ok: true, connected: false });
    const during = await w.rig.recordLookup('çajin', 'Beni pi çajin.');
    expect(during.reply).toMatchObject({ ok: true, attributed: 'local' });             // recorded, kept on the device under the local pseudonym
    expect((await w.rig.page({ type: 'golearn:sync-now' })).skipped).toBe('not-connected');
    expect((await w.rig.connect(w.a.email)).ok).toBe(true);                            // sign in again
    await w.rig.fireTimers();
    for (const id of [...w.ids, during.eventId]) expect(await countOf(w.s, w.a.learnerId, id), id).toBe(1);
    expect((await w.rig.page({ type: 'golearn:status' })).sync.pending).toBe(0);
  });

  it('a damaged service address is ignored (not one request goes to it) and is reported as "sign in again"; signing in rewrites the address and the queue is delivered once', async () => {
    const w = await worker();
    const before = w.net.calls.length;
    await damage(w, async (local) => { await local.set({ 'golearn:service': { baseUrl: 'http://evil.example' } }); });
    const r = await w.rig.page({ type: 'golearn:sync-now' });
    expect(r.ok).toBe(false);
    expect(w.net.calls.length).toBe(before);                                           // not a single request went to the damaged address
    const st = await w.rig.page({ type: 'golearn:status' });
    expect(st.sync.pending).toBe(2);
    expect(st.needsSignIn).toBe(true);                                                 // the damaged address looks, to the sync code, like a missing sign-in
    // (repairing only the address does not clear that: see the next test)
    expect((await w.rig.connect(w.a.email)).ok).toBe(true);
    await w.rig.fireTimers();
    for (const id of w.ids) expect(await countOf(w.s, w.a.learnerId, id)).toBe(1);
    expect((await w.rig.page({ type: 'golearn:status' })).sync.pending).toBe(0);
  });

  it('FINDING: after a damaged address is repaired by the service-config message alone, sync stays "needs sign-in" until the learner signs in (an unnecessary password prompt, but nothing is lost)', async () => {
    const w = await worker();
    await damage(w, async (local) => { await local.set({ 'golearn:service': { baseUrl: 'http://evil.example' } }); });
    await w.rig.page({ type: 'golearn:sync-now' });
    expect((await w.rig.page({ type: 'golearn:service-config', op: 'set', baseUrl: 'https://repo.example' })).ok).toBe(true);
    const again = await w.rig.page({ type: 'golearn:sync-now' });
    expect(again).toMatchObject({ ok: false, skipped: 'needs-sign-in' });
    expect((await w.rig.page({ type: 'golearn:status' })).sync.pending).toBe(2);
  });
});

describe('GoLearn worker: DEFECTS found by damaging the cache', () => {
  // DEFECT O-01: one unreadable row under `queue:` (a string, null, {}, an event that is null or has no id) makes `LocalQueue.pending()`
  // throw (sorted() reads row.ord and row.event.id; ordCounter() reads r.ord). The worker's status and every sync then answer
  // `internal` forever, so ALL the other, valid, unsent events of the learner are stuck behind it; and the only way out the UI offers
  // ("clear local data") deletes the valid events too. The sync package's own README promises "nothing is ever dropped".
  const badRows: Array<[string, unknown]> = [
    ['a string', 'garbage'], ['null', null], ['an empty object', {}], ['an event that is null', { event: null, ord: 1, enqueuedAt: 'x', attempts: 0 }],
    ['an event without an id', { event: { kind: 'x' }, ord: 1, enqueuedAt: 'x', attempts: 0 }],
  ];
  it.each(badRows)('O-01 (fixed): one queue row that is %s does not stop the other queued events from being delivered, and the worker keeps answering', async (_name, bad) => {
    const w = await worker();
    await damage(w, async (local) => { await local.set({ 'queue:zzz-damaged': bad }); });
    const { status, sync } = await answers(w);
    expect(status.ok).toBe(true);
    expect(sync.ok).toBe(true);
    for (const id of w.ids) expect(await countOf(w.s, w.a.learnerId, id)).toBe(1);
    expect((await w.rig.recordLookup('çajin', 'Beni pi çajin.')).reply.ok).toBe(true);
  });

  it('FINDING (what is left of O-01): "clear local data" is still an explicit discard of the unsent events and the damaged row, but it is no longer the only way past a damaged row', async () => {
    const w = await worker();
    await damage(w, async (local) => { await local.set({ 'queue:zzz-damaged': 'garbage' }); });
    expect((await w.rig.page({ type: 'golearn:status' })).error).toBeUndefined();        // the worker keeps answering; no forced way out
    const cleared = await w.rig.page({ type: 'golearn:clear-local' });
    expect(cleared.ok).toBe(true);
    expect(cleared.queued).toBe(3);                                                      // the two valid events and the damaged row
    await w.rig.page({ type: 'golearn:sync-now' });
    for (const id of w.ids) expect(await countOf(w.s, w.a.learnerId, id)).toBe(0);       // gone for good
  });

  // DEFECT O-02: a damaged `sync:cursor` (a string, a negative number, NaN) is sent to the service as `afterSeq`, which answers 422;
  // the pull then fails on every round, for ever. Pushing still works (so no event is lost), but every sync reports failure,
  // `lastError` never clears, and the learner-model cache is never refreshed after a sync (that happens only on a fully good round).
  it.each([['a string', 'garbage'], ['a negative number', -5], ['the string NaN', 'NaN']])('O-02 (fixed): a sync cursor that is %s is repaired, so the next sync round succeeds', async (_name, cursor) => {
    const w = await worker();
    await damage(w, async (local) => { await local.set({ 'sync:cursor': cursor }); });
    const first = await w.rig.page({ type: 'golearn:sync-now' });
    w.rig.advance(10 * 60_000);
    const second = await w.rig.page({ type: 'golearn:sync-now' });
    expect(first.ok || second.ok).toBe(true);
  });

  it('FINDING (O-02 after the repair): with a damaged cursor the queued events are delivered once and the round succeeds (the cursor restarts at 0)', async () => {
    const w = await worker();
    await damage(w, async (local) => { await local.set({ 'sync:cursor': 'garbage' }); });
    const r = await w.rig.page({ type: 'golearn:sync-now' });
    expect(r.ok).toBe(true);
    for (const id of w.ids) expect(await countOf(w.s, w.a.learnerId, id)).toBe(1);
    expect((await w.rig.page({ type: 'golearn:status' })).sync.pending).toBe(0);
    expect((await w.rig.page({ type: 'golearn:status' })).sync.lastError).toBeFalsy();    // and no error is left behind
  });

  // DEFECT O-03: the device id lives in its own storage key and the session on the server is bound to it (/sync/push answers 403
  // not-your-device for any other). If the key is lost or damaged while the session survives, the worker invents a new id and every
  // sync is refused with 403, reported as an opaque error with `needsSignIn:false`. Nothing is lost, and signing in again repairs it,
  // but the learner is never told to do that (GoReview, by contrast, treats the same 403 as "sign in again").
  it('O-03 (fixed): when the device id is lost, the learner is told to sign in again (or the sync repairs itself)', async () => {
    const w = await worker();
    await damage(w, async (local) => { await local.remove('golearn:deviceId'); });
    await w.rig.page({ type: 'golearn:sync-now' });
    const st = await w.rig.page({ type: 'golearn:status' });
    const delivered = (await countOf(w.s, w.a.learnerId, w.ids[0])) === 1;
    expect(delivered || st.needsSignIn === true || st.sync.needsSignIn === true).toBe(true);
  });

  it('FINDING (what O-03 does not lose): after the device id is lost the events stay queued, and signing in again delivers them exactly once', async () => {
    const w = await worker();
    await damage(w, async (local) => { await local.remove('golearn:deviceId'); });
    const r = await w.rig.page({ type: 'golearn:sync-now' });
    expect(r.ok).toBe(false);
    const status = await w.rig.page({ type: 'golearn:status' });
    expect(status.needsSignIn || status.sync.needsSignIn).toBe(true);                  // the learner is told to sign in again
    expect((await w.rig.page({ type: 'golearn:status' })).sync.pending).toBe(2);
    expect((await w.rig.connect(w.a.email)).ok).toBe(true);
    await w.rig.fireTimers();
    for (const id of w.ids) expect(await countOf(w.s, w.a.learnerId, id)).toBe(1);
  });

  // DEFECT O-04: `golearn:know-index` (the list of cached units) is read with `.filter`/spread without checking it is an array. When
  // it is damaged, `remember()` throws after the Repository has answered, the throw is reported as "offline", and the rows the service
  // returned are thrown away: every learner-model lookup says offline with no data until the next sign-in clears the cache.
  it('O-04 (fixed): a damaged learner-model cache index is ignored and rebuilt; the lookup returns the Repository\'s rows', async () => {
    const w = await worker();
    const reviewed = review(w.a, { subject: { itemIds: ['lemma:sq:libër:NOUN'], cardId: 'c' } });
    expect((await w.a.api.appendEvents([reviewed])).ok).toBe(true);
    await damage(w, async (_local, session) => { await session.set({ 'golearn:know-index': 'garbage' }); });
    const r = await w.rig.content({ type: 'golearn:profile', unitIds: ['lemma:sq:libër:NOUN'], languageId: 'sq' });
    expect(r.error).toBeUndefined();
    expect(Object.keys(r.rows)).toContain('lemma:sq:libër:NOUN');
  });
});

// ───────────────────────────── GoReview over localStorage ─────────────────────────────

describe('GoReview over localStorage: damaged local data', () => {
  const area = (ls: Storage) => Object.assign(createWebKeyValueArea(ls), { dump: () => ({}) });
  async function practice(deviceName = 'first') {
    const s = make();
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'setup');
    const ls = fakeLocalStorage();
    const open = (name: string) => createPracticeDevice(net, { deviceName: name, area: area(ls) as never });
    const dev = open(deviceName);
    expect((await dev.ctx.signIn({ email: a.email, password: PASSWORD })).ok).toBe(true);
    const id = (await dev.ctx.identity())!;
    net.down = true;
    const events = [lookup(id), lookup(id)];
    expect((await dev.ctx.record(events)).queued).toBe(2);
    return { s, net, a, ls, open, id, ids: events.map((e) => e.id), dev };
  }
  type P = Awaited<ReturnType<typeof practice>>;
  const restart = (p: P, name = 'first') => { p.net.down = false; return p.open(name); };
  const prefix = (p: P): string => `u:${p.a.learnerId}:`;

  it('harmless damage: the profile cache, the log head and a log row are garbage: the app opens, records and delivers once', async () => {
    const p = await practice();
    p.ls.setItem('gopractice:profile', JSON.stringify('x'));
    p.ls.setItem(`${prefix(p)}log:head:${p.a.learnerId}`, JSON.stringify('x'));
    p.ls.setItem(`${prefix(p)}log:ev:${p.a.learnerId}:0000000099`, JSON.stringify('garbage'));
    const dev2 = restart(p);
    expect((await dev2.ctx.identity())?.learnerId).toBe(p.a.learnerId);
    expect((await dev2.ctx.record([lookup((await dev2.ctx.identity())!)])).queued).toBe(1);
    expect((await dev2.ctx.syncNow({ force: true }))?.ok).toBe(true);
    for (const id of p.ids) expect(await countOf(p.s, p.a.learnerId, id)).toBe(1);
  });

  it('a queue row that is not even JSON is dropped by the storage layer: the other events are delivered', async () => {
    const p = await practice();
    p.ls.setItem(prefix(p) + 'queue:bad', '{not json');
    const dev2 = restart(p);
    const out = await dev2.ctx.syncNow({ force: true });
    expect(out?.ok).toBe(true);
    for (const id of p.ids) expect(await countOf(p.s, p.a.learnerId, id)).toBe(1);
  });

  // DEFECT O-05: the same unreadable row is counted as pending (the queue's size() counts keys, its pending() reads rows), so after a
  // full successful sync the header still says "1 waiting to sync"; the row is neither sent, nor reported as rejected or set aside, nor
  // removable by the learner. (The data in it cannot be recovered anyway; the defect is the permanent false count and the silence.)
  it('O-05 (fixed): an unreadable queue row is reported (rejected / set aside) and does not count as an event still waiting', async () => {
    const p = await practice();
    p.ls.setItem(prefix(p) + 'queue:bad', '{not json');
    const dev2 = restart(p);
    await dev2.ctx.syncNow({ force: true });
    const st = (await dev2.ctx.syncView()).status!;
    expect(st.pending).toBe(0);
    expect(st.rejected + st.quarantined).toBeGreaterThanOrEqual(1);
  });

  // Same defect as O-01, in GoReview: a queue row that is valid JSON of the wrong shape.
  const wrongShape: Array<[string, string]> = [
    ['a JSON string', JSON.stringify('garbage')], ['JSON null', 'null'], ['an empty object', '{}'],
    ['an event without required fields', JSON.stringify({ event: { id: 'bad' }, ord: 99, enqueuedAt: 'x', attempts: 0 })],
  ];
  it.each(wrongShape)('O-01 (fixed): one queue row that is %s does not stop the other queued events from being delivered', async (_name, json) => {
    const p = await practice();
    p.ls.setItem(`${prefix(p)}queue:bad`, json);
    const dev2 = restart(p);
    const out = await dev2.ctx.syncNow({ force: true }).catch(() => undefined);
    expect(out?.ok).toBe(true);
    for (const id of p.ids) expect(await countOf(p.s, p.a.learnerId, id)).toBe(1);
  });

  it('O-02 (fixed): a damaged sync cursor is repaired, so the sync round succeeds', async () => {
    const p = await practice();
    p.ls.setItem(`${prefix(p)}sync:cursor`, JSON.stringify('x'));
    const dev2 = restart(p);
    const first = await dev2.ctx.syncNow({ force: true });
    dev2.clock.ms += 600_000;
    const second = await dev2.ctx.syncNow({ force: true });
    expect(first?.ok || second?.ok).toBe(true);
  });

  it('a damaged session record signs the learner out (honestly); the learner\'s queue is untouched under its own prefix and is delivered once after signing in', async () => {
    const p = await practice();
    p.ls.setItem('gopractice:session', '{oops');
    const dev2 = restart(p);
    expect(await dev2.ctx.session()).toBeUndefined();
    expect((await dev2.ctx.record([lookup(p.id)])).refused.length).toBe(1);                 // GoReview does not record for nobody; it says so
    expect(Object.keys((await Promise.resolve(Object.fromEntries(p.ls.raw)))).filter((k) => k.startsWith(`${prefix(p)}queue:`)).length).toBe(2);
    expect((await dev2.ctx.signIn({ email: p.a.email, password: PASSWORD })).ok).toBe(true);
    await dev2.ctx.syncNow({ force: true });
    for (const id of p.ids) expect(await countOf(p.s, p.a.learnerId, id)).toBe(1);
  });

  it('a lost device id (the session survives): the sync is refused as "different device", GoReview reports authExpired (sign in again), nothing is lost, and signing in repairs it', async () => {
    const p = await practice('first');
    p.ls.removeItem('gopractice:deviceId');
    const dev2 = restart(p, 'second');                                                       // a new device id is generated
    const r = await dev2.ctx.syncNow({ force: true });
    expect(r?.ok).toBe(false);
    const view = await dev2.ctx.syncView();
    expect(view.authExpired).toBe(true);
    expect(view.status?.pending).toBe(2);
    expect((await dev2.ctx.signIn({ email: p.a.email, password: PASSWORD })).ok).toBe(true);
    await dev2.ctx.syncNow({ force: true });
    for (const id of p.ids) expect(await countOf(p.s, p.a.learnerId, id)).toBe(1);
  });
});

// ───────────────────────────── the sync package's own queue ─────────────────────────────

describe('the sync package\'s durable queue over a damaged area (the root of O-01)', () => {
  it('a readable queue is unaffected by an unreadable row of another kind (rejected:, quarantine:, cursor)', async () => {
    const area = createMemoryArea();
    const q = createLocalQueue(area, { now: () => 1 });
    const ev = lookup({ learnerId: 'L', enrolmentId: 'E', deviceId: 'D' });
    expect((await q.enqueue(ev)).ok).toBe(true);
    await area.set({ 'rejected:bad': 'garbage', 'quarantine:bad': 'garbage', 'sync:cursor': 'garbage' });
    expect((await q.pending()).map((r) => r.event.id)).toEqual([ev.id]);
    expect(await q.size()).toBe(1);
  });

  it('O-01 (fixed): pending() skips (and keeps) a row under queue: that is not a queue row, instead of throwing for every caller', async () => {
    const area = createMemoryArea();
    const q = createLocalQueue(area, { now: () => 1 });
    const ev = lookup({ learnerId: 'L', enrolmentId: 'E', deviceId: 'D' });
    expect((await q.enqueue(ev)).ok).toBe(true);
    await area.set({ [`${QUEUE_PREFIX}damaged`]: null });
    const pending = await createLocalQueue(area, { now: () => 2 }).pending();     // a restart: a new queue over the same storage
    expect(pending.map((r) => r.event.id)).toEqual([ev.id]);
    expect(Object.keys(area.dump())).toContain(`${QUEUE_PREFIX}damaged`);           // and it is kept, not deleted
  });
});

