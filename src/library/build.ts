/**
 * The library build, pure part: a manifest of works and their source texts in, the files of a built library out
 * (through `io.write`). No file system and no network here, so tests call it directly; src/library/build-node.ts reads
 * sources from a directory and writes the result. See format.ts for what is written.
 *
 * RIGHTS ARE A GATE, NOT A LABEL. An entry is refused (named, with the reason, nothing written for it) unless its rights
 * state is `verified-public-domain`, `verified-open-licence` or `course-authored`; the two verified states also need a
 * named verifier and the basis; an entry that says it cannot be bundled is refused whatever its state. A text whose
 * quality verdict is `damaged` is refused too, and so is any text whose quality check cannot run. One work is analysed
 * at a time (and one chapter at a time inside it), so memory stays bounded by the largest chapter.
 *
 * Deterministic: entries are processed in manifest order, every object is built with a fixed key order, and the only
 * clock is the build date.
 */
import type { AdapterRegistry, CatalogText, LanguageCode, LexiconSource, QualityReport, RightsState, TextKind, TextProfile, Work, WorkRights } from '../core';
import { courseForLang, createMemoryStore, hash, ids } from '../core';
import type { CorpusDocument, DocReview } from '../ingest/format';
import { validateDocument } from '../ingest/format';
import { importDocuments } from '../ingest/import';
import { plainTextToDocuments } from '../ingest/plaintext';
import { computePublished, contentSignatureOf } from '../ingest/publish';
import { inspectText, type QualityOptions } from '../ingest/quality';
import {
  BUILD_TOOL, LIBRARY_SCHEMA, SHARD_ROWS, documentPathOf, manifestPath, profilePathOf, provenancePath, shardPathOf,
  type LibraryManifest, type LibraryShardInfo,
} from './format';
import { groupedAnalysesOf, measureStoredText } from './measure';
import { runningNumber } from './canon';

// ───────────────────────────── the build manifest (input) ─────────────────────────────

export type BuildSourceKind = 'plain' | 'gutenberg' | 'wikisource' | 'ocr' | 'documents';

export interface BuildEntry {
  /** `[a-z0-9-]+`: the work's slug; its texts are `text:<lang>:<slug>-chNN`. */
  slug: string;
  title: string;
  author?: string;
  courseId?: string;
  /** A stage key ("s2") or a full stage id. */
  stage?: string;
  /** The shelf it is browsed under, and any others. Default: "library". */
  stream?: string;
  streams?: string[];
  domains?: string[];
  variety?: string;
  region?: string;
  era?: string;
  genre?: string;
  contentType?: TextKind;
  /** Machine-drafted course text says so (and stays unpublished until a person reviews it). */
  generated?: boolean;
  /** The rights record. Only its `state` and the facts the gate asks for are read here; nothing is assumed. */
  rights: WorkRights;
  source: {
    /** Path relative to the input directory. */
    file: string;
    /** 'documents': the file is a JSON CorpusDocument (or an array of them) written for the course. Default 'plain'. */
    kind?: BuildSourceKind;
    url?: string;
    edition?: string;
    attribution?: string;
    provenance?: string;
  };
  /** Options for the plain-text converter (chapters, paragraphs, unwrap, stripBoilerplate, headings …), passed through. */
  convert?: Record<string, unknown>;
  /**
   * A review of THIS source file. It is applied only when `coversSourceSha256` equals the sha256 of the file being built
   * (so a changed source can never inherit a review); otherwise the texts are built unreviewed, and the build says so.
   */
  review?: { status: 'reviewed' | 'approved'; reviewedBy: string; reviewedAt?: string; notes?: string; coversSourceSha256: string };
}

export interface BuildManifest { schema: 1; lang: LanguageCode; entries: BuildEntry[] }

