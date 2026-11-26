/**
 * Arabic adapter, `ar`: Modern Standard Arabic, with Classical Arabic as a second learning variety of the same language. Design,
 * sources and the audit that shaped it: docs/arabic/PLAN.md; figures: docs/arabic/INDEX.md and EVAL.md.
 *
 * Arabic is printed without its short vowels and writes conjunctions, prepositions, the article and pronouns ONTO the word, so one
 * printed word is often several words and several possible lexemes at once. Layers, in the order a token meets them:
 *   the text views (arabic/text.ts): the printed word is never changed; a key without marks finds readings, each stored WITH its
 *   vowels, and whatever vowels the page prints are compared with them.
 *   the form index (arabic/index-store.ts): every conjugation and declension row and form page of the Wiktionary Arabic entries (via
 *   kaikki.org, CC BY-SA 4.0), words without their clitics. A compact CORE is compiled in (arabic/generated/core.ts); the full
 *   index is SHARDED and a host loads the shards of the words it is about to read (arabic/shards.ts). The core says which of its
 *   keys it holds only in part, and nothing is credited from those until the shard has arrived.
 *   → one written word (arabic/analyze.ts): every cut into attached words and stem (clitics.ts), the closed classes (closed.ts), the
 *     readings the printed vowels allow, and WHICH LEXEME a bare spelling stands for: a reviewed list of the commonest ambiguous
 *     spellings (identities.json), the preferences it implies (generated/preferences.ts), structural rules, and otherwise nothing:
 *     an undecided word credits no lexeme.
 *   → the sentence (arabic/sentence.ts): what a particle or a preposition governs, the construct phrase, agreement, the verb and
 *     its subject; a dialect sentence and a sentence in another language of the Arabic script are flagged and credit nothing.
 *   → grammar patterns, fixed phrases, shallow relations (constructions.ts, phrases.ts, syntax.ts)
 *   → transliteration and pronunciation notes from the vowels of the reading, never invented for a word read without them
 *     (translit.ts, pronunciation.ts).
 * What is confident: a form whose lexeme is the only one, or which the page's vowels, the reviewed list or the sentence decide.
 * What is uncertain, and said so: a word left undecided (every reading is shown), a restored loose spelling, a guess.
 * Nothing has been reviewed by a native speaker or an Arabist.
 */
import type { AdapterSupport, AnalysisSourceInfo, AnalyzedToken, LanguageAdapter, PronunciationSupport, RawToken, Variety } from '../core';
import { AR_ANALYZER, AR_ANALYZER_VERSION, AR_SOURCE_IDS, AR_VARIETIES } from './arabic/version';
import { arHeadForm, arKey, arSearchNormalize, arSegmentSentences, arTokenize, hasTashkil } from './arabic/text';
import { transliterateArabic } from './arabic/translit';
import { installArabicIndex, lookupArabicForm } from './arabic/index-store';
import { AR_CORE } from './arabic/generated/core';
import { arIdentityCounts } from './arabic/identities';
import { arAnalyze, arRefine } from './arabic/sentence';
import { detectArPatterns } from './arabic/constructions';
import { detectArPhrases } from './arabic/phrases';
import { arSyntax } from './arabic/syntax';
import { arFeaturesFromTableTags, arMorphFromTags } from './arabic/tags';
import { describeArMorph } from './arabic/describe';
import { arCellsFor } from './arabic/paradigm';
import { arPronunciation } from './arabic/pronunciation';
import { AR_MACHINE_DISCLAIMER, AR_TRANSLIT_CONVENTION } from './arabic/translit';
import { arSpeechNormalize } from './arabic/speech';
import { checkArProduction } from './arabic/production';

installArabicIndex(AR_CORE);

export { AR_ANALYZER, AR_ANALYZER_VERSION, AR_SOURCE_IDS, AR_VARIETIES };

