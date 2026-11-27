/// <reference types="node" />
/**
 * npm run ar:eval  (npx vite-node --config scripts/vite.config.ts scripts/ar-eval.mts -- [options])
 *
 *   --set regression|msa|msa-vocalized|all     which fixture to measure (default all)
 *   --index core|full|mini                     core = the compiled ar-core only; full = core + every shard of public/lexicon/ar/standard
 *                                              (gzip files read with node:zlib); mini = test/adapters/arabic-mini-index.json (default: full when the shards exist)
 *   --analyzer auto|adapter|sentence|word      which entry point to measure (default auto: src/adapters/ar.ts, then arabic/sentence.ts,
 *                                              then arWordCandidates of arabic/analyze.ts, per token)
 *   --fail-dir <dir>                           where failures-<set>.tsv are written (default: the pack builder's scratchpad folder)
 *   --json <file>                              the aggregate figures as JSON
 *   --quran <path> [--limit N|all]             LOCAL measurement against the Quranic Arabic Corpus morphology file (see below)
 *
 * What it measures, per set (docs/arabic/EVAL.md says what each set is and is not): scored tokens; STRICT lemma accuracy of the first
 * reading (the vocalized lemma equal through arHeadForm); the lemma BY LETTERS (arKey equal); POS; the UNDECIDED share (first reading's
 * confidence < 0.5: no lexeme is credited); the CONFIDENT-AND-WRONG share (confidence >= 0.5 and the lemma wrong: the number that
 * matters most); whether the right reading is anywhere in the list; unknown words; clitic-breakdown accuracy where `parts` is annotated.
 * Every failure is listed (id/sentence, surface, expected, the top three readings with confidences) in failures-<set>.tsv.
 *
 * The Quran mode reads the corpus file ONLY to measure, on this machine. Its words are never copied into a fixture, an index, a
 * document or the product: only aggregate figures leave this script. It is not shipped (docs/arabic/PLAN.md "Sources"). The file's
 * fields are read as they are (Arabic script); a file in Buckwalter transliteration is converted with the standard table below.
 *
 * The pure pieces (fixture readers, scoring rules, the regression-case check, the Buckwalter table) are exported so
 * test/adapters/arabic-gold.test.ts uses the very same rules. The run itself starts unless a test runner (VITEST) is importing this file.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { AnalysisCandidate, RawToken } from '../src/core';
import { installArabicIndex, resetArabicIndexes, type ArabicFormIndex } from '../src/adapters/arabic/index-store';
import { arHeadForm, arKey, arLoose, arTokenize } from '../src/adapters/arabic/text';

// ───────────────────────────── fixtures ─────────────────────────────

export const FIXTURE_DIR = 'test/fixtures/arabic';
const DEFAULT_FAIL_DIR = 'C:/Users/CJWal/AppData/Local/Temp/claude/16496b2148bd3e06/b7d74d10-ce54-4f1b-936e-77b04081f1f1/scratchpad/ar-f';

export interface PartSpec { text: string; role: 'prefix' | 'stem' | 'suffix' }
export interface Expect {
  lemma: string | null;
  pos?: string;
  posAlt?: string[];
  features?: Record<string, string>;
  parts?: PartSpec[];
  root?: string;
  undecided?: boolean;
  alsoReadings?: string[];
  notParts?: boolean;
  notLemma?: string;
  restored?: string;
  notArabic?: boolean;
  dialect?: boolean;
  oneReading?: boolean;
  notes?: Record<string, string>;
}
export interface RegressionCase { id: string; source: 'owner' | 'builder'; text: string; target: string; expect: Expect; note: string }
export interface GoldToken { surface: string; lemma: string | null; pos: string; skip?: boolean; parts?: string[] }
export interface GoldSentence { id: string; of?: string; text: string; tokens: GoldToken[] }

export const UPOS = new Set(['NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'ADP', 'CONJ', 'CCONJ', 'SCONJ', 'PART', 'PRON', 'DET', 'NUM', 'INTJ', 'X', 'SYM', 'PUNCT']);
export const FEATURE_KEYS = new Set(['Aspect', 'Mood', 'Voice', 'Person', 'Gender', 'Number', 'Case', 'Definite', 'Form', 'VerbForm', 'PluralType', 'Decl', 'Pausal']);

const readJson = <T,>(file: string): T => JSON.parse(fs.readFileSync(path.resolve(FIXTURE_DIR, file), 'utf8')) as T;
export const loadRegression = (): RegressionCase[] => readJson<{ cases: RegressionCase[] }>('regression.json').cases;
export const loadMsa = (vocalized = false): GoldSentence[] => readJson<{ sentences: GoldSentence[] }>(vocalized ? 'msa-dev-vocalized.json' : 'msa-dev.json').sentences;

// ───────────────────────────── comparison rules ─────────────────────────────

/** Two vocalized lemmas are the same lexeme when they agree through arHeadForm (one spelling convention) under the same part of speech. */
export function lemmaSame(a: string | undefined, b: string | undefined, pos: string): boolean {
  if (!a || !b) return false;
  return arHeadForm(a, pos).normalize('NFC') === arHeadForm(b, pos).normalize('NFC');
}
/** The same letters (vowels ignored). */
export const lemmaLetters = (a: string | undefined, b: string | undefined): boolean => !!a && !!b && arKey(a) === arKey(b);

