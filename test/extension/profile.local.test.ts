// @vitest-environment node
/**
 * The profile cache with the device's own Repository behind it: the order in which rows are taken (cache, account, device),
 * and what the reply says about where they came from. A fake session and a fake device model; no network.
 */
import { describe, expect, it } from 'vitest';
import type { AssistancePreferences, UnitKnowledge } from '../../packages/repository-contract/src';
import { createProfileService } from '../../packages/golearn-extension/src/background/profile';
import type { LocalKnowledge } from '../../packages/golearn-extension/src/background/localRepo';
import { DEFAULT_SETTINGS } from '../../packages/golearn-extension/src/protocol';
import { createMemoryStorageArea } from '../../packages/golearn-extension/src/store';
import { knowledgeRow } from './rig';

const A = 'lemma:sq:shtëpi:NOUN';
const B = 'lemma:sq:libër:NOUN';
const row = (unitId: string, observations: number): UnitKnowledge => knowledgeRow('someone', unitId, { exposure: { observations } });
const prefs = (value: 'label' | 'brief' | 'explanatory', origin: 'inferred' | 'explicit'): AssistancePreferences => ({
  learnerId: 'x', explanationDepth: { value, origin }, terminology: { value: 'plain', origin: 'default' }, transliteration: { value: 'on-request', origin: 'default' },
  pronunciationFirst: { value: false, origin: 'default' }, translationAvailable: { value: true, origin: 'default' }, visualAssistance: { value: 'standard', origin: 'default' },
  accessibility: { value: [], origin: 'default' }, updatedAt: '2026-10-09T00:00:00.000Z',
});

function device(rows: UnitKnowledge[], p?: AssistancePreferences): LocalKnowledge & { asked: string[][] } {
  const asked: string[][] = [];
  return { asked, async knowledge(ids) { asked.push(ids); return rows.filter((r) => ids.includes(r.unitId)); }, async preferences() { return p; } };
}

/** `server`: what the account answers, or 'down' (a thrown fetch) or 401. */
function make(opts: { connected: boolean; server?: UnitKnowledge[] | 'down' | 401; local?: LocalKnowledge }) {
  const calls: string[][] = [];
  const state = { server: opts.server };
  const api = {
    async knowledge(ids: string[]) {
      calls.push(ids);
      if (state.server === 'down') throw new TypeError('Failed to fetch');
      if (state.server === 401) return { ok: false as const, status: 401, error: 'unauthorized', message: '', body: {} };
      return { ok: true as const, status: 200, data: { knowledge: (Array.isArray(state.server) ? state.server : []).filter((r) => ids.includes(r.unitId)) } };
    },
    async preferences() { return { ok: true as const, status: 200, data: { preferences: prefs('explanatory', 'inferred') } }; },
  };
  const session = {
    status: async () => ({ connected: opts.connected, expired: false, hasEnrolment: opts.connected }),
    authenticated: async () => (opts.connected && state.server !== 401 ? { api, session: {}, service: {} } : undefined),
  } as never;
  const clock = { now: 1_000_000 };
  const svc = createProfileService({ area: createMemoryStorageArea(), session, settings: async () => ({ ...DEFAULT_SETTINGS }), now: () => clock.now, ...(opts.local ? { local: opts.local } : {}) });
  return { svc, calls, clock, state };
}