export class LibraryBuildError extends Error {
  constructor(message: string) { super(message); this.name = 'LibraryBuildError'; }
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** Structural check of a build manifest. A malformed manifest stops the build (nothing is built from a file we cannot read). */
export function parseBuildManifest(raw: unknown, lang: LanguageCode): BuildManifest {
  if (!isObj(raw)) throw new LibraryBuildError('the manifest is not a JSON object');
  if (raw.schema !== 1) throw new LibraryBuildError('the manifest needs "schema": 1');
  if (raw.lang !== lang) throw new LibraryBuildError(`the manifest is for language "${String(raw.lang)}", not "${lang}"`);
  if (!Array.isArray(raw.entries)) throw new LibraryBuildError('the manifest needs an "entries" array');
  const seen = new Set<string>();
  raw.entries.forEach((e, i) => {
    if (!isObj(e)) throw new LibraryBuildError(`entries[${i}] is not an object`);
    if (!isStr(e.slug) || !SLUG.test(e.slug)) throw new LibraryBuildError(`entries[${i}].slug must be lower-case letters, digits and hyphens`);
    if (seen.has(e.slug)) throw new LibraryBuildError(`entries[${i}]: the slug "${e.slug}" appears twice`);
    seen.add(e.slug);
    if (!isStr(e.title)) throw new LibraryBuildError(`entries[${i}] ("${e.slug}") has no title`);
    if (!isObj(e.source) || !isStr(e.source.file)) throw new LibraryBuildError(`entries[${i}] ("${e.slug}") has no source.file`);
  });
  return raw as unknown as BuildManifest;
}

// ───────────────────────────── the rights gate ─────────────────────────────

export const BUNDLABLE: readonly RightsState[] = ['verified-public-domain', 'verified-open-licence', 'course-authored'];

/** Why this entry may not be built; empty when it may. */
export function rightsRefusals(entry: Pick<BuildEntry, 'rights' | 'source'>): string[] {
  const r = entry.rights as Partial<WorkRights> | undefined;
  if (!isObj(r)) return ['it has no rights record'];
  const why: string[] = [];
  const state = r.state;
  if (!state) why.push('its rights record has no state (only an explicit state can be built)');
  else if (!(BUNDLABLE as readonly string[]).includes(state)) {
    why.push(`its rights state is "${state}"; only ${BUNDLABLE.map((s) => `"${s}"`).join(', ')} may be built into the library`);
  } else {
    if (state !== 'course-authored') {
      if (!isStr(r.verifiedBy)) why.push(`state "${state}" needs a named verifier (rights.verifiedBy)`);
      if (!isStr(r.basis)) why.push(`state "${state}" needs the basis of the verification (rights.basis)`);
    }
    if (r.canBundle === false) why.push('its rights record says it cannot be bundled (canBundle is false)');
    if (r.userImportOnly === true) why.push('its rights record says it is for the learner to import only (userImportOnly is true)');
  }
  if (!isStr(entry.source?.file) || entry.source.file.startsWith('/') || entry.source.file.includes('..') || /^[a-z]+:/i.test(entry.source.file)) {
    why.push('source.file must be a relative path inside the input directory');
  }
  return why;
}

const SOURCE_RIGHTS: Partial<Record<RightsState, { rights: 'public-domain' | 'licensed' | 'owner-authored'; authorship: 'public-domain' | 'licensed' | 'human' | 'generated'; label: string }>> = {
  'verified-public-domain': { rights: 'public-domain', authorship: 'public-domain', label: 'public domain' },
  'verified-open-licence': { rights: 'licensed', authorship: 'licensed', label: 'open licence' },
  'course-authored': { rights: 'owner-authored', authorship: 'human', label: 'written for the course' },
};

// ───────────────────────────── the build ─────────────────────────────

export interface BuildIO {
  /** The source text of a file under the input directory and its sha256, or undefined when it does not exist. */
  readSource(file: string): Promise<{ text: string; sha256: string } | undefined>;
  /** Write one output file (a path relative to `<out>/<lang>/`). */
  write(relative: string, content: string): void | Promise<void>;
}

export interface BuildOptions {
  lang: LanguageCode;
  manifest: BuildManifest;
  io: BuildIO;
  adapters: AdapterRegistry;
  /** YYYY-MM-DD: the only clock the build uses. */
  date: string;
  /** The installed dictionary to analyse with (the profiles then match what a learner's import will produce). */
  lexicon?: (lang: LanguageCode) => LexiconSource | undefined;
  /** The quality check (default: the importer's `inspectText`). */
  inspect?: (text: string, opts: QualityOptions) => QualityReport;
  /** Text ids that ship bundled with the app: a library document with one of these ids is left out (the bundled text is the one opened). */
  bundledTextIds?: ReadonlySet<string>;
  progress?: (message: string) => void;
}

export interface BuiltWork {
  slug: string;
  title: string;
  texts: number;
  words: number;
  published: number;
  rights: RightsState;
  quality: QualityReport['verdict'] | 'not checked';
  notes: string[];
}

export interface Refusal { slug: string; title: string; reasons: string[] }

export interface BuildResult {
  manifest: LibraryManifest;
  built: BuiltWork[];
  refused: Refusal[];
}

const compact = <T extends object>(o: T): T => {
  const out = { ...o } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined || (Array.isArray(out[k]) && (out[k] as unknown[]).length === 0)) delete out[k];
  return out as T;
};

