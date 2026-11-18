/**
 * The French pack (`pack:fr`), experimental (docs/french/PLAN.md, 2026-11-17).
 *
 * French goes through the same shared interfaces as every other language: the analyser `src/adapters/fr.ts` (a hand word list of about
 * 3,400 lemmas with the closed classes complete, a morphology engine that reads any verb, noun or adjective form by generation — the
 * literary tenses included — context rules, 43 grammar constructions, phrase units, shallow syntax), the Wiktionary-derived dictionary
 * `public/dict/fr`, the orientation `tutorial/fr` whose language steps are the optional Decoding Sprint, and GoListen's French registry.
 * Nothing French lives in the Repository or in GoReview: the pack gives the words their identities, the learner's knowledge stays where
 * every language's does.
 *
 * It is EXPERIMENTAL and says so: everything linguistic in it is machine-drafted and no native speaker has checked any of it.
 *
 * The version and analyser come from the real adapter. They are written here as constants, not imported, so that listing the packs does
 * not pull the French word lists into an application bundle; test/language-packs/registry.test.ts compares the constant with the adapter.
 * The construction texts ARE imported: src/adapters/french/construction-texts.ts is data only (no word list), and the card and this
 * manifest must say the same thing about a construction.
 */
import { FRENCH_CONSTRUCTION_TEXTS } from '../../../../src/adapters/french/construction-texts';
import type { PackManifest, ValidationCase } from '../manifest';
import { experimentalManifest } from './experimental';

/** Adapter version (checked against src/adapters/fr.ts by test/language-packs/registry.test.ts). */
export const FR_VERSION = '1';
/** The shipped dictionary (public/dict/fr/manifest.json): checked by installPack against the files on the device. Built 2026-11-17 from the extract of 2026-10-30. */
/**
 * The orientation (tutorial/fr.ts), by its reference and length. Constants, not an import: the manifest is listed by the extension's background
 * worker, which has no use for the tutorial's text (about 12 KB); test/language-packs/french-tutorial.test.ts compares them with FR_TUTORIAL.
 */
export const FR_TUTORIAL_REF = 'tutorial/fr';
export const FR_TUTORIAL_MINUTES = 21;
export const FR_DICTIONARY = { id: 'kaikki-fr@2026-10-30', entries: 401953, frequency: false } as const;

/**
 * Real selections the pack must read as stated. Every expectation is what the adapter really says (adapter-fr@1), not what a person
 * would hope. Every word is in the hand word list, so that a case reads the same whether or not the larger dictionary-derived lemma
 * list has finished loading. A form the word list states directly and alone (maison, dans, chevaux) is 'high-confidence'; a form the
 * rules generate from a listed lemma (entra, faisons, écrites) is 'provisional' however sure the rule is; a form with two readings
 * that the sentence decides (la: article or pronoun; est: verb or "east") is 'conflicted' or 'provisional' with the right one first.
 */
