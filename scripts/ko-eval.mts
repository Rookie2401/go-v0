/// <reference types="node" />
/**
 * npm run ko:eval -- --split dev [--limit N] [--mode token|adapter] [--core-only] [--out dir] [--write] [--data dir]
 *
 * Measures the Korean analyser against the KAIST Universal Dependencies treebank (UD Korean-Kaist, CC BY-SA 4.0), which people annotated
 * and which the analyser was not tuned on. The treebank is used ONLY to measure: nothing from it enters the product.
 *
 * Split discipline (docs/korean/EVAL.md): `dev` is for tuning. `test` is run ONCE, by the coordinator, at the end: this script refuses
 * `--split test` unless `--final` is also given, and refuses before it opens any file. `train` was used for counts by the lexicon build,
 * so it is never scored; the only thing read from it is the set of its FORM strings, for the seen / not-seen split.
 *
 * Modes: `token` runs `koAnalyzeToken` on each 어절 alone (the morphology engine without sentence context); `adapter` runs the registered
 * adapter (`koAdapter`) on the whole sentence text and aligns its word tokens to the gold 어절 by character offset.
 *
 * `--limit N` limits the run to the first N SENTENCES. `--write` writes docs/korean/EVAL.md; without it the report goes to the output
 * folder only. The output folder (default C:/Users/CJWal/dev/tmp-mem/ko-eval) also receives records-<split>-<mode>.json and
 * result-<split>-<mode>.json (headline figures, merged into the report's "other modes" table).
 *
 * The pure pieces (CoNLL-U reader, gold derivation, normalisation) are exported; the run starts unless a test runner is importing this file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { AnalysisCandidate, LanguageAdapter } from '../src/core';
import { KO_CORE } from '../src/adapters/korean/generated/core';
import {
  installKoreanLexicon, installedKoreanLexicons, koBareLemma, koSharedPos, lookupKoreanStem,
} from '../src/adapters/korean/index-store';
import { createKoreanShardLoader, koLexiconKeysOf } from '../src/adapters/korean/shards';
import { koAnalyzeToken } from '../src/adapters/korean/analyze';

// ───────────────────────────── CoNLL-U ─────────────────────────────

export interface GoldRow { form: string; lemma: string; upos: string; xpos: string }
export interface GoldSentence { id: string; text: string; rows: GoldRow[] }

/** Reads CoNLL-U text into sentences (token lines only; ranges and empty nodes do not occur in this treebank but are skipped if they do). */
export function parseConllu(src: string): GoldSentence[] {
  const out: GoldSentence[] = [];
  let cur: GoldSentence | undefined;
  const flush = (): void => { if (cur && cur.rows.length) out.push(cur); cur = undefined; };
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') { flush(); continue; }
    cur ??= { id: '', text: '', rows: [] };
    if (line.startsWith('#')) {
      const m = /^#\s*(sent_id|text)\s*=\s*(.*)$/.exec(line);
      if (m) { if (m[1] === 'sent_id') cur.id = m[2].trim(); else cur.text = m[2]; }
      continue;
    }
    const c = line.split('\t');
    if (c.length < 10 || !/^\d+$/.test(c[0])) continue;
    cur.rows.push({ form: c[1], lemma: c[2], upos: c[3], xpos: c[4] });
  }
  flush();
  return out;
}

// ───────────────────────────── the tag mapping ─────────────────────────────

type Pos = 'NOUN' | 'PROPN' | 'PRON' | 'NUM' | 'VERB' | 'ADJ' | 'AUX' | 'DET' | 'ADV' | 'CONJ' | 'INTJ' | 'CLF';
const PREDICATE_POS: ReadonlySet<string> = new Set(['VERB', 'ADJ', 'AUX']);

/** KAIST tag of a HEAD morpheme → this pack's shared part of speech (docs/korean/PLAN.md "Parts of speech"; KAIST tags from the treebank's XPOS column). */
export const HEAD_POS: Readonly<Record<string, { pos: Pos; note: string }>> = {
  ncn: { pos: 'NOUN', note: 'common noun, non-predicative (NNG)' },
  ncpa: { pos: 'NOUN', note: 'common noun, predicative, action (공부; NNG that takes 하다/되다)' },
  ncps: { pos: 'NOUN', note: 'common noun, predicative, stative (부족; NNG that takes 하다 as adjective)' },
  nbn: { pos: 'NOUN', note: 'bound noun (NNB: 것, 수)' },
  nbu: { pos: 'CLF', note: 'unit bound noun (NNB counter: 년, 개)' },
  nq: { pos: 'PROPN', note: 'proper noun (NNP)' },
  npp: { pos: 'PRON', note: 'personal pronoun (NP)' },
  npd: { pos: 'PRON', note: 'demonstrative pronoun (NP: 이것, 여기)' },
  nnc: { pos: 'NUM', note: 'cardinal numeral (NR)' },
  nno: { pos: 'NUM', note: 'ordinal numeral (NR)' },
  pvg: { pos: 'VERB', note: 'general verb (VV)' },
  pvd: { pos: 'VERB', note: 'demonstrative verb (VV: 그러다)' },
  paa: { pos: 'ADJ', note: 'attributive/stative adjective (VA)' },
  pad: { pos: 'ADJ', note: 'demonstrative adjective (VA: 그렇다, 이러하다)' },
  px: { pos: 'AUX', note: 'auxiliary predicate (VX)' },
  jp: { pos: 'AUX', note: 'copula (VCP 이다)' },
  mma: { pos: 'DET', note: 'adnominal, attributive (MM: 새, 모든; UD calls it ADJ)' },
  mmd: { pos: 'DET', note: 'adnominal, demonstrative (MM: 이, 그, 저)' },
  mag: { pos: 'ADV', note: 'general adverb (MAG)' },
  mad: { pos: 'ADV', note: 'demonstrative adverb (MAG: 이리, 그리)' },
  maj: { pos: 'CONJ', note: 'conjunctive adverb (MAJ)' },
  ii: { pos: 'INTJ', note: 'interjection (IC)' },
};
/** Tags that start an 어절 but are not a word to read; counted apart. */
export const EXCLUDED_HEAD: Readonly<Record<string, string>> = {
  sf: 'punctuation: sentence-final mark', sp: 'punctuation: comma and the like', sl: 'punctuation: opening quote or bracket', sr: 'punctuation: closing quote or bracket',
  sy: 'symbol', su: 'symbol: unit symbol (%, ㎏)', f: 'foreign word (Latin script)',
};
const PARTICLE_OR_ENDING = /^(j|e|xs|xp)/u;
/** Derivational-suffix tags the head absorbs (noun + 하/되/시키/받/당하 or 스럽/롭/답). */
const XSV = 'xsv';
const XSM = 'xsm';
const NOMINAL_GROUP: ReadonlySet<string> = new Set(['ncn', 'ncpa', 'ncps', 'nq', 'nbn', 'npp', 'npd']);
const NUMERAL: ReadonlySet<string> = new Set(['nnc', 'nno']);

// ───────────────────────────── gold derivation ─────────────────────────────

export type ConventionKind =
  | 'compound' | 'xsn-derived' | 'xsn-plural' | 'xsa-adverb' | 'prefix' | 'derived-verb' | 'derived-adjective' | 'numeral-unit' | 'stem-only-lemma' | 'hanja-lemma';

export interface Gold {
  form: string;
  sentence: string;
  tags: string[];
  /** morpheme texts in the same order as `tags`, or null when the lemma column holds only the stem (an 어절 that starts with an auxiliary or the copula) */
  morphs: string[] | null;
  /** why the 어절 is not scored (kept apart), or undefined when it is scored */
  excluded?: string;
  pos?: Pos;
  /** primary gold headword (the lexical lemma of the head) */
  lemma?: string;
  /** other headwords a reasonable analyser may give for the same 어절 (the annotation scheme splits where a lexicon may not): the LENIENT set */
  alts: string[];
  /** which annotation conventions this 어절 touches */
  conv: ConventionKind[];
  hasCopula: boolean;
  /** normalised chain of particles and endings after the head, or null when not comparable */
  chain: string[] | null;
  seen: boolean;
  /** gold UPOS (for the record of where the UD tag differs) */
  upos: string;
  xpos: string;
}

