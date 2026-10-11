import { describe, expect, it } from 'vitest';
import { ALGORITHM, createFsrsScheduler, fromCard, toCard } from '../../../packages/goreview/src/scheduler';
import type { Rating, ScheduleState } from '../../../packages/goreview/src/types';
import { DAY, T0 } from './helpers';

const sched = createFsrsScheduler();

/** Rate Good `n` times, each at the due date the previous review produced. */
function afterGoods(s = sched, n = 3): { state: ScheduleState; at: string } {
  let state = s.newState(T0);
  let at = T0;
  for (let i = 0; i < n; i++) { state = s.review(state, 3, at); at = state.due; }
  return { state, at };
}

describe('createFsrsScheduler identity', () => {
  it('names the library and its real version string', () => {
    expect(sched.algorithm).toBe(ALGORITHM);
    expect(sched.algorithm).toBe('fsrs@v5.4.2 using FSRS-6.0');
    expect(sched.desiredRetention).toBe(0.9);
  });
  it('parametersVersion is a short stable hash of parameters and retention', () => {
    expect(sched.parametersVersion).toMatch(/^[0-9a-f]{8}$/);
    expect(createFsrsScheduler().parametersVersion).toBe(sched.parametersVersion);
    expect(createFsrsScheduler({ desiredRetention: 0.85 }).parametersVersion).not.toBe(sched.parametersVersion);
    expect(createFsrsScheduler({ maximumInterval: 365 }).parametersVersion).not.toBe(sched.parametersVersion);
    const w = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
    expect(createFsrsScheduler({ parameters: w }).parametersVersion).toBe(sched.parametersVersion);
    w[2] = 2.5;
    expect(createFsrsScheduler({ parameters: w }).parametersVersion).not.toBe(sched.parametersVersion);
  });
  it('stamps every state with the identity that produced it', () => {
    const s = createFsrsScheduler({ desiredRetention: 0.85 });
    const st = s.review(s.newState(T0), 3, T0);
    expect(st.algorithm).toBe(s.algorithm);
    expect(st.parametersVersion).toBe(s.parametersVersion);
  });
  it('refuses fuzz, out-of-range retention and bad ratings or timestamps', () => {
    expect(() => createFsrsScheduler({ enableFuzz: true as unknown as false })).toThrow(/fuzz/);
    expect(() => createFsrsScheduler({ desiredRetention: 1 })).toThrow(RangeError);
    expect(() => createFsrsScheduler({ desiredRetention: 0 })).toThrow(RangeError);
    expect(() => sched.review(sched.newState(T0), 5 as Rating, T0)).toThrow(RangeError);
    expect(() => sched.review(sched.newState(T0), 0 as Rating, T0)).toThrow(RangeError);
    expect(() => sched.newState('not a date')).toThrow(RangeError);
  });
  it('refuses malformed parameter vectors, state values and reviews before the previous review', () => {
    expect(() => createFsrsScheduler({ parameters: [1, 2] })).toThrow(/21/);
    expect(() => createFsrsScheduler({ parameters: [...Array(20).fill(1), Number.NaN] })).toThrow(/21/);
    const { state, at } = afterGoods();
    expect(() => sched.review(state, 3, new Date(Date.parse(state.lastReview!) - 1).toISOString())).toThrow(/precedes lastReview/);
    expect(() => sched.retrievability({ ...state, stability: Number.NaN }, at)).toThrow(/stability/);
    expect(() => sched.review({ ...state, phase: 'bad' as never }, 3, at)).toThrow(/phase/);
    expect(() => sched.newState('2026-02-31T00:00:00.000Z')).toThrow(RangeError);
  });
});

