// @vitest-environment node
/**
 * Workstream rule 1 for the dictionary: nothing a learner asks for waits on the network when the device already holds a copy.
 * After a worker restart the dictionary's location comes from the stored manifest row at once; the network search runs once per
 * language in the background and only ever replaces the remembered location with a better one. Every probe has a deadline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGlossService, LOCATE_PROBE_MS, SHARD_PREFIX, type PackProvider } from '../../packages/golearn-extension/src/background/gloss';
import type { SessionManager } from '../../packages/golearn-extension/src/background/session';
import { createChromeFake } from '../extension/chromeFake';
import { fakePacks } from '../extension/rig';

const OWN = 'chrome-extension://test-ext-id/app/';
const HOSTED = 'https://pages.example/go-v0/';
const MINE = 'https://mine.example/files/';
const CONFIG = JSON.stringify({ dictionaryFallbackUrl: HOSTED });
const MANIFEST = (base: string) => `${base}dict/sq/manifest.json`;

type Answer = number | 'throw' | 'never' | string;

function worker(answers: Record<string, Answer>, opts: { configured?: boolean; stored?: { base: string; text?: string } } = {}) {
  const fake = createChromeFake();
  const calls: Array<{ url: string; init?: { timeoutMs?: number } }> = [];
  const doFetch = (async (input: RequestInfo | URL, init?: { timeoutMs?: number }) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url: u, init });
    const a = u === `${OWN}config.json` ? CONFIG : answers[u];
    if (a === 'throw') throw new TypeError('Failed to fetch');
    if (a === 'never') return new Promise<Response>(() => undefined);
    if (typeof a === 'string') return new Response(a, { status: 200 });
    return new Response('{}', { status: a ?? 404 });
  }) as typeof fetch;
  const session = { getService: async () => (opts.configured === false ? undefined : { baseUrl: 'https://repo.example', assetBase: MINE }) } as unknown as SessionManager;
  let runtimesMade = 0;
  const inner = fakePacks();
  const packs: PackProvider = { manifest: inner.manifest, runtime: (id, deps) => { runtimesMade += 1; return inner.runtime(id, deps); } };
  const svc = createGlossService({ area: fake.local, session, fetch: doFetch, packs, getURL: (p) => fake.runtime.getURL!(p) });
  const store = async (): Promise<void> => {
    if (!opts.stored) return;
    await fake.local.set({
      [`${SHARD_PREFIX}dict/sq/manifest`]: { text: opts.stored.text ?? '{}', at: 1, url: MANIFEST(opts.stored.base) },
      [`${SHARD_PREFIX}dict/sq/s-00`]: { text: '{}', at: 1, url: `${opts.stored.base}dict/sq/s-00.json` },
    });
  };
  const manifestProbes = () => calls.filter((c) => c.url.endsWith('/dict/sq/manifest.json'));
  return { svc, calls, store, manifestProbes, runtimesMade: () => runtimesMade };
}

const g = (svc: ReturnType<typeof worker>['svc']) => svc.glossFor({ lemma: 'shtëpi', pos: 'NOUN', languageId: 'sq' });
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

describe('GoLearn dictionary location: local first, checked in the background', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('(a) with the manifest row and the shard stored and a network that never answers, a gloss resolves with no fake time passing', async () => {
    const w = worker({ [MANIFEST(MINE)]: 'never', [MANIFEST(OWN)]: 'never', [MANIFEST(HOSTED)]: 'never' }, { stored: { base: HOSTED } });
    await w.store();
    let reply: Awaited<ReturnType<typeof g>> | undefined;
    void g(w.svc).then((r) => { reply = r; });
    await tick(0);
    expect(reply).toMatchObject({ ok: true, found: true, senses: ['house', 'home'], source: 'hosted' });
    expect(w.manifestProbes().length).toBeGreaterThan(0); // the background check did start, and nothing waited for it
    await tick(3 * LOCATE_PROBE_MS + 1000); // the stuck probes give up; nothing throws, the answer stays
    expect(await g(w.svc)).toMatchObject({ found: true, source: 'hosted' });
  });

  it('(b) with nothing stored and a network that never answers, the search says offline after at most 3 probe deadlines', async () => {
    const w = worker({ [MANIFEST(MINE)]: 'never', [MANIFEST(OWN)]: 'never', [MANIFEST(HOSTED)]: 'never' });
    let reply: Awaited<ReturnType<typeof g>> | undefined;
    void g(w.svc).then((r) => { reply = r; });
    await tick(3 * LOCATE_PROBE_MS - 1);
    expect(reply).toBeUndefined();
    await tick(1);
    expect(reply).toMatchObject({ ok: true, found: false, reason: 'offline' });
    expect(w.manifestProbes().map((c) => c.url)).toEqual([MANIFEST(MINE), MANIFEST(OWN), MANIFEST(HOSTED)]);
    expect(w.manifestProbes().every((c) => c.init?.timeoutMs === LOCATE_PROBE_MS)).toBe(true);
  });

  it('(c) the background check moves a remembered hosted location to the configured one once that answers, and the next gloss uses it', async () => {
    const w = worker({ [MANIFEST(MINE)]: 200, [MANIFEST(OWN)]: 404, [MANIFEST(HOSTED)]: 200 }, { stored: { base: HOSTED } });
    await w.store();
    expect(await g(w.svc)).toMatchObject({ found: true, source: 'hosted' });
    await tick(10);
    expect(await g(w.svc)).toMatchObject({ found: true, source: 'configured' });
  });

  it('(d) a failed or timed-out check leaves the remembered location working', async () => {
    const failed = worker({ [MANIFEST(MINE)]: 'throw', [MANIFEST(OWN)]: 'throw', [MANIFEST(HOSTED)]: 'throw' }, { stored: { base: HOSTED } });
    await failed.store();
    expect(await g(failed.svc)).toMatchObject({ found: true, source: 'hosted' });
    await tick(10);
    expect(await g(failed.svc)).toMatchObject({ found: true, source: 'hosted' });

    const stuck = worker({ [MANIFEST(MINE)]: 'never', [MANIFEST(OWN)]: 'never', [MANIFEST(HOSTED)]: 'never' }, { stored: { base: HOSTED } });
    await stuck.store();
    expect(await g(stuck.svc)).toMatchObject({ found: true, source: 'hosted' });
    await tick(3 * LOCATE_PROBE_MS + 1);
    expect(await g(stuck.svc)).toMatchObject({ found: true, source: 'hosted' });
  });

  it('(e) one background check per language per worker life: twenty glosses make one search', async () => {
    const w = worker({ [MANIFEST(MINE)]: 404, [MANIFEST(OWN)]: 404, [MANIFEST(HOSTED)]: 200 }, { stored: { base: HOSTED } });
    await w.store();
    for (let i = 0; i < 20; i++) { expect(await g(w.svc)).toMatchObject({ found: true }); await tick(5); }
    expect(w.manifestProbes().map((c) => c.url)).toEqual([MANIFEST(MINE), MANIFEST(OWN), MANIFEST(HOSTED)]);
    for (let i = 0; i < 20; i++) await g(w.svc);
    await tick(10);
    expect(w.manifestProbes().length).toBe(3);
  });

  it('a stored row whose address is no longer a candidate is not trusted: the search is made as for a new language', async () => {
    const w = worker({ [MANIFEST(HOSTED)]: 200 }, { configured: false, stored: { base: 'https://old.example/go/' } });
    await w.store();
    expect(await g(w.svc)).toMatchObject({ found: true, source: 'hosted' });
    expect(w.manifestProbes().map((c) => c.url)).toEqual([MANIFEST(OWN), MANIFEST(HOSTED)]);
  });

  it('a new dictionary revision found by the check is read on the next gloss of this worker life; an unchanged manifest keeps the runtime', async () => {
    const changed = worker({ [MANIFEST(MINE)]: 404, [MANIFEST(OWN)]: 404, [MANIFEST(HOSTED)]: '{"rev":"new"}' }, { stored: { base: HOSTED, text: '{"rev":"old"}' } });
    await changed.store();
    await g(changed.svc);
    await tick(10);
    await g(changed.svc);
    expect(changed.runtimesMade()).toBe(2);
    const same = worker({ [MANIFEST(MINE)]: 404, [MANIFEST(OWN)]: 404, [MANIFEST(HOSTED)]: '{"rev":"old"}' }, { stored: { base: HOSTED, text: '{"rev":"old"}' } });
    await same.store();
    await g(same.svc);
    await tick(10);
    await g(same.svc);
    expect(same.runtimesMade()).toBe(1);
  });
});
