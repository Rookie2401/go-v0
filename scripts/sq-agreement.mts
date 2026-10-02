/// <reference types="node" />
/**
 * npm run sq:agreement -- [--split dev|test|all] [--show N] [--write]
 *
 * Do ALL the sources agree about each reading of the Albanian word list? Every written form the list generates (and
 * every closed-class form) is looked up in:
 *   - the UniParser Albanian analyzer's stored output (run `npm run sq:check-analyzer` first; data/private/sq/),
 *   - English Wiktionary's Albanian entries (data/research/kaikki/kaikki.org-dictionary-Albanian.jsonl),
 *   - the two Standard Albanian treebanks, UD_Albanian-TSA and UD_Albanian-STAF (data/research/ud/) — the `dev` half of
 *     their sentences only: the other half is held out for `npm run sq:eval-ud` and is never read here.
 * The rule that turns what the sources say into an outcome is `src/bench/sq/agreement.ts`: unanimous / majority /
 * disputed / single-source / name-unlisted. No source is ground truth, and this script decides nothing about the
 * language: it records where the sources differ, and the engine stays cautious there.
 *
 * `--write` (needs --split all) regenerates, mechanically and without anyone looking at the held-out half:
 *   data/review/sq/source-agreement.json   every reading that is not unanimous, with what each source said
 *   src/adapters/albanian/disputed.ts      the (form, lemma) pairs the engine keeps at low confidence (disputed,
 *                                          single-source) or reduced confidence (majority)
 * Lemmas are split in two by a hash; `--show` lists examples and is refused for `test`.
 * A source whose files are not on this machine is reported as absent and counts as silent. Exit 1 when the analyzer's
 * stored output is missing or older than the word list.
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SQ_FUNCTION_READINGS } from '../src/adapters/albanian/function-words';
import { sqGeneratedForms } from '../src/adapters/albanian/morphology';
import { sqNormalize } from '../src/adapters/albanian/orthography';
import type { SqReading } from '../src/adapters/albanian/types';
import { AGREEMENT_STATUSES, SOURCE_IDS, adjudicate, corpusVerdict, fromUniparser, verdictFrom, wiktVerdict, type AgreementStatus, type SourceId, type Statement, type Verdicts } from '../src/bench/sq/agreement';
import { SQ_CITATION_ALIASES } from '../src/bench/sq/aliases';
import { splitOf } from '../src/bench/sq/compare';
import { parseConllu } from '../src/bench/sq/conllu';
import { COMPARED, toUniparserAnalyses, uniparserVerdict, type UniparserAnalysis } from '../src/bench/sq/uniparser';
import { buildWiktIndex, type WiktIndex } from '../src/bench/sq/wiktionary';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const split = opt('split') ?? 'all';
const show = Number(opt('show') ?? 0);
if (!['dev', 'test', 'all'].includes(split)) { console.error('--split must be dev, test or all'); process.exit(1); }
if (show > 0 && split !== 'dev') { console.error('--show is allowed for --split dev only: the other half is not to be looked at while fixing rules'); process.exit(1); }

const hash = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const inSplit = (lemma: string): boolean => split === 'all' || (hash(lemma) % 2 === 0) === (split === 'dev');

// ── the readings under test ──
const ours = new Map<string, SqReading[]>();
for (const [form, list] of sqGeneratedForms()) ours.set(form, [...list]);
for (const [form, list] of SQ_FUNCTION_READINGS) ours.set(form, [...(ours.get(form) ?? []), ...list]);

// ── source 1: the analyzer's stored output ──
const UNIPARSER_OUT = 'data/private/sq/forms.uniparser.jsonl';
if (!fs.existsSync(UNIPARSER_OUT)) { console.error(`no analyzer output at ${UNIPARSER_OUT}: run npm run sq:check-analyzer first`); process.exit(1); }
const uniparser = new Map<string, UniparserAnalysis[]>();
for (const line of fs.readFileSync(UNIPARSER_OUT, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const row = JSON.parse(line) as { form: string; analyses: Array<{ lemma: string; gramm: string }> };
  uniparser.set(row.form, toUniparserAnalyses(row.analyses));
}
const stale = [...ours.keys()].filter((f) => !uniparser.has(f)).length;
if (stale > 0) { console.error(`${stale} generated form(s) are not in the stored analyzer result (the word list changed since it was made): run npm run sq:check-analyzer first`); process.exit(1); }

// ── source 2: Wiktionary ──
const KAIKKI = 'data/research/kaikki/kaikki.org-dictionary-Albanian.jsonl';
let wikt: WiktIndex | undefined;
let wiktInfo: Record<string, unknown> = { available: false };
if (fs.existsSync(KAIKKI)) {
  const text = fs.readFileSync(KAIKKI, 'utf8');
  wikt = buildWiktIndex(text.split('\n'));
  wiktInfo = { available: true, file: path.basename(KAIKKI), bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'), forms: wikt.forms.size, lemmasWithTable: wikt.tables.size, licence: 'CC BY-SA (Wiktionary), extract by kaikki.org' };
}

// ── sources 3 and 4: the Standard Albanian treebanks, dev half ──
function treebank(dir: string): { index: Map<string, Statement[]>; info: Record<string, unknown> } {
  const index = new Map<string, Statement[]>();
  if (!fs.existsSync(dir)) return { index, info: { available: false } };
  let sentences = 0, used = 0;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.conllu')).sort()) {
    for (const s of parseConllu(fs.readFileSync(path.join(dir, name), 'utf8'))) {
      sentences++;
      if (splitOf(s.id) !== 'dev') continue;
      used++;
      for (const w of s.words) {
        if (!w.lemma || !w.upos || w.upos === 'PUNCT') continue;
        const morph: Record<string, string> = {};
        for (const [k, v] of Object.entries(w.feats)) morph[k] = k === 'Voice' && v === 'Pass' ? 'Mid' : v;
        const form = sqNormalize(w.form);
        const list = index.get(form) ?? [];
        list.push({ lemma: sqNormalize(w.lemma), pos: w.upos === 'CCONJ' ? 'CONJ' : w.upos, morph });
        index.set(form, list);
      }
    }
  }
  let commit: string | undefined;
  try { commit = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a checkout */ }
  return { index, info: { available: true, sentences, sentencesRead: used, forms: index.size, commit, licence: 'CC BY-SA 4.0', note: 'dev half only (even hash of sent_id); research material, never bundled' } };
}
const tsa = treebank('data/research/ud/UD_Albanian-TSA');
const staf = treebank('data/research/ud/UD_Albanian-STAF');

