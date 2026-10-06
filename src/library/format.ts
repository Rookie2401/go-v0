/**
 * The on-disk format of a built library, `<root>/<lang>/`:
 *
 *   manifest.json          LibraryManifest: id, counts, digest, and the list of index shards
 *   index/<stream>-<nnnn>.json   { schema, rows: CatalogText[] } — up to SHARD_ROWS rows of one primary stream, manifest order
 *   t/<hh>/<name>.json     the documents of a text: one CorpusDocument (imported through the ordinary importer on open)
 *   p/<hh>/<name>.json     the TextProfile of a text (fetched only for the candidates being scored)
 *   provenance.json        audit record of what was built from what (never fetched by the app)
 *
 * <hh> is the last two hex digits of the hash of the text id, so no directory holds more than a few hundred files;
 * <name> is the text id without its "text:<lang>:" prefix. Everything is plain JSON with a fixed key order, so the same
 * inputs and date always produce the same bytes.
 */
import type { CatalogText, LanguageCode } from '../core';
import { hash } from '../core';

export const LIBRARY_SCHEMA = 1 as const;
export const SHARD_ROWS = 500;
export const BUILD_TOOL = 'library-build@1';

export interface LibraryShardInfo {
  /** Path under the language directory. */
  file: string;
  /** The primary stream of the rows in it, and every stream any of them belongs to (a query for a stream installs the shards that list it). */
  stream: string;
  streams: string[];
  rows: number;
}

export interface LibraryManifest {
  schema: typeof LIBRARY_SCHEMA;
  lang: LanguageCode;
  /** "library-es@2026-10-01" */
  id: string;
  builtAt: string;
  tool: string;
  texts: number;
  works: number;
  words: number;
  /** A hash over every index shard, so that a rebuild on the same date with different content is told apart. */
  digest: string;
  shards: LibraryShardInfo[];
}

export const manifestPath = 'manifest.json';
export const provenancePath = 'provenance.json';

/** The directory bucket of a text id. */
export const bucketOfText = (textId: string): string => hash(textId).slice(-2);

/** The file name stem of a text id ("text:es:marianela-ch01" gives "marianela-ch01"). */
export const stemOfText = (textId: string): string => textId.replace(/^text:[a-z]+:/, '').replace(/[^A-Za-z0-9._-]+/g, '_');

export const documentPathOf = (textId: string): string => `t/${bucketOfText(textId)}/${stemOfText(textId)}.json`;
export const profilePathOf = (textId: string): string => `p/${bucketOfText(textId)}/${stemOfText(textId)}.json`;
export const shardPathOf = (stream: string, n: number): string => `index/${stream.replace(/[^a-z0-9-]+/gi, '_')}-${String(n).padStart(4, '0')}.json`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A manifest read from the network: undefined unless every field the runtime relies on is well formed. */
export function parseManifest(raw: unknown, lang: LanguageCode): LibraryManifest | undefined {
  if (!isObj(raw) || raw.schema !== LIBRARY_SCHEMA || raw.lang !== lang) return undefined;
  if (!isStr(raw.id) || !isStr(raw.builtAt) || !isStr(raw.digest)) return undefined;
  if (!isNum(raw.texts) || !isNum(raw.works) || !isNum(raw.words) || !Array.isArray(raw.shards)) return undefined;
  const shards: LibraryShardInfo[] = [];
  for (const s of raw.shards) {
    if (!isObj(s) || !isStr(s.file) || !isStr(s.stream) || !isNum(s.rows) || !Array.isArray(s.streams)) return undefined;
    if (s.file.includes('..') || s.file.startsWith('/')) return undefined;
    shards.push({ file: s.file, stream: s.stream, streams: s.streams.filter(isStr), rows: s.rows });
  }
  return { schema: LIBRARY_SCHEMA, lang, id: raw.id, builtAt: raw.builtAt, tool: typeof raw.tool === 'string' ? raw.tool : '', texts: raw.texts, works: raw.works, words: raw.words, digest: raw.digest, shards };
}

/** The rows of an index shard; a malformed row is skipped (and counted by the caller through the length difference). */
export function parseShard(raw: unknown, lang: LanguageCode): CatalogText[] {
  if (!isObj(raw) || raw.schema !== LIBRARY_SCHEMA || !Array.isArray(raw.rows)) return [];
  const out: CatalogText[] = [];
  for (const r of raw.rows) {
    if (!isObj(r) || !isStr(r.id) || r.lang !== lang || !isStr(r.title) || !isStr(r.stream) || !isStr(r.rights)) continue;
    if (r.readingAssessmentId !== undefined || r.listeningAssessmentId !== undefined) continue;
    if (r.location !== 'library' || typeof r.published !== 'boolean' || !isObj(r.features) || !isNum(r.features.words)) continue;
    out.push(r as unknown as CatalogText);
  }
  return out;
}

/** Whether `value` is a file path the runtime may request: relative, no parent segments. */
export const safeRelative = (p: unknown): p is string => typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !p.includes('..') && !p.includes('\\') && !/^[a-z]+:/i.test(p);
