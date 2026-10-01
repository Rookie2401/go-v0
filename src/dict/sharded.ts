/**
 * The shared runtime behind the fetch and file sources: lazy manifest, shard-per-bucket loading, a bounded
 * least-recently-used cache of parsed shards, and one request for concurrent lookups of the same shard.
 * Browser-safe (no node imports).
 *
 * Memory: forms are spread over buckets by hash, so the words of one book touch nearly every shard. A lookup
 * therefore loads shards one after another (a few at a time), copies out the entries of the forms it was asked for,
 * and moves on; the cache keeps at most `maxParsedShards` parsed shards (default 24) and drops the least recently
 * used, which is simply read again when needed. No more than `concurrency` (default 4) shards are being read or
 * copied from at any moment, across all lookups of the source, so the shards held never exceed the bound whatever the
 * number of forms asked for.
 */
import type { DictionaryEntry, DictionaryInfo, LanguageCode, LexiconSource } from '../core';
import { bucketOf, infoOf, parseManifest, parseShard, shardName, type DictionaryManifest } from './format';

/**
 * Read one file under `<root>/<lang>/`. Resolves to the text, or undefined when the file definitely is not there
 * (404, missing). Rejects on a transient failure (network down); that is not cached, so a later call retries.
 */
export type ReadDictFile = (relative: string) => Promise<string | undefined>;

export const DEFAULT_MAX_PARSED_SHARDS = 24;
export const DEFAULT_SHARD_CONCURRENCY = 4;

/** Counters a test can read: how many parsed shards the source holds, the most it ever held, how many reads it made. */
export interface ShardCacheProbe {
  /** Shards in the cache now (being read, or parsed). */
  held: number;
  /** The most `held` ever was. */
  highWater: number;
  /** Shard files read (a shard read again after an eviction counts again). */
  loads: number;
  /** Shards being read or copied from right now, and the most that ever were at once (never above the concurrency). */
  active: number;
  maxActive: number;
  /** Shards dropped from the cache to make room. */
  evictions: number;
}
export const newShardCacheProbe = (): ShardCacheProbe => ({ held: 0, highWater: 0, loads: 0, active: 0, maxActive: 0, evictions: 0 });

export interface ShardCacheOptions {
  /** Most parsed shards kept at once (default 24, at least 1). */
  maxParsedShards?: number;
  /** Most shards read and copied from at once, across all lookups (default 4; never more than maxParsedShards). */
  concurrency?: number;
  /** Optional counters, updated as the source works (for tests and diagnostics). */
  probe?: ShardCacheProbe;
}

interface CacheEntry {
  promise: Promise<Map<string, DictionaryEntry[]>>;
  /** Lookups that are using the shard right now; a shard in use is never evicted. */
  pins: number;
}

export function createShardedSource(lang: LanguageCode, read: ReadDictFile, options: ShardCacheOptions = {}): LexiconSource {
  const maxShards = Math.max(1, Math.floor(options.maxParsedShards ?? DEFAULT_MAX_PARSED_SHARDS));
  const limit = Math.max(1, Math.min(Math.floor(options.concurrency ?? DEFAULT_SHARD_CONCURRENCY), maxShards));
  const probe = options.probe;
  let manifest: Promise<DictionaryManifest | undefined> | undefined;
  // Map order is recency order: the first key is the least recently used.
  const cache = new Map<number, CacheEntry>();
  const shardNames = new WeakMap<DictionaryManifest, Set<string>>();

  const noteSize = () => {
    if (!probe) return;
    probe.held = cache.size;
    probe.highWater = Math.max(probe.highWater, cache.size);
  };

  const parseJson = (text: string | undefined): unknown => {
    if (text === undefined) return undefined;
    try { return JSON.parse(text) as unknown; } catch { return undefined; }
  };

  const loadManifest = (): Promise<DictionaryManifest | undefined> => {
    if (!manifest) {
      const p = Promise.resolve().then(() => read('manifest.json')).then((t) => parseManifest(parseJson(t), lang));
      manifest = p;
      p.catch(() => { if (manifest === p) manifest = undefined; });
    }
    return manifest.catch(() => undefined);
  };

  // At most `limit` tasks run at once (across every lookup): that bounds the pinned shards, so the cache can always
  // make room by evicting an unpinned one and never holds more than maxShards.
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = async (): Promise<void> => {
    if (active < limit) { active++; return; }
    await new Promise<void>((resolve) => waiting.push(resolve)); // the slot is handed over, `active` stays counted
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next) next(); else active--;
  };

  /** The cache entry of a bucket (reading it when absent), pinned for the caller, who must unpin it. */
  const pin = (m: DictionaryManifest, bucket: number): CacheEntry => {
    let entry = cache.get(bucket);
    if (entry) {
      cache.delete(bucket); // refresh recency
      cache.set(bucket, entry);
    } else {
      while (cache.size >= maxShards) {
        const victim = [...cache].find(([, e]) => e.pins === 0)?.[0];
        if (victim === undefined) break; // cannot happen while pins <= limit <= maxShards
        cache.delete(victim);
        if (probe) probe.evictions++;
      }
      const name = shardName(bucket, m.buckets);
      if (probe) probe.loads++;
      const mine: CacheEntry = {
        promise: Promise.resolve().then(() => read(name)).then((t) => parseShard(parseJson(t), lang, m)),
        pins: 0,
      };
      cache.set(bucket, mine);
      // A failed read is not cached: the next lookup reads again.
      mine.promise.catch(() => { if (cache.get(bucket) === mine) { cache.delete(bucket); noteSize(); } });
      entry = mine;
    }
    entry.pins++;
    noteSize();
    return entry;
  };

  /** Load a bucket's shard (waiting for a free slot), run `use` on it, and let it go. A shard that cannot be read is empty. */
  const withShard = async (m: DictionaryManifest, bucket: number, use: (shard: Map<string, DictionaryEntry[]>) => void): Promise<void> => {
    await acquire();
    const entry = pin(m, bucket);
    if (probe) { probe.active++; probe.maxActive = Math.max(probe.maxActive, probe.active); }
    try {
      use(await entry.promise.catch(() => new Map<string, DictionaryEntry[]>()));
    } finally {
      entry.pins--;
      if (probe) probe.active--;
      release();
    }
  };

  return {
    lang,
    async info(): Promise<DictionaryInfo | undefined> {
      const m = await loadManifest();
      return m ? infoOf(m) : undefined;
    },
    async lookup(forms) {
      const out = new Map<string, DictionaryEntry[]>();
      const m = await loadManifest();
      if (!m) return out;
      let have = shardNames.get(m);
      if (!have) { have = new Set(m.shardFiles); shardNames.set(m, have); }
      const wanted = new Map<number, string[]>();
      const seen = new Set<string>();
      for (const f of forms) {
        if (typeof f !== 'string' || !f || seen.has(f)) continue;
        seen.add(f);
        const b = bucketOf(f, m.buckets);
        if (have.size && !have.has(shardName(b, m.buckets))) continue; // the manifest says the bucket is empty: no request
        const list = wanted.get(b);
        if (list) list.push(f); else wanted.set(b, [f]);
      }
      await Promise.all([...wanted].map(([bucket, list]) => withShard(m, bucket, (shard) => {
        for (const f of list) { const e = shard.get(f); if (e) out.set(f, structuredClone(e)); }
      })));
      // Keep the caller's order, not the order the shards happened to resolve in.
      return new Map(forms.filter((f) => out.has(f)).map((f) => [f, out.get(f)!]));
    },
  };
}
