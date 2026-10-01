/**
 * Dictionary runtime — STUB written by the coordinator so that the other packages compile.
 * Package C (docs/PLAN5.md) replaces the bodies; the exported names and signatures are the contract.
 */
import type { DictionaryEntry, DictionaryInfo, LanguageCode, LexiconSource } from '../core';

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

/** Browser source: reads `<baseUrl>/<lang>/manifest.json` and the shards it lists, lazily. No manifest ⇒ info() is undefined. */
export function createFetchLexiconSource(lang: LanguageCode, _opts?: { baseUrl?: string; fetch?: typeof fetch }): LexiconSource {
  return { lang, info: async () => undefined, lookup: async () => new Map() };
}
