/**
 * Reference check for the scheduler. The expected numbers are NOT written by hand and NOT derived from a model of our
 * own: `computeReferenceVectors()` runs ts-fsrs directly (its `fsrs().next()` and `get_retrievability()`, with the
 * library's default FSRS-6 parameters, retention 0.9 and fuzz off) over a fixed script. Those numbers are frozen once
 * in `test/goreview/scheduler/vectors.json`; the test then asserts, separately,
 *   (1) the installed library still reproduces the frozen numbers   → `checkLibraryAgainstVectors`  (drift on upgrade),
 *   (2) our `Scheduler` reproduces them through ScheduleState        → `checkSchedulerAgainstVectors` (adapter bugs),
 *   (3) the library's own `repeat()` preview agrees with `next()`    → `checkRepeatAgreesWithNext`.
 * Every function returns a list of human-readable mismatches; empty means verified.
 *
 * The script (all instants are exact due dates unless stated):
 *   goodFour      a brand-new card rated Good four times, each time at the due date the previous review produced
 *   lapse         the same card, rated Again at its next due date (a Review-state card), then Good at the relearning due date
 *   grades        a Review-state card (after three Goods) rated Again/Hard/Good/Easy at its due date: the four candidate states
 *   delayed       the card after three Goods reviewed 30 days after it was due, rated Good
 *   retrievability the card after three Goods: recall probability at 0, 1, 5, S, 2S and 30 days after the last review
 */
import { createEmptyCard, default_enable_fuzz, default_enable_short_term, default_learning_steps, default_maximum_interval, default_relearning_steps, default_request_retention, default_w, FSRSVersion, fsrs, Rating as LibRating, State } from 'ts-fsrs';
import type { Card, Grade } from 'ts-fsrs';
import type { Rating, ScheduleState, Scheduler } from '../types';
import { fromCard } from './fsrs';
import type { FsrsScheduleState } from './fsrs';

export const REFERENCE_START = '2026-01-01T00:00:00.000Z';
const DAY_MS = 86_400_000;

/** One review and the state it produced. */
export interface ReferenceStep {
  at: string;
  rating: Rating;
  due: string;
  phase: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  lastReview: string;
}

export interface ReferenceVectors {
  library: 'ts-fsrs';
  libraryVersion: string;
  retention: number;
  maximumInterval: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: string[];
  relearningSteps: string[];
  parameters: number[];
  start: string;
  goodFour: ReferenceStep[];
  lapse: ReferenceStep[];
  grades: ReferenceStep[];
  delayed: ReferenceStep;
  /** `daysAfterLastReview` → probability of recall for the card after three Goods. */
  retrievability: Array<{ daysAfterLastReview: number; value: number }>;
}

/** The two things a scenario needs, so the same script runs against the library and against our adapter. */
interface Engine<S> {
  empty(now: string): S;
  next(state: S, rating: Rating, now: string): S;
  snapshot(state: S, at: string, rating: Rating): ReferenceStep;
  due(state: S): string;
  retrievability(state: S, now: string): number;
}

const PHASE: Record<State, string> = { [State.New]: 'new', [State.Learning]: 'learning', [State.Review]: 'review', [State.Relearning]: 'relearning' };

function libraryEngine(): Engine<Card> {
  const f = fsrs({ request_retention: default_request_retention, maximum_interval: default_maximum_interval, w: [...default_w], enable_fuzz: false });
  return {
    empty: (now) => createEmptyCard(new Date(now)),
    next: (card, rating, now) => f.next(card, new Date(now), rating as Grade).card,
    snapshot: (c, at, rating) => ({
      at, rating, due: c.due.toISOString(), phase: PHASE[c.state], stability: c.stability, difficulty: c.difficulty,
      elapsedDays: c.elapsed_days, scheduledDays: c.scheduled_days, reps: c.reps, lapses: c.lapses, learningSteps: c.learning_steps,
      lastReview: c.last_review ? c.last_review.toISOString() : '',
    }),
    due: (c) => c.due.toISOString(),
    retrievability: (c, now) => f.get_retrievability(c, new Date(now), false),
  };
}

