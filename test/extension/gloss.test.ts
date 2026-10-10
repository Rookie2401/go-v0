// @vitest-environment node
/**
 * Dictionary glosses and grammar explanations: run in the background through the language-pack runtime, shards cached
 * in chrome.storage.local under pack:shard:<id> with the attribution, nothing fetched by a content script.
 */
import { describe, expect, it } from 'vitest';
import { createGlossService, createShardFetch, defaultPacks, SHARD_PREFIX } from '../../packages/golearn-extension/src/background/gloss';
import type { SessionManager } from '../../packages/golearn-extension/src/background/session';
import type { StorageArea } from '../../packages/golearn-extension/src/platform';
import type { PackManifest } from '../../packages/language-packs/src/manifest';
import { albanianManifest } from '../../packages/language-packs/src';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { createChromeFake } from './chromeFake';
import { ATTRIBUTION, createRig, fakePacks, SERVICE } from './rig';

const ask = (rig: ReturnType<typeof createRig>, lemma = 'shtëpi') => rig.content({ type: MSG.gloss, lemma, pos: 'NOUN', languageId: 'sq' });

describe('golearn:gloss', () => {
  it('returns the senses and the attribution, fetching the shard from the asset base in the BACKGROUND and caching it with the attribution', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    const r = await ask(rig);
    expect(r).toEqual({ ok: true, found: true, senses: ['house', 'home'], attribution: ATTRIBUTION, source: 'configured' });
    expect(rig.log.filter((l) => l.path.includes('/dict/'))).toEqual([{ method: 'GET', path: '/dict/sq/manifest.json', status: 200 }, { method: 'GET', path: '/dict/sq/s-00.json', status: 200 }]);
    await new Promise((res) => setTimeout(res, 20));
    const rows = Object.entries(await rig.fake.local.get(null)).filter(([k]) => k.startsWith(SHARD_PREFIX));
    expect(rows.map(([k]) => k).sort()).toEqual([`${SHARD_PREFIX}dict/sq/manifest`, `${SHARD_PREFIX}dict/sq/s-00`]);
    expect(rows.find(([k]) => k.endsWith('s-00'))![1]).toMatchObject({ text: '{}', attribution: ATTRIBUTION });
  });

  it('works offline once the shard is cached: the second lookup makes no request', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    await ask(rig);
    rig.offline.value = true;
    const n = rig.log.length;
    expect(await ask(rig)).toMatchObject({ ok: true, found: true, senses: ['house', 'home'] });
    expect(rig.log.length).toBe(n);
  });

  it('is an honest "not found" for an unknown lemma, and "offline" when the shard cannot be had', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    expect(await ask(rig, 'flurbozitet')).toMatchObject({ ok: true, found: false, senses: [], reason: 'not-found' });
    const fresh = createRig();
    await fresh.signUp();
    await fresh.connect();
    fresh.offline.value = true;
    expect(await ask(fresh)).toMatchObject({ ok: true, found: false, reason: 'offline', message: 'The dictionary could not be reached.' }); // the real runtime reports an unreadable dictionary as no entry; either way the card gets a calm answer
  });

  it('signed out with no service configured, the meanings still come: from the extension\'s own files', async () => {
    const rig = createRig();
    expect(await ask(rig)).toMatchObject({ ok: true, found: true, senses: ['house', 'home'], source: 'extension' });
  });

  it('takes the shards from the configured asset base when there is one (the Pages site), not from the service', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    await rig.page({ type: MSG.serviceConfig, op: 'set', baseUrl: SERVICE, assetBase: 'https://pages.example/go' });
    expect(await ask(rig)).toMatchObject({ found: true });
    expect(rig.log.filter((l) => l.path.includes('/dict/')).map((l) => l.path)).toEqual(['/go/dict/sq/manifest.json', '/go/dict/sq/s-00.json']);
    expect((await rig.page({ type: MSG.status })).assetBase).toBe('https://pages.example/go');
    const bad = await rig.page({ type: MSG.serviceConfig, op: 'set', baseUrl: SERVICE, assetBase: 'http://pages.example' });
    expect(bad).toMatchObject({ ok: false, error: 'insecure-url' });
  });

  it('refuses a request that is not well-formed, and a language with no installable pack', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    expect((await rig.content({ type: MSG.gloss, lemma: '', languageId: 'sq' })).ok).toBe(false);
    expect((await rig.content({ type: MSG.gloss, lemma: 'x', languageId: '../etc' })).ok).toBe(false);
    expect(await rig.content({ type: MSG.gloss, lemma: 'Haus', languageId: 'de' })).toMatchObject({ ok: true, found: false, reason: 'no-pack' });
  });
});

