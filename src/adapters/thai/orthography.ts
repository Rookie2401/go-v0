/**
 * Thai orthography engine — STUB written by the coordinator so that the other packages compile.
 * Package A (docs/PLAN5.md) replaces the bodies; the exported names and signatures are the contract.
 */
import type { SyllableAnalysis } from '../../core';

export type ThaiTone = NonNullable<SyllableAnalysis['tone']>;

/** Decode one written Thai word by rule (+ reviewed exception list). Never guesses silently: see PLAN5 §A. */
export function decodeThai(_surface: string): SyllableAnalysis[] {
  return [];
}

/**
 * Decode a dictionary's phonemic respelling ("ขะ-หฺนม"), which is regular by construction, and lay the result over
 * the written word. `ipa` (when given) is the authority for tone; a disagreement lowers confidence and is flagged.
 */
export function decodeThaiRespelling(_surface: string, _respelling: string, _ipa?: string): SyllableAnalysis[] {
  return [];
}

/** Tones read off IPA tone letters, one per syllable ("/kʰa˨˩.nom˩˩˦/" → ["low", "rising"]). */
export function tonesFromIpa(_ipa: string): Array<ThaiTone | undefined> {
  return [];
}

/** The writing-system items a decoded word exercises (feature keys for ids.orth('th', key)). */
export function thaiOrthFeatures(_syllables: SyllableAnalysis[]): string[] {
  return [];
}

/** Human label of an orth feature key ("rule:low+dead+short=high" → "low-class consonant, short dead syllable → high tone"). */
export function describeThaiOrthFeature(key: string): string {
  return key;
}
