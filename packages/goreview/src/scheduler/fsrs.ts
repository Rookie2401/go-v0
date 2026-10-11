/**
 * The FSRS scheduler: a thin, pure adapter over ts-fsrs (MIT, https://github.com/open-spaced-repetition/ts-fsrs).
 * Nothing here is a forgetting model of our own: every number comes out of the library. What this file adds is
 *   - determinism (fuzz is always off, so the same history gives the same state on every device),
 *   - a conversion layer between the library's `Card` and GoReview's serialisable `ScheduleState`,
 *   - an identity (`algorithm`, `parametersVersion`) that is stamped on every state, so a history can be re-folded later.
 * Scheduling state is retention bookkeeping, never a mastery score.
 */
import { createEmptyCard, default_maximum_interval, default_request_retention, default_w, FSRSVersion, fsrs, generatorParameters, State } from 'ts-fsrs';
import type { Card, Grade } from 'ts-fsrs';
import type { CardPhase, Rating, ScheduleProfile, ScheduleState, Scheduler } from '../types';

/**
 * `ScheduleState` plus the one library field the shared type has no slot for: which (re)learning step the card is on.
 * It is optional so a plain `ScheduleState` is still accepted (step 0 is then assumed); states produced here always carry it.
 */
export interface FsrsScheduleState extends ScheduleState { learningSteps?: number }

export interface FsrsSchedulerOptions {
  /** Target probability of recall at the due date; default 0.9 (the library default). */
  desiredRetention?: number;
  /** Longest interval in days; default 36500 (the library default). */
  maximumInterval?: number;
  /** Fuzz is not available: it would make two devices disagree about the same history. */
  enableFuzz?: false;
  /** The 21 FSRS-6 weights; default: the library's published defaults. Do not tune by hand. */
  parameters?: number[];
}

export const ALGORITHM = `fsrs@${FSRSVersion}`;

const PHASE_OF: Record<State, CardPhase> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};
const STATE_OF: Record<CardPhase, State> = { new: State.New, learning: State.Learning, review: State.Review, relearning: State.Relearning };

/** FNV-1a, 32 bit, as 8 hex digits: a short, stable identity for a parameter set (not a security hash). */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function parseInstant(iso: string): Date {
  const match = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(iso) : null;
  if (!match) {
    throw new RangeError(`not an ISO timestamp: ${String(iso)}`);
  }
  const [, y, mo, day, h, min, sec, , zone, , zh, zm] = match;
  const year = Number(y), month = Number(mo), date = Number(day), hour = Number(h), minute = Number(min), second = Number(sec);
  const local = new Date(Date.UTC(year, month - 1, date));
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== date || hour > 23 || minute > 59 || second > 59 ||
      (zone !== 'Z' && (Number(zh) > 23 || Number(zm) > 59))) throw new RangeError(`not an ISO timestamp: ${String(iso)}`);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new RangeError(`not an ISO timestamp: ${String(iso)}`);
  return d;
}

function validateScheduleState(state: ScheduleState): void {
  if (!state || typeof state !== 'object') throw new RangeError('schedule state must be an object');
  parseInstant(state.due);
  if (state.lastReview !== undefined) parseInstant(state.lastReview);
  if (!['new', 'learning', 'review', 'relearning'].includes(state.phase)) throw new RangeError(`invalid schedule phase: ${String(state.phase)}`);
  const nonnegative = ['stability', 'elapsedDays', 'scheduledDays', 'reps', 'lapses'] as const;
  for (const key of nonnegative) if (!Number.isFinite(state[key]) || state[key] < 0) throw new RangeError(`invalid schedule state ${key}`);
  if (!Number.isFinite(state.difficulty) || state.difficulty < 0 || state.difficulty > 10) throw new RangeError('invalid schedule state difficulty');
  const steps = (state as FsrsScheduleState).learningSteps;
  if (steps !== undefined && (!Number.isInteger(steps) || steps < 0)) throw new RangeError('invalid schedule state learningSteps');
  if (!Number.isInteger(state.reps) || !Number.isInteger(state.lapses)) throw new RangeError('schedule state reps and lapses must be integers');
  if (state.phase !== 'new' && !state.lastReview) throw new RangeError('a reviewed schedule state requires lastReview');
  if (state.lastReview && Date.parse(state.due) < Date.parse(state.lastReview)) throw new RangeError('schedule due time precedes lastReview');
}

