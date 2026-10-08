/**
 * Corpus import format, schema version 2 (`data/corpus/<lang>/*.json`, in-app importer, `npm run corpus:*`).
 *
 * One file = one `Text`. The document carries its own provenance, review state and (for Scripture) its
 * translation identity and verification — the publication gate (`computePublished`) reads exactly these.
 * Sentence and paragraph text is stored EXACTLY as supplied: no NFC, no trimming, no whitespace changes.
 * The full specification, with examples, is `docs/IMPORT.md`; valid templates are in `docs/import/templates`.
 */
import type {
  Authorship, AdapterRegistry, ContentNote, Corpus, LanguageCode, PartOfSpeech, QualityReport, RightsStatus, ReviewStatus, SourceVerification,
  Text, TextKind,
} from '../core';
import { COURSES, LANGUAGES, LANGUAGE_ROWS, courseForLang, courseReads, ids } from '../core';
import { analysisCoverage, type AnalysisCoverage } from '../adapters/shared';
import { contentSignatureOf } from './publish';
import { pipelineProblems } from './pipeline';
import type { CurriculumMetadata } from '../course/curriculumPolicy';

export const CORPUS_SCHEMA_VERSION = 2 as const;

// ───────────────────────────── document types ─────────────────────────────

export interface CorpusSourceInfo {
  sourceHash?: string;
  retrievedAt?: string;
  licence?: string;
  modifications?: string;
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
  /**
   * What kind of review this was. 'linguistic-check': the language was checked by someone who is not a native speaker,
   * or by a tool — worth recording, and NOT enough to publish machine-drafted text. 'native': a native speaker read it.
   * Absent cannot establish native review for generated or transformed course material.
   */
  level?: ReviewLevel;
}

export type ReviewLevel = 'linguistic-check' | 'native';
export const REVIEW_LEVELS: readonly ReviewLevel[] = ['linguistic-check', 'native'];

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
  /**
   * 'course' (default): the course Bible. 'technical-fixture': a draft translation used ONLY to test the Scripture pipeline;
   * it is never published and never presented as the course Bible (needs `fixtureNote`).
   */
  role?: 'course' | 'technical-fixture';
  /** Why it is only a fixture ("draft translation"). Required for a technical fixture; shown in the reasons it is not published. */
  fixtureNote?: string;
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

export type NoteKind = ContentNote['kind'];

/**
 * A note attached to a sentence (cultural, regional, register, literary, historical, clause-structure). It never changes
 * the text. `start`/`end` (both or neither) mark the words it is about and must lie on token boundaries of the sentence;
 * `spans` are labelled stretches of the sentence (clause structure) and only need to lie inside it.
 */
export interface DocNote {
  kind: NoteKind;
  body: string;
  start?: number;
  end?: number;
  spans?: Array<{ start: number; end: number; label: string }>;
  topics?: string[];
  /** Default 'human'. A machine note is stored but stays 'unreviewed' until a named person reviews it. */
  provenance?: 'human' | 'machine';
  /** Default 'approved' for a human note, 'unreviewed' for a machine note. A reviewed/approved machine note needs `by`. */
  reviewStatus?: ReviewStatus;
  /** Who wrote or reviewed the note (recorded in the text's transformation log). */
  by?: string;
}

/** A document-level note, anchored to the `occurrence`-th (1-based, default 1) sentence whose exact text contains `match`. */
export type DocDocumentNote = DocNote & { match: string; occurrence?: number };

