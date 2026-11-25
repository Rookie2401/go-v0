/**
 * The context-free readings of one Arabic word token: what the installed form indexes (arabic/index-store.ts) and the closed-class table
 * (arabic/closed.ts) say a written word can be, best first. No neighbour is looked at here (Package C's sentence ordering may only
 * reorder and lower).
 *
 * How a word is read:
 *  1. keys: the word's key; for a printed Farsi yeh (ی) also the key with ى (both direct); the Quranic spelling key when text.ts has one.
 *  2. cuts: every segmentation of the key (clitics.ts), the whole word first. For each stem spelling the index is asked (the article's
 *     definite rows are keyed WITH ال: they are read through the key ال + stem, so the vowels of the stem are the row's). A cut is
 *     kept only when the clitics allow the reading (ال only on nominals, سـ only on imperfect indicative, لِـ + subjunctive / jussive,
 *     a possessive only on a noun in construct state, …) and the vowels the PAGE printed do not contradict the reading (vocalMatch on
 *     the stem slice; a conflict on the last letter only lowers).
 *  3. one reading is made per lexeme and form: rows of one lexeme that differ only in the case / mood ending are merged into one
 *     candidate with feature unions when the page printed no ending (Person=2,3 for تَكْتُبُ: "you (m. sg.)" or "she", one candidate).
 *     Two entries with the same vocalized head and part of speech are ONE lexeme (qāla "to say", qāla "to nap" → lemma قَالَ,
 *     notes.homonyms = 2). A participle or a verbal noun that only sits in a verb's table is its OWN lexeme (notes.derivedFrom).
 *  4. confidence (PLAN.md and the lead's amendments, "the credit rule"):
 *       a form's own reading: 0.90;  −0.05 per clitic;  −0.10 a loosely spelled reading (hamza / ى / ة restored, notes.spelling);
 *       −0.10 a register label (dialectal, poetic …); −0.10 a conflict of the last letter's vowel with the page.
 *       Then the lexemes decide: ONE lexeme (after the printed vowels) → as above. Several lexemes: the reviewed identity says (main →
 *       0.70, null → undecided); else the structural priors: one lexeme with a non-marginal reading and the others only marginal
 *       (passive, imperative, jussive-only, dual, 2nd-person feminine, a cut where the other is a lemma's own citation form, a
 *       proper name against a common word) → that lexeme 0.60, notes.identity 'structural'; otherwise nothing decides: every
 *       reading ≤ 0.45, notes.identity 'undecided', and the item is the form, not a lemma. A SECOND SEGMENTATION IS A RIVAL.
 *  5. a word no source has gets a marked guess (guess.ts) or nothing.
 */
import type { AnalysisCandidate, PartOfSpeech, RawToken, WordPart } from '../../core';
import { arMainOf } from './identities';
import { arSegmentations, arProcliticAllows, arEncliticAllows, type ArSegmentation, type Clitic } from './clitics';
import { arClosedFor, AR_PRIORS, type ArClosedEntry } from './closed';
import { arGuess } from './guess';
import { lookupArabicForm, lookupArabicLemma, lemmaOfId, lexOf, type ArIndexHit, type ArLemmaRow } from './index-store';
import { rootClass } from './roots';
import { AR_LOWERED_USAGE, arFeaturesOfCode } from './tags';
import * as T from './text';
import { applyVocal, arCanon, arKey, arKeyMap, packVocal, splitVocal, tashkilLevel, unpackVocal, vocalMatch } from './text';
import { AR_SOURCE_IDS, AR_VARIETIES } from './version';

type Morph = Record<string, string>;

// ───────────────────────────── optional collaborators ─────────────────────────────

const headForm = (head: string, pos: string): string => T.arHeadForm(head, pos);

// ───────────────────────────── constants ─────────────────────────────

const CONF_OWN = 0.9;
const CONF_CLITIC = 0.05;
const CONF_LOOSE = 0.1;
const CONF_USAGE = 0.1;
const CONF_ENDING = 0.1;
const CONF_MAIN = 0.7;
const CONF_STRUCTURAL = 0.6;
const CONF_UNDECIDED = 0.45;
const CONF_PRINTED = 0.75;
const CONF_GUESS = 0.35;
const MAX_CANDIDATES = 12;
const round2 = (x: number): number => Math.round(x * 100) / 100;
const has = (v: string | undefined, x: string): boolean => (v ?? '').split(',').includes(x);
const only = (v: string | undefined, x: string): boolean => v === x;

// ───────────────────────────── readings ─────────────────────────────

interface LemmaInfo { head: string; gloss: string; pos: string; lex: string; count: number; root?: string }

interface Reading {
  segIx: number;
  seg: ArSegmentation;
  /** The spelling of the stem the reading is filed under (a dictionary spelling) and the vowels of it, for the stem's letters. */
  stemKey: string;
  stemVocal: string;
  lemmaId: string;
  info: LemmaInfo;
  /** The lexeme: the vocalized head and the part of speech; for a derived participle or verbal noun the form itself. */
  head: string;
  pos: PartOfSpeech;
  morph: Morph;
  usage: string[];
  viaLoose: boolean;
  hand?: ArClosedEntry;
  derived?: { from: string; kind: 'active participle' | 'passive participle' | 'verbal noun' };
  /** The stem's last vowel contradicts the page; the rest agrees. */
  endingConflict: boolean;
  /** The reading was reached through the Quranic key. */
  quranic: boolean;
  /** The stem is the lemma's own citation form (no ending: the head itself). */
  citation: boolean;
  roleNotes: string[];
  governs?: string;
  role?: string;
  /** Printed vowels the candidate agrees with (more = better supported). */
  agreed: number;
}