const CONJ = new Set(['CONJ', 'CCONJ', 'SCONJ']);
/** Parts of speech that mean the same thing for this pack: the index says CONJ / PART where UD says CCONJ / SCONJ, and AUX is a VERB. */
export function posMatch(gold: string, got: string | undefined, lenient = false): boolean {
  if (!got) return false;
  if (gold === got) return true;
  if (CONJ.has(gold) && (CONJ.has(got) || got === 'PART')) return true;
  if (gold === 'PART' && CONJ.has(got)) return true;
  if ((gold === 'VERB' && got === 'AUX') || (gold === 'AUX' && got === 'VERB')) return true;
  if (lenient && ((gold === 'NOUN' && got === 'ADJ') || (gold === 'ADJ' && got === 'NOUN'))) return true;
  return false;
}

const asSet = (v: string): string => [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))].sort().join(',');
/** Expected features as SUBSETS of the reading's; a comma-union ("2,3") is compared as a set. Returns what differs. */
export function featureProblems(actual: Record<string, string> | undefined, expected: Record<string, string> | undefined): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(expected ?? {})) {
    const a = actual?.[k];
    if (a === undefined) out.push(`${k}: expected ${v}, absent`);
    else if (asSet(a) !== asSet(v)) out.push(`${k}: expected ${v}, got ${a}`);
  }
  return out;
}

const firstVariety = (c: AnalysisCandidate | undefined): string => String(c?.notes?.variety ?? '');
export const topConfidence = (cands: AnalysisCandidate[]): number => cands[0]?.confidence ?? 0;

/** Letters of a root as written by a source ("ك ت ب", "أله"): spaces removed, hamza seats folded. */
export const rootLetters = (r: unknown): string => arLoose(arKey(String(r ?? '').replace(/\s+/g, '')));

const shortParts = (c: AnalysisCandidate | undefined): string => (c?.parts ?? []).map((p) => `${arKey(p.text)}/${p.kind ?? '?'}`).join('+');

/**
 * Judges one regression case against the readings of its target word. Returns the list of problems ([] = the case holds).
 * A decided case needs the first reading's lemma (strict) and a confidence of at least 0.5; an undecided one needs a first
 * confidence below 0.5 and every `alsoReadings` lemma among the readings. Features are subsets; unions compare as sets.
 */