/** Where this text sits in the curriculum: `Text.workId` and `Text.chapter`. */
export interface DocWork {
  /** `[a-z0-9-]+`; the slug of a work in the course ladder (`src/course`). */
  slug: string;
  /** Default: the first course in COURSES for this language. */
  courseId?: string;
  /** Position of this text in the work; 0 is front matter. */
  chapter?: { index: number; title?: string };
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
  notes?: DocNote[];
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

// ── the review pipeline of a ladder unit (docs/LADDER.md, "The pipeline"; logic in ./pipeline) ──

export type PipelineState = 'machine-draft' | 'in-review' | 'corrections-pending' | 'reviewed' | 'audio-ready' | 'published';
export type ReviewerCompetence = 'native' | 'near-native' | 'professional';
export type ChecklistItem =
  | 'naturalness' | 'contemporaryUsage' | 'register' | 'grammar' | 'dialect' | 'soundsTranslated' | 'culturalOddities' | 'unnaturalSimplification';
export type ChecklistResult = 'ok' | 'changed' | 'problem';

/** Who moved a unit. A tool can draft and check; only a person can move a unit past `in-review`. */
export type PipelineActor =
  | { kind: 'tool'; name: string }
  | { kind: 'person'; name: string; competence: ReviewerCompetence; variety?: string; role: string };

/** The review checklist as recorded: the items the reviewer answered. */
export type PipelineChecklist = Partial<Record<ChecklistItem, { result: ChecklistResult; note?: string }>>;

export interface PipelineEntry {
  state: PipelineState;
  /** The day the unit moved (YYYY-MM-DD). */
  at: string;
  /** Required except on `published`. */
  by?: PipelineActor;
  checklist?: PipelineChecklist;
  /** How many sentences the review changed. */
  corrections?: number;
  /** Where the reviewed human recording is (on `audio-ready`). */
  recordings?: string;
  /** On `reviewed`: the wording signature (`contentSignatureOf`) the review covers; written by `npm run review:apply`. */
  contentSignature?: string;
}

export interface Pipeline {
  /** The state of the last history entry. */
  state: PipelineState;
  history: PipelineEntry[];
}

export interface CorpusDocument {
  curriculum?: CurriculumMetadata;
  readingAssessmentId?: string;
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
  /** The curriculum work (and chapter) this text belongs to. */
  work?: DocWork;
  /** Catalogue facts carried to `Text`: content streams and subject domains (short slugs, e.g. "library", "honduras", "engineering"). */
  streams?: string[];
  domains?: string[];
  /** Variety of the language the text is written in ("es-HN", "es-ES", "es-hist"): a short code, carried to `Text.variety`. */
  variety?: string;
  /** What the importer's quality check found in the source (`inspectText`); written by the converters, carried to `Text.quality`. */
  quality?: QualityReport;
  /**
   * Added by a team member as the team's own writing: readable on this device without a review, labelled as the team's,
   * never bundled (`Text.teamText`). Valid only with `source.rights` "owner-authored", `source.authorship` "human", not
   * generated and not Scripture (error `team-text-rights` otherwise).
   */
  teamText?: true;
  /** Notes anchored by matching sentence text (see `DocDocumentNote`); notes on a declared sentence go in its `notes`. */
  notes?: DocDocumentNote[];
  /**
   * A ladder unit's review pipeline (docs/LADDER.md). A document with this block is published only from `audio-ready` /
   * `published`, after a review by a person with every correction resolved (`computePublished`); without it, nothing changes.
   */
  pipeline?: Pipeline;
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
  | 'scripture-corpus' | 'scripture-generated' | 'invalid-verification' | 'scripture-fixture-note'
  | 'missing-provenance' | 'unverified-without-note' | 'review-missing-reviewer'
  | 'review-signature-mismatch' | 'not-nfc' | 'edge-whitespace' | 'adapter-would-split' | 'low-analysis-coverage'
  | 'unknown-work' | 'note-anchor-missing' | 'note-not-on-token'
  | 'personal-copy-scripture' | 'personal-copy-generated' | 'personal-copy-authorship' | 'source-damaged' | 'team-text-rights'
  | 'pipeline-tool-cannot-review' | 'pipeline-illegal-move' | 'pipeline-state-mismatch';

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
  /** Ids of the works in the store's `works` table. A document naming a work of a course that has works, but not this one, gets `unknown-work`. */
  knownWorks?: ReadonlySet<string>;
  /**
   * Where the document is going. 'library' (the built library) refuses a source whose quality verdict is 'damaged' (the
   * `source-damaged` error); anywhere else it is a warning — a personal copy is the learner's decision.
   */
  destination?: 'library' | 'personal';
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

const RIGHTS: readonly RightsStatus[] = ['public-domain', 'licensed', 'owner-authored', 'generated', 'user-private', 'personal-copy', 'unverified'];
const AUTHORSHIP: readonly Authorship[] = ['human', 'public-domain', 'licensed', 'generated', 'learner', 'published'];
const NOTE_KINDS: readonly NoteKind[] = ['cultural', 'regional', 'register', 'literary', 'historical', 'clause-structure'];
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

const DOC_KEYS = ['schemaVersion', 'id', 'lang', 'locale', 'title', 'contentType', 'corpus', 'source', 'review', 'difficulty', 'topics', 'editorialTags', 'prepTargets', 'speakers', 'generated', 'scripture', 'english', 'sections', 'work', 'notes', 'streams', 'domains', 'variety', 'quality', 'teamText', 'curriculum', 'readingAssessmentId', 'pipeline'];
const SOURCE_KEYS = ['id', 'title', 'author', 'publisher', 'url', 'edition', 'attribution', 'provenance', 'rights', 'licenseNote', 'authorship', 'sourceHash', 'retrievedAt', 'licence', 'modifications'];
const SENTENCE_KEYS = ['id', 'text', 'english', 'verseRefs', 'speaker', 'spans', 'corrections', 'notes'];
const WORK_SLUG = /^[a-z0-9-]+$/;
const SHORT_SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VARIETY_CODE = /^[A-Za-z0-9][A-Za-z0-9-]{0,23}$/;
const QUALITY_VERDICTS = ['clean', 'usable', 'damaged'];
const NOTE_KEYS = ['kind', 'body', 'start', 'end', 'spans', 'topics', 'provenance', 'reviewStatus', 'by'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

export const parseVerseRef = (ref: string): { book: string; chapter: number; verse: number } | undefined => {
  const m = VERSE_REF.exec(ref);
  return m ? { book: m[1], chapter: Number(m[2]), verse: Number(m[3]) } : undefined;
};

/** `Text.workId` of a document: `ids.work(courseId ?? the first course for its language, slug)`; undefined without a `work`. */
export const workIdOf = (doc: { lang: LanguageCode; work?: { slug: string; courseId?: string } }): string | undefined =>
  doc.work && typeof doc.work.slug === 'string' ? ids.work(doc.work.courseId ?? courseForLang(doc.lang).id, doc.work.slug) : undefined;

/**
 * Anchor document-level notes: for each note, the index (into `sentenceTexts`, document order) of the `occurrence`-th
 * (1-based, default 1) sentence whose exact text contains `match`, or undefined when there is none.
 */
export function anchorDocumentNotes(notes: ReadonlyArray<{ match: string; occurrence?: number }>, sentenceTexts: readonly string[]): Array<number | undefined> {
  return notes.map((n) => {
    if (typeof n.match !== 'string' || n.match.length === 0) return undefined;
    let want = n.occurrence ?? 1;
    for (let i = 0; i < sentenceTexts.length; i++) {
      if (sentenceTexts[i].includes(n.match) && --want === 0) return i;
    }
    return undefined;
  });
}

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

  // work: where this text sits in the curriculum (Text.workId / Text.chapter)
  if (d.work !== undefined) {
    const w = d.work;
    if (!isObj(w)) err('work', 'invalid-value', 'work must be an object {slug, courseId?, chapter?}', 'e.g. "work": {"slug": "mana-mani-1", "chapter": {"index": 3, "title": "…"}}');
    else {
      for (const k of Object.keys(w)) if (!['slug', 'courseId', 'chapter'].includes(k) && !k.startsWith('_')) warn(`work.${k}`, 'unknown-field', `unknown work field "${k}" is ignored`, 'Check the spelling against docs/IMPORT.md.');
      if (typeof w.slug !== 'string' || w.slug.length === 0) required('work.slug', 'work.slug', 'Give the slug of the work in the course ladder, e.g. "mana-mani-1".');
      else if (!WORK_SLUG.test(w.slug)) err('work.slug', 'invalid-id', `work slug "${w.slug}" is not valid`, 'Use lower-case letters, digits and hyphens (the slug in src/course).');
      let courseId: string | undefined;
      if (w.courseId !== undefined) {
        const c = typeof w.courseId === 'string' ? COURSES.find((x) => x.id === w.courseId) : undefined;
        if (!c) err('work.courseId', 'invalid-value', `work.courseId ${JSON.stringify(w.courseId)} is not a course`, `Use one of ${COURSES.map((x) => x.id).join(', ')}, or omit it to use the course of the document's language.`);
        else if (lang && !courseReads(c, lang)) err('work.courseId', 'invalid-value', `course "${c.id}" teaches "${c.lang}" but the document is "${lang}"`, 'Use a course of the same language (or one that also reads it), or correct lang.');
        else courseId = c.id;
      } else if (lang) courseId = courseForLang(lang).id;
      if (w.chapter !== undefined) {
        const ch = w.chapter;
        if (!isObj(ch) || !isInt(ch.index) || ch.index < 0 || (ch.title !== undefined && !isStr(ch.title))) {
          err('work.chapter', 'invalid-value', 'work.chapter must be {index, title?} with a whole-number index (1 or more; 0 is front matter)', 'e.g. {"index": 3, "title": "A visit"}');
        }
      }
      if (courseId && typeof w.slug === 'string' && WORK_SLUG.test(w.slug) && ctx.knownWorks) {
        const prefix = `work:${courseId}:`;
        let courseHasWorks = false;
        for (const id of ctx.knownWorks) if (id.startsWith(prefix)) { courseHasWorks = true; break; }
        if (courseHasWorks && !ctx.knownWorks.has(ids.work(courseId, w.slug))) {
          warn('work.slug', 'unknown-work', `"${w.slug}" is not a work of course ${courseId}`,
            'The text imports, but it will not appear under a work of the ladder. Check the slug against the works in src/course (docs/IMPORT.md, "Works and chapters").');
        }
      }
    }
  }

  // catalogue facts: streams, domains, variety
  for (const key of ['streams', 'domains'] as const) {
    const v = d[key];
    if (v !== undefined && (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !SHORT_SLUG.test(x)))) {
      err(key, 'invalid-value', `${key} must be an array of short slugs (lower-case letters, digits, hyphens; at most 40 characters)`, `e.g. "${key}": ["${key === 'streams' ? 'library' : 'engineering'}"]`);
    }
  }
  if (d.variety !== undefined && (typeof d.variety !== 'string' || !VARIETY_CODE.test(d.variety))) {
    err('variety', 'invalid-value', 'variety must be a short code such as "es-HN", "es-ES" or "es-hist"', 'Use letters, digits and hyphens (at most 24 characters), or omit it.');
  }
  // the source-quality report written by the converters
  if (d.quality !== undefined) {
    const q = d.quality;
    if (!isObj(q) || !QUALITY_VERDICTS.includes(q.verdict as string) || !Array.isArray(q.flags) || typeof q.checkedWith !== 'string') {
      err('quality', 'invalid-value', 'quality must be {checkedWith, flags, verdict} as written by the converters', 'Remove it, or regenerate it with npm run corpus:convert.');
    } else if (q.verdict === 'damaged') {
      const serious = (q.flags as Array<{ code?: unknown; severity?: unknown }>).filter((x) => x && x.severity === 'serious').map((x) => String(x.code)).join(', ');
      const message = `the source text was found damaged by the quality check${serious ? ` (${serious})` : ''}`;
      if (ctx.destination === 'library') err('quality', 'source-damaged', message, 'A text for the built library is never imported damaged: repair or replace the source, then convert it again.');
      else warn('quality', 'source-damaged', message, 'Look at the flagged places before you read it; a personal copy is still imported, because the choice is yours.');
    }
  }

