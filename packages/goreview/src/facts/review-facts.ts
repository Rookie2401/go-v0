/**
 * `ReviewFacts`: the facts GoReview's builders read. A structural extension of the shared `UnitFacts` (types.ts), so a
 * value of this type IS a `UnitFacts` and any code that only knows `UnitFacts` keeps working. Every extra field is optional
 * and its absence means "not known": a builder that needs one refuses to build rather than guess.
 *
 * The extras exist because the shared type carries no per-form status, no per-sentence reading and no feature vocabulary,
 * and a grammar or productive exercise must know all three (see README, "Gaps in types.ts").
 */
import type { AnalysisStatus, ProvenanceSource } from '../../../repository-contract/src';
import type { UnitFacts } from '../types';

/** One inflected form the pack can vouch for, with the status of its best reading in the pack's own sentences. */
export interface FormInfo {
  /** Normalised (lower-case) surface. */
  surface: string;
  features: Record<string, string>;
  /** The best status of this form across the pack sentences in which it is the top reading (never `conflicted`: those are left out). */
  status: AnalysisStatus;
  /** The Repository id of the morphological construction the form realises (`morph:sq:NOUN:…`), when it has features. */
  constructionId?: string;
}

/** The reading of the target in one example sentence; parallel to `exampleSentences`. */
export interface ExampleReading {
  surface: string;
  lemma?: string;
  pos?: string;
  features: Record<string, string>;
  status: AnalysisStatus;
  constructionId?: string;
}

export interface FormGroup { lemma: string; pos?: string; forms: FormInfo[] }

export interface FeatureDef { label: string; values: Record<string, string>; /** The pack's plain-words explanation of the feature. */ explain?: string }

export interface ReviewFacts extends UnitFacts {
  /** The unit was not in the Repository; it was derived from the pack alone (provenance ref says so). */
  derivedFromPack?: boolean;
  /** Where the unit's data came from (hand lexicon, rule, dictionary, …). `rule` = produced by the word-form rules. */
  source?: ProvenanceSource;
  /** The lemma (not only the form) is an entry of the pack's word list: the adapter reads it as a non-guessed, non-rule reading. */
  lemmaInWordList?: boolean;
  /** The first N entries of `glosses` come from the word list; the rest are dictionary senses. */
  lexiconGlossCount?: number;
  /** The adapter's plain description of the form's features ("definite masculine accusative singular"). */
  morphDescription?: string;
  /** The pack's vocabulary for the features this unit uses (and the ones its sibling forms use): label and value names. */
  featureDefs?: Record<string, FeatureDef>;
  exampleReadings?: ExampleReading[];
  /** Forms of one or more lemmas, as the pack's own sentences show them. A lemma or form unit has one group; a construction has one per lemma realising it. */
  formGroups?: FormGroup[];
  /** Other readings of the same written form, each with its gloss, so a grader can tell an answer for another sense from a wrong one. */
  alternativeReadings?: Array<{ lemma: string; pos?: string; glosses: string[] }>;
}

/** Reads the extras off a `UnitFacts` (all absent when the facts did not come from the provider). */
export const reviewFacts = (f: UnitFacts): ReviewFacts => f as ReviewFacts;
