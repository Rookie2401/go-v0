/**
 * The Korean pack (`pack:ko`), experimental (docs/korean/PLAN.md, 2026-11-25).
 *
 * Korean goes through the same shared interfaces as every other language: the analyser `src/adapters/ko.ts` (a stem lexicon plus rules: Hangul
 * arithmetic, candidate stems, particle and ending chains, irregular conjugation by the lexicon's own class, sentence-level ordering,
 * constructions, shallow syntax, pronunciation by rule), the Wiktionary-derived dictionary `public/dict/ko`, the orientation `tutorial/ko`,
 * the Alphabet Sprint of Hangul (`alphabet-sprint/profiles/ko`) and GoListen's Korean registry. Nothing Korean lives in the Repository or in
 * GoReview: the pack gives the words their identities, and the learner's knowledge stays where every language's does.
 *
 * It is EXPERIMENTAL and says so: everything linguistic in it is machine-drafted, and no native speaker or Korean linguist has reviewed any of it.
 *
 * The version comes from the real adapter and is written here as a constant, not imported, so that listing the packs does not pull the Korean
 * lexicon into an application bundle (test/language-packs/registry.test.ts compares the constant with the adapter).
 */
import { KO_GRAMMAR_CONSTRUCTIONS, KO_GRAMMAR_FEATURES } from './ko-grammar';
import { KO_TUTORIAL } from '../tutorial/ko';
import type { PackManifest, ValidationCase } from '../manifest';
import { experimentalManifest } from './experimental';

/** Adapter version (checked against src/adapters/korean/version.ts by test/language-packs/registry.test.ts). */
export const KO_VERSION = '1';

/**
 * The dictionary this pack declares (public/dict/ko/manifest.json is the source of truth: test/language-packs/ko-pack.test.ts compares the two
 * when the built dictionary is on disk, so a rebuild that changes either must change both). `entries` is that manifest's figure, the same
 * definition the other packs use: dictionary entries after merging, with the numbered-homonym aliases and this product's supplement rows.
 */
export const KO_DICTIONARY = { id: 'kaikki-ko@2026-10-30', entries: 58537, frequency: false };

/**
 * Real selections the pack must read as stated. Each sentence is ordinary correct Korean; the first six are the owner's examples (brief XXI).
 * An expectation is what a learner's card must say, kept to the lemma, the part of speech and the features PLAN.md states for that form. A word
 * whose lemma is a homonym set of the lexicon (듣다, 눈) is stated by its class and features, never by a lemma the registry might number.
 * NOT run against the analyser by this file's author (the analyser was still being written): the installer runs them, and a case that fails
 * is a finding about the analyser or about this case, to be settled by reading the card.
 */
