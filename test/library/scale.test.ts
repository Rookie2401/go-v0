// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterAll, describe, expect, it } from 'vitest';
import { createMemoryStore, ids, type AppStore, type CatalogText, type RightsState } from '../../src/core';
import { createDexieStore, type DexieAppStore } from '../../src/db/dexie';
import { createLibrary, putCatalogRows, searchCatalog, SHARD_ROWS, type SearchStats } from '../../src/library';
import { clock, registry } from './helpers';

/**
 * Scale proof: a synthetic catalogue of 20,000 rows. Each query below must answer with a page without handing the
 * caller the rest of the table. "Table reads" counts every row any table method returned to the library while the query
 * ran (catalogue rows and posting-list rows alike), and the calls that could list a table (`all`, `where`) separately.
 *
 * TIME BUDGET (memory store, this machine class): 250 ms per query. A query is a handful of row reads; the budget is
 * generous so the test is about the number of reads, which is what does not change with the machine.
 */
const ROWS = 20_000;
const BUDGET_MS = 250;

const STREAMS = ['library', 'honduras', 'knowledge', 'scripture', 'mission', 'acquisition', 'personal', 'listening'] as const;
const RIGHTS: RightsState[] = ['verified-public-domain', 'verified-open-licence', 'course-authored', 'rights-unverified'];
const SYLLABLES = ['ba', 'ce', 'di', 'fo', 'gu', 'ha', 'je', 'ki', 'lo', 'mu', 'na', 'pe', 'qua', 'ri', 'so', 'tu', 'va', 'xe', 'yo', 'za'];
/** 300 distinct surnames of three syllables, spread evenly: about 65 works each. */
const surname = (k: number) => { const s = SYLLABLES[k % 20] + SYLLABLES[Math.floor(k / 20) % 20] + SYLLABLES[(k * 7) % 20]; return s[0].toUpperCase() + s.slice(1); };
const authorOf = (n: number) => `${['Ana', 'Luis', 'Rosa', 'Juan'][n % 4]} ${surname((n * 7) % 300)}`;
const WORDS = ['historia', 'camino', 'noche', 'montana', 'rio', 'ciudad', 'sombra', 'aventura', 'memoria', 'carta', 'jardin', 'viaje', 'isla', 'fuego', 'sueno'];

function synthetic(n: number): CatalogText {
  const w = (k: number) => WORDS[(n * 7 + k * 3) % WORDS.length];
  // about one title in 1,000 mentions "Quijote"; about one in 200 has another word beginning "qui"
  const special = n % 1000 === 7 ? 'Quijote' : n % 200 === 11 ? 'Quimera' : '';
  return {
    id: ids.text('es', `obra-${String(n).padStart(6, '0')}`), lang: 'es', title: `${w(0)} ${special} ${w(1)} ${n}`.replace(/\s+/g, ' ').trim(),
    author: authorOf(n), workId: `work:honduras-es:obra-${Math.floor(n / 20)}`, chapter: (n % 20) + 1,
    stream: STREAMS[n % STREAMS.length], rights: RIGHTS[(n + Math.floor(n / 5)) % RIGHTS.length], location: 'library', published: n % 4 === 0,
    stageId: `stage:honduras-es:s${n % 8}`, features: { words: 500 + (n % 700), sentences: 40, uniqueForms: 200, meanSentenceWords: 12 },
    documentPath: `t/00/obra-${n}.json`, profilePath: `p/00/obra-${n}.json`,
  };
}

interface Reads { rows: number; listCalls: number }
/** Wrap every read method of every table so that rows handed back are counted. */
function counting(store: AppStore): { reads: Reads; reset(): void } {
  const reads: Reads = { rows: 0, listCalls: 0 };
  for (const table of Object.values(store)) {
    if (typeof (table as { getMany?: unknown } | null)?.getMany !== 'function') continue; // not a table (transaction, assets, close …)
    const t = table as Record<string, (...a: unknown[]) => Promise<unknown>>;
    const wrap = (method: string, count: (r: unknown) => number, list = false) => {
      const real = t[method].bind(t);
      t[method] = async (...a: unknown[]) => { const r = await real(...a); reads.rows += count(r); if (list) reads.listCalls++; return r; };
    };
    wrap('get', (r) => (r ? 1 : 0));
    wrap('getMany', (r) => (r as unknown[]).filter(Boolean).length);
    wrap('all', (r) => (r as unknown[]).length, true);
    wrap('where', (r) => (r as unknown[]).length, true);
  }
  return { reads, reset: () => { reads.rows = 0; reads.listCalls = 0; } };
}

