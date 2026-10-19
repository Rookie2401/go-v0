import { experimentalManifest } from './experimental';
import { EL_TUTORIAL } from '../tutorial/el';
import type { PackManifest, ValidationCase } from '../manifest';

/** Experimental: Greek, one language with period varieties. Adapter version 1 (checked against src/adapters/el.ts by test/language-packs/registry.test.ts). */
export const EL_VERSION = '1';

/**
 * Real selections the pack must read as stated, each exactly as adapter-el@1 reads it with its COMPILED CORE alone (the closed classes and
 * the commonest New Testament words; the Ancient and Modern tables are assets a host installs). The sentences are verses of the SBL Greek
 * New Testament (John 1:1, 3:16, 14:6; 1 John; Mark 16:6) and one Modern and one Homeric line. A reading is MorphGNT's reading of that
 * word; the statuses are what the Repository's rule gives them. The last two cases state the core's limits.
 */
const JOHN_1_1 = 'Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος.';
const JOHN_3_16 = 'Οὕτως γὰρ ἠγάπησεν ὁ θεὸς τὸν κόσμον, ὥστε τὸν υἱὸν τὸν μονογενῆ ἔδωκεν.';
const JOHN_14_6 = 'Ἐγώ εἰμι ἡ ὁδὸς καὶ ἡ ἀλήθεια καὶ ἡ ζωή.';
export const EL_VALIDATION: ValidationCase[] = [
  { id: 'v-arche', surface: 'ἀρχῇ', sentence: JOHN_1_1, expect: { lemma: 'ἀρχή', pos: 'NOUN', features: { Case: 'Dat', Number: 'Sing', Gender: 'Fem' }, status: 'high-confidence' } },
  { id: 'v-en', surface: 'ἦν', sentence: JOHN_1_1, expect: { lemma: 'εἰμί', pos: 'VERB', features: { Person: '3', Tense: 'Impf', Voice: 'Act', Mood: 'Ind', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-logos', surface: 'λόγος', sentence: JOHN_1_1, expect: { lemma: 'λόγος', pos: 'NOUN', features: { Case: 'Nom', Number: 'Sing', Gender: 'Masc' }, status: 'high-confidence' } },
  { id: 'v-theon', surface: 'θεόν', sentence: JOHN_1_1, expect: { lemma: 'θεός', pos: 'NOUN', features: { Case: 'Acc', Number: 'Sing', Gender: 'Masc' }, status: 'high-confidence' } },
  { id: 'v-ton', surface: 'τὸν', sentence: JOHN_1_1, expect: { lemma: 'ὁ', pos: 'DET', features: { Case: 'Acc', Number: 'Sing', Gender: 'Masc', Definite: 'Def' }, status: 'high-confidence' } },
  { id: 'v-pros', surface: 'πρὸς', sentence: JOHN_1_1, expect: { lemma: 'πρός', pos: 'ADP', status: 'high-confidence' } },
  { id: 'v-en-prep', surface: 'Ἐν', sentence: JOHN_1_1, expect: { lemma: 'ἐν', pos: 'ADP', status: 'high-confidence' } },
  { id: 'v-egapesen', surface: 'ἠγάπησεν', sentence: JOHN_3_16, expect: { lemma: 'ἀγαπάω', pos: 'VERB', features: { Person: '3', Tense: 'Aor', Voice: 'Act', Mood: 'Ind', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-kosmon', surface: 'κόσμον', sentence: JOHN_3_16, expect: { lemma: 'κόσμος', pos: 'NOUN', features: { Case: 'Acc', Number: 'Sing', Gender: 'Masc' }, status: 'high-confidence' } },
  { id: 'v-huion', surface: 'υἱὸν', sentence: JOHN_3_16, expect: { lemma: 'υἱός', pos: 'NOUN', features: { Case: 'Acc', Number: 'Sing', Gender: 'Masc' }, status: 'high-confidence' } },
  { id: 'v-edoken', surface: 'ἔδωκεν', sentence: JOHN_3_16, expect: { lemma: 'δίδωμι', pos: 'VERB', features: { Person: '3', Tense: 'Aor', Voice: 'Act', Mood: 'Ind', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-gar', surface: 'γὰρ', sentence: JOHN_3_16, expect: { lemma: 'γάρ', pos: 'CONJ', status: 'high-confidence' } },
  { id: 'v-eimi', surface: 'εἰμι', sentence: JOHN_14_6, expect: { lemma: 'εἰμί', pos: 'VERB', features: { Person: '1', Tense: 'Pres', Mood: 'Ind', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-hodos', surface: 'ὁδὸς', sentence: JOHN_14_6, expect: { lemma: 'ὁδός', pos: 'NOUN', features: { Case: 'Nom', Number: 'Sing', Gender: 'Fem' }, status: 'high-confidence' } },
  { id: 'v-zoe', surface: 'ζωή', sentence: JOHN_14_6, expect: { lemma: 'ζωή', pos: 'NOUN', features: { Case: 'Nom', Number: 'Sing', Gender: 'Fem' }, status: 'high-confidence' } },
  { id: 'v-ego', surface: 'Ἐγώ', sentence: JOHN_14_6, expect: { lemma: 'ἐγώ', pos: 'PRON', features: { Case: 'Nom', Number: 'Sing', PronType: 'Prs' }, status: 'high-confidence' } },
  { id: 'v-pisteuo', surface: 'Πιστεύω', sentence: 'Πιστεύω εἰς τὸν θεόν.', expect: { lemma: 'πιστεύω', pos: 'VERB', features: { Person: '1', Tense: 'Pres', Voice: 'Act', Mood: 'Ind', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-estin', surface: 'ἔστιν', sentence: 'οὐκ ἔστιν ὧδε', expect: { lemma: 'εἰμί', pos: 'VERB', features: { Person: '3', Tense: 'Pres', Number: 'Sing' }, status: 'high-confidence' } },
  // the core's limits, stated: without the Modern index a Modern form reaches a New Testament form through its bare letters only (είναι “is” →
  // the Koine infinitive εἶναι, accents inferred, provisional); a Homeric word has no reading at all
  { id: 'v-core-limit-modern', surface: 'είναι', sentence: 'Ο λόγος είναι ελεύθερος.', expect: { lemma: 'εἰμί', pos: 'VERB', features: { VerbForm: 'Inf' }, status: 'provisional' } },
  { id: 'v-core-limit-homeric', surface: 'Μῆνιν', sentence: 'Μῆνιν ἄειδε θεὰ', expect: { readings: 'none' } },
];

export function greekManifest(): PackManifest {
  return experimentalManifest({
    languageId: 'el', version: EL_VERSION, varietyId: 'el-mod', scriptId: 'Grek', name: 'Greek', nativeName: 'Ελληνικά',
    varieties: [
      { varietyId: 'el-mod', label: 'Modern Greek (the default target)', analysed: true, note: 'Readings from the Wiktionary (kaikki.org) Modern Greek tables — an asset the host installs; not in the compiled core.' },
      { varietyId: 'el-koi', label: 'Koine Greek', analysed: true, note: 'Readings from MorphGNT over the SBL Greek New Testament; the commonest words are compiled in.' },
      { varietyId: 'el-att', label: 'Attic Greek', analysed: true, note: 'Readings from the Wiktionary Ancient Greek tables (Attic unless the table header says otherwise) — an installable asset.' },
      { varietyId: 'el-hom', label: 'Homeric Greek', analysed: true, note: 'Readings from the Epic tables and forms of the Wiktionary Ancient Greek entries — an installable asset.' },
      { varietyId: 'el-med', label: 'Medieval (Byzantine) Greek', analysed: false, note: 'Recognised from table headers and labels only.' },
      { varietyId: 'el-ion', label: 'Ionic Greek', analysed: false, note: 'Recognised from table headers and labels; shown beside Attic, never a target.' },
      { varietyId: 'el-dor', label: 'Doric Greek', analysed: false, note: 'Recognised from labels only.' },
      { varietyId: 'el-aeo', label: 'Aeolic Greek', analysed: false, note: 'Recognised from labels only.' },
    ],
    adapterSummary: 'MorphGNT’s reading of every word of the New Testament (the commonest words compiled in, the rest an installable asset), Ancient and Modern Greek readings from the Wiktionary inflection tables (installable assets; an Ancient table’s header names its dialect), diacritic-insensitive fallback matching, and a sentence layer that decides the PERIOD a text is read in (polytonic marks → ancient, the words say which stage; monotonic → Modern; a tie → the learner’s target).',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology'],
    features: [
      { key: 'Case', label: 'Case', values: { Nom: 'nominative', Gen: 'genitive', Dat: 'dative', Acc: 'accusative', Voc: 'vocative' }, explain: 'A Greek noun, adjective, article and pronoun change their ending for their role in the sentence: ὁ λόγος is the subject, τὸν λόγον the object, τοῦ λόγου “of the word”, τῷ λόγῳ “to / with the word”. Modern Greek has lost the dative.' },
      { key: 'Number', label: 'Number', values: { Sing: 'singular', Dual: 'dual', Plur: 'plural' }, explain: 'Singular and plural, and in Homer and classical Attic a dual for pairs (τὼ χεῖρε “the two hands”), which Koine and Modern Greek no longer use.' },
      { key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' }, explain: 'Three genders; the article and adjective agree with the noun: ὁ λόγος, ἡ ὁδός, τὸ φῶς.' },
      { key: 'Tense', label: 'Tense / aspect', values: { Pres: 'present', Impf: 'imperfect', Fut: 'future', Aor: 'aorist', Perf: 'perfect', Plup: 'pluperfect', FutPerf: 'future perfect' }, explain: 'The Greek verb marks aspect as much as time: the present stem for ongoing action, the aorist for the action as a whole (ἔδωκεν “he gave”), the perfect for a state resulting from it. In the indicative the imperfect (ἦν “was”) and aorist are the past tenses.' },
      { key: 'Voice', label: 'Voice', values: { Act: 'active', Mid: 'middle', Pass: 'passive', 'Mid,Pass': 'middle or passive' }, explain: 'Active, middle (the subject acts on or for itself) and passive. In many forms middle and passive are one shape, and the card says so.' },
      { key: 'Mood', label: 'Mood', values: { Ind: 'indicative', Sub: 'subjunctive', Opt: 'optative', Imp: 'imperative' }, explain: 'Indicative for statements, subjunctive for purpose and possibility (ἵνα … ἔχῃ), optative for wishes (Attic and Homer; rare in the New Testament), imperative for commands.' },
      { key: 'Person', label: 'Person', values: { 1: 'first', 2: 'second', 3: 'third' }, explain: 'The finite verb carries its subject in its ending: πιστεύω “I believe”, ἔστιν “he / she / it is”.' },
      { key: 'VerbForm', label: 'Verb form', values: { Fin: 'finite', Inf: 'infinitive', Part: 'participle' }, explain: 'Beside the finite forms Greek uses the infinitive (εἶναι “to be”) and participles that decline like adjectives (λέγων “saying”). Modern Greek has lost the infinitive: είναι is now the finite “is / are”.' },
    ],
    constructions: [
      { id: 'article-agreement', label: 'Article agreeing with its noun', explain: 'The article takes the case, number and gender of its noun: ὁ λόγος, τὸν θεόν, τοῦ κόσμου. It can also turn a phrase or participle into a noun (ὁ πιστεύων “the one who believes”).' },
      { id: 'grave-before-word', label: 'Grave accent', explain: 'A grave accent (θεὸς, τὸν) is the acute of a word that is followed by another word in the same phrase; the card reads it as the acute.' },
      { id: 'polytonic-monotonic', label: 'Two spelling systems', explain: 'Ancient and Byzantine Greek (and Modern Greek before 1982) are written polytonic — breathings, three accents, iota subscript; Modern Greek is monotonic, with one acute. The marks tell the card which period a text belongs to.' },
    ],
    voices: ['el-GR-AthinaNeural', 'el-GR-NestorasNeural'],
    segmentation: { method: 'adapter', notes: 'Intl.Segmenter for Greek; an accented word stays one token; an elision mark (δ᾽) and the ano teleia are their own tokens.' },
    validation: EL_VALIDATION,
    pronunciationNotes: true,
    tutorial: { ref: EL_TUTORIAL.ref, estimatedMinutes: EL_TUTORIAL.estimatedMinutes },
    thin: [
      'only the closed classes and the commonest New Testament words are compiled into the analyser (about four fifths of the New Testament’s words); the full Koine index and the whole Ancient and Modern indexes are assets a host installs, and until then a word outside the core has no reading, and a Modern form may reach a Koine form through its bare letters only (two validation cases state this);',
      'every reading is an external source’s (MorphGNT for the New Testament, Wiktionary for the Ancient and Modern tables); nothing has been reviewed by a classicist or a native speaker;',
      'the Perseus Ancient Greek Dependency Treebank is downloaded as the agreement source for Attic and Homeric readings but not yet consulted;',
      'there is no parser: the sentence decides only the period it is read in, and a word with several readings in one period keeps them all;',
      'there is no dictionary declared for Greek yet (the kaikki Greek and Ancient Greek dictionaries are downloaded but not built as dictionary shards), so meanings come from the indexes’ own glosses (Dodson / Abbott-Smith / Strong’s for the New Testament, Wiktionary’s first gloss otherwise);',
      'the grammar tables explain Case, Number, Gender, Tense, Voice, Mood, Person and VerbForm; the analyser also writes Degree, PronType and Definite.',
    ],
    extraProvenance: [
      'Sources and licences: MorphGNT (CC BY-SA 3.0, github.com/morphgnt/sblgnt) over the SBL Greek New Testament (CC BY 4.0, sblgnt.com), via the Biblia app’s data; glosses from the Dodson lexicon, Abbott-Smith (1922) and Strong’s (public domain); Septuagint lemma counts from lxx-morph; Ancient and Modern Greek tables from Wiktionary via kaikki.org (CC BY-SA 4.0). Greek is ONE language here: Homeric, Attic, Koine, Medieval and Modern Greek are period varieties of it, item ids are shared, and the period travels on each reading and on the enrolment.',
    ],
  });
}
