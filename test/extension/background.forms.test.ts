// @vitest-environment node
/**
 * `golearn:confirm-forms`: the background reads a language's slim forms index through the gloss service's location order
 * (configured address, then the extension's own app/ folder, then the hosted copy from app/config.json), through the same caching shard
 * fetch, answers in one round trip, and never throws to the content script.
 */
import { describe, expect, it } from 'vitest';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { SHARD_PREFIX, type PackProvider } from '../../packages/golearn-extension/src/background/gloss';
import { createFormsService } from '../../packages/golearn-extension/src/background/forms';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { germanManifest } from '../../packages/language-packs/src/packs/de';
import { formsShardFile } from '../../src/dict/forms';
import { createChromeFake, type ChromeFake } from './chromeFake';

const OWN = 'chrome-extension://test-ext-id/app/';
const HOSTED = 'https://pages.example/go-v0/';
const CONFIG = JSON.stringify({ dictionaryFallbackUrl: HOSTED });
const SHARD = formsShardFile(0, 1);
const FORMS_MANIFEST = JSON.stringify({ version: 1, lang: 'de', buckets: 1, forms: 3, lemmas: 3, shardFiles: [SHARD], builtFrom: 'test' });
const FORMS_SHARD = JSON.stringify({ bisherigen: [['bisherig', 'ADJ'], ['bisher', 'ADV']], Kampf: [['Kampf', 'NOUN']], Klassenkämpfen: [['Klassenkampf', null]] });
const DE = germanManifest();
const packs: PackProvider = { manifest: (id) => (id === 'de' ? DE : undefined), runtime: () => undefined };

/** The files of a dictionary at `root` (the folder holding dict/): the dictionary's own manifest and a one-shard forms index. */
const dictAt = (root: string, over: Record<string, number | 'throw' | string> = {}): Record<string, number | 'throw' | string> => ({
  [`${root}dict/de/manifest.json`]: '{}',
  [`${root}dict/de/forms/manifest.json`]: FORMS_MANIFEST,
  [`${root}dict/de/forms/${SHARD}`]: FORMS_SHARD,
  ...over,
});

function make(answers: Record<string, number | 'throw' | string>, opts: { fake?: ChromeFake } = {}) {
  const fake = opts.fake ?? createChromeFake();
  const urls: string[] = [];
  const doFetch = (async (input: RequestInfo | URL) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    urls.push(u);
    const a = answers[u];
    if (a === 'throw') throw new TypeError('Failed to fetch');
    if (typeof a === 'string') return new Response(a, { status: 200 });
    return new Response('', { status: a ?? 404 });
  }) as typeof fetch;
  const bg = createBackground(fake, { fetch: doFetch, packs, now: () => 1_700_000_000_000 });
  bg.register();
  const ask = (forms: unknown, languageId: unknown = 'de'): Promise<any> => fake.dispatch({ type: MSG.confirmForms, languageId, forms }, { id: 'test-ext-id', tab: { id: 7 }, url: 'https://example.test/page' });
  const formsUrls = (): string[] => urls.filter((u) => u.includes('/forms/'));
  return { fake, urls, ask, formsUrls, bg };
}

