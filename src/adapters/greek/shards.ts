/**
 * Loading a SHARDED Greek form index on demand (the Ancient Greek tables: 660,000 keys, 123 MB of JSON, built by
 * scripts/el-build-kaikki.mts and cut into shards by scripts/el-shard-ancient.mts). A host that cannot carry the whole
 * index in memory asks the loader for the keys it is about to read (a chapter's words); the loader fetches the shards
 * those keys live in, installs them beside the other indexes (index-store.ts), and keeps at most `maxLoaded` shards,
 * forgetting the least recently used. Lookups stay synchronous: `ensure` first, `lookupGreekForm` after.
 *
 * Shards are named by the prefix of the BARE letters (diacritics removed) their keys share; the manifest lists the
 * prefixes, and a key goes to the longest listed prefix of its letters ('_' for keys with no Greek letter). The bare map
 * of a shard is cut by the same rule, so the accent-free fallback of a lookup finds its keys in the same shard.
 *
 * Shards may be gzip-compressed (`file` ending in .gz): they are inflated with the platform's DecompressionStream
 * (Chrome, Node 18+). Nothing is fetched from anywhere but the host's own data source.
 */
import { installGreekIndex, uninstallGreekIndex, type GreekFormIndex } from './index-store';
import { bare } from './text';

export interface GreekShardManifest {
  schema: 1;
  id: string;
  codes: GreekFormIndex['codes'];
  period: GreekFormIndex['period'];
  source: GreekFormIndex['source'];
  built: string;
  /** prefix → file (relative to the manifest's folder), compressed size, key count */
  shards: Record<string, { file: string; bytes: number; keys: number }>;
  stats?: Record<string, number>;
}

export interface GreekShardSource {
  /** Fetches a JSON file by path (relative to the host's data root). */
  fetchJson(path: string): Promise<unknown>;
  /** Fetches raw bytes (needed for compressed shards); optional when every shard is plain JSON. */
  fetchBytes?(path: string): Promise<Uint8Array>;
}

export interface GreekShardLoader {
  readonly manifest: GreekShardManifest;
  /** The shard prefix a key would be read from, by its bare letters. */
  shardFor(key: string): string;
  /** Loads (once) the shards of these keys; reports what was loaded now and what failed (path → reason). Never throws. */
  ensure(keys: Iterable<string>): Promise<{ loaded: string[]; failed: Array<[string, string]> }>;
  /** The shards in memory now, most recently used last. */
  loaded(): string[];
}

const LETTERS = /[^α-ωϛϝϙϟϡ]/gu;
/** The bare letters of a key, lower-cased: what a shard prefix is matched against. */
export const shardLetters = (key: string): string => bare(key).toLowerCase().replace(/ς/g, 'σ').replace(LETTERS, '');

/** The longest listed prefix of the letters, else '_'. */
export function shardPrefix(letters: string, prefixes: ReadonlySet<string>, longest: number): string {
  for (let n = Math.min(longest, letters.length); n >= 1; n--) { const p = letters.slice(0, n); if (prefixes.has(p)) return p; }
  return '_';
}

async function inflate(bytes: Uint8Array): Promise<string> {
  const DS = (globalThis as { DecompressionStream?: new (format: string) => { readable: ReadableStream; writable: WritableStream } }).DecompressionStream;
  if (!DS) throw new Error('this runtime cannot inflate gzip (no DecompressionStream)');
  // a ReadableStream source rather than Blob.stream(): the same in Chrome and Node, and jsdom's Blob has no stream()
  const source = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });
  const stream = source.pipeThrough(new DS('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

export async function createGreekShardLoader(src: GreekShardSource, opts: { base: string; maxLoaded?: number }): Promise<GreekShardLoader> {
  const base = opts.base.replace(/\/+$/, '');
  const manifest = (await src.fetchJson(`${base}/manifest.json`)) as GreekShardManifest;
  if (!manifest || manifest.schema !== 1 || typeof manifest.shards !== 'object') throw new Error(`${base}/manifest.json is not a shard manifest`);
  const prefixes = new Set(Object.keys(manifest.shards));
  const longest = Math.max(1, ...[...prefixes].map((p) => p.length));
  const maxLoaded = Math.max(1, opts.maxLoaded ?? 48);
  const order: string[] = []; // least recently used first
  const pending = new Map<string, Promise<void>>();

  const touch = (p: string): void => { const i = order.indexOf(p); if (i >= 0) order.splice(i, 1); order.push(p); };
  const evict = (keep: ReadonlySet<string>): void => {
    // the shards the current call asked for are never evicted (a chapter may need more than maxLoaded at once); the others go LRU first
    for (let i = 0; i < order.length && order.length > maxLoaded;) {
      const p = order[i];
      if (keep.has(p)) { i++; continue; }
      order.splice(i, 1); uninstallGreekIndex(manifest.id, p);
    }
  };
  const load = async (p: string): Promise<void> => {
    const entry = manifest.shards[p];
    const path = `${base}/${entry.file}`;
    let idx: GreekFormIndex;
    if (entry.file.endsWith('.gz')) {
      if (!src.fetchBytes) throw new Error('the data source cannot fetch bytes, which a compressed shard needs');
      idx = JSON.parse(await inflate(await src.fetchBytes(path))) as GreekFormIndex;
    } else idx = (await src.fetchJson(path)) as GreekFormIndex;
    if (idx.id !== manifest.id || idx.shard !== p) throw new Error(`${path} is not shard ${p} of ${manifest.id}`);
    installGreekIndex(idx);
  };

  return {
    manifest,
    shardFor: (key) => shardPrefix(shardLetters(key), prefixes, longest),
    loaded: () => [...order],
    async ensure(keys) {
      const wanted = new Set<string>();
      for (const k of keys) { const p = shardPrefix(shardLetters(k), prefixes, longest); if (manifest.shards[p]) wanted.add(p); }
      const loaded: string[] = [];
      const failed: Array<[string, string]> = [];
      await Promise.all([...wanted].map(async (p) => {
        if (order.includes(p)) { touch(p); return; }
        let job = pending.get(p);
        if (!job) {
          job = load(p).then(() => { touch(p); loaded.push(p); }).finally(() => pending.delete(p));
          pending.set(p, job);
        }
        try { await job; } catch (e) { failed.push([`${base}/${manifest.shards[p].file}`, e instanceof Error ? e.message : String(e)]); }
      }));
      evict(wanted);
      return { loaded, failed };
    },
  };
}
