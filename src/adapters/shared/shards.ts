/**
 * Loading a SHARDED form index on demand, for any language whose index is too large to carry whole: the Ancient and Modern
 * Greek tables (660,000 and 266,000 keys), the Biblical and Modern Hebrew indexes. A host asks the loader for the keys it is
 * about to read (a chapter's words, a selection's sentence); the loader fetches the shards those keys live in, installs them
 * beside the other indexes of the language (its index store), and keeps at most `maxLoaded` shards, forgetting the least
 * recently used, never one the current call asked for. Lookups stay synchronous: `ensure` first, the lookup after.
 *
 * Shards are named by the prefix of the LETTERS their keys share (the language's `letters` function: diacritics removed,
 * final forms folded); the manifest lists the prefixes, and a key goes to the longest listed prefix of its letters ('_' for a
 * key with no letter of the script). Shards may be gzip-compressed (`file` ending in .gz): the gzip magic decides whether the
 * bytes are inflated (a static server may have inflated them already, with Content-Encoding: gzip). Nothing is fetched
 * from anywhere but the host's own data source. Built by scripts/lexicon-shard.mts.
 */

export interface ShardManifest {
  schema: 1;
  id: string;
  built: string;
  /** prefix → file (relative to the manifest's folder), compressed size, key count */
  shards: Record<string, { file: string; bytes: number; keys: number }>;
  [extra: string]: unknown;
}

export interface ShardSource {
  /** Fetches a JSON file by path (relative to the host's data root). */
  fetchJson(path: string): Promise<unknown>;
  /** Fetches raw bytes (needed for compressed shards); optional when every shard is plain JSON. */
  fetchBytes?(path: string): Promise<Uint8Array>;
}

export interface ShardLoader<M extends ShardManifest = ShardManifest> {
  readonly manifest: M;
  /** The shard prefix a key would be read from, by its letters. */
  shardFor(key: string): string;
  /** Loads (once) the shards of these keys; reports what was loaded now and what failed (path → reason). Never throws. */
  ensure(keys: Iterable<string>): Promise<{ loaded: string[]; failed: Array<[string, string]> }>;
  /** The shards in memory now, most recently used last. */
  loaded(): string[];
}

export interface ShardLoaderOptions<I extends { id: string; shard?: string }> {
  base: string;
  maxLoaded?: number;
  /** The letters of a key that a shard prefix is matched against (script letters only, lower-cased, finals folded). */
  letters: (key: string) => string;
  install: (shard: I) => void;
  uninstall: (id: string, shard: string) => void;
}

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

/** Reads a shard file: inflated when the bytes carry the gzip magic (1f 8b), parsed as JSON text otherwise. */
export async function readShardBytes(bytes: Uint8Array): Promise<unknown> {
  const gzipped = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  return JSON.parse(gzipped ? await inflate(bytes) : new TextDecoder().decode(bytes)) as unknown;
}

export async function createShardLoader<I extends { id: string; shard?: string }, M extends ShardManifest = ShardManifest>(src: ShardSource, opts: ShardLoaderOptions<I>): Promise<ShardLoader<M>> {
  const base = opts.base.replace(/\/+$/, '');
  const manifest = (await src.fetchJson(`${base}/manifest.json`)) as M;
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
      order.splice(i, 1); opts.uninstall(manifest.id, p);
    }
  };
  const load = async (p: string): Promise<void> => {
    const entry = manifest.shards[p];
    const path = `${base}/${entry.file}`;
    let idx: I;
    if (entry.file.endsWith('.gz')) {
      if (!src.fetchBytes) throw new Error('the data source cannot fetch bytes, which a compressed shard needs');
      idx = (await readShardBytes(await src.fetchBytes(path))) as I;
    } else idx = (await src.fetchJson(path)) as I;
    if (idx.id !== manifest.id || idx.shard !== p) throw new Error(`${path} is not shard ${p} of ${manifest.id}`);
    opts.install(idx);
  };

  return {
    manifest,
    shardFor: (key) => shardPrefix(opts.letters(key), prefixes, longest),
    loaded: () => [...order],
    async ensure(keys) {
      const wanted = new Set<string>();
      for (const k of keys) { const p = shardPrefix(opts.letters(k), prefixes, longest); if (manifest.shards[p]) wanted.add(p); }
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
