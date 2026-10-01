/**
 * The catalogue index: how a page of the `catalog` table is served without reading the rest of it.
 *
 * The store's `Table` can only filter by equality and return EVERY match, so on its own `where('stream', 'library')`
 * would hand the caller thousands of rows to show thirty. Instead each facet of a catalogue row (its stream, stage,
 * work, domain, variety, era, genre, rights state, location, author, "published", and the first three letters of every
 * word of its title and author) keeps a POSTING LIST in the `meta` table: the ids of the rows that have it, in
 * catalogue order, in chunks of CHUNK ids, with a small head row that says how many chunks and ids there are.
 * Reading a page is then: the head (one row), the chunks that cover the page, and `catalog.getMany` of those ids.
 *
 *   exact queries    one indexed facet and nothing else          cost O(limit): total is the head's count
 *   driven queries   several facets, a text, a word count range  the SMALLEST list drives; its rows are read chunk by
 *                    chunk, tested in the page, and counted to the end (memory is one chunk, reads are the driver's size)
 *   scans            nothing indexed (word counts alone, or a text of one or two letters)  the `all` list drives
 *
 * Catalogue order is the order rows were first indexed (a built library: manifest order, so the chapters of a work are
 * together and in sequence). Writing goes through `putCatalogRows` / `removeCatalogRows` only; `search` notices a
 * table that was changed behind its back (row count differs from what was indexed) and rebuilds the lists.
 */
import type { AppStore, CatalogText, LanguageCode, LibraryQuery, MetaRow } from '../core';
import { LANGUAGES, LANGUAGE_ROWS } from '../core';
import { fold, prefixOf, wordsOf } from './text';

export const CHUNK = 128;
export const DEFAULT_LIMIT = 30;
export const MAX_LIMIT = 200;

interface Head { n: number; next: number; chunks: Array<[number, number]> }

const headKey = (lang: LanguageCode, facet: string) => `library:h:${lang}:${facet}`;
const chunkKey = (lang: LanguageCode, facet: string, no: number) => `library:c:${lang}:${facet}:${no}`;
const countKey = (lang: LanguageCode) => `library:n:${lang}`;

const parseHead = (row: MetaRow | undefined): Head | undefined => {
  if (!row) return undefined;
  try { return JSON.parse(row.value) as Head; } catch { return undefined; }
};
const parseChunk = (row: MetaRow | undefined): string[] => {
  if (!row) return [];
  try { const v = JSON.parse(row.value) as unknown; return Array.isArray(v) ? (v as string[]) : []; } catch { return []; }
};

/** The facets a row is listed under. Sorted and unique. */
export function facetsOf(row: CatalogText): string[] {
  const f = new Set<string>(['all']);
  for (const s of [row.stream, ...(row.streams ?? [])]) if (s) f.add(`stream=${s}`);
  if (row.stageId) f.add(`stage=${row.stageId}`);
  if (row.workId) f.add(`work=${row.workId}`);
  for (const d of row.domains ?? []) f.add(`domain=${d}`);
  if (row.variety) f.add(`variety=${row.variety}`);
  if (row.era) f.add(`era=${row.era}`);
  if (row.genre) f.add(`genre=${row.genre}`);
  f.add(`rights=${row.rights}`);
  f.add(`location=${row.location}`);
  if (row.author) f.add(`author=${fold(row.author).trim()}`);
  if (row.published) f.add('pub');
  for (const w of wordsOf(`${row.title} ${row.author ?? ''}`)) f.add(`w=${prefixOf(w)}`);
  return [...f].sort();
}

// ───────────────────────────── writing ─────────────────────────────

