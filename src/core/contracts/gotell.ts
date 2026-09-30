/**
 * GoTell service contract — constrained production. First surface: My Testimony.
 * Built as a general engine: `analyzeProduction` takes any text + task, testimony functions wrap it.
 * Reports productive evidence to GoLearn through ProductionRecorded events; keeps no vocabulary model.
 */
import type { ErrorCategory, GoTellSuggestion, ItemKnowledge, LanguageCode, ProvenanceRef, SemanticSection, Testimony, TestimonyRevision } from '../model';

export type ProductionTask = 'testimony' | 'explain-passage' | 'about-church' | 'answer-question' | 'retell' | 'free';

export interface AnalyzedSentence {
  index: number;
  text: string;
  tokenSurfaces: string[]; // adapter tokenization (no whitespace assumption)
  itemIds: string[]; // form ids (+ phrase ids detected)
  knowledge: ItemKnowledge[];
  errors: Array<{ category: ErrorCategory; message: string; affectsMeaning: boolean; span: [number, number] }>;
  section?: SemanticSection;
  /** Fraction of word tokens the learner has ≥ recognized (reading) — is he writing within his language? */
  familiarity: number;
}

export interface ProductionAnalysis {
  draftHash: string;
  lang: LanguageCode;
  sentences: AnalyzedSentence[];
  /** Prioritized, capped (a beginner is not shown twenty corrections). */
  suggestions: GoTellSuggestion[];
  /** Items the learner produced correctly with no suggestion touching them — candidates for independent production. */
  independentItemIds: string[];
}

export interface IntentRequest {
  userId: string;
  lang: LanguageCode;
  /** English "what are you trying to say?" — used only to determine meaning. */
  english: string;
  /** The learner's own attempt, if any. */
  attempt?: string;
  task?: ProductionTask;
}

export interface IntentProposal {
  /** Closest expression mostly built from acquired language. */
  proposal: string;
  familiar: ProvenanceRef[];
  newItems: Array<{ itemId: string; surface: string; gloss?: string; whyNeeded: string }>;
  /** Alternative that avoids new language entirely, if one exists (may be less precise; say so). */
  fallbackWithoutNew?: { text: string; lossNote: string };
  meaningNote?: string;
}

export interface GoTell {
  getOrCreateTestimony(userId: string, lang: LanguageCode): Promise<Testimony>;
  /** Analyze a draft against learner state; stores suggestions (status 'shown') and emits events. Does not create a revision. */
  submitDraft(testimonyId: string, text: string): Promise<ProductionAnalysis>;
  /** General engine entry used by submitDraft and future tasks. */
  analyzeProduction(args: { userId: string; lang: LanguageCode; text: string; task: ProductionTask; contextId: string }): Promise<ProductionAnalysis>;

  acceptSuggestion(suggestionId: string): Promise<void>;
  rejectSuggestion(suggestionId: string): Promise<void>;
  editSuggestion(suggestionId: string, finalText: string): Promise<void>;

  /**
   * Freeze the current text as a new revision. Classifies every item in it: items covered by an accepted
   * suggestion → assisted/copied; items the learner changed himself after a suggestion → self-repaired;
   * untouched correct items → independent. Emits ProductionRecorded per item and IndependentProductionDetected.
   */
  acceptRevision(testimonyId: string, text: string): Promise<TestimonyRevision>;
  listRevisions(testimonyId: string): Promise<TestimonyRevision[]>;
  diffRevisions(aId: string, bId: string): Promise<Array<{ kind: 'same' | 'added' | 'removed' | 'changed'; a?: string; b?: string }>>;

  /** Optional English intent rescue — constrained by GoLearn, never a polished translation. */
  intent(req: IntentRequest): Promise<IntentProposal>;

  /** Privacy: every accessor checks the requesting user owns the testimony. */
  assertOwner(userId: string, testimonyId: string): Promise<void>;
}

/**
 * Pluggable suggestion source. The rule-based provider (adapters' checkProduction + GoLearn recombination
 * search) ships now; an LLM-backed provider can be added later behind this same interface and MUST still
 * return items constrained by the learner's ItemKnowledge and must never add biographical content.
 */
export interface SuggestionProvider {
  readonly id: string;
  propose(args: {
    userId: string;
    lang: LanguageCode;
    sentence: AnalyzedSentence;
    knownPhrases: Array<{ phraseId: string; display: string; pattern: string[] }>;
    task: ProductionTask;
  }): Promise<Array<Omit<GoTellSuggestion, 'id' | 'userId' | 'lang' | 'testimonyId' | 'draftHash' | 'status' | 'createdAt' | 'familiar' | 'newItems'> & { itemIds: string[] }>>;
}
