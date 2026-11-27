/**
 * Alphabet Sprint: the contract every language profile and the engine share (docs/goreview-app/ALPHABET-SPRINT.md).
 *
 * The goal is the shortest path from an unfamiliar writing system to reading real words. A profile describes a language's
 * writing as SCRIPT UNITS (letters, final forms, vowel signs, marks, digraphs and the decoding RULES that are not one symbol)
 * and lists real STARTER WORDS and PHRASES with the units each one needs. The engine picks the few units that unlock the most
 * useful words, builds the cards, reads the learner's script knowledge from their card history, and measures script readiness.
 *
 * Script knowledge is not vocabulary knowledge. Every Sprint card is a `class:` unit (ids.ts), so its reviews never touch a
 * lemma or form record, never count in My vocab and never move the page's "words known" figure.
 */

/** What a script unit is. `rule` is a decoding regularity that is not a written symbol of its own (inherent vowel, dagesh, final -e silent …). */
/** `positional-form`: a letter's joined shape at one position in a word (Arabic: the start-and-middle shape of ب ت ث ن ي), shown to the learner as a "joined shape". */
export type ScriptUnitKind = 'letter' | 'final-form' | 'vowel-sign' | 'mark' | 'digraph' | 'cluster' | 'positional-form' | 'tone-mark' | 'rule';

export interface ScriptUnit {
  /** Stable key inside the profile (and inside its card id). Usually the glyph as written (`б`, `ש׳`, `ch`, `ि`), or a short rule name (`rule-dagesh`). */
  key: string;
  kind: ScriptUnitKind;
  /** What the card front shows (`б`, `◌ִ`, `ch`). For a rule, an example that needs it. */
  display: string;
  /** The back: the sound or the role, short. No letter names are required to read; a name may follow the sound. */
  sound: string;
  /** One example from the profile's own words (form and gloss), optional. */
  example?: { form: string; gloss: string };
  /** A short extra line for the back (one sentence). */
  note?: string;
  /**
   * The shape is already familiar to an English reader AND its usual sound is close enough to English that it needs no teaching
   * (Latin-script languages: most of a–z). A familiar unit counts as known for decoding and is never introduced as new.
   */
  familiar?: boolean;
  /** How hard the written-to-spoken mapping is, 1 (one sound, plain shape) .. 3 (contextual, several sounds). Default 1. */
  difficulty?: 1 | 2 | 3;
}

/** A real word for decoding practice. Never a pseudoword. */
export interface StarterWord {
  /** As written (NFC), with the pointing/accents a beginner's text has. */
  form: string;
  /** A short English meaning from the pack's own data; secondary to decoding. */
  gloss: string;
  /** How it is said, by the pack's own romanisation where one exists (omitted when none is trustworthy). */
  pronunciation?: string;
  /** Usefulness 0..1 (frequency rank or a course-core word); higher is more useful. */
  weight: number;
  /** Where the word and gloss come from (file or table), for the provenance note. */
  source: string;
}

export interface StarterPhrase {
  form: string;
  /** A natural translation. */
  gloss: string;
  pronunciation?: string;
  source: string;
}

/** A reading tradition when one language is read with different sound values (Modern vs Classical Greek). */
export interface Tradition {
  id: string;
  label: string;
  /** Varieties (repository-contract varieties) read in this tradition. */
  varieties: readonly string[];
}

export interface ScriptProfile {
  /** The pack language (`th`, `he`, `el` …). */
  languageId: string;
  /** ISO 15924 script (`Thai`, `Hebr`, `Grek`, `Deva`, `Latn`). */
  scriptId: string;
  /** The tradition this profile reads in, when the language has more than one (its id goes into the card ids). */
  tradition?: Tradition;
  /** Right-to-left script. */
  rtl?: boolean;
  /** How many new units a first sprint introduces (4–6 for an alphabet; fewer for a complex script). */
  firstBatch: number;
  /** True for a script whose letters are not readable without marks (a pointed abjad): the learner's page counts steer the choice only once a first word can be read. */
  pagesAfterFirstWord?: boolean;
  /** How many new units a later sprint introduces at most. */
  laterBatch: number;
  units: readonly ScriptUnit[];
  words: readonly StarterWord[];
  phrases: readonly StarterPhrase[];
  /** Pairs of unit keys a learner easily confuses (shape or sound), each with a one-line way to tell them apart. */
  confusions: ReadonlyArray<{ a: string; b: string; tell: string }>;
  /**
   * The unit keys a written form needs to be decoded, or undefined when the profile cannot model it (the word is then never used
   * as a decoding exercise). A rule is listed when the form needs it (a dagesh, an inherent vowel, a silent letter …).
   * Must accept any form found on a page, not only the starter words.
   */
  dependencies(form: string): readonly string[] | undefined;
  /** Split running text into the word tokens a reader decodes (default: letters and marks between spaces and punctuation). */
  words_of?(text: string): string[];
  /** Notes for the deck: provenance, what is not reviewed, what the profile cannot model. */
  notes: string;
}

/** The six knowledge levels, with their SCRIPT meanings (knowledge.ts). */
export type ScriptLevel = 'new' | 'seen' | 'recognized' | 'familiar' | 'known' | 'automatic';

/** One card the Sprint asks. `unitKey` names the unit for character/rule cards; `form` the word or phrase; `pair` a contrast. */
export type SprintCardKind = 'character' | 'rule' | 'word' | 'phrase' | 'contrast';

export interface SprintCard {
  kind: SprintCardKind;
  /** The class unit id (ids.ts). */
  unitId: string;
  /** Front. */
  front: string;
  /** Back. */
  back: string;
  /** Why this card is here (for tests, diagnostics and the deck notes). */
  reason: string;
}
