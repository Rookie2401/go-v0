/**
 * Hindi sentence boundaries: the danda (।) and double danda (॥), the Latin stops Hindi also uses (? ! … and the full
 * stop), quotation marks and dashes around speech, abbreviations with a full stop or the abbreviation sign (डॉ., श्री,
 * प्रो., ई॰), verse numbers. Wraps the shared terminator splitter (it does the line breaks, the closing quotes and the runs
 * of terminators) and adds what Hindi needs:
 *
 *  - a danda is a sentence end even when the next sentence follows without a space (आया।वह गया);
 *  - the Latin full stop is decided here, not by the shared splitter, because the shared one reads a Devanagari word that
 *    ends in a consonant after a vowel sign (राम.) as a lone initial: a stop ends a sentence unless an abbreviation, a number
 *    (1. १.), an initial or an initials chain (कि.मी.) stands before it, or a lower-case Latin word follows;
 *  - a danda, ? or ! that closes a quotation, followed by a short reporting clause (…।" उसने कहा।), stays in one sentence;
 *    so does a dialogue line that begins with a dash and is followed by a reporting clause;
 *  - a number alone (a list or verse number, ॥ १ ॥) never makes a sentence of its own.
 *
 * Spans follow the shared convention: every span is a trimmed slice of the text (so that `text.slice(start, end) === span.text`),
 * in order, without overlap; what lies between two spans is whitespace only, so every other character belongs to exactly
 * one span. No span is empty. Known limits: a sentence that ends in a listed abbreviation (रु., कि.मी.) and a sentence that
 * ends with a Latin full stop after a one-letter word are joined to the next; an ellipsis always ends a sentence.
 * Machine-drafted rules, not checked by a native speaker.
 */
import type { Span } from '../../core';
import { splitSentences } from '../shared';

/** Abbreviations with their full stop, as written. */
export const HINDI_ABBREVIATIONS: readonly string[] = [
  'डॉ.', 'प्रो.', 'पं.', 'श्री.', 'श्रीमती.', 'श्रीमान.', 'सुश्री.', 'कु.', 'स्व.', 'ई.', 'रु.', 'नं.', 'सं.', 'क्र.', 'पृ.', 'कि.मी.', 'कि.ग्रा.', 'से.मी.', 'मि.', 'मिमी.',
  'ए.', 'बी.', 'सी.', 'डी.', 'एम.', 'पी.', 'जे.', 'आर.', 'एस.', 'टी.', 'वी.', 'एन.', 'एच.', 'यू.', 'ओ.', 'एफ.', 'डब्ल्यू.', 'अ.', 'वि.',
].map((s) => s.normalize('NFC'));
const LATIN_ABBREVIATIONS = new Set(['dr', 'mr', 'mrs', 'ms', 'prof', 'st', 'no', 'nos', 'rs', 'km', 'kg', 'cm', 'mm', 'vs', 'jr', 'sr', 'fig', 'vol', 'ch']);
const ABBREVIATION_SET = new Set(HINDI_ABBREVIATIONS);

const DANDAS = '।॥';
const CLOSERS = new Set(['"', "'", '»', '”', '’', ')', ']', '›']);
const DIGITS = /^[0-9०-९]+$/u;
const isSpace = (ch: string): boolean => /\s/u.test(ch);

/** Verbs of saying, asking and answering: a short clause with one of them after a quotation reports it. */
const SPEECH = new Set([
  'कहा', 'कही', 'कहे', 'कहती', 'कहता', 'कहते', 'कहने', 'बोला', 'बोली', 'बोले', 'बोलती', 'बोलता', 'बोलते', 'पूछा', 'पूछी', 'पूछे', 'पूछती', 'पूछता', 'पूछते',
  'चिल्लाया', 'चिल्लाई', 'चिल्लाए', 'चिल्लाकर', 'चीखा', 'चीखी', 'बताया', 'बताई', 'बताते', 'बताती', 'बताता', 'जवाब', 'उत्तर', 'बड़बड़ाया', 'बड़बड़ाई', 'फुसफुसाया', 'फुसफुसाई',
  'पुकारा', 'पुकारी', 'सोचा', 'सोची', 'मुस्कुराकर', 'हँसकर', 'डाँटा', 'डाँटते', 'समझाया', 'समझाई', 'दोहराया', 'दोहराई', 'बुदबुदाया', 'बुदबुदाई', 'पूछने', 'चिल्लाते', 'बोलकर', 'कहकर',
  'गिड़गिड़ाया', 'गिड़गिड़ाई', 'ललकारा', 'घोषणा', 'आदेश', 'विनती', 'प्रार्थना',
].map((s) => s.normalize('NFC')));

const isInitialsChain = (chunk: string): boolean => /^(?:[\p{L}\p{M}]{1,3}\.){2,}$/u.test(chunk);

