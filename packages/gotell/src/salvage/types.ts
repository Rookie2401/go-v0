/**
 * The adapter shapes the salvaged helpers work on, derived from the pack runtime (`PackAnalyzer.adapter`) instead of imported from
 * `src/core`: GoTell reaches a language only through a language pack, so these are whatever the pack's analyser really is.
 */
import type { PackAnalyzer } from '../../../language-packs/src';

export type LanguageAdapter = NonNullable<PackAnalyzer['adapter']>;
export type RawToken = ReturnType<LanguageAdapter['tokenize']>[number];
export type AnalyzedToken = ReturnType<LanguageAdapter['analyze']>[number];
export type AnalysisCandidate = AnalyzedToken['candidates'][number];
export type ErrorCandidate = ReturnType<LanguageAdapter['checkProduction']>[number];
export type PartOfSpeech = NonNullable<AnalysisCandidate['pos']>;
export type AdapterSupport = LanguageAdapter['support'];
export type SupportLevel = AdapterSupport['productionChecks'];
