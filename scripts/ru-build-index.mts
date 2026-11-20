/// <reference types="node" />
/**
 * npm run ru:build-index -- [--in data/dictionaries/kaikki.org-dictionary-Russian.jsonl.gz] [--priors data/raw/ud-ru/ru_gsd-ud-train.conllu]
 *                           [--out public/lexicon/ru/standard] [--core-out src/adapters/russian/generated/core.ts]
 *                           [--limit 1500000] [--core-budget 450000] [--date YYYY-MM-DD] [--probe word[,word…]] [--no-write]
 *
 * Builds the Russian form index from the Wiktionary extract of kaikki.org (CC BY-SA 4.0): every inflection-table row and every form-of
 * page of the extract becomes a reading of its written form (docs/russian/PLAN.md, "The index build"). The lemma, the tags (kept
 * verbatim, sorted, joined with "|") and the stress are the source's; nothing is analysed here, and every row or entry left out is
 * counted. Writes
 *   - the SHARDS (gzip, by prefix of the letters of the key, ё read as е) and manifest.json under --out (git-ignored),
 *   - the compiled CORE src/adapters/russian/generated/core.ts (closed classes + the commonest lemmas, with every form),
 *   - docs/russian/INDEX.md (the figures).
 * Reading priors (how often a lemma occurs) come from UD Russian-GSD train (CC BY-SA 4.0). Deterministic: same inputs and --date, same bytes.
 *
 * --probe prints every reading the FULL index (not a shard) gives a word, for debugging; --no-write builds and reports only.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { CYRILLIC_LETTER, impliedStress, packStress, ruKey, ruShardLetters, stressPositions, unpackStress, withStress, yoFold, type PackedStress } from '../src/adapters/russian/text';
import type { RuFormRow, RuLemmaRow, RussianFormIndex } from '../src/adapters/russian/index-store';

const started = Date.now();
const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
const flags = new Set<string>();
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) { console.error(`bad argument ${args[i]}`); process.exit(1); }
  if (args[i] === '--no-write') { flags.add('no-write'); continue; }
  if (args[i + 1] === undefined) { console.error(`${args[i]} needs a value`); process.exit(1); }
  opt[args[i].slice(2)] = args[i + 1]; i++;
}
const INPUT = opt.in ?? 'data/dictionaries/kaikki.org-dictionary-Russian.jsonl.gz';
const PRIORS = opt.priors ?? 'data/raw/ud-ru/ru_gsd-ud-train.conllu';
const OUT = opt.out ?? 'public/lexicon/ru/standard';
const CORE_OUT = opt['core-out'] ?? 'src/adapters/russian/generated/core.ts';
const LIMIT = Number(opt.limit ?? 1_500_000);
const CORE_BUDGET = Number(opt['core-budget'] ?? 760_000);
const TODAY = opt.date ?? new Date().toISOString().slice(0, 10);
const WRITE = !flags.has('no-write');
const PROBES = (opt.probe ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_PREFIX = 3;
const DOC_OUT = 'docs/russian/INDEX.md';
const CORE_SEED = opt['core-seed'] ?? 'scripts/ru-core-seed.txt';
const FORM_PRIORS_OUT = opt['form-priors-out'] ?? 'src/adapters/russian/generated/form-priors.ts';
const PRIORS_OUT = opt['priors-out'] ?? 'src/adapters/russian/generated/priors.ts';
for (const f of [INPUT, PRIORS]) if (!fs.existsSync(f)) { console.error(`cannot read ${f}`); process.exit(1); }

const SOURCE: RussianFormIndex['source'] = {
  label: 'Wiktionary Russian entries, their inflection tables and form-of pages, via kaikki.org',
  licence: 'CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org)',
  url: 'https://kaikki.org/dictionary/Russian/kaikki.org-dictionary-Russian.jsonl.gz',
  lastModified: opt['last-modified'] ?? '2026-10-30',
  retrieved: opt.retrieved ?? '2026-11-17',
  sha256: crypto.createHash('sha256').update(fs.readFileSync(INPUT)).digest('hex'),
  note: 'Every row is a table row, a comparative or superlative of a head line, or a "form of" page of Wiktionary; the labels are kept as written, stress marks come from the source, the reading priors from UD Russian-GSD train (CC BY-SA 4.0). Nothing was analysed here.',
};

// ───────────────────────────── helpers ─────────────────────────────

const POS: Record<string, string> = { noun: 'NOUN', name: 'PROPN', verb: 'VERB', adj: 'ADJ', adv: 'ADV', pron: 'PRON', det: 'DET', prep: 'ADP', postp: 'ADP', conj: 'CONJ', particle: 'PART', num: 'NUM', intj: 'INTJ' };
const CLOSED = new Set(['PRON', 'DET', 'ADP', 'CONJ', 'SCONJ', 'PART', 'NUM']);
const CASE_TAGS = new Set(['nominative', 'genitive', 'dative', 'accusative', 'instrumental', 'prepositional', 'locative', 'partitive', 'vocative']);
const GENDER_TAGS = new Set(['masculine', 'feminine', 'neuter']);
/** Labels of register, period or usage: a row that carries one is a marked variant, left out of the core when the lemma has plain rows. */
const REGISTER_TAGS = new Set(['dated', 'archaic', 'obsolete', 'rare', 'dialectal', 'nonstandard', 'proscribed', 'poetic', 'colloquial', 'vulgar', 'slang', 'derogatory', 'offensive', 'pejorative', 'humorous', 'ironic', 'sarcastic', 'childish', 'euphemistic', 'informal', 'regional', 'uncommon', 'vernacular', 'historical', 'bureaucratese', 'slur', 'endearing', 'literary', 'Internet', 'Ukraine']);
/** Wiktionary's own bookkeeping rows of a table, not forms. */
const META_TAGS = new Set(['table-tags', 'inflection-template', 'class', 'romanization']);
/** `source` values of a form row that mark an inflection table ("inflection" is what some adjective- and noun-like tables carry). */
const TABLE_SOURCES = new Set(['declension', 'conjugation', 'inflection']);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const strs = (x: unknown): string[] => list(x).map(str).filter((t): t is string => !!t);
const inc = (m: Record<string, number>, k: string, n = 1): void => { m[k] = (m[k] ?? 0) + n; };
const fmt = (n: number): string => n.toLocaleString('en');
const PRE_REFORM = /[ѣіѳѵ]/;
/** A headword or form in pre-1918 spelling: ѣ і ѳ ѵ, or a final ъ after a consonant. */
const preReformKey = (key: string): boolean => PRE_REFORM.test(key) || /[бвгджзклмнпрстфхцчшщ]ъ$/.test(key);

/** The effective stress of a spelling: its marks, else what the spelling implies (ё, a single vowel). */
const effStress = (form: string, key: string): string => { const p = stressPositions(form); return (p.length ? p : impliedStress(key)).join(','); };

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

// ───────────────────────────── priors (UD Russian-GSD train) ─────────────────────────────

