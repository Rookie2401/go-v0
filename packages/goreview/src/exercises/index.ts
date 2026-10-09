/**
 * GoReview's assessment module: exercise builders (eight families), validation, grading and evidence.
 * See ./README.md. Imports the contract, GoListen's contracts, the language packs and ../types only.
 */
export { registry, BUILDERS, familyBuilder, allBuilders, familiesForDimension, familiesFor, buildExercise, gradeAndRate } from './registry';
export { validateExercise, ALLOWED_SENTENCE_SOURCES } from './validate';
export { evidenceFor, GOREVIEW_EVENT_VERSION } from './evidence';
export type { EvidenceExtra, EvidenceIdentity, EvidenceInputObject, EvidenceResult } from './evidence';
export { GAP, eligibilityOf, PROVISIONAL_EXCEPTION } from './shared';
export type { ExerciseContext, ReviewExercise } from './shared';
export { writtenRecognition, glossDistractors } from './written-recognition';
export { meaningToForm } from './meaning-to-form';
export { morphologicalIdentification } from './morphological-identification';
export { grammarApplication } from './grammar-application';
export { phraseComprehension } from './phrase-comprehension';
export { sentenceCompletion } from './sentence-completion';
export { audioToMeaning } from './audio-to-meaning';
export { audioTranscription } from './audio-transcription';
