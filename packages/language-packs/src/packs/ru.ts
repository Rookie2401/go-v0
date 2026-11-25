import { experimentalManifest } from './experimental';
import { RU_GRAMMAR_CONSTRUCTIONS, RU_GRAMMAR_FEATURES } from './ru-grammar';
import { RU_TUTORIAL } from '../tutorial/ru';
import type { PackManifest, ValidationCase } from '../manifest';

/** Experimental: Russian (Modern Standard Russian). Adapter version 1 (checked against src/adapters/ru.ts by test/language-packs/registry.test.ts). */
export const RU_VERSION = '1';

/**
 * The dictionary this pack declares (public/dict/ru/manifest.json is the source of truth: test/language-packs/russian.test.ts compares the
 * two when the built dictionary is on disk, so a rebuild that changes either must change both).
 */
export const RU_DICTIONARY = { id: 'kaikki-ru@2026-10-30', entries: 436039, frequency: false };

/**
 * Real selections the pack must read as stated, each exactly as adapter-ru@1 reads it with its COMPILED CORE alone (the closed classes,
 * a list of everyday words and the commonest lemmas of running text; the full index is an asset a host loads in shards). Copied from
 * `scripts/ru-validation-probe.mts`, never written by hand: a case says what the analyser gives, including what it leaves open
 * ('conflicted': another reading of the word is as likely, and the card shows both) and what it does not know.
 */
