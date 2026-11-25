/// <reference types="node" />
/**
 * npm run ru:eval -- [--treebank gsd-test|gsd-dev|taiga-test|taiga-dev|pud|all] [--index core|full] [--analyzer sentence|word|auto]
 *                    [--limit N] [--out docs/russian/EVAL.md] [--json file] [--misses N] [--module path] [--max-shards N]
 *
 * Measures the Russian analyser against Universal Dependencies treebanks that people annotated by hand (data/raw/ud-ru, CC BY-SA). The
 * treebanks are used ONLY to measure: nothing from them is copied into the product. For every sentence the `# text` line is tokenized with
 * `ruTokenize`, our word tokens are aligned to the gold tokens by character offsets, and the aligned gold tokens that are words (not
 * punctuation, symbols, foreign text or numbers written in digits) are scored on: a reading at all, lemma, part of speech, features.
 * The analyser's FIRST confirmed reading is the one judged for "@1"; "@any" asks whether any confirmed reading is right.
 *
 * The pure pieces (CoNLL-U reader, alignment, scoring rules) are exported so test/adapters/russian-gold.test.ts can check them on tiny
 * hand-made inputs. The run itself starts unless a test runner is importing this file.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisCandidate, RawToken } from '../src/core';
import { installRussianIndex, resetRussianIndexes, type RussianFormIndex } from '../src/adapters/russian/index-store';
import { createRussianShardLoader, type RussianShardLoader } from '../src/adapters/russian/shards';
import { ruKey, ruTokenize, yoFold, CYRILLIC_LETTER } from '../src/adapters/russian/text';
import { RU_ANALYZER } from '../src/adapters/russian/version';

// ───────────────────────────── CoNLL-U ─────────────────────────────

export interface GoldWord {
  kind: 'word';
  id: string;
  form: string;
  lemma: string;
  upos: string;
  feats: Record<string, string>;
  /** false when the MISC column says SpaceAfter=No. */
  spaceAfter: boolean;
  /** part of a multiword token (its range line stands for it in the text): never scored. */
  inRange: boolean;
  /** Character offsets in `# text`; -1 when the form could not be found there. */
  start: number;
  end: number;
}
export interface GoldRange { kind: 'range'; id: string; form: string; spaceAfter: boolean; start: number; end: number }
export type GoldLine = GoldWord | GoldRange;

export interface GoldSentence {
  treebank: string;
  id: string;
  text: string;
  lines: GoldLine[];
  /** empty nodes (ids like 8.1) skipped */
  emptyNodes: number;
}

