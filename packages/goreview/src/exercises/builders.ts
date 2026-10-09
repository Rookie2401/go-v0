/**
 * Builder plumbing shared by the eight families: turn a `plan` (sync, pure, may refuse) into an `ExerciseBuilder`.
 * A plan returns a finished exercise or a reason; `canBuild` is "the plan holds and the exercise validates", so it never
 * says yes where `build` would say no (audio is the one family whose stimulus is only known at build time).
 */
import { gradeResponse } from '../grading/grade';
import type { BuildContext, Exercise, ExerciseBuilder, ExerciseFamily, GradeContext, Grading, Response, ReviewTarget, UnitFacts } from '../types';
import { FAMILY_DIMENSION } from '../types';
import { unavailable } from './shared';
import type { Planned, ReviewExercise, Unavailable } from './shared';
import { validateExercise } from './validate';

export type PlanFn = (target: ReviewTarget, facts: UnitFacts, ctx: BuildContext) => Planned;

/** Validates and seals an exercise, or says why it cannot be shown. */
export function seal(exercise: ReviewExercise): ReviewExercise | Unavailable {
  const validation = validateExercise(exercise);
  if (!validation.ok) return unavailable(`the exercise failed its own checks: ${validation.issues.join('; ')}`);
  return { ...exercise, validation };
}

export function defineBuilder(family: ExerciseFamily, plan: PlanFn, opts: { needsAudio?: boolean } = {}): ExerciseBuilder {
  const safePlan: PlanFn = (target, facts, ctx) => {
    try { return plan(target, facts, ctx); } catch (e) { return { ok: false, reason: `the builder failed unexpectedly (${e instanceof Error ? e.message : String(e)})` }; }
  };
  return {
    family,
    dimension: FAMILY_DIMENSION[family],
    canBuild(target, facts, ctx) {
      const p = safePlan(target, facts, ctx);
      if (!p.ok) return false;
      if (opts.needsAudio) return !!ctx.audio;
      return validateExercise(p.exercise).ok;
    },
    async build(target, facts, ctx): Promise<Exercise | Unavailable> {
      const p = safePlan(target, facts, ctx);
      if (!p.ok) return unavailable(p.reason);
      return seal(p.exercise);
    },
    grade(exercise: Exercise, response: Response, _ctx: GradeContext): Grading {
      return gradeResponse(exercise, response);
    },
  };
}
