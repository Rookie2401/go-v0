/**
 * The Arabic pack (`pack:ar`), experimental (docs/arabic/PLAN.md, 2026-11-25).
 *
 * One language, two learning varieties: Modern Standard Arabic (the default) and Classical Arabic (the Quran and the classical literature),
 * read with the SAME dictionary; the spoken dialects are recognised and flagged, never analysed. The analyser `src/adapters/ar.ts` reads
 * a printed word that usually carries no short vowels and writes its attached words onto it: it cuts the attached words, compares the
 * vowels the page does print, and credits a lexeme only where the word, the reviewed list of ambiguous spellings or the sentence decide.
 * Every open-class reading is Wiktionary's (via kaikki.org); the dictionary is `public/dict/ar`, the form index `public/lexicon/ar/standard`.
 *
 * It is EXPERIMENTAL and says so: everything linguistic in it is machine-drafted and no native speaker or Arabist has checked any of it.
 *
 * The version is written here as a constant, not imported, so that listing the packs does not pull the Arabic word lists into an
 * application bundle; test/language-packs/registry.test.ts compares the constant with the adapter. The grammar tables are a generated copy
 * (ar-grammar.ts, from scripts/ar-pack-grammar.mts) for the same reason.
 */
import type { PackManifest, ValidationCase } from '../manifest';
import { AR_GRAMMAR_CONSTRUCTIONS, AR_GRAMMAR_FEATURES } from './ar-grammar';
import { experimentalManifest } from './experimental';

/** Adapter version (checked against src/adapters/ar.ts by test/language-packs/registry.test.ts). */
export const AR_VERSION = '1';
/**
 * The orientation (tutorial/ar.ts), by its reference and length. Constants, not an import: the manifest is listed by the extension's
 * background worker, which has no use for the tutorial's text; test/language-packs/tutorial-orientations.test.ts compares them with AR_TUTORIAL.
 */
export const AR_TUTORIAL_REF = 'tutorial/ar';
export const AR_TUTORIAL_MINUTES = 21;
/** The shipped dictionary (public/dict/ar/manifest.json): checked by installPack against the files on the device. Built 2026-11-25 from the extract of 2026-09-22. */
export const AR_DICTIONARY = { id: 'kaikki-ar@2026-09-22', entries: 33142, frequency: false } as const;

/**
 * Real selections the pack must read as stated, each exactly as adapter-ar@1 reads it with its COMPILED CORE alone (the closed classes and
 * the commonest words; the full index is an asset a host loads in shards), copied from `scripts/ar-validation-probe.mts`, never written by hand.
 * A case says what the analyser gives, including what it leaves open ('conflicted': another reading is as likely, and the card shows both)
 * and what it does not know. Most are printed WITHOUT vowels, as Arabic is.
 */
