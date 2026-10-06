/**
 * The German sentence layer's working structures (package GC): one reading in the pipeline, one token, the clauses of a
 * sentence, and the few operations every step shares. Nothing here is a parser. A step reads the neighbouring words,
 * moves a reading to the front (`prefer`), narrows a set of case / gender / number cells (`applyCells`), and says in
 * `notes.context` what decided. A reading is never invented by a step that does not own it and never deleted from a
 * list somebody else gave.
 */
import type { AnalysisCandidate, RawToken } from '../../core';
import type { DeCase, DeCell, DeGender, DeLexiconView } from './types';
import { morphOfCells } from './types';

export type C = AnalysisCandidate;

export const DE_ANALYZER_VERSION = '6';
export const DE_ANALYZER = `adapter-de@${DE_ANALYZER_VERSION}`;
/** Where the adapter's own data comes from. All of it is machine-drafted: none has been checked by a native speaker. */
export const DE_SOURCE_IDS = {
  hand: `${DE_ANALYZER}:hand`,
  phrases: `${DE_ANALYZER}:phrases`,
  constructions: `${DE_ANALYZER}:constructions`,
  rules: `${DE_ANALYZER}:rules`,
} as const;

/** One reading on its way through the steps. `own`: the adapter's engine made it (a dictionary's reading is `own: false` and is only ever moved). */
export interface R {
  c: C;
  cells?: DeCell[];
  prefix?: { text: string; attached: boolean };
  own: boolean;
  /** Context moved this reading behind another (its confidence is at most 0.4). */
  down?: boolean;
  /** A reading that only follows the ordinary ones (an unconfirmed separable verb): it stays behind them. */
  late?: boolean;
}

export interface Tok {
  i: number;
  raw: RawToken;
  word: boolean;
  /** The adapter's own token (its readings may be narrowed); false = a list somebody else gave. */
  own: boolean;
  /** Not to be touched at all (its analyzer is not one `refine` may reorder): it only serves as a neighbour. */
  frozen: boolean;
  rs: R[];
  /** The written form begins with a capital letter; `caps`: it is written in capitals throughout (HERR). */
  cap: boolean;
  caps: boolean;
  /** A sentence, a quotation or direct speech may begin here. */
  start: boolean;
}

export interface Clause {
  /** Indexes of the word tokens, in order (a leading und / aber / oder is not among them). */
  words: number[];
  /** The separator characters directly in front of the clause and directly after it. */
  open: string;
  close: string;
  /** The coordinating conjunction that opens this clause ("und gehe aus"), or -1. */
  lead: number;
  /** The first clause of the sentence. */
  first: boolean;
}

/** A noun phrase: [preposition or contraction]? [determiner]? [adjective]* noun. Its members share one set of cells for the rest of the pipeline. */
export interface Phrase {
  prep?: Tok; contraction?: Tok; det?: Tok; adjs: Tok[]; noun: Tok; numeral?: boolean;
  /** A case a later step decided for the whole phrase (the dative object of a dative verb); `why` says so in `notes.context`. */
  force?: { cases: DeCase[]; why: string };
  /** What the case rules decided for the whole phrase, kept so that settling it again repeats the reason. */
  reasons?: string[];
}

export interface Sent {
  /** The noun phrases the agreement step found (empty until it has run). */
  phrases: Phrase[];
  lex: DeLexiconView;
  toks: Tok[];
  clauses: Clause[];
  clauseOf: number[];
  /** The sentence-final punctuation mark ('.', '!', '?', or ''). */
  endMark: string;
  /** Every letter of the sentence is a capital: capitals say nothing. */
  allCaps: boolean;
}

// ───────────────────────────── small helpers ─────────────────────────────

export const norm = (s: string): string => s.normalize('NFC').toLocaleLowerCase('de');
export const capitalise = (s: string): string => (s ? s[0].toLocaleUpperCase('de') + s.slice(1) : s);
export const isUpper = (s: string): boolean => /^\p{Lu}/u.test(s);

