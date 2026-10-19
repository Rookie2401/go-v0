/**
 * Open Scriptures Hebrew Bible morphology codes → this adapter's readings.
 *
 * An OSHB token carries a lemma chain ("c/d/776": prefixes וְ and הַ before lemma 776) and a code whose first letter is the
 * language (H Hebrew, A Aramaic) followed by one segment per morpheme, separated by "/": the prefixes first, then the main word,
 * then a suffix ("HC/Td/Ncbsa", "HVqw3ms", "HR/Ncbsc/Sp3ms"). Reference: hb.openscriptures.org/parsing/HebrewMorphologyCodes.html.
 *
 * Feature keys (UD-style where UD has one; the pack explains each): Binyan, Conj, VerbForm, Person, Gender, Number, State,
 * PronType, NumType, NounType, PartType, Polarity, Definite. Values are stable ASCII tokens; `describeHeMorph` (describe.ts)
 * turns them into words. A prefix or suffix becomes a `WordPart` inside the token (`oshbParts`).
 */
import type { PartOfSpeech, WordPart } from '../../core';
import { splitByLetters } from './text';

export const BINYAN_HEBREW: Record<string, string> = {
  q: 'Qal', N: 'Nifal', p: 'Piel', P: 'Pual', h: 'Hifil', H: 'Hofal', t: 'Hitpael', o: 'Polel', O: 'Polal', r: 'Hitpolel', m: 'Poel', M: 'Poal',
  k: 'Palel', K: 'Pulal', Q: 'QalPass', l: 'Pilpel', L: 'Polpal', f: 'Hitpalpel', D: 'Nitpael', j: 'Pealal', i: 'Pilel', u: 'Hotpaal', c: 'Tifil',
  v: 'Hishtafel', w: 'Nitpalel', y: 'Nitpoel', z: 'Hitpoel',
};
export const BINYAN_ARAMAIC: Record<string, string> = {
  q: 'Peal', Q: 'Peil', u: 'Hitpeel', p: 'Pael', P: 'Itpaal', M: 'Hitpaal', a: 'Afel', h: 'Hafel', s: 'Safel', e: 'Shafel', H: 'Hofal', i: 'Itpeel',
  t: 'Hishtafel', v: 'Ishtafel', w: 'Hitafel', o: 'Polel', z: 'Itpoel', r: 'Hitpolel', f: 'Hitpalpel', b: 'Hefal', c: 'Tifel', m: 'Poel', l: 'Palpel',
  L: 'Itpalpel', O: 'Itpolel', G: 'Ittafal',
};
/** Verb type code → Conj value and VerbForm. */
export const CONJ: Record<string, [conj: string, verbForm: 'Fin' | 'Part' | 'Inf']> = {
  p: ['Perf', 'Fin'], q: ['WeQatal', 'Fin'], i: ['Impf', 'Fin'], w: ['Wayyiqtol', 'Fin'], h: ['Coh', 'Fin'], j: ['Juss', 'Fin'], v: ['Imp', 'Fin'],
  r: ['Part', 'Part'], s: ['PassPart', 'Part'], a: ['InfAbs', 'Inf'], c: ['InfCons', 'Inf'],
};
const GENDER: Record<string, string> = { m: 'Masc', f: 'Fem', b: 'Fem,Masc', c: 'Com' };
const NUMBER: Record<string, string> = { s: 'Sing', p: 'Plur', d: 'Dual' };
const STATE: Record<string, string> = { a: 'Abs', c: 'Cons', d: 'Det' };
const PRON: Record<string, string> = { d: 'Dem', f: 'Ind', i: 'Int', p: 'Prs', r: 'Rel' };

/** The prefix morphemes, by the code letter OSHB puts in the lemma chain. */
export const PREFIXES: Record<string, { lemma: string; pos: PartOfSpeech; gloss: string; morph?: Record<string, string> }> = {
  c: { lemma: 'וְ', pos: 'CONJ', gloss: 'and' },
  b: { lemma: 'בְּ', pos: 'ADP', gloss: 'in, with, by' },
  l: { lemma: 'לְ', pos: 'ADP', gloss: 'to, for' },
  k: { lemma: 'כְּ', pos: 'ADP', gloss: 'like, as' },
  m: { lemma: 'מִן', pos: 'ADP', gloss: 'from' },
  d: { lemma: 'הַ', pos: 'DET', gloss: 'the', morph: { Definite: 'Def' } },
  s: { lemma: 'שֶׁ', pos: 'SCONJ', gloss: 'that, which' },
  i: { lemma: 'הֲ', pos: 'PART', gloss: '(question)', morph: { PartType: 'Int' } },
};

