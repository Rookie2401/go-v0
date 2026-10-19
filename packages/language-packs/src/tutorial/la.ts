/**
 * The Latin orientation (tutorial/la): a MINIMAL one, drafted by an AI model for the experimental Latin pack. NO Latinist has
 * checked it (Latin has no native speakers, so the review it needs is a Latinist's). It teaches how to select a word, what the
 * card shows, one practice lookup, how Latin is written in the Clementine Vulgate (i/j, u/v, ae and oe ligatures, no vowel length),
 * nine first words, and what this pack cannot do. It does not teach the declensions or conjugations. The practice sentence is one
 * of the pack's own validation sentences; a test reads every example word through the real analyser.
 */
import { orientation, soundBody } from './orientation';
import type { Tutorial, TutorialStep } from './types';

export const LA_TUTORIAL_STEPS_OWN: TutorialStep[] = [
  {
    id: 'alphabet-latin',
    kind: 'alphabet',
    title: 'Latin spelling: i and j, u and v, ligatures, no vowel length',
    estimatedMinutes: 3,
    body:
      'Latin is written in the Latin alphabet, from left to right, with no accents. The Clementine Vulgate, which this pack follows, prints i and j and u and v as separate letters, though the Romans wrote one letter for each pair, so the same word can appear as Iesus or Jesus, and as uerbum or verbum, in different books. The vowel pairs ae and oe are printed as one joined letter (æ, œ) in some editions and as two letters in others; the pack treats both the same. Vowel length is not written in the Vulgate, though some textbooks print a bar over a long vowel (a macron); the pack ignores the bars when it looks a word up. Latin has no word for “the” or “a”, and the ending of a word, not its place in the sentence, tells you what job it does there: that is why the card spends so much effort on endings.',
    examples: [
      { surface: 'Deus', gloss: 'God', note: 'the ending -us marks a masculine noun in the nominative, the word that does the action' },
      { surface: 'Deum', gloss: 'God (as the object)', note: 'the same noun with the ending -um, the accusative' },
      { surface: 'verbum', gloss: 'word', note: 'printed with v here; some editions print uerbum' },
      { surface: 'in', gloss: 'in, into', note: 'a small word that takes the ablative or the accusative' },
    ],
  },
  {
    id: 'words-first',
    kind: 'words',
    title: 'Nine words to start with',
    estimatedMinutes: 2,
    body:
      'These words are common in the Vulgate and you will meet them often; you do not need to memorise them now. A noun is listed under its nominative singular and a verb under its first-person present form, so the card shows habeo, “I have”, where an English dictionary would give “to have”. When the ending of a word could belong to more than one case, the card shows every reading instead of choosing one.',
    examples: [
      { surface: 'Deus', gloss: 'God' },
      { surface: 'Dominus', gloss: 'Lord' },
      { surface: 'verbum', gloss: 'word' },
      { surface: 'terra', gloss: 'earth, land' },
      { surface: 'homo', gloss: 'person, man' },
      { surface: 'et', gloss: 'and' },
      { surface: 'non', gloss: 'not' },
      { surface: 'est', gloss: 'is' },
      { surface: 'in', gloss: 'in, into' },
    ],
  },
];

export const LA_TUTORIAL: Tutorial = orientation({
  languageId: 'la',
  languageName: 'Latin',
  practice: { instruction: 'Select the word that means word.', sentence: 'In principio erat Verbum, et Verbum erat apud Deum.', target: 'Verbum' },
  cardFeatureNote: 'A Latin card shows the case and gender of a noun, for example “Nom,Acc” where one ending serves both, and the person, number and tense of a verb where the analyser knows them.',
  thin: [
    'Lemmatisation is seed-only: the word list holds the words of the course texts and the closed classes, and a word outside it gets a marked guess or nothing.',
    'Many endings are written alike, so a form often keeps several readings; the pack does not choose between them from the sentence.',
    'The spelling is the Clementine Vulgate’s; texts from other editions have not been measured.',
  ],
  sound: { id: 'sound-and-audio', body: soundBody('Latin', '; Latin is pronounced in more than one way (the Roman, the Church and the regional ones), and the written notes do not choose between them') },
  languageSteps: LA_TUTORIAL_STEPS_OWN,
  notice: 'This minimal orientation was drafted by an AI model and has not been checked by a native speaker of Latin, since there are none, or by a Latinist. It covers how to select a word, what the card shows, how Latin is spelled in the Vulgate, nine words and what the experimental pack cannot do. You can skip it and come back at any time.',
});

export const LA_TUTORIAL_STEPS: TutorialStep[] = LA_TUTORIAL.steps;