const UD_POS: Record<string, string> = { AUX: 'VERB', CCONJ: 'CONJ' };
const priorCount = new Map<string, number>(); // "<yoFold(key of lemma)>|<UD tag, AUX as VERB, CCONJ as CONJ>" → occurrences
const gsdTokens = new Map<string, number>(); // key of a word token → occurrences
let gsdTokenTotal = 0;
let gsdWordLines = 0;
const NOMINAL_UPOS = ['NOUN', 'PROPN', 'ADJ', 'PRON', 'DET', 'NUM'];
const nominalPriors: Record<string, Record<string, number>> = Object.fromEntries(NOMINAL_UPOS.map((u) => [u, {}]));
const verbalPriors: Record<string, number> = {};
const formReadings = new Map<string, Map<string, number>>(); // key of a form → "<lemma key>	<UPOS>" → occurrences (gold of the treebank)
const UD_CASE: Record<string, string> = { Nom: 'Nom', Gen: 'Gen', Dat: 'Dat', Acc: 'Acc', Ins: 'Ins', Loc: 'Prep', Par: 'Par', Voc: 'Voc' };
for (const line of fs.readFileSync(PRIORS, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const c = line.split('\t');
  if (c.length < 6 || /[-.]/.test(c[0])) continue;
  gsdWordLines++;
  const upos = UD_POS[c[3]] ?? c[3];
  const lk = yoFold(ruKey(c[2]));
  priorCount.set(`${lk}|${upos}`, (priorCount.get(`${lk}|${upos}`) ?? 0) + 1);
  if (!['PUNCT', 'SYM', 'X'].includes(c[3]) && /[а-яё]/i.test(c[1])) { const k = ruKey(c[1]); gsdTokens.set(k, (gsdTokens.get(k) ?? 0) + 1); gsdTokenTotal++; }
  if (!['PUNCT', 'SYM', 'X'].includes(c[3]) && /[а-яё]/i.test(c[1])) {
    const fk = ruKey(c[1]);
    const m = formReadings.get(fk) ?? formReadings.set(fk, new Map()).get(fk)!;
    const rk = `${ruKey(c[2])}	${upos}`;
    m.set(rk, (m.get(rk) ?? 0) + 1);
  }
  // feature priors: how often each bundle of features occurs per part of speech
  const feats: Record<string, string> = {};
  if (c[5] !== '_') for (const kv of c[5].split('|')) { const i = kv.indexOf('='); if (i > 0) feats[kv.slice(0, i)] = kv.slice(i + 1); }
  if (NOMINAL_UPOS.includes(c[3])) {
    const num = feats.Number ?? '-';
    const k = c[3] === 'ADJ' && feats.Variant === 'Short' ? `Short|${num}` : c[3] === 'ADJ' && feats.Degree === 'Cmp' ? 'Cmp|-' : `${UD_CASE[feats.Case ?? ''] ?? '-'}|${num}`;
    nominalPriors[c[3]][k] = (nominalPriors[c[3]][k] ?? 0) + 1;
  } else if (c[3] === 'VERB' || c[3] === 'AUX') {
    const vf = feats.VerbForm ?? '-';
    const k = [vf, vf === 'Fin' ? feats.Mood ?? '-' : '-', feats.Tense ?? '-', feats.Number ?? '-', feats.Person ?? '-'].join('|');
    verbalPriors[k] = (verbalPriors[k] ?? 0) + 1;
  }
}
const FALLBACK_TAGS = ['PRON', 'DET', 'CONJ', 'SCONJ', 'PART', 'ADV'];
/** The treebank count of a lemma under exactly this part of speech. */
const exactCount = (key: string, pos: string): number => priorCount.get(`${yoFold(key)}|${pos}`) ?? 0;

// ───────────────────────────── the store being built ─────────────────────────────

const lemmaIds: string[] = [];
const lemmaRows: RuLemmaRow[] = [];
const lemmaStress: string[] = [];
const lemmaKeys: string[][] = []; // the keys a lemma has rows under (may repeat), for the core
const lemmaIdCount = new Map<string, number>();
const lemmaByKeyPos = new Map<string, number[]>(); // "<key>|<POS>" → lemma numbers
const codes: string[] = [];
const codeNum = new Map<string, number>();
const forms = new Map<string, RuFormRow[]>();
const stats = {
  lines: 0, entries: 0, lemmaEntries: 0, formPages: 0, mixedEntries: 0, formPagesWithTable: 0,
  byPos: {} as Record<string, number>, skippedKinds: {} as Record<string, number>,
  rowsTable: 0, rowsPageTable: 0, rowsComparative: 0, rowsCitation: 0, rowsPage: 0, rowsTwoHop: 0,
  skip: { dash: 0, noCyrillic: 0, space: 0, preReform: 0, duplicate: 0, pageBlockedByTable: 0, headlineNotUsed: 0, unresolvedTargets: 0, targetNoWord: 0, bracketForm: 0, personalMatrix: 0, errorTagRows: 0, errorTagStripped: 0, emptyCode: 0, caseOnAdverb: 0, tag2: 0, genderCollapsed: 0, datedSibling: 0, preReformHeadwords: 0, pageTableMixedSenses: 0, advTableDropped: 0 },
  aspectFromTableTags: 0, prepRecovered: 0, altEntries: 0, rowsAlt: 0, advTableMoved: 0, advTableEntries: 0,
  noGenderBefore: 0, noAnimBefore: 0, noGenderAfter: 0, noAnimAfter: 0, genderFromOtherCanonical: 0, genderFromHead: 0, animFromOtherCanonical: 0, animFromHead: 0, nounLemmas: 0, pluralHead: 0,
};
const sconjList: Array<{ word: string; sconj: number; cconj: number }> = [];
const lemmaByKey = new Map<string, number[]>(); // key of the headword → lemma numbers of every part of speech
const lemmaByWordEty = new Map<string, number[]>(); // "<key>|<etymology number>" → lemma numbers
const advStash: Array<{ key: string; ety: string; cells: Cell[] }> = [];
const pageTableRows = new WeakSet<RuFormRow>(); // rows that come from a participle page's own table
const genderDiag: Array<{ lemma: number; cause: string; exp: string; gender: boolean; anim: boolean }> = [];
const pluralHeadExamples: string[] = [];
const unresolved = new Map<string, number>();
const prepSeen: Record<string, number> = {};

function intern(tags: Iterable<string>): number {
  const code = [...new Set(tags)].sort().join('|');
  let n = codeNum.get(code);
  if (n === undefined) { n = codes.length; codes.push(code); codeNum.set(code, n); }
  return n;
}

/** Adds one reading unless the same (key, lemma, code, stress) is there; true when it was added. */
function addRow(key: string, lemma: number, tagsIn: string[], stress: PackedStress): boolean {
  // "2" is a footnote marker of the table, not a label
  const tags = tagsIn.filter((t) => t !== '2');
  stats.skip.tag2 += tagsIn.length - tags.length;
  // an empty bundle says nothing: it is never written (a headword row carries "canonical")
  if (!tags.length) { stats.skip.emptyCode++; return false; }
  // a declension table or a case label cannot belong to an adverb (the source files the table of весь, такой under its adverb entry)
  if (lemmaRows[lemma][2] === 'ADV' && tags.some((t) => CASE_TAGS.has(t))) { stats.skip.caseOnAdverb++; return false; }
  const code = intern(tags);
  let rows = forms.get(key);
  if (!rows) { rows = []; forms.set(key, rows); }
  for (const r of rows) if (r[0] === lemma && r[1] === code && r[2] === stress) { stats.skip.duplicate++; return false; }
  rows.push(stress === undefined ? [lemma, code] : [lemma, code, stress]);
  lemmaKeys[lemma].push(key);
  return true;
}

interface Cell { key: string; tags: string[]; stress: PackedStress }

/** A form of the extract as a cell, or undefined (counted) when a rule leaves it out. */
function cellOf(form: string, tags: string[]): Cell | undefined {
  if (form === '-') { stats.skip.dash++; return undefined; }
  const f = form.normalize('NFC');
  if (!CYRILLIC_LETTER.test(f)) { stats.skip.noCyrillic++; return undefined; }
  if (/\s/.test(f)) { stats.skip.space++; return undefined; }
  const key = ruKey(f);
  if (PRE_REFORM.test(key) || key.endsWith('ъ')) { stats.skip.preReform++; return undefined; }
  if (/[()[\]]/.test(key)) { stats.skip.bracketForm++; return undefined; }
  return { key, tags, stress: packStress(stressPositions(f)) };
}

/** The table cells of an entry's `forms`. */
function tableCells(rows: Record<string, unknown>[]): Cell[] {
  const out: Cell[] = [];
  for (const f of rows) {
    if (!TABLE_SOURCES.has(String(f.source))) continue;
    const form = str(f.form);
    const tags = strs(f.tags);
    if (!form || tags.some((t) => META_TAGS.has(t) || t === 'canonical')) continue;
    // a cell Wiktionary's own template marked as an error (error-unrecognized-form) is not a form
    if (tags.some((t) => t.startsWith('error-'))) { stats.skip.errorTagRows++; continue; }
    // the second locative and its like are written with their preposition ("в году́", "на мосту́"): that is the word's own form
    const pm = /^(в|во|на|о|об|при) ([^\s]+)$/u.exec(form);
    const c = cellOf(pm ? pm[2] : form, tags);
    if (pm && c) { stats.prepRecovered++; prepSeen[pm[1]] = (prepSeen[pm[1]] ?? 0) + 1; }
    if (c) out.push(c);
  }
  return out;
}

/** Head-line comparatives and superlatives; "(по)краси́вее" gives both spellings. */
function headlineCells(rows: Record<string, unknown>[]): Cell[] {
  const out: Cell[] = [];
  for (const f of rows) {
    if (f.source !== undefined) continue;
    const form = str(f.form);
    const raw = strs(f.tags);
    // an error-unknown-tag beside the label is the template's complaint about a second label, not a label
    const tags = raw.filter((t) => !t.startsWith('error-'));
    stats.skip.errorTagStripped += raw.length - tags.length;
    if (!form) continue;
    if (!tags.includes('comparative') && !tags.includes('superlative')) { if (!tags.includes('canonical') && !META_TAGS.has(tags[0] ?? '')) stats.skip.headlineNotUsed++; continue; }
    const m = /^\(([^)]*)\)(.+)$/.exec(form);
    for (const spelling of m ? [m[2], m[1] + m[2]] : [form]) {
      const c = cellOf(spelling, tags);
      if (c) out.push(c);
    }
  }
  return out;
}

