/**
 * What the shell needs from its environment (`Deps`) and from the GoReview domain modules (`ReviewEngine`). `engine.ts`
 * is the only file that imports the GoReview modules and adapts them to the engine port; the screens and the tests
 * use the port alone, so a change inside GoReview is absorbed in one place and a test can supply a small fake.
 */
import type { AppendOutcome, Enrolment, GoEvent, ReviewCandidate, UnitKnowledge, SchedulerProfile } from '../repository-contract/src';
import type { AssessmentSource, PlaybackHandle, PronunciationRequest, PronunciationResult } from '../golisten/src/contracts';
import type { RepositoryApi } from '../repository-service/src/api';
import type {
  AudioAvailability, DeckItem, Exercise, Grading, IntakeOutcome, PlannedItem, Response, ReviewPreferences, ReviewResult, Scheduler, SessionPlan, SessionState, UnitFacts,
} from '../goreview/src/types';
import type { ItemHistory } from '../goreview/src/history/history';
import type { Measure } from '../goreview/src/transfer/measures';
import type { AppConfig } from './config';
import type { KeyValueArea, Transport } from '../repository-sync/src';
import type { LocalRepo } from './localRepo';

// ───────────────────────────── the GoReview engine port ─────────────────────────────

/** The identity and clock every event the shell or the engine builds is stamped with. */
export interface EventContext {
  learnerId: string;
  enrolmentId: string;
  languageId: string;
  varietyId?: string;
  deviceId: string;
  appVersion: string;
  /** ISO. */
  now: string;
}

export type ItemControl = { kind: 'snooze'; until: string } | { kind: 'suspend' } | { kind: 'dismiss' } | { kind: 'resume' };

export interface IntakeRequest {
  /** For the pack facts intake consults (the unit lookup). */
  api: RepositoryApi;
  candidates: ReviewCandidate[];
  knowledge: UnitKnowledge[];
  deck: DeckItem[];
  /** Unit ids the learner saved. */
  saved: Set<string>;
  prefs: ReviewPreferences;
  audio: AudioAvailability;
  now: string;
}

/** The exercise the session is showing now. */
export interface Presented { planned: PlannedItem; exercise: Exercise; index: number; total: number }

export interface SessionDriver {
  readonly plan: SessionPlan;
  /** Builds (once) and returns the exercise of the current position; unbuildable items are skipped on the way and listed in `skips()`. */
  current(): Promise<Presented | undefined>;
  /** Grades without recording anything: the feedback the learner sees before the answer counts. */
  preview(response: Response): Promise<Grading>;
  /** Grades, then records through the device queue BEFORE advancing; a refusal throws and leaves the session where it was. */
  answer(response: Response): Promise<ReviewResult>;
  /** Writes nothing; the item stays due. */
  skip(reason?: string): Promise<void>;
  skips(): Array<{ itemId: string; reason: string; kind: 'learner' | 'build-failed' }>;
  state(): SessionState;
  finish(): Promise<SessionState>;
  /** Append a validated reversal; never delete historical evidence. */
  undo?(resultId: string, reason?: string): Promise<ReviewResult | undefined>;
  recover?(sessionId: string): Promise<boolean>;
}

export interface SessionStart {
  schedulerProfile?: SchedulerProfile;
  prefs: ReviewPreferences;
  plan: SessionPlan;
  ctx: EventContext;
  assessment?: AssessmentSource;
  /** Used for the exercise facts (the unit lookup). */
  api: RepositoryApi;
  /** The device queue: must persist before it resolves, and throw when an event is refused. */
  record: (events: GoEvent[]) => Promise<void>;
  /** Where the session's resumable state is kept. */
  persist: KeyValueArea;
  /** The learner's committed, locally synchronized event history for crash reconciliation. */
  committedEvents?: () => Promise<GoEvent[]>;
}

/** A session in progress (or just finished): what the session screen and the summary read. */
export interface ActiveRun {
  driver: SessionDriver;
  plan: SessionPlan;
  ctx: EventContext;
  /** How many CardAdded events the start wrote. */
  addedCount: number;
  startedAt: number;
  endedAt?: number;
  /** Results already committed to the queue, in order. */
  results: ReviewResult[];
  /** Item ids skipped (nothing written; they stay due). */
  skipped: string[];
  /** What was answered but withheld from evidence, and why. */
  withheld: Array<{ itemId: string; unitId: string; family: string; reason: string }>;
  /** Snooze/suspend/dismiss applied during the session. */
  controls: Array<{ itemId: string; unitId: string; control: string }>;
  finish?: 'complete' | 'early';
}

export interface PlanRequest {
  observedReviewSeconds?: Record<string, number>;
  schedulerProfile?: SchedulerProfile;
  deck: DeckItem[];
  intake: IntakeOutcome[];
  prefs: ReviewPreferences;
  audio: AudioAvailability;
  now: string;
  /** Units the learner repeatedly asked for help with. */
  recentHelp?: Set<string>;
  knowledge?: UnitKnowledge[];
  readingSignals?: GoEvent[];
}

