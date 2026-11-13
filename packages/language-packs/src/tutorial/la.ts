/**
 * The Latin orientation (tutorial/la), drafted by an AI model for the experimental Latin pack. NO Latinist has checked it (Latin has no
 * native speakers, so the review it needs is a Latinist's). It teaches how to select a word, what the card shows, one practice lookup,
 * how Latin is written in the Clementine Vulgate (i/j, u/v, ae and oe ligatures, no vowel length), how it is said when read as Church
 * Latin, twelve first words, three sentence patterns (the ending, not the place, says who does what; the verb ending says who; est with a
 * describing word that agrees), one six-sentence original passage, and what this pack cannot do. It does not teach the declensions or
 * conjugations as tables. The practice sentence is one of the pack's own validation sentences; a test reads every example word through the
 * real analyser. Fuller since 2026-11-13 (sounds, patterns and the passage added; it had two steps of its own before).
 */
import { orientation, soundBody } from './orientation';
import type { Tutorial, TutorialPassage, TutorialStep } from './types';

/** Written for this orientation in simple Church Latin; every word is one the analyser reads (tested), which says nothing of its style. */
export const LA_PASSAGE: TutorialPassage = {
  title: 'In ecclesia',
  authorship: 'machine-drafted',
  reviewed: false,
  reviewNeeded: 'native speaker',
  sentences: [
    { text: 'Marcus et Iulia in parva domo habitant.', gloss: 'Marcus and Julia live in a small house.' },
    { text: 'Hodie ad ecclesiam ambulant.', gloss: 'Today they walk to the church.' },
    { text: 'Ecclesia est magna et pulchra.', gloss: 'The church is big and beautiful.' },
    { text: 'Sacerdos librum sacrum legit.', gloss: 'The priest reads the holy book.' },
    { text: 'Populus verba audit et Deum laudat.', gloss: 'The people hear the words and praise God.' },
    { text: 'Postea Marcus et Iulia domum laeti ambulant.', gloss: 'Afterwards Marcus and Julia walk home happy.' },
  ],
};

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
    id: 'sounds-church',
    kind: 'sounds',
    title: 'How Latin is said when read as Church Latin',
    estimatedMinutes: 3,
    body:
      'Latin is said in more than one way. The pack’s texts are the Church’s, so its notes follow the Church (Ecclesiastical) way, close to Italian. Every vowel is said, and said fully: a e i o u as in Italian, never swallowed. The pair ae (or æ) and oe (or œ) are said like the e of “bed”. Before e, i, ae and oe, c is said “ch” as in “church” and g as in “gentle”; elsewhere they are hard, as in “cat” and “go”. gn is said “ny”, as in “canyon”. ti before a vowel is said “tsi”. qu is “kw”, x is “ks”, h is silent, and a doubled consonant is held a little longer. Nothing of this is marked in the writing: you learn it once and it holds everywhere.',
    examples: [
      { surface: 'caelum', gloss: 'heaven, sky', note: 'ae is said e, and c before it is “ch”: “chelum”' },
      { surface: 'pacem', gloss: 'peace (as the object)', note: 'c before e is “ch”: “pachem”' },
      { surface: 'regina', gloss: 'queen', note: 'g before i is soft, as in “gentle”' },
      { surface: 'agnus', gloss: 'lamb', note: 'gn is “ny”: “anyus”' },
      { surface: 'gratia', gloss: 'grace', note: 'ti before a vowel is “tsi”: “gratsia”' },
      { surface: 'aqua', gloss: 'water', note: 'qu is “kw”' },
      { surface: 'homo', gloss: 'person, man', note: 'h is silent: “omo”' },
    ],
  },
  {
    id: 'words-first',
    kind: 'words',
    title: 'Twelve words to start with',
    estimatedMinutes: 2,
    body:
      'These words are common in the Vulgate and in the course’s first texts; you do not need to memorise them now. A noun is listed under its nominative singular and a verb under its first-person present form, so the card shows habeo, “I have”, where an English dictionary would give “to have”. When the ending of a word could belong to more than one case, the card shows every reading instead of choosing one.',
    examples: [
      { surface: 'Deus', gloss: 'God' },
      { surface: 'Dominus', gloss: 'Lord' },
      { surface: 'verbum', gloss: 'word' },
      { surface: 'terra', gloss: 'earth, land' },
      { surface: 'homo', gloss: 'person, man' },
      { surface: 'ecclesia', gloss: 'church' },
      { surface: 'magnus', gloss: 'big, great' },
      { surface: 'bonus', gloss: 'good' },
      { surface: 'et', gloss: 'and' },
      { surface: 'non', gloss: 'not' },
      { surface: 'est', gloss: 'is' },
      { surface: 'in', gloss: 'in, into' },
    ],
  },
  {
    id: 'pattern-endings',
    kind: 'patterns',
    title: 'Pattern 1: the ending says who does what',
    estimatedMinutes: 3,
    body:
      'In English the order of the words says who does what: “the boy sees the girl” is not “the girl sees the boy”. In Latin the endings say it. Puer (the nominative) is the one who sees; puellam (the accusative, ending -m) is the one seen. So Puer puellam videt and Puellam puer videt mean the same: the boy sees the girl. The verb usually comes last. When you select a word, the card shows its case: Nom for the one who acts, Acc for the one acted on.',
    examples: [
      { surface: 'puer', gloss: 'the boy (who acts)', note: 'nominative' },
      { surface: 'puellam', gloss: 'the girl (who is seen)', note: 'accusative, ending -m' },
      { surface: 'videt', gloss: 'sees', note: 'the verb, here at the end' },
    ],
    practice: { instruction: 'Select the word for the one who is seen.', sentence: 'Puer puellam videt.', target: 'puellam' },
  },
  {
    id: 'pattern-verb-ending',
    kind: 'patterns',
    title: 'Pattern 2: the verb ending says who',
    estimatedMinutes: 2,
    body:
      'A Latin verb carries its subject in its ending, so the word for “I”, “you” or “he” is usually left out: amo is “I love”, amas “you love”, amat “he or she loves”, amamus “we love”, amatis “you (all) love”, amant “they love”. Ego and tu are used only to stress the person: Ego te amo, “I love you”. The card names the person and number of a verb form: 1st person singular for amo, 3rd person plural for amant.',
    examples: [
      { surface: 'amo', gloss: 'I love' },
      { surface: 'amat', gloss: 'he or she loves' },
      { surface: 'amant', gloss: 'they love' },
      { surface: 'ambulant', gloss: 'they walk' },
    ],
    practice: { instruction: 'Select the verb that means “they walk”.', sentence: 'Hodie ad ecclesiam ambulant.', target: 'ambulant' },
  },
  {
    id: 'pattern-est',
    kind: 'patterns',
    title: 'Pattern 3: est with a describing word that agrees',
    estimatedMinutes: 2,
    body:
      'To say what something is like, use est (is) or sunt (are) with an adjective: Ecclesia est magna, “the church is big”. The adjective takes the ending that fits its noun: ecclesia is feminine, so magna; Deus is masculine, so bonus; verbum is neuter, so bonum. That agreement is how you see which adjective belongs to which noun when the words are far apart.',
    examples: [
      { surface: 'magna', gloss: 'big (with a feminine noun)' },
      { surface: 'bonus', gloss: 'good (with a masculine noun)' },
      { surface: 'sunt', gloss: 'are' },
    ],
    practice: { instruction: 'Select the describing word.', sentence: 'Ecclesia est magna et pulchra.', target: 'magna' },
  },
  {
    id: 'passage-demo',
    kind: 'passage',
    title: 'A short passage to try the reader on',
    estimatedMinutes: 3,
    body:
      'Read the passage once, then select any word to see what the analyser says. It was written for this orientation: six short sentences in the present tense about two people going to church. It was drafted by an AI model and no Latinist has checked it, so it may read unnaturally; it was checked by machine only, in that every word is one the analyser reads. Do not treat it as a model of good Latin.',
    passage: LA_PASSAGE,
    practice: { instruction: 'Select the word that means book.', sentence: 'Sacerdos librum sacrum legit.', target: 'librum' },
  },
];