const HANJA = /[\u3400-\u9fff\uf900-\ufaff]/u;
const HANGUL_OR_HANJA = /[\uac00-\ud7a3\u3131-\u318e\u3400-\u9fff]/u;

// folding of allomorphs (applied to the gold side and the system side alike)
const WHOLE_FOLD: Readonly<Record<string, string>> = {
  는: 'ㄴ', 은: 'ㄴ', 을: 'ㄹ', 를: 'ㄹ', 가: '이', 와: '과', 으로: '로', 으로써: '로써', 으로서: '로서', 음: 'ㅁ', ㅂ니다: '습니다', 는다: 'ㄴ다', 았: '었', 였: '었', ㅆ: '었', 에요: '어요',
  아: '어', 여: '어', 읍시다: 'ㅂ시다', 서: '어서',
};
const LEADING_I = new Set(['나', '라도', '란', '야', '든', '야말로', '자', '고', '여', '라고', '라', '며', '다']);

/**
 * The normalised form of one morpheme text, on either side. Allomorphs are folded: 은/는/ㄴ → ㄴ, 을/를/ㄹ → ㄹ, 이/가 → 이, 과/와 → 과, (으)로 → 로,
 * 았/었/였/ㅆ → 었, 아/어/여 → 어 at the start of an ending (아서/어서), ㅂ니다/습니다 → 습니다, 는다/ㄴ다 → ㄴ다, a leading 으 before a consonant
 * syllable (으면 → 면), a leading 이 on a particle that has a vowel-final form (이나 → 나), 음/ㅁ → ㅁ. Hyphens and optional (으)/(이) are removed.
 */
export function normMorph(text: string): string {
  let x = text.normalize('NFC').replace(/\((?:으|이)\)/gu, '').replace(/[-\s]/gu, '');
  if (!x) return '';
  if (x === '이' || x === '다') return x;
  if (x.length > 1 && x.startsWith('이') && LEADING_I.has(x.slice(1))) x = x.slice(1);
  x = x.replace(/^(아|여)(?=[서도야])/u, '어').replace(/^[았였ㅆ]/u, '었').replace(/^으(?=[\uac00-\ud7a3])/u, '');
  x = x.replace(/^는(?=.)/u, 'ㄴ').replace(/^ㅂ니/u, '습니').replace(/^을(?=[까게래수])/u, 'ㄹ');
  return WHOLE_FOLD[x] ?? x;
}

const lastIsNominalAbsorbed = (t: string): boolean => NOMINAL_GROUP.has(t);

/** Derives the gold record of one 어절 from its token line. */
export function deriveGold(row: GoldRow, sentence: string, trainForms: ReadonlySet<string>): Gold {
  const tags = row.xpos.split('+');
  const lem = row.lemma.split('+');
  const morphs = lem.length === tags.length ? lem : null;
  const g: Gold = { form: row.form, sentence, tags, morphs, alts: [], conv: [], hasCopula: tags.includes('jp'), chain: null, seen: trainForms.has(row.form), upos: row.upos, xpos: row.xpos };
  const t0 = tags[0];
  if (EXCLUDED_HEAD[t0]) { g.excluded = EXCLUDED_HEAD[t0]; return g; }
  if (/\d/u.test(row.form)) { g.excluded = 'number written in digits'; return g; }
  if (!HANGUL_OR_HANJA.test(row.form)) { g.excluded = 'no Hangul or Hanja in the form'; return g; }
  if (PARTICLE_OR_ENDING.test(t0)) { g.excluded = 'the 어절 is a bare particle, ending or suffix (no head)'; return g; }
  if (!HEAD_POS[t0] && !(t0 in HEAD_POS)) { g.excluded = `unmapped head tag ${t0}`; return g; }

  // the lemma column holds only the stem when the 어절 starts with an auxiliary or the copula (UD AUX): head = stem + 다, no morpheme texts
  if (!morphs) {
    const stem = lem[0];
    g.pos = HEAD_POS[t0].pos;
    g.lemma = t0 === 'jp' ? '이다' : PREDICATE_POS.has(g.pos) || /^(pvg|paa|px|pvd|pad)$/u.test(t0) ? stem + '다' : stem;
    g.conv.push('stem-only-lemma');
    return g;
  }
  let i = 0;
  const take = (): string => morphs[i++];
  // an optional prefix (xp): the prefixed word is the headword, the unprefixed one the lenient alternative
  let prefix = '';
  if (t0 === 'xp') { prefix = take(); g.conv.push('prefix'); }
  const h0 = tags[i];
  if (!HEAD_POS[h0]) { g.excluded = `unmapped head tag ${h0}`; return g; }
  let headTag = h0;
  let base = '';
  if (NUMERAL.has(h0)) {
    while (i < tags.length && NUMERAL.has(tags[i])) base += take();
    g.pos = 'NUM';
    if (tags[i] === 'nbu') g.conv.push('numeral-unit');
  } else if (NOMINAL_GROUP.has(h0)) {
    const comps: string[] = [];
    while (i < tags.length && lastIsNominalAbsorbed(tags[i])) { headTag = tags[i]; comps.push(take()); }
    base = comps.join('');
    if (comps.length > 1) { g.conv.push('compound'); g.alts.push(comps[0], comps[comps.length - 1]); }
    g.pos = HEAD_POS[headTag].pos;
  } else if (h0 === 'nbu') {
    base = take();
    g.pos = 'CLF';
  } else if (h0 === 'jp') {
    base = '이다';
    take();
    g.pos = 'AUX';
  } else if (/^(pvg|paa|px|pvd|pad)$/u.test(h0)) {
    base = take() + '다';
    g.pos = HEAD_POS[h0].pos;
  } else {
    base = take();
    g.pos = HEAD_POS[h0].pos;
  }
  // derivation by a suffix on a nominal head
  const nominalHead = g.pos === 'NOUN' || g.pos === 'PROPN' || g.pos === 'NUM';
  if (nominalHead && i < tags.length && (tags[i] === XSV || tags[i] === XSM)) {
    const suf = take();
    const full = base + suf + '다';
    g.alts.push(base);
    g.lemma = prefix + full;
    if (prefix) g.alts.push(full);
    g.pos = tags[i - 1] === XSV ? 'VERB' : 'ADJ';
    g.conv.push(g.pos === 'VERB' ? 'derived-verb' : 'derived-adjective');
  } else if (nominalHead && i < tags.length && tags[i] === 'xsa') {
    const suf = lem[i];
    g.lemma = prefix + base + suf; // 정확+히 → 정확히
    g.alts.push(base, base + '하다');
    g.pos = 'ADV';
    g.conv.push('xsa-adverb');
    i++;
  } else {
    g.lemma = prefix + base;
    if (prefix) g.alts.push(base);
    if (nominalHead && i < tags.length && tags[i] === 'xsn') {
      if (morphs[i] === '들') g.conv.push('xsn-plural');
      else { g.conv.push('xsn-derived'); g.alts.push(g.lemma + morphs[i]); }
    }
  }
  if (g.lemma && HANJA.test(g.lemma)) { g.excluded = 'gold lemma written in Hanja (the system answers in Hangul)'; g.conv.push('hanja-lemma'); return g; }
  g.alts = [...new Set(g.alts)].filter((a) => a && a !== g.lemma);
  // chain: everything after the head, in the gold's own segmentation
  g.chain = [];
  for (let k = i; k < tags.length; k++) { const n = normMorph(morphs[k]); if (n) g.chain.push(n); }
  return g;
}

// ───────────────────────────── system side ─────────────────────────────

const LIGHT_LEMMAS = new Set(['하다', '되다', '시키다', '받다', '당하다', '스럽다', '롭다', '답다']);