export function checkCase(c: RegressionCase, cands: AnalysisCandidate[]): string[] {
  const e = c.expect;
  const top = cands[0];
  const bad: string[] = [];
  const confident = (x: AnalysisCandidate): boolean => x.confidence >= 0.5;
  if (e.notArabic) {
    const sure = cands.filter(confident);
    if (sure.length) bad.push(`read as Arabic with confidence: ${sure.slice(0, 2).map((x) => `${x.lemma ?? '?'} ${x.confidence}`).join(', ')}`);
    return bad;
  }
  if (e.dialect) {
    if (cands.some(confident)) bad.push(`dialect word read as Standard with confidence ${topConfidence(cands)}`);
    if (!cands.some((x) => firstVariety(x) === 'dialect?')) bad.push('no reading is flagged notes.variety = dialect?');
    return bad;
  }
  if (!top) { bad.push('no reading at all'); return bad; }
  const pos = e.pos ?? top.pos ?? 'NOUN';
  if (e.undecided) {
    if (top.confidence >= 0.5) bad.push(`credited ${top.lemma ?? '?'} (${top.confidence}) where nothing decides`);
  } else if (e.lemma) {
    if (!lemmaSame(top.lemma, e.lemma, pos)) bad.push(`lemma: expected ${e.lemma}, got ${top.lemma ?? 'none'}`);
    if (top.confidence < 0.5) bad.push(`undecided (confidence ${top.confidence}) where the form decides`);
  }
  if (e.pos && !e.undecided) {
    const ok = [e.pos, ...(e.posAlt ?? [])].some((p) => posMatch(p, top.pos));
    if (!ok) bad.push(`pos: expected ${[e.pos, ...(e.posAlt ?? [])].join('/')}, got ${top.pos ?? 'none'}`);
  }
  if (e.features && !e.undecided) bad.push(...featureProblems(top.morph, e.features));
  if (e.oneReading && e.lemma) {
    const n = cands.filter((x) => lemmaSame(x.lemma, e.lemma ?? undefined, 'VERB') && (e.features?.Aspect ? x.morph?.Aspect === e.features.Aspect : true)).length;
    if (n !== 1) bad.push(`expected ONE reading of ${e.lemma}, got ${n}`);
  }
  if (e.parts && !e.undecided) {
    const got = (top.parts ?? []).map((p) => `${arKey(p.text)}/${p.kind ?? '?'}`).join('+');
    const want = e.parts.map((p) => `${arKey(p.text)}/${p.role}`).join('+');
    if (got !== want) bad.push(`parts: expected ${want}, got ${got || 'none'}`);
  }
  if (e.notParts && (top.parts?.length ?? 0) > 1) bad.push(`cut into parts (${shortParts(top)}) where the word is whole`);
  if (e.root && !e.undecided) {
    const got = top.notes?.root;
    if (got === undefined) bad.push(`root: expected ${e.root}, absent`);
    else if (rootLetters(got) !== rootLetters(e.root)) bad.push(`root: expected ${e.root}, got ${String(got)}`);
  }
  for (const [k, v] of Object.entries(e.notes ?? {})) {
    if (String(top.notes?.[k]) !== v) bad.push(`notes.${k}: expected ${v}, got ${String(top.notes?.[k])}`);
  }
  for (const l of e.alsoReadings ?? []) {
    if (!cands.some((x) => lemmaSame(x.lemma, l, x.pos ?? 'NOUN'))) bad.push(`reading ${l} is not in the list`);
  }
  if (e.notLemma && lemmaSame(top.lemma, e.notLemma, top.pos ?? 'VERB')) bad.push(`credited ${e.notLemma}`);
  if (e.restored) {
    const r = cands.find((x) => lemmaSame(x.lemma, e.restored, x.pos ?? 'NOUN'));
    if (!r) bad.push(`restored reading ${e.restored} is not in the list`);
    else if (String(r.notes?.spelling) !== 'restored') bad.push(`reading ${e.restored} is not flagged notes.spelling = restored`);
  }
  return bad;
}

/** Index of the word token a regression case is about: the first whose key equals the target's. */
export function targetIndex(tokens: RawToken[], target: string): number {
  const k = arKey(target);
  return tokens.findIndex((t) => t.isWord && arKey(t.surface) === k);
}

// ───────────────────────────── the Quranic corpus (local measurement only) ─────────────────────────────

/** The standard Buckwalter table (Latin letters to Arabic), for a corpus file written in transliteration. */
export const BUCKWALTER: Record<string, string> = {
  "'": '\u0621', '|': '\u0622', '>': '\u0623', '&': '\u0624', '<': '\u0625', '}': '\u0626', A: '\u0627', b: '\u0628', p: '\u0629', t: '\u062A', v: '\u062B', j: '\u062C', H: '\u062D', x: '\u062E', d: '\u062F', '*': '\u0630',
  r: '\u0631', z: '\u0632', s: '\u0633', $: '\u0634', S: '\u0635', D: '\u0636', T: '\u0637', Z: '\u0638', E: '\u0639', g: '\u063A', _: '\u0640', f: '\u0641', q: '\u0642', k: '\u0643', l: '\u0644', m: '\u0645', n: '\u0646',
  h: '\u0647', w: '\u0648', Y: '\u0649', y: '\u064A', F: '\u064B', N: '\u064C', K: '\u064D', a: '\u064E', u: '\u064F', i: '\u0650', '~': '\u0651', o: '\u0652', '`': '\u0670', '{': '\u0671',
};
export const fromBuckwalter = (s: string): string => [...s].map((ch) => BUCKWALTER[ch] ?? ch).join('');
const isLatin = (s: string): boolean => /[A-Za-z]/.test(s);

