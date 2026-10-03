/**
 * GoTell practice — the productive-language engine. Re-exported by ./gotell (and so by src/core).
 *
 * MEANING is separate from LANGUAGE. A SemanticGoal is a meaning the learner wants to be able to say (in English, the known
 * language), with the concepts it must carry. It holds no target-language wording. Model wordings live elsewhere, labelled
 * as MODEL LANGUAGE with their review status; the learner's own attempts are MY LANGUAGE; anything produced after help is
 * MY LANGUAGE WITH ASSISTANCE, and the help is recorded step by step.
 *
 * Learner state for production is a pure function of the append-only event log (TellTaskPresented, TellInterventionShown,
 * TellAttemptSubmitted, TellTaskClosed, TellGoalDefined, plus saved testimony revisions). Nothing here is decided by an LLM:
 * an optional interpretation provider may annotate an attempt, but its output is validated and stays advisory.
 */
import type { ErrorCategory, LanguageCode, SemanticSection } from '../model';

export type GoalDomain = 'testimony' | 'scripture' | 'church' | 'daily-life' | 'ministry';
/** The smallest testimony delivery a goal belongs in: a 30-second version, a two-minute version, the full story. */
export type DeliveryLength = 'short' | 'standard' | 'full';

export interface SemanticComponent {
  /** Concept id from GoTell's concept tables (src/gotell/concepts.ts). */
  concept: string;
  /** English label for a concept cue ("knowing", "your sin"). */
  label: string;
  /** The English word given as a known-language cue. */
  english: string;
}

export interface SemanticGoal {
  /** Stable: "goal:t.believe-jesus" (catalog) or "goal:u.<hash>" (learner-authored). */
  id: string;
  domain: GoalDomain;
  section?: SemanticSection;
  /** The meaning, in English. Never target-language text. */
  meaning: string;
  /** The same meaning as a question, for answer-question tasks. */
  question?: string;
  /** Every concept must be expressed for the meaning to come across. */
  components: SemanticComponent[];
  /** The meaning is negative ("I did not understand…"): an attempt without negation says the opposite. */
  negated: boolean;
  /** 0..1: how central the meaning is to the learner's mission speech. */
  importance: number;
  delivery?: DeliveryLength;
  /** Position in the testimony story (testimony goals). */
  order?: number;
  source: 'catalog' | 'learner';
  version: number;
}

/** A target-language model wording for a goal: MODEL LANGUAGE, never evidence of the learner's ability. */
export interface ModelWording {
  goalId: string;
  lang: LanguageCode;
  text: string;
  /** No catalog wording has had a native-speaker review yet; it says so wherever it is shown. */
  review: 'unreviewed' | 'reviewed';
  /** The course catalog, the learner's own earlier success, or a sentence he has read. */
  origin: 'catalog' | 'learner-history' | 'reading';
  /** For origin 'reading': the text and sentence (Scripture is quoted verbatim with its reference, never altered). */
  sourceRef?: { textId: string; sentenceId: string; title: string; scripture: boolean };
  /** E.g. "Masculine forms; a woman says …". */
  note?: string;
}

/**
 * P0 never produced · P1 said only after a full model · P2 said with heavy scaffolding (a frame, a choice, the word given) ·
 * P3 said after a light cue · P4 said independently once · P5 said independently again on a later day ·
 * P6 (already P5) said independently on a later day in a kind of task not yet used (transfer) · P7 used unprompted in the
 * learner's own testimony.
 */
export type ProductiveLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type AssistanceKind =
  | 'restatement' | 'conceptual-hint' | 'english-cue' | 'first-letter-cue' | 'issue-flagged'
  | 'lemma-supplied' | 'phrase-supplied' | 'gap-completion' | 'recognition-choice' | 'sentence-frame'
  | 'morphological-correction' | 'partial-correction' | 'full-model';
/** none: gives no target language · cue: points the way · scaffold: gives part of the wording · model: gives all of it. */
export type SupportTier = 'none' | 'cue' | 'scaffold' | 'model';

