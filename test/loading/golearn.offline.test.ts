// @vitest-environment node
/**
 * "Download for offline use" (2026-11-11, the owner's decision A and B): the worker keeps a language's dictionary on the device
 * (IndexedDB `golearn-dictionary`), reads from it only after a chrome.storage miss, and "Delete this device's data" removes it.
 *
 * The dictionary is a real one, built by the repository's own builder (meanings, forms index, frequency), served by a fake network.
 * No test here waits a fixed time: they poll a condition, or hold requests open with explicit gates.
 */
import { gzipSync } from 'node:zlib';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { buildDictionary } from '../../src/dict';
import { createFormsBuilder, formsShardFile } from '../../src/dict/forms';
import { createDictionaryStore, DICTIONARY_DB } from '../../packages/golearn-extension/src/background/dictionaryStore';
import { createDictionaryDownload, downloadKey, type DownloadStatus } from '../../packages/golearn-extension/src/background/dictionaryDownload';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { createGlossService, createShardFetch, defaultPacks, SHARD_PREFIX } from '../../packages/golearn-extension/src/background/gloss';
import type { SessionManager } from '../../packages/golearn-extension/src/background/session';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { createChromeFake, type ChromeFake } from '../extension/chromeFake';

const OWN = 'chrome-extension://test-ext-id/app/';
const sqNormalize = (s: string): string => createAdapterRegistry().get('sq').normalize(s);
const line = (o: unknown): string => JSON.stringify(o);
const PAGE = { id: 'test-ext-id', url: 'chrome-extension://test-ext-id/app/index.html' };
const CONTENT = { id: 'test-ext-id', tab: { id: 7 }, url: 'https://example.test/page' };

const WORDS = [['libër', 'book'], ['dritë', 'light'], ['shtëpi', 'house'], ['mal', 'mountain'], ['det', 'sea'], ['qiell', 'sky'], ['zog', 'bird'], ['lumë', 'river']] as const;

/** A real dictionary at a revision: schema-3 meanings in `buckets` shards, a forms index, a frequency file. `extra` adds entries (a newer revision). */
function makeDictionary(date: string, buckets: number, extra: Array<[string, string]> = []): Map<string, string> {
  const lines = [...WORDS, ...extra].map(([w, g]) => line({ pos: 'noun', word: w, lang_code: 'sq', senses: [{ glosses: [g] }] }));
  const built = buildDictionary(lines, { lang: 'sq', normalize: sqNormalize, date, buckets, source: { url: 'https://kaikki.example', file: 'x', lastModified: date, sha256: '0', retrievedAt: date, lines: lines.length } });
  const files = new Map<string, string>();
  const manifest: Record<string, unknown> = { ...JSON.parse(built.files.get('manifest.json')!) as Record<string, unknown>, hasFrequency: true };
  for (const [name, text] of built.files) if (name !== 'manifest.json') files.set(`dict/sq/${name}`, text);
  files.set('dict/sq/manifest.json', JSON.stringify(manifest));
  files.set('dict/sq/frequency.json', JSON.stringify({ schema: 1, lang: 'sq', builtAt: date, minCount: 1, words: 1000, sources: [], lemmas: [['libër', 50]] }));
  const fb = createFormsBuilder();
  for (const [w] of [...WORDS, ...extra]) fb.add({ form: sqNormalize(w), pos: 'NOUN', glosses: ['x'] } as never);
  const fin = fb.finish(16);
  const shardFiles = [...fin.shards.keys()].map((b) => formsShardFile(b, fin.buckets));
  files.set('dict/sq/forms/manifest.json', JSON.stringify({ version: 1, lang: 'sq', buckets: fin.buckets, forms: fin.forms, lemmas: fin.lemmas, fromTables: 0, shardFiles, builtFrom: String(manifest.id) }));
  for (const [b, text] of fin.shards) files.set(`dict/sq/forms/${formsShardFile(b, fin.buckets)}`, text);
  return files;
}

