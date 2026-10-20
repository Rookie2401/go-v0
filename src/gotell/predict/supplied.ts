/**
 * Completing a supplied word: the `(english)` request disappears and the word the learner typed is recorded as supplied.
 */
import { addRange, shiftAssist } from './ranges';
import type { Parenthetical, TextAssist } from './types';

/**
 * The learner has fully typed `surface` right after `paren`. Deletes `(english)` plus one following space, shifts the
 * existing assist ranges across that deletion, and records the supplied word's range. `caret` is the offset right after
 * the supplied word in the new text. Pure.
 */
export function applySupplied(
  text: string, assist: TextAssist, paren: Parenthetical, surface: string,
): { text: string; assist: TextAssist; caret: number } {
  const wordStart = text[paren.end] === ' ' ? paren.end + 1 : paren.end;
  const removed = wordStart - paren.start;
  const next = text.slice(0, paren.start) + text.slice(wordStart);
  const shifted = shiftAssist(assist, { start: paren.start, removed, inserted: 0 });
  const range = { start: paren.start, end: paren.start + surface.length };
  return { text: next, assist: { supplied: addRange(shifted.supplied, range), guided: shifted.guided }, caret: range.end };
}
