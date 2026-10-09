// @vitest-environment node
/**
 * AUDIT §18 (part 1) — the FSRS scheduler on its own: new item, success, failure, relearning, desired retention,
 * delayed review, the frozen reference vectors, purity and failure modes. Real scheduler (ts-fsrs 5.4.2, FSRS-6).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkInvariants, checkLibraryAgainstVectors, checkRepeatAgreesWithNext, checkSchedulerAgainstVectors, computeReferenceVectors, createFsrsScheduler } from '../../packages/goreview/src/scheduler';
import type { ReferenceVectors } from '../../packages/goreview/src/scheduler';
import type { Rating, ScheduleState } from '../../packages/goreview/src/types';
import { DAY, flushRowsAfterAll, note } from './model.support';

flushRowsAfterAll('scheduler.core');

const T0 = '2026-03-01T09:00:00.000Z';
const at = (ms: number, from = T0): string => new Date(Date.parse(from) + ms).toISOString();

/** The brand-new card, reviewed at each due date with the given ratings. Returns every state. */
function run(s: ReturnType<typeof createFsrsScheduler>, ratings: Rating[], start = T0): ScheduleState[] {
  const out: ScheduleState[] = [];
  let st = s.newState(start);
  let now = start;
  for (const r of ratings) {
    st = s.review(st, r, now);
    out.push(st);
    now = st.due;
  }
  return out;
}

const deepFreeze = <T,>(o: T): T => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

describe('§18 the frozen reference vectors, re-run', () => {
  const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'goreview', 'scheduler', 'vectors.json');
  const frozen = JSON.parse(readFileSync(FILE, 'utf8')) as ReferenceVectors;
  const steps = frozen.goodFour.length + frozen.lapse.length + frozen.grades.length + 1 + frozen.retrievability.length;

  it('the file on disk is exactly what ts-fsrs computes now (nothing stale, nothing hand-edited)', () => {
    expect(JSON.parse(JSON.stringify(computeReferenceVectors()))).toEqual(frozen);
  });

  it('the installed library reproduces every frozen number', () => {
    expect(checkLibraryAgainstVectors(frozen)).toEqual([]);
  });

  it('our Scheduler (through ScheduleState and back) reproduces every frozen number, and repeat() agrees with next()', () => {
    expect(checkSchedulerAgainstVectors(createFsrsScheduler(), frozen)).toEqual([]);
    expect(checkRepeatAgreesWithNext()).toEqual([]);
    expect(checkInvariants(createFsrsScheduler())).toEqual([]);
    note('S1', '§18', 'frozen reference vectors (library, adapter, repeat(), invariants)', '0 mismatches in each of the four checks', `${steps} frozen values; library 0, adapter 0, repeat() 0, invariants 0 mismatches; ${frozen.libraryVersion}, retention ${frozen.retention}, fuzz ${frozen.enableFuzz}`);
  });

  it('a different scheduler (retention 0.8) is NOT silently accepted as the frozen one: it disagrees with the vectors', () => {
    expect(checkSchedulerAgainstVectors(createFsrsScheduler({ desiredRetention: 0.8 }), frozen).length).toBeGreaterThan(0);
  });
});