async function appendIds(store: AppStore, lang: LanguageCode, adds: Map<string, string[]>, now: string): Promise<void> {
  if (!adds.size) return;
  const facets = [...adds.keys()];
  const heads = (await store.meta.getMany(facets.map((f) => headKey(lang, f)))).map((r) => parseHead(r) ?? { n: 0, next: 0, chunks: [] });
  const lastKeys: string[] = [];
  const lastIndex = new Map<number, number>();
  heads.forEach((h, i) => {
    const last = h.chunks[h.chunks.length - 1];
    if (last && last[1] < CHUNK) { lastIndex.set(i, lastKeys.length); lastKeys.push(chunkKey(lang, facets[i], last[0])); }
  });
  const lastRows = await store.meta.getMany(lastKeys);
  const writes: MetaRow[] = [];
  facets.forEach((facet, i) => {
    const head = heads[i];
    const ids = adds.get(facet)!;
    let current: string[] = [];
    let no = -1;
    const li = lastIndex.get(i);
    if (li !== undefined) { current = parseChunk(lastRows[li]); no = head.chunks[head.chunks.length - 1][0]; head.chunks.pop(); }
    for (const id of ids) {
      if (no < 0 || current.length >= CHUNK) {
        if (no >= 0) { head.chunks.push([no, current.length]); writes.push({ id: chunkKey(lang, facet, no), value: JSON.stringify(current), updatedAt: now }); }
        no = head.next++;
        current = [];
      }
      current.push(id);
    }
    head.chunks.push([no, current.length]);
    writes.push({ id: chunkKey(lang, facet, no), value: JSON.stringify(current), updatedAt: now });
    head.n += ids.length;
    writes.push({ id: headKey(lang, facet), value: JSON.stringify(head), updatedAt: now });
  });
  await store.meta.bulkPut(writes);
}

async function dropIds(store: AppStore, lang: LanguageCode, drops: Map<string, Set<string>>, now: string): Promise<void> {
  for (const [facet, gone] of drops) {
    const head = parseHead(await store.meta.get(headKey(lang, facet)));
    if (!head) continue;
    const rows = await store.meta.getMany(head.chunks.map(([no]) => chunkKey(lang, facet, no)));
    const kept: Array<[number, number]> = [];
    const writes: MetaRow[] = [];
    let n = 0;
    for (let i = 0; i < head.chunks.length; i++) {
      const no = head.chunks[i][0];
      const ids = parseChunk(rows[i]);
      const left = ids.filter((id) => !gone.has(id));
      if (left.length === ids.length) { kept.push([no, ids.length]); n += ids.length; continue; }
      if (left.length === 0) { await store.meta.delete(chunkKey(lang, facet, no)); continue; }
      kept.push([no, left.length]);
      n += left.length;
      writes.push({ id: chunkKey(lang, facet, no), value: JSON.stringify(left), updatedAt: now });
    }
    if (n === 0) { await store.meta.delete(headKey(lang, facet)); continue; }
    writes.push({ id: headKey(lang, facet), value: JSON.stringify({ n, next: head.next, chunks: kept } satisfies Head), updatedAt: now });
    await store.meta.bulkPut(writes);
  }
}

async function bumpCount(store: AppStore, lang: LanguageCode, by: number, now: string): Promise<void> {
  if (!by) return;
  const cur = Number((await store.meta.get(countKey(lang)))?.value ?? 0);
  await store.meta.put({ id: countKey(lang), value: String(Math.max(0, cur + by)), updatedAt: now });
}

const TABLES = ['catalog', 'meta'] as const;
const nowOf = (now?: string) => now ?? new Date().toISOString();

/** Add or replace catalogue rows, keeping every posting list in step. Idempotent. */
export async function putCatalogRows(store: AppStore, rows: CatalogText[], now?: string): Promise<void> {
  if (!rows.length) return;
  const stamp = nowOf(now);
  const unique = new Map(rows.map((r) => [r.id, r]));
  const list = [...unique.values()];
  await store.transaction([...TABLES], async () => {
    const before = await store.catalog.getMany(list.map((r) => r.id));
    const adds = new Map<LanguageCode, Map<string, string[]>>();
    const drops = new Map<LanguageCode, Map<string, Set<string>>>();
    const created = new Map<LanguageCode, number>();
    list.forEach((row, i) => {
      const old = before[i];
      const next = new Set(facetsOf(row));
      const prev = new Set(old ? facetsOf(old) : []);
      if (!old) created.set(row.lang, (created.get(row.lang) ?? 0) + 1);
      for (const f of next) if (!prev.has(f)) {
        const perLang = adds.get(row.lang) ?? adds.set(row.lang, new Map()).get(row.lang)!;
        (perLang.get(f) ?? perLang.set(f, []).get(f)!).push(row.id);
      }
      if (old) for (const f of prev) if (!next.has(f)) {
        const perLang = drops.get(old.lang) ?? drops.set(old.lang, new Map()).get(old.lang)!;
        (perLang.get(f) ?? perLang.set(f, new Set()).get(f)!).add(row.id);
      }
    });
    for (const [lang, d] of drops) await dropIds(store, lang, d, stamp);
    for (const [lang, a] of adds) await appendIds(store, lang, a, stamp);
    await store.catalog.bulkPut(list);
    for (const [lang, n] of created) await bumpCount(store, lang, n, stamp);
  });
}