export const feat = (c: C | undefined, k: string): string[] => (c?.morph[k] ?? '').split(',').filter(Boolean);
export const has = (c: C | undefined, k: string, v: string): boolean => feat(c, k).includes(v);
export const exact = (c: C | undefined, k: string, v: string): boolean => c?.morph[k] === v;

export const isVerbal = (c: C | undefined): boolean => c?.pos === 'VERB' || c?.pos === 'AUX';
/** A finite reading (a union that still holds Fin counts: the position decides the rest). */
export const isFin = (c: C | undefined): boolean => isVerbal(c) && has(c, 'VerbForm', 'Fin') && !has(c, 'VerbForm', 'Part');
export const isInf = (c: C | undefined): boolean => isVerbal(c) && exact(c, 'VerbForm', 'Inf');
export const isPart = (c: C | undefined): boolean => isVerbal(c) && exact(c, 'VerbForm', 'Part') && exact(c, 'Tense', 'Past');
export const isNounLike = (c: C | undefined): boolean => c?.pos === 'NOUN' || c?.pos === 'PROPN';

export const live = (t: Tok): R[] => t.rs.filter((r) => !r.down);
export const anyLive = (t: Tok | undefined, f: (c: C) => boolean): boolean => !!t && t.word && t.rs.some((r) => !r.down && f(r.c));
/** The reading a reader would see first. */
export const top = (t: Tok | undefined): R | undefined => (t && t.word ? t.rs.find((r) => !r.down) ?? t.rs[0] : undefined);

export function cloneCandidate(c: C): C {
  const n: C = { ...c, morph: { ...c.morph } }; // the spread keeps `unconfirmed`, `origin`, `sourceId`
  if (c.notes) { n.notes = {}; for (const k in c.notes) { const v = c.notes[k]; n.notes[k] = Array.isArray(v) ? [...v] : v; } }
  if (c.parts) n.parts = c.parts.map((p) => ({ ...p, ...(p.morph ? { morph: { ...p.morph } } : {}) }));
  if (c.varieties) n.varieties = [...c.varieties];
  if (c.register) n.register = [...c.register];
  if (c.orthography) n.orthography = { ...c.orthography };
  if (c.unit) n.unit = { ...c.unit, pieces: [...c.unit.pieces] };
  return n;
}

export function cloneR(r: R): R {
  const n: R = { c: cloneCandidate(r.c), own: r.own };
  if (r.cells) n.cells = r.cells.map((x) => ({ ...x }));
  if (r.prefix) n.prefix = { ...r.prefix };
  if (r.down) n.down = true;
  if (r.late) n.late = true;
  return n;
}

// ───────────────────────────── cells ─────────────────────────────

const CASE_OF: Record<string, DeCase> = { Nom: 'N', Acc: 'A', Dat: 'D', Gen: 'G' };
const GENDER_OF: Record<string, DeGender> = { Masc: 'm', Fem: 'f', Neut: 'n' };
const CASES: DeCase[] = ['N', 'A', 'D', 'G'];

/** The cells of a reading: the engine's, or (for a dictionary's reading) those its case / gender / number features allow. Undefined = it says nothing of the three. */
export function cellsOf(r: R): DeCell[] | undefined {
  if (r.cells) return r.cells;
  const m = r.c.morph;
  if (!m.Case && !m.Gender && !m.Number) return undefined;
  const cases = feat(r.c, 'Case').map((x) => CASE_OF[x]).filter(Boolean);
  const genders = feat(r.c, 'Gender').map((x) => GENDER_OF[x]).filter(Boolean);
  const numbers = feat(r.c, 'Number');
  const out: DeCell[] = [];
  for (const c of cases.length ? cases : CASES) {
    if (!numbers.length || numbers.includes('Sing')) for (const g of genders.length ? genders : (['m', 'f', 'n'] as DeGender[])) out.push({ c, g });
    if (!numbers.length || numbers.includes('Plur')) out.push({ c, g: 'p' });
  }
  return out;
}

export const pairKey = (x: DeCell): string => `${x.c}${x.g}`;

const NOMINAL_KEYS = ['Case', 'Gender', 'Number', 'Decl'] as const;

