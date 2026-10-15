// @vitest-environment jsdom
/**
 * What makes GoReview's sync quick and consistent on the phone: a home load asks the service for as little as it can (and for the independent
 * parts together), a new event is sent at once even while the sync client is backing off, a pull that brought events drops the cached profile,
 * the backoff is short, and Settings says plainly where the sync stands.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FORCED_PUSH_GAP_MS, SYNC_BACKOFF_MAX_MS, defaultTransport } from '../../packages/gopractice/context';
import { KNOWLEDGE_PARALLEL } from '../../packages/gopractice/workspace';
import { ago, syncLine } from '../../packages/gopractice/screens/settings';
import type { RepositoryApi } from '../../packages/repository-service/src/api';
import type { SyncStatus } from '../../packages/repository-sync/src';
import { candidate, cardAdded, defaultService, destroyRigs, flush, ids, knowledgeRow, makeRig, queued, until, type FakeService } from './helpers';

afterEach(() => { destroyRigs(); vi.restoreAllMocks(); });

const A = ids('L1', 'sq');

/** Counts every call made on the typed API the app uses, by method name, and how many `knowledge` calls were in flight together. */
function countCalls(service: FakeService) {
  const counts: Record<string, number> = {};
  const flight = { now: 0, max: 0 };
  const original = service.api.bind(service);
  service.api = (token?: string): RepositoryApi => {
    const api = original(token) as unknown as Record<string, unknown>;
    return new Proxy(api, {
      get(target, key) {
        const v = target[key as string];
        if (typeof v !== 'function') return v;
        return (...args: unknown[]) => {
          counts[String(key)] = (counts[String(key)] ?? 0) + 1;
          if (key !== 'knowledge') return (v as (...a: unknown[]) => unknown).apply(target, args);
          flight.now += 1; flight.max = Math.max(flight.max, flight.now);
          return new Promise((resolve, reject) => setTimeout(() => {
            (Promise.resolve((v as (...a: unknown[]) => unknown).apply(target, args)) as Promise<unknown>).then(resolve, reject).finally(() => { flight.now -= 1; });
          }, 5));
        };
      },
    }) as unknown as RepositoryApi;
  };
  return { counts, flight };
}

describe('a GoReview start', () => {
  it('makes one profile read, one candidate read per page, one sync pull, and asks for the knowledge batches together', async () => {
    const service = defaultService();
    // 450 candidates: three knowledge batches of 200, 200 and 50 units
    const cands = Array.from({ length: 450 }, (_, i) => candidate(`w${i}`, 1 - i / 1000));
    service.candidates.set(A.enrolmentId, cands);
    service.knowledge.set('L1', cands.map((c) => knowledgeRow('L1', c.unitId, 'sq', {})));
    const calls = countCalls(service);
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.whenSynced();
    await until(() => !!rig.root.querySelector('#review-home > *'), 'the home');
    const c = calls.counts;
    expect(c.createSession).toBe(1);
    expect(c.me ?? 0).toBeLessThanOrEqual(1);
    expect(c.listEnrolments ?? 0).toBeLessThanOrEqual(1);
    expect(c.syncPull).toBe(1);
    expect(c.candidates).toBe(1);       // one page: the fake service answers all 450 in one
    expect(c.knowledge).toBe(3);        // 450 units in batches of 200
    expect(KNOWLEDGE_PARALLEL).toBeGreaterThanOrEqual(3);
    expect(calls.flight.max).toBe(3);   // together, not one after another
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(10); // the whole start: sign-in, profile, enrolments, pull, candidates, knowledge x3 (+ one spare)
  });

  it('asks the service for no documents in a pull (this app keeps none in its sync client)', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const api = { syncPull: async (req: Record<string, unknown>) => { seen.push(req); return { ok: true as const, status: 200, data: { events: [], documents: [], head: 0, serverTime: 'now' } }; }, syncPush: async () => ({ ok: true as const, status: 200, data: {} }) } as unknown as RepositoryApi;
    await defaultTransport(api).pull({ deviceId: 'd', afterSeq: 5, limit: 200 });
    expect(seen).toEqual([{ deviceId: 'd', afterSeq: 5, limit: 200, documents: false }]);
  });
});

