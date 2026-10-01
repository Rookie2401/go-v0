/**
 * Dictionary build, pure part: kaikki JSON lines in, manifest + shard files (as text) out. No filesystem here, so
 * tests call it directly; src/dict/build-node.ts streams a file through it and writes the result.
 */
import type { DictionaryEntry, DictionaryInfo, LanguageCode } from '../core';
import { BUCKETS, DICT_SCHEMA, MAX_GLOSSES, bucketOf, compactEntry, shardName, type CompactEntry, type DictionaryManifest } from './format';
import { KAIKKI_SKIPS, mapKaikkiLine, type KaikkiSkip } from './map';

export const KAIKKI_ATTRIBUTION = 'Wiktionary, via kaikki.org — CC BY-SA 4.0';
export const KAIKKI_LICENCE = 'CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org)';

export interface BuildStats {
  /** Non-blank input lines. */
  lines: number;
  blank: number;
  /** Lines that were not valid JSON. */
  malformed: number;
  skipped: Record<KaikkiSkip, number>;
  /** Skipped 'non-word' lines by the source's part-of-speech heading (character, symbol, punct): counted, not analysed. */
  nonWord: Record<string, number>;
  /** Lines that produced an entry (before merging). */
  kept: number;
  /** Entries in the dictionary (after merging same form + part of speech + etymology + pronunciations). */
  entries: number;
  /** Distinct headwords. */
  forms: number;
  withRespelling: number;
  withIpa: number;
  withRomanization: number;
  withRegister: number;
  withPronunciations: number;
  /** Senses preserved across all entries. */
  senses: number;
  /** Pronunciation groups preserved. */
  pronunciations: number;
  /** Entries whose pronunciation rows could not all be paired by order (kept unpaired, not guessed). */
  unpairedGroups: number;
  shards: number;
  /** Bytes of all shard files, and of the largest one. */
  shardBytes: number;
  largestShardBytes: number;
}

export interface BuildOutput {
  manifest: DictionaryManifest;
  /** Relative file name (`manifest.json`, `s-0a.json`) to file text. */
  files: Map<string, string>;
  stats: BuildStats;
}

const uniq = <T>(a: readonly T[], b: readonly T[], cap = Infinity): T[] => {
  const out: T[] = [];
  for (const v of [...a, ...b]) if (!out.includes(v) && out.length < cap) out.push(v);
  return out;
};

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Two lines of the same form, part of speech, etymology and pronunciations: glosses (capped), senses, registers,
 * classifiers and alt-of headwords are united; the first pronunciation data wins. Entries that differ in etymology or
 * pronunciation are never merged (the builder keeps them apart).
 */
export function mergeEntries(a: DictionaryEntry, b: DictionaryEntry): DictionaryEntry {
  const m: DictionaryEntry = { ...a, glosses: uniq(a.glosses, b.glosses, MAX_GLOSSES) };
  for (const k of ['respelling', 'ipa', 'romanization', 'role', 'definition', 'frequencyRank', 'etymology'] as const) {
    if (m[k] === undefined && b[k] !== undefined) (m as unknown as Record<string, unknown>)[k] = b[k];
  }
  const register = uniq(a.register ?? [], b.register ?? []);
  if (register.length) m.register = register;
  const classifiers = uniq(a.classifiers ?? [], b.classifiers ?? []);
  if (classifiers.length) m.classifiers = classifiers;
  const altOf = uniq(a.altOf ?? [], b.altOf ?? []);
  if (altOf.length) m.altOf = altOf;
  const senses = [...(a.senses ?? [])];
  for (const s of b.senses ?? []) if (!senses.some((x) => sameJson(x, s))) senses.push(s);
  if (senses.length) m.senses = senses;
  if (!a.pronunciations?.length && b.pronunciations?.length) m.pronunciations = b.pronunciations;
  return m;
}

export interface BuilderOptions {
  lang: LanguageCode;
  normalize: (surface: string) => string;
}

export interface DictionaryBuilder {
  /** Feed one raw input line (JSON text). Never throws; a bad line is counted. */
  addLine(text: string): void;
  /**
   * Produce the files. `date` (YYYY-MM-DD) is the only clock: same input + same date = byte-identical output.
   * `source` is recorded in the manifest; its `lastModified` date (when given) names the dictionary id.
   */
  finish(date: string, source?: DictionaryInfo['source']): BuildOutput;
}