  // source
  const src = d.source;
  let provenanceText = '';
  if (!isObj(src)) required('source', 'source');
  else {
    for (const k of Object.keys(src)) if (!SOURCE_KEYS.includes(k) && !k.startsWith('_')) warn(`source.${k}`, 'unknown-field', `unknown source field "${k}" is ignored`, 'Check the spelling against docs/IMPORT.md.');
    for (const k of ['sourceHash', 'retrievedAt', 'licence', 'modifications']) if (src[k] !== undefined && !isStr(src[k])) err(`source.${k}`, 'invalid-value', `source.${k} must be a nonempty string`, 'Retain exact acquired edition evidence.');
    if (src.sourceHash !== undefined && (!isStr(src.sourceHash) || !/^(?:sha256:)?[a-f0-9]{64}$/i.test(src.sourceHash))) err('source.sourceHash', 'invalid-value', 'sourceHash must be a SHA-256 checksum', 'Use the checksum of the exact acquired source file.');
    if (src.retrievedAt !== undefined && !Number.isFinite(Date.parse(String(src.retrievedAt)))) err('source.retrievedAt', 'invalid-value', 'retrievedAt must be a valid date', 'Record when the source file was retrieved.');
    if (!isStr(src.id)) required('source.id', 'source.id');
    if (!isStr(src.title)) required('source.title', 'source.title');
    if (!isStr(src.attribution)) required('source.attribution', 'source.attribution', 'Write the learner-visible credit line, e.g. "Reina-Valera 1909, public domain".');
    if (!isStr(src.provenance)) err('source.provenance', 'missing-provenance', 'source.provenance is required',
      d.contentType === 'scripture' ? 'State exactly where the wording came from and how it was checked against that source.' : 'State honestly where the text came from (who wrote it, how) and what has not been checked.');
    else provenanceText = src.provenance;
    if (!(RIGHTS as readonly unknown[]).includes(src.rights)) err('source.rights', 'invalid-value', `source.rights must be one of ${RIGHTS.join(', ')}`, 'Say what you know about the rights; use "unverified" if you do not know.');
    if (!(AUTHORSHIP as readonly unknown[]).includes(src.authorship)) err('source.authorship', 'invalid-value', `source.authorship must be one of ${AUTHORSHIP.join(', ')}`, 'Say who wrote the words.');
    if (src.rights === 'personal-copy') {
      if (d.contentType === 'scripture') {
        err('source.rights', 'personal-copy-scripture', 'Scripture is never a personal copy: it must be an identified, verified translation',
          'Use rights "public-domain" or "licensed" with a scripture block and verification (docs/IMPORT.md §3), or import it as a story/nonfiction text if it is not Scripture.');
      }
      if (d.generated === true || src.authorship === 'generated') {
        err('source.authorship', 'personal-copy-generated', 'generated text is not a published work, so it cannot be a personal copy',
          'Set rights "generated" (and keep generated: true) for machine-written text; a personal copy is the text of a book somebody published.');
      } else if (src.authorship !== 'published') {
        err('source.authorship', 'personal-copy-authorship', 'a personal copy must have authorship "published"',
          'Set source.authorship to "published" (a book by a native author); for your own writing use rights "user-private" and authorship "learner".');
      }
    }
    if (src.rights === 'unverified' && !/unverified|replace|verify/i.test(`${provenanceText} ${typeof src.licenseNote === 'string' ? src.licenseNote : ''}`)) {
      err('source.rights', 'unverified-without-note', 'rights "unverified" needs a note saying the text must be replaced or verified before release',
        'Add a sentence to source.provenance (or licenseNote) such as "unverified sample — replace with a licensed text before release".');
    }
  }

