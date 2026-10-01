/**
 * On-disk dictionary format (schema 1): pure, browser-safe, shared by the builder and by every runtime source.
 *
 *   <dir>/<lang>/manifest.json      DictionaryInfo + { schema: 1, shards: <count>, shardFiles: [...] }
 *   <dir>/<lang>/s-<hh>.json        { [form]: CompactEntry[] }   hh = hex of bucketOf(form), 00-ff
 *
 * Every field read back from disk is untrusted: a bad entry is dropped, a bad manifest or shard reads as absent.
 */
import type { DictionaryEntry, DictionaryInfo, LanguageCode, PartOfSpeech, RegisterTag } from '../core';

export const DICT_SCHEMA = 1;
export const BUCKETS = 256;
export const MAX_GLOSSES = 6;

export const PARTS_OF_SPEECH: readonly PartOfSpeech[] = [
  'NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CONJ', 'SCONJ', 'PART', 'NUM', 'INTJ', 'CLF', 'PUNCT', 'X',
];
export const REGISTER_TAGS: readonly RegisterTag[] = [
  'standard', 'colloquial', 'formal', 'literary', 'archaic', 'historical', 'royal', 'religious',
  'regional-isan', 'regional-north', 'regional-south', 'teochew', 'child-directed', 'slang',
];
const POS_SET = new Set<string>(PARTS_OF_SPEECH);
const REGISTER_SET = new Set<string>(REGISTER_TAGS);

/** Stable bucket of a normalized form: 32-bit FNV-1a over its UTF-16 code units, modulo 256. */
export function bucketOf(form: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < form.length; i++) {
    h ^= form.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % BUCKETS;
}

export const shardName = (bucket: number): string => `s-${bucket.toString(16).padStart(2, '0')}.json`;
const SHARD_FILE = /^s-[0-9a-f]{2}\.json$/;

export interface DictionaryManifest extends DictionaryInfo {
  schema: typeof DICT_SCHEMA;
  /** Number of shard files written (empty buckets have no file). */
  shards: number;
  /** Names of the shard files that exist, sorted; lets the browser skip requests for empty buckets. */
  shardFiles: string[];
}

/** Compact shape of one entry inside a shard (the form is the shard key, the language is the manifest's). */
export interface CompactEntry {
  p?: PartOfSpeech;
  g: string[];
  r?: string;
  i?: string;
  t?: string;
  c?: RegisterTag[];
  l?: string[];
  o?: string;
  d?: string;
  f?: number;
}

export function compactEntry(e: DictionaryEntry): CompactEntry {
  // Property order is fixed by construction, so serialized shards are byte-stable.
  return {
    ...(e.pos ? { p: e.pos } : {}), g: e.glosses, ...(e.respelling ? { r: e.respelling } : {}), ...(e.ipa ? { i: e.ipa } : {}),
    ...(e.romanization ? { t: e.romanization } : {}), ...(e.register?.length ? { c: e.register } : {}),
    ...(e.classifiers?.length ? { l: e.classifiers } : {}), ...(e.role ? { o: e.role } : {}), ...(e.definition ? { d: e.definition } : {}),
    ...(e.frequencyRank !== undefined ? { f: e.frequencyRank } : {}),
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const strOpt = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x : undefined);
const strList = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []);

/** Inverse of compactEntry; undefined for anything that is not a usable entry (no glosses, wrong shapes). */
export function expandEntry(form: string, lang: LanguageCode, raw: unknown): DictionaryEntry | undefined {
  if (!isObj(raw)) return undefined;
  const glosses = strList(raw.g);
  if (!glosses.length) return undefined;
  const e: DictionaryEntry = { form, lang, glosses };
  if (typeof raw.p === 'string' && POS_SET.has(raw.p)) e.pos = raw.p as PartOfSpeech;
  const r = strOpt(raw.r); if (r) e.respelling = r;
  const i = strOpt(raw.i); if (i) e.ipa = i;
  const t = strOpt(raw.t); if (t) e.romanization = t;
  const c = strList(raw.c).filter((x) => REGISTER_SET.has(x)) as RegisterTag[];
  if (c.length) e.register = c;
  const l = strList(raw.l); if (l.length) e.classifiers = l;
  const o = strOpt(raw.o); if (o) e.role = o;
  const d = strOpt(raw.d); if (d) e.definition = d;
  if (typeof raw.f === 'number' && Number.isInteger(raw.f) && raw.f >= 1) e.frequencyRank = raw.f;
  return e;
}

/** A manifest the runtime can trust, or undefined (wrong schema, wrong language, missing fields). */
export function parseManifest(raw: unknown, lang: LanguageCode): DictionaryManifest | undefined {
  if (!isObj(raw)) return undefined;
  if (raw.schema !== DICT_SCHEMA || raw.lang !== lang) return undefined;
  const id = strOpt(raw.id), attribution = strOpt(raw.attribution), licence = strOpt(raw.licence), builtAt = strOpt(raw.builtAt);
  if (!id || !attribution || !licence || !builtAt) return undefined;
  if (typeof raw.entries !== 'number' || !Number.isInteger(raw.entries) || raw.entries < 0) return undefined;
  if (typeof raw.hasFrequency !== 'boolean') return undefined;
  if (typeof raw.shards !== 'number' || !Number.isInteger(raw.shards) || raw.shards < 0) return undefined;
  const shardFiles = Array.isArray(raw.shardFiles) && raw.shardFiles.every((s) => typeof s === 'string' && SHARD_FILE.test(s))
    ? (raw.shardFiles as string[]) : [];
  return { schema: DICT_SCHEMA, id, lang, attribution, licence, entries: raw.entries, builtAt, hasFrequency: raw.hasFrequency, shards: raw.shards, shardFiles };
}

/** The runtime view of a manifest: exactly the DictionaryInfo contract. */
export const infoOf = (m: DictionaryManifest): DictionaryInfo => ({
  id: m.id, lang: m.lang, attribution: m.attribution, licence: m.licence, entries: m.entries, builtAt: m.builtAt, hasFrequency: m.hasFrequency,
});

/** A shard's entries by form; unusable entries are dropped, a non-object shard reads as empty. */
export function parseShard(raw: unknown, lang: LanguageCode): Map<string, DictionaryEntry[]> {
  const out = new Map<string, DictionaryEntry[]>();
  if (!isObj(raw)) return out;
  for (const form of Object.keys(raw)) {
    const list = raw[form];
    if (!Array.isArray(list)) continue;
    const entries = list.map((c) => expandEntry(form, lang, c)).filter((e): e is DictionaryEntry => e !== undefined);
    if (entries.length) out.set(form, entries);
  }
  return out;
}
