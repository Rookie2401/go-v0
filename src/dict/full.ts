/**
 * Runtime reader of the full lexical records (schemas `full-1` and `full-2`, src/dict/full-format.ts and full2.ts): browser-safe,
 * lazy, one shard per lookup. `<baseUrl>/<lang>/full/manifest.json` and `f-<hh>.json` (full-2: `f-<hh>.json.gz`, inflated here;
 * if that name is missing the plain `f-<hh>.json` is tried, and a body the server already decoded is detected, not assumed).
 * Both schemas come out as the same `FullRecord` shape. The caching style is that of
 * createFetchLexiconSource (src/dict/sharded.ts): the manifest is read once, parsed shards are kept in a bounded
 * least-recently-used cache, a transient failure is not remembered (the next call retries), a missing or corrupt
 * answer is. Nothing here throws: no manifest, no shard or a bad record is "no record".
 */
import type { LanguageCode } from '../core';
import { DEFAULT_MAX_PARSED_SHARDS, type ShardCacheOptions } from './sharded';
import { bucketOf, fullShardName, parseFullManifest, parseFullShard, FULL_SCHEMA_2, type FullManifest, type FullRecord } from './full-format';
import { parseFullShard2 } from './full2';
import { bytesToText } from './gzip';

export interface FullRecordSource {
  readonly lang: LanguageCode;
  /** The full manifest (source, attribution, counts), or undefined when none is installed. */
  info(): Promise<FullManifest | undefined>;
  /** The records of a lemma key (the language's normalized word); `pos` is a preference (matching records first), not a filter. */
  lookup(lemma: string, pos?: string): Promise<FullRecord[]>;
}

export interface FullRecordSourceOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  cache?: ShardCacheOptions;
}

export function createFullRecordSource(lang: LanguageCode, opts: FullRecordSourceOptions = {}): FullRecordSource {
  const base = (opts.baseUrl ?? '/dict').replace(/\/+$/, '');
  const maxShards = Math.max(1, Math.floor(opts.cache?.maxParsedShards ?? DEFAULT_MAX_PARSED_SHARDS));
  const probe = opts.cache?.probe;

  const read = async (relative: string, version?: string): Promise<string | undefined> => {
    const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    const res = await doFetch(`${base}/${lang}/full/${relative}${version ? `?v=${version}` : ''}`);
    if (res.status === 404 || res.status === 410) return undefined; // not installed: the normal state
    if (!res.ok) throw new Error(`full dictionary request failed: ${res.status}`);
    return bytesToText(new Uint8Array(await res.arrayBuffer())); // gzip (magic number) or plain, whichever arrived
  };
  const readShard = async (m: FullManifest, bucket: number): Promise<string | undefined> => {
    const gz = await read(fullShardName(bucket, m.buckets, m.gzip === true), m.rev);
    if (gz !== undefined || !m.gzip) return gz;
    return read(fullShardName(bucket, m.buckets, false), m.rev); // the plain name, when only that is hosted
  };
  const parseJson = (text: string | undefined): unknown => {
    if (text === undefined) return undefined;
    try { return JSON.parse(text) as unknown; } catch { return undefined; }
  };

  let manifest: Promise<FullManifest | undefined> | undefined;
  const loadManifest = (): Promise<FullManifest | undefined> => {
    if (!manifest) {
      const p = Promise.resolve().then(() => read('manifest.json')).then((t) => parseFullManifest(parseJson(t), lang));
      manifest = p;
      p.catch(() => { if (manifest === p) manifest = undefined; });
    }
    return manifest.catch(() => undefined);
  };

  // Map order is recency order: the first key is the least recently used.
  const cache = new Map<number, Promise<Map<string, FullRecord[]>>>();
  const shardOf = (m: FullManifest, bucket: number): Promise<Map<string, FullRecord[]>> => {
    const hit = cache.get(bucket);
    if (hit) { cache.delete(bucket); cache.set(bucket, hit); return hit; }
    while (cache.size >= maxShards) {
      const victim = cache.keys().next().value;
      if (victim === undefined) break;
      cache.delete(victim);
      if (probe) probe.evictions++;
    }
    if (probe) probe.loads++;
    const p = Promise.resolve().then(() => readShard(m, bucket)).then((t) => (m.schema === FULL_SCHEMA_2 ? parseFullShard2(parseJson(t), m.strings ?? []) : parseFullShard(parseJson(t))));
    cache.set(bucket, p);
    p.catch(() => { if (cache.get(bucket) === p) cache.delete(bucket); }); // a failed read is not cached
    if (probe) { probe.held = cache.size; probe.highWater = Math.max(probe.highWater, cache.size); }
    return p;
  };

  const names = new WeakMap<FullManifest, Set<string>>();

  return {
    lang,
    info: () => loadManifest(),
    async lookup(lemma, pos) {
      try {
        if (typeof lemma !== 'string' || !lemma) return [];
        const m = await loadManifest();
        if (!m) return [];
        let have = names.get(m);
        if (!have) { have = new Set(m.shardFiles); names.set(m, have); }
        const bucket = bucketOf(lemma, m.buckets);
        if (have.size && !have.has(fullShardName(bucket, m.buckets, m.gzip === true))) return []; // the manifest says the bucket is empty: no request
        const records = (await shardOf(m, bucket).catch(() => new Map<string, FullRecord[]>())).get(lemma);
        if (!records?.length) return [];
        const copy = structuredClone(records);
        return pos ? [...copy.filter((r) => r.p === pos), ...copy.filter((r) => r.p !== pos)] : copy;
      } catch {
        return [];
      }
    },
  };
}