const lexemeKey = (r: Reading): string => `${r.derived ? 'd:' : ''}${arCanon(r.head)}|${r.pos}`;
const infoOf = (h: ArIndexHit): LemmaInfo => ({ head: h.lemma[0], gloss: h.lemma[1], pos: h.lemma[2], lex: h.lemma[3], count: h.lemma[4], ...(h.lemma[5] ? { root: h.lemma[5] } : {}) });

/** The printed slice of the key letters [a, b) of the word, with its vowels. */
function printedSlice(map: ReturnType<typeof arKeyMap>, surface: string, a: number, b: number): string {
  if (b <= a || a < 0 || b > map.starts.length) return '';
  return surface.slice(map.starts[a], map.ends[b - 1]);
}

interface Printed {
  map: ReturnType<typeof arKeyMap>;
  /** The text the vowels are compared on (a Quranic word rewritten as ordinary print), and the original printed word with the offsets back to it. */
  surface: string;
  orig: string;
  at?: number[];
  level: 'none' | 'partial' | 'full';
  any: boolean;
  /** The text is a typing variant of the word (no offsets back to the page): no parts, and the spelling is said to be restored. */
  restored?: boolean;
}

/** Compare the page's vowels on the stem with the candidate's (stem spelling `cand`, vowels `vocal`); the lengths may differ (وا / و). */
function compareStem(p: Printed, seg: ArSegmentation, cand: string, vocal: string, afterArticle = false): { compatible: boolean; agreed: number; endingOnly: boolean } {
  const n = seg.stemKey.length;
  const m = Math.min(n, cand.length);
  const printed = printedSlice(p.map, p.surface, seg.stemSpan[0], seg.stemSpan[0] + m);
  if (!printed) return { compatible: true, agreed: 0, endingOnly: false };
  const v = vocalMatch(printed, cand.slice(0, m), vocal.slice(0, m), { ...(afterArticle ? { afterArticle: true } : {}), ...(p.level === 'full' ? { fullyVocalized: true } : {}) });
  // a fully vocalized page always prints its shaddas: a letter the candidate doubles and the page leaves single is another word, whatever its ending
  if (p.level === 'full') {
    const pm = splitVocal(printed).marks;
    const cm = unpackVocal(cand.slice(0, m), vocal.slice(0, m));
    for (let i = 0; i < m && i < pm.length; i++) if (cm[i].shadda && !pm[i].shadda) return { compatible: false, agreed: v.agreed, endingOnly: false };
  }
  // the whole candidate was compared (a stem that lost its و before a pronoun, كتبتمو + ه, is shorter than the cut): its last letter is its ending
  const wholeStem = m === cand.length;
  return { compatible: v.compatible, agreed: v.agreed, endingOnly: !!v.endingOnly && wholeStem };
}

// ───────────────────────────── hits → readings ─────────────────────────────

const POS_OF_PARTICIPLE: Record<string, PartOfSpeech> = { Part: 'ADJ', Vnoun: 'NOUN' };

interface Env { printed: Printed; surfaceKey: string; quranic: boolean; segs: ArSegmentation[] }

/** A declined cell as one bare head: the case ending, the tanwīn and its alif taken off (شُرْبٍ, شُرْبًا, شُرْبُ → شُرْب). */
function bareHead(form: string): string {
  const { key, marks } = splitVocal(form);
  let k = key;
  const mk = marks.map((x) => ({ ...x }));
  const n = k.length;
  if (n > 3 && k[n - 1] === 'ا' && mk[n - 2].vowel === 'ً' && !mk[n - 1].vowel) { k = k.slice(0, -1); mk.pop(); }
  const last = mk[mk.length - 1];
  if (last && ['ً', 'ٌ', 'ٍ', 'َ', 'ُ', 'ِ'].includes(last.vowel) && k.length > 2 && !/[ةى]/.test(k[k.length - 1]) ) last.vowel = '';
  let out = '';
  for (let i = 0; i < k.length; i++) out += k[i] + mk[i].vowel + (mk[i].shadda ? 'ّ' : '') + (mk[i].dagger ? 'ٰ' : '');
  return out.normalize('NFC');
}

const OWN_POS = ['NOUN', 'ADJ', 'PROPN'];
/** Does the installed index hold an entry of its own with this vocalized head (any of the nominal parts of speech)? */
function hasOwnEntry(head: string): boolean {
  for (const p of OWN_POS) {
    if (lookupArabicLemma(`${head}|${p}`) || lookupArabicLemma(`${headForm(head, p)}|${p}`)) return true;
  }
  return false;
}

