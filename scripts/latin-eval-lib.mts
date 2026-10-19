/// <reference types="node" />
/**
 * Latin evaluation library (2026-10-17): a repeatable, honest measurement of the Latin analyser (`laAdapter`, src/adapters/la.ts)
 * over five corpora, with gold-standard accuracy wherever a gold annotation exists.
 *
 * COVERAGE needs no gold: for every word token of a text, what the adapter says (a reading, from the lexicon, by rule, an
 * unconfirmed guess, nothing). ACCURACY needs a gold annotation:
 *   - PROIEL (Latin NT, Jerome's Vulgate, CC BY-NC-SA 4.0) held by Vetus V0, aligned to the Clementine Vulgate verse by verse;
 *   - the Perseus / AGLDT Latin Dependency Treebank (CC BY-SA 3.0 US), scored per author, either on the treebank's own text
 *     (corpus `perseus-<author>`) or aligned word by word onto the on-disk Cicero / Vergil / Ovid texts.
 * Gold files are read ONLY with gold = true. Nothing is ever written next to a source; nothing from a source is executed.
 *
 * The adapter files (src/adapters/la.ts, src/adapters/latin/**) belong to another lane and are only imported here.
 * Used by scripts/latin-eval.mts (CLI) and test/latin/eval.test.ts. See docs/latin/EVAL.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { laAdapter } from '../src/adapters/la';
import type { RawToken } from '../src/core';

export const REPO = path.resolve(import.meta.dirname, '..');
const DEV = path.resolve(REPO, '..');
export const VETUS_ROOT = process.env.LATIN_EVAL_VETUS ?? path.join(DEV, 'vetus-v0');
export const ROMANCE_ROOT = process.env.LATIN_EVAL_ROMANCE ?? path.join(DEV, 'romance-v0');
export const SOURCES_ROOT = process.env.LATIN_EVAL_SOURCES ?? path.join(DEV, 'latin-eval-sources');
export const USFX_FILE = path.join(VETUS_ROOT, 'data/vulgate/lat-clementine.usfx.xml');
export const PROIEL_FILE = path.join(VETUS_ROOT, 'data/proiel/latin-nt.xml');
export const ROMANCE_LA = path.join(ROMANCE_ROOT, 'data/la');
export const PRINCIPIA_FILE = path.join(SOURCES_ROOT, 'principia/pg28233.txt');
export const PERSEUS_DIR = path.join(SOURCES_ROOT, 'perseus');

// ──────────────────────────────────────────── corpus table ────────────────────────────────────────────

export interface PerseusWork { key: string; file: string }
/** The twelve files of PerseusDL/treebank_data v2.1/Latin/texts (commit bf4334f0af5e13d16b04c1cccd6237e683ac6f5f). Labels are read from each file's own header. */
export const PERSEUS_WORKS: PerseusWork[] = [
  { key: 'caesar', file: 'phi0448.phi001.perseus-lat1.tb.xml' },
  { key: 'cicero', file: 'phi0474.phi013.perseus-lat1.tb.xml' },
  { key: 'propertius', file: 'phi0620.phi001.perseus-lat1.tb.xml' },
  { key: 'sallust', file: 'phi0631.phi001.perseus-lat1.tb.xml' },
  { key: 'vergil', file: 'phi0690.phi003.perseus-lat1.tb.xml' },
  { key: 'ovid', file: 'phi0959.phi006.perseus-lat1.tb.xml' },
  { key: 'petronius', file: 'phi0972.phi001.perseus-lat1.xml' },
  { key: 'phaedrus', file: 'phi0975.phi001.perseus-lat1.tb.xml' },
  { key: 'resgestae', file: 'phi1221.phi007.perseus-lat1.tb.xml' },
  { key: 'suetonius', file: 'phi1348.abo012.perseus-lat1.tb.xml' },
  { key: 'tacitus', file: 'phi1351.phi005.perseus-lat1.tb.xml' },
  { key: 'jerome', file: 'tlg0031.tlg027.perseus-lat1.tb.xml' },
];
export const PERSEUS_COMMIT = 'bf4334f0af5e13d16b04c1cccd6237e683ac6f5f';
export const MAIN_CORPORA = ['vulgate', 'nt', 'cicero', 'vergil', 'ovid', 'principia'] as const;
export const PERSEUS_CORPORA = PERSEUS_WORKS.map((w) => `perseus-${w.key}`);
export const ALL_CORPORA: string[] = [...MAIN_CORPORA, ...PERSEUS_CORPORA];

const CORPUS_FILES: Record<string, string[]> = {
  cicero: ['cicero-in-catilinam-1', 'cicero-in-catilinam-2', 'cicero-in-catilinam-3', 'cicero-in-catilinam-4', 'cicero-pro-archia', 'cicero-de-amicitia', 'cicero-somnium-scipionis'],
  vergil: ['vergil-aeneid-1', 'vergil-aeneid-2', 'vergil-aeneid-4', 'vergil-aeneid-6'],
  ovid: ['ovid-met-1'],
};
/** The Perseus work an on-disk corpus is aligned to for gold. */
const ALIGNED_GOLD: Record<string, string> = { cicero: 'cicero', vergil: 'vergil', ovid: 'ovid' };

const NT_BOOKS = ['MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'];
const PROIEL_BOOK: Record<string, string> = {
  MATT: 'MAT', MARK: 'MRK', LUKE: 'LUK', JOHN: 'JHN', ACTS: 'ACT', ROM: 'ROM', '1COR': '1CO', '2COR': '2CO', GAL: 'GAL', EPH: 'EPH', PHIL: 'PHP', COL: 'COL',
  '1THESS': '1TH', '2THESS': '2TH', '1TIM': '1TI', '2TIM': '2TI', TIT: 'TIT', PHILEM: 'PHM', HEB: 'HEB', JAS: 'JAS', '1PET': '1PE', '2PET': '2PE',
  '1JOHN': '1JN', '2JOHN': '2JN', '3JOHN': '3JN', JUDE: 'JUD', REV: 'REV',
};

/** Which sources are on disk (the test skips what is missing). */
export function sourceStatus(): Record<string, boolean> {
  const st: Record<string, boolean> = {
    vulgate: fs.existsSync(USFX_FILE), nt: fs.existsSync(USFX_FILE), principia: fs.existsSync(PRINCIPIA_FILE),
    proiel: fs.existsSync(PROIEL_FILE),
  };
  for (const [k, files] of Object.entries(CORPUS_FILES)) st[k] = files.every((f) => fs.existsSync(path.join(ROMANCE_LA, `${f}.text.json`)));
  for (const w of PERSEUS_WORKS) st[`perseus-${w.key}`] = fs.existsSync(path.join(PERSEUS_DIR, w.file));
  return st;
}

// ──────────────────────────────────────────── small helpers ────────────────────────────────────────────

const sha256 = (b: Buffer | string): string => crypto.createHash('sha256').update(b).digest('hex');
const decodeEntities = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const pct = (n: number, d: number): number => (d ? Math.round((n / d) * 10000) / 100 : 0);

/**
 * The comparison key: NFD, no combining marks (macrons, breves, accents), lower case, ligatures spelled out, j -> i, v -> u, letters only.
 * Written here, not imported from the adapter, so that the instrument does not move when the adapter does.
 */
export function strictKey(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/æ|ǽ|ǣ/g, 'ae').replace(/œ/g, 'oe').replace(/ſ/g, 's')
    .normalize('NFD').replace(/\p{M}+/gu, '').replace(/j/g, 'i').replace(/v/g, 'u').replace(/[^a-z]/g, '');
}
/** The lenient key: strictKey with ae / oe written e (caelum = coelum = celum; medieval spelling). */
export function lenientKey(s: string): string { return strictKey(s).replace(/ae|oe/g, 'e').replace(/ii/g, 'i'); }