/** Remove catalogue rows (by id) and their posting-list entries. */
export async function removeCatalogRows(store: AppStore, idList: string[], now?: string): Promise<number> {
  if (!idList.length) return 0;
  const stamp = nowOf(now);
  let removed = 0;
  await store.transaction([...TABLES], async () => {
    const rows = (await store.catalog.getMany(idList)).filter((r): r is CatalogText => !!r);
    const drops = new Map<LanguageCode, Map<string, Set<string>>>();
    const gone = new Map<LanguageCode, number>();
    for (const row of rows) {
      gone.set(row.lang, (gone.get(row.lang) ?? 0) + 1);
      const perLang = drops.get(row.lang) ?? drops.set(row.lang, new Map()).get(row.lang)!;
      for (const f of facetsOf(row)) (perLang.get(f) ?? perLang.set(f, new Set()).get(f)!).add(row.id);
    }
    for (const [lang, d] of drops) await dropIds(store, lang, d, stamp);
    for (const row of rows) await store.catalog.delete(row.id);
    for (const [lang, n] of gone) await bumpCount(store, lang, -n, stamp);
    removed = rows.length;
  });
  return removed;
}

/**
 * Rebuild the lists of every language from the rows of the table (reads them all, once). Only needed when the table
 * was written without `putCatalogRows`; `search` calls it by itself when the row count and the index disagree.
 */
export async function rebuildCatalogIndex(store: AppStore, now?: string): Promise<void> {
  const stamp = nowOf(now);
  for (const lang of LANGUAGES) {
    const rows = await store.catalog.where('lang', lang);
    // forget what the lists held (for every facet the rows can have), then list the rows afresh
    const facets = new Set<string>();
    for (const r of rows) for (const f of facetsOf(r)) facets.add(f);
    for (const facet of facets) {
      const head = parseHead(await store.meta.get(headKey(lang, facet)));
      if (head) for (const [no] of head.chunks) await store.meta.delete(chunkKey(lang, facet, no));
      await store.meta.delete(headKey(lang, facet));
    }
    const adds = new Map<string, string[]>();
    for (const r of rows.sort((a, b) => (a.id < b.id ? -1 : 1))) for (const f of facetsOf(r)) (adds.get(f) ?? adds.set(f, []).get(f)!).push(r.id);
    // a few thousand facets at a time keeps the batch small
    const entries = [...adds];
    for (let i = 0; i < entries.length; i += 500) await appendIds(store, lang, new Map(entries.slice(i, i + 500)), stamp);
    await store.meta.put({ id: countKey(lang), value: String(rows.length), updatedAt: stamp });
  }
}

/** True when the table and the index agree on how many rows there are. */
async function consistent(store: AppStore): Promise<boolean> {
  const rows = await store.catalog.count();
  const counts = await store.meta.getMany(LANGUAGES.map(countKey));
  return rows === counts.reduce((n, r) => n + Number(r?.value ?? 0), 0);
}

// ───────────────────────────── reading ─────────────────────────────

async function* chunksOf(store: AppStore, lang: LanguageCode, facet: string, head: Head): AsyncGenerator<string[]> {
  const STEP = 4;
  for (let i = 0; i < head.chunks.length; i += STEP) {
    const part = head.chunks.slice(i, i + STEP);
    const rows = await store.meta.getMany(part.map(([no]) => chunkKey(lang, facet, no)));
    for (const r of rows) yield parseChunk(r);
  }
}

async function idsInRange(store: AppStore, lang: LanguageCode, facet: string, head: Head, offset: number, limit: number): Promise<string[]> {
  const wanted: number[] = [];
  const starts: number[] = [];
  let at = 0;
  for (const [no, count] of head.chunks) {
    if (at + count > offset && at < offset + limit) { wanted.push(no); starts.push(at); }
    at += count;
    if (at >= offset + limit) break;
  }
  const rows = await store.meta.getMany(wanted.map((no) => chunkKey(lang, facet, no)));
  const out: string[] = [];
  rows.forEach((r, i) => {
    const ids = parseChunk(r);
    for (let k = 0; k < ids.length; k++) {
      const pos = starts[i] + k;
      if (pos >= offset && pos < offset + limit) out.push(ids[k]);
    }
  });
  return out;
}

const clampLimit = (n: number | undefined): number => Math.min(MAX_LIMIT, Math.max(1, Math.floor(n ?? DEFAULT_LIMIT)));

