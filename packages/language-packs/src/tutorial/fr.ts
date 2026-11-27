/**
 * The French orientation (tutorial/fr), drafted by an AI model for the experimental French pack. NO native speaker has checked it.
 * Its language steps ARE the optional French Decoding Sprint (docs/french/DECODING-SPRINT.md): six short stages for an English
 * speaker with no French, from "I can already say a few real expressions" to "I can read a short passage". It teaches the least a
 * beginner needs to start decoding written French, as "usually" rules with their common exceptions named, and says that regional
 * French (Québec, Belgium, Switzerland, Africa) differs from the common pronunciation of France that it describes. It teaches no
 * IPA, no verb tables and no recordings: the pack has none. The whole sprint can be skipped; the learner can start reading real
 * pages at once. The practice sentence is the pack's own validation sentence; a test reads every example word through the real
 * analyser. `FR_ALPHABET_ROWS` are the cards of GoReview's permanent Alphabet deck (the lead copies them there).
 */
import { orientation, soundBody } from './orientation';
import type { Tutorial, TutorialPassage, TutorialStep } from './types';

/** Written for this orientation, using only what stages 1 to 5 teach; not a quotation. Every word is one the analyser should read. */
export const FR_PASSAGE: TutorialPassage = {
  title: 'Un petit texte',
  authorship: 'machine-drafted',
  reviewed: false,
  reviewNeeded: 'native speaker',
  sentences: [
    { text: 'Elle est ici avec un ami.', gloss: 'She is here with a friend.' },
    { text: 'Ils parlent de l\'école.', gloss: 'They talk about the school.' },
    { text: 'C\'est un petit livre.', gloss: 'It is a small book.' },
    { text: 'Je veux le livre du garçon.', gloss: 'I want the boy\'s book (literally: the book of the boy).' },
    { text: 'Nous avons deux enfants.', gloss: 'We have two children.' },
    { text: 'Les enfants vont au marché.', gloss: 'The children go to the market.' },
  ],
};

