/**
 * English-in-parentheses requests: "(water)" typed right before the caret asks the editor to supply the target word.
 */
import type { LanguageAdapter } from '../../core';
import type { Parenthetical } from './types';

const PAREN_AT_END = /\(([A-Za-z][A-Za-z' -]{0,40})\)$/;

/** Matches only when the caret sits right after the `)`. */
export function findParenthetical(textBeforeCaret: string): Parenthetical | null {
  const m = PAREN_AT_END.exec(textBeforeCaret);
  if (!m) return null;
  const english = m[1].trim();
  if (!english) return null;
  return { english, start: m.index, end: textBeforeCaret.length };
}

export interface PendingSupplied {
  /** What the learner has typed of the target so far (after the parenthetical, one optional space skipped). */
  typed: string;
  complete: boolean;
  /** The typed text is not a prefix of the target. */
  broken: boolean;
}

const fallbackNormalize = (s: string): string => s.normalize('NFC').toLowerCase();

/**
 * How much of `target.surface` has been typed after the parenthetical. `adapter` (optional) supplies the language's own
 * normalisation for the comparison; without it an NFC + lower-case comparison is used.
 */
export function pendingSupplied(
  text: string, paren: Parenthetical, caret: number, target: { surface: string },
  adapter?: Pick<LanguageAdapter, 'normalize'>,
): PendingSupplied {
  const norm = adapter ? (s: string) => adapter.normalize(s) : fallbackNormalize;
  const from = text[paren.end] === ' ' ? paren.end + 1 : paren.end;
  const typed = caret > from ? text.slice(from, caret) : '';
  const t = norm(typed);
  const want = norm(target.surface);
  return { typed, complete: typed.length > 0 && t === want, broken: !want.startsWith(t) };
}