function readingsFromHit(env: Env, segIx: number, _stk: string, hit: ArIndexHit, viaArticle: boolean): Reading[] {
  const seg = env.segs[segIx];
  const lemmaId = hit.lemmaId;
  const info = infoOf(hit);
  const feat = arFeaturesOfCode(hit.code, info.pos, info.lex);
  const lemmaHead = lemmaOfId(lemmaId);
  const stemVocal = viaArticle ? hit.vocal.slice(2) : hit.vocal;
  // a pausal form carries no ending: it cannot take a pronoun
  if (seg.enclitics.length && feat.morph.Pausal === 'Yes') return [];
  const morph = { ...feat.morph };
  let pos = info.pos as PartOfSpeech;
  let head = lemmaHead;
  let derived: Reading['derived'];
  if ((pos === 'VERB' || pos === 'AUX') && (morph.VerbForm === 'Part' || morph.VerbForm === 'Vnoun')) {
    // a participle or verbal noun in a verb's table (no entry of its own): its own lexeme, named by the cell's form
    const cellForm = applyVocal(hit.key.slice(viaArticle ? 2 : 0), stemVocal);
    const kind = morph.VerbForm === 'Vnoun' ? 'verbal noun' : morph.Voice === 'Pass' ? 'passive participle' : 'active participle';
    pos = POS_OF_PARTICIPLE[morph.VerbForm];
    head = headForm(bareHead(cellForm), pos);
    derived = { from: lemmaHead, kind };
    delete morph.Aspect; delete morph.Mood; delete morph.Person;
    if (morph.VerbForm === 'Vnoun') delete morph.Voice;
  }
  if (derived && hasOwnEntry(head)) return [];
  // a page that prints vowels writes a hamza where it means one: a bare initial alif is hamzat al-waṣl, so a hamza restored by the fold is contradicted
  if (hit.viaLoose && env.printed.level !== 'none' && /^[أإآ]/.test(hit.key.slice(viaArticle ? 2 : 0)) && seg.stemKey[0] === 'ا') return [];
  const cmp = compareStem(env.printed, seg, hit.key.slice(viaArticle ? 2 : 0), stemVocal, seg.proclitics[seg.proclitics.length - 1]?.id === 'al');
  if (!cmp.compatible && !cmp.endingOnly) return [];
  const citation = !derived && arKey(lemmaHead) === hit.key.slice(viaArticle ? 2 : 0) && packVocal(lemmaHead) === stemVocal && !hit.code.includes('definite');
  return [{
    segIx, seg, stemKey: hit.key.slice(viaArticle ? 2 : 0), stemVocal, lemmaId, info, head, pos, morph, usage: feat.usage, viaLoose: hit.viaLoose,
    derived, endingConflict: !cmp.compatible, quranic: env.quranic, citation, roleNotes: [], agreed: cmp.agreed,
  }];
}

function readingFromClosed(env: Env, segIx: number, stk: string, e: ArClosedEntry): Reading | undefined {
  const seg = env.segs[segIx];
  const form = arCanon(e.form);
  const cmp = compareStem(env.printed, seg, arKey(form), packVocal(form), seg.proclitics[seg.proclitics.length - 1]?.id === 'al');
  if (!cmp.compatible && !cmp.endingOnly) return undefined;
  const info: LemmaInfo = { head: e.lemma, gloss: e.gloss, pos: e.pos, lex: '', count: 0 };
  return {
    segIx, seg, stemKey: stk, stemVocal: packVocal(form), lemmaId: `${e.lemma}|${e.pos}`, info, head: e.lemma, pos: e.pos, morph: { ...e.morph }, usage: [],
    viaLoose: false, hand: e, endingConflict: !cmp.compatible, quranic: env.quranic, citation: arKey(e.lemma) === arKey(e.form) && !e.suffix, roleNotes: [],
    governs: e.governs, role: e.role, agreed: cmp.agreed,
  };
}

const targetOf = (r: Reading): { pos: string; morph: Morph; lemmaKey: string } => ({ pos: r.pos, morph: r.morph, lemmaKey: arKey(r.head) });

/** Applies the clitics of the cut to a reading; undefined when one of them does not allow it. */
function withClitics(r: Reading): Reading | undefined {
  const seg = r.seg;
  const out: Reading = { ...r, morph: { ...r.morph }, roleNotes: [] };
  const t = (): { pos: string; morph: Morph; lemmaKey: string } => targetOf(out);
  // the article and the proclitics, nearest to the stem first
  for (let i = seg.proclitics.length - 1; i >= 0; i--) {
    const c = seg.proclitics[i];
    const v = arProcliticAllows(c, t());
    if (!v.ok) return undefined;
    if (v.patch) for (const [k, val] of Object.entries(v.patch)) out.morph[k] = val;
    if (v.role) out.roleNotes[i] = v.role;
  }
  const ens = seg.enclitics;
  for (let i = 0; i < ens.length; i++) {
    const inner = ens.length === 2 && i === 0;
    const v = arEncliticAllows(ens[i], t(), inner);
    if (!v.ok) return undefined;
    if (v.patch) for (const [k, val] of Object.entries(v.patch)) out.morph[k] = val;
    out.roleNotes[seg.proclitics.length + i] = v.role ?? '';
  }
  return out;
}

// ───────────────────────────── merging ─────────────────────────────

/** Features that the case / mood ending carries: a row lacking them (a pausal row) does not stop the union. */
const ENDING_KEYS = new Set(['Case', 'Mood', 'Definite']);

function mergeMorph(group: Reading[]): Morph {
  const keys = new Set<string>();
  for (const r of group) for (const k of Object.keys(r.morph)) keys.add(k);
  const out: Morph = {};
  for (const k of keys) {
    const all = group.every((r) => k in r.morph);
    if (!all && !ENDING_KEYS.has(k)) continue;
    const vals = new Set<string>();
    for (const r of group) if (k in r.morph) for (const v of r.morph[k].split(',')) vals.add(v);
    out[k] = [...vals].sort().join(',');
  }
  return out;
}

/** The vowels with the last letter's vowel taken off (the ending: case, mood). */
function withoutEnding(key: string, vocal: string): string {
  return vocal.slice(0, Math.max(0, key.length - 1)).replace(/0+$/, '');
}

