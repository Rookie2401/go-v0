/// <reference types="node" />
/**
 * Node-only half of the frequency sidecar: counts -> the file's content, writing it, and keeping the manifest's `hasFrequency`
 * true exactly while the sidecar is there. Not imported by the browser bundle.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { LanguageCode } from '../core';
import { manifestText } from './build';
import type { DictionaryManifest } from './format';
import { FREQUENCY_FILE, FREQUENCY_MIN_COUNT, FREQUENCY_SCHEMA, frequencyKey, type FrequencyFile, type FrequencySource } from './frequency';

const byCodeUnit = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

export interface FrequencyCounts {
  lang: LanguageCode;
  date: string;
  /** lemma (any case, NFC or not) -> occurrences; the same lemma written twice (two parts of speech) is added up */
  counts: ReadonlyMap<string, number>;
  /** every word of the counted texts, analysed or not: the denominator */
  words: number;
  sources: FrequencySource[];
  minCount?: number;
}

/** The sidecar's content from counts: lemmas with at least minCount occurrences, most frequent first, per million rounded to 2 places. */
export function buildFrequencyFile(c: FrequencyCounts): FrequencyFile {
  const minCount = c.minCount ?? FREQUENCY_MIN_COUNT;
  if (!(c.words > 0)) throw new Error('no words counted: nothing to write');
  const merged = new Map<string, number>();
  for (const [lemma, n] of c.counts) {
    const k = frequencyKey(lemma);
    if (k) merged.set(k, (merged.get(k) ?? 0) + n);
  }
  const rows = [...merged].filter(([, n]) => n >= minCount).sort((a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]));
  return {
    schema: FREQUENCY_SCHEMA, lang: c.lang, builtAt: c.date, minCount, words: c.words, sources: c.sources,
    lemmas: rows.map(([l, n]) => [l, Math.round((n / c.words) * 1e8) / 100]),
  };
}

/** One lemma per line, so the file diffs and streams. */
export const frequencyText = (f: FrequencyFile): string => {
  const head = JSON.stringify({ ...f, lemmas: [] }).replace(',"lemmas":[]', '');
  return `${head.slice(0, -1)},"lemmas":[\n${f.lemmas.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
};

/**
 * Set the manifest's `hasFrequency` to match the sidecar (`present`), keeping everything else as it is. A language without a manifest
 * (no dictionary built) is left alone: returns false. Returns true when a manifest exists.
 */
export function patchManifestFrequency(dir: string, present: boolean): boolean {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) return false;
  const m = JSON.parse(fs.readFileSync(file, 'utf8')) as DictionaryManifest;
  if (m.hasFrequency === present) return true;
  const next = { ...m, hasFrequency: present };
  // a manifest without label sets (an older one, or a hand-made one) is written as plain JSON
  fs.writeFileSync(file, Array.isArray(m.labelSets) ? manifestText(next) : `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return true;
}

/** Write `<dictDir>/<lang>/frequency.json` and patch the manifest if there is one. */
export function writeFrequencySidecar(dictDir: string, f: FrequencyFile): { file: string; manifestPatched: boolean; bytes: number } {
  const dir = path.join(dictDir, f.lang);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, FREQUENCY_FILE);
  const text = frequencyText(f);
  fs.writeFileSync(file, text, 'utf8');
  return { file, manifestPatched: patchManifestFrequency(dir, true), bytes: Buffer.byteLength(text) };
}

/** After a dictionary rebuild (the builder writes `hasFrequency: false`): keep the flag true when the sidecar survived. */
export const repatchManifestFrequency = (dir: string): boolean => fs.existsSync(path.join(dir, FREQUENCY_FILE)) && patchManifestFrequency(dir, true);
