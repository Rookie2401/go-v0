/**
 * Hebrew (he), square script, read with Modern Hebrew sound values (variety he-mod, the default); Biblical readings (he-bib) differ
 * mainly in the begadkefat letters, see `notes`. Letter keys are the Alphabet deck's own glyphs, so letters already practised there
 * carry over. Sounds are the deck's hints. WRITTEN FOR THIS DECK, not reviewed by a Hebrew teacher.
 *
 * Starter words are POINTED forms (a Bible, a prayer book, a children's book): the points are what a beginner decodes from. Modern
 * Hebrew's ordinary unpointed spelling cannot be decoded from its letters alone, so the profile does not model it.
 */
import { PHRASES, WORDS } from '../words/he';
import type { ScriptProfile } from '../types';
import { KEY, squareDependencies, squareUnits, squareWordsOf, withExamples } from './hebrew-script';

export const HE_PROFILE: ScriptProfile = {
  languageId: 'he', scriptId: 'Hebr', rtl: true, firstBatch: 4, laterBatch: 3,
  units: withExamples(squareUnits('he'), WORDS, squareDependencies),
  words: WORDS, phrases: PHRASES,
  confusions: [
    { a: 'ב', b: 'כ', tell: 'ב has a flat base that sticks out to the left; כ is rounded with no corner' },
    { a: 'ד', b: 'ר', tell: 'ד has a sharp corner at the top right; ר is rounded' },
    { a: 'ה', b: 'ח', tell: 'ה has a gap between its left leg and the roof; ח is closed' },
    { a: 'ח', b: 'ת', tell: 'ת has a small foot on its left leg; ח does not' },
    { a: 'ו', b: 'ז', tell: 'ו is a plain stroke; ז has a little flag on top' },
    { a: 'ו', b: 'ן', tell: 'ן drops below the line (final nun); ו stays on the line' },
    { a: 'ע', b: 'צ', tell: 'צ has a tail like a small branch; ע is a plain Y-shape' },
    { a: 'ס', b: 'ש', tell: 'ס is closed and round and has no dot; ש has three prongs' },
    { a: KEY.patah, b: KEY.qamats, tell: 'qamats has a small stem under the line; patach is just the line. The sound is the same in modern speech' },
    { a: KEY.segol, b: KEY.tsere, tell: 'segol is three dots in a triangle; tsere is two dots side by side. The sound is the same in modern speech' },
    { a: KEY.shinDot, b: KEY.sinDot, tell: 'the dot on the right is sh; the dot on the left is s' },
  ],
  dependencies: squareDependencies,
  words_of: squareWordsOf,
  notes: 'Square script, right to left. Sounds are Modern Hebrew (he-mod): ב כ פ are v kh f without a dagesh and b k p with one; ג ד ת do not change; א and ע are silent carriers; patach and qamats are both a, segol and tsere both e. Biblical Hebrew (he-bib) also softens ג ד ת without a dagesh and keeps a distinction between the vowels; that is not taught here. Cantillation, meteg, maqaf and sof pasuq are never needed to read an ordinary word, so they are ignored. Only pointed words are decoded (an unpointed word has no vowels in its letters). Not modelled: qamats qatan (read as qamats), furtive patach, and a vav with a holam is always read as the vowel o. Words are Biblical headwords with their BDB glosses and the course tutorial examples; written for this deck, not reviewed by a teacher.',
};