/** Gender a noun has in the lexicon, when the lexicon says one (Band m / n / f does not). */
export function lexicalGender(lex: DeLexiconView, lemma: string | undefined): DeGender | undefined {
  if (!lemma) return undefined;
  const genders = new Set(lex.nouns(norm(lemma)).map((n) => n.gender));
  if (genders.size !== 1) return undefined;
  const g = [...genders][0];
  return g === 'm' || g === 'f' || g === 'n' ? g : undefined;
}

const GENDER_NAME: Record<DeGender, string> = { m: 'Masc', f: 'Fem', n: 'Neut' };

/** Write a narrowed set of cells into an own reading: `cells` and the morph features (a noun keeps its lexical gender in the plural too). */
export function applyCells(r: R, cells: DeCell[], gender?: DeGender): void {
  const morph: Record<string, string> = {};
  for (const k of Object.keys(r.c.morph)) if (!(NOMINAL_KEYS as readonly string[]).includes(k)) morph[k] = r.c.morph[k];
  Object.assign(morph, morphOfCells(cells));
  if (gender && !morph.Gender) morph.Gender = GENDER_NAME[gender];
  // a noun keeps its (single) gender in the plural, where the cells name none
  else if (!morph.Gender && cells.every((x) => x.g === 'p') && r.c.pos === 'NOUN') { const g = r.c.morph.Gender; if (g && !g.includes(',')) morph.Gender = g; }
  // keep the engine's feature order tidy: nominal features first
  r.c.morph = morph;
  r.cells = cells;
}

// ───────────────────────────── notes, confidence, order ─────────────────────────────

export function addNote(c: C, key: string, value: string): void {
  c.notes = { ...(c.notes ?? {}), [key]: value };
}

export function addContext(r: R, why: string): void {
  const had = r.c.notes?.context;
  if (typeof had === 'string') {
    if (had.split('; ').includes(why)) return;
    addNote(r.c, 'context', `${had}; ${why}`);
  } else addNote(r.c, 'context', why);
}

/** Set the parts of a reading's context that start with one of `kinds` anew (a decision that is made again after the phrase changed), keeping the others. */
export function replaceContext(r: R, why: string[], kinds: RegExp): void {
  const had = typeof r.c.notes?.context === 'string' ? (r.c.notes?.context as string).split('; ') : [];
  const kept = had.filter((x) => !kinds.test(x));
  const next = [...kept, ...why.filter((x) => !kept.includes(x))];
  if (next.length) addNote(r.c, 'context', next.join('; '));
}

export const DOWN = 0.4;

export function markDown(r: R): void {
  r.down = true;
  r.c.confidence = Math.min(r.c.confidence, DOWN);
}

/**
 * Move the readings that satisfy `keep` to the front, mark the others down (confidence at most 0.4) and say why on the
 * winners. Nothing is removed. Does nothing when no live reading satisfies `keep`. Returns whether it decided anything.
 */
export function prefer(t: Tok, keep: (r: R) => boolean, why: string): boolean {
  if (t.frozen) return false;
  const yes = t.rs.filter((r) => !r.down && keep(r));
  if (!yes.length) return false;
  const losers = t.rs.filter((r) => !r.down && !keep(r));
  if (!losers.length) return false;
  for (const r of losers) markDown(r);
  for (const r of yes) addContext(r, why);
  settle(t);
  return true;
}

/** Keep the live readings in front of the ones context moved down, each group in its order. */
export function settle(t: Tok): void {
  const key = (r: R): number => (r.down ? 2 : 0) + (r.late ? 1 : 0);
  t.rs = t.rs.map((r, k) => [r, k] as const).sort((a, b) => key(a[0]) - key(b[0]) || a[1] - b[1]).map(([r]) => r);
}

/** Mark readings down (and move them behind the others); the opposite of `prefer`. */
export function demote(t: Tok, drop: (r: R) => boolean, why: string): boolean {
  return prefer(t, (r) => !drop(r), why);
}

// ───────────────────────────── sentence structure ─────────────────────────────

