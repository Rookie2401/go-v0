/**
 * The registry of exercise builders: one per family, looked up by family or by assessment dimension.
 * `familiesFor` is what a planner asks ("which families can test this target now?"); `gradeAndRate` is what a session
 * runner calls once per response.
 */
import { ratingFor } from '../grading/grade';
import { EXERCISE_FAMILIES, FAMILY_DIMENSION } from '../types';
import type {
  AssessmentDimension, BuildContext, Exercise, ExerciseBuilder, ExerciseFamily, GradeContext, Grading, Rating, Response, ReviewTarget, UnitFacts,
} from '../types';
import { audioToMeaning } from './audio-to-meaning';
import { audioTranscription } from './audio-transcription';
import { grammarApplication } from './grammar-application';
import { meaningToForm } from './meaning-to-form';
import { morphologicalIdentification } from './morphological-identification';
import { phraseComprehension } from './phrase-comprehension';
import { sentenceCompletion } from './sentence-completion';
import { writtenRecognition } from './written-recognition';

export const BUILDERS: Readonly<Record<ExerciseFamily, ExerciseBuilder>> = {
  'written-recognition': writtenRecognition,
  'meaning-to-form': meaningToForm,
  'morphological-identification': morphologicalIdentification,
  'grammar-application': grammarApplication,
  'phrase-comprehension': phraseComprehension,
  'sentence-completion': sentenceCompletion,
  'audio-to-meaning': audioToMeaning,
  'audio-transcription': audioTranscription,
};

/** The builders as the session runner takes them (its `BuilderRegistry` accepts an array). */
export const registry: ReadonlyArray<ExerciseBuilder> = Object.values(BUILDERS);

export const familyBuilder = (family: ExerciseFamily): ExerciseBuilder => BUILDERS[family];
export const allBuilders = (): ExerciseBuilder[] => EXERCISE_FAMILIES.map((f) => BUILDERS[f]);
export const familiesForDimension = (dimension: AssessmentDimension): ExerciseFamily[] => EXERCISE_FAMILIES.filter((f) => FAMILY_DIMENSION[f] === dimension);

/** The families that could test this target right now (their `canBuild` holds). */
export function familiesFor(target: ReviewTarget, facts: UnitFacts, ctx: BuildContext): ExerciseFamily[] {
  return familiesForDimension(target.dimension).filter((f) => BUILDERS[f].canBuild(target, facts, ctx));
}

export async function buildExercise(
  family: ExerciseFamily, target: ReviewTarget, facts: UnitFacts, ctx: BuildContext,
): Promise<Exercise | { unavailable: true; reason: string }> {
  return BUILDERS[family].build(target, facts, ctx);
}

/** Grades with the exercise's own family builder, then maps the grading to an FSRS rating (null when it must not schedule). */
export function gradeAndRate(exercise: Exercise, response: Response, ctx: GradeContext): { grading: Grading; rating: Rating | null } {
  const grading = BUILDERS[exercise.family].grade(exercise, response, ctx);
  return { grading, rating: ratingFor(grading, response) };
}
