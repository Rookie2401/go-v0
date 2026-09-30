/**
 * GoTell — constrained production engine (My Testimony first).
 *   createGoTell(deps): GoTellService     // GoTell + forUser(userId)
 *   RuleBasedSuggestionProvider           // repair / recombination (expansion assigned by the service)
 *   DraftConflictError                    // name 'DraftConflict', thrown by saveDraft on a stale expectedSeq
 */
export { createGoTell, isEncountered, isTestimonyText, testimonySlug, DraftConflictError, MAX_SUGGESTIONS_PER_DRAFT, MAX_SUGGESTIONS_PER_SENTENCE } from './service';
export type { GoTellDeps, GoTellService, GoLearnReader } from './service';
export { RuleBasedSuggestionProvider, basePriority, recombine } from './provider';
export type { AnalyzedError, ProposedSuggestion, RuleBasedProviderDeps } from './provider';
export { CONCEPTS, CHRONOLOGY, conceptsForToken, englishConcepts, lexemesFor, tagSection, NEGATORS, SUBJECT_PRONOUNS } from './concepts';
export type { ConceptId, ConceptMeta } from './concepts';
export { diffSentences } from './diff';
export { meaningChanges, negationChange, chronologyChange, keyTermChange, tenseChange } from './meaning';
export { checkerCoverage } from './coverage';
export { createSourceFinder } from './sources';
export type { SourceFinder } from './sources';
export { intentTerms, retrieveWording, stemEnglish } from './retrieval';
export type { IntentTerm, RetrievalResult, RetrievedWording } from './retrieval';
