/**
 * The Spanish orientation (tutorial/es): a MINIMAL one, written by an AI model for this pack to show that a second language
 * goes through the same shared interfaces as Albanian. NO native speaker has checked any of it; every flag below says so.
 * What it teaches is thin on purpose: the letters and marks English readers meet first (ñ, ll, accents, silent h, ¿ ¡),
 * ten words, two sentence patterns, one five-sentence original passage and four concept cards. It does NOT teach the
 * sounds of Honduran Spanish, voseo (the adapter detects it; this orientation does not teach it), the verb tenses or
 * the sentence layer. A test reads every word of the passage and of every practice sentence through the real adapter
 * (the check is of coverage, not of naturalness).
 */
import type { Tutorial, TutorialPassage, TutorialStep } from './types';

export const ES_PASSAGE: TutorialPassage = {
  title: 'Una casa pequeña',
  authorship: 'machine-drafted',
  reviewed: false,
  reviewNeeded: 'native speaker',
  sentences: [
    { text: 'Ana vive en una casa pequeña.', gloss: 'Ana lives in a small house.' },
    { text: 'Su madre bebe agua en la cocina.', gloss: 'Her mother drinks water in the kitchen.' },
    { text: 'Los niños leen los libros.', gloss: 'The children read the books.' },
    { text: 'Hoy ellos hablan con el maestro.', gloss: 'Today they talk with the teacher.' },
    { text: 'La escuela es grande.', gloss: 'The school is big.' },
  ],
};

