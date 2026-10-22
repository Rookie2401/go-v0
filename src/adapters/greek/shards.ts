/**
 * The sharded Greek indexes (the Ancient tables: 660,000 keys, 123 MB of JSON; the Modern tables: 266,000 keys, 58 MB), loaded
 * on demand by the shared loader (src/adapters/shared/shards.ts) and installed beside the other Greek indexes. Shards are named
 * by the prefix of the BARE letters their keys share (diacritics removed, final sigma folded), and the bare map of a shard is cut
 * by the same rule, so the accent-free fallback of a lookup finds its keys in the same shard. Built by scripts/lexicon-shard.mts.
 */
import { createShardLoader, type ShardLoader, type ShardManifest, type ShardSource } from '../shared/shards';
import { installGreekIndex, uninstallGreekIndex, type GreekFormIndex } from './index-store';
import { bare } from './text';

export interface GreekShardManifest extends ShardManifest {
  codes: GreekFormIndex['codes'];
  period: GreekFormIndex['period'];
  source: GreekFormIndex['source'];
  stats?: Record<string, number>;
}
export type GreekShardSource = ShardSource;
export type GreekShardLoader = ShardLoader<GreekShardManifest>;

const LETTERS = /[^α-ωϛϝϙϟϡ]/gu;
/** The bare letters of a key, lower-cased: what a shard prefix is matched against. */
export const shardLetters = (key: string): string => bare(key).toLowerCase().replace(/ς/g, 'σ').replace(LETTERS, '');

export { shardPrefix } from '../shared/shards';

/** A loader over one sharded Greek index (`base`: the folder holding manifest.json, e.g. lexicon/el/ancient or lexicon/el/modern). */
export async function createGreekShardLoader(src: GreekShardSource, opts: { base: string; maxLoaded?: number }): Promise<GreekShardLoader> {
  const loader = await createShardLoader<GreekFormIndex, GreekShardManifest>(src, { ...opts, letters: shardLetters, install: installGreekIndex, uninstall: uninstallGreekIndex });
  // a crasis form (τἀγαθόν = τό + ἀγαθόν, κἀγώ = καί + ἐγώ) is read through its remainder, which lives in the remainder's shard: ask for it too
  const expand = (keys: Iterable<string>): string[] => {
    const out: string[] = [];
    for (const k of keys) { out.push(k); if (/^[τκ][αεηιουω]̓/u.test(k.normalize('NFD'))) out.push(shardLetters(k).slice(1)); }
    return out;
  };
  return { ...loader, ensure: (keys) => loader.ensure(expand(keys)) };
}
