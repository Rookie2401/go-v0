/**
 * The Hindi orientation (tutorial/hi): a MINIMAL one, drafted by an AI model for the experimental Hindi pack. NO native
 * speaker has checked it. It teaches how to select a word, what the card shows, one practice lookup, how Devanagari is built
 * (the inherent vowel, vowel signs, nukta, chandrabindu, the danda), eight first nouns, and what this pack cannot do. It does
 * not teach verb forms, the ergative construction or the oblique case. The practice sentence is one of the pack's own validation
 * sentences; a test reads every example word through the real analyser.
 */
import { orientation, soundBody } from './orientation';
import type { Tutorial, TutorialStep } from './types';

export const HI_TUTORIAL_STEPS_OWN: TutorialStep[] = [
  {
    id: 'alphabet-devanagari',
    kind: 'alphabet',
    title: 'Devanagari: how a Hindi word is built',
    estimatedMinutes: 4,
    body:
      'Hindi is written in Devanagari, from left to right. A consonant letter carries a short “a” unless a sign says otherwise: क is “ka”. A vowel sign (a matra) written before, after, above or below the consonant replaces that “a”: कि is “ki”, का is “kā”, कु is “ku”. A dot below a letter (a nukta) makes a sound that Hindi borrowed or distinguishes, as in ज़ and ढ़ (मेज़, पढ़ना). A dot or crescent above a vowel (a bindu or chandrabindu) makes it nasal, as in में and हूँ. A sign called the halant removes the vowel, which is how consonants join into one unit, as in स्कूल. A vertical line, the danda (।), ends a sentence. Words are separated by spaces, and the short words after a noun (में “in”, पर “on”, ने) stand apart as words of their own.',
    examples: [
      { surface: 'किताब', gloss: 'book', note: 'the sign ि is written before the consonant क but said after it: ki' },
      { surface: 'पढ़ता', gloss: 'reading, the habitual form of पढ़ना, “to read”', note: 'the nukta under ढ gives ढ़' },
      { surface: 'मेज़', gloss: 'table', note: 'the nukta under ज gives ज़' },
      { surface: 'हूँ', gloss: 'am', note: 'the chandrabindu makes the vowel nasal' },
      { surface: 'में', gloss: 'in', note: 'the dot above makes the vowel nasal' },
    ],
  },
  {
    id: 'words-first',
    kind: 'words',
    title: 'Eight nouns to start with',
    estimatedMinutes: 2,
    body:
      'These nouns are common and you will meet them often; you do not need to memorise them now. Every Hindi noun is masculine or feminine, and the card shows which, because verbs and adjectives change to agree with it.',
    examples: [
      { surface: 'घर', gloss: 'house, home' },
      { surface: 'किताब', gloss: 'book' },
      { surface: 'मेज़', gloss: 'table' },
      { surface: 'लड़का', gloss: 'boy' },
      { surface: 'लड़की', gloss: 'girl' },
      { surface: 'रोटी', gloss: 'bread, flatbread' },
      { surface: 'स्कूल', gloss: 'school' },
      { surface: 'दिन', gloss: 'day' },
    ],
  },
];

export const HI_TUTORIAL: Tutorial = orientation({
  languageId: 'hi',
  languageName: 'Hindi',
  practice: { instruction: 'Select the word that means house or home.', sentence: 'यह लड़का घर में है।', target: 'घर' },
  cardFeatureNote: 'For a Hindi noun the card can show its gender and number, and for a verb the way it agrees with the person who acts. A word written the same way in two jobs (such as पर, “on” or “but”) keeps both readings, and the card says it could not choose.',
  thin: [
    'Lemmatisation is seed-only: the word list holds about 1,500 words and the closed classes, and any other word gets a marked guess or nothing.',
    'Words written alike in two ways keep every reading, because there is no parser to choose between them.',
    'The Devanagari script is shared with Marathi, Nepali and Sanskrit; this pack reads Hindi only.',
  ],
  sound: { id: 'sound-and-audio', body: soundBody('Hindi') },
  languageSteps: HI_TUTORIAL_STEPS_OWN,
  notice: 'This minimal orientation was drafted by an AI model and has not been checked by a native speaker of Hindi. It covers how to select a word, what the card shows, how Devanagari is built, eight nouns and what the experimental pack cannot do. You can skip it and come back at any time.',
});

export const HI_TUTORIAL_STEPS: TutorialStep[] = HI_TUTORIAL.steps;