describe('the shard cache', () => {
  it('serves only URLs under the asset base', async () => {
    const rig = createRig();
    const f = createShardFetch(rig.fake.local, 'https://pages.example/go', (async () => new Response('{}')) as typeof fetch);
    await expect(f('https://evil.example/dict/sq/s-00.json')).rejects.toThrow(/outside the dictionary location/);
    await expect(f('https://pages.example/go-evil/dict/sq/s-00.json')).rejects.toThrow(/outside/);
    const ok = await f('https://pages.example/go/dict/sq/manifest.json');
    expect(ok.ok).toBe(true);
    expect(Object.keys(await rig.fake.local.get(null))).toContain(`${SHARD_PREFIX}dict/sq/manifest`);
  });

  it('does not cache an error answer', async () => {
    const rig = createRig();
    const f = createShardFetch(rig.fake.local, 'https://pages.example', (async () => new Response('nope', { status: 404 })) as typeof fetch);
    expect((await f('https://pages.example/dict/sq/s-ff.json')).status).toBe(404);
    expect(Object.keys(await rig.fake.local.get(null)).filter((k) => k.startsWith(SHARD_PREFIX))).toHaveLength(0);
  });
});

describe('golearn:explain (the pack manifest; no request)', () => {
  it('labels features and explains constructions with the pack\'s own text', async () => {
    const rig = createRig();
    const r = await rig.content({ type: MSG.explain, languageId: 'sq', pos: 'NOUN', features: { Case: 'Acc', Definite: 'Def', Weird: 'x' }, constructionIds: ['definite-accusative-singular', 'not-a-construction'] });
    expect(r).toMatchObject({ ok: true, source: 'pack' });
    expect(r.features.find((f: { key: string }) => f.key === 'Case')).toMatchObject({ label: 'Case', brief: 'accusative' });
    expect(r.features.find((f: { key: string }) => f.key === 'Case').explanation).toMatch(/direct object/);
    expect(r.features.find((f: { key: string }) => f.key === 'Weird')).toEqual({ key: 'Weird', value: 'x', label: 'Weird' });
    expect(r.constructions).toHaveLength(1);
    expect(r.constructions[0]).toMatchObject({ id: 'definite-accusative-singular', title: 'Definite accusative singular' });
    expect(r.constructions[0].brief.endsWith('.')).toBe(true);
    expect(rig.log).toEqual([]);
  });

  it('an unknown language gives nothing, honestly', async () => {
    const rig = createRig();
    expect(await rig.content({ type: MSG.explain, languageId: 'xx', features: { Case: 'Acc' }, constructionIds: [] })).toEqual({ ok: true, features: [], constructions: [], source: 'none' });
  });
});

describe('the real pack provider', () => {
  it('has an installable Albanian pack and no pack for an unknown language', () => {
    expect(defaultPacks.manifest('sq')?.status).toBe('installable');
    expect(defaultPacks.manifest('xx')).toBeUndefined();
    expect(defaultPacks.runtime('xx', { fetch: (async () => new Response('')) as typeof fetch, baseUrl: 'https://x.example' })).toBeUndefined();
  });
});

describe('the dictionary location', () => {
  it('may be the extension\'s own origin (the setup build packages dict/<lang> inside it); http on a non-local host is still refused', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    const own = await rig.page({ type: MSG.serviceConfig, op: 'set', baseUrl: SERVICE, assetBase: 'chrome-extension://test-ext-id/' });
    expect(own).toMatchObject({ ok: true, status: { assetBase: 'chrome-extension://test-ext-id' } });
    expect(await rig.page({ type: MSG.serviceConfig, op: 'set', baseUrl: SERVICE, assetBase: 'chrome-extension://test-ext-id/app' })).toMatchObject({ ok: true });
    expect(await rig.page({ type: MSG.serviceConfig, op: 'set', baseUrl: SERVICE, assetBase: 'chrome-extension://someone-else/' })).toMatchObject({ ok: false, error: 'insecure-url' });
    expect(await rig.page({ type: MSG.serviceConfig, op: 'set', baseUrl: SERVICE, assetBase: 'http://pages.example/go' })).toMatchObject({ ok: false, error: 'insecure-url' });
    await rig.page({ type: MSG.serviceConfig, op: 'set', baseUrl: SERVICE, assetBase: 'chrome-extension://test-ext-id/' });
    expect(await ask(rig)).toMatchObject({ found: true });
    expect(rig.log.filter((l) => l.path.includes('/dict/')).map((l) => l.path)).toEqual(['/dict/sq/manifest.json', '/dict/sq/s-00.json']);
  });
});