function schedulerEngine(s: Scheduler): Engine<ScheduleState> {
  return {
    empty: (now) => s.newState(now),
    next: (st, rating, now) => s.review(st, rating, now),
    snapshot: (st, at, rating) => ({
      at, rating, due: st.due, phase: st.phase, stability: st.stability, difficulty: st.difficulty,
      elapsedDays: st.elapsedDays, scheduledDays: st.scheduledDays, reps: st.reps, lapses: st.lapses,
      learningSteps: (st as FsrsScheduleState).learningSteps ?? 0, lastReview: st.lastReview ?? '',
    }),
    due: (st) => st.due,
    retrievability: (st, now) => s.retrievability(st, now),
  };
}

interface Script { goodFour: ReferenceStep[]; lapse: ReferenceStep[]; grades: ReferenceStep[]; delayed: ReferenceStep; retrievability: Array<{ daysAfterLastReview: number; value: number }> }

function runScript<S>(e: Engine<S>): Script {
  const goodFour: ReferenceStep[] = [];
  let st = e.empty(REFERENCE_START);
  let at = REFERENCE_START;
  const afterGoods: Array<{ state: S; at: string }> = [];
  for (let i = 0; i < 4; i++) {
    st = e.next(st, 3, at);
    goodFour.push(e.snapshot(st, at, 3));
    at = e.due(st);
    afterGoods.push({ state: st, at });
  }

  // Again on a Review-state card, then Good at the relearning due date.
  const lapse: ReferenceStep[] = [];
  let l = afterGoods[3]!.state;
  let lat = afterGoods[3]!.at;
  l = e.next(l, 1, lat);
  lapse.push(e.snapshot(l, lat, 1));
  lat = e.due(l);
  l = e.next(l, 3, lat);
  lapse.push(e.snapshot(l, lat, 3));

  // The four candidate outcomes for a Review-state card (after three Goods) reviewed at its due date.
  const third = afterGoods[2]!;
  const grades = ([1, 2, 3, 4] as Rating[]).map((g) => e.snapshot(e.next(third.state, g, third.at), third.at, g));

  const lateAt = new Date(Date.parse(third.at) + 30 * DAY_MS).toISOString();
  const delayed = e.snapshot(e.next(third.state, 3, lateAt), lateAt, 3);

  const last = Date.parse(e.snapshot(third.state, third.at, 3).lastReview);
  const stability = e.snapshot(third.state, third.at, 3).stability;
  const offsets = [0, 1, 5, stability, 2 * stability, 30].sort((a, b) => a - b);
  const retrievability = offsets.map((d) => ({ daysAfterLastReview: d, value: e.retrievability(third.state, new Date(last + d * DAY_MS).toISOString()) }));
  return { goodFour, lapse, grades, delayed, retrievability };
}

