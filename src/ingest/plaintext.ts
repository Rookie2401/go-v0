/**
 * Plain text → import documents — STUB written by the coordinator so that the other packages compile.
 * Package D (docs/PLAN5.md) replaces the body; the exported names and signatures are the contract.
 */
import type { LanguageCode, TextKind, Work } from '../core';
import type { CorpusDocument } from './format';

export interface PlainTextOptions {
  lang: LanguageCode;
  /** The curriculum work this is a copy of (title, author, stage come from it). */
  work?: Work;
  /** Used when there is no work: a free-standing text. */
  title?: string;
  contentType?: TextKind;
  /** Stable slug prefix for the produced documents; default derives from the work slug or the title. */
  idPrefix?: string;
  /**
   * How chapters are found: 'auto' recognises common Thai/English chapter headings ("บทที่ ๑", "ตอนที่ 3", "Chapter 4")
   * on their own line; 'none' makes one document; a RegExp source string is matched against whole lines.
   */
  chapters?: 'auto' | 'none' | string;
  /** Who is importing and from what copy ("my paperback, 12th printing") — recorded in source.provenance. */
  copyNote?: string;
}

export interface PlainTextResult {
  documents: CorpusDocument[];
  /** What was recognised and what was not, in plain words ("14 chapters found by headings like 'บทที่ ๑'"). */
  notes: string[];
}

/**
 * Turn the exact text of a book into one v2 import document per chapter. The text is never altered: paragraphs are
 * the text's own lines; sentence boundaries inside a paragraph are left to the importer. The documents are personal
 * copies (source.rights 'personal-copy', authorship 'published'): readable on this device, never bundled.
 */
export function plainTextToDocuments(_text: string, _opts: PlainTextOptions): PlainTextResult {
  throw new Error('plainTextToDocuments: not implemented yet (PLAN5 package D)');
}
