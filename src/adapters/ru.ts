/**
 * Russian adapter, `ru` (Modern Standard Russian in today's spelling). Design and sources: docs/russian/PLAN.md.
 *
 * Layers, in the order a token meets them:
 *   the form index (russian/index-store.ts): every inflection-table row and form-of page of the Wiktionary Russian entries (via
 *   kaikki.org, CC BY-SA 4.0), with the stress the source marks. A compact CORE is compiled in (russian/generated/core.ts: the closed
 *   classes and the commonest lemmas); the full index is SHARDED and a host loads the shards of the words it is about to read
 *   (russian/shards.ts), as it does for Hebrew and Greek.
 *   → features from the source's own labels (russian/tags.ts), a few closed-class forms the tables lack (russian/closed.ts), a
 *     hyphenated word read through its parts, ё restored for a text printed without it, and, for a word no source knows, a reading
 *     of its ending alone, marked as a guess (russian/analyze.ts, russian/guess.ts)
 *   → the sentence (russian/sentence.ts): what a preposition governs, agreement inside the noun phrase and between subject and verb,
 *     numerals, a few words of several parts of speech; it only REORDERS readings and lowers the ones it sets aside
 *   → grammar patterns (aspect, verbs of motion, possession, negation, numerals …), fixed phrases that are dictionary headwords,
 *     and shallow dependency relations (russian/constructions.ts, phrases.ts, syntax.ts)
 *   → pronunciation notes and a transliteration from the stress the index gives (russian/pronunciation.ts).
 * What is confident: a form the index holds as written. What is uncertain, and said so: a form with several readings (all are kept),
 * a restored ё, a word read through its parts, a guess. What is absent: a parser; a word no source knows gets a guess or nothing.
 * Nothing has been reviewed by a native speaker.
 */
import type { AdapterSupport, AnalysisSourceInfo, AnalyzedToken, LanguageAdapter, PronunciationSupport, RawToken } from '../core';
import { RU_ANALYZER, RU_ANALYZER_VERSION, RU_SOURCE_IDS } from './russian/version';
import { ruKey, ruSearchNormalize, ruSegmentSentences, ruTokenize, stressPositions } from './russian/text';
import { installRussianIndex, lookupRussianForm } from './russian/index-store';
import { RU_CORE } from './russian/generated/core';
import { ruAnalyze, ruRefine } from './russian/sentence';
import { detectRuPatterns } from './russian/constructions';
import { detectRuPhrases } from './russian/phrases';
import { ruSyntax } from './russian/syntax';
import { ruFeaturesFromTableTags, ruMorphFromTags } from './russian/tags';
import { describeRuMorph } from './russian/describe';
import { ruCellsFor } from './russian/paradigm';
import { ruPronunciation } from './russian/pronunciation';
import { ruSpeechNormalize } from './russian/speech';
import { checkRuProduction } from './russian/production';

installRussianIndex(RU_CORE);

export { RU_ANALYZER, RU_ANALYZER_VERSION, RU_SOURCE_IDS };

