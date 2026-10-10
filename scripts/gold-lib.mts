/**
 * Gold-set library (GoLearn Linguistic Engine V2, Stage 8; 2026-10-10): file formats, loaders, the sampler and the scorer.
 *
 * HONESTY. Every label in data/gold/<lang>/{selections-dev,hard,unseen}.json was written by an AI model (Claude) and has NOT been
 * checked by a native speaker. A score against these files measures agreement with an AI annotator, not correctness. The files
 * were labelled WITHOUT running the analysers on the items, and the engine is never tuned to them; the `unseen` sets are never to
 * be used for tuning at all.
 *
 * Used by: scripts/gold-score.mts (CLI), scripts/gold-build.mts (sampler / merger), test/gold/*.test.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseSelection, getAnalyser } from '../packages/golearn-extension/src/parser';
import { createPackRuntime, PACKS } from '../packages/language-packs/src';
import type { PackRuntime } from '../packages/language-packs/src';
import type { AnalyzedToken, LanguageAdapter, RawToken } from '../src/core';
import { registerAllAnalysers } from '../test/support/analysers';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const GOLD_DIR = path.join(ROOT, 'data', 'gold');
export const GOLD_LANGS = ['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn'] as const;
export type GoldLang = (typeof GOLD_LANGS)[number];
export type GoldSet = 'dev' | 'hard' | 'unseen';
export const SET_FILE: Record<GoldSet, string> = { dev: 'selections-dev.json', hard: 'hard.json', unseen: 'unseen.json' };
/** The minimum number of items each file must hold (checked by the structural tests). */
export const MIN_ITEMS: Record<GoldSet, number> = { dev: 200, hard: 50, unseen: 60 };
export const LABELLED_BY = 'Claude (AI-judged, unreviewed; no native speaker)';

export interface GoldFeatures { [key: string]: string }
export interface GoldItem {
  id: string;
  /** The text the sentence came from (corpus text id, or `GEN.2.4` for a verified verse). */
  text: string;
  sentence: string;
  /** UTF-16 offsets of the selection in `sentence`. */
  start: number;
  end: number;
  surface: string;
  lemma: string;
  pos: string;
  features: GoldFeatures;
  /** The word's UD dependency relation in this sentence (optional; dev items carry it). */
  relation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** The surface has two or more plausible readings out of context (homograph, syncretism). */
  ambiguous?: boolean;
  /** Hard items: the class of difficulty. */
  category?: string;
  why_hard?: string;
  /** Hard items: the analysis a naive engine would give. */
  wrong?: { lemma?: string; pos?: string; features?: GoldFeatures; note?: string };
  /** Thai hard items: the words the selection should be cut into. */
  expected_segmentation?: string[];
}
export interface GoldFile {
  language: string;
  labelled_by: string;
  created: string;
  purpose: GoldSet;
  /** Where the sentences come from, in plain words. */
  source: string;
  /** The feature keys the labeller was asked to cover (the scorer scores only these). */
  feature_keys: string[];
  notes?: string;
  items: GoldItem[];
}

export function goldPath(lang: string, set: GoldSet): string { return path.join(GOLD_DIR, lang, SET_FILE[set]); }
export function loadGold(lang: string, set: GoldSet): GoldFile | undefined {
  const p = goldPath(lang, set);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as GoldFile) : undefined;
}

/** Structural problems of a gold file (empty list when it is sound). */
export function validateGold(f: GoldFile, lang: string, set: GoldSet): string[] {
  const errs: string[] = [];
  if (f.language !== lang) errs.push(`language is ${f.language}, expected ${lang}`);
  if (f.labelled_by !== LABELLED_BY) errs.push('labelled_by header missing or changed');
  if (f.created !== '2026-10-10') errs.push(`created is ${f.created}`);
  if (f.purpose !== set) errs.push(`purpose is ${f.purpose}, expected ${set}`);
  if (!Array.isArray(f.feature_keys) || !f.feature_keys.length) errs.push('feature_keys missing');
  if (!f.source) errs.push('source missing');
  if (!Array.isArray(f.items) || f.items.length < MIN_ITEMS[set]) errs.push(`only ${f.items?.length ?? 0} items, need ${MIN_ITEMS[set]}`);
  const ids = new Set<string>();
  for (const it of f.items ?? []) {
    if (ids.has(it.id)) errs.push(`${it.id}: duplicate id`);
    ids.add(it.id);
    if (!it.sentence || it.sentence.slice(it.start, it.end) !== it.surface) errs.push(`${it.id}: offsets ${it.start}-${it.end} do not cut "${it.surface}" from the sentence`);
    if (!it.lemma) errs.push(`${it.id}: no lemma`);
    if (!it.pos) errs.push(`${it.id}: no pos`);
    if (!it.features || typeof it.features !== 'object') errs.push(`${it.id}: no features object`);
    if (set === 'hard') {
      if (!it.why_hard) errs.push(`${it.id}: no why_hard`);
      if (!it.wrong) errs.push(`${it.id}: no wrong analysis`);
      if (!it.category) errs.push(`${it.id}: no category`);
    }
    if (!['easy', 'medium', 'hard'].includes(it.difficulty)) errs.push(`${it.id}: bad difficulty`);
  }
  return errs;
}

