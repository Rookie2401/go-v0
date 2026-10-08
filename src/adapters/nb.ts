/**
 * Norwegian Bokmål adapter, `nb` (the written standard of 2005; the course's target). The engine is shared with Nynorsk
 * (norwegian/engine.ts); the lexicon, paradigms, compounds, particle verbs, constructions, older spelling, concept families,
 * production checks and the East-Norwegian reference pronunciation are under norwegian/. Every lexicon row is MACHINE-DRAFTED
 * and has not been checked by a native speaker or against Norsk ordbank. Speech is never labelled "Bokmål": there is no
 * official spoken standard.
 */
import type { LanguageAdapter } from '../core';
import { makeNorwegianAdapter, noNumberToWords } from './norwegian/engine';

export const nbAdapter: LanguageAdapter = makeNorwegianAdapter('nb');
export const nbNumberToWords = noNumberToWords;
