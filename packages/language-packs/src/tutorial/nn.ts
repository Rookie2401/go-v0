/**
 * The Norwegian Nynorsk orientation (tutorial/nn): a MINIMAL one, drafted by an AI model for the experimental Nynorsk pack. NO native
 * speaker has checked it. It teaches how to select a word, what the card shows, one practice lookup, the letters æ ø å, the two
 * written standards, eight first nouns, the definite ending, and what this pack cannot do. It does not teach the verb forms, word
 * order or the pronunciation. The practice sentence is one of the pack's own validation sentences; a test reads every example word
 * through the real analyser.
 */
import { orientation } from './orientation';
import type { Tutorial, TutorialStep } from './types';

export const NN_TUTORIAL_STEPS_OWN: TutorialStep[] = [
  {
    id: 'alphabet-ae-oe-aa',
    kind: 'alphabet',
    title: 'Letters English does not have: æ, ø, å',
    estimatedMinutes: 2,
    body:
      'Norwegian is written in the Latin alphabet with three extra letters at the end of it: æ, ø and å. They are letters of their own, not accented forms of a or o, so keep them: bær (“berry”) is not bar (“bar”), and a word with å is not the same word without it. Å is also a small word on its own: before a verb it marks the infinitive, as in å lese, “to read”. Norwegian writes a long compound as one word.',
    examples: [
      { surface: 'på', gloss: 'on, at', note: 'å is a letter of its own' },
      { surface: 'år', gloss: 'year', note: 'å again' },
      { surface: 'vere', gloss: 'to be', note: 'Nynorsk vere is Bokmål være, which has the æ' },
      { surface: 'kjøpe', gloss: 'to buy', note: 'ø is a letter of its own' },
    ],
  },
  {
    id: 'written-standards',
    kind: 'concept',
    title: 'Two written standards: this pack is Nynorsk',
    estimatedMinutes: 3,
    body:
      'Norwegian has two official written standards, Bokmål and Nynorsk, equal in law. This pack reads Nynorsk, which a smaller share of people write; its word list is smaller than the Bokmål one, so more words will come back without a reading. Bokmål has its own pack, and you choose it yourself: neither is the default for the other, and a Nynorsk word is never counted as a Bokmål word you know, or the other way round. The two share most of their words and differ in some very common ones and in some endings: Nynorsk eg is Bokmål jeg, ikkje is ikke, eit is et. Nynorsk keeps three genders (ein, ei, eit) and writes a feminine noun with ei and the ending -a: ei bok, boka. A web page that says only “no” (Norwegian) does not say which standard it is written in, so GoLearn does not guess: the pack you have installed, or your own choice, decides. And remember that speech is not Bokmål or Nynorsk: there is no official spoken standard.',
    examples: [
      { surface: 'eg', gloss: 'I (Bokmål: jeg)' },
      { surface: 'ikkje', gloss: 'not (Bokmål: ikke)' },
      { surface: 'boka', gloss: 'the book (Bokmål: boken or boka)' },
      { surface: 'eit', gloss: 'a, before a neuter noun (Bokmål: et)' },
    ],
  },
  {
    id: 'words-first',
    kind: 'words',
    title: 'Eight nouns to start with',
    estimatedMinutes: 2,
    body:
      'These nouns are common and you will meet them often; you do not need to memorise them now. Each has a gender that you learn with the word, and the card shows it. In the list below the words are shown without “the”.',
    examples: [
      { surface: 'hus', gloss: 'house' },
      { surface: 'bok', gloss: 'book' },
      { surface: 'jente', gloss: 'girl' },
      { surface: 'gut', gloss: 'boy' },
      { surface: 'barn', gloss: 'child' },
      { surface: 'bil', gloss: 'car' },
      { surface: 'bord', gloss: 'table' },
      { surface: 'hage', gloss: 'garden' },
    ],
  },
  {
    id: 'pattern-definite-ending',
    kind: 'patterns',
    title: 'Pattern: “the” goes on the end of the noun',
    estimatedMinutes: 2,
    body:
      'Where English puts “the” before a noun, Norwegian puts it on the end: ein hage is “a garden” and hagen is “the garden”; eit hus is “a house” and huset is “the house”; ei bok is “a book” and boka is “the book”. The plural has an ending too: barn (“child”) becomes born (“children”) and borna (“the children”). The card shows this as Definite, and the sentences below all use it.',
    examples: [
      { surface: 'Borna spelar i hagen.', gloss: 'The children play in the garden.' },
      { surface: 'Boka ligg på bordet.', gloss: 'The book is on the table.' },
      { surface: 'Eg les boka kvar dag.', gloss: 'I read the book every day.' },
    ],
  },
];

export const NN_TUTORIAL: Tutorial = orientation({
  languageId: 'nn',
  languageName: 'Norwegian (Nynorsk)',
  practice: { instruction: 'Select the word that means the book, and look at the ending that means “the”.', sentence: 'Eg les boka kvar dag.', target: 'boka' },
  cardFeatureNote: 'For a Nynorsk noun the card can show its gender (masculine, feminine or neuter), its number, and whether it carries the definite ending.',
  thin: [
    'Lemmatisation is seed-only: the Nynorsk word list is machine-drafted and smaller than the Bokmål one, no native speaker has checked it, and a word outside it (even a common one such as kaffen) gets a marked guess or nothing.',
    'There is no parser, so what the neighbouring words do not settle stays a list of readings; some verb forms are listed twice (-a and -e infinitives) and are shown as they are.',
    'A compound is split only into words the list knows, and no meaning is given for it.',
    'There is no dictionary for Norwegian in this build, so meanings come from the word list alone.',
    'There are no recordings and GoListen holds no voice that can read Norwegian aloud, so a card cannot play a word yet, and nothing will be read aloud in Bokmål in its place unless you choose that; a card gives a rule-based East Norwegian respelling, not a norm.',
  ],
  languageSteps: NN_TUTORIAL_STEPS_OWN,
  notice: 'This minimal orientation was drafted by an AI model and has not been checked by a native speaker of Norwegian. It covers how to select a word, what the card shows, the letters æ ø å, the two written standards, eight nouns, the definite ending and what the experimental pack cannot do. You can skip it and come back at any time.',
});

export const NN_TUTORIAL_STEPS: TutorialStep[] = NN_TUTORIAL.steps;
