/**
 * Every orientation tutorial a pack ships, by language id. Seven languages have one: Albanian and Spanish (the fuller ones) and
 * German, Hindi, Thai, Norwegian Bokmål and Nynorsk (the minimal orientations of the experimental packs). The application's
 * `tutorial(languageId)` binding reads this map; a language with no entry has no orientation, and the app says so.
 */
import { DE_TUTORIAL, DE_TUTORIAL_STEPS } from './de';
import { ES_TUTORIAL, ES_TUTORIAL_STEPS, ES_PASSAGE } from './es';
import { HI_TUTORIAL, HI_TUTORIAL_STEPS } from './hi';
import { NB_TUTORIAL, NB_TUTORIAL_STEPS } from './nb';
import { NN_TUTORIAL, NN_TUTORIAL_STEPS } from './nn';
import { SQ_TUTORIAL, SQ_TUTORIAL_STEPS, SQ_PASSAGE } from './sq';
import { TH_TUTORIAL, TH_TUTORIAL_STEPS } from './th';
import type { Tutorial } from './types';

export { DE_TUTORIAL, DE_TUTORIAL_STEPS, ES_TUTORIAL, ES_TUTORIAL_STEPS, ES_PASSAGE, HI_TUTORIAL, HI_TUTORIAL_STEPS, NB_TUTORIAL, NB_TUTORIAL_STEPS, NN_TUTORIAL, NN_TUTORIAL_STEPS, SQ_TUTORIAL, SQ_TUTORIAL_STEPS, SQ_PASSAGE, TH_TUTORIAL, TH_TUTORIAL_STEPS };
export type {
  Tutorial, TutorialAuthorship, TutorialExample, TutorialPassage, TutorialPractice, TutorialStep, TutorialStepKind,
} from './types';

/** The language ids that have a tutorial, in the order the pack registry lists them. */
export const TUTORIALS: Readonly<Record<string, Tutorial>> = Object.freeze({
  sq: SQ_TUTORIAL,
  es: ES_TUTORIAL,
  de: DE_TUTORIAL,
  hi: HI_TUTORIAL,
  th: TH_TUTORIAL,
  nb: NB_TUTORIAL,
  nn: NN_TUTORIAL,
});

/** The orientation of a language; undefined for a language with none (never an inherited key). */
export function tutorialFor(languageId: string): Tutorial | undefined {
  return Object.prototype.hasOwnProperty.call(TUTORIALS, languageId) ? TUTORIALS[languageId] : undefined;
}