export const ES_TUTORIAL_STEPS: TutorialStep[] = [
  // (1) the alphabet where it differs from English
  {
    id: 'alphabet-differences',
    kind: 'alphabet',
    title: 'Letters and marks English does not have: ñ, ll, accents, ¿ ¡',
    estimatedMinutes: 3,
    body:
      'Spanish is written in the Latin alphabet, so most of it looks familiar. ñ is its own letter, said like the ny of “canyon”; n and ñ make different words, so keep the mark. ll is said like a y in most of Latin America (Honduras included); in some regions it is a different sound, so treat this as a guide. An accent mark (á é í ó ú) shows which syllable is stressed and also separates a few words (el “the”, él “he”). Questions and exclamations are opened with an upside-down mark: ¿Cómo estás? ¡Qué bien!',
    examples: [
      { surface: 'niño', gloss: 'boy, child', note: 'ñ is “ny” as in canyon' },
      { surface: 'año', gloss: 'year', note: 'ñ again; ano is a different word' },
      { surface: 'llave', gloss: 'key', note: 'll sounds like y in most of Latin America' },
      { surface: 'día', gloss: 'day', note: 'the accent marks the stressed syllable' },
    ],
  },
  {
    id: 'sounds-silent-h',
    kind: 'sounds',
    title: 'A silent letter and a few traps',
    estimatedMinutes: 2,
    body:
      'h is never said: hablar is “ab-LAR”. j (and g before e or i) is a breathy sound like the h of “hot”. qu is a k sound and the u is silent. c before e or i, and z, are said like s in Latin America (in much of Spain they are a “th”). A word without a written accent is stressed on the next-to-last syllable if it ends in a vowel, n or s, and on the last syllable otherwise. This pack has no recordings, so these are written rules only; when you hear a recording that disagrees, trust the recording.',
    examples: [
      { surface: 'hablar', gloss: 'to speak', note: 'h is silent' },
      { surface: 'casa', gloss: 'house', note: 'stress on the first syllable: CA-sa' },
      { surface: 'ciudad', gloss: 'city', note: 'c before i is said like s in Latin America; stress on the last syllable: ciu-DAD' },
      { surface: 'queso', gloss: 'cheese', note: 'qu is k; the u is silent' },
    ],
  },
  // (2) common words
  {
    id: 'words-first',
    kind: 'words',
    title: 'Ten words to start with',
    estimatedMinutes: 3,
    body:
      'These ten words are common. You will not need to memorise them now: they come back constantly when you read. Notice that Spanish nouns have a gender (la casa, el libro) and that the little word in front (el, la, los, las) tells you which.',
    examples: [
      { surface: 'casa', gloss: 'house, home' },
      { surface: 'madre', gloss: 'mother' },
      { surface: 'agua', gloss: 'water' },
      { surface: 'libro', gloss: 'book' },
      { surface: 'niño', gloss: 'boy, child' },
      { surface: 'escuela', gloss: 'school' },
      { surface: 'pan', gloss: 'bread' },
      { surface: 'mesa', gloss: 'table' },
      { surface: 'hola', gloss: 'hello' },
      { surface: 'gracias', gloss: 'thank you' },
    ],
  },
  // (3) two sentence patterns
  {
    id: 'pattern-svo',
    kind: 'patterns',
    title: 'Pattern 1: who does what to what',
    estimatedMinutes: 3,
    body:
      'The basic order is subject, verb, object, as in English: Los niños (who) leen (read) los libros (what). The verb ending shows the person and number, so the subject word is often left out: leen alone already means “they read”. A noun and its little word agree: los libros is plural and masculine, so both end in -s.',
    examples: [
      { surface: 'Los niños leen los libros.', gloss: 'The children read the books.' },
      { surface: 'Su madre bebe agua en la cocina.', gloss: 'Her mother drinks water in the kitchen.' },
      { surface: 'Yo tengo un libro.', gloss: 'I have a book.' },
    ],
    practice: { instruction: 'Select the word that names what is being read.', sentence: 'Los niños leen los libros.', target: 'libros' },
  },
  {
    id: 'pattern-ser',
    kind: 'patterns',
    title: 'Pattern 2: “is” plus a describing word',
    estimatedMinutes: 2,
    body:
      'To describe something, use es (is) or está (is, for now or for a place) and an adjective: La escuela es grande, “the school is big”; El agua está fría, “the water is cold (at the moment)”. Spanish has two verbs for “to be”: ser says what something is like, estar says how or where it is. The adjective agrees with the noun (grande has one form here; fría is feminine because agua takes a feminine adjective).',
    examples: [
      { surface: 'La escuela es grande.', gloss: 'The school is big.' },
      { surface: 'El agua está fría.', gloss: 'The water is cold.' },
      { surface: 'Mi madre es alta.', gloss: 'My mother is tall.' },
    ],
    practice: { instruction: 'Select the describing word.', sentence: 'La escuela es grande.', target: 'grande' },
  },
  // (4) the demonstration passage
  {
    id: 'passage-demo',
    kind: 'passage',
    title: 'A short passage to try the reader on',
    estimatedMinutes: 3,
    body:
      'Read the passage once, then select any word to see what the analyser says. It was written for this orientation: five short sentences in the present tense. It was drafted by an AI model and has not been checked by a native speaker, so it may sound unnatural; it was checked by machine only, in that every word is one the analyser reads. Do not treat it as a model of good Spanish.',
    passage: ES_PASSAGE,
    practice: { instruction: 'Select the word that means water.', sentence: 'Su madre bebe agua en la cocina.', target: 'agua' },
  },
  // (5) concept cards
  {
    id: 'concept-lemma',
    kind: 'concept',
    title: 'What a lemma is',
    estimatedMinutes: 1,
    body:
      'A lemma is the form of a word you would look up in a dictionary. Words change their shape in a sentence: libros and libro are forms of libro (“book”), and leen and lee are forms of leer (“to read”). When you select a word, GoLearn shows its lemma first, because that is the thing you are learning; the exact form you met is shown beside it.',
    examples: [
      { surface: 'libros', gloss: 'lemma: libro (book)' },
      { surface: 'leen', gloss: 'lemma: leer (to read)' },
    ],
  },
  {
    id: 'concept-morphology',
    kind: 'concept',
    title: 'What a morphological explanation means',
    estimatedMinutes: 1,
    body:
      'The explanation under a word says what its ending is doing, in plain words: for leen, “third person plural, present indicative”, meaning they (third person, plural) read (present, a statement of fact). When the analyser cannot decide it keeps the readings it cannot tell apart, such as the same form as a present statement or a command. A reading marked as inferred is a guess from the ending of a word the word list does not know; treat it as a hint.',
    examples: [{ surface: 'leen', gloss: 'third person plural, present indicative' }],
  },
  {
    id: 'concept-click',
    kind: 'concept',
    title: 'How to select a word',
    estimatedMinutes: 1,
    body:
      'Click or tap a word to select it. To select a phrase, drag across the words. The analyser reads the word in its sentence, so the neighbouring words help it choose between readings; a word selected alone has no sentence to help. The card that opens shows the lemma, a short meaning, the plain-words explanation and, if you ask, more.',
    practice: { instruction: 'Select the word libros.', sentence: 'Los niños leen los libros.', target: 'libros' },
  },
  {
    id: 'concept-pronunciation',
    kind: 'concept',
    title: 'How to hear a word',
    estimatedMinutes: 1,
    body:
      'Each card has a pronunciation note listing where the stress falls and the letters an English reader does not sound as written. This pack has no recorded audio. If your device has a Spanish voice (es-HN, es-419, es-MX or es-ES) it can be played, as practice only. A remote voice (Azure es-HN-CarlosNeural, es-HN-KarlaNeural or es-MX-DaliaNeural) is used only after you give consent and supply your own key; the word you select is then sent to that service, and nothing is sent before you agree.',
  },
];

export const ES_TUTORIAL: Tutorial = {
  ref: 'tutorial/es',
  languageId: 'es',
  authorship: 'machine-drafted',
  reviewed: false,
  reviewNeeded: 'native speaker',
  skippable: true,
  estimatedMinutes: ES_TUTORIAL_STEPS.reduce((n, s) => n + s.estimatedMinutes, 0),
  steps: ES_TUTORIAL_STEPS,
  notice: 'This minimal orientation was drafted by an AI model and has not been checked by a native speaker of Spanish. It covers the writing system, ten words, two sentence patterns and how the card works, and nothing more. You can skip it and come back to it at any time.',
};
