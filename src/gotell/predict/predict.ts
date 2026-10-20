/**
 * Live word prediction for the guided-help ghost: a suggestion exists only while the learner is part-way through a
 * word (at least one character typed, caret directly after it) and never for a word that is already complete.
 */
import { LEVEL_ORDER } from '../../core';
import type { LanguageAdapter, LearnerLevel } from '../../core';
import type { Prediction, WordIndex } from './types';

const RECOGNIZED = LEVEL_ORDER.indexOf('recognized');
const TOP = LEVEL_ORDER.length - 1;
const SENTENCE_BREAK = /[.!?…。।\n]/;

/** 0..2 by how far above 'recognized' the level is. */
export function levelBonus(level: LearnerLevel): number {
  const i = LEVEL_ORDER.indexOf(level);
  if (i <= RECOGNIZED) return 0;
  return Math.min(2, ((i - RECOGNIZED) * 2) / (TOP - RECOGNIZED));
}

const fold = (s: string): string => s.normalize('NFC').toLowerCase();

function candidates(index: WordIndex, adapter: LanguageAdapter, prefix: string, prev: string | undefined): Prediction[] {
  const p = adapter.normalize(prefix);
  if (!p) return [];
  const foldedPrefix = fold(prefix);
  const follow = prev !== undefined ? index.bigrams.get(prev) : undefined;
  const out: Prediction[] = [];
  for (const w of index.words.values()) {
    if (w.normalized === p || !w.normalized.startsWith(p)) continue;
    if (w.surface.length <= prefix.length) continue;
    if (fold(w.surface.slice(0, prefix.length)) !== foldedPrefix) continue;
    const completion = w.surface.slice(prefix.length);
    if (!completion) continue;
    const bigram = follow?.get(w.normalized) ?? 0;
    out.push({
      typed: prefix, surface: w.surface, completion, itemId: w.itemId,
      score: 10 * bigram + Math.log2(w.count + 1) + levelBonus(w.level),
    });
  }
  return out;
}

/** Best first; `[]` when nothing qualifies. `opts.max` defaults to 1 (the editor shows one ghost at a time). */
export function predict(
  index: WordIndex, adapter: LanguageAdapter, textBeforeCaret: string, opts: { max?: number } = {},
): Prediction[] {
  const max = Math.max(1, opts.max ?? 1);
  if (!textBeforeCaret) return [];
  const words = adapter.tokenize(textBeforeCaret).filter((t) => t.isWord);
  const last = words[words.length - 1];
  if (!last || last.end !== textBeforeCaret.length) return [];

  // The previous word in the same sentence (index bigrams never cross a sentence).
  let prev: string | undefined;
  const before = words[words.length - 2];
  if (before && !SENTENCE_BREAK.test(textBeforeCaret.slice(before.end, last.start))) prev = before.normalized;

  let found = candidates(index, adapter, last.surface, prev);
  // A script without spaces: the segmenter may glue a half-typed word onto the one before it ("ฉัน" + "พ" → one token).
  // If nothing matches and the whole token is not itself a known word, retry from later starting points in the token.
  if (!found.length && adapter.script === 'Thai' && !index.words.has(adapter.normalize(last.surface))) {
    for (let cut = 1; cut < last.surface.length && !found.length; cut++) {
      if (/^\p{M}/u.test(last.surface.slice(cut))) continue;
      const head = adapter.normalize(last.surface.slice(0, cut));
      found = candidates(index, adapter, last.surface.slice(cut), index.bigrams.has(head) ? head : undefined);
    }
  }
  found.sort((a, b) => b.score - a.score || a.surface.length - b.surface.length || (a.surface < b.surface ? -1 : a.surface > b.surface ? 1 : 0));
  return found.slice(0, max);
}
