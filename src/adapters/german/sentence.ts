/**
 * The German sentence layer: agreement and government narrow what a form can be, separated verbs are put together,
 * compounds are taken apart, readings are ordered by context. STUB — package GC replaces the bodies; the signatures
 * are final.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken, WordPart } from '../../core';
import type { DeLexiconView } from './types';

/** The candidates of every token of one sentence, best first (the adapter's `analyze`). */
export function analyzeGermanSentence(tokens: RawToken[], _lex: DeLexiconView): AnalysisCandidate[][] { return tokens.map(() => []); }

/** The adapter's `refine` (see LanguageAdapter.refine): order again after the importer merged dictionary readings. */
export function refineGermanSentence(_tokens: RawToken[], analyzed: AnalyzedToken[], _analyzers: ReadonlySet<string>, _lex: DeLexiconView): AnalyzedToken[] { return analyzed; }

/**
 * A compound taken apart, or undefined when no decomposition is backed by known words. Parts carry kind 'component',
 * 'link' and 'head'; `lexical` is true when the whole word is itself in the lexicon. `isWord` lets a caller widen
 * what counts as a known part beyond the lexicon (a dictionary-backed test); by default only lexicon words count.
 */
export function decomposeCompound(
  _surface: string, _lex: DeLexiconView, _isWord?: (lemma: string) => boolean,
): { parts: WordPart[]; confidence: number; lexical: boolean } | undefined { return undefined; }

/** The adapter's `relate`: 'same' | 'inflection' (same lemma) | 'component' (one is a part of the other compound) | 'none'. */
export function relateGerman(_a: string, _b: string, _lex: DeLexiconView): 'same' | 'inflection' | 'component' | 'none' { return 'none'; }