describe('the cached profile', () => {
  it('is dropped by a pull that brought events from another device: the next read asks the service again', async () => {
    const service = defaultService();
    const calls = countCalls(service);
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.whenSynced();
    await rig.app.ctx.enrolments();
    const meBefore = calls.counts.me ?? 0;
    await rig.app.ctx.enrolments();
    expect(calls.counts.me ?? 0).toBe(meBefore); // within ten minutes the cache answers
    // GoLearn on the desktop enrols a second language and reads in it: an event arrives
    service.enrolments.get('L1')!.push({ enrolmentId: 'L1-e2', learnerId: 'L1', packId: 'pack-de', packVersion: '1', goals: [], startedAt: '2026-10-01T00:00:00.000Z', languageId: 'de' });
    service.inject('L1', cardAdded(A, 'mace', 'meaning-to-form', '2026-10-08T09:00:00.000Z'));
    rig.clock.set('2026-10-08T10:01:00.000Z'); // a minute later: well inside the ten-minute lifetime
    const r = await rig.app.ctx.syncNow({ force: true });
    expect(r?.pull?.appended).toBe(1);
    const list = await rig.app.ctx.enrolments();
    expect(calls.counts.me ?? 0).toBe(meBefore + 1);
    expect(list.map((e) => e.languageId).sort()).toEqual(['de', 'sq']);
  });

  it('is kept by a pull that brought nothing new', async () => {
    const service = defaultService();
    const calls = countCalls(service);
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.whenSynced();
    await rig.app.ctx.enrolments();
    const meBefore = calls.counts.me ?? 0;
    rig.clock.set('2026-10-08T10:01:00.000Z');
    await rig.app.ctx.syncNow({ force: true });
    await rig.app.ctx.enrolments();
    expect(calls.counts.me ?? 0).toBe(meBefore);
  });
});

describe('a new event while the service is hard to reach', () => {
  it('is sent at once when the service is back, even though the sync client is still backing off', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1); // no jitter: five failures put the next automatic attempt 30 s away
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.whenSynced();
    rig.deps.autoSync = true;
    service.netDown = true;
    await rig.app.ctx.record([cardAdded(A, 'zog', 'meaning-to-form', '2026-10-08T09:00:00.000Z')]);
    for (let i = 0; i < 5; i++) await rig.app.ctx.syncNow({ force: true });
    const status = await rig.app.ctx.syncView();
    expect(status.status?.lastError).toBeTruthy();
    expect(status.status!.nextRetryAt! - rig.clock.now.getTime()).toBeGreaterThanOrEqual(SYNC_BACKOFF_MAX_MS - 1);
    expect(status.status!.nextRetryAt! - rig.clock.now.getTime()).toBeLessThanOrEqual(SYNC_BACKOFF_MAX_MS);
    service.netDown = false;
    rig.clock.set('2026-10-08T10:00:06.000Z'); // six seconds on, 24 s of backoff left
    await rig.app.ctx.record([cardAdded(A, 'mace', 'meaning-to-form', '2026-10-08T09:00:00.000Z')]);
    await until(async () => (await queued(rig)).length === 0, 'both events to be sent');
    expect(service.storedEvents('L1')).toHaveLength(2);
  });

  it('is not hammered at: while the service keeps failing, a forced attempt comes at most every few seconds', async () => {
    const service = defaultService();
    const calls = countCalls(service);
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.whenSynced();
    rig.deps.autoSync = true;
    service.netDown = true;
    const attempts = (): number => calls.counts.syncPush ?? 0;
    await rig.app.ctx.record([cardAdded(A, 'zog', 'meaning-to-form', '2026-10-08T09:00:00.000Z')]);
    await until(() => attempts() >= 1, 'the first attempt');
    await rig.app.ctx.whenSynced();
    const first = attempts();
    expect(first).toBeGreaterThanOrEqual(1);
    await rig.app.ctx.record([cardAdded(A, 'mace', 'meaning-to-form', '2026-10-08T09:00:00.000Z')]);
    await flush(10);
    await rig.app.ctx.whenSynced();
    expect(attempts()).toBe(first); // inside the gap: the backoff decides
    rig.clock.set(new Date(rig.clock.now.getTime() + FORCED_PUSH_GAP_MS + 1).toISOString());
    await rig.app.ctx.record([cardAdded(A, 'qen', 'meaning-to-form', '2026-10-08T09:00:00.000Z')]);
    await until(() => attempts() > first, 'a forced attempt after the gap');
  });

  it('the longest backoff is half a minute', () => {
    expect(SYNC_BACKOFF_MAX_MS).toBe(30_000);
  });
});

