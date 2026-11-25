/// <reference types="node" />
/**
 * npm run ko:build-lexicon -- [--in data/raw/kaikki-ko/kaikki.org-dictionary-Korean.jsonl] [--priors data/raw/ud-ko/ko_kaist-ud-train.conllu]
 *                             [--out public/lexicon/ko/standard] [--core-out src/adapters/korean/generated/core.ts]
 *                             [--limit 600000] [--core-budget 420000] [--date YYYY-MM-DD] [--docs docs/korean] [--accept-homonym-changes] [--no-write]
 *
 * Builds the Korean STEM lexicon (src/adapters/korean/index-store.ts, docs/korean/PLAN.md "Lexicon") from the Wiktionary Korean extract of
 * kaikki.org (CC BY-SA 4.0). The reading of the extract (what is kept, its class, its conjugation class from the entry's own infinitive, the
 * homonym sets, numbers and states, the glosses) is src/dict/korean.ts, shared with the dictionary build so that the two cannot drift.
 * Reads the reviewed inputs docs/korean/homonym-decisions.json and docs/korean/gloss-overrides.json when they exist (never writes them).
 * Writes
 *   - gzip SHARDS and manifest.json under --out (git-ignored; shards by koLexiconShardLetters),
 *   - the compiled CORE src/adapters/korean/generated/core.ts,
 *   - docs/korean/INDEX.md (the figures) and docs/korean/homonyms.json (the registry of numbered homonyms, guarded on rebuild).
 * Counts come from UD Korean-Kaist TRAIN only (CC BY-SA 4.0): the count in the priors corpus, never a frequency. Deterministic: same
 * inputs and --date, same bytes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { koKey } from '../src/adapters/korean/hangul';
import { koHomonymLemma, koHomonymSetKey, koLexiconShardLetters, koSharedPos, koStemKey, type KoLexEntry, type KoLexicon } from '../src/adapters/korean/index-store';
import {
  KO_CLOSED_TAGS, koBuildRows, koCompareRegistry, koCoreTuple, koCoreTupleJson, koLoadDocs, koPureHanja, koReadSlim, koRegistryOf, koSelectCore,
  type KoDocs, type KoRegistryRecord, type KoRow,
} from '../src/dict/korean';

const started = Date.now();
const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
const flags = new Set<string>();
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) { console.error(`bad argument ${args[i]}`); process.exit(1); }
  if (args[i] === '--no-write' || args[i] === '--accept-homonym-changes') { flags.add(args[i].slice(2)); continue; }
  if (args[i + 1] === undefined) { console.error(`${args[i]} needs a value`); process.exit(1); }
  opt[args[i].slice(2)] = args[i + 1]; i++;
}
const INPUT = opt.in ?? 'data/raw/kaikki-ko/kaikki.org-dictionary-Korean.jsonl';
const PRIORS = opt.priors ?? 'data/raw/ud-ko/ko_kaist-ud-train.conllu';
const OUT = opt.out ?? 'public/lexicon/ko/standard';
const CORE_OUT = opt['core-out'] ?? 'src/adapters/korean/generated/core.ts';
const LIMIT = Number(opt.limit ?? 600_000);
const CORE_BUDGET = Number(opt['core-budget'] ?? 420_000);
const TODAY = opt.date ?? new Date().toISOString().slice(0, 10);
const WRITE = !flags.has('no-write');
const DOC_OUT = 'docs/korean/INDEX.md';
const REGISTRY = 'docs/korean/homonyms.json';
const MAX_PREFIX = 3;
for (const f of [INPUT, PRIORS]) if (!fs.existsSync(f)) { console.error(`cannot read ${f}`); process.exit(1); }

const fmt = (n: number): string => n.toLocaleString('en');
const inc = (m: Record<string, number>, k: string, n = 1): void => { m[k] = (m[k] ?? 0) + n; };
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const sup = (n: number): string => String(n).split('').map((d) => SUP[Number(d)]).join('');

const SOURCE: KoLexicon['source'] = {
  label: 'Wiktionary Korean entries, via kaikki.org',
  licence: 'CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org)',
  url: 'https://kaikki.org/dictionary/Korean/kaikki.org-dictionary-Korean.jsonl',
  retrieved: opt.retrieved ?? '2026-11-25',
  sha256: crypto.createHash('sha256').update(fs.readFileSync(INPUT)).digest('hex'),
  note: 'Headword, class, conjugation class (read off the entry\'s own infinitive forms), first gloss, Hanja and pronunciation are the source\'s unless a reviewed override says otherwise; the homonym number is the entry\'s etymology number on its page. Extract of 2026-10-30 from the enwiktionary dump of 2026-10-01. Counts from UD Korean-Kaist train (CC BY-SA 4.0).',
};

// ───────────────────────────── the extract ─────────────────────────────

const raws = await koReadSlim(INPUT);
let docs: KoDocs;
let built: ReturnType<typeof koBuildRows>;
try { docs = koLoadDocs(opt.docs ?? 'docs/korean'); built = koBuildRows(raws, docs); } catch (e) { console.error(`ko:build-lexicon: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); }
const { rows, report } = built;
console.log(`${fmt(raws.length)} entries read, ${fmt(rows.length)} kept (${fmt(report.merges)} merged), ${fmt(Date.now() - started)} ms`);

// ───────────────────────────── priors (UD Korean-Kaist train) ─────────────────────────────

/** Kaist morpheme tag → [class, shared part of speech or tag]. */
const KAIST: Record<string, [string, string]> = {
  ncn: ['NNG', 'NOUN'], ncpa: ['NNG', 'NOUN'], ncps: ['NNG', 'NOUN'], nq: ['NNP', 'PROPN'], nbn: ['NNB', 'NOUN'], nbu: ['NNB', 'CLF'], npp: ['NP', 'PRON'], npd: ['NP', 'PRON'],
  nnc: ['NR', 'NUM'], nno: ['NR', 'NUM'], pvg: ['VV', 'VERB'], pvd: ['VV', 'VERB'], paa: ['VA', 'ADJ'], pad: ['VA', 'ADJ'], px: ['VX', 'AUX'], mag: ['MAG', 'ADV'], mad: ['MAG', 'ADV'],
  maj: ['MAJ', 'CONJ'], mma: ['MM', 'DET'], mmd: ['MM', 'DET'], ii: ['IC', 'INTJ'], xsn: ['XSN', 'XSN'], xsv: ['XSV', 'XSV'], xsa: ['XSA', 'XSA'], xp: ['XPN', 'XPN'],
};
const PREDICATE_KAIST = new Set(['pvg', 'pvd', 'paa', 'pad', 'px', 'xsv', 'xsa']);
const priorCount = new Map<string, number>(); // "<lemma>\0<shared part of speech>" -> occurrences (the count of the SPELLING in that part of speech)
const classCount = new Map<string, number>(); // "<lemma>\0<Kaist class>" -> occurrences (for the coverage table)
const tagsMet: Record<string, number> = {};
let kaistMorphemes = 0; let kaistWordLines = 0; let kaistBadLines = 0;
{
  const rl = readline.createInterface({ input: fs.createReadStream(PRIORS, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line || line.startsWith('#')) continue;
    const c = line.split('\t');
    if (c.length < 6 || /[-.]/.test(c[0])) continue;
    kaistWordLines++;
    const lemmas = c[2].split('+'); const tags = c[4].split('+');
    // an auxiliary token (않는, 하고) lists only its stem as the lemma against several tags: the lemma is the FIRST morpheme
    if (lemmas.length !== tags.length) { if (lemmas.length === 1) tags.length = 1; else { kaistBadLines++; continue; } }
    for (let i = 0; i < tags.length; i++) {
      inc(tagsMet, tags[i]);
      const cls = KAIST[tags[i]];
      if (!cls || !lemmas[i]) continue;
      const lemma = koKey(PREDICATE_KAIST.has(tags[i]) ? `${lemmas[i]}다` : lemmas[i]);
      priorCount.set(`${lemma}\u0000${cls[1]}`, (priorCount.get(`${lemma}\u0000${cls[1]}`) ?? 0) + 1);
      classCount.set(`${lemma}\u0000${cls[0]}`, (classCount.get(`${lemma}\u0000${cls[0]}`) ?? 0) + 1);
      kaistMorphemes++;
    }
  }
}

// ───────────────────────────── entries ─────────────────────────────

const posOf = (r: { tag: string; clf?: boolean }): string => koSharedPos({ tag: r.tag as KoLexEntry['tag'], ...(r.clf ? { clf: true as const } : {}) }) ?? r.tag;
const setInfoByKey = new Map(report.sets.map((s) => [s.key, s]));
const lexEntries: KoLexEntry[] = [];
const rowOfEntry = new Map<KoLexEntry, KoRow>();
const byKeyOf = (e: KoLexEntry): string => koStemKey(e.lemma, e.tag);
/** The count of each SPELLING (lemma and shared part of speech), the auxiliary use of a predicate included. */
const spellingCount = new Map<string, number>();
{
  const pos = new Set(rows.map((r) => `${r.lemma}\u0000${posOf(r)}`));
  for (const k of pos) spellingCount.set(k, priorCount.get(k) ?? 0);
  // a headword counts as main OR auxiliary predicate: the auxiliary count (싶다, 있다 in -고 있다, 않다) goes to the verb or the adjective row that has more of its own
  for (const [k, n] of priorCount) {
    const [lemma, p] = k.split('\u0000');
    if (p !== 'AUX') continue;
    const v = `${lemma}\u0000VERB`; const a = `${lemma}\u0000ADJ`;
    const target = pos.has(v) && pos.has(a) ? ((spellingCount.get(a) ?? 0) > (spellingCount.get(v) ?? 0) ? a : v) : pos.has(v) ? v : pos.has(a) ? a : undefined;
    if (target) spellingCount.set(target, (spellingCount.get(target) ?? 0) + n);
  }
  for (const r of rows) {
    const e: KoLexEntry = { lemma: r.lemma, tag: r.tag };
    if (r.hom !== undefined) { e.hom = r.hom; if (r.set) e.set = r.set; }
    if (r.clf) e.clf = true;
    if (r.voice) { e.voice = r.voice; e.base = r.base; }
    if (r.irr) e.irr = r.irr;
    if (r.gloss) e.gloss = r.gloss;
    if (r.glossOwn) e.glossOwn = true;
    if (r.own) e.own = true;
    if (r.bound) e.bound = true;
    if (r.related) e.related = r.related;
    if (r.hada) e.hada = true;
    if (r.hanja) e.hanja = r.hanja;
    if (r.pron) e.pron = r.pron;
    // the count is of the SPELLING: a main set gives it to the main entry only; a balanced set to EVERY entry (it orders stems, it does not choose
    // between homonyms); an entry that is alone has it
    const n = r.set === 'other' ? 0 : r.tag === 'XR' ? priorCount.get(`${r.lemma}\u0000NOUN`) ?? 0 : spellingCount.get(`${r.lemma}\u0000${posOf(r)}`) ?? 0;
    if (n > 0) e.n = n;
    rowOfEntry.set(e, r);
    lexEntries.push(e);
  }
}
const orderEntries = (a: KoLexEntry, b: KoLexEntry): number => (b.n ?? 0) - (a.n ?? 0) || (a.hom ?? 0) - (b.hom ?? 0) || cmp(a.tag, b.tag) || cmp(a.lemma, b.lemma);

/** key -> entries (the stem key, and the Hanja key of an entry whose Hanja spelling is pure Hanja). */
const keyed = new Map<string, KoLexEntry[]>();
const hanjaKeys = new Map<string, KoLexEntry[]>();
const put = (m: Map<string, KoLexEntry[]>, k: string, e: KoLexEntry): void => { (m.get(k) ?? m.set(k, []).get(k)!).push(e); };
for (const e of lexEntries) {
  put(keyed, byKeyOf(e), e);
  const h = koPureHanja(e.hanja);
  if (h) { const hk = koKey(h); if (hk !== byKeyOf(e)) { put(keyed, hk, e); put(hanjaKeys, hk, e); } }
}
for (const list of keyed.values()) list.sort(orderEntries);
const keys = [...keyed.keys()].sort(cmp);
const hanjaEntryCount = new Set([...hanjaKeys.values()].flat()).size;
const hanjaMulti = [...hanjaKeys.values()].filter((l) => l.length > 1).length;

// ───────────────────────────── shards ─────────────────────────────

const mkLex = (id: string, shard: string | undefined, theKeys: string[]): KoLexicon => {
  const entries: Record<string, KoLexEntry[]> = {};
  for (const k of theKeys) entries[k] = keyed.get(k)!;
  return { schema: 1, id, ...(shard !== undefined ? { shard } : {}), source: SOURCE, built: TODAY, entries };
};
interface ShardOut { prefix: string; file: string; plain: number; gz: number; keys: number; buf: Buffer }
const shardOuts: ShardOut[] = [];
const lettersOf = new Map<string, string>();
for (const k of keys) lettersOf.set(k, koLexiconShardLetters(k));
function emitShard(prefix: string, theKeys: string[]): void {
  const plain = JSON.stringify(mkLex('kaikki-ko-lexicon', prefix, theKeys));
  const buf = zlib.gzipSync(plain, { level: 9 });
  shardOuts.push({ prefix, file: `${prefix}.json.gz`, plain: Buffer.byteLength(plain), gz: buf.length, keys: theKeys.length, buf });
}
function split(prefix: string, theKeys: string[], depth: number): void {
  const size = Buffer.byteLength(JSON.stringify(mkLex('kaikki-ko-lexicon', prefix, theKeys)));
  if (size <= LIMIT || depth >= MAX_PREFIX) { emitShard(prefix, theKeys); return; }
  const own: string[] = [];
  const kids = new Map<string, string[]>();
  for (const k of theKeys) { const l = [...lettersOf.get(k)!]; if (l.length <= depth) own.push(k); else { const p = l.slice(0, depth + 1).join(''); (kids.get(p) ?? kids.set(p, []).get(p)!).push(k); } }
  if (own.length) emitShard(prefix, own);
  for (const p of [...kids.keys()].sort(cmp)) split(p, kids.get(p)!, depth + 1);
}
{
  const noLetter: string[] = [];
  const first = new Map<string, string[]>();
  for (const k of keys) { const l = lettersOf.get(k)!; if (!l) noLetter.push(k); else { const f = [...l][0]; (first.get(f) ?? first.set(f, []).get(f)!).push(k); } }
  if (noLetter.length) emitShard('_', noLetter);
  for (const p of [...first.keys()].sort(cmp)) split(p, first.get(p)!, 1);
}
shardOuts.sort((a, b) => cmp(a.prefix, b.prefix));
const gzTotal = shardOuts.reduce((s, x) => s + x.gz, 0);
const plainTotal = shardOuts.reduce((s, x) => s + x.plain, 0);
const largest = shardOuts.reduce((m, x) => (x.plain > m.plain ? x : m), shardOuts[0]);
console.log(`${shardOuts.length} shards, ${(gzTotal / 1e6).toFixed(2)} MB gzip (${(plainTotal / 1e6).toFixed(1)} MB plain); largest ${largest.prefix} ${(largest.plain / 1e6).toFixed(2)} MB plain`);

// ───────────────────────────── core ─────────────────────────────

const extraSet = new Set(docs.coreExtra?.lemmas ?? []);
const lexLemmas = new Set(lexEntries.map((e) => e.lemma));
const extraLacking = [...extraSet].filter((l) => !lexLemmas.has(l));
// the FILE (header and footer included) stays within the budget: the rows get the budget less the fixed text
const core = koSelectCore(lexEntries, CORE_BUDGET - 3300, extraSet);
const coreRows = [...core.chosen].sort((a, b) => cmp(a.lemma, b.lemma) || cmp(a.tag, b.tag) || (a.hom ?? 0) - (b.hom ?? 0));
const coreTuples = coreRows.map((e) => koCoreTupleJson(koCoreTuple(e)));
const coreSetCount = new Set(coreRows.map((e) => koHomonymSetKey(e))).size;
const coreHanjaKeys = coreRows.filter((e) => { const h = koPureHanja(e.hanja); return h && koKey(h) !== byKeyOf(e); }).length;

// ───────────────────────────── registry guard ─────────────────────────────

const byOf = (e: KoLexEntry): string | undefined => setInfoByKey.get(koHomonymSetKey(e))?.by;
const registry = koRegistryOf(lexEntries, byOf, (e) => ({ assigned: rowOfEntry.get(e)?.assigned, fp: rowOfEntry.get(e)?.fp }));
let registryWarnings: string[] = [];
if (fs.existsSync(REGISTRY)) {
  const old = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')) as { entries?: KoRegistryRecord[] } | KoRegistryRecord[];
  const oldRecs = Array.isArray(old) ? old : old.entries ?? [];
  const { failures, warnings } = koCompareRegistry(oldRecs, registry);
  registryWarnings = warnings;
  if (failures.length && !flags.has('accept-homonym-changes')) {
    console.error(`the homonym registry ${REGISTRY} no longer matches this build (pass --accept-homonym-changes to overwrite; a changed number needs an alias in the Repository):\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  if (failures.length) console.log(`homonym registry: ${failures.length} change(s) ACCEPTED`);
}

// ───────────────────────────── figures for INDEX.md ─────────────────────────────

const tagCount: Record<string, number> = {};
for (const e of lexEntries) inc(tagCount, e.tag);
const irrCount: Record<string, number> = {};
const irrExamples: Record<string, KoLexEntry[]> = {};
for (const e of lexEntries) if (e.tag === 'VV' || e.tag === 'VA') { const k = e.irr ?? 'none'; inc(irrCount, k); (irrExamples[k] ??= []).push(e); }
const entriesBySet = new Map<string, KoLexEntry[]>();
for (const e of lexEntries) (entriesBySet.get(koHomonymSetKey(e)) ?? entriesBySet.set(koHomonymSetKey(e), []).get(koHomonymSetKey(e))!).push(e);
/** The count of a SPELLING, once: the largest of its entries (a balanced set repeats it on every entry). */
const spellingN = (l: KoLexEntry[]): number => l.reduce((t, e) => Math.max(t, e.n ?? 0), 0);
const stateCount: Record<string, number> = {};
for (const s of report.sets) inc(stateCount, `${s.state} (${s.by})`);
const glossOf = (e: KoLexEntry): string => `${e.hom ?? ''} ${e.gloss ?? '-'}${e.irr ? ` [${e.irr}]` : ''}${e.set === 'main' ? ' (main)' : ''}`;
const topSets = [...report.sets].sort((a, b) => spellingN(entriesBySet.get(b.key)!) - spellingN(entriesBySet.get(a.key)!) || cmp(a.key, b.key)).slice(0, 40);
const balancedDefault = report.sets.filter((s) => s.state === 'balanced' && s.by === 'default').sort((a, b) => spellingN(entriesBySet.get(b.key)!) - spellingN(entriesBySet.get(a.key)!) || cmp(a.key, b.key)).slice(0, 60);
const setLine = (s: { key: string; by: string; state: string }): string => {
  const l = entriesBySet.get(s.key)!;
  return `- **${s.key.split('\u0000')[0]}** ${s.key.split('\u0000')[1]} [${s.state}, ${s.by}], count ${fmt(spellingN(l))}: ${[...l].sort((a, b) => (a.hom ?? 0) - (b.hom ?? 0)).map(glossOf).join('; ')}`;
};

// predicates spelled alike that differ in class, conjugation class or number
const preds = new Map<string, KoLexEntry[]>();
for (const e of lexEntries) if (e.tag === 'VV' || e.tag === 'VA') (preds.get(e.lemma) ?? preds.set(e.lemma, []).get(e.lemma)!).push(e);
const alikeDifferent = [...preds.entries()].filter(([, l]) => l.length > 1 && new Set(l.map((e) => `${e.tag}|${e.irr ?? ''}`)).size > 1).sort((a, b) => cmp(a[0], b[0]));
const alikeIrrDifferent = alikeDifferent.filter(([, l]) => new Set(l.map((e) => e.irr ?? 'none')).size > 1);
// collisions of the bases before an ending (derived here, WITHOUT the morphology package's conjugate.ts; a coarse net, not the analyser's forms)
function bases(e: KoLexEntry): string[] {
  const stem = e.lemma.slice(0, -1);
  const syl = [...stem];
  const L = syl[syl.length - 1];
  const out = new Set<string>([stem]);
  const P = syl.slice(0, -1).join('');
  const code = L.codePointAt(0)! - 0xac00;
  const t = code >= 0 && code < 11172 ? code % 28 : -1;
  const open = t > 0 ? String.fromCharCode(L.codePointAt(0)! - t) : L;
  if (t === 8) out.add(P + open); // ㄹ-deletion (살 -> 사)
  if (e.irr === 'D' && t === 7) out.add(P + String.fromCharCode(L.codePointAt(0)! + 1)); // ㄷ -> ㄹ (듣 -> 들)
  if ((e.irr === 'B' && t === 17) || (e.irr === 'S' && t === 19) || (e.irr === 'H' && t === 27)) out.add(P + open);
  if (e.irr === 'Reu') { const q = [...P]; const S = q.pop(); if (S) out.add(q.join('') + String.fromCharCode(S.codePointAt(0)! + 8)); }
  return [...out];
}
const baseIndex = new Map<string, KoLexEntry[]>();
for (const e of lexEntries) if (e.tag === 'VV' || e.tag === 'VA') for (const b of bases(e)) (baseIndex.get(b) ?? baseIndex.set(b, []).get(b)!).push(e);
const collisions: string[] = [];
for (const [b, l] of [...baseIndex.entries()].sort((x, y) => cmp(x[0], y[0]))) {
  const lemmas = [...new Set(l.map((e) => e.lemma))];
  if (lemmas.length < 2) continue;
  if (!l.filter((e) => e.lemma.slice(0, -1) !== b).length) continue;
  collisions.push(`${b}: ${lemmas.map((x) => { const es = l.filter((e) => e.lemma === x); return `${x}${es[0].irr ? ` ${es[0].irr}` : ''}${es.some((e) => e.lemma.slice(0, -1) !== b) ? ' (altered)' : ''}`; }).join(' / ')}`);
}

// coverage of the Kaist train lemmas, by class
const classPos = (cls: string): string => Object.values(KAIST).find((v) => v[0] === cls)![1];
const lexSet = new Set(lexEntries.map((e) => `${e.lemma}\u0000${posOf(e)}`));
const covRows: string[] = [];
const cov: Record<string, { types: number; covTypes: number; tokens: number; covTokens: number; uncovered: Array<[string, number]> }> = {};
for (const [k, n] of classCount) {
  const [lemma, cls] = k.split('\u0000');
  const c = (cov[cls] ??= { types: 0, covTypes: 0, tokens: 0, covTokens: 0, uncovered: [] });
  c.types++; c.tokens += n;
  const ok = cls === 'VX' ? lexSet.has(`${lemma}\u0000VERB`) || lexSet.has(`${lemma}\u0000ADJ`) : cls === 'NNB' ? lexSet.has(`${lemma}\u0000NOUN`) || lexSet.has(`${lemma}\u0000CLF`) : lexSet.has(`${lemma}\u0000${classPos(cls)}`);
  if (ok) { c.covTypes++; c.covTokens += n; } else c.uncovered.push([lemma, n]);
}
covRows.push(...Object.keys(cov).sort(cmp));
const pct = (a: number, b: number): string => (b ? `${((100 * a) / b).toFixed(1)} %` : '-');

// running content words covered by each state of their set
const CONTENT = new Set(['NOUN', 'PROPN', 'PRON', 'NUM', 'VERB', 'ADJ', 'AUX', 'ADV', 'CONJ', 'DET', 'INTJ', 'CLF']);
const running: Record<string, number> = {};
let runningTotal = 0;
for (const [k, n] of priorCount) {
  const [lemma, p] = k.split('\u0000');
  if (!CONTENT.has(p)) continue;
  runningTotal += n;
  const pk = p === 'AUX' ? (lexSet.has(`${lemma}\u0000VERB`) ? 'VERB' : lexSet.has(`${lemma}\u0000ADJ`) ? 'ADJ' : '') : p;
  if (!pk || !lexSet.has(`${lemma}\u0000${pk}`)) { inc(running, 'not in the lexicon', n); continue; }
  const si = setInfoByKey.get(`${lemma}\u0000${pk}`);
  if (!si) inc(running, 'alone (no number)', n); else inc(running, `${si.state} (${si.by})`, n);
}

/** Tokens of each Kaist class covered by a set of entries (the spelling and shared part of speech; VX by a verb or adjective; NNB by a noun or a counter). */
function coverage(entries: readonly KoLexEntry[]): Record<string, { types: number; tokens: number }> {
  const have = new Set(entries.map((e) => `${e.lemma}\u0000${posOf(e)}`));
  const out: Record<string, { types: number; tokens: number }> = {};
  for (const [k, n] of classCount) {
    const [lemma, cls] = k.split('\u0000');
    const ok = cls === 'VX' ? have.has(`${lemma}\u0000VERB`) || have.has(`${lemma}\u0000ADJ`) : cls === 'NNB' ? have.has(`${lemma}\u0000NOUN`) || have.has(`${lemma}\u0000CLF`) : have.has(`${lemma}\u0000${classPos(cls)}`);
    const o = (out[cls] ??= { types: 0, tokens: 0 });
    if (ok) { o.types++; o.tokens += n; }
  }
  return out;
}
const covAfter = coverage(lexEntries);
const covBefore = coverage(lexEntries.filter((e) => !e.own));
const suppEntries = lexEntries.filter((e) => e.own);
const suppByTag: Record<string, number> = {};
for (const e of suppEntries) inc(suppByTag, e.tag);
const coreCov = coverage(coreRows);
const kaistTotal = [...classCount.values()].reduce((a, b) => a + b, 0);
const sumTokens = (c: Record<string, { tokens: number }>): number => Object.values(c).reduce((t, x) => t + x.tokens, 0);
const lexTokens = sumTokens(covAfter);
const coreTokens = sumTokens(coreCov);

const pronCount = lexEntries.filter((e) => e.pron).length;
const hanjaCount = lexEntries.filter((e) => e.hanja).length;
const skippedTotal = Object.values(report.skipped).reduce((a, b) => a + b, 0);
const noGloss = lexEntries.filter((e) => !e.gloss).length;
const spellings = entriesBySet.size;

const doc = `# Korean lexicon index

Generated by \`npm run ko:build-lexicon -- --date ${TODAY}\` (scripts/ko-build-lexicon.mts; the reading of the extract is src/dict/korean.ts). Do not edit.

Source: ${SOURCE.label}; ${SOURCE.licence}; ${SOURCE.url}, retrieved ${SOURCE.retrieved} (extract of 2026-10-30, enwiktionary dump of 2026-10-01), sha256 \`${SOURCE.sha256}\`.
Counts: UD Korean-Kaist **train** only (${fmt(kaistWordLines)} word lines, ${fmt(kaistMorphemes)} counted morphemes, ${kaistBadLines} lines with unaligned lemma and tag skipped), CC BY-SA 4.0. **\`n\` is the count of the SPELLING in the priors corpus** (1990s expository prose: 흉노 is in the top 200), never a frequency of the language, and never summed over rows: every entry of a balanced set carries the spelling's count. Every total below counts each spelling once.

Reviewed inputs read by the build (hand-written, never written by it): docs/korean/homonym-decisions.json ${docs.decisions ? `(${docs.decisions.sets.length} decisions)` : '(absent)'}, docs/korean/gloss-overrides.json ${docs.overrides ? `(${docs.overrides.entries.length} lines)` : '(absent)'}.

## Entries

| | |
|---|---|
| lines read | ${fmt(raws.length)} |
| entries kept (rows) | ${fmt(rows.length)} |
| spellings (spelling and shared part of speech) | ${fmt(spellings)} |
| skipped | ${fmt(skippedTotal)} |
| entries merged into another (one etymology, or one word: see Granularity) | ${fmt(report.merges)} |
| stem keys (including Hanja keys) | ${fmt(keys.length)} |

### Kept, by Wiktionary part of speech → class

${Object.keys(report.keptByPos).sort(cmp).map((p) => `- ${p}: ${Object.entries(report.keptByPos[p]).sort((a, b) => cmp(a[0], b[0])).map(([t, n]) => `${t} ${fmt(n)}`).join(', ')}`).join('\n')}

### Rows by class

${Object.entries(tagCount).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${fmt(n)}`).join(', ')} (counters are NNB with \`clf\`: ${fmt(lexEntries.filter((e) => e.clf).length)})

### Skipped

${Object.entries(report.skipped).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).map(([k, n]) => `- ${k}: ${fmt(n)}`).join('\n')}

Particles and suffixes that are endings are the hand tables of the morphology package (korean/particles.ts, korean/endings.ts), so they are counted here and not read.
**Auxiliary and copula rows (VX, VCP, VCN) are NOT built here**: they are the morphology package's hand tables (ko-closed). The extract files 있다, 하다, 보다 and 주다 as ordinary verbs and adjectives, and those rows carry the count of their auxiliary use too (see Counts).
"every sense is a form of another word" covers form_of / alt_of senses, the \`form-of\` / \`alt-of\` tags and glosses of the shape "alternative form of", "North Korean form of", "short for", "… spelling of"; a CONTRACTION of a word that is itself a headword is the exception (see below).
"cross-reference only" is an entry whose only senses are "See the entry at …" (말 as a prefix): not an entry.
Nouns marked bound (sense tag \`dependent\`, or a bound-noun category) are NNB; ${fmt(report.mixedDependent)} of those also have a sense that is not marked dependent (the first non-form sense decided). Counters (the source's pos "counter", or a "counters" category) are NNB with \`clf\`, shared part of speech CLF.

### Contractions (the extract's pos "contraction": ${report.contractionPos.length} entries)

${report.contractionPos.map((c) => `- ${c.word}: ${c.gloss}`).join('\n')}

All of these are braille cells, Hangul syllable names or the slang 임마: none is a word that contracts another, so none is filed. The real contractions are filed under their own part of speech as entries whose every sense says "contraction of X" (뭐 ← 무어): such an entry becomes a row when X is itself a headword, takes X's class, and its gloss is the text after the colon of its own gloss, else "= X: X's gloss".

- contractions filed (${report.contractionKept.length}): ${report.contractionKept.map((c) => `${c.word} ← ${c.target} ${c.tag}`).join('; ') || '(none)'}
- contractions of a word PLUS a particle or of something that is not a headword (${report.contractionFused.length}), for the morphology package's fused table, NOT filed: ${report.contractionFused.map((c) => `${c.word} ← ${c.target}`).join('; ') || '(none)'}

### Conjunctive adverbs (MAJ)

An adverb is MAJ only when EVERY gloss of every sense is a plain conjunction (and, but, however, therefore, or, so, ...): ${report.maj.length}: ${report.maj.join(', ')}.
Adverbs whose FIRST sense is a plain conjunction but that have another sense (left MAG by the rule): ${report.majFirstOnly.length}: ${report.majFirstOnly.join(', ')}.

### Missing words (자 "person", 뭐)

- 뭐 was dropped because the extract files it as pos pron with every sense an alt-of "contraction of 무어": the class of case is a contraction of a headword, now filed (above).
- 자 "person" (믿는 자): the extract has NO such entry. The page 자 has a numeral (10²⁴), a noun "ruler, straightedge" and Hanja-syllable entries only, and the bound noun is not among them; the suffix 者 "person" is filed as a suffix (XSN). Nothing is invented.

## Homonyms

A SET is the spelling and the SHARED part of speech (koHomonymSetKey): 자 "ruler" (NNG) and a bound noun 자 (NNB) would be one set. Entries of different etymologies of a set are numbered with the source's etymology number (이르다 arrives as 2 and 3); an entry alone in its set carries no number.

- sets with two or more entries: ${fmt(report.sets.length)}; by state: ${Object.entries(stateCount).sort((a, b) => cmp(a[0], b[0])).map(([k, n]) => `${k} ${fmt(n)}`).join(', ')}
- numbers the source does NOT give (no etymology number in a set that needs one) are ASSIGNED, once, from 50 up, and frozen in docs/korean/homonyms.json by fingerprint (Hanja, first gloss, class): ${report.assignedRows.length} entries in ${report.orderSets.length} sets, listed below. Source numbers are never changed; supplement rows are 90 and up.
- three states: **main** (the entry keeps the bare lemma; the others are \`other\`), **balanced**; the only automatic main is the entry left when every OTHER entry has all its senses tagged obsolete, archaic, rare, dated or dialectal (the regional dialect tags count as dialectal): \`by: only-current\`; everything else unreviewed is balanced, \`by: default\`. The first etymology is NEVER taken as main. Reviewed decisions: ${docs.decisions?.sets.length ?? 0}.
- COUNTS: a count is of the spelling. In a main set it goes to the main entry (the others have none); in a balanced set EVERY entry carries the spelling's count (it orders stems, it does not choose between homonyms), so totals count each spelling once; an entry alone has the count.

### Granularity: one etymology is one headword

- entries merged because they share spelling, shared part of speech AND etymology number (the source's own judgement: one etymology is one headword and one row; the first entry's tag with NNG before NNB, the first non-empty Hanja, senses in file order): ${report.mergedSameEtym.length}. The ones where the source's judgement is least obvious (different non-empty Hanja, or different classes) are listed, ${report.mergedSameEtym.filter((m) => (m.hanja[0] && m.hanja[1] && m.hanja[0] !== m.hanja[1]) || m.classes.split(' + ')[0] !== m.classes.split(' + ')[1]).length} of them:
${report.mergedSameEtym.filter((m) => (m.hanja[0] && m.hanja[1] && m.hanja[0] !== m.hanja[1]) || m.classes.split(' + ')[0] !== m.classes.split(' + ')[1]).map((m) => `  - ${m.lemma} etymology ${m.etym}: ${m.classes}${m.hanja[0] || m.hanja[1] ? ` (${m.hanja[0] || '-'} / ${m.hanja[1] || '-'})` : ''}: "${m.glosses[0]}" + "${m.glosses[1]}"`).join('\n') || '  (none)'}
- entries merged because two etymologies of one set are ONE word (rule: same shared part of speech and identical non-empty Hanja, or neither has Hanja and the first glosses are identical; merged under the lowest etymology number; 길조 吉兆 and 길조 吉鳥 differ in Hanja and stay two; 한복 韓服 and 漢服 stay two): ${report.mergedSameWord.length} words
${report.mergedSameWord.map((m) => `  - ${m.lemma} ${m.pos}: etymologies ${m.numbers.join(', ')} (${m.why})`).join('\n')}

### Numbers assigned by the build (the source gives none, or a shared one)

${report.assignedRows.map((a) => `- ${a.lemma} ${a.pos} ${a.hom}: ${a.tag}${a.hanja ? ` ${a.hanja}` : ''} "${a.gloss}": ${a.why}`).join('\n') || '(none)'}

### Sets that are main by only-current (read each one)

${report.sets.filter((x) => x.by === 'only-current').map((x) => `- ${x.key.split('\u0000').join(' ')}: main ${x.main}: ${[...entriesBySet.get(x.key)!].sort((a, b) => (a.hom ?? 0) - (b.hom ?? 0)).map((e) => `${e.hom} ${e.gloss ?? '-'}`).join('; ')}`).join('\n') || '(none)'}

### Numbered rows with no gloss (an undecided reading cannot name their meaning)

${lexEntries.filter((e) => e.hom !== undefined && !e.gloss).map((e) => `- ${e.lemma}${sup(e.hom!)} ${e.tag}${e.hanja ? ` ${e.hanja}` : ''} [${e.set}]`).join('\n') || '(none)'}

### Running words by state of their set

Content words of the Kaist train file (${fmt(runningTotal)} counted morphemes of content classes, each spelling once):

${Object.entries(running).sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}: ${fmt(n)} (${pct(n, runningTotal)})`).join('\n')}

### The 60 commonest balanced sets nobody has reviewed (\`by: default\`)

${balancedDefault.map(setLine).join('\n')}

### The 40 commonest sets

${topSets.map(setLine).join('\n')}

### Predicates spelled alike that differ in class or conjugation class (${alikeDifferent.length}; ${alikeIrrDifferent.length} of them differ in irr)

${alikeDifferent.map(([lemma, l]) => `- ${lemma}: ${[...l].sort((a, b) => (a.hom ?? 0) - (b.hom ?? 0) || cmp(a.tag, b.tag)).map((e) => `${e.tag}${e.hom ? sup(e.hom) : ''} ${e.irr ?? 'none'}`).join(' / ')}`).join('\n')}

### Predicates whose bases before an ending can coincide (ㄹ-deletion, ㄷ→ㄹ, ㅂ ㅅ ㅎ dropped, 르 → ㄹ)

Derived here from each entry's class and shape WITHOUT the morphology package's conjugate.ts (a coarse net, ${collisions.length} bases; "altered" marks the lemma whose base differs from its stem):

${collisions.slice(0, 400).map((c) => `- ${c}`).join('\n')}${collisions.length > 400 ? `\n- … ${collisions.length - 400} more` : ''}

## Conjugation classes (predicates VV and VA)

Read off the entry's OWN \`infinitive\` forms against the stem by exact jamo comparison (src/dict/korean.ts \`koIrregularClass\`); R = the infinitive is what a regular stem gives (ㅡ-deletion and ㄹ-stems included).

${Object.entries(irrCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => `### ${k} (${fmt(n)})\n\n${[...irrExamples[k]].sort(orderEntries).slice(0, 15).map((e) => `${e.lemma}${e.hom ? sup(e.hom) : ''}`).join(', ')}`).join('\n\n')}

- predicates with no table in the source (no infinitive form): ${fmt(report.noTable)}; of these ${fmt(report.byShape)} are set to R **by shape** (the last syllable of the stem is open and is not 하, 푸, 르 or ㅡ, or it has a final other than ㄷ ㅂ ㅅ ㅎ: regular without a table) and the rest have no class
- entries whose several infinitives disagree in class (the FIRST is recorded): ${report.irrDisagree.length}${report.irrDisagree.length ? `\n${report.irrDisagree.slice(0, 200).map((x) => `  - ${x}`).join('\n')}` : ''}

### Predicates with no conjugation class (${report.noClass.length})

${report.noClass.map((x) => `- ${x.lemma}${x.hom ? sup(x.hom) : ''}: ${x.reason}; ${x.doubt}`).join('\n')}

## Polite forms, roots, bound allomorphs, conjunctions

### Inflected forms dropped (an inflected form of another kept headword is not a word of its own): ${report.politeDropped.length}

${report.politeDropped.map((x) => `- ${x}`).join('\n') || '(none)'}

Kept as interjections (greetings a learner needs as phrases, the source files them as intj with a meaning of their own): ${report.politeKept.length}

${report.politeKept.map((x) => `- ${x}`).join('\n') || '(none)'}

### Roots (어근, XR)

The extract's pos "root" entries are filed as XR rows, read only before 하다, 히 or 스럽다 (a shared part of speech of their own: none). ${fmt(report.rootsKept)} filed; ${report.rootsAsNoun.length} left out because the same spelling is a noun entry (the noun stays): ${report.rootsAsNoun.slice(0, 80).join(', ')}${report.rootsAsNoun.length > 80 ? ', …' : ''}. The supplement's roots: ${suppEntries.filter((e) => e.tag === 'XR').map((e) => e.lemma).join(', ') || '(none)'}. An XR row's count is the count of its spelling as a noun in the priors corpus.

### Bound allomorphs (\`bound: true\`: occur only in the fused forms of the morphology package's table, never a free word)

${lexEntries.filter((e) => e.bound).map((e) => `- ${e.lemma}${e.hom ? sup(e.hom) : ''} ${e.tag}${e.own ? ' (supplement)' : ''}: "${e.gloss ?? ''}"`).join('\n') || '(none)'}

Why each: ${report.bound.map((b) => `${b.lemma} (${b.why})`).join('; ') || '(none)'}. The free pronouns 뭐, 걔, 얘, 쟤 and 거 are not bound.

### Conjugation: the head line and the table disagree (the TABLE wins): ${report.tableDisagree.length}

${report.tableDisagree.map((x) => `- ${x.lemma}${x.etym ? ` (etymology ${x.etym})` : ''}: head line ${x.head}, table ${x.table}`).join('\n') || '(none)'}

### Conjunctive adverbs the lexicon holds

${['그래서', '그러나', '그리고', '하지만', '그런데', '그러면', '그럼', '그러니까', '그래도', '따라서', '또한', '즉', '그러므로', '혹은', '또는', '및'].map((w) => { const r = lexEntries.filter((e) => e.lemma === w); return `- ${w}: ${r.map((e) => `${e.tag}${e.hom ? sup(e.hom) : ''} "${e.gloss ?? ''}"`).join('; ') || 'MISSING'}`; }).join('\n')}

### First meanings the audit questioned (as the rows say now)

${['그', '구', '분'].map((w) => `- ${w}: ${lexEntries.filter((e) => e.lemma === w && (e.tag === 'NP' || e.tag === 'NNB' || e.tag === 'NNG' || e.clf)).map((e) => `${e.tag}${e.clf ? ' clf' : ''}${e.hom ? sup(e.hom) : ''}${e.set ? ` [${e.set}]` : ''} "${e.gloss ?? ''}"`).join('; ')}`).join('\n')}

## Dictionary labels (the card's short line)

The card's short line is one flat list over the entries of the bare key. For a set with a MAIN entry the bare key holds only the main entry. For a BALANCED set each entry's first sense is prefixed (entry L), where L is the entry's homonym number through koEntryLabel (index-store.ts), the same rule the card uses: the source's number below 50, a letter for a number this product assigned (50 = a, 51 = b), x1, x2 for a supplement row (91 = x1). It is the identity number, not a position. When the bare key holds entries of more than one class (전 as noun, prefix, name, determiner) every entry's first sense also names its class: (noun), (prefix), (noun, entry 2).

### Noun and root rows with \hada\

${report.hada.total} rows (nouns and roots) have a verb or adjective X하다 built on them; ${report.hada.listedOnly.length} of them have no X하다 row of their own (the source's derived terms list it): ${report.hada.listedOnly.slice(0, 60).join(', ')}.

## Voice

A row has a voice (and its base) when the entry itself says so in a sense (a gloss "causative of X" / "passive of X", or a form-of sense tagged causative or passive), or when a reviewed line of docs/korean/voice-decisions.json says Pass or Caus for a verb the source's ko-verb-set relates to a base. The set alone is etymological (지내다 "to spend (time), to get along" is related to 지나다, it is not called a causative), so a verb the review marks null, or leaves undecided, keeps only the field related, with no voice.

- rows with a voice: ${lexEntries.filter((e) => e.voice).length} (${lexEntries.filter((e) => e.voice && !report.voicePairs.length).length ? '' : ''}${report.voiceDecided} of them settled by docs/korean/voice-decisions.json, the rest state it in their own senses): ${lexEntries.filter((e) => e.voice).slice(0, 20).map((e) => `${e.lemma}${e.hom ? sup(e.hom) : ''} ${e.voice} of ${e.base}`).join('; ')}
- rows related only (voice decided null by the review, \`related\` kept): ${lexEntries.filter((e) => e.related && !e.voice).length}: ${lexEntries.filter((e) => e.related && !e.voice).slice(0, 20).map((e) => `${e.lemma}${e.hom ? sup(e.hom) : ''} ~ ${e.related}`).join('; ')}
- related rows with NO decision line (undecided): ${report.voiceUndecided.length}${report.voiceUndecided.length ? ': ' + report.voiceUndecided.join('; ') : ''}
- named both passive and causative of the same base (recorded as Pass): ${report.voiceBoth.join(', ') || '(none)'}
- 먹이다 / 보이다 / 열리다 / 끓이다 / 지내다: ${['먹이다', '보이다', '열리다', '끓이다', '지내다'].map((w) => `${w} ${lexEntries.filter((e) => e.lemma === w).map((e) => e.voice ? `voice ${e.voice}` : e.related ? `related ${e.related}` : 'none').join('/')}`).join('; ')}

## Glosses

- rows with no gloss: ${fmt(noGloss)}
- a cross-reference is never a gloss: "See the entry at …" senses are skipped; a "synonym of X" sense is resolved to X's own gloss, marked "= X: …" (${fmt(report.xrefResolved)} resolved), else the gloss is left empty (${fmt(report.xrefEmpty)})
- glosses that began with a cross-reference pattern (Root of, Combining form of, Only used in, Used only in), resolved to the named word's own gloss or left empty, by pattern and class: ${Object.entries(report.xrefStart).sort((a, b) => cmp(a[0], b[0])).map(([k, v]) => `${k} ${v.resolved} resolved / ${v.empty} empty`).join('; ') || '(none)'}
- reviewed overrides (docs/korean/gloss-overrides.json): ${fmt(report.glossOverrides)} applied, of which ${fmt(report.glossOwn.length)} are this product's own wording (\`glossOwn\`, not the source's)${report.glossOwn.length ? `:\n${report.glossOwn.map((g) => `  - ${g.lemma}${g.hom ? sup(g.hom) : ''} ${g.pos}: ${g.gloss}`).join('\n')}` : ''}

## Hanja, pronunciation, Hanja keys

- entries with Hanja: ${fmt(hanjaCount)} of ${fmt(lexEntries.length)}
- entries with the source's own pronunciation respelling (differing from the headword): ${fmt(pronCount)} (the core carries the same \`pron\` as the shards)
- entries ALSO filed under a Hanja key (their Hanja is pure Hanja): ${fmt(hanjaEntryCount)}; Hanja keys: ${fmt(hanjaKeys.size)}; Hanja keys holding more than one entry: ${fmt(hanjaMulti)}

## Coverage of the Kaist train lemmas by a lexicon entry of the same part of speech

A headword counts as its main or its auxiliary predicate: the Kaist auxiliary tag px is covered by a verb or adjective entry of the same lemma, and its count is added to that entry's \`n\`. NNB is covered by a noun or a counter entry. Tags met: ${Object.entries(tagsMet).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${fmt(n)}`).join(', ')}.

| class | lemma types | covered | tokens | covered |
|---|---|---|---|---|
${covRows.map((c) => `| ${c} | ${fmt(cov[c].types)} | ${fmt(cov[c].covTypes)} (${pct(cov[c].covTypes, cov[c].types)}) | ${fmt(cov[c].tokens)} | ${fmt(cov[c].covTokens)} (${pct(cov[c].covTokens, cov[c].tokens)}) |`).join('\n')}

### The 50 commonest uncovered lemmas per class

${covRows.map((c) => `**${c}**: ${[...cov[c].uncovered].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).slice(0, 50).map(([l, n]) => `${l} ${n}`).join(', ') || '(none)'}`).join('\n\n')}

## Supplement (docs/korean/lexicon-supplement.json)

Hand-written rows for common words the SOURCE LACKS, read by the build and never written by it (${docs.supplement ? `${docs.supplement.entries.length} lines` : 'absent'}). Every row is \`own\` and \`glossOwn\` (this product's, not Wiktionary's): the card's source line says so, and the dictionary shows its meaning labelled \`own-wording\`. A line never shadows a source entry; one that joins a homonym set of the source carries a hand-fixed number from 90 and takes part in the three states.

- rows: ${suppEntries.length}; by class: ${Object.entries(suppByTag).sort((a, b) => cmp(a[0], b[0])).map(([t, n]) => `${t} ${n}`).join(', ') || '(none)'}
- running-word coverage added, tokens of the Kaist train file, before → after: ${Object.keys(covAfter).sort(cmp).filter((c) => (covAfter[c].tokens !== (covBefore[c]?.tokens ?? 0))).map((c) => `${c} ${fmt(covBefore[c]?.tokens ?? 0)} → ${fmt(covAfter[c].tokens)} (types ${fmt(covBefore[c]?.types ?? 0)} → ${fmt(covAfter[c].types)})`).join('; ') || '(none)'}
- the rows:
${suppEntries.map((e) => `  - ${e.lemma}${e.hom ? sup(e.hom) : ''} ${e.tag}${e.clf ? ' clf' : ''}${e.irr ? ` ${e.irr}` : ''}${e.hanja ? ` ${e.hanja}` : ''}${e.set ? ` [${e.set}]` : ''}${e.n ? ` count ${fmt(e.n)}` : ''}: ${e.gloss}`).join('\n') || '  (none)'}

## Core extras (docs/korean/core-extra.json)

${docs.coreExtra ? `${extraSet.size} spellings the compiled core holds whatever their count; each brings its whole homonym set across classes, first in the budget.` : 'absent'}

### core-extra spellings the lexicon lacks (${extraLacking.length}; supplement candidates)

${extraLacking.join(', ') || '(none)'}

## Shards and core

| | |
|---|---|
| shards | ${shardOuts.length} (prefixes of up to ${MAX_PREFIX} letters by koLexiconShardLetters; limit ${fmt(LIMIT)} bytes of JSON) |
| shard bytes | ${(gzTotal / 1e6).toFixed(2)} MB gzip, ${(plainTotal / 1e6).toFixed(1)} MB plain |
| largest shard | \`${largest.prefix}\` ${(largest.plain / 1e6).toFixed(2)} MB plain, ${(largest.gz / 1e6).toFixed(2)} MB gzip |
| core entries | ${fmt(coreRows.length)} in ${fmt(coreSetCount)} sets (${fmt(coreHanjaKeys)} also under a Hanja key); closed classes ${[...KO_CLOSED_TAGS].join(' ')} and IC with a count ≥ 1 whole, then open classes by descending count; a set goes in whole or not at all |
| core bytes | ${fmt(core.bytes)} of rows, the file at most ${fmt(CORE_BUDGET)} bytes; forced by core-extra.json: ${fmt(core.forcedRows)} rows, ${fmt(core.forcedBytes)} bytes (${pct(core.forcedBytes, CORE_BUDGET)} of the budget); every field of a shard row is in the core row, \`pron\` included |
| running words in the core | ${pct(coreTokens, kaistTotal)} of the ${fmt(kaistTotal)} counted morphemes of the classes the lexicon builds (${pct(coreTokens, lexTokens)} of the ${fmt(lexTokens)} the lexicon covers) have their headword in the core |
`;

// ───────────────────────────── write ─────────────────────────────

if (WRITE) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const o of shardOuts) fs.writeFileSync(path.join(OUT, o.file), o.buf);
  const manifest = {
    schema: 1 as const, id: 'kaikki-ko-lexicon', built: TODAY, source: SOURCE,
    shards: Object.fromEntries(shardOuts.map((o) => [o.prefix, { file: o.file, bytes: o.gz, keys: o.keys }])),
    stats: { shards: shardOuts.length, keys: keys.length, entries: lexEntries.length, hanjaKeys: hanjaKeys.size, plainBytes: plainTotal, bytes: gzTotal, largestPlainBytes: largest.plain },
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));

  const header = `/* GENERATED by scripts/ko-build-lexicon.mts on ${TODAY} - do not edit. The compiled core of the Korean stem lexicon: every entry of the closed classes (pronouns, numerals, determiners, conjunctive adverbs, bound nouns and counters, affixes) and interjections seen in the priors corpus, then the commonest open-class headwords, ${fmt(coreRows.length)} entries in ${fmt(coreSetCount)} spelling sets (a homonym set is always whole, each with the number and state it has in the shards), ${fmt(core.bytes)} bytes of rows. Full lexicon: public/lexicon/ko/standard/ (npm run ko:build-lexicon).
 * Sources: Wiktionary via kaikki.org (${SOURCE.licence}; extract of 2026-10-30); counts from UD Korean-Kaist train (CC BY-SA 4.0). */
import { koStemKey, type KoLexEntry, type KoLexicon, type KoIrregular, type KoTag } from '../index-store';
import { koKey } from '../hangul';

/** [lemma, tag, flags, hom, irr, gloss, hanja, pron, n, voice, base, related], trailing empty fields left off. flags: 1 clf, 2 own, 4 glossOwn, 8 bound, 16 hada, bits 5-6 the state of the set (1 main, 2 other, 3 balanced), decoded below in one place. */
const ROWS: Array<Array<string | number>> = [
`;
  const footer = `];

const PURE_HANJA = /^[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u{20000}-\\u{2ffff}]+$/u;

function expand(): Record<string, KoLexEntry[]> {
  const entries: Record<string, KoLexEntry[]> = {};
  const put = (k: string, e: KoLexEntry): void => { (entries[k] ??= []).push(e); };
  for (const r of ROWS) {
    const e: KoLexEntry = { lemma: String(r[0]), tag: String(r[1]) as KoTag };
    const flags = Number(r[2] ?? 0);
    if (flags & 1) e.clf = true;
    if (flags & 2) e.own = true;
    if (flags & 4) e.glossOwn = true;
    if (flags & 8) e.bound = true;
    if (flags & 16) e.hada = true;
    if (flags >> 5) e.set = (['', 'main', 'other', 'balanced'] as const)[flags >> 5] as 'main' | 'other' | 'balanced';
    if (r[3]) e.hom = Number(r[3]);
    if (r[8]) e.n = Number(r[8]);
    if (r[9]) { e.voice = r[9] as 'Pass' | 'Caus'; e.base = String(r[10] ?? ''); }
    if (r[4]) e.irr = r[4] as KoIrregular;
    if (r[5]) e.gloss = String(r[5]);
    if (r[6]) e.hanja = String(r[6]);
    if (r[7]) e.pron = String(r[7]);
    if (r[11]) e.related = String(r[11]);
    const key = koStemKey(e.lemma, e.tag);
    put(key, e);
    if (e.hanja && PURE_HANJA.test(e.hanja)) { const hk = koKey(e.hanja); if (hk !== key) put(hk, e); }
  }
  for (const list of Object.values(entries)) list.sort((a, b) => (b.n ?? 0) - (a.n ?? 0) || (a.hom ?? 0) - (b.hom ?? 0) || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0) || (a.lemma < b.lemma ? -1 : a.lemma > b.lemma ? 1 : 0));
  return entries;
}

export const KO_CORE: KoLexicon = {
  schema: 1,
  id: 'ko-core',
  source: ${JSON.stringify({ label: SOURCE.label, licence: SOURCE.licence, url: SOURCE.url, retrieved: SOURCE.retrieved, sha256: SOURCE.sha256 })},
  built: ${JSON.stringify(TODAY)},
  entries: expand(),
  stats: ${JSON.stringify({ entries: coreRows.length, sets: coreSetCount, bytes: core.bytes })},
};
`;
  fs.mkdirSync(path.dirname(CORE_OUT), { recursive: true });
  const coreText = `${header}${coreTuples.map((t) => `  ${t},`).join('\n')}\n${footer}`;
  if (Buffer.byteLength(coreText) > CORE_BUDGET) { console.error(`the core file is ${Buffer.byteLength(coreText)} bytes, over the budget of ${CORE_BUDGET}`); process.exit(1); }
  fs.writeFileSync(CORE_OUT, coreText);
  fs.mkdirSync(path.dirname(DOC_OUT), { recursive: true });
  fs.writeFileSync(DOC_OUT, doc);
  fs.writeFileSync(REGISTRY, `${JSON.stringify({ note: 'Registry of numbered homonyms (generated by scripts/ko-build-lexicon.mts). The number is the etymology number of the source; set is the state (main, other, balanced) and by how it was settled (decision, only-current, default). A rebuild fails when a number now means another word: fingerprint {hanja, irr, voice} changed, glosses permuted, a number replaced, or a state changed (except default to decision); pass --accept-homonym-changes after deciding on a Repository alias.', built: TODAY, entries: registry }, null, 1)}\n`);
}
if (registryWarnings.length) console.log(`homonym registry warnings (gloss wording only):\n  ${registryWarnings.join('\n  ')}`);
console.log(`core: ${coreRows.length} entries, ${core.bytes} bytes; ${hanjaKeys.size} Hanja keys; done in ${fmt(Date.now() - started)} ms`);
void koHomonymLemma; void (null as unknown as KoRow);