/** Strong stops only: "." "?" "!" (optionally followed by closing quotes) before a capital, quote or bracket. Same rule as scripts/corpus-la-build.mts. */
export function splitSentences(text: string): string[] {
  const t = text.trim();
  const out: string[] = [];
  let from = 0;
  for (const m of t.matchAll(/(?<=[.?!]["”’)\]]*)\s+(?=["“‘'(\[\p{Lu}])/gu)) {
    const before = t.slice(from, m.index);
    if (/(^|[\s\[(])\p{L}\p{M}*\.\]?$/u.test(before) || /(^|[\s\[(])(Kal|Apr|Non|Id|Ian|Dec|Cos)\.\]?$/u.test(before)) continue;
    out.push(before.trim());
    from = m.index + m[0].length;
  }
  out.push(t.slice(from).trim());
  return out.filter(Boolean);
}

// ──────────────────────────────────────────── text loaders ────────────────────────────────────────────

export interface Sent { id: string; text: string }

interface UsfxBook { id: string; verses: Array<{ chapter: number; verse: number; text: string }> }
let usfxCache: UsfxBook[] | undefined;
function loadUsfx(): UsfxBook[] {
  if (usfxCache) return usfxCache;
  const raw = fs.readFileSync(USFX_FILE, 'utf8');
  const books: UsfxBook[] = [];
  for (const m of raw.matchAll(/<book id="([^"]+)">([\s\S]*?)<\/book>/g)) {
    const verses: UsfxBook['verses'] = [];
    let ch = 0;
    for (const t of m[2].matchAll(/<c id="(\d+)"\/>|<v id="(\d+)"\/>([\s\S]*?)<ve\/>/g)) {
      if (t[1]) ch = Number(t[1]);
      else verses.push({ chapter: ch, verse: Number(t[2]), text: decodeEntities(t[3].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() });
    }
    books.push({ id: m[1], verses });
  }
  usfxCache = books;
  return books;
}

function vulgateSentences(ntOnly: boolean): Sent[] {
  const out: Sent[] = [];
  for (const b of loadUsfx()) {
    if (ntOnly && !NT_BOOKS.includes(b.id)) continue;
    for (const v of b.verses) if (v.text) out.push({ id: `${b.id}.${v.chapter}.${v.verse}`, text: v.text });
  }
  return out;
}

/** The text of a Latin Wikisource page held as an API response (`parse.text['*']`, HTML): prose paragraphs or the lines of the poem block, with headings, tables, line numbers and navigation removed. */
export function wikisourceParagraphs(html: string): string[] {
  let h = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  for (let guard = 0; guard < 50; guard++) {
    const next = h.replace(/<table(?:(?!<table)[\s\S])*?<\/table>/g, '');
    if (next === h) break;
    h = next;
  }
  h = h.replace(/<div class="mw-heading[\s\S]*?<\/div>/g, '').replace(/<span class="plainlinks"[\s\S]*?<\/span>/g, '').replace(/<span class="mw-editsection"[\s\S]*?<\/span><\/span>/g, '');
  const text = (frag: string): string => decodeEntities(frag.replace(/<br\s*\/?>[ \t]*\n?/g, '\n').replace(/<\/p>/g, '\n\n').replace(/<[^>]+>/g, '')).replace(/ /g, ' ');
  const poemStart = h.indexOf('<div class="poem">');
  if (poemStart >= 0) {
    // the poem block: to the matching close of the div
    let depth = 0; let end = h.length;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = poemStart;
    for (let m = re.exec(h); m; m = re.exec(h)) {
      depth += m[0] === '</div>' ? -1 : 1;
      if (depth === 0) { end = m.index; break; }
    }
    const stanzas = text(h.slice(poemStart, end)).split(/\n\s*\n/);
    return stanzas.map((s) => s.split('\n').map((l) => l.replace(/\s+$/, '').trim()).filter(Boolean).join(' ')).filter(Boolean);
  }
  const out: string[] = [];
  for (const m of h.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    let t = text(m[1]).replace(/\s+/g, ' ').trim();
    if (!t || t.startsWith('<') || /The Latin Library|The Classics Page|^Cicero$/.test(t)) continue;
    t = t.replace(/^\[\d+\]\s*/, '').replace(/^(?:[IVXLC]+\.\s+)(?=[A-Z])/, '');
    if (t.length > 20) out.push(t);
  }
  return out;
}

function romanceSentences(corpus: string): Sent[] {
  const out: Sent[] = [];
  for (const f of CORPUS_FILES[corpus]) {
    const j = JSON.parse(fs.readFileSync(path.join(ROMANCE_LA, `${f}.text.json`), 'utf8')) as { parse: { text: { '*': string } } };
    let n = 0;
    for (const para of wikisourceParagraphs(j.parse.text['*'])) for (const s of splitSentences(para)) out.push({ id: `${f}#${++n}`, text: s });
  }
  return out;
}

/** Principia's Latin, from the Gutenberg plain text: the body from the preface to FINIS, paragraphs rejoined, the edition's abbreviations spelled out (q; -> que, & -> et), formula paragraphs dropped. */
export const PRINCIPIA_NOTES = 'Preprocessing of the Gutenberg text (all of it is edition convention, not language): text from "PRAEFATIO" to "FINIS" (front matter and the errata list dropped); line breaks and end-of-line hyphens rejoined; _italic_ marks, {braces} and [=overlines] removed; [Illustration] paragraphs dropped; paragraphs that are mostly formulae (under half of the tokens are words of three letters or more) dropped; "q;" (the printer\'s -que) written -que and "&" written et; sentences split at . ? ! as for the other corpora. Single capital letters and all-capital groups of up to six letters that are not Roman numerals are diagram labels (point A, line AB) and are counted apart, not as words.';
function principiaSentences(raw: boolean): Sent[] {
  const txt = fs.readFileSync(PRINCIPIA_FILE, 'utf8').replace(/\r\n/g, '\n');
  const start = txt.indexOf('PRÆFATIO');
  const end = txt.indexOf('_FINIS._');
  let body = txt.slice(start, end);
  body = body.replace(/(\w)-\n(?=[a-zæœ])/g, '$1');
  const out: Sent[] = [];
  let n = 0;
  for (const block of body.split(/\n\s*\n/)) {
    let t = block.replace(/\n/g, ' ');
    if (/\[Illustration/.test(t) || /^\s*\*[ *]+$/.test(t)) continue;
    t = t.replace(/\[=([^\]]*)\]/g, '$1').replace(/[_{}]/g, '').replace(/\s+/g, ' ').trim();
    if (!raw) t = t.replace(/(\p{L})q;/gu, '$1que').replace(/\s&\s/g, ' et ').replace(/&/g, 'et');
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 2) continue;
    if (words.filter((w) => /^\p{L}{3,}[.,;:?!)]*$/u.test(w)).length * 2 < words.length) continue;
    for (const s of splitSentences(t)) out.push({ id: `principia#${++n}`, text: s });
  }
  return out;
}

// ──────────────────────────────────────────── gold model ────────────────────────────────────────────

export const FEATURE_KEYS = ['Case', 'Number', 'Gender', 'Person', 'Tense', 'Mood', 'Voice', 'VerbForm', 'Degree'] as const;
type FeatKey = (typeof FEATURE_KEYS)[number];

/** One gold word as scored: a word of the treebank (with an enclitic -que / -ve glued back on), its acceptable UPOS tags and its features (each a set of acceptable values). */
export interface GoldUnit {
  form: string;
  key: string;
  lemma: string;
  /** the lemma with the glued enclitic (neque = ne + que), accepted as a second reading of the lemma */
  altLemma?: string;
  rawPos: string;
  upos: string[];
  feats: Partial<Record<FeatKey, string[]>>;
}
interface GoldSentence { id: string; units: GoldUnit[]; text: string }

const stripLemmaNo = (l: string): string => l.replace(/[0-9]+$/, '');

const PROIEL_UPOS: Record<string, string[]> = {
  'A-': ['ADJ'], Df: ['ADV'], Dq: ['ADV'], Du: ['ADV'], 'S-': ['DET'], Ma: ['NUM'], Mo: ['NUM'], Nb: ['NOUN'], Ne: ['PROPN'], 'C-': ['CONJ'], 'G-': ['SCONJ'],
  Pp: ['PRON'], Pk: ['PRON'], Pc: ['PRON'], Pr: ['PRON', 'DET'], Pi: ['PRON', 'DET'], Pd: ['PRON', 'DET'], Px: ['PRON', 'DET'], Py: ['PRON', 'DET'], Ps: ['PRON', 'DET'], Pt: ['PRON', 'DET'],
  'R-': ['ADP'], 'I-': ['INTJ'], 'F-': ['X'], 'V-': ['VERB'], 'N-': ['X'], 'X-': ['X'],
};
function proielFeats(m: string): Partial<Record<FeatKey, string[]>> {
  const f: Partial<Record<FeatKey, string[]>> = {};
  const [p, n, t, mo, v, g, c, d] = m.split('');
  if ('123'.includes(p) && p !== '-') f.Person = [p];
  if (n === 's') f.Number = ['Sing']; else if (n === 'p') f.Number = ['Plur'];
  const tense: Record<string, string> = { p: 'Pres', i: 'Imp', r: 'Perf', l: 'Pqp', f: 'Fut', t: 'FutPerf' };
  if (tense[t]) f.Tense = [tense[t]];
  const mood: Record<string, string[]> = { i: ['Ind'], s: ['Sub'], m: ['Imp'], e: ['Ind', 'Sub'], f: ['Ind', 'Imp'], h: ['Sub', 'Imp'] };
  if (mood[mo]) { f.Mood = mood[mo]; f.VerbForm = ['Fin']; }
  else if (mo === 't') f.VerbForm = ['Fin'];
  else if (mo === 'n') f.VerbForm = ['Inf']; else if (mo === 'p') f.VerbForm = ['Part']; else if (mo === 'd') f.VerbForm = ['Ger']; else if (mo === 'g') f.VerbForm = ['Gdv']; else if (mo === 'u') f.VerbForm = ['Sup'];
  const voice: Record<string, string[]> = { a: ['Act'], p: ['Pass'], m: ['Mid'], e: ['Pass', 'Mid'] };
  if (voice[v]) f.Voice = voice[v];
  const gender: Record<string, string[]> = { m: ['Masc'], f: ['Fem'], n: ['Neut'], p: ['Masc', 'Fem'], o: ['Masc', 'Neut'], r: ['Fem', 'Neut'] };
  if (gender[g]) f.Gender = gender[g];
  const kase: Record<string, string[]> = { n: ['Nom'], a: ['Acc'], g: ['Gen'], d: ['Dat'], b: ['Abl'], v: ['Voc'], l: ['Loc'], c: ['Gen', 'Dat'], e: ['Acc', 'Dat'], o: ['Acc', 'Gen', 'Dat', 'Abl'] };
  if (kase[c]) f.Case = kase[c];
  const degree: Record<string, string> = { p: 'Pos', c: 'Cmp', s: 'Sup' };
  if (degree[d]) f.Degree = [degree[d]];
  return f;
}

const PERSEUS_UPOS: Record<string, string[]> = {
  n: ['NOUN', 'PROPN'], v: ['VERB', 'AUX'], t: ['VERB'], a: ['ADJ', 'DET'], d: ['ADV'], c: ['CONJ', 'SCONJ'], r: ['ADP'], p: ['PRON', 'DET'], m: ['NUM'], i: ['INTJ'], e: ['INTJ'], l: ['DET'], g: ['PART'], x: ['X'],
};
function perseusFeats(tag: string): Partial<Record<FeatKey, string[]>> {
  const f: Partial<Record<FeatKey, string[]>> = {};
  const [, p, n, t, mo, v, g, c, d] = tag.split('');
  if (p && '123'.includes(p) && p !== '-') f.Person = [p];
  if (n === 's') f.Number = ['Sing']; else if (n === 'p') f.Number = ['Plur'];
  const tense: Record<string, string> = { p: 'Pres', i: 'Imp', r: 'Perf', l: 'Pqp', f: 'Fut', t: 'FutPerf' };
  if (tense[t]) f.Tense = [tense[t]];
  if (mo === 'i') { f.Mood = ['Ind']; f.VerbForm = ['Fin']; } else if (mo === 's') { f.Mood = ['Sub']; f.VerbForm = ['Fin']; } else if (mo === 'm') { f.Mood = ['Imp']; f.VerbForm = ['Fin']; }
  else if (mo === 'n') f.VerbForm = ['Inf']; else if (mo === 'p') f.VerbForm = ['Part']; else if (mo === 'd') f.VerbForm = ['Ger']; else if (mo === 'g') f.VerbForm = ['Gdv']; else if (mo === 'u') f.VerbForm = ['Sup'];
  if (v === 'a') f.Voice = ['Act']; else if (v === 'p') f.Voice = ['Pass'];
  const gender: Record<string, string> = { m: 'Masc', f: 'Fem', n: 'Neut' };
  if (gender[g]) f.Gender = [gender[g]];
  const kase: Record<string, string> = { n: 'Nom', g: 'Gen', d: 'Dat', a: 'Acc', b: 'Abl', v: 'Voc', l: 'Loc' };
  if (kase[c]) f.Case = [kase[c]];
  const degree: Record<string, string> = { c: 'Cmp', s: 'Sup' };
  if (degree[d]) f.Degree = [degree[d]];
  return f;
}

function xmlAttrs(tag: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) o[m[1]] = decodeEntities(m[2]);
  return o;
}

const ENCLITICS = new Set(['que', 'ue', 've', '-que', '-ue', '-ve']);
const encl = (form: string): string => form.toLowerCase().replace(/^-/, '');

/** PROIEL: one array of units per verse key BOOK.chapter.verse. */
let proielCache: Map<string, GoldUnit[]> | undefined;
export function loadProiel(): Map<string, GoldUnit[]> {
  if (proielCache) return proielCache;
  const raw = fs.readFileSync(PROIEL_FILE, 'utf8');
  const byVerse = new Map<string, GoldUnit[]>();
  let prevGlueable = false;
  let prevVerse = '';
  for (const m of raw.matchAll(/<token\b([^>]*?)\/?>/g)) {
    const a = xmlAttrs(m[1]);
    if (a.form === undefined || a['empty-token-sort']) continue;
    const cp = /^([A-Z0-9]+) (\d+)\.(\d+)/.exec(a['citation-part'] ?? '');
    const book = cp ? PROIEL_BOOK[cp[1]] : undefined;
    if (!cp || !book) continue;
    const verse = `${book}.${Number(cp[2])}.${Number(cp[3])}`;
    const rawPos = a['part-of-speech'] ?? 'X-';
    const lemma = (a.lemma ?? a.form).replace(/#d+$/, '');
    const list = byVerse.get(verse) ?? [];
    byVerse.set(verse, list);
    const last = list[list.length - 1];
    if (ENCLITICS.has(a.form.toLowerCase()) && last && prevGlueable && prevVerse === verse) {
      last.form += encl(a.form); last.key = strictKey(last.form); last.altLemma = last.lemma + a.lemma.replace(/^-/, '');
    } else {
      let upos = PROIEL_UPOS[rawPos] ?? ['X'];
      if (rawPos === 'V-' && /^sum$/i.test(lemma)) upos = ['AUX', 'VERB'];
      list.push({ form: a.form, key: strictKey(a.form), lemma, rawPos, upos, feats: proielFeats(a.morphology ?? '----------') });
    }
    // the next token is glued on when this one is directly followed (no presentation-after)
    prevGlueable = !a['presentation-after'];
    prevVerse = verse;
  }
  proielCache = byVerse;
  return byVerse;
}

interface PerseusParsed { label: string; sentences: GoldSentence[]; units: GoldUnit[]; sha256: string; bytes: number; words: number }
const perseusCache = new Map<string, PerseusParsed>();
export function loadPerseus(key: string): PerseusParsed {
  const hit = perseusCache.get(key);
  if (hit) return hit;
  const w = PERSEUS_WORKS.find((x) => x.key === key);
  if (!w) throw new Error(`unknown Perseus work ${key}`);
  const buf = fs.readFileSync(path.join(PERSEUS_DIR, w.file));
  const raw = buf.toString('utf8');
  const author = decodeEntities(/<author>([^<]*)<\/author>/.exec(raw)?.[1] ?? '').trim();
  const title = decodeEntities(/<title>([^<]*)<\/title>/.exec(raw)?.[1] ?? '').trim();
  const sentences: GoldSentence[] = [];
  const all: GoldUnit[] = [];
  let words = 0;
  for (const sm of raw.matchAll(/<sentence\b([^>]*)>([\s\S]*?)<\/sentence>/g)) {
    const sa = xmlAttrs(sm[1]);
    const units: GoldUnit[] = [];
    let text = '';
    let prevPunct = true;
    for (const wm of sm[2].matchAll(/<word\b([^>]*?)\/?>/g)) {
      const a = xmlAttrs(wm[1]);
      if (a.artificial || !a.form) continue;
      const tag = a.postag ?? '---------';
      const pos = tag[0];
      if (pos === 'u' || /^[^\p{L}\p{N}]+$/u.test(a.form)) { text += a.form; prevPunct = true; continue; }
      const lemma = stripLemmaNo(a.lemma ?? a.form);
      if (pos === '-' || !lemma) { text += (text && !/[([]$/.test(text) ? ' ' : '') + a.form; prevPunct = false; continue; } // an unannotated node: in the text, not in the gold
      if (ENCLITICS.has(a.form.toLowerCase()) && units.length && !prevPunct) {
        const last = units[units.length - 1];
        last.form += encl(a.form); last.key = strictKey(last.form); last.altLemma = last.lemma + lemma.replace(/^-/, ''); text += encl(a.form); continue;
      }
      let upos = PERSEUS_UPOS[pos] ?? ['X'];
      if (pos === 'n' && /^\p{Lu}/u.test(lemma)) upos = ['PROPN'];
      else if (pos === 'n') upos = ['NOUN', 'PROPN'];
      if (pos === 'v' && /^sum$/i.test(lemma)) upos = ['AUX', 'VERB'];
      const u: GoldUnit = { form: a.form, key: strictKey(a.form), lemma, rawPos: pos, upos, feats: perseusFeats(tag) };
      units.push(u);
      text += (text && !/[(\[]$/.test(text) ? ' ' : '') + a.form;
      prevPunct = false;
      words++;
    }
    if (!units.length) continue;
    sentences.push({ id: `${sa.id ?? sentences.length + 1}`, units, text: text.trim() });
    all.push(...units);
  }
  const parsed: PerseusParsed = { label: `${author || 'anon.'}: ${title}`, sentences, units: all, sha256: sha256(buf), bytes: buf.length, words };
  perseusCache.set(key, parsed);
  return parsed;
}

// ──────────────────────────────────────────── equivalence table ────────────────────────────────────────────

/**
 * LEMMA CONVENTIONS treated as equal in the LENIENT score (and counted as errors in the STRICT one). The table is the whole policy:
 * nothing else is forgiven. Each group is a set of lemmas the gold and the adapter may disagree on by convention, not by language.
 */
export const LEMMA_EQUIVALENCE_GROUPS: Array<{ lemmas: string[]; why: string }> = [
  { lemmas: ['ego', 'nos'], why: 'PROIEL lemmatises nos / noster-less plural forms apart from ego; the adapter (and Perseus) give one lemma' },
  { lemmas: ['tu', 'vos'], why: 'same for vos / tu' },
  { lemmas: ['sui', 'se'], why: 'reflexive pronoun: Perseus and PROIEL use sui or se' },
  { lemmas: ['qui', 'quis'], why: 'relative / interrogative / indefinite: PROIEL keeps qui and quis apart, the adapter may give either' },
  { lemmas: ['aliquis', 'aliqui'], why: 'indefinite pronoun and adjective' },
  { lemmas: ['quisquam', 'quicquam'], why: 'indefinite' },
  { lemmas: ['quidam', 'quedam'], why: 'indefinite (inflected stem)' },
  { lemmas: ['ullus', 'ulla'], why: 'gender-form lemma' },
  { lemmas: ['is', 'ea', 'id'], why: 'demonstrative lemma written by gender form' },
  { lemmas: ['ipse', 'ipsa'], why: 'gender-form lemma' },
  { lemmas: ['idem', 'eadem'], why: 'gender-form lemma' },
  { lemmas: ['hic', 'haec'], why: 'gender-form lemma' },
  { lemmas: ['ille', 'illa'], why: 'gender-form lemma' },
  { lemmas: ['iste', 'ista'], why: 'gender-form lemma' },
  { lemmas: ['unus', 'una'], why: 'gender-form lemma' },
  { lemmas: ['alius', 'alia'], why: 'gender-form lemma' },
  { lemmas: ['neque', 'nec', 'que'], why: 'Perseus lemmatises neque and -que as que' },
];
/** Spelling conventions folded in the LENIENT lemma comparison (in addition to the STRICT fold: case, marks, ligatures, j = i, u = v). */
export const SPELLING_RULES: string[] = [
  'ae and oe are written e (caelum = coelum = celum): medieval and Vulgate spellings; ii is written i (eicio = eiicio, Iacob)',
  'deponent lemma written -or by one side and -o by the other (loquor = loquo; sequor = sequo): the lemma of a verb with a passive-looking form; applies to verbs only',
  'a gold lemma of an enclitic host is also accepted as host + que / ve (ne + que = neque, uter + que = uterque)',
  'trailing homograph numbers of the Perseus lemmas (sum1, qui2) are dropped',
  'a Perseus / PROIEL proper-noun lemma is compared without case',
];
/** Equivalent part-of-speech classes of the LENIENT score. STRICT accepts only the gold tag's own acceptable set (see GOLD_UPOS_*). */
export const POS_CLASSES: Array<{ members: string[]; why: string }> = [
  { members: ['NOUN', 'PROPN'], why: 'proper / common noun is a convention (Perseus does not mark it)' },
  { members: ['VERB', 'AUX'], why: 'sum as copula / auxiliary versus full verb' },
  { members: ['CONJ', 'SCONJ'], why: 'Perseus has one conjunction tag; PROIEL splits C- / G-' },
  { members: ['PRON', 'DET'], why: 'hic, ille, meus, qui as pronoun or determiner depends on the head, not the form' },
  { members: ['ADJ', 'NUM'], why: 'unus, duo, primus: numeral or adjective' },
];
/**
 * Word-level POS conventions (LENIENT only): closed-class words whose UPOS differs between treebanks (PROIEL, Perseus and Universal
 * Dependencies Latin disagree with one another on them). For a token whose gold lemma is in `lemmas`, every tag in `classes` is the same tag.
 * Real homograph errors are NOT forgiven: quod conjunction read as a relative pronoun, cum preposition read as a conjunction, hic "here" read as "this".
 */
export const POS_CONVENTIONS: Array<{ name: string; lemmas: string[]; classes: string[]; why: string }> = [
  { name: 'connectives', classes: ['ADV', 'CONJ', 'SCONJ'], why: 'PROIEL tags many connectives and relative / subordinating adverbs Df / Dq (adverb); the adapter tags them CONJ / SCONJ, UD Latin tags some CCONJ',
    lemmas: ['autem', 'enim', 'nam', 'ergo', 'igitur', 'itaque', 'tamen', 'at', 'et', 'etiam', 'quoque', 'sed', 'vero', 'quidem', 'atque', 'ac', 'nec', 'neque', 'aut', 'vel', 'sive', 'seu', 'si', 'nisi', 'sin', 'quamquam', 'quoniam', 'quia', 'quasi', 'velut', 'sicut', 'sicuti', 'ut', 'ne', 'ubi', 'quando', 'dum', 'donec', 'postquam', 'antequam', 'priusquam', 'quam', 'quomodo', 'unde', 'cur', 'quare', 'quamvis', 'licet', 'tum', 'tunc', 'deinde', 'denique', 'ideo', 'proinde', 'porro', 'immo', 'ceterum', 'verumtamen', 'verum', 'sicut'] },
  { name: 'negation and question particles', classes: ['ADV', 'PART'], why: 'non, ne, num, nonne, haud: UD Latin tags them PART, PROIEL Df (adverb)',
    lemmas: ['non', 'ne', 'nonne', 'num', 'nondum', 'haud', 'an', 'utrum', 'numquid', 'utinam', 'ne'] },
  { name: 'interjections', classes: ['ADV', 'INTJ', 'PART'], why: 'amen, ecce, o: interjection or adverb', lemmas: ['amen', 'ecce', 'o', 'heu', 'vae', 'euge', 'alleluia', 'hosanna', 'en', 'eia'] },
  { name: 'pronominal adjectives', classes: ['ADJ', 'DET', 'PRON', 'NUM'], why: 'omnis, suus, meus, alius, ipse, quidam ...: adjective, determiner or pronoun by use, not by form',
    lemmas: ['omnis', 'suus', 'meus', 'tuus', 'noster', 'vester', 'alius', 'alter', 'quantus', 'talis', 'nullus', 'ullus', 'totus', 'solus', 'ipse', 'idem', 'ille', 'iste', 'hic', 'is', 'quidam', 'quisque', 'quivis', 'quilibet', 'aliquis', 'aliqui', 'multus', 'plurimus', 'tantus', 'qualis', 'uterque', 'uter', 'neuter', 'ceterus', 'reliquus', 'tot', 'quot', 'nonnullus', 'quisquam', 'cunctus', 'universus', 'ambo', 'unus', 'qui', 'quis', 'quicumque', 'quicunque', 'quotquot', 'paucus', 'plerusque', 'alteruter'] },
  { name: 'nominal indefinites', classes: ['NOUN', 'PRON'], why: 'nemo, nihil: Perseus tags them noun, the adapter pronoun', lemmas: ['nemo', 'nihil', 'nihilum', 'aliquid', 'quidquam', 'quicquam', 'nullus'] },
];
/** A participle may be tagged adjective by the gold (mortuus, notus, benedictus) and a participle-looking adjective by the adapter: the same word, tagged by use. */
export const PARTICIPLE_ADJECTIVE_RULE = 'gold ADJ versus adapter VERB with VerbForm=Part (and the reverse) is one tag in the lenient score';

const CONVENTION_BY_LEMMA = new Map<string, string[]>();
for (const c of POS_CONVENTIONS) for (const l of c.lemmas) CONVENTION_BY_LEMMA.set(strictKey(l), [...new Set([...(CONVENTION_BY_LEMMA.get(strictKey(l)) ?? []), ...c.classes])]);

const LEMMA_CANON = new Map<string, string>();
for (const g of LEMMA_EQUIVALENCE_GROUPS) {
  const canon = lenientKey(g.lemmas[0]);
  for (const l of g.lemmas) LEMMA_CANON.set(lenientKey(l), canon);
}
const POS_CLASS = new Map<string, string>();
for (const c of POS_CLASSES) for (const m of c.members) POS_CLASS.set(m, c.members[0]);
const posClass = (p: string): string => POS_CLASS.get(p) ?? p;

function lemmaMatch(sys: string | undefined, gold: GoldUnit, sysPos: string | undefined): { strict: boolean; lenient: boolean } {
  if (!sys) return { strict: false, lenient: false };
  const ss = strictKey(sys);
  const golds = [gold.lemma, ...(gold.altLemma ? [gold.altLemma] : [])];
  const strict = golds.some((g) => strictKey(g) === ss);
  if (strict) return { strict: true, lenient: true };
  const sl = lenientKey(sys);
  for (const g of golds) {
    const gl = lenientKey(g);
    if (sl === gl) return { strict: false, lenient: true };
    if ((LEMMA_CANON.get(sl) ?? sl) === (LEMMA_CANON.get(gl) ?? gl) && LEMMA_CANON.has(sl) && LEMMA_CANON.has(gl)) return { strict: false, lenient: true };
    // deponent -o / -or (verbs only)
    if ((sysPos === 'VERB' || sysPos === 'AUX') && (sl + 'r' === gl || gl + 'r' === sl) && /or?$/.test(sl)) return { strict: false, lenient: true };
  }
  return { strict: false, lenient: false };
}

// ──────────────────────────────────────────── scoring ────────────────────────────────────────────

interface SysWord {
  surface: string;
  key: string;
  kind: 'none' | 'guess' | 'rule' | 'lexicon';
  lemma?: string;
  pos?: string;
  morph: Record<string, string>;
  alts: Array<{ lemma?: string; pos?: string }>;
  sent: number;
}

interface FeatTally { den: number; denL: number; strict: number; lenient: number }
export interface GoldReport {
  source: string;
  mode: string;
  goldUnits: number;
  aligned: number;
  alignedPct: number;
  lemmaStrict: number; lemmaLenient: number; lemmaAnyLenient: number;
  posStrict: number; posLenient: number;
  lemmaPosStrict: number; lemmaPosLenient: number;
  featuresSubsetStrict: number; featuresSubsetLenient: number; featuresDenominator: number; featuresDenominatorLenient: number;
  fullStrict: number; fullLenient: number;
  perFeature: Record<string, { n: number; nLenient: number; strict: number; lenient: number }>;
  topPosErrors: Array<{ gold: string; system: string; n: number; sharePct: number }>;
  topPosErrorsStrict: Array<{ gold: string; system: string; n: number; sharePct: number }>;
  topLemmaErrors: Array<{ form: string; system: string; gold: string; n: number; example: string }>;
  /** commonest (gold lemma, gold tag, adapter tag) triples among the lenient POS errors */
  topPosErrorForms: Array<{ lemma: string; gold: string; system: string; n: number; example: string }>;
  /** commonest feature disagreements (lenient) on tokens whose lemma and POS are right */
  topFeatureErrors: Array<{ feature: string; form: string; lemma: string; system: string; gold: string; n: number; example: string }>;
  byKind: Record<string, { n: number; lemmaLenient: number; lemmaPosLenient: number }>;
}
interface GoldAcc {
  goldUnits: number; aligned: number; lemmaS: number; lemmaL: number; lemmaAny: number; posS: number; posL: number; lpS: number; lpL: number;
  fDen: number; fDenL: number; fS: number; fL: number; fullS: number; fullL: number;
  per: Record<string, FeatTally>;
  confL: Map<string, number>; confS: Map<string, number>;
  lemErr: Map<string, { form: string; system: string; gold: string; n: number; example: string }>;
  posErr: Map<string, { lemma: string; gold: string; system: string; n: number; example: string }>;
  featErr: Map<string, { feature: string; form: string; lemma: string; system: string; gold: string; n: number; example: string }>;
  byKind: Record<string, { n: number; lemmaLenient: number; lemmaPosLenient: number }>;
}
const newGoldAcc = (): GoldAcc => ({
  goldUnits: 0, aligned: 0, lemmaS: 0, lemmaL: 0, lemmaAny: 0, posS: 0, posL: 0, lpS: 0, lpL: 0, fDen: 0, fDenL: 0, fS: 0, fL: 0, fullS: 0, fullL: 0,
  per: Object.fromEntries(FEATURE_KEYS.map((k) => [k, { den: 0, denL: 0, strict: 0, lenient: 0 }])), confL: new Map(), confS: new Map(), lemErr: new Map(), posErr: new Map(), featErr: new Map(),
  byKind: { lexicon: { n: 0, lemmaLenient: 0, lemmaPosLenient: 0 }, rule: { n: 0, lemmaLenient: 0, lemmaPosLenient: 0 }, guess: { n: 0, lemmaLenient: 0, lemmaPosLenient: 0 }, none: { n: 0, lemmaLenient: 0, lemmaPosLenient: 0 } },
});

const isDeponentish = (lemma: string | undefined): boolean => !!lemma && /or$/.test(strictKey(lemma));

const PERSONAL_NO_GENDER = new Set(['ego', 'tu', 'nos', 'vos', 'sui', 'se']);
/** Features the gold carries by annotation convention and the adapter rightly does not: not scored in LENIENT (left out of its denominator). */
export const LENIENT_SKIPS: string[] = [
  'Gender of ego, tu, nos, vos, sui / se: first and second person pronouns have no gender; the gold gives masculine by default',
  'Number of sui / se: the reflexive has no number of its own',
  'Person of a non-verb (is, ipse, hic ...) when the adapter gives no Person: the gold marks third person on pronouns, the adapter does not',
];
function featureMatch(key: FeatKey, goldVals: string[], sys: SysWord, goldUnit: GoldUnit): { strict: boolean; lenient: boolean; skipL: boolean } {
  const sv = sys.morph[key];
  // lenient: no Degree on the adapter's side reads as the positive
  const sysVals = sv ? sv.split(',').map((x) => x.trim()).filter(Boolean) : (key === 'Degree' ? ['Pos'] : []);
  const goldSet = new Set(goldVals);
  const inter = sysVals.some((v) => goldSet.has(v));
  let strict = !!sv && sysVals.length > 0 && (sysVals.length === 1 ? goldSet.has(sysVals[0]) : sysVals.length === goldSet.size && sysVals.every((v) => goldSet.has(v)));
  let lenient = inter;
  if (!sv && key === 'Degree') strict = false;
  // lenient: a deponent's voice is a convention (active meaning, passive form)
  if (key === 'Voice' && !lenient && (isDeponentish(sys.lemma) || isDeponentish(goldUnit.lemma))) lenient = sysVals.length > 0;
  const gl = strictKey(goldUnit.lemma);
  const skipL = (key === 'Gender' && PERSONAL_NO_GENDER.has(gl)) || (key === 'Number' && (gl === 'sui' || gl === 'se')) ||
    (key === 'Person' && !sv && !goldUnit.upos.includes('VERB') && !goldUnit.upos.includes('AUX'));
  return { strict, lenient, skipL };
}

function posLenient(sw: SysWord, g: GoldUnit): boolean {
  const p = sw.pos;
  if (!p) return false;
  if (g.upos.some((u) => posClass(u) === posClass(p))) return true;
  const conv = CONVENTION_BY_LEMMA.get(strictKey(g.lemma));
  if (conv && conv.includes(p) && g.upos.some((u) => conv.includes(u))) return true;
  if (p === 'VERB' && sw.morph.VerbForm === 'Part' && g.upos.includes('ADJ')) return true;
  if (p === 'ADJ' && g.feats.VerbForm?.[0] === 'Part' && g.upos.includes('VERB')) return true;
  return false;
}

function scorePair(acc: GoldAcc, sw: SysWord, g: GoldUnit, sentences: Sent[]): void {
  acc.aligned++;
  const lm = lemmaMatch(sw.lemma, g, sw.pos);
  const anyL = lm.lenient || sw.alts.some((a) => lemmaMatch(a.lemma, g, a.pos).lenient);
  if (lm.strict) acc.lemmaS++;
  if (lm.lenient) acc.lemmaL++;
  if (anyL) acc.lemmaAny++;
  const posS = !!sw.pos && g.upos.includes(sw.pos);
  const posL = posLenient(sw, g);
  if (posS) acc.posS++;
  if (posL) acc.posL++;
  const lpS = lm.strict && posS;
  const lpL = lm.lenient && posL;
  if (lpS) acc.lpS++;
  if (lpL) acc.lpL++;
  const bk = acc.byKind[sw.kind];
  bk.n++; if (lm.lenient) bk.lemmaLenient++; if (lpL) bk.lemmaPosLenient++;
  let fStrict = true; let fLen = true; let any = false; let anyFL = false;
  for (const k of FEATURE_KEYS) {
    const gv = g.feats[k];
    if (!gv) continue;
    any = true;
    const r = featureMatch(k, gv, sw, g);
    const t = acc.per[k];
    t.den++; if (r.strict) t.strict++;
    if (!r.strict) fStrict = false;
    if (r.skipL) continue;
    anyFL = true;
    t.denL++; if (r.lenient) t.lenient++;
    if (!r.lenient) {
      fLen = false;
      if (lpL) {
        const sysV = sw.morph[k] ?? '(none)';
        const fk = `${k}	${sw.key}	${sysV}	${gv.join(',')}`;
        const fe = acc.featErr.get(fk);
        if (fe) fe.n++; else acc.featErr.set(fk, { feature: k, form: sw.surface, lemma: sw.lemma ?? '', system: sysV, gold: gv.join(','), n: 1, example: snippet(sentences[sw.sent]?.text ?? '', sw.surface) });
      }
    }
  }
  if (any) { acc.fDen++; if (fStrict) acc.fS++; }
  if (anyFL) { acc.fDenL++; if (fLen) acc.fL++; }
  if (lpS && fStrict) acc.fullS++;
  if (lpL && fLen) acc.fullL++;
  const goldLabel = g.upos.join('|');
  if (!posL) {
    const k = `${goldLabel}\t${sw.pos ?? '(none)'}`;
    acc.confL.set(k, (acc.confL.get(k) ?? 0) + 1);
    const pk = `${strictKey(g.lemma)}\t${k}`;
    const pe = acc.posErr.get(pk);
    if (pe) pe.n++; else acc.posErr.set(pk, { lemma: g.lemma, gold: goldLabel, system: sw.pos ?? '(none)', n: 1, example: snippet(sentences[sw.sent]?.text ?? '', sw.surface) });
  }
  if (!posS) { const k = `${goldLabel}\t${sw.pos ?? '(none)'}`; acc.confS.set(k, (acc.confS.get(k) ?? 0) + 1); }
  if (!lm.lenient) {
    const k = `${sw.key}\t${sw.lemma ?? '(none)'}\t${g.lemma}`;
    const e = acc.lemErr.get(k);
    if (e) e.n++; else acc.lemErr.set(k, { form: sw.surface, system: sw.lemma ?? '(none)', gold: g.lemma, n: 1, example: snippet(sentences[sw.sent]?.text ?? '', sw.surface) });
  }
}

function snippet(sentence: string, surface: string): string {
  const i = sentence.indexOf(surface);
  if (sentence.length <= 90) return sentence;
  const from = Math.max(0, (i < 0 ? 0 : i) - 55);
  return (from > 0 ? '…' : '') + sentence.slice(from, from + 90) + (from + 90 < sentence.length ? '…' : '');
}

/** Longest common subsequence of two key arrays (returns index pairs). Quadratic; used on a verse or on one work. */
export function alignPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length; const m = b.length;
  if (!n || !m) return [];
  let lo = 0;
  while (lo < n && lo < m && a[lo] === b[lo]) lo++;
  let hiA = n; let hiB = m;
  while (hiA > lo && hiB > lo && a[hiA - 1] === b[hiB - 1]) { hiA--; hiB--; }
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < lo; i++) pairs.push([i, i]);
  const N = hiA - lo; const M = hiB - lo;
  if (N > 0 && M > 0) {
    const w = M + 1;
    const dir = new Uint8Array((N + 1) * w); // 1 diag, 2 up, 3 left
    let prev = new Uint32Array(w); let cur = new Uint32Array(w);
    for (let i = 1; i <= N; i++) {
      cur[0] = 0;
      for (let j = 1; j <= M; j++) {
        if (a[lo + i - 1] === b[lo + j - 1]) { cur[j] = prev[j - 1] + 1; dir[i * w + j] = 1; }
        else if (prev[j] >= cur[j - 1]) { cur[j] = prev[j]; dir[i * w + j] = 2; }
        else { cur[j] = cur[j - 1]; dir[i * w + j] = 3; }
      }
      [prev, cur] = [cur, prev];
    }
    const mid: Array<[number, number]> = [];
    let i = N; let j = M;
    while (i > 0 && j > 0) {
      const d = dir[i * w + j];
      if (d === 1) { mid.push([lo + i - 1, lo + j - 1]); i--; j--; } else if (d === 2) i--; else j--;
    }
    mid.reverse();
    pairs.push(...mid);
  }
  for (let k = 0; k < n - hiA; k++) pairs.push([hiA + k, hiB + k]);
  return pairs;
}

/** Keep only aligned pairs that sit in a diagonal run of at least `minRun` consecutive matches (guards against chance matches of et / in / non between unrelated passages). */
function runFilter(pairs: Array<[number, number]>, minRun: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  for (let k = 1; k <= pairs.length; k++) {
    const contiguous = k < pairs.length && pairs[k][0] === pairs[k - 1][0] + 1 && pairs[k][1] === pairs[k - 1][1] + 1;
    if (!contiguous) {
      if (k - start >= minRun) for (let q = start; q < k; q++) out.push(pairs[q]);
      start = k;
    }
  }
  return out;
}

function topN<T extends { n: number }>(items: T[], limit: number): T[] {
  return items.sort((x, y) => y.n - x.n || JSON.stringify(x).localeCompare(JSON.stringify(y))).slice(0, limit);
}

function finishGold(acc: GoldAcc, source: string, mode: string): GoldReport {
  const a = acc.aligned;
  const conf = (m: Map<string, number>) => {
    const total = [...m.values()].reduce((x, y) => x + y, 0);
    return topN([...m.entries()].map(([k, n]) => { const [gold, system] = k.split('\t'); return { gold, system, n, sharePct: pct(n, total) }; }), 10);
  };
  return {
    source, mode, goldUnits: acc.goldUnits, aligned: a, alignedPct: pct(a, acc.goldUnits),
    lemmaStrict: pct(acc.lemmaS, a), lemmaLenient: pct(acc.lemmaL, a), lemmaAnyLenient: pct(acc.lemmaAny, a),
    posStrict: pct(acc.posS, a), posLenient: pct(acc.posL, a), lemmaPosStrict: pct(acc.lpS, a), lemmaPosLenient: pct(acc.lpL, a),
    featuresSubsetStrict: pct(acc.fS, acc.fDen), featuresSubsetLenient: pct(acc.fL, acc.fDenL), featuresDenominator: acc.fDen, featuresDenominatorLenient: acc.fDenL,
    fullStrict: pct(acc.fullS, a), fullLenient: pct(acc.fullL, a),
    perFeature: Object.fromEntries(FEATURE_KEYS.map((k) => [k, { n: acc.per[k].den, nLenient: acc.per[k].denL, strict: pct(acc.per[k].strict, acc.per[k].den), lenient: pct(acc.per[k].lenient, acc.per[k].denL) }])),
    topPosErrors: conf(acc.confL), topPosErrorsStrict: conf(acc.confS),
    topLemmaErrors: topN([...acc.lemErr.values()], 300),
    topPosErrorForms: topN([...acc.posErr.values()], 300),
    topFeatureErrors: topN([...acc.featErr.values()], 300),
    byKind: acc.byKind,
  };
}

// ──────────────────────────────────────────── the run ────────────────────────────────────────────

export interface MissEntry { form: string; kind: 'none' | 'guess'; n: number; example: string }
export interface CorpusReport {
  name: string;
  label: string;
  source: string;
  licence: string;
  sentences: number;
  tokens: number;
  excludedLabels: number;
  analyzeMs: number;
  wordsPerSecond: number;
  anyReadingPct: number;
  lexiconConfirmedPct: number;
  ruleBuiltPct: number;
  unconfirmedGuessPct: number;
  noReadingPct: number;
  multiReadingPct: number;
  counts: { anyReading: number; lexiconConfirmed: number; ruleBuilt: number; unconfirmedGuess: number; noReading: number; multiReading: number; lowConfidenceConfirmed: number };
  distinctForms: number;
  /** tokens read by guess or not at all, by a rough shape: a capitalised word inside a sentence (a name), a word ending -que / -ve / -ne, a word of three letters or fewer (abbreviation, label), the rest */
  missBreakdown: { names: number; enclitic: number; short: number; other: number };
  /** share of the guess + no-reading tokens that the (up to 300) listed forms account for */
  listedFormsSharePct: number;
  gold: GoldReport | null;
  goldNote?: string;
  misses?: MissEntry[];
}
export interface EvalReport {
  tool: string;
  runAt: string;
  adapter: { id: string; version: string; fingerprint: string; files: number };
  options: { corpora: string[]; gold: boolean; limit: number | null; rawPrincipia: boolean };
  initMs: number;
  corpora: Record<string, CorpusReport>;
  provenance: Record<string, { file: string; sha256: string; bytes: number }>;
}
export interface EvalOptions { corpora?: string[]; gold?: boolean; limit?: number; rawPrincipia?: boolean; misses?: boolean }

const CORPUS_META: Record<string, { label: string; source: string; licence: string }> = {
  vulgate: { label: 'Clementine Vulgate, whole Bible (73 books)', source: 'vetus-v0/data/vulgate/lat-clementine.usfx.xml (seven1m/open-bibles USFX)', licence: 'public domain (Clementine Vulgate, 1592)' },
  nt: { label: 'Clementine Vulgate, New Testament (27 books)', source: 'vetus-v0/data/vulgate/lat-clementine.usfx.xml', licence: 'public domain; gold PROIEL CC BY-NC-SA 4.0' },
  cicero: { label: 'Cicero: In Catilinam 1-4, Pro Archia, De amicitia, Somnium Scipionis', source: 'romance-v0/data/la/cicero-*.text.json (Latin Wikisource)', licence: 'public domain text (Wikisource page layout CC BY-SA)' },
  vergil: { label: 'Vergil, Aeneid 1, 2, 4, 6 (macronised)', source: 'romance-v0/data/la/vergil-aeneid-{1,2,4,6}.text.json (Latin Wikisource)', licence: 'public domain text (Wikisource edition CC BY-SA)' },
  ovid: { label: 'Ovid, Metamorphoses 1 (macronised)', source: 'romance-v0/data/la/ovid-met-1.text.json (Latin Wikisource)', licence: 'public domain text (Wikisource edition CC BY-SA)' },
  principia: { label: "Newton, Philosophiae Naturalis Principia Mathematica (1687)", source: 'Project Gutenberg eBook #28233, https://www.gutenberg.org/cache/epub/28233/pg28233.txt', licence: 'public domain; Project Gutenberg licence header kept with the file' },
};
function corpusMeta(name: string): { label: string; source: string; licence: string } {
  const m = CORPUS_META[name];
  if (m) return m;
  const key = name.replace(/^perseus-/, '');
  const w = PERSEUS_WORKS.find((x) => x.key === key);
  if (!w) throw new Error(`unknown corpus ${name}`);
  const label = fs.existsSync(path.join(PERSEUS_DIR, w.file)) ? loadPerseus(key).label : key;
  return { label: `Perseus treebank: ${label}`, source: `PerseusDL/treebank_data v2.1/Latin/texts/${w.file} @ ${PERSEUS_COMMIT.slice(0, 7)} (scored on the treebank's own text)`, licence: 'CC BY-SA 3.0 US (Perseus Digital Library, Tufts University)' };
}

/** Expand "all", "perseus", "main" and comma lists to corpus names (gold off drops the perseus-* corpora from "all": they have no use without gold). */
export function resolveCorpora(spec: string[], gold: boolean): string[] {
  const out: string[] = [];
  for (const s of spec) {
    if (s === 'all') out.push(...MAIN_CORPORA, ...(gold ? PERSEUS_CORPORA : []));
    else if (s === 'main') out.push(...MAIN_CORPORA);
    else if (s === 'perseus') out.push(...PERSEUS_CORPORA);
    else if (ALL_CORPORA.includes(s)) out.push(s);
    else throw new Error(`unknown corpus "${s}" (vulgate|nt|cicero|vergil|ovid|principia|perseus|perseus-<author>|main|all)`);
  }
  return [...new Set(out)];
}

const ROMAN = /^(?=[IVXLCDM])M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const isLabel = (s: string): boolean => /^[A-Z]{1,6}$/.test(s) && !ROMAN.test(s);

/** SHA-256 (first 16 hex) over the names and contents of src/adapters/la.ts and src/adapters/latin/**: ties a set of numbers to the exact adapter source it was measured on. */
export function adapterFingerprint(): { fingerprint: string; files: number } {
  const files: string[] = [path.join(REPO, 'src/adapters/la.ts')];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else files.push(p);
    }
  };
  walk(path.join(REPO, 'src/adapters/latin'));
  const h = crypto.createHash('sha256');
  for (const p of files) if (fs.existsSync(p)) { h.update(path.relative(REPO, p).split(path.sep).join('/')); h.update(fs.readFileSync(p)); }
  return { fingerprint: h.digest('hex').slice(0, 16), files: files.length };
}

export function runEval(opts: EvalOptions = {}): EvalReport {
  const gold = !!opts.gold;
  const names = resolveCorpora(opts.corpora ?? ['all'], gold);
  const limit = opts.limit && opts.limit > 0 ? opts.limit : undefined;
  const t0 = performance.now();
  laAdapter.analyze(laAdapter.tokenize('In principio creavit Deus caelum et terram.')); // builds the form index on first use
  const initMs = Math.round(performance.now() - t0);
  const report: EvalReport = {
    tool: 'scripts/latin-eval.mts', runAt: new Date().toISOString(), adapter: { id: `adapter-${laAdapter.lang}@${laAdapter.version}`, version: laAdapter.version, ...adapterFingerprint() },
    options: { corpora: names, gold, limit: limit ?? null, rawPrincipia: !!opts.rawPrincipia }, initMs, corpora: {}, provenance: {},
  };
  const prov = (key: string, file: string): void => {
    if (report.provenance[key] || !fs.existsSync(file)) return;
    const buf = fs.readFileSync(file);
    report.provenance[key] = { file: file.replace(/\\/g, '/'), sha256: sha256(buf), bytes: buf.length };
  };

  for (const name of names) {
    let sentences: Sent[];
    let goldSentences: GoldSentence[] | undefined;
    let goldMode: 'proiel' | 'perseus-own' | 'perseus-aligned' | null = null;
    let goldKey = '';
    if (name === 'vulgate' || name === 'nt') {
      if (!fs.existsSync(USFX_FILE)) continue;
      prov('clementine-usfx', USFX_FILE);
      sentences = vulgateSentences(name === 'nt');
      if (name === 'nt' && gold && fs.existsSync(PROIEL_FILE)) { goldMode = 'proiel'; prov('proiel-latin-nt', PROIEL_FILE); }
    } else if (name === 'principia') {
      if (!fs.existsSync(PRINCIPIA_FILE)) continue;
      prov('principia-pg28233', PRINCIPIA_FILE);
      sentences = principiaSentences(!!opts.rawPrincipia);
    } else if (name.startsWith('perseus-')) {
      goldKey = name.slice(8);
      const w = PERSEUS_WORKS.find((x) => x.key === goldKey);
      if (!w || !gold || !fs.existsSync(path.join(PERSEUS_DIR, w.file))) continue;
      const p = loadPerseus(goldKey);
      prov(`perseus-${goldKey}`, path.join(PERSEUS_DIR, w.file));
      goldSentences = p.sentences;
      sentences = p.sentences.map((s) => ({ id: s.id, text: s.text }));
      goldMode = 'perseus-own';
    } else {
      if (!sourceStatus()[name]) continue;
      for (const f of CORPUS_FILES[name]) prov(`romance-${f}`, path.join(ROMANCE_LA, `${f}.text.json`));
      sentences = romanceSentences(name);
      goldKey = ALIGNED_GOLD[name] ?? '';
      if (gold && goldKey && fs.existsSync(path.join(PERSEUS_DIR, PERSEUS_WORKS.find((x) => x.key === goldKey)!.file))) {
        goldMode = 'perseus-aligned';
        prov(`perseus-${goldKey}`, path.join(PERSEUS_DIR, PERSEUS_WORKS.find((x) => x.key === goldKey)!.file));
      }
    }
    if (limit) { sentences = sentences.slice(0, limit); goldSentences = goldSentences?.slice(0, limit); }

    const meta = corpusMeta(name);
    const acc = newGoldAcc();
    const proiel = goldMode === 'proiel' ? loadProiel() : undefined;
    const aligned: SysWord[] = []; // for corpus-level alignment
    const forms = new Map<string, { kind: 'none' | 'guess'; n: number; surface: string; sent: number }>();
    let tokens = 0; let anyReading = 0; let lexicon = 0; let rule = 0; let guess = 0; let none = 0; let multi = 0; let lowConf = 0; let excluded = 0;
    let analyzeMs = 0;
    const seenForms = new Set<string>();
    const brk = { names: 0, enclitic: 0, short: 0, other: 0 };

    for (let si = 0; si < sentences.length; si++) {
      const raw: RawToken[] = laAdapter.tokenize(sentences[si].text);
      const ta = performance.now();
      const an = laAdapter.analyze(raw);
      analyzeMs += performance.now() - ta;
      const sysWords: SysWord[] = [];
      let wordIdx = -1;
      for (const a of an) {
        if (!a.token.isWord) continue;
        wordIdx++;
        if (name === 'principia' && isLabel(a.token.surface)) { excluded++; continue; }
        tokens++;
        const c = a.candidates[0];
        let kind: SysWord['kind'];
        if (!c || !c.lemma) kind = 'none';
        else if (c.unconfirmed) kind = 'guess';
        else if (c.notes?.source === 'rule' || c.origin === 'rule') kind = 'rule';
        else kind = 'lexicon';
        if (kind !== 'none') anyReading++;
        if (kind === 'lexicon') { lexicon++; if (c.confidence < 0.6) lowConf++; } else if (kind === 'rule') rule++; else if (kind === 'guess') guess++; else none++;
        if (a.candidates.length > 1) multi++;
        const fk = strictKey(a.token.surface);
        seenForms.add(fk);
        if (kind === 'none' || kind === 'guess') {
          const sf = a.token.surface;
          if (wordIdx > 0 && /^\p{Lu}/u.test(sf)) brk.names++; else if (fk.length > 4 && /(que|ve|ne)$/.test(fk)) brk.enclitic++; else if (fk.length <= 3) brk.short++; else brk.other++;
          const k = `${kind}\t${fk || a.token.surface.toLowerCase()}`;
          const e = forms.get(k);
          if (e) e.n++; else forms.set(k, { kind, n: 1, surface: a.token.surface, sent: si });
        }
        if (goldMode) {
          const morph: Record<string, string> = {};
          if (c) for (const [k, v] of Object.entries(c.morph)) morph[k] = String(v);
          sysWords.push({ surface: a.token.surface, key: fk, kind, lemma: c?.lemma, pos: c?.pos, morph, alts: a.candidates.slice(1, 6).map((x) => ({ lemma: x.lemma, pos: x.pos })), sent: si });
        }
      }
      if (goldMode === 'proiel') {
        const units = proiel!.get(sentences[si].id);
        if (units) {
          acc.goldUnits += units.length;
          for (const [i, j] of alignPairs(sysWords.map((w) => w.key), units.map((u) => u.key))) scorePair(acc, sysWords[i], units[j], sentences);
        }
      } else if (goldMode === 'perseus-own') {
        const units = goldSentences![si].units;
        acc.goldUnits += units.length;
        for (const [i, j] of alignPairs(sysWords.map((w) => w.key), units.map((u) => u.key))) scorePair(acc, sysWords[i], units[j], sentences);
      } else if (goldMode === 'perseus-aligned') aligned.push(...sysWords);
    }

    if (goldMode === 'perseus-aligned') {
      const units = loadPerseus(goldKey).units;
      acc.goldUnits = units.length;
      const pairs = runFilter(alignPairs(aligned.map((w) => w.key), units.map((u) => u.key)), 5);
      for (const [i, j] of pairs) scorePair(acc, aligned[i], units[j], sentences);
    }

    const missList: MissEntry[] = topN([...forms.values()].map((e) => ({ form: e.surface, kind: e.kind as 'none' | 'guess', n: e.n, example: snippet(sentences[e.sent].text, e.surface) })), name.startsWith('perseus-') ? 100 : 300);
    const goldReport = goldMode ? finishGold(acc, goldMode === 'proiel' ? 'PROIEL Latin NT (Vetus V0 copy), CC BY-NC-SA 4.0' : `Perseus AGLDT ${loadPerseus(goldKey).label}`, goldMode) : null;
    report.corpora[name] = {
      name, label: meta.label, source: meta.source, licence: meta.licence, sentences: sentences.length, tokens, excludedLabels: excluded,
      analyzeMs: Math.round(analyzeMs), wordsPerSecond: analyzeMs > 0 ? Math.round((tokens / analyzeMs) * 1000) : 0,
      anyReadingPct: pct(anyReading, tokens), lexiconConfirmedPct: pct(lexicon, tokens), ruleBuiltPct: pct(rule, tokens), unconfirmedGuessPct: pct(guess, tokens),
      noReadingPct: pct(none, tokens), multiReadingPct: pct(multi, tokens),
      counts: { anyReading, lexiconConfirmed: lexicon, ruleBuilt: rule, unconfirmedGuess: guess, noReading: none, multiReading: multi, lowConfidenceConfirmed: lowConf },
      distinctForms: seenForms.size, missBreakdown: brk,
      listedFormsSharePct: pct(missList.reduce((x, e) => x + e.n, 0), guess + none),
      gold: goldReport,
      ...(name === 'vulgate' && gold ? { goldNote: 'gold for the New Testament portion: see the nt row' } : {}),
      ...(opts.misses ? { misses: missList } : {}),
    };
  }
  return report;
}

// ──────────────────────────────────────────── markdown ────────────────────────────────────────────

const f1 = (x: number): string => x.toFixed(1);
const num = (x: number): string => x.toLocaleString('en-US');
export const MD_BEGIN = '<!-- BEGIN GENERATED (scripts/latin-eval.mts --md): do not edit between the markers -->';
export const MD_END = '<!-- END GENERATED -->';

/** The generated half of docs/latin/EVAL.md: every number, the equivalence table, the provenance. */
export function renderMarkdown(r: EvalReport): string {
  const L: string[] = [];
  const cs = Object.values(r.corpora);
  L.push(MD_BEGIN, '');
  L.push(`Run: ${r.runAt} - adapter \`${r.adapter.id}\` (source fingerprint ${r.adapter.fingerprint}, ${r.adapter.files} files) - corpora ${r.options.corpora.join(', ')} - gold ${r.options.gold ? 'on' : 'off'} - limit ${r.options.limit ?? 'none'} - index build ${r.initMs} ms (excluded from words/s).`, '');
  L.push('### Coverage (no gold needed; first reading of each word token)', '');
  L.push('| corpus | sentences | word tokens | distinct forms | any reading | lexicon-confirmed | rule-built | unconfirmed guess | no reading | >1 reading | words/s |');
  L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of cs) L.push(`| ${c.name} | ${num(c.sentences)} | ${num(c.tokens)} | ${num(c.distinctForms)} | ${f1(c.anyReadingPct)} % | ${f1(c.lexiconConfirmedPct)} % | ${f1(c.ruleBuiltPct)} % | ${f1(c.unconfirmedGuessPct)} % | ${f1(c.noReadingPct)} % | ${f1(c.multiReadingPct)} % | ${num(c.wordsPerSecond)} |`);
  L.push('', '"Any reading" = the adapter returned a lemma (lexicon + rule + guess). "Lexicon-confirmed" = the first candidate is not `unconfirmed` and `notes.source` is not `rule`. "Unconfirmed guess" = ending-based guess (`unconfirmed: true`, confidence at most 0.4). Words under confidence 0.6 that are still lexicon-sourced: ' + cs.map((c) => `${c.name} ${num(c.counts.lowConfidenceConfirmed)}`).join(', ') + '.', '');
  L.push('### What the unconfirmed and missing words look like', '');
  L.push('| corpus | guess + no reading (tokens) | capitalised inside a sentence (names) | ends -que / -ve / -ne | 3 letters or fewer | other | the listed forms (top 300; 100 for treebank-own-text corpora) cover |');
  L.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const c of cs) { const b = c.missBreakdown; const t = b.names + b.enclitic + b.short + b.other; L.push(`| ${c.name} | ${num(t)} | ${num(b.names)} (${f1(pct(b.names, t))} %) | ${num(b.enclitic)} (${f1(pct(b.enclitic, t))} %) | ${num(b.short)} (${f1(pct(b.short, t))} %) | ${num(b.other)} (${f1(pct(b.other, t))} %) | ${f1(c.listedFormsSharePct)} % |`); }
  L.push('');
  const gs = cs.filter((c) => c.gold);
  if (gs.length) {
    L.push('### Gold accuracy (first reading versus the gold annotation; aligned tokens only)', '');
    L.push('Strict = gold tag / lemma exactly as annotated (spelling folded: case, marks, ligatures, j = i, u = v). Lenient = the equivalence table below applied. "features subset" = every gold-specified feature of the nine matched, over aligned tokens that carry any gold feature.', '');
    L.push('| corpus (gold) | gold words | aligned | lemma strict | lemma lenient | lemma any-reading (lenient) | POS strict | POS lenient | lemma+POS strict | lemma+POS lenient | features subset strict | features subset lenient | lemma+POS+features lenient |');
    L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const c of gs) { const g = c.gold!; L.push(`| ${c.name} (${g.mode}) | ${num(g.goldUnits)} | ${num(g.aligned)} (${f1(g.alignedPct)} %) | ${f1(g.lemmaStrict)} % | ${f1(g.lemmaLenient)} % | ${f1(g.lemmaAnyLenient)} % | ${f1(g.posStrict)} % | ${f1(g.posLenient)} % | ${f1(g.lemmaPosStrict)} % | ${f1(g.lemmaPosLenient)} % | ${f1(g.featuresSubsetStrict)} % | ${f1(g.featuresSubsetLenient)} % | ${f1(g.fullLenient)} % |`); }
    L.push('', '### Accuracy by how the word was read (lemma+POS lenient; n = aligned tokens)', '');
    L.push('| corpus | lexicon n | lexicon acc | rule n | rule acc | guess n | guess acc | none n |');
    L.push('|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const c of gs) { const b = c.gold!.byKind; L.push(`| ${c.name} | ${num(b.lexicon.n)} | ${f1(pct(b.lexicon.lemmaPosLenient, b.lexicon.n))} % | ${num(b.rule.n)} | ${f1(pct(b.rule.lemmaPosLenient, b.rule.n))} % | ${num(b.guess.n)} | ${f1(pct(b.guess.lemmaPosLenient, b.guess.n))} % | ${num(b.none.n)} |`); }
    L.push('', '### Per-feature accuracy (strict / lenient; n = aligned tokens whose gold specifies the feature, strict n / lenient n after the skips)', '');
    L.push('| corpus | ' + FEATURE_KEYS.join(' | ') + ' |');
    L.push('|---|' + FEATURE_KEYS.map(() => '---:').join('|') + '|');
    for (const c of gs) L.push(`| ${c.name} | ` + FEATURE_KEYS.map((k) => { const p = c.gold!.perFeature[k]; return p.n ? `${f1(p.strict)} / ${f1(p.lenient)} (n ${num(p.n)} / ${num(p.nLenient)})` : '-'; }).join(' | ') + ' |');
    L.push('', '### The ten commonest part-of-speech errors (lenient classes; gold -> adapter)', '');
    for (const c of gs) {
      const g = c.gold!;
      L.push(`**${c.name}**: ` + (g.topPosErrors.length ? g.topPosErrors.map((e) => `${e.gold} -> ${e.system} ${num(e.n)} (${f1(e.sharePct)} %)`).join('; ') : 'none') + '', '');
    }
  }
  L.push('### Corpora, sources and licences', '');
  L.push('| corpus | what | source | licence |', '|---|---|---|---|');
  for (const c of cs) L.push(`| ${c.name} | ${c.label}${c.excludedLabels ? ` (${num(c.excludedLabels)} diagram labels excluded)` : ''} | ${c.source} | ${c.licence} |`);
  L.push('', '### Source files used in this run (SHA-256)', '', '| key | file | bytes | SHA-256 |', '|---|---|---:|---|');
  for (const [k, p] of Object.entries(r.provenance)) L.push(`| ${k} | \`${p.file}\` | ${num(p.bytes)} | \`${p.sha256}\` |`);
  L.push('', '### Equivalence table (lenient score only)', '', '**Lemma groups** (each group counts as one lemma):', '', '| group | why |', '|---|---|');
  for (const g of LEMMA_EQUIVALENCE_GROUPS) L.push(`| ${g.lemmas.join(' = ')} | ${g.why} |`);
  L.push('', '**Spelling and form rules:**', '', ...SPELLING_RULES.map((s) => `- ${s}`));
  L.push('', '**Part-of-speech classes** (merged in the lenient score):', '', '| class | why |', '|---|---|');
  for (const c of POS_CLASSES) L.push(`| ${c.members.join(' = ')} | ${c.why} |`);
  L.push('', '**Word-level POS conventions** (lenient: for a token whose gold lemma is listed, all tags of the class are one tag; homograph errors are not forgiven):', '', '| convention | tags treated as one | lemmas | why |', '|---|---|---|---|');
  for (const c of POS_CONVENTIONS) L.push(`| ${c.name} | ${c.classes.join(' = ')} | ${[...new Set(c.lemmas)].join(', ')} | ${c.why} |`);
  L.push('', `Participle / adjective: ${PARTICIPLE_ADJECTIVE_RULE}.`, '', '**Features not scored in lenient** (left out of the lenient denominator, still in the strict one):', '', ...LENIENT_SKIPS.map((x) => `- ${x}`));
  L.push('', '**Gold tag -> acceptable UPOS in the strict score.** PROIEL: ' + Object.entries(PROIEL_UPOS).map(([k, v]) => `${k} ${v.join('/')}`).join(', ') + '; V- with lemma sum AUX/VERB. Perseus: ' + Object.entries(PERSEUS_UPOS).map(([k, v]) => `${k} ${v.join('/')}`).join(', ') + '; n with a capitalised lemma PROPN; v with lemma sum AUX/VERB.', '');
  L.push('**Feature rules.** Gold features are the nine UD-style keys; PROIEL / Perseus letters are mapped as in the code (`proielFeats`, `perseusFeats`). Underspecified gold values (PROIEL gender p = Masc/Fem, case c = Gen/Dat, mood e = Ind/Sub ...) are sets: strict needs the adapter\'s value to be one member (or the adapter\'s union to equal the set); lenient needs overlap. The adapter\'s unions ("Acc,Nom,Voc") count as a miss in strict and as a hit in lenient when they contain the gold value. A missing Degree on the adapter\'s side reads as positive in lenient. A deponent\'s voice (lemma in -or on either side) is not compared in lenient beyond "the adapter gave a voice".', '');
  L.push('**Alignment.** Adapter word tokens are aligned to the gold words by a longest-common-subsequence over folded word forms (verse by verse for PROIEL; sentence by sentence for the Perseus text; over the whole work, keeping only runs of five or more consecutive matches, for the on-disk Cicero / Vergil / Ovid). Unaligned words are excluded from accuracy and counted in the "aligned" column.', '');
  L.push(MD_END);
  return L.join('\n');
}

/** Replace the generated block of an existing EVAL.md (or append it to a header) and write it. */
export function writeMarkdown(file: string, r: EvalReport): void {
  const generated = renderMarkdown(r);
  let doc = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const a = doc.indexOf(MD_BEGIN); const b = doc.indexOf(MD_END);
  if (a >= 0 && b > a) doc = doc.slice(0, a) + generated + doc.slice(b + MD_END.length);
  else doc = doc + (doc ? '\n\n' : '') + generated + '\n';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, doc);
}
