/**
 * Sentence boundaries in Albanian prose, on top of the shared terminator splitter. What the Albanian layer adds:
 *
 *  - abbreviations that do not end a sentence: p.sh. (për shembull), p.e.s. / e.s. (before / of our era), Dr., Prof.,
 *    z. / znj. / zj. (Mr / Mrs / Miss), nr., fq., shek., vj., and the digraph initials of names (Gj. Fishta, Th. Mitko).
 *    Every single letter followed by a dot is also taken as an initial (N. Frashëri), which the shared splitter does.
 *  - "etj." (and so on) is deliberately NOT in the list: it can end a sentence. The rule is therefore the shared one for
 *    a full stop: a sentence continues if the next word is lower case ("etj. dhe ...") and breaks if a capital follows
 *    ("... etj. Ai erdhi."). A capital after "etj." is taken as a new sentence even when it is a name that continues
 *    the old one; that is the one case this rule gets wrong.
 *  - a lower-case single-letter WORD at the end of a sentence ("Shkronja e parë është a. Pastaj ...") does break when a
 *    capital follows, because only a CAPITAL letter with a dot is read as an initial. (Lower-case letters inside
 *    p.e.s. / e.s. are preceded by a dot and stay inside the abbreviation; "z." is an abbreviation, not a letter.)
 *    Known limit: a sentence that ends in a capital letter ("vitamina C. Ai ...") continues, because it looks like an
 *    initial.
 *  - decimals and dates (3.5, 12.10.2026) hold together because the dot is not followed by a space.
 *  - dialogue: a dash (— or –) at the start of a line starts a turn (a newline always ends a sentence); a narrator's
 *    remark that follows a question, an exclamation or an ellipsis stays in the sentence ("— Ku shkon? — pyeti ai.");
 *    a dash after a finished sentence starts a new one.
 *  - quotation marks « » “ ” „ “: a closing mark stays with its sentence; a quoted question followed by a lower-case
 *    continuation stays joined («Ku shkon?» pyeti ai.).
 *  - an ellipsis (… or ...) that carries on in lower case does not end the sentence.
 *
 * Every span is a trimmed slice of the input, so offsets round-trip. Machine-drafted, not checked by a native speaker.
 */
import type { Span } from '../../core';
import { splitSentences } from '../shared';

/** Lower-case abbreviations (without the dot) that never end a sentence on their own. "etj" is not among them: see above. */
export const SQ_ABBREVIATIONS: readonly string[] = [
  'p', 'sh', 'dr', 'prof', 'z', 'znj', 'zj', 'nr', 'fq', 'shek', 'vj', 'inxh', 'kap',
  // digraph initials of names: Gj. Fishta, Th. Mitko, Dh. Xhuvani, Xh. Hoxha ...
  'gj', 'th', 'dh', 'nj', 'xh', 'zh', 'll', 'rr',
];

/** A lower-case single-letter word with a dot, not part of an abbreviation (not after another dot), before a capital. */
const LETTER_WORD_END = /(?<=^|[\s(«“„"])(?!z\.)\p{Ll}\.(?=\s+[«“„"(—–]?\p{Lu})/gu;

export function segmentSqSentences(text: string): Span[] {
  const base = splitSentences(text, { terminators: '.!?…', abbreviations: [...SQ_ABBREVIATIONS] });

  // 1. split after a lower-case single-letter word that ends a sentence
  const split: Span[] = [];
  for (const s of base) {
    let from = s.start;
    for (const m of s.text.matchAll(LETTER_WORD_END)) {
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
  const tail = prev.text.replace(/[\s"'»”“’)\]›]+$/u, '');
  const endsQuestion = /[?!]$/u.test(tail);
  const endsEllipsis = /(…|\.\.\.)$/u.test(tail);
  if (!endsQuestion && !endsEllipsis) return false;
  const head = next.text;
  // a narrator's remark after a question, exclamation or ellipsis: "— Ku shkon? — pyeti ai."
  if (/^[—–]\s*\p{Ll}/u.test(head)) return true;
  // a question or exclamation that carries on in lower case: «Ku shkon?» pyeti ai.
  if (endsQuestion && /^\p{Ll}/u.test(head)) return true;
  // an ellipsis that carries on in lower case: "Mirë… atëherë shkojmë."
  if (endsEllipsis && /^[«“„"(]?\p{Ll}/u.test(head)) return true;
  return false;
}
