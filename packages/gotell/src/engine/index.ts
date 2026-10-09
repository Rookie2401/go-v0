/**
 * GoTell's analysis and graduated-assistance engine. Imports the repository contract, the language packs and the sync client only.
 * No DOM, no store, no network: the remote port is a type, and nothing is wired to it.
 */
export { UNCERTAIN_BELOW, classOfCategory, createAnalyzer } from './analyze';
export type { Analyzer, AnalyzerDeps, Detected, PackSentence, PackText, RewriteCheck, RewriteOptions, SentenceSpan } from './analyze';
export { CHECKED_AREAS, summariseCoverage } from './coverage';
export type { CoverageSummary } from './coverage';
export { NO_MODEL_WITHOUT_REMOTE, createAssistance } from './assist';
export type { Assistance, AssistanceContext, AssistanceDeps, AssistanceResult, Refusal } from './assist';
export { isReproducedLater, judgeAuthorship, shownSentence, stepsForSentence } from './authorship';
export type { AuthorshipHistory, EarlierVersion } from './authorship';
export { firstSentence, hashText, leadSentences, normaliseForCompare, sameSentence, sentenceScopeHash } from './text';