/** Drops what the page's own ending makes redundant: lowered readings beside a reading of the same lexeme that agrees; pausal rows when an ending is printed; readings another covers. */
function prune(list: Merged[], lastMarked: boolean): Merged[] {
  const agrees = (m: Merged): boolean => !m.rows.every((r) => r.endingConflict);
  let out = list.filter((m) => agrees(m) || !list.some((o) => o !== m && o.segIx === m.segIx && o.lexeme === m.lexeme && agrees(o)));
  if (lastMarked) out = out.filter((m) => m.morph.Pausal !== 'Yes' || !out.some((o) => o !== m && o.segIx === m.segIx && o.lexeme === m.lexeme && o.morph.Pausal !== 'Yes'));
  const covers = (big: Morph, small: Morph): boolean => Object.entries(small).every(([k, v]) => k === 'Pausal' || (k in big && v.split(',').every((x) => big[k].split(',').includes(x))));
  return out.filter((m) => !out.some((o) => o !== m && o.segIx === m.segIx && o.lexeme === m.lexeme && vocalizedWord(o) === vocalizedWord(m)
    && Object.keys(o.morph).length > Object.keys(m.morph).length && covers(o.morph, m.morph)));
}

interface Merged {
  agreed: number;
  segIx: number;
  seg: ArSegmentation;
  rows: Reading[];
  head: string;
  pos: PartOfSpeech;
  morph: Morph;
  lexeme: string;
  stemKey: string;
  stemVocal: string;
  citation: boolean;
}

/** The case a sound plural or dual ending shows by its letters (المعلمون: ـون is nominative, ـين oblique), when the rows name none. */
function caseFromEnding(m: Merged): void {
  const mo = m.morph;
  if (mo.Case || !(m.pos === 'NOUN' || m.pos === 'ADJ' || m.pos === 'PROPN')) return;
  const k = m.stemKey;
  if (has(mo.Number, 'Plur') && mo.PluralType === 'Sound' || (has(mo.Number, 'Plur') && !mo.Number.includes(',') && /(ون|ين)$/.test(k) && mo.Gender === 'Masc' && mo.PluralType !== 'Broken')) {
    if (k.endsWith('ون')) mo.Case = 'Nom'; else if (k.endsWith('ين')) mo.Case = 'Acc,Gen';
  } else if (only(mo.Number, 'Dual')) {
    if (k.endsWith('ان')) mo.Case = 'Nom'; else if (k.endsWith('ين')) mo.Case = 'Acc,Gen';
  }
}

function mergeReadings(readings: Reading[], printedEnding: boolean): Merged[] {
  const groups = new Map<string, Reading[]>();
  for (const r of readings) {
    const form = printedEnding ? `${r.stemKey}\t${r.stemVocal}` : `${r.stemKey}\t${withoutEnding(r.stemKey, r.stemVocal)}`;
    const sig = `${r.segIx}\t${lexemeKey(r)}\t${form}\t${r.hand ? 'h' : ''}\t${r.viaLoose ? 'l' : ''}\t${[...r.usage].sort().join(',')}\t${r.endingConflict ? 'c' : ''}`;
    const g = groups.get(sig);
    if (g) g.push(r); else groups.set(sig, [r]);
  }
  const out: Merged[] = [];
  for (const g of groups.values()) {
    const first = g[0];
    out.push({
      agreed: Math.max(...g.map((r) => r.agreed)), segIx: first.segIx, seg: first.seg, rows: g, head: first.head, pos: first.pos, morph: mergeMorph(g), lexeme: lexemeKey(first),
      stemKey: first.stemKey, stemVocal: first.stemVocal, citation: g.some((r) => r.citation),
    });
  }
  for (const m of out) caseFromEnding(m);
  return out;
}

// ───────────────────────────── identity: the credit rule ─────────────────────────────

const noClitics = (m: Merged): boolean => m.seg.proclitics.length === 0 && m.seg.enclitics.length === 0;

/** Marginal for what it is by itself: a cell that rarely is the intended reading of a bare written word. */
function marginalByCell(m: Merged): boolean {
  const mo = m.morph;
  if (only(mo.Voice, 'Pass')) return true;
  if (only(mo.Mood, 'Imp') || only(mo.Mood, 'Jus') || has(mo.Mood, 'Ene')) return true;
  if (only(mo.Number, 'Dual')) return true;
  if (only(mo.Person, '2') && only(mo.Gender, 'Fem')) return true;
  return false;
}

let PAGE_FULL = false;
let PAGE_ANY = false;
function isMarginal(m: Merged, all: Merged[]): boolean {
  // the page's own vowels selected this cell: a short form of a hollow verb (قُمْ, مُتْ) is not marginal where the marks print it
  if (marginalByCell(m) && !(PAGE_FULL && m.agreed > 0)) return true;
  const others = all.filter((o) => o.lexeme !== m.lexeme);
  if (!others.length) return false;
  // a reading reached only through the loose fold (a hamza, ى for ي, ة for ه restored) against a reading of the spelling as written
  if (m.rows.every((r) => r.viaLoose) && others.some((o) => o.rows.some((r) => !r.viaLoose))) return true;
  // a proper name against a common word
  if (m.pos === 'PROPN' && others.some((o) => o.pos !== 'PROPN')) return true;
  // a cut against a whole word that is a lemma's own citation form
  if (!noClitics(m) && others.some((o) => noClitics(o) && o.citation)) return true;
  // 1st / 2nd person against a 3rd person plain reading of another lexeme
  const pm = m.morph.Person;
  if ((pm === '1' || pm === '2') && others.some((o) => o.morph.Person && has(o.morph.Person, '3') && !marginalByCell(o))) return true;
  return false;
}

interface Verdict { identity?: 'main' | 'structural' | 'undecided' | 'printed' | 'rare'; capMain?: string; top: Set<string>; cap: Map<string, number> }

function matchesMain(m: Merged, main: { proclitics: string[]; lemmaId: string }): boolean {
  const [head, pos] = main.lemmaId.split('|');
  if (m.seg.proclitics.map((c) => c.text).join('') !== main.proclitics.join('') || m.seg.enclitics.length) return false;
  return arKey(m.head) === arKey(head) && m.pos === (pos as PartOfSpeech);
}

