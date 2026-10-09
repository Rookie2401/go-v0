/**
 * Language resolution contract. The content script collects EVIDENCE about which language a selection is in (the
 * learner's override, what the book or the page declares, a short sample of the selection, the team default, the
 * languages this build can analyse) and asks an injected resolver for ONE answer with its basis. The resolver itself is
 * implemented by `src/language`; the controller only plumbs the types below and records `basis` and `confidence`.
 *
 * Rules: evidence is metadata and a sample of the selected surface; it never contains the page, the sentence or a book.
 */

/** Everything known about the language of one selection. Absent fields mean "no evidence of that kind". */
export interface LanguageEvidence {
  /** The learner's explicit choice for this page or lookup. Wins over everything. */
  override?: string;
  /** What the book (reader environment) declares: an OPF dc:language, a Scripture translation's language. */
  bookLanguage?: { languageId: string; source: string; confidence: number; /** The full declared tag (`es-HN`), when it carries more than the language, so the resolver can set the variety. */ tag?: string };
  /** What the page declares near the selection. */
  documentLanguage?: { languageId: string; source: 'html-lang' | 'meta' | 'og-locale' | 'element-lang' | 'url'; confidence: number; /** The full declared tag (`es-HN`), when it carries more than the language, so the resolver can set the variety. */ tag?: string };
  /** The selected surface (never the context sentence), for detection by script or word list. */
  sample?: string;
  /** The language of the learner's enrolment (or the team's default), when there is one. */
  teamDefault?: string;
  /** The languages this build can analyse. */
  installed: string[];
}

export interface LanguageResolution {
  languageId?: string;
  varietyId?: string;
  confidence: number;
  basis: 'override' | 'book-metadata' | 'document-metadata' | 'detection' | 'team-default' | 'undetermined';
  /** Plain-words reasons, shown to the learner or logged; no page text. */
  reasons: string[];
}

export type ResolveLanguage = (evidence: LanguageEvidence) => LanguageResolution;

/** The part of the evidence an adapter can supply from the page or the reader (the rest comes from the controller). */
export interface AdapterLanguageEvidence {
  documentLanguage?: LanguageEvidence['documentLanguage'];
  bookLanguage?: LanguageEvidence['bookLanguage'];
}

/** A sentence cutter for one language: spans are slices of the text. The language packs provide them. */
export type SegmentFor = (languageId: string) => ((text: string) => Array<{ start: number; end: number; text: string }>) | undefined;

/** The resolver says this in a reason when it could not compare a sample with an installed pack's word list because that analyser is not loaded; the controller then loads the lists and asks again. */
export const WORD_LIST_MISSING = /word list available/u;
