/**
 * German sentence segmentation. What German adds to the shared terminator rule:
 *  - abbreviations that never end a sentence (z. B., d. h., Dr., Prof., Nr., ca., vgl., bzw., u. a., Str., S., Bd., Jh.)
 *    and two that may (usw., etc., v. Chr., n. Chr.: a capital after them starts a new sentence);
 *  - ordinal dots: "am 3. Mai", "im 19. Jahrhundert", "Friedrich II. von Preußen" do not end a sentence; "Er ist 25. Der
 *    Zug fährt." does, and so does "Seite 3. Dann …";
 *  - quotation marks „ … “ ‚ … ‘ » … « « … » " … ": a quotation is never cut inside, so "Er sagte: „Komm. Bleib.“" is one
 *    sentence; a closing mark after ? ! . … continues into a reporting clause: „Komm!“, sagte er. / „Komm!“ sagte er.
 *    (one sentence); a quotation that closes after a full stop and is followed by a capital letter ends the sentence;
 *  - an ellipsis, a question or an exclamation mark followed by a lower-case word continues the sentence;
 *  - a line break always ends a sentence (verse, headings, one turn of a dialogue per line).
 * Every span is a trimmed slice of the input, so offsets round-trip.
 *
 * Known limits: a sentence that ends in a listed abbreviation (… vgl. Er …) continues into the next one; an unlisted
 * abbreviation followed by a capital splits; a numeral that ends a sentence and is followed by a name ("im Jahr 1990.
 * Berlin …") splits only when the numeral is not in an ordinal context ("am", "der", "im" …).
 */
import type { Span } from '../../core';

/** Lower-case abbreviations (without the dot) that never end a sentence on their own. */
export const GERMAN_ABBREVIATIONS: readonly string[] = [
  'dr', 'prof', 'nr', 'ca', 'vgl', 'evtl', 'ggf', 'st', 'hr', 'fr', 'str', 's', 'bd', 'jh', 'jhd', 'bzw', 'bsp', 'abb', 'abs', 'adr',
  'allg', 'anm', 'art', 'aufl', 'bes', 'bzgl', 'dipl', 'dt', 'ev', 'geb', 'gem', 'gest', 'hrsg', 'ing', 'inkl', 'jr', 'kap', 'kath',
  'max', 'min', 'mind', 'mio', 'mrd', 'mtl', 'sog', 'tel', 'übr', 'usf', 'vorm', 'wiss', 'zzgl', 'zt', 'mr', 'mrs', 'ff', 'bzw', 'o', 'u',
];

/** Abbreviations that usually close a sentence: a capital letter after them starts the next one. */
const ENDING_ABBREVIATIONS = new Set(['usw', 'etc']);

const MONTHS = new Set([
  'Januar', 'Jänner', 'Februar', 'Feber', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]);

/** Nouns an ordinal number usually qualifies: "im 19. Jahrhundert", "den 2. Platz", "zum 3. Mal". */
const ORDINAL_NOUNS = new Set([
  'Jahrhundert', 'Jahrtausend', 'Mal', 'Platz', 'Klasse', 'Stock', 'Etage', 'Auflage', 'Semester', 'Geburtstag', 'Jahr', 'Tag', 'Woche',
  'Stunde', 'Weltkrieg', 'Liga', 'Bundesliga', 'Runde', 'Satz', 'Reihe', 'Kapitel', 'Akt', 'Szene', 'Artikel', 'Absatz', 'Abschnitt',
  'Advent', 'Rang', 'Versuch', 'Wahl', 'Fall', 'Bezirk', 'Sinfonie', 'Symphonie', 'Lehrjahr', 'Schuljahr', 'Platzierung',
]);

/** Capitalised words that open a sentence far more often than they continue one. */
const STARTERS = new Set([
  'Der', 'Die', 'Das', 'Dem', 'Den', 'Des', 'Ein', 'Eine', 'Einen', 'Er', 'Sie', 'Es', 'Ich', 'Du', 'Wir', 'Ihr', 'Man', 'Dann', 'Aber',
  'Doch', 'Also', 'Wenn', 'Als', 'Heute', 'Gestern', 'Hier', 'Dort', 'Da', 'So', 'Nun', 'Jetzt', 'Später', 'Danach', 'Zuerst',
  'Plötzlich', 'Vielleicht', 'Warum', 'Was', 'Wer', 'Wie', 'Wo', 'Wann', 'Weil', 'Dass', 'Und', 'Oder', 'Denn', 'Auch', 'Noch', 'Schon',
  'Nein', 'Ja',
]);

/** Words before a number that make it an ordinal ("am 3.", "der 3.", "zum 3."). */
const ORDINAL_CONTEXT = new Set([
  'am', 'im', 'vom', 'zum', 'zur', 'beim', 'ins', 'ab', 'bis', 'seit', 'vor', 'nach', 'um', 'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'als', 'zwischen', 'von', 'zu', 'an', 'auf', 'in', 'nur', 'schon', 'erst', 'jeden', 'jede', 'jedes', 'dieser', 'diesem', 'diesen',
]);

