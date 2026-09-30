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
  preparatoryTexts: Array<{ textId: string; covers: string[]; band: ComfortBand }>;
}

export type RecommendationReason =
  | 'easy-story' | 'reinforces-weak-items' | 'listen-to-read-text' | 'prepares-scripture' | 'revisit-scripture' | 'rehearse-testimony';

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
  scriptureReadiness(userId: string, textId: string, sentenceIds?: string[]): Promise<ScriptureReadiness>;
  recommend(userId: string, opts?: { limit?: number; targetTextId?: string; interests?: string[] }): Promise<Recommendation[]>;
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
