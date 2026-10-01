/**
 * Dictionary build, pure part: kaikki JSON lines in, manifest + shard files (as text) out. No filesystem here, so
 * tests call it directly. The pieces (line ingestor, merge, tally, shard text, manifest) are shared with the
 * streaming, disk-spilling writer in src/dict/build-node.ts, which is what the CLI uses for large files; the output
 * of the two is byte-identical.
 */
import type { DictionaryEntry, DictionaryInfo, LanguageCode } from '../core';
import { BUCKETS, DICT_SCHEMA, MAX_BUCKETS, MAX_GLOSSES, bucketOf, compactEntry, shardName, type DictionaryManifest } from './format';
import { KAIKKI_SKIPS, mapKaikkiLine, type KaikkiSkip } from './map';

export const KAIKKI_ATTRIBUTION = 'Wiktionary, via kaikki.org — CC BY-SA 4.0';
export const KAIKKI_LICENCE = 'CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org)';

/** Aim for shards of about this many bytes on average, so that the largest stays well under ~250 kB. */
export const TARGET_SHARD_BYTES = 120_000;

/**
 * The bucket count for a dictionary whose shard data comes to `totalBytes`: 256 (the Thai size) or the next power of
 * two times 256 that brings the average shard under TARGET_SHARD_BYTES. Recorded in the manifest.
 */
export function chooseBuckets(totalBytes: number): number {
  let b = BUCKETS;
  while (b < MAX_BUCKETS && totalBytes / b > TARGET_SHARD_BYTES) b *= 2;
  return b;
}

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
  /** Entries that are inflected forms of a lemma (formOf), and the number of form-of relations they carry. */
  withFormOf: number;
  formOfRelations: number;
  /** Senses preserved across all entries. */
  senses: number;
  /** Pronunciation groups preserved. */
  pronunciations: number;
  /** Entries whose pronunciation rows could not all be paired by order (kept unpaired, not guessed). */
  unpairedGroups: number;
  /** Hash buckets the forms are spread over (in the manifest). */
  buckets: number;
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

export const newBuildStats = (): BuildStats => ({
  lines: 0, blank: 0, malformed: 0, kept: 0, entries: 0, forms: 0, withRespelling: 0, withIpa: 0, withRomanization: 0, withRegister: 0,
  withPronunciations: 0, withFormOf: 0, formOfRelations: 0, senses: 0, pronunciations: 0, unpairedGroups: 0, buckets: BUCKETS,
  shards: 0, shardBytes: 0, largestShardBytes: 0,
  skipped: Object.fromEntries(KAIKKI_SKIPS.map((k) => [k, 0])) as Record<KaikkiSkip, number>,
  nonWord: {},
});

const uniq = <T>(a: readonly T[], b: readonly T[], cap = Infinity): T[] => {
  const out: T[] = [];
  for (const v of [...a, ...b]) if (!out.includes(v) && out.length < cap) out.push(v);
  return out;
};

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Two lines of the same form, part of speech, etymology and pronunciations: glosses (capped), senses, registers,
 * classifiers, alt-of headwords and form-of relations are united; the first pronunciation data wins. Entries that
 * differ in etymology or pronunciation are never merged (the builder keeps them apart).
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
  const formOf = [...(a.formOf ?? [])];
  for (const f of b.formOf ?? []) if (!formOf.some((x) => sameJson(x, f))) formOf.push(f);
  if (formOf.length) m.formOf = formOf;
  if (!a.pronunciations?.length && b.pronunciations?.length) m.pronunciations = b.pronunciations;
  return m;
}

/** Same form + part of speech + etymology + pronunciations may merge; anything else stays a separate entry. */
export const mergeKey = (e: DictionaryEntry): string =>
  `${e.form}\u0000${e.pos ?? ''}\u0000${e.etymology ?? ''}\u0000${JSON.stringify(e.pronunciations ?? [])}`;

export interface BuilderOptions {
  lang: LanguageCode;
  normalize: (surface: string) => string;
}

/** One raw input line in, the entry it maps to (or undefined) out; counts every line, never throws. */
export function createLineIngestor(opts: BuilderOptions, stats: BuildStats): (raw: string) => DictionaryEntry | undefined {
  let first = true;
  return (raw) => {
    let text = raw;
    if (first) { first = false; text = text.replace(/^﻿/, ''); }
    text = text.trim();
    if (!text) { stats.blank++; return undefined; }
    stats.lines++;
    let json: unknown;
    try { json = JSON.parse(text); } catch { stats.malformed++; return undefined; }
    const { entry, skipped, nonWordPos, unpairedPronunciations } = mapKaikkiLine(json, opts.normalize, opts.lang);
    if (!entry) {
      stats.skipped[skipped!]++;
      if (nonWordPos) stats.nonWord[nonWordPos] = (stats.nonWord[nonWordPos] ?? 0) + 1;
      return undefined;
    }
    stats.kept++;
    if (unpairedPronunciations) stats.unpairedGroups++;
    return entry;
  };
}

