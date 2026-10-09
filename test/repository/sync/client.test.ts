// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PUSH_BATCH, type SyncStatus } from '../../../packages/repository-sync/src';
import { FakeServer, makeClock, makeDevice, makeEvent } from './helpers';

describe('push', () => {
  it('an offline burst of 50 events is stored exactly once when the device comes online', async () => {
    const clock = makeClock(); const server = new FakeServer(clock); const d = makeDevice('phone', server, clock);
    d.client.setOnline(false);
    for (let i = 0; i < 50; i++) { clock.advance(10); expect((await d.queue.enqueue(makeEvent('phone', clock))).ok).toBe(true); }
    const off = await d.client.syncOnce();
    expect(off.skipped).toBe('offline');
    expect(server.pushCalls).toBe(0);
    expect((await d.client.status()).online).toBe(false);
    expect((await d.client.status()).pending).toBe(50);

    d.client.setOnline(true);
    const r = await d.client.syncOnce();
    expect(r.ok).toBe(true);
    expect(server.events.size).toBe(50);
    expect(await d.queue.size()).toBe(0);
    expect(d.local.events.size).toBe(50); // own events came back through pull
    await d.client.syncOnce();
    expect(server.events.size).toBe(50);
  });

  it('sends at most 200 per batch', async () => {
    const clock = makeClock(); const server = new FakeServer(clock); const d = makeDevice('phone', server, clock);
    for (let i = 0; i < 450; i++) await d.queue.enqueue(makeEvent('phone', clock));
    await d.client.push();
    expect(PUSH_BATCH).toBe(200);
    expect(server.pushedBatchSizes).toEqual([200, 200, 50]);
    expect(server.events.size).toBe(450);
  });

  it('a transport failure keeps every row, backs off exponentially, and recovers without loss', async () => {
    const clock = makeClock(); const server = new FakeServer(clock); const d = makeDevice('phone', server, clock);
    for (let i = 0; i < 5; i++) await d.queue.enqueue(makeEvent('phone', clock));
    server.failNext = 3;
    const gaps: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await d.client.syncOnce({ force: true });
      expect(r.ok).toBe(false);
      const s = await d.client.status();
      expect(s.pending).toBe(5);
      expect(s.lastError).toBe('network down');
      gaps.push(s.nextRetryAt! - clock.now());
    }
    expect(gaps).toEqual([1000, 2000, 4000]); // baseMs 1000, factor 2, no jitter
    const rows = await d.queue.pending();
    expect(rows.every((r) => r.attempts === 3 && r.lastError === 'network down')).toBe(true);

    // inside the window the client does not try again; after it, it does
    const before = server.pushCalls;
    expect((await d.client.syncOnce()).skipped).toBe('backoff');
    expect(server.pushCalls).toBe(before);
    clock.advance(4001);
    const ok = await d.client.syncOnce();
    expect(ok.ok).toBe(true);
    expect(server.events.size).toBe(5);
    const s = await d.client.status();
    expect(s.pending).toBe(0); expect(s.lastError).toBeUndefined(); expect(s.nextRetryAt).toBeUndefined();
  });

  it('backoff is capped at maxMs and full jitter stays within [0, cap]', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    const d = makeDevice('phone', server, clock, { backoff: { baseMs: 1000, maxMs: 5000, factor: 10, jitter: 1 }, random: () => 0.5 });
    await d.queue.enqueue(makeEvent('phone', clock));
    server.failNext = 3;
    const gaps: number[] = [];
    for (let i = 0; i < 3; i++) { await d.client.push(); gaps.push((await d.client.status()).nextRetryAt! - clock.now()); }
    expect(gaps).toEqual([500, 2500, 2500]);
  });

  it('lost ack: the server stored the batch but the response failed; the retry gets duplicateOf and acks (one copy)', async () => {
    const clock = makeClock(); const server = new FakeServer(clock); const d = makeDevice('phone', server, clock);
    for (let i = 0; i < 4; i++) await d.queue.enqueue(makeEvent('phone', clock));
    server.lostAckNext = 1;
    const first = await d.client.push();
    expect(first.ok).toBe(false);
    expect(server.events.size).toBe(4);         // stored...
    expect(await d.queue.size()).toBe(4);       // ...but the device does not know
    clock.advance(10_000);
    const retry = await d.client.push();
    expect(retry).toMatchObject({ ok: true, acked: 4, duplicates: 4 });
    expect(await d.queue.size()).toBe(0);
    expect(server.events.size).toBe(4);
  });

  it('pull acknowledges own events that were stored behind a lost ack', async () => {
    const clock = makeClock(); const server = new FakeServer(clock); const d = makeDevice('phone', server, clock);
    await d.queue.enqueue(makeEvent('phone', clock));
    server.lostAckNext = 1;
    await d.client.push();
    expect(await d.queue.size()).toBe(1);
    await d.client.pull();
    expect(await d.queue.size()).toBe(0);
  });

  it('a server rejection moves the event to rejected and shows in status; the rest of the batch is acked', async () => {
    const clock = makeClock(); const server = new FakeServer(clock); const d = makeDevice('phone', server, clock);
    const good = makeEvent('phone', clock); await d.queue.enqueue(good);
    // valid for the client, refused by a stricter server
    const strict = makeEvent('phone', clock, { languageId: 'xx' });
    await d.queue.enqueue(strict);
    const orig = server.push.bind(server);
    server.push = async (req) => {
      const resp = await orig({ ...req, events: req.events.filter((e) => e.languageId !== 'xx') });
      resp.outcomes.push({ id: strict.id, stored: false, issues: [{ path: 'languageId', message: 'language not installed' }] });
      return resp;
    };
    const r = await d.client.push();
    expect(r).toMatchObject({ ok: true, acked: 1, rejected: 1 });
    const s = await d.client.status();
    expect(s.pending).toBe(0); expect(s.rejected).toBe(1);
    const rej = await d.queue.rejected();
    expect(rej[0].event.id).toBe(strict.id); expect(rej[0].issues[0].message).toContain('not installed');
    expect(server.events.has(good.id)).toBe(true); expect(server.events.has(strict.id)).toBe(false);
  });

  it('records serverTime and clock skew (client − server) and leaves `at` unchanged', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    server.serverOffsetMs = -3_600_000; // the device clock is one hour ahead
    const d = makeDevice('phone', server, clock);
    const e = makeEvent('phone', clock); await d.queue.enqueue(e);
    await d.client.syncOnce();
    const s = await d.client.status();
    expect(s.skewMs).toBeGreaterThan(3_599_000); expect(s.skewMs).toBeLessThan(3_601_000);
    expect(s.serverTime).toBeTruthy(); expect(s.head).toBe(1);
    expect(server.events.get(e.id)!.at).toBe(e.at);
    expect(d.local.events.get(e.id)!.at).toBe(e.at);
  });

  it('a duplicate dedupeKey from another device is success (duplicateOf), not an error', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    const a = makeDevice('phone', server, clock); const b = makeDevice('laptop', server, clock);
    await a.queue.enqueue(makeEvent('phone', clock, { dedupeKey: 'review:card-1:t1' }));
    await b.queue.enqueue(makeEvent('laptop', clock, { dedupeKey: 'review:card-1:t1' }));
    await a.client.push();
    const r = await b.client.push();
    expect(r).toMatchObject({ ok: true, acked: 1, duplicates: 1 });
    expect(server.events.size).toBe(1);
    expect(await b.queue.size()).toBe(0);
  });

  it('reports status through onStatus', async () => {
    const clock = makeClock(); const server = new FakeServer(clock); const seen: SyncStatus[] = [];
    const d = makeDevice('phone', server, clock, { onStatus: (s) => seen.push(s) });
    await d.queue.enqueue(makeEvent('phone', clock));
    await d.client.syncOnce();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toMatchObject({ pending: 0, online: true });
    expect(seen.at(-1)!.lastPushAt).toBe(clock.now());
  });

  it('start() polls and retries at nextRetryAt through injected timers; stop() halts it', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    const scheduled: Array<{ fn: () => void; ms: number; cleared?: boolean }> = [];
    const d = makeDevice('phone', server, clock, { timers: { set: (fn, ms) => { const t = { fn, ms }; scheduled.push(t); return t; }, clear: (h) => { (h as { cleared?: boolean }).cleared = true; } } });
    await d.queue.enqueue(makeEvent('phone', clock));
    server.failNext = 1;
    d.client.start(30_000);
    await new Promise((r) => setTimeout(r, 20));
    expect(scheduled[0].ms).toBe(1000); // retry window after the failure
    clock.advance(1000);
    scheduled[0].fn();
    await new Promise((r) => setTimeout(r, 20));
    expect(server.events.size).toBe(1);
    expect(scheduled[1].ms).toBe(30_000);
    d.client.stop();
    expect(scheduled[1].cleared).toBe(true);
  });
});

