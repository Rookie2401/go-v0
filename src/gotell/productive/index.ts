/**
 * GoTell practice — the productive-language engine (see docs/GOTELL.md).
 *   createPractice(deps): GoTellPractice   // also available as gotell.practice
 *   goals / assess / ladder / state / scheduler / taxonomy / interpret: the deterministic parts, each testable alone
 */
export { createPractice } from './practice';
export type { PracticeDeps } from './practice';
export { CATALOG_GOALS, catalogGoals, catalogModel, learnerGoal } from './goals';
export { EVALUATOR, MEANING_LIMITS, MEANING_METHOD, assessLanguage, assessMeaning, errorsOf, outcomeOf } from './assess';
export { GIVES_WORDING, HINT_LABEL, RUNG, TIER, nextStep, previewNext, sentenceFrame, strongestTier, tierRank } from './ladder';
export type { LadderInput, MetSentence, StepDraft } from './ladder';
export { DUE_HOURS, FAILURE_RETRY_HOURS, LEVEL_NAME, RECENT_EXPOSURE_MS, applyAttempt, applySpontaneous, effectiveSupport, emptyState, foldStates, levelLabel } from './state';
export type { Spontaneous, TimedAttempt, TimedStep } from './state';
export { SCHEDULER_POLICY, WEIGHTS, chooseFamily, predictedSuccess, rankGoals, scoreGoal, startRung } from './scheduler';
export type { GoalSignals } from './scheduler';
export { allErrorCodes, codeForCategory, registerErrorCode, taxonomyEntry } from './taxonomy';
export type { TaxonomyEntry } from './taxonomy';
export { consult, validateInterpretation } from './interpret';
