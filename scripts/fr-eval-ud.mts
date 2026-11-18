/**
 * The French adapter against Universal Dependencies French GSD (CC BY-SA 4.0). EVALUATION ONLY: the treebank is read from
 * data/research/ud/UD_French-GSD and nothing of it is copied, shipped or written anywhere.
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/fr-eval-ud.mts -- --split dev|test [--limit N] [--show N] [--dry]
 *
 *   --split dev|test   which file (fr_gsd-ud-dev.conllu, fr_gsd-ud-test.conllu). Tune on dev only; test is reported as it comes.
 *   --limit N          the first N sentences
 *   --show N           (dev only; refused for test) the 30 most frequent lemma errors and part-of-speech confusions, and N example errors
 *   --dry              parse the treebank and print its statistics only (no adapter needed)
 *
 * The adapter is `frAdapter` from src/adapters/fr.ts; if that does not exist yet the script says so and exits 2.
 * Alignment is by character offsets: each UD token is located in `# text` in order; a multiword token (du = de + le) takes
 * the span of its surface and its words share it. The adapter's word tokens are matched by identical span.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeFr } from '../src/adapters/french/orth';
import type { AnalyzedToken, LanguageAdapter, RawToken } from '../src/core/adapters';

const ROOT = join(import.meta.dirname ?? '.', '..');
const argv = process.argv.slice(2).filter((a) => a !== '--');
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string): string | undefined => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

const split = opt('split') ?? 'dev';
if (split !== 'dev' && split !== 'test') { console.error('--split must be dev or test'); process.exit(1); }
const limit = opt('limit') ? Number(opt('limit')) : Infinity;
const show = opt('show') !== undefined ? Number(opt('show')) : undefined;
const dry = flag('dry');
if (show !== undefined && split === 'test') { console.error('--show is refused for the test split: the test split is for reporting, not for looking at errors.'); process.exit(1); }

// ---------------------------------------------------------------------------------------------------------------- parse

interface UdWord { id: number; form: string; lemma: string; upos: string; feats: Record<string, string>; misc: string; span?: [number, number]; inMwt?: boolean; mwtPart?: number }
interface UdMwt { from: number; to: number; form: string; span?: [number, number] }
interface UdSentence { id: string; text: string; words: UdWord[]; mwts: UdMwt[]; unaligned: number }

const featsOf = (s: string): Record<string, string> => {
  const o: Record<string, string> = {};
  if (s === '_') return o;
  for (const kv of s.split('|')) { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); }
  return o;
};

function parseConllu(path: string): UdSentence[] {
  const out: UdSentence[] = [];
  let cur: UdSentence | undefined;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('# sent_id')) { cur = { id: line.slice(line.indexOf('=') + 1).trim(), text: '', words: [], mwts: [], unaligned: 0 }; continue; }
    if (!cur) continue;
    if (line.startsWith('# text =')) { cur.text = line.slice(8).trim(); continue; }
    if (line.startsWith('#')) continue;
    if (!line.trim()) { alignSentence(cur); out.push(cur); cur = undefined; continue; }
    const c = line.split('\t');
    if (c.length < 10) continue;
    if (/^\d+-\d+$/.test(c[0]!)) { const [a, b] = c[0]!.split('-').map(Number); cur.mwts.push({ from: a!, to: b!, form: c[1]! }); continue; }
    if (!/^\d+$/.test(c[0]!)) continue; // empty nodes (1.1)
    cur.words.push({ id: Number(c[0]), form: c[1]!, lemma: c[2]!, upos: c[3]!, feats: featsOf(c[5]!), misc: c[9]! });
  }
  return out;
}

/** Locate every token (a multiword token once, for its words) in `# text`, in order. */
function alignSentence(s: UdSentence): void {
  let cursor = 0;
  const locate = (form: string, misc: string): [number, number] | undefined => {
    const wf = /wordform=([^|]+)/.exec(misc)?.[1];
    for (const cand of [form, wf].filter((x): x is string => !!x)) {
      const i = s.text.indexOf(cand, cursor);
      if (i >= 0) return [i, i + cand.length];
    }
    const lower = s.text.toLocaleLowerCase('fr');
    const j = lower.indexOf(form.toLocaleLowerCase('fr'), cursor);
    return j >= 0 ? [j, j + form.length] : undefined;
  };
  const mwtAt = new Map(s.mwts.map((m) => [m.from, m]));
  for (let wi = 0; wi < s.words.length; wi++) {
    const w = s.words[wi]!;
    const m = mwtAt.get(w.id);
    if (m) {
      const sp = locate(m.form, '_');
      m.span = sp;
      if (sp) cursor = sp[1]; else s.unaligned++;
      for (let k = m.from; k <= m.to; k++) {
        const ww = s.words.find((x) => x.id === k);
        if (ww) { ww.span = sp; ww.inMwt = true; ww.mwtPart = k - m.from; }
      }
      wi += m.to - m.from; // the words of the multiword token are done
      continue;
    }
    const sp = locate(w.form, w.misc);
    if (sp) { w.span = sp; cursor = sp[1]; } else s.unaligned++;
  }
}

