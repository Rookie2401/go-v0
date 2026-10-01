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

/**
 * Reading progress for the CURRENT content version of a text. Five notions are kept apart everywhere:
 *
 *  1. displayed / previewed — the text was opened or a panel showed it (`TextViewed`). Nothing is counted.
 *  2. reading exposure      — a sentence stayed in view long enough to plausibly be read (`SentenceViewed`).
 *                             This is `sentencesSeen`. It is NOT "read" and not comprehension.
 *  3. explicit completion   — the learner said he finished (`TextCompleted`). Only this sets `finishedAt`;
 *                             seeing every sentence never implies completion.
 *  4. reported understanding — `ComprehensionReported` degree 'all' without help: `sentencesUnderstood`.
 *  5. estimated familiarity — a labelled estimate on items (`DimensionState.estimatedFamiliar`), never progress.
 */
export interface ReadingProgress {
  // ── scope: THE canonical record for (learner, language, text, content version). Home, the library and the
  //    reader all render this one record; none of them computes progress itself. ──
  userId: string;
  lang: LanguageCode;
  textId: string;
  /** The content version these numbers describe (its live sentences only). */
  contentVersion: number;
  sentencesTotal: number;
  /** Notion 2: live sentences with at least one reading exposure. Label: "Seen", never "Read". */
  sentencesSeen: number;
  /** Notion 4: live sentences the learner reported understanding without sentence-level help. */
  sentencesUnderstood: number;
  /**
   * Notion 3: explicit completion OF THIS CONTENT VERSION (a TextCompleted whose contentVersion equals the
   * current one; an event without a version counts only while the text is still at version 1). Finishing is a
   * statement by the learner and is independent of `sentencesSeen`: a text can be finished with few or no
   * sentences recorded as seen (he read it elsewhere, quickly, or with the window unfocused).
   */
  finishedAt?: string;
  /** He finished an EARLIER version; the text has changed since. Shown as such, never as "Finished". */
  finishedEarlierVersion?: { version?: number; at: string };
  /**
   * Exposure recorded against sentences that are no longer part of the text (retired by a revision or by the
   * legacy migration). It is history: kept, reported here explicitly, never counted in `sentencesSeen`.
   */
  earlierVersions?: { sentencesSeen: number; sentencesUnderstood: number };
  /**
   * The last whole-text self-report OF THIS CONTENT VERSION, if any (a ComprehensionReported with scope 'text' whose
   * contentVersion equals the current one; a report without a version counts only while the text is still at
   * version 1 — the same conservative rule as `finishedAt`). A report made about earlier wording is never shown as
   * understanding of the current wording: it is `reportedEarlierVersion`.
   */
  reportedComprehension?: 'all' | 'most' | 'some' | 'little';
  /**
   * The last whole-text self-report made about an EARLIER version of the text. History: kept and shown as such
   * ("you said you understood all of an earlier version"), never used as a statement about the current wording by
   * recommendations, readiness or display. Sentence-level evidence of unchanged sentences is unaffected (it lives in
   * `sentencesUnderstood`, which follows sentence identity).
   */
  reportedEarlierVersion?: { degree: 'all' | 'most' | 'some' | 'little'; version?: number; at: string };
  /** Distinct reading sittings in which this text was seen (see Encounter.sitting). */
  sittings: number;
  listenedSentences: number; // real, reviewed speech only
  /** Time of the latest event this record includes (two surfaces showing the same asOf must show the same numbers). */
  asOf?: string;
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
  /** The same canonical records for several texts from ONE read of the log (lists: library, Home). */
  readingProgressMany(userId: string, textIds: string[]): Promise<Map<string, ReadingProgress>>;
  // ── course-level reading model (see docs/THAI_COURSE.md; language-neutral) ──
  /** What a text will be like for THIS learner, before he opens it. Optional to look at; never a gate. */
  predictDifficulty(userId: string, textId: string, opts?: { sentenceIds?: string[] }): Promise<DifficultyForecast>;
  /** Whether the learner looks ready to move past a stage — several signals, never completion alone. */
  stageReadiness(userId: string, courseId: string, stageId?: string): Promise<StageReadiness>;
  /** Quiet reading-pace measures from what was already recorded (dwell, lookups, rescues). Not a score. */
  readingPace(userId: string, opts?: { textId?: string; stageId?: string; lang?: LanguageCode }): Promise<ReadingPace>;
  /** The learner's whole history with one item, across every text and surface. */
  itemHistory(userId: string, itemId: string): Promise<ItemHistory>;