describe('§18 states of one card', () => {
  const s = createFsrsScheduler();

  it('NEW: phase new, no reps, due now, retrievability 0, identity stamped', () => {
    const n = s.newState(T0);
    expect(n).toMatchObject({ phase: 'new', reps: 0, lapses: 0, due: T0, algorithm: s.algorithm, parametersVersion: s.parametersVersion });
    expect(n.lastReview).toBeUndefined();
    expect(s.retrievability(n, at(DAY))).toBe(0);
    expect(s.isDue(n, T0)).toBe(true);
    note('S2', '§18', 'new item', 'phase new, reps 0, due = creation instant, retrievability 0', `phase ${n.phase}, reps ${n.reps}, due ${n.due}, R=${s.retrievability(n, at(DAY))}`);
  });

  it('SUCCESS: Good, Good, Good, Good at the due dates gives learning → review with growing intervals 0, 2, 11, 46 days', () => {
    const st = run(s, [3, 3, 3, 3]);
    expect(st.map((x) => x.phase)).toEqual(['learning', 'review', 'review', 'review']);
    expect(st.map((x) => x.scheduledDays)).toEqual([0, 2, 11, 46]);
    expect(st.map((x) => x.reps)).toEqual([1, 2, 3, 4]);
    expect(st.every((x) => x.lapses === 0)).toBe(true);
    for (let i = 2; i < st.length; i++) expect(st[i]!.stability).toBeGreaterThan(st[i - 1]!.stability);
    expect(Date.parse(st[0]!.due) - Date.parse(T0)).toBe(10 * 60_000);
    note('S3', '§18', 'success path (Good ×4 at due dates)', 'phases learning,review,review,review; intervals 0,2,11,46 d; stability grows', `phases ${st.map((x) => x.phase)}; intervals ${st.map((x) => x.scheduledDays)}; stability ${st.map((x) => x.stability)}`);
  });

  it('FAILURE: Again on a Review card → relearning, lapses + 1, stability falls, due in 10 minutes', () => {
    const good = run(s, [3, 3, 3, 3]);
    const last = good[3]!;
    const failed = s.review(last, 1, last.due);
    expect(failed.phase).toBe('relearning');
    expect(failed.lapses).toBe(1);
    expect(failed.stability).toBeLessThan(last.stability);
    expect(failed.difficulty).toBeGreaterThan(last.difficulty);
    expect(Date.parse(failed.due) - Date.parse(last.due)).toBe(10 * 60_000);
    note('S4', '§18', 'failure (Again at a Review card)', 'relearning; lapses 1; stability and interval fall; difficulty rises; due +10 min', `phase ${failed.phase}; lapses ${failed.lapses}; stability ${last.stability} → ${failed.stability}; difficulty ${last.difficulty} → ${failed.difficulty}; due +${(Date.parse(failed.due) - Date.parse(last.due)) / 60_000} min`);
  });

  it('RELEARNING: Good at the relearning due date returns to Review keeping lapses; a second Again counts a second lapse', () => {
    const last = run(s, [3, 3, 3])[2]!;
    const relearn = s.review(last, 1, last.due);
    const recovered = s.review(relearn, 3, relearn.due);
    expect(recovered.phase).toBe('review');
    expect(recovered.lapses).toBe(1);
    expect(recovered.scheduledDays).toBeGreaterThan(0);
    const again = s.review(recovered, 1, recovered.due);
    expect(again.lapses).toBe(2);
    // Again while already relearning is not a new lapse (the card has not been recalled in between)
    const stillRelearning = s.review(relearn, 1, relearn.due);
    expect(stillRelearning.phase).toBe('relearning');
    expect(stillRelearning.lapses).toBe(1);
    note('S5', '§18', 'relearning', 'Good after the relearning step → review, lapses stay 1; a later Again → lapses 2; Again inside relearning adds no lapse', `recovered ${recovered.phase}/${recovered.lapses} (${recovered.scheduledDays} d); second lapse ${again.lapses}; Again while relearning ${stillRelearning.lapses}`);
  });

  it('GRADES: Again < Hard < Good < Easy in the next interval for the same Review card', () => {
    const last = run(s, [3, 3, 3])[2]!;
    const d = ([1, 2, 3, 4] as Rating[]).map((r) => s.review(last, r, last.due).scheduledDays);
    expect(d[0]).toBe(0);
    expect(d[1]).toBeLessThan(d[2]!);
    expect(d[2]).toBeLessThan(d[3]!);
  });

  it('DELAYED review: a Good 30 days after the due date is still scheduled forward, with lower recall at review time and a larger stability gain than on time', () => {
    const last = run(s, [3, 3, 3])[2]!;
    const onTime = s.review(last, 3, last.due);
    const lateAt = at(30 * DAY, last.due);
    const rLate = s.retrievability(last, lateAt);
    const late = s.review(last, 3, lateAt);
    expect(rLate).toBeLessThan(s.retrievability(last, last.due));
    expect(rLate).toBeLessThan(0.9);
    expect(Date.parse(late.due)).toBeGreaterThan(Date.parse(lateAt));
    expect(late.phase).toBe('review');
    expect(late.elapsedDays).toBeGreaterThanOrEqual(30);
    expect(late.stability).toBeGreaterThan(onTime.stability); // recalling something long overdue is stronger evidence of stability
    // and a long-delayed failure is a lapse like any other
    const lateFail = s.review(last, 1, lateAt);
    expect(lateFail.phase).toBe('relearning');
    expect(lateFail.lapses).toBe(1);
    note('S6', '§18', 'delayed review (30 days after due)', 'R at review < 0.9; Good still schedules forward; stability gain larger than on time; Again is a lapse', `R(30 d late)=${rLate.toFixed(3)}; on-time stability ${onTime.stability} vs late ${late.stability}; next interval ${late.scheduledDays} d; late Again → ${lateFail.phase}`);
  });

  it('RETRIEVABILITY falls monotonically with time, stays in [0, 1], and the due flag turns at the due instant', () => {
    const last = run(s, [3, 3, 3])[2]!;
    let prev = 1;
    for (const days of [0, 1, 3, 7, 11, 30, 90, 365, 3650]) {
      const r = s.retrievability(last, at(days * DAY, last.lastReview));
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(prev);
      prev = r;
    }
    expect(s.isDue(last, at(-1, last.due))).toBe(false);
    expect(s.isDue(last, last.due)).toBe(true);
    expect(s.retrievability(last, at(-DAY, last.lastReview))).toBe(1); // a clock earlier than the last review reads as "just reviewed"
  });
});

