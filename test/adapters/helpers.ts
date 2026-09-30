import type { AnalyzedToken, LanguageAdapter, LanguageCode, RawToken } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';

export const registry = createAdapterRegistry();
export const adapter = (lang: LanguageCode): LanguageAdapter => registry.get(lang);

export interface Run { tokens: RawToken[]; analyses: AnalyzedToken[]; text: string }
/** Tokenize + analyze one sentence. */
export function run(lang: LanguageCode, text: string): Run {
  const ad = adapter(lang);
  const tokens = ad.tokenize(text);
  return { tokens, analyses: ad.analyze(tokens), text };
}

export const words = (r: Run) => r.tokens.filter((t) => t.isWord).map((t) => t.surface);
export const indexOf = (r: Run, surface: string, nth = 0): number => {
  let seen = 0;
  for (let i = 0; i < r.tokens.length; i++) if (r.tokens[i].surface === surface && seen++ === nth) return i;
  throw new Error(`no token "${surface}" in "${r.text}"`);
};
export const best = (r: Run, surface: string, nth = 0) => r.analyses[indexOf(r, surface, nth)].candidates[0];
export const phrases = (lang: LanguageCode, text: string) => {
  const r = run(lang, text);
  return adapter(lang).detectPhrases(r.tokens, r.analyses);
};
export const patterns = (lang: LanguageCode, text: string) => {
  const r = run(lang, text);
  return adapter(lang).detectPatterns(r.tokens, r.analyses);
};
export const errors = (lang: LanguageCode, text: string) => {
  const r = run(lang, text);
  return adapter(lang).checkProduction(r.tokens, r.analyses, text);
};
/** Apply an ErrorCandidate suggestion to the sentence. */
export const applySuggestion = (text: string, s: { start: number; end: number; replacement: string }) =>
  text.slice(0, s.start) + s.replacement + text.slice(s.end);
