/**
 * The sharded Arabic index (kaikki-ar-tables: every conjugation and declension row and every form page of the Wiktionary extract),
 * loaded on demand by the shared loader (src/adapters/shared/shards.ts) and installed beside the compiled core. Shards are named by
 * the prefix of the LETTERS their keys share under the loose fold (text.ts `arShardLetters`: أ إ آ as ا, ى as ي, ة as ه), and the
 * `loose` map of a shard is cut by the same rule, so a word printed without its hamza finds the hamza forms in the same shard.
 * Built by scripts/ar-build-index.mts.
 *
 * The index holds words WITHOUT their attached function words, and a printed Arabic word often carries several (وبالكتاب). So a
 * host asks for a printed word, and the loader asks for the shards of every stem the word could be cut into (clitics.ts
 * `arStemKeys`: a pure, cheap enumeration that does not consult the lexicon), and of its Quranic respelling when it has one.
 */
import { createShardLoader, type ShardLoader, type ShardManifest, type ShardSource } from '../shared/shards';
import { installArabicIndex, uninstallArabicIndex, type ArabicFormIndex } from './index-store';
import { arKey, arLoose, arQuranicSpellings, arShardLetters, arTypingVariants, endsInFarsiYeh } from './text';
import { arStemKeys } from './clitics';

export interface ArabicShardManifest extends ShardManifest {
  source: ArabicFormIndex['source'];
  stats?: Record<string, number>;
}
export type ArabicShardSource = ShardSource;
export type ArabicShardLoader = ShardLoader<ArabicShardManifest>;

export { arShardLetters };

/** Every index key a printed word (or a key) may be read through: itself, its possible stems, and the same for its Quranic respellings. */
export function arLookupKeys(word: string): string[] {
  const out = new Set<string>();
  const add = (form: string): void => {
    const key = arKey(form);
    if (!key) return;
    out.add(key);
    for (const k of arStemKeys(key)) out.add(k);
    // علی may be على: the final Persian yeh stands for both letters
    if (endsInFarsiYeh(form)) { const alt = `${key.slice(0, -1)}ى`; out.add(alt); for (const k of arStemKeys(alt)) out.add(k); }
  };
  add(word);
  for (const v of arQuranicSpellings(word)) add(v.text);
  // a hamza typed after a dotless yāʾ (قارىء, شىء): the keys the analyser will try instead
  for (const v of arTypingVariants(arKey(word))) add(v);
  // a borrowed letter (ڤ پ چ گ) is looked up under the Arabic letter the dictionary writes
  for (const k of [...out]) { const folded = arLoose(k); if (folded !== k && /[ڤپچگ]/.test(k)) out.add(folded); }
  return [...out];
}

/** A loader over the sharded Arabic index (`base`: the folder holding manifest.json, e.g. lexicon/ar/standard). */
export async function createArabicShardLoader(src: ArabicShardSource, opts: { base: string; maxLoaded?: number }): Promise<ArabicShardLoader> {
  const loader = await createShardLoader<ArabicFormIndex, ArabicShardManifest>(src, { ...opts, letters: arShardLetters, install: installArabicIndex, uninstall: uninstallArabicIndex });
  const expand = (keys: Iterable<string>): string[] => {
    const out = new Set<string>();
    for (const k of keys) for (const x of arLookupKeys(k)) out.add(x);
    return [...out];
  };
  return { ...loader, ensure: (keys) => loader.ensure(expand(keys)) };
}
