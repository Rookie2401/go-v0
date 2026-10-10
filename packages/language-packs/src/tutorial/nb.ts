/**
 * The Norwegian Bokmål orientation (tutorial/nb): a MINIMAL one, drafted by an AI model for the experimental Bokmål pack. NO native
 * speaker has checked it. It teaches how to select a word, what the card shows, one practice lookup, the letters æ ø å, the two
 * written standards, eight first nouns, the definite ending, and what this pack cannot do. It does not teach the verb forms, word
 * order or the pronunciation. The practice sentence is one of the pack's own validation sentences; a test reads every example word
 * through the real analyser.
 */
import { orientation } from './orientation';
import type { Tutorial, TutorialStep } from './types';

export const NB_TUTORIAL_STEPS_OWN: TutorialStep[] = [
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
      { surface: 'være', gloss: 'to be', note: 'æ is a letter of its own' },
      { surface: 'kjøpe', gloss: 'to buy', note: 'ø is a letter of its own' },
    ],
  },
  {
    id: 'written-standards',
    kind: 'concept',
    title: 'Two written standards: this pack is Bokmål',
    estimatedMinutes: 3,
    body:
      'Norwegian has two official written standards, Bokmål and Nynorsk, equal in law. This pack reads Bokmål, the standard most people write. Nynorsk has its own pack, and you choose it yourself: neither is the default for the other, and a Bokmål word is never counted as a Nynorsk word you know, or the other way round. The two share most of their words and differ in some very common ones and in some endings: Bokmål jeg is Nynorsk eg, ikke is ikkje, et is eit. In Bokmål a feminine noun may be written the old way (en bok, boken) or the newer way (ei bok, boka); both are right, so the card shows such a noun as “feminine or masculine”. A web page that says only “no” (Norwegian) does not say which standard it is written in, so GoLearn does not guess: the pack you have installed, or your own choice, decides. And remember that speech is not Bokmål or Nynorsk: there is no official spoken standard.',
    examples: [
      { surface: 'jeg', gloss: 'I (Nynorsk: eg)' },
      { surface: 'ikke', gloss: 'not (Nynorsk: ikkje)' },
      { surface: 'boken', gloss: 'the book (Nynorsk: boka)' },
      { surface: 'et', gloss: 'a, before a neuter noun (Nynorsk: eit)' },
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
      { surface: 'gutt', gloss: 'boy' },
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
      'Where English puts “the” before a noun, Norwegian puts it on the end: en bok is “a book” and boken is “the book”; et hus is “a house” and huset is “the house”; en hage becomes hagen. A feminine noun can take -a instead, as in boka. The plural has an ending too: barn (“child, children”) becomes barna (“the children”). The card shows this as Definite, and the sentences below all use it.',
    examples: [
      { surface: 'Barna spiller i hagen.', gloss: 'The children play in the garden.' },
      { surface: 'Boka ligger på bordet.', gloss: 'The book is on the table.' },
      { surface: 'Jeg leser boken hver dag.', gloss: 'I read the book every day.' },
    ],
  },
];

export const NB_TUTORIAL: Tutorial = orientation({
  languageId: 'nb',
  languageName: 'Norwegian (Bokmål)',
  practice: { instruction: 'Select the word that means the garden, and look at the ending that means “the”.', sentence: 'Barna spiller i hagen.', target: 'hagen' },
  cardFeatureNote: 'For a Norwegian noun the card can show its gender (a Bokmål feminine noun is shown as “feminine or masculine” because both ways of writing it are right), its number, and whether it carries the definite ending.',
  thin: [
    'Lemmatisation is seed-only: the Bokmål word list is machine-drafted, no native speaker has checked it against any official word list, and a word outside it gets a marked guess or nothing.',
    'There is no parser, so what the neighbouring words do not settle stays a list of readings.',
    'A compound is split only into words the list knows, and no meaning is given for it.',
    'There is no dictionary for Norwegian in this build, so meanings come from the word list alone.',
    'There are no recordings and GoListen holds no voice that can read Norwegian aloud, so a card cannot play a word yet; no spoken standard is claimed, and a card gives a rule-based East Norwegian respelling, not a norm.',
  ],
  languageSteps: NB_TUTORIAL_STEPS_OWN,
  notice: 'This minimal orientation was drafted by an AI model and has not been checked by a native speaker of Norwegian. It covers how to select a word, what the card shows, the letters æ ø å, the two written standards, eight nouns, the definite ending and what the experimental pack cannot do. You can skip it and come back at any time.',
});

export const NB_TUTORIAL_STEPS: TutorialStep[] = NB_TUTORIAL.steps;