/** Everything a work needs to become documents, or the reasons it cannot. */
async function documentsOf(entry: BuildEntry, opts: BuildOptions, notes: string[]): Promise<
  { docs: CorpusDocument[]; sha256: string; quality: BuiltWork['quality']; report?: QualityReport } | { refuse: string[] }
> {
  const src = await opts.io.readSource(entry.source.file);
  if (!src) return { refuse: [`the source file "${entry.source.file}" was not found`] };
  const kind = entry.source.kind ?? 'plain';
  const courseId = entry.courseId ?? courseForLang(opts.lang).id;

  let docs: CorpusDocument[];
  let report: QualityReport | undefined;
  if (kind === 'documents') {
    let parsed: unknown;
    try { parsed = JSON.parse(src.text); } catch (e) { return { refuse: [`the source file is not valid JSON (${e instanceof Error ? e.message : String(e)})`] }; }
    docs = (Array.isArray(parsed) ? parsed : [parsed]) as CorpusDocument[];
    if (!docs.length || docs.some((d) => !isObj(d))) return { refuse: ['the source file holds no documents'] };
  } else {
    try {
      report = (opts.inspect ?? inspectText)(src.text, { lang: opts.lang, sourceKind: kind });
    } catch (e) {
      return { refuse: [`the quality check could not run (${e instanceof Error ? e.message : String(e)}); nothing is built without it`] };
    }
    if (report.verdict === 'damaged') {
      const serious = report.flags.filter((f) => f.severity === 'serious').map((f) => `${f.code} x${f.count}${f.sample ? ` ("${f.sample.slice(0, 40)}")` : ''}`);
      return { refuse: [`the source text is damaged (${serious.join(', ') || 'serious quality flags'}): repair or replace it, then build again`] };
    }
    const work: Work = {
      id: ids.work(courseId, entry.slug), courseId, lang: opts.lang, stageId: ids.stage(courseId, entry.stage ?? 's0'), role: 'subsidiary', order: 0,
      title: entry.title, author: entry.author, purpose: [], rights: entry.rights, bibliographyVerified: false,
    };
    try {
      const result = plainTextToDocuments(src.text, {
        lang: opts.lang, work, idPrefix: entry.slug, contentType: entry.contentType ?? 'story', chapters: 'auto', sourceKind: kind, ...(entry.convert ?? {}),
      } as Parameters<typeof plainTextToDocuments>[1]);
      docs = result.documents;
      notes.push(...result.notes);
    } catch (e) {
      return { refuse: [`the converter refused the text: ${e instanceof Error ? e.message : String(e)}`] };
    }
    if (!docs.length) return { refuse: ['the text has no content'] };
  }

  const state = entry.rights.state as RightsState;
  const sr = SOURCE_RIGHTS[state]!;
  const reviewApplies = !!entry.review && entry.review.coversSourceSha256 === src.sha256;
  if (entry.review && !reviewApplies) notes.push('the review in the manifest covers a different file than the one built, so the texts are built unreviewed');

  const out: CorpusDocument[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    if (d.lang !== opts.lang) return { refuse: [`a document has language "${String(d.lang)}", not "${opts.lang}"`] };
    if (kind === 'documents') {
      const have = d.source?.rights;
      if (have !== sr.rights) return { refuse: [`document "${String(d.id)}" has source.rights "${String(have)}", which does not match the manifest's rights state "${state}"`] };
    }
    const chapter = d.work?.chapter ?? { index: i + 1 };
    const source = kind === 'documents' && d.source ? d.source : {
      id: `src:${opts.lang}:${entry.slug}`, title: entry.title, ...(entry.author ? { author: entry.author } : {}), ...(entry.source.edition ? { edition: entry.source.edition } : {}),
      ...(entry.source.url ? { url: entry.source.url } : {}),
      attribution: entry.source.attribution ?? `${entry.title}${entry.author ? ` — ${entry.author}` : ''}. ${sr.label[0].toUpperCase()}${sr.label.slice(1)}.`,
      provenance: entry.source.provenance
        ?? `Built from ${entry.source.file} (sha256 ${src.sha256.slice(0, 16)}…) by ${BUILD_TOOL}; rights${entry.rights.verifiedBy ? ` verified by ${entry.rights.verifiedBy}` : ' state'}: ${entry.rights.basis ?? sr.label}.`,
      rights: sr.rights,
      ...(entry.rights.licensing ? { licenseNote: entry.rights.licensing } : {}),
      authorship: entry.generated && sr.rights === 'owner-authored' ? 'generated' as const : sr.authorship,
    };
    const doc: CorpusDocument = {
      ...d,
      title: d.title || entry.title,
      contentType: kind === 'documents' ? d.contentType : entry.contentType ?? d.contentType ?? 'story',
      corpus: kind === 'documents' ? d.corpus : { id: `library-${opts.lang}`, kind: 'comprehensible-input', title: 'Library' },
      source,
      generated: entry.generated ?? d.generated ?? false,
      work: { slug: entry.slug, courseId, chapter },
      ...(entry.streams ?? entry.stream ? { streams: [...new Set([entry.stream ?? entry.streams![0], ...(entry.streams ?? [])])] } : {}),
      ...(entry.domains?.length ? { domains: entry.domains } : {}),
      ...(entry.variety ? { variety: entry.variety } : {}),
      ...(report && !d.quality ? { quality: report } : {}),
    };
    const review: DocReview = reviewApplies
      ? { status: entry.review!.status, reviewedBy: entry.review!.reviewedBy, ...(entry.review!.reviewedAt ? { reviewedAt: entry.review!.reviewedAt } : {}), ...(entry.review!.notes ? { notes: entry.review!.notes } : {}) }
      : kind === 'documents' && d.review ? d.review : { status: 'unreviewed' };
    if (reviewApplies) review.contentSignature = contentSignatureOf({ ...doc, review });
    doc.review = review;
    if (seen.has(doc.id)) return { refuse: [`two documents have the id "${doc.id}"`] };
    seen.add(doc.id);
    const errors = validateDocument(doc, { registry: opts.adapters, destination: 'library' }).filter((x) => x.severity === 'error');
    if (errors.length) return { refuse: errors.slice(0, 3).map((x) => `${doc.id}: ${x.path || '(document)'}: ${x.message}`) };
    out.push(doc);
  }
  return { docs: inOrder(out, kind, opts, notes), sha256: src.sha256, quality: report ? report.verdict : 'not checked', report };
}

