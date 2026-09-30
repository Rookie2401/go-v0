/**
 * Corpus document format (`data/corpus/<lang>/*.json`), version 1.
 *
 * One file = one `Text`. Provenance is mandatory: a `source` (rights + authorship) and a human-readable
 * `sourceNote` saying exactly where the words came from and what has / has not been verified.
 *
 * Sentences are declared explicitly (`paragraph.sentences[]` — each entry is one sentence, the author's
 * declaration) or, for raw prose, as `paragraph.text` which the language adapter segments (then `english`
 * must have one entry per resulting sentence). Scripture never carries verse numbers in `text`; verse
 * references are metadata (`verseRefs`, USFM style "JHN.3.16").
 */
import type { Authorship, Corpus, ContentSource, LanguageCode, RightsStatus, Text, TextKind } from '../core';
import { LANGUAGES } from '../core';

export const CORPUS_FORMAT_VERSION = 1 as const;

/** The `source` block: becomes a `ContentSource` row (id must be unique per document). */
export interface CorpusSourceInfo {
  id: string;
  title: string;
  author?: string;
  publisher?: string;
  url?: string;
  edition?: string;
  rights: RightsStatus;
  licenseNote?: string;
  authorship: Authorship;
}

export interface DocSentence {
  /** Canonical display text (NFC). Never modified by processing. */
  text: string;
  /** English rescue for this sentence. */
  english?: string;
  /** Scripture: USFM references this sentence carries, e.g. ["1JN.1.9"]. Not part of `text`. */
  verseRefs?: string[];
}

/** A paragraph whose sentences are declared one by one. */
export interface DocParagraphSentences { sentences: DocSentence[] }
/** A paragraph of raw prose the adapter will segment; `english` (if given) has one entry per sentence. */
export interface DocParagraphRaw { text: string; english?: string[]; verseRefs?: string[] }
export type DocParagraph = DocParagraphSentences | DocParagraphRaw;

export interface DocSection {
  title?: string;
  /** Scripture chapter number of this section. */
  chapter?: number;
  paragraphs: DocParagraph[];
}

export interface CorpusDocument {
  formatVersion: typeof CORPUS_FORMAT_VERSION;
  lang: LanguageCode;
  /** Text id slug → `text:<lang>:<slug>`. */
  slug: string;
  title: string;
  kind: TextKind;
  corpus: Pick<Corpus, 'id' | 'kind' | 'title'>;
  source: CorpusSourceInfo;
  /** Honest provenance statement: origin, drafter, what is verified, what must happen before release. */
  sourceNote: string;
  /** Exact translation/version for scripture. */
  version?: string;
  staticLevel?: NonNullable<Text['staticLevel']>;
  tags: string[];
  /** Machine-generated text must say so (the reader badges it). Never true for scripture. */
  generated?: boolean;
  /**
   * Scripture: canonical book code (USFM) and first chapter; further chapters are per-section `chapter`.
   * TODO(contract): Text.scripture can name only one book+chapter, so a passage document spanning 1 John 1 and
   * John 3 records the first; every sentence's `verseRefs` ("JHN.3.16") carries the real reference.
   */
  scripture?: { book: string; chapter: number };
  /** Provenance of the English rescue lines, stored on every EnglishRescue.sourceNote. */
  englishSource?: string;
  sections: DocSection[];
}

export class CorpusValidationError extends Error {
  constructor(readonly slug: string, readonly problems: string[]) {
    super(`invalid corpus document "${slug}": ${problems.join('; ')}`);
    this.name = 'CorpusValidationError';
  }
}