export interface QuranWord { ref: string; form: string; lemma: string; root: string }
/** Reads the corpus file into one record per word (its stem segment's lemma and root); words with no stem segment are left out. */
export function readQuran(file: string): Map<string, QuranWord[]> {
  const verses = new Map<string, QuranWord[]>();
  const words = new Map<string, { form: string; lemma: string; root: string }>();
  const order: string[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const cols = line.split('\t');
    if (cols.length < 4 || !/^\d+:\d+:\d+:\d+$/.test(cols[0])) continue;
    const [c, v, w] = cols[0].split(':');
    const key = `${c}:${v}:${w}`;
    let form = cols[1];
    if (isLatin(form)) form = fromBuckwalter(form);
    let rec = words.get(key);
    if (!rec) { rec = { form: '', lemma: '', root: '' }; words.set(key, rec); order.push(key); }
    rec.form += form;
    const feats = cols[3].split('|');
    if (feats.includes('PREF') || feats.includes('SUFF')) continue;
    for (const f of feats) {
      if (f.startsWith('LEM:') && !rec.lemma) rec.lemma = isLatin(f.slice(4)) ? fromBuckwalter(f.slice(4)) : f.slice(4);
      if (f.startsWith('ROOT:') && !rec.root) rec.root = isLatin(f.slice(5)) ? fromBuckwalter(f.slice(5)) : f.slice(5);
    }
  }
  for (const key of order) {
    const [c, v] = key.split(':');
    const vk = `${c}:${v}`;
    const r = words.get(key)!;
    const list = verses.get(vk) ?? [];
    list.push({ ref: key, form: r.form, lemma: r.lemma, root: r.root });
    verses.set(vk, list);
  }
  return verses;
}

// ───────────────────────────── loading the analyser and the index ─────────────────────────────

export type SentenceAnalyse = (tokens: RawToken[]) => Promise<Array<{ token: RawToken; candidates: AnalysisCandidate[] }>>;
type WordFn = (t: RawToken) => AnalysisCandidate[] | Promise<AnalysisCandidate[]>;
type SentenceFn = (ts: RawToken[]) => Array<{ token: RawToken; candidates: AnalysisCandidate[] }> | Promise<Array<{ token: RawToken; candidates: AnalysisCandidate[] }>>;

// The specifier is built at run time and is an absolute path (the runner resolves a relative one against the wrong folder), so this
// file loads while the analyser modules are still being written.
async function importModule(spec: string): Promise<Record<string, unknown>> { return (await import(/* @vite-ignore */ spec)) as Record<string, unknown>; }
const abs = (p: string): string => path.resolve(p).split(path.sep).join('/');
const exists = (p: string): boolean => fs.existsSync(path.resolve(p));
export const importArabic = (name: string): Promise<Record<string, unknown>> => importModule(abs(`src/adapters/arabic/${name}.ts`));

/** The first analyser that exists: the adapter, the sentence analyser, the per-word analyser; undefined when none. */
export async function loadArabicAnalyser(mode = 'auto'): Promise<{ name: string; kind: 'adapter' | 'arAnalyze' | 'arWordCandidates per token'; run: SentenceAnalyse } | undefined> {
  const wrapWord = (f: WordFn): SentenceAnalyse => async (ts) => Promise.all(ts.map(async (t) => ({ token: t, candidates: t.isWord ? await f(t) : [] })));
  if ((mode === 'auto' || mode === 'adapter') && exists('src/adapters/ar.ts')) {
    const m = await importModule(abs('src/adapters/ar.ts'));
    const ad = (m.arAdapter ?? m.default ?? Object.values(m).find((v) => v && typeof (v as { analyze?: unknown }).analyze === 'function')) as { analyze?: (ts: RawToken[]) => unknown } | undefined;
    if (ad && typeof ad.analyze === 'function') {
      const f = ad.analyze.bind(ad);
      return { kind: 'adapter', name: 'adapter ar (src/adapters/ar.ts analyze, sentence-level)', run: async (ts) => (await f(ts)) as Array<{ token: RawToken; candidates: AnalysisCandidate[] }> };
    }
  }
  if ((mode === 'auto' || mode === 'sentence') && exists('src/adapters/arabic/sentence.ts')) {
    const m = await importArabic('sentence');
    if (typeof m.arAnalyze === 'function') { const f = m.arAnalyze as SentenceFn; return { kind: 'arAnalyze', name: 'arAnalyze (sentence, ordered by context)', run: async (ts) => f(ts) }; }
  }
  if ((mode === 'auto' || mode === 'word' || mode === 'sentence' || mode === 'adapter') && exists('src/adapters/arabic/analyze.ts')) {
    const m = await importArabic('analyze');
    if (typeof m.arWordCandidates === 'function') return { kind: 'arWordCandidates per token', name: 'arWordCandidates (context-free, per token)', run: wrapWord(m.arWordCandidates as WordFn) };
  }
  return undefined;
}

