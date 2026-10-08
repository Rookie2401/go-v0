/**
 * Shared types of the Norwegian analyzer (Bokmål `nb` and Nynorsk `nn`).
 *
 * MACHINE-DRAFTED: every lexicon row, every paradigm rule and every table under src/adapters/norwegian was written by a
 * model from its own knowledge of Norwegian and the recon notes in docs/norway/recon/linguistics-policy.md (Part B).
 * None of it has been checked against Norsk ordbank / Ordbøkene or by a native speaker. Entries carry
 * `source: 'machine-draft'`; table cells the recon marks (?) carry `unverified: true`. Where the lexicons of the
 * Language Council disagree with this data, the lexicons win and this data is the bug.
 */
import type { PartOfSpeech, RegisterTag } from '../../core';

export type NoStandard = 'nb' | 'nn';

/** Provenance of a lexicon entry. There is exactly one value: nothing here has been reviewed by a person. */
export type EntrySource = 'machine-draft';

export interface Provenance {
  source: EntrySource;
  /** The table cell is one the recon marks (?) or that the author is unsure of; shown on the reading as notes.unverified. */
  unverified?: boolean;
}

export type NoGender = 'm' | 'f' | 'n';

/**
 * A noun. `forms` are the written forms the paradigm generator produced, grouped by cell, so that the lexicon index
 * can turn each into a reading. Both feminine paradigms are generated for a feminine noun (ei bok / boka and en bok /
 * boken): the lemma and the plural are the same.
 */
export interface NoNoun extends Provenance {
  lemma: string;
  gender: NoGender;
  /** True for a feminine noun that is also valid with the masculine definite (boka and boken). */
  alsoMasc: boolean;
  gloss: string;
  /** Plural only (penger, foreldre): no singular forms. */
  pluralOnly?: boolean;
  /** Singular only (melk, tid). */
  massNoun: boolean;
  /** Indefinite plural forms (usually one). */
  plural: string[];
  defSg: Array<{ form: string; gender: 'Masc' | 'Fem' | 'Neut' }>;
  defPl: string[];
  /** Proper noun (a name): no plural, never capitalisation-checked. */
  proper?: boolean;
  register?: RegisterTag[];
  varieties?: string[];
  topic?: string;
}

export interface NoVerb extends Provenance {
  lemma: string;
  /** Other valid infinitives of the same verb (Nynorsk kaste / kasta; vera / vere). */
  infinitives: string[];
  cls: '1' | '2' | '3' | '4' | 's' | 'i' | 'a' | 'e';
  gloss: string;
  present: string[];
  past: string[];
  /** The perfect participle (supine, "har kastet"). */
  supine: string[];
  /** Participle used as an adjective in the plural / definite (stengte, stjålne). */
  participleAdj: string[];
  imperative: string[];
  /** -s / -st passive forms of the infinitive and the present. */
  passive: string[];
  /** The deponent -s verbs (synes, finnes) are their own lemmas; their passive list is their whole paradigm. */
  deponent?: boolean;
  reflexive?: boolean;
  /** Modal verbs are AUX. */
  aux?: boolean;
  /** The perfect auxiliary when it is not har (er kommet). */
  perfectAux?: 'er';
  register?: RegisterTag[];
  varieties?: string[];
}

export interface NoAdjective extends Provenance {
  lemma: string;
  gloss: string;
  /** Neuter singular indefinite. */
  neuter: string[];
  /** Plural and definite singular. */
  plural: string[];
  /** Feminine singular (lita) when different from the common form. */
  feminine?: string[];
  comparative: string[];
  superlative: string[];
  /** Definite superlative (største). */
  superlativeDef: string[];
  /** Comparison uses mer / mest. */
  periphrastic: boolean;
  /** Same form in every cell (bra, rosa). */
  invariable: boolean;
  register?: RegisterTag[];
  varieties?: string[];
}

/** An entry of the closed classes and of plain uninflected words: every form is written out. */
export interface NoWordForm extends Provenance {
  form: string;
  lemma: string;
  pos: PartOfSpeech;
  gloss: string;
  morph: Record<string, string>;
  /** What the word does in the sentence when the gloss is not enough. */
  role?: string;
  register?: RegisterTag[];
  varieties?: string[];
  /** Ranking among readings of the same form (lower is more frequent). */
  rank?: number;
}

/** One reading of a written form, before the sentence layer. */
export interface NoReading {
  lemma: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
  gloss?: string;
  /** Plain words: how the reading was reached. */
  rule: string;
  confidence: number;
  role?: string;
  register?: RegisterTag[];
  varieties?: string[];
  unverified?: boolean;
  /** Lexicon order, for ties. */
  order: number;
  /** For nouns: the gender of the lemma. */
  gender?: NoGender;
  /** For verbs: the verb carries a particle in the unit table. */
  topic?: string;
}

export const MORPH_KEYS = ['Gender', 'Number', 'Definite', 'Case', 'VerbForm', 'Tense', 'Mood', 'Voice', 'Degree', 'Person', 'PronType', 'Poss', 'Reflex', 'Polarity'] as const;