function parseFeats(col: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (col === '_' || col === '') return out;
  for (const part of col.split('|')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

/** Reads CoNLL-U text into sentences (offsets are filled by `alignGold`). Ranges (1-2) and empty nodes (1.1) are kept apart, never scored. */
export function parseConllu(src: string, treebank: string): GoldSentence[] {
  const out: GoldSentence[] = [];
  let cur: GoldSentence | undefined;
  let rangeEnd = 0;
  const flush = (): void => { if (cur && cur.text) out.push(cur); cur = undefined; };
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') { flush(); continue; }
    cur ??= { treebank, id: '', text: '', lines: [], emptyNodes: 0 };
    if (line.startsWith('#')) {
      const m = /^#\s*(sent_id|text)\s*=\s*(.*)$/.exec(line);
      if (m) { if (m[1] === 'sent_id') cur.id = m[2].trim(); else cur.text = m[2]; }
      continue;
    }
    const c = line.split('\t');
    if (c.length < 10) continue;
    const spaceAfter = !/(^|\|)SpaceAfter=No(\||$)/.test(c[9]);
    if (/^\d+\.\d+$/.test(c[0])) { cur.emptyNodes++; continue; }
    const range = /^(\d+)-(\d+)$/.exec(c[0]);
    if (range) {
      rangeEnd = Number(range[2]);
      cur.lines.push({ kind: 'range', id: c[0], form: c[1], spaceAfter, start: -1, end: -1 });
      continue;
    }
    const n = Number(c[0]);
    const inRange = n <= rangeEnd;
    if (!inRange) rangeEnd = 0;
    cur.lines.push({ kind: 'word', id: c[0], form: c[1], lemma: c[2], upos: c[3], feats: parseFeats(c[5]), spaceAfter, inRange, start: -1, end: -1 });
  }
  flush();
  return out;
}

export interface AlignInfo {
  /** a gold form that is not in the text at all (the annotators normalised it) */
  notFound: number;
  /** a gold form found only after skipping characters the CoNLL-U spacing did not explain */
  drift: number;
}

/**
 * Gives each gold token its character offsets in the sentence text, by walking the text: a token starts where the previous one ended,
 * plus the white space the previous token's MISC column allows (no white space after SpaceAfter=No). The members of a multiword token
 * are skipped; the range line itself is placed. Where the form is not at the expected place the next occurrence is taken (counted as
 * `drift`); a form that never occurs is left at -1 (counted as `notFound`).
 */
export function alignGold(s: GoldSentence): AlignInfo {
  const info: AlignInfo = { notFound: 0, drift: 0 };
  const text = s.text;
  let cursor = 0;
  let skipWhite = true; // leading white space before the first token
  for (const l of s.lines) {
    if (l.kind === 'word' && l.inRange) continue;
    let at = cursor;
    if (skipWhite) while (at < text.length && /\s/u.test(text[at])) at++;
    if (!text.startsWith(l.form, at)) {
      const idx = text.indexOf(l.form, cursor);
      if (idx < 0) { l.start = -1; l.end = -1; info.notFound++; continue; }
      at = idx;
      info.drift++;
    }
    l.start = at;
    l.end = at + l.form.length;
    cursor = l.end;
    skipWhite = l.spaceAfter;
  }
  return info;
}

// ───────────────────────────── which gold tokens are scored ─────────────────────────────

export type Exclusion = 'upos' | 'digits' | 'no-cyrillic';

/** Why a gold word is not scored (null: it is scored). PUNCT, SYM and X carry no word to read; a NUM in digits has none either; text with no Cyrillic letter is not Russian. */
export function exclusionOf(w: Pick<GoldWord, 'form' | 'upos'>): Exclusion | null {
  if (w.upos === 'PUNCT' || w.upos === 'SYM' || w.upos === 'X') return 'upos';
  if (w.upos === 'NUM' && /\d/.test(w.form)) return 'digits';
  if (!CYRILLIC_LETTER.test(w.form)) return 'no-cyrillic';
  return null;
}

export type AlignCause = 'we-split' | 'we-merged' | 'partial-overlap' | 'no-token' | 'gold-not-in-text';

/** How a gold token meets our word tokens: the one with the same span, or the reason there is none. */
export function matchTokens(g: { start: number; end: number }, ours: readonly RawToken[]): { token: RawToken } | { cause: AlignCause } {
  if (g.start < 0) return { cause: 'gold-not-in-text' };
  const exact = ours.filter((t) => t.start === g.start && t.end === g.end);
  if (exact.length === 1) return { token: exact[0] };
  const over = ours.filter((t) => t.start < g.end && t.end > g.start);
  if (over.length === 0) return { cause: 'no-token' };
  if (over.length > 1 && over.every((t) => t.start >= g.start && t.end <= g.end)) return { cause: 'we-split' };
  if (over.some((t) => t.start <= g.start && t.end >= g.end)) return { cause: 'we-merged' };
  return { cause: 'partial-overlap' };
}

// ───────────────────────────── scoring rules ─────────────────────────────

/** Lemma: strict needs the same letters (ё must match); lenient reads ё as е on both sides. UD lemmas are lower case; ours go through ruKey too. */
export const lemmaEqual = (ours: string | undefined, gold: string, strict: boolean): boolean => {
  if (ours === undefined || ours === '') return false;
  const a = ruKey(ours), b = ruKey(gold);
  return strict ? a === b : yoFold(a) === yoFold(b);
};

/** Our part of speech, with AUX counted as VERB (the pack has no AUX class). */
const oursUpos = (p: string | undefined): string => (p === 'AUX' ? 'VERB' : p ?? '');

/** The parts of speech of ours that count as right for a gold UPOS. Lenient also takes SCONJ as CONJ and DET as PRON (Wiktionary files мой, этот, весь under several headings). */
export function uposAccepted(gold: string, strict: boolean): string[] {
  if (gold === 'AUX') return ['VERB'];
  if (gold === 'CCONJ') return ['CONJ'];
  if (!strict && gold === 'SCONJ') return ['SCONJ', 'CONJ'];
  if (!strict && gold === 'DET') return ['DET', 'PRON'];
  return [gold];
}
export const uposMatch = (ours: string | undefined, gold: string, strict: boolean): boolean => uposAccepted(gold, strict).includes(oursUpos(ours));

export const FEATURE_KEYS = ['Case', 'Number', 'Gender', 'Animacy', 'Person', 'Tense', 'Mood', 'VerbForm', 'Voice', 'Aspect', 'Degree', 'Variant'] as const;
/** The values the pack's feature convention has for each key; a gold value outside it (Voice=Mid, Number=Ptan …) is not comparable and is left out. */
const VOCAB: Record<string, ReadonlySet<string>> = {
  Case: new Set(['Nom', 'Gen', 'Dat', 'Acc', 'Ins', 'Prep', 'Loc', 'Par', 'Voc']),
  Number: new Set(['Sing', 'Plur']),
  Gender: new Set(['Masc', 'Fem', 'Neut']),
  Animacy: new Set(['Anim', 'Inan']),
  Person: new Set(['1', '2', '3']),
  Tense: new Set(['Pres', 'Past', 'Fut']),
  Mood: new Set(['Ind', 'Imp']),
  VerbForm: new Set(['Fin', 'Inf', 'Part', 'Conv']),
  Voice: new Set(['Act', 'Pass']),
  Aspect: new Set(['Imp', 'Perf']),
  Degree: new Set(['Cmp', 'Sup']), // gold Degree=Pos is the unmarked case: the pack writes nothing for it
  Variant: new Set(['Short']),
};

/** The values of ours that count as right for one gold value: UD's Loc is our Prep or Loc, UD's Par is our Par or Gen. */
export function featureAccepted(key: string, goldValue: string): string[] {
  if (key === 'Case' && goldValue === 'Loc') return ['Prep', 'Loc'];
  if (key === 'Case' && goldValue === 'Par') return ['Par', 'Gen'];
  return [goldValue];
}

export interface FeatureTarget { key: string; gold: string; accept: string[] }
/** The gold features that can be compared: the listed keys whose every value (UD allows a list "Masc,Fem") is in the pack's vocabulary. */
export function featureTargets(feats: Record<string, string>): FeatureTarget[] {
  const out: FeatureTarget[] = [];
  for (const key of FEATURE_KEYS) {
    const v = feats[key];
    if (v === undefined) continue;
    const parts = v.split(',');
    if (!parts.every((p) => VOCAB[key].has(p))) continue;
    out.push({ key, gold: v, accept: parts.flatMap((p) => featureAccepted(key, p)) });
  }
  return out;
}

export interface FeatureResult { key: string; gold: string; ours: string | undefined; /** ours defines the key */ defined: boolean; /** lenient: not an error */ okLenient: boolean; /** strict: defined, a single value, right */ okStrict: boolean }
/**
 * Compares one reading's features with the gold's. Lenient: our value may be a union ("Acc,Nom") that contains the gold value, and a key
 * our reading lacks is not an error. Strict: our reading has the key, with ONE value, and it is the gold's.
 */
export function compareFeatures(gold: Record<string, string>, morph: Record<string, string>): FeatureResult[] {
  return featureTargets(gold).map((t) => {
    const ours = morph[t.key];
    const defined = ours !== undefined && ours !== '';
    const vals = defined ? ours.split(',') : [];
    return {
      key: t.key,
      gold: t.gold,
      ours: defined ? ours : undefined,
      defined,
      okLenient: !defined || vals.some((v) => t.accept.includes(v)),
      okStrict: defined && vals.length === 1 && t.accept.includes(vals[0]),
    };
  });
}

export interface TokenScore {
  covered: boolean;
  /** number of confirmed readings */
  readings: number;
  /** more than one lemma among the confirmed readings */
  multiLemma: boolean;
  firstLemma?: string;
  firstPos?: string;
  lemma1: boolean; lemmaAny: boolean; lemma1Strict: boolean; lemmaAnyStrict: boolean;
  pos1: boolean; posAny: boolean; pos1Strict: boolean; posAnyStrict: boolean;
  /** gold has at least one comparable feature (and there is a reading to compare) */
  featComparable: boolean;
  feat1Lenient: boolean; feat1Strict: boolean;
  features: FeatureResult[];
}

/** Scores one gold word against the readings the analyser gave (all of them; the unconfirmed ones are set aside). */
export function scoreToken(gold: Pick<GoldWord, 'lemma' | 'upos' | 'feats'>, candidates: readonly AnalysisCandidate[]): TokenScore {
  const confirmed = candidates.filter((c) => !c.unconfirmed);
  const first = confirmed[0];
  const anyOf = (f: (c: AnalysisCandidate) => boolean): boolean => confirmed.some(f);
  const features = first ? compareFeatures(gold.feats, first.morph ?? {}) : [];
  return {
    covered: confirmed.length > 0,
    readings: confirmed.length,
    multiLemma: new Set(confirmed.map((c) => (c.lemma === undefined ? '' : yoFold(ruKey(c.lemma))))).size > 1,
    firstLemma: first?.lemma,
    firstPos: first ? oursUpos(first.pos) : undefined,
    lemma1: !!first && lemmaEqual(first.lemma, gold.lemma, false),
    lemmaAny: anyOf((c) => lemmaEqual(c.lemma, gold.lemma, false)),
    lemma1Strict: !!first && lemmaEqual(first.lemma, gold.lemma, true),
    lemmaAnyStrict: anyOf((c) => lemmaEqual(c.lemma, gold.lemma, true)),
    pos1: !!first && uposMatch(first.pos, gold.upos, false),
    posAny: anyOf((c) => uposMatch(c.pos, gold.upos, false)),
    pos1Strict: !!first && uposMatch(first.pos, gold.upos, true),
    posAnyStrict: anyOf((c) => uposMatch(c.pos, gold.upos, true)),
    featComparable: !!first && features.length > 0,
    feat1Lenient: features.every((f) => f.okLenient),
    feat1Strict: features.length > 0 && features.every((f) => f.okStrict),
    features,
  };
}

// ───────────────────────────── tallies ─────────────────────────────

interface FeatTally { gold: number; defined: number; okLenient: number; okStrict: number }

export class Tally {
  n = 0; covered = 0;
  lemma1 = 0; lemmaAny = 0; lemma1Strict = 0; lemmaAnyStrict = 0;
  pos1 = 0; posAny = 0; pos1Strict = 0; posAnyStrict = 0;
  featTokens = 0; feat1Lenient = 0; feat1Strict = 0;
  readings = 0; multiLemma = 0;
  perFeature: Record<string, FeatTally> = {};
  add(s: TokenScore): void {
    this.n++;
    if (s.covered) { this.covered++; this.readings += s.readings; if (s.multiLemma) this.multiLemma++; }
    if (s.lemma1) this.lemma1++;
    if (s.lemmaAny) this.lemmaAny++;
    if (s.lemma1Strict) this.lemma1Strict++;
    if (s.lemmaAnyStrict) this.lemmaAnyStrict++;
    if (s.pos1) this.pos1++;
    if (s.posAny) this.posAny++;
    if (s.pos1Strict) this.pos1Strict++;
    if (s.posAnyStrict) this.posAnyStrict++;
    if (s.featComparable) {
      this.featTokens++;
      if (s.feat1Lenient) this.feat1Lenient++;
      if (s.feat1Strict) this.feat1Strict++;
      for (const f of s.features) {
        const t = (this.perFeature[f.key] ??= { gold: 0, defined: 0, okLenient: 0, okStrict: 0 });
        t.gold++;
        if (f.defined) t.defined++;
        if (f.defined && f.okLenient) t.okLenient++;
        if (f.okStrict) t.okStrict++;
      }
    }
  }
}

const pct = (a: number, b: number): string => (b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(1)}%`);
const num = (n: number): string => n.toLocaleString('en-US');

// ───────────────────────────── miss lists ─────────────────────────────

export class Counter {
  private m = new Map<string, { n: number; ex: string; note: string }>();
  add(key: string, example: string, note = ''): void {
    const e = this.m.get(key);
    if (e) e.n++; else this.m.set(key, { n: 1, ex: example, note });
  }
  top(k: number): Array<{ key: string; n: number; ex: string; note: string }> {
    return [...this.m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1)).slice(0, k);
  }
  get size(): number { return this.m.size; }
}

// ───────────────────────────── analyser plumbing ─────────────────────────────

export interface AnalysedLike { token: RawToken; candidates: AnalysisCandidate[] }
export type SentenceAnalyser = (tokens: RawToken[]) => Promise<AnalysedLike[]>;
type WordFn = (t: RawToken) => AnalysisCandidate[] | Promise<AnalysisCandidate[]>;
type SentenceFn = (ts: RawToken[]) => AnalysedLike[] | Promise<AnalysedLike[]>;

const have = (name: string): boolean => fs.existsSync(path.resolve('src/adapters/russian', `${name}.ts`));
// The specifier is built at run time so that this file loads while the analyser modules are still being written, and it is an
// absolute path because a relative one is resolved against the wrong folder by the runner.
async function importModule(spec: string): Promise<Record<string, unknown>> { return (await import(/* @vite-ignore */ spec)) as Record<string, unknown>; }
/** Imports a module of src/adapters/russian by name ("sentence", "generated/core"). */
export const importRussian = (name: string): Promise<Record<string, unknown>> => importModule(path.resolve('src/adapters/russian', name + '.ts').split(path.sep).join('/'));

export async function loadAnalyser(mode: string, modulePath?: string): Promise<{ name: string; run: SentenceAnalyser }> {
  const fromModule = modulePath ? await importModule(modulePath) : undefined;
  let sentence: SentenceFn | undefined;
  let word: WordFn | undefined;
  if (fromModule) {
    if (typeof fromModule.ruAnalyze === 'function') sentence = fromModule.ruAnalyze as SentenceFn;
    if (typeof fromModule.ruWordCandidates === 'function') word = fromModule.ruWordCandidates as WordFn;
  } else {
    if ((mode === 'sentence' || mode === 'auto') && have('sentence')) {
      const m = await importRussian('sentence');
      if (typeof m.ruAnalyze === 'function') sentence = m.ruAnalyze as SentenceFn;
    }
    if (!sentence && (mode === 'word' || mode === 'auto') && have('analyze')) {
      const m = await importRussian('analyze');
      if (typeof m.ruWordCandidates === 'function') word = m.ruWordCandidates as WordFn;
    }
  }
  if (mode === 'word' && word) return { name: 'ruWordCandidates (context-free, per token)', run: async (ts) => Promise.all(ts.map(async (t) => ({ token: t, candidates: t.isWord ? await word(t) : [] }))) };
  if (mode !== 'word' && sentence) { const f = sentence; return { name: 'ruAnalyze (sentence, ordered by context)', run: async (ts) => f(ts) }; }
  if (word) return { name: 'ruWordCandidates (context-free, per token)', run: async (ts) => Promise.all(ts.map(async (t) => ({ token: t, candidates: t.isWord ? await word(t) : [] }))) };
  throw new Error(`no Russian analyser to measure (analyzer=${mode}): neither src/adapters/russian/sentence.ts (ruAnalyze) nor src/adapters/russian/analyze.ts (ruWordCandidates) exists or exports its function. Build them first, or pass --module <file>.`);
}

/** A shard source that reads files from disk (paths are relative to the working directory). */
export const diskShardSource = {
  fetchJson: async (p: string): Promise<unknown> => JSON.parse(fs.readFileSync(p, 'utf8')) as unknown,
  fetchBytes: async (p: string): Promise<Uint8Array> => new Uint8Array(fs.readFileSync(p)),
};

// ───────────────────────────── the run ─────────────────────────────

const TREEBANKS: Record<string, { file: string; label: string; licence: string; annotation: string }> = {
  'gsd-test': { file: 'ru_gsd-ud-test.conllu', label: 'UD Russian-GSD, test', licence: 'CC BY-SA 4.0', annotation: 'GSD' },
  'gsd-dev': { file: 'ru_gsd-ud-dev.conllu', label: 'UD Russian-GSD, dev', licence: 'CC BY-SA 4.0', annotation: 'GSD' },
  'taiga-test': { file: 'ru_taiga-ud-test.conllu', label: 'UD Russian-Taiga, test', licence: 'CC BY-SA 4.0', annotation: 'Taiga' },
  'taiga-dev': { file: 'ru_taiga-ud-dev.conllu', label: 'UD Russian-Taiga, dev', licence: 'CC BY-SA 4.0', annotation: 'Taiga' },
  pud: { file: 'ru_pud-ud-test.conllu', label: 'UD Russian-PUD, test', licence: 'CC BY-SA 3.0', annotation: 'PUD' },
};
const UD_DIR = 'data/raw/ud-ru';

interface Args { treebank: string; index: string; analyzer: string; limit: number; out: string; json?: string; misses: number; module?: string; maxShards: number }

function parseArgs(argv: string[]): Args {
  const opt: Record<string, string> = {};
  const rest = argv.filter((a) => a !== '--');
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { opt[rest[i].slice(2)] = rest[i + 1] ?? ''; i++; }
  const manifest = fs.existsSync('public/lexicon/ru/standard/manifest.json');
  return {
    treebank: opt.treebank ?? 'all',
    index: opt.index ?? (manifest ? 'full' : 'core'),
    analyzer: opt.analyzer ?? 'auto',
    limit: opt.limit ? Number(opt.limit) : Infinity,
    out: opt.out ?? 'docs/russian/EVAL.md',
    json: opt.json,
    misses: opt.misses ? Number(opt.misses) : 60,
    module: opt.module,
    maxShards: opt['max-shards'] ? Number(opt['max-shards']) : 1000, // the whole index is about 55 MB of JSON: keep every shard once read
  };
}

interface Result {
  tally: Tally;
  byUpos: Map<string, Tally>;
  excluded: Record<Exclusion, number>;
  misaligned: Record<AlignCause, number>;
  misalignExamples: Record<string, string>;
  drift: number;
  sentences: number;
  goldWords: number;
  ranges: number;
  emptyNodes: number;
  inRange: number;
}
const newResult = (): Result => ({
  tally: new Tally(), byUpos: new Map(),
  excluded: { upos: 0, digits: 0, 'no-cyrillic': 0 },
  misaligned: { 'we-split': 0, 'we-merged': 0, 'partial-overlap': 0, 'no-token': 0, 'gold-not-in-text': 0 },
  misalignExamples: {}, drift: 0, sentences: 0, goldWords: 0, ranges: 0, emptyNodes: 0, inRange: 0,
});

interface Lists { noReading: Counter; lemma: Counter; pos: Counter; featWrong: Counter; featAbsent: Counter }
const newLists = (): Lists => ({ noReading: new Counter(), lemma: new Counter(), pos: new Counter(), featWrong: new Counter(), featAbsent: new Counter() });

async function main(): Promise<void> {
  const t0 = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const names = args.treebank === 'all' ? Object.keys(TREEBANKS) : args.treebank.split(',');
  for (const n of names) if (!TREEBANKS[n]) throw new Error(`unknown treebank ${n}; choose ${Object.keys(TREEBANKS).join(', ')} or all`);

  const analyser = await loadAnalyser(args.analyzer, args.module);

  // the index: the compiled core, and for `full` the shards each sentence needs
  resetRussianIndexes();
  let loader: RussianShardLoader | undefined;
  let coreNote = 'not installed';
  const coreFile = path.resolve('src/adapters/russian/generated/core.ts');
  if (fs.existsSync(coreFile)) {
    const core = (await importRussian('generated/core')).RU_CORE as RussianFormIndex | undefined;
    if (core) { installRussianIndex(core); coreNote = `ru-core (${num(Object.keys(core.forms).length)} form keys, ${num(Object.keys(core.lemmas).length)} lemmas)`; }
  }
  if (args.index === 'full') {
    const base = 'public/lexicon/ru/standard';
    if (!fs.existsSync(`${base}/manifest.json`)) throw new Error(`--index full needs ${base}/manifest.json (npm run ru:build-index)`);
    loader = await createRussianShardLoader(diskShardSource, { base, maxLoaded: args.maxShards });
  } else if (args.index !== 'core') throw new Error('--index is core or full');
  const indexNote = loader ? `full: ${coreNote} + ${num(Object.keys(loader.manifest.shards).length)} shards loaded on demand from public/lexicon/ru/standard (built ${loader.manifest.built})` : `core only: ${coreNote}`;

  const perTb = new Map<string, Result>();
  const all = newResult();
  const lists = newLists();
  let shardLoads = 0;

  for (const name of names) {
    const meta = TREEBANKS[name];
    const file = path.join(UD_DIR, meta.file);
    if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
    let sentences = parseConllu(fs.readFileSync(file, 'utf8'), name);
    if (Number.isFinite(args.limit)) sentences = sentences.slice(0, args.limit);
    const res = newResult();
    perTb.set(name, res);
    for (const s of sentences) {
      const info = alignGold(s);
      const sid = `${name}:${s.id}`;
      const tokens = ruTokenize(s.text);
      const words = tokens.filter((t) => t.isWord);
      if (loader) { const r = await loader.ensure(tokens.filter((t) => t.isWord).map((t) => t.normalized)); shardLoads += r.loaded.length; }
      const analysed = await analyser.run(tokens);
      const byStart = new Map<number, AnalysedLike>();
      for (const a of analysed) byStart.set(a.token.start, a);
      for (const r of [res, all]) {
        r.sentences++;
        r.drift += info.drift;
        r.emptyNodes += s.emptyNodes;
        for (const l of s.lines) { if (l.kind === 'range') r.ranges++; else if (l.inRange) r.inRange++; else r.goldWords++; }
      }
      for (const l of s.lines) {
        if (l.kind !== 'word' || l.inRange) continue;
        const ex = exclusionOf(l);
        if (ex) { res.excluded[ex]++; all.excluded[ex]++; continue; }
        const m = matchTokens(l, words);
        if ('cause' in m) {
          for (const r of [res, all]) r.misaligned[m.cause]++;
          res.misalignExamples[m.cause] ??= `${sid}: «${l.form}»`;
          continue;
        }
        const a = byStart.get(m.token.start);
        const sc = scoreToken(l, a?.candidates ?? []);
        for (const r of [res, all]) {
          r.tally.add(sc);
          const u = r.byUpos.get(l.upos) ?? new Tally();
          u.add(sc);
          r.byUpos.set(l.upos, u);
        }
        const form = ruKey(l.form);
        if (!sc.covered) lists.noReading.add(form, sid, `gold ${l.lemma} ${l.upos}`);
        else {
          if (!sc.lemma1) lists.lemma.add(`${form} → ${sc.firstLemma ?? '?'} (gold ${ruKey(l.lemma)})`, sid, sc.lemmaAny ? 'gold lemma is another reading' : 'gold lemma not among the readings');
          if (!sc.pos1) lists.pos.add(`gold ${l.upos} → ours ${sc.firstPos ?? '?'}`, `${sid} «${l.form}»`, sc.posAny ? 'right UPOS is another reading' : '');
          for (const f of sc.features) {
            if (f.defined && !f.okLenient) lists.featWrong.add(`${l.upos} ${f.key}: ${f.gold} → ${f.ours}`, `${sid} «${l.form}»`);
            else if (!f.defined) lists.featAbsent.add(`${l.upos} ${f.key}: ${f.gold} → (absent)`, `${sid} «${l.form}»`);
          }
        }
      }
    }
  }

  const seconds = (Date.now() - t0) / 1000;
  const md = renderReport({ args, names, analyserName: analyser.name, indexNote, perTb, all, lists, seconds, shardLoads });
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, md);
  if (args.json) {
    const plain = (t: Tally): Tally => t;
    fs.writeFileSync(args.json, JSON.stringify({
      analyzer: RU_ANALYZER, analyserModule: analyser.name, index: indexNote, seconds,
      treebanks: Object.fromEntries([...perTb.entries()].map(([k, v]) => [k, { ...v, tally: plain(v.tally), byUpos: Object.fromEntries(v.byUpos) }])),
      all: { ...all, byUpos: Object.fromEntries(all.byUpos) },
      misses: { noReading: lists.noReading.top(args.misses), lemma: lists.lemma.top(args.misses), pos: lists.pos.top(args.misses), featWrong: lists.featWrong.top(args.misses), featAbsent: lists.featAbsent.top(args.misses) },
    }, null, 1));
  }
  console.log(`${args.out} written: ${num(all.tally.n)} tokens scored in ${seconds.toFixed(1)} s (${analyser.name}; ${args.index} index)`);
  console.log(`coverage ${pct(all.tally.covered, all.tally.n)}  lemma@1 ${pct(all.tally.lemma1, all.tally.n)}  UPOS@1 ${pct(all.tally.pos1, all.tally.n)}  features@1 ${pct(all.tally.feat1Lenient, all.tally.featTokens)}`);
}

// ───────────────────────────── the report ─────────────────────────────

interface ReportIn { args: Args; names: string[]; analyserName: string; indexNote: string; perTb: Map<string, Result>; all: Result; lists: Lists; seconds: number; shardLoads: number }

function mainRow(label: string, t: Tally): string {
  return `| ${label} | ${num(t.n)} | ${pct(t.covered, t.n)} | ${pct(t.lemma1, t.n)} | ${pct(t.lemmaAny, t.n)} | ${pct(t.pos1, t.n)} | ${pct(t.posAny, t.n)} | ${pct(t.feat1Lenient, t.featTokens)} | ${pct(t.feat1Strict, t.featTokens)} |`;
}
function strictRow(label: string, t: Tally): string {
  return `| ${label} | ${pct(t.lemma1Strict, t.n)} | ${pct(t.lemmaAnyStrict, t.n)} | ${pct(t.pos1Strict, t.n)} | ${pct(t.posAnyStrict, t.n)} | ${t.covered ? (t.readings / t.covered).toFixed(2) : 'n/a'} | ${pct(t.multiLemma, t.covered)} |`;
}
const esc = (s: string): string => s.replace(/\|/g, '\\|');
function missTable(title: string, head: string, rows: Array<{ key: string; n: number; ex: string; note: string }>): string {
  if (!rows.length) return `### ${title}\n\nNone.\n`;
  return `### ${title}\n\n| n | ${head} | example |\n|---:|---|---|\n${rows.map((r) => `| ${r.n} | ${esc(r.key)}${r.note ? ` (${esc(r.note)})` : ''} | ${esc(r.ex)} |`).join('\n')}\n`;
}

