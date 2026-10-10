/**
 * Runtime reader of the full lexical records (schema `full-1`, src/dict/full-format.ts): browser-safe, lazy, one shard
 * per lookup. `<baseUrl>/<lang>/full/manifest.json` and `f-<hh>.json`; the caching style is that of
 * createFetchLexiconSource (src/dict/sharded.ts): the manifest is read once, parsed shards are kept in a bounded
 * least-recently-used cache, a transient failure is not remembered (the next call retries), a missing or corrupt
 * answer is. Nothing here throws: no manifest, no shard or a bad record is "no record".
 */
import type { LanguageCode } from '../core';
import { DEFAULT_MAX_PARSED_SHARDS, type ShardCacheOptions } from './sharded';
import { bucketOf, fullShardName, parseFullManifest, parseFullShard, type FullManifest, type FullRecord } from './full-format';

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

  const read = async (relative: string): Promise<string | undefined> => {
    const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    const res = await doFetch(`${base}/${lang}/full/${relative}`);
    if (res.status === 404 || res.status === 410) return undefined; // not installed: the normal state
    if (!res.ok) throw new Error(`full dictionary request failed: ${res.status}`);
    return res.text();
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
    const p = Promise.resolve().then(() => read(fullShardName(bucket, m.buckets))).then((t) => parseFullShard(parseJson(t)));
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
        if (have.size && !have.has(fullShardName(bucket, m.buckets))) return []; // the manifest says the bucket is empty: no request
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
