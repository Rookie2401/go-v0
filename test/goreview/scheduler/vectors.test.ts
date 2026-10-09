/**
 * Frozen reference vectors. `vectors.json` holds numbers produced ONCE by running ts-fsrs's own `next()` /
 * `get_retrievability()` (see packages/goreview/src/scheduler/verify.ts). Nothing here recomputes them with our code:
 * if the library is upgraded and its maths or defaults move, the first group below fails and shows exactly what drifted.
 * To re-freeze deliberately after reviewing a library upgrade:  FSRS_FREEZE=1 npx vitest run test/goreview/scheduler/vectors
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkInvariants, checkLibraryAgainstVectors, checkRepeatAgreesWithNext, checkSchedulerAgainstVectors, computeReferenceVectors, createFsrsScheduler } from '../../../packages/goreview/src/scheduler';
import type { ReferenceVectors } from '../../../packages/goreview/src/scheduler';

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'vectors.json');

if (process.env.FSRS_FREEZE === '1' || !existsSync(FILE)) writeFileSync(FILE, `${JSON.stringify(computeReferenceVectors(), null, 2)}\n`);
const frozen = JSON.parse(readFileSync(FILE, 'utf8')) as ReferenceVectors;

describe('frozen FSRS vectors', () => {
  it('records which library and defaults they were frozen against', () => {
    expect(frozen.library).toBe('ts-fsrs');
    expect(frozen.libraryVersion).toBe('v5.4.2 using FSRS-6.0');
    expect(frozen.retention).toBe(0.9);
    expect(frozen.enableFuzz).toBe(false);
    expect(frozen.enableShortTerm).toBe(true);
    expect(frozen.learningSteps).toEqual(['1m', '10m']);
    expect(frozen.relearningSteps).toEqual(['10m']);
    expect(frozen.parameters).toHaveLength(21);
  });

  it('the installed library still reproduces every frozen number (fails on library drift)', () => {
    expect(checkLibraryAgainstVectors(frozen)).toEqual([]);
  });

  it('our scheduler, through ScheduleState, reproduces every frozen number', () => {
    expect(checkSchedulerAgainstVectors(createFsrsScheduler(), frozen)).toEqual([]);
  });

  it("the library's repeat() preview agrees with next() for every grade", () => {
    expect(checkRepeatAgreesWithNext()).toEqual([]);
  });

  it('the scheduler shows the invariants of any FSRS implementation', () => {
    expect(checkInvariants(createFsrsScheduler())).toEqual([]);
  });

  it('documents the brand-new card rated Good four times at its due dates', () => {
    const g = frozen.goodFour;
    expect(g.map((s) => s.phase)).toEqual(['learning', 'review', 'review', 'review']);
    // The first Good lands on the second learning step (10 minutes); from then on days.
    expect(g[0]!.due).toBe('2026-01-01T00:10:00.000Z');
    expect(g.map((s) => s.scheduledDays)).toEqual([0, 2, 11, 46]);
    expect(g.map((s) => s.reps)).toEqual([1, 2, 3, 4]);
    expect(g.every((s) => s.lapses === 0)).toBe(true);
    expect(g.map((s) => s.stability)).toEqual([2.3065, 2.3065, 10.97104786, 46.31685657]);
  });

  it('documents Again on a Review-state card: relearning, lapses + 1, ten-minute step, then back to Review', () => {
    const [again, recovered] = frozen.lapse;
    expect(again!.phase).toBe('relearning');
    expect(again!.lapses).toBe(1);
    expect(again!.scheduledDays).toBe(0);
    expect(Date.parse(again!.due) - Date.parse(again!.at)).toBe(10 * 60_000);
    expect(recovered!.phase).toBe('review');
    expect(recovered!.lapses).toBe(1);
    expect(recovered!.scheduledDays).toBeGreaterThan(0);
  });

  it('documents Hard < Good < Easy for the same Review-state card', () => {
    const [again, hard, good, easy] = frozen.grades;
    expect(again!.phase).toBe('relearning');
    expect(hard!.scheduledDays).toBeLessThan(good!.scheduledDays);
    expect(good!.scheduledDays).toBeLessThan(easy!.scheduledDays);
  });

  it('documents that recall probability a stability-length after the review is about the desired retention', () => {
    // R(S, S) = 0.9 exactly in FSRS; the library measures elapsed time in WHOLE days (10.97 days is read as 10), hence 0.906 and not 0.900.
    const atS = frozen.retrievability.find((r) => Math.abs(r.daysAfterLastReview - frozen.goodFour[2]!.stability) < 1e-9)!;
    expect(atS.value).toBeGreaterThan(0.89);
    expect(atS.value).toBeLessThan(0.92);
    expect(frozen.retrievability[0]!.value).toBe(1);
  });
});
