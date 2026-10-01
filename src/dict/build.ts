/**
 * Dictionary build, pure part: kaikki JSON lines in, manifest + shard files (as text) out. No filesystem here, so
 * tests call it directly; src/dict/build-node.ts streams a file through it and writes the result.
 */
import type { DictionaryEntry, LanguageCode } from '../core';
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
  /** Lines that produced an entry (before merging). */
  kept: number;
  /** Entries in the dictionary (after merging same form + part of speech). */
  entries: number;
  shards: number;
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

/** Same form and part of speech: glosses (capped), registers and classifiers are united; the first pronunciation data wins. */
export function mergeEntries(a: DictionaryEntry, b: DictionaryEntry): DictionaryEntry {
  const m: DictionaryEntry = { ...a, glosses: uniq(a.glosses, b.glosses, MAX_GLOSSES) };
  for (const k of ['respelling', 'ipa', 'romanization', 'role', 'definition', 'frequencyRank'] as const) {
    if (m[k] === undefined && b[k] !== undefined) (m as unknown as Record<string, unknown>)[k] = b[k];
  }
  const register = uniq(a.register ?? [], b.register ?? []);
  if (register.length) m.register = register;
  const classifiers = uniq(a.classifiers ?? [], b.classifiers ?? []);
  if (classifiers.length) m.classifiers = classifiers;
  return m;
}

export interface BuilderOptions {
  lang: LanguageCode;
  normalize: (surface: string) => string;
}

export interface DictionaryBuilder {
  /** Feed one raw input line (JSON text). Never throws; a bad line is counted. */
  addLine(text: string): void;
  /** Produce the files. `date` (YYYY-MM-DD) is the only clock: same input + same date = byte-identical output. */
  finish(date: string): BuildOutput;
}

export function createDictionaryBuilder(opts: BuilderOptions): DictionaryBuilder {
  const { lang, normalize } = opts;
  const merged = new Map<string, DictionaryEntry>();
  const stats: BuildStats = {
    lines: 0, blank: 0, malformed: 0, kept: 0, entries: 0, shards: 0,
    skipped: Object.fromEntries(KAIKKI_SKIPS.map((k) => [k, 0])) as Record<KaikkiSkip, number>,
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
      const { entry, skipped } = mapKaikkiLine(json, normalize, lang);
      if (!entry) { stats.skipped[skipped!]++; return; }
      stats.kept++;
      const key = `${entry.form}\u0000${entry.pos ?? ''}`;
      const prev = merged.get(key);
      merged.set(key, prev ? mergeEntries(prev, entry) : entry);
    },
    finish(date) {
      const buckets = new Map<number, Map<string, CompactEntry[]>>();
      for (const e of merged.values()) { // insertion order = input order, so entries of one form keep a stable order
        const b = bucketOf(e.form);
        const shard = buckets.get(b) ?? new Map<string, CompactEntry[]>();
        shard.set(e.form, [...(shard.get(e.form) ?? []), compactEntry(e)]);
        buckets.set(b, shard);
      }
      const files = new Map<string, string>();
      for (let b = 0; b < BUCKETS; b++) {
        const shard = buckets.get(b);
        if (!shard) continue;
        const forms = [...shard.keys()].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)); // code-unit order, locale-independent
        files.set(shardName(b), JSON.stringify(Object.fromEntries(forms.map((f) => [f, shard.get(f)]))) + '\n');
      }
      stats.entries = merged.size;
      stats.shards = files.size;
      const manifest: DictionaryManifest = {
        schema: DICT_SCHEMA,
        id: `kaikki-${lang}@${date}`,
        lang,
        attribution: KAIKKI_ATTRIBUTION,
        licence: KAIKKI_LICENCE,
        entries: merged.size,
        builtAt: date,
        hasFrequency: false, // the source carries no frequency information; none is invented
        shards: files.size,
        shardFiles: [...files.keys()],
      };
      return { manifest, files: new Map([['manifest.json', JSON.stringify(manifest, null, 2) + '\n'], ...files]), stats };
    },
  };
}

/** Convenience for tests and small inputs. */
export function buildDictionary(lines: Iterable<string>, opts: BuilderOptions & { date: string }): BuildOutput {
  const b = createDictionaryBuilder(opts);
  for (const l of lines) b.addLine(l);
  return b.finish(opts.date);
}