interface World {
  files: Map<string, string>;
  log: string[];
  down: { value: boolean };
  /** Called for every request to a dictionary file (not a manifest) before it answers; may reject or wait. */
  gate?: (url: string, init?: RequestInit) => Promise<void>;
  inflight: { now: number; max: number };
  fetch: typeof fetch;
}
function makeWorld(files: Map<string, string>): World {
  const w: World = { files, log: [], down: { value: false }, inflight: { now: 0, max: 0 }, fetch: undefined as never };
  w.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (w.down.value) throw new TypeError('Failed to fetch');
    w.log.push(u);
    if (u === `${OWN}config.json`) return new Response('', { status: 404 });
    const rel = u.startsWith(OWN) ? u.slice(OWN.length) : '';
    const isFile = !rel.endsWith('manifest.json') && rel.startsWith('dict/');
    if (isFile) {
      w.inflight.now += 1; w.inflight.max = Math.max(w.inflight.max, w.inflight.now);
      try {
        await new Promise((r) => setTimeout(r, 0)); // a request takes a turn of the event loop, so overlapping ones are seen
        if (w.gate) await w.gate(u, init);
      } finally { w.inflight.now -= 1; }
    }
    const body = w.files.get(rel);
    return body === undefined ? new Response('', { status: 404 }) : new Response(body, { status: 200 });
  }) as typeof fetch;
  return w;
}

const until = async (cond: () => boolean | Promise<boolean>, what = 'condition'): Promise<void> => {
  for (let i = 0; i < 4000; i++) { if (await cond()) return; await new Promise((r) => setTimeout(r, 1)); }
  throw new Error(`timed out waiting for ${what}`);
};

const newIdb = (): IDBFactory => new IDBFactory();

/** A worker over a fake chrome, a fake network and (optionally) an IndexedDB. */
function makeWorker(world: World, opts: { idb?: IDBFactory; fake?: ChromeFake; concurrency?: number } = {}) {
  const fake = opts.fake ?? createChromeFake();
  const bg = createBackground(fake, { fetch: world.fetch, packs: defaultPacks, now: () => 1_700_000_000_000, dictionary: { ...(opts.idb ? { idb: opts.idb } : {}), sleep: async () => undefined, ...(opts.concurrency ? { concurrency: opts.concurrency } : {}) } });
  bg.register();
  const page = (m: Record<string, unknown>) => fake.dispatch(m, PAGE) as Promise<any>;
  const content = (m: Record<string, unknown>) => fake.dispatch(m, CONTENT) as Promise<any>;
  const status = async (check = false): Promise<DownloadStatus> => (await page({ type: MSG.dictionaryDownload, op: 'status', languageId: 'sq', check })).status;
  const start = async (): Promise<DownloadStatus> => (await page({ type: MSG.dictionaryDownload, op: 'start', languageId: 'sq' })).status;
  const finished = async (): Promise<DownloadStatus> => { await until(async () => !['queued', 'running'].includes((await status()).state), 'the download to stop'); return status(); };
  const gloss = (lemma: string) => content({ type: MSG.gloss, lemma, pos: 'NOUN', languageId: 'sq' });
  return { fake, bg, page, content, status, start, finished, gloss };
}

const stored = async (idb: IDBFactory): Promise<string[]> => (await createDictionaryStore(idb).list('sq')).map((f) => f.id).sort();
const idOf = (path: string): string => path.replace(/\.json$/, '');
const fileUrls = (w: World): string[] => w.log.filter((u) => u.startsWith(OWN + 'dict/') && !u.endsWith('manifest.json'));
const dbNames = async (idb: IDBFactory): Promise<string[]> => (await idb.databases()).map((d) => d.name ?? '');

