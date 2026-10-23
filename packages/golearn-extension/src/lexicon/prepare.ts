/**
 * The full form indexes of Hebrew and Greek inside the extension: the sharded sets under `lexicon/<lang>/<set>/` (web-accessible
 * resources, built by npm run lexicon:shard and copied by ext:build) are loaded on demand BEFORE a lookup is parsed, so the card
 * reads the selection with the same sources Biblia has (Attic and Homeric readings, Modern Hebrew and Greek, the whole Tanakh),
 * not the compiled core alone. `prepare(languageId, text)` fetches the shards the text's words live in; a failure is remembered
 * for that set (`unavailable()`), and the lookup goes on with what is installed (the card's Variants rows say "not loaded"); nothing is logged.
 *
 * Where the files are read from: the extension's own files (`chrome.runtime.getURL`), or, on a harness page with no
 * `chrome.runtime`, `/dist/lexicon/…` on the page's origin (the same rule as the analyser chunks, analysers/urlLoader.ts).
 */
import type { ShardLoader, ShardSource } from '../../../../src/adapters/shared/shards';
import { createGreekShardLoader } from '../../../../src/adapters/greek/shards';
import { createHebrewShardLoader } from '../../../../src/adapters/hebrew/shards';
import type { UrlLoaderApi } from '../analysers/urlLoader';
import { analyserExtras, getAnalyser } from '../parser/registry';

/** The sets per language, in the order they are loaded. */
export const LEXICON_SETS: Readonly<Record<string, readonly string[]>> = { el: ['el/ancient', 'el/modern'], he: ['he/biblical', 'he/modern'] };

export function lexiconUrl(chromeApi: UrlLoaderApi | undefined, base: string | undefined, path: string): string {
  return chromeApi?.runtime.getURL ? chromeApi.runtime.getURL(`lexicon/${path}`) : new URL(`/dist/lexicon/${path}`, base).href;
}

export interface LexiconPreparer {
  /** Loads the shards the text's words need for this language; resolves when they are installed (or have failed). */
  prepare(languageId: string, text: string): Promise<{ sets: string[]; failed: string[] }>;
  /** The sets whose manifest could not be read (reported once each). */
  unavailable(): string[];
}

export function createLexiconPreparer(chromeApi: UrlLoaderApi | undefined, fetcher: typeof fetch = globalThis.fetch, base: string | undefined = typeof location === 'undefined' ? undefined : location.href, maxLoaded = 48): LexiconPreparer {
  const loaders = new Map<string, Promise<ShardLoader | undefined>>();
  const unavailable = new Set<string>();
  const source: ShardSource = {
    async fetchJson(path) { const r = await fetcher(lexiconUrl(chromeApi, base, path)); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); },
    async fetchBytes(path) { const r = await fetcher(lexiconUrl(chromeApi, base, path)); if (!r.ok) throw new Error(`${path}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); },
  };
  const loaderOf = (set: string): Promise<ShardLoader | undefined> => {
    let p = loaders.get(set);
    if (!p) {
      // the analyser chunk's own factory installs into the chunk's index store; the src factories serve only an analyser registered from src (tests)
      const make = analyserExtras(set.slice(0, 2))?.createShardLoader ?? (set.startsWith('el/') ? createGreekShardLoader : createHebrewShardLoader);
      // the content script logs nothing (test/audit/security.bundle.test.ts): a missing set is remembered here and shows on the card as "not loaded"
      p = make(source, { base: set, maxLoaded }).then((l) => l as ShardLoader, () => { unavailable.add(set); return undefined; });
      loaders.set(set, p);
    }
    return p;
  };
  return {
    unavailable: () => [...unavailable],
    async prepare(languageId, text) {
      const sets = LEXICON_SETS[languageId] ?? [];
      const adapter = getAnalyser(languageId);
      if (!sets.length || !adapter || !text) return { sets: [], failed: [] };
      const keys = adapter.tokenize(text).filter((t) => t.isWord).map((t) => t.normalized);
      const failed: string[] = [];
      const used: string[] = [];
      await Promise.all(sets.map(async (set) => {
        const loader = await loaderOf(set);
        if (!loader) { failed.push(set); return; }
        const r = await loader.ensure(keys);
        used.push(set);
        if (r.failed.length) failed.push(`${set}: ${r.failed.length} shard${r.failed.length === 1 ? '' : 's'} (${r.failed[0][1]})`);
      }));
      return { sets: used, failed };
    },
  };
}