  if (d.readingAssessmentId !== undefined && !isStr(d.readingAssessmentId)) err('readingAssessmentId', 'invalid-value', 'readingAssessmentId must be a nonempty registry identity', 'Use the approved held-out registry id.');
  if (isObj(d.curriculum) && d.curriculum.role === 'assessment' && !isStr(d.readingAssessmentId)) err('readingAssessmentId', 'missing-field', 'Assessment-role material needs a protected reading assessment identity', 'Assign its approved held-out registry id; it cannot enter ordinary reading.');
  if (d.curriculum !== undefined) {
    const c = d.curriculum;
    if (!isObj(c)) err('curriculum', 'invalid-value', 'curriculum must be an object', 'Record lifecycle, role, registers, provenance, audio and rejection reasons.');
    else {
      const bad = (field: string, message: string) => err(`curriculum.${field}`, 'invalid-value', message, 'Keep missing reviews and rights pending; never invent approval.');
      if (!['candidate', 'rights_pending', 'acquired', 'converted', 'linguistic_review', 'native_review', 'ready', 'published', 'rejected'].includes(String(c.lifecycle))) bad('lifecycle', 'Invalid curriculum lifecycle');
      if (!['controlled', 'graded', 'bridge', 'authentic', 'heritage', 'scripture', 'reference', 'assessment'].includes(String(c.role))) bad('role', 'Invalid pedagogical role');
      if (!Array.isArray(c.registers) || c.registers.some(v => !isStr(v))) bad('registers', 'Registers must be nonempty strings');
      if (!Array.isArray(c.rejectionReasons) || c.rejectionReasons.some(v => !isStr(v)) || (c.lifecycle === 'rejected' && !c.rejectionReasons.length)) bad('rejectionReasons', 'Rejected material needs retained reasons');
      if (!isObj(c.provenance) || !['original', 'translation', 'adaptation', 'generated'].includes(String(c.provenance.kind))) bad('provenance', 'Provenance must identify original, translation, adaptation or generated wording');
      else {
        for (const field of ['sourceTextId', 'sourceTitle', 'sourceLanguage', 'translator', 'adapter', 'description']) if (c.provenance[field] !== undefined && !isStr(c.provenance[field])) bad(`provenance.${field}`, 'Provenance values must be nonempty strings');
        if (c.provenance.kind === 'translation' && ['sourceTitle', 'sourceLanguage', 'translator'].some(k => !isStr((c.provenance as Record<string, unknown>)[k]))) bad('provenance', 'Translation must retain original title, original language and translator');
        if (c.provenance.kind === 'adaptation' && ['sourceTextId', 'adapter', 'description'].some(k => !isStr((c.provenance as Record<string, unknown>)[k]))) bad('provenance', 'Adaptation must identify source, adapter and changes');
      }
      if (c.nativeReview !== undefined && (!isObj(c.nativeReview) || !isStr(c.nativeReview.by) || !isStr(c.nativeReview.at) || !Number.isFinite(Date.parse(String(c.nativeReview.at))) || c.nativeReview.language !== d.lang || !Number.isInteger(c.nativeReview.contentVersion) || Number(c.nativeReview.contentVersion) < 1)) bad('nativeReview', 'Native review needs a named reviewer, valid date, target language and positive content version');
      if (!isObj(c.audio) || !['unavailable', 'candidate', 'rights_pending', 'review_pending', 'ready', 'published'].includes(String(c.audio.state)) || typeof c.audio.rightsCleared !== 'boolean') bad('audio', 'Audio needs independent lifecycle and rights clearance');
      else if (c.audio.state === 'published' && (!c.audio.rightsCleared || !isStr(c.audio.reviewedBy) || !Number.isInteger(c.audio.contentVersion) || Number(c.audio.contentVersion) < 1)) bad('audio', 'Published audio needs rights clearance, reviewer and wording version');
    }
  }

