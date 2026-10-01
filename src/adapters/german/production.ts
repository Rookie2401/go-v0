/**
 * Rule checks on a learner's own German (GoTell). An empty result means nothing was found, never "correct".
 * STUB — package GD replaces the body.
 */
import type { AnalyzedToken, ErrorCandidate, RawToken } from '../../core';
import type { DeLexiconView } from './types';

export function checkGermanProduction(_tokens: RawToken[], _analyses: AnalyzedToken[], _sentence: string, _lex: DeLexiconView): ErrorCandidate[] { return []; }
