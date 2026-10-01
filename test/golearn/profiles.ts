/** Small hand-made TextProfile fixtures for scoring and ranking tests (the library package builds real ones). */
import type { TextFeatures, TextProfile } from '../../src/core';
import { ids } from '../../src/core';

export const feat = (over: Partial<TextFeatures> = {}): TextFeatures => ({ words: 100, sentences: 10, uniqueForms: 40, meanSentenceWords: 10, ...over });

/**
 * `forms` as [form, count]; lemmas / phrases / patterns as [written key, count] — the helper builds the item ids
 * (lemma `lemma:es:<lemma>:<POS>` takes "hablar:VERB", a phrase takes its normalized words joined with "_").
 */
export function profile(
  textId: string,
  forms: Array<[string, number]>,
  o: { lemmas?: Array<[string, number]>; phrases?: Array<[string, number]>; patterns?: Array<[string, number]>; features?: Partial<TextFeatures>; lang?: 'es' | 'th' } = {},
): TextProfile {
  const lang = o.lang ?? 'es';
  const words = forms.reduce((n, [, c]) => n + c, 0);
  return {
    textId, lang, analyzers: ['adapter-test@1'], words,
    forms,
    lemmas: (o.lemmas ?? []).map(([l, c]) => [`lemma:${lang}:${l}`, c] as [string, number]),
    phrases: (o.phrases ?? []).map(([p, c]) => [ids.phrase(lang, p.split(' ')), c] as [string, number]),
    patterns: (o.patterns ?? []).map(([p, c]) => [ids.pattern(lang, p), c] as [string, number]),
    features: feat({ words, uniqueForms: forms.length, ...o.features }),
  };
}