interface Page { key: string; pos: string; stress: PackedStress; targets: Array<{ target: string; tags: string[]; alt?: boolean }>; table: Cell[] }
const pages: Page[] = [];
const pagesByKey = new Map<string, number[]>();

/**
 * The gender and animacy a head-line expansion states ("за́мок • (zámok) m inan (genitive …)", "m anim or f anim", "anim pl (…)", "? inan"):
 * what stands between the transliteration and the first bracket or comma; stops at the first word it does not know. Never read from an ending.
 */
function headGender(exp: string): { g: string[]; a: string[]; pl: boolean; q: boolean } | undefined {
  const m = /•\s*\([^)]*\)\s*(.*)$/.exec(exp);
  if (!m) return undefined;
  const cut = m[1].search(/[(,]/);
  const toks = (cut >= 0 ? m[1].slice(0, cut) : m[1]).trim().split(/\s+/).filter(Boolean);
  const g = new Set<string>();
  const a = new Set<string>();
  let pl = false;
  let q = false;
  let any = false;
  for (const t of toks) {
    if (t === 'or') continue;
    if (t === 'm') g.add('Masc'); else if (t === 'f') g.add('Fem'); else if (t === 'n') g.add('Neut');
    else if (t === 'anim') a.add('Anim'); else if (t === 'inan') a.add('Inan');
    else if (t === 'pl') pl = true; else if (t === '?') q = true; else break;
    any = true;
  }
  return any ? { g: [...g].sort(), a: [...a].sort(), pl, q } : undefined;
}

// ───────────────────────────── pass 1: the extract ─────────────────────────────

const rl = readline.createInterface({ input: fs.createReadStream(INPUT).pipe(zlib.createGunzip()) });
for await (const line of rl) {
  if (!line.trim()) continue;
  stats.lines++;
  let e: unknown;
  try { e = JSON.parse(line); } catch { continue; }
  if (!isObj(e)) continue;
  const posName = str(e.pos) ?? '';
  let pos = POS[posName];
  const word = str(e.word)?.normalize('NFC');
  if (!pos || !word) { inc(stats.skippedKinds, posName || '(none)'); continue; }
  const key = ruKey(word);
  // an entry whose own headword is in pre-1918 spelling is left out, as its forms are
  if (preReformKey(key)) { stats.skip.preReformHeadwords++; continue; }
  stats.entries++;
  // a conjunction the treebank tags SCONJ (at least 3 times and more often than CCONJ) is a subordinating conjunction
  if (pos === 'CONJ') {
    const sc = exactCount(key, 'SCONJ');
    const cc = exactCount(key, 'CONJ');
    if (sc >= 3 && sc > cc) { pos = 'SCONJ'; sconjList.push({ word: key, sconj: sc, cconj: cc }); }
  }
  inc(stats.byPos, pos);
  const formRows = list(e.forms).filter(isObj);
  const senses = list(e.senses).filter(isObj);
  const formOfSenses = senses.filter((s) => list(s.form_of).length > 0);
  // an alternative spelling (alt-of) is no lemma: it is read like a form of its target, with the label "alternative"
  const isAlt = (x: Record<string, unknown>): boolean => list(x.alt_of).length > 0 || strs(x.tags).includes('alt-of');
  const altSenses = senses.filter((x) => list(x.form_of).length === 0 && isAlt(x));
  const lemmaSenses = senses.filter((x) => list(x.form_of).length === 0 && !isAlt(x));
  if (!lemmaSenses.length && altSenses.length) stats.altEntries++;
  const canon = formRows.find((f) => strs(f.tags).includes('canonical') && str(f.form));
  const canonForm = str(canon?.form)?.normalize('NFC');
  const headForm = canonForm && ruKey(canonForm) === key ? canonForm : word;
  const headStress = packStress(stressPositions(headForm));
  let table = tableCells(formRows);
  // the table of a personal pronoun (я, он, мы …) is the whole matrix of personal pronouns, the same under every one of them, and its
  // first- and second-person cells carry no number: a cell cannot be told from the tags to be this pronoun's or another's. Only the
  // cells that spell the headword itself are kept; the other forms come from the "form of" pages (меня = genitive of я) the source has.
  if (pos === 'PRON' && table.some((c) => c.tags.includes('personal') && c.tags.includes('pronoun'))) {
    const own = table.filter((c) => c.key === key);
    stats.skip.personalMatrix += table.length - own.length;
    table = own;
  }

  let lemma = -1;
  if (lemmaSenses.length) {
    stats.lemmaEntries++;
    if (formOfSenses.length || altSenses.length) stats.mixedEntries++;
    const idKey = `${key}|${pos}`;
    const nth = (lemmaIdCount.get(idKey) ?? 0) + 1;
    lemmaIdCount.set(idKey, nth);
    lemma = lemmaIds.length;
    lemmaIds.push(nth === 1 ? idKey : `${idKey}|${nth}`);
    lemmaStress.push(effStress(headForm, key));
    lemmaKeys.push([]);
    (lemmaByKeyPos.get(idKey) ?? lemmaByKeyPos.set(idKey, []).get(idKey)!).push(lemma);
    (lemmaByKey.get(key) ?? lemmaByKey.set(key, []).get(key)!).push(lemma);
    const ety = String(e.etymology_number ?? '');
    (lemmaByWordEty.get(`${key}|${ety}`) ?? lemmaByWordEty.set(`${key}|${ety}`, []).get(`${key}|${ety}`)!).push(lemma);
    // the source files an inflection table under the last part of speech of an etymology (the adverb of весь, такой): kept apart, moved to the declinable sibling entries below
    if (pos === 'ADV' && table.some((c) => c.tags.some((t) => CASE_TAGS.has(t)))) { stats.advTableEntries++; advStash.push({ key, ety, cells: table }); table = []; }

    const gloss = shortGloss(strs(list(lemmaSenses.find((s) => strs(s.glosses).length)?.glosses))[0] ?? '');
    const lex: Record<string, string> = {};
    const canonTags = strs(canon?.tags);
    if (pos === 'NOUN' || pos === 'PROPN') {
      stats.nounLemmas++;
      const GEN = { masculine: 'Masc', feminine: 'Fem', neuter: 'Neut' } as const;
      const ANI = { animate: 'Anim', inanimate: 'Inan' } as const;
      const tagsOfAll = new Set(formRows.filter((f) => strs(f.tags).includes('canonical')).flatMap((f) => strs(f.tags)));
      const pick = (m: Record<string, string>, tags: Iterable<string>): string[] => { const have = new Set(tags); return Object.keys(m).filter((t) => have.has(t)).map((t) => m[t]).sort(); };
      const head = list(e.head_templates).filter(isObj).map((h) => headGender(str(h.expansion) ?? '')).find((x) => x !== undefined);
      if (head?.pl) { stats.pluralHead++; if (pluralHeadExamples.length < 6) pluralHeadExamples.push(`${word}: ${list(e.head_templates).filter(isObj).map((h) => str(h.expansion) ?? '').join(' ; ').slice(0, 90)}`); }
      const gFirst = pick(GEN, canonTags);
      const aFirst = pick(ANI, canonTags);
      let g = pick(GEN, tagsOfAll);
      let a = pick(ANI, tagsOfAll);
      if (g.length && !gFirst.length) stats.genderFromOtherCanonical++;
      if (a.length && !aFirst.length) stats.animFromOtherCanonical++;
      if (!g.length && head?.g.length) { g = head.g; stats.genderFromHead++; }
      if (!a.length && head?.a.length) { a = head.a; stats.animFromHead++; }
      if (!gFirst.length) stats.noGenderBefore++;
      if (!aFirst.length) stats.noAnimBefore++;
      if (g.length) lex.Gender = g.join(',');
      if (a.length) lex.Animacy = a.join(',');
      if (!g.length) stats.noGenderAfter++;
      if (!a.length) stats.noAnimAfter++;
      if (!g.length || !a.length) {
        const exp = list(e.head_templates).filter(isObj).map((h) => str(h.expansion) ?? '').join(' ; ').slice(0, 110);
        const cause = head?.pl ? 'plural-only (the head line says pl)' : tagsOfAll.has('plural') ? 'the canonical row is tagged plural' : head?.q ? 'the head line says ? (unknown)' : head ? 'the head line names no gender or animacy' : !canon ? 'no canonical row and no parsable head line' : 'canonical row without the tag, no parsable head line';
        genderDiag.push({ lemma, cause, exp, gender: !g.length, anim: !a.length });
      }
    }
    let partners: string[] | undefined;
    if (pos === 'VERB') {
      const ttRows = formRows.filter((f) => strs(f.tags).includes('table-tags')).map((f) => str(f.form) ?? '');
      let asp: string[] = canonTags.filter((t) => t === 'imperfective' || t === 'perfective');
      if (!asp.length) { asp = ['imperfective', 'perfective'].filter((t) => ttRows.some((r) => r.split(/\s+/).includes(t))); if (asp.length) stats.aspectFromTableTags++; }
      if (asp.length) lex.Aspect = asp.map((t) => (t === 'imperfective' ? 'Imp' : 'Perf')).sort().join(',');
      if (/(ся|сь)$/.test(key)) lex.Reflex = 'Yes';
      const sub = ['intransitive', 'transitive'].filter((t) => ttRows.some((r) => r.split(/\s+/).includes(t))).map((t) => (t === 'transitive' ? 'Tran' : 'Intr')).sort();
      if (sub.length) lex.Subcat = sub.join(',');
      const ps = formRows.filter((f) => f.source === undefined && (() => { const t = strs(f.tags); return t.length === 1 && (t[0] === 'perfective' || t[0] === 'imperfective'); })()).map((f) => str(f.form)?.normalize('NFC')).filter((f): f is string => !!f && CYRILLIC_LETTER.test(f));
      if (ps.length) partners = [...new Set(ps)];
    }
    const lexStr = Object.keys(lex).sort().map((k) => `${k}=${lex[k]}`).join('|');
    lemmaRows.push(partners ? [headForm, gloss, pos, lexStr, exactCount(key, pos), partners] : [headForm, gloss, pos, lexStr, exactCount(key, pos)]);

    for (const c of table) if (addRow(c.key, lemma, c.tags, c.stress)) stats.rowsTable++;
    for (const c of headlineCells(formRows)) if (addRow(c.key, lemma, c.tags, c.stress)) stats.rowsComparative++;
    // a word with no table (и, не, в, adverbs) is read through its headword: the source's own canonical row
    if (!(forms.get(key) ?? []).some((r) => r[0] === lemma)) {
      const c = cellOf(headForm, canonTags.length ? canonTags : ['canonical']);
      if (c && addRow(c.key, lemma, c.tags, c.stress)) stats.rowsCitation++;
    }
  }

  if (formOfSenses.length || altSenses.length) {
    const targets: Page['targets'] = [];
    for (const x of formOfSenses) {
      const tags = strs(x.tags).filter((t) => t !== 'form-of');
      for (const fo of list(x.form_of).filter(isObj)) {
        const t = str(fo.word)?.normalize('NFC').replace(/ (pf|impf)$/, '');
        if (t) targets.push({ target: t, tags }); else stats.skip.targetNoWord++;
      }
    }
    for (const x of altSenses) {
      const tags = [...strs(x.tags).filter((t) => t !== 'alt-of' && t !== 'alternative'), 'alternative'];
      for (const ao of list(x.alt_of).filter(isObj)) {
        const t = str(ao.word)?.normalize('NFC').replace(/ (pf|impf)$/, '');
        if (t) targets.push({ target: t, tags, alt: true });
      }
    }
    if (targets.length) {
      if (lemma < 0) { stats.formPages++; if (table.length) stats.formPagesWithTable++; }
      // a page's own table is read only when every sense of the page carries the same labels (a participle); a page whose senses differ
      // (the pronoun matrix of ним: dative of они, instrumental of он) is read sense by sense, never by crossing cells with senses
      let ownTable = lemma < 0 ? table : [];
      if (ownTable.length && new Set(targets.map((t) => [...t.tags].sort().join('|'))).size > 1) { stats.skip.pageTableMixedSenses++; ownTable = []; }
      const idx = pages.length;
      pages.push({ key, pos, stress: headStress, targets, table: ownTable });
      (pagesByKey.get(key) ?? pagesByKey.set(key, []).get(key)!).push(idx);
    }
  }
}
console.log(`read ${fmt(stats.lines)} lines: ${fmt(stats.lemmaEntries)} lemma entries, ${fmt(stats.formPages)} form pages (${fmt(stats.formPagesWithTable)} with a table), ${fmt(stats.mixedEntries)} lemma entries that also hold form-of senses`);