export const FR_TUTORIAL_STEPS_OWN: TutorialStep[] = [
  {
    id: 'sprint-1-recognition',
    kind: 'words',
    title: 'Decoding Sprint, stage 1: say a few real expressions',
    estimatedMinutes: 2,
    body:
      'This sprint is optional: it is six short stages that teach the least an English speaker needs to start decoding written French, and you can skip all of it and start reading real pages at once. It comes back in the Alphabet deck if you want it later. Stage 1 starts with expressions you can say now, roughly. The respellings are English approximations, not exact French sounds. Bonjour is said bon-ZHOOR, with the on said through the nose and the final r made at the back of the throat. Oui is “wee”. Non is “no” with a nasal o. Je suis is “zhuh swee”. Merci is “mair-SEE”. A final consonant is often silent, which is why Salut ends in “loo” and Comment ça va ? ends in “va”.',
    examples: [
      { surface: 'Bonjour', gloss: 'hello, good day', note: 'said roughly bon-ZHOOR' },
      { surface: 'Merci', gloss: 'thank you', note: 'said roughly mair-SEE' },
      { surface: 'Salut', gloss: 'hi; bye (informal)', note: 'said roughly sa-LOO, the t is silent' },
      { surface: 'Oui', gloss: 'yes', note: 'said roughly wee' },
      { surface: 'Non', gloss: 'no', note: 'a nasal o; the n is not said' },
      { surface: 'Je suis ici.', gloss: 'I am here.', note: 'said roughly zhuh swee ee-SEE' },
      { surface: 'C\'est bon.', gloss: 'It is good.', note: 'c\' is said like s: say-BON, with a nasal on' },
      { surface: 'Je veux de l\'eau.', gloss: 'I want some water.', note: 'eau is said like o in go' },
      { surface: 'Je ne sais pas.', gloss: 'I do not know.', note: 'ne is said weakly, and pas ends in a silent s' },
      { surface: 'Comment ça va ?', gloss: 'How are you? (literally: how does it go?)', note: 'ç is said s' },
    ],
  },
  {
    id: 'sprint-2-vowels',
    kind: 'alphabet',
    title: 'Decoding Sprint, stage 2: the vowel spellings',
    estimatedMinutes: 3,
    body:
      'French is written in the Latin alphabet with accents (é è ê à â î ô û ç) and two joined letters (œ, æ). Its vowels are spelled in groups, and a group is said as one sound. Usually: ou is “oo” as in food (vous). oi is “wa” (moi). au and eau are “o” as in go, short and pure (eau). ai and ei are “e” as in bed (mais). eu and œu are like the u of fur without the r, with rounded lips (peu, cœur). A plain u is “ee” said with rounded lips, like German ü (tu); English has no such sound. The nasal spellings are said through the nose and the n or m is not pronounced: an, en, am, em (enfant); on, om (bon); in, im, ain, ein (vin, pain); un (un). In much of France un and in sound the same; in Québec, Belgium and Switzerland they are often kept apart, so do not worry about the difference at first. The nasal rule: a vowel is nasal only when the n or m is not followed by a vowel or another n or m. So bon is nasal but bonne is not, an is nasal but année is not, and in is nasal but inutile is not. These are rules of thumb with exceptions, not laws.',
    examples: [
      { surface: 'vous', gloss: 'you (formal or plural)', note: 'ou is oo as in food' },
      { surface: 'moi', gloss: 'me', note: 'oi is wa' },
      { surface: 'eau', gloss: 'water', note: 'eau is o as in go' },
      { surface: 'mais', gloss: 'but', note: 'ai is e as in bed; the s is silent' },
      { surface: 'peu', gloss: 'little, not much', note: 'eu is like the u in fur without the r' },
      { surface: 'tu', gloss: 'you (informal)', note: 'u is ee with rounded lips' },
      { surface: 'enfant', gloss: 'child', note: 'en and an are nasal a; the t is silent' },
      { surface: 'bon', gloss: 'good', note: 'on is nasal o: bon is nasal, bonne is not' },
      { surface: 'vin', gloss: 'wine', note: 'in is nasal e' },
      { surface: 'pain', gloss: 'bread', note: 'ain is nasal e' },
      { surface: 'un', gloss: 'a, one', note: 'nasal; for many speakers in France the same sound as in' },
    ],
  },
  {
    id: 'sprint-3-silent',
    kind: 'sounds',
    title: 'Decoding Sprint, stage 3: the silent letters',
    estimatedMinutes: 2,
    body:
      'The biggest surprise in written French is that many letters are not said. Usually the final consonants d, p, s, t, x and z are silent: petit, grand, trop, les, deux, nez. The final c, r, f and l are usually said (think of the word CaReFuL): avec, pour, chef, sel. There are exceptions on both sides: the final r of an -er verb is silent (parler is said like parlay), the c of blanc is silent, and the final consonant of sud, cap and sept is said. A final e is usually silent, but it makes the consonant before it heard: petit (the t is silent) but petite (the t is said), grand but grande. Verb endings are the same kind of surprise: parle, parles and parlent are all said alike, because the -s and the -ent of a verb are silent. A noun, adjective or adverb that ends in -ent is different: it is a nasal a (moment, souvent), and a spelling alone cannot tell you which. When a letter is silent it usually still marks something in the writing, so keep it.',
    examples: [
      { surface: 'parle', gloss: 'speak, talks (I or he or she)', note: 'final e silent' },
      { surface: 'parles', gloss: 'you speak', note: 'said just like parle' },
      { surface: 'parlent', gloss: 'they speak', note: 'a verb ending in -ent is silent: said like parle' },
      { surface: 'petit', gloss: 'small (masculine)', note: 'the t is silent' },
      { surface: 'petite', gloss: 'small (feminine)', note: 'the t is said' },
      { surface: 'grand', gloss: 'big', note: 'the d is silent; an is nasal a' },
      { surface: 'les', gloss: 'the (plural)', note: 'said lay; the s is silent' },
      { surface: 'avec', gloss: 'with', note: 'the final c is said' },
    ],
  },
  {
    id: 'sprint-4-liaison',
    kind: 'patterns',
    title: 'Decoding Sprint, stage 4: liaison and enchaînement',
    estimatedMinutes: 3,
    body:
      'Two things join French words together in speech. Enchaînement: a consonant that is said at the end of a word moves onto the next word if it starts with a vowel, so il aime is said as if it were written i-laime. Liaison: a normally silent final consonant is heard before a vowel. It is described here, not heard; this pack has no recordings. The sound that comes back is usually s or x as z (les amis is said lay-za-mee), d as t (grand homme), and n as n (un ami). The rule has three parts. Required: after a determiner or number (les amis, un enfant, deux heures), after a pronoun before its verb (nous avons, vous êtes, ils ont, on a), after short words such as dans, chez, sans, en, très and bien (en avion, très utile), and between an adjective that comes before its noun (petit ami, grand homme, bon ami). Optional: after a plural noun, after forms of être and other verbs, after pas and mais; many speakers make these only when speaking carefully. Never: after et (et elle, the t is silent), after a singular noun, and before a word with an aspirated h or before onze, oui and a few others: les héros and les onze are said without a z. The aspirated h is silent but the word acts as if it started with a consonant. Regional speech differs in how much liaison is made, so treat the optional ones as a choice.',
    examples: [
      { surface: 'les amis', gloss: 'the friends', note: 'required; the s is heard as z: lay-za-mee' },
      { surface: 'nous avons', gloss: 'we have', note: 'required; the s is heard as z' },
      { surface: 'vous êtes', gloss: 'you are', note: 'required; the s is heard as z' },
      { surface: 'un enfant', gloss: 'a child', note: 'required; the n is said and the vowel loses its nasal sound' },
      { surface: 'petit ami', gloss: 'boyfriend, little friend', note: 'required; the t is said' },
      { surface: 'et elle', gloss: 'and she', note: 'never: the t of et is silent' },
      { surface: 'les héros', gloss: 'the heroes', note: 'never: aspirated h, so no z' },
    ],
  },
  {
    id: 'sprint-5-elision',
    kind: 'patterns',
    title: 'Decoding Sprint, stage 5: elision and contraction',
    estimatedMinutes: 2,
    body:
      'Before a vowel sound a few short words lose their vowel and keep an apostrophe. This is called elision. Le and la become l\' (l\'homme), je becomes j\' (j\'aime), ce becomes c\' (c\'est), que becomes qu\' (qu\'il), ne becomes n\' (n\'est), and de becomes d\'. The elided word is said as one syllable with the next word, and GoLearn reads it as its own token, so l\' is a card of its own: the word le or la with its vowel dropped. An aspirated h blocks elision, so it is le héros and never l\'héros. Contraction is different: the word is written as one. The preposition à joins le to make au (à + le) and les to make aux; de joins le to make du and les to make des. Au, aux, du and des are single words in print and are read as two parts. The cases à la and de la, and à l\' and de l\', do not contract.',
    examples: [
      { surface: 'L\'homme est ici.', gloss: 'The man is here.', note: 'l\' is le with its vowel dropped; the h of homme is silent' },
      { surface: 'J\'aime le pain.', gloss: 'I like bread.', note: 'j\' is je with its vowel dropped' },
      { surface: 'Il n\'est pas ici.', gloss: 'He is not here.', note: 'n\' is ne with its vowel dropped' },
      { surface: 'Je sais qu\'il est ici.', gloss: 'I know that he is here.', note: 'qu\' is que with its vowel dropped; it is said k' },
      { surface: 'Je vais au marché.', gloss: 'I am going to the market.', note: 'au is à + le' },
      { surface: 'Elle parle du livre.', gloss: 'She talks about the book.', note: 'du is de + le' },
    ],
  },
  {
    id: 'sprint-6-read-now',
    kind: 'passage',
    title: 'Decoding Sprint, stage 6: read now',
    estimatedMinutes: 2,
    body:
      'Read the passage once with the English line underneath, then select any word to see its card. It is six short sentences that use only what stages 1 to 5 taught: silent letters, a few nasal vowels, liaison (un ami, nous avons, les enfants) and elision (l\'école, c\'est), with du and au. It was drafted by an AI model for this sprint and has not been checked by a native speaker, so it may read stiffly: it is a practice text, not a model of good French. When you finish, you have done the sprint. You can now go and read real pages, and come back to these stages whenever a spelling puzzles you.',
    passage: FR_PASSAGE,
  },
];

