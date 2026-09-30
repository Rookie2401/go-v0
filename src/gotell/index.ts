/**
 * GoTell — constrained production engine (My Testimony first).
 *   createGoTell(deps): GoTellService     // GoTell + forUser(userId)
 *   RuleBasedSuggestionProvider           // repair / recombination (expansion assigned by the service)
 */
export { createGoTell, isEncountered, MAX_SUGGESTIONS_PER_DRAFT, MAX_SUGGESTIONS_PER_SENTENCE } from './service';
export type { GoTellDeps, GoTellService, GoLearnReader } from './service';
export { RuleBasedSuggestionProvider, basePriority, recombine } from './provider';
export type { AnalyzedError, ProposedSuggestion, RuleBasedProviderDeps } from './provider';
export { CONCEPTS, conceptsForToken, englishConcepts, lexemesFor, tagSection, NEGATORS, SUBJECT_PRONOUNS } from './concepts';
export type { ConceptId, ConceptMeta } from './concepts';
export { diffSentences } from './diff';
