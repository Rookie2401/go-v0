/**
 * The English -> target-language reverse index (browser-safe: no node imports; the Node builder is
 * scripts/build-reverse-gloss.mts).
 *
 * The dictionary answers "what does this word mean"; the reverse index answers "what is the word for this". It is built
 * from the glosses of the dictionary's lemma entries: the first three glosses of an entry give English "heads" (the bare
 * word or short phrase, with brackets, a leading "to " and grammatical notes removed), and each head lists the lemmas
 * that have it, best first (main sense, then frequency).
 *
 * Files, next to the dictionary: `<dict>/<lang>/reverse/manifest.json` and `r-<hex>.json`.
 *   manifest: { version: 1, lang, buckets, heads, shardFiles, builtFrom }
 *   shard:    { [head]: Array<[lemma, pos | null, rank | null]> }      (bucket = bucketOf(head, buckets))
 *
 * Runtime: createReverseSource(lang, { fetch?, base? }).lookupEnglish("to believe") -> [{ lemma: "creer", pos: "VERB", ... }].
 * A language with no reverse index (no manifest, e.g. nb) answers []; a source never throws.
 */
import type { DictionaryEntry, LanguageCode, PartOfSpeech } from '../core';
import { bucketOf } from './format';

export const REVERSE_VERSION = 2;
/** Glosses of an entry that give heads. */
export const REVERSE_GLOSSES = 3;
/** Most lemmas kept per head. */
export const REVERSE_MAX_PER_HEAD = 12;
/** Shards a source keeps parsed at once. */
export const REVERSE_CACHE_SHARDS = 8;
export const REVERSE_DIR = 'reverse';
export const REVERSE_MANIFEST = 'manifest.json';
export const REVERSE_SHARD_FILE = /^r-[0-9a-f]{2,4}\.json$/;

/** One lemma of a head as a shard stores it. */
/** [lemma, pos, frequency rank, index of the gloss the head came from (0 = first), position of the head within that gloss (0 = first)] */
export type ReverseRow = [lemma: string, pos: string | null, rank: number | null, gloss: number, headAt: number];

export interface ReverseManifest {
  version: number;
  lang: LanguageCode;
  buckets: number;
  /** distinct heads in the index */
  heads: number;
  shardFiles: string[];
  /** the id of the dictionary manifest this was built from */
  builtFrom: string;
}

/** What a lookup returns. */
export interface ReverseEntry { lemma: string; pos?: PartOfSpeech; frequencyRank?: number }

export interface ReverseSource {
  readonly lang: LanguageCode;
  /** The lemmas whose gloss is this English word, best first (main sense, then frequency); [] when there are none or no index. */
  lookupEnglish(english: string): Promise<ReverseEntry[]>;
}

export function reverseShardName(bucket: number, buckets: number): string {
  const width = Math.max(2, (buckets - 1).toString(16).length);
  return `r-${bucket.toString(16).padStart(width, '0')}.json`;
}

// ---------------------------------------------------------------------------------------------------------------- heads