export const NO_ANALYSER_MESSAGE = 'no Arabic analyser to measure: neither src/adapters/ar.ts (arAdapter), src/adapters/arabic/sentence.ts (arAnalyze) nor src/adapters/arabic/analyze.ts (arWordCandidates) exists or exports its function yet. The fixtures are in test/fixtures/arabic; build the analyser first.';

/** Installs the index: the compiled core, plus (full) every shard on disk or (mini) the fixture index. Returns a description. */
export async function installIndex(kind: 'core' | 'full' | 'mini'): Promise<string> {
  resetArabicIndexes();
  let note = '';
  if (kind === 'mini') {
    const mini = JSON.parse(fs.readFileSync(path.resolve('test/adapters/arabic-mini-index.json'), 'utf8')) as ArabicFormIndex;
    installArabicIndex(mini);
    return `mini fixture index test/adapters/arabic-mini-index.json (${Object.keys(mini.forms).length.toLocaleString('en')} form keys, ${Object.keys(mini.lemmas).length} lemmas): a test fixture, not the product index`;
  }
  if (exists('src/adapters/arabic/generated/core.ts')) {
    const core = (await importArabic('generated/core')).AR_CORE as ArabicFormIndex | undefined;
    if (core) { installArabicIndex(core); note = `ar-core (${Object.keys(core.forms).length.toLocaleString('en')} form keys, ${Object.keys(core.lemmas).length.toLocaleString('en')} lemmas)`; }
  }
  if (!note) note = 'no core installed';
  if (kind === 'full') {
    const base = 'public/lexicon/ar/standard';
    const man = path.resolve(base, 'manifest.json');
    if (!fs.existsSync(man)) throw new Error(`--index full needs ${base}/manifest.json (npm run ar:build-index)`);
    const manifest = JSON.parse(fs.readFileSync(man, 'utf8')) as { built: string; shards: Record<string, { file: string }> };
    let n = 0;
    for (const s of Object.values(manifest.shards)) {
      const idx = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.resolve(base, s.file))).toString('utf8')) as ArabicFormIndex;
      installArabicIndex(idx);
      n++;
    }
    note += ` + ${n.toLocaleString('en')} shards from ${base} (built ${manifest.built}), all installed`;
  }
  return kind === 'full' ? `full: ${note}` : `core only: ${note}`;
}

// ───────────────────────────── scoring ─────────────────────────────

export class Tally {
  tokens = 0; strict = 0; letters = 0; pos = 0; posLenient = 0; undecided = 0; confidentWrong = 0; confidentWrongLetters = 0; anywhere = 0; anywhereLetters = 0;
  unknown = 0; partsTotal = 0; partsRight = 0; cutTotal = 0; cutSpurious = 0;
}
export interface Failure { set: string; id: string; surface: string; kind: string; expected: string; got: string }

const fmtCands = (cands: AnalysisCandidate[]): string => cands.slice(0, 3).map((c) => `${c.lemma ?? '-'}|${c.pos ?? '-'}|${c.confidence}`).join('; ') || '(no reading)';

/** Scores one gold token against its reading list (the rules of the header comment). */
export function scoreToken(t: Tally, g: GoldToken, cands: AnalysisCandidate[], set: string, id: string, fails: Failure[]): void {
  if (g.skip || !g.lemma) return;
  t.tokens++;
  const top = cands[0];
  const expected = `${g.lemma}|${g.pos}${g.parts ? ' [' + g.parts.join('+') + ']' : ''}`;
  const known = cands.filter((c) => !c.unconfirmed);
  if (!top || !known.length) { t.unknown++; fails.push({ set, id, surface: g.surface, kind: 'unknown', expected, got: fmtCands(cands) }); return; }
  const strict = lemmaSame(top.lemma, g.lemma, g.pos);
  const letters = lemmaLetters(top.lemma, g.lemma);
  if (strict) t.strict++;
  if (letters) t.letters++;
  if (posMatch(g.pos, top.pos)) t.pos++;
  if (posMatch(g.pos, top.pos, true)) t.posLenient++;
  const undecided = top.confidence < 0.5;
  if (undecided) t.undecided++;
  if (!undecided && !strict) t.confidentWrong++;
  if (!undecided && !letters) t.confidentWrongLetters++;
  if (cands.some((c) => lemmaSame(c.lemma, g.lemma ?? undefined, g.pos))) t.anywhere++;
  if (cands.some((c) => lemmaLetters(c.lemma, g.lemma ?? undefined))) t.anywhereLetters++;
  if (g.parts) {
    t.partsTotal++;
    const got = (top.parts ?? []).map((p) => arKey(p.text)).join('|');
    if (got === g.parts.map((p) => arKey(p)).join('|')) t.partsRight++;
    else fails.push({ set, id, surface: g.surface, kind: 'parts', expected: g.parts.join('|'), got: `${got || '(none)'}  <- ${fmtCands(cands)}` });
  } else {
    t.cutTotal++;
    if ((top.parts?.length ?? 0) > 1) { t.cutSpurious++; fails.push({ set, id, surface: g.surface, kind: 'spurious-cut', expected: 'whole word', got: shortParts(top) }); }
  }
  if (!strict) fails.push({ set, id, surface: g.surface, kind: undecided ? 'undecided' : 'confident-wrong', expected, got: fmtCands(cands) });
}

