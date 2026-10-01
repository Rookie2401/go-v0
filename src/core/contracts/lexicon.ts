/**
 * Dictionary contract: a large external lexicon (built offline from a licensed source) that fills in what the
 * adapters' small hand lexicons do not cover. Implemented in src/dict; consumed by the importer (analysis of
 * supplied texts) and by the UI (status + attribution).
 *
 * A dictionary entry is NOT a contextual analysis: it lists what a written form can mean. The importer stores it
 * with provenance 'lexicon', a confidence below certainty, and every other sense as an alternative; a reviewer's
 * correction or an author span always wins.
 */
import type { RegisterTag } from '../course';
import type { LanguageCode, PartOfSpeech } from '../model';

export interface DictionaryEntry {
  /** Adapter-normalized headword. */
  form: string;
  lang: LanguageCode;
  pos?: PartOfSpeech;
  /** English glosses, most important first. */
  glosses: string[];
  /** Phonemic respelling in the language's own script, syllables separated by "-" (Thai: "ขะ-หฺนม"). */
  respelling?: string;
  ipa?: string;
  romanization?: string;
  register?: RegisterTag[];
  /** Thai: the classifiers a noun takes. */
  classifiers?: string[];
  /** For function words: what the word does ("progressive marker", "softening particle"). */
  role?: string;
  /** Easy definition in the target language, when the source has one. */
  definition?: string;
  /** 1 = most frequent. Absent when the source carries no frequency information (never invented). */
  frequencyRank?: number;
  /** Every sense as imported, with the source's own labels — nothing is merged away. `glosses` is the short view of this. */
  senses?: DictionarySense[];
  /** Every pronunciation the source lists (the first is the one `respelling` / `ipa` / `romanization` show). */
  pronunciations?: DictionaryPronunciation[];
  /** The source's etymology number when one headword has several entries. */
  etymology?: number;
  /** Headwords this entry is an alternative form / spelling of. */
  altOf?: string[];
}

export interface DictionarySense {
  gloss: string;
  /** The source's labels, verbatim ("colloquial", "archaic", "Buddhism" …). */
  tags?: string[];
  topics?: string[];
  /** Number of usage examples the source has for this sense (the examples themselves stay in the source file). */
  examples?: number;
}

export interface DictionaryPronunciation {
  respelling?: string;
  ipa?: string;
  romanization?: string;
  /** The source's labels, verbatim ("Short", "Unorthographical", "bound form", "colloquial" …). */
  tags?: string[];
  /** True when the source says the word is read exactly as written. */
  asWritten?: boolean;
}

export interface DictionaryInfo {
  /** e.g. "kaikki-th@2026-09-30" — becomes part of the analyzer name of every analysis it produces. */
  id: string;
  lang: LanguageCode;
  /** Where the data came from and under what licence, shown to the learner ("Wiktionary via kaikki.org, CC BY-SA 4.0"). */
  attribution: string;
  licence: string;
  entries: number;
  builtAt: string;
  hasFrequency: boolean;
  /** The file the dictionary was built from: enough to fetch the same version again and to cite it. */
  source?: { url?: string; file: string; lastModified?: string; sha256?: string; retrievedAt?: string; lines?: number };
}

/**
 * A recorded disagreement between two sources about one word. Never resolved silently: it stays 'open' until a
 * named person decides, and the decision is kept beside the record.
 */
export interface SourceDisagreement {
  id: string;
  lang: LanguageCode;
  form: string;
  field: 'part-of-speech' | 'meaning' | 'pronunciation' | 'tone' | 'syllables' | 'classifier' | 'register' | 'segmentation' | 'missing';
  ours: { sourceId: string; value: string };
  theirs: { sourceId: string; value: string };
  note?: string;
  status: 'open' | 'resolved';
  resolution?: { by: string; at: string; decision: 'ours' | 'theirs' | 'both' | 'neither'; note?: string };
}

export interface LexiconSource {
  readonly lang: LanguageCode;
  /** undefined ⇒ no dictionary is installed for this language (the normal state until one is built). */
  info(): Promise<DictionaryInfo | undefined>;
  /** Entries for each normalized form that has any. Forms without an entry are simply absent from the map. */
  lookup(forms: readonly string[]): Promise<Map<string, DictionaryEntry[]>>;
}
