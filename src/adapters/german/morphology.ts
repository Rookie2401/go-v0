/**
 * German word forms: analysis and generation (package GA, docs/PLAN11.md). Generation and analysis agree because
 * analysis is built from the forms generation produces: nouns (morph-noun), adjectives (morph-adjective), verbs
 * (morph-verb, morph-irregular), plain words for the word sheet (morph-describe).
 */
import type { PartOfSpeech } from '../../core';
import type { DeAdjective, DeCell, DeLexiconView, DeNoun, DeReading, DeVerb } from './types';
import { declineAdjectiveForms } from './morph-adjective';
import { analyze } from './morph-analyze';
import { describeGermanMorph as describe } from './morph-describe';
import { nounForms } from './morph-noun';
import { conjugateFull } from './morph-verb';

/** Every context-free reading of one written word (capitalisation as written), best first. Empty when nothing can be said. */
export function analyzeGermanForm(surface: string, lex: DeLexiconView): DeReading[] { return analyze(surface, lex); }

/**
 * Every form of a noun with the cells it fills. The older dative singular in -e (dem Manne) is a separate entry
 * carrying `older: true`; where it is spelled like another form of the noun (Tage) both entries are there.
 */
export function declineNoun(noun: DeNoun): Array<{ form: string; cells: DeCell[] }> { return nounForms(noun); }

/** Every inflected form of an adjective in one degree, with the cells (and declensions) it fills; the uninflected form has no cells. */
export function declineAdjective(adj: DeAdjective, degree: 'pos' | 'cmp' | 'sup' = 'pos'): Array<{ form: string; cells: DeCell[] }> {
  return declineAdjectiveForms(adj, degree);
}

/**
 * The forms of a verb, keyed "pres.1s" … "pres.3p", "pret.1s" …, "subj1.1s" …, "subj2.1s" …, "imp.2s", "imp.2p",
 * "inf", "inf.zu", "part.past", "part.pres". A separable verb's finite forms are given as written in a subordinate
 * clause (aufsteht); `split` gives the main-clause pieces ("steht", "auf"). A key the verb has no form for (the
 * imperative of a modal verb) is absent.
 */
export function conjugateGerman(verb: DeVerb): { forms: Record<string, string>; split?: Record<string, [string, string]> } {
  const conj = conjugateFull(verb);
  const forms: Record<string, string> = {};
  for (const [key, list] of Object.entries(conj.forms)) forms[key] = list[0].form;
  return conj.prefix ? { forms, split: conj.split } : { forms };
}

/** A plain-words line for a feature bundle ("dative plural", "third person singular, preterite"), for the word sheet. */
export function describeGermanMorph(morph: Record<string, string>, pos?: PartOfSpeech): string { return describe(morph, pos); }