/** A text's words, for telling two texts with the same words apart from two texts. */
const bodyOf = (d: CorpusDocument): string => d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((x) => x.text) : [(p as { text: string }).text]))).join('\n').normalize('NFC').replace(/\s+/g, ' ').trim();

/**
 * The texts of a work IN ORDER, whatever order and numbers the source gave them — enforced here so that no regenerated
 * source can undo it:
 *  - Scripture is sorted by the canon and each chapter is numbered by its place in it (Genesis 1 = 1 … Revelation
 *    22 = 1189), so bundled and library chapters of one Bible fall into one sequence; a chapter outside the canon
 *    stops the work;
 *  - any other collection given as documents is numbered 1, 2, 3 … in the order given (a single text is chapter 1;
 *    texts the converter produced keep its numbering, with 0 for front matter);
 *  - a text with exactly the words of an earlier text of the work is left out (once is enough);
 *  - a text whose id is bundled with the app is left out: opening it would show the bundled text.
 * Each omission is a note of the work; no word of any text is changed.
 */
function inOrder(docs: CorpusDocument[], kind: BuildSourceKind, opts: BuildOptions, notes: string[]): CorpusDocument[] {
  let list = docs;
  const bundled = opts.bundledTextIds;
  if (bundled) {
    const dup = list.filter((d) => bundled.has(`text:${opts.lang}:${d.id}`));
    if (dup.length) { notes.push(`${dup.length} text(s) left out because they are bundled with the app already: ${dup.slice(0, 4).map((d) => d.id).join(', ')}${dup.length > 4 ? ', …' : ''}`); list = list.filter((d) => !dup.includes(d)); }
  }
  const seen = new Map<string, string>();
  const unique: CorpusDocument[] = [];
  for (const d of list) {
    const key = bodyOf(d);
    if (key.length >= 40 && seen.has(key)) { notes.push(`${d.id} left out: the same words as ${seen.get(key)}`); continue; }
    seen.set(key, d.id);
    unique.push(d);
  }
  list = unique;
  const scripture = list.length > 0 && list.every((d) => d.contentType === 'scripture' && !!d.scripture?.book);
  if (scripture) {
    const place = (d: CorpusDocument) => runningNumber(d.scripture!.book, d.scripture!.chapter);
    const outside = list.filter((d) => place(d) === undefined);
    if (outside.length) throw new LibraryBuildError(`${outside.length} chapter(s) are outside the canon and cannot be ordered: ${outside.slice(0, 3).map((d) => `${d.id} (${d.scripture?.book} ${d.scripture?.chapter})`).join(', ')}`);
    const ordered = [...list].sort((a, b) => place(a)! - place(b)!);
    let renumbered = 0;
    for (const d of ordered) {
      const n = place(d)!;
      if (d.work?.chapter?.index !== n) renumbered++;
      d.work = { ...d.work!, chapter: { ...(d.work?.chapter ?? {}), index: n, title: d.work?.chapter?.title ?? d.title } };
    }
    if (renumbered || ordered.some((d, i) => d !== list[i])) notes.push(`the chapters were put in the order of the canon and numbered by their place in it (${renumbered} renumbered)`);
    return ordered;
  }
  if (kind !== 'documents') return list; // the converter's own numbering (0 = front matter) stands
  const numbers = list.map((d) => d.work?.chapter?.index);
  const contiguousFrom = (start: number) => numbers.every((n, i) => n === start + i);
  if (contiguousFrom(1) || (numbers[0] === 0 && contiguousFrom(0))) return list;
  list.forEach((d, i) => { d.work = { ...d.work!, chapter: { ...(d.work?.chapter ?? {}), index: i + 1, title: d.work?.chapter?.title ?? d.title } }; });
  notes.push(`${list.length === 1 ? 'the one text is chapter 1' : `${list.length} texts numbered 1 … ${list.length} in the order given`} (the source numbered them ${numbers.slice(0, 4).map(String).join(', ')}${numbers.length > 4 ? ', …' : ''})`);
  return list;
}

