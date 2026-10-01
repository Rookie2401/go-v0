/**
 * Corpus import format, schema version 2 (`data/corpus/<lang>/*.json`, in-app importer, `npm run corpus:*`).
 *
 * One file = one `Text`. The document carries its own provenance, review state and (for Scripture) its
 * translation identity and verification — the publication gate (`computePublished`) reads exactly these.
 * Sentence and paragraph text is stored EXACTLY as supplied: no NFC, no trimming, no whitespace changes.
 * The full specification, with examples, is `docs/IMPORT.md`; valid templates are in `docs/import/templates`.
 */
import type {
  Authorship, AdapterRegistry, Corpus, LanguageCode, PartOfSpeech, RightsStatus, ReviewStatus, SourceVerification,
  Text, TextKind,
} from '../core';
import { LANGUAGES, LANGUAGE_ROWS } from '../core';
import { analysisCoverage, type AnalysisCoverage } from '../adapters/shared';
import { contentSignatureOf } from './publish';

export const CORPUS_SCHEMA_VERSION = 2 as const;

// ───────────────────────────── document types ─────────────────────────────

export interface CorpusSourceInfo {
  id: string;
  title: string;
  author?: string;
  publisher?: string;
  url?: string;
  edition?: string;
  /** Learner-visible attribution line ("Reina-Valera 1909, public domain"). */
  attribution: string;
  /** Honest statement of where the words came from and what has / has not been checked. */
  provenance: string;
  rights: RightsStatus;
  licenseNote?: string;
  authorship: Authorship;
}

export interface DocReview {
  status: ReviewStatus;
  /** Required when status is 'reviewed' or 'approved': a named person or tool. Never invented. */
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
  /** Which wording the review covers (`contentSignatureOf`); written by `applyReview` / `npm run corpus:review`. Optional. */
  contentSignature?: string;
}

export interface DocScripture {
  /** Stable translation identity, e.g. "spaRV1909". */
  translationId: string;
  /** Human-readable translation name → Text.version, e.g. "Reina-Valera 1909". */
  translationName: string;
  edition: string;
  /** USFM book code of the (first) book and its first chapter; every sentence's verseRefs carry the real reference. */
  book: string;
  chapter: number;
  /** How the exact wording was established (see data/verified/scripture.json). Absent ⇒ never published. */
  verification?: SourceVerification;
}

export interface DocSpan {
  /** Offsets into the sentence text (UTF-16 code units); must be the exact bounds of one token. */
  start: number;
  end: number;
  lemma?: string;
  pos?: PartOfSpeech;
  morph?: Record<string, string>;
  gloss?: string;
  /** Omitted ⇒ the author asserts the analysis (stored as 1). */
  confidence?: number;
  alternatives?: Array<{ lemma?: string; pos?: PartOfSpeech; morph?: Record<string, string>; confidence: number }>;
}

/** A reviewed human analysis (stored as provenance `human`, superseding the machine/lexicon row). */
export interface DocCorrection {
  start: number;
  end: number;
  lemma?: string;
  pos?: PartOfSpeech;
  morph?: Record<string, string>;
  gloss?: string;
  by: string;
  at: string;
}

export interface DocSentence {
  /** Optional author id (stable sentence key). Without it the key is a hash of the exact text. */
  id?: string;
  /** Exact display text. Never modified by processing. */
  text: string;
  english?: string;
  /** Scripture: USFM references this sentence carries, e.g. ["1JN.1.9"]. Several sentences may share a verse and a sentence may span verses. */
  verseRefs?: string[];
  /** Dialogue speaker id (a key of `speakers`). Not part of `text`. */
  speaker?: string;
  spans?: DocSpan[];
  corrections?: DocCorrection[];
}

/** A paragraph whose sentences are declared one by one. `separator` joins them into Paragraph.originalText (default " "). */
export interface DocParagraphSentences { sentences: DocSentence[]; separator?: string }
/** A paragraph of raw prose the adapter segments; `english` (if given) has exactly one entry per resulting sentence. */
export interface DocParagraphRaw { text: string; english?: string[]; verseRefs?: string[] }
export type DocParagraph = DocParagraphSentences | DocParagraphRaw;

export interface DocSection {
  title?: string;
  /** Scripture chapter number of this section. */
  chapter?: number;
  paragraphs: DocParagraph[];
}

export interface CorpusDocument {
  schemaVersion: typeof CORPUS_SCHEMA_VERSION;
  /** Stable id (slug); the text id is `text:<lang>:<id>`. */
  id: string;
  lang: LanguageCode;
  locale?: string;
  title: string;
  contentType: TextKind;
  corpus: Pick<Corpus, 'id' | 'kind' | 'title'>;
  source: CorpusSourceInfo;
  review: DocReview;
  difficulty?: NonNullable<Text['staticLevel']>;
  /** Learner-facing topics / pathways. Never editorial state. */
  topics: string[];
  /** Editorial tags ("needs-native-review", "machine-drafted"). */
  editorialTags: string[];
  /** Scripture refs ("1JN.1.9") or text ids this text helps prepare. */
  prepTargets: string[];
  speakers?: Record<string, string>;
  /** Machine-generated text must say so (the reader badges it). Never true for scripture. */
  generated: boolean;
  scripture?: DocScripture;
  /** Provenance of the English rescue lines; required when any English is supplied. */
  english?: { source: string };
  sections: DocSection[];
  /** Ignored by the validator (templates use it for inline comments). */
  _comment?: unknown;
}