const SOURCES: Record<string, AnalysisSourceInfo> = {
  [AR_SOURCE_IDS.tables]: { id: AR_SOURCE_IDS.tables, label: 'Wiktionary Arabic conjugation and declension tables and form pages, via kaikki.org', origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY-SA 4.0', version: AR_CORE.built },
  [AR_SOURCE_IDS.closed]: { id: AR_SOURCE_IDS.closed, label: 'Arabic particles, pronouns and prepositions with attached pronouns, and the reviewed list of main readings', origin: 'hand', reviewStatus: 'machine-drafted', version: AR_ANALYZER_VERSION },
  [AR_SOURCE_IDS.rules]: { id: AR_SOURCE_IDS.rules, label: 'Arabic word rules (attached words cut from a written word, printed vowels compared, a loose spelling restored, a guess from a pattern)', origin: 'rule', reviewStatus: 'machine-drafted', version: AR_ANALYZER_VERSION },
  [AR_SOURCE_IDS.constructions]: { id: AR_SOURCE_IDS.constructions, label: 'Arabic grammar patterns and sentence rules', origin: 'hand', reviewStatus: 'machine-drafted', version: AR_ANALYZER_VERSION },
  [AR_SOURCE_IDS.phrases]: { id: AR_SOURCE_IDS.phrases, label: 'Arabic fixed phrases (multi-word headwords of the Wiktionary dictionary)', origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY-SA 4.0' },
  [AR_SOURCE_IDS.priors]: { id: AR_SOURCE_IDS.priors, label: 'Word frequencies from hermitdave/FrequencyWords (Arabic subtitles), for the order of readings only', origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY-SA 4.0' },
};

/** The two learning varieties (one language, one vocabulary) and the dialects the pack recognises but does not analyse. */
export const AR_VARIETY_INFO: Record<string, Variety> = {
  [AR_VARIETIES.msa]: {
    code: AR_VARIETIES.msa, label: 'Modern Standard Arabic', kind: 'period',
    note: 'The written Arabic of today: news, books, formal speech. The default target; every reading comes from the Wiktionary Arabic entries.',
  },
  [AR_VARIETIES.classical]: {
    code: AR_VARIETIES.classical, label: 'Classical Arabic', kind: 'period',
    note: 'The Arabic of the Quran and the classical literature. Read with the SAME dictionary as Modern Standard Arabic: the source marks only a few hundred words as old, so this is the same analysis with Quranic spelling understood, not a classical lexicon.',
  },
  'ar-dialect': {
    code: 'ar-dialect', label: 'Spoken Arabic (a dialect)', kind: 'regional',
    note: 'Egyptian, Levantine, Gulf, Iraqi, Maghrebi and Sudanese Arabic are not analysed. A sentence recognised as a dialect is flagged and never read as Standard Arabic.',
  },
};

/** The vowels of a romanization, long (ā ī ū) and short (a i u) kept apart: what is left when the consonants and every other mark are taken away. */
const vowelsOf = (roman: string): string => roman.toLowerCase().normalize('NFC').replace(/[^aiuāīū]/g, '');

function headMatchesLemma(lemma: string, head: { vocalized?: string; romanization?: string }, pos?: string): boolean | undefined {
  if (!hasTashkil(lemma)) return undefined;
  if (head.vocalized && hasTashkil(head.vocalized)) return arHeadForm(head.vocalized, pos ?? 'X') === arHeadForm(lemma, pos ?? 'X');
  if (head.romanization) {
    const ours = transliterateArabic(lemma)?.text;
    return ours ? vowelsOf(ours) === vowelsOf(head.romanization) : undefined;
  }
  return undefined;
}

const identities = arIdentityCounts();

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable',
  sentenceSegmentation: 'limited',
  lemmatization: 'seed-only',
  morphology: 'limited',
  phraseDetection: 'limited',
  productionChecks: 'seed-only',
  limitations: [
    `Lemmatization is seed-only in the compiled analyser: it carries a compact core of the Wiktionary form index (${AR_CORE.stats?.lemmas ?? 0} lemmas: the closed classes and the commonest words). The full index is an asset a host loads in shards for the words about to be read; the core marks the spellings it holds only in part (${AR_CORE.partial?.length ?? 0} of them) and credits no word from those until the shard has loaded.`,
    'Every open-class reading is Wiktionary’s (via kaikki.org): the headword with its vowels, the form’s labels, the root where the entry names one. Particles, pronouns, the attached words and the sentence rules are written for this adapter. Nothing has been reviewed by a native speaker or an Arabist.',
    `Arabic print leaves the short vowels out, so about half of all running words are spelled like another word. Which lexeme a bare spelling stands for is decided by a reviewed list of ${identities.reviewed} frequent spellings (${identities.main} with a main reading, ${identities.balanced} deliberately left open), by what that list implies for other forms, by a few structural rules and by the sentence; a word none of them decides is shown with every reading and credits no lexeme. Measured figures are in docs/arabic/EVAL.md; they come from a machine-annotated development set, not from a human gold standard.`,
    'A written word is cut into its attached words (و ف ب ل ك س ال and the pronouns) by rule. The cut is right far more often than not, and a word such as وجد, which is also و + جد, keeps both readings.',
    'One written verb form can be two persons at once (تكتب is “she writes” and “you write”): it is kept as one reading that says both.',
    'Vowels are never added to the page. A reading shows the vowels the dictionary gives its form; case and mood endings that the page does not print are inferred from the sentence only where a rule is certain, and are marked as inferred.',
    'Classical Arabic uses the same dictionary as Modern Standard Arabic; Quranic spelling (the dagger alif, the lengthening madda, the open tanwīn) is understood, but there is no classical lexicon behind the Classical variety.',
    'Spoken dialects (Egyptian, Levantine, Gulf, Iraqi, Maghrebi, Sudanese) and the other languages written in the Arabic script (Persian, Urdu, Pashto, Kurdish, Uyghur) are not analysed. A sentence recognised as one of them is flagged and credits nothing; one that is not recognised may be misread as Standard Arabic.',
    `${AR_TRANSLIT_CONVENTION} A word read without its vowels has no transliteration.`,
    AR_MACHINE_DISCLAIMER,
    'Production checks are a few machine-drafted spelling checks on a closed list of common words; an empty result means nothing was found, never that the Arabic is right.',
  ],
};

/** The vowelled form the pronunciation is written from: the first reading's own vocalization when it states exactly one. */
function spokenForm(token: RawToken, analysis: AnalyzedToken | undefined): string | undefined {
  if (hasTashkil(token.surface)) return token.surface;
  const v = analysis?.candidates[0]?.notes?.vocalized;
  return typeof v === 'string' && v && !v.includes('/') ? v : undefined;
}

/** The lemma ids a written form is read with (whole word only; attached words are the analyser's business). */
function lemmasOf(form: string): Set<string> {
  return new Set(lookupArabicForm(arKey(form)).map((h) => h.lemmaId));
}

export const arAdapter: LanguageAdapter = {
  lang: 'ar',
  name: 'Arabic',
  script: 'Arab',
  version: AR_ANALYZER_VERSION,
  support: SUPPORT,
  sources: SOURCES,
  varieties: AR_VARIETY_INFO,

  segmentSentences: arSegmentSentences,
  tokenize: arTokenize,
  normalize: arKey,
  searchNormalize: arSearchNormalize,

  analyze: (tokens: RawToken[], opts) => arAnalyze(tokens, opts),
  refine: (tokens, analyzed, analyzers, given) => arRefine(tokens, analyzed, analyzers, given),

  detectPhrases: (tokens, analyses) => detectArPhrases(tokens, analyses),
  detectPatterns: (tokens, analyses) => detectArPatterns(tokens, analyses),
  /** Shallow relations from local rules (arabic/syntax.ts); not a parser. */
  syntax: (tokens, analyses) => arSyntax(tokens, analyses),

  pronunciation: (token, analysis): PronunciationSupport => arPronunciation(token.surface, spokenForm(token, analysis)),
  speechNormalize: (text, opts) => arSpeechNormalize(text, opts),

  // a naskh face first: the letter shapes the Alphabet Sprint describes are naskh shapes; room above and below for the vowel marks
  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: '"Noto Naskh Arabic", "Amiri", "Scheherazade New", "Traditional Arabic", "Arabic Typesetting", "Geeza Pro", "Al Bayan", "Times New Roman", serif', lineHeight: 2 },

  checkProduction: (tokens, analyses, sentence) => checkArProduction(tokens, analyses, sentence),

  relate(a, b) {
    if (arKey(a) === arKey(b)) return 'same';
    const lb = lemmasOf(b);
    for (const id of lemmasOf(a)) if (lb.has(id)) return 'inflection';
    return 'none';
  },

  morphFromTags: (tags) => arMorphFromTags(tags),
  describeMorph: (morph, pos) => describeArMorph(morph, pos),

  /** The dictionary's table is the paradigm (no cells are generated here); these place its rows and find the selected form's cells in it. */
  featuresFromTableTags: (tags, pos, form) => arFeaturesFromTableTags(tags, pos, form),
  cellsFor: arCellsFor,

  /** The dictionary is keyed by the unvocalized headword: the vocalized lemma is looked up by its key. */
  lemmaVariants: (lemma) => { const k = arKey(lemma); return k && k !== lemma ? [k] : []; },

  /**
   * Which of the words the dictionary files under one bare key a vocalized lemma is. A full record is compared by its vocalized head
   * (the form the source tags canonical); a level-1 entry has only its romanization (the source's, whose letters differ from ours: ʕ for ʿ),
   * so the VOWELS of the two are compared (ʕilm: i; ʕalam: a-a; ʕalima: a-i-a). A lemma printed without vowels cannot be told apart: undefined.
   */
  headMatches: (lemma, head, pos) => headMatchesLemma(lemma, head, pos),
  leadWithReadingGloss: true,
};