// the table of an adverb entry (весь, такой): moved to the declinable entries of the same word and etymology (determiner, pronoun, numeral; else adjective), or dropped
for (const t of advStash) {
  const same = lemmaByWordEty.get(`${t.key}|${t.ety}`) ?? [];
  const sib = same.filter((l) => ['DET', 'PRON', 'NUM'].includes(lemmaRows[l][2]));
  const targets = sib.length ? sib : same.filter((l) => lemmaRows[l][2] === 'ADJ');
  if (!targets.length) { stats.skip.advTableDropped += t.cells.length; continue; }
  for (const l of targets) for (const c of t.cells) if (addRow(c.key, l, c.tags, c.stress)) stats.advTableMoved++;
}
// counts: exact by part of speech; a closed-class lemma none of whose entries has an exact count takes the largest count under another closed-class tag
for (const ids of lemmaByKey.values()) {
  if (ids.some((l) => lemmaRows[l][4] > 0)) continue;
  for (const l of ids) {
    if (!FALLBACK_TAGS.includes(lemmaRows[l][2])) continue;
    const k = ruKey(lemmaRows[l][0]);
    lemmaRows[l][4] = Math.max(0, ...FALLBACK_TAGS.map((t) => exactCount(k, t)));
  }
}

// ───────────────────────────── resolution of form pages ─────────────────────────────

/** The lemma entries a target word names: same key and part of speech; when several, those whose headword has the same stress. */
function directLemmas(target: string, pos: string): number[] {
  const key = ruKey(target);
  const cands = pos === 'CONJ' || pos === 'SCONJ' ? [...(lemmaByKeyPos.get(`${key}|CONJ`) ?? []), ...(lemmaByKeyPos.get(`${key}|SCONJ`) ?? [])] : lemmaByKeyPos.get(`${key}|${pos}`) ?? [];
  if (cands.length <= 1) return cands;
  const st = effStress(target, key);
  const same = cands.filter((l) => lemmaStress[l] === st);
  return same.length ? same : cands;
}

interface Resolved { lemma: number; tags: string[]; hop: boolean }
/** Where a page's form-of targets lead: lemma entries directly, else one hop through a form page of the target's key. */
function resolve(p: Page): Resolved[] {
  const out: Resolved[] = [];
  for (const { target, tags, alt } of p.targets) {
    const direct = directLemmas(target, p.pos);
    if (direct.length) { for (const l of direct) out.push({ lemma: l, tags, hop: false }); continue; }
    let hopped = false;
    const hopPages = (pagesByKey.get(ruKey(target)) ?? []).map((i) => pages[i]);
    const sameKind = hopPages.filter((h) => h.pos === p.pos);
    for (const h of sameKind.length ? sameKind : hopPages) {
      for (const t2 of h.targets) {
        for (const l of directLemmas(t2.target, h.pos)) { out.push({ lemma: l, tags: [...tags, ...t2.tags], hop: true }); hopped = true; }
      }
    }
    // an alternative spelling may sit under another part of speech than its target (все determiner, всё pronoun)
    if (!hopped && alt) for (const l of lemmaByKey.get(ruKey(target)) ?? []) { out.push({ lemma: l, tags, hop: false }); hopped = true; }
    if (!hopped) { stats.skip.unresolvedTargets++; unresolved.set(target, (unresolved.get(target) ?? 0) + 1); }
  }
  return out;
}