export interface OshbSegment { pos: PartOfSpeech; morph: Record<string, string>; role?: string }

/** Decode one code segment (after the language letter). */
export function decodeOshbSegment(seg: string, aramaic: boolean): OshbSegment {
  const c = seg[0];
  const r = seg.slice(1);
  const pgn = (s: string, withPerson: boolean): Record<string, string> => {
    const m: Record<string, string> = {};
    let k = 0;
    if (withPerson) { if (/[123]/.test(s[k] ?? '')) m.Person = s[k]; k++; }
    if (GENDER[s[k] ?? '']) m.Gender = GENDER[s[k]]; k++;
    if (NUMBER[s[k] ?? '']) m.Number = NUMBER[s[k]];
    return m;
  };
  switch (c) {
    case 'V': {
      const binyan = (aramaic ? BINYAN_ARAMAIC[r[0]] : BINYAN_HEBREW[r[0]]) ?? BINYAN_HEBREW[r[0]];
      const conj = CONJ[r[1]];
      const morph: Record<string, string> = {};
      if (binyan) morph.Binyan = binyan;
      if (conj) { morph.Conj = conj[0]; morph.VerbForm = conj[1]; }
      const rest = r.slice(2);
      if (conj?.[1] === 'Part') { Object.assign(morph, pgn(rest, false)); if (STATE[rest[2] ?? '']) morph.State = STATE[rest[2]]; }
      else if (conj?.[1] === 'Fin') Object.assign(morph, pgn(rest, true));
      return { pos: 'VERB', morph };
    }
    case 'N': {
      const morph: Record<string, string> = {};
      if (GENDER[r[1] ?? '']) morph.Gender = GENDER[r[1]];
      if (NUMBER[r[2] ?? '']) morph.Number = NUMBER[r[2]];
      if (STATE[r[3] ?? '']) morph.State = STATE[r[3]];
      if (r[0] === 'g') morph.NounType = 'Gent';
      return { pos: r[0] === 'p' ? 'PROPN' : 'NOUN', morph };
    }
    case 'A': {
      const morph: Record<string, string> = {};
      if (GENDER[r[1] ?? '']) morph.Gender = GENDER[r[1]];
      if (NUMBER[r[2] ?? '']) morph.Number = NUMBER[r[2]];
      if (STATE[r[3] ?? '']) morph.State = STATE[r[3]];
      if (r[0] === 'c') { morph.NumType = 'Card'; return { pos: 'NUM', morph }; }
      if (r[0] === 'o') morph.NumType = 'Ord';
      if (r[0] === 'g') morph.NounType = 'Gent';
      return { pos: 'ADJ', morph };
    }
    case 'P': {
      const morph: Record<string, string> = {};
      if (PRON[r[0] ?? '']) morph.PronType = PRON[r[0]];
      Object.assign(morph, pgn(r.slice(1), true));
      return { pos: 'PRON', morph };
    }
    case 'R': return { pos: 'ADP', morph: r === 'd' ? { Definite: 'Def' } : {}, ...(r === 'd' ? { role: 'preposition with the article fused into it' } : {}) };
    case 'C': return { pos: 'CONJ', morph: {} };
    case 'D': return { pos: 'ADV', morph: {} };
    case 'T':
      switch (r[0]) {
        case 'd': return { pos: 'DET', morph: { Definite: 'Def' } };
        case 'o': return { pos: 'PART', morph: { PartType: 'Obj' }, role: 'object marker' };
        case 'n': case 'm': return { pos: 'PART', morph: { Polarity: 'Neg' } };
        case 'i': return { pos: 'PART', morph: { PartType: 'Int' } };
        case 'j': return { pos: 'INTJ', morph: {} };
        case 'a': return { pos: 'PART', morph: { PartType: 'Aff' } };
        case 'e': return { pos: 'PART', morph: { PartType: 'Exh' } };
        case 'r': return { pos: 'SCONJ', morph: { PronType: 'Rel' } };
        default: return { pos: 'PART', morph: {} };
      }
    case 'S': {
      switch (r[0]) {
        case 'p': return { pos: 'PRON', morph: { PronType: 'Prs', ...pgn(r.slice(1), true) }, role: 'pronominal suffix' };
        case 'd': return { pos: 'PART', morph: { Case: 'Dir' }, role: 'directional he' };
        case 'h': return { pos: 'PART', morph: {}, role: 'paragogic he' };
        case 'n': return { pos: 'PART', morph: {}, role: 'paragogic nun' };
        default: return { pos: 'PART', morph: {}, role: 'suffix' };
      }
    }
    default: return { pos: 'X', morph: {} };
  }
}

