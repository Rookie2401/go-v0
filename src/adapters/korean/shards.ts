/**
 * The sharded Korean stem lexicon (kaikki-ko-lexicon: every headword of the Wiktionary extract, with this product's supplement rows),
 * loaded on demand by the shared loader (src/adapters/shared/shards.ts) and installed beside the compiled core. Built by
 * scripts/ko-build-lexicon.mts; a shard is named by the letters its keys share (`koLexiconShardLetters`: the jamo of a first Hangul
 * syllable, or `H` and the high bits of a first Hanja).
 *
 * A written word does not begin with the letters of its stem. 갔다 begins 갔 and its stem is 가; 봐요 is 보다; 들어요 is 듣다; 추워요 is
 * 춥다; 몰라요 is 모르다. So the loader is asked for the STEMS a token may begin with (stems.ts `candidateStems`, the same function the
 * analyser uses), never for the token as written. And a token may hold more than one word: a compound written solid (한국어교육), a
 * word and an auxiliary without the space (먹을수있어요). So the stems of every later syllable position are asked for as well.
 *
 * The whole lexicon is about 1.3 MB compressed in some 45 shards, so a page of Korean ends up loading most of it; a host should let
 * all of them stay loaded (`maxLoaded` of 64 or more) rather than evict and refetch.
 */
import { createShardLoader, type ShardLoader, type ShardManifest, type ShardSource } from '../shared/shards';
import { installKoreanLexicon, koLexiconShardLetters, uninstallKoreanLexicon, type KoLexicon } from './index-store';
import { koKey } from './hangul';
import { candidateStems } from './stems';

export interface KoreanShardManifest extends ShardManifest {
  source: KoLexicon['source'];
  stats?: Record<string, number>;
}
export type KoreanShardSource = ShardSource;
export type KoreanShardLoader = ShardLoader<KoreanShardManifest>;

export { koLexiconShardLetters };

/** Later syllable positions of a token whose stems are asked for too (a solid compound, a missing space). */
const MAX_INNER_STARTS = 12;

/**
 * The lexicon keys an analysis of this token may look up: the stems the token may begin with, and those any later position may begin
 * with. A superset by design; the loader only maps each to a shard.
 */
export function koLexiconKeysOf(token: string): string[] {
  const key = koKey(token);
  const out = new Set<string>();
  const chars = [...key];
  const starts = Math.min(chars.length, MAX_INNER_STARTS);
  for (let i = 0; i < starts; i++) {
    const rest = i === 0 ? key : chars.slice(i).join('');
    out.add(rest);
    for (const stem of candidateStems(rest)) out.add(stem);
  }
  return [...out];
}

/** A loader over the sharded Korean lexicon (`base`: the folder holding manifest.json, e.g. lexicon/ko/standard). */
export async function createKoreanShardLoader(src: KoreanShardSource, opts: { base: string; maxLoaded?: number }): Promise<KoreanShardLoader> {
  const loader = await createShardLoader<KoLexicon, KoreanShardManifest>(src, {
    ...opts,
    maxLoaded: opts.maxLoaded ?? 64,
    letters: koLexiconShardLetters,
    install: installKoreanLexicon,
    uninstall: uninstallKoreanLexicon,
  });
  const expand = (keys: Iterable<string>): string[] => {
    const out = new Set<string>();
    for (const k of keys) for (const stem of koLexiconKeysOf(k)) out.add(stem);
    return [...out];
  };
  return { ...loader, ensure: (keys) => loader.ensure(expand(keys)) };
}