const WROTE = 'كَتَبَ الْوَلَدُ الدَّرْسَ.';
const WENT = 'ذَهَبَ الطَّالِبُ إِلَى الْمَدْرَسَةِ.';
const SAID = 'قال الرجل في البيت.';
const THIS = 'هذا كتاب جديد على الطاولة.';
const KNOWS = 'هو لا يعرف أين ذهبت أمي مع أخيها.';
const ILL = 'لم يذهب إلى المدرسة لأنه مريض.';
const WAS = 'كان الرجل في الغرفة مع ابنه.';
// 2026-11-25 (deck gate, src/adapters/arabic/deck.ts): a reading the deck must not drill is marked requires-review on the candidate and `statusOf` reads that mark,
// so a case whose word the gate holds back (core alone: no shard loaded, or a leading meaning nobody has reviewed) expects `requires-review`.
export const AR_VALIDATION: ValidationCase[] = [
  // the orientation's practice lookup (tutorial/ar.ts): a vowelled perfect verb of form I, the lemma is its own citation form
  { id: 'v-kataba', surface: 'كَتَبَ', sentence: WROTE, expect: { lemma: 'كَتَبَ', pos: 'VERB', features: { Voice: 'Act', Aspect: 'Perf', Person: '3', Gender: 'Masc', Number: 'Sing', VerbForm: 'Fin', Form: 'I' }, status: 'requires-review' } },
  { id: 'v-dhahaba', surface: 'ذَهَبَ', sentence: WENT, expect: { lemma: 'ذَهَبَ', pos: 'VERB', features: { Aspect: 'Perf', Person: '3', Number: 'Sing', Form: 'I' }, status: 'requires-review' } },
  { id: 'v-ila', surface: 'إِلَى', sentence: WENT, expect: { lemma: 'إِلَى', pos: 'ADP', status: 'requires-review' } },
  // printed without vowels: the verb of the sentence is قَالَ (he said)
  { id: 'v-qala', surface: 'قال', sentence: SAID, expect: { lemma: 'قَالَ', pos: 'VERB', features: { Aspect: 'Perf', Person: '3', Gender: 'Masc', Number: 'Sing' }, status: 'requires-review' } },
  // رَجُل (man) and رِجْل (foot) are written alike: both stay, the card shows both
  { id: 'v-rajul', surface: 'الرجل', sentence: SAID, expect: { lemma: 'رَجُل', pos: 'NOUN', features: { Definite: 'Def', Number: 'Sing', Gender: 'Masc' }, status: 'requires-review' } },
  { id: 'v-fi', surface: 'في', sentence: SAID, expect: { lemma: 'فِي', pos: 'ADP', status: 'provisional' } },
  { id: 'v-bayt', surface: 'البيت', sentence: SAID, expect: { lemma: 'بَيْت', pos: 'NOUN', features: { Definite: 'Def', Number: 'Sing', Gender: 'Masc' }, status: 'requires-review' } },
  // a demonstrative and an adjective the core states alone; a noun that is also a proper name with the article (كِتَاب or الْكِتَاب) is only provisional
  { id: 'v-hadha', surface: 'هذا', sentence: THIS, expect: { lemma: 'هٰذَا', pos: 'PRON', features: { Gender: 'Masc', Number: 'Sing' }, status: 'requires-review' } },
  { id: 'v-kitab', surface: 'كتاب', sentence: THIS, expect: { lemma: 'كِتَاب', pos: 'NOUN', features: { Number: 'Sing', Gender: 'Masc' }, status: 'requires-review' } },
  { id: 'v-jadid', surface: 'جديد', sentence: THIS, expect: { lemma: 'جَدِيد', pos: 'ADJ', features: { Gender: 'Masc', Number: 'Sing' }, status: 'requires-review' } },
  { id: 'v-ala', surface: 'على', sentence: THIS, expect: { lemma: 'عَلَى', pos: 'ADP', status: 'requires-review' } },
  // a negative particle the core states alone, an adverb, and a verb written without its vowels that stays open (يَعْرِفُ is indicative, subjunctive or jussive by its last vowel)
  { id: 'v-la', surface: 'لا', sentence: KNOWS, expect: { lemma: 'لَا', pos: 'PART', status: 'high-confidence' } },
  { id: 'v-ayna', surface: 'أين', sentence: KNOWS, expect: { lemma: 'أَيْنَ', pos: 'ADV', status: 'requires-review' } },
  { id: 'v-yarif', surface: 'يعرف', sentence: KNOWS, expect: { lemma: 'عَرَفَ', pos: 'VERB', features: { Aspect: 'Imp', Person: '3', Gender: 'Masc', Number: 'Sing', Form: 'I' }, status: 'requires-review' } },
  { id: 'v-mariid', surface: 'مريض', sentence: ILL, expect: { lemma: 'مَرِيض', pos: 'ADJ', features: { Gender: 'Masc' }, status: 'requires-review' } },
  { id: 'v-kana', surface: 'كان', sentence: WAS, expect: { lemma: 'كَانَ', pos: 'VERB', features: { Aspect: 'Perf', Person: '3', Gender: 'Masc', Number: 'Sing' }, status: 'requires-review' } },
  // the core's limit, stated: a real word outside it has no reading until its shard has loaded
  { id: 'v-core-limit', surface: 'الْوَلَدُ', sentence: WROTE, expect: { readings: 'none' } },
  { id: 'v-core-limit-bare', surface: 'المدرسة', sentence: ILL, expect: { readings: 'none' } },
  { id: 'v-unknown', surface: 'Xyzqwk', sentence: 'Xyzqwk', expect: { readings: 'none' } },
];

