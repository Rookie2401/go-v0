/**
 * Spanish sentence segmentation on top of the shared terminator splitter. What Spanish adds: ¿ ? ¡ ! (the opening
 * marks start a sentence but never end one), dialogue dashes (— at the start of a turn; a narrator's remark after a
 * question or exclamation stays in the sentence: "—¿Cómo estás? —preguntó Ana."), quotation marks « », ellipses that
 * continue in lower case, abbreviations (Sr., Sra., Dr., Ud., Uds., pág., núm., EE. UU., a. C.), and numbers.
 * Every span is a trimmed slice of the input, so offsets round-trip.
 *
 * Known limits: a sentence that ends in an abbreviation listed here and is followed by a capital continues; an
 * unlisted abbreviation (Av.) followed by a capital splits.
 */
import type { Span } from '../../core';
import { splitSentences } from '../shared';

/** Lower-case abbreviations (without the dot) that never end a sentence on their own. */
export const SPANISH_ABBREVIATIONS: readonly string[] = [
  'sr', 'sra', 'srta', 'sres', 'dr', 'dra', 'drs', 'ud', 'uds', 'vd', 'vds', 'pág', 'págs', 'pp', 'núm', 'núms', 'nº', 'n',
  'av', 'avda', 'cap', 'caps', 'art', 'arts', 'vol', 'vols', 'tel', 'ej', 'fig', 'ed', 'vs', 'ee', 'cía', 'gral', 'lic', 'ing',
  'prof', 'profa', 'sto', 'sta', 'aprox', 'dpto', 'pte', 'mons', 'excmo', 'ilmo',
];

/** Split points inside a span: after "a. C." / "d. C." when a capital follows. */
const ERA_END = /\b[ad]\.\s?C\.(?=\s+[¿¡«"“—]?\p{Lu})/gu;

export function segmentSpanishSentences(text: string): Span[] {
  const base = splitSentences(text, { terminators: '.!?…', abbreviations: [...SPANISH_ABBREVIATIONS] });

  // 1. split after an era abbreviation ("44 a. C. Luego …")
  const split: Span[] = [];
  for (const s of base) {
    let from = s.start;
    for (const m of s.text.matchAll(ERA_END)) {
      const end = s.start + (m.index ?? 0) + m[0].length;
      split.push({ start: from, end, text: text.slice(from, end) });
      from = end;
    }
    split.push({ start: from, end: s.end, text: text.slice(from, s.end) });
  }
  // a piece after a split point starts with the whitespace that followed the abbreviation: trim it
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
  if (!endsQuestion && !endsEllipsis) return false;
  const head = next.text;
  // a narrator's remark after a question, exclamation or ellipsis: "—¿Cómo estás? —preguntó Ana."
  if (/^[—–]\s*\p{Ll}/u.test(head)) return true;
  // a question or exclamation that carries on in lower case: «¿Vienes?» y me fui.
  if (endsQuestion && /^\p{Ll}/u.test(head)) return true;
  // an ellipsis that carries on in lower case: "Bueno… entonces vamos."
  if (endsEllipsis && /^[¿¡«"“(]?\p{Ll}/u.test(head)) return true;
  return false;
}