describe('golearn:confirm-forms', () => {
  it('the German pack is an installable pack that declares a dictionary (the forms index is looked up under its dict/de/)', () => {
    expect(DE.status).toBe('installable');
    expect(DE.lexical?.dictionary?.baseUrl).toBe('dict/de/');
  });

  it('answers a hit with the first row, null for a form the index lacks, null part of speech as null; one round trip, each file once', async () => {
    const { ask, urls, formsUrls } = make(dictAt(OWN));
    const r = await ask(['bisherigen', 'Kampf', 'Klassenkämpfen', 'xyzzy']);
    expect(r).toEqual({ ok: true, source: 'extension', forms: { bisherigen: ['bisherig', 'ADJ'], Kampf: ['Kampf', 'NOUN'], Klassenkämpfen: ['Klassenkampf', null], xyzzy: null } });
    expect(formsUrls()).toEqual([`${OWN}dict/de/forms/manifest.json`, `${OWN}dict/de/forms/${SHARD}`]);
    expect(urls[0]).toBe(`${OWN}dict/de/manifest.json`); // the location is the dictionary's own manifest, checked first, as for a gloss
    const before = urls.length;
    expect(await ask(['Kampf'])).toMatchObject({ ok: true, forms: { Kampf: ['Kampf', 'NOUN'] } });
    expect(urls.length).toBe(before); // location remembered, manifest and shard cached
  });

  it('location order: the configured address first, then the extension\'s own app/, then the hosted copy from app/config.json', async () => {
    const mine = 'https://mine.example/files/';
    // (a) the learner's dictionary address (the asset base set on the setup page), when it has the language
    const a = make({ ...dictAt(mine), ...dictAt(OWN) });
    const set = await a.fake.dispatch({ type: MSG.serviceConfig, op: 'set', baseUrl: 'https://repo.example', assetBase: 'https://mine.example/files' }, { id: 'test-ext-id', url: 'chrome-extension://test-ext-id/app/index.html' }) as { ok?: boolean };
    expect(set.ok).not.toBe(false);
    expect(await a.ask(['Kampf'])).toMatchObject({ ok: true, source: 'configured', forms: { Kampf: ['Kampf', 'NOUN'] } });
    expect(a.formsUrls().every((u) => u.startsWith(mine))).toBe(true);
    // (b) the extension's own folder when it has the index
    const b = make(dictAt(OWN));
    expect(await b.ask(['Kampf'])).toMatchObject({ source: 'extension', forms: { Kampf: ['Kampf', 'NOUN'] } });
    // (c) the hosted copy when the extension does not have the language; config.json is read once
    const c = make({ [`${OWN}config.json`]: CONFIG, ...dictAt(HOSTED) });
    expect(await c.ask(['Kampf'])).toMatchObject({ source: 'hosted', forms: { Kampf: ['Kampf', 'NOUN'] } });
    expect(c.urls.indexOf(`${OWN}dict/de/manifest.json`)).toBeLessThan(c.urls.indexOf(`${HOSTED}dict/de/manifest.json`));
    expect(c.urls.filter((u) => u === `${OWN}config.json`)).toHaveLength(1);
    expect(c.urls.some((u) => u.startsWith('http') && !u.startsWith(HOSTED))).toBe(false);
  });

  it('a forms index missing at the located dictionary (404): reason "no-index", an empty map, remembered (nothing is asked again)', async () => {
    const { ask, urls, formsUrls } = make(dictAt(OWN, { [`${OWN}dict/de/forms/manifest.json`]: 404 }));
    expect(await ask(['Kampf'])).toEqual({ ok: true, source: 'extension', forms: {}, reason: 'no-index' });
    expect(formsUrls()).toEqual([`${OWN}dict/de/forms/manifest.json`]);
    const before = urls.length;
    expect(await ask(['Kampf', 'Haus'])).toMatchObject({ ok: true, forms: {}, reason: 'no-index' });
    expect(urls.length).toBe(before);
  });

  it('no location answers: "no-asset-base" for 404s, "offline" when it cannot be reached; a later question looks again', async () => {
    const nothing = make({ [`${OWN}config.json`]: CONFIG });
    expect(await nothing.ask(['Kampf'])).toMatchObject({ ok: true, forms: {}, reason: 'no-asset-base' });
    const down = make({ [`${OWN}config.json`]: CONFIG, [`${OWN}dict/de/manifest.json`]: 'throw', [`${HOSTED}dict/de/manifest.json`]: 'throw' });
    expect(await down.ask(['Kampf'])).toMatchObject({ ok: true, forms: {}, reason: 'offline' });
    down.urls.length = 0;
    await down.ask(['Kampf']);
    expect(down.urls).toContain(`${HOSTED}dict/de/manifest.json`);
  });

  it('the dictionary is reachable but the forms index is not (5xx, or the shard fails): "offline", the hits it did get are kept, nothing is claimed absent', async () => {
    const m = make(dictAt(OWN, { [`${OWN}dict/de/forms/manifest.json`]: 503 }));
    expect(await m.ask(['Kampf'])).toMatchObject({ ok: true, forms: {}, reason: 'offline' });
    const s = make(dictAt(OWN, { [`${OWN}dict/de/forms/${SHARD}`]: 'throw' }));
    const r = await s.ask(['Kampf', 'xyzzy']);
    expect(r).toMatchObject({ ok: true, reason: 'offline' });
    expect(r.forms.xyzzy).toBeUndefined(); // not answered "absent": the shard could not be read
  });

  it('a language with no pack or no dictionary: "no-pack"; a request that is not well-formed is refused, never thrown', async () => {
    const { ask, urls } = make(dictAt(OWN));
    expect(await ask(['Kampf'], 'xx')).toMatchObject({ ok: true, forms: {}, reason: 'no-pack' });
    expect((await ask(['Kampf'], '../etc')).ok).toBe(false);
    expect((await ask('Kampf')).ok).toBe(false);
    expect(await ask([])).toEqual({ ok: true, forms: {} });
    expect(await ask([1, null, '', '\u0001'])).toEqual({ ok: true, forms: {} });
    expect(urls).toEqual([]);
    // the service itself on a pack with no dictionary location
    const none = createFormsService({ gloss: { dictionaryAt: async () => ({ ok: false, reason: 'no-pack' as const }) } });
    expect(await none.confirm({ languageId: 'de', forms: ['x'] })).toMatchObject({ reason: 'no-pack' });
    const broken = createFormsService({ gloss: { dictionaryAt: async () => { throw new Error('boom'); } } });
    expect(await broken.confirm({ languageId: 'de', forms: ['x'] })).toMatchObject({ ok: true, forms: {}, reason: 'offline' });
  });

  it('asks for at most 500 forms at a time, each once', async () => {
    const { ask } = make(dictAt(OWN));
    const forms = Array.from({ length: 700 }, (_, i) => `wort${i}`);
    const r = await ask([...forms, 'wort0', 'wort1']);
    expect(Object.keys(r.forms)).toHaveLength(500);
    expect(r.forms.wort499).toBeNull();
    expect(r.forms.wort500).toBeUndefined();
  });

  it('a form named like an Object property is an ordinary word', async () => {
    const { ask } = make(dictAt(OWN));
    const r = await ask(['__proto__', 'constructor']);
    expect(Object.keys(r.forms).sort()).toEqual(['__proto__', 'constructor']);
    expect(r.forms['__proto__']).toBeNull();
  });

  it('the shards are kept in storage beside the gloss shards, so the index works offline after a restart', async () => {
    const first = make(dictAt(OWN));
    await first.ask(['Kampf']);
    await new Promise((res) => setTimeout(res, 20));
    const keys = Object.keys(await first.fake.local.get(null)).filter((k) => k.startsWith(SHARD_PREFIX)).sort();
    expect(keys).toEqual([`${SHARD_PREFIX}dict/de/forms/${SHARD.replace('.json', '')}`, `${SHARD_PREFIX}dict/de/forms/manifest`, `${SHARD_PREFIX}dict/de/manifest`].sort());
    const second = make({ [`${OWN}dict/de/manifest.json`]: 'throw', [`${OWN}dict/de/forms/manifest.json`]: 'throw', [`${OWN}dict/de/forms/${SHARD}`]: 'throw' }, { fake: first.fake });
    expect(await second.ask(['Kampf'])).toMatchObject({ ok: true, source: 'extension', forms: { Kampf: ['Kampf', 'NOUN'] } });
    expect(second.formsUrls()).toEqual([]);
  });
});
