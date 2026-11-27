/// <reference types="node" />
/**
 * npm run ar:build-index -- [--in <kaikki-arabic.jsonl>] [--freq <ar_50k.txt>] [--out public/lexicon/ar/standard]
 *                           [--core-out src/adapters/arabic/generated/core.ts] [--doc-out docs/arabic/INDEX.md]
 *                           [--limit 1500000] [--core-budget 500000] [--date YYYY-MM-DD] [--definite strip|keep|drop]
 *                           [--identities file.json] [--ambiguous-out file.tsv] [--probe word[,word…]] [--no-write]
 *
 * Builds the Arabic form index from the Wiktionary extract of kaikki.org (CC BY-SA 4.0): every conjugation and declension row, every
 * head-line form without a page of its own and every form-of page of the extract becomes a reading of its written form (docs/arabic/PLAN.md,
 * "The index build", and the lead's amendments of 2026-11-25). The lemma, the tags (kept verbatim, sorted, joined with "|"), the vowels and
 * the root are the source's; nothing is analysed here, and every row, entry or form left out is counted. Writes
 *   - the SHARDS (gzip, by prefix of the letters of the key, loose fold) and manifest.json under --out (git-ignored),
 *   - the compiled CORE src/adapters/arabic/generated/core.ts (closed classes + the commonest lemmas, with every form),
 *   - docs/arabic/INDEX.md (the figures).
 * ar_50k.txt (subtitle text, CC BY-SA 4.0) is used for ORDER only (count, core selection, coverage): a spelling in it is never evidence
 * that a form exists. Deterministic: same inputs and --date, same bytes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import * as TEXT from '../src/adapters/arabic/text';
import { ARABIC_LETTER, DAMMA, DAMMATAN, DAGGER_ALIF, FATHA, KASRA, SHADDA, arCanon, arKey, arLoose, arShardLetters, hasTashkil, packVocal, splitVocal, type LetterMarks } from '../src/adapters/arabic/text';
import type { ArFormRow, ArLemmaRow, ArabicFormIndex } from '../src/adapters/arabic/index-store';

const started = Date.now();
const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
const flags = new Set<string>();
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) { console.error(`bad argument ${args[i]}`); process.exit(1); }
  if (args[i] === '--no-write' || args[i] === '--no-preferences-reviewed' || args[i] === '--no-gloss-choices') { flags.add(args[i].slice(2)); continue; }
  if (args[i + 1] === undefined) { console.error(`${args[i]} needs a value`); process.exit(1); }
  opt[args[i].slice(2)] = args[i + 1]; i++;
}
const INPUT = opt.in ?? 'C:/Users/CJWal/dev/lisan-v0/data/dict/kaikki-arabic.jsonl';
const FREQ = opt.freq ?? 'C:/Users/CJWal/dev/lisan-v0/data/dict/ar_50k.txt';
const OUT = opt.out ?? 'public/lexicon/ar/standard';
const CORE_OUT = opt['core-out'] ?? 'src/adapters/arabic/generated/core.ts';
const DOC_OUT = opt['doc-out'] ?? 'docs/arabic/INDEX.md';
const LIMIT = Number(opt.limit ?? 1_500_000);
const CORE_BUDGET = Number(opt['core-budget'] ?? 500_000);
const TODAY = opt.date ?? new Date().toISOString().slice(0, 10);
const WRITE = !flags.has('no-write');
const DEFINITE = (opt.definite ?? 'strip') as 'strip' | 'keep' | 'drop';
const PROBES = (opt.probe ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const IDENTITIES = opt.identities;
const AMBIGUOUS_OUT = opt['ambiguous-out'];
const MAX_PREFIX = 3;
for (const f of [INPUT, FREQ]) if (!fs.existsSync(f)) { console.error(`cannot read ${f}`); process.exit(1); }
const GLOSS_CHOICES_PATH = opt['gloss-choices'] ?? 'src/adapters/arabic/gloss-choices.json';
if (!['strip', 'keep', 'drop'].includes(DEFINITE)) { console.error('--definite must be strip, keep or drop'); process.exit(1); }

// ───────────────────────────── source ─────────────────────────────

const inStat = fs.statSync(INPUT);
const sha256 = await new Promise<string>((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(INPUT).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});
const SOURCE: ArabicFormIndex['source'] = {
  label: 'Wiktionary Arabic entries, via kaikki.org',
  licence: 'CC BY-SA 4.0',
  url: 'https://kaikki.org/dictionary/Arabic/',
  lastModified: inStat.mtime.toISOString().slice(0, 10),
  retrieved: TODAY,
  sha256,
  note: `Every row is a conjugation or declension row, a head-line form or a "form of" page of Wiktionary; the labels, vowels and roots are the source's, kept as written. Input ${path.basename(INPUT)}: ${inStat.size} bytes, modified ${inStat.mtime.toISOString()}. Word frequencies (order only) from hermitdave FrequencyWords ar_50k (CC BY-SA 4.0). Nothing was analysed here.`,
};

// ───────────────────────────── helpers ─────────────────────────────

const POS: Record<string, string> = { noun: 'NOUN', name: 'PROPN', verb: 'VERB', adj: 'ADJ', adv: 'ADV', pron: 'PRON', det: 'DET', article: 'DET', prep: 'ADP', conj: 'CONJ', particle: 'PART', num: 'NUM', intj: 'INTJ' };
const CLOSED = new Set(['PRON', 'DET', 'ADP', 'CONJ', 'SCONJ', 'PART', 'NUM']);
const NOMINAL = new Set(['NOUN', 'ADJ', 'PROPN', 'NUM']);
const META_TAGS = new Set(['table-tags', 'inflection-template', 'romanization', 'canonical']);
const TABLE_SOURCES = new Set(['declension', 'conjugation', 'inflection']);
const CASE_TAGS = new Set(['nominative', 'accusative', 'genitive']);
/** Labels a form-of sense carries that describe the FORM (kept on a page row); the rest of a sense's tags describe the page's use or head line. */
const SENSE_FORM_TAGS = new Set(['plural', 'singular', 'dual', 'feminine', 'masculine', 'noun-from-verb', 'participle', 'active', 'passive', 'collective', 'singulative', 'construct', 'definite', 'indefinite', 'nominative', 'accusative', 'genitive', 'oblique', 'past', 'non-past', 'imperative', 'jussive', 'subjunctive', 'indicative', 'first-person', 'second-person', 'third-person', 'imperfective', 'perfective', 'comparative', 'superlative', 'elative', 'diminutive', 'paucal', 'relational', 'Classical', 'archaic', 'obsolete', 'dated', 'dialectal', 'colloquial', 'rare', 'uncommon', 'nonstandard', 'proscribed', 'misspelling', 'poetic', 'literary', 'pre-Classical', 'post-Classical']);
const CLA_MARKS = new Set(['Classical', 'archaic', 'obsolete']);
const MSA_MARKS = new Set(['Modern', 'modern']);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const strs = (x: unknown): string[] => list(x).map(str).filter((t): t is string => !!t);
const inc = (m: Record<string, number>, k: string, n = 1): void => { m[k] = (m[k] ?? 0) + n; };
const fmt = (n: number): string => n.toLocaleString('en');
const pct = (a: number, b: number): string => (b ? `${((a / b) * 100).toFixed(1)} %` : '–');

/** What a written form (or a multi-word head) may consist of: Arabic letters, marks, tatweel, ZWJ / ZWNJ (and single spaces between words of a head). */
const WORD_RE = /^[\u0621-\u063A\u0641-\u064A\u0671\u06A9\u06CC\u0640\u200C\u200D\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]+$/;
const validWord = (s: string): boolean => WORD_RE.test(s);
const validHead = (s: string): boolean => s.split(' ').every((w) => w.length > 0 && validWord(w));
/** A head with its non-Arabic leading / trailing words removed ("قَبْلَ Audio:" → "قَبْلَ"). */
function trimHead(s: string): string { const w = s.trim().split(/\s+/); while (w.length && !validWord(w[w.length - 1])) w.pop(); while (w.length && !validWord(w[0])) w.shift(); return w.join(' '); }
const hasLetter = (s: string): boolean => ARABIC_LETTER.test(s);

/** The source's first gloss cut at its first top-level "," or ";" (commas inside brackets stay), at most 80 characters. */
function shortGloss(g: string): string {
  let depth = 0;
  let cut = g.length;
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if ((ch === ',' || ch === ';') && depth === 0) { cut = i; break; }
  }
  let s = g.slice(0, cut).trim();
  if (s.length > 80) { const sp = s.lastIndexOf(' ', 79); s = `${s.slice(0, sp > 20 ? sp : 79).trim()}…`; }
  return s;
}

// ───────────────────────────── the lemma string convention (arHeadForm) ─────────────────────────────

const buildForm = (key: string, marks: LetterMarks[]): string => {
  let out = '';
  for (let i = 0; i < key.length; i++) out += key[i] + marks[i].vowel + (marks[i].shadda ? SHADDA : '') + (marks[i].dagger ? DAGGER_ALIF : '');
  return out.normalize('NFC');
};
/** Which rules of the convention (text.ts arHeadForm) changed a head, read off the difference of the marks before and after. */
function ruleDiff(before: string, after: string): string[] {
  const x = splitVocal(before), y = splitVocal(after);
  const rules = new Set<string>();
  if (x.key !== y.key) return ['key-changed'];
  for (let i = 0; i < x.key.length; i++) {
    const p = x.marks[i], q = y.marks[i];
    if (p.vowel === q.vowel) continue;
    if (!p.vowel && q.vowel === FATHA) rules.add('fatha-before-alif');
    else if (p.vowel === FATHA && p.dagger && !q.vowel) rules.add('dagger-fatha');
    else if (!p.vowel && q.vowel === KASRA && i === 0) rules.add('initial-kasra');
    else if ((p.vowel === DAMMA || p.vowel === DAMMATAN) && !q.vowel && i === x.key.length - 1) rules.add('final-damma');
    else rules.add('other');
  }
  return [...rules];
}
const arHeadForm = TEXT.arHeadForm;

// ───────────────────────────── frequencies (order only) ─────────────────────────────

const freq = new Map<string, number>();
let freqTotal = 0;
for (const line of fs.readFileSync(FREQ, 'utf8').split(/\r?\n/)) {
  const i = line.lastIndexOf(' ');
  if (i <= 0) continue;
  const n = Number(line.slice(i + 1));
  const w = line.slice(0, i).trim();
  if (!(n > 0) || !hasLetter(w)) continue;
  const k = arKey(w);
  freq.set(k, (freq.get(k) ?? 0) + n);
  freqTotal += n;
}
const identities: Record<string, string | null> = IDENTITIES ? (JSON.parse(fs.readFileSync(IDENTITIES, 'utf8')) as Record<string, string | null>) : {};

// ───────────────────────────── the store being built ─────────────────────────────

const codes: string[] = [];
const codeNum = new Map<string, number>();
function intern(tags: Iterable<string>): number {
  const code = [...new Set(tags)].sort().join('|');
  let n = codeNum.get(code);
  if (n === undefined) { n = codes.length; codes.push(code); codeNum.set(code, n); }
  return n;
}

const stats = {
  lines: 0, vfBareLines: 0, headChanged: 0, entries: 0, lemmaEntries: 0, formPages: 0, vfPages: 0, mixedEntries: 0, altOnlyEntries: 0,
  byPos: {} as Record<string, number>, skippedKinds: {} as Record<string, number>,
  rowsTable: 0, rowsPageTable: 0, rowsHeadline: 0, rowsCitation: 0, rowsPage: 0, rowsVerbPage: 0,
  skip: { dash: 0, noLetter: 0, space: 0, invalidChars: 0, errorTag: 0, emptyCode: 0, duplicate: 0, pageBlockedByRow: 0, headlineNotNew: 0, unresolvedTargets: 0, ambiguousTargets: 0, targetNoWord: 0, vfLineMismatch: 0, vfLineUnparsed: 0, pageTableMixed: 0, definiteDropped: 0, emptyTags: 0, headRejected: 0, pageNoForm: 0 },
  definiteStripped: 0, definiteNoArticle: 0, shaddaCleared: 0,
  headTrimmed: 0, headFromExpansion: 0, headUnvocalized: 0, headKeyMismatch: 0, noCanonical: 0,
  ruleChanged: {} as Record<string, number>, mergedIds: 0, homonymPairs: 0, homonymExtra: 0,
  participleDropped: 0, participleKept: 0,
  rootEntries: 0, rootMalformed: 0, rootTemplate: 0, rootCategory: 0, rootBoth: 0, rootDisagree: 0, rootCategoryAmbiguous: 0, multiHeadEntries: 0, extraHeads: 0, multiCanonUnsplit: 0, aliasUncontracted: 0, vfFormFromRows: 0, firstPersonGender: 0, firstPersonMerged: 0, vfRowDisagree: 0, vfSubLines: 0, oneTableSplit: 0, homonymLexemes: 0, glossLabelChanged: 0, glossChoiceTaken: 0, glossChanged: 0, participleEntries: 0, participleOf: 0, idClean: 0, idFail: 0, cliticExcluded: 0, noTableLemmas: 0, noTableWithRow: 0, noTableSpace: 0, adjFemPages: 0, adjFemPagesNew: 0, adjFemLemmas: 0, adjLemmas: 0, coreCompleted: 0, corePartial: 0, corePartialShare: 0, oneTableUnmatched: 0, vfFormFromHead: 0, unvocRows: {} as Record<string, number>, genderTag: 0, genderHead: 0, declUniform: 0, declMixed: 0,
  regCla: 0, regMsa: 0, resolvedByTier: { samePos: 0, nominal: 0, any: 0 } as Record<string, number>,
};
const invalidExamples: string[] = [];
const invalidHeadExamples: string[] = [];
const cliticExamples: string[] = [];
const noteInvalid = (s: string): void => { const l = s.startsWith('head of ') ? invalidHeadExamples : invalidExamples; if (l.length < 20) l.push(s); };
const registerTags: Record<string, number> = {};
const unresolved = new Map<string, number>();

type Cell = [form: string, code: number];
interface Ent {
  pos: string; word: string; head: string; headRaw: string; etym: number; gloss: string; glossOld: string; senseGlosses: string[]; senseLines: string[]; senseClass: string; wasOne?: boolean; order: number;
  lex: Record<string, string>; root?: string; table: Cell[]; headline: Cell[]; citation?: number; lemma: number;
}
interface PageTarget { target: string; tags: string[]; form?: string }
interface Page { key: string; pos: string; form: string; vf: boolean; targets: PageTarget[]; table: Cell[]; order: number }
const ents: Ent[] = [];
const pages: Page[] = [];

// ───────────────────────────── pass 1: the extract ─────────────────────────────