function decide(key: string, merged: Merged[]): Verdict {
  const lexemes = [...new Set(merged.map((m) => m.lexeme))];
  const v: Verdict = { top: new Set(), cap: new Map() };
  if (lexemes.length <= 1) return v;
  const reviewed = arMainOf(key);
  if (reviewed === null) { v.identity = 'undecided'; return v; }
  const prior = reviewed === undefined ? AR_PRIORS[key] : undefined;
  if (reviewed || prior) {
    const directExists = merged.some((m) => m.rows.some((r) => !r.viaLoose));
    const hit = merged.filter((m) => (reviewed ? matchesMain(m, reviewed) : arKey(m.head) === arKey(prior!.lemma) && prior!.pos.includes(m.pos) && noClitics(m))
      && !(directExists && m.rows.every((r) => r.viaLoose)));
    if (hit.length) { v.identity = 'main'; for (const m of hit) v.top.add(m.lexeme); return v; }
  }
  // the page's printed vowels decide before the structural layer: one lexeme with strictly more agreeing marks than any other
  if (PAGE_ANY) {
    const best = new Map<string, number>();
    for (const m of merged) best.set(m.lexeme, Math.max(best.get(m.lexeme) ?? 0, m.agreed));
    const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked[0][1] > 0 && ranked[0][1] > ranked[1][1]) { v.identity = 'printed'; v.top.add(ranked[0][0]); return v; }
  }
  const nonMarginal = new Set<string>();
  for (const m of merged) if (!isMarginal(m, merged)) nonMarginal.add(m.lexeme);
  if (nonMarginal.size === 1) { v.identity = 'structural'; for (const l of nonMarginal) v.top.add(l); return v; }
  v.identity = 'undecided';
  return v;
}

// ───────────────────────────── candidates ─────────────────────────────

/** The word as the dictionary spells it, with the clitics: vocalized form for notes. */
function vocalizedWord(m: Merged): string {
  const cls = m.seg.proclitics;
  const stem = applyVocal(m.seg.stemKey, m.stemVocal.slice(0, m.seg.stemKey.length));
  const sun = /^.ّ/.test(stem);
  const pre = cls.map((c, i) => (c.id === 'al' ? (sun ? (cls[i - 1]?.id === 'li' && m.seg.proclSpans[i][1] - m.seg.proclSpans[i][0] === 1 ? 'ل' : 'ال') : cls[i - 1]?.id === 'li' && m.seg.proclSpans[i][1] - m.seg.proclSpans[i][0] === 1 ? 'لْ' : c.vocalized) : c.vocalized)).join('');
  // after a kasra or a yā' the pronoun's vowel is a kasra (كِتَابِهِ, عَلَيْهِ)
  const kasra = /(ِ|يْ?)$/.test(stem);
  const suf = m.seg.enclitics.map((p) => { const v = p.vocalized.replace(/ـ/g, ''); return kasra && p.text[0] === 'ه' && p.text !== 'ها' ? v.replace('هُ', 'هِ') : v; }).join('');
  return (pre + stem + suf).normalize('NFC');
}

/** The part of the written word each piece covers: the pieces and what the page printed. */
function partsOf(m: Merged, p: Printed, c: AnalysisCandidate, roles: string[]): WordPart[] | undefined {
  const seg = m.seg;
  if (p.restored || (noClitics(m) && !(m.rows[0].hand?.suffix))) return undefined;
  const text = (a: number, b: number): { text: string; start: number; end: number } | undefined => {
    if (b <= a || b > p.map.starts.length) return undefined;
    const s0 = p.map.starts[a], e0 = p.map.ends[b - 1];
    const start = p.at ? p.at[s0] : s0, end = p.at ? p.at[e0] : e0;
    return { text: p.orig.slice(start, end), start, end };
  };
  const parts: WordPart[] = [];
  seg.proclitics.forEach((cl: Clitic, i: number) => {
    const t = text(seg.proclSpans[i][0], seg.proclSpans[i][1]);
    if (t) parts.push({ ...t, lemma: cl.lemma, pos: cl.pos, morph: cl.id === 'al' ? { Definite: 'Def' } : {}, role: roles[i] || cl.role, kind: 'prefix' });
  });
  const hs = m.rows[0].hand?.suffix;
  if (hs && noClitics(m)) {
    // a preposition with its pronoun suffix, listed whole: the base, then the pronoun
    const n = p.map.key.length - hs.length;
    const a = text(0, n), b = text(n, p.map.key.length);
    if (a && b) {
      parts.push({ ...a, lemma: c.lemma, pos: 'ADP', morph: {}, role: 'preposition', kind: 'stem' });
      const slot = m.rows[0].hand!.morph;
      parts.push({ ...b, morph: { ...slot }, role: 'pronoun suffix (complement of the preposition)', kind: 'suffix' });
      return parts;
    }
  }
  const st = text(seg.stemSpan[0], seg.stemSpan[1]);
  if (st) parts.push({ ...st, ...(c.lemma ? { lemma: c.lemma } : {}), ...(c.pos ? { pos: c.pos } : {}), morph: { ...c.morph }, role: 'stem', kind: 'stem' });
  seg.enclitics.forEach((pr, i) => {
    const t = text(seg.encliticSpans[i][0], seg.encliticSpans[i][1]);
    if (t) parts.push({ ...t, morph: { ...pr.morph }, role: roles[seg.proclitics.length + i] ? `${roles[seg.proclitics.length + i]} (${pr.english})` : pr.english, kind: 'suffix' });
  });
  return parts;
}

