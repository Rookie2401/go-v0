/**
 * On-disk dictionary format (schema 3, which also reads schema 2): pure, browser-safe, shared by the builder and by
 * every runtime source.
 *
 *   <dir>/<lang>/manifest.json   DictionaryInfo + { schema: 3, buckets, shards: <count>, labelSets: [[...], ...], shardFiles: [...] }
 *   <dir>/<lang>/s-<hh>.json     { [form]: CompactEntry[] }   hh = hex of bucketOf(form, buckets), at least 2 digits
 *
 * `buckets` (256 times a power of two, chosen per language so that shards average about 100 kB) is in the manifest;
 * a manifest without it is an older build and means 256.
 *
 * Schema 2 added the preserved senses, pronunciations, etymology number and alt-of headwords, and the `source`
 * record in the manifest. A schema-1 dictionary on disk reads as "not installed" (rebuild it).
 *
 * Schema 3 (the size work for a dictionary where most entries are inflected forms) differs from schema 2 in the shard
 * entries only, plus one manifest field:
 *   - a form-of relation is `[lemma, n]` (or `[lemma]` when it has no labels): `n` indexes the manifest's `labelSets`,
 *     the distinct label lists (most frequent first), instead of repeating the strings in every relation;
 *   - `g` (glosses) is left out when it is what the senses `s` say (see deriveGlosses) or when there are none, so an
 *     inflected form is just `{"p":"VERB","m":[["abundar",17]]}`;
 *   - an inflected-form entry of a language whose spelling tells the pronunciation carries no pronunciation fields
 *     (the builder's per-language choice, src/dict/build.ts).
 * A schema-3 shard cannot be read without its manifest's label sets (parseShard takes the manifest).
 *
 * Every field read back from disk is untrusted: a bad entry is dropped, a bad manifest or shard reads as absent.
 */
import type {
  DictionaryEntry, DictionaryInfo, DictionaryPronunciation, DictionarySense, LanguageCode, PartOfSpeech, RegisterTag,
} from '../core';

/** The schema the builder writes. The reader also reads READABLE_SCHEMAS. */
export const DICT_SCHEMA = 3;
export const READABLE_SCHEMAS: readonly number[] = [2, 3];
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

/** Stable bucket of a normalized form: 32-bit FNV-1a over its UTF-16 code units, modulo the bucket count (default 256). */
export function bucketOf(form: string, buckets = BUCKETS): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < form.length; i++) {
    h ^= form.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % buckets;
}

/** Shard file name: two hex digits for 256 buckets or fewer, wider when there are more (s-3ff.json for 1024). */
export function shardName(bucket: number, buckets = BUCKETS): string {
  const width = Math.max(2, (buckets - 1).toString(16).length);
  return `s-${bucket.toString(16).padStart(width, '0')}.json`;
}
export const SHARD_FILE = /^s-[0-9a-f]{2,4}\.json$/;
export const MAX_BUCKETS = 65536;

export interface DictionaryManifest extends DictionaryInfo {
  /** 3 for what the builder writes; 2 for an older dictionary that is still read as it always was. */
  schema: 2 | 3;
  /** Number of hash buckets the forms are spread over (256 when an older manifest does not say). */
  buckets: number;
  /** Number of shard files written (empty buckets have no file). */
  shards: number;
  /** Names of the shard files that exist, sorted; lets the browser skip requests for empty buckets. */
  shardFiles: string[];
  /**
   * Schema 3: the distinct label lists of the form-of relations, most frequent first (then by code unit), each list in
   * the source's own order; a relation names one by index. Always empty for schema 2 (its relations carry the labels).
   */
  labelSets: string[][];
}

/** What a shard needs from its manifest to be read. */
export type ShardContext = Pick<DictionaryManifest, 'schema' | 'labelSets'>;

/** Compact shape of one sense inside a shard. */
export interface CompactSense { g: string; t?: string[]; o?: string[]; x?: number }
/** Compact shape of one pronunciation inside a shard. */
export interface CompactPronunciation { r?: string; i?: string; t?: string; g?: string[]; w?: true }

/** Compact shape of one entry inside a shard (the form is the shard key, the language is the manifest's). */
export interface CompactEntry {
  p?: PartOfSpeech;
  /** glosses; absent when the senses say the same (see deriveGlosses) or when there are none */
  g?: string[];
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
  /** inflected form of these lemmas */
  m?: CompactFormOf[];
}
/** Compact shape of one form-of relation inside a shard (schema 3): the lemma and, when it has labels, the label set's index. */
export type CompactFormOf = [lemma: string] | [lemma: string, labelSet: number];

/** The index of a label list in the manifest's `labelSets` (the builder supplies it). */
export type LabelSetIndex = (tags: readonly string[]) => number;