describe('settings answer with the stored value and the reason a switch is off', () => {
  it('keepSnippets is returned as stored (false) with why it cannot be turned on', async () => {
    const rig = createRig();
    for (const r of [await rig.page({ type: MSG.settings, op: 'get' }), await rig.page({ type: MSG.settings, op: 'set', patch: { keepSnippets: true } })]) {
      expect(r.settings.keepSnippets).toBe(false);
      expect(r.unavailable.keepSnippets).toMatch(/not implemented in this version/);
    }
  });
});

describe('where the meanings are read from (per language: configured address, then the extension\'s own files, then the hosted copy)', () => {
  const OWN = 'chrome-extension://test-ext-id/app/';
  const HOSTED = 'https://pages.example/go-v0/';
  const CONFIG = JSON.stringify({ serviceUrl: 'http://127.0.0.1:8790', assetBaseUrl: './', dictionaryFallbackUrl: HOSTED });

  /** A worker's gloss service over stub answers: a number is a status, 'throw' is no connection, a string is a body. */
  function make(answers: Record<string, number | 'throw' | string>, opts: { service?: { baseUrl: string; assetBase?: string }; getURL?: boolean; area?: StorageArea } = {}) {
    const fake = createChromeFake();
    const urls: string[] = [];
    const doFetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      urls.push(u);
      const a = answers[u];
      if (a === 'throw') throw new TypeError('Failed to fetch');
      if (typeof a === 'string') return new Response(a, { status: 200 });
      return new Response('{}', { status: a ?? 404 });
    }) as typeof fetch;
    const session = { getService: async () => opts.service } as unknown as SessionManager;
    const svc = createGlossService({ area: opts.area ?? fake.local, session, fetch: doFetch, packs: fakePacks(), ...(opts.getURL === false ? {} : { getURL: (p: string) => fake.runtime.getURL!(p) }) });
    return { svc, urls, fake };
  }
  const g = (svc: ReturnType<typeof make>['svc'], lemma = 'shtëpi') => svc.glossFor({ lemma, pos: 'NOUN', languageId: 'sq' });

  it('(a) the learner\'s dictionary address is used first when it answers', async () => {
    const { svc, urls } = make({ 'https://mine.example/files/dict/sq/manifest.json': 200, 'https://mine.example/files/dict/sq/s-00.json': 200 }, { service: { baseUrl: 'https://repo.example', assetBase: 'https://mine.example/files' } });
    expect(await g(svc)).toEqual({ ok: true, found: true, senses: ['house', 'home'], attribution: ATTRIBUTION, source: 'configured' });
    expect(urls).toEqual(['https://mine.example/files/dict/sq/manifest.json', 'https://mine.example/files/dict/sq/s-00.json']);
  });

  it('(b) the extension\'s own app/ folder when the configured address does not have the language', async () => {
    const { svc, urls } = make({ [`${OWN}dict/sq/manifest.json`]: 200, [`${OWN}dict/sq/s-00.json`]: 200 }, { service: { baseUrl: 'https://repo.example', assetBase: 'https://mine.example/files' } });
    expect(await g(svc)).toMatchObject({ ok: true, found: true, source: 'extension' });
    expect(urls[0]).toBe('https://mine.example/files/dict/sq/manifest.json');
    expect(urls).toContain(`${OWN}dict/sq/s-00.json`);
    expect(urls.some((u) => u.endsWith('config.json'))).toBe(false); // the hosted address is not even read when an earlier place answers
  });

  it('works with no account and no service at all: the extension\'s own files', async () => {
    const { svc } = make({ [`${OWN}dict/sq/manifest.json`]: 200, [`${OWN}dict/sq/s-00.json`]: 200 });
    expect(await g(svc)).toMatchObject({ ok: true, found: true, source: 'extension' });
  });

  it('(c) the hosted copy named in the extension\'s own app/config.json, read once, when neither earlier place has the language', async () => {
    const { svc, urls } = make({ [`${OWN}config.json`]: CONFIG, [`${HOSTED}dict/sq/manifest.json`]: 200, [`${HOSTED}dict/sq/s-00.json`]: 200 });
    expect(await g(svc)).toMatchObject({ ok: true, found: true, source: 'hosted' });
    expect(urls.filter((u) => u === `${OWN}config.json`)).toHaveLength(1);
    const before = urls.length;
    await g(svc, 'tjetër'); // the same language again: location remembered, shard cached, nothing re-checked
    expect(urls.slice(before).filter((u) => u.endsWith('manifest.json') || u.endsWith('config.json'))).toEqual([]);
  });

  it('an address in config.json that is not https (or localhost) is ignored', async () => {
    const bad = JSON.stringify({ dictionaryFallbackUrl: 'http://evil.example/go/' });
    const { svc, urls } = make({ [`${OWN}config.json`]: bad, 'http://evil.example/go/dict/sq/manifest.json': 200 });
    expect(await g(svc)).toMatchObject({ ok: true, found: false, reason: 'no-asset-base' });
    expect(urls.some((u) => u.startsWith('http://evil.example'))).toBe(false);
  });

  it('with no location at all there is nothing to fetch: the honest "no-asset-base"', async () => {
    const { svc, urls } = make({}, { getURL: false });
    expect(await g(svc)).toMatchObject({ ok: true, found: false, reason: 'no-asset-base', message: expect.stringMatching(/No dictionary location is configured/) });
    expect(urls).toEqual([]);
  });

  it('every place tried and none answering: "no-asset-base" when they say 404, "offline" when they cannot be reached', async () => {
    const missing = make({ [`${OWN}config.json`]: CONFIG });
    expect(await g(missing.svc)).toMatchObject({ ok: true, found: false, reason: 'no-asset-base' });
    expect(missing.urls).toEqual([`${OWN}dict/sq/manifest.json`, `${OWN}config.json`, `${HOSTED}dict/sq/manifest.json`]);
    const down = make({ [`${OWN}config.json`]: CONFIG, [`${OWN}dict/sq/manifest.json`]: 'throw', [`${HOSTED}dict/sq/manifest.json`]: 'throw' });
    expect(await g(down.svc)).toMatchObject({ ok: true, found: false, reason: 'offline', message: 'The dictionary could not be reached.' });
    // and a later lookup looks again (a failed search is not remembered)
    down.urls.length = 0;
    await g(down.svc);
    expect(down.urls).toContain(`${HOSTED}dict/sq/manifest.json`);
  });

  it('after a restart with no connection, a dictionary read before is still used from the device, and still says where it came from', async () => {
    const first = make({ [`${OWN}config.json`]: CONFIG, [`${HOSTED}dict/sq/manifest.json`]: 200, [`${HOSTED}dict/sq/s-00.json`]: 200 });
    expect(await g(first.svc)).toMatchObject({ found: true, source: 'hosted' });
    const second = make({ [`${OWN}config.json`]: CONFIG, [`${OWN}dict/sq/manifest.json`]: 'throw', [`${HOSTED}dict/sq/manifest.json`]: 'throw' }, { area: first.fake.local });
    expect(await g(second.svc)).toMatchObject({ ok: true, found: true, senses: ['house', 'home'], source: 'hosted' });
    expect(second.urls.some((u) => u.endsWith('s-00.json'))).toBe(false); // the shard came from storage
  });

  it('a pack that declares no dictionary location is not probed', async () => {
    const m = { ...albanianManifest(), lexical: { ...albanianManifest().lexical, dictionary: undefined } } as unknown as PackManifest;
    const fake = createChromeFake();
    const urls: string[] = [];
    const svc = createGlossService({
      area: fake.local, session: { getService: async () => undefined } as unknown as SessionManager,
      fetch: (async (u: string) => { urls.push(String(u)); return new Response('{}'); }) as unknown as typeof fetch,
      packs: { manifest: () => m, runtime: () => ({ manifest: m, gloss: async () => undefined }) }, getURL: (p) => fake.runtime.getURL!(p),
    });
    expect(await g(svc)).toMatchObject({ ok: true, found: false, reason: 'not-found', source: 'extension' });
    expect(urls).toEqual([]);
  });
});