describe('no account', () => {
  it('the rows are the device\'s, compacted for the card, and the reply says so', async () => {
    const { svc, calls } = make({ connected: false, local: device([row(A, 3)]) });
    const r = await svc.knowledgeFor([A, B], 'sq');
    expect(r).toMatchObject({ ok: true, connected: false, source: 'device' });
    expect(Object.keys(r.rows)).toEqual([A]);
    expect(r.rows[A].dimensions.exposure?.observations).toBe(3);
    expect(Object.keys(r.rows[A])).toEqual(['unitId', 'dimensions', 'lastSeenAt']); // no learner id
    expect(calls).toEqual([]); // no account, no request
  });

  it('without a device Repository the reply is the old one: not connected, no rows, no source', async () => {
    const { svc } = make({ connected: false });
    const r = await svc.knowledgeFor([A], 'sq');
    expect(r).toMatchObject({ ok: true, connected: false, rows: {} });
    expect(r.source).toBeUndefined();
  });

  it('a device Repository that cannot be read leaves the old reply too', async () => {
    const broken: LocalKnowledge = { knowledge: async () => undefined, preferences: async () => undefined };
    const r = await make({ connected: false, local: broken }).svc.knowledgeFor([A], 'sq');
    expect(r).toMatchObject({ connected: false, rows: {} });
    expect(r.source).toBeUndefined();
  });

  it('the explanation depth is what the device infers; the learner\'s explicit setting still wins', async () => {
    const local = device([], prefs('explanatory', 'inferred'));
    const r = await make({ connected: false, local }).svc.knowledgeFor([A], 'sq');
    expect(r).toMatchObject({ depth: 'explanatory', depthOrigin: 'inferred' });
    const explicit = createProfileService({
      area: createMemoryStorageArea(), session: { status: async () => ({ connected: false }), authenticated: async () => undefined } as never,
      settings: async () => ({ ...DEFAULT_SETTINGS, explanationDepth: 'label' }), local,
    });
    expect(await explicit.knowledgeFor([A], 'sq')).toMatchObject({ depth: 'label', depthOrigin: 'settings' });
  });

  it('asks the device for at most the ids it was given, once', async () => {
    const local = device([row(A, 1)]);
    await make({ connected: false, local }).svc.knowledgeFor([A, A, B, '../../etc/passwd'], 'sq');
    expect(local.asked).toEqual([[A, B]]);
  });
});

describe('with an account', () => {
  it('the account answers and the device is not asked', async () => {
    const local = device([row(A, 9)]);
    const { svc } = make({ connected: true, server: [row(A, 2)], local });
    const r = await svc.knowledgeFor([A], 'sq');
    expect(r).toMatchObject({ ok: true, connected: true });
    expect(r.source).toBeUndefined();
    expect(r.rows[A].dimensions.exposure?.observations).toBe(2);
    expect(local.asked).toEqual([]);
  });

  it('offline: the cached rows win, and the device fills the units the cache does not hold', async () => {
    const local = device([row(A, 9), row(B, 4)]);
    const { svc, clock, state } = make({ connected: true, server: [row(A, 2)], local });
    await svc.knowledgeFor([A], 'sq'); // A is cached from the account
    state.server = 'down';
    clock.now += 11 * 60_000; // the cache has expired
    const r = await svc.knowledgeFor([A, B], 'sq');
    expect(r).toMatchObject({ ok: true, connected: true, stale: true, error: 'offline', source: 'device' });
    expect(r.rows[A].dimensions.exposure?.observations).toBe(2); // the account's row, stale, not the device's
    expect(r.rows[B].dimensions.exposure?.observations).toBe(4); // never cached: the device's
    expect(local.asked).toEqual([[B]]);
  });

  it('a refused sign-in (401) is reported as such, with the device\'s rows', async () => {
    const local = device([row(A, 5)]);
    const r = await make({ connected: true, server: 401, local }).svc.knowledgeFor([A], 'sq');
    expect(r).toMatchObject({ connected: true, stale: true, error: 'needs-sign-in', source: 'device' });
    expect(r.rows[A].dimensions.exposure?.observations).toBe(5);
  });

  it('without a device Repository, offline is exactly what it was: the cache or nothing', async () => {
    const r = await make({ connected: true, server: 'down' }).svc.knowledgeFor([A], 'sq');
    expect(r).toMatchObject({ connected: true, stale: true, error: 'offline', rows: {} });
    expect(r.source).toBeUndefined();
  });
});
