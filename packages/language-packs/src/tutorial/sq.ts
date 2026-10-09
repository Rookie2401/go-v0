/**
 * The Albanian orientation (tutorial/sq): written by an AI model for this pack, draws on the Stage 0 sound notes
 * (data/stage0/sq/sounds, also AI-drafted) and on the adapter's own letter hints. NO native speaker has checked any of
 * it, and every step that teaches Albanian says so through the tutorial-level flags below. The demonstration passage
 * is a short original text; a test reads every word of it through the real analyser (the check is of coverage, not of
 * naturalness).
 */
import type { Tutorial, TutorialPassage, TutorialStep } from './types';

export const SQ_PASSAGE: TutorialPassage = {
  title: 'Një ditë në shtëpi',
  authorship: 'machine-drafted',
  reviewed: false,
  reviewNeeded: 'native speaker',
  sentences: [
    { text: 'Nëna pi çaj në shtëpi.', gloss: 'The mother drinks tea at home.' },
    { text: 'Babai lexon një gazetë.', gloss: 'The father reads a newspaper.' },
    { text: 'Drita është një vajzë e vogël.', gloss: 'Drita is a little girl.' },
    { text: 'Ajo ka një libër.', gloss: 'She has a book.' },
    { text: 'Ana dhe Luan shkojnë në shkollë.', gloss: 'Ana and Luan go to school.' },
    { text: 'Shkolla është e bukur.', gloss: 'The school is beautiful.' },
    { text: 'Fëmijët lexojnë librin.', gloss: 'The children read the book.' },
  ],
};