const SEPARATOR = /^[\p{P}\p{S}]+$/u;
const KEEP_INSIDE = /^[-'’‐]$/u;
const OPENERS = /[„“”«»‚‘"':.!?…—–(]/u;

export function isSeparator(t: Tok): boolean {
  return !t.word && SEPARATOR.test(t.raw.surface) && !KEEP_INSIDE.test(t.raw.surface);
}

const COORDINATORS = new Set(['und', 'oder', 'aber', 'sondern', 'denn']);

/** Is a sentence, a quotation or direct speech beginning at token i? */
function startsAt(toks: Tok[], i: number): boolean {
  for (let k = i - 1; k >= 0; k--) {
    const t = toks[k];
    if (t.word) return false;
    if (OPENERS.test(t.raw.surface) && isSeparator(t)) return true;
  }
  return true;
}

const isCapitalWord = (s: string): boolean => /^\p{Lu}/u.test(s);
const isAllCaps = (s: string): boolean => s.length > 1 && s === s.toLocaleUpperCase('de') && s !== s.toLocaleLowerCase('de');

export function makeToks(tokens: RawToken[], own: (i: number) => boolean, frozen: (i: number) => boolean, readings: (i: number) => R[]): Tok[] {
  const toks: Tok[] = tokens.map((raw, i) => ({
    i, raw, word: raw.isWord, own: own(i), frozen: frozen(i), rs: raw.isWord ? readings(i) : [],
    cap: raw.isWord && isCapitalWord(raw.surface), caps: raw.isWord && isAllCaps(raw.surface), start: false,
  }));
  for (const t of toks) if (t.word) t.start = startsAt(toks, t.i);
  return toks;
}

/** Clauses: stretches of words between separators; a coordinating conjunction followed by a verb (or a subject and a verb) opens a new clause. */
export function makeSent(lex: DeLexiconView, toks: Tok[]): Sent {
  const clauses: Clause[] = [];
  const clauseOf: number[] = toks.map(() => -1);
  let cur: Clause = { words: [], open: '', close: '', lead: -1, first: true };
  let sep = '';
  const close = (after: string): void => {
    if (cur.words.length) { cur.close = after; clauses.push(cur); }
  };
  for (const t of toks) {
    if (isSeparator(t)) {
      if (cur.words.length) { close(t.raw.surface); cur = { words: [], open: '', close: '', lead: -1, first: false }; sep = ''; }
      sep += t.raw.surface;
      cur.open = sep;
      continue;
    }
    if (t.word) cur.words.push(t.i);
  }
  close('');
  // a comma between two coordinated adjectives of one noun phrase is no clause boundary (einen noch nie gefühlten, leichten, dumpfen Schmerz)
  const adjectiveLike = (t: Tok): boolean => anyLive(t, (c) => (c.pos === 'ADJ' || (isVerbal(c) && has(c, 'VerbForm', 'Part'))) && !!c.morph.Case)
    && !anyLive(t, (c) => isFin(c)) && /(e|en|er|es|em)$/u.test(t.raw.normalized) && !t.cap;
  for (let k = clauses.length - 1; k > 0; k--) {
    const prev = clauses[k - 1];
    const cur = clauses[k];
    if (prev.close !== ',' || cur.open !== ',') continue;
    if (!adjectiveLike(toks[prev.words[prev.words.length - 1]]) || !adjectiveLike(toks[cur.words[0]])) continue;
    prev.words.push(...cur.words);
    prev.close = cur.close;
    clauses.splice(k, 1);
  }
  // split a clause at a coordinating conjunction that opens a new clause: a verb form that cannot be an infinitive, or a
  // subject pronoun / article and such a verb, follows ("und gehe aus", "und sie kocht"); "Brot und Milch kaufen" does not split
  const finiteAfter = (from: number, to: number): boolean => {
    for (let k = from; k < to; k++) if (anyLive(toks[k], (c) => isFin(c))) return true;
    return false;
  };
  const trueFinite = (t: Tok): boolean => anyLive(t, (c) => isFin(c) && (has(c, 'Person', '1') || has(c, 'Person', '2') || (has(c, 'Person', '3') && has(c, 'Number', 'Sing'))))
    && !anyLive(t, (c) => isInf(c));
  const subjectWord = (t: Tok): boolean => anyLive(t, (c) => c.pos === 'PRON' && has(c, 'PronType', 'Prs') && has(c, 'Case', 'Nom')) || anyLive(t, (c) => c.pos === 'DET');
  const out: Clause[] = [];
  for (const cl of clauses) {
    let startAt = 0;
    for (let w = 1; w < cl.words.length - 1; w++) {
      const t = toks[cl.words[w]];
      if (!COORDINATORS.has(t.raw.normalized) || t.cap) continue;
      const rest = cl.words.slice(w + 1);
      const left = cl.words.slice(startAt, w);
      if (!left.length) continue;
      const isNew = trueFinite(toks[rest[0]]) || (subjectWord(toks[rest[0]]) && rest.slice(1).some((k) => trueFinite(toks[k])));
      if (!isNew || !finiteAfter(left[0], left[left.length - 1] + 1)) continue;
      out.push({ words: left, open: startAt === 0 ? cl.open : '', close: '', lead: startAt === 0 ? -1 : cl.words[startAt - 1], first: cl.first && startAt === 0 });
      startAt = w + 1;
    }
    out.push({ words: cl.words.slice(startAt), open: startAt === 0 ? cl.open : '', close: cl.close, lead: startAt === 0 ? -1 : cl.words[startAt - 1], first: cl.first && startAt === 0 });
  }
  out.forEach((cl, k) => { for (const w of cl.words) clauseOf[w] = k; if (cl.lead >= 0) clauseOf[cl.lead] = k; });
  const letters = toks.filter((t) => t.word && t.raw.surface.length > 1);
  const endTok = [...toks].reverse().find((t) => isSeparator(t) && /^[.!?…]+$/u.test(t.raw.surface));
  return {
    lex, toks, clauses: out, clauseOf, phrases: [],
    endMark: endTok && toks.slice(endTok.i + 1).every((t) => !t.word) ? endTok.raw.surface.slice(-1) : '',
    allCaps: letters.length > 0 && letters.every((t) => t.caps),
  };
}

// ───────────────────────────── subordinate clauses ─────────────────────────────

/** Conjunctions that send the conjugated verb to the end of the clause. */
export const SUBORDINATORS = new Set([
  'dass', 'daß', 'weil', 'wenn', 'ob', 'obwohl', 'obgleich', 'obschon', 'wenngleich', 'damit', 'bevor', 'ehe', 'nachdem', 'sobald',
  'solange', 'falls', 'indem', 'sodass', 'seitdem', 'als', 'während', 'da', 'bis', 'seit', 'sofern', 'soweit', 'zumal', 'wohingegen',
  // je mehr er liest, …: the je clause ends in its verb, like a clause with a conjunction (desto / umso then open a main clause)
  'je',
]);
/** Question words and relative words that open a verb-final clause after a comma. */
export const OPENING_WORDS = new Set([
  'wer', 'wen', 'wem', 'wessen', 'was', 'wo', 'wie', 'warum', 'wann', 'wohin', 'woher', 'wieso', 'weshalb', 'weswegen', 'welcher', 'welche', 'welches', 'welchen',
  'welchem', 'der', 'die', 'das', 'dem', 'den', 'dessen', 'deren', 'denen', 'womit', 'wofür', 'worauf', 'wovon', 'wozu', 'woran', 'worüber', 'wobei', 'wodurch',
]);

/** Does this clause end with its conjugated verb, as a subordinate clause does? (A conjunction or question word opens it and a finite verb stands last.) */
/** The first word of a clause that is not a coordinating conjunction (", und wer keine hat": wer). */
export function headWord(s: Sent, cl: Clause): Tok {
  const first = s.toks[cl.words[0]];
  return cl.words.length > 2 && COORDINATORS.has(first.raw.normalized) && !first.cap ? s.toks[cl.words[1]] : first;
}

export function verbFinalClause(s: Sent, cl: Clause): boolean {
  if (cl.words.length < 2) return false;
  const first = headWord(s, cl);
  const n = first.raw.normalized;
  const afterComma = /,/.test(cl.open);
  const lastTok = s.toks[cl.words[cl.words.length - 1]];
  const finalFinite = anyLive(lastTok, (c) => isFin(c));
  if (SUBORDINATORS.has(n) && (afterComma || cl.first || /[:„“«»]/u.test(cl.open))) return finalFinite;
  // (a question word that opens the sentence and is closed by a comma opens a clause that ends in its verb, as a free relative does: Wer keine Karte hat, muss zahlen)
  if (OPENING_WORDS.has(n) && (afterComma || (cl.first && /,/.test(cl.close)))) {
    // wie hat Ihnen der Gottesdienst gefallen?: a question word with the finite verb right behind it opens a main clause, not a clause ending in its verb
    const at = cl.words.indexOf(first.i);
    const second = s.toks[cl.words[at + 1]];
    const secondFiniteOnly = !!second && second.rs.some((r) => !r.down) && second.rs.filter((r) => !r.down).every((r) => isFin(r.c));
    if (secondFiniteOnly && at + 1 < cl.words.length - 1) return false;
    return finalFinite;
  }
  // preposition + relative pronoun: ", mit dem er spricht"
  if (afterComma && cl.words.length > 2 && s.lex.preposition(n)) {
    const second = s.toks[cl.words[cl.words.indexOf(first.i) + 1]];
    if (OPENING_WORDS.has(second.raw.normalized)) return finalFinite;
  }
  return false;
}

/** Prepositions that open an infinitive clause with zu (um … zu, ohne … zu, anstatt … zu). */
const INFINITIVE_OPENERS = new Set(['um', 'ohne', 'anstatt', 'statt']);

/** The index (into the clause's words) of the finite verb's position: the last word of a verb-final clause, else the first word that can be finite. */
export function finiteSlot(s: Sent, cl: Clause): number {
  if (verbFinalClause(s, cl)) return cl.words.length - 1;
  // um die Beine nicht sehen zu müssen: an infinitive clause has no finite verb of its own unless a word can only be finite
  if (INFINITIVE_OPENERS.has(s.toks[cl.words[0]].raw.normalized) && cl.words.some((k) => s.toks[k].raw.normalized === 'zu' || s.toks[k].rs.some((r) => r.c.parts?.some((p) => p.kind === 'marker' && p.text === 'zu')))) {
    return cl.words.findIndex((k) => { const t = s.toks[k]; const live = t.rs.filter((r) => !r.down); return live.length > 0 && live.every((r) => isFin(r.c)); });
  }
  for (let w = 0; w < cl.words.length; w++) {
    const t = s.toks[cl.words[w]];
    if (!anyLive(t, (c) => isFin(c))) continue;
    if (w > 0 && s.toks[cl.words[w - 1]].raw.normalized === 'zu') continue; // zu sehen: the infinitive, whatever else it looks like
    // Leben ist schön: a first word that is also a noun or an adjective, with a finite verb right after it, is not the verb
    if (w === 0 && cl.words.length > 1 && anyLive(t, (c) => !isFin(c) && !isVerbal(c))) {
      const nx = s.toks[cl.words[1]];
      if (isFin(top(nx)?.c) && !anyLive(nx, (c) => isInf(c))) continue;
    }
    return w;
  }
  return -1;
}

/**
 * The clause that stands in front of the clauses inserted before the verb of main clause `ci`: in "Die Kinder, die im Garten
 * spielten, lachten laut" the matrix verb opens its own stretch and the subject is the fragment "Die Kinder". -1 when there is none.
 */
export function matrixFragment(s: Sent, ci: number): number {
  const cl = s.clauses[ci];
  if (!cl || ci === 0 || verbFinalClause(s, cl) || finiteSlot(s, cl) !== 0) return -1;
  let j = ci - 1;
  while (j >= 0 && /,/.test(s.clauses[j + 1].open) && verbFinalClause(s, s.clauses[j])) j--;
  if (j === ci - 1 || j < 0) return -1;
  if (finiteSlot(s, s.clauses[j]) >= 0) return -1;
  return j;
}
