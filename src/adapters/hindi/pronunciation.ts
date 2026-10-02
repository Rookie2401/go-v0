/**
 * How a written Hindi word is said. Writing and speech part ways in Hindi: a consonant letter carries an unwritten
 * "a" that is often not pronounced (कमल is written ka-ma-la and said ka-mal; लड़का is laṛ-kā), a nasal sign takes the
 * place of the following consonant's class, and borrowed words keep their own habits. So pronunciation is a separate
 * statement about each unit, with its own confidence and source, never read off the letters one by one.
 *
 * CONTRACT STUB (docs/PLAN12.md, package H1). The exported signatures are final.
 */
import type { SyllableAnalysis } from '../../core';

/**
 * The units of one word with what is said for each: `text` / `start` / `end` (the akṣara), `initial` (its consonant
 * letters), `cluster` (when they are joined), `vowel` (as written, '◌' when it is the unwritten a), `vowelLength`,
 * `vowelSound` (plain: a, ā, i, ī, u, ū, e, ai, o, au, ṛ; '' when the unwritten a is not said), `finalSound` for a
 * nasal or visarga, `inherentVowel` ('pronounced' | 'dropped' | 'uncertain') on every unit without a written vowel,
 * `signs`, `rule` (in plain words, whenever a rule other than "read as written" applied), `romanization` (ISO 15919,
 * of this unit as said), `source: 'rule'` or `'exception-list'`, `confidence`. `ending` and the tone fields stay unset.
 * Never guesses: where the rules cannot tell whether the a is said, `inherentVowel` is 'uncertain' and the confidence low.
 */
export function decodeHindi(surface: string): SyllableAnalysis[] {
  void surface;
  return [];
}

/**
 * The same, with a dictionary's pronunciation (IPA) as the authority for which unwritten vowels are said. Units then
 * carry `source: 'dictionary'`, `sourceId`, and `irregular: true` where the dictionary and the rules differ (the rule's
 * own answer is kept in `rule`). Falls back to decodeHindi when the IPA cannot be aligned with the spelling.
 */
export function decodeHindiWithPronunciation(surface: string, pron: { respelling?: string; ipa?: string }, sourceId?: string): SyllableAnalysis[] {
  void pron; void sourceId;
  return decodeHindi(surface);
}

/** Writing-system items a decoded word exercises: "letter:क", "matra:ा", "conjunct:क्ष", "sign:nukta", "sign:anusvara", "rule:final-a-dropped", "rule:medial-a-dropped", "rule:reph" … */
export function hindiOrthFeatures(units: SyllableAnalysis[]): string[] {
  void units;
  return [];
}

/** One plain sentence for a writing-system item, for the word sheet and the audit views. */
export function describeHindiOrthFeature(feature: string): string {
  return feature;
}
