/**
 * Text quality control — STUB written by the coordinator so that the other packages compile.
 * Package S4 (docs/PLAN9.md) replaces the body; the exported names and signatures are the contract.
 */
import type { LanguageCode, QualityFlag, QualityReport } from '../core';

export interface QualityOptions {
  lang: LanguageCode;
  /** Where the text came from, for source-specific noise (a Project Gutenberg file has a licence header and footer). */
  sourceKind?: 'plain' | 'gutenberg' | 'wikisource' | 'epub' | 'ocr';
}

/**
 * Inspect raw text BEFORE it becomes documents: bad encoding, broken accents, OCR damage, hard line wraps, page
 * numbers, running heads, footnote markers, duplicated paragraphs, boilerplate, language mismatch. Never changes the
 * text: it reports. What to do about a flag (strip boilerplate, unwrap lines) is an explicit converter option.
 */
export function inspectText(_text: string, _opts: QualityOptions): QualityReport {
  throw new Error('inspectText: not implemented yet (PLAN9 package S4)');
}

export type { QualityFlag, QualityReport };