function headOf(e: Record<string, unknown>, word: string, key: string, forms: Record<string, unknown>[], expText?: string, explicit = false): { head: string; how: string } | undefined {
  const cands: Array<{ s: string; how: string }> = [];
  for (const f of forms) if (strs(f.tags).includes('canonical') && str(f.form)) cands.push({ s: String(f.form).normalize('NFC'), how: 'canonical' });
  const exp = explicit ? expText : (expText ?? str(list(e.head_templates).filter(isObj)[0]?.expansion));
  if (exp) { const t = exp.split('•')[0].trim(); if (t) cands.push({ s: t.normalize('NFC'), how: 'expansion' }); }
  for (const c of cands) {
    if (validHead(c.s) && hasLetter(c.s)) return { head: c.s, how: c.how };
    const t = trimHead(c.s);
    if (t && validHead(t) && hasLetter(t) && arKey(t) === key) { stats.headTrimmed++; return { head: t, how: c.how }; }
  }
  if (!cands.length && validHead(word) && hasLetter(word)) return { head: word, how: 'word' };
  return undefined;
}

const ROOT_RE = /^[ء-يٱ](?: [ء-يٱ]){2,4}$/;
const ROOT_CAT = /^Arabic terms belonging to the root (.+)$/;
/** The entry's own root: the ar-root / ar-rootbox template, else the category "Arabic terms belonging to the root X" of its senses (when they all name one root). Never derived. */
function rootOf(e: Record<string, unknown>): string | undefined {
  let tmpl: string | undefined;
  for (const t of list(e.etymology_templates).filter(isObj)) {
    if (t.name !== 'ar-root' && t.name !== 'ar-rootbox') continue;
    const r = str((t.args as Record<string, unknown> | undefined)?.['1']);
    if (!r) continue;
    if (ROOT_RE.test(r)) { tmpl = r; break; }
    stats.rootMalformed++;
  }
  const cats = new Set<string>();
  const catName = (c: unknown): string => (typeof c === 'string' ? c : isObj(c) ? String(c.name ?? '') : '');
  for (const c of list(e.categories)) { const m = ROOT_CAT.exec(catName(c)); if (m && ROOT_RE.test(m[1].trim())) cats.add(m[1].trim()); }
  for (const s of list(e.senses).filter(isObj)) for (const c of list(s.categories)) { const m = ROOT_CAT.exec(catName(c)); if (m && ROOT_RE.test(m[1].trim())) cats.add(m[1].trim()); }
  if (tmpl) { stats.rootTemplate++; if (cats.size) { stats.rootBoth++; if (!cats.has(tmpl)) stats.rootDisagree++; } return tmpl; }
  if (cats.size === 1) { stats.rootCategory++; return [...cats][0]; }
  if (cats.size > 1) stats.rootCategoryAmbiguous++;
  return undefined;
}

function cellsOf(forms: Record<string, unknown>[], wantHeadline: boolean): Cell[] {
  const out: Cell[] = [];
  for (const f of forms) {
    const form = str(f.form);
    if (!form) continue;
    const tags = strs(f.tags);
    if (wantHeadline ? f.source !== undefined : !TABLE_SOURCES.has(String(f.source))) continue;
    if (tags.some((t) => META_TAGS.has(t))) continue;
    if (tags.some((t) => t.startsWith('error-'))) { stats.skip.errorTag++; continue; }
    if (!tags.length) { stats.skip.emptyTags++; continue; }
    out.push([form.normalize('NFC'), intern(tags)]);
  }
  return out;
}