function renderReport(r: ReportIn): string {
  const { args, names, all, lists } = r;
  const date = new Date().toISOString().slice(0, 10);
  const L: string[] = [];
  L.push('# Russian analyser: measurement against Universal Dependencies gold', '');
  L.push(`Written by \`npm run ru:eval\` (scripts/ru-eval-ud.mts) on ${date}. Do not edit by hand; run it again.`, '');
  L.push(`- analyser version: \`${RU_ANALYZER}\``);
  L.push(`- analyser measured: ${r.analyserName}`);
  L.push(`- index: ${r.indexNote}`);
  L.push(`- treebanks: ${names.join(', ')}${Number.isFinite(args.limit) ? `; first ${args.limit} sentences of each` : ''}`);
  L.push(`- wall time: ${r.seconds.toFixed(1)} s (${num(all.sentences)} sentences, ${num(r.shardLoads)} shard loads)`, '');

  L.push('## The gold', '');
  L.push('All five files are human-annotated Universal Dependencies treebanks, read from data/raw/ud-ru and used only to measure. Nothing from them is in the product. What each README says about how the annotation was made:', '');
  L.push('| treebank | licence | genre | how the annotation was made (its README) |', '|---|---|---|---|');
  L.push('| Russian-GSD (Google; Lyashevskaya and others) | CC BY-SA 4.0 | Wikipedia, blogs, news | Machine-readable metadata: lemmas, UPOS, XPOS, features, relations all "manual native". Annotated and converted by Google; v2.3+ is a major manual reannotation of LEMMA, UPOS, FEAT, HEAD and DEPREL. Its TRAIN split feeds the analyser\'s lemma counts, so GSD test and dev are held out but come from the same source. |');
  L.push('| Russian-Taiga (HSE, Moscow) | CC BY-SA 4.0 | blogs and social media, poetry, fiction, news, Wikipedia | Text was tokenized, lemmatized and parsed with UDPipe and then "checked manually"; corrections at every level (tokens, lemmas, POS, features, relations). Metadata: "manual native". So it is automatic annotation with manual correction. A different genre from GSD: informal and poetic Russian. |');
  L.push('| Russian-PUD (Google; CoNLL 2017) | CC BY-SA 3.0 | 1,000 translated news and Wikipedia sentences | Translated (professionally) from English and others, annotated by Google to its own guidelines, converted to UD v2 by the UD community; v2.4 changelog: manual POS, manual features, manual lemmas. Fully independent of the analyser\'s data. |', '');
  L.push('Treat all three as human gold of good quality but not flawless: Taiga is the only one that began as machine output, and GSD / PUD were annotated with Google\'s conventions and then converted, so a few systematic conventions differ from this pack (see below). Licence texts: data/raw/ud-ru/LICENSE-*.txt.', '');

  L.push('## Headline figures', '');
  L.push('Rates are over all scored word tokens (a token with no reading counts as wrong). Features are over the tokens that have a first reading and at least one comparable gold feature.', '');
  L.push('| treebank | scored tokens | coverage | lemma@1 | lemma@any | UPOS@1 | UPOS@any | features@1 lenient | features@1 strict |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const n of names) L.push(mainRow(TREEBANKS[n].label, r.perTb.get(n)!.tally));
  if (names.length > 1) L.push(mainRow('**all**', all.tally));
  L.push('');
  L.push('Strict figures and ambiguity (strict: ё must match when the gold has ё; UPOS only AUX→VERB and CCONJ→CONJ; ambiguity counted over tokens that have a confirmed reading):', '');
  L.push('| treebank | lemma@1 strict | lemma@any strict | UPOS@1 strict | UPOS@any strict | readings per covered token | covered tokens with more than one lemma |', '|---|---:|---:|---:|---:|---:|---:|');
  for (const n of names) L.push(strictRow(TREEBANKS[n].label, r.perTb.get(n)!.tally));
  if (names.length > 1) L.push(strictRow('**all**', all.tally));
  L.push('');
  L.push(`Of the covered tokens (all treebanks), lemma@1 is ${pct(all.tally.lemma1, all.tally.covered)} and UPOS@1 ${pct(all.tally.pos1, all.tally.covered)}.`, '');

  L.push('## Per feature (all treebanks)', '');
  L.push('"Gold" is how many scored tokens carry the feature in the gold; "ours defines" is the share of those where the first reading has the key; "agree" is how often it is right when it has it (lenient: a union containing the gold value is right); "strict" is over all gold tokens with the key (absent or a union counts as wrong).', '');
  L.push('| feature | gold | ours defines | agree when defined | strict |', '|---|---:|---:|---:|---:|');
  for (const k of FEATURE_KEYS) {
    const t = all.tally.perFeature[k];
    if (t) L.push(`| ${k} | ${num(t.gold)} | ${pct(t.defined, t.gold)} | ${pct(t.okLenient, t.defined)} | ${pct(t.okStrict, t.gold)} |`);
  }
  L.push('');

  L.push('## By gold part of speech (all treebanks)', '');
  L.push('| gold UPOS | tokens | coverage | lemma@1 | lemma@any | UPOS@1 | features@1 lenient |', '|---|---:|---:|---:|---:|---:|---:|');
  for (const [u, t] of [...all.byUpos.entries()].sort((a, b) => b[1].n - a[1].n)) {
    L.push(`| ${u} | ${num(t.n)} | ${pct(t.covered, t.n)} | ${pct(t.lemma1, t.n)} | ${pct(t.lemmaAny, t.n)} | ${pct(t.pos1, t.n)} | ${pct(t.feat1Lenient, t.featTokens)} |`);
  }
  L.push('');

  L.push('## Tokens not scored, and tokens that did not align', '');
  L.push('| treebank | sentences | gold words | PUNCT/SYM/X | NUM in digits | no Cyrillic letter | multiword ranges | empty nodes | we split a gold token | we merged gold tokens | partial overlap | none of ours | gold form not in text | text drift |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const row = (label: string, x: Result): string => `| ${label} | ${num(x.sentences)} | ${num(x.goldWords)} | ${num(x.excluded.upos)} | ${num(x.excluded.digits)} | ${num(x.excluded['no-cyrillic'])} | ${num(x.ranges)} | ${num(x.emptyNodes)} | ${num(x.misaligned['we-split'])} | ${num(x.misaligned['we-merged'])} | ${num(x.misaligned['partial-overlap'])} | ${num(x.misaligned['no-token'])} | ${num(x.misaligned['gold-not-in-text'])} | ${num(x.drift)} |`;
  for (const n of names) L.push(row(TREEBANKS[n].label, r.perTb.get(n)!));
  if (names.length > 1) L.push(row('**all**', all));
  L.push('');
  L.push('Excluded on purpose: punctuation, symbols and X (no word to read); numerals written in digits (nothing to look up); tokens with no Cyrillic letter (Latin names, foreign words). Words inside a multiword-token range are never scored (the range line stands for them in the text). A gold token is scored only when exactly one of our word tokens has the same character span; the "did not align" columns count the scored-eligible tokens that did not, by cause, and they are left out of every rate above. Examples:', '');
  for (const c of Object.keys(all.misaligned) as AlignCause[]) {
    const ex = [...r.perTb.values()].map((x) => x.misalignExamples[c]).find(Boolean);
    if (all.misaligned[c]) L.push(`- ${c}: ${num(all.misaligned[c])}${ex ? `, e.g. ${ex}` : ''}`);
  }
  L.push('');

  L.push('## Miss lists', '');
  L.push(`The ${args.misses} most frequent in each list (counts over all treebanks, one example sentence id each). They steer the morphology and context packages.`, '');
  L.push(missTable('Forms with no confirmed reading', 'form (gold lemma and UPOS of the first one seen)', lists.noReading.top(args.misses)));
  L.push(missTable('First lemma wrong: form → our first lemma (gold lemma)', 'error', lists.lemma.top(args.misses)));
  L.push(missTable('Part-of-speech confusions (first reading)', 'gold → ours', lists.pos.top(args.misses)));
  L.push(missTable('Feature errors: our first reading has the key with a value that excludes the gold\'s', 'gold UPOS, feature: gold value → ours', lists.featWrong.top(args.misses)));
  L.push(missTable('Feature keys the gold has and our first reading lacks', 'gold UPOS, feature: gold value → ours', lists.featAbsent.top(args.misses)));

  L.push('## What these figures do and do not show', '');
  L.push('- **First-reading accuracy without a parser.** "@1" asks whether the reading the analyser puts first is right. The analyser has only context rules (government, agreement, numerals), no full syntactic parse, so a form whose readings differ (стали: noun or verb; мой, все) is a coin the rules may or may not toss correctly. "@any" shows what a learner who looks at the alternatives would find; the gap between @1 and @any is the room context ordering has.');
  L.push('- **Coverage counts only confirmed readings.** A reading guessed from an ending is marked `unconfirmed` and never counts as covered, however good the guess.');
  L.push('- **Conventions that differ from the pack.** UD writes the prepositional case as Loc (the pack: Prep, and Loc only for the second locative) and the partitive as Par; the lenient rules map them. UD marks Degree=Pos, Voice=Act and a few more keys that the pack leaves unmarked; Degree=Pos is dropped from comparison, and where the pack writes no value that is not an error in the lenient figure but is in the strict one. UD lemmatizes participles under their verb in some places and under the adjective in others; UD has AUX, CCONJ and SCONJ where the pack has VERB and CONJ; UD lemmas may write е for ё; Wiktionary files мой, этот, весь under several headings (the lenient rule accepts DET for PRON). A figure that looks like an analyser error may be a convention difference: read the miss lists before tuning.');
  L.push('- **Tokens excluded** are listed above; the rates describe Cyrillic word tokens only, not punctuation, digits or Latin text, and not the tokens whose boundaries differ from the gold\'s.');
  L.push('- **Independence.** The same team wrote the analyser and this harness, so the harness was unit-tested on hand-made inputs (test/adapters/russian-gold.test.ts) before the numbers were read. The gold is other people\'s human annotation. GSD test and dev share a source with GSD train, which gives the analyser its lemma counts: they are held out but not independent of that prior; Taiga (another genre) and PUD (translated text, fully independent) are the fairer tests of generalisation.');
  L.push('- **Not shown:** quality of glosses, stress, aspect partners, constructions, phrases, or anything about learners; accuracy on text outside these genres (fiction, speech, verse beyond what Taiga holds); the second and later readings\' order.', '');
  return L.join('\n');
}

// vite-node hides the script path, so the run starts unless a test runner (vitest sets VITEST) is only importing the helpers
const isMain = !process.env.VITEST;
if (isMain) main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
