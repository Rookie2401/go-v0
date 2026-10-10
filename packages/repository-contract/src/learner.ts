/**
 * Layer C — derived learner state (what the Repository currently estimates), plus identity and preferences.
 * Prompt 3 §5, §9, §10, §12, §13. Every number here is recomputable from events by a versioned projection and is a
 * hypothesis until calibrated against independent assessment; the types carry the basis so each estimate can be
 * traced to the observations behind it.
 */
import type { KnowledgeLevel } from './knowledge-levels';
import type { AnalysisStatus } from './units';

/** The eight distinguishable kinds of knowledge estimate (§5). Order is fixed; never merged into one number. */
export const DIMENSIONS = [
  'exposure',                  // the learner met the form; weak evidence of anything
  'assistedRecognition',       // understood with a gloss / explanation / hint shown
  'readingRecognition',        // understood the written form without being shown the answer
  'listeningRecognition',      // understood audio without first seeing the written answer
  'productiveRetrieval',       // produced the target from a prompt
  'contextualProduction',      // used it correctly in meaningful original language
  'grammaticalUnderstanding',  // interpreted or applied a grammatical relationship
  'phraseComprehension',       // understood a multiword unit as a whole (projection@2; appended last so the first seven keep their order)
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface DimensionEstimate {
  /** Current estimate 0..1 of the learner's ability on this dimension for this unit. */
  score: number;
  /** 0..1, grows with the number and quality of observations, falls with disagreement and age. */
  confidence: number;
  observations: number;
  positive: number;
  negative: number;
  /** Sum of evidence weights, so the score can be explained ("rests on 3.4 weighted observations"). */
  weight: number;
  lastAt?: string;
  /** Whether the latest observation was made with assistance. */
  lastAssisted?: boolean;
  /** Distinct contexts (sentence hashes) in which evidence was observed. */
  contexts: number;
  /** Mean assessment difficulty of the observations where one was reported (0..1), else undefined. */
  difficulty?: number;
  /** The least reliable source among the observations (0..1). */
  sourceReliability?: number;
}

export interface UnitKnowledge {
  learnerId: string;
  unitId: string;
  languageId: string;
  dimensions: Record<Dimension, DimensionEstimate>;
  /** Simple retention estimate derived from recency and strength; 0..1; explained in the engine. */
  retention: { estimate: number; halfLifeDays: number; basedOn: Dimension | 'none' };
  /** Overall uncertainty 0..1 (1 = nothing known). */
  uncertainty: number;
  /** Status of the linguistic analysis the unit id rests on, copied at projection time (§11). */
  analysisStatus?: AnalysisStatus;
  firstSeenAt?: string;
  lastSeenAt?: string;
  /**
   * projection@4: where the unit stands on the six-level scale (new, seen, recognized, familiar, known, automatic), computed by the engine's
   * `levelOf` from the dimension estimates and the learner's own latest mark (docs/ecosystem/KNOWLEDGE-LEVELS.md). Review is a natural
   * progression along this level; it is not a rating the learner is asked for.
   */
  level: KnowledgeLevel;
  /**
   * projection@4: how many DISTINCT encounter events the learner has with the unit (lookups, exposures, recognitions, assistance requests;
   * each event id counted once, however many dimensions it touched).
   */
  encounters: number;
  /**
   * The learner's LATEST explicit self-assessment of this unit (projection@3, widened in projection@4): the level they chose, read through
   * `levelOfMark`, so a stored legacy mark keeps its meaning (`learning` = new, `productive` = known; the word `known` is read as the
   * level known, see `levelOfMark`). A later mark replaces an earlier one (latest by event instant, then event id). `saved` and `ignore`
   * are not statements about knowledge and never set it. Absent when the learner has never marked the unit.
   */
  selfMark?: { mark: KnowledgeLevel; at: string };
  /** Projection algorithm version that produced this row. */
  modelVersion: string;
  /** Ids of the events folded into this row (count) and the last event id, so rebuilds can be compared. */
  basis: { events: number; lastEventId?: string };
}

/** Explicit or inferred preferences about assistance (§9); never proficiency; inferred values stay overridable. */
export interface AssistancePreferences {
  learnerId: string;
  languageId?: string;
  explanationDepth: Preference<'label' | 'brief' | 'explanatory'>;
  terminology: Preference<'plain' | 'grammatical'>;
  transliteration: Preference<'always' | 'on-request' | 'never'>;
  pronunciationFirst: Preference<boolean>;
  translationAvailable: Preference<boolean>;
  visualAssistance: Preference<'less' | 'standard' | 'more'>;
  accessibility: Preference<string[]>;
  updatedAt: string;
}

export interface Preference<T> {
  value: T;
  /** `explicit` was set by the learner and is never overwritten by inference; `inferred` may be. */
  origin: 'default' | 'inferred' | 'explicit';
  /** For inferred values: what the inference rested on. */
  basis?: string;
}

export interface ReviewCandidate {
  unitId: string;
  kind: string;
  /** 0..1 explainable score; not a schedule. */
  score: number;
  reasons: Array<{ rule: string; weight: number; detail?: string }>;
  /** Which dimension the candidate mainly targets. */
  targetDimension: Dimension;
  /** Eligibility of the underlying analysis for an assessment (§11). */
  eligibility: ReviewEligibility;
  /** When the candidate explains several others (a construction behind many vocabulary failures), their ids. */
  explains?: string[];
  /** Approximate cost of reviewing it, 0..1 (longer or harder items cost more). */
  cost: number;
}

export type ReviewEligibility =
  | { eligible: true; status: AnalysisStatus; caveats: string[] }
  | { eligible: false; status: AnalysisStatus | 'unknown'; reason: string };

/** Reading suitability of a permitted passage or sample (§12); never a CEFR label. */
export interface SuitabilityEstimate {
  languageId: string;
  tokens: number;
  wordTokens: number;
  /** Token counts by status. */
  recognized: number;
  uncertain: number;
  unknown: number;
  /** Units the learner appears to know (by dimension evidence) and those likely to cause difficulty. */
  familiarUnits: string[];
  difficultUnits: Array<{ unitId: string; reason: string }>;
  difficultConstructions: Array<{ unitId: string; reason: string }>;
  /** 0..1: how reliable the estimate is given evidence density and pack coverage. */
  reliability: number;
  coverageGaps: string[];
  modelVersion: string;
}

// ───────────────────────────── identity (§13) ─────────────────────────────

export interface Learner { learnerId: string; displayName?: string; createdAt: string }
export interface Team { teamId: string; name: string; defaultLanguageId?: string; createdAt: string }
export interface Language { languageId: string; name: string }
export interface Variety { varietyId: string; languageId: string; label: string }
export interface Script { scriptId: string; name: string }
export interface Enrolment {
  enrolmentId: string;
  learnerId: string;
  teamId?: string;
  languageId: string;
  varietyId?: string;
  scriptId?: string;
  packId: string;
  packVersion: string;
  goals: LearningGoal[];
  startedAt: string;
  endedAt?: string;
}
export interface LearningGoal { kind: 'reading' | 'listening' | 'speaking' | 'writing' | 'scripture' | 'conversation' | 'custom'; label?: string; priority?: number }
export interface Device { deviceId: string; learnerId: string; platform?: string; label?: string; registeredAt: string; lastSyncAt?: string }
