/**
 * Spanish morphology engine — STUB written by the coordinator so that the other packages compile.
 * Package S1 (docs/PLAN9.md) replaces the bodies; the exported names and signatures are the contract.
 */
import type { PartOfSpeech, WordPart } from '../../core';

/** One reading of a written form. Several can be right at once (canto: noun, or 1st person present of cantar). */
export interface SpanishAnalysis {
  lemma: string;
  pos: PartOfSpeech;
  /** Universal-Dependencies-style features: VerbForm, Mood, Tense, Person, Number, Gender, Polite, Degree … */
  morph: Record<string, string>;
  /** Verb + attached pronouns, or the halves of a contraction. Offsets within the form. */
  parts?: WordPart[];
  /** 'voseo', 'vosotros', 'es-hist' … when the form belongs to a variety rather than to general Spanish. */
  varieties?: string[];
  /** In plain words, how the form was reached ("regular -ar verb, imperfect indicative, first person plural"). */
  rule: string;
  /** True when the lemma was confirmed by `knownLemma`; a rule-only guess stays below 0.8. */
  lemmaKnown: boolean;
  confidence: number;
}

export interface AnalyzeOptions {
  /** Is this a real lemma (of this part of speech, when given)? Supplied by the adapter from its lexicon / a dictionary. */
  knownLemma?: (lemma: string, pos?: PartOfSpeech) => boolean;
}

/** Every reading the rules allow for one normalized (lower-case, NFC) form, best first. Empty when none applies. */
export function analyzeSpanishForm(_form: string, _opts?: AnalyzeOptions): SpanishAnalysis[] {
  return [];
}

/** A plain-words description of a feature bundle ("first person plural, imperfect subjunctive"). */
export function describeSpanishMorph(_morph: Record<string, string>): string {
  return '';
}

/** All finite and non-finite forms of a verb the engine can conjugate (irregulars from its tables); undefined otherwise. */
export function conjugateSpanish(_lemma: string): Array<{ form: string; morph: Record<string, string>; varieties?: string[] }> | undefined {
  return undefined;
}