const whitespaceDelimited = (lang: LanguageCode): boolean => LANGUAGE_ROWS.find((l) => l.id === lang)?.whitespaceDelimited !== false;

/**
 * The text match: every word of the query must be the start of a word of the title or the author (accent- and
 * case-insensitive). For a language written without spaces (Thai) a word of the query may match anywhere.
 */
export function textMatcher(lang: LanguageCode, query: string | undefined): ((row: CatalogText) => boolean) | undefined {
  const terms = query ? wordsOf(query) : [];
  if (!terms.length) return undefined;
  const substring = !whitespaceDelimited(lang);
  return (row) => {
    const name = `${row.title} ${row.author ?? ''}`;
    if (substring) { const f = fold(name); return terms.every((t) => f.includes(t)); }
    const words = wordsOf(name);
    return terms.every((t) => words.some((w) => w.startsWith(t)));
  };
}

/** The indexed conditions of a query, tested on a row (the lists are exact, so this is for a query that reads rows anyway). */
function rowMatches(q: LibraryQuery, row: CatalogText): boolean {
  if (q.workId && row.workId !== q.workId) return false;
  if (q.stream && row.stream !== q.stream && !row.streams?.includes(q.stream)) return false;
  if (q.stageId && row.stageId !== q.stageId) return false;
  if (q.domain && !row.domains?.includes(q.domain)) return false;
  if (q.variety && row.variety !== q.variety) return false;
  if (q.era && row.era !== q.era) return false;
  if (q.genre && row.genre !== q.genre) return false;
  if (q.author && fold(row.author ?? '').trim() !== fold(q.author).trim()) return false;
  if (q.rights && row.rights !== q.rights) return false;
  if (q.location && row.location !== q.location) return false;
  if (q.publishedOnly && !row.published) return false;
  return true;
}

/** Chapter order: by chapter number (a text without one last), then title, then id. */
const byChapter = (a: CatalogText, b: CatalogText): number =>
  (a.chapter ?? Infinity) - (b.chapter ?? Infinity) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export interface SearchStats { driver: string; mode: 'exact' | 'driven' | 'scan'; rowsRead: number }

/**
 * A page of the catalogue for `q`. `stats` (optional) reports which list drove the query and how many catalogue rows
 * were read to answer it.
 */
