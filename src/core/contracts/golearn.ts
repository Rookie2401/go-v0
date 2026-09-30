/**
 * GoLearn service contract — consumed by the reader surfaces, GoListen and GoTell.
 * Implementation lives in src/golearn. Everything here reads/writes AppStore and the EventBus only.
 */
import type {
  AssistanceLevel, ComfortBand, Encounter, EnglishRescue, GrammarPattern, ItemKnowledge, ItemKind, LanguageCode,
  LearnerItemState, Lemma, PersonalizedCoverage, Phrase, PhraseOccurrence, Sentence, Token, TokenAnalysis,
} from '../model';
import type { DomainEvent } from '../events';

/** Layered support for one token — the reader asks for one level at a time. */
export interface TokenSupport {
  token: Token;
  /** Level 1: concise gloss (from lemma gloss or analysis gloss). */
  gloss?: string;
  /** Level 3: resolved analysis (human override > lexicon > machine). */
  analysis?: TokenAnalysis;
  lemma?: Lemma;
  /** Human-readable morphology line, e.g. "verb · 1sg · preterite". */
  morphologyLine?: string;
  /** Phrases this token belongs to in this sentence (level 2). */
  phrases: Array<{ phrase: Phrase; occurrence: PhraseOccurrence }>;
  patterns: GrammarPattern[];
  /** Prior encounters of this form/lemma for this learner (level 3+). */
  priorEncounters: Encounter[];
  /** Other sentences (ids) where the learner has met this lemma. */
  knownExamples: string[];
  /** Whether the analysis is uncertain (confidence < 0.6 or alternatives present). */
  uncertain: boolean;
}

export interface SentenceSupport {
  sentence: Sentence;
  tokens: Token[];
  /** Sentence-level explanation, if authored (level 4). Absent ⇒ UI offers English rescue directly. */
  explanation?: string;
  /** English rescue (level 5) — only returned when explicitly requested. */
  rescue?: EnglishRescue;
  /** Per-token subtle highlighting hint derived from learner state. */
  highlight: Record<string, 'unseen' | 'partial' | 'known'>;
}

export interface ScriptureReadiness {
  textId: string;
  sentenceIds: string[];
  coverage: PersonalizedCoverage;
  familiarItems: Array<{ itemId: string; surface: string; readingLevel: string; listeningLevel: string }>;
  unfamiliarForms: Array<{ itemId: string; surface: string; lemmaId?: string; lemmaKnown: boolean; count: number }>;
  knownPhrases: string[]; // phraseIds
  difficultPatterns: string[]; // patternIds
  /** Items whose acquisition would most raise coverage, best first. */
  prerequisites: Array<{ itemId: string; itemKind: ItemKind; surface: string; gain: number }>;
  /** Existing corpus texts (never generated here) that contain the most prerequisites, best first. */
  preparatoryTexts: Array<{ textId: string; covers: string[]; band: ComfortBand; generated: boolean }>;
  /** Meaningful gaps: content items (not function words) in the passage the learner has not demonstrated. */
  gaps: Array<{ itemId: string; itemKind: ItemKind; surface: string; count: number; status: 'unseen' | 'exposed' | 'needed-help' }>;
  /** False when no available (published, or preview if allowed) text addresses the gaps. */
  corpusCanPrepare: boolean;
  /** Plain explanation when the corpus cannot prepare the learner (which gaps no text covers). */
  limitation?: string;
}

/** Why GoLearn believes what it believes about one item — every number shown to a learner must be explainable. */
export interface ItemExplanation {
  itemId: string;
  summary: string; // "Seen 7 times in 2 texts; needed help twice; understood without help once."
  exposures: number;
  assisted: number;
  demonstrated: number;
  productions: { independent: number; selfRepaired: number; assisted: number; copied: number };
  excludedEvents: number; // e.g. fixture audio plays that were ignored
  texts: Array<{ textId: string; title: string; count: number }>;
}

/** Reading COMPLETION (what was on screen / finished) — deliberately separate from vocabulary coverage. */
export interface ReadingProgress {
  textId: string;
  sentencesTotal: number;
  sentencesViewed: number;
  completedAt?: string;
  /** Last self-report for the text, if any. */
  reportedComprehension?: 'all' | 'most' | 'some' | 'little';
  listenedSentences: number; // real, reviewed speech only
}

/** Result of scanning the log for events that must not count (fixture / non-speech / unreviewed audio). */
export interface EvidenceAudit {
  userId: string;
  policyVersion: string;
  totalEvents: number;
  excluded: Array<{ eventId: string; type: string; reason: 'non-speech-audio' | 'unreviewed-voice' | 'unknown-asset' }>;
  rebuilt: boolean;
}

