/**
 * German adapter (course target: Standard German of Germany, de-DE). NFC + lower-case identity (whole words:
 * compounds keep their own form identity; `Lebensversicherung` is one token with parts).
 *
 * Layers, in the order a token meets them (docs/PLAN11.md, docs/GERMAN_COURSE.md section 3):
 *   lexicon rows (german/lexicon.ts: nouns with gender / genitive / plural, verbs with principal parts and separable
 *   prefix, adjectives, the closed classes with every form) → the word-form engine (german/morphology.ts: every
 *   context-free reading of a written word with all its case / gender / number cells) → older spelling related to
 *   today's (german/historical.ts) → the sentence layer (german/sentence.ts: agreement in the noun phrase, what a
 *   preposition governs, capital letters, separated verbs put together, compounds taken apart, readings ordered by
 *   their neighbours) → phrase units and constructions (german/phrases.ts, german/constructions.ts) and checks on the
 *   learner's own German (german/production.ts).
 * Confident: words the lexicon holds and their inflected forms, the closed classes, a noun phrase's agreement, a
 * separated verb whose joined form the lexicon lists. Uncertain, and said so: a reading for a word outside the
 * lexicon (`unconfirmed`, 0.6 at most, no gloss), a compound taken apart (0.55), an older spelling, anything the
 * neighbours do not decide (a union such as Case "Nom,Acc", never a guess). There is no parser.
 * The data is machine-drafted and has not been checked by a native speaker.
 */
import type {
  AdapterSupport, AnalysisSourceInfo, AnalyzedToken, LanguageAdapter, PronunciationSupport, RawToken,
} from '../core';
import { makeWordTokenizer, matchPhraseRules, nfc, speechNormalizeGeneric } from './shared';
import { deLexiconStats, deLexiconView } from './german/lexicon';
import { describeGermanMorph } from './german/morphology';
import { analyzeGermanSentence, refineGermanSentence, relateGerman } from './german/sentence';
import { DE_ANALYZER, DE_ANALYZER_VERSION, DE_SOURCE_IDS, capitalise } from './german/context';
import { baseReadings } from './german/context-base';
import { DE_VARIETIES } from './german/varieties';
import { GERMAN_PHRASE_RULES, detectGermanConstructions, segmentGermanSentences } from './german/constructions';
import { checkGermanProduction } from './german/production';
import { deMorphFromTags, deVarietiesFromTags } from './german/tags';
import { LISTED_GROUPS } from './german/historical';

const LANG = 'de' as const;
const VERSION = DE_ANALYZER_VERSION;
const ANALYZER = DE_ANALYZER;

export { DE_SOURCE_IDS };