export const FR_TUTORIAL: Tutorial = orientation({
  languageId: 'fr',
  languageName: 'French',
  practice: { instruction: 'Select the word that means book.', sentence: 'Elle lit un livre.', target: 'livre' },
  cardFeatureNote: 'A French card shows the gender (Masc, Fem) and number (Sing, Plur) of a noun or adjective, and the person, number, tense and mood of a verb form, where the analyser knows them. A contraction such as au or du is shown as its two parts (à + le, de + le), and an elided word such as l\' as its own card.',
  thin: [
    'Its word list holds about 3,400 lemmas, plus the dictionary; a word outside both gets a marked guess or nothing.',
    'Many French forms are written alike (parle, parles, parlent; a and à; la as article and pronoun) and its rules for choosing from the sentence are shallow, so a form often keeps several readings.',
    'The pronunciation notes and the liaison rules are drafted by an AI model, are not checked by a native speaker, and describe the common pronunciation of France; Québec, Belgium, Switzerland and Africa differ. Liaison is described, not heard.',
    'It has no recordings.',
  ],
  sound: { id: 'sound-and-audio', body: soundBody('French', '; the pack’s notes describe the common pronunciation of France, and a French voice from Québec or Belgium may differ') },
  languageSteps: FR_TUTORIAL_STEPS_OWN,
  notice: 'This orientation was drafted by an AI model and has not been checked by a native speaker of French. It covers how to select a word, what the card shows, and the optional six-stage French Decoding Sprint (a few real expressions, the vowel spellings, the silent letters, liaison, elision and contraction, and a short passage). You can skip it and come back to it at any time, and start reading real pages at once.',
});