export type RecommendationReason =
  | 'first-text' | 'next-input' | 'reread' | 'easy-story' | 'reinforces-weak-items' | 'listen-to-read-text'
  | 'prepares-scripture' | 'revisit-scripture' | 'rehearse-testimony';

export interface Recommendation {
  reason: RecommendationReason;
  textId?: string;
  testimonyId?: string;
  band?: ComfortBand;
  /** Items (ids) this recommendation is expected to reinforce. */
  reinforces: string[];
  score: number;
  explanation: string;
}

export interface GoLearn {
  /** Wire onto the bus; idempotent. Returns unsubscribe. */
  attach(): () => void;
  /** Fold one event (used by attach() and by replay). */
  handle(event: DomainEvent): Promise<void>;
  /** Recompute all learner state for a user from the event log (derived state must be recomputable). */
  rebuild(userId: string): Promise<void>;

  getItemState(userId: string, itemId: string): Promise<LearnerItemState | undefined>;
  /** GoTell's main query. `ref` may be a formId, lemmaId, phraseId, patternId, or a raw normalized surface (lang required). */
  queryItem(userId: string, ref: { itemId?: string; surface?: string; lang: LanguageCode }): Promise<ItemKnowledge>;
  queryItems(userId: string, refs: Array<{ itemId?: string; surface?: string; lang: LanguageCode }>): Promise<ItemKnowledge[]>;
  /** All items for a user at or above a level in a modality (vocabulary views, GoTell candidate pools). */
  listKnown(userId: string, lang: LanguageCode, modality: 'reading' | 'listening' | 'writing', minLevel: string): Promise<LearnerItemState[]>;

  resolveAnalysis(tokenId: string): Promise<TokenAnalysis | undefined>;
  /** Human override: adds a new analysis row with provenance 'human' superseding the resolved one. Encounters are untouched. */
  overrideAnalysis(tokenId: string, patch: Partial<Pick<TokenAnalysis, 'lemmaId' | 'pos' | 'morph' | 'notes'>>, who: string): Promise<TokenAnalysis>;

  sentenceSupport(userId: string, sentenceId: string, opts?: { withRescue?: boolean }): Promise<SentenceSupport>;
  tokenSupport(userId: string, tokenId: string, level: AssistanceLevel): Promise<TokenSupport>;

  coverage(userId: string, textId: string, sentenceIds?: string[]): Promise<PersonalizedCoverage>;
  scriptureReadiness(userId: string, textId: string, sentenceIds?: string[], opts?: { includeUnpublished?: boolean }): Promise<ScriptureReadiness>;
  /**
   * Responds to actual state: a first text for a new learner; after a completion, next input / reread / (real)
   * listening; input stays first even after testimony work. Unpublished texts only with includeUnpublished.
   * Never recommends listening when no reviewed real-speech audio exists for the text.
   */
  recommend(userId: string, opts?: { limit?: number; targetTextId?: string; interests?: string[]; includeUnpublished?: boolean; lang?: LanguageCode }): Promise<Recommendation[]>;

  /** Version of the evidence rules. Stored per user in `meta`; a mismatch triggers a rebuild from the log. */
  readonly policyVersion: string;
  /** Rebuild this user's derived state if it was computed under another policy version. Returns true if rebuilt. */
  ensureCurrent(userId: string): Promise<boolean>;
  /** Find events that must not count (fixture / non-speech / unreviewed audio); optionally rebuild without them. */
  auditEvidence(userId: string, opts?: { rebuild?: boolean }): Promise<EvidenceAudit>;
  explainItem(userId: string, itemId: string): Promise<ItemExplanation>;
  readingProgress(userId: string, textId: string): Promise<ReadingProgress>;
}

/** Evidence weights — the single place where assistance discounts and modality rules live. */
export interface EvidencePolicy {
  /** Weight of a reading encounter at a given assistance level (0 = none … 5 = English rescue). Never negative. */
  readingWeight(assistance: AssistanceLevel): number;
  /** Weight of a listening completion given speed, replays and transcript/translation reveals. */
  listeningWeight(args: { speed: number; replays: number; transcriptRevealed: boolean; translationRevealed: boolean }): number;
  /** Weight of a production by kind. independent > selfRepaired > assisted > copied. */
  productionWeight(kind: 'independent' | 'self-repaired' | 'assisted' | 'copied'): number;
  /** Map accumulated evidence + counts to a level for one modality. */
  level(dimension: 'reading' | 'listening' | 'writing' | 'speaking', evidence: number, unassisted: number, assisted: number): string;
}