/** ScheduleState → the library's Card. */
export function toCard(state: ScheduleState): Card {
  validateScheduleState(state);
  const steps = (state as FsrsScheduleState).learningSteps;
  return {
    due: parseInstant(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: typeof steps === 'number' ? steps : 0,
    reps: state.reps,
    lapses: state.lapses,
    state: STATE_OF[state.phase],
    ...(state.lastReview ? { last_review: parseInstant(state.lastReview) } : {}),
  };
}

/** The library's Card → ScheduleState, stamped with the identity of the scheduler that produced it. */
export function fromCard(card: Card, identity: { algorithm: string; parametersVersion: string }): FsrsScheduleState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    phase: PHASE_OF[card.state],
    ...(card.last_review ? { lastReview: card.last_review.toISOString() } : {}),
    learningSteps: card.learning_steps,
    algorithm: identity.algorithm,
    parametersVersion: identity.parametersVersion,
  };
}

export function createFsrsScheduler(opts: FsrsSchedulerOptions = {}): Scheduler {
  if (opts.enableFuzz !== undefined && opts.enableFuzz !== false) throw new RangeError('fuzz is not supported: the schedule must be reproducible on every device');
  const desiredRetention = opts.desiredRetention ?? default_request_retention;
  if (!(desiredRetention > 0 && desiredRetention < 1)) throw new RangeError('desiredRetention must be strictly between 0 and 1');
  const maximumInterval = opts.maximumInterval ?? default_maximum_interval;
  if (!(Number.isFinite(maximumInterval) && maximumInterval >= 1)) throw new RangeError('maximumInterval must be at least one day');
  if (opts.parameters !== undefined && (opts.parameters.length !== 21 || opts.parameters.some((n) => !Number.isFinite(n) || n < 0))) {
    throw new RangeError('FSRS parameters must contain exactly 21 finite, nonnegative weights');
  }

  const params = generatorParameters({
    request_retention: desiredRetention,
    maximum_interval: maximumInterval,
    w: opts.parameters ?? [...default_w],
    enable_fuzz: false,
  });
  const engine = fsrs(params);
  // The effective weights (the library may migrate an older-length vector), so the identity matches what is actually run.
  const effective = [...engine.parameters.w];
  const parametersVersion = shortHash(JSON.stringify({ w: effective, r: desiredRetention, m: maximumInterval, s: engine.parameters.enable_short_term, l: engine.parameters.learning_steps, rl: engine.parameters.relearning_steps }));
  const identity = { algorithm: ALGORITHM, parametersVersion };
  const profile: ScheduleProfile = Object.freeze({
    ...identity,
    desiredRetention,
    maximumInterval,
    parameters: Object.freeze([...effective]) as unknown as number[],
    enableShortTerm: engine.parameters.enable_short_term,
    learningSteps: Object.freeze([...engine.parameters.learning_steps]) as unknown as string[],
    relearningSteps: Object.freeze([...engine.parameters.relearning_steps]) as unknown as string[],
  });

  return {
    algorithm: ALGORITHM,
    parametersVersion,
    desiredRetention,
    profile,
    newState(now: string): ScheduleState {
      return fromCard(createEmptyCard(parseInstant(now)), identity);
    },
    review(state: ScheduleState, rating: Rating, now: string): ScheduleState {
      validateScheduleState(state);
      if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4) throw new RangeError(`rating must be 1..4, got ${String(rating)}`);
      const at = parseInstant(now);
      if (state.lastReview && at.getTime() < parseInstant(state.lastReview).getTime()) throw new RangeError('review time precedes lastReview');
      return fromCard(engine.next(toCard(state), at, rating as Grade).card, identity);
    },
    retrievability(state: ScheduleState, now: string): number {
      validateScheduleState(state);
      if (state.phase === 'new' || !state.lastReview) return 0;
      const at = parseInstant(now);
      if (at.getTime() <= parseInstant(state.lastReview).getTime()) return 1;
      const r = engine.get_retrievability(toCard(state), at, false);
      return Math.min(1, Math.max(0, r));
    },
    isDue(state: ScheduleState, now: string): boolean {
      return parseInstant(state.due).getTime() <= parseInstant(now).getTime();
    },
  };
}
