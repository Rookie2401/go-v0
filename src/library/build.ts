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
import type { AdapterRegistry, CatalogText, LanguageAdapter, LanguageCode, LexiconSource, QualityReport, RightsState, TextKind, TextProfile, Work, WorkRights } from '../core';
import { courseForLang, createMemoryStore, hash, ids } from '../core';
import type { CorpusDocument, DocReview } from '../ingest/format';
import type { CurriculumMetadata } from '../course/curriculumPolicy';
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
  curriculum?: CurriculumMetadata;
  /** The rights record. Only its `state` and the facts the gate asks for are read here; nothing is assumed. */
  rights: WorkRights;
  source: {
    /** Path relative to the input directory. */
    file: string;
    /** 'documents': the file is a JSON CorpusDocument (or an array of them) written for the course. Default 'plain'. */
    kind?: BuildSourceKind;
    /** 'documents' only: build just the documents with these ids (several works, each on its own shelf, read one file). */
    only?: string[];
    url?: string;
    edition?: string;
    attribution?: string;
    provenance?: string;
    sourceHash?: string;
    retrievedAt?: string;
    licence?: string;
    modifications?: string;
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
/** Testimony is learner-private by meaning, regardless of the rights label attached to its source. */
const isPrivateDocument = (doc: CorpusDocument): boolean =>
  doc.contentType === 'testimony' || doc.corpus?.kind === 'testimony';

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
  /**
   * The course catalogue's record of a work (by work id): its streams and domains are carried onto every text of the work
   * (the index rows and the documents), so a door that counts texts by stream or domain finds them. Absent: only what the
   * manifest entry says.
   */
  catalogue?: (workId: string) => Pick<Work, 'streams' | 'domains'> | undefined;
  /** A declared sentence of more than this many words that the adapter would cut is cut (default 60); 0 switches it off. */
  maxDeclaredSentenceWords?: number;
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

// ───────────────────────────── placement: streams and domains ─────────────────────────────

export interface Placement { primary: string; streams: string[]; domains: string[] }

/**
 * Where a work's texts are filed: the shelf (primary stream) it is browsed under, every stream it belongs to and its
 * subject domains — the manifest entry's, plus the course catalogue's record of the work. The primary stream is the
 * entry's, unless the catalogue knows streams for the work and the entry's is not one of them (then the catalogue's first).
 */
export function placementOf(entry: Pick<BuildEntry, 'stream' | 'streams' | 'domains'>, work: Pick<Work, 'streams' | 'domains'> | undefined): Placement {
  let primary = entry.stream ?? entry.streams?.[0] ?? 'library';
  if (work?.streams?.length && !work.streams.includes(primary)) primary = work.streams[0];
  const uniq = (xs: Array<string | undefined>) => [...new Set(xs.filter((x): x is string => !!x))];
  return {
    primary,
    streams: uniq([primary, ...(entry.streams ?? []), ...(work?.streams ?? [])]),
    domains: uniq([...(entry.domains ?? []), ...(work?.domains ?? [])]),
  };
}

// ───────────────────────────── titles ─────────────────────────────

/** The closing mark of a quotation pair, with its opening mark: a title may not close a quotation it never opened. */
const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [['„', '“'], ['«', '»'], ['‹', '›'], ['“', '”']];
const countOf = (s: string, ch: string): number => s.split(ch).length - 1;

/**
 * A title as a person would write it: the zero-width marks a source puts inside words (U+200B, U+FEFF; never U+200C/U+200D,
 * which Indic and Persian spelling needs) removed, "#I#" heading markup unwrapped, runs of blanks made one and a page number
 * stuck to the end of a contents line ("… Locura      143") dropped, and a closing quotation mark that closes nothing removed.
 * Never changes a letter.
 */
export function cleanTitle(raw: string): string {
  let t = raw.normalize('NFC').replace(/[\u200B\uFEFF]/g, '');
  t = t.replace(/#([^#\n]+)#/g, '$1').replace(/\s{2,}\d{1,4}\s*$/, '');
  t = t.replace(/\s+/g, ' ').trim();
  for (const [open, close] of QUOTE_PAIRS) {
    if (countOf(t, open) === 0) continue; // a title that never opens this kind of quotation is left as written
    // the English-style pair shares its opener with the German closer: leave a title that uses the German pair alone
    if (open === '“' && countOf(t, '„') > 0) continue;
    let extra = countOf(t, close) - countOf(t, open);
    while (extra > 0) { const i = t.lastIndexOf(close); if (i < 0) break; t = `${t.slice(0, i)}${t.slice(i + 1)}`; extra--; }
  }
  return t.replace(/\s+/g, ' ').trim();
}

/** Titles of one work that are the same get their chapter number: "Azul... — I (15)", so every row of a shelf is its own. */
function distinguishTitles(docs: CorpusDocument[], notes: string[]): void {
  const count = new Map<string, number>();
  for (const d of docs) count.set(d.title, (count.get(d.title) ?? 0) + 1);
  const dup = docs.filter((d) => (count.get(d.title) ?? 0) > 1);
  if (!dup.length) return;
  const taken = new Set(docs.map((d) => d.title));
  for (const d of dup) {
    const n = d.work?.chapter?.index;
    let t = `${d.title} (${n ?? docs.indexOf(d) + 1})`;
    for (let k = 2; taken.has(t); k++) t = `${d.title} (${n ?? docs.indexOf(d) + 1}.${k})`;
    taken.add(t);
    d.title = t;
    if (d.work?.chapter) d.work = { ...d.work, chapter: { ...d.work.chapter, title: t } };
  }
  notes.push(`${dup.length} text(s) with a title another text of the work has were given their chapter number (${dup.slice(0, 2).map((d) => d.title).join('; ')}${dup.length > 2 ? '; …' : ''})`);
}

// ───────────────────────────── sentences ─────────────────────────────

const wordsIn = (adapter: LanguageAdapter, text: string): number => adapter.tokenize(text).filter((t) => t.isWord).length;

/**
 * A work given as documents may have whole paragraphs stored as one declared "sentence" (a Grimm tale of 3,243 words in
 * two). A paragraph holding a declared sentence of more than `maxWords` words that the language adapter would cut is
 * handed back to the adapter as a raw paragraph — exactly how every plain-text work is cut — provided none of its
 * sentences carries anything but its text (an English line, a verse reference, a note or a speaker is never lost: such a
 * paragraph is left as declared). The paragraph's words are untouched: the sentences were joined with the paragraph's
 * separator and the adapter cuts the same text. Returns how many paragraphs were handed back and how many were left.
 */
export function resegmentLongSentences(doc: CorpusDocument, adapter: LanguageAdapter, maxWords: number): { handedBack: number; kept: number } {
  let handedBack = 0, kept = 0;
  if (doc.contentType === 'scripture') return { handedBack, kept }; // a verse is the sentence of Scripture: its references bind it
  if (maxWords <= 0 || doc.notes?.length) return { handedBack, kept: doc.notes?.length ? 1 : 0 };
  for (const sec of doc.sections) {
    sec.paragraphs = sec.paragraphs.map((p) => {
      if (!('sentences' in p)) return p;
      const long = p.sentences.some((s) => wordsIn(adapter, s.text) > maxWords && adapter.segmentSentences(s.text).length > 1);
      if (!long) return p;
      const plain = Object.keys(p).every((k) => k === 'sentences' || (k === 'separator' && (p.separator === undefined || p.separator === ' ')))
        && p.sentences.every((s) => Object.keys(s).every((k) => k === 'text' || k.startsWith('_')));
      if (!plain) { kept++; return p; }
      handedBack++;
      return { text: p.sentences.map((s) => s.text).join(p.separator ?? ' ') };
    });
  }
  return { handedBack, kept };
}

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
    if (entry.source.only) {
      const want = new Set(entry.source.only);
      const missing = entry.source.only.filter((id) => !docs.some((d) => d.id === id));
      if (missing.length) return { refuse: [`source.only names ${missing.length} document(s) the source file does not hold (${missing.slice(0, 3).join(', ')})`] };
      docs = docs.filter((d) => want.has(d.id));
    }
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

  const privateDocs = docs.filter(isPrivateDocument);
  if (privateDocs.length) {
    return { refuse: [`private testimony cannot be built into the shared library (${privateDocs.slice(0, 3).map((d) => d.id).join(', ')})`] };
  }
  if (docs.some(d => d.readingAssessmentId !== undefined || d.curriculum?.role === 'assessment')) {
    return { refuse: ['Protected assessment material cannot be bundled into the ordinary reading library'] };
  }

  const state = entry.rights.state as RightsState;
  const sr = SOURCE_RIGHTS[state]!;
  const reviewApplies = !!entry.review && entry.review.coversSourceSha256 === src.sha256;
  if (entry.review && !reviewApplies) notes.push('the review in the manifest covers a different file than the one built, so the texts are built unreviewed');

  const place = placementOf(entry, opts.catalogue?.(ids.work(courseId, entry.slug)));
  const adapter = opts.adapters.get(opts.lang);
  const maxWords = opts.maxDeclaredSentenceWords ?? 60;
  let handedBack = 0, keptLong = 0, sourceIds = 0;
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
    if (kind === 'documents') {
      // whole paragraphs stored as one "sentence": the adapter cuts them, as it cuts every plain-text work
      const signedBefore = d.review?.contentSignature !== undefined && d.review.contentSignature === contentSignatureOf(d);
      const r = resegmentLongSentences(d, adapter, maxWords);
      handedBack += r.handedBack; keptLong += r.kept;
      // the words are the same: a review that covered them still covers them
      if (r.handedBack && signedBefore && d.review) d.review = { ...d.review, contentSignature: contentSignatureOf(d) };
      // a Scripture chapter is its own source: a stale source id would make it clash with the bundled passage of the same chapter
      if (d.contentType === 'scripture' && d.source && d.source.id !== `src:${opts.lang}:${d.id}`) { d.source = { ...d.source, id: `src:${opts.lang}:${d.id}` }; sourceIds++; }
    }
    const source = kind === 'documents' && d.source ? d.source : {
      id: `src:${opts.lang}:${entry.slug}`, title: entry.title, ...(entry.author ? { author: entry.author } : {}), ...(entry.source.edition ? { edition: entry.source.edition } : {}),
      ...(entry.source.url ? { url: entry.source.url } : {}),
      attribution: entry.source.attribution ?? `${entry.title}${entry.author ? ` — ${entry.author}` : ''}. ${sr.label[0].toUpperCase()}${sr.label.slice(1)}.`,
      provenance: entry.source.provenance
        ?? `Built from ${entry.source.file} (sha256 ${src.sha256.slice(0, 16)}…) by ${BUILD_TOOL}; rights${entry.rights.verifiedBy ? ` verified by ${entry.rights.verifiedBy}` : ' state'}: ${entry.rights.basis ?? sr.label}.`,
      rights: sr.rights,
      sourceHash: src.sha256,
      ...(entry.source.retrievedAt ? { retrievedAt: entry.source.retrievedAt } : {}),
      ...(entry.source.licence ? { licence: entry.source.licence } : {}),
      ...(entry.source.modifications ? { modifications: entry.source.modifications } : {}),
      ...(entry.rights.licensing ? { licenseNote: entry.rights.licensing } : {}),
      authorship: entry.generated && sr.rights === 'owner-authored' ? 'generated' as const : sr.authorship,
    };
    const doc: CorpusDocument = {
      ...d,
      title: cleanTitle(d.title || entry.title),
      contentType: kind === 'documents' ? d.contentType : entry.contentType ?? d.contentType ?? 'story',
      corpus: kind === 'documents' ? d.corpus : { id: `library-${opts.lang}`, kind: 'comprehensible-input', title: 'Library' },
      source,
      generated: entry.generated ?? d.generated ?? false,
      ...(entry.curriculum ? { curriculum: structuredClone(entry.curriculum) } : {}),
      work: { slug: entry.slug, courseId, chapter: chapter.title ? { ...chapter, title: cleanTitle(chapter.title) } : chapter },
      streams: place.streams,
      ...(place.domains.length ? { domains: place.domains } : {}),
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
  if (handedBack) notes.push(`${handedBack} paragraph(s) stored as one very long declared sentence were handed to the language adapter to cut into sentences (no word changed)`);
  if (keptLong) notes.push(`${keptLong} paragraph(s)/text(s) with a very long declared sentence were kept as declared (they carry English lines, notes or references of their own)`);
  if (sourceIds) notes.push(`${sourceIds} Scripture text(s) had a source id that was not their own: it was set to src:${opts.lang}:<text id>`);
  const ordered = inOrder(out, kind, opts, notes);
  distinguishTitles(ordered, notes);
  return { docs: ordered, sha256: src.sha256, quality: report ? report.verdict : 'not checked', report };
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
    const { primary, streams: allStreams, domains: allDomains } = placementOf(entry, opts.catalogue?.(ids.work(courseId, entry.slug)));
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
        domains: allDomains, variety: entry.variety, region: entry.region, era: entry.era, genre: entry.genre,
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
