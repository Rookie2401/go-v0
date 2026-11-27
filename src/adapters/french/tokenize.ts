/**
 * French tokenizer (docs/french/PLAN.md, "TOKENS"). Not native-reviewed: the lists below are machine-drafted.
 *
 * A scanner of its own over the text AS GIVEN (offsets are UTF-16 indexes into it; nothing is normalised before measuring).
 * Whitespace (including U+00A0 and U+202F) makes no token; every punctuation mark or symbol is a non-word token of its own;
 * a run of letters, digits and `_` joined by apostrophes, hyphens (and a decimal comma/point between digits) is one chunk,
 * and the chunk is then cut by the rules:
 *   - elision: l'homme → l' · homme (the elided token keeps the apostrophe; its `normalized` ends in the straight one);
 *   - lexical words with an apostrophe stay whole (aujourd'hui, quelqu'un, presqu'île, prud'homme …);
 *   - a hyphenated compound is one token (grand-mère, quatre-vingt-dix, peut-être), except that a trailing chain of hyphen
 *     clitics is cut off (donne-le-moi → donne · - · le · - · moi; a-t-il; va-t'en → va · - · t' · en) and so is a trailing
 *     -ci / -là of a noun (cet homme-là), unless the whole is a word of its own (celui-ci, jusque-là …);
 *   - `_` at the edge of a word is an italics mark and a token of its own, as in the shared tokenizer.
 * Dashes (– —) are punctuation. A hyphen at the edge of a word is punctuation.
 *
 * Known limits: a capitalised clitic word at the end of a proper name (Jean-Le …) is cut like any other; a lexical compound that
 * ends in a clitic word and is not in HYPHEN_KEEP (entre-nous, tout-en-un) is cut; an apostrophe word whose first part is not an
 * elidable word and is not listed (O'Brien, rock'n'roll) stays one token.
 */
import type { RawToken } from '../../core';
import { normalizeFr } from './orth';

/** Elidable words (without the apostrophe). presqu and quelqu elide only when the whole is not one of FRENCH_WHOLE_APOSTROPHE. */
const ELIDABLE_STEMS: ReadonlySet<string> = new Set(['l', 'd', 'j', 'm', 't', 's', 'n', 'c', 'ç', 'qu', 'jusqu', 'lorsqu', 'puisqu', 'quoiqu', 'presqu', 'quelqu']);

/** The normalized elided tokens: l', d', j' … */
export const ELIDED: ReadonlySet<string> = new Set([...ELIDABLE_STEMS].map((s) => `${s}'`));

/** Words that contain an apostrophe and stay ONE token (normalized). */
export const FRENCH_WHOLE_APOSTROPHE: ReadonlySet<string> = new Set([
  "aujourd'hui", "quelqu'un", "quelqu'une", "presqu'île", "presqu'îles", "prud'homme", "prud'hommes", "prud'homal", "prud'homale", "prud'homaux",
  "entr'acte", "entr'actes", "entr'ouvert", "entr'ouverte", "entr'ouverts", "entr'ouvertes", "entr'ouvrir",
  "grand'mère", "grand'mères", "grand'rue", "grand'rues", "grand'messe", "grand'messes",
]);

/** After a hyphen, these are their own tokens (the t is the euphonic t of a-t-il). */
export const HYPHEN_CLITICS: ReadonlySet<string> = new Set([
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ce', 'le', 'la', 'les', 'lui', 'leur', 'moi', 'toi', 'y', 'en', 't',
]);

/** Lexical compounds kept whole even though they end in (or contain) a clitic word (normalized). */
export const HYPHEN_KEEP: ReadonlySet<string> = new Set([
  'rendez-vous', 'garde-à-vous', 'vis-à-vis', 'peut-être', "c'est-à-dire", 'au-dessus', 'au-dessous', 'par-dessus', 'par-dessous',
  'là-dessus', 'là-dessous', 'ci-dessus', 'ci-dessous', 'va-et-vient', 'on-dit', "qu'en-dira-t-on", "m'as-tu-vu", 'je-ne-sais-quoi',
  'sauve-qui-peut', 'chez-moi', 'chez-soi', 'quant-à-soi', 'vous-même', 'moi-même', 'toi-même', 'lui-même', 'elle-même',
  'nous-mêmes', 'vous-mêmes', 'eux-mêmes', 'elles-mêmes', 'soi-même',
]);

