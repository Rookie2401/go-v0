/**
 * On-disk dictionary format (schema 2): pure, browser-safe, shared by the builder and by every runtime source.
 *
 *   <dir>/<lang>/manifest.json      DictionaryInfo + { schema: 2, shards: <count>, shardFiles: [...] }
 *   <dir>/<lang>/s-<hh>.json        { [form]: CompactEntry[] }   hh = hex of bucketOf(form), 00-ff
 *
 * Schema 2 added the preserved senses, pronunciations, etymology number and alt-of headwords, and the `source`
 * record in the manifest. A schema-1 dictionary on disk reads as "not installed" (rebuild it).
 * Every field read back from disk is untrusted: a bad entry is dropped, a bad manifest or shard reads as absent.
 */
import type {
  DictionaryEntry, DictionaryInfo, DictionaryPronunciation, DictionarySense, LanguageCode, PartOfSpeech, RegisterTag,
} from '../core';

export const DICT_SCHEMA = 2;
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

/** Compact shape of one sense inside a shard. */
export interface CompactSense { g: string; t?: string[]; o?: string[]; x?: number }
/** Compact shape of one pronunciation inside a shard. */
export interface CompactPronunciation { r?: string; i?: string; t?: string; g?: string[]; w?: true }

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
  /** senses */
  s?: CompactSense[];
  /** pronunciations */
  n?: CompactPronunciation[];
  /** etymology number */
  y?: number;
  /** alt-of headwords */
  a?: string[];
}

const compactSense = (s: DictionarySense): CompactSense => ({
  g: s.gloss, ...(s.tags?.length ? { t: s.tags } : {}), ...(s.topics?.length ? { o: s.topics } : {}), ...(s.examples ? { x: s.examples } : {}),
});
const compactPronunciation = (p: DictionaryPronunciation): CompactPronunciation => ({
  ...(p.respelling ? { r: p.respelling } : {}), ...(p.ipa ? { i: p.ipa } : {}), ...(p.romanization ? { t: p.romanization } : {}),
  ...(p.tags?.length ? { g: p.tags } : {}), ...(p.asWritten ? { w: true as const } : {}),
});

export function compactEntry(e: DictionaryEntry): CompactEntry {
  // Property order is fixed by construction, so serialized shards are byte-stable.
  return {
    ...(e.pos ? { p: e.pos } : {}), g: e.glosses, ...(e.respelling ? { r: e.respelling } : {}), ...(e.ipa ? { i: e.ipa } : {}),
    ...(e.romanization ? { t: e.romanization } : {}), ...(e.register?.length ? { c: e.register } : {}),
    ...(e.classifiers?.length ? { l: e.classifiers } : {}), ...(e.role ? { o: e.role } : {}), ...(e.definition ? { d: e.definition } : {}),
    ...(e.frequencyRank !== undefined ? { f: e.frequencyRank } : {}),
    ...(e.senses?.length ? { s: e.senses.map(compactSense) } : {}),
    ...(e.pronunciations?.length ? { n: e.pronunciations.map(compactPronunciation) } : {}),
    ...(e.etymology !== undefined ? { y: e.etymology } : {}), ...(e.altOf?.length ? { a: e.altOf } : {}),
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const strOpt = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x : undefined);
const strList = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []);

function expandSense(raw: unknown): DictionarySense | undefined {
  if (!isObj(raw)) return undefined;
  const gloss = strOpt(raw.g);
  if (!gloss) return undefined;
  const s: DictionarySense = { gloss };
  const t = strList(raw.t); if (t.length) s.tags = t;
  const o = strList(raw.o); if (o.length) s.topics = o;
  if (typeof raw.x === 'number' && Number.isInteger(raw.x) && raw.x >= 1) s.examples = raw.x;
  return s;
}

function expandPronunciation(raw: unknown): DictionaryPronunciation | undefined {
  if (!isObj(raw)) return undefined;
  const p: DictionaryPronunciation = {};
  const r = strOpt(raw.r); if (r) p.respelling = r;
  const i = strOpt(raw.i); if (i) p.ipa = i;
  const t = strOpt(raw.t); if (t) p.romanization = t;
  const g = strList(raw.g); if (g.length) p.tags = g;
  if (raw.w === true) p.asWritten = true;
  return p.respelling || p.ipa || p.romanization ? p : undefined;
}

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
  if (Array.isArray(raw.s)) { const s = raw.s.map(expandSense).filter((x): x is DictionarySense => x !== undefined); if (s.length) e.senses = s; }
  if (Array.isArray(raw.n)) { const n = raw.n.map(expandPronunciation).filter((x): x is DictionaryPronunciation => x !== undefined); if (n.length) e.pronunciations = n; }
  if (typeof raw.y === 'number' && Number.isInteger(raw.y) && raw.y >= 1) e.etymology = raw.y;
  const a = strList(raw.a); if (a.length) e.altOf = a;
  return e;
}

/** The manifest's `source` record, kept only when its shape is right (a bad one is dropped, not guessed at). */
function parseSource(raw: unknown): DictionaryInfo['source'] {
  if (!isObj(raw)) return undefined;
  const file = strOpt(raw.file);
  if (!file) return undefined;
  const s: NonNullable<DictionaryInfo['source']> = { file };
  const url = strOpt(raw.url); if (url) s.url = url;
  const lastModified = strOpt(raw.lastModified); if (lastModified) s.lastModified = lastModified;
  const sha256 = strOpt(raw.sha256); if (sha256) s.sha256 = sha256;
  const retrievedAt = strOpt(raw.retrievedAt); if (retrievedAt) s.retrievedAt = retrievedAt;
  if (typeof raw.lines === 'number' && Number.isInteger(raw.lines) && raw.lines >= 0) s.lines = raw.lines;
  return s;
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
  const source = parseSource(raw.source);
  return {
    schema: DICT_SCHEMA, id, lang, attribution, licence, entries: raw.entries, builtAt, hasFrequency: raw.hasFrequency,
    ...(source ? { source } : {}), shards: raw.shards, shardFiles,
  };
}

/** The runtime view of a manifest: exactly the DictionaryInfo contract. */
export const infoOf = (m: DictionaryManifest): DictionaryInfo => ({
  id: m.id, lang: m.lang, attribution: m.attribution, licence: m.licence, entries: m.entries, builtAt: m.builtAt, hasFrequency: m.hasFrequency,
  ...(m.source ? { source: m.source } : {}),
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