  /**
   * Resolves when every event emitted so far has been folded into derived state. All read methods of GoLearn
   * already wait for this internally (a read never observes a half-applied fold); the UI awaits it instead of
   * guessing with a timer before it re-reads.
   */
  settled(): Promise<void>;
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

// ───────────────────────────── course-level reading model ─────────────────────────────

export interface ForecastItem { itemId: string; itemKind: ItemKind; surface: string; count: number; gloss?: string; register?: string[] }

/**
 * A prediction for one text and one learner. Every category is derived from recorded evidence and from the
 * text's own analysis; where the system lacks data (no frequency information, words without analysis) it says so
 * in `limits` instead of inventing a number.
 */
export interface DifficultyForecast {
  textId: string;
  userId: string;
  coverage: PersonalizedCoverage;
  /** shown + likely familiar, as one figure for display ("Predicted coverage: 94.7 %"). An estimate. */
  predictedCoverage: number;
  /** New to the learner and likely to recur (repeated in this text or its work, or frequent in the corpus). */
  newUsefulWords: ForecastItem[];
  /** New, and occurring once with no sign of being common. */
  rareWords: ForecastItem[];
  /** Phrase units met before that still needed help. */
  weakPhrases: ForecastItem[];
  /** Constructions in this text the learner has not met. */
  newConstructions: ForecastItem[];
  properNouns: ForecastItem[];
  /** Words that carry a non-standard variety tag (regional, historical, literary…), by tag. */
  varieties: Record<string, number>;
  /** Words in the text with no analysis at all (the dictionary does not cover them). */
  unanalysedWords: number;
  limits: string[];
  summary: string;
}

export type ReadinessSignalKey =
  | 'lexical-coverage' | 'lookup-rate' | 'sentence-rescue-rate' | 'reported-comprehension'
  | 'reading-pace-trend' | 'unfamiliar-material' | 'retention' | 'listening'
  /** Script decoding: how often the learner still opens the decoding of a word (pre-reader stage). */
  | 'decoding';

export interface ReadinessSignal {
  key: ReadinessSignalKey;
  value?: number;
  /** What the signal is compared with, in words ("≥ 95 % comfortable coverage on unread same-stage texts"). */
  target: string;
  status: 'met' | 'not-met' | 'insufficient-data' | 'not-available';
  explanation: string;
}

/** Advancement is advice from several signals. Finishing a book is never sufficient on its own. */
export interface StageReadiness {
  userId: string;
  courseId: string;
  stageId: string;
  signals: ReadinessSignal[];
  verdict: 'stay' | 'ready-to-advance' | 'insufficient-data';
  explanation: string;
}

export interface ReadingPace {
  /** Word tokens per minute estimated from recorded dwell: a rough, quiet measure — never a target or a score. */
  wordsPerMinute?: number;
  basis: 'sentence-dwell';
  sentences: number;
  /** Lookups (word / phrase / grammar help) per 100 word tokens seen. */
  lookupsPer100Words: number;
  /** Sentence-level rescues (explanation or English) per 100 sentences seen. */
  rescuesPer100Sentences: number;
  rereadSittings: number;
  trend: 'faster' | 'steady' | 'slower' | 'insufficient-data';
}

export interface ItemHistory {
  itemId: string;
  itemKind: ItemKind;
  encounterCount: number;
  first?: { textId: string; textTitle: string; workId?: string; chapter?: number; at: string; sentenceId: string };
  byText: Array<{ textId: string; textTitle: string; workId?: string; count: number }>;
  /** Plain labels per competence; 'not measured' where the system has no evidence source. */
  reading: string;
  listening: string;
  production: string;
  pronunciation: 'not measured';
  /** Ready-made lines for the word sheet ("You first met this in …, chapter 7." "Met 23 times." …). */
  lines: string[];
}
