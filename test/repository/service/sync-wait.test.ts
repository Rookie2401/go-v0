// @vitest-environment node
/** GET /sync/status and POST /sync/wait: the change cursor and the long-poll that lets another device learn of new events within seconds. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handle } from '../../../packages/repository-service/src/handler';
import { MAX_WAITERS_PER_LEARNER, createChangeNotifier } from '../../../packages/repository-service/src/notifier';
import { createHarness, makeEvent, raw, signUp } from './fakes';

type H = ReturnType<typeof createHarness>;
type S = Awaited<ReturnType<typeof signUp>>;
const push = (h: H, s: S, n = 1) =>
  raw(h, 'POST', '/sync/push', { token: s.token, body: { deviceId: s.deviceId, clientTime: h.clock.now(), events: Array.from({ length: n }, () => makeEvent(s, s.enrolmentId ? { enrolmentId: s.enrolmentId } : {})) } });
const wait = (h: H, token: string, body: Record<string, unknown>) => raw(h, 'POST', '/sync/wait', { token, body });
const settle = async (): Promise<void> => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

afterEach(() => { vi.useRealTimers(); });

describe('GET /sync/status', () => {
  it('reports the cursor, the event count and the server time; the cursor is what /sync/pull takes', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const empty = await raw(h, 'GET', '/sync/status', { token: s.token });
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ cursor: '1', events: 1, at: h.clock.now() });
    const base = 1;
    expect((await push(h, s, 3)).status).toBe(200);
    const after = await raw(h, 'GET', '/sync/status', { token: s.token });
    expect(after.body).toMatchObject({ cursor: String(base + 3), events: base + 3 });
    await push(h, s, 1);
    const pulled = await raw(h, 'POST', '/sync/pull', { token: s.token, body: { deviceId: s.deviceId, afterSeq: Number(after.body.cursor) } });
    expect(pulled.body.events).toHaveLength(1);
  });

  it('is per learner, needs a sign-in, and has CORS headers', async () => {
    const h = createHarness();
    const ana = await signUp(h, 'ana@example.com');
    const ben = await signUp(h, 'ben@example.com');
    await push(h, ana, 2);
    expect((await raw(h, 'GET', '/sync/status', { token: ben.token })).body).toMatchObject({ cursor: '1', events: 1 });
    expect((await raw(h, 'GET', '/sync/status')).status).toBe(401);
    const ok = await raw(h, 'GET', '/sync/status', { token: ana.token });
    expect(ok.headers.get('access-control-allow-origin')).toBe('*');
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect((await raw(h, 'GET', '/sync/status?learnerId=someone-else', { token: ana.token })).status).toBe(403);
  });
});

describe('POST /sync/wait', () => {
  it('answers at once when events newer than the cursor already exist, and does not count against the waiter cap', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    await push(h, s, 2);
    const r = await wait(h, s.token, { since: '0' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ changed: true, cursor: '3', events: 3 });
    for (let i = 0; i < 8; i++) expect((await wait(h, s.token, { since: '1' })).body.changed).toBe(true);
  });

  it('resolves when a push lands: two concurrent waiters both wake, with the new cursor', async () => {
    vi.useFakeTimers();
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const a = wait(h, s.token, { since: '1' });
    const b = wait(h, s.token, { since: '1', timeoutMs: 10_000 });
    let doneA = false;
    void a.then(() => { doneA = true; });
    await settle();
    expect(doneA).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(doneA).toBe(false);
    await push(h, s, 1);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.body).toEqual({ changed: true, cursor: '2', events: 2 });
    expect(rb.body).toEqual({ changed: true, cursor: '2', events: 2 });
    expect(vi.getTimerCount()).toBe(0); // no timer left behind
  });

  it('is also woken by the other append paths (POST /events)', async () => {
    vi.useFakeTimers();
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const head = (await raw(h, 'GET', '/sync/status', { token: s.token })).body.cursor as string;
    const w = wait(h, s.token, { since: head });
    await settle();
    const r = await raw(h, 'POST', '/events', { token: s.token, body: { events: [makeEvent(s, s.enrolmentId ? { enrolmentId: s.enrolmentId } : {})] } });
    expect(r.status).toBe(200);
    expect((await w).body.changed).toBe(true);
  });

  it('times out with changed:false and the current cursor (default 25 s; a longer request is clamped to 25 s)', async () => {
    vi.useFakeTimers();
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    await push(h, s, 2);
    const short = wait(h, s.token, { since: '3', timeoutMs: 3_000 });
    const dflt = wait(h, s.token, { since: '3' });
    const huge = wait(h, s.token, { since: '3', timeoutMs: 600_000 });
    await settle();
    let dfltDone = false, hugeDone = false;
    void dflt.then(() => { dfltDone = true; }); void huge.then(() => { hugeDone = true; });
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await short).body).toEqual({ changed: false, cursor: '3', events: 3 });
    await vi.advanceTimersByTimeAsync(21_999);
    expect(dfltDone || hugeDone).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await dflt).body).toEqual({ changed: false, cursor: '3', events: 3 });
    expect((await huge).body.changed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refuses the fifth concurrent waiter with 429 too-many-waiters, and frees the slot when one returns', async () => {
    vi.useFakeTimers();
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const held = Array.from({ length: MAX_WAITERS_PER_LEARNER }, () => wait(h, s.token, { since: '1', timeoutMs: 5_000 }));
    await settle();
    const fifth = await wait(h, s.token, { since: '1' });
    expect(fifth.status).toBe(429);
    expect(fifth.body.error).toBe('too-many-waiters');
    expect(fifth.headers.get('retry-after')).toBe('5');
    // another learner is not affected
    const ben = await signUp(h, 'ben@example.com');
    const other = wait(h, ben.token, { since: '1', timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.all(held);
    expect((await other).body.changed).toBe(false);
    const again = wait(h, s.token, { since: '1', timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await again).status).toBe(200);
  });

  it('needs a sign-in (401), validates the body (422), refuses another learner (403) and other methods (405)', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    expect((await raw(h, 'POST', '/sync/wait', { body: { since: '0' } })).status).toBe(401);
    expect((await wait(h, 'not-a-token', { since: '0' })).status).toBe(401);
    for (const bad of [{}, { since: 3 }, { since: 'abc' }, { since: '-1' }, { since: '1.5' }, { since: '0', timeoutMs: 'soon' }, { since: '0', timeoutMs: -1 }]) {
      expect((await wait(h, s.token, bad)).status, JSON.stringify(bad)).toBe(422);
    }
    expect((await wait(h, s.token, { since: '0', learnerId: 'someone-else' })).status).toBe(403);
    expect((await raw(h, 'GET', '/sync/wait', { token: s.token })).status).toBe(405);
  });

  it('is not woken by another learner push', async () => {
    vi.useFakeTimers();
    const h = createHarness();
    const ana = await signUp(h, 'ana@example.com');
    const ben = await signUp(h, 'ben@example.com');
    const w = wait(h, ana.token, { since: '1', timeoutMs: 4_000 });
    let done = false;
    void w.then(() => { done = true; });
    await settle();
    await push(h, ben, 3);
    await settle();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(4_000);
    expect((await w).body).toEqual({ changed: false, cursor: '1', events: 1 });
  });

  it('a poke that finds nothing new (an empty push) leaves the waiter waiting', async () => {
    vi.useFakeTimers();
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const w = wait(h, s.token, { since: '1', timeoutMs: 4_000 });
    let done = false;
    void w.then(() => { done = true; });
    await settle();
    await raw(h, 'POST', '/sync/push', { token: s.token, body: { deviceId: s.deviceId, clientTime: h.clock.now(), events: [] } });
    await settle();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(4_000);
    expect((await w).body.changed).toBe(false);
  });

  it('answers a cursor that is ahead of the log (it was emptied) as changed, so the device looks again', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    await push(h, s, 1);
    expect((await wait(h, s.token, { since: '9' })).body).toEqual({ changed: true, cursor: '2', events: 2 });
  });

  it('stops waiting when the client goes away (abort) and leaves nothing behind', async () => {
    vi.useFakeTimers();
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const ctl = new AbortController();
    const p = handle(new Request('http://repository.local/sync/wait', { method: 'POST', headers: { Authorization: `Bearer ${s.token}` }, body: JSON.stringify({ since: '1' }), signal: ctl.signal }), h.deps);
    await settle();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    ctl.abort();
    const res = await p;
    expect(res.status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('answers the CORS preflight and sets the CORS headers on the long-poll answer', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const pre = await raw(h, 'OPTIONS', '/sync/wait');
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect(pre.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
    await push(h, s, 1);
    const r = await wait(h, s.token, { since: '0' });
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
});

describe('the change notifier', () => {
  it('closeAll resolves every waiter with changed:false, clears the timers, and later waits return at once', async () => {
    vi.useFakeTimers();
    const n = createChangeNotifier();
    const check = async (): Promise<boolean> => false;
    const waits = ['a', 'a', 'b'].map((l) => n.wait(l, { timeoutMs: 25_000, check })!);
    await settle();
    expect(n.size()).toBe(3);
    n.closeAll();
    expect((await Promise.all(waits)).map((w) => w.changed)).toEqual([false, false, false]);
    expect(n.size()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect((await n.wait('a', { timeoutMs: 25_000, check }))!.changed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a check that throws is a "no" and does not end or crash the wait', async () => {
    vi.useFakeTimers();
    const n = createChangeNotifier();
    const w = n.wait('a', { timeoutMs: 1_000, check: async () => { throw new Error('store down'); } })!;
    n.poke('a');
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await w).changed).toBe(false);
  });

  it('through the handler: a service shutdown (closeAll on the wired notifier) resolves the held request', async () => {
    vi.useFakeTimers();
    const h = createHarness();
    const notifier = createChangeNotifier();
    h.deps.notifier = notifier;
    const s = await signUp(h, 'ana@example.com');
    const w = wait(h, s.token, { since: '1' });
    await settle();
    expect(notifier.size()).toBe(1);
    notifier.closeAll();
    expect((await w).body).toEqual({ changed: false, cursor: '1', events: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