describe('state transitions', () => {
  it('a new item is new, due at once, never reviewed, retrievability 0', () => {
    const st = sched.newState(T0);
    expect(st).toMatchObject({ phase: 'new', reps: 0, lapses: 0, stability: 0, due: T0 });
    expect(st.lastReview).toBeUndefined();
    expect(sched.isDue(st, T0)).toBe(true);
    expect(sched.retrievability(st, T0)).toBe(0);
    expect(sched.retrievability(st, new Date(Date.parse(T0) + 30 * DAY).toISOString())).toBe(0);
  });
  it('Good on a new item enters learning (short-term steps), then reaches review', () => {
    const l = sched.review(sched.newState(T0), 3, T0);
    expect(l.phase).toBe('learning');
    expect(Date.parse(l.due) - Date.parse(T0)).toBe(10 * 60_000);
    expect(l.lastReview).toBe(T0);
    const r = sched.review(l, 3, l.due);
    expect(r.phase).toBe('review');
    expect(r.scheduledDays).toBeGreaterThanOrEqual(1);
  });
  it('isDue flips exactly at the due instant', () => {
    const { state } = afterGoods();
    expect(sched.isDue(state, new Date(Date.parse(state.due) - 1).toISOString())).toBe(false);
    expect(sched.isDue(state, state.due)).toBe(true);
    expect(sched.isDue(state, new Date(Date.parse(state.due) + 1).toISOString())).toBe(true);
  });
  it('Again on a Review card relearns with lapses + 1 and a short step', () => {
    const { state, at } = afterGoods();
    expect(state.phase).toBe('review');
    const a = sched.review(state, 1, at);
    expect(a.phase).toBe('relearning');
    expect(a.lapses).toBe(state.lapses + 1);
    expect(a.reps).toBe(state.reps + 1);
    expect(a.stability).toBeLessThan(state.stability);
    expect(Date.parse(a.due) - Date.parse(at)).toBe(10 * 60_000);
    const back = sched.review(a, 3, a.due);
    expect(back.phase).toBe('review');
    expect(back.lapses).toBe(1);
  });
  it('Easy > Good > Hard intervals on a Review card; Again is shortest', () => {
    const { state, at } = afterGoods();
    const days = ([1, 2, 3, 4] as Rating[]).map((g) => Date.parse(sched.review(state, g, at).due) - Date.parse(at));
    expect(days[0]).toBeLessThan(days[1]!);
    expect(days[1]).toBeLessThan(days[2]!);
    expect(days[2]).toBeLessThan(days[3]!);
  });
  it('a higher desired retention gives shorter intervals; the maximum interval caps them', () => {
    const strict = createFsrsScheduler({ desiredRetention: 0.97 });
    const loose = createFsrsScheduler({ desiredRetention: 0.8 });
    expect(afterGoods(strict).state.scheduledDays).toBeLessThan(afterGoods(loose).state.scheduledDays);
    const capped = createFsrsScheduler({ maximumInterval: 30 });
    let st = capped.newState(T0);
    let at = T0;
    for (let i = 0; i < 8; i++) { st = capped.review(st, 4, at); at = st.due; }
    // ts-fsrs keeps Hard < Good < Easy strictly ordered even at the cap, so Easy may overshoot the maximum by up to two days.
    expect(st.scheduledDays).toBeLessThanOrEqual(30 + 2);
    let free = sched.newState(T0);
    at = T0;
    for (let i = 0; i < 8; i++) { free = sched.review(free, 4, at); at = free.due; }
    expect(free.scheduledDays).toBeGreaterThan(300);
  });
  it('a review 30 days after the due date is handled: late success earns a larger stability than an on-time one', () => {
    const { state, at } = afterGoods();
    const late = new Date(Date.parse(at) + 30 * DAY).toISOString();
    const onTime = sched.review(state, 3, at);
    const delayed = sched.review(state, 3, late);
    expect(delayed.elapsedDays).toBeGreaterThan(onTime.elapsedDays);
    expect(delayed.stability).toBeGreaterThan(onTime.stability);
    expect(delayed.phase).toBe('review');
    expect(delayed.lastReview).toBe(late);
    // …and a late FAILURE is a lapse like any other.
    const lapsed = sched.review(state, 1, late);
    expect(lapsed.phase).toBe('relearning');
    expect(lapsed.lapses).toBe(state.lapses + 1);
  });
  it('a same-instant second review does not break (elapsed 0)', () => {
    const { state, at } = afterGoods();
    const twice = sched.review(sched.review(state, 3, at), 3, at);
    expect(Number.isFinite(twice.stability)).toBe(true);
  });
});

describe('retrievability', () => {
  it('is 1 right after a review and falls monotonically with time, staying within 0..1', () => {
    const { state } = afterGoods();
    const last = Date.parse(state.lastReview!);
    const rs = [0, 0.5, 1, 3, 10, 30, 90, 365, 3650].map((d) => sched.retrievability(state, new Date(last + d * DAY).toISOString()));
    expect(rs[0]).toBe(1);
    for (let i = 1; i < rs.length; i++) expect(rs[i]!).toBeLessThanOrEqual(rs[i - 1]!);
    expect(rs.every((r) => r >= 0 && r <= 1)).toBe(true);
    expect(rs[rs.length - 1]!).toBeLessThan(0.5);
  });
  it('a stronger (more stable) item is recalled better after the same delay', () => {
    const one = afterGoods(sched, 3).state;
    const more = afterGoods(sched, 5).state;
    const probeOne = sched.retrievability(one, new Date(Date.parse(one.lastReview!) + 20 * DAY).toISOString());
    const probeMore = sched.retrievability(more, new Date(Date.parse(more.lastReview!) + 20 * DAY).toISOString());
    expect(probeMore).toBeGreaterThan(probeOne);
  });
  it('a clock earlier than the last review reads as 1, never above', () => {
    const { state } = afterGoods();
    expect(sched.retrievability(state, new Date(Date.parse(state.lastReview!) - DAY).toISOString())).toBe(1);
  });
});

describe('determinism and conversion', () => {
  it('toCard/fromCard round-trip a state exactly', () => {
    const { state } = afterGoods(sched, 4);
    const identity = { algorithm: state.algorithm, parametersVersion: state.parametersVersion };
    expect(fromCard(toCard(state), identity)).toEqual(state);
    const fresh = sched.newState(T0);
    expect(fromCard(toCard(fresh), identity)).toEqual(fresh);
  });
  it('the same history gives the same state, independently of the instance, and survives JSON serialisation', () => {
    const run = (s: ReturnType<typeof createFsrsScheduler>, viaJson: boolean): ScheduleState => {
      let st = s.newState(T0);
      let at = T0;
      for (const g of [3, 3, 2, 3, 1, 3, 4] as Rating[]) {
        st = s.review(viaJson ? (JSON.parse(JSON.stringify(st)) as ScheduleState) : st, g, at);
        at = st.due;
      }
      return st;
    };
    const a = run(createFsrsScheduler(), false);
    expect(run(createFsrsScheduler(), false)).toEqual(a);
    expect(run(createFsrsScheduler(), true)).toEqual(a);
  });
  it('fuzz is off: ten repeated runs of a long interval are identical', () => {
    const { state, at } = afterGoods(sched, 4);
    const first = JSON.stringify(sched.review(state, 3, at));
    for (let i = 0; i < 10; i++) expect(JSON.stringify(sched.review(state, 3, at))).toBe(first);
  });
  it('a plain ScheduleState without the learning-step field is accepted (step 0 assumed)', () => {
    const { state, at } = afterGoods();
    const plain: ScheduleState = { ...state };
    delete (plain as { learningSteps?: number }).learningSteps;
    expect(sched.review(plain, 3, at)).toEqual(sched.review(state, 3, at));
  });
});