/** The system's chain of particles / endings after the head, normalised like the gold's. Nominal components of a compound and a derivational light verb belong to the head. */
export function sysChain(c: AnalysisCandidate): string[] {
  const out: string[] = [];
  let seenStem = false;
  for (const p of c.parts ?? []) {
    const k = p.kind;
    if (k === 'stem' || k === 'component' || k === 'head' || k === 'prefix') {
      // a later component of a compound belongs to the head (until a particle or ending has been seen); a later verb, adjective or counter is a content item of the chain
      const absorbed = out.length === 0 && !['VERB', 'ADJ', 'AUX', 'CLF'].includes(p.pos ?? '');
      if (seenStem && k !== 'prefix' && !absorbed) { const n = normMorph(p.text); if (n) out.push(n); }
      seenStem = true;
      continue;
    }
    if (k === 'suffix' && (p.pos === 'VERB' || p.pos === 'ADJ') && LIGHT_LEMMAS.has(p.lemma ?? '')) continue;
    const n = normMorph(p.text);
    if (n) out.push(n);
  }
  return out;
}

const eqSeq = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
function bagOverlap(a: readonly string[], b: readonly string[]): number {
  const m = new Map<string, number>();
  for (const x of b) m.set(x, (m.get(x) ?? 0) + 1);
  let tp = 0;
  for (const x of a) { const n = m.get(x) ?? 0; if (n > 0) { tp++; m.set(x, n - 1); } }
  return tp;
}

interface SysRes { cands: AnalysisCandidate[] | null; split: number; note?: string }

// ───────────────────────────── the run ─────────────────────────────

interface Opts { split: string; limit: number; mode: 'token' | 'adapter'; coreOnly: boolean; out: string; write: boolean; data: string; final: boolean }

function parseArgs(argv: string[]): Opts {
  const o: Opts = { split: 'dev', limit: 0, mode: 'token', coreOnly: false, out: 'C:/Users/CJWal/dev/tmp-mem/ko-eval', write: false, data: path.resolve(process.cwd(), '..', 'go-v0', 'data', 'raw', 'ud-ko'), final: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = (): string => argv[++i];
    if (a === '--split') o.split = val();
    else if (a === '--limit') o.limit = Number(val());
    else if (a === '--mode') o.mode = val() as Opts['mode'];
    else if (a === '--core-only') o.coreOnly = true;
    else if (a === '--out') o.out = val();
    else if (a === '--write') o.write = true;
    else if (a === '--data') o.data = val();
    else if (a === '--final') o.final = true;
  }
  return o;
}

const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${n} / ${d} (${((100 * n) / d).toFixed(2)} %)`);
const pctOnly = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(2)} %`);

class Tally {
  private m = new Map<string, [number, number]>();
  add(dims: readonly string[], ok: boolean): void { for (const d of dims) { const v = this.m.get(d) ?? [0, 0]; v[1]++; if (ok) v[0]++; this.m.set(d, v); } }
  get(d: string): [number, number] { return this.m.get(d) ?? [0, 0]; }
}

const POS_ORDER: Pos[] = ['NOUN', 'PROPN', 'PRON', 'NUM', 'CLF', 'VERB', 'ADJ', 'AUX', 'DET', 'ADV', 'CONJ', 'INTJ'];
const sup = /[\u00b9\u00b2\u00b3\u2070-\u2079]+$/u;

interface Rec {
  form: string; sentence: string; seen: boolean; pos: Pos; lemma: string; alts: string[]; conv: ConventionKind[]; copula: boolean; xpos: string; upos: string;
  first?: { lemma: string; pos?: string; conf: number; unconfirmed: boolean; hom: 'undecided' | 'numbered' | 'plain'; parts: number };
  nCands: number; rank: number; rankLenient: number; strict: boolean; lenient: boolean; posOk: boolean;
  chainGold: string[] | null; chainSys: string[]; exactChain?: boolean; concatChain?: boolean; tp?: number;
  cls?: string; sub?: string; alignFail?: boolean; split?: number;
  sysPart?: string;
  idx: number;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  // split discipline FIRST: nothing is opened before this
  if (opts.split === 'test' && !opts.final) {
    console.error('ko:eval: refusing --split test without --final. The test split is run once, by the coordinator, at the end.');
    process.exit(2);
  }
  if (opts.split === 'train') { console.error('ko:eval: the train split was used for counts by the lexicon build and is never scored.'); process.exit(2); }
  if (!['dev', 'test'].includes(opts.split)) { console.error(`ko:eval: unknown split ${opts.split}`); process.exit(2); }
  if (!['token', 'adapter'].includes(opts.mode)) { console.error(`ko:eval: unknown mode ${opts.mode}`); process.exit(2); }

  const file = path.join(opts.data, `ko_kaist-ud-${opts.split}.conllu`);
  const trainFile = path.join(opts.data, 'ko_kaist-ud-train.conllu');
  let sentences = parseConllu(fs.readFileSync(file, 'utf8'));
  if (opts.limit > 0) sentences = sentences.slice(0, opts.limit);
  // from train ONLY the FORM strings (column 2), for the seen / not-seen split
  const trainForms = new Set<string>();
  for (const l of fs.readFileSync(trainFile, 'utf8').split('\n')) { if (!l || l.startsWith('#')) continue; const t = l.indexOf('\t'); if (t > 0) trainForms.add(l.slice(t + 1, l.indexOf('\t', t + 1))); }

  // gold
  const golds: Gold[] = [];
  const sentOf: number[] = [];
  sentences.forEach((s, si) => { for (const r of s.rows) { golds.push(deriveGold(r, s.text, trainForms)); sentOf.push(si); } });

  // lexicon
  installKoreanLexicon(KO_CORE);
  let loadedShards = 0;
  let manifestShards = 0;
  const tLoad0 = performance.now();
  if (!opts.coreOnly) {
    const src = {
      async fetchJson(p: string) { return JSON.parse(fs.readFileSync(`public/${p}`, 'utf8')); },
      async fetchBytes(p: string) { return new Uint8Array(fs.readFileSync(`public/${decodeURIComponent(p)}`)); },
    };
    const loader = await createKoreanShardLoader(src, { base: 'lexicon/ko/standard', maxLoaded: 200 });
    const keys = new Set<string>();
    for (const g of golds) {
      for (const k of koLexiconKeysOf(g.form)) keys.add(k);
      for (const l of [g.lemma, ...g.alts]) if (l) { keys.add(l); keys.add(l.endsWith('다') ? l.slice(0, -1) : l); }
    }
    const r = await loader.ensure(keys);
    if (r.failed.length) console.error(`ko:eval: ${r.failed.length} shard(s) failed to load: ${r.failed.slice(0, 3).map((x) => x.join(' ')).join('; ')}`);
    manifestShards = Object.keys(loader.manifest.shards).length;
    loadedShards = installedKoreanLexicons().filter((x) => x.includes('#')).length;
  }
  const loadMs = performance.now() - tLoad0;

  // system
  const scoredIdx: number[] = [];
  golds.forEach((g, i) => { if (!g.excluded) scoredIdx.push(i); });
  const sys: SysRes[] = new Array(golds.length);
  const coldMs = new Map<string, number>();
  let analyseMs = 0;
  let wordTokensAnalysed = 0;
  let adapterNote = '';
  let adapterPlaceholder = false;
  let alignFailures = 0;
  let splitTokens = 0;
  let adapterSentenceCount = 0;
  let orderViolations = 0;
  let firstNotAboveSecond = 0;
  const checkOrder = (cs: AnalysisCandidate[]): void => {
    for (let k = 1; k < cs.length; k++) if (cs[k].confidence > cs[k - 1].confidence) { orderViolations++; break; }
    if (cs.length > 1 && !(cs[0].confidence > cs[1].confidence)) firstNotAboveSecond++;
  };

