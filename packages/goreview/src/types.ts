/**
 * GoReview — the domain types shared by its modules (Prompt 5). Three responsibilities kept apart:
 *   intake      which Repository candidates become deck items, and why (./intake)
 *   scheduling  when an existing item is next reviewed — FSRS through ts-fsrs, folded from the event log (./scheduler)
 *   assessment  what exercise tests the targeted skill, and how a response is graded (./exercises, ./grading)
 * Nothing here is a mastery score: scheduling state is retention bookkeeping; the Repository's seven dimensions are the
 * learner model. Imports: the contract and GoListen's contracts only.
 */
import type {
  AnalysisStatus, Dimension, FormAnalysis, GoEvent, LinguisticUnit, ReviewCandidate, ReviewEligibility, UnitKnowledge, UnitRelation,
} from '../../repository-contract/src';
import type { AudioStimulus, ScoringMetadata } from '../../golisten/src/contracts';

// ───────────────────────────── skills and exercise families ─────────────────────────────

/** The nine assessment dimensions of §7; GoReview keeps them apart in its own history. */
export const ASSESSMENT_DIMENSIONS = [
  'written-recognition',          // form shown → meaning
  'meaning-recall',               // form shown → meaning recalled without choices
  'meaning-to-target-retrieval',  // meaning shown → target-language form produced
  'morphological-analysis',       // inflected form → feature / lemma
  'construction-understanding',   // recognise or produce a construction
  'phrase-comprehension',         // idiom / multiword expression in context
  'auditory-recognition',         // audio (answer hidden) → meaning
  'auditory-transcription',       // audio (answer hidden) → written reproduction
  'productive-recall',            // prompt → target expression in a sentence
] as const;
export type AssessmentDimension = (typeof ASSESSMENT_DIMENSIONS)[number];

/** How each assessment dimension folds into the Repository's seven learner dimensions (the Repository decides the weights). */
export const REPOSITORY_DIMENSION: Record<AssessmentDimension, Dimension> = {
  'written-recognition': 'readingRecognition',
  'meaning-recall': 'readingRecognition',
  'meaning-to-target-retrieval': 'productiveRetrieval',
  'morphological-analysis': 'grammaticalUnderstanding',
  'construction-understanding': 'grammaticalUnderstanding',
  'phrase-comprehension': 'readingRecognition',
  'auditory-recognition': 'listeningRecognition',
  'auditory-transcription': 'listeningRecognition',
  'productive-recall': 'productiveRetrieval',
};

export const EXERCISE_FAMILIES = [
  'written-recognition', 'meaning-to-form', 'morphological-identification', 'grammar-application',
  'phrase-comprehension', 'sentence-completion', 'audio-to-meaning', 'audio-transcription',
] as const;
export type ExerciseFamily = (typeof EXERCISE_FAMILIES)[number];

export const FAMILY_DIMENSION: Record<ExerciseFamily, AssessmentDimension> = {
  'written-recognition': 'written-recognition',
  'meaning-to-form': 'meaning-to-target-retrieval',
  'morphological-identification': 'morphological-analysis',
  'grammar-application': 'construction-understanding',
  'phrase-comprehension': 'phrase-comprehension',
  'sentence-completion': 'productive-recall',
  'audio-to-meaning': 'auditory-recognition',
  'audio-transcription': 'auditory-transcription',
};

// ───────────────────────────── facts an exercise may be built from ─────────────────────────────

/** One example sentence GoReview may show: owner-authored pack material only, never a commercial passage. */
export interface ExampleSentence {
  text: string;
  source: 'pack-validation' | 'pack-tutorial' | 'original';
  /** The target's occurrence in the sentence, when known. */
  surface?: string;
  start?: number;
  end?: number;
}

/** Verified pack and Repository facts about one unit. The builder never invents what is absent here. */
export interface UnitFacts {
  unit: LinguisticUnit;
  relations: UnitRelation[];
  analyses: FormAnalysis[];
  status: AnalysisStatus;
  lemma?: string;
  pos?: string;
  /** For a form: its feature structure (as the pack flattens it). */
  features?: Record<string, string>;
  /** Glosses, lexicon first then dictionary senses; empty when none. */
  glosses: string[];
  /** Attribution line to show whenever a dictionary gloss is shown. */
  glossAttribution?: string;
  /** Morphological constructions the form realizes (Repository ids). */
  constructionIds: string[];
  constructionLabel?: string;
  constructionExplanation?: string;
  /** Pack explanations per feature key=value, for feedback. */
  featureExplanations: Record<string, string>;
  /** Other inflected forms of the same lemma the pack can vouch for (with their feature keys), for distractors. */
  siblingForms: Array<{ surface: string; features: Record<string, string> }>;
  /** For a multiword unit. */
  phrase?: { display: string; gloss?: string; kind?: string };
  exampleSentences: ExampleSentence[];
  pronunciationNotes: string[];
}

