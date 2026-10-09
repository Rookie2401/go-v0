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
  | 'phrases' | 'words' | 'notes' | 'basis' | 'pronunciation' | 'context';

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
  tokenCount: number;
  labels: Record<LabelledField, EvidenceLabel>;
  limits: string[];
}