/** Words that end in -ci / -là and are words of their own: NOT cut (normalized). */
const LA_CI_KEEP: ReadonlySet<string> = new Set([
  'celui-ci', 'celui-là', 'celle-ci', 'celle-là', 'ceux-ci', 'ceux-là', 'celles-ci', 'celles-là',
  'jusque-là', 'par-là', 'par-ci', 'de-ci', 'de-là',
]);

const APOS = new Set([..."'’ʼ‘′`´＇"]);
const HYPH = new Set([..."-‐‑"]);
const GROUP_CHAR = /[\p{L}\p{M}\p{N}_]/u;
const SPACE = /[\s​﻿]/u;
const LETTER = /\p{L}/u;
const DIGIT = /\p{Nd}/u;

type Kind = 'g' | 'a' | 'h' | 'n'; // group · apostrophe · hyphen · decimal separator
interface Item { s: number; e: number; k: Kind }

export function tokenizeFrench(text: string): RawToken[] {
  const out: RawToken[] = [];
  const push = (s: number, e: number): void => {
    const surface = text.slice(s, e);
    out.push({ surface, start: s, end: e, isWord: LETTER.test(surface), normalized: normalizeFr(surface) });
  };
  const norm = (s: number, e: number): string => normalizeFr(text.slice(s, e));
  const charAt = (i: number): string => (i >= 0 && i < text.length ? text[i] : '');
  const isGroupAt = (i: number): boolean => {
    const cp = text.codePointAt(i);
    return cp !== undefined && GROUP_CHAR.test(String.fromCodePoint(cp)) && !APOS.has(text[i]); // ʼ (U+02BC) is a letter to Unicode, an apostrophe to French
  };

  const emitChunk = (items: Item[]): void => {
    // `_` at the edge of a word is an italics mark of its own
    const first = items[0];
    const last = items[items.length - 1];
    if (items.length === 1) {
      const m = /^(_*)(.*?)(_*)$/su.exec(text.slice(first.s, first.e));
      if (m && m[2] && (m[1] || m[3])) {
        if (m[1]) push(first.s, first.s + m[1].length);
        push(first.s + m[1].length, first.e - m[3].length);
        if (m[3]) push(first.e - m[3].length, first.e);
        return;
      }
    } else {
      const lead = /^_+/u.exec(text.slice(first.s, first.e));
      const trail = /_+$/u.exec(text.slice(last.s, last.e));
      const leadLen = lead && lead[0].length < first.e - first.s ? lead[0].length : 0;
      const trailLen = trail && trail[0].length < last.e - last.s ? trail[0].length : 0;
      if (leadLen) { push(first.s, first.s + leadLen); first.s += leadLen; }
      const trailAt = last.e - trailLen;
      last.e = trailAt;
      emitItems(items);
      if (trailLen) push(trailAt, trailAt + trailLen);
      return;
    }
    emitItems(items);
  };

  const emitItems = (items: Item[]): void => {
    const s = items[0].s;
    const e = items[items.length - 1].e;
    if (!LETTER.test(text.slice(s, e))) {
      // numbers: 1 500,50 · 3,5 · 1914-1918 · only a decimal separator joins; hyphens and apostrophes are marks of their own
      let from = -1;
      let to = -1;
      for (const it of items) {
        if (it.k === 'g' || it.k === 'n') { if (from < 0) from = it.s; to = it.e; continue; }
        if (from >= 0) { push(from, to); from = -1; }
        push(it.s, it.e);
      }
      if (from >= 0) push(from, to);
      return;
    }
    emitRange(items, 0, items.length - 1);
  };

  const emitRange = (items: Item[], a: number, b: number): void => {
    if (a === b) { push(items[a].s, items[a].e); return; }
    if (HYPHEN_KEEP.has(norm(items[a].s, items[b].e))) { push(items[a].s, items[b].e); return; }

    // hyphen parts: [first item, last item] of each
    const parts: Array<[number, number]> = [];
    let ps = a;
    for (let i = a; i <= b; i++) if (items[i].k === 'h') { parts.push([ps, i - 1]); ps = i + 1; }
    parts.push([ps, b]);

    const isClitic = ([pa, pb]: [number, number]): boolean => {
      if (pa === pb) return HYPHEN_CLITICS.has(norm(items[pa].s, items[pa].e));
      if (pb === pa + 2 && items[pa + 1].k === 'a') {
        return ['m', 't', 'l'].includes(norm(items[pa].s, items[pa].e)) && ['en', 'y'].includes(norm(items[pb].s, items[pb].e));
      }
      return false;
    };
    let cut = parts.length;
    while (cut > 1 && isClitic(parts[cut - 1])) cut--;

    // the head: parts[0 .. cut-1]
    let headEnd = parts[cut - 1][1];
    let laCi: [number, number] | null = null;
    if (cut >= 2) {
      const lastPart = parts[cut - 1];
      if (lastPart[0] === lastPart[1] && ['ci', 'là'].includes(norm(items[lastPart[0]].s, items[lastPart[0]].e)) && !LA_CI_KEEP.has(norm(items[a].s, items[headEnd].e))) {
        laCi = lastPart;
        headEnd = parts[cut - 2][1];
      }
    }
    emitHead(items, a, headEnd);
    if (laCi) { push(items[laCi[0] - 1].s, items[laCi[0] - 1].e); push(items[laCi[0]].s, items[laCi[0]].e); }
    for (let p = cut; p < parts.length; p++) {
      const [pa, pb] = parts[p];
      push(items[pa - 1].s, items[pa - 1].e); // the hyphen
      if (pa === pb) push(items[pa].s, items[pa].e);
      else { push(items[pa].s, items[pa + 1].e); push(items[pb].s, items[pb].e); }
    }
  };

  /** A head: elision at its start, a whole apostrophe word, or one token. */
  const emitHead = (items: Item[], a: number, b: number): void => {
    if (b >= a + 2 && items[a + 1].k === 'a') {
      if (FRENCH_WHOLE_APOSTROPHE.has(norm(items[a].s, items[a + 2].e))) { push(items[a].s, items[b].e); return; }
      if (ELIDABLE_STEMS.has(norm(items[a].s, items[a].e))) {
        push(items[a].s, items[a + 1].e);
        emitHead(items, a + 2, b);
        return;
      }
    }
    push(items[a].s, items[b].e);
  };

  let i = 0;
  while (i < text.length) {
    if (SPACE.test(text[i])) { i++; continue; }
    if (!isGroupAt(i)) {
      const cp = text.codePointAt(i)!;
      const len = cp > 0xffff ? 2 : 1;
      push(i, i + len);
      i += len;
      continue;
    }
    // a chunk: groups joined by apostrophes, hyphens, and a decimal separator between digits
    const items: Item[] = [];
    let j = i;
    for (;;) {
      let g = j;
      while (g < text.length && isGroupAt(g)) g += text.codePointAt(g)! > 0xffff ? 2 : 1;
      items.push({ s: j, e: g, k: 'g' });
      const c = charAt(g);
      if ((APOS.has(c) || HYPH.has(c)) && g + 1 < text.length && isGroupAt(g + 1)) {
        items.push({ s: g, e: g + 1, k: APOS.has(c) ? 'a' : 'h' });
        j = g + 1;
        continue;
      }
      if ((c === ',' || c === '.') && DIGIT.test(charAt(g - 1)) && DIGIT.test(charAt(g + 1))) {
        items.push({ s: g, e: g + 1, k: 'n' });
        j = g + 1;
        continue;
      }
      j = g;
      break;
    }
    emitChunk(items);
    i = j;
  }
  return out;
}
