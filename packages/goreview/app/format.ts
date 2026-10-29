/** Labels, durations and the evidence explanations shared by the screens. No DOM. */
import { replaysExceeded } from '../src/grading/grade';
import type { AssessmentDimension, Exercise, ExerciseFamily, Grading, GradeOutcome, Response, ReviewResult } from '../src/types';

/** A readable label from a unit id such as `lemma:sq:shtëpi:NOUN` or `form:sq:shtëpinë`; the id itself when it has no such shape. */
export function unitLabel(unitId: string): string {
  const parts = unitId.split(':');
  if (parts.length >= 3 && parts[2]) return parts[2];
  return unitId;
}

/** English names of the languages GoLearn teaches (and a few more); an unknown code is returned as it is. */
const LANGUAGE_NAMES: Record<string, string> = {
  sq: 'Albanian', de: 'German', es: 'Spanish', hi: 'Hindi', th: 'Thai', fr: 'French', it: 'Italian', pt: 'Portuguese', ru: 'Russian', ar: 'Arabic',
  he: 'Hebrew', el: 'Greek', grc: 'Ancient Greek', la: 'Latin', en: 'English', tr: 'Turkish', pl: 'Polish', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
};
export const languageName = (languageId: string): string => LANGUAGE_NAMES[languageId.split('-')[0].toLowerCase()] ?? languageId;

export const FAMILY_LABEL: Record<ExerciseFamily, string> = {
  'written-recognition': 'Recognition (meaning of a word)',
  'meaning-to-form': 'Retrieval (meaning to word)',
  'morphological-identification': 'Form analysis',
  'grammar-application': 'Grammar',
  'phrase-comprehension': 'Phrase',
  'sentence-completion': 'Sentence completion',
  'audio-to-meaning': 'Listening (meaning)',
  'audio-transcription': 'Listening (write what you hear)',
};

export const DIMENSION_LABEL: Record<AssessmentDimension, string> = {
  'written-recognition': 'Written recognition',
  'meaning-recall': 'Meaning recall',
  'meaning-to-target-retrieval': 'Meaning to word',
  'morphological-analysis': 'Morphological analysis',
  'construction-understanding': 'Constructions',
  'phrase-comprehension': 'Phrases',
  'auditory-recognition': 'Auditory recognition',
  'auditory-transcription': 'Auditory transcription',
  'productive-recall': 'Productive recall',
};

export const OUTCOME_LABEL: Record<GradeOutcome, string> = {
  correct: 'Correct',
  incorrect: 'Not quite',
  partial: 'Partly correct',
  ambiguous: 'Could not be judged with confidence',
  'invalid-question': 'This question is not valid',
  'unable-to-grade': 'Could not be graded',
};

export const RATING_LABEL = ['', 'Again', 'Hard', 'Good', 'Easy'] as const;

export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const isAudioExercise = (e: Exercise): boolean => e.family === 'audio-to-meaning' || e.family === 'audio-transcription';

/** Whether the audio was replayed more often than the stimulus allows: such a result is recorded as help and does not move the schedule. */
export const extraReplays = (response: Pick<Response, 'replays'>, exercise: Exercise): boolean => replaysExceeded(response, exercise.prompt?.audio?.replaysAllowed);

/** Whether the learner's answer is in the target language (so the input and the answer carry `lang`). */
export const answerInTarget = (family: ExerciseFamily): boolean =>
  family === 'meaning-to-form' || family === 'sentence-completion' || family === 'audio-transcription' || family === 'grammar-application';

/**
 * Why a result does not count (fully) as evidence, in a sentence; undefined when it does. Read from the committed result:
 * the engine decides what is recorded, this only explains it to the learner.
 */
export function withheldReason(result: ReviewResult, exercise: Exercise): string | undefined {
  if (result.response.audioFailed) return 'the audio could not be heard, so nothing is claimed about listening';
  if (result.grading.outcome === 'invalid-question') return 'the question was not valid, so nothing about you was observed';
  if (result.grading.outcome === 'unable-to-grade') return 'the answer could not be graded, so nothing about you was observed';
  if (result.response.challenged) return 'you challenged the answer key: kept in your history, not counted as evidence';
  if (extraReplays(result.response, exercise)) return 'you replayed the audio more often than allowed, so this was recorded as help and does not move your schedule';
  if (!result.evidence) return 'the engine claimed no evidence for this answer';
  if (result.evidence.evidence?.quality === 'none') {
    if (isAudioExercise(exercise)) return exercise.prompt.audio?.validity.reason ?? 'this audio is practice only: it cannot be listening evidence';
    return 'recorded with no evidence weight';
  }
  return undefined;
}

/** A forecast for the feedback screen, before the result is committed. */
export function forecastRecording(grading: Grading, response: Response, exercise: Exercise): string {
  if (response.audioFailed) return 'Not recorded: the audio could not be heard, so nothing is claimed about listening.';
  if (grading.outcome === 'invalid-question') return 'Not recorded: the question was not valid.';
  if (grading.outcome === 'unable-to-grade') return 'Not recorded: the answer could not be graded.';
  if (response.challenged) return 'Will be kept in your history, not counted as evidence and not used to schedule the item.';
  if (response.retrievalAttempted === false || response.hinted || response.assistance.length || response.transcriptShownBefore) {
    return 'Will be kept in your history without a recall rating or evidence weight because help was used or no retrieval attempt was confirmed.';
  }
  if (extraReplays(response, exercise)) {
    return 'Will be recorded as help, not as recall: you replayed the audio more often than allowed, so it does not move your schedule.';
  }
  if (isAudioExercise(exercise) && !exercise.prompt.audio?.validity.eligibleForEvidence) {
    return 'Will be recorded as listening practice with no evidence weight: synthetic or unreviewed speech cannot be listening evidence.';
  }
  return 'Will be recorded when you continue.';
}

/** A readable label from a deck item id (`card:<dimension>:<unit id>`). */
export const itemLabel = (itemId: string): string => unitLabel(itemId.replace(/^card:[^:]+:/, ''));