  if (opts.mode === 'token') {
    for (const i of scoredIdx) {
      const f = golds[i].form;
      const t0 = performance.now();
      const cands = koAnalyzeToken(f);
      const dt = performance.now() - t0;
      analyseMs += dt;
      wordTokensAnalysed++;
      if (!coldMs.has(f)) coldMs.set(f, dt);
      sys[i] = { cands, split: 1 };
      checkOrder(cands);
    }
  } else {
    const adapterPath = path.resolve(process.cwd(), 'src', 'adapters', 'ko.ts');
    adapterPlaceholder = /PLACEHOLDER/u.test(fs.readFileSync(adapterPath, 'utf8').split('\n')[0]);
    const mod = await import('../src/adapters/ko');
    const adapter: LanguageAdapter = mod.koAdapter;
    adapterNote = `adapter ${adapter.lang}@${adapter.version}${adapterPlaceholder ? ' (PLACEHOLDER)' : ''}`;
    let gi = 0;
    for (let si = 0; si < sentences.length; si++) {
      const s = sentences[si];
      const rows = s.rows;
      const idx0 = gi;
      gi += rows.length;
      adapterSentenceCount++;
      const t0 = performance.now();
      const toks = adapter.tokenize(s.text);
      const an = adapter.analyze(toks);
      const dt = performance.now() - t0;
      analyseMs += dt;
      wordTokensAnalysed += toks.filter((t) => t.isWord).length;
      for (const a of an) if (a.token.isWord) checkOrder(a.candidates);
      // gold offsets in the sentence text
      let cursor = 0;
      for (let r = 0; r < rows.length; r++) {
        const gIdx = idx0 + r;
        const form = rows[r].form;
        const at = s.text.indexOf(form, cursor);
        if (at < 0) { if (!golds[gIdx].excluded) { sys[gIdx] = { cands: null, split: 0, note: 'gold form not found in text' }; alignFailures++; } continue; }
        cursor = at + form.length;
        if (golds[gIdx].excluded) continue;
        const end = at + form.length;
        const inside = an.filter((a) => a.token.isWord && a.token.start >= at && a.token.end <= end);
        const head = inside.find((a) => a.token.start === at);
        if (!head) { sys[gIdx] = { cands: null, split: inside.length, note: 'no adapter word token starts at the 어절' }; alignFailures++; continue; }
        const covered = inside.length === 1 && head.token.end === end;
        if (!covered) splitTokens++;
        sys[gIdx] = { cands: head.candidates, split: inside.length };
      }
    }
  }

  // ───── score ─────
  const T = {
    lemma: new Tally(), lemmaLenient: new Tally(), any: new Tally(), anyLenient: new Tally(), pos: new Tally(), posGivenLemma: new Tally(), unconfirmed: new Tally(),
    confWrong: new Tally(), noReading: new Tally(), rank1: new Tally(),
  };
  const chainT = { exact: new Tally(), concat: new Tally(), exactLemmaOk: new Tally(), concatLemmaOk: new Tally(), exactClean: new Tally(), concatClean: new Tally() };
  let f1 = { tp: 0, p: 0, r: 0 };
  let f1ok = { tp: 0, p: 0, r: 0 };
  let f1clean = { tp: 0, p: 0, r: 0 };
  const homCount = { undecided: 0, numbered: 0, plain: 0, none: 0 };
  const rankHist = new Map<string, number>();
  const recs: Rec[] = [];
  const convCount = new Map<string, { n: number; ex: string[] }>();
  const bumpConv = (k: string, ex: string): void => { const v = convCount.get(k) ?? { n: 0, ex: [] }; v.n++; if (v.ex.length < 4 && !v.ex.includes(ex)) v.ex.push(ex); convCount.set(k, v); };
  const exclusions = new Map<string, number>();
  for (const g of golds) if (g.excluded) exclusions.set(g.excluded, (exclusions.get(g.excluded) ?? 0) + 1);
  const tagCounts = new Map<string, number>();
  for (const g of golds) tagCounts.set(g.tags[0], (tagCounts.get(g.tags[0]) ?? 0) + 1);
  const confidentWrongTokens = new Map<string, { n: number; first: string; gold: string }>();

  for (const i of scoredIdx) {
    const g = golds[i];
    const s = sys[i];
    const cands = s?.cands ?? [];
    const first = cands[0];
    const lemmaOf = (c: AnalysisCandidate): string => koBareLemma(c.lemma ?? '');
    const goldSet = new Set([g.lemma!]);
    const lenSet = new Set([g.lemma!, ...g.alts]);
    const strict = !!first && lemmaOf(first) === g.lemma;
    const lenient = !!first && lenSet.has(lemmaOf(first));
    const rank = cands.findIndex((c) => goldSet.has(lemmaOf(c)));
    const rankLen = cands.findIndex((c) => lenSet.has(lemmaOf(c)));
    const posOk = !!first && first.pos === g.pos;
    const unconf = !first || !!first.unconfirmed;
    const hom: 'undecided' | 'numbered' | 'plain' = !first ? 'plain' : first.notes?.homonym === 'undecided' ? 'undecided' : sup.test(first.lemma ?? '') ? 'numbered' : 'plain';
    const seenDim = g.seen ? 'seen' : 'unseen';
    const dims = ['all', `pos:${g.pos}`, seenDim, ...(g.hasCopula ? ['copula'] : []), ...(g.conv.length ? ['conv'] : ['noconv'])];
    T.lemma.add(dims, strict);
    T.lemmaLenient.add(dims, lenient);
    T.any.add(dims, rank >= 0);
    T.anyLenient.add(dims, rankLen >= 0);
    T.rank1.add(dims, rank === 0);
    T.pos.add(dims, posOk);
    if (strict) T.posGivenLemma.add(dims, posOk);
    T.unconfirmed.add(dims, unconf);
    T.noReading.add(dims, cands.length === 0);
    const cw = !!first && first.confidence >= 0.8 && !first.unconfirmed && !strict;
    T.confWrong.add(dims, cw);
    if (cw) {
      const k = g.form;
      const v = confidentWrongTokens.get(k) ?? { n: 0, first: `${first.lemma}/${first.pos ?? '?'} ${first.confidence.toFixed(2)}`, gold: `${g.lemma}/${g.pos}` };
      v.n++; confidentWrongTokens.set(k, v);
    }
    if (first) homCount[hom]++; else homCount.none++;
    const rk = rank < 0 ? 'none' : rank === 0 ? '1' : rank === 1 ? '2' : rank === 2 ? '3' : '4+';
    rankHist.set(rk, (rankHist.get(rk) ?? 0) + 1);

    const rec: Rec = {
      form: g.form, sentence: g.sentence, seen: g.seen, pos: g.pos!, lemma: g.lemma!, alts: g.alts, conv: g.conv, copula: g.hasCopula, xpos: g.xpos, upos: g.upos,
      ...(first ? { first: { lemma: first.lemma ?? '', pos: first.pos, conf: first.confidence, unconfirmed: !!first.unconfirmed, hom, parts: first.parts?.length ?? 0 } } : {}),
      idx: i, nCands: cands.length, rank, rankLenient: rankLen, strict, lenient, posOk, chainGold: g.chain, chainSys: first ? sysChain(first) : [],
      ...(s && s.cands === null ? { alignFail: true } : {}), split: s?.split,
    };
    // chain
    if (g.chain && first) {
      const gc = g.chain;
      const sc = rec.chainSys;
      const exact = eqSeq(gc, sc);
      const concat = gc.join('') === sc.join('');
      rec.exactChain = exact; rec.concatChain = concat;
      const tp = bagOverlap(sc, gc);
      rec.tp = tp;
      chainT.exact.add(['all'], exact); chainT.concat.add(['all'], concat);
      f1.tp += tp; f1.p += sc.length; f1.r += gc.length;
      if (strict) { chainT.exactLemmaOk.add(['all'], exact); chainT.concatLemmaOk.add(['all'], concat); f1ok.tp += tp; f1ok.p += sc.length; f1ok.r += gc.length; }
      const clean = g.conv.every((c) => c === 'xsn-plural');
      if (clean) { chainT.exactClean.add(['all'], exact); chainT.concatClean.add(['all'], concat); f1clean.tp += tp; f1clean.p += sc.length; f1clean.r += gc.length; }
      if (concat && !exact) bumpConv('gold and system cut the chain differently (same letters, different segmentation)', `${g.form}: gold ${gc.join('+')} | system ${sc.join('+')}`);
    }
    recs.push(rec);
    for (const c of g.conv) bumpConv(`gold convention: ${c}`, `${g.form} → ${g.lemma}`);
  }
  for (const g of golds) if (g.excluded && g.conv.includes('hanja-lemma')) bumpConv('gold convention: hanja-lemma', g.form);

