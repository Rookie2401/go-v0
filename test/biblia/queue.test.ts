/**
 * The offline queue of the standalone Biblia (packages/biblia/src/queue.ts) and the account recorder that sends from it (repo.ts `accountRecorder`):
 * kept under 'biblia:queue', capped at 2,000 events (oldest dropped, and the caller told), flushed in order, kept while the service cannot be
 * reached, refused events dropped one at a time, flushed again on the window's 'online' event. Fake RepositoryApi objects only: no network.
 */
import { describe, expect, it, vi } from 'vitest';
import { QUEUE_CAP, QUEUE_KEY, createEventQueue } from '../../packages/biblia/src/queue';
import { accountRecorder } from '../../packages/biblia/src/repo';
import type { GoEvent } from '../../packages/repository-contract/src';
import type { ApiResult, EventsResponse, RepositoryApi } from '../../packages/repository-service/src/api';

function memoryStorage(opts: { maxChars?: number } = {}): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { if (opts.maxChars !== undefined && String(v).length > opts.maxChars) throw new Error('QuotaExceededError'); data.set(k, String(v)); },
  };
}
let n = 0;
const ev = (learnerId = 'L1', over: Partial<GoEvent> = {}): GoEvent => ({ id: `e${++n}`, v: 1, learnerId, enrolmentId: 'enr1', languageId: 'he', at: '2026-10-22T12:00:00.000Z', producer: { app: 'golearn-ext', version: '0.1.0', deviceId: 'D1' }, kind: 'SelectionLookedUp', subject: { itemIds: ['form:he:x'] }, payload: {}, ...over } as GoEvent);

describe('the offline queue', () => {
  it('keeps events under biblia:queue, in order, and a new queue over the same storage finds them', () => {
    const st = memoryStorage();
    const q = createEventQueue(st);
    const a = ev(); const b = ev(); const c = ev('L2');
    expect(q.push([a, b, c])).toEqual({ dropped: 0 });
    expect(JSON.parse(st.getItem(QUEUE_KEY)!).map((e: GoEvent) => e.id)).toEqual([a.id, b.id, c.id]);
    const again = createEventQueue(st);
    expect(again.size()).toBe(3);
    expect(again.peek('L1', 10).map((e) => e.id)).toEqual([a.id, b.id]); // one learner's own, oldest first
    expect(again.count('L2')).toBe(1);
  });

  it('an event already held is not queued twice; removing the last one clears the key', () => {
    const st = memoryStorage();
    const q = createEventQueue(st);
    const a = ev();
    q.push([a]); q.push([a]);
    expect(q.size()).toBe(1);
    q.remove([a.id]);
    expect(q.size()).toBe(0);
    expect(st.data.has(QUEUE_KEY)).toBe(false);
  });

  it('holds at most 2,000 events: the oldest are dropped and the caller is told how many', () => {
    expect(QUEUE_CAP).toBe(2000);
    const st = memoryStorage();
    const q = createEventQueue(st);
    const first = ev();
    q.push([first]);
    const many = Array.from({ length: QUEUE_CAP }, () => ev());
    expect(q.push(many)).toEqual({ dropped: 1 });
    expect(q.size()).toBe(QUEUE_CAP);
    expect(q.peek('L1', 1)[0].id).toBe(many[0].id); // the very first was the one dropped
    expect(createEventQueue(st).size()).toBe(QUEUE_CAP);
  });

  it('when the browser refuses the write (storage full) the oldest tenth goes and the rest is kept', () => {
    const one = JSON.stringify(ev()).length;
    const st = memoryStorage({ maxChars: one * 20 });
    const q = createEventQueue(st);
    const r = q.push(Array.from({ length: 30 }, () => ev()));
    expect(r.dropped).toBeGreaterThan(0);
    expect(q.size() + r.dropped).toBe(30);
    expect(st.getItem(QUEUE_KEY)).not.toBeNull();
  });

  it('damaged storage or no storage gives an empty queue that still works in memory', () => {
    const st = memoryStorage();
    st.setItem(QUEUE_KEY, '{oops');
    expect(createEventQueue(st).size()).toBe(0);
    st.setItem(QUEUE_KEY, JSON.stringify([{ nope: 1 }, ev()]));
    expect(createEventQueue(st).size()).toBe(1);
    const mem = createEventQueue(undefined);
    mem.push([ev()]);
    expect(mem.size()).toBe(1);
  });
});

// ── the recorder over a fake api ──
type Append = (events: GoEvent[]) => Promise<ApiResult<EventsResponse>>;
const okResult = (events: GoEvent[]): ApiResult<EventsResponse> => ({ ok: true, status: 201, data: { outcomes: [], stored: events.length, duplicates: 0, head: 1, projected: true } });
const refused = (status: number, message = 'no'): ApiResult<EventsResponse> => ({ ok: false, status, error: 'error', message, body: {} });
function fakeApi(append: Append): RepositoryApi & { appendEvents: ReturnType<typeof vi.fn> } {
  return {
    token: 'tok-fake',
    appendEvents: vi.fn(append),
    listEnrolments: vi.fn(async () => ({ ok: true, status: 200, data: { enrolments: [{ enrolmentId: 'enr-he', languageId: 'he', varietyId: 'he-bib' }] } })),
    enrol: vi.fn(),
  } as unknown as RepositoryApi & { appendEvents: ReturnType<typeof vi.fn> };
}
function setup(append: Append, opts: { signedIn?: boolean } = {}) {
  const api = fakeApi(append);
  const st = memoryStorage();
  const queue = createEventQueue(st);
  let signedIn = opts.signedIn ?? true;
  const appended: string[] = [];
  const authEnded = vi.fn();
  const listeners = new Map<string, () => void>();
  const win = { addEventListener: (t: string, f: () => void) => { listeners.set(t, f); }, removeEventListener: (t: string) => { listeners.delete(t); } };
  const rec = accountRecorder({
    session: () => (signedIn ? { api, learnerId: 'L1', deviceId: 'biblia:web:d' } : undefined),
    queue, storage: st, win: win as never, onAppended: (e) => appended.push(...e.map((x) => x.id)), onAuthExpired: authEnded,
  });
  return { api, st, queue, rec, appended, authEnded, listeners, signOut: () => { signedIn = false; } };
}

