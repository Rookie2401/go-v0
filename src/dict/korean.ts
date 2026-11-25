/// <reference types="node" />
/**
 * Korean specifics of the dictionary and lexicon builds (2026-11-25).
 *
 * ONE reading of the Wiktionary Korean extract (kaikki.org) serves both builds, so that they cannot drift:
 *   - scripts/ko-build-lexicon.mts (the stem lexicon: class, conjugation class, homonym numbers, gloss, Hanja ...), and
 *   - the dictionary build (src/dict/build-node.ts), which files every entry of a homonym set ALSO under its numbered headword
 *     (눈², as src/dict/hebrew.ts files a pointed spelling) so that a lookup of 눈² finds snow alone and 눈 finds all four.
 *
 * Nothing here is invented: the headword, its class, its conjugation class (read off the entry's own `infinitive` forms), its
 * gloss, its Hanja and its pronunciation are the source's. The homonym number is the source's own etymology number.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import type { DictionaryEntry } from '../core';
import { FINALS, VOWELS, compose, decompose, finalOf, isHangulSyllable, koKey, withFinal } from '../adapters/korean/hangul';
import { koBareLemma, koHomonymLemma, koHomonymSetKey, koSharedPos, type KoIrregular, type KoLexEntry, type KoTag } from '../adapters/korean/index-store';

// ───────────────────────────── the slim record ─────────────────────────────

export interface KoRawSense { glosses: string[]; tags: string[]; formOf: string[]; altOf: string[] }
/** The fields of one extract line the builds read (the lines are 3 KB on average; the whole file is never held fat). */
export interface KoRaw {
  no: number; // 1-based line number of the extract
  word: string;
  pos: string;
  etym?: string;
  hanjaForms: string[];
  hanjaArg?: string;
  verbSet?: string[]; // [base, passive, causative] of a ko-verb-set head template
  infinitives: string[];
  /** The informal non-past indicative of the conjugation TABLE (the 아/어 form the table actually shows). */
  tableInf?: string;
  hangeul: string[];
  senses: KoRawSense[];
  /** `Korean terms suffixed with -X` categories (X without hyphen and without the parenthetical). */
  suffixed: string[];
  counterCat: boolean;
  /** A "bound nouns" / "dependent nouns" category. */
  depCat: boolean;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((t): t is string => typeof t === 'string' && !!t.trim()) : []);
const catNames = (x: unknown): string[] => (Array.isArray(x) ? x.filter(isObj).map((c) => c.name).filter((n): n is string => typeof n === 'string') : []);

export function koSlim(line: string, no: number): KoRaw | undefined {
  if (!line.trim()) return undefined;
  let e: Record<string, unknown>;
  try { const j = JSON.parse(line.replace(/^﻿/, '')) as unknown; if (!isObj(j)) return undefined; e = j; } catch { return undefined; }
  if (typeof e.word !== 'string' || typeof e.pos !== 'string') return undefined;
  const r: KoRaw = { no, word: e.word, pos: e.pos, hanjaForms: [], infinitives: [], hangeul: [], senses: [], suffixed: [], counterCat: false, depCat: false };
  if (e.etymology_number !== undefined && e.etymology_number !== null) r.etym = String(e.etymology_number);
  for (const h of Array.isArray(e.head_templates) ? e.head_templates.filter(isObj) : []) {
    const args = isObj(h.args) ? h.args : {};
    if (typeof args.hanja === 'string' && args.hanja.trim() && r.hanjaArg === undefined) r.hanjaArg = args.hanja.trim();
    if (h.name === 'ko-verb-set') r.verbSet = ['1', '2', '3'].map((k) => (typeof args[k] === 'string' ? (args[k] as string).trim() : ''));
  }
  for (const f of Array.isArray(e.forms) ? e.forms.filter(isObj) : []) {
    const tags = strs(f.tags);
    if (typeof f.form !== 'string') continue;
    if (tags.includes('hanja')) r.hanjaForms.push(f.form.trim());
    else if (tags.includes('infinitive') && !f.source) r.infinitives.push(koKey(f.form.trim()));
    else if (f.source === 'conjugation' && r.tableInf === undefined && tags.includes('informal') && tags.includes('non-past') && tags.includes('indicative') && !tags.includes('polite') && !tags.includes('honorific')) r.tableInf = koKey(f.form.trim());
  }
  for (const s of Array.isArray(e.sounds) ? e.sounds.filter(isObj) : []) if (typeof s.hangeul === 'string' && s.hangeul.trim()) r.hangeul.push(s.hangeul.trim());
  const cats = [...catNames(e.categories)];
  for (const s of Array.isArray(e.senses) ? e.senses.filter(isObj) : []) {
    const words = (x: unknown): string[] => (Array.isArray(x) ? x.filter(isObj).map((o) => o.word).filter((w): w is string => typeof w === 'string') : []);
    r.senses.push({ glosses: strs(s.glosses), tags: strs(s.tags), formOf: words(s.form_of), altOf: words(s.alt_of) });
    cats.push(...catNames(s.categories));
  }
  for (const c of cats) {
    const m = /^Korean terms suffixed with -?(.+?)(?: \(.*\))?$/u.exec(c);
    if (m) r.suffixed.push(m[1]);
    if (/counters?$/i.test(c) && !/Middle Korean/.test(c)) r.counterCat = true;
    if (/(?:bound|dependent) nouns?$/i.test(c) && !/Middle Korean/.test(c)) r.depCat = true;
  }
  return r;
}