  // the review pipeline of a ladder unit (shape, who may move it, the order of states)
  if (d.pipeline !== undefined) for (const p of pipelineProblems(d.pipeline)) add(p.severity, p.path, p.code, p.message, p.hint);

  // review
  const review = d.review;
  if (!isObj(review)) required('review', 'review', 'Add "review": {"status": "unreviewed"} — reviewers record themselves here (see docs/IMPORT.md).');
  else {
    if (!(REVIEWS as readonly unknown[]).includes(review.status)) err('review.status', 'invalid-value', `review.status must be one of ${REVIEWS.join(', ')}`, 'Use "unreviewed" until a named person has checked the text.');
    else if ((review.status === 'reviewed' || review.status === 'approved') && !isStr(review.reviewedBy)) {
      err('review.reviewedBy', 'review-missing-reviewer', `review.status "${review.status}" needs review.reviewedBy`, 'Name the person (or verification tool) that reviewed the text, plus reviewedAt; reviews are never anonymous.');
    }
    for (const k of ['reviewedBy', 'reviewedAt', 'notes', 'contentSignature'] as const) if (review[k] !== undefined && typeof review[k] !== 'string') err(`review.${k}`, 'invalid-value', `review.${k} must be a string`, 'Use plain text.');
    if (review.level !== undefined && !(REVIEW_LEVELS as readonly unknown[]).includes(review.level)) err('review.level', 'invalid-value', `review.level must be one of ${REVIEW_LEVELS.join(', ')}`, 'Say whether a native speaker read the text ("native") or its language was checked by someone else or by a tool ("linguistic-check").');
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

  // team text: the team's own writing, readable without a review (see `computePublished`)
  if (d.teamText !== undefined) {
    if (d.teamText !== true) err('teamText', 'invalid-value', 'teamText must be true, or omitted', 'Remove the field, or set it to true for a text the team wrote itself.');
    else {
      const s = isObj(src) ? src : undefined;
      const missing: string[] = [];
      if (s?.rights !== 'owner-authored') missing.push('source.rights "owner-authored"');
      if (s?.authorship !== 'human') missing.push('source.authorship "human"');
      if (d.generated === true) missing.push('generated false');
      if (d.contentType === 'scripture') missing.push('a contentType other than "scripture"');
      if (missing.length) {
        err('teamText', 'team-text-rights', `teamText is only for text the team wrote itself; this document would need ${missing.join(', ')}`,
          'Remove teamText, or correct the source: a team text is owner-authored, written by a person, not machine-generated and not Scripture. A published book is a personal copy, not a team text.');
      }
    }
  }

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
      if (sc.role !== undefined && sc.role !== 'course' && sc.role !== 'technical-fixture') err('scripture.role', 'invalid-value', 'scripture.role must be "course" or "technical-fixture"', 'Omit it for the course Bible; use "technical-fixture" only for a draft translation used to test the pipeline.');
      if (sc.role === 'technical-fixture' && !isStr(sc.fixtureNote)) err('scripture.fixtureNote', 'scripture-fixture-note', 'a technical fixture needs scripture.fixtureNote saying why it is only a fixture', 'Add e.g. "fixtureNote": "draft translation"; a technical fixture is never published and never the course Bible.');
      if (sc.fixtureNote !== undefined && typeof sc.fixtureNote !== 'string') err('scripture.fixtureNote', 'invalid-value', 'scripture.fixtureNote must be a string', 'Say why the text is only a fixture, or omit it.');
      if (sc.verification !== undefined) {
        const v = sc.verification;
        if (!isObj(v) || !isStr(v.against) || !isStr(v.checkedAt) || !isStr(v.by) || !VERIFY_METHODS.includes(v.method as string)) {
          err('scripture.verification', 'invalid-verification', 'scripture.verification must be {against, checkedAt, method, by}', `method is one of ${VERIFY_METHODS.join(', ')}; run scripts/verify-scripture.mjs to produce one.`);
        }
      }
    }
  } else if (d.scripture !== undefined) {
    if (isObj(d.scripture) && d.scripture.role === 'technical-fixture') err('scripture.role', 'invalid-value', 'a technical fixture is only valid on contentType "scripture"', 'Set contentType to "scripture", or remove the role.');
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
  const allTexts: string[] = []; // every sentence text in document order (document-level note anchors)

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

  /** One note (sentence-level or document-level). `text` is the sentence it is anchored to, when known. */
  const checkNote = (n: unknown, p: string, text: string | undefined, docLevel: boolean) => {
    if (!isObj(n)) { err(p, 'invalid-value', 'a note must be an object', 'Use {"kind": "cultural", "body": "…"}.'); return; }
    for (const k of Object.keys(n)) {
      if (!NOTE_KEYS.includes(k) && !(docLevel && (k === 'match' || k === 'occurrence')) && !k.startsWith('_')) warn(`${p}.${k}`, 'unknown-field', `unknown note field "${k}" is ignored`, 'Check the spelling against docs/IMPORT.md.');
    }
    if (!(NOTE_KINDS as readonly unknown[]).includes(n.kind)) err(`${p}.kind`, 'invalid-value', `note kind must be one of ${NOTE_KINDS.join(', ')}`, 'Say what sort of note this is.');
    if (!isStr(n.body)) required(`${p}.body`, 'body (the text of the note)', 'Write the note: concise, plain, about this place in the text.');
    if (n.provenance !== undefined && n.provenance !== 'human' && n.provenance !== 'machine') err(`${p}.provenance`, 'invalid-value', 'note provenance must be "human" or "machine"', 'Say whether a person or a machine wrote the note (default "human").');
    if (n.reviewStatus !== undefined && !(REVIEWS as readonly unknown[]).includes(n.reviewStatus)) err(`${p}.reviewStatus`, 'invalid-value', `note reviewStatus must be one of ${REVIEWS.join(', ')}`, 'Use "unreviewed" until a named person has checked the note.');
    else if ((n.reviewStatus === 'reviewed' || n.reviewStatus === 'approved') && n.provenance === 'machine' && !isStr(n.by)) {
      err(`${p}.by`, 'review-missing-reviewer', `a machine note with reviewStatus "${String(n.reviewStatus)}" needs "by" (who reviewed it)`, 'Name the person who checked the note; reviews are never anonymous.');
    }
    if (n.by !== undefined && !isStr(n.by)) err(`${p}.by`, 'invalid-value', 'by must be a non-empty string', 'Name the person who wrote or reviewed the note.');
    if (n.topics !== undefined && (!Array.isArray(n.topics) || n.topics.some((t) => typeof t !== 'string'))) err(`${p}.topics`, 'invalid-value', 'topics must be an array of strings', 'e.g. ["kinship", "Buddhism"]');

    if ((n.start === undefined) !== (n.end === undefined)) err(p, 'invalid-value', 'start and end go together', 'Give both offsets (the words the note is about) or neither (a note on the whole sentence).');
    else if (n.start !== undefined) {
      if (!isInt(n.start) || !isInt(n.end)) err(p, 'invalid-value', 'start and end must be integers (UTF-16 offsets into the sentence text)', 'Offsets count UTF-16 code units: text.slice(start, end) are the words.');
      else if (n.end <= n.start) err(p, 'span-empty', `note range [${n.start}, ${n.end}) is empty`, 'end must be greater than start.');
      else if (text !== undefined) {
        if (n.start < 0 || n.end > text.length) err(p, 'span-out-of-bounds', `note range [${n.start}, ${n.end}) is outside the sentence (length ${text.length})`, 'Offsets must lie within the sentence text.');
        else {
          const toks = adapter ? adapter.tokenize(text) : [];
          const from = n.start;
          const to = n.end;
          if (toks.length && (!toks.some((t) => t.start === from) || !toks.some((t) => t.end === to))) {
            err(p, 'note-not-on-token', `note range [${from}, ${to}) "${text.slice(from, to)}" does not start and end on word boundaries`,
              `Start at the beginning of a word and end at the end of one. Words here: ${toks.filter((t) => t.isWord).slice(0, 12).map((t) => `[${t.start},${t.end}) ${t.surface}`).join(', ')}${toks.length > 12 ? ', …' : ''}`);
          }
        }
      }
    }
    if (n.spans !== undefined) {
      if (!Array.isArray(n.spans)) err(`${p}.spans`, 'invalid-value', 'spans must be an array of {start, end, label}', 'Labelled stretches of the sentence, e.g. {"start": 0, "end": 9, "label": "main clause"}.');
      else {
        const bounds = text !== undefined ? graphemeBoundaries(text) : undefined;
        n.spans.forEach((sp: unknown, k: number) => {
          const q = `${p}.spans[${k}]`;
          if (!isObj(sp) || !isInt(sp.start) || !isInt(sp.end) || !isStr(sp.label)) { err(q, 'invalid-value', 'a span needs integer start and end and a label', 'e.g. {"start": 0, "end": 9, "label": "main clause"}'); return; }
          if (sp.end <= sp.start) { err(q, 'span-empty', `span [${sp.start}, ${sp.end}) is empty`, 'end must be greater than start.'); return; }
          if (text === undefined || !bounds) return;
          if (sp.start < 0 || sp.end > text.length) err(q, 'span-out-of-bounds', `span [${sp.start}, ${sp.end}) is outside the sentence (length ${text.length})`, 'Offsets must lie within the sentence text.');
          else if (!bounds.has(sp.start) || !bounds.has(sp.end)) err(q, 'span-not-grapheme-boundary', `span [${sp.start}, ${sp.end}) splits a character cluster`, 'Start and end between user-perceived characters.');
        });
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
    if (s.notes !== undefined) {
      if (!Array.isArray(s.notes)) err(`${path}.notes`, 'invalid-value', 'notes must be an array', 'Use "notes": [{"kind": "cultural", "body": "…"}].');
      else s.notes.forEach((n: unknown, k: number) => checkNote(n, `${path}.notes[${k}]`, text, false));
    }
    if (scriptRe) for (const ch of text) { if (/\p{L}/u.test(ch)) { letters++; if (scriptRe.test(ch)) inScript++; } }
  };

  // Coverage must equal what the importer will report for the same document: a word counts as analysed when the
  // adapter analyses it OR the author supplied an analysis for exactly that token (`spans` / `corrections`).
  const tally = (text: string, supplied: unknown[] = []) => {
    if (!adapter) return;
    const toks = adapter.tokenize(text);
    const covered = new Set<string>();
    for (const sp of supplied) if (isObj(sp) && isInt(sp.start) && isInt(sp.end)) covered.add(`${sp.start}:${sp.end}`);
    const analysed = adapter.analyze(toks).map((a, i) => (
      a.candidates.length === 0 && covered.has(`${toks[i].start}:${toks[i].end}`)
        ? { ...a, candidates: [{ morph: {}, confidence: 1 }] }
        : a
    ));
    const cov = analysisCoverage(toks, analysed);
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
          allTexts.push(typeof s.text === 'string' ? s.text : '');
          if (typeof s.text === 'string' && s.text.trim()) {
            tally(s.text, [...(Array.isArray(s.spans) ? s.spans : []), ...(Array.isArray(s.corrections) ? s.corrections : [])]);
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
          spans.forEach((x) => { tally(x.text); allTexts.push(x.text); });
          for (const x of spans) if (scriptRe) for (const ch of x.text) if (/\p{L}/u.test(ch)) { letters++; if (scriptRe.test(ch)) inScript++; }
        } else sentenceCount++;
        if (scripture || par.verseRefs !== undefined) checkVerseRefs(par.verseRefs, `${pp}.verseRefs`, sectionChapter);
      } else err(pp, 'invalid-value', 'a paragraph needs either "sentences" or "text"', 'Use {"sentences": […]} or {"text": "…"}.');
    });
  });
  if (sentenceCount === 0) err('sections', 'no-sentences', 'the document has no sentences', 'Add sentences to at least one paragraph.');

  // document-level notes: each is anchored to the sentence whose exact text contains `match`
  if (d.notes !== undefined) {
    if (!Array.isArray(d.notes)) err('notes', 'invalid-value', 'notes must be an array', 'Use "notes": [{"match": "words in the sentence", "kind": "cultural", "body": "…"}].');
    else {
      const list = d.notes as unknown[];
      const valid = list.map((n) => (isObj(n) && isStr(n.match) && (n.occurrence === undefined || (isInt(n.occurrence) && n.occurrence >= 1)) ? { match: n.match as string, occurrence: n.occurrence as number | undefined } : undefined));
      const anchors = anchorDocumentNotes(valid.map((v) => v ?? { match: '' }), allTexts);
      list.forEach((n, k) => {
        const p = `notes[${k}]`;
        if (!isObj(n)) { checkNote(n, p, undefined, true); return; }
        if (!isStr(n.match)) required(`${p}.match`, 'match (words of the sentence the note belongs to)', 'Copy a word or phrase from the sentence exactly as it is written in the text.');
        if (n.occurrence !== undefined && !(isInt(n.occurrence) && n.occurrence >= 1)) err(`${p}.occurrence`, 'invalid-value', 'occurrence must be a whole number from 1', 'The 1st, 2nd … sentence that contains the words (default 1).');
        const at = anchors[k];
        if (valid[k] && at === undefined) {
          err(`${p}.match`, 'note-anchor-missing', `no sentence${n.occurrence ? ` (occurrence ${String(n.occurrence)})` : ''} contains ${JSON.stringify(n.match)}`,
            'The words are matched exactly as written (no normalisation). Copy them from the text, check the occurrence number, or put the note in the sentence\'s own "notes".');
        }
        checkNote(n, p, at !== undefined ? allTexts[at] : undefined, true);
      });
    }
  }

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
      warn('', 'low-analysis-coverage', `only ${Math.round(coverage.coverage * 100)}% of the words can be analysed by the language's own word list alone (${analysedTotal}/${wordsTotal}; no dictionary consulted)`,
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
