/**
 * @go/goreview-ecclesia — GoReview specialised for the Ecclesia theological library (Biblical Hebrew, Biblical Aramaic, Koine
 * Greek, Latin). Headless: this barrel is the whole integration surface; the reader designs the interface on top of it.
 * See docs/ecosystem/GOREVIEW-ECCLESIA-ARCHITECTURE.md and GOREVIEW-ECCLESIA-INTEGRATION.md.
 */
export * from './contract';
export * from './languages';
export * from './identity';
export * from './encounters';
export * from './cards';
export * from './facts';
export * from './profile';
export * from './frequency';
export * from './familiarity';
export * from './session';

// The shared engine pieces a reader needs beside the Ecclesia surface (one import for the whole thing).
export { createFsrsScheduler } from '../../goreview/src/scheduler/fsrs';
export { foldDeck, foldDeckItems, itemIdFor } from '../../goreview/src/scheduler/deck';
export type { DeckFold } from '../../goreview/src/scheduler/deck';
export type { SessionRunner, CurrentExercise, SessionSummary } from '../../goreview/src/session/runner';
export { summarize } from '../../goreview/src/session/runner';
export type {
  AssessmentDimension, DeckItem, Exercise, ExerciseFamily, Grading, PlannedItem, Rating, Response, ReviewPreferences, ReviewResult, ScheduleState, Scheduler, SessionPlan, SessionState,
} from '../../goreview/src/types';
export type { GoEvent, KnowledgeLevel, ReviewCandidate, ScriptureSourceRef, UnitKnowledge } from '../../repository-contract/src';
export { KNOWLEDGE_LEVELS, KNOWLEDGE_LEVEL_RANK, KNOWLEDGE_LEVEL_WORDS, validateEvent } from '../../repository-contract/src';
export { createMemoryArea } from '../../repository-sync/src/area';
export type { KeyValueArea } from '../../repository-sync/src/area';
