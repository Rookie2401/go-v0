import { experimentalManifest } from './experimental';
import { HE_TUTORIAL } from '../tutorial/he';
import type { PackManifest, ValidationCase } from '../manifest';

/** Experimental: Hebrew, one language with period varieties. Adapter version 1 (checked against src/adapters/he.ts by test/language-packs/registry.test.ts). */
export const HE_VERSION = '1';

/**
 * Real selections the pack must read as stated, each exactly as adapter-he@1 reads it with its COMPILED CORE alone (the closed classes and
 * the commonest Biblical words; the full indexes are assets a host installs). The sentences are verses of the Miqra according to the Masorah
 * (Genesis 1:1, 1:3, 1:5; Deuteronomy 6:4; Numbers 23:19; Psalm 10:16; Deuteronomy 29:1; Ezekiel 2:1; 1 Chronicles) and one Modern sentence.
 * A reading here is the Open Scriptures morphology's reading of that word; the statuses are what the Repository's rule gives them. The two
 * 'none' cases state the core's limits: a rarer Biblical word and a Modern word have no reading until the full indexes are loaded.
 */
const GEN_1_1 = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃';
const GEN_1_3 = 'וַיֹּ֥אמֶר אֱלֹהִ֖ים יְהִ֣י א֑וֹר וַֽיְהִי־אֽוֹר׃';
const GEN_1_5 = 'וַיְהִי־עֶ֥רֶב וַיְהִי־בֹ֖קֶר י֥וֹם אֶחָֽד׃';
const DEUT_6_4 = 'שְׁמַ֖ע יִשְׂרָאֵ֑ל יְהוָ֥ה אֱלֹהֵ֖ינוּ יְהוָ֥ה ׀ אֶחָֽד׃';
export const HE_VALIDATION: ValidationCase[] = [
  { id: 'v-elohim', surface: 'אֱלֹהִ֑ים', sentence: GEN_1_1, expect: { lemma: 'אֱלֹהִים', pos: 'NOUN', features: { Gender: 'Masc', Number: 'Plur', State: 'Abs' }, status: 'high-confidence' } },
  { id: 'v-et', surface: 'אֵ֥ת', sentence: GEN_1_1, expect: { lemma: 'אֵת', pos: 'PART', features: { PartType: 'Obj' }, status: 'high-confidence' } },
  { id: 'v-hashamayim', surface: 'הַשָּׁמַ֖יִם', sentence: GEN_1_1, expect: { lemma: 'שָׁמַיִם', pos: 'NOUN', features: { Gender: 'Masc', Number: 'Plur', State: 'Abs', Definite: 'Def' }, status: 'high-confidence' } },
  { id: 'v-veet', surface: 'וְאֵ֥ת', sentence: GEN_1_1, expect: { lemma: 'אֵת', pos: 'PART', status: 'high-confidence' } },
  { id: 'v-haaretz', surface: 'הָאָֽרֶץ', sentence: GEN_1_1, expect: { lemma: 'אֶרֶץ', pos: 'NOUN', features: { Number: 'Sing', Definite: 'Def' }, status: 'high-confidence' } },
  { id: 'v-vayomer', surface: 'וַיֹּ֥אמֶר', sentence: GEN_1_3, expect: { lemma: 'אָמַר', pos: 'VERB', features: { Binyan: 'Qal', Conj: 'Wayyiqtol', Person: '3', Gender: 'Masc', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-yehi', surface: 'יְהִ֣י', sentence: GEN_1_3, expect: { lemma: 'הָיָה', pos: 'VERB', features: { Binyan: 'Qal', Conj: 'Juss', Person: '3' }, status: 'high-confidence' } },
  { id: 'v-yom', surface: 'י֥וֹם', sentence: GEN_1_5, expect: { lemma: 'יוֹם', pos: 'NOUN', features: { Gender: 'Masc', Number: 'Sing' }, status: 'conflicted' } },
  { id: 'v-echad', surface: 'אֶחָֽד', sentence: GEN_1_5, expect: { lemma: 'אֶחָד', pos: 'NUM', features: { Gender: 'Masc', Number: 'Sing', NumType: 'Card' }, status: 'high-confidence' } },
  { id: 'v-shema', surface: 'שְׁמַ֖ע', sentence: DEUT_6_4, expect: { lemma: 'שָׁמַע', pos: 'VERB', features: { Binyan: 'Qal', Conj: 'Imp', Person: '2', Gender: 'Masc', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-yisrael', surface: 'יִשְׂרָאֵ֑ל', sentence: DEUT_6_4, expect: { lemma: 'יִשְׂרָאֵל', pos: 'PROPN', status: 'high-confidence' } },
  { id: 'v-elohenu', surface: 'אֱלֹהֵ֖ינוּ', sentence: DEUT_6_4, expect: { lemma: 'אֱלֹהִים', pos: 'NOUN', features: { Number: 'Plur', State: 'Cons' }, status: 'high-confidence' } },
  { id: 'v-lo', surface: 'לֹ֨א', sentence: 'כִּ֤י לֹ֨א אִ֣ישׁ אֵ֔ל', expect: { lemma: 'לֹא', pos: 'PART', features: { Polarity: 'Neg' }, status: 'high-confidence' } },
  { id: 'v-ki', surface: 'כִּ֤י', sentence: 'כִּ֤י לֹ֨א אִ֣ישׁ אֵ֔ל', expect: { lemma: 'כִּי', pos: 'CONJ', status: 'high-confidence' } },
  { id: 'v-vayiqra', surface: 'וַיִּקְרָ֨א', sentence: 'וַיִּקְרָ֨א מֹשֶׁ֜ה אֶל־כָּל־יִשְׂרָאֵ֗ל', expect: { lemma: 'קָרָא', pos: 'VERB', features: { Conj: 'Wayyiqtol', Person: '3', Gender: 'Masc', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-kol', surface: 'כָּל', sentence: 'וַיִּקְרָ֨א מֹשֶׁ֜ה אֶל־כָּל־יִשְׂרָאֵ֗ל', expect: { lemma: 'כֹּל', pos: 'NOUN', features: { State: 'Cons' }, status: 'high-confidence' } },
  { id: 'v-ben', surface: 'בֶּן', sentence: 'בֶּן־אָדָ֣ם', expect: { lemma: 'בֵּן', pos: 'NOUN', features: { State: 'Cons' }, status: 'high-confidence' } },
  { id: 'v-divrei', surface: 'דִּבְרֵ֥י', sentence: 'דִּבְרֵ֥י הַיָּמִ֖ים', expect: { lemma: 'דָּבָר', pos: 'NOUN', features: { Number: 'Plur', State: 'Cons' }, status: 'high-confidence' } },
  // the core's limits, stated: a Biblical word outside the commonest lemmas, and any Modern word, have no reading until the full indexes are installed
  { id: 'v-core-limit-biblical', surface: 'בָּרָ֣א', sentence: GEN_1_1, expect: { readings: 'none' } },
  { id: 'v-core-limit-modern', surface: 'הילדים', sentence: 'הילדים קוראים ספר.', expect: { readings: 'none' } },
];

export function hebrewManifest(): PackManifest {
  return experimentalManifest({
    languageId: 'he', version: HE_VERSION, varietyId: 'he-mod', scriptId: 'Hebr', name: 'Hebrew', nativeName: 'עברית', direction: 'rtl',
    varieties: [
      { varietyId: 'he-mod', label: 'Modern Hebrew (the default target)', analysed: true, note: 'Readings from the Wiktionary (kaikki.org) Hebrew tables — an asset the host installs; not in the compiled core.' },
      { varietyId: 'he-bib', label: 'Biblical Hebrew', analysed: true, note: 'Readings from the Open Scriptures Hebrew Bible morphology of every word of the Tanakh, aligned to the Miqra according to the Masorah; the commonest words are compiled in.' },
      { varietyId: 'he-mish', label: 'Mishnaic (Rabbinic) Hebrew', analysed: false, note: 'Recognised from dictionary labels only.' },
      { varietyId: 'he-med', label: 'Medieval Hebrew', analysed: false, note: 'Recognised from dictionary labels only.' },
      { varietyId: 'arc-bib', label: 'Biblical Aramaic (a heritage language read beside Hebrew)', analysed: true, note: 'The Aramaic chapters of Daniel and Ezra, read with their own morphology and never credited to Hebrew.' },
    ],
    adapterSummary: 'readings of every word of the Tanakh from the Open Scriptures morphology (the commonest words compiled in, the rest an installable asset), Modern Hebrew readings from the Wiktionary inflection tables (an installable asset), prefix peeling by rule, and a sentence layer that decides the PERIOD a text is read in (cantillation → Biblical; else the period most words belong to; a tie → the learner’s target; else Modern).',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology'],
    features: [
      { key: 'Binyan', label: 'Stem (binyan)', values: { Qal: 'Qal (simple)', Nifal: 'Nifʿal (passive / reflexive)', Piel: 'Piʿel (intensive)', Pual: 'Puʿal (passive of Piʿel)', Hifil: 'Hifʿil (causative)', Hofal: 'Hofʿal (passive of Hifʿil)', Hitpael: 'Hitpaʿel (reflexive)' }, explain: 'A Hebrew verb is built on a root of (usually) three consonants poured into one of seven patterns, the binyanim. The pattern carries the voice and the kind of action: Qal is the simple active (כָּתַב “he wrote”), Nifʿal its passive or reflexive, Piʿel intensive or causative, Hifʿil causative, Hitpaʿel reflexive.' },
      { key: 'Conj', label: 'Conjugation', values: { Perf: 'perfect (qatal)', Impf: 'imperfect (yiqtol)', Wayyiqtol: 'wayyiqtol (narrative past)', WeQatal: 'weqatal', Imp: 'imperative', Juss: 'jussive', Coh: 'cohortative', Part: 'participle', PassPart: 'passive participle', InfAbs: 'infinitive absolute', InfCons: 'infinitive construct', Past: 'past (Modern)', Pres: 'present (Modern)', Fut: 'future (Modern)' }, explain: 'Biblical Hebrew marks the verb by aspect and sequence rather than tense: the perfect (suffix forms, קָטַל) for whole or completed action, the imperfect (prefix forms, יִקְטֹל) for incomplete, future or habitual action, and the sequential forms וַיִּקְטֹל (wayyiqtol, the narrative past) and וְקָטַל. Modern Hebrew reads the same shapes as past, present (the participle) and future.' },
      { key: 'State', label: 'State', values: { Abs: 'absolute', Cons: 'construct', Det: 'determined (Aramaic)' }, explain: 'A noun bound to a following noun (“X of Y”) stands in the construct state and often shortens: דְּבַר יְהוָה “the word of the LORD”, דִּבְרֵי הַיָּמִים “the words of the days”. The article goes on the last noun of the chain only.' },
      { key: 'Number', label: 'Number', values: { Sing: 'singular', Plur: 'plural', Dual: 'dual' }, explain: 'Hebrew has a dual beside singular and plural, for things that come in pairs: יָדַיִם “two hands”, שָׁמַיִם “heavens”.' },
      { key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine', 'Fem,Masc': 'masculine or feminine', Com: 'common' }, explain: 'Every noun is masculine or feminine; the verb and the adjective agree with it. A few nouns (אֶרֶץ “land”, דֶּרֶךְ “way”) are used both ways in the Bible.' },
      { key: 'Person', label: 'Person', values: { 1: 'first', 2: 'second', 3: 'third' }, explain: 'The finite verb carries its own subject in its ending or prefix: קָטַלְתִּי “I killed”, יִקְטֹל “he will kill”.' },
      { key: 'Definite', label: 'Definiteness', values: { Def: 'definite (with the article)', Ind: 'indefinite' }, explain: 'The article הַ is written on the front of the noun (הַשָּׁמַיִם “the heavens”); a preposition may swallow it (בַּשָּׁמַיִם “in the heavens”). A proper noun and a construct noun take none.' },
    ],
    constructions: [
      { id: 'attached-prefix', label: 'Attached prefix', explain: 'וְ “and”, בְּ “in”, לְ “to”, כְּ “like”, מִ “from”, הַ “the” and שֶׁ “that” are written as one letter joined to the next word: וְאֵת is וְ + אֵת. The card shows them as parts of the word.' },
      { id: 'construct-chain', label: 'Construct chain', explain: 'Two nouns bound together, the first in the construct state: דִּבְרֵי הַיָּמִים “the words of the days”, בֶּן־אָדָם “son of man”. The article, if any, stands on the last noun.' },
      { id: 'wayyiqtol-narrative', label: 'Wayyiqtol narrative', explain: 'וַ + the imperfect carries a story forward: וַיֹּאמֶר “and he said”, וַיִּקְרָא “and he called”. Biblical narrative is a chain of these; Modern Hebrew tells a story in the past tense instead.' },
    ],
    voices: ['he-IL-HilaNeural', 'he-IL-AvriNeural'],
    segmentation: { method: 'adapter', notes: 'Intl.Segmenter for Hebrew; a pointed, accented word stays one token; the maqaf is its own token, as in the Open Scriptures alignment.' },
    validation: HE_VALIDATION,
    pronunciationNotes: true,
    tutorial: { ref: HE_TUTORIAL.ref, estimatedMinutes: HE_TUTORIAL.estimatedMinutes },
    thin: [
      'only the closed classes and the commonest Biblical words are compiled into the analyser (about two thirds of the Bible’s words); the full Biblical index and the whole Modern index are assets a host installs, and until then a word outside the core has no reading (two validation cases state this);',
      'every reading is an external source’s (Open Scriptures for the Bible, Wiktionary for Modern Hebrew); nothing has been reviewed by a Hebrew scholar or a native speaker;',
      'an unpointed word is matched to pointed Biblical forms through its consonants and says its vowels were inferred; a Modern form the tables do not list has no reading;',
      'there is no parser: the sentence decides only the period it is read in, and a word with several readings in one period keeps them all;',
      'there is no dictionary declared for Hebrew yet (the kaikki Hebrew dictionary is downloaded but not built as dictionary shards), so meanings come from the indexes’ own glosses (BDB / Strong’s for the Bible, Wiktionary’s first gloss for Modern words);',
      'the grammar tables explain Binyan, Conj, State, Number, Gender, Person and Definite; the analyser also writes PronType, PartType, Polarity, NumType, NounType and Poss.',
    ],
    extraProvenance: [
      'Sources and licences: Open Scriptures Hebrew Bible morphology (CC BY 4.0, github.com/openscriptures/morphhb) aligned at the Biblia app’s build to the Miqra according to the Masorah text (CC BY-SA 4.0, via Sefaria); glosses from Brown–Driver–Briggs, Strong’s and the Open Scriptures lexical index (public domain); Modern Hebrew tables from Wiktionary via kaikki.org (CC BY-SA 4.0). Hebrew is ONE language here: Biblical and Modern Hebrew are period varieties of it, item ids are shared, and the period travels on each reading and on the enrolment.',
    ],
  });
}