describe('§18 desired retention', () => {
  const lo = createFsrsScheduler({ desiredRetention: 0.8 });
  const mid = createFsrsScheduler({ desiredRetention: 0.9 });
  const hi = createFsrsScheduler({ desiredRetention: 0.95 });

  it('0.8 gives longer intervals than 0.9, which gives longer intervals than 0.95, from the same ratings', () => {
    const ratings: Rating[] = [3, 3, 3, 3, 3];
    const a = run(lo, ratings).map((x) => x.scheduledDays);
    const b = run(mid, ratings).map((x) => x.scheduledDays);
    const c = run(hi, ratings).map((x) => x.scheduledDays);
    for (let i = 1; i < ratings.length; i++) {
      expect(a[i]!, `review ${i + 1}`).toBeGreaterThan(b[i]!);
      expect(b[i]!, `review ${i + 1}`).toBeGreaterThan(c[i]!);
    }
    note('S7', '§18', 'desired retention 0.8 vs 0.9 vs 0.95 (Good ×5 at due dates)', 'intervals strictly ordered 0.8 > 0.9 > 0.95 from review 2 on', `0.8: ${a}; 0.9: ${b}; 0.95: ${c} (days)`);
  });

  it('the retention is part of the identity: three schedulers, three parametersVersion values, one algorithm', () => {
    const versions = new Set([lo.parametersVersion, mid.parametersVersion, hi.parametersVersion]);
    expect(versions.size).toBe(3);
    expect(new Set([lo.algorithm, mid.algorithm, hi.algorithm]).size).toBe(1);
    expect([lo.desiredRetention, mid.desiredRetention, hi.desiredRetention]).toEqual([0.8, 0.9, 0.95]);
    expect(run(mid, [3])[0]!.parametersVersion).toBe(mid.parametersVersion);
  });

  it('recall probability at the due date is about the desired retention (whole-day clock: within 0.02 above)', () => {
    for (const sch of [lo, mid, hi]) {
      const st = run(sch, [3, 3, 3, 3]);
      const r = sch.retrievability(st[3]!, st[3]!.due);
      expect(r).toBeGreaterThanOrEqual(sch.desiredRetention - 0.001);
      expect(r).toBeLessThanOrEqual(sch.desiredRetention + 0.02);
    }
  });

  it('the preference range the settings screen offers (70 %–97 %) is accepted; 0, 1 and non-numbers are refused', () => {
    for (const r of [0.7, 0.97]) expect(() => createFsrsScheduler({ desiredRetention: r })).not.toThrow();
    for (const bad of [0, 1, -0.1, 1.2, Number.NaN]) expect(() => createFsrsScheduler({ desiredRetention: bad })).toThrow(RangeError);
    expect(() => createFsrsScheduler({ enableFuzz: true as never })).toThrow(RangeError);
    expect(() => createFsrsScheduler({ maximumInterval: 0 })).toThrow(RangeError);
  });

  it('changing the retention needs a re-fold: a state made at 0.8 is not rewritten when a 0.95 scheduler reviews it (it is re-stamped, silently)', () => {
    const st = run(lo, [3, 3, 3])[2]!;
    const crossed = hi.review(st, 3, st.due);
    expect(crossed.parametersVersion).toBe(hi.parametersVersion); // stamped as the new scheduler's
    // the result differs from a state folded from the start under 0.95: stability/difficulty history of the old regime was carried over
    const pure = run(hi, [3, 3, 3, 3])[3]!;
    expect(crossed.stability).not.toBe(pure.stability);
    note('S8', '§18', 'a stored 0.8 state handed to the 0.95 scheduler', 'not applicable if the deck is always re-folded from events; otherwise the old regime leaks into a new-regime stamp', `crossed stamp ${crossed.parametersVersion} but stability ${crossed.stability} ≠ pure 0.95 fold ${pure.stability} → mixing is possible only by bypassing foldDeck (which always starts from newState)`);
  });

  it('a small maximum interval is a SOFT cap: Hard stays under it, Good and Easy may overshoot by the strict Hard < Good < Easy ordering (<= 2 days)', () => {
    const capped = createFsrsScheduler({ maximumInterval: 30 });
    const st = run(capped, [3, 3, 3, 3, 3, 3]);
    const last = st[st.length - 1]!;
    const byRating = ([2, 3, 4] as Rating[]).map((r) => capped.review(last, r, last.due).scheduledDays);
    expect(byRating[0]).toBeLessThanOrEqual(30);
    for (const d of byRating) expect(d).toBeLessThanOrEqual(32);
    expect(byRating[0]).toBeLessThan(byRating[1]!);
    expect(byRating[1]).toBeLessThan(byRating[2]!);
    const overshoot = Math.max(...st.map((x) => x.scheduledDays), ...byRating) - 30;
    note('S10', '§18', 'maximumInterval 30', 'no interval above the cap', `Good path intervals ${st.map((x) => x.scheduledDays)}; Hard/Good/Easy at the last review ${byRating}; overshoot +${overshoot} d (the scheduler README documents this only for Easy)`, overshoot === 0);
  });
});