describe('the download', () => {
  it('stores every listed file once (meanings, frequency, forms index and both manifests), as fetched, and says how many files and how many bytes', async () => {
    const files = makeDictionary('2026-11-01', 4);
    const w = makeWorld(files);
    const idb = newIdb();
    const x = makeWorker(w, { idb });
    expect(await x.status()).toMatchObject({ state: 'none', outOfDate: false });
    const first = await x.start();
    expect(['queued', 'running']).toContain(first.state);
    const done = await x.finished();
    expect(done).toMatchObject({ state: 'complete', outOfDate: false });
    expect(done.done).toBe(done.total);
    expect(await stored(idb)).toEqual([...files.keys()].map(idOf).sort());
    expect(done.total).toBe(files.size);
    const all = [...files.values()].reduce((n, t) => n + new TextEncoder().encode(t).length, 0);
    expect(done.bytes).toBe(all);
    // each file was fetched exactly once; the meaning files and the forms files are all among them
    const fetched = fileUrls(w);
    expect(new Set(fetched).size).toBe(fetched.length);
    expect(fetched.length).toBe(files.size - 2); // the two manifests are read once, through the stored-row path, and kept as text
    expect(fetched.some((u) => u.endsWith('/s-00.json') || u.includes('/s-'))).toBe(true);
    expect(fetched.some((u) => u.includes('/forms/f-'))).toBe(true);
    // the bytes are exactly the server's, and the meanings are not copied into chrome.storage
    const store = createDictionaryStore(idb);
    expect(new TextDecoder().decode(await store.read('dict/sq/frequency'))).toBe(files.get('dict/sq/frequency.json'));
    const rows = Object.keys(await x.fake.local.get(null)).filter((k) => k.startsWith(SHARD_PREFIX));
    expect(rows.sort()).toEqual([`${SHARD_PREFIX}dict/sq/forms/manifest`, `${SHARD_PREFIX}dict/sq/manifest`]);
    expect(Object.keys(await x.fake.local.get(null)).filter((k) => k.startsWith('golearn:dictionary-download:'))).toEqual([downloadKey('sq')]);
  });

  it('a second start fetches nothing at all; a download that is complete and current is left alone', async () => {
    const w = makeWorld(makeDictionary('2026-11-01', 4));
    const x = makeWorker(w, { idb: newIdb() });
    await x.start();
    await x.finished();
    const n = w.log.length;
    expect(await x.start()).toMatchObject({ state: 'complete' });
    expect(w.log.length).toBe(n);
  });

  it('an interrupted run (the connection fails part-way) stops with a plain reason, keeps what it stored, and a new start fetches only the rest', async () => {
    const files = makeDictionary('2026-11-01', 4);
    const w = makeWorld(files);
    const idb = newIdb();
    const x = makeWorker(w, { idb, concurrency: 1 });
    let served = 0;
    w.gate = async () => { served += 1; if (served > 3) throw new TypeError('Failed to fetch'); };
    await x.start();
    const failed = await x.finished();
    expect(failed.state).toBe('failed');
    expect(failed.error).toMatch(/connection was lost/i);
    expect(failed.error).not.toMatch(/shard|IndexedDB|manifest/i);
    const keptNow = await stored(idb);
    expect(keptNow.length).toBeGreaterThanOrEqual(3);
    expect(keptNow.length).toBeLessThan(files.size);
    // what was stored still serves
    expect(new TextDecoder().decode(await createDictionaryStore(idb).read('dict/sq/frequency'))).toContain('libër');
    // the connection comes back: only the missing files are fetched
    w.gate = undefined;
    w.log.length = 0;
    await x.start();
    expect(await x.finished()).toMatchObject({ state: 'complete' });
    const again = fileUrls(w).map((u) => idOf(u.slice(OWN.length)));
    expect(again.sort()).toEqual([...files.keys()].map(idOf).filter((id) => !id.endsWith('manifest') && !keptNow.includes(id)).sort());
    expect(await stored(idb)).toEqual([...files.keys()].map(idOf).sort());
  });

  it('Cancel stops it: the row says cancelled, nothing keeps running, what was saved stays, and a new start carries on', async () => {
    const files = makeDictionary('2026-11-01', 4);
    const w = makeWorld(files);
    const idb = newIdb();
    const x = makeWorker(w, { idb, concurrency: 1 });
    let holding = 0;
    w.gate = (_u, init) => new Promise<void>((resolve, reject) => {
      holding += 1;
      if (holding <= 2) { resolve(); return; }
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    await x.start();
    await until(() => holding >= 3, 'a request to be held');
    const stopped = await x.page({ type: MSG.dictionaryDownload, op: 'cancel', languageId: 'sq' });
    expect(stopped.status.state).toBe('cancelled');
    expect(w.inflight.now).toBe(0);
    expect(x.bg.dictionary.running()).toEqual([]);
    const kept = await stored(idb);
    expect(kept.length).toBeGreaterThan(0);
    w.gate = undefined;
    w.log.length = 0;
    await x.start();
    expect(await x.finished()).toMatchObject({ state: 'complete' });
    expect(fileUrls(w).map((u) => idOf(u.slice(OWN.length))).every((id) => !kept.includes(id))).toBe(true);
  });

  it('a full device (the browser refuses a write) stops it with state failed and a plain reason, and leaves what was stored usable', async () => {
    const files = makeDictionary('2026-11-01', 4);
    const w = makeWorld(files);
    const idb = newIdb();
    const real = createDictionaryStore(idb);
    let writes = 0;
    const store: typeof real = { ...real, write: async (f) => { writes += 1; if (writes > 3) throw new DOMException('full', 'QuotaExceededError'); return real.write(f); } };
    const fake = createChromeFake();
    const gloss = createGlossService({ area: fake.local, session: { getService: async () => undefined } as unknown as SessionManager, fetch: w.fetch, packs: defaultPacks, getURL: (p) => fake.runtime.getURL!(p), offline: real });
    const dl = createDictionaryDownload({ area: fake.local, gloss, fetch: w.fetch, store, hold: () => () => undefined, now: () => 1, dictionaryRel: () => 'dict/sq', languages: () => ['sq'], sleep: async () => undefined });
    await dl.start('sq');
    await until(async () => (await dl.status('sq')).state === 'failed', 'the failure');
    const s = await dl.status('sq');
    expect(s.error).toMatch(/not enough room on this device/i);
    expect(s.error).toMatch(/still works/i);
    expect((await real.list('sq')).length).toBe(3);
    expect(await real.read('dict/sq/manifest')).toBeDefined();
  });

  it('never has more than four requests at once', async () => {
    const w = makeWorld(makeDictionary('2026-11-01', 32));
    const x = makeWorker(w, { idb: newIdb() });
    await x.start();
    await x.finished();
    expect(fileUrls(w).length).toBeGreaterThan(8);
    expect(w.inflight.max).toBeLessThanOrEqual(4);
    expect(w.inflight.max).toBeGreaterThanOrEqual(2);
  });

  it('can be started only from an extension page: a content script (and a stranger) is refused for every op, and nothing is fetched', async () => {
    const w = makeWorld(makeDictionary('2026-11-01', 4));
    const x = makeWorker(w, { idb: newIdb() });
    for (const op of ['start', 'status', 'cancel', 'remove']) {
      expect(await x.content({ type: MSG.dictionaryDownload, op, languageId: 'sq' }), op).toEqual({ ok: false, error: 'forbidden' });
      expect(await x.fake.dispatch({ type: MSG.dictionaryDownload, op, languageId: 'sq' }, { id: 'someone-else', url: 'chrome-extension://someone-else/x.html' }), op).toEqual({ ok: false, error: 'forbidden' });
    }
    expect(w.log).toEqual([]);
    expect(await x.page({ type: MSG.dictionaryDownload, op: 'start', languageId: '../x' })).toEqual({ ok: false, error: 'bad-request' });
    expect(await x.page({ type: MSG.dictionaryDownload, op: 'explode', languageId: 'sq' })).toEqual({ ok: false, error: 'bad-request' });
  });

  it('Remove frees everything: the files, the progress row, and stops a running download first', async () => {
    const w = makeWorld(makeDictionary('2026-11-01', 4));
    const idb = newIdb();
    const x = makeWorker(w, { idb });
    await x.start();
    await x.finished();
    expect((await stored(idb)).length).toBeGreaterThan(5);
    const gone = await x.page({ type: MSG.dictionaryDownload, op: 'remove', languageId: 'sq' });
    expect(gone.status).toMatchObject({ state: 'none', done: 0, total: 0, bytes: 0 });
    expect(await stored(idb)).toEqual([]);
    expect(Object.keys(await x.fake.local.get(null))).not.toContain(downloadKey('sq'));
    expect(await x.status()).toMatchObject({ state: 'none' });
  });

  it('a new dictionary revision makes the complete download out of date; Update downloads the new one and removes what the old one had', async () => {
    const a = makeDictionary('2026-11-01', 8);
    const w = makeWorld(a);
    const idb = newIdb();
    const x = makeWorker(w, { idb });
    await x.start();
    await x.finished();
    const revisionA = JSON.parse(a.get('dict/sq/manifest.json')!).id as string;
    expect(await x.status()).toMatchObject({ state: 'complete', outOfDate: false, revision: revisionA });
    // the server now has another revision, with fewer, different files
    const b = makeDictionary('2026-11-09', 2, [['re', 'cloud']]);
    w.files = b;
    expect(await x.status()).toMatchObject({ outOfDate: false }); // a local-only status does not know yet
    expect(await x.status(true)).toMatchObject({ state: 'complete', outOfDate: true });
    const revisionB = JSON.parse(b.get('dict/sq/manifest.json')!).id as string;
    expect(revisionB).not.toBe(revisionA);
    await x.start();
    const upd = await x.finished();
    expect(upd).toMatchObject({ state: 'complete', outOfDate: false, revision: revisionB });
    const now = await createDictionaryStore(idb).list('sq');
    expect(now.every((f) => f.revision === revisionB)).toBe(true);
    expect(now.map((f) => f.id).sort()).toEqual([...b.keys()].map(idOf).sort());
  });

  it('a worker that was stopped part-way carries on when the page asks, or at the next sync round, from what is stored', async () => {
    const files = makeDictionary('2026-11-01', 8);
    const w = makeWorld(files);
    const idb = newIdb();
    const first = makeWorker(w, { idb, concurrency: 1 });
    let served = 0;
    let hold!: () => void;
    w.gate = () => { served += 1; return served > 3 ? new Promise<void>((r) => { hold = r; }) : Promise.resolve(); };
    await first.start();
    await until(() => served > 3, 'the worker to be mid-download');
    const kept = (await stored(idb)).length;
    const rowText = JSON.stringify((await first.fake.local.get(null))[downloadKey('sq')]);
    expect(rowText).toContain('"running"');
    // the worker is killed here: a new one over a copy of the storage and the same IndexedDB
    const fake2 = createChromeFake();
    await fake2.local.set(await first.fake.local.get(null));
    w.gate = undefined;
    w.log.length = 0;
    const second = makeWorker(w, { idb, fake: fake2 });
    expect(w.log).toEqual([]); // nothing starts at worker start
    expect((await second.status()).state).toBe('running'); // the page asks: the download resumes
    expect(await second.finished()).toMatchObject({ state: 'complete' });
    expect(fileUrls(w).length).toBeLessThanOrEqual(files.size - 2 - kept + 2);
    expect(await stored(idb)).toEqual([...files.keys()].map(idOf).sort());
    hold?.();
  });
});

describe('what the download is for: a word never looked up before, with no connection', () => {
  async function downloaded() {
    const w = makeWorld(makeDictionary('2026-11-01', 4));
    const idb = newIdb();
    const first = makeWorker(w, { idb });
    await first.start();
    await first.finished();
    return { w, idb, first };
  }
  /** A restarted worker over a copy of the first one's storage, with the network down. */
  const restartOffline = async (w: World, idb: IDBFactory | undefined, from: ChromeFake) => {
    const fake = createChromeFake();
    await fake.local.set(await from.local.get(null));
    w.down.value = true;
    return makeWorker(w, { ...(idb ? { idb } : {}), fake });
  };

  it('with the download complete and every fetch failing (the location probes too), a gloss for a word never looked up resolves with its meaning, and the forms index answers', async () => {
    const { w, idb, first } = await downloaded();
    const second = await restartOffline(w, idb, first.fake);
    const before = Object.keys(await second.fake.local.get(null)).sort();
    for (const [word, meaning] of [['mal', 'mountain'], ['lumë', 'river'], ['zog', 'bird']] as const) {
      const r = await second.gloss(word);
      expect(r, word).toMatchObject({ ok: true, found: true, senses: [meaning] });
    }
    const forms = await second.content({ type: MSG.confirmForms, languageId: 'sq', forms: ['qiell', 'det', 'zzzz'] });
    expect(forms.ok).toBe(true);
    expect(forms.reason).toBeUndefined();
    expect(forms.forms.qiell?.[0]).toBe('qiell');
    expect(forms.forms.det?.[0]).toBe('det');
    expect(forms.forms.zzzz).toBeNull();
    // an offline hit is never copied into chrome.storage
    expect(Object.keys(await second.fake.local.get(null)).sort()).toEqual(before);
  });

  it('the same word without the download still answers "offline", as today', async () => {
    const w = makeWorld(makeDictionary('2026-11-01', 4));
    const worker = makeWorker(w, { idb: newIdb() }); // IndexedDB present, nothing downloaded
    w.down.value = true;
    expect(await worker.gloss('mal')).toMatchObject({ ok: true, found: false, reason: 'offline' });
    const noIdb = makeWorker(w);
    expect(await noIdb.gloss('mal')).toMatchObject({ ok: true, found: false, reason: 'offline' });
    expect(await worker.content({ type: MSG.confirmForms, languageId: 'sq', forms: ['mal'] })).toMatchObject({ ok: true, reason: 'offline' });
  });

  it('a Remove puts the language back to "offline" for words not yet met', async () => {
    const { w, idb, first } = await downloaded();
    await first.page({ type: MSG.dictionaryDownload, op: 'remove', languageId: 'sq' });
    const second = await restartOffline(w, idb, first.fake);
    expect(await second.gloss('mal')).toMatchObject({ found: false, reason: 'offline' });
  });
});

describe('the normal path is exactly what it was', () => {
  it('with nothing downloaded the requests and the stored rows of a first gloss are identical with and without IndexedDB, and IndexedDB is not even opened while chrome.storage has the row', async () => {
    const run = async (idb: IDBFactory | undefined) => {
      const w = makeWorld(makeDictionary('2026-11-01', 4));
      const x = makeWorker(w, idb ? { idb } : {});
      const r = await x.gloss('libër');
      await new Promise((res) => setTimeout(res, 30));
      const rows = Object.keys(await x.fake.local.get(null)).filter((k) => k.startsWith(SHARD_PREFIX)).sort();
      const second = await x.gloss('libër');
      return { w, r, second, rows, urls: [...w.log] };
    };
    let opens = 0;
    const real = newIdb();
    const counting = { open: (...a: Parameters<IDBFactory['open']>) => { opens += 1; return real.open(...a); }, deleteDatabase: (n: string) => real.deleteDatabase(n), databases: () => real.databases() } as unknown as IDBFactory;
    const without = await run(undefined);
    const withIdb = await run(counting);
    expect(withIdb.r).toEqual(without.r);
    expect(withIdb.r).toMatchObject({ found: true, senses: ['book'] });
    expect(withIdb.urls).toEqual(without.urls);
    expect(withIdb.rows).toEqual(without.rows);
    expect(withIdb.second).toEqual(without.second);
    // every file of the first gloss was a chrome.storage miss and was answered by the network: the database is opened lazily (once) for those misses, never per hit
    expect(opens).toBeLessThanOrEqual(1);
    const hits = opens;
    // the repeated gloss is served by chrome.storage rows: it does not touch the database again
    const w2 = makeWorld(makeDictionary('2026-11-01', 4));
    const y = makeWorker(w2, { idb: counting });
    await y.gloss('libër');
    const afterFirst = opens;
    await y.gloss('libër');
    await y.gloss('libër');
    expect(opens).toBe(afterFirst);
    expect(hits).toBeLessThanOrEqual(1);
  });

  it('a gzip file is stored as fetched and read back inflated through the shard fetch, never copied into chrome.storage', async () => {
    const idb = newIdb();
    const store = createDictionaryStore(idb);
    const text = JSON.stringify({ hello: 'wörld' });
    const gz = new Uint8Array(gzipSync(Buffer.from(text, 'utf8')));
    await store.write({ id: 'dict/sq/full/f-aa', lang: 'sq', revision: 'r1', size: gz.length, bytes: gz });
    expect(await store.read('dict/sq/full/f-aa')).toEqual(gz);
    const fake = createChromeFake();
    const f = createShardFetch(fake.local, OWN, (async () => { throw new TypeError('down'); }) as typeof fetch, Date.now, store);
    const res = await f(`${OWN}dict/sq/full/f-aa.json.gz`);
    expect(await res.text()).toBe(text);
    expect(await fake.local.get(null)).toEqual({});
  });

  it('where IndexedDB is absent or broken the worker behaves as before', async () => {
    const w = makeWorld(makeDictionary('2026-11-01', 4));
    const broken = { open: () => { throw new Error('no storage'); }, deleteDatabase: () => { throw new Error('no storage'); } } as unknown as IDBFactory;
    const x = makeWorker(w, { idb: broken });
    expect(await x.gloss('libër')).toMatchObject({ found: true, senses: ['book'] });
    await x.start();
    expect((await x.finished()).state).toBe('failed');
  });
});

describe('Delete this device\'s data', () => {
  it('removes every cached dictionary row, the pack install records, the download rows and the database; nothing else that was kept before is lost', async () => {
    const w = makeWorld(makeDictionary('2026-11-01', 4));
    const idb = newIdb();
    const x = makeWorker(w, { idb });
    await x.gloss('libër');
    await x.start();
    await x.finished();
    await x.fake.local.set({ 'golearn:pack:installed:pack:sq': { version: '9' }, 'golearn:app': { visited: ['x'], packs: { 'pack:sq': { ok: true } } }, 'golearn:settings': { remoteSpeechConsent: false }, 'golearn:event:e1': { id: 'e1' }, 'unrelated:key': 1 });
    expect(await dbNames(idb)).toContain(DICTIONARY_DB);
    const before = Object.keys(await x.fake.local.get(null)).sort();
    expect(before.some((k) => k.startsWith('pack:shard:'))).toBe(true);
    const r = await x.page({ type: MSG.clearLocal });
    expect(r).toMatchObject({ ok: true, events: 1 });
    const after = Object.keys(await x.fake.local.get(null)).sort();
    expect(after.filter((k) => k.startsWith('pack:shard:') || k.startsWith('golearn:pack:installed:') || k.startsWith('golearn:dictionary-download:'))).toEqual([]);
    expect(await dbNames(idb)).not.toContain(DICTIONARY_DB);
    // removed now: exactly the dictionary rows, the pack record, the download row and the event; every other key stays as it was
    const removed = before.filter((k) => !after.includes(k));
    expect(removed.filter((k) => !k.startsWith('pack:shard:'))).toEqual(['golearn:dictionary-download:sq', 'golearn:event:e1', 'golearn:pack:installed:pack:sq']);
    expect(after).toEqual(expect.arrayContaining(['golearn:app', 'golearn:settings', 'unrelated:key']));
    // the worker holds nothing of the old dictionary in memory: a word is "offline" again when the network is down
    w.down.value = true;
    expect(await x.gloss('mal')).toMatchObject({ found: false, reason: 'offline' });
  });

  it('lists key names instead of reading the whole area where the browser can (getKeys), and a download in progress is stopped first', async () => {
    const w = makeWorld(makeDictionary('2026-11-01', 8));
    const idb = newIdb();
    const fake = createChromeFake();
    const local = fake.local as unknown as { get: (k?: unknown) => Promise<Record<string, unknown>>; getKeys?: () => Promise<string[]> };
    const rawGet = local.get.bind(local);
    local.getKeys = async () => Object.keys(await rawGet(null));
    local.get = async (k?: unknown) => { if (k === null || k === undefined) throw new Error('the whole area must not be read'); return rawGet(k); };
    const x = makeWorker(w, { idb, fake, concurrency: 1 });
    let served = 0;
    w.gate = async () => { served += 1; };
    await x.start();
    await until(() => served > 2, 'a download in progress');
    const r = await x.page({ type: MSG.clearLocal });
    expect(r.ok).toBe(true);
    expect(x.bg.dictionary.running()).toEqual([]);
    const keys = await local.getKeys!();
    expect(keys.filter((k) => k.startsWith('golearn:dictionary-download:'))).toEqual([]);
    expect(await dbNames(idb)).not.toContain(DICTIONARY_DB);
  });
});