export const SQ_TUTORIAL_STEPS: TutorialStep[] = [
  // (1) the alphabet where it differs from English
  {
    id: 'alphabet-extra',
    kind: 'alphabet',
    title: 'Two letters English does not have: ë and ç',
    estimatedMinutes: 2,
    body:
      'Albanian is written in the Latin alphabet, so most of it looks familiar. The alphabet has 36 letters, and some of them are two characters long (you will meet those next). Two letters carry a mark that changes the word. ë is a short, relaxed vowel, like the a in “about”; at the end of a word it is often hardly said. ç is “ch” as in “church”. A word spelled with c instead of ç is a different word, so keep the marks when you type or copy.',
    examples: [
      { surface: 'nënë', gloss: 'mother', note: 'two ë; the last one is weak' },
      { surface: 'bukë', gloss: 'bread', note: 'final ë is almost silent' },
      { surface: 'çaj', gloss: 'tea', note: 'ç is “ch” as in church' },
      { surface: 'çantë', gloss: 'bag' },
    ],
  },
  {
    id: 'alphabet-digraphs',
    kind: 'alphabet',
    title: 'Nine letters written with two characters',
    estimatedMinutes: 3,
    body:
      'Albanian counts dh, gj, ll, nj, rr, sh, th, xh and zh as single letters, each with its own sound. Read them as one unit: dhe starts with one sound, dh, not d and h. Compared with English: sh is the sh of “ship”; th is the th of “think”; dh is the th of “this”; xh is the j of “judge”; zh is the s of “measure”; nj is the ny of “canyon”; ll is a heavy, dark l; rr is a rolled r (a single r is one quick tap); gj is a soft sound made with the middle of the tongue, with no English equivalent (a soft “dy” is the nearest).',
    examples: [
      { surface: 'dhe', gloss: 'and', note: 'dh as the th of “this”' },
      { surface: 'dhomë', gloss: 'room' },
      { surface: 'gjuhë', gloss: 'language', note: 'gj has no English equivalent' },
      { surface: 'gjyshe', gloss: 'grandmother' },
      { surface: 'llambë', gloss: 'lamp', note: 'a dark, heavy l' },
      { surface: 'një', gloss: 'one, a', note: 'nj as the ny of “canyon”' },
      { surface: 'rrugë', gloss: 'street', note: 'rolled rr' },
      { surface: 'shtëpi', gloss: 'house', note: 'sh as in “ship”' },
      { surface: 'thotë', gloss: 'says', note: 'th as in “think”' },
      { surface: 'xhaketë', gloss: 'jacket', note: 'xh as the j of “judge”' },
      { surface: 'kuzhinë', gloss: 'kitchen', note: 'zh as the s of “measure”' },
    ],
  },
  // (2) letters and sounds that surprise an English reader
  {
    id: 'sounds-surprise',
    kind: 'sounds',
    title: 'Letters that do not sound as English readers expect',
    estimatedMinutes: 3,
    body:
      'A few single letters are traps. j is the y of “yes”, never the j of “jam”. c is “ts” as in “cats”, never k or s. x is “dz” as in “beds” (it is rare). y is not a consonant here: it is the vowel you get by saying “ee” with rounded lips, like German ü or French u. q is a palatal sound between k and ch; it is not the English q, and it is not the same as gj. Albanian spelling follows the sound closely, so these rules take you a long way, but they are a guide, not a promise.',
    examples: [
      { surface: 'jetë', gloss: 'life', note: 'j as the y of “yes”' },
      { surface: 'jo', gloss: 'no' },
      { surface: 'cili', gloss: 'which', note: 'c is “ts”' },
      { surface: 'yll', gloss: 'star', note: 'y as German ü' },
      { surface: 'dy', gloss: 'two' },
      { surface: 'shqip', gloss: 'Albanian (the language)', note: 'q is a soft, palatal sound' },
      { surface: 'xixë', gloss: 'spark', note: 'x is “dz”' },
    ],
  },
  {
    id: 'sounds-stress',
    kind: 'sounds',
    title: 'Which syllable is said stronger',
    estimatedMinutes: 2,
    body:
      'In a word of two or more syllables one syllable is said a little stronger. A rough rule: it is the last syllable of the basic word (shtë-PI). A word that ends in ë, or in -ër or -ël, is stressed one syllable earlier (LI-bër, THO-të). An ending added to the basic word (-a, -i, -t) is not stressed. Expect exceptions: faleminderit is fa-le-min-DE-rit, and two vowels written together can be two syllables. The spelling does not show the stress. This pack has no recordings, so these are written rules only; when you hear a recording that disagrees, trust the recording.',
    examples: [
      { surface: 'shtëpi', gloss: 'house', note: 'shtë-PI' },
      { surface: 'libër', gloss: 'book', note: 'LI-bër' },
      { surface: 'thotë', gloss: 'says', note: 'THO-të' },
      { surface: 'faleminderit', gloss: 'thank you', note: 'an exception: fa-le-min-DE-rit' },
    ],
  },
  // (3) common words
  {
    id: 'words-first',
    kind: 'words',
    title: 'Twelve words to start with',
    estimatedMinutes: 3,
    body:
      'These twelve words are common, and between them they let you recognise a great many sentences. You will not need to memorise them now: they come back constantly when you read. Notice that ti and unë are the words for “you” and “I”; Albanian often leaves them out because the verb ending already shows who is meant.',
    examples: [
      { surface: 'unë', gloss: 'I' },
      { surface: 'ti', gloss: 'you (singular)' },
      { surface: 'po', gloss: 'yes' },
      { surface: 'jo', gloss: 'no' },
      { surface: 'faleminderit', gloss: 'thank you' },
      { surface: 'mirëmëngjes', gloss: 'good morning' },
      { surface: 'shtëpi', gloss: 'house, home' },
      { surface: 'libër', gloss: 'book' },
      { surface: 'ujë', gloss: 'water' },
      { surface: 'çaj', gloss: 'tea' },
      { surface: 'shkollë', gloss: 'school' },
      { surface: 'nënë', gloss: 'mother' },
    ],
  },
  // (4) two sentence patterns
  {
    id: 'pattern-svo',
    kind: 'patterns',
    title: 'Pattern 1: who does what to what',
    estimatedMinutes: 3,
    body:
      'The basic order is subject, verb, object, as in English: Ana (who) pi (drinks) ujë (what). The object may carry an ending that shows it is the object, and a definite object (“the book”) ends in -in or -n in the masculine: libri is the book as a subject, librin is the book as an object. Look for that ending when you read.',
    examples: [
      { surface: 'Ana pi ujë.', gloss: 'Ana drinks water.' },
      { surface: 'Babai lexon një gazetë.', gloss: 'The father reads a newspaper.' },
      { surface: 'Fëmijët lexojnë librin.', gloss: 'The children read the book.', note: 'librin: the definite object' },
    ],
    practice: { instruction: 'Select the word that names what is being read.', sentence: 'Fëmijët lexojnë librin.', target: 'librin' },
  },
  {
    id: 'pattern-est',
    kind: 'patterns',
    title: 'Pattern 2: “is” plus a describing word',
    estimatedMinutes: 2,
    body:
      'To describe something, use është (is) and an adjective: Shkolla është e bukur, “the school is beautiful”. Many adjectives come with a little word in front (i, e, të, së) that agrees with the noun; the dictionary lists them with it: i bukur. Here e is used because shkolla is feminine, and i is used with a masculine noun: Uji është i ftohtë. You do not have to master the agreement yet; the analyser will show it when you select the adjective.',
    examples: [
      { surface: 'Shkolla është e bukur.', gloss: 'The school is beautiful.' },
      { surface: 'Shtëpia është e madhe.', gloss: 'The house is big.' },
      { surface: 'Uji është i ftohtë.', gloss: 'The water is cold.' },
    ],
    practice: { instruction: 'Select the describing word.', sentence: 'Shkolla është e bukur.', target: 'bukur' },
  },
  // (5) the demonstration passage
  {
    id: 'passage-demo',
    kind: 'passage',
    title: 'A short passage to try the reader on',
    estimatedMinutes: 3,
    body:
      'Read the passage once, then select any word to see what the analyser says. It was written for this orientation: seven short sentences in the present tense. It was drafted by an AI model and has not been checked by a native speaker, so it may sound unnatural; it was checked by machine only, in that every word is one the analyser reads. Do not treat it as a model of good Albanian.',
    passage: SQ_PASSAGE,
    practice: { instruction: 'Select the word that means tea.', sentence: 'Nëna pi çaj në shtëpi.', target: 'çaj' },
  },
  // (6) concept cards
  {
    id: 'concept-lemma',
    kind: 'concept',
    title: 'What a lemma is',
    estimatedMinutes: 1,
    body:
      'A lemma is the form of a word you would look up in a dictionary. Words change their shape in a sentence: librin, libri and libra are all forms of libër (“book”), and lexojnë and lexon are forms of lexoj (“to read”). When you select a word, GoLearn shows its lemma first, because that is the thing you are learning; the exact form you met is shown beside it.',
    examples: [
      { surface: 'librin', gloss: 'lemma: libër (book)' },
      { surface: 'lexojnë', gloss: 'lemma: lexoj (to read)' },
    ],
  },
  {
    id: 'concept-morphology',
    kind: 'concept',
    title: 'What a morphological explanation means',
    estimatedMinutes: 1,
    body:
      'The explanation under a word says what its ending is doing, in plain words: for librin, “definite accusative singular”, meaning the book (definite), as the direct object (accusative), one of them (singular). When the analyser cannot decide, it keeps the readings it cannot tell apart and says so, such as “nominative or accusative”. A reading marked unconfirmed is a guess from the ending of a word the word list does not know; treat it as a hint.',
    examples: [{ surface: 'librin', gloss: 'definite accusative singular' }],
  },
  {
    id: 'concept-click',
    kind: 'concept',
    title: 'How to select a word',
    estimatedMinutes: 1,
    body:
      'Click or tap a word to select it. To select a phrase, drag across the words. The analyser reads the word in its sentence, so the neighbouring words help it choose between readings; a word selected alone has no sentence to help. The card that opens shows the lemma, a short meaning, the plain-words explanation and, if you ask, more.',
    practice: { instruction: 'Select the word librin.', sentence: 'Fëmijët lexojnë librin.', target: 'librin' },
  },
  {
    id: 'concept-pronunciation',
    kind: 'concept',
    title: 'How to hear a word',
    estimatedMinutes: 1,
    body:
      'Each card has a pronunciation note listing the letters of the word that an English reader does not sound as written. This pack has no recorded audio. If you turn on a spoken voice, it is a remote voice (Azure sq-AL-AnilaNeural or sq-AL-IlirNeural) and is used only after you give consent and supply your own key; the word you select is then sent to that service, and nothing is sent before you agree.',
  },
  {
    id: 'concept-sentence',
    kind: 'concept',
    title: 'How to expand the sentence explanation',
    estimatedMinutes: 1,
    body:
      'Under the word card there is a sentence layer you can open: it shows how the words work together (for example, the linking article i/e with its adjective, or a short pronoun that repeats the object), the phrase units the analyser recognises and the grammar pattern in play. It opens only when you ask, so reading is not interrupted.',
  },
  {
    id: 'concept-encounters',
    kind: 'concept',
    title: 'How GoLearn records what you meet',
    estimatedMinutes: 1,
    body:
      'GoLearn records that you met or looked up a word: which word (as an item), which help you opened, when, a scrambled fingerprint of the sentence it was in, and the title or place of the source you were reading. It does not store the sentence itself or the page. Keeping short sentences for your later practice is a separate choice, made per source, and the kept sentences are listed so you can see and delete them. You can export or delete what is recorded.',
  },
  {
    id: 'concept-practice',
    kind: 'concept',
    title: 'How GoPractice later tests selected material',
    estimatedMinutes: 1,
    body:
      'GoPractice is a separate application. It builds review cards only from words you actually met while reading, and a recognition counts for less than recalling a word yourself. What you do there changes what GoLearn thinks you know, and what you read changes what GoPractice asks you; neither one invents knowledge you have not shown. Using GoPractice is optional.',
  },
];

export const SQ_TUTORIAL: Tutorial = {
  ref: 'tutorial/sq',
  languageId: 'sq',
  authorship: 'machine-drafted',
  reviewed: false,
  reviewNeeded: 'native speaker',
  skippable: true,
  estimatedMinutes: SQ_TUTORIAL_STEPS.reduce((n, s) => n + s.estimatedMinutes, 0),
  steps: SQ_TUTORIAL_STEPS,
  notice: 'This orientation was drafted by an AI model and has not been checked by a native speaker of Albanian. You can skip it and come back to it at any time.',
};