const STUDENTS = '학생들이 학교에서 공부했습니다.';
const ATE = '저는 밥을 먹었습니다.';
const READ = '선생님이 책을 읽으셨습니다.';
export const KO_VALIDATION: ValidationCase[] = [
  { id: 'v-haksaengdeuri', surface: '학생들이', sentence: STUDENTS, expect: { lemma: '학생', pos: 'NOUN', features: { Number: 'Plur', Case: 'Nom' } } },
  { id: 'v-hakgyoeseo', surface: '학교에서', sentence: STUDENTS, expect: { lemma: '학교', pos: 'NOUN' } },
  { id: 'v-gongbuhaetseumnida', surface: '공부했습니다', sentence: STUDENTS, expect: { lemma: '공부하다', pos: 'VERB', features: { Tense: 'Past', SpeechLevel: 'Hasipsio' } } },
  { id: 'v-meogeotseumnida', surface: '먹었습니다', sentence: ATE, expect: { lemma: '먹다', pos: 'VERB', features: { Tense: 'Past', SpeechLevel: 'Hasipsio' } } },
  { id: 'v-ilgeusyeotseumnida', surface: '읽으셨습니다', sentence: READ, expect: { lemma: '읽다', pos: 'VERB', features: { Honorific: 'Subj', Tense: 'Past', SpeechLevel: 'Hasipsio' } } },
  { id: 'v-haksaengeun', surface: '학생은', sentence: '학생은 책을 읽어요.', expect: { lemma: '학생', pos: 'NOUN', features: { Topic: 'Yes' } } },
  { id: 'v-chingue-geman', surface: '친구에게만', sentence: '학교에서 친구에게만 말했어요.', expect: { lemma: '친구', pos: 'NOUN' } },
  // irregular conjugations, each read through the lexicon's own class for the stem (a regular look-alike, 좋다, is read as regular)
  { id: 'v-deureoyo', surface: '들어요', sentence: '음악을 들어요.', expect: { pos: 'VERB', features: { Irregular: 'D' } } },
  { id: 'v-chuwoyo', surface: '추워요', sentence: '날씨가 추워요.', expect: { lemma: '춥다', pos: 'ADJ', features: { VerbType: 'Descriptive', Irregular: 'B' } } },
  { id: 'v-mollayo', surface: '몰라요', sentence: '저는 길을 몰라요.', expect: { lemma: '모르다', pos: 'VERB', features: { Irregular: 'Reu' } } },
  { id: 'v-hayayo', surface: '하얘요', sentence: '옷이 하얘요.', expect: { lemma: '하얗다', pos: 'ADJ', features: { Irregular: 'H' } } },
  { id: 'v-dwaeyo', surface: '돼요', sentence: '저는 의사가 돼요.', expect: { pos: 'VERB', features: { Contracted: 'Yes' } } },
  { id: 'v-johseumnida', surface: '좋습니다', sentence: '이 책은 좋습니다.', expect: { lemma: '좋다', pos: 'ADJ', features: { SpeechLevel: 'Hasipsio' } } },
  { id: 'v-gongbuhaesseoyo', surface: '공부했어요', sentence: '어제 공부했어요.', expect: { lemma: '공부하다', pos: 'VERB', features: { Tense: 'Past', SpeechLevel: 'Haeyo' } } },
  // constructions are read word by word: the pieces of 먹고 싶어요, 갈 수 있어요 and 가지 않았어요 each carry what the construction needs
  { id: 'v-meokgo', surface: '먹고', sentence: '밥을 먹고 싶어요.', expect: { lemma: '먹다', pos: 'VERB', features: { VerbForm: 'Conn' } } },
  { id: 'v-gal', surface: '갈', sentence: '내일 갈 수 있어요.', expect: { lemma: '가다', pos: 'VERB', features: { VerbForm: 'Adn' } } },
  { id: 'v-gaji', surface: '가지', sentence: '어제 가지 않았어요.', expect: { lemma: '가다', pos: 'VERB' } },
  // the copula is part of the same written unit as its noun
  { id: 'v-haksaengimnida', surface: '학생입니다', sentence: '저는 학생입니다.', expect: { lemma: '학생', pos: 'NOUN' } },
  { id: 'v-isseoyo', surface: '있어요', sentence: '방에 책이 있어요.', expect: { lemma: '있다' } },
];