  // ───── error classification ─────
  const hasLex = (lemma: string, pos: Pos): { any: boolean; posOk: boolean; classes: string[] } => {
    const stem = PREDICATE_POS.has(pos) && lemma.endsWith('다') ? lemma.slice(0, -1) : lemma;
    const hits = lookupKoreanStem(stem).filter((h) => h.entry.lemma === lemma);
    const classes = [...new Set(hits.map((h) => koSharedPos(h.entry) ?? h.entry.tag))];
    const ok = classes.some((c) => c === pos || (PREDICATE_POS.has(c) && PREDICATE_POS.has(pos)) || (c === 'NOUN' && (pos === 'CLF' || pos === 'PROPN')) || (c === 'CLF' && pos === 'NOUN') || (c === 'PROPN' && pos === 'NOUN'));
    return { any: hits.length > 0, posOk: ok, classes };
  };
  // the system's chain vocabulary: every normalised morpheme any reading of any dev token produced (a proxy for "the analyser has this ending")
  const inventory = new Set<string>();
  for (const i of scoredIdx) for (const c of sys[i]?.cands ?? []) for (const x of sysChain(c)) inventory.add(x);
  const missingEl = new Map<string, number>();
  const missingHead = new Map<string, number>();
  const missingByPos = new Map<string, number>();
  let totalErrors = 0;
  const classes = new Map<string, { n: number; pos: Map<string, number>; pairs: Map<string, number>; rank: number }>();
  const addClass = (cls: string, r: Rec, order: number): void => {
    totalErrors++;
    const v = classes.get(cls) ?? { n: 0, pos: new Map(), pairs: new Map(), rank: order };
    v.n++;
    v.pos.set(r.pos, (v.pos.get(r.pos) ?? 0) + 1);
    const pair = `${r.form} → ${r.first ? `${r.first.lemma}/${r.first.pos ?? '?'}${r.first.unconfirmed ? ' (unconfirmed)' : ''}` : '(no reading)'} | gold ${r.lemma}/${r.pos}`;
    v.pairs.set(pair, (v.pairs.get(pair) ?? 0) + 1);
    classes.set(cls, v);
  };
  const isNominalPos = (p?: string): boolean => !!p && ['NOUN', 'PROPN', 'PRON', 'NUM', 'CLF'].includes(p);
  for (const r of recs) {
    if (r.strict) continue;
    let cls: string;
    if (r.alignFail) cls = 'adapter: 어절 not aligned to a word token';
    else if (r.nCands === 0) cls = 'no reading at all';
    else if (r.lenient) {
      const conv = r.conv.filter((c) => c !== 'xsn-plural' && c !== 'hanja-lemma')[0] ?? 'other';
      const wholeInLexicon = hasLex(r.lemma, r.pos).any;
      const first = r.first!;
      const lightNamed = (sys[r.idx]?.cands?.[0]?.parts ?? []).some((p) => p.kind === 'suffix' && (p.pos === 'VERB' || p.pos === 'ADJ') && LIGHT_LEMMAS.has(p.lemma ?? ''));
      if ((conv === 'derived-verb' || conv === 'derived-adjective') && !lightNamed && !wholeInLexicon) cls = `annotation scheme: ${conv}, headword absent from the lexicon, and the first reading does NOT name the light verb (the rest of the 어절 is read as a particle or ending of the noun)`;
      else if (wholeInLexicon && (conv === 'compound' || conv === 'derived-verb' || conv === 'derived-adjective')) cls = `a part preferred over a headword the lexicon holds (gold: ${conv})`;
      else cls = `annotation scheme: ${conv}${conv === 'compound' || conv.startsWith('derived') ? ', whole headword absent from the lexicon' : ''} (right under the lenient alternatives)`;
      void first;
    }
    else {
      const lex = hasLex(r.lemma, r.pos);
      const first = r.first!;
      if (!lex.any) {
        cls = `headword missing from the lexicon (${r.pos})`;
        const k = `${r.lemma}/${r.pos}`;
        missingHead.set(k, (missingHead.get(k) ?? 0) + 1);
        missingByPos.set(r.pos, (missingByPos.get(r.pos) ?? 0) + 1);
      } else if (!lex.posOk) cls = `headword in the lexicon only under another class (gold ${r.pos}; lexicon ${lex.classes.join('/')})`;
      else if (r.rank > 0) {
        const fp = first.pos;
        if (isNominalPos(r.pos) && ['VERB', 'ADJ', 'AUX'].includes(fp ?? '')) cls = 'right reading ranked below the first: noun read as predicate';
        else if (PREDICATE_POS.has(r.pos) && isNominalPos(fp)) cls = 'right reading ranked below the first: predicate read as noun';
        else if (first.parts > 1 && koBareLemma(first.lemma).length < r.lemma.length) cls = 'right reading ranked below the first: a split preferred over the whole headword';
        else if (fp === r.pos) cls = 'right reading ranked below the first: another headword of the same class and spelling';
        else cls = `right reading ranked below the first: wrong class (${fp ?? '?'} first, gold ${r.pos})`;
      } else if (first.unconfirmed) {
        const miss = (r.chainGold ?? []).filter((x) => !inventory.has(x));
        if (miss.length) { cls = 'form not explained: an ending or particle the analyser never produced'; for (const m of miss) missingEl.set(m, (missingEl.get(m) ?? 0) + 1); }
        else if (!r.chainGold) cls = 'form not explained (gold chain unknown: auxiliary or copula 어절)';
        else cls = 'form not explained although every ending is known elsewhere (stem form not reachable: irregular, contraction or spacing)';
      } else if (PREDICATE_POS.has(r.pos)) cls = 'headword present, never produced: predicate form not derived (irregular, contraction, missing ending in this context)';
      else cls = 'headword present, never produced: another analysis of the nominal preferred, whole headword not read';
    }
    r.cls = cls;
    addClass(cls, r, 0);
  }