const SOURCES: Record<string, AnalysisSourceInfo> = {
  [DE_SOURCE_IDS.hand]: { id: DE_SOURCE_IDS.hand, label: 'Course word list', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [DE_SOURCE_IDS.phrases]: { id: DE_SOURCE_IDS.phrases, label: 'Course phrase list', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [DE_SOURCE_IDS.constructions]: { id: DE_SOURCE_IDS.constructions, label: 'Course grammar patterns', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [DE_SOURCE_IDS.rules]: { id: DE_SOURCE_IDS.rules, label: 'German word-form and sentence rules', origin: 'rule', reviewStatus: 'machine-drafted', version: VERSION },
};

const normalize = (s: string) => nfc(s).toLocaleLowerCase('de');

/**
 * What the checks on the learner's own German see: a lower-case word the list knows only as a noun (gott, zeitung) and has no
 * other confirmed reading for is shown as the noun the learner meant, so that the capital-letter check can say so. The analysis
 * itself never gives a lower-case word a noun reading.
 */
function productionView(tokens: RawToken[], analyses: AnalyzedToken[]): AnalyzedToken[] {
  return analyses.map((a, i) => {
    const t = tokens[i];
    if (!t.isWord || !/^\p{Ll}/u.test(t.surface) || a.candidates.some((c) => !c.unconfirmed)) return a;
    const nouns = baseReadings(capitalise(t.surface), deLexiconView).filter((r) => r.c.pos === 'NOUN' && !r.c.unconfirmed);
    return nouns.length ? { ...a, candidates: nouns.map((r) => r.c) } : a;
  });
}

/** Modern spelling → the older spellings the list pairs with it (Tal → Thal, dass → daß), built once. */
let OLDER: Map<string, string[]> | undefined;
function olderHeadwords(lemma: string): string[] {
  if (!OLDER) {
    OLDER = new Map();
    for (const g of LISTED_GROUPS) for (const [old, modern] of g.pairs) OLDER.set(modern, [...(OLDER.get(modern) ?? []), old]);
  }
  return OLDER.get(lemma) ?? [];
}

const LEMMAS = deLexiconStats.nouns + deLexiconStats.verbs + deLexiconStats.adjectives + deLexiconStats.plainWords;

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable', // Intl.Segmenter('de'); whole words (compounds stay one token)
  sentenceSegmentation: 'limited', // terminators, ordinal dot (3. Mai), a list of abbreviations; an unlisted abbreviation followed by a capital can split a sentence
  lemmatization: 'seed-only', // a machine-drafted word list of about 2,900 entries and the closed classes; any other word gets an inferred (unconfirmed) reading or none
  morphology: 'limited', // every reading of a form with its case / gender / number cells; agreement narrows them inside the noun phrase; not measured on running prose
  phraseDetection: 'limited',
  productionChecks: 'limited',
  limitations: [
    `Lemmatization is seed-only: the word list is a machine-drafted seed of about ${LEMMAS.toLocaleString('en')} entries (nouns, verbs, adjectives, closed classes) that no native speaker has checked; a word outside it gets a reading the rules only infer (marked unconfirmed, 0.6 at most, no gloss) or none.`,
    'There is no parser. The sentence layer reads the neighbouring words (the noun phrase, the preposition in front of it, the end of the clause, the subject pronoun); what they do not decide stays a union (Case "Nom,Acc"), never a guess: in "Die Frau sieht die Tochter" both nouns stay nominative-or-accusative.',
    'A separated verb (steht … auf) is put together only when the prefix stands at the end of its clause and the joined verb is in the word list; a stranded prefix of a verb the list does not hold is offered as an unconfirmed guess behind the ordinary reading. Prefixes such as um, über, durch split only for verbs the list marks as separable.',
    'Compounds are taken apart only into words the word list knows, with the linking element named; the reading is marked unconfirmed (0.55) and has no gloss. A compound the list holds keeps its own lemma and gloss with its parts beside it.',
    'Older spelling (daß, muß, thun, Thal, gieng) is related to today\'s word without changing the text, and only when the modern spelling is a word the list knows; vocabulary that is merely old (ward, Weib) is not a spelling variant.',
    'Verb forms are decided by a subject pronoun, a clause that ends in its verb, a modal or an auxiliary; a verb form no neighbour decides keeps every reading (Mood "Ind,Sub", an infinitive that may be finite).',
    'Production checks are rules for the commonest errors (capital letters, article against noun gender, the case after a preposition, verb position, haben against sein, verb ending against the subject, older spelling): they fire only on their own unambiguous shape and say nothing when a fact is missing.',
  ],
};

export const deAdapter: LanguageAdapter = {
  lang: LANG,
  name: 'German',
  script: 'Latn',
  version: VERSION,
  support: SUPPORT,
  sources: SOURCES,
  varieties: DE_VARIETIES,

  segmentSentences: segmentGermanSentences,
  tokenize: makeWordTokenizer({ locale: 'de', normalize }),
  normalize,
  /** Keeps umlauts (ü ≠ u): they distinguish words. */
  searchNormalize: (q) => normalize(q).trim(),

  analyze: (tokens: RawToken[]): AnalyzedToken[] => {
    const cands = analyzeGermanSentence(tokens, deLexiconView);
    return tokens.map((t, i) => ({ token: t, candidates: cands[i], analyzer: ANALYZER }));
  },

  /**
   * The same ordering as `analyze`, after the importer put a dictionary's readings on some tokens. A token of this
   * adapter starts again from its context-free readings; any other token brings its readings as they are, and its
   * neighbours read them like ours. Only order, a lowered confidence and `notes.context` can change; a token whose
   * analyzer is not in `analyzers` is left exactly alone.
   */
  refine: (tokens, analyzed, analyzers, given): AnalyzedToken[] => refineGermanSentence(tokens, analyzed, analyzers, deLexiconView, given),

  detectPhrases: (tokens, analyses) => matchPhraseRules(tokens, analyses, GERMAN_PHRASE_RULES, normalize),

  detectPatterns: (tokens, analyses) => detectGermanConstructions(tokens, analyses),

  pronunciation(token): PronunciationSupport {
    const s = token.normalized;
    const notes: string[] = [];
    if (/ch/.test(s)) notes.push('ch: after a, o, u, au it is a back "ach" sound; after other vowels and consonants a front "ich" sound.');
    if (/sch/.test(s)) notes.push('sch is like English sh.');
    if (/^(sp|st)/.test(s)) notes.push('At the start of a word, sp/st are pronounced shp/sht.');
    if (/[äöü]/.test(s)) notes.push('ä, ö, ü are distinct vowels (umlauts); they change the word.');
    if (/ß/.test(s)) notes.push('ß is a sharp s (ss).');
    if (/(?<!e)i?e(?!i)/.test(s) && /ie/.test(s)) notes.push('ie is a long "ee".');
    if (/ei/.test(s)) notes.push('ei sounds like English "eye".');
    if (/w/.test(s)) notes.push('w is pronounced like English v; v is usually f.');
    if (/z/.test(s)) notes.push('z is pronounced ts.');
    return { notes };
  },

  speechNormalize: (text) =>
    speechNormalizeGeneric(text, {
      tool: `speech-${LANG}@1`,
      numberToWords: deNumberToWords,
      percentWord: 'Prozent',
      skipOrdinalDot: true,
      abbreviations: [
        { pattern: /\bz\.\s?B\./gu, replacement: 'zum Beispiel', label: 'z. B.' },
        { pattern: /\bd\.\s?h\./gu, replacement: 'das heißt', label: 'd. h.' },
        { pattern: /\busw\./gu, replacement: 'und so weiter', label: 'usw.' },
        { pattern: /\bbzw\./gu, replacement: 'beziehungsweise', label: 'bzw.' },
        { pattern: /\bca\./gu, replacement: 'circa', label: 'ca.' },
        { pattern: /\bDr\./gu, replacement: 'Doktor', label: 'Dr.' },
        { pattern: /\bNr\./gu, replacement: 'Nummer', label: 'Nr.' },
      ],
    }),

  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.7 },

  checkProduction: (tokens, analyses, sentence) => checkGermanProduction(tokens, productionView(tokens, analyses), sentence, deLexiconView),

  relate: (a, b) => relateGerman(a, b, deLexiconView),

  /**
   * Other headwords a dictionary may file this lemma under: an older spelling the list pairs with it (Tal → Thal), then the
   * ß / ss variant (daß ⇄ dass, Strasse ⇄ Straße). Asked for only when the lemma has no entry of its own; the reading keeps its lemma.
   */
  lemmaVariants: (lemma): string[] => {
    const out = [...olderHeadwords(lemma)];
    const alt = lemma.includes('ß') ? lemma.replace(/ß/g, 'ss') : lemma.replace(/ss/g, 'ß');
    if (alt !== lemma) out.push(alt);
    return [...new Set(out)].filter((v) => v !== lemma);
  },

  morphFromTags: deMorphFromTags,
  varietiesFromTags: deVarietiesFromTags,
  describeMorph: (morph, pos) => describeGermanMorph(morph, pos),
};

// ── numbers 0–999 999 ──
const U = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const T: Record<number, string> = { 2: 'zwanzig', 3: 'dreißig', 4: 'vierzig', 5: 'fünfzig', 6: 'sechzig', 7: 'siebzig', 8: 'achtzig', 9: 'neunzig' };

function below100(n: number): string {
  if (n < 20) return U[n];
  const u = n % 10;
  const t = T[Math.floor(n / 10)];
  return u ? `${u === 1 ? 'ein' : U[u]}und${t}` : t;
}
function below1000(n: number): string {
  if (n < 100) return below100(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${h === 1 ? 'ein' : U[h]}hundert${r ? below100(r) : ''}`;
}

export function deNumberToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999999) return null;
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  const head = `${th === 1 ? 'ein' : below1000(th).replace(/eins$/, 'ein')}tausend`;
  return r ? `${head}${below1000(r)}` : head;
}