/** One intervention, exactly as shown. Append-only: a step is never edited or removed. */
export interface AssistanceStep {
  id: string;
  kind: AssistanceKind;
  tier: SupportTier;
  /** Position on the ladder (see src/gotell/productive/ladder.ts). */
  rung: number;
  /** What the learner saw. */
  content: string;
  concept?: string;
  /** Target-language items the step gave away (form ids). */
  revealedItemIds: string[];
  source: 'goal' | 'checker' | 'catalog-model' | 'learner-history' | 'reading';
  sourceRef?: { textId?: string; sentenceId?: string; title?: string; attemptId?: string };
  review?: 'unreviewed' | 'reviewed';
  options?: string[];
  at: string;
}

export type ErrorFamily = 'meaning' | 'lexical' | 'morphology' | 'syntax' | 'orthography' | 'register' | 'discourse';

export interface MeaningAssessment {
  /** Every component expressed and the polarity right. */
  success: boolean;
  covered: Array<{ concept: string; token: string; via: 'form' | 'lemma' | 'stem' | 'substring' }>;
  missing: string[];
  polarity: 'ok' | 'missing-negation' | 'unexpected-negation';
  /** Key-term concepts present that the goal does not carry (believe for trust, regret for repent …). */
  otherKeyTerms: string[];
  /** Words of the known language (English) inside the attempt. */
  knownLanguageWords: string[];
  /** 0..1, from how each concept was matched and how well the adapter can analyse the language. */
  confidence: number;
  method: string;
  /** What this assessment cannot see. */
  limits: string;
}

export interface LanguageFinding {
  code: string;
  family: ErrorFamily;
  category: ErrorCategory;
  message: string;
  span: [number, number];
  confidence: number;
  affectsMeaning: boolean;
  fix?: { start: number; end: number; replacement: string };
}

export interface LanguageAssessment {
  /** No issue found by the checker. NOT a guarantee of correctness: `coverage` says what the checker can see. */
  noIssuesDetected: boolean;
  findings: LanguageFinding[];
  checker: string;
  coverage: string;
}

export interface TellError {
  code: string;
  family: ErrorFamily;
  detail: string;
  concept?: string;
  confidence: number;
  source: 'meaning' | 'checker';
}

/** Advisory output of an interpretation provider (e.g. a future LLM), after validation. Never decides anything. */
export interface AdvisoryInterpretation {
  providerId: string;
  concepts: string[];
  confidence: number;
  note?: string;
  /** Whether it agreed with the deterministic meaning assessment. */
  agrees: boolean;
}

export type TaskFamily = 'express' | 'answer-question' | 'testimony-part' | 'retell' | 'transfer';

/** One immutable attempt. The original text is stored as typed and never rewritten. */
export interface TellAttemptRecord {
  attemptId: string;
  taskId: string;
  goalId: string;
  goalVersion: number;
  family: TaskFamily;
  /** 1-based within the task. */
  number: number;
  text: string;
  textHash: string;
  /** Every step shown in this task BEFORE this attempt (cumulative lineage). */
  assistance: AssistanceStep[];
  /** The strongest support among `assistance`. */
  tier: SupportTier;
  afterModel: boolean;
  meaning: MeaningAssessment;
  language: LanguageAssessment;
  errors: TellError[];
  /** An earlier attempt in this task failed, and since then only steps that give no wording away were shown. */
  selfRepair: boolean;
  outcome: 'success' | 'meaning-only' | 'language-only' | 'failed';
  evaluator: { id: string; version: string; confidence: number; advisory?: AdvisoryInterpretation; advisoryRejected?: string };
  /** Productive state of the goal as computed when the attempt was evaluated (the log stays the source of truth). */
  levelBefore: ProductiveLevel;
  levelAfter: ProductiveLevel;
  rule: string;
  /** GoTell → GoLearn: items the learner has met in reading for the concepts he could not produce. */
  gapItemIds: string[];
}

export interface SchedulerFactor { key: string; value: number; weight: number; contribution: number; reason: string }

export interface SelectionExplanation {
  score: number;
  factors: SchedulerFactor[];
  /** Plain-language "Selected because:" lines, most important first. */
  reasons: string[];
  predictedSuccess: number;
  familyReason: string;
  startRung: number;
  startReason: string;
  policy: string;
  /** Set when the learner chose the goal himself. */
  chosenByLearner?: boolean;
}