const SOURCES: Record<string, AnalysisSourceInfo> = {
  [RU_SOURCE_IDS.tables]: { id: RU_SOURCE_IDS.tables, label: 'Wiktionary Russian inflection tables and form-of pages, via kaikki.org', origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY-SA 4.0', version: RU_CORE.built },
  [RU_SOURCE_IDS.closed]: { id: RU_SOURCE_IDS.closed, label: 'Closed-class forms the tables do not list', origin: 'hand', reviewStatus: 'machine-drafted', version: RU_ANALYZER_VERSION },
  [RU_SOURCE_IDS.rules]: { id: RU_SOURCE_IDS.rules, label: 'Russian spelling and word-form rules (hyphenated words, ё, endings)', origin: 'rule', reviewStatus: 'machine-drafted', version: RU_ANALYZER_VERSION },
  [RU_SOURCE_IDS.constructions]: { id: RU_SOURCE_IDS.constructions, label: 'Russian grammar patterns and the verbs-of-motion table', origin: 'hand', reviewStatus: 'machine-drafted', version: RU_ANALYZER_VERSION },
  [RU_SOURCE_IDS.phrases]: { id: RU_SOURCE_IDS.phrases, label: 'Russian fixed phrases (multi-word headwords of the Wiktionary dictionary)', origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY-SA 4.0' },
  [RU_SOURCE_IDS.priors]: { id: RU_SOURCE_IDS.priors, label: 'Lemma counts from the UD Russian-GSD treebank (train split), for the order of readings', origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY-SA 4.0' },
};

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable',
  sentenceSegmentation: 'limited',
  lemmatization: 'seed-only',
  morphology: 'limited',
  phraseDetection: 'limited',
  productionChecks: 'seed-only',
  limitations: [
    `Lemmatization is seed-only in the compiled analyser: it carries a compact core of the Wiktionary form index (${RU_CORE.stats?.lemmas ?? 0} lemmas: the closed classes and the commonest words). The full index is an asset a host loads in shards for the words about to be read; until it has loaded, a word outside the core gets a reading guessed from its ending (marked as a guess, no meaning) or none.`,
    'Every reading is Wiktionary’s (via kaikki.org): the lemma, the form’s labels, the stress, a verb’s aspect and the aspect partner its entry names. Nothing has been reviewed by a native speaker or a Russianist.',
    'Measured with the full index against human-annotated treebanks the analyser did not learn from (docs/russian/EVAL.md, 2026-11-18): the first reading has the right dictionary word for 88.4 % of the words of UD Russian-GSD (test), 89.4 % of Taiga (test) and 90.8 % of PUD, strictly counted; 94.4 % of words have a reading at all, and proper names are the weakest part (about half have one).',
    'Many Russian forms are written alike (книги is genitive singular and nominative or accusative plural; стали is a form of стать and of сталь): every reading is kept and none is presented as certain. The sentence reorders them by local rules (a preposition and its case, agreement, numerals); there is no parser, and a long or inverted sentence is read less well.',
    'Most print writes ё as е. A word written with е is also read as the forms that have ё (все as всё, шел as шёл); such a reading says the ё was restored.',
    'Two words written alike with different stress (за́мок, замо́к) share one item: the card shows both readings; the text alone cannot tell them apart.',
    'Pre-1918 spelling (ѣ, і, a final ъ), Church Slavonic and the other Cyrillic-script languages are not analysed.',
    'Pronunciation: a transliteration and rule-based notes from the stress the index gives; no audio of its own and no full phonetic transcription.',
    'Production checks are a few machine-drafted spelling rules (жи / ши, ча / ща, чу / щу, о / об, в / с / к before мне and мной); an empty result means nothing was found, never that the Russian is right.',
  ],
};

/**
 * What the pronunciation notes are written from: the spelling of the first reading when it states exactly one (so a ё the text
 * left out is back: шел is said as шёл), else the word as written; and that spelling's stressed vowels, when marked.
 */
function spokenForm(token: RawToken, analysis: AnalyzedToken | undefined): { surface: string; stress?: number[] } {
  const s = analysis?.candidates[0]?.notes?.stress;
  if (typeof s !== 'string' || s.includes('/')) return { surface: token.surface };
  const at = stressPositions(s);
  const restored = analysis?.candidates[0]?.notes?.yo === 'restored';
  return { surface: restored ? s : token.surface, ...(at.length ? { stress: at } : {}) };
}

/** The confirmed lemmas a written form is read with. */
function lemmasOf(form: string): Set<string> {
  return new Set(lookupRussianForm(ruKey(form)).map((h) => h.lemmaId));
}

export const ruAdapter: LanguageAdapter = {
  lang: 'ru',
  name: 'Russian',
  script: 'Cyrl',
  version: RU_ANALYZER_VERSION,
  support: SUPPORT,
  sources: SOURCES,

  segmentSentences: ruSegmentSentences,
  tokenize: ruTokenize,
  normalize: ruKey,
  searchNormalize: ruSearchNormalize,

  analyze: (tokens: RawToken[]) => ruAnalyze(tokens),
  /** The same ordering as `analyze` after the importer put a dictionary's readings on some tokens (see sq.ts for the contract). */
  refine: (tokens, analyzed, analyzers, given) => ruRefine(tokens, analyzed, analyzers, given),

  detectPhrases: (tokens, analyses) => detectRuPhrases(tokens, analyses),
  detectPatterns: (tokens, analyses) => detectRuPatterns(tokens, analyses),
  /** Shallow dependency relations from local rules (russian/syntax.ts); not a parser. */
  syntax: (tokens, analyses) => ruSyntax(tokens, analyses),

  pronunciation: (token, analysis): PronunciationSupport => { const f = spokenForm(token, analysis); return ruPronunciation(f.surface, f.stress); },
  speechNormalize: (text, opts) => ruSpeechNormalize(text, opts),

  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: '"PT Serif", "Noto Serif", Georgia, "Times New Roman", serif', lineHeight: 1.7 },

  checkProduction: (tokens, analyses, sentence) => checkRuProduction(tokens, analyses, sentence),

  relate(a, b) {
    if (ruKey(a) === ruKey(b)) return 'same';
    const lb = lemmasOf(b);
    for (const id of lemmasOf(a)) if (lb.has(id)) return 'inflection';
    return 'none';
  },

  morphFromTags: ruMorphFromTags,
  describeMorph: (morph, pos) => describeRuMorph(morph, pos),

  /** The dictionary's table is the paradigm (no cells are generated here); these place its rows and find the selected form's cells in it. */
  featuresFromTableTags: (tags, pos, form) => ruFeaturesFromTableTags(tags, pos, form),
  cellsFor: ruCellsFor,
};