export async function searchCatalog(store: AppStore, q: LibraryQuery, now?: string, stats?: (s: SearchStats) => void): Promise<{ total: number; items: CatalogText[] }> {
  if (!(await consistent(store))) await rebuildCatalogIndex(store, now);
  const lang = q.lang;
  const limit = clampLimit(q.limit);
  const offset = Math.max(0, Math.floor(q.offset ?? 0));

  // indexed facets the query names
  const facets: string[] = [];
  if (q.workId) facets.push(`work=${q.workId}`);
  if (q.stream) facets.push(`stream=${q.stream}`);
  if (q.stageId) facets.push(`stage=${q.stageId}`);
  if (q.domain) facets.push(`domain=${q.domain}`);
  if (q.variety) facets.push(`variety=${q.variety}`);
  if (q.era) facets.push(`era=${q.era}`);
  if (q.genre) facets.push(`genre=${q.genre}`);
  if (q.author) facets.push(`author=${fold(q.author).trim()}`);
  if (q.rights) facets.push(`rights=${q.rights}`);
  if (q.location) facets.push(`location=${q.location}`);
  if (q.publishedOnly) facets.push('pub');
  const terms = q.text ? wordsOf(q.text) : [];
  const longTerms = terms.filter((t) => [...t].length >= 3);
  const bucketFacets = longTerms.map((t) => `w=${prefixOf(t)}`);

  // a short term cannot be placed in a bucket; with substring matching (Thai) no term can
  const bucketed = whitespaceDelimited(lang) ? bucketFacets : [];
  const matchText = textMatcher(lang, q.text);
  const minWords = q.minWords, maxWords = q.maxWords;
  const needsInPage = minWords !== undefined || maxWords !== undefined || !!matchText;
  // no condition at all: the whole catalogue of the language, a page of the `all` list
  if (!facets.length && !needsInPage) facets.push('all');
  const unique = [...new Set([...facets, ...bucketed])];
  const heads = await Promise.all(unique.map(async (f) => parseHead(await store.meta.get(headKey(lang, f)))));
  if (heads.some((h) => !h || h.n === 0)) { stats?.({ driver: 'none', mode: 'exact', rowsRead: 0 }); return { total: 0, items: [] }; }


  const inPage = (row: CatalogText): boolean => {
    if (minWords !== undefined && row.features.words < minWords) return false;
    if (maxWords !== undefined && row.features.words > maxWords) return false;
    if (matchText && !matchText(row)) return false;
    return true;
  };
  const rowsOf = async (ids: string[]) => (await store.catalog.getMany(ids)).filter((r): r is CatalogText => !!r);

  // the chapters of one work: a work's list is short, so it is read whole, tested row by row and put in chapter order
  if (q.workId) {
    const at = unique.indexOf(`work=${q.workId}`);
    const rows: CatalogText[] = [];
    let read = 0;
    for await (const ids of chunksOf(store, lang, unique[at], heads[at]!)) {
      const got = await rowsOf(ids);
      read += got.length;
      for (const row of got) if (rowMatches(q, row) && inPage(row)) rows.push(row);
    }
    rows.sort(byChapter);
    stats?.({ driver: unique[at], mode: 'driven', rowsRead: read });
    return { total: rows.length, items: rows.slice(offset, offset + limit) };
  }

  // exactly one indexed facet and no other condition: the list IS the answer
  if (unique.length === 1 && !needsInPage) {
    const head = heads[0]!;
    const items = await rowsOf(await idsInRange(store, lang, unique[0], head, offset, limit));
    stats?.({ driver: unique[0], mode: 'exact', rowsRead: items.length });
    return { total: head.n, items };
  }

  // nothing indexed (word counts, or a text of one or two letters): the `all` list is walked, chunk by chunk
  if (unique.length === 0) {
    const all = parseHead(await store.meta.get(headKey(lang, 'all')));
    if (!all) { stats?.({ driver: 'all', mode: 'scan', rowsRead: 0 }); return { total: 0, items: [] }; }
    const r = await scan(chunksOf(store, lang, 'all', all), rowsOf, inPage, offset, limit);
    stats?.({ driver: 'all', mode: 'scan', rowsRead: r.read });
    return { total: r.total, items: r.items };
  }

  // one indexed facet and a condition on the row: that list is walked, chunk by chunk
  if (unique.length === 1) {
    const r = await scan(chunksOf(store, lang, unique[0], heads[0]!), rowsOf, inPage, offset, limit);
    stats?.({ driver: unique[0], mode: 'driven', rowsRead: r.read });
    return { total: r.total, items: r.items };
  }

  // several indexed facets: the smallest list drives and the others are intersected with it as lists of ids (a chunk is
  // 128 ids, so this reads a few rows per thousand), before any catalogue row is read
  let best = 0;
  heads.forEach((h, i) => { if (h!.n < heads[best]!.n) best = i; });
  let candidates: string[] = [];
  for await (const ids of chunksOf(store, lang, unique[best], heads[best]!)) candidates.push(...ids);
  for (let i = 0; i < unique.length && candidates.length; i++) {
    if (i === best) continue;
    const keep = new Set(candidates);
    const present = new Set<string>();
    for await (const ids of chunksOf(store, lang, unique[i], heads[i]!)) for (const id of ids) if (keep.has(id)) present.add(id);
    candidates = candidates.filter((id) => present.has(id));
  }
  if (!needsInPage) {
    const items = await rowsOf(candidates.slice(offset, offset + limit));
    stats?.({ driver: unique[best], mode: 'driven', rowsRead: items.length });
    return { total: candidates.length, items };
  }
  const batches = (async function* () { for (let i = 0; i < candidates.length; i += CHUNK) yield candidates.slice(i, i + CHUNK); })();
  const r = await scan(batches, rowsOf, inPage, offset, limit);
  stats?.({ driver: unique[best], mode: 'driven', rowsRead: r.read });
  return { total: r.total, items: r.items };
}

/** Read batches of ids in order, count the rows that pass `keep`, and collect the page. Memory is one batch. */
async function scan(
  batches: AsyncIterable<string[]>, rowsOf: (ids: string[]) => Promise<CatalogText[]>, keep: (row: CatalogText) => boolean, offset: number, limit: number,
): Promise<{ total: number; items: CatalogText[]; read: number }> {
  let total = 0, read = 0;
  const items: CatalogText[] = [];
  for await (const ids of batches) {
    const rows = await rowsOf(ids);
    read += rows.length;
    for (const row of rows) {
      if (!keep(row)) continue;
      if (total >= offset && items.length < limit) items.push(row);
      total++;
    }
  }
  return { total, items, read };
}