/**
 * The short view that a list of senses implies: the first part of each sense's gloss (a leading label ending in ":"
 * takes the next part with it), without repeats, at most MAX_GLOSSES, leaving out spelling-variant senses
 * (tagged form-of / alt-of) unless nothing else is there. This is exactly how the source mapper builds `glosses`
 * from a line's senses, so for most entries it reproduces them and the shard need not repeat them. The builder
 * checks that it does for each entry and writes `g` only when it does not.
 */
export function deriveGlosses(senses: readonly DictionarySense[]): string[] {
  const variant = (s: DictionarySense) => s.tags?.some((t) => { const l = t.toLowerCase(); return l === 'form-of' || l === 'alt-of'; }) ?? false;
  const real = senses.filter((s) => !variant(s));
  const out: string[] = [];
  for (const s of real.length ? real : senses) {
    const parts = s.gloss.split(' — ');
    const g = parts[0].endsWith(':') && parts.length > 1 ? `${parts[0]} ${parts[1]}` : parts[0];
    if (out.length < MAX_GLOSSES && !out.includes(g)) out.push(g);
  }
  return out;
}
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

const compactSense = (s: DictionarySense): CompactSense => ({
  g: s.gloss, ...(s.tags?.length ? { t: s.tags } : {}), ...(s.topics?.length ? { o: s.topics } : {}), ...(s.examples ? { x: s.examples } : {}),
});
const compactPronunciation = (p: DictionaryPronunciation): CompactPronunciation => ({
  ...(p.respelling ? { r: p.respelling } : {}), ...(p.ipa ? { i: p.ipa } : {}), ...(p.romanization ? { t: p.romanization } : {}),
  ...(p.tags?.length ? { g: p.tags } : {}), ...(p.asWritten ? { w: true as const } : {}),
});

