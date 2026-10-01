/**
 * The shared runtime behind the fetch and file sources: lazy manifest, shard-per-bucket loading, an in-memory
 * cache, and one request for concurrent lookups of the same shard. Browser-safe (no node imports).
 */
import type { DictionaryEntry, DictionaryInfo, LanguageCode, LexiconSource } from '../core';
import { bucketOf, infoOf, parseManifest, parseShard, shardName, type DictionaryManifest } from './format';

/**
 * Read one file under `<root>/<lang>/`. Resolves to the text, or undefined when the file definitely is not there
 * (404, missing). Rejects on a transient failure (network down); that is not cached, so a later call retries.
 */
export type ReadDictFile = (relative: string) => Promise<string | undefined>;

export function createShardedSource(lang: LanguageCode, read: ReadDictFile): LexiconSource {
  let manifest: Promise<DictionaryManifest | undefined> | undefined;
  const shards = new Map<number, Promise<Map<string, DictionaryEntry[]>>>();

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

  const loadShard = (m: DictionaryManifest, bucket: number): Promise<Map<string, DictionaryEntry[]>> => {
    const name = shardName(bucket, m.buckets);
    if (m.shardFiles.length && !m.shardFiles.includes(name)) return Promise.resolve(new Map());
    let p = shards.get(bucket);
    if (!p) {
      const mine: Promise<Map<string, DictionaryEntry[]>> = Promise.resolve().then(() => read(name)).then((t) => parseShard(parseJson(t), lang));
      p = mine;
      shards.set(bucket, mine);
      mine.catch(() => { if (shards.get(bucket) === mine) shards.delete(bucket); });
    }
    return p.catch(() => new Map<string, DictionaryEntry[]>());
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
      const wanted = new Map<number, string[]>();
      for (const f of new Set(forms)) {
        if (typeof f !== 'string' || !f) continue;
        const b = bucketOf(f, m.buckets);
        wanted.set(b, [...(wanted.get(b) ?? []), f]);
      }
      await Promise.all([...wanted].map(async ([bucket, list]) => {
        const shard = await loadShard(m, bucket);
        for (const f of list) { const e = shard.get(f); if (e) out.set(f, structuredClone(e)); }
      }));
      // Keep the caller's order, not the order the shards happened to resolve in.
      return new Map(forms.filter((f) => out.has(f)).map((f) => [f, out.get(f)!]));
    },
  };
}