// ───────────────────────────── validation types ─────────────────────────────

export type IssueSeverity = 'error' | 'warning';

export type ValidationCode =
  | 'not-an-object' | 'unsupported-schema-version' | 'missing-field' | 'invalid-value' | 'invalid-id' | 'unknown-field'
  | 'duplicate-document-id' | 'duplicate-sentence-id' | 'text-id-conflict'
  | 'language-mismatch' | 'locale-mismatch'
  | 'empty-sentence' | 'no-sentences' | 'english-count-mismatch' | 'unknown-speaker'
  | 'span-empty' | 'span-out-of-bounds' | 'span-overlap' | 'span-not-grapheme-boundary' | 'span-not-on-token'
  | 'invalid-verse-ref' | 'verse-order' | 'verse-chapter-mismatch' | 'missing-verse-refs' | 'verse-marker-in-text'
  | 'scripture-translation-missing' | 'scripture-edition-missing' | 'scripture-book-invalid' | 'scripture-chapter-invalid'
  | 'scripture-corpus' | 'scripture-generated' | 'invalid-verification'
  | 'missing-provenance' | 'unverified-without-note' | 'review-missing-reviewer'
  | 'review-signature-mismatch' | 'not-nfc' | 'edge-whitespace' | 'adapter-would-split' | 'low-analysis-coverage';

export interface ValidationIssue {
  /** JSON path of the offending value, e.g. `sections[0].paragraphs[1].sentences[2].spans[0]`. */
  path: string;
  code: ValidationCode;
  message: string;
  /** What to do about it. */
  hint: string;
  severity: IssueSeverity;
}

export interface ValidateContext {
  registry: AdapterRegistry;
  /** Texts already in the store: a document whose text id exists under ANOTHER source id is a conflict. */
  existingTexts?: ReadonlyArray<{ id: string; sourceId: string }>;
}

export class CorpusValidationError extends Error {
  readonly problems: string[];
  constructor(readonly slug: string, readonly issues: ValidationIssue[]) {
    const errs = issues.filter((i) => i.severity === 'error');
    super(`invalid corpus document "${slug}": ${errs.map((i) => `${i.path || '(document)'}: ${i.message}`).join('; ')}`);
    this.name = 'CorpusValidationError';
    this.problems = errs.map((i) => `${i.path || '(document)'}: ${i.message}`);
  }
}

// ───────────────────────────── constants ─────────────────────────────

const RIGHTS: readonly RightsStatus[] = ['public-domain', 'licensed', 'owner-authored', 'generated', 'user-private', 'unverified'];
const AUTHORSHIP: readonly Authorship[] = ['human', 'public-domain', 'licensed', 'generated', 'learner'];
const KINDS: readonly TextKind[] = ['story', 'dialogue', 'nonfiction', 'scripture', 'transcript', 'testimony', 'generated-prep'];
const CORPUS_KINDS: readonly Corpus['kind'][] = ['comprehensible-input', 'scripture', 'testimony'];
const REVIEWS: readonly ReviewStatus[] = ['unreviewed', 'in-review', 'reviewed', 'approved', 'rejected'];
const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'native'];
const VERIFY_METHODS = ['byte-comparison', 'human-proofread', 'publisher-file'];
const POS: readonly PartOfSpeech[] = [
  'NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CONJ', 'SCONJ', 'PART', 'NUM', 'INTJ', 'CLF', 'PUNCT', 'X',
];
export const USFM_BOOKS: readonly string[] = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA',
  'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC',
  'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM',
  'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
  // deuterocanon
  'TOB', 'JDT', 'ESG', 'WIS', 'SIR', 'BAR', 'LJE', 'S3Y', 'SUS', 'BEL', '1MA', '2MA', '3MA', '4MA', '1ES', '2ES', 'MAN', 'PS2', 'ODA',
];
const VERSE_REF = /^([1-3A-Z][A-Z0-9]{2})\.(\d+)\.(\d+)$/;
/** Verse-number residue that must never be inside a sentence: [16], <sup>16</sup>, superscript digits. */
const VERSE_MARKER = /\[\s*\d+(?:\s*[-–,]\s*\d+)*\s*\]|<sup>|[²³¹⁰⁴-⁹]/u;
const DOC_ID = /^[a-z0-9][a-z0-9-]*$/;
const SENTENCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

