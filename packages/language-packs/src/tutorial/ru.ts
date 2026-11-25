/**
 * The Russian orientation (tutorial/ru): a MINIMAL one, drafted by an AI model for the experimental Russian pack. NO native speaker has
 * checked it. It teaches how to select a word, what the card shows, one practice lookup, how Cyrillic works (letters that look like Latin
 * ones, the soft and hard signs, the vowel pairs, and that stress is not written), nine very common words, and what this pack cannot do.
 * It does not teach cases, verb forms or aspect. The practice sentence should be one of the pack's own validation sentences (the lead
 * aligns it); a test reads every example word through the real analyser, so the examples are among the commonest Russian words.
 */
import { orientation, soundBody } from './orientation';
import type { Tutorial, TutorialStep } from './types';

export const RU_TUTORIAL_STEPS_OWN: TutorialStep[] = [
  {
    id: 'alphabet-cyrillic',
    kind: 'alphabet',
    title: 'Cyrillic: 33 letters, some of them false friends',
    estimatedMinutes: 4,
    body:
      'Russian is written in the Cyrillic alphabet, from left to right, with 33 letters and a capital letter at the start of a sentence and for names. A few letters look and sound as you expect (А, К, М, О, Т). Several look like a Latin letter but say something else: В says v, Н says n, Р says r, С says s, У says oo, Х says kh. The rest are new shapes (Б, Г, Д, Ж, З, И, Й, Л, П, Ф, Ц, Ч, Ш, Щ, Ы, Э, Ю, Я). Two letters have no sound of their own: the soft sign ь makes the consonant before it soft, and the hard sign ъ is rare. Five vowels come in hard and soft pairs (а я, э е, о ё, у ю, ы и). Russian text does not mark the stress, and an unstressed о is said like а, so a word is not said exactly as it is spelled; the card shows the stress with an acute accent where the dictionary records it. The transliteration the card may show is a temporary aid and not the way to read.',
    examples: [
      { surface: 'он', gloss: 'he', note: 'Н looks like Latin H but says n: on' },
      { surface: 'как', gloss: 'how', note: 'К, А, К say k, a, k: kak' },
      { surface: 'что', gloss: 'what', note: 'Ч says ch, but the word is said shto' },
      { surface: 'всё', gloss: 'everything, all', note: 'В says v, С says s; ё is always stressed and says yo' },
      { surface: 'мы', gloss: 'we', note: 'Ы is a back vowel with no English match; it never starts a word' },
    ],
  },
  {
    id: 'words-first',
    kind: 'words',
    title: 'Nine words to start with',
    estimatedMinutes: 2,
    body:
      'These words are among the commonest in Russian and you will meet them on almost every page; you do not need to memorise them now. Russian has no words for “a” or “the”, and a noun changes its ending with its job in the sentence, so the card shows the dictionary form of the word you selected, and book or house may appear with other endings in the text.',
    examples: [
      { surface: 'он', gloss: 'he' },
      { surface: 'она', gloss: 'she' },
      { surface: 'это', gloss: 'this, it' },
      { surface: 'не', gloss: 'not' },
      { surface: 'и', gloss: 'and' },
      { surface: 'в', gloss: 'in, into' },
      { surface: 'книга', gloss: 'book' },
      { surface: 'дом', gloss: 'house, home' },
      { surface: 'читать', gloss: 'to read' },
    ],
  },
];

export const RU_TUTORIAL: Tutorial = orientation({
  languageId: 'ru',
  languageName: 'Russian',
  practice: { instruction: 'Select the word that means reads (the verb).', sentence: 'Она читает книгу.', target: 'читает' },
  cardFeatureNote: 'For a Russian noun the card can show its case (nominative, genitive, dative, accusative, instrumental or prepositional), number and gender, and for a verb its tense, person and aspect (imperfective or perfective, which Russian treats as two verbs). A form written the same way in two jobs keeps both readings, and the card says it could not choose.',
  thin: [
    'Lemmatisation is seed-only: until the full index loads, the compiled word list holds the commonest words and the closed classes, and any other word gets a marked guess or nothing.',
    'Meanings come from Wiktionary, which is community-written, and stress is shown only where Wiktionary records it.',
    'Words written alike keep every reading when the sentence does not decide between them: за\u0301мок (castle) and замо\u0301к (lock) are one spelling.',
  ],
  sound: {
    id: 'sound-and-audio',
    body: `${soundBody('Russian')} Russian text does not mark the stress and a voice chooses it by itself, so it can stress a word differently from the card; check the card's stress.`,
  },
  languageSteps: RU_TUTORIAL_STEPS_OWN,
  notice: 'This minimal orientation was drafted by an AI model and has not been checked by a native speaker of Russian. It covers how to select a word, what the card shows, how Cyrillic works, nine common words and what the experimental pack cannot do. You can skip it and come back at any time.',
});

export const RU_TUTORIAL_STEPS: TutorialStep[] = RU_TUTORIAL.steps;
