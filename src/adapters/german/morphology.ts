/**
 * German word forms: analysis and generation. STUB — package GA replaces the bodies; the signatures are final.
 */
import type { PartOfSpeech } from '../../core';
import type { DeAdjective, DeCell, DeLexiconView, DeNoun, DeReading, DeVerb } from './types';

/** Every context-free reading of one written word (capitalisation as written), best first. Empty when nothing can be said. */
export function analyzeGermanForm(_surface: string, _lex: DeLexiconView): DeReading[] { return []; }

/** Every form of a noun with the cells it fills. */
export function declineNoun(_noun: DeNoun): Array<{ form: string; cells: DeCell[] }> { return []; }

/** Every inflected form of an adjective in one degree, with the cells (and declensions) it fills. */
export function declineAdjective(_adj: DeAdjective, _degree: 'pos' | 'cmp' | 'sup' = 'pos'): Array<{ form: string; cells: DeCell[] }> { return []; }

/**
 * The forms of a verb, keyed "pres.1s" … "pres.3p", "pret.1s" …, "subj1.1s" …, "subj2.1s" …, "imp.2s", "imp.2p",
 * "inf", "inf.zu", "part.past", "part.pres". A separable verb's finite forms are given as written in a subordinate
 * clause (aufsteht); `split` gives the main-clause pieces ("steht", "auf").
 */
export function conjugateGerman(_verb: DeVerb): { forms: Record<string, string>; split?: Record<string, [string, string]> } { return { forms: {} }; }

/** A plain-words line for a feature bundle ("dative plural", "third person singular, preterite"), for the word sheet. */
export function describeGermanMorph(_morph: Record<string, string>, _pos?: PartOfSpeech): string { return ''; }
