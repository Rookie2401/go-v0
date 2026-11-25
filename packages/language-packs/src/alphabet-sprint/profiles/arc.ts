/**
 * Biblical Aramaic (arc, variety arc-bib), square script. The letters, points and rules are shared with Hebrew (hebrew-script.ts), but
 * this profile has its OWN words (the Aramaic of Daniel and Ezra from the pack's seed) and its own card ids (`class:arc-alphabet…`),
 * so nothing learned as Hebrew counts as Aramaic. Sounds are the conventional transliteration, as the Alphabet deck gives them: a
 * reading aid, not a recording. WRITTEN FOR THIS DECK, not reviewed by an Aramaic specialist.
 */
import { PHRASES, WORDS } from '../words/arc';
import type { ScriptProfile } from '../types';
import { KEY, squareDependencies, squareUnits, squareWordsOf, withExamples } from './hebrew-script';

export const ARC_PROFILE: ScriptProfile = {
  languageId: 'arc', scriptId: 'Hebr', rtl: true, firstBatch: 4, laterBatch: 3,
  units: withExamples(squareUnits('arc'), WORDS, squareDependencies),
  words: WORDS, phrases: PHRASES,
  confusions: [
    { a: 'ב', b: 'כ', tell: 'ב has a flat base that sticks out to the left; כ is rounded with no corner' },
    { a: 'ד', b: 'ר', tell: 'ד has a sharp corner at the top right; ר is rounded' },
    { a: 'ה', b: 'ח', tell: 'ה has a gap between its left leg and the roof; ח is closed' },
    { a: 'ח', b: 'ת', tell: 'ת has a small foot on its left leg; ח does not' },
    { a: 'ו', b: 'ז', tell: 'ו is a plain stroke; ז has a little flag on top' },
    { a: 'ו', b: 'ן', tell: 'ן drops below the line (final nun); ו stays on the line' },
    { a: 'ע', b: 'צ', tell: 'צ has a tail like a small branch; ע is a plain Y-shape' },
    { a: KEY.patah, b: KEY.qamats, tell: 'qamets has a small stem under the line; patah is just the line' },
    { a: KEY.segol, b: KEY.tsere, tell: 'segol is three dots in a triangle; tsere is two dots side by side' },
    { a: KEY.shinDot, b: KEY.sinDot, tell: 'the dot on the right is š; the dot on the left is ś' },
  ],
  dependencies: squareDependencies,
  words_of: squareWordsOf,
  notes: 'Biblical Aramaic in square script, right to left, with the same letters and points as Hebrew. Sounds are the conventional transliteration the Alphabet deck uses (a reading aid, not a recording); the stops ב ג ד כ פ ת also soften after a vowel, which the transliteration does not show. Cantillation, meteg, maqaf and sof pasuq are never needed to read an ordinary word, so they are ignored. Only pointed words are decoded. Starter words are Aramaic forms from the pack seed (Daniel and Ezra, OSHB) with the lexicon gloss of their word; verbs, and forms with an attached prefix or pronoun suffix, are left out so a gloss never misdescribes a form. No pronunciation is given: the pack has no Aramaic transliteration. Not reviewed by a specialist.',
};