export interface PracticeTask {
  taskId: string;
  userId: string;
  lang: LanguageCode;
  goal: SemanticGoal;
  family: TaskFamily;
  /** The prompt, in the known language. */
  prompt: string;
  retellSource?: { textId: string; title: string };
  presentedAt: string;
  selection: SelectionExplanation;
  assistance: AssistanceStep[];
  attempts: TellAttemptRecord[];
  open: boolean;
  closedAs?: 'success' | 'model-reproduced' | 'abandoned';
  /** What the next hint would be (so the learner can choose to try again first). Absent: nothing more to give. */
  nextHint?: { kind: AssistanceKind; label: string };
}

export interface ProductiveGoalState {
  goalId: string;
  level: ProductiveLevel;
  peak: ProductiveLevel;
  /** Why the level is what it is (the rule that last moved it). */
  rule: string;
  attempts: number;
  independentSuccesses: number;
  independentDays: string[];
  independentFamilies: TaskFamily[];
  lapses: number;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastIndependentAt?: string;
  lastFailureAt?: string;
  /** When a retrieval is due (spacing grows with the level). */
  dueAt?: string;
  spontaneous?: { revisionId: string; sentenceIndex: number; text: string };
  history: Array<{ at: string; from: ProductiveLevel; to: ProductiveLevel; rule: string; attemptId?: string; revisionId?: string }>;
}

export interface ScheduleCandidate {
  goal: SemanticGoal;
  state: ProductiveGoalState;
  family: TaskFamily;
  selection: SelectionExplanation;
}

export interface TestimonyMapNode {
  goal: SemanticGoal;
  state: ProductiveGoalState;
  /** Sentences of the current saved version that carry this meaning; `own` = written with no suggestion involved. */
  inTestimony: Array<{ revisionId: string; sentenceIndex: number; text: string; own: boolean }>;
}

export interface TestimonyMap {
  revisionId?: string;
  nodes: TestimonyMapNode[];
  deliveries: Array<{ length: DeliveryLength; goalIds: string[]; canSayAlone: string[]; inTestimony: string[]; missing: string[] }>;
}

export type DefineGoalResult = { ok: true; goal: SemanticGoal } | { ok: false; reason: string };

export interface GoTellPractice {
  /** Goals available in this language (catalog goals with a model wording, plus the learner's own). */
  goals(userId: string, lang: LanguageCode): Promise<SemanticGoal[]>;
  /** A meaning the learner wants to be able to say. Accepted only when its concepts can be recognised. */
  defineGoal(userId: string, lang: LanguageCode, input: { meaning: string; domain?: GoalDomain; section?: SemanticSection }): Promise<DefineGoalResult>;
  /** The open task, or a newly chosen one (recorded with why it was chosen). Undefined when nothing can be offered. */
  next(userId: string, lang: LanguageCode, opts?: { goalId?: string }): Promise<PracticeTask | undefined>;
  task(userId: string, taskId: string): Promise<PracticeTask | undefined>;
  /** Show the smallest next intervention. */
  hint(userId: string, taskId: string): Promise<PracticeTask>;
  /** Evaluate and record an attempt (immutable). */
  submit(userId: string, taskId: string, text: string): Promise<{ task: PracticeTask; attempt: TellAttemptRecord }>;
  /** Leave the task (recorded as abandoned unless it already ended). */
  close(userId: string, taskId: string): Promise<void>;
  states(userId: string, lang: LanguageCode): Promise<ProductiveGoalState[]>;
  /** Read-only: how every goal scores now. Records nothing. */
  schedule(userId: string, lang: LanguageCode): Promise<ScheduleCandidate[]>;
  attempts(userId: string, lang: LanguageCode, goalId?: string): Promise<TellAttemptRecord[]>;
  testimonyMap(userId: string, lang: LanguageCode): Promise<TestimonyMap>;
}

/**
 * Optional interpreter (e.g. an LLM) that reads an attempt for meaning. Its answer is validated against the concept ids and
 * stored as advisory only: it can never mark an attempt successful, change a level, or alter the attempt text.
 */
export interface InterpretationProvider {
  readonly id: string;
  interpret(args: { lang: LanguageCode; goal: SemanticGoal; text: string }): Promise<unknown>;
}
