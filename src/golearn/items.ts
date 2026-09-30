/** The learner items one sentence carries: word forms, credited lemmas, phrases and patterns. */
import type { ItemKind, PatternOccurrence, PhraseOccurrence, Sentence, Text } from '../core';
import { AnalysisCache } from './analysis';
import type { Ctx } from './state';

export interface SentenceItems {
  sentence: Sentence;
  text?: Text;
  items: Map<string, ItemKind>;
  /** first occurrence of each phrase in the sentence (for PhraseEncountered) */
  firstPhraseOcc: Map<string, PhraseOccurrence>;
}

/** Undefined when the sentence is unknown. `tokenFilter` restricts the word tokens considered. */
export async function sentenceItems(ctx: Ctx, sentenceId: string, tokenFilter?: Set<string>): Promise<SentenceItems | undefined> {
  const sentence = await ctx.store.sentences.get(sentenceId);
  if (!sentence) return undefined;
  const text = await ctx.store.texts.get(sentence.textId);
  const cache = new AnalysisCache(ctx.store);
  const tokens = (await ctx.store.tokens.where('sentenceId', sentenceId)).sort((x, y) => x.index - y.index)
    .filter((t) => t.isWord && (!tokenFilter || tokenFilter.has(t.id)));
  await cache.prefetch(tokens.map((t) => t.id));

  const items = new Map<string, ItemKind>();
  for (const t of tokens) if (!items.has(t.formId)) items.set(t.formId, 'form');
  for (const t of tokens) {
    const lemmaId = await cache.lemmaIdOf(t.id);
    if (lemmaId && !items.has(lemmaId)) items.set(lemmaId, 'lemma');
  }
  const phraseOccs: PhraseOccurrence[] = (await ctx.store.phraseOccurrences.where('sentenceId', sentenceId)).sort((x, y) => (x.id < y.id ? -1 : 1));
  const patternOccs: PatternOccurrence[] = (await ctx.store.patternOccurrences.where('sentenceId', sentenceId)).sort((x, y) => (x.id < y.id ? -1 : 1));
  const firstPhraseOcc = new Map<string, PhraseOccurrence>();
  for (const o of phraseOccs) {
    if (!items.has(o.phraseId)) items.set(o.phraseId, 'phrase');
    if (!firstPhraseOcc.has(o.phraseId)) firstPhraseOcc.set(o.phraseId, o);
  }
  for (const o of patternOccs) if (!items.has(o.patternId)) items.set(o.patternId, 'pattern');
  return { sentence, text, items, firstPhraseOcc };
}