export interface FactsProvider {
  /** `varietyId`: the learner's target variety (a PERIOD for Hebrew / Greek): the facts prefer sentences and forms of that period and never invent them. */
  factsFor(unitId: string, languageId: string, varietyId?: string): Promise<UnitFacts | undefined>;
}

// ───────────────────────────── exercises ─────────────────────────────

export interface ReviewTarget {
  unitId: string;
  unitKind: string;
  languageId: string;
  varietyId?: string;
  dimension: AssessmentDimension;
}

export type ResponseMode = 'typed' | 'choice' | 'self-graded' | 'typed-or-self';

export interface ExercisePrompt {
  instruction: string;
  /** The written stimulus; for audio families it exists but is hidden until after the response. */
  stimulusText?: string;
  meaning?: string;
  sentenceWithGap?: string;
  options?: string[];
  audio?: AudioStimulus;
}

export interface AnswerKey {
  /** Every accepted answer; the first is the reference. */
  accepted: string[];
  normalization: 'exact' | 'loose';
  /** For feature questions: the expected feature values. */
  features?: Record<string, string>;
  explanation: string;
  deeper?: string;
}

export interface Exercise {
  exerciseId: string;
  family: ExerciseFamily;
  target: ReviewTarget;
  prompt: ExercisePrompt;
  answerKey: AnswerKey;
  /** Prompt fields that must stay off screen until the response is given. */
  hiddenBeforeAnswer: Array<keyof ExercisePrompt>;
  responseMode: ResponseMode;
  eligibility: ReviewEligibility;
  /** Which facts the exercise rests on, so a wrong fact can be traced. */
  builtFrom: { facts: string[]; sentenceSource?: ExampleSentence['source'] };
  /** The builder's own validation: an exercise with issues is never shown. */
  validation: { ok: boolean; issues: string[] };
}

export interface ExerciseBuilder {
  readonly family: ExerciseFamily;
  readonly dimension: AssessmentDimension;
  /** True when the facts support a sound exercise for this target. */
  canBuild(target: ReviewTarget, facts: UnitFacts, ctx: BuildContext): boolean;
  build(target: ReviewTarget, facts: UnitFacts, ctx: BuildContext): Promise<Exercise | { unavailable: true; reason: string }>;
  grade(exercise: Exercise, response: Response, ctx: GradeContext): Grading;
}

export interface BuildContext {
  now: string;
  /** For audio families: the GoListen assessment source, or undefined when none. */
  audio?: import('../../golisten/src/contracts').AssessmentSource;
  /** Distractor pool: other units' facts, for choice questions. */
  pool?: UnitFacts[];
  random: () => number;
}

export interface GradeContext { now: string }

// ───────────────────────────── responses and grading ─────────────────────────────

export interface Response {
  typed?: string;
  choice?: string;
  selfGrade?: 'again' | 'hard' | 'good' | 'easy';
  hinted: boolean;
  /** Explicit evidence that the learner attempted retrieval; absent means true for older clients. */
  retrievalAttempted?: boolean;
  /** Active prompt-to-response time, in seconds; excludes idle time and does not affect grading or scheduling. */
  reviewSeconds?: number;
  /** Assistance used during the item (gloss, hint, transcript, replay…). */
  assistance: string[];
  replays?: number;
  audioPlayed?: boolean;
  audioFailed?: boolean;
  /** The written stimulus was shown before the response (an audio item is then not audio-only). */
  transcriptShownBefore?: boolean;
  /** The learner challenged the answer key; the result is kept but not counted as evidence. */
  challenged?: boolean;
}

export type GradeOutcome = 'correct' | 'incorrect' | 'partial' | 'ambiguous' | 'invalid-question' | 'unable-to-grade';

export interface Grading {
  outcome: GradeOutcome;
  /** 0..1 confidence in the outcome (1 for an exact match; lower for loose matches and self-grades). */
  confidence: number;
  explanation: string;
  deeper?: string;
  matched?: string;
  normalizedResponse?: string;
}

/** FSRS rating: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type Rating = 1 | 2 | 3 | 4;

export interface ReviewResult {
  resultId: string;
  exerciseId: string;
  family: ExerciseFamily;
  target: ReviewTarget;
  itemId: string;
  response: Response;
  grading: Grading;
  /** Listening metadata when the exercise was audio-first (never for playback aids). */
  scoring?: ScoringMetadata & { stimulusId: string; voiceId: string; synthetic: boolean; pronunciationValidated: boolean; licence: string };
  at: string;
  deviceId: string;
  /** The rating given to the scheduler, or null when the result must not schedule (invalid, failed audio, challenged). */
  rating: Rating | null;
  /** The event submitted to the Repository, or null when no evidence may be claimed. */
  evidence: GoEvent | null;
  correctedAt?: string;
  correctionReason?: string;
}

// ───────────────────────────── scheduling (FSRS) ─────────────────────────────

export type CardPhase = 'new' | 'learning' | 'review' | 'relearning';

