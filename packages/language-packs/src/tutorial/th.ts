/**
 * The Thai orientation (tutorial/th): a MINIMAL one, drafted by an AI model for the experimental Thai pack. NO native speaker
 * has checked it. It teaches how to select a word, what the card shows, one practice lookup, how Thai script works (no word
 * spaces, vowels around the consonant, tone marks), nine first words, and what this pack cannot do. It does not teach the tone
 * rules, the classifiers or the polite particles in any depth. The practice sentence is one of the pack's own validation
 * sentences; a test reads every example word through the real analyser.
 */
import { orientation, soundBody } from './orientation';
import type { Tutorial, TutorialStep } from './types';

export const TH_TUTORIAL_STEPS_OWN: TutorialStep[] = [
  {
    id: 'alphabet-thai',
    kind: 'alphabet',
    title: 'Thai script: no spaces, vowels around the consonant, tone marks',
    estimatedMinutes: 4,
    body:
      'Thai is written from left to right with 44 consonant letters. Vowels are not separate letters in a row: a vowel sign is written before, after, above or below the consonant it goes with, and sometimes around it, so the order you see is not always the order you hear. Four tone marks (่ ้ ๊ ๋) are written above a consonant, and the tone of a word also depends on the class of its first consonant and on the kind of syllable, so a tone mark alone does not tell you the tone. There are no capital letters and no spaces between words: a space marks a pause between phrases or sentences. That is why this pack has to cut a run of Thai into words itself, with a dictionary-based splitter, and why it can cut a word where you would not.',
    examples: [
      { surface: 'ข้าว', gloss: 'rice', note: 'the tone mark ้ is written above the consonant' },
      { surface: 'บ้าน', gloss: 'house, home', note: 'the tone mark ้ is above บ, and the vowel า follows it' },
      { surface: 'โรงเรียน', gloss: 'school', note: 'the signs โ and เ are written before the consonant they are said after' },
      { surface: 'ไทย', gloss: 'Thai', note: 'the sign ไ is written before the consonant ท' },
    ],
  },
  {
    id: 'words-first',
    kind: 'words',
    title: 'Nine words to start with',
    estimatedMinutes: 2,
    body:
      'These words are common and you will meet them often; you do not need to memorise them now. Thai words do not change shape for tense, number or person, so the card shows a lemma and a part of speech but no grammar features. The two polite particles ครับ and คะ come at the end of a sentence or a question; ครับ is said by men and คะ by women.',
    examples: [
      { surface: 'บ้าน', gloss: 'house, home' },
      { surface: 'ข้าว', gloss: 'rice, a meal' },
      { surface: 'วัน', gloss: 'day' },
      { surface: 'โรงเรียน', gloss: 'school' },
      { surface: 'ไป', gloss: 'to go' },
      { surface: 'กิน', gloss: 'to eat' },
      { surface: 'ฉัน', gloss: 'I, me' },
      { surface: 'อะไร', gloss: 'what' },
      { surface: 'ครับ', gloss: 'polite particle, said by a man' },
    ],
  },
];

export const TH_TUTORIAL: Tutorial = orientation({
  languageId: 'th',
  languageName: 'Thai',
  practice: { instruction: 'Select the word that means rice.', sentence: 'ฉันกินข้าวที่บ้านทุกวัน', target: 'ข้าว' },
  cardFeatureNote: 'Thai has no inflection to analyse, so a Thai card has a lemma, a part of speech and a meaning, and no grammar features. Where the script allows it, the card also breaks the word into syllables.',
  thin: [
    'Lemmatisation is seed-only: the word list holds about 600 words, and a word outside it is left unanalysed.',
    'Word segmentation is the weakest part: because Thai has no word spaces, a compound can be cut where you do not expect, and this has not been measured on real prose.',
    'Sentence breaks need a newline or two spaces; a single space is only a pause.',
  ],
  sound: { id: 'sound-and-audio', body: soundBody('Thai', '; a Thai tone is shown in the written notes only where the spelling decides it') },
  languageSteps: TH_TUTORIAL_STEPS_OWN,
  notice: 'This minimal orientation was drafted by an AI model and has not been checked by a native speaker of Thai. It covers how to select a word, what the card shows, how Thai script works, nine words and what the experimental pack cannot do. You can skip it and come back at any time.',
});

export const TH_TUTORIAL_STEPS: TutorialStep[] = TH_TUTORIAL.steps;