const DOC_KEYS = ['schemaVersion', 'id', 'lang', 'locale', 'title', 'contentType', 'corpus', 'source', 'review', 'difficulty', 'topics', 'editorialTags', 'prepTargets', 'speakers', 'generated', 'scripture', 'english', 'sections'];
const SOURCE_KEYS = ['id', 'title', 'author', 'publisher', 'url', 'edition', 'attribution', 'provenance', 'rights', 'licenseNote', 'authorship'];
const SENTENCE_KEYS = ['id', 'text', 'english', 'verseRefs', 'speaker', 'spans', 'corrections'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

export const parseVerseRef = (ref: string): { book: string; chapter: number; verse: number } | undefined => {
  const m = VERSE_REF.exec(ref);
  return m ? { book: m[1], chapter: Number(m[2]), verse: Number(m[3]) } : undefined;
};

// ───────────────────────────── validation ─────────────────────────────

export interface DocumentValidation {
  issues: ValidationIssue[];
  /** Analysis coverage over the whole document (absent when the document is too broken to tokenize). */
  coverage?: AnalysisCoverage;
}

/** Validation issues only. See `validateDocumentDetailed` for the coverage as well. */
export function validateDocument(input: unknown, ctx: ValidateContext): ValidationIssue[] {
  return validateDocumentDetailed(input, ctx).issues;
}

const graphemeSegmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
const graphemeBoundaries = (text: string): Set<number> => {
  const out = new Set<number>([text.length]);
  for (const s of graphemeSegmenter.segment(text)) out.add(s.index);
  return out;
};

/**
 * Structural, provenance, alignment and language validation. Returns every issue found; a document with no
 * `error` issues can be imported. Warnings (text not NFC, edge whitespace, low analysis coverage) never block.
 */
export function validateDocumentDetailed(input: unknown, ctx: ValidateContext): DocumentValidation {
  const issues: ValidationIssue[] = [];
  const add = (severity: IssueSeverity, path: string, code: ValidationCode, message: string, hint: string) =>
    issues.push({ path, code, message, hint, severity });
  const err = (path: string, code: ValidationCode, message: string, hint: string) => add('error', path, code, message, hint);
  const warn = (path: string, code: ValidationCode, message: string, hint: string) => add('warning', path, code, message, hint);
  const required = (path: string, what: string, hint = `Add "${what}" — see docs/IMPORT.md.`) => err(path, 'missing-field', `${what} is required`, hint);

  if (!isObj(input)) {
    err('', 'not-an-object', 'the document is not a JSON object', 'A corpus file is one JSON object; see docs/import/templates.');
    return { issues };
  }
  const d = input;

  // schema version first: everything else is interpreted under it
  if (d.schemaVersion !== CORPUS_SCHEMA_VERSION) {
    err('schemaVersion', 'unsupported-schema-version',
      d.schemaVersion === undefined
        ? (d.formatVersion === 1 ? 'this is a version 1 document (formatVersion: 1); only schemaVersion 2 can be imported' : 'schemaVersion is missing; only schemaVersion 2 can be imported')
        : `schemaVersion ${JSON.stringify(d.schemaVersion)} is not supported; only schemaVersion 2 can be imported`,
      'Convert a version 1 file with `npm run corpus:migrate` (bundled corpus) or follow docs/IMPORT.md and start from a template in docs/import/templates.');
    return { issues };
  }

  for (const k of Object.keys(d)) {
    if (!DOC_KEYS.includes(k) && !k.startsWith('_')) warn(k, 'unknown-field', `unknown field "${k}" is ignored`, 'Check the spelling against docs/IMPORT.md; prefix a comment field with "_" to silence this.');
  }

  // identity
  if (!isStr(d.id)) required('id', 'id', 'Give the document a stable id such as "story-01"; it becomes the text id text:<lang>:<id>.');
  else if (!DOC_ID.test(d.id)) err('id', 'invalid-id', `id "${d.id}" is not a valid id`, 'Use lower-case letters, digits and hyphens, starting with a letter or digit (e.g. "story-01").');
  const lang = (LANGUAGES as readonly unknown[]).includes(d.lang) ? (d.lang as LanguageCode) : undefined;
  if (!lang) err('lang', 'invalid-value', `lang must be one of ${LANGUAGES.join(', ')}`, 'Set lang to the two-letter course language code.');
  if (d.locale !== undefined) {
    if (typeof d.locale !== 'string' || !LOCALE.test(d.locale)) err('locale', 'invalid-value', 'locale must be a BCP-47 tag such as "es-HN"', 'Use language[-REGION], e.g. "es-HN" or "de-DE", or omit it.');
    else if (lang && d.locale.split('-')[0] !== lang) err('locale', 'locale-mismatch', `locale "${d.locale}" does not start with lang "${lang}"`, `Use a locale beginning with "${lang}-" or correct lang.`);
  }
  if (!isStr(d.title)) required('title', 'title');
  if (!(KINDS as readonly unknown[]).includes(d.contentType)) err('contentType', 'invalid-value', `contentType must be one of ${KINDS.join(', ')}`, 'Set contentType to the kind of text.');
  if (typeof d.generated !== 'boolean') err('generated', 'missing-field', 'generated must be true or false', 'Say whether the text was machine generated; generated text is badged in the reader.');
  for (const key of ['topics', 'editorialTags', 'prepTargets'] as const) {
    if (!Array.isArray(d[key]) || (d[key] as unknown[]).some((t) => typeof t !== 'string')) err(key, 'missing-field', `${key} must be an array of strings`, `Add "${key}": [] (an empty array is fine).`);
  }
  if (d.difficulty !== undefined && !LEVELS.includes(d.difficulty as string)) err('difficulty', 'invalid-value', `difficulty must be one of ${LEVELS.join(', ')}`, 'Use a CEFR-style label or omit it.');

  // corpus
  const corpus = d.corpus;
  if (!isObj(corpus) || !isStr(corpus.id) || !isStr(corpus.title) || !(CORPUS_KINDS as readonly unknown[]).includes(corpus.kind)) {
    err('corpus', 'invalid-value', 'corpus must be {id, kind, title}', `kind is one of ${CORPUS_KINDS.join(', ')}.`);
  }

  // source
  const src = d.source;
  let provenanceText = '';
  if (!isObj(src)) required('source', 'source');
  else {
    for (const k of Object.keys(src)) if (!SOURCE_KEYS.includes(k) && !k.startsWith('_')) warn(`source.${k}`, 'unknown-field', `unknown source field "${k}" is ignored`, 'Check the spelling against docs/IMPORT.md.');
    if (!isStr(src.id)) required('source.id', 'source.id');
    if (!isStr(src.title)) required('source.title', 'source.title');
    if (!isStr(src.attribution)) required('source.attribution', 'source.attribution', 'Write the learner-visible credit line, e.g. "Reina-Valera 1909, public domain".');
    if (!isStr(src.provenance)) err('source.provenance', 'missing-provenance', 'source.provenance is required',
      d.contentType === 'scripture' ? 'State exactly where the wording came from and how it was checked against that source.' : 'State honestly where the text came from (who wrote it, how) and what has not been checked.');
    else provenanceText = src.provenance;
    if (!(RIGHTS as readonly unknown[]).includes(src.rights)) err('source.rights', 'invalid-value', `source.rights must be one of ${RIGHTS.join(', ')}`, 'Say what you know about the rights; use "unverified" if you do not know.');
    if (!(AUTHORSHIP as readonly unknown[]).includes(src.authorship)) err('source.authorship', 'invalid-value', `source.authorship must be one of ${AUTHORSHIP.join(', ')}`, 'Say who wrote the words.');
    if (src.rights === 'unverified' && !/unverified|replace|verify/i.test(`${provenanceText} ${typeof src.licenseNote === 'string' ? src.licenseNote : ''}`)) {
      err('source.rights', 'unverified-without-note', 'rights "unverified" needs a note saying the text must be replaced or verified before release',
        'Add a sentence to source.provenance (or licenseNote) such as "unverified sample — replace with a licensed text before release".');
    }
  }

  // review
  const review = d.review;
  if (!isObj(review)) required('review', 'review', 'Add "review": {"status": "unreviewed"} — reviewers record themselves here (see docs/IMPORT.md).');
  else {
    if (!(REVIEWS as readonly unknown[]).includes(review.status)) err('review.status', 'invalid-value', `review.status must be one of ${REVIEWS.join(', ')}`, 'Use "unreviewed" until a named person has checked the text.');
    else if ((review.status === 'reviewed' || review.status === 'approved') && !isStr(review.reviewedBy)) {
      err('review.reviewedBy', 'review-missing-reviewer', `review.status "${review.status}" needs review.reviewedBy`, 'Name the person (or verification tool) that reviewed the text, plus reviewedAt; reviews are never anonymous.');
    }
    for (const k of ['reviewedBy', 'reviewedAt', 'notes', 'contentSignature'] as const) if (review[k] !== undefined && typeof review[k] !== 'string') err(`review.${k}`, 'invalid-value', `review.${k} must be a string`, 'Use plain text.');
  }

  if (isObj(review) && typeof review.contentSignature === 'string' && d.contentType !== 'scripture' && Array.isArray(d.sections) && review.contentSignature !== contentSignatureOf(d)) {
    warn('review.contentSignature', 'review-signature-mismatch', 'the text changed after it was reviewed: review.contentSignature does not match the current wording',
      'The text will not publish until it is reviewed again: run npm run corpus:review -- <file> --by "<name>" (it records the new signature).');
  }

  // speakers
  const speakers = d.speakers;
  if (speakers !== undefined && (!isObj(speakers) || Object.entries(speakers).some(([k, n]) => !k.startsWith('_') && !isStr(n)))) err('speakers', 'invalid-value', 'speakers must map speaker ids to display names', 'e.g. {"A": "Ana", "B": "Pedro"}');

  // english provenance
  if (d.english !== undefined && (!isObj(d.english) || !isStr(d.english.source))) err('english', 'invalid-value', 'english must be {"source": "…"}', 'Say where the English rescue lines came from.');

  // scripture
  const scripture = d.contentType === 'scripture';
  if (scripture) {
    if (isObj(corpus) && corpus.kind !== 'scripture') err('corpus.kind', 'scripture-corpus', 'a scripture text must use a corpus of kind "scripture"', 'Set corpus.kind to "scripture".');
    if (d.generated === true || (isObj(src) && (src.rights === 'generated' || src.authorship === 'generated'))) {
      err('generated', 'scripture-generated', 'scripture can never be generated', 'Scripture must be the published wording of an identified translation; remove generated/authorship "generated".');
    }
    const sc = d.scripture;
    if (!isObj(sc)) err('scripture', 'scripture-translation-missing', 'scripture texts need a "scripture" block identifying the translation', 'Add scripture {translationId, translationName, edition, book, chapter, verification?}.');
    else {
      if (!isStr(sc.translationId) || !isStr(sc.translationName)) err('scripture.translationId', 'scripture-translation-missing', 'scripture.translationId and scripture.translationName are required', 'Identify the exact translation (e.g. "spaRV1909" / "Reina-Valera 1909"); use "unidentified" only for a sample whose translation is not known.');
      if (!isStr(sc.edition)) err('scripture.edition', 'scripture-edition-missing', 'scripture.edition is required', 'Name the edition (e.g. "1909 revision").');
      if (!isStr(sc.book) || !USFM_BOOKS.includes(sc.book)) err('scripture.book', 'scripture-book-invalid', `scripture.book "${String(sc.book)}" is not a USFM book code`, 'Use a USFM code such as "JHN" or "1JN".');
      if (!isInt(sc.chapter) || sc.chapter < 1) err('scripture.chapter', 'scripture-chapter-invalid', 'scripture.chapter must be a positive integer', 'Give the first chapter number of the text.');
      if (sc.verification !== undefined) {
        const v = sc.verification;
        if (!isObj(v) || !isStr(v.against) || !isStr(v.checkedAt) || !isStr(v.by) || !VERIFY_METHODS.includes(v.method as string)) {
          err('scripture.verification', 'invalid-verification', 'scripture.verification must be {against, checkedAt, method, by}', `method is one of ${VERIFY_METHODS.join(', ')}; run scripts/verify-scripture.mjs to produce one.`);
        }
      }
    }
  } else if (d.scripture !== undefined) {
    warn('scripture', 'unknown-field', 'scripture block on a non-scripture text is ignored', 'Remove it or set contentType to "scripture".');
  }

  // sections
  if (!Array.isArray(d.sections) || d.sections.length === 0) {
    err('sections', 'missing-field', 'sections must be a non-empty array', 'Add at least one section with one paragraph.');
    return { issues };
  }
  const adapter = lang ? ctx.registry.get(lang) : undefined;
  const scriptRe = lang ? { Latn: /\p{Script=Latin}/u, Deva: /\p{Script=Devanagari}/u, Thai: /\p{Script=Thai}/u }[LANGUAGE_ROWS.find((r) => r.id === lang)!.script] : undefined;
  const speakerIds = isObj(speakers) ? new Set(Object.keys(speakers).filter((k) => !k.startsWith('_'))) : new Set<string>();
  const seenIds = new Map<string, string>();
  let sentenceCount = 0;
  let letters = 0;
  let inScript = 0;
  let wordsTotal = 0;
  let analysedTotal = 0;
  const unknownForms = new Set<string>();
  const verseLast = new Map<string, [number, number]>(); // book → last (chapter, verse)

  const checkVerseRefs = (refs: unknown, path: string, sectionChapter: number | undefined) => {
    if (!Array.isArray(refs) || refs.length === 0) {
      if (scripture) err(path, 'missing-verse-refs', 'a scripture sentence needs verseRefs', 'Add verseRefs such as ["JHN.3.16"]; verse numbers are metadata, never part of the text.');
      else if (refs !== undefined) err(path, 'invalid-verse-ref', 'verseRefs must be a non-empty array of USFM references', 'Use ["JHN.3.16"].');
      return;
    }
    let prev: [number, number] | undefined;
    let prevBook: string | undefined;
    refs.forEach((r, k) => {
      const parsed = typeof r === 'string' ? parseVerseRef(r) : undefined;
      if (!parsed || !USFM_BOOKS.includes(parsed.book)) {
        err(`${path}[${k}]`, 'invalid-verse-ref', `"${String(r)}" is not a valid USFM verse reference`, 'Use BOOK.chapter.verse with a USFM book code, e.g. "JHN.3.16" or "1JN.1.9".');
        return;
      }
      if (sectionChapter !== undefined && parsed.chapter !== sectionChapter) {
        err(`${path}[${k}]`, 'verse-chapter-mismatch', `"${String(r)}" is in chapter ${parsed.chapter} but its section declares chapter ${sectionChapter}`, 'Put the sentence in the section of its chapter, or correct section.chapter.');
      }
      if (prev && prevBook === parsed.book && (parsed.chapter < prev[0] || (parsed.chapter === prev[0] && parsed.verse < prev[1]))) {
        err(`${path}[${k}]`, 'verse-order', `"${String(r)}" comes before the previous reference in the same sentence`, 'List a sentence\'s verseRefs in reading order.');
      }
      prev = [parsed.chapter, parsed.verse];
      prevBook = parsed.book;
      const last = verseLast.get(parsed.book);
      if (last && (parsed.chapter < last[0] || (parsed.chapter === last[0] && parsed.verse < last[1]))) {
        err(`${path}[${k}]`, 'verse-order', `"${String(r)}" is out of order within ${parsed.book} (after ${parsed.book}.${last[0]}.${last[1]})`, 'Within a book, sentences must follow chapter and verse order; several sentences may share a verse.');
      } else verseLast.set(parsed.book, [parsed.chapter, parsed.verse]);
    });
  };

  const checkSpans = (list: unknown, path: string, text: string, kind: 'spans' | 'corrections') => {
    if (!Array.isArray(list)) { err(path, 'invalid-value', `${kind} must be an array`, 'See docs/IMPORT.md for the span format.'); return; }
    const bounds = graphemeBoundaries(text);
    const tokens = adapter ? adapter.tokenize(text) : [];
    const spans: Array<{ start: number; end: number; index: number }> = [];
    list.forEach((sp, k) => {
      const p = `${path}[${k}]`;
      if (!isObj(sp)) { err(p, 'invalid-value', `${kind}[${k}] is not an object`, 'Use {start, end, lemma?, pos?, morph?, gloss?, …}.'); return; }
      if (!isInt(sp.start) || !isInt(sp.end)) { err(p, 'invalid-value', 'start and end must be integers (UTF-16 offsets into the sentence text)', 'Offsets count UTF-16 code units: text.slice(start, end) is the word.'); return; }
      if (sp.end <= sp.start) { err(p, 'span-empty', `span [${sp.start}, ${sp.end}) is empty`, 'end must be greater than start.'); return; }
      if (sp.start < 0 || sp.end > text.length) { err(p, 'span-out-of-bounds', `span [${sp.start}, ${sp.end}) is outside the sentence (length ${text.length})`, 'Offsets must lie within the sentence text.'); return; }
      if (!bounds.has(sp.start) || !bounds.has(sp.end)) { err(p, 'span-not-grapheme-boundary', `span [${sp.start}, ${sp.end}) splits a character cluster`, 'A span must start and end between user-perceived characters; do not cut inside a letter with its marks or a conjunct.'); return; }
      if (tokens.length && !tokens.some((t) => t.start === sp.start && t.end === sp.end)) {
        err(p, 'span-not-on-token', `span [${sp.start}, ${sp.end}) "${text.slice(sp.start, sp.end)}" is not exactly one word`,
          `A span annotates one word. Words here: ${tokens.filter((t) => t.isWord).slice(0, 12).map((t) => `[${t.start},${t.end}) ${t.surface}`).join(', ')}${tokens.length > 12 ? ', …' : ''}`);
        return;
      }
      const bad = (what: string, hint: string) => err(p, 'invalid-value', what, hint);
      if (sp.lemma !== undefined && !isStr(sp.lemma)) bad('lemma must be a non-empty string', 'Give the dictionary form or remove lemma.');
      if (sp.pos !== undefined && !(POS as readonly unknown[]).includes(sp.pos)) bad(`pos must be one of ${POS.join(', ')}`, 'Use a Universal-Dependencies-style tag.');
      if (sp.gloss !== undefined && !isStr(sp.gloss)) bad('gloss must be a non-empty string', 'Give the contextual English meaning or remove gloss.');
      if (sp.morph !== undefined && (!isObj(sp.morph) || Object.values(sp.morph).some((x) => typeof x !== 'string'))) bad('morph must map feature names to strings', 'e.g. {"Tense": "Past", "Number": "Sing"}');
      if (kind === 'spans' && sp.confidence !== undefined && !(typeof sp.confidence === 'number' && sp.confidence >= 0 && sp.confidence <= 1)) bad('confidence must be a number from 0 to 1', 'Omit it if you are certain.');
      if (kind === 'corrections') {
        if (!isStr(sp.by)) required(`${p}.by`, 'by (who made the correction)');
        if (!isStr(sp.at)) required(`${p}.at`, 'at (when, an ISO date)');
      }
      if (sp.lemma === undefined && sp.pos === undefined && sp.morph === undefined && sp.gloss === undefined) bad('the entry carries no analysis', 'Add lemma, pos, morph or gloss.');
      spans.push({ start: sp.start, end: sp.end, index: k });
    });
    const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
    for (let k = 1; k < sorted.length; k++) {
      const a = sorted[k - 1], b = sorted[k];
      const identical = a.start === b.start && a.end === b.end;
      if (b.start < a.end && (kind === 'spans' || !identical)) {
        err(`${path}[${b.index}]`, 'span-overlap', `span [${b.start}, ${b.end}) overlaps [${a.start}, ${a.end})`, 'Spans must not overlap; annotate each word once.');
      }
    }
  };

  const checkSentence = (s: Record<string, unknown>, text: unknown, path: string, sectionChapter: number | undefined) => {
    sentenceCount++;
    if (typeof text !== 'string' || text.trim().length === 0) { err(`${path}.text`, 'empty-sentence', 'sentence text is missing or blank', 'Every sentence needs text; remove empty entries.'); return; }
    if (text !== text.normalize('NFC')) { warn(`${path}.text`, 'not-nfc', 'text is not in Unicode NFC (stored exactly as supplied)', 'Usually harmless; matching uses the normalized form. Re-save the file as NFC if the composed/decomposed difference matters to you.'); }
    if (text !== text.trim()) warn(`${path}.text`, 'edge-whitespace', 'text has leading or trailing whitespace (stored exactly as supplied)', 'Trim it unless the whitespace is deliberate.');
    if (scripture && VERSE_MARKER.test(text)) err(`${path}.text`, 'verse-marker-in-text', 'the text contains a verse marker', 'Verse numbers are metadata: remove [16] / ¹⁶ / <sup> from the text and list the reference in verseRefs.');
    if (s.english !== undefined && !isStr(s.english)) err(`${path}.english`, 'invalid-value', 'english must be a non-empty string when present', 'Remove it or supply the English.');
    if (s.id !== undefined) {
      if (typeof s.id !== 'string' || !SENTENCE_ID.test(s.id)) err(`${path}.id`, 'invalid-id', `sentence id ${JSON.stringify(s.id)} is not valid`, 'Use letters, digits, ".", "_" or "-" (no "/", "@" or "~"), starting with a letter or digit.');
      else if (seenIds.has(s.id)) err(`${path}.id`, 'duplicate-sentence-id', `sentence id "${s.id}" is already used at ${seenIds.get(s.id)}`, 'Sentence ids must be unique within a document.');
      else seenIds.set(s.id, path);
    }
    if (s.speaker !== undefined && (typeof s.speaker !== 'string' || !speakerIds.has(s.speaker))) {
      err(`${path}.speaker`, 'unknown-speaker', `speaker ${JSON.stringify(s.speaker)} is not declared in "speakers"`, 'Declare every speaker id in the document-level speakers map.');
    }
    if (scripture || s.verseRefs !== undefined) checkVerseRefs(s.verseRefs, `${path}.verseRefs`, sectionChapter);
    if (s.spans !== undefined) checkSpans(s.spans, `${path}.spans`, text, 'spans');
    if (s.corrections !== undefined) checkSpans(s.corrections, `${path}.corrections`, text, 'corrections');
    if (scriptRe) for (const ch of text) { if (/\p{L}/u.test(ch)) { letters++; if (scriptRe.test(ch)) inScript++; } }
  };

  const tally = (text: string) => {
    if (!adapter) return;
    const toks = adapter.tokenize(text);
    const cov = analysisCoverage(toks, adapter.analyze(toks));
    wordsTotal += cov.words;
    analysedTotal += cov.analysed;
    for (const u of cov.unanalysed) unknownForms.add(u);
  };

  (d.sections as unknown[]).forEach((sec, si) => {
    const sp = `sections[${si}]`;
    if (!isObj(sec) || !Array.isArray(sec.paragraphs) || sec.paragraphs.length === 0) { err(`${sp}.paragraphs`, 'missing-field', 'each section needs a non-empty paragraphs array', 'Add at least one paragraph.'); return; }
    if (sec.chapter !== undefined && !(isInt(sec.chapter) && sec.chapter >= 1)) err(`${sp}.chapter`, 'invalid-value', 'section.chapter must be a positive integer', 'Use the chapter number or omit it.');
    const sectionChapter = isInt(sec.chapter) ? sec.chapter : undefined;
    sec.paragraphs.forEach((par, pi) => {
      const pp = `${sp}.paragraphs[${pi}]`;
      if (!isObj(par)) { err(pp, 'invalid-value', 'paragraph is not an object', 'Use {"sentences": […]} or {"text": "…"}.'); return; }
      if (Array.isArray(par.sentences)) {
        if (par.sentences.length === 0) err(`${pp}.sentences`, 'no-sentences', 'sentences is empty', 'Remove the paragraph or add sentences.');
        if (par.separator !== undefined && typeof par.separator !== 'string') err(`${pp}.separator`, 'invalid-value', 'separator must be a string', 'Use " " (default), "" or "\\n".');
        par.sentences.forEach((s, k) => {
          const w = `${pp}.sentences[${k}]`;
          if (!isObj(s)) { err(w, 'invalid-value', 'sentence is not an object', 'Use {"text": "…", "english": "…"}.'); return; }
          for (const key of Object.keys(s)) if (!SENTENCE_KEYS.includes(key) && !key.startsWith('_')) warn(`${w}.${key}`, 'unknown-field', `unknown sentence field "${key}" is ignored`, 'Check the spelling against docs/IMPORT.md.');
          checkSentence(s, s.text, w, sectionChapter);
          if (typeof s.text === 'string' && s.text.trim()) {
            tally(s.text);
            if (adapter && adapter.segmentSentences(s.text).length > 1) warn(`${w}.text`, 'adapter-would-split', 'the language adapter would split this declared sentence into several', 'Your declaration wins, but check that this is one sentence (abbreviations, quotations, verse-length sentences are fine).');
          }
        });
      } else if (typeof par.text === 'string') {
        if (par.text.trim().length === 0) { err(`${pp}.text`, 'empty-sentence', 'paragraph text is blank', 'Remove it.'); return; }
        if (par.text !== par.text.normalize('NFC')) warn(`${pp}.text`, 'not-nfc', 'text is not in Unicode NFC (stored exactly as supplied)', 'Usually harmless.');
        if (par.text !== par.text.trim()) warn(`${pp}.text`, 'edge-whitespace', 'text has leading or trailing whitespace (stored exactly as supplied)', 'Trim it unless the whitespace is deliberate.');
        const spans = adapter ? adapter.segmentSentences(par.text) : [];
        if (scripture && VERSE_MARKER.test(par.text)) err(`${pp}.text`, 'verse-marker-in-text', 'the text contains a verse marker', 'Verse numbers are metadata: remove them and use verseRefs.');
        if (adapter) {
          sentenceCount += spans.length;
          if (par.english !== undefined) {
            if (!Array.isArray(par.english) || par.english.some((e) => !isStr(e))) err(`${pp}.english`, 'invalid-value', 'english must be an array of non-empty strings', 'One entry per sentence.');
            else if (par.english.length !== spans.length) err(`${pp}.english`, 'english-count-mismatch', `the adapter split the text into ${spans.length} sentence(s) but english has ${par.english.length}`,
              `Supply exactly ${spans.length} English line(s), or declare the sentences one by one with "sentences". The adapter found: ${spans.map((x) => JSON.stringify(x.text)).join(' | ').slice(0, 300)}`);
          }
          spans.forEach((x) => tally(x.text));
          for (const x of spans) if (scriptRe) for (const ch of x.text) if (/\p{L}/u.test(ch)) { letters++; if (scriptRe.test(ch)) inScript++; }
        } else sentenceCount++;
        if (scripture || par.verseRefs !== undefined) checkVerseRefs(par.verseRefs, `${pp}.verseRefs`, sectionChapter);
      } else err(pp, 'invalid-value', 'a paragraph needs either "sentences" or "text"', 'Use {"sentences": […]} or {"text": "…"}.');
    });
  });
  if (sentenceCount === 0) err('sections', 'no-sentences', 'the document has no sentences', 'Add sentences to at least one paragraph.');

  if (lang && letters > 0 && inScript / letters < 0.5) {
    // a learner's private writing may legitimately mix languages: report, never block
    add(d.contentType === 'testimony' ? 'warning' : 'error', 'lang', 'language-mismatch', `only ${Math.round((100 * inScript) / letters)}% of the letters are in the script of "${lang}"`, `The text does not look like ${LANGUAGE_ROWS.find((r) => r.id === lang)!.name}; correct lang or the text.`);
  }

  // batch-independent store conflict
  if (isStr(d.id) && lang && isObj(src) && isStr(src.id)) {
    const textId = `text:${lang}:${d.id}`;
    const clash = ctx.existingTexts?.find((t) => t.id === textId && t.sourceId !== src.id);
    if (clash) err('id', 'text-id-conflict', `text ${textId} already exists under another source ("${clash.sourceId}")`, 'Choose a different id, or use the same source.id to update that text.');
  }

  let coverage: AnalysisCoverage | undefined;
  if (adapter) {
    coverage = { words: wordsTotal, analysed: analysedTotal, coverage: wordsTotal ? analysedTotal / wordsTotal : 1, unanalysed: [...unknownForms] };
    if (wordsTotal > 0 && coverage.coverage < 0.6) {
      warn('', 'low-analysis-coverage', `only ${Math.round(coverage.coverage * 100)}% of the words can be analysed (${analysedTotal}/${wordsTotal})`,
        'The text imports and reads fine, but word help will be missing for unknown words. Add spans to the sentences (docs/IMPORT.md) or extend the language lexicon.');
    }
  }
  return { issues, coverage };
}

export interface BatchValidation {
  ok: boolean;
  documents: Array<{ id: string; issues: ValidationIssue[]; coverage?: AnalysisCoverage }>;
}

/** Validate many documents together: per-document issues plus duplicate ids across the batch. */
export function validateBatch(docs: readonly unknown[], ctx: ValidateContext): BatchValidation {
  const results = docs.map((doc, i) => {
    const r = validateDocumentDetailed(doc, ctx);
    const id = isObj(doc) && typeof doc.id === 'string' ? doc.id : `#${i}`;
    return { id, doc, ...r };
  });
  const seen = new Map<string, number>();
  results.forEach((r, i) => {
    const d = r.doc;
    if (!isObj(d) || typeof d.id !== 'string' || !(LANGUAGES as readonly unknown[]).includes(d.lang)) return;
    const key = `${d.lang}/${d.id}`;
    const first = seen.get(key);
    if (first !== undefined) {
      r.issues.push({
        path: 'id', code: 'duplicate-document-id', severity: 'error',
        message: `document "${key}" appears more than once in this batch (first at position ${first})`,
        hint: 'Every document in a batch needs its own id; to update a text, import it once.',
      });
    } else seen.set(key, i);
  });
  return {
    ok: results.every((r) => !r.issues.some((x) => x.severity === 'error')),
    documents: results.map((r) => ({ id: r.id, issues: r.issues, coverage: r.coverage })),
  };
}

export const hasErrors = (issues: readonly ValidationIssue[]): boolean => issues.some((i) => i.severity === 'error');
