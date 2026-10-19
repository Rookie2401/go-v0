/**
 * The Hebrew orientation (tutorial/he): a MINIMAL one, drafted by an AI model for the experimental Hebrew pack. NO native speaker or
 * Hebrew scholar has checked it. It teaches how to select a word, what the card shows, one practice lookup in a Biblical verse, the
 * direction and letters of the script, the two periods the pack reads and how it tells them apart, the attached prefixes, and what the
 * pack cannot do. The practice sentence is one of the pack's validation sentences (Genesis 1:1, Miqra according to the Masorah).
 */
import { orientation } from './orientation';
import type { Tutorial, TutorialStep } from './types';

export const HE_TUTORIAL_STEPS_OWN: TutorialStep[] = [
  {
    id: 'script-right-to-left',
    kind: 'alphabet',
    title: 'Right to left, twenty-two letters, vowels as points',
    estimatedMinutes: 3,
    body:
      'Hebrew is written from right to left in twenty-two letters, all consonants. Five of them have a different shape at the end of a word (כ ך, מ ם, נ ן, פ ף, צ ץ). The vowels are small marks under, over or inside the letters (the points, niqqud): a Bible, a prayer book and a children’s book print them; a newspaper, a message and a website normally do not, and the reader supplies the vowels from knowing the word. A Bible text also carries the cantillation accents, which this pack removes before it looks a word up.',
    examples: [
      { surface: 'שָׁלוֹם', gloss: 'peace; hello', note: 'pointed: the vowels are written' },
      { surface: 'שלום', gloss: 'peace; hello', note: 'the same word unpointed, as Modern Hebrew writes it' },
      { surface: 'מֶלֶךְ', gloss: 'king', note: 'ך is the final form of כ' },
      { surface: 'אֱלֹהִים', gloss: 'God', note: 'ending -ִים: a plural ending, used of God with singular verbs' },
    ],
  },
  {
    id: 'two-periods',
    kind: 'concept',
    title: 'One language, two periods: Biblical and Modern',
    estimatedMinutes: 3,
    body:
      'This pack reads Hebrew in two periods. Biblical Hebrew is the language of the Tanakh, pointed by the Masoretes; its readings come from the Open Scriptures morphology of every word of the Bible. Modern Hebrew is the language of Israel today, written unpointed; its readings come from the Wiktionary tables. The card tells you which period a sentence was read in and why: cantillation marks make it Biblical; otherwise the period most of the words belong to; an unpointed text with no other clue is Modern. Your own target (Modern by default; Biblical if you choose it) only breaks a tie. A form of the other period is still shown, with a note saying where it belongs.',
    examples: [
      { surface: 'וַיֹּאמֶר', gloss: 'and he said', note: 'a Biblical narrative form (wayyiqtol); Modern Hebrew says אמר' },
      { surface: 'אמר', gloss: 'he said', note: 'the Modern (and Biblical perfect) form, unpointed' },
      { surface: 'כּוֹתֵב', gloss: 'writes; a writer', note: 'the same letters are a present-tense verb and a noun: both readings are kept' },
    ],
  },
  {
    id: 'attached-prefixes',
    kind: 'patterns',
    title: 'Pattern: little words attached to the front',
    estimatedMinutes: 2,
    body:
      'Hebrew writes several small words as one letter joined to the next word: וְ “and”, הַ “the”, בְּ “in”, לְ “to, for”, כְּ “like”, מִ “from”, שֶׁ “that”. The card shows them as parts of the word, each with its meaning, and the main word after them. The Bible’s own alignment marks where each part ends; for a word outside that text the pack cuts a prefix off by rule only when the rest is a word it knows, and says it did so.',
    examples: [
      { surface: 'הַשָּׁמַיִם', gloss: 'the heavens', note: 'הַ + שָׁמַיִם' },
      { surface: 'וְאֵת', gloss: 'and (object marker)', note: 'וְ + אֵת' },
      { surface: 'בְּרֵאשִׁית', gloss: 'in the beginning', note: 'בְּ + רֵאשִׁית' },
    ],
  },
];

export const HE_TUTORIAL: Tutorial = orientation({
  languageId: 'he',
  languageName: 'Hebrew',
  practice: { instruction: 'Select the word that means God, and look at the plural ending and the period the card names.', sentence: 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃', target: 'אֱלֹהִ֑ים' },
  cardFeatureNote: 'For a Hebrew word the card shows the period it was read in (Biblical or Modern) and why, the lemma as the source prints it, the gender, number and state of a noun or the stem (binyan), conjugation and person of a verb, the attached prefixes as parts of the word, how often the Bible reads it this way, a written transliteration of a pointed form, and under Variants the word across the periods.',
  thin: [
    'Only the closed classes and the commonest Biblical words are compiled into the pack; the full Biblical and Modern indexes are assets the reader installs when Hebrew is loaded. Until then a word outside the core has no reading.',
    'A reading is the source’s reading: the Open Scriptures morphology for the Bible, the Wiktionary tables for Modern Hebrew. Nothing has been checked by a Hebrew scholar or a native speaker.',
    'An unpointed word is matched to the pointed Biblical forms with the same letters; such a reading says its vowels were inferred. A Modern word the tables do not list has no reading.',
    'There is no parser: the sentence decides the period only. A word with several readings in one period keeps them all.',
    'There are no recordings and no voice for Biblical Hebrew; a Modern Hebrew device voice, if the browser has one, is synthetic practice only and is labelled Modern.',
  ],
  languageSteps: HE_TUTORIAL_STEPS_OWN,
  notice: 'This minimal orientation was drafted by an AI model and has not been checked by a native speaker of Hebrew or a Hebrew scholar. It covers how to select a word, what the card shows, the script, the two periods and the attached prefixes; it does not teach the verb system, word order or pronunciation.',
});

export const HE_TUTORIAL_STEPS: TutorialStep[] = HE_TUTORIAL.steps;
