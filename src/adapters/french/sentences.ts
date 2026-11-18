/**
 * French sentence segmentation on top of the shared terminator splitter. Not native-reviewed.
 *
 * What French adds: guillemets « … » with the space before » (a sentence end inside them belongs to the sentence; a reporting
 * clause after the closing » that begins in lower case continues it: « Viens ! » dit-il.), dialogue dashes (— at the start of a
 * turn; a dash followed by a lower-case reporting clause continues the sentence), the ellipsis … (continues in lower case),
 * French spacing before ; : ! ? » (a space, U+00A0 or U+202F), abbreviations (M., Mme, Dr, cf., av. J.-C. …), and numbers
 * (a decimal comma or a point inside a number never ends a sentence). Every span is a trimmed slice of the input.
 *
 * Two kinds of abbreviation: most never end a sentence on their own (FRENCH_ABBREVIATIONS minus the two lists below); a few are
 * also ordinary words and count as abbreviations only before a number (vol. 3, art. 12, chap. IV); "etc." is an abbreviation
 * only when what follows is in lower case, because it very often ends a sentence.
 *
 * Known limits: a sentence ending in an abbreviation listed here and followed by a capital continues; an unlisted abbreviation
 * followed by a capital splits; a single capital letter followed by a full stop ("le plan B. Il …") never ends a sentence (as in
 * the shared splitter); sentences inside one pair of guillemets are split like any others, so « Il vient. Il part. » is two spans.
 */
import type { Span } from '../../core';
import { splitSentences } from '../shared';

/** Abbreviations (lower case, without the dot) that never end a sentence on their own. */
const PLAIN_ABBREVIATIONS: readonly string[] = [
  'm', 'mm', 'mme', 'mmes', 'mlle', 'mlles', 'dr', 'drs', 'pr', 'prof', 'me', 'mgr', 'st', 'ste', 'sts', 'stes',
  'cf', 'ex', 'env', 'éd', 'éds', 'av', 'apr', 'n', 'p', 'pp', 'ch', 'col', 'cie', 'dép', 'gal', 'gén', 'lt', 'cdt', 'cap', 'sgt',
  'jr', 'sr', 'tél', 'fr', 'suiv', 'op', 'cit', 'ibid', 'id', 'sc', 'trad', 'préf', 'réf', 'qqch', 'qqn', 'vs', 'resp', 'adj', 'adv', 'subst',
];
/** Ordinary words as well: an abbreviation only when a number follows (vol. 3, art. 12, chap. IV). */
const BEFORE_NUMBER_ABBREVIATIONS: readonly string[] = ['vol', 'vols', 'art', 'arts', 'chap', 'fig', 'tel', 'no', 'nos', 'sect', 'ann', 'tab', 'liv'];
/** An abbreviation that very often ends a sentence: it continues only before lower case. */
const SENTENCE_FINAL_ABBREVIATIONS: readonly string[] = ['etc'];

/** Every abbreviation the segmenter knows (lower case, without the dot). */
export const FRENCH_ABBREVIATIONS: readonly string[] = [...PLAIN_ABBREVIATIONS, ...BEFORE_NUMBER_ABBREVIATIONS, ...SENTENCE_FINAL_ABBREVIATIONS];

const MASK = '\u0001';
const BEFORE_NUMBER_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${BEFORE_NUMBER_ABBREVIATIONS.join('|')})\\.(?=\\s*(?:\\d|[IVXLC]+\\b))`, 'giu');
const SPACE_BEFORE_CLOSER = /[   ](?=»)/gu;
const ERA_END = /\bJ\.-C\.(?=\s+[«"“—–-]?\s*\p{Lu})/gu;

/**
 * The text the splitter sees: same length as the input, so offsets carry back. The space of "! »" becomes a closing mark (the
 * sentence then ends after the »); the dot of an abbreviation that counts only before a number is hidden unless a number follows.
 */
function mask(text: string): string {
  return text
    .replace(SPACE_BEFORE_CLOSER, '»')
    .replace(BEFORE_NUMBER_RE, (m) => m.slice(0, -1) + MASK);
}

export function segmentFrenchSentences(text: string): Span[] {
  const masked = mask(text);
  // "etc." breaks only before a capital: the splitter's own lower-case rule does the rest
  const base = splitSentences(masked, { terminators: '.!?…', abbreviations: [...PLAIN_ABBREVIATIONS] });

  // 1. split after "J.-C." when a capital follows (the splitter treats the final "C." as an initial)
  const split: Span[] = [];
  for (const s of base) {
    let from = s.start;
    const piece = text.slice(s.start, s.end);
    for (const m of piece.matchAll(ERA_END)) {
      const end = s.start + (m.index ?? 0) + m[0].length;
      split.push({ start: from, end, text: text.slice(from, end) });
      from = end;
    }
    split.push({ start: from, end: s.end, text: text.slice(from, s.end) });
  }
  const trimmed = split.map((s) => {
    let a = s.start;
    while (a < s.end && /\s/u.test(text[a])) a++;
    return a === s.start ? s : { start: a, end: s.end, text: text.slice(a, s.end) };
  });

  // 2. join what the terminator rule cut too eagerly
  const out: Span[] = [];
  for (const s of trimmed) {
    const prev = out[out.length - 1];
    if (prev && joins(text, prev, s)) out[out.length - 1] = { start: prev.start, end: s.end, text: text.slice(prev.start, s.end) };
    else out.push(s);
  }
  return out;
}

function joins(text: string, prev: Span, next: Span): boolean {
  if (/[\r\n]/u.test(text.slice(prev.end, next.start))) return false; // a new line is a new turn or paragraph
  const tail = prev.text.replace(/[\s"'»”’)\]›]+$/u, '');
  const endsQuestion = /[?!]$/u.test(tail);
  const endsEllipsis = /(…|\.\.\.)$/u.test(tail);
  const afterEtc = /(?<![\p{L}\p{N}])etc\.$/iu.test(tail);
  if (!endsQuestion && !endsEllipsis && !afterEtc) return false;
  const head = next.text;
  if (afterEtc) return /^[«"“(]?\p{Ll}/u.test(head);
  // a reporting clause after a dialogue dash: — Viens ! — dit-il.
  if (/^(?:[—–]|--)\s*\p{Ll}/u.test(head)) return true;
  // a question or exclamation that carries on in lower case: « Viens ! » dit-il.
  if (endsQuestion && /^\p{Ll}/u.test(head)) return true;
  // an ellipsis that carries on in lower case: Bon… alors on y va.
  if (endsEllipsis && /^[«"“(]?\p{Ll}/u.test(head)) return true;
  return false;
}