/** The schema-3 compact shape of an entry; `labelSetOf` names the manifest label set of a form-of relation's labels. */
export function compactEntry(e: DictionaryEntry, labelSetOf: LabelSetIndex): CompactEntry {
  // Property order is fixed by construction, so serialized shards are byte-stable.
  // `g` is what the senses do not already say: left out when deriveGlosses gives the same list (and when there are none).
  const gFromSenses = sameList(e.glosses, deriveGlosses(e.senses ?? []));
  return {
    ...(e.pos ? { p: e.pos } : {}), ...(gFromSenses ? {} : { g: e.glosses }), ...(e.respelling ? { r: e.respelling } : {}), ...(e.ipa ? { i: e.ipa } : {}),
    ...(e.romanization ? { t: e.romanization } : {}), ...(e.register?.length ? { c: e.register } : {}),
    ...(e.classifiers?.length ? { l: e.classifiers } : {}), ...(e.role ? { o: e.role } : {}), ...(e.definition ? { d: e.definition } : {}),
    ...(e.frequencyRank !== undefined ? { f: e.frequencyRank } : {}),
    ...(e.senses?.length ? { s: e.senses.map(compactSense) } : {}),
    ...(e.pronunciations?.length ? { n: e.pronunciations.map(compactPronunciation) } : {}),
    ...(e.etymology !== undefined ? { y: e.etymology } : {}), ...(e.altOf?.length ? { a: e.altOf } : {}),
    ...(e.formOf?.length ? { m: e.formOf.map((f): CompactFormOf => (f.tags.length ? [f.lemma, labelSetOf(f.tags)] : [f.lemma])) } : {}),
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

/** One form-of relation as a schema-3 shard stores it: `[lemma]` or `[lemma, labelSetIndex]`; a bad index drops the relation. */
function expandFormOf3(raw: unknown, labelSets: readonly (readonly string[])[]): { lemma: string; tags: string[] } | undefined {
  if (!Array.isArray(raw)) return undefined;
  const lemma = strOpt(raw[0]);
  if (!lemma) return undefined;
  if (raw.length < 2 || raw[1] === undefined) return { lemma, tags: [] };
  const n = raw[1];
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n >= labelSets.length) return undefined; // cannot be trusted: no relation rather than a wrong one
  return { lemma, tags: [...labelSets[n]] };
}

/**
 * Inverse of compactEntry; undefined for anything that is not a usable entry (no glosses, wrong shapes).
 * With `labelSets` (the manifest's, for a schema-3 shard) a missing `g` means "what the senses say" and a relation is
 * `[lemma, labelSetIndex]`; without it the entry is read as schema 2 (`g` always there, relations `{ l, t }`).
 */
export function expandEntry(form: string, lang: LanguageCode, raw: unknown, labelSets?: readonly (readonly string[])[]): DictionaryEntry | undefined {
  if (!isObj(raw)) return undefined;
  const formOf: Array<{ lemma: string; tags: string[] }> = [];
  if (Array.isArray(raw.m)) {
    for (const m of raw.m) {
      if (labelSets) { const f = expandFormOf3(m, labelSets); if (f) formOf.push(f); }
      else { const lemma = isObj(m) ? strOpt(m.l) : undefined; if (lemma) formOf.push({ lemma, tags: isObj(m) ? strList(m.t) : [] }); }
    }
  }
  let senses: DictionarySense[] | undefined;
  if (Array.isArray(raw.s)) { const s = raw.s.map(expandSense).filter((x): x is DictionarySense => x !== undefined); if (s.length) senses = s; }
  const glosses = labelSets && raw.g === undefined ? deriveGlosses(senses ?? []) : strList(raw.g);
  // An inflected form has no gloss of its own: formOf is what it says. Neither means nothing usable.
  if (!glosses.length && !formOf.length) return undefined;
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
  if (senses) e.senses = senses;
  if (Array.isArray(raw.n)) { const n = raw.n.map(expandPronunciation).filter((x): x is DictionaryPronunciation => x !== undefined); if (n.length) e.pronunciations = n; }
  if (typeof raw.y === 'number' && Number.isInteger(raw.y) && raw.y >= 1) e.etymology = raw.y;
  const a = strList(raw.a); if (a.length) e.altOf = a;
  if (formOf.length) e.formOf = formOf;
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

/** The manifest's label sets: absent means none; anything but a list of non-empty lists of strings makes the manifest untrustworthy. */
function parseLabelSets(raw: unknown): string[][] | undefined {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return undefined;
  const out: string[][] = [];
  for (const set of raw) {
    if (!Array.isArray(set) || !set.length || !set.every((t) => typeof t === 'string' && t.trim() !== '')) return undefined;
    out.push(set as string[]);
  }
  return out;
}

/** A manifest the runtime can trust, or undefined (wrong schema, wrong language, missing fields). Schemas 2 and 3 are read. */
export function parseManifest(raw: unknown, lang: LanguageCode): DictionaryManifest | undefined {
  if (!isObj(raw)) return undefined;
  if (typeof raw.schema !== 'number' || !READABLE_SCHEMAS.includes(raw.schema) || raw.lang !== lang) return undefined;
  const schema = raw.schema as 2 | 3;
  const labelSets = schema === 3 ? parseLabelSets(raw.labelSets) : [];
  if (!labelSets) return undefined;
  const id = strOpt(raw.id), attribution = strOpt(raw.attribution), licence = strOpt(raw.licence), builtAt = strOpt(raw.builtAt);
  if (!id || !attribution || !licence || !builtAt) return undefined;
  if (typeof raw.entries !== 'number' || !Number.isInteger(raw.entries) || raw.entries < 0) return undefined;
  if (typeof raw.hasFrequency !== 'boolean') return undefined;
  if (typeof raw.shards !== 'number' || !Number.isInteger(raw.shards) || raw.shards < 0) return undefined;
  let buckets = BUCKETS;
  if (raw.buckets !== undefined) {
    if (typeof raw.buckets !== 'number' || !Number.isInteger(raw.buckets) || raw.buckets < 1 || raw.buckets > MAX_BUCKETS) return undefined;
    buckets = raw.buckets;
  }
  const shardFiles = Array.isArray(raw.shardFiles) && raw.shardFiles.every((s) => typeof s === 'string' && SHARD_FILE.test(s))
    ? (raw.shardFiles as string[]) : [];
  const source = parseSource(raw.source);
  return {
    schema, id, lang, attribution, licence, entries: raw.entries, builtAt, hasFrequency: raw.hasFrequency,
    ...(source ? { source } : {}), buckets, shards: raw.shards, labelSets, shardFiles,
  };
}

/** The runtime view of a manifest: exactly the DictionaryInfo contract. */
export const infoOf = (m: DictionaryManifest): DictionaryInfo => ({
  id: m.id, lang: m.lang, attribution: m.attribution, licence: m.licence, entries: m.entries, builtAt: m.builtAt, hasFrequency: m.hasFrequency,
  ...(m.source ? { source: m.source } : {}),
});

/**
 * A shard's entries by form; unusable entries are dropped, a non-object shard reads as empty. `manifest` is the
 * shard's own manifest: a schema-3 shard is read with its label sets; without a manifest (or with a schema-2 one) the
 * shard is read as schema 2.
 */
export function parseShard(raw: unknown, lang: LanguageCode, manifest?: ShardContext): Map<string, DictionaryEntry[]> {
  const out = new Map<string, DictionaryEntry[]>();
  if (!isObj(raw)) return out;
  const labelSets = manifest?.schema === 3 ? manifest.labelSets : undefined;
  for (const form of Object.keys(raw)) {
    const list = raw[form];
    if (!Array.isArray(list)) continue;
    const entries = list.map((c) => expandEntry(form, lang, c, labelSets)).filter((e): e is DictionaryEntry => e !== undefined);
    if (entries.length) out.set(form, entries);
  }
  return out;
}
