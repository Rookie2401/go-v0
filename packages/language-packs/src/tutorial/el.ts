/**
 * The Greek orientation (tutorial/el): a MINIMAL one, drafted by an AI model for the experimental Greek pack. NO native speaker or
 * classicist has checked it. It teaches how to select a word, what the card shows, one practice lookup in John 1:1, the alphabet and
 * the two spelling systems, the periods the pack reads and how it tells them apart, the article, and what the pack cannot do. The
 * practice sentence is one of the pack's validation sentences (John 1:1, SBL Greek New Testament).
 */
import { orientation } from './orientation';
import type { Tutorial, TutorialStep } from './types';

export const EL_TUTORIAL_STEPS_OWN: TutorialStep[] = [
  {
    id: 'alphabet-two-spellings',
    kind: 'alphabet',
    title: 'Twenty-four letters, two ways of marking them',
    estimatedMinutes: 3,
    body:
      'Greek is written in its own alphabet of twenty-four letters; sigma has a final form (ς) at the end of a word. Ancient and Byzantine texts, and Modern Greek before 1982, mark every word with the POLYTONIC system: an accent (acute, grave or circumflex), a breathing on a word that begins with a vowel (ἀ smooth, ἁ rough = h-), and sometimes an iota written under a vowel (ῳ). Modern Greek uses the MONOTONIC system: one acute accent and nothing else. The pack reads both; the marks tell it which period a text belongs to.',
    examples: [
      { surface: 'λόγος', gloss: 'word', note: 'spelled the same in both systems' },
      { surface: 'ἀρχή', gloss: 'beginning', note: 'polytonic: smooth breathing' },
      { surface: 'αρχή', gloss: 'beginning', note: 'the same word monotonic, as Modern Greek writes it' },
      { surface: 'ὁ', gloss: 'the', note: 'rough breathing: ho' },
    ],
  },
  {
    id: 'periods',
    kind: 'concept',
    title: 'One language, several periods',
    estimatedMinutes: 3,
    body:
      'This pack reads Greek across its periods: Homeric (the epics), Attic (classical Athens), Koine (the New Testament and the Hellenistic world), Medieval and Modern. Koine readings come from MorphGNT’s analysis of every word of the New Testament; Homeric and Attic from the Wiktionary Ancient Greek tables, whose headers name the dialect; Modern from the Wiktionary Modern Greek tables; Medieval only from labels. The card says which period a sentence was read in and why: polytonic marks make it ancient, the words say which stage, monotonic spelling makes it Modern; your own target (Modern by default, or Koine, Attic or Homeric if you choose) breaks ties. Under Variants the card lists the word in every period the sources know.',
    examples: [
      { surface: 'ἦν', gloss: 'was', note: 'Koine and Attic: imperfect of εἰμί' },
      { surface: 'είναι', gloss: 'is', note: 'Modern: the same verb, a different form' },
      { surface: 'θεός', gloss: 'God, god', note: 'all periods' },
    ],
  },
  {
    id: 'pattern-article',
    kind: 'patterns',
    title: 'Pattern: the article agrees with its noun',
    estimatedMinutes: 2,
    body:
      'The article (ὁ, ἡ, τό; Modern ο, η, το) changes with the case, number and gender of its noun: ὁ λόγος “the word”, τὸν λόγον “the word” as an object, τοῦ λόγου “of the word”. The card shows the case of the article and of the noun so you can see them agree. A grave accent (τὸν) is only the acute of a word followed by another word.',
    examples: [
      { surface: 'ὁ λόγος', gloss: 'the word (subject)' },
      { surface: 'τὸν θεόν', gloss: 'God (object)' },
      { surface: 'ἡ ὁδός', gloss: 'the way' },
    ],
  },
];

export const EL_TUTORIAL: Tutorial = orientation({
  languageId: 'el',
  languageName: 'Greek',
  practice: { instruction: 'Select the word that means word, and look at its case and at the period the card names.', sentence: 'Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος.', target: 'λόγος' },
  cardFeatureNote: 'For a Greek word the card shows the period it was read in and why, the lemma, the case, number and gender of a noun or the tense, voice, mood and person of a verb, how often the New Testament reads it this way (and how often the lemma occurs in the Septuagint), a written transliteration in three named conventions for an ancient word, and under Variants the word across the periods.',
  thin: [
    'Only the closed classes and the commonest New Testament words are compiled into the pack; the full Koine, Ancient and Modern indexes are assets the reader installs when Greek is loaded. Until then a word outside the core has no reading.',
    'A reading is the source’s reading: MorphGNT for the New Testament, the Wiktionary tables otherwise. Nothing has been checked by a classicist or a native speaker.',
    'A form matched without its accents says so and is less confident. A word no table or text holds has no reading.',
    'There is no parser: the sentence decides the period only. A word with several readings in one period keeps them all.',
    'There are no recordings and no voice for ancient Greek; a Modern Greek device voice, if the browser has one, is synthetic practice only and is labelled Modern.',
  ],
  languageSteps: EL_TUTORIAL_STEPS_OWN,
  notice: 'This minimal orientation was drafted by an AI model and has not been checked by a native speaker of Greek or a classicist. It covers how to select a word, what the card shows, the alphabet and the two spelling systems, the periods and the article; it does not teach the verb system, word order or pronunciation.',
});

export const EL_TUTORIAL_STEPS: TutorialStep[] = EL_TUTORIAL.steps;