// ── source 5: usage — how often a written form occurs in the analyzer authors' corpus ──
const WORDLIST = 'data/research/uniparser-grammar-albanian/wordlists/wordlist.csv';
let freq: Map<string, number> | undefined;
let freqInfo: Record<string, unknown> = { available: false };
if (fs.existsSync(WORDLIST)) {
  freq = new Map();
  for (const line of fs.readFileSync(WORDLIST, 'utf8').replace(/^\uFEFF/, '').split('\n')) {
    const tab = line.lastIndexOf('\t');
    if (tab <= 0) continue;
    const form = sqNormalize(line.slice(0, tab));
    const n = Number(line.slice(tab + 1));
    if (Number.isFinite(n)) freq.set(form, (freq.get(form) ?? 0) + n);
  }
  let commit: string | undefined;
  try { commit = execSync('git rev-parse HEAD', { cwd: path.dirname(path.dirname(WORDLIST)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a checkout */ }
  freqInfo = { available: true, name: 'uniparser-grammar-albanian word list (form frequencies in the authors\' corpus)', forms: freq.size, commit, licence: 'MIT', note: 'usage counts only; in the review file each row carries the count of its form' };
}

// ── compare ──
interface Finding { form: string; lemma: string; pos: string; status: AgreementStatus; ours: string; said: Verdicts; support: SourceId[]; dissent: SourceId[]; evidence: Partial<Record<SourceId, string[]>> }
const findings: Finding[] = [];
const counts: Record<string, Record<AgreementStatus, number>> = {};
const totals: Record<AgreementStatus, number> = { unanimous: 0, majority: 0, disputed: 0, 'single-source': 0, 'name-unlisted': 0 };
const bySource: Record<SourceId, Record<string, number>> = { uniparser: {}, wiktionary: {}, 'ud-tsa': {}, 'ud-staf': {}, corpus: {} };
const feat = (m: Record<string, string>) => COMPARED.filter((f) => m[f]).map((f) => `${f}=${m[f]}`).join(' ');
const say = (s: Statement) => `${s.lemma}${s.pos ? `/${s.pos}` : ''}${feat(s.morph) ? ` ${feat(s.morph)}` : ''}`;

for (const [form, list] of [...ours.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const up = uniparser.get(form) ?? [];
  const wk = wikt?.forms.get(form) ?? [];
  const t1 = tsa.index.get(form) ?? [];
  const t2 = staf.index.get(form) ?? [];
  for (const r of list) {
    const lemma = sqNormalize(r.lemma);
    if (!inSplit(lemma)) continue;
    const upFinding = uniparserVerdict(form, r, up);
    const wkFinding = wikt ? wiktVerdict(lemma, form, r, wikt) : { verdict: 'silent' as const, filledBy: [] };
    const said: Verdicts = {
      uniparser: fromUniparser(upFinding.verdict),
      wiktionary: wkFinding.verdict,
      'ud-tsa': verdictFrom(lemma, r, t1),
      'ud-staf': verdictFrom(lemma, r, t2),
      // usage speaks only between the list's form and the form(s) a Wiktionary table has in the same cell
      corpus: wkFinding.verdict === 'differ' && freq
        ? corpusVerdict(freq.get(form) ?? 0, Math.max(...wkFinding.filledBy.map((f) => freq!.get(f) ?? 0)), Math.max(0, ...wkFinding.filledBy.filter((f) => !ours.has(f)).map((f) => freq!.get(f) ?? 0)))
        : 'silent',
    };
    for (const s of SOURCE_IDS) bySource[s][said[s]] = (bySource[s][said[s]] ?? 0) + 1;
    const { status, support, dissent } = adjudicate(r.pos, said);
    totals[status]++;
    (counts[r.pos] ??= { unanimous: 0, majority: 0, disputed: 0, 'single-source': 0, 'name-unlisted': 0 })[status]++;
    if (status !== 'unanimous') {
      const evidence: Finding['evidence'] = {};
      if (said.uniparser !== 'silent' && said.uniparser !== 'agree') evidence.uniparser = (upFinding.evidence.length ? upFinding.evidence : up).slice(0, 5).map((t) => `${t.lemma} [${t.gramm}]`);
      if (said.wiktionary === 'differ') evidence.wiktionary = [`its table has here: ${wkFinding.filledBy.join(', ')}`];
      else if (said.wiktionary === 'other') evidence.wiktionary = [...new Set(wk.map(say))].slice(0, 5);
      if (said['ud-tsa'] === 'differ' || said['ud-tsa'] === 'other') evidence['ud-tsa'] = [...new Set(t1.map(say))].slice(0, 5);
      if (said['ud-staf'] === 'differ' || said['ud-staf'] === 'other') evidence['ud-staf'] = [...new Set(t2.map(say))].slice(0, 5);
      if (freq && wkFinding.verdict === 'differ') evidence.corpus = [`${form} ${freq.get(form) ?? 0}`, ...wkFinding.filledBy.map((f) => `${f} ${freq!.get(f) ?? 0}`)];
      else if (freq) evidence.corpus = [`${form} ${freq.get(form) ?? 0}`];
      findings.push({ form, lemma: r.lemma, pos: r.pos, status, ours: feat(r.morph) || '(no features)', said, support, dissent, evidence });
    }
  }
}

// ── report ──
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(2)} %` : 'n/a');
const total = Object.values(totals).reduce((a, b) => a + b, 0);
console.log(`sq:agreement - split ${split}: ${ours.size} written forms, ${total} readings; sources: analyzer yes, Wiktionary ${wikt ? 'yes' : 'ABSENT'}, UD-TSA ${tsa.info.available ? 'yes' : 'ABSENT'}, UD-STAF ${staf.info.available ? 'yes' : 'ABSENT'}, corpus frequencies ${freq ? 'yes' : 'ABSENT'}`);
console.log(`  unanimous ${totals.unanimous} (${pct(totals.unanimous, total)}); majority ${totals.majority}; disputed ${totals.disputed}; single-source ${totals['single-source']}; names no source lists ${totals['name-unlisted']}`);
for (const s of SOURCE_IDS) console.log(`  ${s.padEnd(10)} agree ${bySource[s].agree ?? 0}; differ ${bySource[s].differ ?? 0}; other word ${bySource[s].other ?? 0}; silent ${bySource[s].silent ?? 0}`);
for (const [pos, c] of Object.entries(counts).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0))) {
  const n = Object.values(c).reduce((x, y) => x + y, 0);
  console.log(`  ${pos.padEnd(6)} ${String(n).padStart(6)} readings: unanimous ${pct(c.unanimous, n)}; majority ${c.majority}; disputed ${c.disputed}; single-source ${c['single-source']}${c['name-unlisted'] ? `; names unlisted ${c['name-unlisted']}` : ''}`);
}

if (show > 0) {
  for (const st of AGREEMENT_STATUSES.filter((s) => s !== 'unanimous' && s !== 'name-unlisted')) {
    const list = findings.filter((f) => f.status === st).slice(0, show);
    if (list.length) console.log(`\n${st}`);
    for (const f of list) {
      console.log(`  ${f.form}: ours ${f.lemma}/${f.pos} ${f.ours}   [${SOURCE_IDS.map((s) => `${s} ${f.said[s]}`).join('; ')}]`);
      for (const [s, ev] of Object.entries(f.evidence)) console.log(`      ${s}: ${ev.join(' | ')}`);
    }
  }
}

if (args.includes('--write')) {
  if (split !== 'all') { console.error('--write needs --split all (the files cover every lemma, written mechanically without looking)'); process.exit(1); }
  fs.mkdirSync('data/review/sq', { recursive: true });
  const review = {
    schema: 1,
    note: 'Readings of the Albanian word list / rules (machine-drafted) on which the sources do not all agree, with what each source said. Nothing is decided about the language here: each row is a place for a person to look. The rule that names the outcome is src/bench/sq/agreement.ts. Generated by npm run sq:agreement -- --write; do not edit by hand.',
    sources: {
      uniparser: { name: 'uniparser-albanian', version: '2.3.0', licence: 'MIT', authors: 'Maria Morozova, Alexander Rusakov, Timofey Arkhangelskiy', mode: 'strict, no disambiguation' },
      wiktionary: wiktInfo,
      'ud-tsa': { name: 'UD_Albanian-TSA', ...tsa.info },
      'ud-staf': { name: 'UD_Albanian-STAF', ...staf.info },
      corpus: freqInfo,
    },
    citationAliases: SQ_CITATION_ALIASES,
    totals,
    counts,
    bySource,
    findings: findings.filter((f) => f.status !== 'name-unlisted'),
  };
  fs.writeFileSync('data/review/sq/source-agreement.json', `${JSON.stringify(review, null, 1)}\n`, 'utf8');
  const key = (f: Finding) => `${f.form}\t${sqNormalize(f.lemma)}`;
  // a (form, lemma) pair is as uncertain as its most uncertain reading
  const low = new Set(findings.filter((f) => f.status === 'disputed' || f.status === 'single-source').map(key));
  const mid = new Set(findings.filter((f) => f.status === 'majority').map(key).filter((k) => !low.has(k)));
  const lines = (s: Set<string>) => [...s].sort().map((p) => `  ${JSON.stringify(p)},`).join('\n');
  const body = `/**
 * Readings on which the sources do not all agree: written form + lemma. GENERATED by \`npm run sq:agreement -- --write\`
 * — do not edit by hand. The sources are the course's own word list, the UniParser Albanian analyzer, Wiktionary's
 * Albanian tables and the two Standard Albanian treebanks; the rule is src/bench/sq/agreement.ts and the full record,
 * with what each source said, is data/review/sq/source-agreement.json.
 *
 * SQ_DISPUTED (${low.size} pairs): a source says otherwise and fewer than two others agree, or no other source knows the
 * reading at all. The engine keeps these at low confidence (shown as "possibly …") until a person has looked.
 * SQ_MAJORITY (${mid.size} pairs): one source says otherwise and at least two others agree. Kept at reduced confidence.
 */
export const SQ_DISPUTED: ReadonlySet<string> = new Set([
${lines(low)}
]);

export const SQ_MAJORITY: ReadonlySet<string> = new Set([
${lines(mid)}
]);
`;
  fs.writeFileSync('src/adapters/albanian/disputed.ts', body, 'utf8');
  console.log(`\nwrote data/review/sq/source-agreement.json (${review.findings.length} rows) and src/adapters/albanian/disputed.ts (${low.size} disputed or single-source pairs, ${mid.size} majority pairs)`);
}
