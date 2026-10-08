/**
 * Corpus frequency, a SIDECAR of the dictionary (browser-safe). The kaikki extracts carry no frequency (`hasFrequency: false`
 * as the builder writes it), and the dictionary shards are keyed by FORM, so a lemma list does not belong in them. The frequency
 * is therefore its own file, `<dict>/<lang>/frequency.json`, written by `scripts/library-frequency.mts` from the installed
 * library's own profiles (+ the bundled corpus and the ladder) and read lazily by the lexicon source. When the file exists the
 * manifest's `hasFrequency` is true (set by `patchManifestFrequency`, src/dict/frequency-node.ts); when it does not, nothing
 * changes anywhere (the callers fall back to what they did before).
 *
 * Format (schema 1):
 *   { schema: 1, lang, builtAt, minCount, words, sources: [{ id, kind, texts, words }], lemmas: [[lemma, perMillion], ...] }
 * `lemmas` is ordered MOST FREQUENT FIRST (ties by code unit): the RANK of a lemma is its position + 1, so one array carries
 * both the frequency and the rank. A lemma is the written lemma (NFC, lower-cased), parts of speech merged: "is this a common
 * word" is the question, not "which reading of it". Only lemmas met at least `minCount` times are listed; a lemma that is absent
 * is RARE in that corpus (fewer than minCount), which is different from "no information" (no file at all).
 * Proper names and numerals are left out. It is corpus frequency (Scripture-heavy in some languages, see `sources`), not a
 * general-language list; never presented as one.
 */
import type { LanguageCode } from '../core';

export const FREQUENCY_SCHEMA = 1;
export const FREQUENCY_FILE = 'frequency.json';
export const FREQUENCY_MIN_COUNT = 3;

export interface FrequencySource { id: string; kind: 'library' | 'bundled' | 'ladder'; texts: number; words: number }

export interface FrequencyFile {
  schema: typeof FREQUENCY_SCHEMA;
  lang: LanguageCode;
  builtAt: string;
  /** a lemma is listed only when met at least this often */
  minCount: number;
  /** all words counted (the denominator of every perMillion) */
  words: number;
  sources: FrequencySource[];
  /** [written lemma, occurrences per million words], most frequent first; rank = position + 1 */
  lemmas: Array<[string, number]>;
}

export interface LemmaFrequency { perMillion: number; rank: number }

/** The runtime view of a frequency file. */
export interface FrequencyTable {
  readonly lang: LanguageCode;
  readonly size: number;
  readonly words: number;
  readonly sources: readonly FrequencySource[];
  readonly builtAt: string;
  /** undefined: the lemma is not in the table (rare in the corpus, fewer than `minCount` occurrences) */
  get(lemma: string): LemmaFrequency | undefined;
}

/** The key a lemma is listed and looked up under: NFC, lower-cased (the way the ladder gate keys its lemmas). */
export const frequencyKey = (lemma: string): string => lemma.normalize('NFC').toLowerCase();

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A table the runtime can trust, or undefined (wrong schema or language, malformed rows). Never throws. */
export function parseFrequency(raw: unknown, lang: LanguageCode): FrequencyTable | undefined {
  if (!isObj(raw) || raw.schema !== FREQUENCY_SCHEMA || raw.lang !== lang) return undefined;
  if (typeof raw.builtAt !== 'string' || typeof raw.words !== 'number' || !(raw.words > 0) || !Array.isArray(raw.lemmas)) return undefined;
  const map = new Map<string, LemmaFrequency>();
  let rank = 0;
  for (const row of raw.lemmas) {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || row[0] === '' || typeof row[1] !== 'number' || !(row[1] > 0)) return undefined;
    rank++;
    if (!map.has(row[0])) map.set(row[0], { perMillion: row[1], rank });
  }
  const sources: FrequencySource[] = Array.isArray(raw.sources)
    ? raw.sources.filter((s): s is FrequencySource => isObj(s) && typeof s.id === 'string' && typeof s.words === 'number') : [];
  return { lang, size: map.size, words: raw.words, sources, builtAt: raw.builtAt, get: (lemma) => map.get(frequencyKey(lemma)) };
}

/** Parse the text of a frequency file; undefined when it is not valid JSON or not a usable table. */
export function parseFrequencyText(text: string | undefined, lang: LanguageCode): FrequencyTable | undefined {
  if (text === undefined) return undefined;
  try { return parseFrequency(JSON.parse(text) as unknown, lang); } catch { return undefined; }
}

/** An in-memory table (tests, callers that already hold the numbers): `entries` in any order, ranked by frequency. */
export function frequencyTableOf(lang: LanguageCode, entries: ReadonlyArray<readonly [string, number]>, words = 1_000_000): FrequencyTable {
  const sorted = [...entries].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return parseFrequency({ schema: FREQUENCY_SCHEMA, lang, builtAt: '', minCount: FREQUENCY_MIN_COUNT, words, sources: [], lemmas: sorted.map(([l, f]) => [frequencyKey(l), f]) }, lang)!;
}
