/** Pure helpers adapted from the legacy GoTell engine (src/gotell/*, 2026-10-09). Nothing here reads learner state or a store. */
export { diffSentences } from './diff';
export type { DiffEntry } from './diff';
export { CHRONOLOGY, CONCEPTS, CONCEPT_IDS, NEGATORS, SUBJECT_PRONOUNS, conceptMatches, conceptsForToken, englishConcepts, lexemesFor } from './concepts';
export type { ConceptId, ConceptMeta } from './concepts';
export { checkerCoverage, checkerCoverageParts, coverageText } from './coverage';
export { chronologyChange, chronologyIn, isNegator, keyTermChange, meaningChanges, negationChange, negatorsIn, tenseChange } from './meaning';
export { planRepairs } from './repairs';
export type { PlannedRepair } from './repairs';
export { validateProposalShape } from './remote';
export type { RemoteProposal } from './remote';
export {
  BOUNDARY_POS, FUNCTION_POS, MIN_ANALYSIS_CONFIDENCE, addsContent, applyEdits, applyEditsDetailed, bestCandidate, introducedIndexes, isFunctionAt, parse, posAt, related, removedIndexes, wordIndexes,
} from './text';
export type { Parsed } from './text';
export type { AdapterSupport, AnalysisCandidate, AnalyzedToken, ErrorCandidate, LanguageAdapter, PartOfSpeech, RawToken, SupportLevel } from './types';