export function arabicManifest(): PackManifest {
  return experimentalManifest({
    languageId: 'ar', version: AR_VERSION, varietyId: 'ar-msa', scriptId: 'Arab', name: 'Arabic', nativeName: 'العربية', direction: 'rtl',
    varieties: [
      { varietyId: 'ar-msa', label: 'Modern Standard Arabic (the default target)', analysed: true, note: 'The written Arabic of today: news, books, formal speech.' },
      { varietyId: 'ar-cla', label: 'Classical Arabic', analysed: true, note: 'The same analysis and the same dictionary as Modern Standard Arabic, with Quranic spelling understood (the dagger alif, the lengthening madda, the open tanwīn). The source marks only a few hundred words as old: there is no classical lexicon behind this variety.' },
      { varietyId: 'arz', label: 'Egyptian Arabic', analysed: false, note: 'Recognised on evidence and kept apart; never read as Standard Arabic.' },
      { varietyId: 'apc', label: 'Levantine Arabic', analysed: false, note: 'Recognised on evidence and kept apart; never read as Standard Arabic.' },
      { varietyId: 'afb', label: 'Gulf Arabic', analysed: false, note: 'Recognised on evidence and kept apart; never read as Standard Arabic.' },
      { varietyId: 'acm', label: 'Iraqi Arabic', analysed: false, note: 'Recognised on evidence and kept apart; never read as Standard Arabic.' },
      { varietyId: 'ary', label: 'Moroccan (Maghrebi) Arabic', analysed: false, note: 'Recognised on evidence and kept apart; never read as Standard Arabic.' },
      { varietyId: 'apd', label: 'Sudanese Arabic', analysed: false, note: 'Recognised on evidence and kept apart; never read as Standard Arabic.' },
    ],
    dictionary: AR_DICTIONARY,
    adapterSummary: 'every open-class reading is Wiktionary’s (the conjugation and declension tables and form-of pages of its Arabic entries, via kaikki.org): the dictionary word with its vowels, the case, number, gender, person, tense, mood and voice of the form, the verb form (I to X) and the root where the entry names one. A written word is cut into its attached words (the conjunctions و and ف, the prepositions ب ل ك, the article ال, the future س and the pronoun endings) by rule; the vowels the page prints are compared with each candidate, and which word a bare spelling stands for is decided by a reviewed list of the commonest ambiguous spellings, structural rules and the sentence, otherwise it is left undecided and every reading is shown. A compact core of the commonest words is compiled in; the full index is a sharded asset a host loads for the words it is about to read. Grammar patterns (the construct phrase, agreement, كَانَ and إِنَّ and their sisters, the negations), fixed phrases that are dictionary headwords, a transliteration and pronunciation notes written from the vowels of a reading, never invented for a word read without them.',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions', 'pronunciation-notes', 'production-checks'],
    features: AR_GRAMMAR_FEATURES,
    constructions: AR_GRAMMAR_CONSTRUCTIONS,
    voices: ['ar-SA-ZariyahNeural', 'ar-SA-HamedNeural'],
    segmentation: {
      method: 'adapter',
      notes: 'The adapter’s own scanner: Arabic is written right to left with spaces between words, and a written word keeps its attached words (و ف ب ل ك ال and the pronoun endings) and its vowel marks; the printed word is never changed.',
    },
    validation: AR_VALIDATION,
    pronunciationNotes: true,
    tutorial: { ref: AR_TUTORIAL_REF, estimatedMinutes: AR_TUTORIAL_MINUTES },
    thin: [
      'lemmatization is seed-only in the compiled analyser: it holds a compact core of the commonest words and the closed classes; the rest of the index loads in shards, and until a word’s shard has loaded a word outside the core gets a reading guessed from its pattern (marked as a guess) or none;',
      'every open-class reading is an external source’s (Wiktionary), and nothing has been reviewed by a native speaker or an Arabist;',
      'Arabic print leaves the short vowels out, so about half of all running words are spelled like another word: the pack decides a word only where the page’s vowels, a reviewed list of frequent spellings, a structural rule or the sentence decide it, and otherwise shows every reading and credits no word;',
      'the accuracy figures (docs/arabic/EVAL.md) were measured on a development set annotated by the machine that built the analyser, not on a treebank annotated by people, and the Quran, fully vowelled, is the easy case; they are not a claim about unvowelled news prose;',
      'Classical Arabic uses the same dictionary as Modern Standard Arabic: there is no classical lexicon;',
      'the spoken dialects, and the other languages written in the Arabic script (Persian, Urdu, Pashto, Kurdish, Uyghur), are not analysed: a sentence recognised as one of them is flagged and credits nothing;',
      'vowels are never added to the page: a reading shows the vowels the dictionary gives its form, and a case ending the page does not print is inferred only where a rule is certain, and marked as inferred;',
      'a synthetic Modern Standard voice is not a Classical recitation and may leave out or change vowels the page printed; there is no recording.',
    ],
    extraProvenance: [
      'Sources and licences: the Arabic entries, conjugation and declension tables and form-of pages of Wiktionary via kaikki.org (CC BY-SA 4.0; extract last modified 2026-09-22) for every reading, gloss and root; the hermitdave/FrequencyWords Arabic list (CC BY-SA 4.0), used only for the ORDER of readings and never as evidence that a spelling is right. The Quranic Arabic Corpus morphology is not shipped and was read only for local measurement; CAMeL Tools data, the Universal Dependencies Arabic PADT treebank and Lane’s Lexicon are not used. The grammar explanations, the transliteration and the pronunciation notes are AI-drafted for this pack and unreviewed.',
      'The Arabic script is shared by other languages: a page is read as Arabic only when it says so, the learner chooses Arabic for it, or its text shows it (no letter used only by Persian, Urdu, Pashto, Kurdish or Uyghur, and the Arabic word list recognises it).',
    ],
  });
}