export interface OshbReading {
  aramaic: boolean;
  /** The main word's part of speech and features. */
  pos: PartOfSpeech;
  morph: Record<string, string>;
  role?: string;
  /** Prefix codes in order (from the lemma chain) and their decoded segments. */
  prefixes: Array<{ code: string; seg: OshbSegment }>;
  suffix?: OshbSegment;
  /** Index of the main segment in the code. */
  mainIndex: number;
}

/** The whole code with its lemma chain. */
export function decodeOshb(lemma: string, code: string): OshbReading {
  const aramaic = code[0] === 'A';
  const segs = code.slice(1).split('/');
  const prefixCodes = lemma.split('/').slice(0, -1);
  const prefixes: OshbReading['prefixes'] = [];
  let i = 0;
  for (; i < prefixCodes.length && i < segs.length - 1; i++) prefixes.push({ code: prefixCodes[i], seg: decodeOshbSegment(segs[i], aramaic) });
  const main = decodeOshbSegment(segs[i] ?? '', aramaic);
  const out: OshbReading = { aramaic, pos: main.pos, morph: { ...main.morph }, prefixes, mainIndex: i, ...(main.role ? { role: main.role } : {}) };
  // the article as a prefix (Td), or fused into a preposition (Rd), makes the word definite
  if (prefixes.some((p) => p.seg.morph.Definite === 'Def')) out.morph.Definite = 'Def';
  for (let j = i + 1; j < segs.length; j++) {
    const s = decodeOshbSegment(segs[j], aramaic);
    if (segs[j][0] === 'S') out.suffix = s;
    else if (segs[j] === 'Rd' || segs[j] === 'Td') out.morph.Definite = 'Def';
  }
  return out;
}

/** The main word's part of speech only (for the build scripts' tallies). */
export const posOfOshb = (lemma: string, code: string): { pos: PartOfSpeech; main: string } => {
  const r = decodeOshb(lemma, code);
  return { pos: r.pos, main: code.slice(1).split('/')[r.mainIndex] ?? '' };
};

/**
 * The parts of the written word — prefixes · stem · suffix — cut at the source's morpheme boundaries (`seg`: letters per piece,
 * "1/1/3"), each mark staying with its letter. `start`/`end` are offsets inside `surface`. Empty when the word has no affixes or the
 * counts do not fit the surface (nothing is guessed).
 */
export function oshbParts(surface: string, reading: OshbReading, seg: string | undefined, headword: string | undefined, posOfMain: PartOfSpeech): WordPart[] {
  if (!seg) return [];
  const counts = seg.split('/').map(Number);
  if (counts.length < 2) return [];
  const pieces = splitByLetters(surface, counts);
  if (!pieces) return [];
  const out: WordPart[] = [];
  let at = 0;
  const nPre = reading.prefixes.length;
  pieces.forEach((piece, k) => {
    const start = at;
    const end = at + piece.length;
    at = end;
    if (k < nPre) {
      const p = PREFIXES[reading.prefixes[k].code];
      const seg2 = reading.prefixes[k].seg;
      out.push({ text: piece, start, end, lemma: p?.lemma ?? piece, pos: seg2.pos, morph: { ...(p?.morph ?? {}), ...seg2.morph }, role: seg2.role ?? (p?.gloss ?? 'prefix') });
    } else if (k === nPre) {
      out.push({ text: piece, start, end, ...(headword ? { lemma: headword } : {}), pos: posOfMain, morph: { ...reading.morph }, role: 'stem' });
    } else {
      const s = reading.suffix;
      const role = s?.role === 'pronominal suffix' ? (reading.pos === 'VERB' ? 'object suffix' : reading.pos === 'ADP' ? 'object of the preposition' : 'possessive suffix') : (s?.role ?? 'suffix');
      out.push({ text: piece, start, end, pos: s?.pos ?? 'PART', morph: { ...(s?.morph ?? {}) }, role });
    }
  });
  return out;
}