/** The key a head is stored and asked under: lower case, curly apostrophes straight, whitespace collapsed, trimmed. */
export function normalizeEnglish(s: string): string {
  return s.normalize('NFC').replace(/[‘’ʼ]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Heads that are only function words or filler: a gloss of "a" or "used" says nothing about the word. */
export const STOP_HEADS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'of', 'one', 'ones', 'that', 'which', 'used', 'to', 'who', 'whom', 'whose', 'etc', 'esp',
]);
const EDGE_START = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'that', 'which', 'who', 'whom', 'whose', 'used']);
const EDGE_END = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'that', 'which', 'who', 'whom', 'whose']);
/** "plural of x", "feminine singular of x": a grammatical description, not a meaning. */
const GRAMMAR_WORDS = new Set([
  'plural', 'singular', 'feminine', 'masculine', 'neuter', 'diminutive', 'augmentative', 'superlative', 'comparative', 'past', 'present', 'future',
  'participle', 'gerund', 'imperative', 'infinitive', 'subjunctive', 'indicative', 'inflection', 'inflected', 'alternative', 'variant', 'obsolete',
  'archaic', 'misspelling', 'abbreviation', 'initialism', 'acronym', 'contraction', 'synonym', 'genitive', 'dative', 'accusative', 'nominative',
  'form', 'female', 'male', 'clipping', 'dialectal', 'nonstandard',
]);
/** Placeholders for the object of a verb in a gloss ("to believe something"). */
const OBJECT_WORDS = new Set(['something', 'someone', 'somebody', 'oneself', 'anything', 'anyone']);
const HEAD_SHAPE = /^[a-z][a-z' -]*$/;
const MAX_HEAD_WORDS = 3;

/**
 * The English heads of ONE gloss: brackets removed (round, square, curly), split on `;` and `,`, lower-cased, a leading
 * "to " dropped, then only heads of 1-3 words made of letters, apostrophes, hyphens and spaces that are not stop-heads.
 * "to drink; to swallow" -> drink, swallow; "(of a person) tall" -> tall; "water (liquid)" -> water; "the Bible" -> nothing.
 */
export function extractGlossHeads(gloss: string): string[] {
  let s = gloss;
  // innermost groups first, repeatedly, so nested brackets go; commas inside a group never split the gloss
  for (let prev = ''; prev !== s;) { prev = s; s = s.replace(/\([^()]*\)|\[[^[\]]*\]|\{[^{}]*\}/g, ' '); }
  s = s.replace(/[([{].*$/s, ' ').replace(/[)\]}]/g, ' '); // an unclosed group runs to the end; a stray closer is nothing
  const out: string[] = [];
  for (const part of s.split(/[;,]/)) {
    let h = normalizeEnglish(part).replace(/[.!?]+$/, '').trim();
    if (h.startsWith('to ')) h = h.slice(3).trim();
    // "to believe something" is "believe": a trailing placeholder object says what the verb takes, not what it means
    for (let w = h.split(' '); w.length > 1 && OBJECT_WORDS.has(w[w.length - 1]); w = h.split(' ')) h = w.slice(0, -1).join(' ');
    if (!h || !HEAD_SHAPE.test(h) || STOP_HEADS.has(h)) continue;
    const words = h.split(' ');
    if (words.length > MAX_HEAD_WORDS) continue;
    if (words.length > 1 && (EDGE_START.has(words[0]) || EDGE_END.has(words[words.length - 1]))) continue;
    if (words.length > 1 && words[1] === 'of' && GRAMMAR_WORDS.has(words[0])) continue;
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

/** The distinct heads of the first REVERSE_GLOSSES glosses, in order. */
export function extractHeads(glosses: readonly string[]): string[] {
  const out: string[] = [];
  for (const g of glosses.slice(0, REVERSE_GLOSSES)) for (const h of extractGlossHeads(g)) if (!out.includes(h)) out.push(h);
  return out;
}

// -------------------------------------------------------------------------------------------------------------- builder

interface Cand { lemma: string; pos: string | null; rank: number | null; g: number; h: number }

/** Frequency ranks at or below these are "everyday" (tier 2) and "common" (tier 1). */
export const REVERSE_TIER_RANKS = [2000, 10000] as const;
/**
 * How good a hit is, higher is better: primary*2 + tier. primary: 2 when the head is the first head of the first gloss,
 * 1 when it is another head of the first gloss, 0 when it comes from a later gloss. tier: 2 for rank <= 2000, 1 for rank <= 10000,
 * 0 otherwise (or no rank). Ties: lower rank (none last), then earlier gloss, then earlier head, then alphabetical. A word whose first gloss
 * is the head always beats a word that only has it in a later gloss, however frequent; the other heads of the first gloss (primary 1)
 * can tie with a later-gloss everyday word, and then rank decides.
 */
export function reverseScore(rank: number | null, g: number, h: number): number {
  const primary = g === 0 && h === 0 ? 2 : g === 0 ? 1 : 0;
  const tier = rank === null ? 0 : rank <= REVERSE_TIER_RANKS[0] ? 2 : rank <= REVERSE_TIER_RANKS[1] ? 1 : 0;
  return primary * 2 + tier;
}

const cmpCand = (a: Cand, b: Cand): number =>
  reverseScore(b.rank, b.g, b.h) - reverseScore(a.rank, a.g, a.h) || (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.g - b.g || a.h - b.h
  || (a.lemma < b.lemma ? -1 : a.lemma > b.lemma ? 1 : 0) || (a.pos ?? '').localeCompare(b.pos ?? '');
// Infinity - Infinity is NaN, which `||` treats as "continue"; a finite - Infinity is -Infinity, which does not: both are right.

/** Dedupe by (lemma, pos) keeping the better candidate, sort, cap. Deterministic whatever the order the candidates came in. */
function settle(list: Cand[], cap: number): Cand[] {
  const best = new Map<string, Cand>();
  for (const c of list) {
    const key = `${c.lemma}\u0000${c.pos ?? ''}`;
    const had = best.get(key);
    if (!had || cmpCand(c, had) < 0) best.set(key, c);
  }
  return [...best.values()].sort(cmpCand).slice(0, cap);
}

export interface ReverseBuilder {
  /** Add one dictionary entry (a lemma entry; the caller skips inflected forms). Returns the heads it contributed. */
  add(entry: DictionaryEntry, rank: number | null): number;
  /** The shards, by bucket, and the number of distinct heads. */
  finish(buckets: number): { shards: Map<number, Record<string, ReverseRow[]>>; heads: number };
}

export function createReverseBuilder(): ReverseBuilder {
  const byHead = new Map<string, Cand[]>();
  const TRIM_AT = REVERSE_MAX_PER_HEAD * 4; // a very common head ("a person") is trimmed as it grows, so memory stays small
  return {
    add(entry, rank) {
      const lemma = entry.written ?? entry.form;
      const pos = entry.pos ?? null;
      const seen = new Set<string>();
      let n = 0;
      entry.glosses.slice(0, REVERSE_GLOSSES).forEach((gloss, g) => {
        extractGlossHeads(gloss).forEach((h, hAt) => {
          if (seen.has(h)) return;
          seen.add(h);
          let list = byHead.get(h);
          if (!list) { list = []; byHead.set(h, list); }
          list.push({ lemma, pos, rank, g, h: hAt });
          if (list.length > TRIM_AT) byHead.set(h, settle(list, REVERSE_MAX_PER_HEAD * 2));
          n++;
        });
      });
      return n;
    },
    finish(buckets) {
      const shards = new Map<number, Record<string, ReverseRow[]>>();
      const heads = [...byHead.keys()].sort();
      for (const h of heads) {
        const rows = settle(byHead.get(h)!, REVERSE_MAX_PER_HEAD).map((c): ReverseRow => [c.lemma, c.pos, c.rank, c.g, c.h]);
        const b = bucketOf(h, buckets);
        let shard = shards.get(b);
        if (!shard) { shard = {}; shards.set(b, shard); }
        shard[h] = rows;
      }
      return { shards, heads: heads.length };
    },
  };
}

// --------------------------------------------------------------------------------------------------------------- reader

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A manifest the runtime can trust, or undefined (wrong version or language, bad fields). */
export function parseReverseManifest(raw: unknown, lang: LanguageCode): ReverseManifest | undefined {
  if (!isObj(raw) || raw.version !== REVERSE_VERSION || raw.lang !== lang) return undefined;
  if (typeof raw.buckets !== 'number' || !Number.isInteger(raw.buckets) || raw.buckets < 1 || raw.buckets > 65536) return undefined;
  if (typeof raw.heads !== 'number' || !Number.isInteger(raw.heads) || raw.heads < 0) return undefined;
  if (!Array.isArray(raw.shardFiles) || !raw.shardFiles.every((s) => typeof s === 'string' && REVERSE_SHARD_FILE.test(s))) return undefined;
  return {
    version: REVERSE_VERSION, lang, buckets: raw.buckets, heads: raw.heads, shardFiles: raw.shardFiles as string[],
    builtFrom: typeof raw.builtFrom === 'string' ? raw.builtFrom : '',
  };
}

/** A shard's rows by head; rows of the wrong shape are dropped. */
export function parseReverseShard(raw: unknown): Map<string, ReverseRow[]> {
  const out = new Map<string, ReverseRow[]>();
  if (!isObj(raw)) return out;
  for (const head of Object.keys(raw)) {
    const list = raw[head];
    if (!Array.isArray(list)) continue;
    const rows: ReverseRow[] = [];
    for (const r of list) {
      if (!Array.isArray(r) || typeof r[0] !== 'string' || !r[0]) continue;
      const int = (x: unknown, d: number) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : d);
      rows.push([r[0], typeof r[1] === 'string' && r[1] ? r[1] : null, typeof r[2] === 'number' && Number.isFinite(r[2]) ? r[2] : null, int(r[3], 0), int(r[4], 0)]);
    }
    if (rows.length) out.set(head, rows);
  }
  return out;
}

/** The keys to try for a query, best first: as asked, without a leading "to ", without a trailing "s" (of either). */
export function reverseKeys(english: string): string[] {
  const q = normalizeEnglish(english);
  if (!q) return [];
  const noTo = q.startsWith('to ') ? q.slice(3).trim() : q;
  const noS = (k: string) => (k.length > 3 && k.endsWith('s') && !k.endsWith('ss') ? k.slice(0, -1) : k);
  return [...new Set([q, noTo, noS(q), noS(noTo)])].filter(Boolean);
}

export interface ReverseSourceOptions {
  fetch?: typeof fetch;
  /** The dictionary location; the index is `<base>/<lang>/reverse/...`. Default '/dict' (the app passes `${BASE_URL}dict`, as for the dictionary). */
  base?: string;
}

export function createReverseSource(lang: LanguageCode, opts: ReverseSourceOptions = {}): ReverseSource {
  const base = (opts.base ?? '/dict').replace(/\/+$/, '');
  // text of a file under reverse/, or undefined when it is definitely not there; rejects on a transient failure
  const read = async (relative: string): Promise<string | undefined> => {
    const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    const res = await doFetch(`${base}/${lang}/${REVERSE_DIR}/${relative}`);
    if (res.status === 404 || res.status === 410) return undefined;
    if (!res.ok) throw new Error(`reverse index request failed: ${res.status}`);
    return res.text();
  };
  const parseJson = (t: string | undefined): unknown => { if (t === undefined) return undefined; try { return JSON.parse(t) as unknown; } catch { return undefined; } };

  let manifest: Promise<ReverseManifest | undefined> | undefined;
  const loadManifest = (): Promise<ReverseManifest | undefined> => {
    if (!manifest) {
      const p = Promise.resolve().then(() => read(REVERSE_MANIFEST)).then((t) => parseReverseManifest(parseJson(t), lang));
      manifest = p;
      p.catch(() => { if (manifest === p) manifest = undefined; }); // a failed request is retried on the next ask; a missing manifest is remembered
    }
    return manifest.catch(() => undefined);
  };

  // Map order is recency order: the first key is the least recently used.
  const cache = new Map<string, Promise<Map<string, ReverseRow[]>>>();
  const loadShard = (name: string): Promise<Map<string, ReverseRow[]>> => {
    const had = cache.get(name);
    if (had) { cache.delete(name); cache.set(name, had); return had; }
    while (cache.size >= REVERSE_CACHE_SHARDS) cache.delete(cache.keys().next().value as string);
    const p = Promise.resolve().then(() => read(name)).then((t) => parseReverseShard(parseJson(t)));
    cache.set(name, p);
    p.catch(() => { if (cache.get(name) === p) cache.delete(name); });
    return p;
  };

  return {
    lang,
    async lookupEnglish(english) {
      const keys = reverseKeys(english);
      if (!keys.length) return [];
      const m = await loadManifest();
      if (!m) return [];
      const have = new Set(m.shardFiles);
      const found = await Promise.all(keys.map(async (key): Promise<ReverseRow[]> => {
        const name = reverseShardName(bucketOf(key, m.buckets), m.buckets);
        if (!have.has(name)) return []; // the manifest says the bucket is empty: no request
        try { return (await loadShard(name)).get(key) ?? []; } catch { return []; }
      }));
      const out: ReverseEntry[] = [];
      const seen = new Set<string>();
      for (const rows of found) {
        for (const [lemma, pos, rank] of rows) {
          const id = `${lemma}\u0000${pos ?? ''}`;
          if (seen.has(id)) continue;
          seen.add(id);
          out.push({ lemma, ...(pos ? { pos: pos as PartOfSpeech } : {}), ...(rank !== null ? { frequencyRank: rank } : {}) });
        }
      }
      return out;
    },
  };
}
