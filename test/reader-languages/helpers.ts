/**
 * Helpers for the per-language reader tests: a selection is written INSIDE its sentence with « » around it, so the
 * offsets handed to the parser are the real ones (a plain indexOf finds the wrong occurrence of a short word, and the
 * tests below are about exactly such words).
 */
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import type { CardModel, ParseContext } from '../../packages/golearn-extension/src/parser';

export interface Marked { sentence: string; surface: string; start: number; end: number }

/** "Er steht früh «auf»." -> the sentence without the marks, the selection and its offsets. */
export function mark(marked: string): Marked {
  const a = marked.indexOf('«');
  const b = marked.indexOf('»');
  if (a < 0 || b < a) throw new Error(`no « » selection in ${JSON.stringify(marked)}`);
  const surface = marked.slice(a + 1, b);
  const sentence = marked.slice(0, a) + surface + marked.slice(b + 1);
  return { sentence, surface, start: a, end: a + surface.length };
}

/** The card the extension parser gives for a selection in its sentence (a full sentence context at 0.9). */
export function cardOf(marked: string, languageId: string, extra: Partial<ParseContext> = {}): CardModel {
  const m = mark(marked);
  return parseSelection({
    surface: m.surface, languageId,
    context: { kind: 'sentence', confidence: 0.9, sentence: m.sentence, selStart: m.start, selEnd: m.end, ...extra },
  });
}

/** The word tokens (surfaces) of a text for an adapter. */
export const wordsOf = (adapter: { tokenize(s: string): Array<{ surface: string; isWord: boolean }> }, text: string): string[] =>
  adapter.tokenize(text).filter((t) => t.isWord).map((t) => t.surface);

/** Sorted UTF-16 offsets where a grapheme cluster starts, plus the end. */
export function graphemeEdges(text: string): Set<number> {
  const edges = new Set<number>([text.length]);
  for (const g of new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(text)) edges.add(g.index);
  return edges;
}
