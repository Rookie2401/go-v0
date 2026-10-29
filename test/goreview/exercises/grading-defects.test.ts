/** Regression tests for three grading defects: Hebrew / Greek folds in the grader, listening replays beyond the allowance, and nothing else. */
import { describe, expect, it } from 'vitest';
import { gradeResponse, gradeTyped, ratingFor } from '../../../packages/goreview/src/grading';
import type { GradingKey } from '../../../packages/goreview/src/grading';
import { forecastRecording } from '../../../packages/goreview/app/format';
import type { Exercise, Response } from '../../../packages/goreview/src/types';

const cp = (...c: number[]) => String.fromCodePoint(...c);
const key = (w: string, over: Partial<GradingKey> = {}): GradingKey => ({ accepted: [w], normalization: 'loose', explanation: 'x', ...over });

describe('gradeTyped folds Hebrew points and Greek accents like the Albanian ë / ç fold', () => {
  // שָׁלוֹם written with explicit code points: shin, shin dot, qamats, lamed, vav, holam, final mem
  const shalomPointed = cp(0x5E9, 0x5C1, 0x5B8, 0x5DC, 0x5D5, 0x5B9, 0x5DD);
  const shalom = cp(0x5E9, 0x5DC, 0x5D5, 0x5DD);
  const other = cp(0x5D1, 0x5D9, 0x5EA); // בית
  const logos = 'λόγος';

  it('an unpointed Hebrew answer to a pointed key is partial at the folded confidence', () => {
    const g = gradeTyped(key(shalomPointed), shalom);
    expect(g.outcome).toBe('partial');
    expect(g.confidence).toBe(0.7);
    expect(g.matched).toBe(shalomPointed);
  });
  it('an unaccented Greek answer to an accented key is partial', () => {
    const g = gradeTyped(key(logos), 'λογος');
    expect(g.outcome).toBe('partial');
    expect(g.confidence).toBe(0.7);
  });
  it('the exact Hebrew / Greek spelling is still correct', () => {
    expect(gradeTyped(key(shalomPointed), shalomPointed).outcome).toBe('correct');
    expect(gradeTyped(key(logos), logos).outcome).toBe('correct');
  });
  it('a genuinely different Hebrew or Greek word is incorrect', () => {
    expect(gradeTyped(key(shalomPointed), other).outcome).toBe('incorrect');
    expect(gradeTyped(key(logos), 'λογοι').outcome).toBe('incorrect');
  });
  it('an exact-normalisation key does not fold', () => {
    expect(gradeTyped(key(shalomPointed, { normalization: 'exact' }), shalom).outcome).toBe('incorrect');
  });
  it('the Albanian fold keeps its own wording and confidence', () => {
    const g = gradeTyped(key('libër'), 'liber');
    expect(g.outcome).toBe('partial');
    expect(g.confidence).toBe(0.7);
    expect(g.explanation).toContain('ë and ç are letters of their own');
  });
});

describe('listening replays beyond the allowance are help: no rating', () => {
  const exercise = (replaysAllowed: number): Exercise => ({
    responseMode: 'typed', validation: { ok: true, issues: [] }, prompt: { audio: { replaysAllowed } },
    answerKey: key('libër'),
  } as unknown as Exercise);
  const resp = (over: Partial<Response> = {}): Response => ({ hinted: false, assistance: [], typed: 'libër', ...over });

  it('a correct typed answer within the allowance still rates 3', () => {
    const r = resp({ replays: 1 });
    const g = gradeResponse(exercise(1), r);
    expect(g.outcome).toBe('correct');
    expect(ratingFor(g, r)).toBe(3);
  });
  it('a correct typed answer with one replay too many rates null (recorded as help)', () => {
    const r = resp({ replays: 2 });
    const g = gradeResponse(exercise(1), r);
    expect(g.outcome).toBe('correct');
    expect(ratingFor(g, r)).toBeNull();
  });
  it('an incorrect answer with extra replays is null as well', () => {
    const r = resp({ replays: 3, typed: 'tjetër' });
    expect(ratingFor(gradeResponse(exercise(0), r), r)).toBeNull();
  });
  it('a caller that knows the allowance can pass it to ratingFor directly', () => {
    const r = resp({ replays: 2 });
    const g = { outcome: 'correct' as const, confidence: 1, explanation: 'x' };
    expect(ratingFor(g, r)).toBe(3);
    expect(ratingFor(g, r, { replaysAllowed: 1 })).toBeNull();
    expect(ratingFor(g, r, { replaysAllowed: 2 })).toBe(3);
  });
  it('the feedback screen says the answer is recorded as help and does not move the schedule', () => {
    const r = resp({ replays: 2 });
    const ex = exercise(1);
    const text = forecastRecording(gradeResponse(ex, r), r, ex);
    expect(text).toMatch(/recorded as help/);
    expect(text).toMatch(/does not move your schedule/);
    expect(forecastRecording(gradeResponse(ex, resp({ replays: 1 })), resp({ replays: 1 }), ex)).toBe('Will be recorded when you continue.');
  });
});