const pct = (n: number, d: number): string => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');

export function describeTally(t: Tally): Record<string, string> {
  return {
    tokens: String(t.tokens),
    'lemma strict @1': pct(t.strict, t.tokens),
    'lemma by letters @1': pct(t.letters, t.tokens),
    'POS @1': pct(t.pos, t.tokens),
    'POS @1 (noun~adj)': pct(t.posLenient, t.tokens),
    'undecided (conf < 0.5)': pct(t.undecided, t.tokens),
    'CONFIDENT-AND-WRONG (strict)': pct(t.confidentWrong, t.tokens),
    'confident-and-wrong (by letters)': pct(t.confidentWrongLetters, t.tokens),
    'right reading anywhere (strict)': pct(t.anywhere, t.tokens),
    'right reading anywhere (letters)': pct(t.anywhereLetters, t.tokens),
    'unknown words': pct(t.unknown, t.tokens + 0),
    'clitic breakdown right': `${pct(t.partsRight, t.partsTotal)} of ${t.partsTotal}`,
    'spurious cuts on whole words': `${pct(t.cutSpurious, t.cutTotal)} of ${t.cutTotal}`,
  };
}

function writeFailures(dir: string, set: string, fails: Failure[]): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `failures-${set}.tsv`);
  const rows = ['set\tid\tsurface\tkind\texpected\tgot (top 3: lemma|pos|confidence)', ...fails.map((f) => [f.set, f.id, f.surface, f.kind, f.expected, f.got].join('\t'))];
  fs.writeFileSync(file, rows.join('\n') + '\n', 'utf8');
  return file;
}

// ───────────────────────────── the sets ─────────────────────────────

interface SetResult { set: string; figures: Record<string, string>; extra?: Record<string, string>; failuresFile: string; failures: number }

async function runGoldSentences(set: string, sentences: GoldSentence[], analyse: SentenceAnalyse, failDir: string): Promise<SetResult> {
  const t = new Tally();
  const fails: Failure[] = [];
  let misaligned = 0;
  for (const s of sentences) {
    const toks = arTokenize(s.text);
    const words = toks.filter((x) => x.isWord);
    if (words.length !== s.tokens.length) { misaligned += s.tokens.length; fails.push({ set, id: s.id, surface: s.text, kind: 'misaligned', expected: `${s.tokens.length} words`, got: `${words.length} words` }); continue; }
    const out = await analyse(toks);
    const byToken = new Map(out.map((o) => [o.token, o.candidates] as const));
    words.forEach((w, i) => {
      const cands = byToken.get(w) ?? out.find((o) => o.token.start === w.start)?.candidates ?? [];
      scoreToken(t, s.tokens[i], cands, set, s.id, fails);
    });
  }
  const figures = describeTally(t);
  const skipped = sentences.reduce((n, s) => n + s.tokens.filter((x) => x.skip || !x.lemma).length, 0);
  const extra: Record<string, string> = { sentences: String(sentences.length), 'tokens not scored (skip)': String(skipped) };
  if (misaligned) extra['tokens in misaligned sentences'] = String(misaligned);
  return { set, figures, extra, failuresFile: writeFailures(failDir, set, fails), failures: fails.length };
}

