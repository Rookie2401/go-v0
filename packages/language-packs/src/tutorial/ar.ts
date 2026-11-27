/**
 * The Arabic orientation (tutorial/ar): a MINIMAL one, drafted by an AI model for the experimental Arabic pack. NO native speaker or
 * Arabist has checked it. It teaches how to select a word, what the card shows, one practice lookup, how the script runs and joins,
 * the nine words of one root family (ك ت ب), the article and the little words attached to a word, and the two tracks the pack reads
 * (Modern Standard and Classical). It does not teach the verb system, the case endings or word order. Every Arabic example is
 * vocalized and glossed; the glosses are the drafter's own. The practice sentence should be one of the pack's own validation sentences
 * (the lead aligns it, and registers this tutorial in tutorial/index.ts); a test reads every example word through the real analyser.
 */
import { orientation, soundBody } from './orientation';
import type { Tutorial, TutorialStep } from './types';

export const AR_TUTORIAL_STEPS_OWN: TutorialStep[] = [
  {
    id: 'script-right-to-left',
    kind: 'alphabet',
    title: 'Right to left, 28 letters that join, and vowels that are usually not printed',
    estimatedMinutes: 4,
    body:
      'Arabic is written from right to left, in 28 letters that are all consonants (three of them, ا و ي, also stand for long vowels). There are no capital letters. Letters join to the next one, so each has up to four shapes: alone, at the start, in the middle and at the end of a joined run; the card always shows the word as it is printed. Six letters, ا د ذ ر ز و, join the letter before them but never the one after, so the letter that follows them starts afresh. The short vowels (a, i, u), the doubling of a consonant (shadda) and the lack of a vowel (sukūn) are small marks above and below the letters. A Quran, a school book and a dictionary print them; a newspaper, a book for adults and a website normally do not, and the reader supplies the vowels from knowing the word. So most of what you meet is unvowelled, and the card shows the vowelled dictionary form beside it and says whether the vowels were printed on your page or supplied by the dictionary. The transliteration the card may show is a temporary aid, drafted by a machine, and appears only when the vowels are known.',
    examples: [
      { surface: 'كِتَاب', gloss: 'book', note: 'vowelled: kitāb. Printed without marks it is كتاب' },
      { surface: 'بَاب', gloss: 'door', note: 'ا does not join the letter after it' },
      { surface: 'دَار', gloss: 'house, home', note: 'د and ا and ر are all letters that join only backwards' },
      { surface: 'وَلَد', gloss: 'boy, child', note: 'و joins only the letter before it: it starts the word, so it stands alone' },
    ],
  },
  {
    id: 'words-first',
    kind: 'words',
    title: 'Nine words from one root: ك ت ب',
    estimatedMinutes: 3,
    body:
      'Most Arabic words are built from a root of usually three consonants that carries a core meaning, put into patterns of vowels and extra letters. The root ك ت ب has to do with writing, and these nine words all contain it: a verb, a noun for the thing written, the one who does it, the place, the thing written, the present tense, the plural and the act. You do not need to memorise them now; the point is to see that the same three letters keep returning. The card shows the root when the dictionary gives one, and never works one out by taking letters off a word. Arabic has no word for “a”; a noun’s ending changes with its job in the sentence, which a card shows when the vowels allow it.',
    examples: [
      { surface: 'كَتَبَ', gloss: 'he wrote' },
      { surface: 'يَكْتُبُ', gloss: 'he writes; he is writing' },
      { surface: 'كِتَاب', gloss: 'book' },
      { surface: 'كُتُب', gloss: 'books' },
      { surface: 'كَاتِب', gloss: 'writer; clerk' },
      { surface: 'مَكْتَب', gloss: 'office; desk' },
      { surface: 'مَكْتَبَة', gloss: 'library; bookshop' },
      { surface: 'مَكْتُوب', gloss: 'written; letter' },
      { surface: 'كِتَابَة', gloss: 'writing (the act)' },
    ],
  },
  {
    id: 'article-and-attached-words',
    kind: 'patterns',
    title: 'Pattern: the article and little words attached to a word',
    estimatedMinutes: 4,
    body:
      'Arabic writes “the” as ال attached to the front of a noun. It is spelled the same before every letter, but said differently: before the fourteen sun letters (ت ث د ذ ر ز س ش ص ض ط ظ ل ن) the lām is not said and the next consonant is doubled (الشَّمْس is ash-shams, “the sun”); before the other letters it is said (الْقَمَر is al-qamar, “the moon”). Several small words are also written as one letter joined to the next word: وَ “and”, فَ “then, so”, بِ “with, in”, لِ “for, to”, كَ “like”, and the pronouns that end a word (ـهُ “his”, ـهَا “her”, ـنِي “me”, ـكَ “your”). They can pile up: وَبِالْكِتَابِ is “and with the book”. The card annotates the whole word as you see it and shows the breakdown inside the card (the prefixes, the stem and the pronoun, each with its meaning); a letter is never cut out of the page. The pack cuts a prefix only when the rest is a word it knows, and says it did so.',
    examples: [
      { surface: 'الشَّمْس', gloss: 'the sun', note: 'ال + شَمْس; the lām is assimilated: ash-shams' },
      { surface: 'الْقَمَر', gloss: 'the moon', note: 'ال + قَمَر; al-qamar' },
      { surface: 'وَالْكِتَاب', gloss: 'and the book', note: 'وَ + ال + كِتَاب' },
      { surface: 'بِالْكِتَابِ', gloss: 'with the book', note: 'بِ + ال + كِتَاب' },
      { surface: 'لِلْوَلَدِ', gloss: 'for the boy', note: 'لِ + ال + وَلَد; one lām is written for two' },
      { surface: 'كِتَابُهُ', gloss: 'his book', note: 'كِتَاب + ـهُ' },
    ],
  },
  {
    id: 'two-tracks',
    kind: 'concept',
    title: 'Two tracks: Modern Standard and Classical',
    estimatedMinutes: 3,
    body:
      'This pack reads two forms of written Arabic. Modern Standard Arabic is the language of news, books, schools and speeches across the Arab world today; Classical Arabic is the language of the Quran, of the early poetry and of the medieval writers. They share the script, most of the grammar and the great majority of the words, but a Classical text has its own vocabulary and usages. The pack reads in Modern Standard by default; the Classical track is chosen on purpose and a Classical word keeps a note saying so. Neither is the spoken Arabic of any city: Egyptian, Levantine, Gulf, Moroccan and the other dialects differ in sounds, words and grammar, and a sentence with common dialect words is flagged and read with low confidence, not forced into the standard.',
    examples: [
      { surface: 'ذَهَبَ', gloss: 'he went', note: 'common to both tracks' },
      { surface: 'الْوَلَد', gloss: 'the boy', note: 'common to both tracks' },
    ],
  },
];