export interface ScheduleState {
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  phase: CardPhase;
  lastReview?: string;
  /** FSRS short-term learning-step counter (ts-fsrs `learning_steps`); 0 when absent. */
  learningSteps?: number;
  /** Algorithm and parameter identity, so history can be re-folded by a newer version. */
  algorithm: string;
  parametersVersion: string;
}

export interface ReviewLogEntry { at: string; rating: Rating; outcome: GradeOutcome; deviceId: string; exerciseId: string; family: ExerciseFamily; elapsedDays: number; eventId?: string; retracted?: boolean }

export type ItemStatus = 'active' | 'snoozed' | 'suspended' | 'dismissed';

export interface DeckItem {
  itemId: string;
  unitId: string;
  unitKind: string;
  languageId: string;
  varietyId?: string;
  dimension: AssessmentDimension;
  /** Preferred family; the planner may choose another of the same dimension when audio is unavailable. */
  family: ExerciseFamily;
  addedAt: string;
  addedBy: 'intake' | 'learner';
  reasons: string[];
  schedule: ScheduleState;
  history: ReviewLogEntry[];
  status: ItemStatus;
  snoozedUntil?: string;
  /** Set when a `ReviewItemInvalidated` event suspended the item (e.g. 'analysis-invalidated'); absent for a learner's own suspension. */
  suspendedReason?: string;
}

export interface Scheduler {
  readonly algorithm: string;
  readonly parametersVersion: string;
  readonly desiredRetention: number;
  readonly profile?: ScheduleProfile;
  newState(now: string): ScheduleState;
  /** The next state after a rating at `now`; pure. */
  review(state: ScheduleState, rating: Rating, now: string): ScheduleState;
  /** Probability of recall at `now` (0..1); 0 for a new item. */
  retrievability(state: ScheduleState, now: string): number;
  isDue(state: ScheduleState, now: string): boolean;
}

export interface ScheduleProfile {
  algorithm: string;
  parametersVersion: string;
  desiredRetention: number;
  maximumInterval?: number;
  parameters?: number[];
  enableShortTerm?: boolean;
  learningSteps?: string[];
  relearningSteps?: string[];
}

// ───────────────────────────── intake and planning ─────────────────────────────

export type IntakeDecision = 'already-covered' | 'redundant' | 'too-uncertain' | 'needs-validation' | 'low-priority' | 'test-now' | 'test-later';

export interface AudioAvailability { available: boolean; eligibleForEvidence: boolean; reason: string }

export interface ReviewPreferences {
  languageId: string;
  /** The enrolment's target variety, when it has one (a period for Hebrew / Greek: 'he-bib', 'el-koi' …); facts and exercises prefer it. */
  varietyId?: string;
  sessionMinutes: number;
  maxNew: number;
  desiredRetention: number;
  includeListening: boolean;
  /** Preferred share of grammar items in a session, 0..1. */
  grammarShare: number;
  prioritizeSaved: boolean;
  /** How many cards a deck holds, 5 to 60 (GoReview sizes the current deck to it; absent in a record from before it existed). */
  cardsPerDeck?: number;
}

export interface IntakeInput {
  candidate: ReviewCandidate;
  knowledge?: UnitKnowledge;
  facts?: UnitFacts;
  existing: DeckItem[];
  audio: AudioAvailability;
  /** Unit ids the learner explicitly saved (ItemMarked saved). */
  saved: Set<string>;
  preferences: ReviewPreferences;
  now: string;
  /** Repeated event evidence used only to qualify Seen/Automatic stages. */
  readingSignals?: GoEvent[];
  assistanceRequests?: number;
  /** Explicit opt-in to productive/grammar/listening targets; default is contextual reading recognition. */
  secondaryPractice?: boolean;
}

export interface IntakeOutcome {
  unitId: string;
  decision: IntakeDecision;
  reasons: string[];
  /** When test-now / test-later: the dimension and family to add. */
  proposed?: { dimension: AssessmentDimension; family: ExerciseFamily };
  /** The candidate's own explanation, kept for the UI. */
  candidate: ReviewCandidate;
  /** Knowledge projection that qualified this candidate, retained for transparent planning. */
  knowledge?: UnitKnowledge;
  /** A persisted target is user-selected, so policy may admit it even when New. */
  explicitlySelected?: boolean;
}

export interface PlannedItem { item: DeckItem; family: ExerciseFamily; why: string[]; estimatedSeconds: number; isNew: boolean }

export interface SessionPlan {
  planId: string;
  createdAt: string;
  languageId: string;
  budgetMinutes: number;
  items: PlannedItem[];
  skipped: Array<{ itemId: string; why: string }>;
  dueCount: number;
  newCount: number;
  listeningCount: number;
  grammarCount: number;
}

export interface SessionState {
  sessionId: string;
  plan: SessionPlan;
  index: number;
  results: ReviewResult[];
  startedAt: string;
  finishedAt?: string;
  deviceId: string;
  status: 'in-progress' | 'finished' | 'abandoned';
  /** Notes explaining deterministic event reconciliation performed after a page/process crash. */
  recoveryNotes?: string[];
}