/** Judges every regression case; returns id -> problems ([] = holds). Used by the test, the ratchet and --write-open. */
export async function judgeRegression(analyse: SentenceAnalyse): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const cache = new Map<string, Array<{ token: RawToken; candidates: AnalysisCandidate[] }>>();
  for (const c of loadRegression()) {
    const toks = arTokenize(c.text);
    let res = cache.get(c.text);
    if (!res) { res = await analyse(toks); cache.set(c.text, res); }
    const i = targetIndex(toks, c.target);
    const cands = i >= 0 ? res.find((o) => o.token === toks[i] || o.token.start === toks[i].start)?.candidates ?? [] : [];
    const p = i >= 0 ? checkCase(c, cands) : ['target not found in the text'];
    out.set(c.id, p.length ? [`${p.join(' ; ')}  <- ${fmtCands(cands)}`] : []);
  }
  return out;
}

export const OPEN_FAILURES_FILE = 'test/fixtures/arabic/open-failures.json';
export interface OpenFailures { _about: string; analyser: string; index: string; date: string; cases: Record<string, string> }

async function runRegression(analyse: SentenceAnalyse, failDir: string): Promise<SetResult> {
  const cases = loadRegression();
  const t = new Tally();
  const fails: Failure[] = [];
  let pass = 0;
  const bySource: Record<string, [number, number]> = {};
  const cache = new Map<string, Array<{ token: RawToken; candidates: AnalysisCandidate[] }>>();
  for (const c of cases) {
    const toks = arTokenize(c.text);
    let out = cache.get(c.text);
    if (!out) { out = await analyse(toks); cache.set(c.text, out); }
    const i = targetIndex(toks, c.target);
    const cands = i >= 0 ? out.find((o) => o.token === toks[i] || o.token.start === toks[i].start)?.candidates ?? [] : [];
    const problems = i >= 0 ? checkCase(c, cands) : ['target not found in the text'];
    (bySource[c.source] ??= [0, 0])[1]++;
    if (!problems.length) { pass++; bySource[c.source][0]++; }
    else fails.push({ set: 'regression', id: c.id, surface: c.target, kind: 'case', expected: c.note, got: `${problems.join(' ; ')}  <- ${fmtCands(cands)}` });
    // the generic figures: decided cases with a lemma
    if (i >= 0 && c.expect.lemma && !c.expect.undecided) {
      const g: GoldToken = { surface: c.target, lemma: c.expect.lemma, pos: c.expect.pos ?? 'NOUN', ...(c.expect.parts ? { parts: c.expect.parts.map((p) => p.text) } : {}) };
      scoreToken(t, g, cands, 'regression', c.id, []);
    }
  }
  const figures = describeTally(t);
  const extra: Record<string, string> = {
    'cases passed': `${pass} of ${cases.length}`,
    ...Object.fromEntries(Object.entries(bySource).map(([k, [p, n]]) => [`  of which ${k}`, `${p} of ${n}`])),
    'figures above': 'over the decided cases that name a lemma',
  };
  return { set: 'regression', figures, extra, failuresFile: writeFailures(failDir, 'regression', fails), failures: fails.length };
}

async function runQuran(file: string, limit: number, analyse: SentenceAnalyse): Promise<Record<string, string>> {
  const verses = readQuran(file);
  let words = 0, misaligned = 0, lemmaLet = 0, rootOk = 0, rootN = 0, undecided = 0, cw = 0, any = 0, unknown = 0, verseN = 0;
  for (const [, ws] of verses) {
    if (verseN >= limit) break;
    const text = ws.map((w) => w.form).join(' ');
    const toks = arTokenize(text);
    const tw = toks.filter((x) => x.isWord);
    if (tw.length !== ws.length) { misaligned++; continue; }
    verseN++;
    const out = await analyse(toks);
    tw.forEach((w, i) => {
      const g = ws[i];
      if (!g.lemma) return;
      words++;
      const cands = out.find((o) => o.token === w || o.token.start === w.start)?.candidates ?? [];
      const top = cands[0];
      if (!top || cands.every((c) => c.unconfirmed)) { unknown++; return; }
      const letters = lemmaLetters(top.lemma, g.lemma);
      if (letters) lemmaLet++;
      const und = top.confidence < 0.5;
      if (und) undecided++;
      if (!und && !letters) cw++;
      if (cands.some((c) => lemmaLetters(c.lemma, g.lemma))) any++;
      if (g.root) { rootN++; if (rootLetters(top.notes?.root) === rootLetters(g.root)) rootOk++; }
    });
  }
  return {
    'verses read': String(verseN), 'verses skipped (word count differs)': String(misaligned), 'words scored': String(words),
    'lemma by letters @1': pct(lemmaLet, words), 'undecided (conf < 0.5)': pct(undecided, words),
    'confident-and-wrong (by letters)': pct(cw, words), 'right reading anywhere (letters)': pct(any, words),
    'unknown words': pct(unknown, words), 'root equal to the corpus root': `${pct(rootOk, rootN)} of ${rootN} words with a root`,
  };
}

