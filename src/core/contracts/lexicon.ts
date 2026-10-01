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
}

export interface LexiconSource {
  readonly lang: LanguageCode;
  /** undefined ⇒ no dictionary is installed for this language (the normal state until one is built). */
  info(): Promise<DictionaryInfo | undefined>;
  /** Entries for each normalized form that has any. Forms without an entry are simply absent from the map. */
  lookup(forms: readonly string[]): Promise<Map<string, DictionaryEntry[]>>;
}
