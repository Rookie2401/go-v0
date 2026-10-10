/**
 * Linguistic coverage probe (GoLearn Linguistic Engine V2, Stage 1 baseline; 2026-10-10).
 *
 * For each language it takes natural sentences from data/corpus/<lang> (the owner's own course drafts and verified Scripture
 * slices; used here for MEASUREMENT only), selects up to N word tokens in context, runs the REAL parser the extension uses
 * (parseSelection with the real analysers) and the REAL dictionary lookup (createPackRuntime over the built shards in
 * public/dict), and counts, per field, whether the lookup produced anything. It measures AVAILABILITY of each field, not
 * correctness (that needs checked gold sets; see docs/ecosystem/linguistics/COVERAGE-AUDIT.md).
 *
 *   npx vite-node scripts/probe-linguistic-coverage.mts [--n 200] [--langs sq,es,de,hi,th] [--out <json path>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseSelection, getAnalyser } from '../packages/golearn-extension/src/parser';
import { createPackRuntime, PACKS } from '../packages/language-packs/src';
import type { PackRuntime } from '../packages/language-packs/src';
import { registerAllAnalysers } from '../test/support/analysers';

registerAllAnalysers();

const argv = process.argv.slice(2);
const arg = (name: string, dflt: string): string => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const N = Number(arg('n', '200'));
const LANGS = arg('langs', 'sq,es,de,hi,th').split(',');
const OUT = arg('out', '');

/** A fetch that reads the built shards from public/dict on disk (what the hosted copy serves). */
const fileFetch: typeof fetch = (async (input: RequestInfo | URL) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const rel = u.replace(/^[a-z]+:\/\/[^/]+\//i, '').replace(/^\/+/, '');
  const p = path.resolve('public', rel);
  if (!fs.existsSync(p)) return new Response('not found', { status: 404 });
  return new Response(fs.readFileSync(p), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

interface Selection { sentence: string; start: number; end: number; surface: string }

function sentencesOf(lang: string): string[] {
  const dir = path.resolve('data/corpus', lang);
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { sections?: Array<{ paragraphs?: Array<{ sentences?: Array<{ text?: string }> }> }> };
      for (const s of j.sections ?? []) for (const p of s.paragraphs ?? []) for (const x of p.sentences ?? []) if (x.text && x.text.trim()) out.push(x.text.trim());
    } catch { /* a file of another shape */ }
  }
  return out;
}

/** Up to N word selections, spread over the sentences (every k-th word so one text does not dominate). */
function selections(lang: string, n: number): Selection[] {
  const a = getAnalyser(lang);
  if (!a) return [];
  const sents = sentencesOf(lang);
  const all: Selection[] = [];
  for (const sentence of sents) {
    let toks: ReturnType<typeof a.tokenize> = [];
    try { toks = a.tokenize(sentence.normalize('NFC')); } catch { continue; }
    for (const t of toks) if (t.isWord && /\p{L}/u.test(t.surface)) all.push({ sentence: sentence.normalize('NFC'), start: t.start, end: t.end, surface: t.surface });
  }
  if (all.length <= n) return all;
  const step = all.length / n;
  const out: Selection[] = [];
  for (let i = 0; i < n; i++) out.push(all[Math.floor(i * step)]);
  return out;
}

interface Tally { n: number; sentences: number; lemma: number; lemmaLexicon: number; lemmaRule: number; unconfirmed: number; unknown: number; pos: number; features: number; morphologyLine: number; wordListGloss: number; dictSenses: number; anyDefinition: number; constructions: number; role: number; syntaxNotes: number; pronunciationNotes: number; alternatives: number; paradigm: number; etymology: number; ipa: number; msParse: number; msDict: number; fullRecord: number; fullViaFormOf: number; fullForms: number; fullEtymology: number; fullIpa: number; fullAudio: number; fullRelated: number; msEntry: number }

async function probe(lang: string): Promise<Tally> {
  const sel = selections(lang, N);
  const t: Tally = { n: sel.length, sentences: new Set(sel.map((s) => s.sentence)).size, lemma: 0, lemmaLexicon: 0, lemmaRule: 0, unconfirmed: 0, unknown: 0, pos: 0, features: 0, morphologyLine: 0, wordListGloss: 0, dictSenses: 0, anyDefinition: 0, constructions: 0, role: 0, syntaxNotes: 0, pronunciationNotes: 0, alternatives: 0, paradigm: 0, etymology: 0, ipa: 0, msParse: 0, msDict: 0, fullRecord: 0, fullViaFormOf: 0, fullForms: 0, fullEtymology: 0, fullIpa: 0, fullAudio: 0, fullRelated: 0, msEntry: 0 };
  const manifest = PACKS[lang];
  const runtime: PackRuntime | undefined = manifest ? createPackRuntime(manifest, { fetch: fileFetch, baseUrl: '/' }) : undefined;
  const adapter = getAnalyser(lang);
  for (const s of sel) {
    const t0 = performance.now();
    let card: ReturnType<typeof parseSelection>;
    try { card = parseSelection({ surface: s.surface, context: { kind: 'sentence', confidence: 1, sentence: s.sentence, selStart: s.start, selEnd: s.end }, languageId: lang }); } catch { t.unknown++; continue; }
    t.msParse += performance.now() - t0;
    if (card.lemma) t.lemma++;
    if (card.provenance === 'lexicon') t.lemmaLexicon++; else if (card.provenance === 'rule') t.lemmaRule++; else t.unknown++;
    if (card.unconfirmed) t.unconfirmed++;
    if (card.pos) t.pos++;
    if (card.features.length) t.features++;
    if (card.morphology) t.morphologyLine++;
    if (card.gloss) t.wordListGloss++;
    if (card.constructions.length) t.constructions++;
    if (card.role) t.role++;
    if (card.syntaxNotes.length) t.syntaxNotes++;
    if (card.pronunciation.length) t.pronunciationNotes++;
    if (card.alternatives.length) t.alternatives++;
    let dict = false;
    if (runtime && card.lemma && adapter) {
      const forms = [...new Set([adapter.normalize(card.lemma), ...(adapter.lemmaVariants?.(card.lemma, card.pos as never) ?? []).map((v) => adapter.normalize(v))])].slice(0, 8);
      const t1 = performance.now();
      const g = await runtime.gloss(card.lemma, card.pos, forms);
      t.msDict += performance.now() - t1;
      if (g && g.senses.length) { dict = true; t.dictSenses++; }
      // Level 2: the full lexical record (forms table, etymology, IPA, audio, related words), the same forms and part of speech
      const t2 = performance.now();
      const e = await runtime.entry(card.lemma, card.pos, forms);
      t.msEntry += performance.now() - t2;
      if (e && e.records.length) {
        t.fullRecord++;
        if (e.via) t.fullViaFormOf++;
        const rs = e.records;
        if (rs.some((r) => (r.f?.length ?? 0) >= 2)) t.fullForms++;
        if (rs.some((r) => r.ety)) t.fullEtymology++;
        if (rs.some((r) => r.ipa?.length)) t.fullIpa++;
        if (rs.some((r) => r.audio?.length)) t.fullAudio++;
        if (rs.some((r) => r.rel?.d?.length || r.rel?.r?.length)) t.fullRelated++;
      }
    }
    if (dict || card.gloss) t.anyDefinition++;
    // the three fields no part of the stack produces today (so the baseline says 0, not "unknown"):
    // a paradigm for the lemma, a sourced etymology, an IPA pronunciation
  }
  return t;
}

function pct(k: number, n: number): string { return n ? `${Math.round((1000 * k) / n) / 10}%` : '-'; }

async function main(): Promise<void> {
  const results: Record<string, Tally> = {};
  for (const lang of LANGS) results[lang] = await probe(lang);
  const rows: Array<[string, (t: Tally) => string]> = [
    ['selections (sentences)', (t) => `${t.n} (${t.sentences})`],
    ['definition available (dictionary or word list)', (t) => pct(t.anyDefinition, t.n)],
    ['  dictionary senses found', (t) => pct(t.dictSenses, t.n)],
    ['  word-list gloss', (t) => pct(t.wordListGloss, t.n)],
    ['lemma given', (t) => pct(t.lemma, t.n)],
    ['  from the word list', (t) => pct(t.lemmaLexicon, t.n)],
    ['  from a rule (guess)', (t) => pct(t.lemmaRule, t.n)],
    ['  unconfirmed reading', (t) => pct(t.unconfirmed, t.n)],
    ['  no reading at all', (t) => pct(t.unknown, t.n)],
    ['part of speech', (t) => pct(t.pos, t.n)],
    ['any morphological feature', (t) => pct(t.features, t.n)],
    ['morphology described in words', (t) => pct(t.morphologyLine, t.n)],
    ['construction / pattern noted', (t) => pct(t.constructions, t.n)],
    ['syntactic role given', (t) => pct(t.role, t.n)],
    ['syntax notes', (t) => pct(t.syntaxNotes, t.n)],
    ['alternative readings kept', (t) => pct(t.alternatives, t.n)],
    ['pronunciation note (adapter)', (t) => pct(t.pronunciationNotes, t.n)],
    ['full paradigm available', (t) => pct(t.paradigm, t.n)],
    ['sourced etymology', (t) => pct(t.etymology, t.n)],
    ['IPA pronunciation', (t) => pct(t.ipa, t.n)],
    ['parse ms / selection', (t) => (t.n ? (t.msParse / t.n).toFixed(2) : '-')],
    ['dictionary ms / selection', (t) => (t.n ? (t.msDict / t.n).toFixed(2) : '-')],
    ['full record found (Level 2)', (t) => pct(t.fullRecord, t.n)],
    ['  reached through a form-of relation', (t) => pct(t.fullViaFormOf, t.n)],
    ['  forms table present (2+ forms)', (t) => pct(t.fullForms, t.n)],
    ['  etymology present', (t) => pct(t.fullEtymology, t.n)],
    ['  IPA present', (t) => pct(t.fullIpa, t.n)],
    ['  audio present', (t) => pct(t.fullAudio, t.n)],
    ['  derived / related words present', (t) => pct(t.fullRelated, t.n)],
    ['entry ms / selection', (t) => (t.n ? (t.msEntry / t.n).toFixed(2) : '-')],
  ];
  const head = `| field | ${LANGS.join(' | ')} |\n|---|${LANGS.map(() => '---').join('|')}|`;
  const body = rows.map(([label, f]) => `| ${label} | ${LANGS.map((l) => f(results[l])).join(' | ')} |`).join('\n');
  console.log(head + '\n' + body);
  if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), n: N, results }, null, 2)); console.log(`written ${OUT}`); }
}

main().catch((e) => { console.error(e); process.exit(1); });