/** Add one finished (merged) entry to the per-entry counts. */
export function tallyEntry(stats: BuildStats, e: DictionaryEntry): void {
  stats.entries++;
  if (e.respelling) stats.withRespelling++;
  if (e.ipa) stats.withIpa++;
  if (e.romanization) stats.withRomanization++;
  if (e.register?.length) stats.withRegister++;
  if (e.pronunciations?.length) stats.withPronunciations++;
  if (e.formOf?.length) { stats.withFormOf++; stats.formOfRelations += e.formOf.length; }
  stats.senses += e.senses?.length ?? 0;
  stats.pronunciations += e.pronunciations?.length ?? 0;
}

const utf8 = new TextEncoder();
export const byteLength = (s: string): number => utf8.encode(s).length;

/** The compact JSON text of one entry (what a shard stores). */
export const entryJson = (e: DictionaryEntry): string => JSON.stringify(compactEntry(e));

/**
 * Bytes one mapped line contributes to the bucket-count estimate (its compact JSON, its form and a little framing),
 * counted before merging so that the streaming writer, which cannot know the merged size, reaches the same number.
 */
export const estimateBytes = (e: DictionaryEntry, json = entryJson(e)): number => byteLength(json) + byteLength(e.form) + 6;

const byCodeUnit = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0); // locale-independent

/** Shard file text: forms in code-unit order, each with its entries' compact JSON, one line, trailing newline. */
export function shardText(byForm: Map<string, string[]>): string {
  const forms = [...byForm.keys()].sort(byCodeUnit);
  return `{${forms.map((f) => `${JSON.stringify(f)}:[${byForm.get(f)!.join(',')}]`).join(',')}}\n`;
}

/** Count a written shard in the byte totals. */
export function tallyShard(stats: BuildStats, text: string): void {
  const bytes = byteLength(text);
  stats.shards++;
  stats.shardBytes += bytes;
  stats.largestShardBytes = Math.max(stats.largestShardBytes, bytes);
}

export function makeManifest(
  lang: LanguageCode, date: string, source: DictionaryInfo['source'] | undefined, stats: BuildStats, shardFiles: string[],
): DictionaryManifest {
  const idDate = source?.lastModified?.slice(0, 10) || date;
  return {
    schema: DICT_SCHEMA,
    id: `kaikki-${lang}@${idDate}`,
    lang,
    attribution: KAIKKI_ATTRIBUTION,
    licence: KAIKKI_LICENCE,
    entries: stats.entries,
    builtAt: date,
    hasFrequency: false, // the source carries no frequency information; none is invented
    ...(source ? { source } : {}),
    buckets: stats.buckets,
    shards: shardFiles.length,
    shardFiles,
  };
}

export const manifestText = (m: DictionaryManifest): string => JSON.stringify(m, null, 2) + '\n';

export interface DictionaryBuilder {
  /** Feed one raw input line (JSON text). Never throws; a bad line is counted. */
  addLine(text: string): void;
  /**
   * Produce the files. `date` (YYYY-MM-DD) is the only clock: same input + same date = byte-identical output.
   * `source` is recorded in the manifest; its `lastModified` date (when given) names the dictionary id.
   */
  finish(date: string, source?: DictionaryInfo['source']): BuildOutput;
}

/** In-memory builder (tests, small inputs). The CLI's streaming writer in build-node.ts produces the same bytes. */
export function createDictionaryBuilder(opts: BuilderOptions & { buckets?: number }): DictionaryBuilder {
  const stats = newBuildStats();
  const ingest = createLineIngestor(opts, stats);
  const merged = new Map<string, DictionaryEntry>();
  let estimate = 0;
  return {
    addLine(raw) {
      const entry = ingest(raw);
      if (!entry) return;
      estimate += estimateBytes(entry);
      const key = mergeKey(entry);
      const prev = merged.get(key);
      merged.set(key, prev ? mergeEntries(prev, entry) : entry);
    },
    finish(date, source) {
      const forms = new Set<string>();
      const items: Array<{ form: string; json: string }> = [];
      for (const e of merged.values()) { // insertion order = input order, so entries of one form keep a stable order
        forms.add(e.form);
        tallyEntry(stats, e);
        const json = entryJson(e);
        items.push({ form: e.form, json });
      }
      stats.forms = forms.size;
      const buckets = opts.buckets ?? chooseBuckets(estimate);
      stats.buckets = buckets;
      const grouped = new Map<number, Map<string, string[]>>();
      for (const it of items) {
        const b = bucketOf(it.form, buckets);
        const shard = grouped.get(b) ?? new Map<string, string[]>();
        shard.set(it.form, [...(shard.get(it.form) ?? []), it.json]);
        grouped.set(b, shard);
      }
      const files = new Map<string, string>();
      for (let b = 0; b < buckets; b++) {
        const shard = grouped.get(b);
        if (!shard) continue;
        const text = shardText(shard);
        files.set(shardName(b, buckets), text);
        tallyShard(stats, text);
      }
      const manifest = makeManifest(opts.lang, date, source, stats, [...files.keys()]);
      return { manifest, files: new Map([['manifest.json', manifestText(manifest)], ...files]), stats };
    },
  };
}

/** Convenience for tests and small inputs. */
export function buildDictionary(lines: Iterable<string>, opts: BuilderOptions & { date: string; source?: DictionaryInfo['source']; buckets?: number }): BuildOutput {
  const b = createDictionaryBuilder(opts);
  for (const l of lines) b.addLine(l);
  return b.finish(opts.date, opts.source);
}
