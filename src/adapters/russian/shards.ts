/**
 * The sharded Russian index (kaikki-ru-tables: every inflection-table row and form-of page of the Wiktionary extract), loaded on
 * demand by the shared loader (src/adapters/shared/shards.ts) and installed beside the compiled core. Shards are named by the prefix
 * of the LETTERS their keys share, with ё read as е (text.ts `ruShardLetters`), and the `yo` map of a shard is cut by the same rule,
 * so a word printed without ё finds its ё-forms in the same shard. Built by scripts/ru-build-index.mts.
 */
import { createShardLoader, type ShardLoader, type ShardManifest, type ShardSource } from '../shared/shards';
import { installRussianIndex, uninstallRussianIndex, type RussianFormIndex } from './index-store';
import { hyphenParts, ruKey, ruShardLetters } from './text';

export interface RussianShardManifest extends ShardManifest {
  source: RussianFormIndex['source'];
  stats?: Record<string, number>;
}
export type RussianShardSource = ShardSource;
export type RussianShardLoader = ShardLoader<RussianShardManifest>;

export { ruShardLetters };

/** A loader over the sharded Russian index (`base`: the folder holding manifest.json, e.g. lexicon/ru/standard). */
export async function createRussianShardLoader(src: RussianShardSource, opts: { base: string; maxLoaded?: number }): Promise<RussianShardLoader> {
  const loader = await createShardLoader<RussianFormIndex, RussianShardManifest>(src, { ...opts, letters: ruShardLetters, install: installRussianIndex, uninstall: uninstallRussianIndex });
  // a hyphenated word the index does not hold whole (какого-то, северо-западный) is read through its parts, which live in their own shards
  const expand = (keys: Iterable<string>): string[] => {
    const out: string[] = [];
    for (const k of keys) { const key = ruKey(k); out.push(key); const parts = hyphenParts(key); if (parts.length > 1) out.push(...parts); }
    return out;
  };
  return { ...loader, ensure: (keys) => loader.ensure(expand(keys)) };
}