export function createDictionaryBuilder(opts: BuilderOptions): DictionaryBuilder {
  const { lang, normalize } = opts;
  const merged = new Map<string, DictionaryEntry>();
  const stats: BuildStats = {
    lines: 0, blank: 0, malformed: 0, kept: 0, entries: 0, forms: 0, withRespelling: 0, withIpa: 0, withRomanization: 0, withRegister: 0,
    withPronunciations: 0, senses: 0, pronunciations: 0, unpairedGroups: 0, shards: 0, shardBytes: 0, largestShardBytes: 0,
    skipped: Object.fromEntries(KAIKKI_SKIPS.map((k) => [k, 0])) as Record<KaikkiSkip, number>,
    nonWord: {},
  };
  let first = true;
  return {
    addLine(raw) {
      let text = raw;
      if (first) { first = false; text = text.replace(/^﻿/, ''); }
      text = text.trim();
      if (!text) { stats.blank++; return; }
      stats.lines++;
      let json: unknown;
      try { json = JSON.parse(text); } catch { stats.malformed++; return; }
      const { entry, skipped, nonWordPos, unpairedPronunciations } = mapKaikkiLine(json, normalize, lang);
      if (!entry) {
        stats.skipped[skipped!]++;
        if (nonWordPos) stats.nonWord[nonWordPos] = (stats.nonWord[nonWordPos] ?? 0) + 1;
        return;
      }
      stats.kept++;
      if (unpairedPronunciations) stats.unpairedGroups++;
      // Same form + part of speech + etymology + pronunciations may merge; anything else stays a separate entry.
      const key = `${entry.form}\u0000${entry.pos ?? ''}\u0000${entry.etymology ?? ''}\u0000${JSON.stringify(entry.pronunciations ?? [])}`;
      const prev = merged.get(key);
      merged.set(key, prev ? mergeEntries(prev, entry) : entry);
    },
    finish(date, source) {
      const buckets = new Map<number, Map<string, CompactEntry[]>>();
      const forms = new Set<string>();
      for (const e of merged.values()) { // insertion order = input order, so entries of one form keep a stable order
        forms.add(e.form);
        if (e.respelling) stats.withRespelling++;
        if (e.ipa) stats.withIpa++;
        if (e.romanization) stats.withRomanization++;
        if (e.register?.length) stats.withRegister++;
        if (e.pronunciations?.length) stats.withPronunciations++;
        stats.senses += e.senses?.length ?? 0;
        stats.pronunciations += e.pronunciations?.length ?? 0;
        const b = bucketOf(e.form);
        const shard = buckets.get(b) ?? new Map<string, CompactEntry[]>();
        shard.set(e.form, [...(shard.get(e.form) ?? []), compactEntry(e)]);
        buckets.set(b, shard);
      }
      const files = new Map<string, string>();
      for (let b = 0; b < BUCKETS; b++) {
        const shard = buckets.get(b);
        if (!shard) continue;
        const names = [...shard.keys()].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)); // code-unit order, locale-independent
        const text = JSON.stringify(Object.fromEntries(names.map((f) => [f, shard.get(f)]))) + '\n';
        files.set(shardName(b), text);
        const bytes = new TextEncoder().encode(text).length;
        stats.shardBytes += bytes;
        stats.largestShardBytes = Math.max(stats.largestShardBytes, bytes);
      }
      stats.entries = merged.size;
      stats.forms = forms.size;
      stats.shards = files.size;
      const idDate = source?.lastModified?.slice(0, 10) || date;
      const manifest: DictionaryManifest = {
        schema: DICT_SCHEMA,
        id: `kaikki-${lang}@${idDate}`,
        lang,
        attribution: KAIKKI_ATTRIBUTION,
        licence: KAIKKI_LICENCE,
        entries: merged.size,
        builtAt: date,
        hasFrequency: false, // the source carries no frequency information; none is invented
        ...(source ? { source } : {}),
        shards: files.size,
        shardFiles: [...files.keys()],
      };
      return { manifest, files: new Map([['manifest.json', JSON.stringify(manifest, null, 2) + '\n'], ...files]), stats };
    },
  };
}

/** Convenience for tests and small inputs. */
export function buildDictionary(lines: Iterable<string>, opts: BuilderOptions & { date: string; source?: DictionaryInfo['source'] }): BuildOutput {
  const b = createDictionaryBuilder(opts);
  for (const l of lines) b.addLine(l);
  return b.finish(opts.date, opts.source);
}