function lexemeIds(head: string, pos: string): string[] {
  const base = `${head}|${pos}`;
  const out: string[] = [];
  if (lookupArabicLemma(base)) out.push(base);
  for (let n = 2; n < 20; n++) { if (lookupArabicLemma(`${base}|${n}`)) out.push(`${base}|${n}`); else break; }
  return out;
}

function toCandidate(m: Merged, p: Printed, confidence: number, identity: string | undefined, key: string, spellingNote: string | undefined): AnalysisCandidate {
  const row0 = m.rows[0];
  const info = row0.info;
  const usage = [...new Set(m.rows.flatMap((r) => r.usage))];
  const notes: Record<string, string | string[]> = {};
  const seg = m.seg;
  const lemma = headForm(m.head, m.pos);
  notes.vocalized = vocalizedWord(m);
  // the vowels shown are labelled
  const level = p.level;
  notes.vowels = level === 'full' ? 'source' : 'dictionary';
  // homonyms, glosses, root
  let gloss = info.gloss;
  let root = info.root;
  if (!m.rows[0].derived && !m.rows[0].hand) {
    const ids = lexemeIds(m.head, m.pos);
    if (ids.length > 1) {
      const rows = ids.map((id) => lookupArabicLemma(id)).filter((r): r is ArLemmaRow => !!r);
      const glosses = [...new Set(rows.map((r) => r[1]).filter(Boolean))];
      gloss = glosses.length > 1 ? glosses.map((g, i) => `${i + 1}. ${g}`).join(' ') : glosses[0] ?? '';
      const roots = [...new Set(rows.map((r) => r[5]).filter((x): x is string => !!x))];
      root = roots.length ? roots.join(' / ') : undefined;
      notes.homonyms = String(ids.length);
    }
  }
  if (row0.derived) {
    gloss = '';
    notes.derivedFrom = row0.derived.from;
    notes.derivation = row0.derived.kind;
  }
  if (root) { notes.root = root; const rc = rootClass(root.split(' / ')[0]); if (rc) notes.rootClass = rc; }
  if (m.rows.some((r) => r.viaLoose) || p.restored) notes.spelling = 'restored';
  else if (m.rows.some((r) => r.quranic)) notes.spelling = 'quranic';
  else if (spellingNote) notes.spelling = spellingNote;
  if (usage.length) notes.usage = usage;
  if (identity) notes.identity = identity;
  const closedInfo = arClosedFor(m.stemKey).find((e) => arKey(e.lemma) === arKey(m.head) && e.pos === m.pos && !e.suffix) ?? arClosedFor(m.stemKey).find((e) => arKey(e.lemma) === arKey(m.head) && !e.suffix);
  const governs = row0.governs ?? closedInfo?.governs;
  if (governs) notes.governs = governs;
  const roleText = row0.role ?? closedInfo?.role;
  if (roleText && !seg.proclitics.length) notes.role = roleText;
  if (row0.hand?.fusedOf) notes.fusedOf = row0.hand.fusedOf;
  if (seg.proclitics.length || seg.enclitics.length) {
    notes.segmentation = [...seg.proclitics.map((c) => c.vocalized), seg.stemKey, ...seg.enclitics.map((e) => e.text)].join(' + ');
    notes.source = 'rule';
  }
  // the case a preposition in front implies, when the page did not print the ending: marked as inferred, never a feature
  const prep = seg.proclitics.find((c) => c.kind === 'prep');
  if (prep && !seg.enclitics.length && has(m.morph.Case, 'Gen') && m.morph.Case.includes(',') && m.morph.Definite !== undefined) {
    notes.case = `inferred: genitive after ${prep.vocalized}`;
    notes.caseSource = 'inferred';
  }
  const c: AnalysisCandidate = { lemma, pos: m.pos, morph: { ...m.morph }, confidence: round2(confidence), origin: seg.proclitics.length || seg.enclitics.length ? 'rule' : row0.hand ? 'hand' : 'dictionary', sourceId: row0.hand ? AR_SOURCE_IDS.closed : seg.proclitics.length || seg.enclitics.length ? AR_SOURCE_IDS.rules : AR_SOURCE_IDS.tables };
  if (gloss) c.gloss = gloss;
  const lexReg = lexOf([info.head, info.gloss, info.pos, info.lex, info.count] as ArLemmaRow)['Reg'];
  c.varieties = lexReg === 'Cla' ? [AR_VARIETIES.classical] : lexReg === 'Msa' ? [AR_VARIETIES.msa] : [AR_VARIETIES.msa, AR_VARIETIES.classical];
  if (row0.role) c.role = row0.role;
  c.notes = notes;
  const parts = partsOf(m, p, c, m.rows[0].roleNotes);
  if (parts) c.parts = parts;
  void key;
  return c;
}

// ───────────────────────────── the entrance ─────────────────────────────

