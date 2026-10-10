/**
 * The card model: what the popup shows and what the encounter record is built from. Pure data, no DOM, no engine.
 * Candidate for production (with the contract). Every field carries an evidence label (charter section 3):
 *   fact      - observed directly (what the learner selected; how the context was obtained)
 *   analysis  - the parser's best reading, with its confidence and its source; machine-drafted unless a reviewer says otherwise
 *   inference - a learner-state estimate. The prototype has no learner state, so no field carries this label yet.
 */
export type EvidenceLabel = 'fact' | 'analysis' | 'inference';
export type CardProvenance = 'lexicon' | 'rule' | 'none';
export type ContextKindReport = 'sentence' | 'fragment' | 'none';

export interface ContextReport {
  kind: ContextKindReport;
  /** How far the context can be trusted as the real sentence (0 for none). Never raised by the parser. */
  confidence: number;
  reason?: string;
  /** The selection was found inside the given context (offsets agree with the text). */
  selectionLocated: boolean;
  direction?: 'ltr' | 'rtl' | 'unknown';
  /** Hash of the exact sentence (only for kind 'sentence'): the identity the Repository stores instead of the text. */
  sentenceKey?: string;
  /** Hash of a fragment, which is not a sentence identity (only for kind 'fragment'). */
  fragmentKey?: string;
  sentenceChars?: number;
}

export interface PhraseNote { display: string; kind: string; gloss?: string; confidence: number }

export interface WordLine {
  surface: string;
  lemma?: string;
  pos?: string;
  gloss?: string;
  confidence: number;
  provenance: CardProvenance;
}

export interface Alternative { lemma?: string; pos?: string; gloss?: string; confidence: number }

export type LabelledField =
  | 'surface' | 'lemma' | 'pos' | 'morphology' | 'gloss' | 'confidence' | 'provenance'
  | 'phrases' | 'words' | 'notes' | 'basis' | 'pronunciation' | 'context'
  | 'features' | 'constructions' | 'syntax' | 'sentenceWords' | 'learner';

/** One morphological feature of the reading shown (only features the analyser gave). */
export interface FeatureItem { key: string; value: string }

/** One word's place in the sentence as the analyser's syntax rules state it: generated, with its basis and the readings not ruled out. */
export interface SyntaxNote {
  /** 'none' when the analyser has rules but could not attach this word; the notes say why. */
  status: 'generated' | 'conflicted' | 'none';
  relation?: string;
  /** The relation in plain words ("subject of 'lexon'"). */
  label?: string;
  headSurface?: string;
  basis: string[];
  confidence?: number;
  alternatives: Array<{ relation: string; headSurface?: string; confidence: number; why: string }>;
  /** The words that depend on this one, in sentence order. */
  dependents: Array<{ surface: string; relation: string; label: string }>;
  /** The clause this word sits in, when the rules found clause boundaries. */
  clause?: string;
  notes: string[];
  /** The share of the sentence's words the rules could attach (0..1). */
  attached: number;
  analyzer: string;
}

/** A construction the form realizes or takes part in, as the analyser or the form's own features show it. */
export interface ConstructionNote {
  /** The id the language pack explains (`negation-nuk`, `definite-accusative-singular`). */
  id: string;
  /** The Repository unit id the learner model knows it by (`syntax:<lang>:<id>`). */
  unitId: string;
  title: string;
  /** The analyser's own explanation, used when the pack has none. */
  explanation: string;
  confidence: number;
  source: 'pattern' | 'form';
}

/** One word of the sentence, for the word-by-word list (Layer 5). */
export interface SentenceWord { surface: string; lemma?: string; pos?: string; gloss?: string; confidence: number; selected: boolean }

/** The plain-words line about the context the card was made from. */
export function contextLine(c: ContextReport): string {
  if (c.kind === 'sentence') return 'Context: full sentence';
  if (c.kind === 'fragment') return 'Context: a fragment, not a verified sentence';
  const r = c.reason;
  return `Context: only the selected word (${!r || /does not provide sentence context|no sentence/i.test(r) ? 'this reader gives no sentence' : r})`;
}

export interface CardModel {
  languageId: string;
  packId: string;
  analyzerId: string;
  /** The selection as the learner made it (NFC, trimmed). */
  surface: string;
  lemma?: string;
  pos?: string;
  /** Plain-words morphology line ("accusative singular, definite"). */
  morphology?: string;
  gloss?: string;
  /** The analyzer's own confidence for the reading shown (0 when there is none). */
  confidence: number;
  provenance: CardProvenance;
  /** The source of the reading and its review state, when there is one. */
  source?: { id: string; label: string; reviewStatus: string };
  /** The reading was inferred from the written ending, not found in the word list. */
  unconfirmed: boolean;
  phrases: PhraseNote[];
  /** One line per selected word when more than one word is selected (first 12). */
  words: WordLine[];
  alternatives: Alternative[];
  /** Why this reading (the rule or the neighbouring words), as the analyzer states it. */
  basis: string[];
  /** Honest remarks: ambiguity, missing context, unit membership, script mismatch. */
  notes: string[];
  pronunciation: string[];
  context: ContextReport;
  /** Item ids for the encounter: lemma ids when creditable, otherwise form ids. */
  itemIds: string[];
  /** The features of the reading shown (single word only); empty when the analyser gave none. */
  features: FeatureItem[];
  /** Constructions that cover the selection (the analyser's patterns) or that the form's own features show. */
  constructions: ConstructionNote[];
  /** The syntactic role the analyser gave the word, when it gave one. Most analysers give none. */
  role?: string;
  /** Unit membership and parts the analyser reports (a verb with attached pronouns, a particle of a unit). */
  syntaxNotes: string[];
  /** The dependency relation of a single selected word in its sentence (Linguistic Engine V2, Stage 4), when the analyser has syntax rules. */
  syntax?: SyntaxNote;
  /** Every word of the sentence with its best reading, when there is sentence context (first 60 words). */
  sentenceWords: SentenceWord[];
  /** The Repository unit ids to ask the learner model about: the form, the lemma, the constructions. */
  unitIds: string[];
  /** The form unit id of a single-word selection (what a correction refers to). */
  formId?: string;
  tokenCount: number;
  labels: Record<LabelledField, EvidenceLabel>;
  limits: string[];
}