describe('pull', () => {
  it('applies events to the local log idempotently and advances the cursor', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    const a = makeDevice('phone', server, clock); const b = makeDevice('laptop', server, clock);
    for (let i = 0; i < 7; i++) await a.queue.enqueue(makeEvent('phone', clock));
    await a.client.push();
    const r1 = await b.client.pull();
    expect(r1).toMatchObject({ ok: true, received: 7, appended: 7, cursor: 7 });
    expect(b.local.events.size).toBe(7);
    // pulling again from the same cursor returns nothing; forcing a re-read of the page is idempotent too
    const r2 = await b.client.pull();
    expect(r2).toMatchObject({ received: 0, appended: 0 });
    await b.area.set({ 'sync:cursor': 0 });
    const r3 = await b.client.pull();
    expect(r3).toMatchObject({ received: 7, appended: 0, duplicates: 7 });
    expect(b.local.events.size).toBe(7);
    expect((await b.client.status()).cursor).toBe(7);
    expect((await b.client.status()).lastPullAt).toBe(clock.now());
  });

  it('advances the cursor only after the local append succeeds', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    const a = makeDevice('phone', server, clock); const b = makeDevice('laptop', server, clock);
    for (let i = 0; i < 3; i++) await a.queue.enqueue(makeEvent('phone', clock));
    await a.client.push();
    b.local.failNext = 1;
    const bad = await b.client.pull();
    expect(bad.ok).toBe(false);
    expect((await b.client.status()).cursor).toBe(0);
    expect((await b.client.status()).lastError).toBe('local store unavailable');
    expect(b.local.events.size).toBe(0);
    const good = await b.client.pull();
    expect(good).toMatchObject({ ok: true, appended: 3, cursor: 3 });
  });

  it('pages through a long log and does not reorder by `at` (server seq is authoritative)', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    const a = makeDevice('phone', server, clock); const b = makeDevice('laptop', server, clock, { pullLimit: 4 });
    // created newest-first on purpose: `at` decreases while seq increases
    const evs = [];
    for (let i = 0; i < 10; i++) { clock.advance(-1000); evs.push(makeEvent('phone', clock)); }
    for (const e of evs) await a.queue.enqueue(e);
    await a.client.push();
    const r = await b.client.pull();
    expect(r).toMatchObject({ received: 10, appended: 10, cursor: 10 });
    expect([...b.local.events.values()].sort((x, y) => x.seq - y.seq).map((e) => e.id)).toEqual(
      [...server.events.values()].sort((x, y) => x.seq - y.seq).map((e) => e.id));
    expect(server.pullCalls).toBe(3);
  });

  it('quarantines a pulled event the local log refuses, and moves past it', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    const a = makeDevice('phone', server, clock); const b = makeDevice('laptop', server, clock);
    const e1 = makeEvent('phone', clock); const e2 = makeEvent('phone', clock);
    await a.queue.enqueue(e1); await a.queue.enqueue(e2); await a.client.push();
    const orig = b.local.append.bind(b.local);
    b.local.append = async (l, evs) => (await orig(l, evs.filter((e) => e.id !== e1.id))).concat([{ id: e1.id, stored: false, issues: [{ path: 'kind', message: 'unknown event kind' }] }]);
    const r = await b.client.pull();
    expect(r).toMatchObject({ ok: true, appended: 1, quarantined: 1, cursor: 2 });
    expect((await b.client.status()).quarantined).toBe(1);
  });
});