export function koreanManifest(): PackManifest {
  return experimentalManifest({
    languageId: 'ko', version: KO_VERSION, varietyId: 'ko-KR', scriptId: 'Hang', name: 'Korean', nativeName: '한국어',
    varieties: [
      { varietyId: 'ko-KR', label: 'Modern Standard Korean (the Seoul standard: the default)', analysed: true, note: 'Historical Korean, North Korean orthography and the dialects are not analysed; they would be further varieties of this one language, never a separate one.' },
    ],
    dictionary: KO_DICTIONARY,
    adapterSummary: 'a stem lexicon cut from the Wiktionary Korean entries (every headword with its class, the conjugation class its own table gives, its first gloss and its Hanja; a compiled core of the commonest words and the closed classes, and the rest a sharded asset a host loads for the words it is about to read) and rules written for this product: Hangul arithmetic, candidate stems for a word the lexicon holds, a closed table of particles and endings read as a chain, the contractions and the irregular alternations undone by the lexicon’s class, homonyms kept apart and an undecided one named as such, sentence rules that reorder readings, about thirty grammar constructions, shallow syntax, and pronunciation and Revised Romanization of the standard pronunciation by rule.',
    capabilities: ['tokenization', 'sentence-segmentation', 'lemma', 'morphology', 'phrases', 'constructions', 'pronunciation-notes'],
    features: KO_GRAMMAR_FEATURES,
    constructions: KO_GRAMMAR_CONSTRUCTIONS,
    voices: ['ko-KR-SunHiNeural', 'ko-KR-InJoonNeural'],
    segmentation: {
      method: 'adapter',
      notes: 'The adapter’s own scanner: a token is one piece of an 어절 (a run of Hangul syllables and Hanja); digits and Latin letters are tokens of their own, and a particle after one of them is read as a particle; invisible joiners inside a word do not split it; every token slices the page’s text exactly, and a normalised key (NFC, the text itself never changed) is what the lexicon is asked. A morpheme boundary inside a syllable is never cut: the parts overlap on that syllable.',
    },
    validation: KO_VALIDATION,
    pronunciationNotes: true,
    tutorial: { ref: KO_TUTORIAL.ref, estimatedMinutes: KO_TUTORIAL.estimatedMinutes },
    thin: [
      'Korean is read by rules written for this product over a Wiktionary stem lexicon, not by a statistical analyser; the compiled core holds only the commonest words and the closed classes, and a stem the lexicon does not hold gets a reading marked unconfirmed that explains its particles and endings and offers the stem as written, with no meaning;',
      'there is no curated frequency list: the order of readings and the choice of the compiled core come from the lemma counts of one treebank (UD Korean-Kaist, train split), which is news and literary prose;',
      'homonyms are numbered from the source (눈¹, 눈²) and for 769 of the 2,496 sets of spelled-alike words a decision was written for this pack by a language model, which no person has checked: a set with no decision is kept open, and a word the sentence cannot decide is shown as undecided, with every candidate named, instead of being credited to one;',
      'proper names are the weakest part: about 44 % of them are covered; numerals are thin;',
      'an irregular verb is recognised as irregular only where the source has a conjugation table for it; a stem with no table is read in every class its shape allows, and none is presented as certain;',
      'there is no audio of its own: a Korean device voice, if the browser has one, is synthetic practice only; pronunciation help is written, from rules and from the dictionary’s own respelling where it has one;',
      'no Bible text is bundled with the pack; Scripture is met on pages and in other apps, and the literary and archaic endings of Korean Bible translations are named as such and given no conversational reading;',
      'a compound the lexicon does not list is shown as built from its parts and marked unconfirmed (예산안 as 예산 + 안), a root such as 복잡 is never a word alone, and numerals are composed (사만 is 40,000);',
      'On a treebank of 1990s written prose (UD Korean-Kaist, the held-out test part, run once, on a build five rounds of fixes older than this one) the first reading named the right dictionary word for 92 % of words, and for 87 % of written forms the word counts had never met; on this pack’s own table of the commonest words in short sentences, 82 of 2,343 first readings (3.5 %) are still wrong or left undecided, and each is listed in the pack’s records; speech, web text and Bible prose are not measured and may score lower, and no Korean speaker has reviewed the pack.',
      'nothing has been reviewed by a native speaker, a Korean teacher or a linguist.',
    ],
    extraProvenance: [
      'Sources and licences: the Korean entries of Wiktionary via kaikki.org (CC BY-SA 4.0; extract last modified 2026-10-30) for the dictionary and the stem lexicon; the Universal Dependencies Korean-Kaist treebank, train split (CC BY-SA 4.0) for COUNTS only, which order readings and choose the compiled core. The analyser’s particle and ending tables, its rules, the grammar explanations, the orientation and the Alphabet Sprint of Hangul are machine-drafted for this pack, and no native speaker has reviewed any of them.',
      'Hanja on a page are matched only to dictionary headwords that state that Hanja spelling: nothing is converted and none is invented.',
      'Romanization is Revised Romanization (2000), of the standard pronunciation: it is a supplementary aid, never an identity of a word, and is shown only where the existing preference shows transliterations.',
    ],
  });
}
