/**
 * Hindi word forms by rule: nouns (direct, oblique, vocative; the marked -ा / -ी classes and the unmarked ones),
 * adjectives that agree and those that do not, pronouns with their oblique and fused forms (मुझे, मुझसे, उसने, किसको),
 * the genitive का / के / की, and verbs — stem, infinitive, the imperfective and perfective participles, subjunctive,
 * future, commands at three levels of politeness, the conjunctive कर / करके, irregular perfectives (गया, किया, लिया,
 * दिया, हुआ, पिया), causatives related to their base verb.
 *
 * A reading says how it was reached (`rule`, in plain words), how sure it is, and whether the lemma is one the word
 * list vouches for. A lemma that is only inferred stays at 0.6 or less. Feature names and values: docs/PLAN12.md.
 *
 * CONTRACT STUB (docs/PLAN12.md, package H2). The exported signatures are final.
 */
import type { PartOfSpeech, RegisterTag, WordPart } from '../../core';

/** What the word list knows about a lemma, for the rules that depend on it. */
export interface HindiLemmaInfo {
  pos: PartOfSpeech;
  /** Nouns: the gender decides the paradigm. */
  gender?: 'm' | 'f' | 'mf';
  /** An adjective or noun that does not change its ending (सुंदर, लाल; the noun पिता, राजा, नेता: masculine in -ा that keeps it). */
  invariant?: boolean;
  /** Verbs: takes ने in the perfective (transitive in the relevant sense). Unknown ⇒ undefined, never guessed. */
  ergative?: boolean;
  /** Verbs: the base verb this one is the causative of (कराना → करना, दिखाना → देखना). */
  causativeOf?: string;
}

export interface HindiAnalyzeOptions {
  /** Is this lemma (with this part of speech, when given) in the word list? Without it every lemma is inferred. */
  knownLemma?(lemma: string, pos?: PartOfSpeech): boolean;
  lemmaInfo?(lemma: string, pos: PartOfSpeech): HindiLemmaInfo | undefined;
}

export interface HindiAnalysis {
  lemma: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
  /** A fused word: stem + postposition or particle (उसने, मुझसे, इसीलिए …). Offsets within the form. */
  parts?: WordPart[];
  register?: RegisterTag[];
  /** In plain words, how the form was reached ("masculine noun in -ा, oblique plural"). */
  rule: string;
  /** True when the lemma was confirmed by `knownLemma`; a rule-only guess stays at 0.6 or less. */
  lemmaKnown: boolean;
  confidence: number;
}

/** Every reading the rules give for one form (NFC), best first. Empty when nothing can be derived. */
export function analyzeHindiForm(form: string, opts: HindiAnalyzeOptions = {}): HindiAnalysis[] {
  void form; void opts;
  return [];
}

/** The forms of a lemma with their features: a noun's or adjective's paradigm, a verb's stem, participles and finite forms. */
export function inflectHindi(lemma: string, pos: PartOfSpeech, info?: HindiLemmaInfo): Array<{ form: string; morph: Record<string, string> }> {
  void lemma; void pos; void info;
  return [];
}

/** कहना → कह; undefined when the lemma is not an infinitive in -ना. */
export function hindiVerbStem(lemma: string): string | undefined {
  return lemma.endsWith('ना') && lemma.length > 2 ? lemma.slice(0, -2) : undefined;
}

/** "feminine singular, perfective participle", "oblique plural", "polite command": plain words for a feature bundle. */
export function describeHindiMorph(morph: Record<string, string>, pos?: PartOfSpeech): string {
  void pos;
  return Object.entries(morph).map(([k, v]) => `${k} ${v}`).join(', ');
}
