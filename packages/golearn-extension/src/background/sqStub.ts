/**
 * The worker's Albanian adapter.  The worker resolves and records lexical
 * readings, but never renders a card or runs GoTell/Stage 3-4 operations.
 * Keep those client-only tables out of the worker while retaining the exact
 * tokenizer, analyser, phrase rules, pronunciation notes and morphology
 * descriptions used by repository-linguistics.
 */
import type { AdapterSupport, LanguageAdapter, PronunciationSupport, RawToken, SpeechNormalizationResult } from '../../../../src/core';
import { makeWordTokenizer, matchPhraseRules } from '../../../../src/adapters/shared';
import { SQ_SOURCE_IDS, SQ_VERSION, sqAnalyze } from '../../../../src/adapters/albanian/analyze';
import { describeSqMorph } from '../../../../src/adapters/albanian/describe';
import { SQ_PHRASE_RULES } from '../../../../src/adapters/albanian/phrases';
import { SQ_LETTERS, sqLetters, sqNormalize, sqSearchNormalize } from '../../../../src/adapters/albanian/orthography';
import { segmentSqSentences } from '../../../../src/adapters/albanian/sentences';
import { SQ_LEXEMES } from '../../../../src/adapters/albanian/morphology';
import type { AnalysisSourceInfo } from '../../../../src/core';

const VERSION = SQ_VERSION;
const SOURCES: Readonly<Record<string, AnalysisSourceInfo>> = {
  [SQ_SOURCE_IDS.hand]: { id: SQ_SOURCE_IDS.hand, label: 'Course word list', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [SQ_SOURCE_IDS.rules]: { id: SQ_SOURCE_IDS.rules, label: 'Albanian word-form and sentence rules', origin: 'rule', reviewStatus: 'machine-drafted', version: VERSION },
  [SQ_SOURCE_IDS.phrases]: { id: SQ_SOURCE_IDS.phrases, label: 'Course phrase list', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [SQ_SOURCE_IDS.constructions]: { id: SQ_SOURCE_IDS.constructions, label: 'Course grammar patterns', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
};

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable', sentenceSegmentation: 'limited', lemmatization: 'seed-only', morphology: 'limited',
  phraseDetection: 'limited', productionChecks: 'limited',
  limitations: [
    `Lemmatization is seed-only: the word list is a machine-drafted seed of about ${SQ_LEXEMES.length.toLocaleString('en')} words (nouns, names, verbs, adjectives, adverbs) plus the closed classes, which no native speaker has checked; a word outside it gets a reading the rules only infer from its ending (marked unconfirmed, no gloss) or none.`,
    'The worker uses the Albanian word list and rules for Repository lexical analysis; card-only generation, syntax and production checks run in extension pages.',
  ],
};

const pronunciation = (token: RawToken): PronunciationSupport => {
  const letters = new Set(sqLetters(token.normalized));
  const notes: string[] = [];
  const taught = ['ë', 'ç', 'c', 'dh', 'gj', 'j', 'll', 'nj', 'q', 'rr', 'sh', 'th', 'x', 'xh', 'y', 'zh'];
  for (const l of taught) { const info = SQ_LETTERS.find((x) => x.letter === l); if (letters.has(l) && info) notes.push(`${l}: ${info.hint}.`); }
  return { notes };
};

export const sqAdapter: LanguageAdapter = {
  lang: 'sq', name: 'Albanian', script: 'Latn', version: VERSION, support: SUPPORT, sources: SOURCES,
  segmentSentences: segmentSqSentences,
  tokenize: makeWordTokenizer({ locale: 'sq', normalize: sqNormalize }), normalize: sqNormalize, searchNormalize: sqSearchNormalize,
  analyze: sqAnalyze,
  detectPhrases: (tokens, analyses) => matchPhraseRules(tokens, analyses, SQ_PHRASE_RULES, sqNormalize),
  detectPatterns: () => [], pronunciation,
  speechNormalize: (text): SpeechNormalizationResult => ({ speechText: text, transformations: [], normalizerVersion: 'worker-disabled' }),
  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.7 },
  checkProduction: () => [], relate: (a, b) => sqNormalize(a) === sqNormalize(b) ? 'same' : 'none',
  describeMorph: (morph, pos) => describeSqMorph(morph, pos),
};

