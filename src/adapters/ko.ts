// PLACEHOLDER written by package R1: package S replaces this whole file with the real adapter.
/**
 * Korean adapter, `ko`: a stand-in so the shared language lists compile. It tokenises and segments with the real Hangul text layer
 * and offers, for every word token, ONE unconfirmed reading (the token's key as its own lemma, low confidence, no meaning, no
 * grammar). It invents nothing: no part of speech, no gloss, no features.
 */
import type { AdapterSupport, AnalyzedToken, LanguageAdapter, RawToken } from '../core';
import { KO_ANALYZER, KO_ANALYZER_VERSION } from './korean/version';
import { koKey } from './korean/hangul';
import { koSearchNormalize, koSegmentSentences, koTokenize } from './korean/text';
import { speechNormalizeGeneric } from './shared';

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable',
  sentenceSegmentation: 'limited',
  lemmatization: 'none',
  morphology: 'none',
  phraseDetection: 'none',
  productionChecks: 'none',
  limitations: ['The Korean analyser is not installed yet: a word is read as written, with no dictionary form, meaning or grammar.'],
};

export const koAdapter: LanguageAdapter = {
  lang: 'ko',
  name: 'Korean',
  script: 'Hang',
  version: KO_ANALYZER_VERSION,
  support: SUPPORT,

  segmentSentences: koSegmentSentences,
  tokenize: koTokenize,
  normalize: koKey,
  searchNormalize: koSearchNormalize,

  analyze: (tokens: RawToken[]): AnalyzedToken[] => tokens.map((token) => ({
    token,
    analyzer: KO_ANALYZER,
    candidates: token.isWord ? [{ lemma: token.normalized, morph: {}, confidence: 0.3, unconfirmed: true }] : [],
  })),
  detectPhrases: () => [],
  detectPatterns: () => [],
  pronunciation: () => ({}),
  // the shared steps only (NFC, verse markers and superscript numbers out, whitespace); digits are left as they are (no number words yet)
  speechNormalize: (displayText) => speechNormalizeGeneric(displayText, { tool: 'speech-ko@1', numberToWords: () => null }),
  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, lineHeight: 1.7 },
  checkProduction: () => [],
  relate: (a, b) => (koKey(a) === koKey(b) ? 'same' : 'none'),
};