const report: string[] = [];
afterAll(() => { for (const line of report) console.log(line); });

describe(`scale: a ${ROWS}-row catalogue on the memory store`, () => {
  const store = createMemoryStore();
  const all: CatalogText[] = Array.from({ length: ROWS }, (_, i) => synthetic(i));
  const meter = counting(store);

  it('indexes the rows in shard-sized batches', async () => {
    const t0 = Date.now();
    for (let i = 0; i < all.length; i += SHARD_ROWS) await putCatalogRows(store, all.slice(i, i + SHARD_ROWS), clock());
    const ms = Date.now() - t0;
    expect(await store.catalog.count()).toBe(ROWS);
    report.push(`scale: indexed ${ROWS} rows in ${ROWS / SHARD_ROWS} batches of ${SHARD_ROWS}: ${ms} ms`);
  }, 120_000);

  async function measure(name: string, q: Parameters<typeof searchCatalog>[1], expectReads: number) {
    meter.reset();
    let stats: SearchStats | undefined;
    const t0 = performance.now();
    const r = await searchCatalog(store, q, clock(), (s) => { stats = s; });
    const ms = performance.now() - t0;
    report.push(`scale: ${name}: total ${r.total}, page ${r.items.length}, table reads ${meter.reads.rows} (catalogue rows ${stats!.rowsRead}), list calls ${meter.reads.listCalls}, ${stats!.mode} via ${stats!.driver}, ${ms.toFixed(1)} ms`);
    expect(meter.reads.listCalls, `${name}: never lists a table`).toBe(0);
    expect(meter.reads.rows, `${name}: table reads`).toBeLessThanOrEqual(expectReads);
    expect(ms, `${name}: time`).toBeLessThan(BUDGET_MS);
    return { r, stats: stats! };
  }

  it('a stream page reads about one page of rows, wherever in the stream it is', async () => {
    const inStream = all.filter((x) => x.stream === 'honduras');
    for (const offset of [0, 600, inStream.length - 10]) {
      // one head row, the posting chunks that cover the page (at most two), and the page's catalogue rows
      const { r } = await measure(`stream page at ${offset}`, { lang: 'es', stream: 'honduras', limit: 30, offset }, 2 + 2 + 30);
      expect(r.total).toBe(inStream.length);
      expect(r.items.map((x) => x.id)).toEqual(inStream.slice(offset, offset + 30).map((x) => x.id));
    }
  });

  it('a text search reads only the rows of one three-letter bucket, and returns the right ones', async () => {
    const want = all.filter((x) => /quijote/i.test(x.title));
    const bucket = all.filter((x) => /\bqui/i.test(x.title));
    expect(want.length).toBe(20);
    expect(bucket.length).toBeGreaterThan(want.length);
    expect(bucket.length).toBeLessThan(ROWS / 50);
    const { r, stats } = await measure('text "quijote"', { lang: 'es', text: 'quijote', limit: 30 }, bucket.length + 2 + Math.ceil(bucket.length / 128) + 4);
    expect(r.total).toBe(want.length);
    expect(r.items.map((x) => x.id)).toEqual(want.map((x) => x.id));
    expect(stats.driver).toBe('w=qui');
    expect(stats.rowsRead).toBe(bucket.length);
  });

  it('a text search by author reads that surname\'s bucket', async () => {
    const name = surname(14).toLowerCase();
    const want = all.filter((x) => x.author!.toLowerCase().endsWith(` ${name}`));
    const bucket = all.filter((x) => x.author!.toLowerCase().split(' ').some((w) => w.startsWith(name.slice(0, 3))));
    expect(want.length).toBeGreaterThan(30);
    expect(bucket.length).toBeLessThan(ROWS / 20);
    const { r } = await measure(`text "${name}" (author)`, { lang: 'es', text: name, limit: 30 }, bucket.length + 2 + Math.ceil(bucket.length / 128) + 4);
    expect(r.total).toBe(want.length);
    expect(r.items).toHaveLength(30);
  });

  it('a rights filter page reads one page of rows', async () => {
    const want = all.filter((x) => x.rights === 'course-authored');
    const { r, stats } = await measure('rights filter', { lang: 'es', rights: 'course-authored', limit: 30, offset: 90 }, 2 + 2 + 30);
    expect(r.total).toBe(want.length);
    expect(r.items.map((x) => x.id)).toEqual(want.slice(90, 120).map((x) => x.id));
    expect(stats.mode).toBe('exact');
  });

  it('published-only and location pages are exact too, and the whole-catalogue page is one page', async () => {
    await measure('published only', { lang: 'es', publishedOnly: true, limit: 30 }, 2 + 2 + 30);
    await measure('location library', { lang: 'es', location: 'library', limit: 200, offset: 1000 }, 2 + 3 + 200);
    const { r } = await measure('no filter', { lang: 'es', limit: 200 }, 2 + 3 + 200);
    expect(r.total).toBe(ROWS);
    expect(r.items).toHaveLength(200);
  });

  it('a combined query intersects the lists as ids and reads only the page of catalogue rows', async () => {
    const want = all.filter((x) => x.stream === 'honduras' && x.rights === 'course-authored');
    const sizes = [all.filter((x) => x.stream === 'honduras').length, all.filter((x) => x.rights === 'course-authored').length];
    const idChunks = sizes.reduce((n, k) => n + Math.ceil(k / 128), 0);
    const { r, stats } = await measure('stream + rights (driven)', { lang: 'es', stream: 'honduras', rights: 'course-authored', limit: 30 }, idChunks + 2 + 30 + 2);
    expect(r.total).toBe(want.length);
    expect(r.items.map((x) => x.id)).toEqual(want.slice(0, 30).map((x) => x.id));
    expect(stats.mode).toBe('driven');
    expect(stats.rowsRead).toBe(30);
  });

  it('a combined query with a text still reads only the candidates that survive the lists', async () => {
    const want = all.filter((x) => x.stream === 'scripture' && /quimera/i.test(x.title));
    const { r, stats } = await measure('stream + text (driven)', { lang: 'es', stream: 'scripture', text: 'quimera', limit: 30 }, 400);
    expect(r.total).toBe(want.length);
    expect(stats.rowsRead).toBeLessThan(200);
  });

  it('the chapters of a work read only the rows of that work, in chapter order', async () => {
    const work = 'work:honduras-es:obra-123';
    const want = all.filter((x) => x.workId === work);
    expect(want).toHaveLength(20);
    const { r, stats } = await measure('work chapters', { lang: 'es', workId: work, limit: 200 }, 20 + 2 + 2);
    expect(r.items.map((x) => x.chapter)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(r.total).toBe(20);
    expect(stats.rowsRead).toBe(20);
  });

  it('a library-level search is the same query', async () => {
    const lib = createLibrary({ store, adapters: registry, clock, fetch: (async () => new Response('', { status: 404 })) as typeof fetch });
    meter.reset();
    const r = await lib.search({ lang: 'es', stream: 'scripture', limit: 10 });
    expect(r.items).toHaveLength(10);
    expect(meter.reads.rows).toBeLessThanOrEqual(1 + 1 + 10 + 2); // heads, chunk, page, plus the library's own checks
    expect(meter.reads.listCalls).toBe(0);
  });
});

describe('the same posting lists on the Dexie store', () => {
  const dexies: DexieAppStore[] = [];
  afterAll(async () => { for (const d of dexies) await d.destroy(); });

  it('index and page 3,000 rows through real IndexedDB transactions', async () => {
    const store = createDexieStore(`go-scale-${Date.now()}`);
    dexies.push(store);
    const rows = Array.from({ length: 3000 }, (_, i) => synthetic(i));
    const t0 = Date.now();
    for (let i = 0; i < rows.length; i += SHARD_ROWS) await putCatalogRows(store, rows.slice(i, i + SHARD_ROWS), clock());
    const indexMs = Date.now() - t0;
    expect(await store.catalog.count()).toBe(3000);
    const meter = counting(store);
    const t1 = performance.now();
    const page = await searchCatalog(store, { lang: 'es', stream: 'honduras', limit: 30, offset: 30 });
    const ms = performance.now() - t1;
    const want = rows.filter((x) => x.stream === 'honduras');
    expect(page.total).toBe(want.length);
    expect(page.items.map((x) => x.id)).toEqual(want.slice(30, 60).map((x) => x.id));
    expect(meter.reads.rows).toBeLessThanOrEqual(2 + 2 + 30);
    expect(meter.reads.listCalls).toBe(0);
    const pageReads = meter.reads.rows;
    expect((await searchCatalog(store, { lang: 'es', text: 'quijote' })).total).toBe(rows.filter((x) => /quijote/i.test(x.title)).length);
    report.push(`scale (Dexie, 3000 rows): indexed in ${indexMs} ms; stream page: ${pageReads} table reads, ${ms.toFixed(1)} ms`);
  }, 120_000);
});