// pages that own a table (a participle with its declension): their rows, filed under the verb with the page's own labels added
const resolvedPages = pages.map((p) => resolve(p));
for (let i = 0; i < pages.length; i++) {
  const p = pages[i];
  if (!p.table.length) continue;
  for (const r of resolvedPages[i]) for (const c of p.table) if (addRow(c.key, r.lemma, [...c.tags, ...r.tags], c.stress)) { stats.rowsPageTable++; const rs = forms.get(c.key)!; pageTableRows.add(rs[rs.length - 1]); }
}
// the page's own row, only where no table (or head-line) row of that lemma exists under the key yet; checked against the state before any page row is added
const pending: Array<{ key: string; lemma: number; tags: string[]; stress: PackedStress; hop: boolean }> = [];
for (let i = 0; i < pages.length; i++) {
  const p = pages[i];
  // a page of a pre-reform spelling (королѣ), a word with a space or no Cyrillic letter is left out like a table cell of that kind (counted once per page)
  if (resolvedPages[i].length && !cellOf(p.key, [])) continue;
  for (const r of resolvedPages[i]) {
    if ((forms.get(p.key) ?? []).some((row) => row[0] === r.lemma)) { stats.skip.pageBlockedByTable++; continue; }
    pending.push({ key: p.key, lemma: r.lemma, tags: r.tags, stress: p.stress, hop: r.hop });
  }
}
for (const c of pending) if (addRow(c.key, c.lemma, c.tags, c.stress)) { if (c.hop) stats.rowsTwoHop++; else stats.rowsPage++; if (c.tags.includes('alternative')) stats.rowsAlt++; }

// past plural has no gender, yet the source repeats the form under each gender: the gender labels are dropped from a row labelled past and
// plural; and where the rows of one lemma and key differ only by a gender label and all three genders are there, they collapse into one without it
const collapsedCodes = new Map<string, number>();
const touch = (code: string): void => { collapsedCodes.set(code, (collapsedCodes.get(code) ?? 0) + 1); };
const sigOf = (r: RuFormRow): string => `${r[0]}\t${r[1]}\t${r[2] ?? ''}`;
for (const [, rows] of forms) {
  let work: RuFormRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    let row = r;
    const tags = codes[r[1]].split('|');
    if (tags.includes('past') && tags.includes('plural') && tags.some((t) => GENDER_TAGS.has(t))) {
      const nt = tags.filter((t) => !GENDER_TAGS.has(t));
      row = r[2] === undefined ? [r[0], intern(nt)] : [r[0], intern(nt), r[2]];
      if (pageTableRows.has(r)) pageTableRows.add(row);
      touch(codes[r[1]]);
    }
    const sg = sigOf(row);
    if (seen.has(sg)) { stats.skip.genderCollapsed++; continue; }
    seen.add(sg); work.push(row);
  }
  const groups = new Map<string, RuFormRow[]>();
  for (const r of work) {
    const tags = codes[r[1]].split('|');
    const g = tags.filter((t) => GENDER_TAGS.has(t));
    if (g.length !== 1 || tags.length < 2) continue;
    const gk = `${r[0]}\t${r[2] ?? ''}\t${tags.filter((t) => !GENDER_TAGS.has(t)).join('|')}`;
    (groups.get(gk) ?? groups.set(gk, []).get(gk)!).push(r);
  }
  const drop = new Set<RuFormRow>();
  const replace = new Map<RuFormRow, RuFormRow>();
  for (const [gk, members] of groups) {
    if (new Set(members.map((r) => codes[r[1]].split('|').find((t) => GENDER_TAGS.has(t)))).size < 3) continue;
    const rest = gk.split('\t')[2].split('|');
    const first = members[0];
    const nr: RuFormRow = first[2] === undefined ? [first[0], intern(rest)] : [first[0], intern(rest), first[2]];
    if (members.every((m) => pageTableRows.has(m))) pageTableRows.add(nr);
    replace.set(first, nr);
    for (const m of members) { touch(codes[m[1]]); if (m !== first) drop.add(m); }
  }
  if (replace.size || drop.size) {
    const before = work.length;
    const seen2 = new Set<string>();
    const out: RuFormRow[] = [];
    for (const r of work) {
      if (drop.has(r)) continue;
      const row = replace.get(r) ?? r;
      const sg = sigOf(row);
      if (seen2.has(sg)) continue;
      seen2.add(sg); out.push(row);
    }
    stats.skip.genderCollapsed += before - out.length;
    work = out;
  }
  // a row labelled dated is not kept when the same lemma has a row under the key that is not (a dated function of a form that is also a current form)
  const undated = new Set<number>();
  const isDated = (r: RuFormRow): boolean => codes[r[1]].split('|').includes('dated');
  for (const r of work) if (!isDated(r)) undated.add(r[0]);
  const kept = work.filter((r) => { if (isDated(r) && undated.has(r[0])) { stats.skip.datedSibling++; return false; } return true; });
  rows.length = 0;
  rows.push(...kept);
}
const codeUse = new Map<string, number>();
for (const rows of forms.values()) for (const r of rows) codeUse.set(codes[r[1]], (codeUse.get(codes[r[1]]) ?? 0) + 1);

// ───────────────────────────── derived figures ─────────────────────────────

const keys = [...forms.keys()].sort();
const yoMap = new Map<string, string[]>();
for (const k of keys) if (k.includes('ё')) { const f = yoFold(k); (yoMap.get(f) ?? yoMap.set(f, []).get(f)!).push(k); }
let rowTotal = 0;
let multiLemmaKeys = 0;
for (const k of keys) { const rs = forms.get(k)!; rowTotal += rs.length; if (new Set(rs.map((r) => r[0])).size > 1) multiLemmaKeys++; }
const lemmasWithRows = lemmaKeys.filter((l) => l.length).length;
const topUnresolved = [...unresolved].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
console.log(`${fmt(keys.length)} keys, ${fmt(rowTotal)} rows, ${fmt(lemmaIds.length)} lemma ids (${fmt(lemmasWithRows)} with rows), ${fmt(codes.length)} distinct codes`);

// ───────────────────────────── probes ─────────────────────────────

function lineOf(key: string, r: RuFormRow, via: string): string {
  const id = lemmaIds[r[0]];
  const lr = lemmaRows[r[0]];
  return `  ${via}${withStress(key, unpackStress(r[2]))}  →  ${id}  [${lr[0]} "${lr[1]}" ${lr[2]} ${lr[3] || '-'} n=${lr[4]}${lr[5] ? ` partners=${lr[5].join('/')}` : ''}]  ${codes[r[1]]}`;
}
for (const w of PROBES) {
  const key = ruKey(w);
  console.log(`probe ${w} (key ${key})`);
  for (const r of forms.get(key) ?? []) console.log(lineOf(key, r, ''));
  if (!key.includes('ё')) for (const k of yoMap.get(yoFold(key)) ?? []) for (const r of forms.get(k) ?? []) console.log(lineOf(k, r, '(yo) '));
  if (!forms.has(key) && !yoMap.has(yoFold(key))) console.log('  (no reading)');
}

// ───────────────────────────── shards ─────────────────────────────

/** A complete index of the given keys: its own codes and lemma ids, the lemma rows its rows refer to, its own yo entries. */
function buildIndex(id: string, shard: string | undefined, theKeys: string[], rowFilter?: (lemma: number, row: RuFormRow) => boolean): RussianFormIndex {
  const lcodes: string[] = [];
  const lcode = new Map<number, number>();
  const lids: string[] = [];
  const llemma = new Map<number, number>();
  const lemmas: Record<string, RuLemmaRow> = {};
  const out: Record<string, RuFormRow[]> = {};
  const yo: Record<string, string[]> = {};
  for (const k of theKeys) {
    const rows: RuFormRow[] = [];
    for (const r of forms.get(k)!) {
      if (rowFilter && !rowFilter(r[0], r)) continue;
      let li = llemma.get(r[0]);
      if (li === undefined) { li = lids.length; lids.push(lemmaIds[r[0]]); llemma.set(r[0], li); lemmas[lemmaIds[r[0]]] = lemmaRows[r[0]]; }
      let ci = lcode.get(r[1]);
      if (ci === undefined) { ci = lcodes.length; lcodes.push(codes[r[1]]); lcode.set(r[1], ci); }
      rows.push(r[2] === undefined ? [li, ci] : [li, ci, r[2]]);
    }
    if (!rows.length) continue;
    out[k] = rows;
    if (k.includes('ё')) (yo[yoFold(k)] ??= []).push(k);
  }
  const idx: RussianFormIndex = { schema: 1, id, ...(shard !== undefined ? { shard } : {}), source: SOURCE, built: TODAY, codes: lcodes, lemmaIds: lids, lemmas, forms: out, yo };
  return idx;
}

