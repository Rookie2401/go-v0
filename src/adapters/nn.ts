/**
 * Norwegian Nynorsk adapter, `nn` (the written standard of 2012), read receptively in the Norway course: a smaller
 * machine-drafted lexicon than Bokmål, the same engine (norwegian/engine.ts). Nynorsk words are never credited to Bokmål mastery:
 * the language code is its own and so is every item id; the nb ↔ nn concept families are information, not credit.
 */
import type { LanguageAdapter } from '../core';
import { makeNorwegianAdapter, noNumberToWords } from './norwegian/engine';

export const nnAdapter: LanguageAdapter = makeNorwegianAdapter('nn');
export const nnNumberToWords = noNumberToWords;