  // ───── timing ─────
  const slowest = [...coldMs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const coldTotal = [...coldMs.values()].reduce((a, b) => a + b, 0);

  // ───── report data ─────
  const totalGold = golds.length;
  const D = recs.length;
  const result = {
    split: opts.split, mode: opts.mode, coreOnly: opts.coreOnly, sentences: sentences.length, goldTokens: totalGold, scored: D,
    lemma: T.lemma.get('all'), lemmaLenient: T.lemmaLenient.get('all'), any: T.any.get('all'), anyLenient: T.anyLenient.get('all'), pos: T.pos.get('all'), posGivenLemma: T.posGivenLemma.get('all'),
    unconfirmed: T.unconfirmed.get('all'), confWrong: T.confWrong.get('all'), chainExact: chainT.exact.get('all'), chainConcat: chainT.concat.get('all'),
    f1: f1.p && f1.r ? (2 * f1.tp) / (f1.p + f1.r) : 0, orderViolations, adapter: adapterNote,
    tokensPerSecond: wordTokensAnalysed / (analyseMs / 1000),
  };
  fs.mkdirSync(opts.out, { recursive: true });
  fs.writeFileSync(path.join(opts.out, `result-${opts.split}-${opts.mode}${opts.coreOnly ? '-core' : ''}.json`), JSON.stringify(result, null, 1));
  fs.writeFileSync(path.join(opts.out, `records-${opts.split}-${opts.mode}${opts.coreOnly ? '-core' : ''}.json`), JSON.stringify(recs));

  // ───── render ─────
  const L: string[] = [];
  const h = (n: number, t: string): void => { L.push('', `${'#'.repeat(n)} ${t}`, ''); };
  const modeDesc = opts.mode === 'token'
    ? 'token mode: `koAnalyzeToken` on each 어절 alone, no sentence context'
    : `adapter mode: the registered adapter (${adapterNote}) on the whole sentence text`;
  const scope = `**${opts.split} split, ${modeDesc}, ${opts.coreOnly ? 'compiled core only' : `compiled core + ${loadedShards} of ${manifestShards} lexicon shards`}, ${sentences.length} sentences, ${D} scored 어절 of ${totalGold} gold 어절**`;

  L.push('# Korean (`ko`) evaluation against the KAIST treebank', '');
  L.push('Generated by `npm run ko:eval` (scripts/ko-eval.mts). Do not edit by hand: change the script and rerun with `--write`.', '');
  L.push(scope, '');
  h(2, 'Source, licence and split discipline');
  L.push('- **Treebank**: Universal Dependencies Korean-Kaist (UD_Korean-Kaist), generated by Chun et al. (2018) from the KAIST Tree-Tagging Corpus; CC BY-SA 4.0; the files are `data/raw/ud-ko/ko_kaist-ud-{train,dev,test}.conllu` of the main repository (README.md and LICENSE.txt beside them). Genre per its README: news, fiction, academic. Annotation: lemmas, UPOS and XPOS "converted from manual"; XPOS is the KAIST tag set, LEMMA the morphemes of the 어절 joined by `+`.');
  L.push('- The treebank is used **only to measure**. Nothing from it is copied into the product, and it is not a source for any lexicon row.');
  L.push('- **dev** is the split the builders tune against (this report). **test** is run ONCE, by the coordinator, at the end, with `--split test --final`; the script refuses `--split test` without `--final` before it opens any file, and it has not been run: **no figure in this report is a test figure**.');
  L.push('- **train** was used for counts by the lexicon build (the frequency prior). It is never scored here: no figure is measured on train. The only thing this script reads from the train file is the set of its FORM strings (column 2), to split dev 어절 into "form seen in train" and "form not seen in train".');
  L.push('- **Favourable to the lexicon**: the lexicon\'s counts came from train, which is the same treebank, hence the same newspaper, fiction and academic vocabulary as dev. Text from other domains will score lower than these figures. The "not seen in train" column is the closer guide, and even it shares the treebank\'s vocabulary and style.');
  h(2, 'What was measured, and how');
  L.push('Every figure below is `count / total (percent)`, over the SCORED 어절 of the stated split and mode, one count per running token (not per distinct form). Percentages are rounded to two decimals, never up to a nicer number.', '');
  L.push('**Gold.** From each token line the gold LEXICAL lemma and class of the 어절\'s head are derived (the first content morpheme; a predicate stem tag pvg/pvd/paa/pad/px gives stem + 다; a noun followed by a derivational xsv/xsm (하, 되, 시키, 받, 당하, 스럽, 롭, 답) is the derived predicate noun+하다 and so on; a run of nouns is one compound; a leading numeral run is one numeral; an xp prefix is part of the headword; noun + xsa 히 is the adverb). The rest of the 어절 is the gold CHAIN of particles and endings. **System.** The analyser\'s FIRST reading is the one judged for "first"; "any" asks whether any reading offers the right headword.', '');
  L.push('**Lemma comparison** is on bare headwords (`koBareLemma`): a numbered homonym (눈²) or the undecided bare lemma (눈) both count as right when the headword is right. The first reading\'s homonym state is counted separately.', '');
  L.push('**Strict vs lenient.** The annotation scheme and a dictionary-based analyser legitimately cut some words differently (a compound the lexicon holds whole, a noun + 적 the lexicon holds as one headword, a noun + 하다 the lexicon has no headword for). STRICT accepts only the primary gold headword defined above. LENIENT also accepts the alternatives the annotation allows: the parts of a compound, the base noun before 적/씩/…, the base noun of a derived 하다/되다 verb, the unprefixed word after a prefix, the adverb\'s base. Every headline is given both ways.', '');

  h(2, 'Tag mapping (KAIST XPOS of the head morpheme → shared part of speech)');
  L.push('| KAIST tag | shared `pos` | meaning | 어절 with this head tag |', '|---|---|---|---|');
  for (const [tag, v] of Object.entries(HEAD_POS)) L.push(`| ${tag} | ${v.pos} | ${v.note} | ${tagCounts.get(tag) ?? 0} |`);
  L.push('', 'Not a head, counted apart and NOT in any accuracy figure:', '', '| head tag or reason | meaning | 어절 |', '|---|---|---|');
  for (const [tag, why] of Object.entries(EXCLUDED_HEAD)) L.push(`| ${tag} | ${why} | ${tagCounts.get(tag) ?? 0} |`);
  const otherFirst = [...tagCounts.entries()].filter(([t]) => !HEAD_POS[t] && !EXCLUDED_HEAD[t]).sort((a, b) => b[1] - a[1]);
  for (const [t, n] of otherFirst) L.push(`| ${t} | an 어절 that starts with a particle, ending, prefix or suffix: no head to read | ${n} |`);
  L.push('', 'Exclusions by reason (an 어절 counted once, under the first reason that applies):', '', '| reason | 어절 |', '|---|---|');
  for (const [why, n] of [...exclusions.entries()].sort((a, b) => b[1] - a[1])) L.push(`| ${why} | ${n} |`);
  const unmapped = [...exclusions.entries()].filter(([w]) => w.startsWith('unmapped'));
  L.push('', unmapped.length ? `Tags that could not be mapped: ${unmapped.map(([w, n]) => `${w} (${n})`).join(', ')}.` : 'Every head tag in this split maps (or is excluded for a stated reason); no tag was left unmapped.');
  L.push('', `Total: ${totalGold} gold 어절 = ${D} scored + ${totalGold - D} excluded.`);

  const row = (label: string, t: Tally, dims: string[]): string => `| ${label} | ${dims.map((d) => pct(...t.get(d))).join(' | ')} |`;
  const baseDims = ['all', 'seen', 'unseen', 'copula', 'conv', 'noconv'];
  const baseHead = '| measure | all | form seen in train | form not seen in train | with copula | touches an annotation convention | touches none |\n|---|---|---|---|---|---|---|';
  h(2, 'Headline figures');
  L.push(scope, '', baseHead);
  L.push(row('(a) FIRST reading has the right headword, STRICT', T.lemma, baseDims));
  L.push(row('(a\') FIRST reading has the right headword, LENIENT', T.lemmaLenient, baseDims));
  L.push(row('(b) right headword in ANY reading, STRICT (recall)', T.any, baseDims));
  L.push(row('(b\') right headword in ANY reading, LENIENT', T.anyLenient, baseDims));
  L.push(row('(c) first reading\'s shared part of speech right, overall', T.pos, baseDims));
  L.push(row('(c\') first reading\'s part of speech right, given the right headword first', T.posGivenLemma, baseDims));
  L.push(row('(e) first reading unconfirmed (or no reading)', T.unconfirmed, baseDims));
  L.push(row('(e\') CONFIDENT AND WRONG: first reading confidence >= 0.8, not unconfirmed, headword wrong (strict)', T.confWrong, baseDims));
  L.push(row('no reading at all', T.noReading, baseDims));
  L.push('', '(a) counts a first reading whose headword is exactly the gold one; (c) is judged on the first reading whatever the headword; (c\') only where the headword is right. "Touches an annotation convention" are the 어절 whose gold derivation used a rule from the convention table below (compound, 적/씩 suffix, prefix, derived 하다 verb, numeral + unit, auxiliary/copula 어절 with the lemma column holding only the stem; plural 들 does not count).', '');

  h(3, 'By gold class');
  L.push(`| measure | ${POS_ORDER.join(' | ')} |`, `|---|${POS_ORDER.map(() => '---').join('|')}|`);
  const posDims = POS_ORDER.map((p) => `pos:${p}`);
  const prow = (label: string, t: Tally): string => `| ${label} | ${posDims.map((d) => pct(...t.get(d))).join(' | ')} |`;
  L.push(prow('(a) first headword right, strict', T.lemma), prow('(a\') first headword right, lenient', T.lemmaLenient), prow('(b) right headword in any reading', T.any), prow('(c) first part of speech right', T.pos), prow('(e) unconfirmed first reading', T.unconfirmed), prow('(e\') confident and wrong', T.confWrong));

  h(3, 'Rank of the right headword (strict)');
  L.push('| rank of the first reading with the gold headword | 어절 |', '|---|---|');
  for (const k of ['1', '2', '3', '4+', 'none']) L.push(`| ${k} | ${pct(rankHist.get(k) ?? 0, D)} |`);

  h(3, 'Homonym state of the first reading');
  const homTotal = homCount.undecided + homCount.numbered + homCount.plain;
  L.push('| first reading is | 어절 |', '|---|---|', `| plain (a bare headword, no number) | ${pct(homCount.plain, D)} |`, `| undecided (the bare lemma of a balanced homonym set) | ${pct(homCount.undecided, D)} |`, `| numbered (눈¹) | ${pct(homCount.numbered, D)} |`, `| no reading | ${pct(homCount.none, D)} |`);
  void homTotal;

  h(2, '(d) Segmentation: particles and endings');
  const comparable = recs.filter((r) => r.chainGold && r.first).length;
  const incomparable = recs.filter((r) => !r.chainGold).length;
  L.push(`Compared on the CHAIN after the head: gold = the morphemes after the head in the gold segmentation (derivational 하/되/시키/… and the parts of a compound belong to the head); system = the first reading's parts after its stem (a light-verb part and the nominal components of a compound belong to the head). Both sides are NORMALISED by \`normMorph\`: hyphens and optional (으)/(이) removed; allomorphs folded (은/는/ㄴ → ㄴ, 을/를/ㄹ → ㄹ, 이/가 → 이, 과/와 → 과, (으)로 → 로, 았/었/였/ㅆ → 었, a leading 아/여 → 어 (아서 = 어서), ㅂ니다/습니다 → 습니다, 는다 → ㄴ다, a leading 으 before a consonant syllable removed (으면 = 면), a leading 이 of a particle that has a vowel-final form removed (이나 = 나), 음/ㅁ → ㅁ, 에요 → 어요). The class of the morpheme is NOT compared (the copula 이 and the subject particle 이 are both "이"); what is compared is which particles and endings the first reading names, in order.`, '');
  L.push(`Comparable 어절: ${comparable} (gold chain texts known and a first reading present); not comparable: ${incomparable} (the lemma column holds only the stem, for an 어절 that starts with an auxiliary or the copula), plus those with no reading.`, '');
  L.push('| measure | value |', '|---|---|');
  L.push(`| exact chain match (same normalised morphemes, same order), all comparable | ${pct(...chainT.exact.get('all'))} |`);
  L.push(`| chain letters match (same text, ignoring where the cuts fall), all comparable | ${pct(...chainT.concat.get('all'))} |`);
  L.push(`| exact chain match, where the headword is also right (strict) | ${pct(...chainT.exactLemmaOk.get('all'))} |`);
  L.push(`| chain letters match, where the headword is also right | ${pct(...chainT.concatLemmaOk.get('all'))} |`);
  L.push(`| exact chain match WITHOUT the convention differences (no compound, 적-type suffix, prefix, derived verb, numeral+unit) | ${pct(...chainT.exactClean.get('all'))} |`);
  L.push(`| chain letters match WITHOUT the convention differences | ${pct(...chainT.concatClean.get('all'))} |`);
  const f1s = (x: { tp: number; p: number; r: number }): string => (x.p && x.r ? `P ${((100 * x.tp) / x.p).toFixed(2)} % (${x.tp} / ${x.p}), R ${((100 * x.tp) / x.r).toFixed(2)} % (${x.tp} / ${x.r}), F1 ${((200 * x.tp) / (x.p + x.r)).toFixed(2)} %` : 'n/a');
  L.push(`| per-morpheme F1 (bag of normalised morphemes), all comparable | ${f1s(f1)} |`);
  L.push(`| per-morpheme F1, where the headword is right | ${f1s(f1ok)} |`);
  L.push(`| per-morpheme F1, without the convention differences | ${f1s(f1clean)} |`);
  h(3, 'Convention differences between the two annotation schemes');
  L.push('Each is a place where a correct analysis by this pack may still differ from the gold; the figures above are given with and without the ones that touch the headword or the chain. An 어절 may touch several.', '');
  L.push('| convention | 어절 touched | examples |', '|---|---|---|');
  const convNotes: Record<string, string> = {
    'gold convention: compound': 'KAIST splits a noun compound into morphemes (서양+남자); the lexicon holds many compounds whole and the system may read them as one headword or as parts. Gold primary = the compound joined; lenient also accepts its first or last part.',
    'gold convention: xsn-derived': 'a noun + derivational suffix (적, 씨, 씩, 쯤, 간, 상 …) is two morphemes in KAIST; the Wiktionary-based lexicon often holds the derived word (이상적) as a headword. Strict = the base noun; lenient also the joined word. Plural 들 is not counted here.',
    'gold convention: xsn-plural': 'noun + 들 (plural): gold chain item 들; not a convention difference for the headword.',
    'gold convention: xsa-adverb': 'noun + 히 (정확히): gold joins them as the adverb; lenient also accepts the base or base+하다.',
    'gold convention: prefix': 'an xp prefix (불, 비, 부) is its own morpheme; gold headword = prefix + word, lenient also the word alone.',
    'gold convention: derived-verb': 'noun + 하/되/시키/받/당하 is ONE derived predicate (공부하다) in gold; strict requires that headword; lenient also accepts the base noun (a light-verb reading when the lexicon has no 하다 headword).',
    'gold convention: derived-adjective': 'noun + 하/스럽/롭/답 as a derived adjective (유능하다); same treatment.',
    'gold convention: numeral-unit': 'a numeral followed by a unit noun (삼십년): gold head = the numeral run; the unit is a chain item.',
    'gold convention: stem-only-lemma': 'the 어절 starts with an auxiliary (px) or the copula (jp): the UD lemma column holds only the stem, so the head is stem + 다 and the ENDING TEXTS ARE NOT KNOWN: such an 어절 is scored on the headword but not on the chain.',
    'gold convention: hanja-lemma': 'the gold lemma is written in Hanja (神); the system answers in Hangul. Excluded from accuracy and counted here.',
  };
  for (const [k, v] of [...convCount.entries()].sort((a, b) => b[1].n - a[1].n)) L.push(`| ${k}${convNotes[k] ? ': ' + convNotes[k] : ''} | ${v.n} | ${v.ex.join('; ')} |`);
  L.push('', 'Further differences that are not counted by token: (1) KAIST distinguishes jcs / jcc / jco (subject, complement, object) and jxc/jxt (auxiliary, topic) particles; the comparison uses the morpheme text only, so a case label is never judged. (2) KAIST fuses some pre-final endings into one morpheme (었겠, 어야겠, ㄴ다거나); the system lists them apart; the "letters match" figure ignores this. (3) UD gives the copula 어절 (서울입니다) the UPOS VERB; the shared part of speech here is the head noun\'s, with the copula in the chain. (4) The UD UPOS of an mma word is ADJ; the head tag mapping above calls it DET (the pack\'s PLAN table). (5) KAIST writes ㄴ, ㄹ, ㅁ, ㅂ니다 as separate jamo morphemes; the system writes them the same way (-ㄴ, -ㄹ) but where it fuses a syllable the spans overlap.');

  h(2, '(f) Order = confidence');
  L.push(`Readings whose confidence RISES down the list (must be 0): **${orderViolations}** of ${wordTokensAnalysed} analysed word tokens. Tokens where the first reading's confidence is not strictly above the second's (PLAN: it must be): ${firstNotAboveSecond}.`);

  h(2, '(g) Time');
  L.push(`- ${opts.mode === 'token' ? 'koAnalyzeToken, one 어절 at a time' : 'adapter tokenize + analyze, one sentence at a time'}: ${wordTokensAnalysed} word tokens in ${(analyseMs / 1000).toFixed(2)} s = **${(wordTokensAnalysed / (analyseMs / 1000)).toFixed(0)} tokens per second** (analysis cache warm for repeats, as in a host).`);
  if (opts.mode === 'token') L.push(`- distinct forms analysed cold (first call, cache empty for that form): ${coldMs.size} in ${(coldTotal / 1000).toFixed(2)} s = ${(coldMs.size / (coldTotal / 1000)).toFixed(0)} forms per second.`);
  L.push(`- loading ${opts.coreOnly ? 'the compiled core only' : `${loadedShards} of ${manifestShards} shards (every shard the run needed, including the gold headwords)`}: ${(loadMs / 1000).toFixed(2)} s (disk, no network).`, '');
  if (opts.mode === 'token') {
    L.push('Slowest 20 distinct 어절 (cold, ms):', '', '| 어절 | ms |', '|---|---|');
    for (const [f, ms] of slowest) L.push(`| ${f} | ${ms.toFixed(2)} |`);
  }

  h(2, '(e) Confident and wrong: the 60 commonest tokens');
  L.push('First reading confidence >= 0.8, not unconfirmed, headword wrong against strict gold. Counted per running token; the form is shown with the first reading (lemma/pos confidence) and the gold.', '', '| 어절 | n | first reading | gold |', '|---|---|---|---|');
  for (const [f, v] of [...confidentWrongTokens.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 60)) L.push(`| ${f} | ${v.n} | ${v.first} | ${v.gold} |`);

  h(2, 'Error classes (first-reading headword wrong, strict)');
  const nWrong = recs.filter((r) => !r.strict).length;
  L.push(`${nWrong} of ${D} scored 어절 have a wrong first headword (strict). Each is placed in ONE class by cause, in this order: no reading at all; alignment failure (adapter mode); right under the lenient alternatives (annotation scheme); headword missing from the lexicon; headword in the lexicon only under another class; the right headword is a LATER reading (split by what the first reading is); the first reading is unconfirmed; the right headword is never produced. The share is of all ${nWrong} errors. Examples are the commonest 어절 of the class: form → first reading | gold.`, '');
  L.push('| # | class | tokens | share of errors | by gold class | examples |', '|---|---|---|---|---|---|');
  let ci = 0;
  for (const [cls, v] of [...classes.entries()].sort((a, b) => b[1].n - a[1].n)) {
    ci++;
    const ex = [...v.pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, n]) => `${p}${n > 1 ? ` ×${n}` : ''}`);
    const byPos = [...v.pos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p, n]) => `${p} ${n}`).join(', ');
    L.push(`| ${ci} | ${cls} | ${v.n} | ${pctOnly(v.n, nWrong)} | ${byPos} | ${ex.join('<br>')} |`);
  }
  h(3, 'Headwords missing from the lexicon: the 80 commonest');
  const missTotal = [...missingHead.values()].reduce((a, b) => a + b, 0);
  L.push(`${missTotal} tokens, ${missingHead.size} distinct headword/class pairs. By gold class: ${[...missingByPos.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(', ')}. "Missing" = no row of that headword (any homonym) under a compatible class in the core or in any shard loaded${opts.coreOnly ? ' (core only: this run did not load the shards, so the figure is inflated)' : ''}.`, '');
  L.push('| headword/class | tokens |', '|---|---|');
  for (const [k, n] of [...missingHead.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80)) L.push(`| ${k} | ${n} |`);
  h(3, 'Endings and particles the analyser never produced (named)');
  L.push('From the "form not explained" class: gold chain morphemes (normalised) that no reading of any dev 어절 contains in this run, so the analyser very probably lacks them. A proxy, not a proof.', '', '| normalised morpheme | 어절 |', '|---|---|');
  for (const [k, n] of [...missingEl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) L.push(`| ${k} | ${n} |`);

  if (opts.mode === 'adapter') {
    h(2, 'Alignment (adapter mode)');
    L.push(`${adapterSentenceCount} sentences. Alignment failures (no adapter word token starts where the gold 어절 starts, or the gold form is not in the sentence text): ${alignFailures} of ${D} scored 어절. 어절 the adapter split into more than one word token or left uncovered (the first token\'s reading is judged): ${splitTokens}.${adapterPlaceholder ? ' **The adapter was still the PLACEHOLDER (package S had not landed): its single unconfirmed reading per token is expected to score near zero on the headword.**' : ''}`);
  }

  // other modes
  const others: string[] = [];
  for (const m of ['token', 'token-core', 'adapter']) {
    const f = path.join(opts.out, `result-${opts.split}-${m}.json`);
    if (!fs.existsSync(f)) continue;
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    others.push(`| ${r.mode}${r.coreOnly ? ' (core only)' : ''} | ${r.adapter || '-'} | ${r.sentences} | ${r.scored} | ${pctOnly(r.lemma[0], r.lemma[1])} | ${pctOnly(r.lemmaLenient[0], r.lemmaLenient[1])} | ${pctOnly(r.any[0], r.any[1])} | ${pctOnly(r.pos[0], r.pos[1])} | ${pctOnly(r.unconfirmed[0], r.unconfirmed[1])} | ${pctOnly(r.confWrong[0], r.confWrong[1])} | ${pctOnly(r.chainExact[0], r.chainExact[1])} | ${r.orderViolations} | ${r.tokensPerSecond.toFixed(0)} |`);
  }
  if (others.length) {
    h(2, 'Runs on file (the same script, dev split)');
    L.push('| mode | adapter | sentences | scored | (a) strict | (a\') lenient | (b) any | (c) pos | (e) unconfirmed | (e\') confident+wrong | exact chain | order violations | tokens/s |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|', ...others);
  }

  h(2, 'What this does not measure');
  L.push('- **Domains.** The treebank is written, edited, mostly 1990s-style expository prose, news and literature (and some academic text). It does NOT represent: speech or transcripts; the polite 해요체 forms a learner meets first (the treebank is overwhelmingly 하다체/해라체 narration and 합쇼체 in a few fiction passages, so 해요체 is almost absent); web text, chat, slang, neologisms, abbreviations; Bible prose and literary or archaic endings (-느니라, -나이다); Sino-Korean words in Hanja; children\'s text; dialogue-heavy modern fiction; text with numbers and Latin script (those 어절 are excluded here).');
  L.push('- **Favourable to the lexicon**: its counts come from train of the same treebank. Other text will score lower; the "not seen in train" column is the nearer guess, not a bound.');
  L.push('- **Meaning.** Only headword, shared part of speech and the particle/ending chain are compared. Nothing here says the gloss, the homonym choice, the features (tense, honorific, speech level, case), the constructions, the pronunciation or the phrase layer are right.');
  L.push('- **One gold reading per 어절.** The annotation gives one analysis; where a form is genuinely ambiguous the first reading may be a right answer the gold does not choose. "Any reading" recall measures the room the analyser leaves, not its choice.');
  L.push('- **Excluded 어절** (punctuation, symbols, foreign words, numbers in digits, bare particles, Hanja lemmas) are not scored; the analyser\'s behaviour on them (the digit + counter case 1445년, Latin + particle KBS가) is not measured here.');
  L.push('- **Head only.** Where an 어절 holds a second content word (a compound the lexicon reads as parts, an auxiliary 해보았다), only the first head is judged; the rest enters the chain comparison as content items.');
  L.push('- The test split has NOT been run.');

  const md = L.join('\n') + '\n';
  fs.writeFileSync(path.join(opts.out, `EVAL-${opts.split}-${opts.mode}${opts.coreOnly ? '-core' : ''}.md`), md);
  if (opts.write) fs.writeFileSync(path.resolve(process.cwd(), 'docs', 'korean', 'EVAL.md'), md);

  console.log(scope.replace(/\*\*/g, ''));
  console.log(`(a) first headword right  strict ${pct(...T.lemma.get('all'))}   lenient ${pct(...T.lemmaLenient.get('all'))}`);
  console.log(`(b) any reading            strict ${pct(...T.any.get('all'))}   lenient ${pct(...T.anyLenient.get('all'))}`);
  console.log(`(c) first pos right        ${pct(...T.pos.get('all'))}   given lemma ${pct(...T.posGivenLemma.get('all'))}`);
  console.log(`(d) chain exact ${pct(...chainT.exact.get('all'))}   letters ${pct(...chainT.concat.get('all'))}   F1 ${f1s(f1)}`);
  console.log(`(e) unconfirmed ${pct(...T.unconfirmed.get('all'))}   confident+wrong ${pct(...T.confWrong.get('all'))}`);
  console.log(`(f) order violations ${orderViolations}   first-not-above-second ${firstNotAboveSecond}`);
  console.log(`(g) ${(wordTokensAnalysed / (analyseMs / 1000)).toFixed(0)} tokens/s; analyse ${(analyseMs / 1000).toFixed(2)} s; load ${(loadMs / 1000).toFixed(2)} s`);
  for (const [cls, v] of [...classes.entries()].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(v.n).padStart(5)}  ${pctOnly(v.n, nWrong).padStart(8)}  ${cls}`);
}

// the run starts unless a test runner is importing this file
if (!process.env.VITEST) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