// ───────────── the gloss of a lemma: a short, complete phrase ─────────────
const DANGLING = /\s+(?:of|to|in|on|at|with|for|by|from|into|onto|about|as|a|an|the|and|or|that|which|who|whose|one's|someone's|something|something's)$/i;
/** Removes bracketed segments whole (nested ones too); an unclosed bracket removes the rest of the text. */
function stripBrackets(g: string): string {
  let out = '';
  let depth = 0;
  for (const ch of g) { if (ch === '(' || ch === '[') depth++; else if ((ch === ')' || ch === ']') && depth > 0) depth--; else if (depth === 0) out += ch; }
  return out;
}
/** Spaces and trailing punctuation tidied; a trailing function word ("to look for" -> "to look") is stripped ONLY from text that was cut at the length limit (`cut`), never from a complete alternative of the source. */
function tidy(t: string, cut = false): string {
  let x = t.replace(/\s+/g, ' ').replace(/\s+([,;:.])/g, '$1').trim();
  for (let i = 0; i < 4; i++) { let y = x.replace(/[\s,;:.\-–—]+$/g, ''); if (cut) y = y.replace(DANGLING, ''); y = y.trim(); if (y === x) break; x = y; }
  return x;
}
/** One gloss made short: no bracketed segments, cut at the first ";", at most two comma-separated alternatives, never cut inside a word, never an unclosed bracket. */
function cleanGloss(raw: string, alts = 2): string {
  // an alternative ends at a spaced dash and at an opening quotation mark that follows a space (title — and "anything that serves as an indication …" → title)
  let t = stripBrackets(raw).split(';')[0];
  { const cut = t.split(/\s[—–-]\s|\s[“"«]/)[0]; if (cut !== t && !/^(?:to|of|a|an|the|said|used|in|for|with|or|and)?$/i.test(cut.trim()) && cut.trim().length >= 4) t = cut; }
  // a colon separates the meaning from an explanation of it ("to make: to create"): the meaning is what stands before it
  { const c = t.indexOf(':'); if (c > 0) { const before = tidy(t.slice(0, c)); if (before.length >= 2) t = before; else t = t.slice(c + 1); } }
  t = t.split(',').slice(0, alts).join(',');
  t = tidy(t);
  if (t.length > 60) { const sp = t.lastIndexOf(' ', 60); t = tidy(sp > 10 ? t.slice(0, sp) : t.slice(0, 60), true); }
  return t.length >= 2 ? t : '';
}
/** The fallback: the raw first gloss cut at a word boundary under 60 characters, its brackets balanced (an unclosed one cuts the text before it). */
function rawGloss(raw: string): string {
  let t = raw.trim();
  const open = Math.max(t.lastIndexOf('('), t.lastIndexOf('['));
  const close = Math.max(t.lastIndexOf(')'), t.lastIndexOf(']'));
  if (open > close) t = t.slice(0, open);
  const long = t.length > 59;
  if (long) { const sp = t.lastIndexOf(' ', 59); t = sp > 10 ? t.slice(0, sp) : t.slice(0, 59); }
  return tidy(t, long);
}
/** Source labels that keep a sense from LEADING an entry when an unlabelled sense exists: the source lists senses historically, and these mark the old, the rare, the regional and the figurative. */
const SKIP_LABELS = new Set(['obsolete', 'archaic', 'dated', 'historical', 'rare', 'uncommon', 'poetic', 'literary', 'dialectal', 'regional', 'obsolete-form', 'misspelling', 'nonstandard', 'proscribed', 'figuratively', 'figurative', 'Egypt', 'Egyptian', 'Levantine', 'Gulf', 'Maghrebi', 'Maghreb', 'Morocco', 'Moroccan', 'Iraq', 'Iraqi', 'Sudan', 'Sudanese', 'Hijazi', 'Yemen', 'Yemeni', 'Kuwait', 'Palestine', 'Palestinian', 'Mauritania', 'al-Andalus', 'Algeria', 'Tunisia', 'Libya', 'Syria', 'Lebanon', 'Jordan', 'Saudi Arabia', 'Oman', 'UAE', 'Bahrain', 'Qatar', 'Najdi', 'Bedouin', 'colloquial', 'slang']);
/** A line that says the word is a form of another ("plural of قَطْر", "feminine singular of X", "Judeo-Arabic spelling of X"). */
const FORM_LINE = /^(?:the )?(?:[A-Za-z-]+ ){0,3}(?:plural|dual|singular|feminine|masculine|spelling|form|variant|participle|verbal noun|diminutive|elative|collective|singulative)(?: [A-Za-z-]+){0,2} of /i;
const labelsOf = (x: Record<string, unknown>): string[] => [...strs(x.tags), ...strs(x.raw_tags)];
const isLabelled = (x: Record<string, unknown>): boolean => {
  const t = labelsOf(x);
  if (t.some((l) => SKIP_LABELS.has(l))) return true;
  // Classical only: the label Classical without Modern / Standard
  if (t.includes('Classical') && !t.includes('Modern') && !t.includes('Standard')) return true;
  return FORM_LINE.test(strs(x.glosses)[0] ?? '');
};
interface GlossChoice { text: string; cls: 'One' | 'Lab' | 'Ord'; /** The old rule would have said One: the entry has pointer senses (form-of / alt-of) that were set aside, so it is not a single sense. */ wasOne?: boolean }
/**
 * The sense of the gloss: among the senses, those the source labels as obsolete / archaic / dialectal … and the form-of lines do not lead while an unlabelled sense exists;
 * the first remaining sense leads unless it is long (or, for a verb, not a "to …" phrase) and one of the first three remaining senses is shorter and fit.
 * Class: One (a single real sense once form lines are set aside), Lab (several senses; the lead stands after labelled ones), Ord (the source's order).
 */
function chooseGloss(real: Record<string, unknown>[], pos: string, useLabels = true, pointers = 0): GlossChoice {
  const r = chooseGlossInner(real, pos, useLabels, pointers);
  return r.cls !== 'One' && real.filter((x) => strs(x.glosses).length && !strs(x.tags).includes('no-gloss')).filter((x) => !FORM_LINE.test(strs(x.glosses)[0] ?? '')).length === 1 ? { ...r, wasOne: true } : r;
}
function chooseGlossInner(real: Record<string, unknown>[], pos: string, useLabels: boolean, pointers: number): GlossChoice {
  const all = real.filter((x) => strs(x.glosses).length && !strs(x.tags).includes('no-gloss'));
  if (!all.length) return { text: '', cls: 'Ord' };
  const body = all.filter((x) => !FORM_LINE.test(strs(x.glosses)[0] ?? ''));
  const free = all.filter((x) => !isLabelled(x));
  const pool = useLabels && free.length ? free : all;
  const withGloss = pool.slice(0, 3);
  const cands = withGloss.map((x) => ({ c: cleanGloss(strs(x.glosses)[0]), x })).filter((o) => o.c.length >= 2);
  // One only when the source entry has exactly ONE sense counting the pointer senses (a sense whose first gloss line is "elative degree of X:" with the real gloss on a second line counts too) (elative degree of, plural of, verbal noun of, alternative form of, any form-of / alt-of): a pointer set aside is a sense the card would hide
  // a single sense that only DESCRIBES a use ("used in the construct state in ways which are translated …") is no meaning to drill: not One
  const usageOnly = body.length === 1 && /^\s*(?:\([^)]*\)\s*)?used\s+(?:in|as|with|to|for|only|after|before|mostly|chiefly|especially)\b/i.test(strs(body[0].glosses)[0] ?? '');
  const klass = (lead: Record<string, unknown> | undefined): 'One' | 'Lab' | 'Ord' => (body.length === 1 && pointers === 0 && all.length === body.length && !usageOnly ? 'One' : lead && lead === pool[0] && all.indexOf(lead) > 0 ? 'Lab' : 'Ord');
  if (!cands.length) return { text: rawGloss(strs(withGloss[0].glosses)[0]), cls: klass(undefined) };
  let first = cands[0].c;
  // a long first sense is tried with its first alternative alone ("day, period from sunrise to sunset" → "day")
  if (first.length > 30 || (pos === 'VERB' && first.length > 20)) { const one = cleanGloss(strs(withGloss[0].glosses)[0], 1); if (one.length >= 2 && one.length < first.length) first = one; }
  const shortest = (list: Array<{ c: string; x: Record<string, unknown> }>): { c: string; x: Record<string, unknown> } => list.reduce((a, b) => (b.c.length < a.c.length ? b : a));
  if (pos === 'VERB') {
    if (first.startsWith('to ') && first.length <= 20) return { text: first, cls: klass(cands[0].x) };
    const to = [{ c: first, x: cands[0].x }, ...cands.slice(1)].filter((o) => o.c.startsWith('to ') && o.c.length > 3);
    if (to.length) { const w = shortest(to); return { text: w.c, cls: klass(w.x) }; }
    return { text: first, cls: klass(cands[0].x) };
  }
  if (first.length <= 30) return { text: first, cls: klass(cands[0].x) };
  const w = shortest([{ c: first, x: cands[0].x }, ...cands.slice(1)]);
  return { text: w.c, cls: klass(w.x) };
}

const EXP_LINE = /^#\s*(\S+)\s*\([^)]*\)(?:\s*\/[^/]*\/)?\s*:\s*(.+?)\s+of\s+(\S+)\s*\(/u;

const EXP_INFL = /^#\s*(\S+)\s*\([^)]*\)(?:\s*\/[^/]*\/)?\s*:\s*inflection of\s+(\S+)\s*\(/u;
const EXP_INFL_BARE = /^#\s*inflection of\s+(\S+)\s*\(/u;
const EXP_BARE = /^#\s*([a-z][a-z/ -]*?)\s+of\s+(\S+)\s*\(/u;
{
  const rl = readline.createInterface({ input: fs.createReadStream(INPUT) });
  let order = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    stats.lines++;
    let e: unknown;
    try { e = JSON.parse(line); } catch { continue; }
    if (!isObj(e)) continue;
    const posName = str(e.pos) ?? '';
    const pos = POS[posName];
    const word = str(e.word)?.normalize('NFC');
    if (!pos || !word) { inc(stats.skippedKinds, posName || '(none)'); continue; }
    stats.entries++;
    inc(stats.byPos, pos);
    const key = arKey(word);
    const formRows = list(e.forms).filter(isObj);
    const senses = list(e.senses).filter(isObj);
    const isFormSense = (s: Record<string, unknown>): boolean => list(s.form_of).length > 0 || list(s.alt_of).length > 0;
    const formSenses = senses.filter(isFormSense);
    const lemmaSenses = senses.filter((s) => !isFormSense(s));
    const vf = str(list(e.head_templates).filter(isObj)[0]?.name) === 'ar-verb form';
    order++;

    if (vf) {
      // the page of an inflected verb form: the analysis is the text of the head line ("# form (translit) /ipa/: tags of target (translit)")
      stats.formPages++; stats.vfPages++;
      const exp = str(list(e.head_templates).filter(isObj)[0]?.expansion) ?? '';
      const targets: PageTarget[] = [];
            // the canonical rows of the page repeat the head line cut at "#" ("بنت # بِنْتُ", ipa, ": third-person … of X # بَنَيْتُ", …): the text after "#" of row i is the
      // vocalized form of line i, which the head-line text itself leaves out for some lines
      const rowForms: string[] = [];
      for (const f of formRows) {
        const t = str(f.form);
        if (!t || f.source !== undefined || !strs(f.tags).includes('canonical') || !hasLetter(t)) continue;
        const i = t.lastIndexOf('# ');
        rowForms.push(i >= 0 ? t.slice(i + 2).trim().normalize('NFC') : '');
      }
      const firstHeadText = (exp.split('\n')[0] ?? '').split('•')[0].trim().normalize('NFC');
      const firstHead = validWord(firstHeadText) && arKey(firstHeadText) === key ? firstHeadText : undefined;
      const rawLines = exp.split('\n').slice(1).map((l) => l.trim()).filter((l) => l.startsWith('#'));
      let hi = -1;
      let cur: { form: string; target: string } | undefined;
      const slashAlts = (tags: string[]): string[][] => tags.reduce<string[][]>((acc, t) => { const alts = t.split('/'); return acc.flatMap((a) => alts.map((x) => [...a, x])); }, [[]]);
      for (const ln of rawLines) {
        if (ln.startsWith('##')) {
          // a reading listed under an "inflection of X:" header: "## second-person masculine singular non-past active indicative"
          if (!cur) { stats.skip.vfLineUnparsed++; continue; }
          const words = ln.replace(/^#+/, '').trim().split(/\s+/).filter(Boolean);
          if (!words.length) { stats.skip.vfLineUnparsed++; continue; }
          for (const tags of slashAlts(words)) targets.push({ target: cur.target, tags, form: cur.form });
          stats.vfSubLines++;
          continue;
        }
        hi++;
        cur = undefined;
        const fromRow = rowForms[hi] && validWord(rowForms[hi]) && arKey(rowForms[hi]) === key ? rowForms[hi] : undefined;
        const infl = EXP_INFL.exec(ln);
        if (infl) {
          const form = infl[1].normalize('NFC');
          if (validWord(form) && arKey(form) === key) cur = { form, target: infl[2].normalize('NFC') };
          else stats.skip.vfLineMismatch++;
          continue;
        }
        const m = EXP_LINE.exec(ln);
        if (m) {
          const form = m[1].normalize('NFC');
          if (!validWord(form)) { stats.skip.invalidChars++; noteInvalid(`${word}: ${form}`); continue; }
          if (arKey(form) !== key) { stats.skip.vfLineMismatch++; continue; }
          if (fromRow && fromRow !== form) stats.vfRowDisagree++;
          for (const tags of slashAlts(m[2].trim().split(/\s+/).filter(Boolean))) targets.push({ target: m[3].normalize('NFC'), tags, form });
          continue;
        }
        const inflBare = EXP_INFL_BARE.exec(ln);
        if (inflBare) { if (fromRow) stats.vfFormFromRows++; else stats.vfBareLines++; cur = { form: fromRow ?? word, target: inflBare[1].normalize('NFC') }; continue; }
        const bare = EXP_BARE.exec(ln);
        if (!bare) { stats.skip.vfLineUnparsed++; continue; }
        // no vocalized form in the line: the one of the canonical row, else the page's word printed without vowels
        const useForm = fromRow ?? (firstHead && rawLines.filter((l) => !l.startsWith('##')).length === 1 ? firstHead : undefined);
        if (fromRow) stats.vfFormFromRows++; else if (useForm) stats.vfFormFromHead++; else stats.vfBareLines++;
        for (const tags of slashAlts(bare[1].trim().split(/\s+/).filter(Boolean))) targets.push({ target: bare[2].normalize('NFC'), tags, form: useForm ?? word });
      }
      if (targets.length) pages.push({ key, pos, form: word, vf: true, targets, table: [], order });
      continue;
    }

    // a lemma entry holds a sense that is not a form of something
    if (lemmaSenses.length) {
      // An entry may hold several head lines (رشد: رَشَدَ and رَشِدَ), each with its own table. The extract lists the canonical rows of the
      // heads in order, then opens each table with a "table-tags" row: the n-th table belongs to the n-th canonical row. The entry is split
      // only when the two counts agree; otherwise (one table, several canonical rows: a masculine and a feminine citation form) it stays one lexeme.
      const isCanon = (f: Record<string, unknown>): boolean => f.source === undefined && strs(f.tags).includes('canonical') && !!str(f.form);
      const isHeadRow = (f: Record<string, unknown>): boolean => isCanon(f) && (pos !== 'VERB' || strs(f.tags).every((t) => t === 'canonical' || /^form-/.test(t)));
      const canonRows = formRows.filter(isHeadRow);
      const tableMarks = formRows.filter((f) => TABLE_SOURCES.has(String(f.source)) && strs(f.tags).includes('table-tags')).length;
      // one table and several verb heads (لعب: لَعَبَ and لَعِبَ): the table belongs to the head whose citation form is the table's own third person masculine singular past
      const oneTable = pos === 'VERB' && canonRows.length >= 2 && tableMarks === 1;
      const split = canonRows.length >= 2 && (tableMarks === canonRows.length || oneTable);
      if (canonRows.length >= 2) { if (split) { stats.multiHeadEntries++; stats.extraHeads += canonRows.length - 1; if (oneTable) stats.oneTableSplit++; } else stats.multiCanonUnsplit++; }
      let owner = 0;
      if (oneTable) {
        const cit = formRows.find((f) => TABLE_SOURCES.has(String(f.source)) && ['active', 'third-person', 'masculine', 'singular', 'past'].every((t) => strs(f.tags).includes(t)) && !strs(f.tags).includes('dual') && str(f.form));
        const g = cit ? canonRows.findIndex((r) => arHeadForm(String(r.form).normalize('NFC'), 'VERB') === arHeadForm(String(cit.form).normalize('NFC'), 'VERB')) : -1;
        if (g >= 0) owner = g; else stats.oneTableUnmatched++;
      }
      interface Grp { canon?: Record<string, unknown>; table: Record<string, unknown>[]; headline: Record<string, unknown>[]; exp?: string }
      const heads = list(e.head_templates).filter(isObj).filter((h) => /^ar-(?!verb form)/.test(String(h.name)));
      const grps: Grp[] = [];
      if (split) {
        for (let g = 0; g < canonRows.length; g++) grps.push({ canon: canonRows[g], table: [], headline: [], exp: heads.length === canonRows.length ? str(heads[g].expansion) : undefined });
        let hi = -1, seg = -1;
        for (const f of formRows) {
          if (isCanon(f)) { hi++; continue; }
          const tags = strs(f.tags);
          if (TABLE_SOURCES.has(String(f.source))) { if (tags.includes('table-tags')) seg++; grps[oneTable ? owner : Math.min(Math.max(seg, 0), grps.length - 1)].table.push(f); }
          else if (f.source === undefined) grps[Math.min(Math.max(hi, 0), grps.length - 1)].headline.push(f);
        }
      } else grps.push({ table: formRows, headline: formRows, exp: str(heads[0]?.expansion) });
      const root = rootOf(e);
      if (root) stats.rootEntries++;
      const en = Number(e.etymology_number);
      const glossSense = lemmaSenses.find((s) => strs(s.glosses).length && !strs(s.tags).includes('no-gloss'));
      const glossOld = shortGloss(strs(glossSense?.glosses)[0] ?? '');
      // register: every sense carries a Classical / archaic / obsolete label → Cla; every sense carries Modern → Msa
      const real = lemmaSenses.filter((s) => !strs(s.tags).includes('no-gloss') || strs(s.glosses).length);
      for (const s of real) for (const t of strs(s.tags)) if (/^(Classical|archaic|obsolete|pre-Classical|post-Classical|dated|poetic|literary|rare|historical|dialectal|colloquial|Modern|modern|Standard|slang|vulgar|nonstandard|proscribed|regional|uncommon|formal|informal|Egypt|Levantine|Morocco|Yemen|Iraq|Kuwait|Palestine|Mauritania|al-Andalus)$/.test(t)) inc(registerTags, t);
      const isCla = real.length > 0 && real.every((s) => strs(s.tags).some((t) => CLA_MARKS.has(t)));
      const isMsa = !isCla && real.length > 0 && real.every((s) => strs(s.tags).some((t) => MSA_MARKS.has(t)));
      // A participle (an entry of the verb class in the extract whose head is "active / passive participle of X", with no verb head template) is an adjective to the learner:
      // ADJ, VerbForm=Part, Voice, and the verb it comes from (Of=) as the sense's own text names it.
      const partForm = formSenses.find((s2) => strs(s2.tags).includes('participle') && list(s2.form_of).length > 0);
      const partGloss = partForm ? 'participle' : real.map((s2) => strs(s2.glosses)[0] ?? '').find((g) => /(active|passive) participle of \S+/.test(g));
      const partSense = pos === 'VERB' && heads[0]?.name !== 'ar-verb' && (real.some((s2) => strs(s2.tags).includes('participle')) || !!partGloss);
      const lpos = partSense ? 'ADJ' : pos;
      for (const grp of grps) {
        const h = headOf(e, word, key, grp.canon ? [grp.canon] : formRows, grp.exp, !!grp.canon);
        if (!h) { stats.skip.headRejected++; noteInvalid(`head of ${word}: ${(grp.canon ? [grp.canon] : formRows.filter((f) => strs(f.tags).includes('canonical'))).map((f) => f.form).join(' / ').slice(0, 60)}`); continue; }
        // a closed-class clitic (بِـ, ـهَا, وَ, أَ: written with a tatweel at an edge or as one bare letter) is no word of the index: the analyser has its own clitic table
        if (['PRON', 'DET', 'ADP', 'CONJ', 'PART'].includes(pos) && (/^\u0640|\u0640$/.test(h.head) || arKey(h.head).length === 1)) {
          stats.cliticExcluded++;
          if (cliticExamples.length < 40) cliticExamples.push(`${h.head} (${pos})`);
          continue;
        }
        if (h.how === 'expansion') stats.headFromExpansion++;
        if (h.how === 'word') stats.noCanonical++;
        if (arKey(h.head) !== key) stats.headKeyMismatch++;
        if (!hasTashkil(h.head)) stats.headUnvocalized++;
        stats.lemmaEntries++;
        if (formSenses.length) stats.mixedEntries++;
        const canonRow = grp.canon ?? formRows.find((f) => strs(f.tags).includes('canonical') && str(f.form) && String(f.form).normalize('NFC') === h.head) ?? formRows.find((f) => strs(f.tags).includes('canonical'));
        const canonTags = strs(canonRow?.tags);
        const lex: Record<string, string> = {};
        if (pos === 'NOUN' || pos === 'PROPN') {
          const g = new Set<string>();
          for (const t of canonTags) { if (t === 'masculine') g.add('Masc'); else if (t === 'feminine') g.add('Fem'); }
          if (g.size) stats.genderTag++;
          else {
            const a = str((heads[0]?.args as Record<string, unknown> | undefined)?.['2']);
            if (a) { for (const tok of a.split(/[-,\s/]/)) { if (tok === 'm') g.add('Masc'); else if (tok === 'f') g.add('Fem'); else if (tok === 'c') { g.add('Masc'); g.add('Fem'); } } if (g.size) stats.genderHead++; }
          }
          if (g.size) lex.Gender = [...g].sort().join(',');
        }
        if (pos === 'VERB') {
          const ft = canonTags.find((t) => /^form-/.test(t)) ?? (grp.canon ? undefined : formRows.flatMap((f) => strs(f.tags)).find((t) => /^form-/.test(t)));
          if (ft) { const f = ft.slice(5); lex.Form = f.endsWith('q') ? `${f.slice(0, -1).toUpperCase()}q` : f.toUpperCase(); }
        }
        if (partSense) {
          stats.participleEntries++;
          lex.VerbForm = 'Part';
          const sg = real.flatMap((s2) => strs(s2.tags));
          const ofWord = partForm ? str((list(partForm.form_of).filter(isObj)[0] as Record<string, unknown> | undefined)?.word)?.normalize('NFC') : undefined;
          const pt = partForm ? strs(partForm.tags) : [];
          const m: string[] | null = ofWord ? ['', pt.includes('passive') ? 'passive' : pt.includes('active') ? 'active' : '', ofWord] : null;
          const voice = m && m[1] ? (m[1] === 'active' ? 'Act' : 'Pass') : sg.includes('active') ? 'Act' : sg.includes('passive') ? 'Pass' : undefined;
          if (voice) lex.Voice = voice;
          if (m && validWord(m[2].normalize('NFC'))) { lex.Of = arHeadForm(m[2].normalize('NFC'), 'VERB'); stats.participleOf++; }
          const ft = sg.find((t) => /^form-/.test(t));
          if (ft) { const f = ft.slice(5); lex.Form = f.endsWith('q') ? `${f.slice(0, -1).toUpperCase()}q` : f.toUpperCase(); }
        }
        const tableCells = cellsOf(grp.table, false);
        // Decl: uniform over every row that carries a declension class
        const decls = new Set<string>();
        for (const f of grp.table) if (TABLE_SOURCES.has(String(f.source))) for (const t of strs(f.tags)) { if (t === 'triptote') decls.add('Trip'); else if (t === 'diptote') decls.add('Dip'); else if (t === 'invariable') decls.add('Indecl'); }
        if (decls.size === 1) { lex.Decl = [...decls][0]; stats.declUniform++; } else if (decls.size > 1) stats.declMixed++;
        if (isCla) { lex.Reg = 'Cla'; stats.regCla++; } else if (isMsa) { lex.Reg = 'Msa'; stats.regMsa++; }
        const citeTags = canonTags.length ? canonTags : ['canonical'];
        const cg = chooseGloss(real, lpos, true, formSenses.length);
        if (chooseGloss(real, lpos, false).text !== cg.text) stats.glossLabelChanged++;
        ents.push({ pos: lpos, word, head: h.head, headRaw: h.head, etym: Number.isFinite(en) ? en : 9999, gloss: cg.text, senseClass: cg.cls, wasOne: cg.wasOne === true, senseLines: real.filter((x) => strs(x.glosses).length).map((x) => `[${labelsOf(x).join(',')}] ${strs(x.glosses)[0]}`.slice(0, 70)), glossOld, senseGlosses: real.map((x) => strs(x.glosses)[0] ?? '').filter(Boolean), order, lex, root, table: tableCells, headline: cellsOf(grp.headline, true), citation: intern(citeTags), lemma: -1 });
      }
    }

    // a form page: every sense a form of something (or an alternative spelling of it); a lemma entry that also holds such senses has both
    if (formSenses.length) {
      const targets: PageTarget[] = [];
      for (const s of formSenses) {
        const base = strs(s.tags).filter((t) => SENSE_FORM_TAGS.has(t));
        for (const fo of list(s.form_of).filter(isObj)) { const t = str(fo.word)?.normalize('NFC'); if (t) targets.push({ target: t, tags: base }); else stats.skip.targetNoWord++; }
        for (const ao of list(s.alt_of).filter(isObj)) { const t = str(ao.word)?.normalize('NFC'); if (t) targets.push({ target: t, tags: [...base, 'alternative'] }); else stats.skip.targetNoWord++; }
      }
      if (targets.length) {
        if (!lemmaSenses.length) { stats.formPages++; if (!formSenses.some((s) => list(s.form_of).length)) stats.altOnlyEntries++; }
        const h = headOf(e, word, key, formRows);
        const form = h?.head ?? word;
        if (!h && !(validHead(word) && hasLetter(word))) { stats.skip.pageNoForm++; continue; }
        pages.push({ key, pos, form, vf: false, targets, table: lemmaSenses.length ? [] : cellsOf(formRows, false), order });
      }
    }
  }
}
console.log(`read ${fmt(stats.lines)} lines: ${fmt(stats.lemmaEntries)} lemma entries, ${fmt(stats.formPages)} form pages (${fmt(stats.vfPages)} verb-form pages), ${fmt(stats.mixedEntries)} lemma entries that also hold form-of senses`);

// ───────────────────────────── lemma ids ─────────────────────────────

const lemmaIds: string[] = [];
const glossChoices: Record<string, string[]> = !flags.has('no-gloss-choices') && fs.existsSync(GLOSS_CHOICES_PATH) ? ((JSON.parse(fs.readFileSync(GLOSS_CHOICES_PATH, 'utf8')) as { choices?: Record<string, string[]> }).choices ?? {}) : {};
const glossChoiceNone: string[] = [];
const pickerChanges: string[] = [];
const reviewedHolder = new Map<string, number>(); // lexeme → the lemma id whose entry holds the sense a reviewed choice matched
function setLex(l: number, key: string, val: string): void {
  const kv: Record<string, string> = {};
  for (const p of lemmaRows[l][3].split('|')) { const i = p.indexOf('='); if (i > 0) kv[p.slice(0, i)] = p.slice(i + 1); }
  kv[key] = val;
  lemmaRows[l][3] = Object.keys(kv).sort().map((k) => `${k}=${kv[k]}`).join('|');
}
const lemmaRows: ArLemmaRow[] = [];
const lemmaKeys: string[][] = [];
const lemmaOfEnt: number[] = [];
const byKey = new Map<string, number[]>(); // key of a head → lemma numbers
{
  for (const en of ents) { en.head = arHeadForm(en.headRaw, en.pos); if (en.head !== arCanon(en.headRaw)) { stats.headChanged++; for (const x of ruleDiff(arCanon(en.headRaw), en.head)) inc(stats.ruleChanged, x); } }
  const groups = new Map<string, Ent[]>();
  for (const en of ents) { const g = `${en.head}|${en.pos}`; (groups.get(g) ?? groups.set(g, []).get(g)!).push(en); }
  const cmp = (a: Ent, b: Ent): number => a.etym - b.etym || (a.glossOld < b.glossOld ? -1 : a.glossOld > b.glossOld ? 1 : 0) || a.order - b.order;
  const make = (en: Ent, id: string): number => {
    const n = lemmaIds.length;
    lemmaIds.push(id);
    const lexStr = Object.keys(en.lex).sort().map((k) => `${k}=${en.lex[k]}`).join('|');
    if (en.gloss !== en.glossOld) stats.glossChanged++;
    lemmaRows.push(en.root ? [en.head, en.gloss, en.pos, lexStr, 0, en.root] : [en.head, en.gloss, en.pos, lexStr, 0]);
    lemmaKeys.push([]);
    const k = arKey(en.head);
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(n);
    return n;
  };
  for (const [g, members] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    members.sort(cmp);
    // entries whose source spelling the convention CHANGED are other spellings of the entry spelled as the convention has it (when there is one): one id
    const exact = members.filter((m) => m.headRaw === m.head);
    const changed = members.filter((m) => m.headRaw !== m.head);
    const idOf: number[] = [];
    let nth = 0;
    const next = (m: Ent): number => { nth++; return make(m, nth === 1 ? g : `${g}|${nth}`); };
    for (const m of exact) m.lemma = next(m);
    for (const m of changed) { if (exact.length) { m.lemma = exact[0].lemma; stats.mergedIds++; } else m.lemma = next(m); }
    void idOf;
    if (nth > 1) { stats.homonymPairs++; stats.homonymExtra += nth - 1; }
    for (const m of members) { lemmaOfEnt.push(m.lemma); }
    const kws = glossChoices[g];
    if (kws) {
      // the reviewed choice: the first source sense (over every entry of the head and part of speech) whose gloss holds a keyword as a whole word; the lead id of the lexeme and the entry
      // that holds the sense take it, the other homonym siblings keep their own
      const res = kws.map((k) => new RegExp(`(^|[^A-Za-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z])`, 'i'));
      let hit: { m: Ent; text: string } | undefined;
      // the keyword is looked for outside brackets, first in the FIRST alternative of a sense (a sense that merely mentions it later does not lead), then in any alternative;
      // the text kept is the alternative that holds it ("to mark … on a surface, to write" → "to write")
      const pick = (sg: string, firstOnly: boolean): string => {
        const alts = stripBrackets(sg).split(';').flatMap((seg) => seg.split(',')).flatMap((seg) => seg.split(':')).map((seg) => seg.split(/\s[—–-]\s|\s[“"«]/)[0]);
        const hitAlt = (firstOnly ? alts.slice(0, 1) : alts).find((alt) => res.some((r) => r.test(alt)));
        const t = hitAlt ? tidy(hitAlt) : '';
        return t.length >= 2 ? t : '';
      };
      // a pass BEFORE those two: an alternative that IS the keyword (a leading "to ", "a ", "an ", "the " allowed, nothing else) wins over a sense that merely holds it
      // only the reviewer's FIRST keyword may win this way (a later keyword must not overturn the order the reviewer gave), and a verb's alternative must be a verb gloss
      const isKeyword = (sg: string, verb: boolean): string => {
        const alts = stripBrackets(sg).split(';').flatMap((seg) => seg.split(',')).flatMap((seg) => seg.split(':')).map((seg) => seg.split(/\s[—–-]\s|\s[“"«]/)[0]);
        for (const alt of alts) {
          const bare = alt.trim().replace(/^(?:to|a|an|the)\s+/i, '').trim().toLowerCase();
          if (verb && !/^\s*to\s/i.test(alt)) continue;
          if (bare && kws[0].toLowerCase() === bare) { const t = tidy(alt); if (t.length >= 2) return t; }
        }
        return '';
      };
      let oldHit: { m: Ent; text: string } | undefined;
      outerOld: for (const firstOnly of [true, false]) for (const m of members) for (const sg of m.senseGlosses) { const c = pick(sg, firstOnly); if (c) { oldHit = { m, text: c }; break outerOld; } }
      outer: for (const m of members) for (const sg of m.senseGlosses) { const c = isKeyword(sg, m.pos === 'VERB'); if (c) { hit = { m, text: c }; break outer; } }
      if (!hit) hit = oldHit;
      if (hit && (!oldHit || oldHit.text !== hit.text || oldHit.m !== hit.m)) pickerChanges.push([g, oldHit?.text ?? '(none)', hit.text, kws.join(', ')].join('\t'));
      if (hit) {
        stats.glossChoiceTaken++;
        lemmaRows[hit.m.lemma][1] = hit.text;
        hit.m.senseClass = 'Rev';
        reviewedHolder.set(g, hit.m.lemma);
      } else glossChoiceNone.push(g);
    }
    for (const m of members) if (!/(^|\|)Sense=/.test(lemmaRows[m.lemma][3])) setLex(m.lemma, 'Sense', m.senseClass);
  }
}
if (process.env.AR_PICKER_CHANGES) fs.writeFileSync(process.env.AR_PICKER_CHANGES, `lexeme\told gloss\tnew gloss\tkeywords\n${pickerChanges.join('\n')}\n`);
console.log(`reviewed-choice picker: ${pickerChanges.length} lexemes change by the keyword-alternative pass`);
// the root of a merged entry fills a gap of the entry it merged into
for (const en of ents) if (en.root && !lemmaRows[en.lemma][5]) lemmaRows[en.lemma][5] = en.root;
console.log(`${fmt(lemmaIds.length)} lemma ids (${fmt(stats.mergedIds)} merged by the head convention, ${fmt(stats.homonymPairs)} head+POS pairs with several entries)`);

// ───────────────────────────── rows ─────────────────────────────

const forms = new Map<string, ArFormRow[]>();
let origin = 'table';
function addRaw(key: string, lemma: number, codeIn: number, vocal: string): boolean {
  // the first person has no gender: a first-person cell is one row, whichever gender block of the table it came from
  let code = codeIn;
  let stripped = false;
  const tg = tagsOf(codeIn);
  if (tg.includes('first-person') && (tg.includes('masculine') || tg.includes('feminine'))) { code = intern(tg.filter((t) => t !== 'masculine' && t !== 'feminine')); stripped = true; stats.firstPersonGender++; }
  let rows = forms.get(key);
  if (!rows) { rows = []; forms.set(key, rows); }
  for (const r of rows) if (r[0] === lemma && r[1] === code && (r[2] ?? '') === vocal) { stats.skip.duplicate++; if (stripped) stats.firstPersonMerged++; return false; }
  if (!vocal) inc(stats.unvocRows, origin);
  rows.push(vocal ? [lemma, code, vocal] : [lemma, code]);
  const lk = lemmaKeys[lemma];
  if (lk[lk.length - 1] !== key && !lk.includes(key)) lk.push(key);
  return true;
}
const hasFormUnder = (key: string, lemma: number, vocal: string, any = false): boolean => (forms.get(key) ?? []).some((r) => r[0] === lemma && (any || (r[2] ?? '') === vocal));

interface Prepared { key: string; vocal: string }
/** A form as its key and packed vowels, or undefined (counted) when a rule leaves it out. `definite` rows lose their article (see --definite). */
function prepare(form: string, tags: string[]): Prepared | undefined {
  if (form === '-') { stats.skip.dash++; return undefined; }
  if (/\s/.test(form)) { stats.skip.space++; return undefined; }
  if (!validWord(form)) { stats.skip.invalidChars++; noteInvalid(form); return undefined; }
  if (!hasLetter(form)) { stats.skip.noLetter++; return undefined; }
  const f = arCanon(form);
  if (tags.includes('definite')) {
    const sp = splitVocal(f);
    if (sp.key.startsWith('\u0627\u0644') && sp.key.length >= 4) {
      if (DEFINITE === 'drop') { stats.skip.definiteDropped++; return undefined; }
      if (DEFINITE === 'strip') {
        const m = sp.marks.slice(2).map((x) => ({ ...x }));
        if (m[0].shadda) { m[0].shadda = false; stats.shaddaCleared++; }
        stats.definiteStripped++;
        const key = sp.key.slice(2);
        return { key, vocal: packVocal(buildForm(key, m)) };
      }
    } else stats.definiteNoArticle++;
  }
  return { key: arKey(f), vocal: packVocal(f) };
}
/** The sorted tags of a code, as an array. */
const tagsOf = (code: number): string[] => codes[code].split('|');
/** A vocalization with the last letter's vowel left out, for comparing a head with a participle cell. */
function sigIgnoringEnding(form: string): string {
  const { key, marks } = splitVocal(form);
  const m = marks.map((x) => ({ ...x }));
  if (m.length) m[m.length - 1].vowel = '';
  return key + '\t' + packVocal(buildForm(key, m));
}

// the lemmas that could be a verb's participle or verbal noun: nominal lemmas by key
const nominalSigs = new Map<string, Set<string>>();
for (const en of ents) {
  if (!NOMINAL.has(en.pos)) continue;
  const k = arKey(en.head);
  (nominalSigs.get(k) ?? nominalSigs.set(k, new Set()).get(k)!).add(sigIgnoringEnding(en.head));
}

origin = 'table';
for (const en of ents) {
  const lemma = en.lemma;
  const isVerb = en.pos === 'VERB';
  for (const [form, code] of en.table) {
    const tags = tagsOf(code);
    const p = prepare(form, tags);
    if (!p) continue;
    if (isVerb && (tags.includes('noun-from-verb') || tags.includes('participle'))) {
      // a participle or verbal noun that has an entry of its own is that entry's lexeme, not the verb's reading
      if (nominalSigs.get(p.key)?.has(sigIgnoringEnding(arHeadForm(form, 'NOUN')))) { stats.participleDropped++; continue; }
      stats.participleKept++;
    }
    if (addRaw(p.key, lemma, code, p.vocal)) stats.rowsTable++;
  }
}
origin = 'citation';
// a lemma with no row under its own written form is read through its headword: the source's canonical row
for (const en of ents) {
  const p = prepare(en.headRaw, []);
  if (!p) continue;
  if (!hasFormUnder(p.key, en.lemma, packVocal(en.headRaw), true) && addRaw(p.key, en.lemma, en.citation!, p.vocal)) stats.rowsCitation++;
}

// ───────────────────────────── resolution of form pages ─────────────────────────────

/** The lemma a target word names: same key and vowels, same part of speech first, then nominal, then any; undefined (counted) when none or several. */
/** An uncontracted spelling of a doubled-consonant verb (ضَادَدَ) as the contracted one (ضَادَّ): the first of two identical letters, vowelled, folded into the second. */
function contractDoubled(t: string): string | undefined {
  const { key, marks } = splitVocal(t);
  const m: LetterMarks[] = [];
  const k: string[] = [];
  let changed = false;
  for (let i = 0; i < key.length; i++) {
    const p = marks[i];
    if (i + 1 < key.length && key[i] === key[i + 1] && (p.vowel === FATHA || p.vowel === DAMMA || p.vowel === KASRA) && !p.shadda && !marks[i + 1].shadda) {
      k.push(key[i + 1]); m.push({ ...marks[i + 1], shadda: true }); i++; changed = true;
    } else { k.push(key[i]); m.push({ ...p }); }
  }
  return changed ? buildForm(k.join(''), m) : undefined;
}
function resolve(target0: string, pagePos: string, vf: boolean): number | undefined {
  let target = target0;
  if (!byKey.get(arKey(target))?.length) { const c = contractDoubled(target); if (c && byKey.get(arKey(c))?.length) { target = c; stats.aliasUncontracted++; } }
  const key = arKey(target);
  const cands = byKey.get(key) ?? [];
  const vocalized = hasTashkil(target);
  const fits = (l: number): boolean => !vocalized || arHeadForm(target, lemmaRows[l][2]) === lemmaRows[l][0];
  const tiers: Array<[string, number[]]> = vf
    ? [['samePos', cands.filter((l) => lemmaRows[l][2] === 'VERB' && fits(l))]]
    : [['samePos', cands.filter((l) => lemmaRows[l][2] === pagePos && fits(l))], ['nominal', cands.filter((l) => NOMINAL.has(lemmaRows[l][2]) && fits(l))], ['any', cands.filter(fits)]];
  for (const [tier, list2] of tiers) {
    const uniq = [...new Set(list2)];
    if (uniq.length === 1) { stats.resolvedByTier[tier]++; return uniq[0]; }
    if (uniq.length > 1) { stats.skip.ambiguousTargets++; return undefined; }
  }
  stats.skip.unresolvedTargets++;
  unresolved.set(target, (unresolved.get(target) ?? 0) + 1);
  return undefined;
}

const sameTags = (a: string[], b: string[]): boolean => [...a].sort().join('|') === [...b].sort().join('|');
origin = 'page-table';
const pageResolved: Array<Array<number | undefined>> = pages.map((p) => p.targets.map((t) => resolve(t.target, p.pos, p.vf)));
// pages that own a table (a plural or feminine page with its declension): their rows filed under the target with the page's own labels added
for (let i = 0; i < pages.length; i++) {
  const p = pages[i];
  if (!p.table.length) continue;
  const ts = p.targets.map((t, j) => ({ t, l: pageResolved[i][j] })).filter((x) => x.l !== undefined);
  if (!ts.length) continue;
  if (ts.some((x) => !sameTags(x.t.tags, ts[0].t.tags) || x.l !== ts[0].l)) { stats.skip.pageTableMixed++; continue; }
  for (const [form, code] of p.table) {
    const tags = [...tagsOf(code), ...ts[0].t.tags];
    const pr = prepare(form, tags);
    if (!pr) continue;
    if (addRaw(pr.key, ts[0].l!, intern(tags), pr.vocal)) stats.rowsPageTable++;
  }
}
origin = 'page';
// the page's own row, only where the lemma has no row for that key and vowels yet
for (let i = 0; i < pages.length; i++) {
  const p = pages[i];
  for (let j = 0; j < p.targets.length; j++) {
    const l = pageResolved[i][j];
    if (l === undefined) continue;
    const t = p.targets[j];
    const form = t.form ?? p.form;
    const tags = t.tags.length ? t.tags : ['form-of'];
    const pr = prepare(form, tags);
    if (!pr) continue;
    if (hasFormUnder(pr.key, l, pr.vocal) || (!pr.vocal && hasFormUnder(pr.key, l, '', true))) { stats.skip.pageBlockedByRow++; if (lemmaRows[l][2] === 'ADJ' && tags.includes('feminine')) stats.adjFemPages++; continue; }
    const newRow = addRaw(pr.key, l, intern(tags), pr.vocal);
    if (lemmaRows[l][2] === 'ADJ' && tags.includes('feminine')) { stats.adjFemPages++; if (newRow) stats.adjFemPagesNew++; }
    if (newRow) { if (p.vf) stats.rowsVerbPage++; else stats.rowsPage++; }
  }
}
origin = 'headline';
// head-line forms (plural, feminine, elative, non-past, verbal noun …) of a lemma entry, where the lemma has no row for that key and vowels yet
for (const en of ents) {
  for (const [form, code] of en.headline) {
    const tags = tagsOf(code);
    const pr = prepare(form, tags);
    if (!pr) continue;
    if (hasFormUnder(pr.key, en.lemma, pr.vocal) || (!pr.vocal && hasFormUnder(pr.key, en.lemma, '', true))) { stats.skip.headlineNotNew++; continue; }
    if (addRaw(pr.key, en.lemma, code, pr.vocal)) stats.rowsHeadline++;
  }
}

// ───────────────────────────── derived figures, counts ─────────────────────────────

for (const en of ents) if (!en.table.length) { stats.noTableLemmas++; if (lemmaKeys[en.lemma].length) stats.noTableWithRow++; else if (en.head.includes(' ')) stats.noTableSpace++; }
{
  const hasFem = new Set<number>();
  for (const rows of forms.values()) for (const r of rows) if (lemmaRows[r[0]][2] === 'ADJ' && tagsOf(r[1]).includes('feminine')) hasFem.add(r[0]);
  stats.adjFemLemmas = hasFem.size;
  stats.adjLemmas = lemmaRows.filter((r) => r[2] === 'ADJ').length;
}
const keys = [...forms.keys()].sort();
let rowTotal = 0;
const holders = new Map<string, number>(); // key → number of distinct lemma ids
for (const k of keys) { const rs = forms.get(k)!; rowTotal += rs.length; holders.set(k, new Set(rs.map((r) => r[0])).size); }
const lemmasWithRows = lemmaKeys.filter((l) => l.length).length;
const multiLemmaKeys = [...holders.values()].filter((n) => n > 1).length;

// count: own keys' frequency + keys an identities file names this lemma for; shared undecided keys add nothing
const idNum = new Map(lemmaIds.map((id, i) => [id, i]));
// an identities value is a lemma id, optionally with proclitic letters before it and enclitic letters after it ("و+<id>", "<id>+ي"): the stem key is the key with those letters removed
function parseIdentity(v: string): { id: string; pre: string[]; post: string[] } | undefined {
  const parts = v.split('+');
  const i = parts.findIndex((p) => p.includes('|'));
  return i < 0 ? undefined : { id: parts[i], pre: parts.slice(0, i), post: parts.slice(i + 1) };
}
function stemKeyOf(key: string, pre: string[], post: string[]): string {
  let k = key;
  for (const p of pre) { const pk = arKey(p); if (pk && k.startsWith(pk) && k.length > pk.length) k = k.slice(pk.length); }
  for (const p of [...post].reverse()) { const pk = arKey(p); if (pk && k.endsWith(pk) && k.length > pk.length) k = k.slice(0, k.length - pk.length); }
  return k;
}
const idInfo = new Map<string, { n: number | undefined; stem: string; raw: string }>();
const mainByKey = new Map<string, number>(); // a key (whole or stem) → the lemma the reviewed list names as its main reading
for (const [k, v] of Object.entries(identities)) {
  if (!v) continue;
  const p = parseIdentity(v);
  const n = p ? idNum.get(p.id) : undefined;
  const stem = p ? stemKeyOf(k, p.pre, p.post) : k;
  idInfo.set(k, { n, stem, raw: v });
  if (n !== undefined) { mainByKey.set(k, n); if (stem !== k && !mainByKey.has(stem) && !(stem in identities)) mainByKey.set(stem, n); }
}
// homonym siblings (one head, one part of speech): Homonyms=N on each, Lead=Yes on the lead id: a NUMBERED id the reviewed identities name, else the one whose sense a reviewed gloss choice matched, else the first
const lexemeIds = new Map<string, number[]>();
lemmaIds.forEach((id, l) => { const lx = id.split('|').slice(0, 2).join('|'); (lexemeIds.get(lx) ?? lexemeIds.set(lx, []).get(lx)!).push(l); });
const leadOfLexeme = new Map<string, number>();
const leadByReview: string[] = []; // lexemes whose lead is the entry a reviewed sense matched, where an identity named only the bare id
{
  const named = new Set<number>(mainByKey.values());
  for (const [lx, ids] of lexemeIds) {
    // an identity that names the bare id (no number) names the LEXEME, not its first source entry: only a numbered id picks an entry, and a reviewed sense outranks the first
    const numbered = ids.find((l) => named.has(l) && lemmaIds[l].split('|').length > 2);
    const lead = numbered ?? (reviewedHolder.has(lx) ? reviewedHolder.get(lx)! : ids[0]);
    if (lead !== (ids.find((l) => named.has(l)) ?? lead)) leadByReview.push(lemmaIds[lead]);
    leadOfLexeme.set(lx, lead);
    if (ids.length > 1) { for (const l of ids) setLex(l, 'Homonyms', String(ids.length)); setLex(lead, 'Lead', 'Yes'); stats.homonymLexemes++; }
  }
  console.log(`lead entry taken from a reviewed sense over a bare identity: ${leadByReview.length}: ${leadByReview.join(' ')}`);
}
const shareCounts = new Array<number>(lemmaIds.length).fill(0); // the old definition (frequency / holders): used only to admit closed classes to the core
let identityApplied = 0;
let identityUnknown = 0;
const identityFailures: string[] = [];

// ───────────── the reviewed identities, generalised: lexeme preferences ─────────────
const lexOfId = (id: string): string => id.split('|').slice(0, 2).join('|');
const lexPos = (lex: string): string => lex.split('|')[1];
const lexHead = (lex: string): string => lex.split('|')[0];
const CLOSED_POS = new Set(['PRON', 'ADP', 'PART', 'CONJ', 'SCONJ', 'DET', 'INTJ', 'ADV']);
/** Nouns, adjectives and names of one head are one lexeme; so are the closed-class entries of one head. */
const posGroup = (pos: string): string => (pos === 'NOUN' || pos === 'ADJ' || pos === 'PROPN' ? 'N' : CLOSED_POS.has(pos) ? 'C' : pos);
const lexemesOnCache = new Map<string, Map<string, number[]>>();
function lexemesOn(k: string): Map<string, number[]> {
  let m = lexemesOnCache.get(k);
  if (!m) {
    m = new Map();
    for (const r of forms.get(k) ?? []) { const lx = lexOfId(lemmaIds[r[0]]); const a = m.get(lx) ?? m.set(lx, []).get(lx)!; if (!a.includes(r[0])) a.push(r[0]); }
    lexemesOnCache.set(k, m);
  }
  return m;
}
const looseKeys = new Map<string, string[]>();
for (const k of keys) { const f = arLoose(k); (looseKeys.get(f) ?? looseKeys.set(f, []).get(f)!).push(k); }
const lexKeyCount = new Map<string, number>(); // lexeme → number of keys it has rows on
for (const k of keys) for (const lx of lexemesOn(k).keys()) lexKeyCount.set(lx, (lexKeyCount.get(lx) ?? 0) + 1);
const prefStats = { candidates: 0, sameLexeme: 0, conflictPairs: 0, balancedRemoved: 0, closedDropped: 0, pairs: 0, losers: 0, winners: 0, idCleanSibling: 0, pairsDerived: 0, revMerged: 0, revOverridden: 0, revBalancedRemoved: 0, revSkipped: 0, idCleanLoose: 0, prefKeys: 0 };
const finalPrefs = new Map<string, Set<string>>(); // loser lexeme → winner lexemes
const prefConflictLines: string[] = [];
{
  const lines: string[] = [];
  const support = new Map<string, Set<string>>(); // "loser\twinner" → listed keys that gave the pair (where the loser's own citation row shows)
  const balanced = new Set<string>();
  const sortedIds = Object.entries(identities).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [k, v] of sortedIds) {
    if (!v) {
      // reviewed and balanced: every pair of lexemes on the key is balanced
      const lx = [...lexemesOn(k).keys()];
      for (const a of lx) for (const b of lx) if (a !== b) balanced.add(`${a}\t${b}`);
      continue;
    }
    const p = parseIdentity(v);
    const info = idInfo.get(k)!;
    const here = [...lexemesOn(k).keys()];
    if (!p || info.n === undefined) { identityUnknown++; stats.idFail++; lines.push(`${k}\t${v}\tlemma id not in the index\t${here.join(' ')}`); continue; }
    const wl = lexOfId(p.id);
    const cand = [k, info.stem];
    // a stem that ends in ت before an attached pronoun may be a ة (حياته → حَيَاة)
    if (info.stem.endsWith('\u062A')) cand.push(`${info.stem.slice(0, -1)}\u0629`);
    let found: string[] = [];
    if (cand.some((c) => (forms.get(c) ?? []).some((r) => lemmaIds[r[0]] === p.id))) { stats.idClean++; found = cand.filter((c) => lexemesOn(c).has(wl)).slice(0, 1); }
    else {
      const sib = cand.filter((c) => lexemesOn(c).has(wl));
      if (sib.length) { prefStats.idCleanSibling++; found = sib.slice(0, 1); }
      else {
        const lk = [...new Set(cand.flatMap((c) => (looseKeys.get(arLoose(c)) ?? []).filter((k2) => k2 !== c && lexemesOn(k2).has(wl))))];
        if (lk.length) { prefStats.idCleanLoose++; found = lk; }
      }
    }
    if (!found.length) {
      stats.idFail++;
      lines.push(`${k}\t${v}\tno row of ${p.id} (or a numbered sibling, or through the loose fold) on ${k} or ${info.stem}\ton ${k}: ${here.join(' ') || '-'}; on ${info.stem}: ${[...lexemesOn(info.stem).keys()].join(' ') || '-'}`);
      continue;
    }
    prefStats.prefKeys++;
    for (const fk of found) {
      for (const [lx, nums] of lexemesOn(fk)) {
        if (lx === wl) continue;
        prefStats.candidates++;
        // (a) the same head in the same group of parts of speech is one lexeme, not a rival
        if (lexHead(lx) === lexHead(wl) && posGroup(lexPos(lx)) === posGroup(lexPos(wl))) { prefStats.sameLexeme++; continue; }
        const pk = `${lx}\t${wl}`;
        const citation = nums.some((l) => (forms.get(fk) ?? []).some((r) => r[0] === l && tagsOf(r[1]).includes('canonical')));
        const s = support.get(pk) ?? support.set(pk, new Set()).get(pk)!;
        if (citation) s.add(k); else s.add('');
      }
    }
  }
  // (b) a pair that wins on one key and loses on another is dropped both ways
  const conflicts = new Set<string>();
  for (const pk of support.keys()) {
    const [lo, wi] = pk.split('\t');
    if (support.has(`${wi}\t${lo}`)) { conflicts.add(pk); if (lo < wi) prefConflictLines.push(`${lo}\t${wi}\tboth directions`); }
  }
  prefStats.conflictPairs = prefConflictLines.length;
  for (const pk of [...support.keys()].sort()) {
    if (conflicts.has(pk)) continue;
    const [lo, wi] = pk.split('\t');
    // (c) two lexemes that are balanced somewhere have no preference
    if (balanced.has(pk)) { prefStats.balancedRemoved++; continue; }
    // (d) a closed-class loser to an open-class winner stands only where the loser's own citation row shows on a key the winner is main of
    if (CLOSED_POS.has(lexPos(lo)) && !CLOSED_POS.has(lexPos(wi)) && ![...support.get(pk)!].some((x) => x !== '')) { prefStats.closedDropped++; continue; }
    (finalPrefs.get(lo) ?? finalPrefs.set(lo, new Set()).get(lo)!).add(wi);
    prefStats.pairs++;
  }
  prefStats.pairsDerived = prefStats.pairs;
  // the hand-reviewed pairs, merged after the derived ones: a reviewed pair overrides a derived pair that says the opposite; a balanced pair removes any preference between its two lexemes
  const reviewedPath = opt['preferences-reviewed'] ?? 'src/adapters/arabic/preferences-reviewed.json';
  if (!flags.has('no-preferences-reviewed') && fs.existsSync(reviewedPath)) {
    const rev = JSON.parse(fs.readFileSync(reviewedPath, 'utf8')) as { prefer?: Record<string, string[]>; balanced?: string[][] };
    const held = new Set(lemmaIds.map(lexOfId));
    const skip = (x: string): boolean => { if (held.has(x)) return false; prefStats.revSkipped++; prefConflictLines.push(`${x}\t\tnot in the index (source = reviewed)`); return true; };
    for (const lo of Object.keys(rev.prefer ?? {}).sort()) {
      for (const wi of [...rev.prefer![lo]].sort()) {
        if (skip(lo) || skip(wi)) continue;
        if (finalPrefs.get(wi)?.delete(lo)) { prefStats.revOverridden++; prefConflictLines.push(`${wi}\t${lo}\tderived pair overridden (source = reviewed)`); }
        (finalPrefs.get(lo) ?? finalPrefs.set(lo, new Set()).get(lo)!).add(wi);
        prefStats.revMerged++;
      }
    }
    for (const [a, b] of rev.balanced ?? []) {
      if (skip(a) || skip(b)) continue;
      if (finalPrefs.get(a)?.delete(b)) prefStats.revBalancedRemoved++;
      if (finalPrefs.get(b)?.delete(a)) prefStats.revBalancedRemoved++;
    }
    for (const [lo, set] of [...finalPrefs]) if (!set.size) finalPrefs.delete(lo);
    prefStats.pairs = [...finalPrefs.values()].reduce((a, x) => a + x.size, 0);
  }
  prefStats.losers = finalPrefs.size;
  prefStats.winners = new Set([...finalPrefs.values()].flatMap((s) => [...s])).size;
  if (opt['identities-check']) fs.writeFileSync(opt['identities-check'], `${lines.join('\n')}\n`);
  if (opt['preference-conflicts']) fs.writeFileSync(opt['preference-conflicts'], `${prefConflictLines.sort().join('\n')}\n`);
  identityFailures.push(...lines.slice(0, 30));
}

// ───────────── count ─────────────
// first term: the frequency of the keys only this lemma has rows on, and of the keys the reviewed list gives it; second, weaker term (a quarter): the frequency of a
// shared key goes to the one lexeme that every other lexeme on the key loses to (a generated preference), nothing otherwise
const SECOND_WEIGHT = 0.25;
const decisive = (lx: Map<string, number[]>): string | undefined => {
  const win = [...lx.keys()].filter((a) => [...lx.keys()].every((b) => b === a || finalPrefs.get(b)?.has(a)));
  return win.length === 1 ? win[0] : undefined;
};
// A LEXEME GROUP is every lemma id of one vocalized head whose parts of speech are in one class: {NOUN, ADJ, PROPN}, {VERB}, the closed classes {PRON DET ADP PART CONJ SCONJ ADV INTJ NUM};
// heads that differ only as …ٍ against …ِي (مَاضٍ / مَاضِي) are one head. A key is own to a group when every lemma id with a row on it is in that group; its frequency goes to the group
// and every member id carries the group's count (homonym siblings agree). A verb's noun-from-verb or participle cell does not make a key shared when a nominal entry of that very form exists.
const KASRATAN = 'ٍ';
const groupHead = (h: string): string => h.replace(new RegExp(`${KASRATAN}$`), 'ِي');
const classOfPos = (pos: string): string => (pos === 'NOUN' || pos === 'ADJ' || pos === 'PROPN' ? 'N' : pos === 'VERB' ? 'V' : CLOSED_POS.has(pos) || pos === 'NUM' ? 'C' : pos);
const groupOf = new Array<number>(lemmaIds.length);
{
  const gnum = new Map<string, number>();
  for (let l = 0; l < lemmaIds.length; l++) {
    const g = `${groupHead(lemmaRows[l][0])}|${classOfPos(lemmaRows[l][2])}`;
    let n = gnum.get(g);
    if (n === undefined) { n = gnum.size; gnum.set(g, n); }
    groupOf[l] = n;
  }
}
const groupCount = new Map<number, number>();
const groupSecond = new Map<number, number>();
const addTo = (m: Map<number, number>, g: number, f: number): void => { m.set(g, (m.get(g) ?? 0) + f); };
const isDerivedCell = (k: string, r: ArFormRow): boolean => {
  if (lemmaRows[r[0]][2] !== 'VERB') return false;
  const t = tagsOf(r[1]);
  if (!t.includes('noun-from-verb') && !t.includes('participle')) return false;
  return !!nominalSigs.get(k)?.has(sigIgnoringEnding(arHeadForm(TEXT.applyVocal(k, r[2]), 'NOUN')));
};
for (const k of keys) {
  const f = freq.get(k) ?? 0;
  const rs = forms.get(k)!;
  const ls = [...new Set(rs.map((r) => r[0]))];
  for (const l of ls) shareCounts[l] += f / ls.length;
  if (!f) continue;
  const ip = idInfo.get(k);
  if (ip?.n !== undefined) continue; // a listed key is credited to its main lemma's group below
  const gs = new Set<number>();
  for (const r of rs) if (!isDerivedCell(k, r)) gs.add(groupOf[r[0]]);
  if (gs.size === 1) { addTo(groupCount, [...gs][0], f); continue; }
  if (gs.size === 0) continue;
  const lx = lexemesOn(k);
  if (lx.size > 1) { const w = decisive(lx); if (w) addTo(groupSecond, groupOf[lx.get(w)![0]], f); }
}
for (const [k, ip] of idInfo) if (ip.n !== undefined) { const f = freq.get(k) ?? 0; if (f) { addTo(groupCount, groupOf[ip.n], f); identityApplied++; } }
for (let l = 0; l < lemmaRows.length; l++) lemmaRows[l][4] = Math.round((groupCount.get(groupOf[l]) ?? 0) + SECOND_WEIGHT * (groupSecond.get(groupOf[l]) ?? 0));
const zeroCount = lemmaRows.filter((r) => r[4] === 0).length;
const senseClassOf = (l: number): string => /(^|\|)Sense=(\w+)/.exec(lemmaRows[l][3])?.[2] ?? '?';
const classTotals: Record<string, number> = { Rev: 0, One: 0, Lab: 0, Ord: 0 };
const classTop: Record<string, number> = { Rev: 0, One: 0, Lab: 0, Ord: 0 };
{
  const withRows = lemmaKeys.map((k) => k.length > 0);
  for (let l = 0; l < lemmaIds.length; l++) if (withRows[l]) classTotals[senseClassOf(l)] = (classTotals[senseClassOf(l)] ?? 0) + 1;
  const entOf = new Map<number, Ent>();
  for (const en of ents) if (!entOf.has(en.lemma)) entOf.set(en.lemma, en);
  const leads = [...leadOfLexeme.values()].filter((l) => ['NOUN', 'VERB', 'ADJ', 'ADV'].includes(lemmaRows[l][2]) && withRows[l]).sort((a, b) => lemmaRows[b][4] - lemmaRows[a][4] || (lemmaIds[a] < lemmaIds[b] ? -1 : 1)).slice(0, Number(opt['top-n'] ?? 2000)); // --top-n: a longer list for a review batch (the statistics of INDEX.md are of the default 2,000)
  for (const l of leads) classTop[senseClassOf(l)] = (classTop[senseClassOf(l)] ?? 0) + 1;
  {
    // how many lemma ids lose the class One because the source entry also has pointer senses (printed once per build)
    const changed = [...entOf.entries()].filter(([l, en]) => en.wasOne && withRows[l] && senseClassOf(l) !== 'Rev');
    const topSet = new Set(leads);
    const changedTop = changed.filter(([l]) => topSet.has(l));
    console.log(`sense class One -> not One (pointer senses set aside): ${changed.length} lemma ids over all, ${changedTop.length} among the ${leads.length} commonest lexemes`);
    for (const [l] of changed.sort((a, b) => lemmaRows[b[0]][4] - lemmaRows[a[0]][4]).slice(0, 15)) console.log(`  ${lemmaIds[l]}  count ${lemmaRows[l][4]}  class ${senseClassOf(l)}  "${lemmaRows[l][1]}"`);
  }
  if (opt['top-lexemes']) {
    const out = leads.map((l) => [lemmaIds[l], String(lemmaRows[l][4]), senseClassOf(l), lemmaRows[l][1], ...(entOf.get(l)?.senseLines ?? [])].join('\t'));
    fs.writeFileSync(opt['top-lexemes'], `id\tcount\tclass\tgloss\tsenses\n${out.join('\n')}\n`);
  }
}
if (opt['gloss-of-file']) {
  const oldGloss = new Map<string, string>();
  for (const en of ents) oldGloss.set(lemmaIds[en.lemma], en.glossOld);
  for (const h of fs.readFileSync(opt['gloss-of-file'], 'utf8').split(/\s+/).filter(Boolean)) {
    const hits = lemmaIds.map((id, l) => ({ id, l })).filter((x) => lemmaRows[x.l][0] === arHeadForm(h, 'NOUN') || lemmaRows[x.l][0] === arHeadForm(h, 'VERB'));
    for (const x of hits) console.log('gloss ' + x.id + ' :: ' + (oldGloss.get(x.id) ?? '') + ' => ' + lemmaRows[x.l][1] + '  [' + senseClassOf(x.l) + ']');
  }
}
if (opt['counts-of-file']) {
  const heads = fs.readFileSync(opt['counts-of-file'], 'utf8').split(/\s+/).filter(Boolean);
  for (const h of heads) {
    const hn = arHeadForm(h, 'NOUN');
    const hv = arHeadForm(h, 'VERB');
    const hits = lemmaIds.map((id, l) => ({ id, l })).filter((x) => lemmaRows[x.l][0] === hn || lemmaRows[x.l][0] === hv);
    console.log(`count ${h}: ${hits.map((x) => `${x.id}=${lemmaRows[x.l][4]}`).join(' ') || '(none)'}`);
  }
}
// share of running words by number of lemma ids of the key
const shareBy: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4+': 0 };
for (const [k, f] of freq) { const n = holders.get(k) ?? 0; shareBy[n >= 4 ? '4+' : String(n)] += f; }
console.log(`${fmt(keys.length)} keys, ${fmt(rowTotal)} rows, ${fmt(lemmaIds.length)} lemma ids (${fmt(lemmasWithRows)} with rows), ${fmt(codes.length)} distinct codes`);

// ───────────────────────────── probes ─────────────────────────────

const lineOf = (key: string, r: ArFormRow): string => `  ${TEXT.applyVocal(key, r[2])}  →  ${lemmaIds[r[0]]}  [${lemmaRows[r[0]][1]} ${lemmaRows[r[0]][3] || '-'} n=${lemmaRows[r[0]][4]}${lemmaRows[r[0]][5] ? ` root=${lemmaRows[r[0]][5]}` : ''}]  ${codes[r[1]]}`;
for (const w of PROBES) {
  const key = arKey(w);
  console.log(`probe ${w} (key ${key})`);
  for (const r of forms.get(key) ?? []) console.log(lineOf(key, r));
  if (!forms.has(key)) console.log('  (no reading)');
}

// ───────────────────────────── ambiguous keys (a scratch report for the lead) ─────────────────────────────

if (AMBIGUOUS_OUT) {
  const amb = [...freq].filter(([k]) => (holders.get(k) ?? 0) >= 2).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 1500);
  const lines = amb.map(([k, f]) => {
    const byLemma = new Map<number, string[]>();
    for (const r of forms.get(k)!) (byLemma.get(r[0]) ?? byLemma.set(r[0], []).get(r[0])!).push(codes[r[1]]);
    const parts = [...byLemma].map(([l, cs]) => `${lemmaIds[l]}\t${lemmaRows[l][2]}\t${lemmaRows[l][1].slice(0, 40)}\t${[...new Set(cs)].slice(0, 3).map((c) => c.slice(0, 60)).join(' ; ')}`);
    return `${k}\t${f}\t${parts.join('\t')}`;
  });
  fs.mkdirSync(path.dirname(AMBIGUOUS_OUT), { recursive: true });
  fs.writeFileSync(AMBIGUOUS_OUT, `${lines.join('\n')}\n`);
  console.log(`ambiguous report: ${lines.length} keys → ${AMBIGUOUS_OUT}`);
}

// ───────────────────────────── shards ─────────────────────────────

function buildIndex(id: string, shard: string | undefined, theKeys: string[], rowFilter?: (lemma: number, key: string) => boolean): ArabicFormIndex {
  const lcodes: string[] = [];
  const lcode = new Map<number, number>();
  const lids: string[] = [];
  const llemma = new Map<number, number>();
  const lemmas: Record<string, ArLemmaRow> = {};
  const out: Record<string, ArFormRow[]> = {};
  const loose: Record<string, string[]> = {};
  for (const k of theKeys) {
    const rows: ArFormRow[] = [];
    for (const r of forms.get(k)!) {
      if (rowFilter && !rowFilter(r[0], k)) continue;
      let li = llemma.get(r[0]);
      if (li === undefined) { li = lids.length; lids.push(lemmaIds[r[0]]); llemma.set(r[0], li); lemmas[lemmaIds[r[0]]] = lemmaRows[r[0]]; }
      let ci = lcode.get(r[1]);
      if (ci === undefined) { ci = lcodes.length; lcodes.push(codes[r[1]]); lcode.set(r[1], ci); }
      rows.push(r[2] === undefined ? [li, ci] : [li, ci, r[2]]);
    }
    if (!rows.length) continue;
    out[k] = rows;
    const lf = arLoose(k);
    if (lf !== k) (loose[lf] ??= []).push(k);
  }
  return { schema: 1, id, ...(shard !== undefined ? { shard } : {}), source: SOURCE, built: TODAY, codes: lcodes, lemmaIds: lids, lemmas, forms: out, loose };
}

interface ShardOut { prefix: string; file: string; plain: number; gz: number; keys: number; buf: Buffer }
const shardOuts: ShardOut[] = [];
const lettersOf = new Map<string, string>();
for (const k of keys) lettersOf.set(k, arShardLetters(k));
const fileOf = (prefix: string): string => `${prefix === '_' ? '_' : [...prefix].map((c) => (c.codePointAt(0) as number).toString(16)).join('-')}.json.gz`;

function emitShard(prefix: string, theKeys: string[]): void {
  const idx = buildIndex('kaikki-ar-tables', prefix, theKeys);
  const plain = JSON.stringify(idx);
  const buf = zlib.gzipSync(plain, { level: 9 });
  shardOuts.push({ prefix, file: fileOf(prefix), plain: Buffer.byteLength(plain), gz: buf.length, keys: Object.keys(idx.forms).length, buf });
}
function split(prefix: string, theKeys: string[], depth: number): void {
  const size = Buffer.byteLength(JSON.stringify(buildIndex('kaikki-ar-tables', prefix, theKeys)));
  if (size <= LIMIT || depth >= MAX_PREFIX) { emitShard(prefix, theKeys); return; }
  const own: string[] = [];
  const kids = new Map<string, string[]>();
  for (const k of theKeys) { const l = lettersOf.get(k)!; if (l.length <= depth) own.push(k); else { const p = l.slice(0, depth + 1); (kids.get(p) ?? kids.set(p, []).get(p)!).push(k); } }
  if (own.length) emitShard(prefix, own);
  for (const p of [...kids.keys()].sort()) split(p, kids.get(p)!, depth + 1);
}
{
  const noLetter: string[] = [];
  const first = new Map<string, string[]>();
  for (const k of keys) { const l = lettersOf.get(k)!; if (!l) noLetter.push(k); else (first.get(l[0]) ?? first.set(l[0], []).get(l[0])!).push(k); }
  if (noLetter.length) emitShard('_', noLetter);
  for (const p of [...first.keys()].sort()) split(p, first.get(p)!, 1);
}
shardOuts.sort((a, b) => (a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0));
const gzTotal = shardOuts.reduce((s, x) => s + x.gz, 0);
const plainTotal = shardOuts.reduce((s, x) => s + x.plain, 0);
const largest = shardOuts.reduce((m, x) => (x.plain > m.plain ? x : m), shardOuts[0]);
const largestGz = shardOuts.reduce((m, x) => (x.gz > m.gz ? x : m), shardOuts[0]);
console.log(`${shardOuts.length} shards, ${(gzTotal / 1e6).toFixed(2)} MB gzip (${(plainTotal / 1e6).toFixed(1)} MB plain); largest ${largest.prefix} ${(largest.plain / 1e6).toFixed(2)} MB plain; largest gzip ${largestGz.prefix} ${(largestGz.gz / 1e6).toFixed(2)} MB`);

// the merging experiment: rows of one (key, lemma) whose vowels differ only on the last letter and whose labels differ only in the case
// (an upper bound of what storing them once would save; a merged row could not say WHICH case, so nothing is merged unless size forces it)
let mergeable = 0;
let mergeableBytes = 0;
for (const k of keys) {
  const seen = new Set<string>();
  for (const r of forms.get(k)!) {
    const code = tagsOf(r[1]).filter((t) => !CASE_TAGS.has(t)).join('|');
    const v = r[2] ?? '';
    const sig = `${r[0]}\t${code}\t${v.slice(0, Math.max(0, k.length - 1))}`;
    if (seen.has(sig)) { mergeable++; mergeableBytes += JSON.stringify(r).length + 1; } else seen.add(sig);
  }
}
console.log(`merging experiment: ${fmt(mergeable)} rows (${fmt(mergeableBytes)} bytes of JSON) would be saved by storing one row per (key, lemma, labels without case, vowels without the last letter's)`);

// ───────────────────────────── core ─────────────────────────────

const eligible = new Uint8Array(lemmaIds.length);
for (const rows of forms.values()) for (const r of rows) eligible[r[0]] = 1;
const lemmaOrder: number[] = [];
for (let l = 0; l < lemmaIds.length; l++) if (eligible[l]) lemmaOrder.push(l);
const idCmp = (a: number, b: number): number => (lemmaIds[a] < lemmaIds[b] ? -1 : lemmaIds[a] > lemmaIds[b] ? 1 : 0);
const byShare = (a: number, b: number): number => shareCounts[b] - shareCounts[a] || idCmp(a, b);
// closed classes whose written form occurs in the frequency list (by any key), then the seed, then the open classes by count
const closed = lemmaOrder.filter((l) => CLOSED.has(lemmaRows[l][2]) && shareCounts[l] >= 1).sort(byShare);
// The core holds, of a chosen lemma, the rows under the keys that occur in ar_50k and under the lemma's own written form (--core-rows seen, default), or every row (all).
// A row is never made up: the frequency list only decides which of the source's rows the bootstrap core carries; the shards hold the rest.
const CORE_ROWS = opt['core-rows'] ?? 'seen';
const headKeyOf = (l: number): string => arKey(lemmaRows[l][0]);
const inCore = (l: number, k: string): boolean => CORE_ROWS === 'all' || freq.has(k) || k === headKeyOf(l);
// open classes by the ar_50k weight of their OWN keys per byte they would take in the core (a verb's hundred forms cost more than a noun's nine)
const estBytes = new Float64Array(lemmaIds.length);
for (const [k, rows] of forms) {
  const h = holders.get(k) ?? 1;
  for (const r of rows) if (inCore(r[0], k)) estBytes[r[0]] += 8 + (r[2]?.length ?? 0);
  for (const l of new Set(rows.map((r) => r[0]))) if (inCore(l, k)) estBytes[l] += (2 * k.length + 6) / h;
}
const density = (l: number): number => (lemmaRows[l][4] + 0.001 * shareCounts[l]) / Math.max(1, estBytes[l]);
const open = lemmaOrder.filter((l) => !CLOSED.has(lemmaRows[l][2]) && lemmaRows[l][4] >= 1).sort((a, b) => density(b) - density(a) || idCmp(a, b));
const SEED = ['\u0643\u064E\u062A\u064E\u0628\u064E', '\u0643\u0650\u062A\u064E\u0627\u0628']; // كَتَبَ, كِتَاب: the examples of the tests and of the documentation
const seedIds: number[] = [];
{
  const taken = new Set(closed);
  for (const s of SEED) for (const l of lemmaOrder) if (lemmaIds[l].startsWith(`${arHeadForm(s, lemmaRows[l][2])}|`) && !taken.has(l)) { taken.add(l); seedIds.push(l); }
}
const seeded = new Set(seedIds);
// ranking of the open classes: --core-rank own (the weight of a lemma's OWN keys per byte, as above) or marginal (default: the frequency of the keys
// it would ADD to the keys already covered, per byte: a verb whose forms are all shared with others still counts for what nobody else covers)
const CORE_RANK = opt['core-rank'] ?? 'marginal';
function marginalOrder(first: number[]): number[] {
  const covered = new Set<string>();
  for (const l of first) for (const k of lemmaKeys[l]) covered.add(k);
  const gain = (l: number): number => { let v = 0; for (const k of lemmaKeys[l]) if (!covered.has(k)) v += freq.get(k) ?? 0; return v; };
  const cands = lemmaOrder.filter((l) => !CLOSED.has(lemmaRows[l][2]) && !first.includes(l));
  const heap: Array<[number, number]> = []; // [density, lemma]
  const less = (a: [number, number], b: [number, number]): boolean => a[0] < b[0] || (a[0] === b[0] && idCmp(a[1], b[1]) > 0);
  const push = (x: [number, number]): void => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (less(heap[p], heap[i])) { [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } else break; } };
  const pop = (): [number, number] => { const top = heap[0]; const last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[m], heap[l])) m = l; if (r < heap.length && less(heap[m], heap[r])) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const l of cands) { const g = gain(l); if (g > 0) push([g / Math.max(1, estBytes[l]), l]); }
  const out: number[] = [];
  let bytes = 0;
  while (heap.length && bytes < CORE_BUDGET * 3) {
    const [d, l] = pop();
    const g = gain(l);
    const nd = g / Math.max(1, estBytes[l]);
    if (g <= 0) continue;
    if (nd < d - 1e-12) { push([nd, l]); continue; }
    out.push(l); bytes += estBytes[l];
    for (const k of lemmaKeys[l]) covered.add(k);
  }
  return out;
}
const ranked = CORE_RANK === 'own' ? [...closed, ...seedIds, ...open.filter((l) => !seeded.has(l))] : [...closed, ...seedIds, ...marginalOrder([...closed, ...seedIds])];
const fixedCount = closed.length + seedIds.length;

/** A key the core holds for only some of the lexemes the full index has for it is COMPLETED (the missing lexemes' rows added, when few) or listed in `partial`. */
const COMPLETE_ROWS = Number(opt['complete-rows'] ?? 8);
const COMPLETE_LEMMAS = Number(opt['complete-lemmas'] ?? 3);
function coreWith(n: number): ArabicFormIndex & { completed: number } {
  const chosen = new Set(ranked.slice(0, n));
  const theKeys = [...new Set(ranked.slice(0, n).flatMap((l) => lemmaKeys[l].filter((k) => inCore(l, k))))].sort();
  const extra = new Map<string, Set<number>>();
  const partial: string[] = [];
  let completed = 0;
  for (const k of theKeys) {
    const miss = new Map<number, number>();
    for (const r of forms.get(k)!) if (!(chosen.has(r[0]) && inCore(r[0], k))) miss.set(r[0], (miss.get(r[0]) ?? 0) + 1);
    if (!miss.size) continue;
    const add = new Set<number>();
    const main = mainByKey.get(k);
    // the reviewed identities list decides a key even when it stays partial: its main lemma always has its rows
    if (main !== undefined && miss.has(main)) { add.add(main); miss.delete(main); }
    if (miss.size) {
      const total = [...miss.values()].reduce((a, b) => a + b, 0);
      if (total <= COMPLETE_ROWS && miss.size <= COMPLETE_LEMMAS) { for (const l of miss.keys()) add.add(l); completed++; } else partial.push(k);
    } else if (add.size) completed++;
    if (add.size) extra.set(k, add);
  }
  const idx = buildIndex('ar-core', undefined, theKeys, (l, k) => (chosen.has(l) && inCore(l, k)) || !!extra.get(k)?.has(l));
  if (partial.length) idx.partial = partial.sort();
  idx.stats = { lemmas: 99999, closedLemmas: 99999, keys: 999999, rows: 999999, tokenCoverage: 0.9999, tokens: 99999999, seedLemmas: 9999, completedKeys: 99999, partialKeys: 99999, partialShare: 0.9999 };
  return Object.assign(idx, { completed });
}
const coreSize = (n: number): number => Buffer.byteLength(JSON.stringify(coreWith(n)));
function fitCore(budget: number): number {
  let lo = Math.min(fixedCount, ranked.length);
  let hi = ranked.length;
  if (coreSize(lo) > budget) console.warn(`warning: the closed classes plus the seed exceed a core budget of ${budget} bytes; they are kept`);
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (coreSize(mid) <= budget) lo = mid; else hi = mid - 1; }
  return lo;
}
const coverageOf = (c: ArabicFormIndex): number => { let covered = 0; for (const [k, n] of freq) if (c.forms[k]) covered += n; return Math.round((covered / freqTotal) * 10000) / 10000; };
const projections: string[] = [];
for (const b of [350_000, 500_000, 800_000]) { const n = fitCore(b); projections.push(`${fmt(b)} bytes: ${n} lemmas, tokenCoverage ${coverageOf(coreWith(n))}`); }
console.log(`core budget projections (nothing stored): ${projections.join('; ')}`);
const lo = fitCore(CORE_BUDGET);
const { completed: completedKeys, ...core } = coreWith(lo);
const tokenCoverage = coverageOf(core);
const partialSet = new Set(core.partial ?? []);
let partialMass = 0;
for (const [k, n] of freq) if (partialSet.has(k)) partialMass += n;
const partialShare = Math.round((partialMass / freqTotal) * 10000) / 10000;
stats.coreCompleted = completedKeys; stats.corePartial = partialSet.size; stats.corePartialShare = partialShare;
const coreRows = Object.values(core.forms).reduce((s, r) => s + r.length, 0);
core.stats = { lemmas: core.lemmaIds.length, closedLemmas: Math.min(closed.length, lo), seedLemmas: seedIds.length, keys: Object.keys(core.forms).length, rows: coreRows, tokenCoverage, tokens: freqTotal, completedKeys, partialKeys: partialSet.size, partialShare };
const coreJson = JSON.stringify(core);
const coreBytes = Buffer.byteLength(coreJson);
console.log(`core: ${core.lemmaIds.length} lemmas (${Math.min(closed.length, lo)} closed-class), ${core.stats.keys} keys, ${coreRows} rows, ${fmt(coreBytes)} bytes of JSON, tokenCoverage ${tokenCoverage} over ${fmt(freqTotal)} running words`);

// ───────────────────────────── output ─────────────────────────────

const codeUse = new Map<string, number>();
for (const rows of forms.values()) for (const r of rows) codeUse.set(codes[r[1]], (codeUse.get(codes[r[1]]) ?? 0) + 1);
const topCodes = [...codeUse].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
const tagCount = new Map<string, number>();
for (const [c, n] of codeUse) for (const t of c.split('|')) tagCount.set(t, (tagCount.get(t) ?? 0) + n);
const posLine = Object.entries(stats.byPos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(', ');
const skippedLine = Object.entries(stats.skippedKinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(', ');
const topUnresolved = [...unresolved].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
const lemmaByPos: Record<string, number> = {};
const rootByPos: Record<string, [number, number]> = {};
for (let l = 0; l < lemmaIds.length; l++) { const p = lemmaRows[l][2]; inc(lemmaByPos, p); (rootByPos[p] ??= [0, 0])[0]++; if (lemmaRows[l][5]) rootByPos[p][1]++; }
const lexCount: Record<string, number> = {};
for (const r of lemmaRows) for (const kv of r[3].split('|')) if (kv) inc(lexCount, kv);
const ruleLine = Object.entries(stats.ruleChanged).map(([k, v]) => `${k} ${fmt(v)}`).join(', ');
const s = stats.skip;
const doc = `# Arabic form index: build of ${TODAY}

Built by \`npm run ar:build-index\` (\`scripts/ar-build-index.mts\`) from \`${path.basename(INPUT)}\` (Wiktionary via kaikki.org, CC BY-SA 4.0; ${fmt(inStat.size)} bytes, modified ${inStat.mtime.toISOString()}, sha256 \`${sha256}\`)
with word frequencies from \`${path.basename(FREQ)}\` (hermitdave FrequencyWords, subtitle text, CC BY-SA 4.0: used for order only, never as evidence that a form exists). Every row is a
Wiktionary table row, a head-line form or a "form of" page; the tag bundles, vowels and roots are the source's, verbatim. Nothing was analysed here. Definite rows: \`--definite ${DEFINITE}\`.
Lemma string convention: \`arHeadForm\` of \`arabic/text.ts\`.

| measure | value |
|---|---|
| input lines | ${fmt(stats.lines)} |
| entries read (mapped parts of speech) | ${fmt(stats.entries)} (${posLine}) |
| kinds of entry skipped | ${skippedLine} |
| lemma entries / form pages (of which "ar-verb form" pages) / lemma entries that also hold form-of senses | ${fmt(stats.lemmaEntries)} / ${fmt(stats.formPages)} (${fmt(stats.vfPages)}) / ${fmt(stats.mixedEntries)} |
| pages that are only alternative spellings (alt-of) | ${fmt(stats.altOnlyEntries)} |
| participle entries (verb class in the extract, head "active / passive participle of X"; made ADJ with VerbForm=Part, Voice, Of=verb) / of those with Of | ${fmt(stats.participleEntries)} / ${fmt(stats.participleOf)} |
| lemma glosses changed by the clean-gloss rule (batch 6; counted before the reviewed choices) | ${fmt(stats.glossChanged)} |
| gloss trust class (Sense= in lex): Rev (a reviewed choice matched) / One (a single real sense) / Lab (the lead stands after labelled senses) / Ord (the source's order, unreviewed): over all lemma ids with rows / over the 2,000 highest-count lexemes (leads) | ${classTotals.Rev} / ${classTotals.One} / ${classTotals.Lab} / ${classTotals.Ord}; ${classTop.Rev} / ${classTop.One} / ${classTop.Lab} / ${classTop.Ord} |
| lexemes with homonym siblings (Homonyms=N on each id, Lead=Yes on the lead) / glosses that differ from the batch-6 choice because of the sense labels | ${fmt(stats.homonymLexemes)} / ${fmt(stats.glossLabelChanged)} |
| reviewed gloss choices (gloss-choices.json): lexemes that took one / lexemes where no sense matched (keeping the default) | ${fmt(stats.glossChoiceTaken)} / ${fmt(glossChoiceNone.length)}: ${glossChoiceNone.join(', ')} |
| lemma ids by part of speech | ${Object.entries(lemmaByPos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')} |
| lemma ids (with at least one row) | ${fmt(lemmaIds.length)} (${fmt(lemmasWithRows)}) |
| head + POS pairs with more than one entry (extra ids \`|2\`, \`|3\` … ordered by etymology number, then first gloss) | ${fmt(stats.homonymPairs)} (${fmt(stats.homonymExtra)} extra ids) |
| lemma ids merged because the head convention made two source spellings one | ${fmt(stats.mergedIds)} |
| heads changed by each rule of the convention (an entry can count under several) | ${ruleLine || 'none'} (heads changed in all: ${fmt(stats.headChanged)}, attributed by the marks that differ) |
| form keys | ${fmt(keys.length)} |
| readings (rows) | ${fmt(rowTotal)} |
| rows by origin: lemma table / form-page table / headword with no row under its form (canonical) / form-of page / verb-form page / head-line form | ${fmt(stats.rowsTable)} / ${fmt(stats.rowsPageTable)} / ${fmt(stats.rowsCitation)} / ${fmt(stats.rowsPage)} / ${fmt(stats.rowsVerbPage)} / ${fmt(stats.rowsHeadline)} |
| keys with more than one lemma id | ${fmt(multiLemmaKeys)} |
| distinct tag bundles (codes) | ${fmt(codes.length)} |
| definite rows (\`${DEFINITE}\`): article stripped from the key / without an article / dropped / shadda of an assimilated article cleared | ${fmt(stats.definiteStripped)} / ${fmt(stats.definiteNoArticle)} / ${fmt(s.definiteDropped)} / ${fmt(stats.shaddaCleared)} |
| entries with several head lines and as many tables, split into one lemma per head (extra lemmas gained) / entries with several canonical rows but one table, kept as one lexeme | ${fmt(stats.multiHeadEntries)} (${fmt(stats.extraHeads)}) / ${fmt(stats.multiCanonUnsplit)} |
| of those split with ONE table and several verb heads (the table goes to the head whose citation form is the table's own 3ms past) / such tables matching no head (go to the first) | ${fmt(stats.oneTableSplit)} / ${fmt(stats.oneTableUnmatched)} |
| uncontracted spellings of a doubled verb resolved to the contracted lemma (ضَادَدَ → ضَادَّ), uses | ${fmt(stats.aliasUncontracted)} |
| first-person rows whose gender label was removed / of those, merged into a row already there | ${fmt(stats.firstPersonGender)} / ${fmt(stats.firstPersonMerged)} |
| rows with no vowels (empty vocal) by origin | ${Object.entries(stats.unvocRows).map(([k, v]) => `${k} ${fmt(v)}`).join(', ') || 'none'} |
| verb-form lines whose vocalized form came from the canonical rows of the page / whose canonical row disagreed with the head-line text / vocalized form taken from the page's own single head line / readings listed as "##" sub-lines under an "inflection of" header | ${fmt(stats.vfFormFromRows)} / ${fmt(stats.vfRowDisagree)} / ${fmt(stats.vfFormFromHead)} / ${fmt(stats.vfSubLines)} |
| roots by source: template only / category only / template and category (of which different) / category with several roots (left out) | ${fmt(stats.rootTemplate - stats.rootBoth)} / ${fmt(stats.rootCategory)} / ${fmt(stats.rootBoth)} (${fmt(stats.rootDisagree)}) / ${fmt(stats.rootCategoryAmbiguous)} |
| verb cells for a participle or verbal noun: dropped because a lemma entry of its own has that form / kept under the verb | ${fmt(stats.participleDropped)} / ${fmt(stats.participleKept)} |
| rows left out: "-" cells / no letter / with a space / invalid characters / template error labels / empty label list / exact duplicates | ${fmt(s.dash)} / ${fmt(s.noLetter)} / ${fmt(s.space)} / ${fmt(s.invalidChars)} / ${fmt(s.errorTag)} / ${fmt(s.emptyTags)} / ${fmt(s.duplicate)} |
| lemma heads rejected as invalid (entry left out) / trimmed to a valid head / taken from the head-line text / unvocalized / canonical key differs from the page word / no canonical row, page word used | ${fmt(s.headRejected)} / ${fmt(stats.headTrimmed)} / ${fmt(stats.headFromExpansion)} / ${fmt(stats.headUnvocalized)} / ${fmt(stats.headKeyMismatch)} / ${fmt(stats.noCanonical)} |
| form-page rows not added because the lemma already has a row for the key and vowels / head-line forms not added for the same reason | ${fmt(s.pageBlockedByRow)} / ${fmt(s.headlineNotNew)} |
| form-of targets with no lemma entry / with several equally good ones (no row added) / resolved through the same POS, the nominal group, any POS | ${fmt(s.unresolvedTargets)} (${fmt(unresolved.size)} distinct) / ${fmt(s.ambiguousTargets)} / ${fmt(stats.resolvedByTier.samePos)}, ${fmt(stats.resolvedByTier.nominal)}, ${fmt(stats.resolvedByTier.any)} |
| verb-form lines that gave no vocalized form (page word used) / form-of senses with no target word / verb-form lines that did not parse / whose form is another key / pages without a form / form pages whose own table mixed senses | ${fmt(stats.vfBareLines)} / ${fmt(s.targetNoWord)} / ${fmt(s.vfLineUnparsed)} / ${fmt(s.vfLineMismatch)} / ${fmt(s.pageNoForm)} / ${fmt(s.pageTableMixed)} |
| Gender of nouns: from the canonical row's labels / from the head template | ${fmt(stats.genderTag)} / ${fmt(stats.genderHead)} |
| Decl: lemmas whose rows agree on one class / that mix classes (no Decl) | ${fmt(stats.declUniform)} / ${fmt(stats.declMixed)} |
| lex features on lemma ids | ${Object.entries(lexCount).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')} |
| Reg=Cla (every sense Classical, archaic or obsolete) / Reg=Msa (every sense Modern) — lemma entries | ${fmt(stats.regCla)} / ${fmt(stats.regMsa)} |
| roots (the ar-root / ar-rootbox template, else the root category of the senses; malformed templates ignored: ${stats.rootMalformed}) | ${Object.entries(rootByPos).sort((a, b) => b[1][0] - a[1][0]).map(([p, [n, r]]) => `${p} ${fmt(r)}/${fmt(n)} (${pct(r, n)})`).join(', ')} |
| shards | ${shardOuts.length} (prefixes of up to ${MAX_PREFIX} letters; limit ${fmt(LIMIT)} bytes of JSON) |
| shard bytes | ${(gzTotal / 1e6).toFixed(2)} MB gzip, ${(plainTotal / 1e6).toFixed(1)} MB plain |
| largest shard | \`${largest.prefix}\` ${(largest.plain / 1e6).toFixed(2)} MB plain, ${(largest.gz / 1e6).toFixed(2)} MB gzip (largest gzip: \`${largestGz.prefix}\` ${(largestGz.gz / 1e6).toFixed(2)} MB) |
| merging experiment (upper bound of rows storable once: same key, lemma, labels but case, vowels but the last letter's) | ${fmt(mergeable)} rows, ${fmt(mergeableBytes)} bytes of JSON |
| core rows | ${CORE_ROWS} (seen = a chosen lemma's rows under keys that occur in ar_50k and under its own written form; all = every row) |
| core keys: completed (the missing lexemes' rows added; at most ${COMPLETE_ROWS} rows and ${COMPLETE_LEMMAS} lexemes) / flagged \`partial\` (the full index has lexemes the core lacks) / share of ar_50k running words on flagged keys | ${fmt(completedKeys)} / ${fmt(partialSet.size)} / ${(partialShare * 100).toFixed(2)} % |
| closed-class clitic entries kept out of the word keys (tatweel at an edge, or one bare letter: بِـ, ـهَا, وَ, أَ …) | ${fmt(stats.cliticExcluded)}: ${cliticExamples.join(', ')} |
| lemma entries with no table at all / of those with a row under their written form (the source's canonical row, code \`canonical…\`) | ${fmt(stats.noTableLemmas)} / ${fmt(stats.noTableWithRow)} (without: ${fmt(stats.noTableLemmas - stats.noTableWithRow)}, of which multi-word heads ${fmt(stats.noTableSpace)}) |
| adjective lemmas with a feminine row (any origin) / of all adjective lemma ids; "feminine … of X" form pages of adjectives resolved (rows new, the rest already in the adjective's table) | ${fmt(stats.adjFemLemmas)} / ${fmt(stats.adjLemmas)}; ${fmt(stats.adjFemPages)} (${fmt(stats.adjFemPagesNew)} new) |
| core ranking | ${CORE_RANK} (own = weight of a lemma's own keys per byte; marginal = frequency of the keys it adds to those already covered, per byte) |
| core | ${core.lemmaIds.length} lemmas (${Math.min(closed.length, lo)} of closed classes, ${seedIds.length} seeded), ${core.stats.keys} keys, ${coreRows} rows, ${fmt(coreBytes)} bytes of JSON (budget ${fmt(CORE_BUDGET)}) |
| core token coverage on ar_50k (running words whose key is a core key) | ${(tokenCoverage * 100).toFixed(2)} % of ${fmt(freqTotal)} (clitic forms are not keys) |
| identity checks accepted through a numbered sibling of the main id / through the loose fold | ${fmt(prefStats.idCleanSibling)} / ${fmt(prefStats.idCleanLoose)} (counted apart from the clean ones above) |
| lexeme preferences (--identities): candidate loser/winner pairs / dropped as one lexeme (same head, same part-of-speech group) / dropped as both directions (b) / dropped as balanced (c) / closed-class loser to open winner dropped (d) | ${fmt(prefStats.candidates)} / ${fmt(prefStats.sameLexeme)} / ${fmt(prefStats.conflictPairs)} / ${fmt(prefStats.balancedRemoved)} / ${fmt(prefStats.closedDropped)} |
| reviewed preferences (preferences-reviewed.json) merged / derived pairs they overrode / pairs removed by its balanced list / lexemes not in the index (skipped); derived pairs before the merge | ${fmt(prefStats.revMerged)} / ${fmt(prefStats.revOverridden)} / ${fmt(prefStats.revBalancedRemoved)} / ${fmt(prefStats.revSkipped)}; ${fmt(prefStats.pairsDerived)} |
| preferences emitted: pairs / distinct losers / distinct winners | ${fmt(prefStats.pairs)} / ${fmt(prefStats.losers)} / ${fmt(prefStats.winners)} |
| lemma ids with count 0 (counts by lexeme group: own keys of the group, plus the weaker decided-key term, weight ${SECOND_WEIGHT}; before the group rule 22,516) | ${fmt(zeroCount)} of ${fmt(lemmaIds.length)} |
| identities file | ${IDENTITIES ? `${IDENTITIES}: ${fmt(identityApplied)} keys credited to their main lemma; checked clean ${fmt(stats.idClean)}, failed ${fmt(stats.idFail)} (${fmt(identityUnknown)} naming a lemma id not in the index)` : 'none given'} |

## Count (order of readings)

\`count\` = the summed ar_50k frequency of the keys that no other lemma id has a row for, plus the keys an identities file names the lemma for. Shared keys add nothing.
Share of ar_50k running words by the number of lemma ids their key has in this index: 0 ids ${pct(shareBy['0'], freqTotal)}, 1 id ${pct(shareBy['1'], freqTotal)}, 2 ids ${pct(shareBy['2'], freqTotal)}, 3 ids ${pct(shareBy['3'], freqTotal)}, 4 or more ${pct(shareBy['4+'], freqTotal)}
(the lead's audit measured 18.6 / 28.5 / 19.3 / 10.0 / 23.6 % on its own build). Closed classes are admitted to the core by the old share (frequency / holders) because their keys are often shared.

## Core budget projections (not stored)

${projections.map((p) => `- ${p}`).join('\n')}

## Register and period labels found on senses (counts of senses)

${Object.entries(registerTags).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')}

\`Reg=Cla\` needs every sense to carry Classical, archaic or obsolete; \`Reg=Msa\` every sense to carry Modern or modern. Other labels (dated, poetic, literary, rare, historical, pre-/post-Classical, dialect and country names) are not turned into a Reg value.

## Rejected forms (first 20)

${invalidExamples.map((x) => `- ${x}`).join('\n') || 'none'}

## Rejected heads (first 20; the extract also holds entries of the Arabic section written in Hebrew script (Judeo-Arabic) and a few English glosses)

${invalidHeadExamples.map((x) => `- ${x}`).join('\n') || 'none'}

## Unresolved form-of targets (top 50)

${topUnresolved.slice(0, 50).map(([w, n]) => `- ${w} (${n})`).join('\n')}

## The 40 commonest tag bundles

${topCodes.slice(0, 40).map(([c, n]) => `- \`${c}\` ${fmt(n)}`).join('\n')}

## Every tag that occurs in a bundle

${[...tagCount].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([t, n]) => `${t} ${fmt(n)}`).join(', ')}
`;

if (WRITE) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const o of shardOuts) fs.writeFileSync(path.join(OUT, o.file), o.buf);
  const manifest = {
    schema: 1 as const, id: 'kaikki-ar-tables', built: TODAY, source: SOURCE,
    shards: Object.fromEntries(shardOuts.map((o) => [o.prefix, { file: o.file, bytes: o.gz, keys: o.keys }])),
    stats: { shards: shardOuts.length, keys: keys.length, rows: rowTotal, lemmas: lemmasWithRows, plainBytes: plainTotal, bytes: gzTotal, largestPlainBytes: largest.plain },
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
  const header = `/* GENERATED by scripts/ar-build-index.mts on ${TODAY} — do not edit. The compact core of the Arabic form index: every lemma of the closed classes (pronouns, determiners, prepositions, conjunctions, particles, numerals) seen in the frequency list and then the commonest open-class lemmas, each with every form of its table, ${core.lemmaIds.length} lemmas, ${core.stats.keys} forms, ${coreRows} readings, ${fmt(coreBytes)} bytes of JSON, covering ${(tokenCoverage * 100).toFixed(1)} % of the running words of the ar_50k list. Full index: public/lexicon/ar/standard/ (npm run ar:build-index).
 * Sources: Wiktionary via kaikki.org (${SOURCE.licence}; extract modified ${SOURCE.lastModified}); word frequencies (order only) from hermitdave FrequencyWords ar_50k (CC BY-SA 4.0). */
import type { ArabicFormIndex } from '../index-store';

export const AR_CORE: ArabicFormIndex = `;
  fs.mkdirSync(path.dirname(CORE_OUT), { recursive: true });
  fs.writeFileSync(CORE_OUT, `${header}${coreJson};\n`);
  fs.mkdirSync(path.dirname(DOC_OUT), { recursive: true });
  fs.writeFileSync(DOC_OUT, doc);
  if (IDENTITIES) {
    const prefOut = opt['preferences-out'] ?? 'src/adapters/arabic/generated/preferences.ts';
    const obj: Record<string, string[]> = {};
    for (const lo of [...finalPrefs.keys()].sort()) obj[lo] = [...finalPrefs.get(lo)!].sort();
    const body = `/* GENERATED by scripts/ar-build-index.mts on ${TODAY} from ${path.basename(IDENTITIES)} — do not edit. Lexeme preferences: a lexeme ("<vocalized head>|<POS>") that loses to others wherever the reviewed identities list decided a key it shares with them. ${prefStats.pairs} pairs, ${prefStats.losers} losers, ${prefStats.winners} winners. */
export const AR_PREFERRED: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(obj)};
`;
    fs.mkdirSync(path.dirname(prefOut), { recursive: true });
    fs.writeFileSync(prefOut, body);
    const slim: Record<string, string[]> = {};
    for (const lo of Object.keys(obj)) if ((lexKeyCount.get(lo) ?? 0) >= 5) slim[lo] = obj[lo];
    console.log(`preferences: ${prefStats.pairs} pairs, ${prefStats.losers} losers, ${prefStats.winners} winners, ${fmt(Buffer.byteLength(body))} bytes; only losers with at least 5 keys: ${Object.keys(slim).length} losers, ${fmt(Buffer.byteLength(JSON.stringify(slim)) + 140)} bytes`);
  }
}
console.log(`reg: Cla ${stats.regCla}, Msa ${stats.regMsa}; participles dropped ${stats.participleDropped}, kept ${stats.participleKept}; merged ids ${stats.mergedIds}; rules ${ruleLine}`);
console.log(`definite (${DEFINITE}): stripped ${stats.definiteStripped}; rows: table ${fmt(stats.rowsTable)}, page table ${fmt(stats.rowsPageTable)}, citation ${fmt(stats.rowsCitation)}, page ${fmt(stats.rowsPage)}, verb page ${fmt(stats.rowsVerbPage)}, headline ${fmt(stats.rowsHeadline)}`);
console.log(`skipped: ${JSON.stringify(s)}; kinds: ${skippedLine}`);
console.log(`share by lemma-id count: ${JSON.stringify(Object.fromEntries(Object.entries(shareBy).map(([k, v]) => [k, pct(v, freqTotal)])))}`);
console.log(`wall time ${((Date.now() - started) / 1000).toFixed(1)} s${WRITE ? '' : ' (nothing written)'}`);