// ───────────────────────────── runtime ─────────────────────────────

let registered = false;
export function ensureAnalysers(): void { if (!registered) { registerAllAnalysers(); registered = true; } }

/** A fetch that reads the built shards from public/ on disk (what the hosted copy serves). */
export const fileFetch: typeof fetch = (async (input: RequestInfo | URL) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const rel = u.replace(/^[a-z]+:\/\/[^/]+\//i, '').replace(/^\/+/, '');
  const p = path.resolve(ROOT, 'public', rel);
  if (!fs.existsSync(p)) return new Response('not found', { status: 404 });
  return new Response(fs.readFileSync(p), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

/** True when the schema-3 dictionary shards of a language are on disk (nb and nn have none). */
export function dictShardsPresent(lang: string): boolean {
  return fs.existsSync(path.join(ROOT, 'public', 'dict', lang, 'manifest.json'));
}

// ───────────────────────────── sampling ─────────────────────────────

export interface Skeleton { id: string; text: string; sentence: string; start: number; end: number; surface: string }

export function corpusSentences(lang: string, filter: (id: string) => boolean): Array<{ text: string; sentence: string }> {
  const dir = path.join(ROOT, 'data', 'corpus', lang);
  const out: Array<{ text: string; sentence: string }> = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const id = f.replace(/\.json$/, '');
    if (!filter(id)) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { sections?: Array<{ paragraphs?: Array<{ sentences?: Array<{ text?: string }> }> }> };
    for (const s of j.sections ?? []) for (const p of s.paragraphs ?? []) for (const x of p.sentences ?? []) if (x.text?.trim()) out.push({ text: id, sentence: x.text.trim().normalize('NFC') });
  }
  return out;
}

export function wordTokens(a: LanguageAdapter, sentence: string): RawToken[] {
  try { return a.tokenize(sentence).filter((t) => t.isWord && /\p{L}/u.test(t.surface)); } catch { return []; }
}

/** Every-k-th word selections over a pool of sentences, at most `cap` per lower-cased surface (raised stepwise when the pool is small). */
export function sampleSelections(a: LanguageAdapter, pool: Array<{ text: string; sentence: string }>, n: number, idPrefix: string): Skeleton[] {
  const all: Array<Omit<Skeleton, 'id'>> = [];
  for (const s of pool) for (const t of wordTokens(a, s.sentence)) all.push({ text: s.text, sentence: s.sentence, start: t.start, end: t.end, surface: t.surface });
  for (const cap of [3, 5, 8, 12, 1000]) {
    const seen = new Map<string, number>();
    const eligible = all.filter((x) => { const k = x.surface.toLowerCase(); const c = seen.get(k) ?? 0; if (c >= cap) return false; seen.set(k, c + 1); return true; });
    if (eligible.length >= n || cap === 1000) {
      const picked = eligible.length <= n ? eligible : Array.from({ length: n }, (_, i) => eligible[Math.floor((i * eligible.length) / n)]);
      return picked.map((x, i) => ({ id: `${idPrefix}-${String(i + 1).padStart(3, '0')}`, ...x }));
    }
  }
  return [];
}

// ───────────────────────────── scoring ─────────────────────────────

export const METRICS = [
  'lemma accuracy', 'POS accuracy', 'feature precision', 'feature recall', 'feature F1', 'role / relation accuracy', 'paradigm round-trip share',
  'dictionary hit rate', 'definition availability', 'etymology availability', 'IPA availability', 'alternatives-kept rate', 'conflict rate', 'latency (ms)',
] as const;

export interface FeatureTally { tp: number; pred: number; gold: number; tpLenient: number }
export interface ItemResult {
  id: string; surface: string; goldLemma: string; goldPos: string; engineLemma?: string; enginePos?: string;
  lemmaOk: boolean; posOk: boolean; bothOk: boolean; goldInCandidates: boolean; conflict: boolean; ambiguous: boolean; naiveWrong: boolean; tokenAligned: boolean;
}
export interface SetResult {
  language: string; set: GoldSet; n: number; scored: number; errors: number;
  lemma: number; pos: number; both: number;
  featureTotals: FeatureTally; featuresByKey: Record<string, FeatureTally>;
  precision: number | null; recall: number | null; f1: number | null; precisionLenient: number | null; recallLenient: number | null; f1Lenient: number | null;
  role: { coverage: number; mappedN: number; accuracy: number | null; note: string };
  relation: { n: number; accuracy: number | null; note: string };
  syntaxGold: { uas: number | null; las: number | null; n: number; note: string };
  dictionary: { available: boolean; hit: number | null; definition: number | null; etymology: number | null; ipa: number | null; note: string };
  alternativesKept: { n: number; kept: number | null; topOk: number | null };
  conflictRate: number;
  naiveWrongRate: number | null;
  tokenAligned: number;
  segmentation: { n: number; exact: number | null };
  latency: { parseMs: number; dictMs: number; totalMs: number };
  byDifficulty: Record<string, { n: number; both: number }>;
  errorClasses: Array<{ cls: string; count: number; examples: string[] }>;
  items?: ItemResult[];
}

const norm = (s: string | undefined): string => (s ?? '').normalize('NFC').toLowerCase().trim();
const valueSet = (v: string | undefined): string[] => (v === undefined ? [] : v.split(/[,|]/).map((x) => x.trim()).filter(Boolean));
const ratio = (a: number, b: number): number | null => (b ? a / b : null);

/** Parser `role` labels that name a UD relation unambiguously (everything else is a functional-word label with no UD counterpart). */
export function roleToRelation(role: string | undefined): string | undefined {
  if (!role) return undefined;
  const r = role.toLowerCase();
  if (/^(preposition|postposition|case marker)/.test(r)) return 'case';
  if (/negation/.test(r)) return 'advmod';
  if (/article/.test(r)) return 'det';
  if (/^copula|\bcopula\b/.test(r)) return 'cop';
  if (/auxiliary/.test(r)) return 'aux';
  if (/(subordinat|relative marker|complementi[sz]er)/.test(r)) return 'mark';
  if (/coordinat|and-connective|or-connective/.test(r)) return 'cc';
  return undefined;
}

export interface ScoreOptions { limit?: number; keepItems?: boolean; dict?: boolean }

const runtimes = new Map<string, PackRuntime | undefined>();
function packRuntime(lang: string): PackRuntime | undefined {
  if (!runtimes.has(lang)) {
    const manifest = PACKS[lang];
    runtimes.set(lang, manifest && dictShardsPresent(lang) ? createPackRuntime(manifest, { fetch: fileFetch, baseUrl: '/' }) : undefined);
  }
  return runtimes.get(lang);
}

/** The relation (UD label) the adapter's own syntax gives the token at [start,end), when the adapter has `syntax`. */
function syntaxRelationOf(a: LanguageAdapter, tokens: RawToken[], analyses: AnalyzedToken[], idx: number): string | undefined {
  if (!a.syntax) return undefined;
  try { return a.syntax(tokens, analyses)?.relations.find((r) => r.dependent === idx)?.relation; } catch { return undefined; }
}

export async function scoreSet(lang: string, set: GoldSet, file: GoldFile, opts: ScoreOptions = {}): Promise<SetResult> {
  ensureAnalysers();
  const a = getAnalyser(lang);
  if (!a) throw new Error(`no analyser for ${lang}`);
  const items = opts.limit ? file.items.slice(0, opts.limit) : file.items;
  const keys = file.feature_keys;
  const runtime = opts.dict === false ? undefined : packRuntime(lang);
  const res: SetResult = {
    language: lang, set, n: items.length, scored: 0, errors: 0, lemma: 0, pos: 0, both: 0,
    featureTotals: { tp: 0, pred: 0, gold: 0, tpLenient: 0 }, featuresByKey: {},
    precision: null, recall: null, f1: null, precisionLenient: null, recallLenient: null, f1Lenient: null,
    role: { coverage: 0, mappedN: 0, accuracy: null, note: '' }, relation: { n: 0, accuracy: null, note: '' }, syntaxGold: { uas: null, las: null, n: 0, note: '' },
    dictionary: { available: !!runtime, hit: null, definition: null, etymology: null, ipa: null, note: runtime ? '' : 'no schema-3 dictionary shards for this language' },
    alternativesKept: { n: 0, kept: null, topOk: null }, conflictRate: 0, naiveWrongRate: null, tokenAligned: 0, segmentation: { n: 0, exact: null },
    latency: { parseMs: 0, dictMs: 0, totalMs: 0 }, byDifficulty: {}, errorClasses: [],
  };
  const out: ItemResult[] = [];
  let roleGiven = 0; let roleMapped = 0; let roleOk = 0; let relN = 0; let relOk = 0; let hasRelationFn = false;
  let dictHit = 0; let defOk = 0; let etyOk = 0; let ipaOk = 0; let dictN = 0;
  let ambN = 0; let ambKept = 0; let ambTop = 0; let conflicts = 0; let wrongN = 0; let naive = 0; let aligned = 0; let segN = 0; let segOk = 0;
  const classes = new Map<string, { count: number; examples: string[] }>();
  const bump = (cls: string, ex: string): void => { const c = classes.get(cls) ?? { count: 0, examples: [] }; c.count++; if (c.examples.length < 3) c.examples.push(ex); classes.set(cls, c); };

  for (const g of items) {
    const t0 = performance.now();
    let card: ReturnType<typeof parseSelection>;
    try { card = parseSelection({ surface: g.surface, context: { kind: 'sentence', confidence: 1, sentence: g.sentence, selStart: g.start, selEnd: g.end }, languageId: lang }); } catch { res.errors++; continue; }
    const tParse = performance.now() - t0;
    res.scored++;
    res.latency.parseMs += tParse;

    // candidates at the adapter level (the parser keeps lemma/pos only for the alternatives)
    const tokens = a.tokenize(g.sentence);
    const analyses = a.analyze(tokens);
    const hit = tokens.map((t, i) => (t.isWord && t.start < g.end && t.end > g.start ? i : -1)).filter((i) => i >= 0);
    const single = hit.length === 1 ? hit[0] : -1;
    if (tokens.some((t) => t.isWord && t.start === g.start && t.end === g.end)) aligned++;
    const cands = single >= 0 ? analyses[single].candidates : [];

    const lemmaOk = norm(card.lemma) === norm(g.lemma);
    const posOk = norm(card.pos) === norm(g.pos);
    const bothOk = lemmaOk && posOk;
    const goldIn = cands.some((c) => norm(c.lemma) === norm(g.lemma) && norm(c.pos) === norm(g.pos));
    const conflict = !bothOk && goldIn;
    if (lemmaOk) res.lemma++;
    if (posOk) res.pos++;
    if (bothOk) res.both++;
    if (conflict) conflicts++;
    const diff = res.byDifficulty[g.difficulty] ?? { n: 0, both: 0 };
    diff.n++; if (bothOk) diff.both++; res.byDifficulty[g.difficulty] = diff;
    if (g.ambiguous || g.category === 'ambiguity') { ambN++; if (goldIn) ambKept++; if (bothOk) ambTop++; }
    let naiveHit = false;
    if (g.wrong && (g.wrong.lemma || g.wrong.pos)) {
      wrongN++;
      naiveHit = (!g.wrong.lemma || norm(g.wrong.lemma) === norm(card.lemma)) && (!g.wrong.pos || norm(g.wrong.pos) === norm(card.pos)) && !bothOk;
      if (naiveHit) naive++;
    }
    if (!bothOk) {
      const cls = !card.lemma ? 'no reading' : !lemmaOk && !posOk ? 'lemma and POS wrong' : !lemmaOk ? 'lemma wrong' : 'POS wrong';
      bump(`${g.category ?? set} · ${cls}`, `${g.surface}: gold ${g.lemma}/${g.pos}, engine ${card.lemma ?? '-'}/${card.pos ?? '-'}`);
    }

    // features (top reading), over the keys the labeller covered
    const eng: Record<string, string> = {};
    for (const f of card.features) eng[f.key] = f.value;
    for (const k of keys) {
      const gv = g.features[k]; const ev = eng[k];
      if (gv === undefined && ev === undefined) continue;
      const t = (res.featuresByKey[k] ??= { tp: 0, pred: 0, gold: 0, tpLenient: 0 });
      if (gv !== undefined) { t.gold++; res.featureTotals.gold++; }
      if (ev !== undefined) { t.pred++; res.featureTotals.pred++; }
      if (gv !== undefined && ev !== undefined) {
        if (gv === ev) { t.tp++; res.featureTotals.tp++; }
        if (gv === ev || valueSet(ev).includes(gv)) { t.tpLenient++; res.featureTotals.tpLenient++; }
      }
    }

    // roles / relations
    if (card.role) {
      roleGiven++;
      const mapped = roleToRelation(card.role);
      if (mapped && g.relation) { roleMapped++; if (mapped === g.relation) roleOk++; }
    }
    if (a.syntax) {
      hasRelationFn = true;
      const rel = single >= 0 ? syntaxRelationOf(a, tokens, analyses, single) : undefined;
      if (g.relation && single >= 0) { relN++; if (rel === g.relation) relOk++; }
    }

    // segmentation (Thai hard items)
    if (g.expected_segmentation && a.segmentations) {
      segN++;
      try {
        const seg = a.segmentations(g.surface.length > 1 ? g.surface : g.sentence);
        const got = seg?.chosen.words.map((w) => w.text) ?? [];
        if (got.join('|') === g.expected_segmentation.join('|')) segOk++;
        else bump('Thai segmentation · cut differs', `${g.surface}: gold ${g.expected_segmentation.join('|')}, engine ${got.join('|')}`);
      } catch { /* adapter threw: counted as a miss */ }
    }

    // dictionary (the engine's own lemma, as the card asks for it)
    let tDict = 0;
    if (runtime && card.lemma) {
      dictN++;
      const forms = [...new Set([a.normalize(card.lemma), ...(a.lemmaVariants?.(card.lemma, card.pos as never) ?? []).map((v) => a.normalize(v))])].slice(0, 8);
      const t1 = performance.now();
      let gl: Awaited<ReturnType<PackRuntime['gloss']>>;
      let en: Awaited<ReturnType<PackRuntime['entry']>>;
      try { gl = await runtime.gloss(card.lemma, card.pos, forms); en = await runtime.entry(card.lemma, card.pos, forms); } catch { gl = undefined; en = undefined; }
      tDict = performance.now() - t1;
      const dict = !!(gl && gl.senses.length);
      if (dict) dictHit++;
      if (dict || card.gloss) defOk++;
      const rs = en?.records ?? [];
      if (rs.some((r) => r.ety)) etyOk++;
      if (rs.some((r) => r.ipa?.length)) ipaOk++;
    } else if (runtime) dictN++;
    res.latency.dictMs += tDict;
    if (opts.keepItems) out.push({ id: g.id, surface: g.surface, goldLemma: g.lemma, goldPos: g.pos, engineLemma: card.lemma, enginePos: card.pos, lemmaOk, posOk, bothOk, goldInCandidates: goldIn, conflict, ambiguous: !!(g.ambiguous || g.category === 'ambiguity'), naiveWrong: naiveHit, tokenAligned: aligned > 0 && tokens.some((t) => t.isWord && t.start === g.start && t.end === g.end) });
  }

  const n = res.scored;
  const T = res.featureTotals;
  res.precision = ratio(T.tp, T.pred); res.recall = ratio(T.tp, T.gold);
  res.f1 = res.precision !== null && res.recall !== null && res.precision + res.recall > 0 ? (2 * res.precision * res.recall) / (res.precision + res.recall) : null;
  res.precisionLenient = ratio(T.tpLenient, T.pred); res.recallLenient = ratio(T.tpLenient, T.gold);
  res.f1Lenient = res.precisionLenient !== null && res.recallLenient !== null && res.precisionLenient + res.recallLenient > 0 ? (2 * res.precisionLenient * res.recallLenient) / (res.precisionLenient + res.recallLenient) : null;
  res.role = { coverage: n ? roleGiven / n : 0, mappedN: roleMapped, accuracy: ratio(roleOk, roleMapped), note: 'parser `role` is a functional-word label; only labels with an unambiguous UD counterpart are compared (preposition→case, negation→advmod, article→det, …)' };
  res.relation = hasRelationFn
    ? { n: relN, accuracy: ratio(relOk, relN), note: 'adapter.syntax relation of the selected token vs gold `relation`' }
    : { n: 0, accuracy: null, note: 'n/a: adapter has no `syntax` at run time' };
  res.dictionary = { available: !!runtime, hit: runtime ? ratio(dictHit, dictN) : null, definition: runtime ? ratio(defOk, dictN) : null, etymology: runtime ? ratio(etyOk, dictN) : null, ipa: runtime ? ratio(ipaOk, dictN) : null, note: runtime ? 'measured on the engine\'s lemma (as the card asks); a selection with no engine lemma counts as a miss' : 'no schema-3 dictionary shards for this language' } as SetResult['dictionary'];
  res.alternativesKept = { n: ambN, kept: ratio(ambKept, ambN), topOk: ratio(ambTop, ambN) };
  res.conflictRate = n ? conflicts / n : 0;
  res.naiveWrongRate = ratio(naive, wrongN);
  res.tokenAligned = n ? aligned / n : 0;
  res.segmentation = { n: segN, exact: ratio(segOk, segN) };
  res.latency = { parseMs: n ? res.latency.parseMs / n : 0, dictMs: n ? res.latency.dictMs / n : 0, totalMs: n ? (res.latency.parseMs + res.latency.dictMs) / n : 0 };
  res.errorClasses = [...classes.entries()].map(([cls, v]) => ({ cls, ...v })).sort((x, y) => y.count - x.count).slice(0, 8);
  if (opts.keepItems) res.items = out;
  return res;
}

// ───────────────────────────── paradigm round trip ─────────────────────────────

export interface RoundTrip { lemmas: number; withParadigm: number; cells: number; lemmaAndFeatures: number; lemmaOnly: number; share: number | null; shareLemmaOnly: number | null; ignoredKeys: string[]; worst: Array<{ lemma: string; pos: string; cells: number; ok: number }> }

const IGNORED_CELL_KEYS = ['Variety'];

/** For every gold lemma: the adapter's paradigm cells, each form analysed again; does the analysis return the lemma and the cell's features? */
export function paradigmRoundTrip(lang: string, files: GoldFile[], maxLemmas = 150, maxCellsPerLemma = 80): RoundTrip {
  ensureAnalysers();
  const a = getAnalyser(lang);
  if (!a) throw new Error(`no analyser for ${lang}`);
  const seen = new Map<string, GoldItem>();
  for (const f of files) for (const it of f.items) { const k = `${norm(it.lemma)}|${it.pos}`; if (!seen.has(k)) seen.set(k, it); }
  const lemmas = [...seen.values()].slice(0, maxLemmas * 4);
  const r: RoundTrip = { lemmas: 0, withParadigm: 0, cells: 0, lemmaAndFeatures: 0, lemmaOnly: 0, share: null, shareLemmaOnly: null, ignoredKeys: IGNORED_CELL_KEYS, worst: [] };
  for (const it of lemmas) {
    if (r.lemmas >= maxLemmas) break;
    r.lemmas++;
    let p: ReturnType<NonNullable<LanguageAdapter['paradigm']>> | undefined;
    try { p = a.paradigm?.(it.lemma, it.pos as never, { features: it.features, surface: it.surface }); } catch { p = undefined; }
    if (!p || !p.cells.length) continue;
    r.withParadigm++;
    let cells = 0; let ok = 0;
    for (const cell of p.cells.slice(0, maxCellsPerLemma)) {
      if (!cell.form || !cell.form.trim()) continue;
      cells++; r.cells++;
      let toks: RawToken[]; let an: AnalyzedToken[];
      try { toks = a.tokenize(cell.form); an = a.analyze(toks); } catch { continue; }
      let lemmaHit = false; let fullHit = false;
      for (const t of an) {
        if (!t.token.isWord) continue;
        for (const c of t.candidates) {
          if (norm(c.lemma) !== norm(it.lemma)) continue;
          lemmaHit = true;
          const good = Object.entries(cell.features).every(([k, v]) => IGNORED_CELL_KEYS.includes(k) || valueSet(c.morph[k]).includes(v) || c.morph[k] === v);
          if (good) fullHit = true;
        }
      }
      if (lemmaHit) r.lemmaOnly++;
      if (fullHit) { r.lemmaAndFeatures++; ok++; }
    }
    r.worst.push({ lemma: it.lemma, pos: it.pos, cells, ok });
  }
  r.share = ratio(r.lemmaAndFeatures, r.cells);
  r.shareLemmaOnly = ratio(r.lemmaOnly, r.cells);
  r.worst = r.worst.filter((w) => w.cells > 0).sort((x, y) => x.ok / x.cells - y.ok / y.cells).slice(0, 5);
  return r;
}

// ───────────────────────────── syntax gold (other lane's file) ─────────────────────────────

/**
 * UAS / LAS against data/gold/<lang>/syntax-dev.json, when the file exists AND the adapter has `syntax`. The file is another
 * lane's; the reader accepts the layout nb/nn use (`tokens`: strings, `heads`: 1-based, 0 = root, `relations`) and `{sentences|items:[{text|sentence, tokens:[{form|surface|text, head, deprel|relation|rel}]}]}` with
 * `head` as a 1-based index (0 = root). Anything else scores n/a with the reason.
 */
export function syntaxGoldScore(lang: string): SetResult['syntaxGold'] {
  ensureAnalysers();
  const a = getAnalyser(lang);
  const p = path.join(GOLD_DIR, lang, 'syntax-dev.json');
  if (!fs.existsSync(p)) return { uas: null, las: null, n: 0, note: 'n/a: no data/gold/' + lang + '/syntax-dev.json yet' };
  if (!a?.syntax) return { uas: null, las: null, n: 0, note: 'n/a: adapter has no `syntax` at run time' };
  let j: { sentences?: unknown[]; items?: unknown[] };
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { uas: null, las: null, n: 0, note: 'n/a: syntax-dev.json is not valid JSON' }; }
  const list = (j.sentences ?? j.items ?? []) as Array<Record<string, unknown>>;
  let n = 0; let uas = 0; let las = 0;
  for (const s of list) {
    const text = String(s.text ?? s.sentence ?? '');
    let gt = (s.tokens ?? s.words) as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(s.tokens) && typeof s.tokens[0] === 'string' && Array.isArray(s.heads) && Array.isArray(s.relations)) {
      const heads = s.heads as number[]; const rels = s.relations as string[];
      gt = (s.tokens as string[]).map((form, i) => ({ form, head: heads[i], deprel: rels[i] }));
    }
    if (!text || !gt) continue;
    const toks = a.tokenize(text);
    const syn = a.syntax(toks, a.analyze(toks));
    if (!syn) continue;
    // align gold tokens to word tokens in order, by surface
    let ti = 0;
    const goldToTok: number[] = [];
    for (const g of gt) {
      const f = String(g.form ?? g.surface ?? g.text ?? '');
      let found = -1;
      for (let k = ti; k < toks.length; k++) if (toks[k].surface === f) { found = k; ti = k + 1; break; }
      goldToTok.push(found);
    }
    gt.forEach((g, gi) => {
      const dep = goldToTok[gi];
      if (dep < 0 || !toks[dep].isWord) return;
      const rawHead = Number(g.head);
      const rel = String(g.deprel ?? g.relation ?? g.rel ?? '').split(':')[0];
      if (Number.isNaN(rawHead) || !rel || rel === 'punct') return;
      const goldHead = rawHead === 0 ? undefined : goldToTok[rawHead - 1];
      n++;
      const r = syn.relations.find((x) => x.dependent === dep);
      if (!r) return;
      const headOk = (goldHead === undefined && r.head === undefined) || (goldHead !== undefined && r.head === goldHead);
      if (headOk) { uas++; if (r.relation === rel) las++; }
    });
  }
  return { uas: ratio(uas, n), las: ratio(las, n), n, note: n ? 'assumed file layout; see scripts/gold-lib.mts syntaxGoldScore' : 'n/a: no scorable tokens in syntax-dev.json (layout not recognised)' };
}