export const LA_TUTORIAL: Tutorial = orientation({
  languageId: 'la',
  languageName: 'Latin',
  practice: { instruction: 'Select the word that means word.', sentence: 'In principio erat Verbum, et Verbum erat apud Deum.', target: 'Verbum' },
  cardFeatureNote: 'A Latin card shows the case and gender of a noun, for example “Nom,Acc” where one ending serves both, and the person, number and tense of a verb where the analyser knows them.',
  thin: [
    'Its word list grows from a seed of about 1,900 lexemes to about 52,000 once the full lexicon has loaded; before that, a word outside the seed gets a marked guess or nothing.',
    'Many endings are written alike, so a form often keeps several readings; the pack does not choose between them from the sentence.',
    'The spelling is the Clementine Vulgate’s; classical texts are read through the same word list and are read less well than the Vulgate.',
  ],
  sound: { id: 'sound-and-audio', body: soundBody('Latin', '; Latin is pronounced in more than one way (the Roman, the Church and the regional ones); the notes above follow the Church way, which the pack’s texts use') },
  languageSteps: LA_TUTORIAL_STEPS_OWN,
  notice: 'This orientation was drafted by an AI model and has not been checked by a native speaker of Latin, since there are none, or by a Latinist. It covers how to select a word, what the card shows, how Latin is spelled and said, twelve words, three sentence patterns, a short passage and what the experimental pack cannot do. You can skip it and come back at any time.',
});

export const LA_TUTORIAL_STEPS: TutorialStep[] = LA_TUTORIAL.steps;
