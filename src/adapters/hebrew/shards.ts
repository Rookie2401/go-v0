/**
 * The sharded Hebrew indexes (the Biblical index: 52,687 pointed forms, 5 MB; the Modern tables: 149,000 keys, 19 MB), loaded on
 * demand by the shared loader (src/adapters/shared/shards.ts) and installed beside the compiled core. Shards are named by the
 * prefix of the CONSONANTS their keys share (points and accents removed, final letters folded), and the consonantal map of a
 * shard is cut by the same rule, so an unpointed lookup finds its pointed keys in the same shard. Built by scripts/lexicon-shard.mts.
 */
import { createShardLoader, type ShardLoader, type ShardManifest, type ShardSource } from '../shared/shards';
import { installHebrewIndex, uninstallHebrewIndex, type HebrewFormIndex } from './index-store';
import { consonantal, foldFinals } from './text';

export interface HebrewShardManifest extends ShardManifest {
  codes: HebrewFormIndex['codes'];
  period: HebrewFormIndex['period'];
  source: HebrewFormIndex['source'];
  stats?: Record<string, number>;
}
export type HebrewShardSource = ShardSource;
export type HebrewShardLoader = ShardLoader<HebrewShardManifest>;

const LETTERS = /[^א-ת]/gu;
/** The consonants of a key, finals folded: what a shard prefix is matched against. */
export const hebrewShardLetters = (key: string): string => foldFinals(consonantal(key)).replace(LETTERS, '');

/** A loader over one sharded Hebrew index (`base`: the folder holding manifest.json, e.g. lexicon/he/biblical or lexicon/he/modern). */
export async function createHebrewShardLoader(src: HebrewShardSource, opts: { base: string; maxLoaded?: number }): Promise<HebrewShardLoader> {
  const loader = await createShardLoader<HebrewFormIndex, HebrewShardManifest>(src, { ...opts, letters: hebrewShardLetters, install: installHebrewIndex, uninstall: uninstallHebrewIndex });
  // a word with attachable prefixes (וּבְ, שֶׁהַ …) is read through its remainder, which lives in the remainder's shard: ask for those too
  const expand = (keys: Iterable<string>): string[] => {
    const out: string[] = [];
    for (const k of keys) {
      out.push(k);
      const l = hebrewShardLetters(k);
      for (let n = 1; n <= 2 && n < l.length; n++) { if (!PREFIX_LETTERS.has(l[n - 1])) break; out.push(l.slice(n)); }
    }
    return out;
  };
  return { ...loader, ensure: (keys) => loader.ensure(expand(keys)) };
}
/** The letters a prefix chain may start with (conjunction, article, prepositions, the relative שֶׁ, the interrogative הֲ). */
const PREFIX_LETTERS = new Set(['ו', 'ה', 'ב', 'כ', 'ל', 'מ', 'ש']);