describe('§18 purity, determinism, serialisation and failure modes', () => {
  const s = createFsrsScheduler();

  it('review never mutates its input and is deterministic (same history, same bytes, on a second scheduler instance)', () => {
    const st = deepFreeze(run(s, [3, 3])[1]!);
    const a = s.review(st, 3, st.due);
    const b = createFsrsScheduler().review(st, 3, st.due);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).not.toBe(st);
  });

  it('a state survives JSON (stored on one device, read on another) with the learning-step counter intact', () => {
    const learning = run(s, [3])[0]!; // learning step 1 of 2
    expect(learning.learningSteps).toBe(1);
    const revived = JSON.parse(JSON.stringify(learning)) as ScheduleState;
    expect(JSON.stringify(s.review(revived, 3, revived.due))).toBe(JSON.stringify(s.review(learning, 3, learning.due)));
  });

  it('refuses ratings outside 1..4 and unparseable instants (RangeError); never returns NaN', () => {
    const st = s.newState(T0);
    for (const bad of [0, 5, 2.5, Number.NaN, '3' as never]) expect(() => s.review(st, bad as Rating, T0)).toThrow(RangeError);
    expect(() => s.review(st, 3, 'yesterday')).toThrow(RangeError);
    expect(() => s.newState('')).toThrow(RangeError);
    const ok = s.review(st, 3, T0);
    for (const v of [ok.stability, ok.difficulty, ok.elapsedDays, ok.scheduledDays]) expect(Number.isFinite(v)).toBe(true);
  });

  it('a review dated BEFORE the previous one is refused by the library (the fold avoids it by sorting); the error is not a RangeError', () => {
    const st = run(s, [3, 3, 3])[2]!;
    let thrown: unknown;
    try { s.review(st, 3, at(-33 * DAY, st.lastReview)); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(Error);
    note('S9', '§18', 'a review dated before the card\'s last review (clock skew)', 'refused, not silently accepted', `throws ${(thrown as Error).name}: ${(thrown as Error).message} (library error, not a RangeError; foldDeck sorts by instant so it never triggers it)`);
  });

  it('two reviews at the same instant are both applied (reps count twice): de-duplication is the store\'s job, not the scheduler\'s', () => {
    const st = run(s, [3, 3, 3])[2]!;
    const once = s.review(st, 3, at(DAY, st.lastReview));
    const twice = s.review(once, 3, at(DAY, st.lastReview));
    expect(twice.reps).toBe(once.reps + 1);
  });
});
