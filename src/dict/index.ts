/**
 * Dictionary runtime (browser-safe). The Node-only parts live in ./file (file source) and ./build-node (build
 * writer); this module must never import them.
 *
 *   createMemoryLexiconSource  in-memory entries (tests)
 *   createFetchLexiconSource   `<baseUrl>/<lang>/manifest.json` + `s-<hh>.json` shards, loaded lazily
 */
import type { DictionaryEntry, DictionaryInfo, LanguageCode, LexiconSource } from '../core';
import { createShardedSource } from './sharded';

export { bucketOf, shardName, compactEntry, expandEntry, parseManifest, parseShard, DICT_SCHEMA, BUCKETS, MAX_GLOSSES } from './format';
export type { CompactEntry, CompactSense, CompactPronunciation, DictionaryManifest } from './format';
export { entryFromKaikki, mapKaikkiLine, KAIKKI_SKIPS } from './map';
export type { KaikkiMapping, KaikkiSkip } from './map';
export { buildDictionary, createDictionaryBuilder, mergeEntries, KAIKKI_ATTRIBUTION, KAIKKI_LICENCE } from './build';
export type { BuildOutput, BuildStats, BuilderOptions, DictionaryBuilder } from './build';
export { createShardedSource } from './sharded';
export type { ReadDictFile } from './sharded';

/** In-memory source (tests, CLI after reading shards from disk). */
export function createMemoryLexiconSource(lang: LanguageCode, entries: DictionaryEntry[], info?: Partial<DictionaryInfo>): LexiconSource {
  const byForm = new Map<string, DictionaryEntry[]>();
  for (const e of entries) byForm.set(e.form, [...(byForm.get(e.form) ?? []), e]);
  return {
    lang,
    info: async () => ({ id: 'memory', lang, attribution: 'in-memory test dictionary', licence: 'n/a', entries: entries.length, builtAt: '', hasFrequency: false, ...info }),
    lookup: async (forms) => new Map(forms.filter((f) => byForm.has(f)).map((f) => [f, byForm.get(f)!])),
  };
}

/**
 * Browser source: reads `<baseUrl>/<lang>/manifest.json` and the shards it lists, lazily. No manifest (404, invalid,
 * wrong language or schema) ⇒ info() is undefined and lookup is empty. Never throws; a failed request is retried
 * on the next call, a missing or corrupt answer is remembered for the session.
 */
export function createFetchLexiconSource(lang: LanguageCode, opts?: { baseUrl?: string; fetch?: typeof fetch }): LexiconSource {
  const base = (opts?.baseUrl ?? '/dict').replace(/\/+$/, '');
  return createShardedSource(lang, async (relative) => {
    const doFetch = opts?.fetch ?? globalThis.fetch.bind(globalThis);
    const res = await doFetch(`${base}/${lang}/${relative}`);
    if (res.status === 404 || res.status === 410) return undefined; // not installed: the normal state
    if (!res.ok) throw new Error(`dictionary request failed: ${res.status}`); // server trouble: not cached, retried later
    return res.text();
  });
}
