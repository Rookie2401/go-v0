/**
 * Guided-help prediction engine (docs/GOTELL-GUIDED.md, Package A). Everything the editor and the evidence path need is
 * re-exported from here, types included.
 */
import type { AppStore, GoLearn, LanguageAdapter, LanguageCode, LearnerItemState, Token } from '../../core';
import type { KnownWord, WordIndex } from './types';

export * from './types';
export * from './predict';
export * from './parenthetical';
export * from './ranges';
export * from './supplied';

/** Sentence-initial occurrences count for less when picking a word's spelling (so "Ich" does not beat "ich"). */
const INITIAL_WEIGHT = 0.5;

/**
 * Builds the learner's index of known words (recognized in reading or better) from the texts those words were read in:
 * counts, most frequent spellings, and bigrams (previous word, known or not → next word, known only).
 */
export async function buildWordIndex(
  ctx: { store: AppStore; golearn: Pick<GoLearn, 'listKnown'>; adapter: LanguageAdapter },
  userId: string, lang: LanguageCode,
): Promise<WordIndex> {
  const prefix = `form:${lang}:`;
  const rows: LearnerItemState[] = (await ctx.golearn.listKnown(userId, lang, 'reading', 'recognized'))
    .filter((r) => r.itemId.startsWith(prefix));

  const words = new Map<string, KnownWord>();
  const known = new Set<string>(); // normalized
  const textIds = new Set<string>();
  for (const r of rows) {
    const normalized = r.itemId.slice(prefix.length);
    known.add(normalized);
    words.set(normalized, { itemId: r.itemId, normalized, surface: normalized, count: 0, level: r.reading.level });
    for (const id of r.readingTextIds ?? r.textIds) textIds.add(id);
  }

  const bigrams = new Map<string, Map<string, number>>();
  const spellings = new Map<string, Map<string, number>>();
  for (const textId of textIds) {
    const tokens = await ctx.store.tokens.where('textId', textId);
    const bySentence = new Map<string, Token[]>();
    for (const t of tokens) {
      if (!t.isWord) continue;
      const list = bySentence.get(t.sentenceId);
      if (list) list.push(t); else bySentence.set(t.sentenceId, [t]);
    }
    for (const list of bySentence.values()) {
      list.sort((a, b) => a.index - b.index);
      let prev: string | undefined;
      list.forEach((t, i) => {
        if (known.has(t.normalized)) {
          const w = words.get(t.normalized)!;
          w.count++;
          let tally = spellings.get(t.normalized);
          if (!tally) spellings.set(t.normalized, (tally = new Map()));
          tally.set(t.surface, (tally.get(t.surface) ?? 0) + (i === 0 ? INITIAL_WEIGHT : 1));
          if (prev !== undefined) {
            let next = bigrams.get(prev);
            if (!next) bigrams.set(prev, (next = new Map()));
            next.set(t.normalized, (next.get(t.normalized) ?? 0) + 1);
          }
        }
        prev = t.normalized;
      });
    }
  }

  for (const [normalized, tally] of spellings) {
    let best = '';
    let bestN = -1;
    for (const [surface, n] of tally) {
      if (n > bestN || (n === bestN && surface < best)) { best = surface; bestN = n; }
    }
    if (best) words.get(normalized)!.surface = best;
  }

  return { lang, userId, words, bigrams, builtAt: new Date().toISOString(), textCount: textIds.size };
}
