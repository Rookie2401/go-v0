/**
 * French adapter — PLACEHOLDER WIRING (docs/french/PLAN.md). The modules of src/adapters/french are being written; until the lead
 * wires them in, this file only gives French an identity (normalisation, a plain tokenizer) so that the registries and the dictionary
 * build can be set up. It reads no word and says so.
 */
import type { AdapterSupport, AnalyzedToken, LanguageAdapter } from '../core';
import { tokenizeFrench } from './french/tokenize';
import { segmentFrenchSentences } from './french/sentences';
import { frenchSpeechNormalize } from './french/speech';
import { foldFr, normalizeFr } from './french/orth';

const LANG = 'fr' as const;
const VERSION = '0';
const ANALYZER = `adapter-${LANG}@${VERSION}`;

const SUPPORT: AdapterSupport = {
  tokenization: 'limited', sentenceSegmentation: 'limited', lemmatization: 'none', morphology: 'none', phraseDetection: 'none', productionChecks: 'none',
  limitations: ['The French analyser is not wired in yet: no word is read.'],
};

export const frAdapter: LanguageAdapter = {
  lang: LANG,
  name: 'French',
  script: 'Latn',
  version: VERSION,
  support: SUPPORT,
  segmentSentences: segmentFrenchSentences,
  tokenize: tokenizeFrench,
  normalize: normalizeFr,
  searchNormalize: foldFr,
  analyze: (tokens): AnalyzedToken[] => tokens.map((t) => ({ token: t, candidates: [], analyzer: ANALYZER })),
  detectPhrases: () => [],
  detectPatterns: () => [],
  pronunciation: () => ({}),
  speechNormalize: frenchSpeechNormalize,
  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.7 },
  checkProduction: () => [],
  relate: (a, b) => (normalizeFr(a) === normalizeFr(b) ? 'same' : 'none'),
};