function gatherReadings(env: Env): Reading[] {
  const all: Reading[] = [];
  env.segs.forEach((seg, segIx) => {
    const cut = seg.proclitics.length > 0 || seg.enclitics.length > 0;
    const viaArticle = seg.proclitics[seg.proclitics.length - 1]?.id === 'al';
    for (const stk of seg.stemKeys) {
      const rows: Reading[] = [];
      const hits = lookupArabicForm(stk);
      for (const h of hits) {
        // the definite rows of a word are keyed with the article: read through the cut instead, never twice
        if (h.key.startsWith('ال') && h.code.includes('definite') && !arKey(lemmaOfId(h.lemmaId)).startsWith('ال')) continue;
        if (viaArticle && h.code.includes('definite')) continue;
        for (const r of readingsFromHit(env, segIx, stk, h, false)) {
          // after the article a plain row is read only as the construct state (the article's own rows are the definite ones, below)
          if (viaArticle && r.morph.Definite !== undefined && !has(r.morph.Definite, 'Cons')) continue;
          rows.push(r);
        }
      }
      if (viaArticle) {
        const defHits = lookupArabicForm(`ال${stk}`).filter((h) => h.code.includes('definite'));
        for (const h of defHits) for (const r of readingsFromHit(env, segIx, stk, h, true)) rows.push(r);
        // a lemma that has definite rows is read through them only
        const withDef = new Set(rows.filter((r) => r.morph.Definite === 'Def').map((r) => r.lemmaId));
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].morph.Definite !== 'Def' && withDef.has(rows[i].lemmaId)) rows.splice(i, 1);
      }
      // the closed-class table: whole words (with a pronoun suffix or fused) only uncut; plain entries also as stems
      for (const e of arClosedFor(stk)) {
        if ((e.suffix || e.fusedOf) && cut) continue;
        if (rows.some((r) => !r.hand && arKey(r.head) === arKey(e.lemma) && r.pos === e.pos && (!e.suffix || r.morph.Person === e.morph.Person))) continue;
        const r = readingFromClosed(env, segIx, stk, e);
        if (r) rows.push(r);
      }
      for (const r of rows) {
        const w = cut ? withClitics(r) : r;
        if (w) all.push(w);
      }
    }
  });
  return all;
}

/** A hand reading that spells the same preposition + pronoun as an uncut index cut: the listed word wins over the cut. */
function dropShadowedCuts(readings: Reading[]): Reading[] {
  const handSuffix = readings.filter((r) => r.hand?.suffix);
  return readings.filter((r) => {
    if (r.hand?.suffix || r.seg.proclitics.length || r.seg.enclitics.length !== 1) return true;
    return !handSuffix.some((h) => arKey(h.head) === arKey(r.head) && h.pos === r.pos);
  }).filter((r) => {
    // a preposition the index lists WITH its pronoun (عَلَيْهِ as one word) is not also read as a cut
    if (r.hand?.suffix || r.seg.proclitics.length || r.seg.enclitics.length !== 1 || r.pos !== 'ADP') return true;
    return !readings.some((u) => !u.seg.proclitics.length && !u.seg.enclitics.length && u.pos === 'ADP' && arKey(u.head) === arKey(r.head) && u.morph.Person !== undefined);
  });
}

/** Drop a derived participle / verbal noun when the index has an entry of that form of its own (same vocalized head and part of speech). */
function dropDerivedDuplicates(readings: Reading[]): Reading[] {
  return readings.filter((r) => {
    if (!r.derived) return true;
    return !readings.some((o) => !o.derived && o.segIx === r.segIx && o.pos === r.pos && arKey(o.head) === arKey(r.head) && packVocal(o.head) === packVocal(r.head));
  });
}

/** The context-free readings of one word token, best first; an empty list when nothing is known (a pattern guess, or nothing). */
export function arWordCandidates(token: RawToken): AnalysisCandidate[] {
  if (!token.isWord) return [];
  const own = arKeyMap(token.surface);
  if (!own.key || !T.ARABIC_LETTER.test(own.key)) return [];
  // the word as it stands first; only when nothing reads it, the ordinary spellings of a Quranic one (text.ts arQuranicSpellings)
  const tries: Array<{ text: string; at?: number[]; quranic: boolean }> = [{ text: token.surface, quranic: false }];
  const quranic = typeof T.arQuranicSpellings === 'function' ? T.arQuranicSpellings(token.surface) : [];
  for (const q of quranic) tries.push({ text: q.text, at: q.at, quranic: true });
  for (const t of tries) {
    const out = readSurface(token, t.text, t.at, t.quranic);
    if (out.length) return out;
  }
  // a typing habit (قارىء for قارئ): restored spellings, said so
  for (const v of T.arTypingVariants(own.key)) {
    const out = readSurface(token, v, undefined, false, true);
    if (out.length) return out;
  }
  const nisba = nisbaGuess(own.key);
  if (nisba.length) return nisba;
  return arGuess(own.key).map((g) => ({
    pos: g.pos, morph: g.morph, confidence: CONF_GUESS, unconfirmed: true, origin: 'rule' as const, sourceId: AR_SOURCE_IDS.rules,
    notes: { source: 'rule', pattern: g.ending },
  }));
}

/** An unknown feminine nisba adjective (الدولية, عالمية) read from a known noun: a guess, marked, with no gloss and no lemma. */
function nisbaGuess(key: string): AnalysisCandidate[] {
  let body = key;
  let def = false;
  if (body.startsWith('ال') && body.length > 6) { body = body.slice(2); def = true; }
  if (body.length < 5 || !body.endsWith('ية')) return [];
  const stem = body.slice(0, -2);
  for (const base of [`${stem}ة`, stem]) {
    const hit = lookupArabicForm(base).find((h) => !h.viaLoose && (h.lemma[2] === 'NOUN' || h.lemma[2] === 'PROPN') && h.lemma[4] > 0);
    if (hit) {
      return [{
        pos: 'ADJ', morph: { Gender: 'Fem', Number: 'Sing', ...(def ? { Definite: 'Def' } : {}) }, confidence: CONF_GUESS, unconfirmed: true, origin: 'rule', sourceId: AR_SOURCE_IDS.rules,
        notes: { source: 'rule', pattern: 'nisba ـِيَّة', nisbaOf: lemmaOfId(hit.lemmaId) },
      }];
    }
  }
  return [];
}