export const AR_TUTORIAL: Tutorial = orientation({
  languageId: 'ar',
  languageName: 'Arabic',
  practice: { instruction: 'Select the word that means he wrote (the verb), and look at the root the card shows.', sentence: 'كَتَبَ الْوَلَدُ الدَّرْسَ.', target: 'كَتَبَ' },
  cardFeatureNote:
    'For an Arabic noun the card can show its gender, number and, when the vowels are printed, its case ending (nominative, accusative or genitive) and whether it is definite, indefinite or in a possessive chain; for a verb its form (I to X, the pattern), person, number, gender and the perfect or imperfect conjugation, which Arabic uses for time only through the context. The card also shows the root and the prefixes and pronouns as parts of the word. A form that can be read two ways when the vowels are missing keeps both readings, and the card says it could not choose.',
  thin: [
    'Lemmatisation is seed-only: until the full index loads, the compiled word list holds the commonest words and the closed classes, and any other word gets a marked guess or nothing.',
    'Most Arabic is printed without vowels, so one spelling can be several words (عِلْم knowledge, عَلَم flag, عَلِمَ he knew): the card keeps every reading the sentence does not settle and never presents a vowel the dictionary supplied as if the page had printed it.',
    'Meanings come from Wiktionary, which is community-written, and roots are shown only where Wiktionary gives them.',
    'Dialects are not analysed: a sentence with common dialect words is flagged and read with low confidence.',
  ],
  sound: {
    id: 'sound-and-audio',
    body: `${soundBody('Arabic', ' (it speaks Modern Standard only)')} A synthetic Modern Standard voice is not a Classical recitation (tajwīd), it may leave out or change vowels that the page printed, and the Arabic of a recording from a given country is not the Arabic of the page.`,
  },
  languageSteps: AR_TUTORIAL_STEPS_OWN,
  notice: 'This minimal orientation was drafted by an AI model and has not been checked by a native speaker of Arabic or an Arabist. It covers how to select a word, what the card shows, the script, one root family, the article and attached words, and the two tracks; it does not teach the verb system, the case endings or word order. You can skip it and come back at any time.',
});

export const AR_TUTORIAL_STEPS: TutorialStep[] = AR_TUTORIAL.steps;