const path = join(ROOT, `data/research/ud/UD_French-GSD/fr_gsd-ud-${split}.conllu`);
let sentences = parseConllu(path);
if (Number.isFinite(limit)) sentences = sentences.slice(0, limit);

// ---------------------------------------------------------------------------------------------------------------- dry

const pct = (a: number, b: number): string => (b ? `${((100 * a) / b).toFixed(2)}%` : 'n/a');

if (dry) {
  const upos = new Map<string, number>();
  let words = 0, mwt = 0, unaligned = 0, punct = 0;
  const mwtForms = new Map<string, number>();
  const featKeys = new Map<string, Map<string, number>>();
  for (const s of sentences) {
    words += s.words.length; mwt += s.mwts.length; unaligned += s.unaligned;
    for (const m of s.mwts) mwtForms.set(m.form.toLocaleLowerCase('fr'), (mwtForms.get(m.form.toLocaleLowerCase('fr')) ?? 0) + 1);
    for (const w of s.words) {
      upos.set(w.upos, (upos.get(w.upos) ?? 0) + 1);
      if (w.upos === 'PUNCT') punct++;
      for (const k of ['Mood', 'Tense', 'Person', 'Number', 'Gender', 'VerbForm'] as const) {
        const v = w.feats[k]; if (!v) continue;
        const m = featKeys.get(k) ?? new Map<string, number>(); m.set(v, (m.get(v) ?? 0) + 1); featKeys.set(k, m);
      }
    }
  }
  console.log(`UD French GSD ${split}: ${path}`);
  console.log(`  sentences ${sentences.length}, syntactic words ${words} (${punct} punctuation), multiword tokens ${mwt}, tokens not located in "# text": ${unaligned}`);
  console.log(`  UPOS: ${[...upos].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  console.log(`  multiword tokens by surface: ${[...mwtForms].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  for (const [k, m] of featKeys) console.log(`  ${k}: ${[...m].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${n}`).join(', ')}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------------------------- adapter

const mod = await import('../src/adapters/fr').catch(() => undefined);
const adapter = (mod as { frAdapter?: LanguageAdapter } | undefined)?.frAdapter;
if (!adapter) { console.error('src/adapters/fr.ts (export frAdapter) does not exist yet: nothing to evaluate. Use --dry for the treebank statistics.'); process.exit(2); }

const FEATURES = ['Mood', 'Tense', 'Person', 'Number', 'Gender', 'VerbForm'] as const;
const mapPos = (p: string | undefined): string => (p === 'CONJ' ? 'CCONJ' : p ?? '?');
const merged = (p: string): string => (p === 'AUX' ? 'VERB' : p);
const lc = (s: string | undefined): string => normalizeFr(s ?? '');

interface Tally { n: number; ok: number }
const tally = (): Tally => ({ n: 0, ok: 0 });
const add = (t: Tally, ok: boolean) => { t.n++; if (ok) t.ok++; };

const tok = { udWords: 0, matched: 0, sentencesWithException: 0, unalignedUd: 0 };
const cov = { aligned: 0, any: 0, confirmed: 0 };
const lemmaFirst = tally(), lemmaAmong = tally();
const lemmaFirstNoPron = tally(), lemmaAmongNoPron = tally();
const uposStrict = tally(), uposMerged = tally();
const feat: Record<string, Record<string, Tally>> = {};
const featAll: Record<string, Tally> = {};
const lemmaErrors = new Map<string, number>();
const posConf = new Map<string, number>();
const examples: string[] = [];
const contr = { total: 0, aligned: 0, lemmaFirst: 0, lemmaAmong: 0, partsAgree: 0, partsGiven: 0 };
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const FEATS_BY_UPOS = (k: string, u: string): Tally => ((feat[k] ??= {})[u] ??= tally());

for (const s of sentences) {
  let raw: RawToken[] = [];
  let an: AnalyzedToken[] = [];
  try { raw = adapter.tokenize(s.text); an = adapter.analyze(raw); } catch (e) { tok.sentencesWithException++; }
  const byStart = new Map<number, number>();
  raw.forEach((t, i) => { if (t.isWord) byStart.set(t.start, i); });
  const tokenAt = (sp: [number, number]): number | undefined => { const i = byStart.get(sp[0]); return i !== undefined && raw[i]!.end === sp[1] ? i : undefined; };

  for (const w of s.words) {
    if (w.upos === 'PUNCT') continue;
    tok.udWords++;
    if (!w.span) { tok.unalignedUd++; continue; }
    const idx = tokenAt(w.span);
    if (idx === undefined) continue;
    tok.matched++;
    const cands = an[idx]?.candidates ?? [];

    if (w.inMwt) {
      // contractions are counted once per word pair, on the first word of the multiword token
      if (w.mwtPart !== 0) continue;
      const m = s.mwts.find((x) => x.from === w.id)!;
      const udLemmas = s.words.filter((x) => x.id >= m.from && x.id <= m.to).map((x) => lc(x.lemma));
      const surf = lc(raw[idx]!.surface);
      contr.total++; contr.aligned++;
      const ok = (l?: string) => { const n = lc(l); return n === surf || udLemmas.includes(n); };
      if (cands[0] && ok(cands[0].lemma)) contr.lemmaFirst++;
      if (cands.some((c) => ok(c.lemma))) contr.lemmaAmong++;
      const parts = cands[0]?.parts;
      if (parts?.length) { contr.partsGiven++; if (JSON.stringify(parts.map((p) => lc(p.lemma ?? p.text))) === JSON.stringify(udLemmas)) contr.partsAgree++; }
      continue;
    }

    cov.aligned++;
    if (cands.length) cov.any++;
    if (cands.some((c) => !c.unconfirmed)) cov.confirmed++;
    const first = cands[0];
    const okLemmaFirst = !!first && lc(first.lemma) === lc(w.lemma);
    add(lemmaFirst, okLemmaFirst);
    add(lemmaAmong, cands.some((c) => lc(c.lemma) === lc(w.lemma)));
    if (w.upos !== 'PRON') { add(lemmaFirstNoPron, okLemmaFirst); add(lemmaAmongNoPron, cands.some((c) => lc(c.lemma) === lc(w.lemma))); }
    if (!okLemmaFirst) bump(lemmaErrors, `${w.form} → UD ${w.lemma} [${w.upos}] / adapter ${first?.lemma ?? '(no reading)'} [${first?.pos ?? '-'}]`);
    const gotPos = mapPos(first?.pos);
    add(uposStrict, gotPos === w.upos);
    add(uposMerged, merged(gotPos) === merged(w.upos));
    if (gotPos !== w.upos) {
      bump(posConf, `UD ${w.upos} → adapter ${gotPos}`);
      if (show !== undefined && examples.length < show) examples.push(`${s.id}: ${w.form} (UD ${w.lemma}/${w.upos}) → ${cands.slice(0, 3).map((c) => `${c.lemma}/${c.pos}`).join(' ; ') || '(none)'}   « ${s.text.slice(0, 90)} »`);
    }
    for (const k of FEATURES) {
      const ud = w.feats[k];
      const mine = first?.morph?.[k];
      if (!ud || !mine) continue;
      const ok = mine.split(',').includes(ud);
      add(FEATS_BY_UPOS(k, w.upos), ok);
      add((featAll[k] ??= tally()), ok);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- report

const r = (t: Tally): string => `${pct(t.ok, t.n)} (${t.ok}/${t.n})`;
console.log(`French adapter against UD French GSD ${split}${Number.isFinite(limit) ? ` (first ${limit} sentences)` : ''}: ${sentences.length} sentences${tok.sentencesWithException ? `, ${tok.sentencesWithException} raised an exception in tokenize/analyze` : ''}`);
console.log(`\nTOKENISATION (UD words other than punctuation, multiword-token words included)`);
console.log(`  UD words ${tok.udWords}; span identical to an adapter word token: ${pct(tok.matched, tok.udWords)} (${tok.matched}); not located in the text: ${tok.unalignedUd}`);
console.log(`\nCOVERAGE (aligned words that are not parts of a contraction: ${cov.aligned})`);
console.log(`  at least one reading: ${pct(cov.any, cov.aligned)}; at least one reading that is not unconfirmed: ${pct(cov.confirmed, cov.aligned)}`);
console.log(`\nLEMMA (case-insensitive; UD lemmas are lower case, proper nouns as written)`);
console.log(`  first reading: ${r(lemmaFirst)}; among the readings: ${r(lemmaAmong)}`);
console.log(`  without UD PRON words (GSD lemmatises il, elle, ils, elles as lui and je as moi, against the dictionary's il, elle, je): first ${r(lemmaFirstNoPron)}; among ${r(lemmaAmongNoPron)}`);
console.log(`\nUPOS of the first reading (CONJ counted as CCONJ)`);
console.log(`  strict: ${r(uposStrict)}; AUX and VERB merged: ${r(uposMerged)}`);
console.log(`\nFEATURES of the first reading where both sides state the feature (an adapter union agrees when it holds the UD value)`);
for (const k of FEATURES) {
  const byU = feat[k] ?? {};
  const rows = Object.entries(byU).sort((a, b) => b[1].n - a[1].n).map(([u, t]) => `${u} ${r(t)}`).join(', ');
  console.log(`  ${k.padEnd(8)} ${featAll[k] ? r(featAll[k]!) : 'n/a'}${rows ? `   by UPOS: ${rows}` : ''}`);
}
console.log(`\nCONTRACTIONS (multiword tokens, e.g. du = de + le; lemma compared with either UD lemma or the surface)`);
console.log(`  contractions whose span the adapter matched: ${contr.total}; lemma of first reading ok: ${pct(contr.lemmaFirst, contr.total)}; among readings: ${pct(contr.lemmaAmong, contr.total)}; adapter gives parts: ${contr.partsGiven}, parts agree with the two UD lemmas: ${pct(contr.partsAgree, contr.partsGiven)}`);

if (show !== undefined) {
  const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `  ${String(c).padStart(4)}  ${k}`).join('\n');
  console.log(`\nTOP 30 LEMMA ERRORS (first reading)\n${top(lemmaErrors, 30)}`);
  console.log(`\nTOP 30 PART-OF-SPEECH CONFUSIONS (first reading)\n${top(posConf, 30)}`);
  if (examples.length) console.log(`\n${examples.length} EXAMPLE PART-OF-SPEECH ERRORS\n${examples.map((e) => `  ${e}`).join('\n')}`);
}