interface ShardOut { prefix: string; file: string; plain: number; gz: number; keys: number; buf: Buffer }
const shardOuts: ShardOut[] = [];
const lettersOf = new Map<string, string>();
for (const k of keys) lettersOf.set(k, ruShardLetters(k));

function emitShard(prefix: string, theKeys: string[]): void {
  const idx = buildIndex('kaikki-ru-tables', prefix, theKeys);
  const plain = JSON.stringify(idx);
  const buf = zlib.gzipSync(plain, { level: 9 });
  shardOuts.push({ prefix, file: `${prefix}.json.gz`, plain: Buffer.byteLength(plain), gz: buf.length, keys: Object.keys(idx.forms).length, buf });
}
function split(prefix: string, theKeys: string[], depth: number): void {
  const size = Buffer.byteLength(JSON.stringify(buildIndex('kaikki-ru-tables', prefix, theKeys)));
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
console.log(`${shardOuts.length} shards, ${(gzTotal / 1e6).toFixed(2)} MB gzip (${(plainTotal / 1e6).toFixed(1)} MB plain); largest ${largest.prefix} ${(largest.plain / 1e6).toFixed(2)} MB plain / ${(largest.gz / 1e6).toFixed(2)} MB gzip; largest gzip ${largestGz.prefix} ${(largestGz.gz / 1e6).toFixed(2)} MB`);

// ───────────────────────────── core ─────────────────────────────

// The core leaves out the rows of the declined participles (a participle page's own table: the verb's own table keeps their citation forms) and,
// where the lemma has plain rows, the rows that carry a label of register or period.
const regCode = codes.map((c) => c.split('|').some((t) => REGISTER_TAGS.has(t)));
const hasPlain = new Uint8Array(lemmaIds.length);
for (const rows of forms.values()) for (const r of rows) if (!pageTableRows.has(r) && !regCode[r[1]]) hasPlain[r[0]] = 1;
const coreRow = (l: number, r: RuFormRow): boolean => !pageTableRows.has(r) && (!regCode[r[1]] || !hasPlain[l]);
const eligible = new Uint8Array(lemmaIds.length);
for (const rows of forms.values()) for (const r of rows) if (coreRow(r[0], r)) eligible[r[0]] = 1;
const lemmaOrder: number[] = [];
for (let l = 0; l < lemmaIds.length; l++) if (eligible[l]) lemmaOrder.push(l);
const byCount = (a: number, b: number): number => lemmaRows[b][4] - lemmaRows[a][4] || (lemmaIds[a] < lemmaIds[b] ? -1 : 1);
const closed = lemmaOrder.filter((l) => CLOSED.has(lemmaRows[l][2]) && lemmaRows[l][4] >= 1).sort(byCount);
const open = lemmaOrder.filter((l) => !CLOSED.has(lemmaRows[l][2]) && lemmaRows[l][4] >= 1).sort(byCount);
// the seed: every lemma id whose headword key equals a seed line (all parts of speech, all |2 ids), in the file's order, after the closed classes
const seedLines = fs.existsSync(CORE_SEED) ? fs.readFileSync(CORE_SEED, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];
const seedNotFound: string[] = [];
const seedIds: number[] = [];
{
  const taken = new Set(closed);
  const byHead = new Map<string, number[]>();
  for (const l of lemmaOrder) { const k = lemmaIds[l].split('|')[0]; (byHead.get(k) ?? byHead.set(k, []).get(k)!).push(l); }
  for (const line of seedLines) {
    const found = byHead.get(ruKey(line)) ?? [];
    if (!found.length) seedNotFound.push(line);
    for (const l of found) if (!taken.has(l)) { taken.add(l); seedIds.push(l); }
  }
}
const seeded = new Set(seedIds);
const ranked = [...closed, ...seedIds, ...open.filter((l) => !seeded.has(l))];
const fixedCount = closed.length + seedIds.length;

function coreWith(n: number): RussianFormIndex {
  const chosen = new Set(ranked.slice(0, n));
  const theKeys = [...new Set(ranked.slice(0, n).flatMap((l) => lemmaKeys[l]))].sort();
  const idx = buildIndex('ru-core', undefined, theKeys, (l, r) => chosen.has(l) && coreRow(l, r));
  // room for the figures added below, so that the budget holds for the file as written
  idx.stats = { lemmas: 99999, closedLemmas: 99999, keys: 99999, rows: 999999, tokenCoverage: 0.9999, tokenCoverageYo: 0.9999, tokens: 999999, seedLemmas: 9999 };
  return idx;
}
const coreSize = (n: number): number => Buffer.byteLength(JSON.stringify(coreWith(n)));
function fitCore(budget: number): number {
  let lo = Math.min(fixedCount, ranked.length);
  let hi = ranked.length;
  if (coreSize(lo) > budget) console.warn(`warning: the closed classes plus the seed exceed a core budget of ${budget} bytes; they are kept`);
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (coreSize(mid) <= budget) lo = mid; else hi = mid - 1; }
  return lo;
}
function coverageOf(c: RussianFormIndex): { by: number; yo: number } {
  let covered = 0;
  let coveredYo = 0;
  for (const [k, n] of gsdTokens) { if (c.forms[k]) covered += n; if (c.forms[k] || c.yo[k]) coveredYo += n; }
  return { by: Math.round((covered / gsdTokenTotal) * 10000) / 10000, yo: Math.round((coveredYo / gsdTokenTotal) * 10000) / 10000 };
}
const projections: string[] = [];
for (const b of [450_000, 600_000, 800_000]) {
  const n = fitCore(b);
  const c = coverageOf(coreWith(n));
  projections.push(`${fmt(b)} bytes: ${n} lemmas, tokenCoverage ${c.by} (${c.yo} with е for ё)`);
}
console.log(`core budget projections (nothing stored): ${projections.join('; ')}`);
const lo = fitCore(CORE_BUDGET);
const core = coreWith(lo);
const cov = coverageOf(core);
const tokenCoverage = cov.by;
const tokenCoverageYo = cov.yo;
const coreRows = Object.values(core.forms).reduce((s, r) => s + r.length, 0);
core.stats = { lemmas: core.lemmaIds.length, closedLemmas: Math.min(closed.length, lo), seedLemmas: seedIds.length, keys: Object.keys(core.forms).length, rows: coreRows, tokenCoverage, tokenCoverageYo, tokens: gsdTokenTotal };
const coreJson = JSON.stringify(core);
const coreBytes = Buffer.byteLength(coreJson);
const lastCount = lo > fixedCount ? lemmaRows[ranked[lo - 1]][4] : 0;
console.log(`core seed: ${seedLines.length} lines, ${seedIds.length} lemma ids added, not found in the index: ${seedNotFound.length ? seedNotFound.join(', ') : 'none'}; the count of the last open-class lemma admitted: ${lastCount}`);
console.log(`core: ${core.lemmaIds.length} lemmas (${Math.min(closed.length, lo)} closed-class), ${core.stats.keys} keys, ${coreRows} rows, ${fmt(coreBytes)} bytes of JSON, tokenCoverage ${tokenCoverage} (${tokenCoverageYo} reading е for ё) over ${fmt(gsdTokenTotal)} GSD tokens`);

// ───────────────────────────── output ─────────────────────────────