/** Streams the extract (never held whole) and returns its slim records in file order. */
export async function koReadSlim(file: string): Promise<KoRaw[]> {
  const out: KoRaw[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  let no = 0;
  for await (const line of rl) { no++; const r = koSlim(line, no); if (r) out.push(r); }
  return out;
}

// ───────────────────────────── gloss ─────────────────────────────

/** A sense that only points at another word (form of, alternative spelling, North Korean form, short for ...). */
const FORM_GLOSS = /^(?:an?\s+)?(?:[\p{L}'’-]+\s+(?:and\s+)?){0,5}?(?:form|spelling|variant|rendering|pronunciation|romanization|transliteration|misspelling|contraction|abbreviation|initialism|acronym|name)\s+(?:of|for)\b|^short for\b|^(?:abbreviation|contraction|misspelling|alternative|dialectal|nonstandard|non-standard|obsolete|archaic)\b.*\b(?:of|for)\s+\S/iu;
export function koSenseIsForm(s: KoRawSense): boolean {
  if (s.formOf.length || s.altOf.length) return true;
  if (s.tags.includes('form-of') || s.tags.includes('alt-of')) return true;
  return s.glosses.length > 0 && FORM_GLOSS.test(s.glosses[0]);
}

/** The first gloss cut at its first top-level "," or ";" (inside brackets stay), a leading parenthesised label removed, at most 80 characters. */
export function koShortGloss(g: string): string {
  let t = g.trim().replace(/:$/, '');
  for (;;) { const m = /^\([^)]*\)\s*/.exec(t); if (!m || m[0].length >= t.length) break; t = t.slice(m[0].length); }
  let depth = 0;
  let cut = t.length;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if ((ch === ',' || ch === ';') && depth === 0) { cut = i; break; }
  }
  let s = t.slice(0, cut).trim();
  if (s.length > 80) { const sp = s.lastIndexOf(' ', 79); s = `${s.slice(0, sp > 20 ? sp : 79).trim()}…`; }
  return s;
}

/** A gloss that only points at another word: "synonym of X", "See the entry at X". */
const POLITE_OF = /(?:polite|formal|honorific|deferential)[^,;]*\b(?:form|style|speech)\b[^,;]*\bof\b|^(?:polite|formal) /i;
/** The headwords a polite or inflected form may belong to (감사합니다 → 감사하다, 가세요 → 가다 / 가시다). */
export function koPoliteBases(lemma: string): string[] {
  const out: string[] = [];
  const m = (re: RegExp, f: (p: string) => string[]): void => { const x = re.exec(lemma); if (x && x[1]) out.push(...f(x[1])); };
  m(/^(.+)합니다$/, (p) => [`${p}하다`]);
  m(/^(.+)습니다$/, (p) => [`${p}다`]);
  m(/^(.+)습니까$/, (p) => [`${p}다`]);
  m(/^(.+)(?:으)?세요$/, (p) => [`${p}다`, `${p}시다`]);
  m(/^(.+)십시오$/, (p) => [`${p}다`, `${p}시다`]);
  m(/^(.+)해요$/, (p) => [`${p}하다`]);
  m(/^(.+)[아어여]요$/, (p) => [`${p}다`]);
  const x = /^(.*)(.)니(?:다|까)$/.exec(lemma);
  if (x) { const d = decompose(x[2]); if (d && FINALS[d.t] === 'ㅂ') out.push(`${x[1]}${compose(d.l, d.v, 0)}다`); }
  return out;
}

/** A pronoun allomorph that occurs only before particular particles (제 for 저 before 가), never a free word. */
const BOUND_GLOSS = /^(?:allomorph of\b|Form of\b.*:?\s*$|only used in\b)/i;
const XSYN_RE = /^synonym of\s+([^(,;:]+?)\s*(?:[(,;:]|$)/i;
const SEE_RE = /^(?:see|for the verb|for the)\b/i;

/**
 * The gloss of an entry: the first sense that is not a form-of and not a cross-reference, its most specific gloss (a sub-sense lists its
 * parent headers first). A "See the entry at …" sense is never a gloss; a "synonym of X" sense is returned as `xref` (the build resolves it
 * to X's own gloss) when no other sense gives a gloss.
 */
export function koEntryGloss(senses: readonly KoRawSense[]): { gloss?: string; xref?: string } {
  let xref: string | undefined;
  for (const s of senses) {
    if (koSenseIsForm(s) || !s.glosses.length) continue;
    const raw = s.glosses[s.glosses.length - 1];
    const y = XSYN_RE.exec(raw);
    if (y) { xref ??= y[1]; continue; }
    if (SEE_RE.test(raw)) continue;
    const g = koShortGloss(raw);
    if (g) return { gloss: g };
  }
  return xref ? { xref } : {};
}

// ───────────────────────────── conjugation class ─────────────────────────────

const HARMONY_E: Readonly<Record<string, readonly string[]>> = { ㅏ: ['ㅐ'], ㅓ: ['ㅐ', 'ㅔ'], ㅑ: ['ㅒ'], ㅕ: ['ㅖ'] };
const vi = (v: string): number => VOWELS.indexOf(v);

/** What a REGULAR stem gives as its infinitive (아/어 form), contractions and ㅡ-deletion included. */
export function koRegularInfinitives(stem: string): string[] {
  const syl = [...stem];
  const L = syl[syl.length - 1];
  const P = syl.slice(0, -1).join('');
  const d = decompose(L);
  const out = [`${stem}아`, `${stem}어`];
  if (!d || d.t !== 0) return out;
  const v = VOWELS[d.v];
  switch (v) {
    case 'ㅏ': case 'ㅓ': case 'ㅐ': case 'ㅔ': case 'ㅕ': case 'ㅑ': case 'ㅒ': case 'ㅖ': out.push(stem); break;
    case 'ㅗ': out.push(P + compose(d.l, vi('ㅘ'))); break;
    case 'ㅜ': out.push(P + compose(d.l, vi('ㅝ'))); break;
    case 'ㅣ': out.push(P + compose(d.l, vi('ㅕ'))); break;
    case 'ㅡ': out.push(P + compose(d.l, vi('ㅏ')), P + compose(d.l, vi('ㅓ'))); break;
    case 'ㅚ': out.push(P + compose(d.l, vi('ㅙ'))); break;
    default: break;
  }
  return out;
}

/**
 * The conjugation class of a predicate, from the entry's OWN infinitive: exact jamo comparison with the stem, never from the stem's
 * shape alone. Undefined when the infinitive fits no class (and is not a regular one either).
 */
export function koIrregularClass(stem: string, inf: string): KoIrregular | undefined {
  const syl = [...stem.normalize('NFC')];
  const L = syl[syl.length - 1];
  const P = syl.slice(0, -1).join('');
  const d = L ? decompose(L) : undefined;
  if (!d || !inf) return undefined;
  const fin = FINALS[d.t];
  if (L === '하' && (inf === `${P}해` || inf === `${stem}여`)) return 'Ha';
  if (L === '르') {
    if (inf === `${stem}러`) return 'Reo';
    const q = syl.slice(0, -1);
    const S = q.pop();
    if (S && decompose(S) && finalOf(S) === '') { const base = q.join('') + withFinal(S, 'ㄹ'); if (inf === `${base}라` || inf === `${base}러`) return 'Reu'; }
  }
  if (fin === 'ㄷ') { const b = P + withFinal(L, 'ㄹ'); if (inf === `${b}아` || inf === `${b}어`) return 'D'; }
  if (fin === 'ㅂ') { const b = P + withFinal(L, ''); if (inf === `${b}워` || inf === `${b}와`) return 'B'; }
  if (fin === 'ㅅ') { const b = P + withFinal(L, ''); if (inf === `${b}어` || inf === `${b}아`) return 'S'; }
  if (fin === 'ㅎ' && inf.startsWith(P)) {
    const rest = [...inf.slice(P.length)];
    const r = rest.length === 1 ? decompose(rest[0]) : undefined;
    const want = HARMONY_E[VOWELS[d.v]];
    if (r && want && r.l === d.l && r.t === 0 && want.includes(VOWELS[r.v])) return 'H';
  }
  if (L === '푸' && inf === `${P}퍼`) return 'U';
  if (koRegularInfinitives(stem).includes(inf)) return 'R';
  return undefined;
}

// ───────────────────────────── classification ─────────────────────────────

export interface KoSuffixEvidence { noun: ReadonlySet<string>; verb: ReadonlySet<string>; adj: ReadonlySet<string> }

/** Which affixes of the whole extract are named by the "Korean terms suffixed with -X" category of a noun, verb or adjective. */
export function koSuffixEvidence(raws: readonly KoRaw[]): KoSuffixEvidence {
  const noun = new Set<string>(); const verb = new Set<string>(); const adj = new Set<string>();
  for (const r of raws) {
    const into = r.pos === 'noun' || r.pos === 'name' ? noun : r.pos === 'verb' ? verb : r.pos === 'adj' ? adj : undefined;
    if (into) for (const s of r.suffixed) into.add(s);
  }
  return { noun, verb, adj };
}

const SKIP_POS = new Set(['character', 'syllable', 'symbol', 'punct', 'romanization', 'phrase', 'proverb', 'contraction', 'affix', 'interfix', 'conj', 'postp']);
/** Hyphenated suffixes that are verbal or case endings although nouns are "suffixed" with them (nominalisers, the vocative). */
const ENDING_LIKE_SUFFIX = new Set(['ㅁ', '음', '기', '아', '야', '이여', '는', '은', '을', '를', '다']);
const ENDING_GLOSS = /\b(?:ending|marker|allomorph|allomorphic|post-vowel|post-vocalic|post-consonant|post-liquid|speech level|interrogative|declarative|hortative|imperative|adnominal|connective|sentence-final|verb stem|politeness|honorific|intimate|plain style|polite style|formal style|indirect question|quotation|conjunction)\b|^See\b|^For the\b|^contraction of/i;
/** Plain sentence conjunctions: an adverb whose every gloss piece is one of these is a MAJ. */
export const KO_CONJUNCTION_GLOSSES: ReadonlySet<string> = new Set([
  'and', 'but', 'however', 'therefore', 'or', 'so', 'and then', 'then', 'thus', 'hence', 'moreover', 'furthermore', 'nevertheless', 'nonetheless', 'otherwise',
  'besides', 'also', 'in addition', 'on the other hand', 'in other words', 'that is', 'that is to say', 'for example', 'for instance', 'meanwhile', 'anyway', 'accordingly',
  'consequently', 'even so', 'and so', 'and yet', 'in that case', 'if so', 'otherwise', 'by the way',
]);

const firstNonForm = (senses: readonly KoRawSense[]): KoRawSense | undefined => senses.find((s) => !koSenseIsForm(s));

function conjunctionOnly(senses: readonly KoRawSense[]): boolean {
  const live = senses.filter((s) => !koSenseIsForm(s) && s.glosses.length);
  if (!live.length) return false;
  for (const s of live) {
    const g = s.glosses[s.glosses.length - 1].replace(/\([^)]*\)/g, ' ').toLowerCase();
    const pieces = g.split(/[,;/]|\bor\b/).map((p) => p.replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!pieces.length || !pieces.every((p) => KO_CONJUNCTION_GLOSSES.has(p))) return false;
  }
  return true;
}

/** The bare headword of an entry (affix hyphens removed), or undefined with the reason it is not kept. */
export function koHeadword(r: KoRaw): { lemma: string } | { skip: string } {
  let w = koKey(r.word.trim());
  if (r.pos === 'prefix') w = w.replace(/^-+|-+$/g, '');
  else if (r.pos === 'suffix') w = w.replace(/^-+/, '');
  if (/\s/.test(w)) return { skip: 'headword with a space' };
  if (![...w].some(isHangulSyllable)) return { skip: 'no Hangul syllable' };
  return { lemma: w };
}

export interface KoClass { tag?: KoTag; clf?: true; skip?: string; /** the word this entry is a contraction of */ contraction?: string }

const CONTRACTION_GLOSS = /^(?:an?\s+)?(?:[\p{L}'’-]+\s+){0,3}?contraction of\b/iu;
const CONTENT_POS = new Set(['noun', 'name', 'pron', 'num', 'verb', 'adj', 'det', 'adv', 'intj']);

/** The word an entry is a contraction of, when EVERY sense of it says so (뭐 ← 무어); undefined for any other entry. */
export function koContractionTarget(r: KoRaw): string | undefined {
  if (!r.senses.length) return undefined;
  for (const s of r.senses) {
    const isForm = s.formOf.length > 0 || s.altOf.length > 0 || s.tags.includes('form-of') || s.tags.includes('alt-of');
    if (!isForm || !(s.tags.includes('contraction') || CONTRACTION_GLOSS.test(s.glosses[0] ?? ''))) return undefined;
  }
  const s = r.senses[0];
  const t = s.formOf[0] ?? s.altOf[0];
  if (t) return koKey(t.trim());
  const m = /contraction of\s+([^\s(,;:]+)/i.exec(s.glosses[0] ?? '');
  return m ? koKey(m[1]) : undefined;
}

/** A sense that only refers the reader to another page ("See the entry at 말-"): never a meaning. */
const SEE_ONLY = /^(?:see|for the verb|for the)\b/i;

export function koClassify(r: KoRaw, ev: KoSuffixEvidence): KoClass {
  if (r.pos === 'contraction') return { skip: 'pos contraction' };
  if (SKIP_POS.has(r.pos)) return { skip: `pos ${r.pos}` };
  if (r.pos === 'particle') return { skip: 'particle (hand table)' };
  const h = koHeadword(r);
  if ('skip' in h) return { skip: h.skip };
  const ct = CONTENT_POS.has(r.pos) ? koContractionTarget(r) : undefined;
  if (r.senses.length && r.senses.every(koSenseIsForm) && !ct) return { skip: 'every sense is a form of another word' };
  const live0 = r.senses.filter((s) => !koSenseIsForm(s) && s.glosses.length);
  if (live0.length && live0.every((s) => SEE_ONLY.test(s.glosses[s.glosses.length - 1]))) return { skip: 'cross-reference only ("See the entry at …")' };
  const live = firstNonForm(r.senses);
  const lemma = h.lemma;
  const out = ((): KoClass => {
    switch (r.pos) {
      case 'noun':
        if (r.counterCat) return { tag: 'NNB', clf: true };
        return { tag: (live?.tags.includes('dependent') || r.depCat) ? 'NNB' : 'NNG' };
      case 'counter': return { tag: 'NNB', clf: true };
      case 'name': return { tag: 'NNP' };
      case 'pron': return { tag: 'NP' };
      case 'num': return { tag: 'NR' };
      case 'verb': return lemma.length > 1 && lemma.endsWith('다') ? { tag: 'VV' } : { skip: 'predicate not ending in 다' };
      case 'adj': return lemma.length > 1 && lemma.endsWith('다') ? { tag: 'VA' } : { skip: 'predicate not ending in 다' };
      case 'det': return { tag: 'MM' };
      case 'adv': return { tag: conjunctionOnly(r.senses) ? 'MAJ' : 'MAG' };
      case 'intj': return { tag: 'IC' };
      case 'prefix': return { tag: 'XPN' };
      case 'root': return { tag: 'XR' };
      case 'suffix': {
        const hyphen = r.word.trim().startsWith('-');
        const gl = r.senses.filter((s) => !koSenseIsForm(s)).map((s) => s.glosses.join(' ')).join(' | ');
        if (!gl) return { skip: 'suffix that is an ending or unclassified' };
        if (lemma.length > 1 && lemma.endsWith('다')) {
          const a = /adjective/i.test(gl); const v = /\bverb/i.test(gl);
          if (a && !v) return { tag: 'XSA' };
          if (v && !a) return { tag: 'XSV' };
          if (ev.adj.has(lemma) && !ev.verb.has(lemma)) return { tag: 'XSA' };
          if (ev.verb.has(lemma) && !ev.adj.has(lemma)) return { tag: 'XSV' };
          return { skip: 'suffix that is an ending or unclassified' };
        }
        if (ENDING_GLOSS.test(gl)) return { skip: 'suffix that is an ending or unclassified' };
        if (hyphen) return ev.noun.has(lemma) && !ENDING_LIKE_SUFFIX.has(lemma) ? { tag: 'XSN' } : { skip: 'suffix that is an ending or unclassified' };
        return ENDING_LIKE_SUFFIX.has(lemma) ? { skip: 'suffix that is an ending or unclassified' } : { tag: 'XSN' };
      }
      default: return { skip: `pos ${r.pos}` };
    }
  })();
  if (ct && out.tag) out.contraction = ct;
  return out;
}

// ───────────────────────────── homonym numbering (SHARED by the lexicon and the dictionary) ─────────────────────────────

export interface KoNumberInput { lemma: string; tag: string; clf?: boolean; etym?: string | number; /** fingerprint (Hanja, first gloss, class) used to freeze an assigned number */ fp?: string }
export interface KoNumbering {
  hom: Array<number | undefined>;
  /** The numbers the SOURCE does not give (missing, or shared by two entries of the set): assigned from 50, frozen in the registry. */
  assigned: boolean[];
  /** set keys with an assigned number, with the members' indexes that got one */
  byOrder: Map<string, number[]>;
}
/** Assigned numbers kept from an earlier build's registry (docs/korean/homonyms.json): found by fingerprint, never recomputed from order. */
export interface KoFrozen { find(setKey: string, fp: string): number | undefined; reserved(setKey: string): number[] }

export const KO_ASSIGNED_FROM = 50;

const etymNumber = (e: string | number | undefined): number | undefined => {
  if (e === undefined) return undefined;
  const n = Number(e);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
};

const setKeyOf = (x: { lemma: string; tag: string; clf?: boolean }): string => koHomonymSetKey({ lemma: x.lemma, tag: x.tag as KoTag, ...(x.clf ? { clf: true as const } : {}) });

/**
 * The homonym numbers of a list of kept entries (in file order). A SET is the spelling and the SHARED part of speech (koHomonymSetKey):
 * 자 "ruler" (NNG) and 자 "person" (NNB) are one set. A set with two or more entries: an entry whose etymology number is the only one of
 * its number in the set keeps it (the source's own identity). An entry the source gives NO number, or whose number another entry of the
 * set shares (수 "way" and 手 are both 1), is ASSIGNED one: the number an earlier registry froze for its fingerprint, else the next free
 * number from 50 (visibly not the source's; supplement rows are 90 and up). An entry alone in its set gets no number. The caller merges
 * entries that are one word BEFORE calling this.
 */
export function koNumberHomonyms(items: readonly KoNumberInput[], frozen?: KoFrozen): KoNumbering {
  const sets = new Map<string, number[]>();
  items.forEach((it, i) => { const k = setKeyOf(it); (sets.get(k) ?? sets.set(k, []).get(k)!).push(i); });
  const hom: Array<number | undefined> = new Array(items.length).fill(undefined);
  const assigned: boolean[] = new Array(items.length).fill(false);
  const byOrder = new Map<string, number[]>();
  for (const [k, idx] of sets) {
    if (idx.length < 2) continue;
    const nums = idx.map((i) => etymNumber(items[i].etym));
    const count = new Map<number, number>();
    for (const n of nums) if (n !== undefined) count.set(n, (count.get(n) ?? 0) + 1);
    const taken = new Set<number>();
    idx.forEach((i, j) => { const n = nums[j]; if (n !== undefined && count.get(n) === 1) { hom[i] = n; taken.add(n); } });
    const pending = idx.filter((i) => hom[i] === undefined);
    if (!pending.length) continue;
    for (const i of pending) {
      const f = items[i].fp !== undefined ? frozen?.find(k, items[i].fp!) : undefined;
      if (f !== undefined && !taken.has(f)) { hom[i] = f; assigned[i] = true; taken.add(f); }
    }
    const block = new Set<number>([...taken, ...(frozen?.reserved(k) ?? [])]);
    let next = KO_ASSIGNED_FROM;
    for (const i of pending) {
      if (hom[i] !== undefined) continue;
      while (block.has(next)) next++;
      hom[i] = next; assigned[i] = true; block.add(next);
    }
    byOrder.set(k, pending);
  }
  return { hom, assigned, byOrder };
}

// ───────────────────────────── reviewed inputs ─────────────────────────────

export interface KoDecision { lemma: string; pos: string; state: 'main' | 'balanced'; main?: number; why?: string }
export interface KoOverride { lemma: string; pos: string; hom?: number; gloss: string; senses?: number[]; was?: string; own?: boolean }
/** A hand-written row for a common word the SOURCE LACKS (docs/korean/lexicon-supplement.json). */
export interface KoSupplement { lemma: string; tag: string; hom?: number; gloss: string; hanja?: string; irr?: string; clf?: boolean; pron?: string; bound?: boolean; why?: string }
export interface KoDocs { decisions?: { sets: KoDecision[] }; overrides?: { entries: KoOverride[] }; supplement?: { entries: KoSupplement[] }; registry?: { entries: KoRegistryRecord[] }; coreExtra?: { lemmas: string[] } }

/** docs/korean/core-extra.json: { lemmas: [...] }, the spellings the compiled core must hold; a malformed file fails the build. */
export function koCheckCoreExtra(x: unknown): { lemmas: string[] } | undefined {
  if (x === undefined) return undefined;
  const l = (x as { lemmas?: unknown } | null)?.lemmas;
  if (!isObj(x) || !Array.isArray(l) || !l.every((v) => typeof v === 'string' && v.trim().length > 0)) throw new Error('core-extra.json: expected { "lemmas": [non-empty strings] }');
  return { lemmas: l.map((v) => koKey(String(v).trim())) };
}

/** docs/korean/homonym-decisions.json and docs/korean/gloss-overrides.json, hand-written by the review; absent files are fine. */
export function koLoadDocs(dir = process.env.KO_DOCS_DIR ?? 'docs/korean'): KoDocs {
  const read = <T,>(f: string): T | undefined => (fs.existsSync(`${dir}/${f}`) ? (JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')) as T) : undefined);
  return { decisions: read('homonym-decisions.json'), overrides: read('gloss-overrides.json'), supplement: read('lexicon-supplement.json'), registry: read('homonyms.json'), coreExtra: koCheckCoreExtra(read<unknown>('core-extra.json')) };
}

// ───────────────────────────── building the rows ─────────────────────────────

export interface KoRow extends KoLexEntry {
  etym?: string;
  /** Extract lines this row stands for (several when entries of one etymology were merged). */
  lines: number[];
  /** Every sense of the entry carries a tag that marks it obsolete, archaic, rare, dated or dialectal. */
  marked?: boolean;
  /** A gloss that was only a cross-reference to this word, to be resolved to that word's own gloss. */
  xref?: string;
  contraction?: string;
  byShape?: true;
  /** The extract's own part of speech. */
  rawPos?: string;
  /** Every raw sense of the entry in file order (merged entries concatenated), as the dictionary writes it, for the override positions. */
  senseTexts: Array<{ full: string; short: string }>;
  /** The overridden senses the dictionary shows first, in the override's order. */
  prefer?: Array<{ full: string; short: string }>;
  /** The wording of an own override, shown first and labelled own-wording. */
  ownText?: string;
  /** Fingerprint (Hanja, first gloss, class) that freezes an assigned homonym number. */
  fp?: string;
  /** The homonym number is assigned by the build (from 50), not the source's. */
  assigned?: true;
  /** Number of senses of the entry (entries of one etymology merged in file order, form-of senses counted). */
  senseCount: number;
}

export interface KoSetInfo { key: string; lemma: string; pos: string; state: 'main' | 'balanced'; by: 'decision' | 'only-current' | 'default'; main?: number; members: number[] }

export interface KoReport {
  read: number;
  kept: number;
  keptByPos: Record<string, Record<string, number>>;
  skipped: Record<string, number>;
  skippedByTag: Record<string, number>;
  merges: number;
  mergedSameEtym: Array<{ lemma: string; etym: string; classes: string; glosses: string[]; hanja: string[] }>;
  assignedRows: Array<{ lemma: string; pos: string; hom: number; tag: string; gloss: string; hanja: string; why: string }>;
  mergedSameWord: Array<{ lemma: string; pos: string; numbers: number[]; why: string }>;
  orderSets: Array<{ lemma: string; tag: string; members: number }>;
  irrDisagree: string[];
  noTable: number;
  noClass: Array<{ lemma: string; hom?: number; reason: string; doubt: string }>;
  byShape: number;
  voiceBoth: string[];
  voicePairs: Array<{ lemma: string; hom?: number; voice: string; base: string; via: string }>;
  mixedDependent: number;
  maj: string[];
  majFirstOnly: string[];
  sets: KoSetInfo[];
  contractionPos: Array<{ word: string; gloss: string }>;
  contractionKept: Array<{ word: string; target: string; tag: string }>;
  contractionFused: Array<{ word: string; target: string }>;
  xrefResolved: number;
  xrefEmpty: number;
  glossOverrides: number;
  tableDisagree: Array<{ lemma: string; etym?: string; head: string; table: string }>;
  politeDropped: string[];
  politeKept: string[];
  rootsKept: number;
  rootsAsNoun: string[];
  bound: Array<{ lemma: string; tag: string; why: string }>;
  supplement: Array<{ lemma: string; tag: string; hom?: number; gloss: string; hanja?: string }>;
  glossOwn: Array<{ lemma: string; pos: string; hom: number; gloss: string }>;
}

const inc = (m: Record<string, number>, k: string, n = 1): void => { m[k] = (m[k] ?? 0) + n; };
const CJK = /^[㐀-䶿一-鿿豈-﫿\u{20000}-\u{2ffff}]+$/u;
const cleanPron = (p: string): string => p.replace(/\(ː\)/g, '').replace(/[ːˑ]/g, '').replace(/\s+/g, '').trim();
const MARK_TAGS = new Set(['obsolete', 'archaic', 'rare', 'dated', 'dialectal', 'Gyeongsang', 'Jeolla', 'Gangwon', 'Hamgyong', 'Yukjin', 'Yanbian', 'Pyongan', 'Hwanghae', 'Chungcheong', 'Jeju']);

/** The Hanja spelling of an entry, when it is made only of Hanja characters. */
export const koPureHanja = (h: string | undefined): string | undefined => (h && CJK.test(h) ? h : undefined);

/** Predicates that can be read as regular by the SHAPE of the stem alone: not 하 (Ha), 푸 (U), 르 or an open ㅡ syllable, and no final ㄷ ㅂ ㅅ ㅎ. */
export function koRegularByShape(lemma: string): boolean {
  if (/니다$/.test(lemma)) return false;
  const stem = [...lemma.slice(0, -1)];
  const L = stem[stem.length - 1];
  const d = L ? decompose(L) : undefined;
  if (!d) return false;
  const fin = FINALS[d.t];
  if (d.t === 0) return L !== '하' && L !== '푸' && L !== '르' && VOWELS[d.v] !== 'ㅡ';
  return !['ㄷ', 'ㅂ', 'ㅅ', 'ㅎ'].includes(fin);
}

const normGlossKey = (g: string | undefined): string => (g ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function koBuildRows(raws: readonly KoRaw[], docs: KoDocs = {}): { rows: KoRow[]; report: KoReport } {
  const report: KoReport = {
    read: raws.length, kept: 0, keptByPos: {}, skipped: {}, skippedByTag: {}, merges: 0, mergedSameEtym: [], assignedRows: [], mergedSameWord: [], orderSets: [], irrDisagree: [], noTable: 0, noClass: [], byShape: 0,
    voiceBoth: [], voicePairs: [], mixedDependent: 0, maj: [], majFirstOnly: [], sets: [], contractionPos: [], contractionKept: [], contractionFused: [], xrefResolved: 0, xrefEmpty: 0, glossOverrides: 0, tableDisagree: [], politeDropped: [], politeKept: [], rootsKept: 0, rootsAsNoun: [], bound: [], supplement: [], glossOwn: [],
  };
  const ev = koSuffixEvidence(raws);
  // the passive and causative verbs that a base verb's ko-verb-set names
  const passiveOf = new Map<string, string>(); const causativeOf = new Map<string, string>();
  for (const r of raws) if (r.verbSet && r.verbSet[0]) {
    const base = koKey(r.verbSet[0]);
    // the real data: arg 2 names the CAUSATIVE (먹다 → 먹이다) and arg 3 the PASSIVE (먹히다); the brief had them the other way round
    if (r.verbSet[1] && r.verbSet[1] !== '-') causativeOf.set(koKey(r.verbSet[1]), base);
    if (r.verbSet[2] && r.verbSet[2] !== '-') passiveOf.set(koKey(r.verbSet[2]), base);
  }
  // pass A: classify and build one candidate per kept line
  let cands: KoRow[] = [];
  for (const r of raws) {
    if (r.pos === 'contraction') report.contractionPos.push({ word: r.word, gloss: (r.senses[0]?.glosses ?? []).join(' // ').slice(0, 70) });
    const c = koClassify(r, ev);
    if (!c.tag) { inc(report.skipped, c.skip ?? 'other'); continue; }
    const h = koHeadword(r) as { lemma: string };
    if (c.contraction && /\+\s*-/.test(r.senses[0]?.glosses[0] ?? '')) { report.contractionFused.push({ word: h.lemma, target: `${c.contraction} + particle` }); continue; }
    const row: KoRow = { lemma: h.lemma, tag: c.tag, lines: [r.no], senseCount: r.senses.length, rawPos: r.pos, senseTexts: r.senses.map((x) => ({ full: x.glosses.join(' — '), short: x.glosses.length > 1 && x.glosses[0].endsWith(':') ? `${x.glosses[0]} ${x.glosses[1]}` : x.glosses[0] ?? '' })) };
    if (c.clf) row.clf = true;
    if (r.etym !== undefined) row.etym = r.etym;
    if (c.contraction) {
      row.contraction = c.contraction;
      const m = /:\s*(.+)$/.exec(r.senses[0].glosses[r.senses[0].glosses.length - 1] ?? '');
      const g = m ? koShortGloss(m[1]) : '';
      if (g) row.gloss = g; else row.xref = c.contraction;
    } else {
      const g = koEntryGloss(r.senses);
      if (g.gloss) row.gloss = g.gloss; else if (g.xref) row.xref = koKey(g.xref);
    }
    const hanja = r.hanjaForms[0] ?? r.hanjaArg;
    if (hanja && /[㐀-鿿豈-﫿\u{20000}-\u{2ffff}]/u.test(hanja)) row.hanja = hanja;
    const sound = r.hangeul.map(cleanPron).find((p) => p && [...p].every(isHangulSyllable));
    if (sound && sound !== h.lemma) row.pron = sound;
    const live = r.senses.filter((s) => !koSenseIsForm(s));
    if (live.length && live.every((s) => s.tags.some((t) => MARK_TAGS.has(t)))) row.marked = true;
    if (c.tag === 'VV' || c.tag === 'VA') {
      const stem = h.lemma.slice(0, -1);
      const classes = r.infinitives.map((i) => koIrregularClass(stem, i));
      if (!r.infinitives.length) {
        report.noTable++;
        if (koRegularByShape(h.lemma)) { row.irr = 'R'; row.byShape = true; report.byShape++; }
        else report.noClass.push({ lemma: h.lemma, ...(r.etym ? { hom: Number(r.etym) } : {}), reason: 'the source gives no table (no infinitive form)', doubt: /니다$/.test(h.lemma) ? 'not a predicate stem (a polite form)' : 'the stem shape allows more than one class' });
      } else {
        const first = classes[0];
        if (first) row.irr = first;
        else report.noClass.push({ lemma: h.lemma, ...(r.etym ? { hom: Number(r.etym) } : {}), reason: `the infinitive (${r.infinitives[0]}) fits no class and is not regular`, doubt: 'the stem shape allows more than one class' });
        if (new Set(classes).size > 1) report.irrDisagree.push(`${h.lemma} (${r.etym ?? '-'}): ${classes.map((x) => x ?? '?').join('/')}`);
      }
      // the conjugation TABLE wins over the head line when they disagree (기다랗다: a regular head line, a ㅎ-irregular table)
      if (r.tableInf) {
        const tc = koIrregularClass(stem, r.tableInf);
        if (tc && tc !== row.irr) {
          if (row.irr && !row.byShape) report.tableDisagree.push({ lemma: h.lemma, ...(r.etym ? { etym: r.etym } : {}), head: row.irr, table: tc });
          if (row.byShape) { delete row.byShape; report.byShape--; }
          row.irr = tc;
        }
      }
      // voice: the entry's own first sense, else a base verb's ko-verb-set
      const own = r.senses[0]?.glosses[0] ?? '';
      const m = /^(passive|causative) of\s+([^\s(,;:]+)/i.exec(own);
      const named = r.senses[0]?.formOf[0];
      if (c.tag === 'VV' && m) {
        row.voice = m[1].toLowerCase() === 'passive' ? 'Pass' : 'Caus';
        row.base = koKey(named ?? m[2]);
        const other = r.senses.slice(1).some((s) => { const mm = /^(passive|causative) of\s+([^\s(,;:]+)/i.exec(s.glosses[0] ?? ''); return !!mm && mm[1].toLowerCase() !== m[1].toLowerCase() && koKey(mm[2]) === row.base; });
        if (other) report.voiceBoth.push(`${h.lemma} (${r.etym ?? '-'})`);
      }
    }
    if (c.tag === 'NP' && live.length && live.every((x) => BOUND_GLOSS.test(x.glosses[0] ?? ''))) { row.bound = true; report.bound.push({ lemma: h.lemma, tag: 'NP', why: (live[0].glosses[0] ?? '').slice(0, 90) }); }
    if (c.tag === 'NNB' && r.pos === 'noun') { if (live.some((s) => !s.tags.includes('dependent'))) report.mixedDependent++; }
    if (c.tag === 'MAJ') report.maj.push(h.lemma);
    if (c.tag === 'MAG') { const f = firstNonForm(r.senses); if (f && conjunctionOnly([f])) report.majFirstOnly.push(h.lemma); }
    inc(report.keptByPos[r.pos] ??= {}, c.tag);
    cands.push(row);
  }
  // pass A2: a contraction is a row only when what it contracts is itself a headword (뭐 ← 무어); a word with a particle is the morphology package's
  {
    const lemmas = new Map<string, KoRow[]>();
    for (const c of cands) if (!c.contraction) (lemmas.get(c.lemma) ?? lemmas.set(c.lemma, []).get(c.lemma)!).push(c);
    cands = cands.filter((c) => {
      if (!c.contraction) return true;
      const ts = lemmas.get(c.contraction);
      const t = ts?.find((x) => x.tag === c.tag) ?? ts?.[0];
      if (!t) { report.contractionFused.push({ word: c.lemma, target: c.contraction }); return false; }
      c.tag = t.tag; if (t.clf) c.clf = true; else delete c.clf;
      // an allomorph of a pronoun that occurs only in fused forms: 누 of 누구, 제 / 내 / 네 as genitives of 저 / 나 / 너
      const base = c.contraction.endsWith('의') ? lemmas.get(c.contraction.slice(0, -1))?.find((x) => x.tag === 'NP') : undefined;
      if (base) { c.bound = true; report.bound.push({ lemma: c.lemma, tag: c.tag, why: `contraction of ${c.contraction}` }); }
      report.contractionKept.push({ word: c.lemma, target: c.contraction, tag: c.tag });
      return true;
    });
  }
  // pass A3: a headword that is an INFLECTED FORM of another kept headword (감사합니다 of 감사하다) is not a word of its own, unless the source files it as
  // an interjection with a meaning of its own (안녕하세요, 고맙습니다: greetings a learner needs as phrases)
  {
    const preds = new Set(cands.filter((c) => c.tag === 'VV' || c.tag === 'VA').map((c) => c.lemma));
    cands = cands.filter((c) => {
      const base = koPoliteBases(c.lemma).find((b) => preds.has(b));
      if (!base || c.own) return true;
      if (c.tag === 'VV' || c.tag === 'VA') { report.politeDropped.push(`${c.lemma} (${c.rawPos}) of ${base}`); return false; }
      if (c.tag === 'IC') {
        if (c.gloss && POLITE_OF.test(c.gloss)) { report.politeDropped.push(`${c.lemma} (IC "${c.gloss}") of ${base}`); return false; }
        report.politeKept.push(`${c.lemma} IC "${c.gloss ?? ''}" (base ${base})`); return true;
      }
      return true;
    });
    // a root (어근) that is also a noun entry stays the noun
    const nouns = new Set(cands.filter((c) => koSharedPos(c) === 'NOUN').map((c) => c.lemma));
    cands = cands.filter((c) => {
      if (c.tag !== 'XR') return true;
      if (nouns.has(c.lemma)) { report.rootsAsNoun.push(c.lemma); return false; }
      report.rootsKept++; return true;
    });
  }
  // pass B1: entries of one SET and ONE etymology number are ONE headword and ONE row, always (the source's own judgement: one etymology is one
  // headword). The merged row: the tag of the first entry (NNG before NNB), the first non-empty Hanja, the senses in file order, the gloss of the first entry that has one.
  const fill = (to: KoRow, from: KoRow): void => {
    to.lines.push(...from.lines);
    to.senseCount += from.senseCount;
    to.senseTexts.push(...from.senseTexts);
    for (const f of ['gloss', 'hanja', 'pron', 'irr', 'voice', 'base', 'xref'] as const) if (to[f] === undefined && from[f] !== undefined) (to as unknown as Record<string, unknown>)[f] = from[f];
    if (to.gloss !== undefined) delete to.xref;
    if (to.tag === 'NNB' && from.tag === 'NNG') to.tag = 'NNG';
    to.marked = to.marked && from.marked ? true : undefined;
    if (to.marked === undefined) delete to.marked;
  };
  let rows: KoRow[] = [];
  {
    const byEtym = new Map<string, KoRow>();
    for (const c of cands) {
      if (c.etym !== undefined) {
        const k = `${setKeyOf(c)} ${c.etym}`;
        const same = byEtym.get(k);
        if (same) {
          report.merges++;
          report.mergedSameEtym.push({ lemma: c.lemma, etym: c.etym, classes: `${same.tag}${same.clf ? ' clf' : ''} + ${c.tag}${c.clf ? ' clf' : ''}`, glosses: [same.gloss ?? '', c.gloss ?? ''], hanja: [same.hanja ?? '', c.hanja ?? ''] });
          fill(same, c);
          continue;
        }
        byEtym.set(k, c);
      }
      rows.push(c);
    }
  }
  // pass B2: two etymologies of one set that are ONE word: identical non-empty Hanja, or no Hanja and identical first glosses (6월 South / North Korea);
  // merged under the lowest etymology number. 길조 吉兆 and 길조 吉鳥 differ in Hanja and stay two.
  {
    const groups = new Map<string, KoRow[]>();
    for (const r of rows) (groups.get(setKeyOf(r)) ?? groups.set(setKeyOf(r), []).get(setKeyOf(r))!).push(r);
    const dead = new Set<KoRow>();
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const parent = g.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      const why = new Map<number, string>();
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
        const a = g[i]; const b = g[j];
        let ok = false; let w = '';
        if (a.hanja && b.hanja) { ok = a.hanja === b.hanja; w = 'identical Hanja'; }
        else if (!a.hanja && !b.hanja && a.gloss && b.gloss) { ok = normGlossKey(a.gloss) === normGlossKey(b.gloss); w = 'identical first gloss, no Hanja'; }
        if (ok) { parent[find(j)] = find(i); why.set(find(i), w); }
      }
      const clusters = new Map<number, number[]>();
      g.forEach((_, i) => { (clusters.get(find(i)) ?? clusters.set(find(i), []).get(find(i))!).push(i); });
      for (const idx of clusters.values()) {
        if (idx.length < 2) continue;
        const members = idx.map((i) => g[i]);
        const num = (r: KoRow): number => etymNumber(r.etym) ?? 1e9;
        const rep = [...members].sort((a, b) => num(a) - num(b))[0];
        for (const m of members) if (m !== rep) { fill(rep, m); dead.add(m); }
        report.mergedSameWord.push({ lemma: rep.lemma, pos: koSharedPos(rep) ?? rep.tag, numbers: members.map((m) => etymNumber(m.etym) ?? 0).sort((a, b) => a - b), why: why.get(find(idx[0])) ?? 'identical Hanja' });
      }
    }
    if (dead.size) { rows = rows.filter((r) => !dead.has(r)); report.merges += dead.size; }
  }
  // pass C: the ko-verb-set voice for a verb that has no voice of its own, only when the target is the single kept entry of its class
  const verbCount = new Map<string, number>();
  for (const r of rows) if (r.tag === 'VV') verbCount.set(r.lemma, (verbCount.get(r.lemma) ?? 0) + 1);
  for (const r of rows) {
    if (r.tag !== 'VV') continue;
    if (r.voice) { report.voicePairs.push({ lemma: r.lemma, voice: r.voice, base: r.base!, via: 'own sense' }); continue; }
    if (verbCount.get(r.lemma) !== 1) continue;
    const p = passiveOf.get(r.lemma); const c = causativeOf.get(r.lemma);
    if (p) { r.voice = 'Pass'; r.base = p; if (c === p) report.voiceBoth.push(`${r.lemma} (verb set)`); report.voicePairs.push({ lemma: r.lemma, voice: 'Pass', base: p, via: 'ko-verb-set' }); }
    else if (c) { r.voice = 'Caus'; r.base = c; report.voicePairs.push({ lemma: r.lemma, voice: 'Caus', base: c, via: 'ko-verb-set' }); }
  }
  // pass C2: the hand-written supplement (words the source lacks). It never shadows the source: a line that duplicates a source entry is an error;
  // a line that joins a set of the source needs a hand-fixed number from 90; a line that makes a new spelling has none.
  const supplementHom = new Map<KoRow, number>();
  {
    const SUP_TAGS = new Set(['NNG', 'NNP', 'NNB', 'NP', 'NR', 'VV', 'VA', 'MM', 'MAG', 'MAJ', 'IC', 'XPN', 'XSN', 'XSV', 'XSA', 'XR']);
    const IRR = new Set(['R', 'D', 'B', 'S', 'H', 'Reu', 'Reo', 'U', 'Ha']);
    const sourceRows = rows.slice();
    const added: KoRow[] = [];
    (docs.supplement?.entries ?? []).forEach((e, i) => {
      const where = `lexicon-supplement.json entries[${i}] (${e.lemma} ${e.tag}${e.hom ? ` ${e.hom}` : ''})`;
      const lemma = koKey(String(e.lemma ?? '').trim());
      if (!lemma || /\s/.test(lemma) || ![...lemma].some(isHangulSyllable)) throw new Error(`${where}: the lemma must be one Hangul word`);
      if (!SUP_TAGS.has(e.tag)) throw new Error(`${where}: unknown tag "${e.tag}" (one of ${[...SUP_TAGS].join(' ')})`);
      if (!e.gloss || !String(e.gloss).trim()) throw new Error(`${where}: no gloss`);
      const pred = e.tag === 'VV' || e.tag === 'VA';
      if (pred && !(e.irr && IRR.has(e.irr))) throw new Error(`${where}: a predicate needs irr (one of ${[...IRR].join(' ')})`);
      if (pred && !lemma.endsWith('다')) throw new Error(`${where}: a predicate lemma ends in 다`);
      if (e.hom !== undefined && (!Number.isInteger(e.hom))) throw new Error(`${where}: hom must be an integer`);
      const row: KoRow = { lemma, tag: e.tag as KoTag, lines: [], senseCount: 0, senseTexts: [], gloss: String(e.gloss).trim(), glossOwn: true, own: true };
      if (e.clf) row.clf = true;
      if (e.hanja) row.hanja = e.hanja;
      if (e.irr) row.irr = e.irr as KoIrregular;
      if (e.pron) row.pron = e.pron;
      if (e.bound) row.bound = true;
      const key = setKeyOf(row);
      const inSource = sourceRows.filter((r) => setKeyOf(r) === key);
      for (const r of inSource) {
        if ((row.hanja && r.hanja === row.hanja) || (!row.hanja && !r.hanja && normGlossKey(r.gloss) === normGlossKey(row.gloss))) throw new Error(`${where}: the source already has this word (${koHomonymLemma(r.lemma, r.hom)}${r.gloss ? ` "${r.gloss}"` : ''}); the supplement never shadows the source`);
      }
      const mates = added.filter((r) => setKeyOf(r) === key);
      if (inSource.length) {
        if (e.hom === undefined || e.hom < 90) throw new Error(`${where}: the source has this spelling and part of speech, so the line joins its homonym set and needs a hand-fixed hom of 90 or more`);
        if (mates.some((r) => supplementHom.get(r) === e.hom)) throw new Error(`${where}: hom ${e.hom} is used twice in the set`);
      } else {
        if (e.hom !== undefined) throw new Error(`${where}: the source lacks this spelling and part of speech, so the line has no hom`);
        if (mates.length) throw new Error(`${where}: another supplement line has this spelling; the source lacks it, so only one line may`);
      }
      if (e.hom !== undefined) { row.etym = String(e.hom); supplementHom.set(row, e.hom); }
      added.push(row);
      report.supplement.push({ lemma, tag: e.tag, ...(e.hom !== undefined ? { hom: e.hom } : {}), gloss: row.gloss!, ...(row.hanja ? { hanja: row.hanja } : {}) });
    });
    rows.push(...added);
  }
  // pass D: homonym numbers (the source's, else assigned from 50 and frozen by fingerprint in the registry)
  for (const r of rows) r.fp = JSON.stringify([r.hanja ?? '', normGlossKey(r.gloss ?? r.xref), r.tag, r.clf ? 1 : 0]);
  const frozenRecs = new Map<string, number>();
  const reservedBySet = new Map<string, number[]>();
  for (const rec of docs.registry?.entries ?? []) {
    if (!rec.assigned || !rec.fp) continue;
    const k = koHomonymSetKey({ lemma: rec.lemma, tag: rec.tag as KoTag, ...(rec.clf ? { clf: true as const } : {}) });
    frozenRecs.set(`${k}\u0001${rec.fp}`, rec.hom);
    (reservedBySet.get(k) ?? reservedBySet.set(k, []).get(k)!).push(rec.hom);
  }
  const num = koNumberHomonyms(rows, { find: (k, fp) => frozenRecs.get(`${k}\u0001${fp}`), reserved: (k) => reservedBySet.get(k) ?? [] });
  rows.forEach((r, i) => { if (num.hom[i] !== undefined) { r.hom = num.hom[i]; if (num.assigned[i]) r.assigned = true; } });
  // a supplement number is hand-fixed and identity like the source's: never renumbered
  for (const [r, h] of supplementHom) { r.hom = h; delete r.assigned; }
  for (const [k, idx] of num.byOrder) {
    const [lemma, pos] = k.split('\u0000');
    report.orderSets.push({ lemma, tag: pos, members: idx.length });
    for (const i of idx) if (rows[i].assigned) report.assignedRows.push({ lemma, pos, hom: rows[i].hom!, tag: rows[i].tag, gloss: rows[i].gloss ?? '', hanja: rows[i].hanja ?? '', why: rows[i].etym === undefined ? 'the source gives no etymology number' : `the source's number ${rows[i].etym} is shared by another entry of the set` });
  }
  // pass E: the state of every set (a reviewed decision, else the only current entry, else balanced)
  {
    const groups = new Map<string, KoRow[]>();
    for (const r of rows) if (r.hom !== undefined) (groups.get(setKeyOf(r)) ?? groups.set(setKeyOf(r), []).get(setKeyOf(r))!).push(r);
    const decided = new Set<string>();
    (docs.decisions?.sets ?? []).forEach((d, i) => {
      const key = `${d.lemma}\u0000${d.pos}`;
      const g = groups.get(key);
      if (!g) throw new Error(`homonym-decisions.json sets[${i}] (${d.lemma} ${d.pos}): the build has no such set`);
      if (d.state !== 'main' && d.state !== 'balanced') throw new Error(`homonym-decisions.json sets[${i}] (${d.lemma} ${d.pos}): state must be "main" or "balanced"`);
      if (d.state === 'main' && !g.some((r) => r.hom === d.main)) throw new Error(`homonym-decisions.json sets[${i}] (${d.lemma} ${d.pos}): the set has no entry numbered ${d.main} (it has ${g.map((r) => r.hom).join(', ')})`);
      if (decided.has(key)) throw new Error(`homonym-decisions.json sets[${i}] (${d.lemma} ${d.pos}): the set is decided twice`);
      decided.add(key);
    });
    for (const [key, g] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const [lemma, pos] = key.split('\u0000');
      const d = docs.decisions?.sets.find((x) => x.lemma === lemma && x.pos === pos);
      let state: 'main' | 'balanced'; let by: KoSetInfo['by']; let main: number | undefined;
      if (d) { state = d.state; by = 'decision'; main = d.state === 'main' ? d.main : undefined; }
      else {
        const current = g.filter((r) => !r.marked);
        if (current.length === 1 && g.length >= 2) { state = 'main'; by = 'only-current'; main = current[0].hom; }
        else { state = 'balanced'; by = 'default'; }
      }
      for (const r of g) r.set = state === 'balanced' ? 'balanced' : r.hom === main ? 'main' : 'other';
      report.sets.push({ key, lemma, pos, state, by, ...(main !== undefined ? { main } : {}), members: g.map((r) => r.hom!) });
    }
  }
  // pass F: glosses: a cross-reference is never a gloss (resolve "synonym of X" to X's own gloss, else none), then the reviewed overrides
  {
    const byLemma = new Map<string, KoRow[]>();
    for (const r of rows) (byLemma.get(r.lemma) ?? byLemma.set(r.lemma, []).get(r.lemma)!).push(r);
    for (const r of rows) {
      if (r.gloss || !r.xref) { delete r.xref; continue; }
      const cand = (byLemma.get(r.xref) ?? []).filter((t) => t !== r && t.gloss && !t.xref);
      const t = cand.find((x) => koSharedPos(x) === koSharedPos(r)) ?? cand[0];
      if (t) { r.gloss = koShortGloss(`= ${t.lemma}: ${t.gloss}`); report.xrefResolved++; } else report.xrefEmpty++;
      delete r.xref;
    }
    (docs.overrides?.entries ?? []).forEach((o, i) => {
      const hits = rows.filter((r) => r.lemma === o.lemma && (koSharedPos(r) ?? r.tag) === o.pos && (r.hom ?? 0) === (o.hom ?? 0));
      if (hits.length !== 1) throw new Error(`gloss-overrides.json entries[${i}] (${o.lemma} ${o.pos} hom ${o.hom ?? 0}): ${hits.length ? 'names more than one entry' : 'names no entry'}`);
      const pos = o.senses ?? [];
      const bad = pos.filter((p) => !Number.isInteger(p) || p < 1 || p > hits[0].senseCount);
      if (bad.length) throw new Error(`gloss-overrides.json entries[${i}] (${o.lemma} ${o.pos} hom ${o.hom ?? 0}): sense position(s) ${bad.join(', ')} do not exist (the entry has ${hits[0].senseCount} senses)`);
      if (!o.own && !pos.length) throw new Error(`gloss-overrides.json entries[${i}] (${o.lemma} ${o.pos} hom ${o.hom ?? 0}): a line without "own" must name at least one sense`);
      hits[0].gloss = o.gloss; report.glossOverrides++;
      const seen = new Set<number>();
      hits[0].prefer = pos.filter((p) => !seen.has(p) && seen.add(p)).map((p) => hits[0].senseTexts[p - 1]).filter((x): x is { full: string; short: string } => !!x && !!x.full);
      if (o.own) hits[0].ownText = o.gloss;
      if (o.own) { hits[0].glossOwn = true; report.glossOwn.push({ lemma: o.lemma, pos: o.pos, hom: o.hom ?? 0, gloss: o.gloss }); } else delete hits[0].glossOwn;
    });
  }
  report.kept = rows.length;
  return { rows, report };
}

// ───────────────────────────── the dictionary hook ─────────────────────────────

/** How a dictionary entry of the extract relates to the lexicon rows: its homonym number and state, and the senses an override puts first. */
export interface KoDictInfo { hom?: number; state?: 'main' | 'other' | 'balanced'; prefer?: Array<{ full: string; short: string }>; ownText?: string }

export interface KoDictPlan {
  /** Extract line → homonym number, for the lines that belong to a numbered entry (the SAME rows the lexicon builds). */
  homByLine: Map<number, number>;
  /** (headword, etymology number as the dictionary entry carries it) → what the lexicon knows of it. */
  info: Map<string, KoDictInfo>;
  /** The entries of one partition in their final order: a main entry first, the entries of a balanced set in registry order, overridden senses first. */
  arrange(entries: DictionaryEntry[]): DictionaryEntry[];
}

const infoKey = (lemma: string, pos: string | undefined, etym: number | undefined): string => `${lemma} ${pos ?? ''} ${etym ?? 0}`;

/** The plan of the dictionary build, from the same rows (and the same reviewed inputs) as the lexicon. */
export async function koDictionaryPlan(file: string, docs: KoDocs = koLoadDocs()): Promise<KoDictPlan> {
  const { rows } = koBuildRows(await koReadSlim(file), docs);
  const homByLine = new Map<number, number>();
  const info = new Map<string, KoDictInfo>();
  for (const r of rows) {
    if (r.hom !== undefined) for (const l of r.lines) homByLine.set(l, r.hom);
    const etym = r.hom ?? (r.etym !== undefined ? Number(r.etym) : undefined);
    const i: KoDictInfo = {};
    if (r.hom !== undefined) { i.hom = r.hom; if (r.set) i.state = r.set; }
    if (r.prefer?.length) i.prefer = r.prefer;
    if (r.ownText) i.ownText = r.ownText;
    if (i.state || i.prefer || i.ownText) { const pos = koSharedPos(r) ?? 'X'; info.set(infoKey(r.lemma, pos, etym), i); if (pos === 'CLF') { info.set(infoKey(r.lemma, 'NOUN', etym), i); info.set(infoKey(r.lemma, 'X', etym), i); } }
  }
  const reorder = (e: DictionaryEntry, i: KoDictInfo): void => {
    if (i.prefer?.length && e.senses?.length) {
      const first: NonNullable<DictionaryEntry['senses']> = [];
      for (const p of i.prefer) { const at = e.senses.findIndex((x) => x.gloss === p.full && !first.includes(x)); if (at >= 0) first.push(e.senses[at]); }
      if (first.length) e.senses = [...first, ...e.senses.filter((x) => !first.includes(x))];
      const g: string[] = [];
      for (const p of i.prefer) if (e.glosses.includes(p.short) && !g.includes(p.short)) g.push(p.short);
      if (g.length) e.glosses = [...g, ...e.glosses.filter((x) => !g.includes(x))];
    }
    if (i.ownText) {
      e.senses = [{ gloss: i.ownText, tags: ['own-wording'] }, ...(e.senses ?? [])];
      e.glosses = [i.ownText, ...e.glosses];
    }
  };
  const arrange = (entries: DictionaryEntry[]): DictionaryEntry[] => {
    const groups = new Map<string, DictionaryEntry[]>();
    for (const e of entries) (groups.get(e.form) ?? groups.set(e.form, []).get(e.form)!).push(e);
    const out: DictionaryEntry[] = [];
    for (const [form, g] of groups) {
      const bare = koBareLemma(form) === form;
      const ranked = g.map((e, at) => {
        const i = info.get(infoKey(koBareLemma(form), e.pos ?? 'X', e.etymology));
        if (i) reorder(e, i);
        if (bare && i?.state === 'other') e.role = e.role ? `${e.role}; another entry of this spelling (number ${i.hom})` : `another entry of this spelling (number ${i.hom})`;
        if (bare && i?.state === 'balanced') e.role = e.role ? `${e.role}; one of several entries of this spelling (number ${i.hom})` : `one of several entries of this spelling (number ${i.hom})`;
        return { e, at, rank: bare && i?.state === 'other' ? 1 : 0, hom: i?.hom ?? e.etymology ?? 0 };
      });
      // a main entry first, the others after it; a balanced set in registry (number) order; anything else as the file has it
      if (bare && ranked.some((x) => x.rank === 1 || x.e.role?.includes('several'))) ranked.sort((a, b) => a.rank - b.rank || a.hom - b.hom || a.at - b.at);
      out.push(...ranked.map((x) => x.e));
    }
    return out;
  };
  return { homByLine, info, arrange };
}

/** Extract line number → homonym number, for the lines that belong to a numbered entry (the SAME rows the lexicon builds). */
export async function koHomonymLines(file: string): Promise<Map<number, number>> {
  return (await koDictionaryPlan(file)).homByLine;
}

/**
 * The entry again under its numbered headword (눈²): the same record, another form, carrying its homonym number as its etymology number.
 * The entry itself is stamped with the same number (the dictionary's own merge keeps the etymologies apart). Nothing for an entry with no number.
 */
export function koHomonymAliases(homByLine: ReadonlyMap<number, number>, lineNo: number, entry: DictionaryEntry): DictionaryEntry[] {
  const hom = homByLine.get(lineNo);
  if (hom === undefined) return [];
  entry.etymology = hom;
  return [{ ...entry, form: koHomonymLemma(entry.form, hom) }];
}

/**
 * The dictionary entries of the supplement rows (docs/korean/lexicon-supplement.json): the meaning of a word the source lacks, under its
 * headword (and its numbered headword), its one sense labelled \`own-wording\` so that a reader sees it is this product's wording, not Wiktionary's.
 * The dictionary has no per-entry source field; a sense's labels are the place the contract gives for the source's own labels.
 */
export function koSupplementEntries(docs: KoDocs = koLoadDocs()): DictionaryEntry[] {
  const out: DictionaryEntry[] = [];
  for (const e of docs.supplement?.entries ?? []) {
    const lemma = koKey(e.lemma);
    const tag = e.tag as KoTag;
    const pos = koSharedPos({ tag, ...(e.clf ? { clf: true as const } : {}) }) ?? 'X';
    const base: DictionaryEntry = {
      form: lemma, lang: 'ko' as DictionaryEntry['lang'], pos: pos as NonNullable<DictionaryEntry['pos']>, glosses: [e.gloss],
      senses: [{ gloss: e.gloss, tags: ['own-wording'] }], ...(e.hom !== undefined ? { etymology: e.hom } : {}),
    };
    out.push(base);
    if (e.hom !== undefined) out.push({ ...base, form: koHomonymLemma(lemma, e.hom) });
  }
  return out;
}

// ───────────────────────────── the compiled core ─────────────────────────────

export const KO_CLOSED_TAGS: ReadonlySet<string> = new Set(['NP', 'NR', 'MM', 'MAJ', 'NNB', 'XPN', 'XSN', 'XSV', 'XSA']);

/** One core row as a compact tuple. */
export type KoCoreTuple = [lemma: string, tag: string, hom: number, irr: string, gloss: string, hanja: string, pron: string, n: number, voice: string, base: string, clf: number, set: string, glossOwn: number, own: number, bound: number];

export function koCoreTuple(e: KoLexEntry): KoCoreTuple {
  return [e.lemma, e.tag, e.hom ?? 0, e.irr ?? '', e.gloss ?? '', e.hanja ?? '', e.pron ?? '', e.n ?? 0, e.voice ?? '', e.base ?? '', e.clf ? 1 : 0, e.set ?? '', e.glossOwn ? 1 : 0, e.own ? 1 : 0, e.bound ? 1 : 0];
}
export function koCoreTupleJson(t: KoCoreTuple): string {
  const a: unknown[] = [...t];
  while (a.length > 2 && (a[a.length - 1] === '' || a[a.length - 1] === 0)) a.pop();
  return JSON.stringify(a);
}

/**
 * The entries of the compiled core: every set (spelling + shared part of speech) of a closed class or an interjection seen in the priors
 * corpus, then open-class sets by descending count, until `budget` bytes of tuples. A set goes in WHOLE or not at all, each member with the
 * number and state it has in the shards.
 */
export function koSelectCore(entries: readonly KoLexEntry[], budget: number, extra: ReadonlySet<string> = new Set()): { chosen: KoLexEntry[]; bytes: number; forcedBytes: number; forcedRows: number } {
  const sets = new Map<string, KoLexEntry[]>();
  for (const e of entries) { const k = koHomonymSetKey(e); (sets.get(k) ?? sets.set(k, []).get(k)!).push(e); }
  const cost = (s: KoLexEntry[]): number => s.reduce((t, e) => t + Buffer.byteLength(koCoreTupleJson(koCoreTuple(e))) + 4, 0);
  // a balanced set repeats its count on every member: the count of the SPELLING is the largest, not the sum
  const total = (s: KoLexEntry[]): number => s.reduce((t, e) => Math.max(t, e.n ?? 0), 0);
  const forced: KoLexEntry[][] = []; const closed: KoLexEntry[][] = []; const open: KoLexEntry[][] = [];
  for (const s of sets.values()) {
    if (extra.has(s[0].lemma)) forced.push(s); // every set of a listed spelling, across classes
    else if (s.some((e) => KO_CLOSED_TAGS.has(e.tag)) || (s[0].tag === 'IC' && total(s) >= 1)) closed.push(s);
    else if (total(s) >= 1) open.push(s);
  }
  const byLemma = (a: KoLexEntry[], b: KoLexEntry[]): number => (a[0].lemma < b[0].lemma ? -1 : a[0].lemma > b[0].lemma ? 1 : a[0].tag < b[0].tag ? -1 : 1);
  open.sort((a, b) => total(b) - total(a) || byLemma(a, b));
  const chosen: KoLexEntry[] = []; let bytes = 0;
  for (const s of forced) { chosen.push(...s); bytes += cost(s); }
  const forcedBytes = bytes; const forcedRows = chosen.length;
  for (const s of closed) { chosen.push(...s); bytes += cost(s); }
  for (const s of open) { const c = cost(s); if (bytes + c > budget) break; chosen.push(...s); bytes += c; }
  return { chosen, bytes, forcedBytes, forcedRows };
}

// ───────────────────────────── the homonym registry ─────────────────────────────

export interface KoRegistryRecord { lemma: string; tag: string; clf?: boolean; assigned?: boolean; fp?: string; hom: number; set?: string; by?: string; own?: boolean; gloss?: string; hanja?: string; irr?: string; voice?: string }

const normGloss = normGlossKey;
const fp = (r: KoRegistryRecord): string => JSON.stringify([r.hanja ?? null, r.irr ?? null, r.voice ?? null]);

export function koRegistryOf(rows: readonly KoLexEntry[], byOf: (e: KoLexEntry) => string | undefined = () => undefined, extra: (e: KoLexEntry) => { assigned?: boolean; fp?: string } = () => ({})): KoRegistryRecord[] {
  const out: KoRegistryRecord[] = [];
  for (const e of rows) if (e.hom !== undefined) {
    const by = byOf(e);
    const x = extra(e);
    out.push({ lemma: e.lemma, tag: e.tag, ...(e.clf ? { clf: true } : {}), hom: e.hom, ...(x.assigned ? { assigned: true, ...(x.fp ? { fp: x.fp } : {}) } : {}), ...(e.set ? { set: e.set } : {}), ...(by ? { by } : {}), ...(e.own ? { own: true } : {}), ...(e.gloss ? { gloss: e.gloss } : {}), ...(e.hanja ? { hanja: e.hanja } : {}), ...(e.irr ? { irr: e.irr } : {}), ...(e.voice ? { voice: e.voice } : {}) });
  }
  return out.sort((a, b) => (a.lemma < b.lemma ? -1 : a.lemma > b.lemma ? 1 : a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : a.hom - b.hom));
}

/**
 * Compares the registry of an earlier build with this one. FAILURES: (a) a (lemma, tag, hom) in both whose fingerprint (hanja, irr, voice)
 * differs; (b) the numbers of a set are unchanged but the glosses are permuted; (c) an old number disappeared while a new one appeared in
 * the same set; (d) the state of an entry changed (main, other, balanced) except an automatic state (default or only-current) that a reviewed decision now settles.
 * WARNINGS: a gloss that only changed wording under the same fingerprint.
 */
export function koCompareRegistry(oldRecs: readonly KoRegistryRecord[], newRecs: readonly KoRegistryRecord[]): { failures: string[]; warnings: string[] } {
  const failures: string[] = []; const warnings: string[] = [];
  const group = (rs: readonly KoRegistryRecord[]): Map<string, Map<number, KoRegistryRecord>> => {
    const m = new Map<string, Map<number, KoRegistryRecord>>();
    for (const r of rs) (m.get(`${r.lemma}\u0000${r.tag}`) ?? m.set(`${r.lemma}\u0000${r.tag}`, new Map()).get(`${r.lemma}\u0000${r.tag}`)!).set(r.hom, r);
    return m;
  };
  const o = group(oldRecs); const n = group(newRecs);
  for (const [k, os] of o) {
    const [lemma, tag] = k.split('\u0000');
    const ns = n.get(k);
    const name = (h: number): string => `${koHomonymLemma(lemma, h)} ${tag}`;
    if (!ns) continue; // the set has no numbers now (it became one entry): the Repository decides, a rebuild may not refuse for it
    const gone = [...os.keys()].filter((h) => !ns.has(h)); const added = [...ns.keys()].filter((h) => !os.has(h));
    if (gone.length && added.length) failures.push(`(c) ${lemma} ${tag}: number(s) ${gone.join(',')} disappeared while ${added.join(',')} appeared`);
    for (const [h, orec] of os) {
      const nrec = ns.get(h);
      if (!nrec) continue;
      if (fp(orec) !== fp(nrec)) failures.push(`(a) ${name(h)}: fingerprint (hanja, irr, voice) changed ${fp(orec)} -> ${fp(nrec)}`);
      if (orec.set && nrec.set && orec.set !== nrec.set && !((orec.by === 'default' || orec.by === 'only-current') && nrec.by === 'decision')) failures.push(`(d) ${name(h)}: state changed ${orec.set} (${orec.by ?? '?'}) -> ${nrec.set} (${nrec.by ?? '?'})`);
    }
    const shared = [...os.keys()].filter((h) => ns.has(h)).sort((x, y) => x - y);
    const changed = shared.filter((h) => normGloss(os.get(h)!.gloss) !== normGloss(ns.get(h)!.gloss));
    const permuted = changed.length >= 2 && changed.every((h) => shared.some((h2) => h2 !== h && normGloss(os.get(h2)!.gloss) === normGloss(ns.get(h)!.gloss)));
    if (permuted) failures.push(`(b) ${lemma} ${tag}: the glosses of numbers ${changed.join(',')} are permuted`);
    else for (const h of shared) {
      const a = os.get(h)!; const b = ns.get(h)!;
      if (fp(a) === fp(b) && normGloss(a.gloss) !== normGloss(b.gloss)) warnings.push(`${name(h)}: gloss "${a.gloss ?? ''}" -> "${b.gloss ?? ''}"`);
    }
  }
  return { failures, warnings };
}