const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({ pending: 0, rejected: 0, quarantined: 0, corrupt: 0, notes: [], dirtyDocuments: 0, cursor: 0, online: true, conflictCopies: [], ...over });
const NOW = Date.parse('2026-10-08T10:00:00.000Z');

describe('the Sync line in Settings', () => {
  it('says how long ago things happened', () => {
    expect(ago(NOW - 3_000, NOW)).toBe('just now');
    expect(ago(NOW - 40_000, NOW)).toBe('40 s ago');
    expect(ago(NOW - 5 * 60_000, NOW)).toBe('5 min ago');
    expect(ago(NOW - 3 * 3600_000, NOW)).toBe('3 h ago');
  });

  it('is plain about each state', () => {
    const v = (s: SyncStatus | undefined, extra: { authExpired?: boolean; syncing?: boolean } = {}) => ({ status: s, authExpired: extra.authExpired ?? false, syncing: extra.syncing ?? false });
    expect(syncLine(v(status({ lastPushAt: NOW - 120_000, lastPullAt: NOW - 30_000 })), 'account', NOW)).toEqual({ text: 'Up to date · sent 2 min ago · fetched 30 s ago · nothing waiting', kind: 'ok' });
    expect(syncLine(v(status({ pending: 3, lastPushAt: NOW - 120_000 })), 'account', NOW).text).toBe('Waiting to send · sent 2 min ago · nothing fetched yet · 3 waiting on this device');
    expect(syncLine(v(status({ pending: 2, lastError: 'fetch failed', nextRetryAt: NOW + 12_000 })), 'account', NOW)).toEqual({ text: 'Not reaching the service: fetch failed · 2 waiting on this device · trying again in 12 s', kind: 'error' });
    expect(syncLine(v(status({ lastError: 'x', nextRetryAt: NOW - 1 })), 'account', NOW).text).toMatch(/trying again now$/);
    expect(syncLine(v(status({ online: false, pending: 1 })), 'account', NOW).text).toBe('Offline · 1 waiting on this device · will send when the connection returns');
    expect(syncLine(v(status(), { authExpired: true }), 'account', NOW)).toEqual({ text: 'Sign in again to sync. Nothing on this device was lost.', kind: 'error' });
    expect(syncLine(v(status(), { syncing: true }), 'account', NOW).text).toBe('Syncing · nothing waiting');
    expect(syncLine(v(undefined), 'account', NOW).text).toBe('Sync has not started yet.');
    expect(syncLine(v(undefined), 'device', NOW).text).toMatch(/^On this device only/);
    expect(syncLine(v(undefined), 'none', NOW).text).toBe('Not signed in.');
  });

  it('is on the Settings page, above the facts, and follows a failure and a recovery', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.whenSynced();
    await rig.go('settings');
    await until(() => !!rig.root.querySelector('#sync-line'), 'the sync line');
    expect(rig.q('#sync-line').textContent).toMatch(/^Up to date · sent (just now|never)|^Up to date · nothing sent yet · fetched just now · nothing waiting$/);
    expect(rig.q('#sync-line').getAttribute('data-kind')).toBe('ok');
    expect(rig.q('#sync-line').nextElementSibling?.id).toBe('sync-facts');
    await rig.app.ctx.record([cardAdded(A, 'zog', 'meaning-to-form', '2026-10-08T09:00:00.000Z')]);
    service.netDown = true;
    await rig.app.ctx.syncNow({ force: true });
    await until(() => /Not reaching the service/.test(rig.q('#sync-line').textContent ?? ''), 'the failure to show');
    expect(rig.q('#sync-line').textContent).toContain('1 waiting on this device');
    expect(rig.q('#sync-line').getAttribute('data-kind')).toBe('error');
    service.netDown = false;
    rig.clock.set('2026-10-08T10:05:00.000Z');
    rig.q('#sync-now').click();
    await until(() => /^Up to date/.test(rig.q('#sync-line').textContent ?? ''), 'the recovery to show');
    expect(rig.q('#sync-line').textContent).toContain('nothing waiting');
  });
});
