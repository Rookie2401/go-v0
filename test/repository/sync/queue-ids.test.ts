// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createLocalQueue, createMemoryArea, dedupeKeyFor, newEventId, resetIdState, adaptStorageArea } from '../../../packages/repository-sync/src';
import { makeClock, makeEvent } from './helpers';

describe('event ids', () => {
  it('are time-ordered and unique within one millisecond', () => {
    resetIdState('dev-ids-a');
    const ids = Array.from({ length: 2000 }, () => newEventId('dev-ids-a', 1_700_000_000_000, () => 0.5));
    expect(new Set(ids).size).toBe(2000);
    expect([...ids].sort()).toEqual(ids);
    expect(ids[0]).toMatch(/^ev:[0-9a-z]{9}:[0-9a-z]{7}:[0-9a-z]{4}:[0-9a-z]{4}$/);
  });

  it('stay monotonic across a backwards clock step', () => {
    resetIdState('dev-ids-b');
    const ids = [
      newEventId('dev-ids-b', 1_700_000_005_000, Math.random),
      newEventId('dev-ids-b', 1_700_000_001_000, Math.random), // the clock jumped back four seconds
      newEventId('dev-ids-b', 1_700_000_001_001, Math.random),
      newEventId('dev-ids-b', 1_700_000_006_000, Math.random),
    ];
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(4);
  });

  it('differ between devices and carry the device hash', () => {
    resetIdState();
    const a = newEventId('phone', 1_700_000_000_000, () => 0.1);
    const b = newEventId('laptop', 1_700_000_000_000, () => 0.1);
    expect(a).not.toBe(b);
    expect(a.split(':')[2]).not.toBe(b.split(':')[2]);
  });

  it('dedupeKeyFor defaults to the id', () => {
    expect(dedupeKeyFor({ id: 'x' })).toBe('x');
    expect(dedupeKeyFor({ id: 'x', dedupeKey: 'k' })).toBe('k');
  });
});

describe('local queue', () => {
  it('persists the row before enqueue resolves and keeps insertion order', async () => {
    const clock = makeClock(); const area = createMemoryArea(); const q = createLocalQueue(area, { now: clock.now });
    const events = [makeEvent('d1', clock), makeEvent('d1', clock), makeEvent('d1', clock)];
    for (const e of events) {
      const r = await q.enqueue(e);
      expect(r).toEqual({ ok: true, id: e.id });
      expect(area.dump()['queue:' + e.id]).toBeTruthy(); // already durable when the promise resolved
    }
    expect((await q.pending()).map((r) => r.event.id)).toEqual(events.map((e) => e.id));
    expect(await q.size()).toBe(3);
  });

  it('refuses an invalid event (never queued) and a duplicate id', async () => {
    const clock = makeClock(); const area = createMemoryArea(); const q = createLocalQueue(area);
    const bad = makeEvent('d1', clock, { kind: 'NoSuchKind' as never });
    const r = await q.enqueue(bad);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'invalid') expect(r.issues.some((i) => i.path === 'kind')).toBe(true);
    expect(area.dump()['queue:' + bad.id]).toBeUndefined();
    expect(await q.size()).toBe(0);

    const good = makeEvent('d1', clock);
    expect((await q.enqueue(good)).ok).toBe(true);
    expect(await q.enqueue(good)).toEqual({ ok: false, reason: 'duplicate', id: good.id });
    expect(await q.size()).toBe(1);
  });

  it('fail keeps the row and records attempts and lastError; ack removes', async () => {
    const clock = makeClock(); const q = createLocalQueue(createMemoryArea(), { now: clock.now });
    const e = makeEvent('d1', clock); await q.enqueue(e);
    await q.fail(e.id, 'boom'); await q.fail(e.id, 'boom again');
    const [row] = await q.pending();
    expect(row.attempts).toBe(2); expect(row.lastError).toBe('boom again'); expect(row.lastAttemptAt).toBeTruthy();
    await q.ack([e.id, 'unknown-id']);
    expect(await q.size()).toBe(0);
  });

  it('survives a restart: a second queue over the same area sees the same rows, in order', async () => {
    const clock = makeClock(); const area = createMemoryArea();
    const q1 = createLocalQueue(area);
    const evs = [makeEvent('d1', clock), makeEvent('d1', clock)];
    for (const e of evs) await q1.enqueue(e);
    await q1.fail(evs[0].id, 'offline');
    const q2 = createLocalQueue(area);
    const rows = await q2.pending();
    expect(rows.map((r) => r.event.id)).toEqual(evs.map((e) => e.id));
    expect(rows[0].attempts).toBe(1);
    const e3 = makeEvent('d1', clock); await q2.enqueue(e3); // continues after the existing ord
    expect((await q2.pending()).map((r) => r.event.id)).toEqual([...evs.map((e) => e.id), e3.id]);
  });

  it('reject moves the row to rejected: with its issues; nothing is dropped', async () => {
    const clock = makeClock(); const area = createMemoryArea(); const q = createLocalQueue(area, { now: clock.now });
    const e = makeEvent('d1', clock); await q.enqueue(e);
    await q.reject(e.id, [{ path: 'payload', message: 'nope' }]);
    expect(await q.size()).toBe(0);
    const rej = await q.rejected();
    expect(rej).toHaveLength(1); expect(rej[0].issues[0].message).toBe('nope'); expect(rej[0].event.id).toBe(e.id);
    expect(await q.enqueue(e)).toMatchObject({ ok: false, reason: 'duplicate' });
    await q.dismissRejected(e.id);
    expect(await q.rejected()).toHaveLength(0);
  });

  it('adaptStorageArea binds a chrome.storage-style area', async () => {
    const m = createMemoryArea();
    const a = adaptStorageArea({ get: (k) => m.get(k), set: (i) => m.set(i), remove: (k) => m.remove(k) });
    await a.set({ 'x:1': 1, 'x:2': 2, 'y:1': 3 });
    expect(await a.list('x:')).toEqual(['x:1', 'x:2']);
  });
});