/** Runs the script on ts-fsrs directly. Used once, to freeze `vectors.json`, and again to detect library drift. */
export function computeReferenceVectors(): ReferenceVectors {
  return {
    library: 'ts-fsrs',
    libraryVersion: FSRSVersion,
    retention: default_request_retention,
    maximumInterval: default_maximum_interval,
    enableFuzz: default_enable_fuzz,
    enableShortTerm: default_enable_short_term,
    learningSteps: [...default_learning_steps],
    relearningSteps: [...default_relearning_steps],
    parameters: [...default_w],
    start: REFERENCE_START,
    ...runScript(libraryEngine()),
  };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function diff(label: string, frozen: unknown, got: unknown, out: string[]): void {
  if (!same(frozen, got)) out.push(`${label}: frozen ${JSON.stringify(frozen)} ≠ got ${JSON.stringify(got)}`);
}

/** The installed ts-fsrs against the frozen numbers: fails when an upgrade changes the maths or its defaults. */
export function checkLibraryAgainstVectors(frozen: ReferenceVectors): string[] {
  const out: string[] = [];
  const now = computeReferenceVectors();
  for (const k of ['library', 'libraryVersion', 'retention', 'maximumInterval', 'enableFuzz', 'enableShortTerm', 'learningSteps', 'relearningSteps', 'parameters', 'start'] as const) diff(k, frozen[k], now[k], out);
  frozen.goodFour.forEach((s, i) => diff(`goodFour[${i}]`, s, now.goodFour[i], out));
  frozen.lapse.forEach((s, i) => diff(`lapse[${i}]`, s, now.lapse[i], out));
  frozen.grades.forEach((s, i) => diff(`grades[${i}]`, s, now.grades[i], out));
  diff('delayed', frozen.delayed, now.delayed, out);
  diff('retrievability', frozen.retrievability, now.retrievability, out);
  return out;
}

/** Our Scheduler (through ScheduleState, toCard and fromCard) against the frozen numbers. Only meaningful for the default parameters. */
export function checkSchedulerAgainstVectors(scheduler: Scheduler, frozen: ReferenceVectors): string[] {
  const out: string[] = [];
  const got = runScript(schedulerEngine(scheduler));
  frozen.goodFour.forEach((s, i) => diff(`goodFour[${i}]`, s, got.goodFour[i], out));
  frozen.lapse.forEach((s, i) => diff(`lapse[${i}]`, s, got.lapse[i], out));
  frozen.grades.forEach((s, i) => diff(`grades[${i}]`, s, got.grades[i], out));
  diff('delayed', frozen.delayed, got.delayed, out);
  diff('retrievability', frozen.retrievability, got.retrievability, out);
  return out;
}

/** The library's own `repeat()` preview must agree with `next()` for every grade (an internal consistency check of the library). */
export function checkRepeatAgreesWithNext(): string[] {
  const out: string[] = [];
  const f = fsrs({ enable_fuzz: false });
  let card = createEmptyCard(new Date(REFERENCE_START));
  let at = new Date(REFERENCE_START);
  for (let i = 0; i < 4; i++) {
    const preview = f.repeat(card, at);
    for (const g of [LibRating.Again, LibRating.Hard, LibRating.Good, LibRating.Easy] as const) {
      const viaNext = f.next(card, at, g).card;
      diff(`step ${i} grade ${g}`, fromCard(preview[g].card, { algorithm: 'x', parametersVersion: 'x' }), fromCard(viaNext, { algorithm: 'x', parametersVersion: 'x' }), out);
    }
    card = f.next(card, at, LibRating.Good).card;
    at = card.due;
  }
  return out;
}

/** Properties any correct FSRS scheduler must show, independent of the exact numbers. */
export function checkInvariants(scheduler: Scheduler): string[] {
  const out: string[] = [];
  const e = schedulerEngine(scheduler);
  const s = runScript(e);
  if (s.goodFour[0]!.phase !== 'learning') out.push('first Good on a new card should enter learning (short-term steps are on by default)');
  const days = s.goodFour.map((x) => x.scheduledDays);
  for (let i = 2; i < days.length; i++) if (!(days[i]! > days[i - 1]!)) out.push(`intervals must grow under repeated Good: ${days.join(', ')}`);
  if (s.lapse[0]!.phase !== 'relearning' || s.lapse[0]!.lapses !== s.goodFour[3]!.lapses + 1) out.push('Again on a Review card must enter relearning with lapses + 1');
  const [again, hard, good, easy] = s.grades;
  if (!(hard!.scheduledDays <= good!.scheduledDays && good!.scheduledDays < easy!.scheduledDays)) out.push('Hard ≤ Good < Easy must hold for intervals');
  if (again!.phase !== 'relearning') out.push('Again after Review must relearn');
  const r = s.retrievability.map((x) => x.value);
  for (let i = 1; i < r.length; i++) if (!(r[i]! <= r[i - 1]! + 1e-12)) out.push(`retrievability must not rise with time: ${r.join(', ')}`);
  return out;
}