function readSurface(token: RawToken, text: string, at: number[] | undefined, quranic: boolean, restored = false): AnalysisCandidate[] {
  const map = arKeyMap(text);
  const surfaceKey = map.key;
  const level = tashkilLevel(text);
  const printed: Printed = { map, surface: text, orig: token.surface, ...(at ? { at } : {}), level, any: level !== 'none', ...(restored ? { restored: true } : {}) };
  PAGE_FULL = level === 'full';
  PAGE_ANY = level !== 'none';
  const keys: Array<{ key: string }> = [{ key: surfaceKey }];
  if (T.endsInFarsiYeh(text)) { const alt = surfaceKey.replace(/ي$/, 'ى'); if (alt !== surfaceKey) keys.push({ key: alt }); }
  const merged: Merged[] = [];
  for (const k of keys) {
    const segs = arSegmentations(k.key);
    const env: Env = { printed, surfaceKey: k.key, quranic, segs };
    const readings = dropDerivedDuplicates(dropShadowedCuts(gatherReadings(env)));
    // is the last letter's vowel printed? (then rows with another ending are told apart)
    const lastMarked = /[ً-ْ]/.test(printedSlice(map, text, k.key.length - 1, k.key.length));
    for (const m of prune(mergeReadings(readings, lastMarked), lastMarked)) merged.push(m);
  }
  if (!merged.length) return [];

  const verdict = decide(surfaceKey, merged);
  const base = (m: Merged): number => {
    const clitics = m.seg.proclitics.length + m.seg.enclitics.length;
    let c = CONF_OWN - CONF_CLITIC * clitics;
    if (m.rows.every((r) => r.viaLoose)) c -= CONF_LOOSE;
    if (m.rows.every((r) => r.usage.some((u) => AR_LOWERED_USAGE.has(u)))) c -= CONF_USAGE;
    if (m.rows.every((r) => r.endingConflict)) c -= CONF_ENDING;
    // a preposition + 1st person suffix whose doubled yā' (فِيَّ, عَلَيَّ) is one letter in the unvocalized key: the plain preposition outranks it
    if (m.rows.every((r) => r.hand?.suffix && arKey(r.head) === m.stemKey)) c -= 0.4;
    return c;
  };
  const scored = merged.map((m) => {
    let c = base(m);
    const topLexeme = verdict.top.has(m.lexeme);
    if (verdict.identity === 'main') c = topLexeme ? Math.min(c, CONF_MAIN) : Math.min(c, CONF_UNDECIDED);
    else if (verdict.identity === 'structural') c = topLexeme ? Math.min(c, CONF_STRUCTURAL) : Math.min(c, CONF_UNDECIDED);
    else if (verdict.identity === 'printed') c = topLexeme ? Math.min(c, CONF_PRINTED) : Math.min(c, CONF_UNDECIDED);
    else if (verdict.identity === 'undecided') c = Math.min(c, CONF_UNDECIDED);
    let identity: string | undefined = verdict.identity;
    // a lone lexeme with no evidence of its own on a very short key reads as a rare word, not a confident one (dialect and Persian words)
    if (!verdict.identity && surfaceKey.length <= 3 && level === 'none' && m.agreed === 0 && ['NOUN', 'VERB', 'ADJ', 'PROPN'].includes(m.pos) && m.rows.every((r) => !r.hand && !r.derived && r.info.count === 0)) { c = Math.min(c, CONF_UNDECIDED); identity = 'rare'; }
    return { m, c, identity, marginal: merged.length > 1 && isMarginal(m, merged) };
  });

  const forms = new Set(scored.map((s) => vocalizedWord(s.m)));
  const count = (s: { m: Merged }): number => Math.max(...s.m.rows.map((r) => r.info.count));
  const derivedCut = (s: { m: Merged }): number => (s.m.rows[0].derived ? (noClitics(s.m) ? 1 : 2) : 0);
  scored.sort((a, b) => (b.c - a.c) || (Number(a.marginal) - Number(b.marginal)) || (derivedCut(a) - derivedCut(b)) || (count(b) - count(a))
    || ((a.m.seg.proclitics.length + a.m.seg.enclitics.length) - (b.m.seg.proclitics.length + b.m.seg.enclitics.length)) || a.m.lexeme.localeCompare(b.m.lexeme));

  // cap: the best of each lexeme first, then the rest in order
  const chosen: typeof scored = [];
  const seenLex = new Set<string>();
  for (const s of scored) if (!seenLex.has(s.m.lexeme)) { seenLex.add(s.m.lexeme); chosen.push(s); }
  for (const s of scored) if (chosen.length < MAX_CANDIDATES && !chosen.includes(s)) chosen.push(s);
  const picked = chosen.slice(0, MAX_CANDIDATES);
  picked.sort((a, b) => scored.indexOf(a) - scored.indexOf(b));

  const out: AnalysisCandidate[] = [];
  const seenSig = new Set<string>();
  for (const s of picked) {
    const c = toCandidate(s.m, printed, s.c, s.identity, surfaceKey, undefined);
    if (!c.notes) c.notes = {};
    if (level !== 'full' && forms.size > 1) c.notes.vowels = 'unresolved';
    // two readings with one lemma, one vocalized form and the same features are one reading (rows that differ only in a tag's order or a gender tag)
    const closedPos = c.pos === 'PRON' || c.pos === 'ADP' || c.pos === 'PART' || c.pos === 'CONJ' || c.pos === 'SCONJ' || c.pos === 'ADV' || c.pos === 'DET';
    const sig = `${c.lemma}|${c.pos}|${closedPos ? '' : c.notes.vocalized}|${JSON.stringify(Object.entries(c.morph).sort())}|${c.notes.segmentation ?? ''}`;
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    out.push(c);
  }
  return out;
}