// ───────────────────────────── the run ─────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const opt: Record<string, string> = {};
  const rest = argv.filter((a) => a !== '--');
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { opt[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : ''; }
  return opt;
}

async function main(): Promise<void> {
  const opt = parseArgs(process.argv.slice(2));
  const set = opt.set ?? 'all';
  if ('write-open' in opt) {
    const a = await loadArabicAnalyser('auto');
    if (!a) { console.error(NO_ANALYSER_MESSAGE); process.exit(2); }
    if (!exists('public/lexicon/ar/standard/manifest.json')) throw new Error('--write-open needs the shards in public/lexicon/ar/standard (the test records one configuration: core + full shards)');
    await installIndex('full');
    const judged = await judgeRegression(a.run);
    const file = path.resolve(OPEN_FAILURES_FILE);
    const old = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as OpenFailures) : undefined;
    const cases: Record<string, string> = {};
    for (const [id, p] of judged) if (p.length) cases[id] = p[0].replace(/s+/g, ' ').slice(0, 400);
    const added = Object.keys(cases).filter((k) => !old?.cases[k]), removed = Object.keys(old?.cases ?? {}).filter((k) => !cases[k]);
    const rec: OpenFailures = { _about: old?._about ?? 'Regression cases that fail with the recorded analyser and index. A RATCHET: a case not listed must pass; a listed case must still fail, so a fix forces the entry to be removed. Re-record with --write-open after an analyser change. Cases are never deleted or weakened.', analyser: a.kind, index: 'full', date: new Date().toISOString().slice(0, 10), cases };
    fs.writeFileSync(file, JSON.stringify(rec, null, 1).normalize('NFC') + '\n');
    console.log(`analyser: ${a.kind}; open failures: ${Object.keys(cases).length} of ${judged.size}`);
    console.log('added: ' + (added.join(' ') || '(none)'));
    console.log('removed: ' + (removed.join(' ') || '(none)'));
    return;
  }
  const sets = set === 'all' ? ['regression', 'msa', 'msa-vocalized'] : set.split(',');
  for (const s of sets) if (!['regression', 'msa', 'msa-vocalized'].includes(s)) throw new Error(`unknown --set ${s}; choose regression, msa, msa-vocalized or all`);
  const analyser = await loadArabicAnalyser(opt.analyzer ?? 'auto');
  if (!analyser) { console.error(NO_ANALYSER_MESSAGE); process.exit(2); }
  const kind = (opt.index ?? (exists('public/lexicon/ar/standard/manifest.json') ? 'full' : 'core')) as 'core' | 'full' | 'mini';
  if (!['core', 'full', 'mini'].includes(kind)) throw new Error('--index is core, full or mini');
  const t0 = Date.now();
  const indexNote = await installIndex(kind);
  const failDir = opt['fail-dir'] ?? DEFAULT_FAIL_DIR;
  console.log(`analyser: ${analyser.name}`);
  console.log(`index: ${indexNote}`);
  const results: SetResult[] = [];
  for (const s of sets) {
    const r = s === 'regression' ? await runRegression(analyser.run, failDir) : await runGoldSentences(s, loadMsa(s === 'msa-vocalized'), analyser.run, failDir);
    results.push(r);
    console.log(`\n== ${s} ==`);
    for (const [k, v] of Object.entries({ ...(r.extra ?? {}), ...r.figures })) console.log(`  ${k.padEnd(36)} ${v}`);
    console.log(`  failures: ${r.failures} -> ${r.failuresFile}`);
  }
  let quran: Record<string, string> | undefined;
  if (opt.quran) {
    const limit = opt.limit === 'all' ? Infinity : opt.limit ? Number(opt.limit) : 1000;
    quran = await runQuran(opt.quran, limit, analyser.run);
    console.log('\n== quran (LOCAL measurement only, fully vocalized classical text: the easy case; nothing is copied or shipped) ==');
    for (const [k, v] of Object.entries(quran)) console.log(`  ${k.padEnd(36)} ${v}`);
  }
  console.log(`\nwall time ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (opt.json) fs.writeFileSync(opt.json, JSON.stringify({ analyser: analyser.name, index: indexNote, results, quran }, null, 1));
}

// vite-node hides the script path, so the run starts unless a test runner (vitest sets VITEST) is only importing the helpers
if (!process.env.VITEST) main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