const RIGHTS: readonly RightsStatus[] = ['public-domain', 'licensed', 'owner-authored', 'generated', 'user-private', 'unverified'];
const AUTHORSHIP: readonly Authorship[] = ['human', 'public-domain', 'licensed', 'generated', 'learner'];
const KINDS: readonly TextKind[] = ['story', 'dialogue', 'nonfiction', 'scripture', 'transcript', 'testimony', 'generated-prep'];
const CORPUS_KINDS: readonly Corpus['kind'][] = ['comprehensible-input', 'scripture', 'testimony'];
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const VERSE_REF = /^[1-3A-Z][A-Z0-9]{2}\.\d+\.\d+$/;
/** Verse-number residue that must never be inside a sentence: [16], <sup>16</sup>, superscript digits. */
const VERSE_MARKER = /\[\s*\d+(?:\s*[-–,]\s*\d+)*\s*\]|<sup>|[²³¹⁰⁴-⁹]/u;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Structural + provenance validation. Returns every problem found (empty = valid). */
export function validateDocument(input: unknown): string[] {
  const p: string[] = [];
  if (!isObj(input)) return ['document is not an object'];
  const d = input;
  if (d.formatVersion !== CORPUS_FORMAT_VERSION) p.push(`formatVersion must be ${CORPUS_FORMAT_VERSION}`);
  if (!(LANGUAGES as readonly unknown[]).includes(d.lang)) p.push(`lang must be one of ${LANGUAGES.join(', ')}`);
  if (!isStr(d.slug) || !SLUG.test(d.slug)) p.push('slug must match /^[a-z0-9][a-z0-9-]*$/');
  if (!isStr(d.title)) p.push('title is required');
  if (!(KINDS as readonly unknown[]).includes(d.kind)) p.push(`kind must be one of ${KINDS.join(', ')}`);
  if (!isStr(d.sourceNote)) p.push('sourceNote is required (say honestly where the text came from and what is unverified)');
  if (!Array.isArray(d.tags) || d.tags.some((t) => typeof t !== 'string')) p.push('tags must be an array of strings');

  const corpus = d.corpus;
  if (!isObj(corpus) || !isStr(corpus.id) || !isStr(corpus.title) || !(CORPUS_KINDS as readonly unknown[]).includes(corpus.kind)) {
    p.push('corpus must be {id, kind, title}');
  }

  const src = d.source;
  if (!isObj(src)) p.push('source is required');
  else {
    if (!isStr(src.id)) p.push('source.id is required');
    if (!isStr(src.title)) p.push('source.title is required');
    if (!(RIGHTS as readonly unknown[]).includes(src.rights)) p.push(`source.rights must be one of ${RIGHTS.join(', ')}`);
    if (!(AUTHORSHIP as readonly unknown[]).includes(src.authorship)) p.push(`source.authorship must be one of ${AUTHORSHIP.join(', ')}`);
    if (src.rights === 'unverified' && isStr(d.sourceNote) && !/unverified|replace|verify/i.test(d.sourceNote)) {
      p.push('rights "unverified" requires a sourceNote saying the text must be replaced/verified before release');
    }
  }

  const scripture = d.kind === 'scripture';
  if (scripture) {
    if (isObj(corpus) && corpus.kind !== 'scripture') p.push('scripture texts must use a corpus of kind "scripture"');
    if (!isStr(d.version)) p.push('scripture requires version (exact translation)');
    if (d.generated === true) p.push('scripture can never be generated');
    if (isObj(src) && src.rights === 'generated') p.push('scripture can never have rights "generated"');
    if (!isObj(d.scripture) || !isStr(d.scripture.book) || typeof d.scripture.chapter !== 'number') p.push('scripture requires scripture {book, chapter}');
  }

  if (!Array.isArray(d.sections) || d.sections.length === 0) {
    p.push('sections must be a non-empty array');
    return p;
  }
  let sentenceCount = 0;
  d.sections.forEach((sec, si) => {
    const where = `sections[${si}]`;
    if (!isObj(sec) || !Array.isArray(sec.paragraphs) || sec.paragraphs.length === 0) { p.push(`${where}.paragraphs must be a non-empty array`); return; }
    sec.paragraphs.forEach((par, pi) => {
      const pw = `${where}.paragraphs[${pi}]`;
      if (!isObj(par)) { p.push(`${pw} is not an object`); return; }
      const checkSentence = (text: unknown, english: unknown, refs: unknown, w: string) => {
        sentenceCount++;
        if (!isStr(text)) { p.push(`${w}.text is required`); return; }
        if (text !== text.trim()) p.push(`${w}.text has leading/trailing whitespace`);
        if (scripture) {
          if (VERSE_MARKER.test(text)) p.push(`${w}.text contains a verse marker; verse numbers are metadata (verseRefs)`);
          if (!Array.isArray(refs) || refs.length === 0) p.push(`${w}.verseRefs is required for scripture`);
        }
        if (Array.isArray(refs) && refs.some((r) => typeof r !== 'string' || !VERSE_REF.test(r))) p.push(`${w}.verseRefs must be USFM refs like "JHN.3.16"`);
        if (english !== undefined && !isStr(english)) p.push(`${w}.english must be a non-empty string when present`);
      };
      if (Array.isArray(par.sentences)) {
        if (par.sentences.length === 0) p.push(`${pw}.sentences is empty`);
        par.sentences.forEach((s, k) => {
          if (!isObj(s)) p.push(`${pw}.sentences[${k}] is not an object`);
          else checkSentence(s.text, s.english, s.verseRefs, `${pw}.sentences[${k}]`);
        });
      } else if (typeof par.text === 'string') {
        checkSentence(par.text, undefined, par.verseRefs, pw);
        if (par.english !== undefined && (!Array.isArray(par.english) || par.english.some((e) => !isStr(e)))) p.push(`${pw}.english must be an array of strings`);
      } else p.push(`${pw} needs either sentences[] or text`);
    });
  });
  if (sentenceCount === 0) p.push('document has no sentences');
  return p;
}

/** Convenience for callers that only need the source row shape. */
export function toContentSource(doc: CorpusDocument): ContentSource {
  const note = [doc.source.licenseNote, doc.sourceNote].filter(Boolean).join(' — ');
  return {
    id: doc.source.id, title: doc.source.title, author: doc.source.author, publisher: doc.source.publisher, url: doc.source.url,
    edition: doc.source.edition, rights: doc.source.rights, licenseNote: note || undefined, authorship: doc.source.authorship,
  };
}