/** The stop at index k of `t` closes an abbreviation, an initial, a number or an initials chain. */
function stopIsNotAnEnd(t: string, k: number): boolean {
  let a = k;
  while (a > 0 && !isSpace(t[a - 1])) a--;
  const chunk = t.slice(a, k + 1).replace(/^[("'“‘[]+/u, '').normalize('NFC');
  if (ABBREVIATION_SET.has(chunk) || isInitialsChain(chunk)) return true;
  const bare = chunk.slice(0, -1);
  if (DIGITS.test(bare)) return true; // 1.  १.  a list or verse number
  if (/^\p{Script=Latin}$/u.test(bare)) return true; // an initial
  if (LATIN_ABBREVIATIONS.has(bare.toLowerCase())) return true;
  return false;
}

/** Offsets (into `t`) where a new sentence starts inside one shared-splitter span. */
function innerCuts(t: string): number[] {
  const cuts: number[] = [];
  for (let k = 0; k < t.length; k++) {
    const ch = t[k];
    if (DANDAS.includes(ch)) {
      let e = k;
      while (e < t.length && DANDAS.includes(t[e])) e++;
      let q = e;
      while (q < t.length && CLOSERS.has(t[q])) q++;
      if (q < t.length && !isSpace(t[q]) && !'।॥?!…|'.includes(t[q])) cuts.push(q);
      k = Math.max(k, q - 1);
      continue;
    }
    if (ch !== '.') continue;
    let e = k;
    while (e < t.length && t[e] === '.') e++;
    const run = e - k;
    let q = e;
    while (q < t.length && CLOSERS.has(t[q])) q++;
    if (q >= t.length) break; // the end of the span is the shared splitter's boundary
    if (!isSpace(t[q])) { k = q - 1; continue; } // 3.5, a web address, कि.मी.
    let n = q;
    while (n < t.length && isSpace(t[n])) n++;
    if (n >= t.length) break;
    if (run === 1 && stopIsNotAnEnd(t, k)) { k = q - 1; continue; }
    if (/\p{Ll}/u.test(t[n])) { k = n - 1; continue; } // "etc. y": a lower-case Latin word goes on
    cuts.push(n);
    k = n - 1;
  }
  return cuts;
}

const wordsOf = (s: string): string[] => s.split(/[\s,;:!?…।॥"'“”‘’«»()\-–—]+/u).filter(Boolean).map((w) => w.normalize('NFC'));

/** The piece after a quotation reports who said it: short, no new quotation, and a verb of speaking among its first words. */
function isReportingClause(next: string): boolean {
  const head = next.replace(/^[\s]+/u, '');
  if (/^["“‘«'(]/u.test(head) || /^[—–-]\s*["“‘«]/u.test(head)) return false;
  const stripped = head.replace(/^[—–-]\s*/u, '');
  const ws = wordsOf(stripped);
  if (ws.length === 0 || ws.length > 10) return false;
  return ws.slice(0, 8).some((w) => SPEECH.has(w));
}

/** prev ends with a stop that closes a quotation, or is a dialogue line opened with a dash. */
function endsSpeech(prev: string): boolean {
  const tail = prev.replace(/\s+$/u, '');
  if (/[।॥?!…][\s]*["”’»']+$/u.test(tail)) return true;
  if (/^[—–]/u.test(prev) && /[।॥?!….]$/u.test(tail)) return true;
  return false;
}

const onlyMarker = (s: string): boolean => /^[\s"'“”‘’«»()[\]]*[0-9०-९]+\s*[।॥.)]*[\s"'“”‘’«»)\]]*$/u.test(s) || /^[\s।॥"'”’»)\]]+$/u.test(s);

export function segmentHindiSentences(text: string): Span[] {
  // 1. the shared splitter: line breaks, ? ! … | ।॥ followed by a space, closing quotes
  const base = splitSentences(text, { terminators: '।॥?!…|', abbreviations: [] });

  // 2. cut inside the pieces: a danda with no space after it, and the Latin full stop
  const pieces: Span[] = [];
  for (const s of base) {
    const cuts = innerCuts(s.text);
    let from = 0;
    for (const c of [...cuts, s.text.length]) {
      const raw = s.text.slice(from, c);
      const lead = raw.length - raw.replace(/^\s+/u, '').length;
      const piece = raw.trim();
      if (piece) pieces.push({ start: s.start + from + lead, end: s.start + from + lead + piece.length, text: piece });
      from = c;
    }
  }

  // 3. join what the rules above cut too eagerly: a lone number or stop, and a reporting clause after a quotation
  const out: Span[] = [];
  for (const p of pieces) {
    const prev = out[out.length - 1];
    if (prev && joins(text, prev, p)) out[out.length - 1] = { start: prev.start, end: p.end, text: text.slice(prev.start, p.end) };
    else out.push(p);
  }
  // a list or verse number that came last, alone, belongs to what is before it
  while (out.length > 1 && onlyMarker(out[out.length - 1].text) && !/[\r\n]/u.test(text.slice(out[out.length - 2].end, out[out.length - 1].start))) {
    const last = out.pop() as Span;
    const prev = out.pop() as Span;
    out.push({ start: prev.start, end: last.end, text: text.slice(prev.start, last.end) });
  }
  return out;
}

function joins(text: string, prev: Span, next: Span): boolean {
  if (/[\r\n]/u.test(text.slice(prev.end, next.start))) return false; // a new line is a new turn or verse
  // the previous piece is only a list or verse number ("१." "1." "॥ १ ॥"): the number leads into the next piece
  if (onlyMarker(prev.text) && DIGITS.test(prev.text.replace(/[^0-9०-९]/gu, '')) && !/[।॥]{2}/u.test(prev.text)) return true;
  // the next piece is only a closing number or stop: "…॥" then "१॥"
  if (onlyMarker(next.text) && /[।॥]/u.test(next.text)) return true;
  if (endsSpeech(prev.text) && isReportingClause(next.text)) return true;
  return false;
}