export interface ReviewEngine {
  factsFor?(unitId: string, languageId: string, api: RepositoryApi): Promise<UnitFacts | undefined>;
  /** Whether the proposed family has verified facts and can produce a valid exercise. */
  exerciseAvailable?(request: { unitId: string; unitKind: string; languageId: string; dimension: import('../goreview/src/types').AssessmentDimension; family: import('../goreview/src/types').ExerciseFamily; api: RepositoryApi; now: string }): Promise<boolean>;
  scheduler(prefs: ReviewPreferences, profile?: SchedulerProfile): Scheduler;
  /** The deck of one language as a fold over the learner's events (a snooze that has ended by `now` is over). */
  foldDeck(events: GoEvent[], languageId: string, prefs: ReviewPreferences, now: string): DeckItem[];
  /** Intake decisions for the Repository's candidates, each with its reasons. */
  intake(req: IntakeRequest): Promise<IntakeOutcome[]>;
  /** The readable line for an outcome (headline, proposed skill, reasons). */
  explainIntake(outcome: IntakeOutcome): string;
  /** The CardAdded event for an intake outcome the learner accepts, or for a planned item that is not in the deck yet. */
  cardAdded(ctx: EventContext, item: Pick<DeckItem, 'unitId' | 'unitKind' | 'dimension' | 'family' | 'reasons'>, addedBy: 'intake' | 'learner'): GoEvent;
  /** The event that snoozes, suspends, dismisses or resumes an item; undefined when the control does not apply. */
  controlEvent(ctx: EventContext, item: DeckItem, control: ItemControl): GoEvent | undefined;
  plan(req: PlanRequest): SessionPlan;
  startSession(start: SessionStart): SessionDriver;
  /** A plain-language account of one item for the UI. */
  explainItem(item: DeckItem, events: GoEvent[]): string;
  itemHistory(events: GoEvent[], itemId: string): ItemHistory | undefined;
  /** The research measures of one unit (descriptions of the record, not conclusions). */
  measures(events: GoEvent[], unitId: string): Measure[];
}

// ───────────────────────────── audio ─────────────────────────────

export interface AudioDeps {
  /** Whether the language can be heard at all, and whether it could ever be listening evidence. */
  availability(languageId: string): Promise<AudioAvailability>;
  source(): AssessmentSource | undefined;
  playbackOf(stimulus: Parameters<AssessmentSource['playbackOf']>[0]): PlaybackHandle;
  /** Pronunciation for visible text. This is exposure only and never listening evidence. */
  pronounce?(request: PronunciationRequest): Promise<PronunciationResult>;
}

// ───────────────────────────── the environment ─────────────────────────────

export interface Deps {
  win: Window;
  doc: Document;
  fetch: typeof fetch;
  /** The application origin's storage. */
  area: KeyValueArea;
  config: AppConfig;
  createApi(baseUrl: string, token?: string): RepositoryApi;
  /** The two calls of the sync client; default: the typed API client, throwing on any failure. */
  createTransport?(api: RepositoryApi): Transport;
  engine: ReviewEngine;
  /**
   * null = no audio at all. A function receives the learner's remote-speech consent as a getter and returns the audio
   * (the real app builds it from GoListen); tests pass a ready-made fake.
   */
  audio: AudioDeps | null | ((consent: () => boolean) => AudioDeps | null);
  now(): Date;
  newId(): string;
  random(): number;
  appVersion: string;
  /**
   * The on-device Repository: present when this copy runs inside the GoLearn extension (a page served from chrome-extension://…/practice/),
   * where GoPractice works on the device with no account. Absent in the hosted copy, which needs an account.
   */
  local?: () => Promise<LocalRepo>;
  /** Where the neighbouring pages are, when this copy knows them (relative links inside the extension; the extension page for the hosted copy, from config.json). */
  links?: { setup?: string; extension?: string };
  /** 'review' in the GoReview (iPhone) build: its own title, its first-launch message, and the update link. Absent elsewhere. */
  edition?: 'review';
  /** Live updates (./live.ts) run in the real app (autoSync); false turns them off. Tests that exercise them pass their own timers. */
  live?: false | { timers?: { set(fn: () => void, ms: number): unknown; clear(h: unknown): void }; pollMs?: number; waitTimeoutMs?: number; minRoundMs?: number; backoff?: { baseMs: number; maxMs: number } };
  /** Run the sync client's own timer (the real app) or only on demand (tests). */
  autoSync: boolean;
  /** Timer functions for the session clock; tests may freeze them. */
  timers?: { set(fn: () => void, ms: number): unknown; clear(h: unknown): void };
}

export interface Identity {
  learnerId: string;
  enrolmentId: string;
  languageId: string;
  varietyId?: string;
  deviceId: string;
  email: string;
  enrolment: Enrolment;
  /**
   * How the active language was settled: `picked` = the learner chose it in GoPractice (remembered); `recent-reading` = none was chosen, so it is the
   * language of the newest lookup the learner made while reading (any enrolled language); `setup` = the language chosen on GoLearn's setup page;
   * `first` = nothing else was known, the first enrolment.
   */
  chosenBy?: 'picked' | 'recent-reading' | 'setup' | 'first';
}

export type { AppendOutcome };