const READ = 'Она прочитала книгу.';
const READS = 'Она читает книгу.';
const HAVE = 'У меня есть два года и пять лет, но нет книги.';
const YEAR = 'В этом году он жил в лесу.';
const BEGAN = 'Они стали читать по-русски.';
const HOUSE = 'Это новый дом.';
const KNOW = 'Я знаю, что он шел домой.';
const SAMOVAR = 'Самовар стоит на столе.';
const NONSENSE = 'Глокая куздра штеко будланула бокра.';
export const RU_VALIDATION: ValidationCase[] = [
  // the owner's example: an inflected noun and a perfective past, each with its dictionary word
  { id: 'v-ona', surface: 'Она', sentence: READ, expect: { lemma: 'она', pos: 'PRON', features: { Case: 'Nom', Gender: 'Fem', Number: 'Sing', Person: '3' }, status: 'high-confidence' } },
  { id: 'v-prochitala', surface: 'прочитала', sentence: READ, expect: { lemma: 'прочитать', pos: 'VERB', features: { Aspect: 'Perf', Tense: 'Past', Gender: 'Fem', Number: 'Sing', VerbForm: 'Fin' }, status: 'high-confidence' } },
  { id: 'v-knigu', surface: 'книгу', sentence: READ, expect: { lemma: 'книга', pos: 'NOUN', features: { Case: 'Acc', Number: 'Sing', Gender: 'Fem', Animacy: 'Inan' }, status: 'high-confidence' } },
  // the practice lookup of the orientation tutorial (tutorial/ru.ts): an imperfective present
  { id: 'v-chitaet', surface: 'читает', sentence: READS, expect: { lemma: 'читать', pos: 'VERB', features: { Aspect: 'Imp', Tense: 'Pres', Person: '3', Number: 'Sing' }, status: 'high-confidence' } },
  // possession, numerals and negation: forms written alike are decided by the word before them (года: genitive singular after два;
  // лет: the suppletive genitive plural of год after пять; книги: genitive singular after нет, not the plural)
  { id: 'v-u', surface: 'У', sentence: HAVE, expect: { lemma: 'у', pos: 'ADP', status: 'high-confidence' } },
  { id: 'v-menya', surface: 'меня', sentence: HAVE, expect: { lemma: 'я', pos: 'PRON', features: { Case: 'Acc,Gen', Person: '1', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-est', surface: 'есть', sentence: HAVE, expect: { lemma: 'быть', pos: 'VERB', features: { Tense: 'Pres', Aspect: 'Imp' }, status: 'high-confidence' } },
  { id: 'v-goda', surface: 'года', sentence: HAVE, expect: { lemma: 'год', pos: 'NOUN', features: { Case: 'Gen', Number: 'Sing', Gender: 'Masc' }, status: 'high-confidence' } },
  { id: 'v-let', surface: 'лет', sentence: HAVE, expect: { lemma: 'год', pos: 'NOUN', features: { Case: 'Gen', Number: 'Plur' }, status: 'high-confidence' } },
  { id: 'v-knigi', surface: 'книги', sentence: HAVE, expect: { lemma: 'книга', pos: 'NOUN', features: { Case: 'Gen', Number: 'Sing' }, status: 'high-confidence' } },
  // нет is a particle, an adverb and an interjection in the dictionary, and nothing here decides: the readings compete and the card shows them
  { id: 'v-net', surface: 'нет', sentence: HAVE, expect: { lemma: 'нет', pos: 'PART', status: 'conflicted' } },
  // a preposition and its case; the second locative (в году́, в лесу́), which only some nouns have
  { id: 'v-etom', surface: 'этом', sentence: YEAR, expect: { lemma: 'этот', pos: 'DET', features: { Case: 'Prep', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-godu', surface: 'году', sentence: YEAR, expect: { lemma: 'год', pos: 'NOUN', features: { Case: 'Loc', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-zhil', surface: 'жил', sentence: YEAR, expect: { lemma: 'жить', pos: 'VERB', features: { Aspect: 'Imp', Tense: 'Past', Gender: 'Masc', Number: 'Sing' }, status: 'high-confidence' } },
  { id: 'v-lesu', surface: 'лесу', sentence: YEAR, expect: { lemma: 'лес', pos: 'NOUN', features: { Case: 'Loc', Number: 'Sing' }, status: 'high-confidence' } },
  // стали is a form of стать and of сталь (steel); the core holds only the verb, so with the core alone it has one reading
  { id: 'v-stali', surface: 'стали', sentence: BEGAN, expect: { lemma: 'стать', pos: 'VERB', features: { Aspect: 'Perf', Tense: 'Past', Number: 'Plur' }, status: 'high-confidence' } },
  { id: 'v-chitat', surface: 'читать', sentence: BEGAN, expect: { lemma: 'читать', pos: 'VERB', features: { Aspect: 'Imp', VerbForm: 'Inf' }, status: 'high-confidence' } },
  { id: 'v-po-russki', surface: 'по-русски', sentence: BEGAN, expect: { lemma: 'по-русски', pos: 'ADV', status: 'high-confidence' } },
  // real ambiguity, kept: это is the pronoun, the determiner этот and a particle; новый is nominative or (inanimate) accusative
  { id: 'v-eto', surface: 'Это', sentence: HOUSE, expect: { lemma: 'это', pos: 'PRON', status: 'conflicted' } },
  { id: 'v-novyj', surface: 'новый', sentence: HOUSE, expect: { lemma: 'новый', pos: 'ADJ', features: { Gender: 'Masc', Number: 'Sing' }, status: 'conflicted' } },
  { id: 'v-dom', surface: 'дом', sentence: HOUSE, expect: { lemma: 'дом', pos: 'NOUN', features: { Case: 'Acc,Nom', Number: 'Sing', Gender: 'Masc' }, status: 'high-confidence' } },
  // что is the conjunction and the pronoun; шел is шёл printed without its dots, read as the past of идти
  { id: 'v-chto', surface: 'что', sentence: KNOW, expect: { lemma: 'что', pos: 'SCONJ', status: 'conflicted' } },
  { id: 'v-shel', surface: 'шел', sentence: KNOW, expect: { lemma: 'идти', pos: 'VERB', features: { Aspect: 'Imp', Tense: 'Past', Gender: 'Masc', Number: 'Sing' }, status: 'high-confidence' } },
  // стоит is a form of стоять (to stand) and of стоить (to cost), written alike: both stay
  { id: 'v-stoit', surface: 'стоит', sentence: SAMOVAR, expect: { lemma: 'стоять', pos: 'VERB', features: { Tense: 'Pres', Person: '3', Number: 'Sing' }, status: 'conflicted' } },
  { id: 'v-stole', surface: 'столе', sentence: SAMOVAR, expect: { lemma: 'стол', pos: 'NOUN', features: { Case: 'Prep', Number: 'Sing' }, status: 'high-confidence' } },
  // the core's limit, stated: a real word outside it has no reading until its shard has loaded
  { id: 'v-core-limit', surface: 'Самовар', sentence: SAMOVAR, expect: { readings: 'none' } },
  // words that do not exist (Shcherba's sentence): a distinctive ending gets a reading marked as a guess, with no dictionary word; the rest get nothing
  { id: 'v-guess', surface: 'Глокая', sentence: NONSENSE, expect: { pos: 'ADJ', features: { Case: 'Nom', Gender: 'Fem', Number: 'Sing' }, status: 'provisional' } },
  { id: 'v-unknown', surface: 'куздра', sentence: NONSENSE, expect: { readings: 'none' } },
];

export function russianManifest(): PackManifest {
  return experimentalManifest({
    languageId: 'ru', version: RU_VERSION, varietyId: 'ru-RU', scriptId: 'Cyrl', name: 'Russian', nativeName: 'Русский',
    varieties: [
      { varietyId: 'ru-RU', label: 'Modern Standard Russian (today’s spelling)', analysed: true, note: 'Pre-1918 spelling (ѣ, і, a final ъ) and Church Slavonic are not analysed; Ukrainian, Belarusian, Bulgarian and Serbian are other languages and are never read as Russian.' },
    ],
    dictionary: RU_DICTIONARY,
    adapterSummary: 'every reading is Wiktionary’s (the inflection tables and form-of pages of its Russian entries, via kaikki.org): the lemma, the case, number, gender, tense and person of the form, a verb’s aspect and the aspect partner its entry names, and the stress. A core of the commonest and most basic words is compiled in; the full index (about 923,000 written forms of 55,000 lexemes) is a sharded asset a host loads for the words it is about to read. A form with several readings keeps them all; the sentence reorders them by local rules (what a preposition governs, agreement, numerals). ё is restored for a text printed without it. Grammar patterns (aspect, verbs of motion, possession, negation, numerals and more), fixed phrases that are dictionary headwords, a transliteration and rule-based pronunciation notes.',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions', 'production-checks'],
    features: RU_GRAMMAR_FEATURES,
    constructions: RU_GRAMMAR_CONSTRUCTIONS,
    voices: ['ru-RU-SvetlanaNeural', 'ru-RU-DmitryNeural'],
    segmentation: { method: 'adapter', notes: 'Intl.Segmenter for Russian; a word keeps its stress mark; a hyphen between two Cyrillic words joins them into one word (кто-то, из-за, по-русски).' },
    validation: RU_VALIDATION,
    pronunciationNotes: true,
    tutorial: { ref: RU_TUTORIAL.ref, estimatedMinutes: RU_TUTORIAL.estimatedMinutes },
    thin: [
      'lemmatization is seed-only in the compiled analyser: it holds a core of about 1,500 lexemes; the rest of the index loads in shards, and until a word’s shard has loaded a word outside the core gets a reading guessed from its ending (marked as a guess, with no meaning) or none;',
      'every reading is an external source’s (Wiktionary), and nothing has been reviewed by a native speaker or a Russianist;',
      'many forms are written alike (книги, стали, все): the pack keeps every reading, orders them by how often each occurs in running text and by a few local sentence rules, and has no parser; a long or inverted sentence is read less well;',
      'measured against human-annotated treebanks it did not learn from (docs/russian/EVAL.md): the first reading has the right dictionary word for about nine words in ten, and proper names are the weakest part (about half have a reading);',
      'two words written alike with different stress (за́мок, замо́к) are one item, shown with both stresses and meanings;',
      'the stress is the dictionary’s; a synthetic voice places it by its own rules, and there is no recording;',
      'pre-1918 spelling, Church Slavonic and the other Cyrillic-script languages are not read.',
    ],
    extraProvenance: [
      'Sources and licences: the Russian entries, inflection tables and form-of pages of Wiktionary via kaikki.org (CC BY-SA 4.0; extract last modified 2026-10-30) for every reading, gloss and stress; the Universal Dependencies Russian-GSD treebank, train split (CC BY-SA 4.0) for COUNTS only, which order the readings of an ambiguous form. The grammar explanations, the verbs-of-motion table, the preposition table and the pronunciation notes are AI-drafted for this pack and unreviewed.',
      'The Cyrillic script is shared: a page is read as Russian only when it says so, the learner chooses Russian for it, or its text shows it (no letter of another Cyrillic alphabet, and the Russian word list recognises it).',
    ],
  });
}