export const FR_VALIDATION: ValidationCase[] = [
  { id: 'v-lit', surface: 'lit', sentence: 'Elle lit un livre.', expect: { lemma: 'lire', pos: 'VERB', features: { Person: '3', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' } } },
  { id: 'v-livre', surface: 'livre', sentence: 'Elle lit un livre.', expect: { lemma: 'livre', pos: 'NOUN', features: { Gender: 'Masc', Number: 'Sing' } } }, // le livre (book) and la livre (pound) are two readings; the article un puts the masculine first
  { id: 'v-maison', surface: 'maison', sentence: 'Il entra dans la maison.', expect: { lemma: 'maison', pos: 'NOUN', features: { Gender: 'Fem', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-entra', surface: 'entra', sentence: 'Il entra dans la maison.', expect: { lemma: 'entrer', pos: 'VERB', features: { Person: '3', Number: 'Sing', Tense: 'Past', Mood: 'Ind' }, status: 'provisional' } },
  { id: 'v-dans', surface: 'dans', sentence: 'Il entra dans la maison.', expect: { lemma: 'dans', pos: 'ADP', status: 'high-confidence' } },
  { id: 'v-la', surface: 'la', sentence: 'Il entra dans la maison.', expect: { lemma: 'le', pos: 'DET', features: { Gender: 'Fem', Number: 'Sing', Definite: 'Def' } } },
  { id: 'v-faisons', surface: 'faisons', sentence: 'Nous faisons un gâteau.', expect: { lemma: 'faire', pos: 'VERB', features: { Person: '1', Number: 'Plur', Tense: 'Pres', Mood: 'Ind' } } },
  { id: 'v-chevaux', surface: 'chevaux', sentence: 'Les chevaux sont beaux.', expect: { lemma: 'cheval', pos: 'NOUN', features: { Gender: 'Masc', Number: 'Plur' }, status: 'high-confidence' } },
  { id: 'v-sont', surface: 'sont', sentence: 'Les chevaux sont beaux.', expect: { lemma: 'être', pos: 'AUX', features: { Person: '3', Number: 'Plur', Tense: 'Pres', Mood: 'Ind' }, status: 'high-confidence' } },
  { id: 'v-beaux', surface: 'beaux', sentence: 'Les chevaux sont beaux.', expect: { lemma: 'beau', pos: 'ADJ', features: { Gender: 'Masc', Number: 'Plur' }, status: 'high-confidence' } },
  { id: 'v-arrivee', surface: 'arrivée', sentence: 'Elle est arrivée hier.', expect: { lemma: 'arriver', pos: 'VERB', features: { VerbForm: 'Part', Tense: 'Past', Gender: 'Fem', Number: 'Sing' } } },
  { id: 'v-est', surface: 'est', sentence: 'Elle est arrivée hier.', expect: { lemma: 'être', pos: 'AUX', features: { Person: '3', Number: 'Sing', Tense: 'Pres' } } },
  { id: 'v-ecrites', surface: 'écrites', sentence: "Les lettres que j'ai écrites.", expect: { lemma: 'écrire', pos: 'VERB', features: { VerbForm: 'Part', Gender: 'Fem', Number: 'Plur' }, status: 'provisional' } },
  { id: 'v-l-elided', surface: "L'", sentence: "L'homme parle.", expect: { lemma: 'le', pos: 'DET', features: { Definite: 'Def', Number: 'Sing' } } },
  { id: 'v-homme', surface: 'homme', sentence: "L'homme parle.", expect: { lemma: 'homme', pos: 'NOUN', features: { Gender: 'Masc', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-au', surface: 'au', sentence: 'Elle va au marché.', expect: { lemma: 'au', pos: 'ADP', status: 'high-confidence' } },
  { id: 'v-le-pronoun', surface: 'le', sentence: 'Je le vois.', expect: { lemma: 'le', pos: 'PRON', features: { Case: 'Acc' } } },
  { id: 'v-ne', surface: 'ne', sentence: 'Je ne sais pas.', expect: { lemma: 'ne', pos: 'PART', features: { Polarity: 'Neg' }, status: 'high-confidence' } },
  { id: 'v-fut', surface: 'fut', sentence: 'Il fut surpris.', expect: { lemma: 'être', pos: 'AUX', features: { Person: '3', Number: 'Sing', Tense: 'Past', Mood: 'Ind' } } },
  { id: 'v-peut-etre', surface: 'peut-être', sentence: 'Il viendra peut-être demain.', expect: { lemma: 'peut-être', pos: 'ADV', status: 'high-confidence' } },
  { id: 'v-unknown', surface: 'Xyzqwk', sentence: 'Xyzqwk est ici.', expect: { readings: 'none', status: 'provisional' } },
];

export function frenchManifest(): PackManifest {
  return experimentalManifest({
    languageId: 'fr', version: FR_VERSION, varietyId: 'fr-FR', scriptId: 'Latn', name: 'French', nativeName: 'français',
    varieties: [
      { varietyId: 'fr-FR', label: 'France (contemporary standard written French: the default)', analysed: true },
      { varietyId: 'fr-CA', label: 'Canada, Québec (the same analysis; regional words are labelled where the dictionary labels them)', analysed: true },
      { varietyId: 'fr-BE', label: 'Belgium (the same analysis; septante, nonante and other regional words are labelled)', analysed: true },
      { varietyId: 'fr-CH', label: 'Switzerland (the same analysis; septante, huitante, nonante and other regional words are labelled)', analysed: true },
      { varietyId: 'fr-africa', label: 'Francophone Africa (words the dictionary labels as African French are labelled; not analysed as a variety of its own)', analysed: false },
      { varietyId: 'fr-hist', label: 'Older French spelling (j’avois, les enfans: recognised and related to the modern word; Old and Middle French are not analysed)', analysed: false },
    ],
    dictionary: FR_DICTIONARY,
    adapterSummary: 'a hand word list of about 3,400 lemmas with the closed classes complete (elided forms, the contractions with their halves); a morphology engine that reads any verb, noun or adjective form by generating it (every simple tense, the passé simple and the imperfect subjunctive included; the common irregular verbs and their compounds); readings ordered by the neighbouring words through named rules; 43 grammar constructions (compound tenses, participle agreement, negation, the object pronouns, the relative pronouns), about 280 phrase units, shallow syntax, older spellings, written pronunciation notes (liaison, silent letters, h aspiré).',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions', 'pronunciation-notes', 'production-checks'],
    features: [
      {
        key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine' },
        explain: 'Every noun is masculine or feminine, and the article in front and any adjective agree with it: le livre, la maison, la petite maison. The ending helps only sometimes (-tion, -té and -ette are feminine; -age and -ment are usually masculine), so the gender is learned with the noun. A few nouns change meaning with their gender: le livre (book), la livre (pound).',
      },
      {
        key: 'Number', label: 'Number', values: { Sing: 'singular', Plur: 'plural' },
        explain: 'One thing or several. The plural is usually written with -s, sometimes -x (les chevaux, les jeux), and usually not pronounced: the article tells you (le livre, les livres). A noun that already ends in -s, -x or -z does not change (le fils, les fils). On a verb the number is part of the ending.',
      },
      {
        key: 'Tense', label: 'Tense', values: { Pres: 'present', Imp: 'imparfait (was doing, used to do)', Past: 'passé simple on a verb; past on a participle', Fut: 'future' },
        explain: 'When the action happens. The imparfait (il parlait) is the ongoing or repeated past; the passé simple (il parla) is the finished past of written stories, common in novels and replaced in speech by the passé composé (il a parlé); the future (il parlera) looks ahead. On a participle, "past" marks the past participle (parlé) and "present" the present participle (parlant). Read the tense together with the verb form: "Imp" on a Tense is the imparfait, "Imp" on a Mood is a command.',
      },
      {
        key: 'Mood', label: 'Mood', values: { Ind: 'indicative (a statement)', Sub: 'subjunctive (after que: a wish, a doubt, a necessity)', Cnd: 'conditional (would)', Imp: 'imperative (a command)' },
        explain: 'How the speaker presents the action. The indicative states facts. The subjunctive appears after que with verbs of wish, doubt or necessity and after words such as bien que, pour que, avant que: Il faut que tu viennes. Many forms are the same in two moods (je parle is indicative or subjunctive; parle is also a command), so a word on its own can have several readings and the sentence decides.',
      },
      {
        key: 'Person', label: 'Person', values: { '1': 'first (je, nous)', '2': 'second (tu, vous)', '3': 'third (il, elle, on, ils, elles)' },
        explain: 'Who does the action. Unlike Spanish, French keeps the subject pronoun, because several endings sound the same (je parle, tu parles, il parle, ils parlent). Vous is both the plural "you" and the polite singular; on (third person singular) very often means "we" in speech.',
      },
      {
        key: 'VerbForm', label: 'Verb form', values: { Fin: 'finite (has a person)', Inf: 'infinitive', Part: 'participle' },
        explain: 'A finite verb has a person and a tense. The infinitive (parler, finir, prendre) is the dictionary form. The past participle (parlé, fini, pris) builds the compound tenses with avoir or être and can agree like an adjective (elle est arrivée); the present participle (parlant) is used after en: en parlant, "while speaking".',
      },
      {
        key: 'Definite', label: 'Definiteness', values: { Def: 'definite (le, la, les)', Ind: 'indefinite (un, une, des)' },
        explain: 'Le, la, l’ and les are "the"; un, une are "a" and des is its plural ("some"). French uses an article where English often has none: J’aime le café ("I like coffee"). With à and de the definite article contracts: au, aux, du, des.',
      },
      {
        key: 'PronType', label: 'Kind of pronoun or determiner', values: { Art: 'article', Prs: 'personal', Dem: 'demonstrative', Rel: 'relative', Int: 'interrogative', Ind: 'indefinite', Neg: 'negative', Part: 'partitive article' },
        explain: 'What kind of small word this is. The partitive article (du, de la, de l’, des) means "some" of something not counted: du pain, de l’eau. The same written word can be several kinds: que is a relative pronoun (le livre que je lis), a conjunction (je sais que …) and, with ne, "only".',
      },
      {
        key: 'Case', label: 'Role of an object pronoun', values: { Nom: 'subject', Acc: 'direct object', Dat: 'indirect object (to someone)' },
        explain: 'French nouns do not change for their role, but the short pronouns before the verb do: je le vois (him: direct), je lui parle (to him: indirect). Me, te, nous, vous serve for both.',
      },
      {
        key: 'Polarity', label: 'Negation', values: { Neg: 'negative' },
        explain: 'Negation is written in two parts around the verb: ne … pas, ne … jamais, ne … plus, ne … rien. Everyday speech drops ne (je sais pas); writing keeps it. Ne … que is not a negation: it means "only".',
      },
    ],
    constructions: Object.entries(FRENCH_CONSTRUCTION_TEXTS).map(([id, t]) => ({ id, label: t.label, explain: t.explain })),
    voices: ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural', 'fr-CA-SylvieNeural'],
    segmentation: {
      method: 'adapter',
      notes: 'The adapter’s own scanner: an elided word is its own token and keeps its apostrophe (l’ · homme), whatever apostrophe the page uses; a pronoun joined to a verb by a hyphen is its own token (donne · le · moi; a · t · il); a hyphenated compound is one token (peut-être, c’est-à-dire); every token slices the page’s text exactly.',
    },
    validation: FR_VALIDATION,
    pronunciationNotes: true,
    tutorial: { ref: FR_TUTORIAL_REF, estimatedMinutes: FR_TUTORIAL_MINUTES },
    thin: [
      'the hand word list holds about 3,400 lemmas and their glosses; a word outside it is read by the rules and confirmed, where it can be, by the dictionary-derived lemma list and the installed dictionary, and otherwise shown as a rule guess that says so;',
      'a written form that several words share (porte, livre, est, été, son, vis) returns every reading, and the order follows the neighbouring words only where they decide: homographs that meaning alone separates (les vers, les fils) are not decided;',
      'compound tenses, participle agreement, negation, the pronouns and the relatives are recognised as patterns over nearby words, not by a parser: a long or unusual sentence can escape them;',
      'about thirty rare or defective verbs (ouïr, gésir, seoir, faillir, paître and the like) are not conjugated by the engine;',
      'measured on running prose the builders had not looked at (the test part of the Universal Dependencies French GSD treebank, 8,018 words, run once): the first reading has the right lemma for 92 % of words and the right part of speech for 90 %, with the dictionary lemma list loaded (87 % and 87 % with the hand word list alone); mood, tense, person, number and gender agree for 99 % where both state them (docs/french/EVALUATION.md);',
      'pronunciation help is written notes about the spelling; an IPA transcription is shown only when the dictionary supplies one, liaison is described and never heard, and regional pronunciations are not described;',
      'regional words are labelled only where the dictionary labels them, and older spelling is recognised only for words the list knows.',
    ],
    extraProvenance: [
      'The orientation’s language steps are the optional French Decoding Sprint (docs/french/DECODING-SPRINT.md): six short stages on how written French sounds, taught as "usually" with the common exceptions named. It can be skipped; reading real pages needs none of it.',
      'Evaluation data never shipped with the pack: the Universal Dependencies French GSD treebank (CC BY-SA 4.0) and 524 sentences written for the test set (data/benchmarks/fr), every expectation an AI’s judgement checked against the dictionary, none reviewed by a native speaker.',
    ],
  });
}
