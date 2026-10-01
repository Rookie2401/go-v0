/**
 * Library contract: a corpus far larger than what a device holds in its database at once.
 *
 * The library is three things, each loaded only when asked for:
 *   - an INDEX of catalogued texts with generic, learner-independent features (small rows, paged, searchable);
 *   - a PROFILE per text: its distinct forms, lemmas, phrases and constructions with counts — enough to estimate a
 *     learner's coverage of a text that has not been imported;
 *   - the DOCUMENTS of a text, imported through the ordinary importer when the learner opens it.
 *
 * Nothing here is language-specific and nothing is loaded whole into memory. Implemented in src/library (build
 * tooling + runtime); scored by GoLearn (contracts/golearn.ts: scoreProfile, rankLibrary).
 */
import type { RightsState } from '../course';
import type { LanguageCode, Text } from '../model';

/**
 * Generic difficulty features of a text, computed once at build / import time from its analysis. Shares are
 * fractions of word tokens unless stated. A feature the analysis cannot measure is absent, never zero.
 */
export interface TextFeatures {
  words: number;
  sentences: number;
  uniqueForms: number;
  meanSentenceWords: number;
  /** Share of sentences longer than 30 words. */
  longSentenceShare?: number;
  /** Subordinating words per sentence: a rough proxy for clause depth. */
  subordinatorsPerSentence?: number;
  subjunctiveShare?: number;
  /** Words carrying attached pronouns, and free clitic pronouns. */
  cliticShare?: number;
  /** Tokens inside a detected phrase unit or idiom. */
  phraseShare?: number;
  properNounShare?: number;
  /** Word tokens with no analysis at all. */
  unanalysedShare?: number;
  /** Share of word tokens carrying each non-general variety tag ('es-ES', 'voseo', 'es-hist' …). */
  varietyShare?: Record<string, number>;
}

/** One catalogued text (usually a chapter). Small: tens of thousands of these are paged, never listed whole. */
export interface CatalogText {
  id: string; // the text id it will have when imported: ids.text(lang, slug)
  lang: LanguageCode;
  title: string;
  workId?: string;
  chapter?: number;
  author?: string;
  /** Primary stream (the shelf it is browsed under) and any others. */
  stream: string;
  streams?: string[];
  stageId?: string;
  domains?: string[];
  variety?: string;
  region?: string;
  era?: string;
  genre?: string;
  rights: RightsState;
  /** Where its documents come from: shipped with the app, in the built library, or the learner's own copy. */
  location: 'bundled' | 'library' | 'personal';
  /** Whether it may be shown to learners outside preview (reviewed + rights established, or a personal copy). */
  published: boolean;
  features: TextFeatures;
  /** Relative paths inside the library (location 'library'). */
  documentPath?: string;
  profilePath?: string;
}

/** The lexical make-up of one text: what scoring needs, without the text. Entries sorted by count, then key. */
export interface TextProfile {
  textId: string;
  lang: LanguageCode;
  /** Analyzer versions the profile was computed with ("adapter-es@2", "kaikki-es@…"): a stale profile is rebuilt. */
  analyzers: string[];
  words: number;
  /** [normalized form, count] */
  forms: Array<[string, number]>;
  /** [lemma item id, count] for tokens with a creditable lemma. */
  lemmas: Array<[string, number]>;
  phrases: Array<[string, number]>; // [phrase item id, occurrences]
  patterns: Array<[string, number]>; // [pattern item id, occurrences]
  features: TextFeatures;
}

export interface LibraryQuery {
  lang: LanguageCode;
  stream?: string;
  stageId?: string;
  domain?: string;
  variety?: string;
  era?: string;
  genre?: string;
  author?: string;
  /** Matches title and author, accent- and case-insensitively. */
  text?: string;
  rights?: RightsState;
  location?: CatalogText['location'];
  minWords?: number;
  maxWords?: number;
  publishedOnly?: boolean;
  offset?: number;
  limit?: number; // default 30, at most 200
}

export interface LibraryInfo {
  lang: LanguageCode;
  id: string; // "library-es@2026-10-01"
  texts: number;
  works: number;
  words: number;
  builtAt: string;
}

export interface Library {
  /** undefined ⇒ no library is installed for the language. */
  info(lang: LanguageCode): Promise<LibraryInfo | undefined>;
  /** A page of the catalogue. Never returns the whole catalogue. */
  search(q: LibraryQuery): Promise<{ total: number; items: CatalogText[] }>;
  entry(textId: string): Promise<CatalogText | undefined>;
  /** The profile of a catalogued text (fetched or computed on demand, cached); undefined when it has none. */
  profile(textId: string): Promise<TextProfile | undefined>;
  /** Make the text readable: import its documents through the ordinary importer if they are not in the store yet. */
  open(textId: string): Promise<Text>;
  /** (Re)index the texts already in the store (bundled and personal copies) so that they are searchable and scorable too. */
  indexStore(lang: LanguageCode): Promise<number>;
}
