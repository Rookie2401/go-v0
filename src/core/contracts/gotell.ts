/**
 * GoTell service contract — constrained production. First surface: My Testimony.
 * Built as a general engine: `analyzeProduction` takes any text + task, testimony functions wrap it.
 * Reports productive evidence to GoLearn through ProductionRecorded events; keeps no vocabulary model.
 */
import type { ErrorCategory, GoTellSuggestion, ItemKnowledge, LanguageCode, ProvenanceRef, SemanticSection, SuggestionSource, Testimony, TestimonyDraft, TestimonyRevision } from '../model';
import type { GoTellPractice } from './gotell-practice';

export type * from './gotell-practice';

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
  /**
   * True only when the engine could map the English to target-language wording it can stand behind.
   * When false: `limitation` explains why, `proposal` is absent and `insertable` is false — nothing to insert.
   * The proposal is ALWAYS built from the stated meaning, never from an existing draft or revision.
   */
  supported: boolean;
  insertable: boolean;
  limitation?: string;
  /** Closest expression mostly built from encountered language (present only when supported). */
  proposal?: string;
  /** The encountered sentences the wording was taken from. */
  sources: SuggestionSource[];
  /** Parts of the meaning that could not be expressed (e.g. a concept with no encountered wording). */
  unexpressed: string[];
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

  // ── autosaved drafts (never evidence, never a version) ──
  getDraft(userId: string, lang: LanguageCode): Promise<TestimonyDraft | undefined>;
  /**
   * Upsert the working draft. Rejects (throws DraftConflictError-like Error with name 'DraftConflict') when
   * `expectedSeq` is given and a newer draft exists, so a stale tab cannot overwrite newer writing.
   */
  saveDraft(userId: string, lang: LanguageCode, text: string, opts?: { expectedSeq?: number; basedOnRevisionId?: string }): Promise<TestimonyDraft>;
  clearDraft(userId: string, lang: LanguageCode): Promise<void>;
  /** Recovery: copy a saved version's text into the working draft (the version itself is untouched). */
  restoreRevisionAsDraft(revisionId: string): Promise<TestimonyDraft>;

  /** Privacy: every accessor checks the requesting user owns the testimony. */
  assertOwner(userId: string, testimonyId: string): Promise<void>;

  /** The productive-language engine (practice saying things). Optional: a GoTell without it still serves My Testimony. */
  practice?: GoTellPractice;
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
