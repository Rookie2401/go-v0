// @vitest-environment node
/**
 * Dictionary glosses and grammar explanations: run in the background through the language-pack runtime, shards cached
 * in chrome.storage.local under pack:shard:<id> with the attribution, nothing fetched by a content script.
 */
import { describe, expect, it } from 'vitest';
import { createShardFetch, defaultPacks, SHARD_PREFIX } from '../../packages/golearn-extension/src/background/gloss';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { ATTRIBUTION, createRig, SERVICE } from './rig';

const ask = (rig: ReturnType<typeof createRig>, lemma = 'shtëpi') => rig.content({ type: MSG.gloss, lemma, pos: 'NOUN', languageId: 'sq' });

describe('golearn:gloss', () => {
  it('returns the senses and the attribution, fetching the shard from the asset base in the BACKGROUND and caching it with the attribution', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    const r = await ask(rig);
    expect(r).toEqual({ ok: true, found: true, senses: ['house', 'home'], attribution: ATTRIBUTION });
    expect(rig.log.filter((l) => l.path.includes('/dict/'))).toEqual([{ method: 'GET', path: '/dict/sq/s-00.json', status: 200 }]);
    await new Promise((res) => setTimeout(res, 20));
    const rows = Object.entries(await rig.fake.local.get(null)).filter(([k]) => k.startsWith(SHARD_PREFIX));
    expect(rows.map(([k]) => k)).toEqual([`${SHARD_PREFIX}dict/sq/s-00`]);
    expect(rows[0][1]).toMatchObject({ text: '{}', attribution: ATTRIBUTION });
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

  it('says there is no dictionary location when none is configured (signed out, no service)', async () => {
    const rig = createRig();
    expect(await ask(rig)).toMatchObject({ ok: true, found: false, reason: 'no-asset-base' });
    expect(rig.log).toEqual([]);
  });

  it('takes the shards from the configured asset base when there is one (the Pages site), not from the service', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    await rig.page({ type: MSG.serviceConfig, op: 'set', baseUrl: SERVICE, assetBase: 'https://pages.example/go' });
    expect(await ask(rig)).toMatchObject({ found: true });
    expect(rig.log.filter((l) => l.path.includes('/dict/')).map((l) => l.path)).toEqual(['/go/dict/sq/s-00.json']);
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
    expect(rig.log.filter((l) => l.path.includes('/dict/')).map((l) => l.path)).toEqual(['/dict/sq/s-00.json']);
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