const topCodes = [...codeUse].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
const tagCount = new Map<string, number>();
for (const [c, n] of codeUse) for (const t of c.split('|')) tagCount.set(t, (tagCount.get(t) ?? 0) + n);
const posLine = Object.entries(stats.byPos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(', ');
const skippedLine = Object.entries(stats.skippedKinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(', ');
// form priors: what the treebank has for a form the index reads more than one way (at least 3 occurrences, readings of two different headword and part-of-speech pairs)
const formPriorRows: Record<string, Array<[string, string, number]>> = {};
for (const k of [...formReadings.keys()].sort()) {
  const m = formReadings.get(k)!;
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  if (total < 3) continue;
  const readings = new Set((forms.get(k) ?? []).map((r) => lemmaIds[r[0]].split('|').slice(0, 2).join('|')));
  if (readings.size < 2) continue;
  formPriorRows[k] = [...m].map(([rk, n]): [string, string, number] => { const [l, u] = rk.split('	'); return [l, u, n]; }).sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
}
const formPriorKeys = Object.keys(formPriorRows).length;
const formPriorRowCount = Object.values(formPriorRows).reduce((a, r) => a + r.length, 0);
const genderCauses = new Map<string, { g: number; a: number }>();
for (const d of genderDiag) { const c = genderCauses.get(d.cause) ?? { g: 0, a: 0 }; if (d.gender) c.g++; if (d.anim) c.a++; genderCauses.set(d.cause, c); }
const diagTop = (gender: boolean): string => genderDiag.filter((d) => (gender ? d.gender : d.anim)).sort((a, b) => lemmaRows[b.lemma][4] - lemmaRows[a.lemma][4] || (lemmaIds[a.lemma] < lemmaIds[b.lemma] ? -1 : 1)).slice(0, 30).map((d) => `${lemmaIds[d.lemma].split('|')[0]} (${lemmaRows[d.lemma][4]}; ${d.cause})`).join(', ');
const s = stats.skip;
const doc = `# Russian form index: build of ${TODAY}

Built by \`npm run ru:build-index\` (\`scripts/ru-build-index.mts\`) from \`${INPUT}\` (Wiktionary via kaikki.org, CC BY-SA 4.0; extract last modified ${SOURCE.lastModified}, retrieved ${SOURCE.retrieved}, sha256 \`${SOURCE.sha256}\`)
with reading priors from \`${PRIORS}\` (UD Russian-GSD train, CC BY-SA 4.0). Every row is a Wiktionary table row, a head-line comparative or superlative, or a "form of" page; the tag bundles are
the source's, verbatim. Nothing was analysed here.

| measure | value |
|---|---|
| input lines | ${fmt(stats.lines)} |
| entries read | ${fmt(stats.entries)} (${posLine}) |
| lemma entries / form pages / lemma entries that also hold form-of senses | ${fmt(stats.lemmaEntries)} / ${fmt(stats.formPages)} / ${fmt(stats.mixedEntries)} |
| form pages that own a table (participles) | ${fmt(stats.formPagesWithTable)} |
| lemma ids (with at least one row) | ${fmt(lemmaIds.length)} (${fmt(lemmasWithRows)}) |
| form keys | ${fmt(keys.length)} |
| readings (rows) | ${fmt(rowTotal)} |
| rows by origin: lemma table / participle-page table / head-line comparative and superlative / headword of a lemma with no table / form-of page / two-hop form-of page | ${fmt(stats.rowsTable)} / ${fmt(stats.rowsPageTable)} / ${fmt(stats.rowsComparative)} / ${fmt(stats.rowsCitation)} / ${fmt(stats.rowsPage)} / ${fmt(stats.rowsTwoHop)} |
| keys with ё | ${fmt([...forms.keys()].filter((k) => k.includes('ё')).length)} (е-spellings in the yo map: ${fmt(yoMap.size)}) |
| keys with more than one lemma | ${fmt(multiLemmaKeys)} |
| distinct tag bundles (codes) | ${fmt(codes.length)} |
| kinds of entry skipped | ${skippedLine} |
| rows left out: "-" cells / no Cyrillic letter / with a space / pre-reform spelling / with brackets / exact duplicates | ${fmt(s.dash)} / ${fmt(s.noCyrillic)} / ${fmt(s.space)} / ${fmt(s.preReform)} / ${fmt(s.bracketForm)} / ${fmt(s.duplicate)} |
| rows left out: cells of the shared personal-pronoun matrix that do not spell the headword | ${fmt(s.personalMatrix)} |
| rows left out: a dated function of a form that is also a current form of the same lemma (a row labelled dated is kept only when the lemma has no undated row under the key) | ${fmt(s.datedSibling)} |
| rows collapsed because past plural (and any cell of three gender-tagged rows differing only by gender) has no gender | ${fmt(s.genderCollapsed)} |
| rows dropped for an empty tag bundle / for a case label on an adverb / tags "2" removed (a footnote marker) | ${fmt(s.emptyCode)} / ${fmt(s.caseOnAdverb)} / ${fmt(s.tag2)} |
| entries left out because the headword is in pre-1918 spelling | ${fmt(s.preReformHeadwords)} |
| form pages whose own table was not used because their senses carry different labels | ${fmt(s.pageTableMixedSenses)} |
| adverb entries holding an inflection table (весь, такой): entries / rows moved to the declinable entries of the same etymology / rows dropped | ${fmt(stats.advTableEntries)} / ${fmt(stats.advTableMoved)} / ${fmt(s.advTableDropped)} |
| table forms written with a preposition ("в году́") filed under the word itself: rows / prepositions seen | ${fmt(stats.prepRecovered)} / ${Object.entries(prepSeen).sort().map(([p, n]) => `${p} ${n}`).join(', ')} |
| rows left out because the template marked the cell as an error (error-…) / error labels removed from head-line comparatives | ${fmt(s.errorTagRows)} / ${fmt(s.errorTagStripped)} |
| entries all of whose senses are alternative spellings (alt-of): not lemma entries, read as forms of their targets with the label alternative / rows they gave | ${fmt(stats.altEntries)} / ${fmt(stats.rowsAlt)} |
| noun and proper-noun lemma entries / with no Gender before and after reading the head line / with no Animacy before and after | ${fmt(stats.nounLemmas)} / ${fmt(stats.noGenderBefore)} → ${fmt(stats.noGenderAfter)} / ${fmt(stats.noAnimBefore)} → ${fmt(stats.noAnimAfter)} |
| Gender taken from another canonical row / from the head line; Animacy likewise | ${fmt(stats.genderFromOtherCanonical)} / ${fmt(stats.genderFromHead)}; ${fmt(stats.animFromOtherCanonical)} / ${fmt(stats.animFromHead)} |
| noun entries whose head line says pl (plural only; not recorded in lex) | ${fmt(stats.pluralHead)} |
| page rows not added because the lemma already has a row under the key | ${fmt(s.pageBlockedByTable)} |
| head-line forms of other kinds not used (genitive, plural, diminutive, … : all in the table already or not inflection) | ${fmt(s.headlineNotUsed)} |
| form-of targets with no lemma entry (even through one more page) | ${fmt(s.unresolvedTargets)} (${fmt(unresolved.size)} distinct) |
| form-of senses with no target word | ${fmt(s.targetNoWord)} |
| verbs whose aspect came from the table-tags row (no aspect on the canonical row) | ${fmt(stats.aspectFromTableTags)} |
| shards | ${shardOuts.length} (prefixes of up to ${MAX_PREFIX} letters; limit ${fmt(LIMIT)} bytes of JSON) |
| shard bytes | ${(gzTotal / 1e6).toFixed(2)} MB gzip, ${(plainTotal / 1e6).toFixed(1)} MB plain |
| largest shard | \`${largest.prefix}\` ${(largest.plain / 1e6).toFixed(2)} MB plain, ${(largest.gz / 1e6).toFixed(2)} MB gzip (largest gzip: \`${largestGz.prefix}\` ${(largestGz.gz / 1e6).toFixed(2)} MB) |
| core seed (${CORE_SEED}): lines / lemma ids added / lines not in the index / count of the last open-class lemma admitted | ${seedLines.length} / ${seedIds.length} / ${seedNotFound.length ? seedNotFound.join(', ') : 'none'} / ${lastCount} |
| core (no participle-table rows, no register-labelled rows where the lemma has plain ones) | ${core.lemmaIds.length} lemmas (${Math.min(closed.length, lo)} of closed classes), ${core.stats.keys} keys, ${coreRows} rows, ${fmt(coreBytes)} bytes of JSON (budget ${fmt(CORE_BUDGET)}) |
| core token coverage on GSD train | ${(tokenCoverage * 100).toFixed(2)} % of ${fmt(gsdTokenTotal)} word tokens by key; ${(tokenCoverageYo * 100).toFixed(2)} % reading е as ё |

## Core budget projections (not stored)

${projections.map((p) => `- ${p}`).join('\n')}

## Lemmas that became SCONJ (GSD train tags them SCONJ at least 3 times and more often than CCONJ)

${sconjList.sort((a, b) => b.sconj - a.sconj || (a.word < b.word ? -1 : 1)).map((x) => `${x.word} (SCONJ ${x.sconj}, CCONJ ${x.cconj})`).join(', ')}

## Gender and animacy of nouns

Gender and Animacy come from the canonical row(s) of the entry, else from the head line (\`• (translit) m anim or f anim\`), never from the ending. Lemmas still without Gender / Animacy by cause:

${[...genderCauses].map(([c, n]) => `- ${c}: Gender ${n.g}, Animacy ${n.a}`).join('\n')}

Plural-only nouns carry \`pl\` in the head line (examples: ${pluralHeadExamples.join(' | ')}); this is not recorded in lex.

Commonest without Gender (by count): ${diagTop(true)}

Commonest without Animacy (by count): ${diagTop(false)}

## Commonest feature bundles of GSD train (nominal NOUN)

${Object.entries(nominalPriors.NOUN).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${fmt(n)}`).join(', ')}

