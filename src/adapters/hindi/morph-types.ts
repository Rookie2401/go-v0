/**
 * Shared shapes of the Hindi morphology engine (package H2, docs/PLAN12.md). Machine-drafted.
 *
 * A module (nouns, pronouns, verbs) turns one written form into `Raw` readings; `morphology.ts` then decides
 * confidence, order and the cap. A module never decides confidence for a lemma the word list vouches for: it only
 * says whether it is vouched for (`known`) and how diagnostic the ending was (`prior`, 0..1).
 */
import type { PartOfSpeech, RegisterTag, WordPart } from '../../core';
import type { HindiLemmaInfo } from './morphology';

/** closed: our own closed table (pronouns, possessives, का); rule: a regular paradigm; assumed: the paradigm had to be assumed (no gender / invariance given); guess: the lemma is only inferred. */
export type Tier = 'closed' | 'rule' | 'assumed' | 'guess';

export interface Raw {
  lemma: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
  parts?: WordPart[];
  register?: RegisterTag[];
  rule: string;
  /** The word list vouches for this lemma (with this part of speech). */
  known: boolean;
  tier: Tier;
  /** How diagnostic the ending is for this reading (0..1); orders guesses, and orders readings of equal confidence. */
  prior: number;
  /** Readings of one paradigm share this key; a form that belongs to two paradigms of vouched lemmas is ambiguous between paradigms. */
  paradigm: string;
  /** Extra facts about how the reading was reached (`derivedFrom`: the base of an abstract noun). */
  notes?: Record<string, string>;
}

/** What the caller's word list can say, with every call guarded (a missing callback answers "no"). */
export interface Ctx {
  /** The list vouches for this lemma with this part of speech. */
  known(lemma: string, pos: PartOfSpeech): boolean;
  /** The list vouches for this lemma with this part of speech, or (closed classes) with any. */
  knownAny(lemma: string, pos: PartOfSpeech): boolean;
  /** A verb lemma, as VERB or AUX. */
  knownVerb(lemma: string): boolean;
  info(lemma: string, pos: PartOfSpeech): HindiLemmaInfo | undefined;
  /** The caller gave a word list at all (without one every lemma is inferred). */
  hasList: boolean;
}