const TERMINATORS = '.!?…';
const OPENERS = '„‚»«“‘"\'([¿¡';
const CLOSERS = new Set([')', ']', '“', '”', '‘', '’', '«', '»', '"', "'"]);

interface QuoteFrame { closes: string[] }

/** The frame a quotation mark opens, when it is closed later in the text. */
function openedBy(ch: string, i: number, text: string): QuoteFrame | undefined {
  let closes: string[] | undefined;
  if (ch === '„') closes = ['“', '”'];
  else if (ch === '‚') closes = ['‘', '’'];
  else if (ch === '»') closes = ['«'];
  else if (ch === '«') closes = ['»'];
  else if (ch === '“') closes = ['”'];
  else if (ch === '"') closes = ['"'];
  if (!closes) return undefined;
  return closes.some((c) => text.indexOf(c, i + 1) >= 0) ? { closes } : undefined;
}

const isQuoteMark = (ch: string): boolean => '„‚»«“”‘’"'.includes(ch);

export function segmentGermanSentences(text: string): Span[] {
  const spans: Span[] = [];
  const stack: QuoteFrame[] = [];
  let start = 0;
  const push = (from: number, to: number) => {
    let a = from;
    let b = to;
    while (a < b && /\s/u.test(text[a])) a++;
    while (b > a && /\s/u.test(text[b - 1])) b--;
    if (b > a) spans.push({ start: a, end: b, text: text.slice(a, b) });
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      let j = i;
      while (j < text.length && (text[j] === '\n' || text[j] === '\r')) j++;
      push(start, i);
      start = j;
      i = j;
      stack.length = 0;
      continue;
    }
    if (isQuoteMark(ch)) {
      const top = stack[stack.length - 1];
      if (top && top.closes.includes(ch)) stack.pop();
      else {
        const frame = openedBy(ch, i, text);
        if (frame) stack.push(frame);
      }
      i++;
      continue;
    }
    if (!TERMINATORS.includes(ch)) { i++; continue; }

    // a run of terminators, then the marks that close with it
    let j = i;
    while (j < text.length && TERMINATORS.includes(text[j])) j++;
    const run = text.slice(i, j);
    let k = j;
    while (k < text.length && CLOSERS.has(text[k])) {
      const top = stack[stack.length - 1];
      if (top && top.closes.includes(text[k])) stack.pop();
      k++;
    }
    if (stack.length > 0) { i = k; continue; } // inside a quotation: never cut here
    const atEnd = k >= text.length;
    if (!atEnd && !/\s/u.test(text[k])) { i = k; continue; } // „Komm!“, sagte er. / 3.5 / z.B.

    let isBreak = true;
    if (!atEnd) {
      let m = k;
      while (m < text.length && /[ \t ]/u.test(text[m])) m++;
      while (m < text.length && OPENERS.includes(text[m])) m++;
      const nextChar = text[m] ?? '';
      const nextWord = /^[\p{L}\p{N}]+/u.exec(text.slice(m, m + 40))?.[0] ?? '';
      if (/\p{Ll}/u.test(nextChar)) isBreak = false; // continues in lower case: a reporting clause, "etc. und"
      else if (run === '.' && k === j) isBreak = !stopsAfterDot(text.slice(start, i), nextChar, nextWord);
    }
    if (isBreak) {
      push(start, k);
      start = k;
    }
    i = k;
  }
  push(start, text.length);
  return spans;
}

/** True when the full stop after the text so far (`before`) does NOT end the sentence although a capital letter or digit follows. */
function stopsAfterDot(before: string, nextChar: string, nextWord: string): boolean {
  const mm = /([\p{L}\p{N}]+)$/u.exec(before);
  const prev = mm ? mm[1] : '';
  if (!prev) return false;
  const lower = prev.toLowerCase();
  const onlyThis = before.trim() === prev; // "1. Punkt", "a. Erstens": a list marker, not the end of a sentence
  const prevWord = (): string => /([\p{L}]+)\s*$/u.exec(before.slice(0, mm!.index))?.[1] ?? '';

  if (/^\d+$/u.test(prev)) {
    if (onlyThis || /\d/u.test(nextChar)) return true;
    if (!nextWord) return false;
    if (MONTHS.has(nextWord) || ORDINAL_NOUNS.has(nextWord)) return true;
    if (STARTERS.has(nextWord)) return false;
    return ORDINAL_CONTEXT.has(prevWord().toLowerCase());
  }
  if (/^[IVXLCDM]{1,6}$/u.test(prev) && /^\p{Lu}/u.test(prevWord()) && prevWord().length > 1) {
    return !STARTERS.has(nextWord); // Friedrich II. von Preußen / Ludwig XIV. Sonnenkönig
  }
  if ([...prev].length === 1 && /\p{L}/u.test(prev)) {
    if (onlyThis) return true;
    if (prev !== prev.toLowerCase()) return !STARTERS.has(nextWord); // an initial: J. S. Bach
    return true; // z. B., d. h., u. a., o. ä.
  }
  if (ENDING_ABBREVIATIONS.has(lower)) return false;
  if (lower === 'chr' && /\b[vn]\.\s*Chr$/u.test(before)) return false;
  return GERMAN_ABBREVIATIONS.includes(lower);
}