## Gender collapse: codes touched (top 10)

${[...collapsedCodes].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, n]) => `- \`${c}\` ${fmt(n)}`).join('\n')}

## Form priors

${fmt(formPriorKeys)} keys and ${fmt(formPriorRowCount)} rows (lemma, part of speech, count) in \`generated/form-priors.ts\`: the forms that occur at least 3 times in GSD train and that the index reads as two or more different (headword, part of speech) pairs, with the treebank's own lemmas and counts.

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
    schema: 1 as const, id: 'kaikki-ru-tables', built: TODAY, source: SOURCE,
    shards: Object.fromEntries(shardOuts.map((o) => [o.prefix, { file: o.file, bytes: o.gz, keys: o.keys }])),
    stats: { shards: shardOuts.length, keys: keys.length, rows: rowTotal, lemmas: lemmasWithRows, plainBytes: plainTotal, bytes: gzTotal, largestPlainBytes: largest.plain },
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));

  const header = `/* GENERATED by scripts/ru-build-index.mts on ${TODAY} — do not edit. The compact core of the Russian form index: every lemma of the closed classes (pronouns, determiners, prepositions, conjunctions, particles, numerals) seen in the priors corpus and then the commonest open-class lemmas, each with every form of its table, ${core.lemmaIds.length} lemmas, ${core.stats.keys} forms, ${coreRows} readings, ${fmt(coreBytes)} bytes of JSON, covering ${(tokenCoverage * 100).toFixed(1)} % of the word tokens of UD Russian-GSD train (${(tokenCoverageYo * 100).toFixed(1)} % reading е for ё). Full index: public/lexicon/ru/standard/ (npm run ru:build-index).
 * Sources: Wiktionary via kaikki.org (${SOURCE.licence}; extract last modified ${SOURCE.lastModified}); lemma frequencies from UD Russian-GSD train (CC BY-SA 4.0). */
import type { RussianFormIndex } from '../index-store';

export const RU_CORE: RussianFormIndex = `;
  fs.mkdirSync(path.dirname(CORE_OUT), { recursive: true });
  // the combining acute is written as an escape so that the stress marks are visible in the file
  fs.writeFileSync(CORE_OUT, `${header}${coreJson.replace(/\u0301/g, '\\u0301')};\n`);
  fs.mkdirSync(path.dirname(DOC_OUT), { recursive: true });
  fs.writeFileSync(DOC_OUT, doc);
  const sortObj = <T,>(o: Record<string, T>): Record<string, T> => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  const priorsOut = {
    source: 'UD Russian-GSD, train split (ru_gsd-ud-train.conllu)', licence: 'CC BY-SA 4.0', built: TODAY, tokens: gsdWordLines,
    nominal: sortObj(Object.fromEntries(Object.entries(nominalPriors).map(([u, m]) => [u, sortObj(m)]))),
    verbal: sortObj(verbalPriors),
  };
  fs.mkdirSync(path.dirname(PRIORS_OUT), { recursive: true });
  fs.writeFileSync(PRIORS_OUT, `/* GENERATED by scripts/ru-build-index.mts on ${TODAY} — do not edit. How often each bundle of features occurs per part of speech in UD Russian-GSD (train split, ${fmt(gsdWordLines)} word tokens; CC BY-SA 4.0), so that the analyser can order the readings of an ambiguous form the way running text has them.
 * nominal[UPOS]["<Case>|<Number>"] (Case: Nom Gen Dat Acc Ins Prep Par Voc, UD Loc read as Prep; "-" when the token has none; short adjectives under "Short|<Number>", comparatives under "Cmp|-");
 * verbal["<VerbForm>|<Mood>|<Tense>|<Number>|<Person>"] for VERB and AUX together ("-" for a slot the token does not have; Mood only for finite forms). */
export const RU_PRIORS: { source: string; licence: string; built: string; tokens: number; nominal: Record<string, Record<string, number>>; verbal: Record<string, number> } = ${JSON.stringify(priorsOut)};
`);
}
{
  const fp = `/* GENERATED by scripts/ru-build-index.mts on ${TODAY} — do not edit. Form priors: for a form that the index reads more than one way (readings of at least two different headword and part-of-speech pairs) and that occurs at least 3 times in UD Russian-GSD (train split; CC BY-SA 4.0), the readings the treebank gives it: [gold lemma (key), UPOS (AUX as VERB, CCONJ as CONJ), count], commonest first. The analyser uses them to order ambiguous readings the way running text has them; lemma conventions are the treebank's own (его, ее …), matched leniently. ${fmt(formPriorKeys)} keys, ${fmt(formPriorRowCount)} rows. */
export const RU_FORM_PRIORS: { source: string; licence: string; built: string; forms: Record<string, Array<[lemma: string, upos: string, count: number]>> } = ${JSON.stringify({ source: 'UD Russian-GSD, train split (ru_gsd-ud-train.conllu)', licence: 'CC BY-SA 4.0', built: TODAY, forms: formPriorRows })};
`;
  if (WRITE) fs.writeFileSync(FORM_PRIORS_OUT, fp);
  console.log(`form priors: ${formPriorKeys} keys, ${formPriorRowCount} rows, ${fmt(Buffer.byteLength(fp))} bytes`);
  for (const w of ['это', 'его', 'все', 'всё', 'просто', 'больше', 'начал', 'надо', 'том', 'им', 'стали', 'года', 'что', 'как', 'и']) console.log(`  ${w}: ${JSON.stringify(formPriorRows[ruKey(w)] ?? null)}`);
}
console.log(`prepositions removed from table forms: ${stats.prepRecovered} rows (${JSON.stringify(prepSeen)})`);
console.log(`A1: alt-of entries ${stats.altEntries} (rows ${stats.rowsAlt}); gender collapse ${stats.skip.genderCollapsed}, top codes: ${[...collapsedCodes].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, n]) => `${c} ${n}`).join('; ')}`);
console.log(`nouns: ${stats.nounLemmas} lemma entries; no Gender ${stats.noGenderBefore} → ${stats.noGenderAfter}, no Animacy ${stats.noAnimBefore} → ${stats.noAnimAfter}; from other canonical rows ${stats.genderFromOtherCanonical}/${stats.animFromOtherCanonical}, from head line ${stats.genderFromHead}/${stats.animFromHead}; head says pl ${stats.pluralHead} (${pluralHeadExamples.join(' | ')})`);
for (const [c, n] of genderCauses) console.log(`  cause: ${c}: Gender ${n.g}, Animacy ${n.a}`);
console.log(`  no Gender, commonest: ${diagTop(true)}`);
console.log(`  no Animacy, commonest: ${diagTop(false)}`);
console.log(`sconj: ${sconjList.map((x) => `${x.word} ${x.sconj}/${x.cconj}`).join(', ')}`);
console.log(`priors NOUN top5: ${Object.entries(nominalPriors.NOUN).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(', ')}`);
console.log(`unresolved form-of targets: ${fmt(s.unresolvedTargets)} (${fmt(unresolved.size)} distinct); top 20: ${topUnresolved.slice(0, 20).map(([w, n]) => `${w} ${n}`).join(', ')}`);
console.log(`skipped: ${JSON.stringify(s)}; kinds: ${skippedLine}`);
console.log(`rows: table ${fmt(stats.rowsTable)}, participle-page table ${fmt(stats.rowsPageTable)}, head-line ${fmt(stats.rowsComparative)}, citation ${fmt(stats.rowsCitation)}, page ${fmt(stats.rowsPage)}, two-hop ${fmt(stats.rowsTwoHop)}`);
console.log(`by POS: ${posLine}`);
console.log(`wall time ${((Date.now() - started) / 1000).toFixed(1)} s${WRITE ? '' : ' (nothing written)'}`);