/** Run the build. Throws `LibraryBuildError` when nothing could be built (nothing is then written). */
export async function buildLibrary(opts: BuildOptions): Promise<BuildResult> {
  const { lang, io } = opts;
  const clock = () => `${opts.date}T00:00:00.000Z`;
  const built: BuiltWork[] = [];
  const refused: Refusal[] = [];
  const provenance: Array<Record<string, unknown>> = [];
  const shards: LibraryShardInfo[] = [];
  const buffers = new Map<string, { rows: CatalogText[]; streams: Set<string>; n: number }>();
  let digest = hash('');
  let texts = 0, words = 0;

  const pending: Array<{ path: string; content: string }> = [];
  const flush = (stream: string, final: boolean) => {
    const b = buffers.get(stream);
    if (!b || !b.rows.length) return;
    if (!final && b.rows.length < SHARD_ROWS) return;
    const file = shardPathOf(stream, b.n++);
    const content = JSON.stringify({ schema: LIBRARY_SCHEMA, rows: b.rows });
    pending.push({ path: file, content });
    digest = hash(digest + hash(content));
    shards.push({ file, stream, streams: [...b.streams].sort(), rows: b.rows.length });
    b.rows = [];
    b.streams = new Set();
  };

  for (const entry of opts.manifest.entries) {
    const reasons = rightsRefusals(entry);
    if (reasons.length) { refused.push({ slug: entry.slug, title: entry.title, reasons }); continue; }
    const notes: string[] = [];
    const got = await documentsOf(entry, opts, notes);
    if ('refuse' in got) { refused.push({ slug: entry.slug, title: entry.title, reasons: got.refuse }); continue; }

    const courseId = entry.courseId ?? courseForLang(lang).id;
    const primary = entry.stream ?? entry.streams?.[0] ?? 'library';
    const allStreams = [...new Set([primary, ...(entry.streams ?? [])])];
    const files: Array<{ path: string; content: string }> = [];
    const rows: CatalogText[] = [];
    let workWords = 0, published = 0;
    let failure: string[] | undefined;

    for (const doc of got.docs) {
      const textId = ids.text(lang, doc.id);
      const mem = createMemoryStore(); // one chapter at a time: nothing of an earlier chapter is kept
      const report = await importDocuments(mem, opts.adapters, [doc], { lexicon: opts.lexicon, clock });
      const r = report.documents[0];
      if (!r || r.action === 'rejected') {
        failure = [`${doc.id}: could not be imported (${(r?.issues ?? []).filter((i) => i.severity === 'error').slice(0, 2).map((i) => i.message).join('; ')})`];
        break;
      }
      const m = await measureStoredText(mem, textId, { analysesOf: groupedAnalysesOf(mem) });
      if (!m) { failure = [`${doc.id}: nothing was stored`]; break; }
      const profile: TextProfile = m.profile;
      const decision = computePublished(doc);
      if (decision.published) published++;
      workWords += profile.words;
      files.push({ path: documentPathOf(textId), content: JSON.stringify(doc) });
      files.push({ path: profilePathOf(textId), content: JSON.stringify(profile) });
      rows.push(compact<CatalogText>({
        id: textId, lang, title: doc.title, workId: ids.work(courseId, entry.slug), chapter: doc.work?.chapter?.index,
        author: entry.author, stream: primary, streams: allStreams.length > 1 ? allStreams : undefined,
        stageId: entry.stage ? (entry.stage.startsWith('stage:') ? entry.stage : ids.stage(courseId, entry.stage)) : undefined,
        domains: entry.domains, variety: entry.variety, region: entry.region, era: entry.era, genre: entry.genre,
        rights: entry.rights.state as RightsState, location: 'library', published: decision.published, features: m.features,
        documentPath: documentPathOf(textId), profilePath: profilePathOf(textId),
      }));
    }
    if (failure) { refused.push({ slug: entry.slug, title: entry.title, reasons: failure }); continue; }

    // the work is whole: now it may be written
    pending.push(...files);
    const buffer = buffers.get(primary) ?? buffers.set(primary, { rows: [], streams: new Set(), n: 0 }).get(primary)!;
    for (const row of rows) {
      buffer.rows.push(row);
      for (const s of allStreams) buffer.streams.add(s);
      if (buffer.rows.length >= SHARD_ROWS) flush(primary, false);
    }
    for (const f of pending.splice(0)) await io.write(f.path, f.content);
    texts += rows.length;
    words += workWords;
    built.push({ slug: entry.slug, title: entry.title, texts: rows.length, words: workWords, published, rights: entry.rights.state as RightsState, quality: got.quality, notes });
    provenance.push({
      slug: entry.slug, title: entry.title, ...(entry.author ? { author: entry.author } : {}), rights: entry.rights, source: { file: entry.source.file, sha256: got.sha256, kind: entry.source.kind ?? 'plain' },
      quality: got.report ?? null, convert: entry.convert ?? null, texts: rows.length, words: workWords, published, notes,
    });
    opts.progress?.(`${entry.slug}: ${rows.length} text(s), ${workWords} words`);
  }

  for (const stream of [...buffers.keys()]) flush(stream, true);
  for (const f of pending.splice(0)) await io.write(f.path, f.content);
  if (!built.length) throw new LibraryBuildError(refused.length
    ? `nothing was built: every entry was refused (${refused.length})\n${refused.map((r) => `  ${r.slug}: ${r.reasons.join('; ')}`).join('\n')}`
    : 'the manifest has no entries');

  const manifest: LibraryManifest = {
    schema: LIBRARY_SCHEMA, lang, id: `library-${lang}@${opts.date}`, builtAt: opts.date, tool: BUILD_TOOL,
    texts, works: built.length, words, digest, shards,
  };
  await io.write(provenancePath, JSON.stringify({ schema: LIBRARY_SCHEMA, lang, id: manifest.id, tool: BUILD_TOOL, works: provenance, refused }));
  await io.write(manifestPath, JSON.stringify(manifest));
  return { manifest, built, refused };
}