export const FR_TUTORIAL_STEPS: TutorialStep[] = FR_TUTORIAL.steps;

type LetterRow = readonly [glyph: string, back: string];

/**
 * The cards of GoReview's permanent Alphabet deck for French, in the style of the Spanish rows of
 * packages/goreview/app/alphabetLetters.ts: [what the card shows, what its back says]. The back gives the letter's French name
 * and its usual sound by an English word where one is close. WRITTEN BY HAND by an AI model; not checked by a native speaker.
 * The sounds are approximations for an English speaker and describe the common pronunciation of France; a pattern is "usually".
 */
export const FR_ALPHABET_ROWS: ReadonlyArray<LetterRow> = [
  ['A a', 'a (ah): a as in father, short'], ['B b', 'bé (bay): b'], ['C c', 'cé (say): k before a, o, u; s before e, i, y'], ['D d', 'dé (day): d'],
  ['E e', 'e (uh): a weak uh, or e as in bed before two consonants; usually silent at the end of a word'], ['F f', 'effe (eff): f'],
  ['G g', 'gé (zhay): g as in go before a, o, u; zh (the s of measure) before e, i, y'], ['H h', 'hache (ash): silent'], ['I i', 'i (ee): ee as in see'],
  ['J j', 'ji (zhee): zh, the s of measure'], ['K k', 'ka (kah): k (in borrowed words)'], ['L l', 'elle (el): l'], ['M m', 'emme (em): m'], ['N n', 'enne (en): n'],
  ['O o', 'o (oh): o as in more; closer to go at the end of a syllable'], ['P p', 'pé (pay): p'], ['Q q', 'qu (kü): k (written qu)'],
  ['R r', 'erre (air): made at the back of the throat, not the English r'], ['S s', 'esse (ess): s; z between two vowels'], ['T t', 'té (tay): t'],
  ['U u', 'u (ü): ee said with rounded lips, like German ü'], ['V v', 'vé (vay): v'], ['W w', 'double vé (doo-bluh-vay): v or w (in borrowed words)'],
  ['X x', 'ixe (eeks): ks; gz in ex- before a vowel; usually silent at the end'], ['Y y', 'i grec (ee-grek): ee; y as in yes before a vowel'], ['Z z', 'zède (zed): z'],
  ['é', 'e accent aigu: ay (short, pure), as in été'], ['è', 'e accent grave: e as in bed, as in mère'], ['ê', 'e accent circonflexe: e as in bed, as in fête'],
  ['ë', 'e tréma: the e is said on its own, as in Noël'], ['à', 'a accent grave: a as in father; it tells à from a'], ['â', 'a accent circonflexe: a; some speakers say it deeper'],
  ['î', 'i accent circonflexe: ee as in see'], ['ï', 'i tréma: the i is said on its own, as in naïf'], ['ô', 'o accent circonflexe: o as in go'],
  ['ù', 'u accent grave: only in où; said oo as in où'], ['û', 'u accent circonflexe: ee with rounded lips, as in sûr'], ['ü', 'u tréma: the u is said on its own, as in Saül'],
  ['ç', 'c cédille: s (before a, o, u), as in garçon'], ['œ', 'e dans l\'o: like the u in fur without the r, as in cœur'], ['æ', 'e dans l\'a: ay or e, in a few words only'],
  ['ou', 'oo as in food (vous); a quick w before a vowel (oui)'], ['oi', 'wa (moi, trois)'], ['au', 'o as in go, short and pure (au, chaud)'], ['eau', 'o as in go (eau, beau)'],
  ['ai', 'e as in bed (mais, lait)'], ['ei', 'e as in bed (neige, seize)'], ['eu', 'like the u in fur without the r, lips rounded (peu, deux)'],
  ['œu', 'the same sound as eu (cœur, sœur)'], ['an / en', 'nasal a, through the nose; the n is not said (dans, enfant)'], ['on', 'nasal o, through the nose (bon, pont)'],
  ['in / ain / ein', 'nasal e, through the nose (vin, pain, plein)'], ['un', 'nasal u (un, brun); for many speakers in France the same as in'],
  ['n or m before a vowel', 'the vowel is not nasal and the n or m is said (bonne, année)'], ['ui', 'wee, a quick rounded w then ee (nuit, lui)'],
  ['gn', 'ny as in canyon (montagne)'], ['ch', 'sh (chat); k in words from Greek (chaos, orchestre)'], ['ph', 'f (photo)'], ['th', 't (thé)'], ['qu', 'k; the u is silent (que, qui)'],
  ['ill', 'ee-y after a consonant (fille); y after a vowel (travail); ville and mille say the l'], ['ge / gi', 'zh: the e or i makes the g soft (manger, gîte)'],
  ['gu', 'g as in go before e or i; the u is silent (guerre, guide)'], ['tion', 'syon (nation); after s it stays t (question)'],
  ['final -e', 'usually silent, but it makes the consonant before it heard (petit, petite)'], ['final -er, -ez', 'ay, short; the r and z are silent (parler, chez)'],
  ['final d, p, s, t, x, z', 'usually silent (grand, trop, les, petit, deux, nez); sud, cap, bus and sept are said'], ['final c, r, f, l', 'usually said (avec, pour, chef, sel); blanc and clef are silent'],
  ['-ent', 'silent on a verb (ils parlent); nasal a in a noun or adverb (moment, souvent)'],
];
