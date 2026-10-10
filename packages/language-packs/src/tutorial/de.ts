/**
 * The German orientation (tutorial/de): a MINIMAL one, drafted by an AI model for the experimental German pack. NO native
 * speaker has checked it. It teaches how to select a word, what the card shows, one practice lookup, the letters English does not
 * have (ä ö ü ß) and the capital letter on every noun, eight first nouns, and what this pack cannot do. It does not teach the
 * cases, the verb forms or word order. The practice sentence is one of the pack's own validation sentences; a test reads every
 * example word through the real analyser (the check is of coverage, not of naturalness).
 */
import { orientation, soundBody } from './orientation';
import type { Tutorial, TutorialStep } from './types';

export const DE_TUTORIAL_STEPS_OWN: TutorialStep[] = [
  {
    id: 'alphabet-umlauts',
    kind: 'alphabet',
    title: 'Letters English does not have: ä ö ü ß, and capital nouns',
    estimatedMinutes: 3,
    body:
      'German is written in the Latin alphabet with four extra letters. ä, ö and ü (umlauts) are vowels of their own and change the word, so keep the dots. ß (Eszett, “sharp s”) is said like a plain s and is written only in Germany and Austria; in Switzerland it is written ss. Every noun begins with a capital letter, which tells you what is a noun even in a sentence you cannot read yet. A long compound is written as one word, with no hyphen and no space: that is why a German word can look very long.',
    examples: [
      { surface: 'Tür', gloss: 'door', note: 'ü is a vowel of its own' },
      { surface: 'früh', gloss: 'early', note: 'ü again' },
      { surface: 'groß', gloss: 'big', note: 'ß is said like s' },
      { surface: 'Wohnzimmer', gloss: 'living room', note: 'a compound written as one word, with a capital letter' },
    ],
  },
  {
    id: 'words-first',
    kind: 'words',
    title: 'Eight nouns to start with',
    estimatedMinutes: 2,
    body:
      'These nouns are common and you will meet them often. You do not need to memorise them now. Notice that every noun has a gender (der, die or das, masculine, feminine or neuter) that you learn with the word, and that the card shows it.',
    examples: [
      { surface: 'Haus', gloss: 'house' },
      { surface: 'Frau', gloss: 'woman' },
      { surface: 'Mann', gloss: 'man' },
      { surface: 'Kind', gloss: 'child' },
      { surface: 'Garten', gloss: 'garden' },
      { surface: 'Schule', gloss: 'school' },
      { surface: 'Brot', gloss: 'bread' },
      { surface: 'Tisch', gloss: 'table' },
    ],
  },
];

export const DE_TUTORIAL: Tutorial = orientation({
  languageId: 'de',
  languageName: 'German',
  practice: { instruction: 'Select the word that names what is being read.', sentence: 'Ich lese das Buch.', target: 'Buch' },
  cardFeatureNote: 'For a German noun the card can show its gender, its number and its case. The case is often left as a list such as “nominative or accusative” (Nom,Acc): the article in front decides it when it can, and when it cannot, the card shows both rather than guessing.',
  thin: [
    'Lemmatisation is seed-only: the word list holds about 2,900 words and the closed classes, and any other word gets a marked guess or nothing.',
    'There is no parser, so a case the neighbouring words do not settle stays a list of cases.',
    'A compound is split only into words the list knows, and the split is marked unconfirmed.',
  ],
  sound: { id: 'sound-and-audio', body: soundBody('German', ' (it holds one short demonstration clip, which is not a pronunciation resource)') },
  languageSteps: DE_TUTORIAL_STEPS_OWN,
  notice: 'This minimal orientation was drafted by an AI model and has not been checked by a native speaker of German. It covers how to select a word, what the card shows, the letters ä ö ü ß, eight nouns and what the experimental pack cannot do. You can skip it and come back at any time.',
});

export const DE_TUTORIAL_STEPS: TutorialStep[] = DE_TUTORIAL.steps;