describe('the account recorder', () => {
  it('is mode "account" while signed in and "none" with the sign-in reason when not', () => {
    const s = setup(async (e) => okResult(e));
    expect(s.rec.mode).toBe('account');
    expect(s.rec.reason).toBeUndefined();
    s.signOut();
    expect(s.rec.mode).toBe('none');
    expect(s.rec.reason).toMatch(/Sign in to record what you read/);
  });

  it('sends a recorded event through the queue and leaves the queue empty', async () => {
    const s = setup(async (e) => okResult(e));
    const e1 = ev();
    expect(await s.rec.record([e1])).toEqual({ ok: true });
    expect(s.api.appendEvents).toHaveBeenCalledTimes(1);
    expect(s.queue.size()).toBe(0);
    expect(s.appended).toEqual([e1.id]);
  });

  it('signed out, nothing is queued or sent', async () => {
    const s = setup(async (e) => okResult(e), { signedIn: false });
    const r = await s.rec.record([ev()]);
    expect(r.ok).toBe(false);
    expect(s.queue.size()).toBe(0);
    expect(s.api.appendEvents).not.toHaveBeenCalled();
  });

  it('keeps events while the service cannot be reached, says so, and sends them in order on the next flush', async () => {
    let down = true;
    const sent: string[] = [];
    const s = setup(async (e) => { if (down) throw new TypeError('network down'); sent.push(...e.map((x) => x.id)); return okResult(e); });
    const a = ev(); const b = ev();
    const r1 = await s.rec.record([a]);
    expect(r1).toMatchObject({ ok: true, queued: true });
    expect(r1.message).toMatch(/Saved on this device \(1 waiting\)/);
    await s.rec.record([b]);
    expect(s.rec.pending()).toBe(2);
    expect(JSON.parse(s.st.getItem(QUEUE_KEY)!)).toHaveLength(2);
    down = false;
    const f = await s.rec.flush();
    expect(f).toMatchObject({ status: 'ok', sent: 2, pending: 0 });
    expect(sent).toEqual([a.id, b.id]);
    expect(s.st.data.has(QUEUE_KEY)).toBe(false);
  });

  it('a 5xx or 429 keeps the events; the window online event flushes them', async () => {
    let status = 503;
    const s = setup(async (e) => (status ? refused(status) : okResult(e)));
    await s.rec.record([ev()]);
    expect(s.rec.pending()).toBe(1);
    status = 0;
    s.listeners.get('online')!();
    await vi.waitFor(() => expect(s.rec.pending()).toBe(0));
    s.rec.destroy();
    expect(s.listeners.has('online')).toBe(false);
  });

  it('a 401 keeps the events, reports the session as ended and does not retry in a loop', async () => {
    const s = setup(async () => refused(401, 'expired'));
    const r = await s.rec.record([ev()]);
    expect(r).toMatchObject({ ok: false, queued: true });
    expect(r.message).toMatch(/Sign in again/);
    expect(s.authEnded).toHaveBeenCalledTimes(1);
    expect(s.api.appendEvents).toHaveBeenCalledTimes(1);
    expect(s.rec.pending()).toBe(1);
  });

  it('an event the service refuses for good is dropped on its own; the others still go', async () => {
    const bad = ev('L1', { kind: 'Bogus' as never });
    const good1 = ev(); const good2 = ev();
    const s = setup(async (events) => (events.some((e) => e.id === bad.id) ? refused(422, 'invalid event') : okResult(events)));
    await s.rec.record([good1, bad, good2]);
    expect(s.queue.size()).toBe(0);
    expect(s.appended.sort()).toEqual([good1.id, good2.id].sort());
  });

  it('sends only the signed-in learner events: another account stays queued for when it signs in', async () => {
    const s = setup(async (e) => okResult(e));
    const theirs = ev('L2');
    s.queue.push([theirs]);
    await s.rec.record([ev('L1')]);
    expect(s.queue.peek('L2', 10).map((e) => e.id)).toEqual([theirs.id]);
    expect((s.api.appendEvents.mock.calls.flat(2) as GoEvent[]).every((e) => e.learnerId === 'L1')).toBe(true);
  });

  it('identity: the enrolment is looked up once, remembered, and a lookup offline still has its identity', async () => {
    const s = setup(async (e) => okResult(e));
    const first = await s.rec.identity('he', 'he-bib');
    expect(first).toEqual({ learnerId: 'L1', enrolmentId: 'enr-he', deviceId: 'biblia:web:d' });
    (s.api.listEnrolments as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('network down'));
    expect(await s.rec.identity('he', 'he-bib')).toEqual(first);
    expect(s.api.listEnrolments).toHaveBeenCalledTimes(1);
    expect(await s.rec.identity('el', 'el-koi')).toBeUndefined(); // unknown and unreachable: no identity, no exception
  });

  it('tells the learner when the offline queue overflowed', async () => {
    const s = setup(async () => { throw new TypeError('down'); });
    s.queue.push(Array.from({ length: QUEUE_CAP }, () => ev()));
    const r = await s.rec.record([ev()]);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/1 of the oldest events .* dropped/);
  });
});
