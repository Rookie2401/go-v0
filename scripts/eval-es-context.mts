/// <reference types="node" />
/**
 * npm run es:eval-context -- --split dev|test [--in <kaikki file>] [--dict public/dict] [--sample N] [--show N]
 *
 * Does the Spanish pipeline choose the right reading of a word IN A SENTENCE? The sentences are the usage examples
 * and quotations of Wiktionary (via kaikki.org): each stands under one headword and part of speech and marks, in bold,
 * the word it illustrates. That gives a judged reading that this project did not write: the bold word is a form of
 * that headword, with that part of speech.
 *
 * What is compared, for the bold word of each example:
 *   no context   every word analysed on its own, dictionary merged, no neighbour rules
 *   pipeline     what the importer stores: adapter with neighbour rules, dictionary merged, `refine`
 *   adapter only the adapter with its neighbour rules and no dictionary (what a device without the dictionary has)
 * and, for the pipeline, what kind of reading every word of every example sentence ends up with (coverage).
 *
 * Limits, stated: examples are chosen to illustrate their headword, so the mix of readings is not that of running
 * prose; the dictionary that judges is also the dictionary that the pipeline uses (the judgement is the example's
 * heading, which the pipeline never sees, but a word missing from the dictionary cannot appear here at all); a bold
 * word that is not a form of the headword (rare) counts against the pipeline.
 *
 * Held-out discipline: examples are split in two by a hash of their text; `dev` may be looked at and tuned on, `test`
 * is reported as it comes, and `--show` is refused for it. Needs the built dictionary (`npm run dict:build`).
 * Reads the .jsonl or .jsonl.gz; downloads nothing; writes nothing.
 */
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { createAdapterRegistry } from '../src/adapters';
import type { AdapterRegistry, AnalysisCandidate, LanguageAdapter, PartOfSpeech } from '../src/core';
import { createFileLexiconSource } from '../src/dict/file';
import { loadBundledCorpus } from '../src/ingest';
import { planWithDictionary } from '../src/ingest/import';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const split = opt('split');
if (split !== 'dev' && split !== 'test') { console.error('usage: npm run es:eval-context -- --split dev|test [--in <file>] [--dict public/dict] [--sample N] [--show N]'); process.exit(1); }
const show = Number(opt('show') ?? 0);
if (show > 0 && split === 'test') { console.error('--show is refused for the held-out split: its failures are not to be looked at'); process.exit(1); }
const sample = Math.max(1, Number(opt('sample') ?? 1));
const dictDir = opt('dict') ?? 'public/dict';
const inputs = [opt('in'), 'data/dictionaries/kaikki.org-dictionary-Spanish.jsonl', 'data/dictionaries/kaikki.org-dictionary-Spanish.jsonl.gz'].filter((f): f is string => !!f);
const file = inputs.find((f) => existsSync(f));
if (!file) { console.error(`cannot read the dictionary file (tried ${inputs.join(', ')})`); process.exit(1); }

const real = createAdapterRegistry();
const es = real.get('es');
const norm = (s: string) => es.normalize(s);
const POS: Record<string, PartOfSpeech[]> = {
  verb: ['VERB', 'AUX'], noun: ['NOUN'], adj: ['ADJ'], adv: ['ADV'], name: ['PROPN'], prep: ['ADP'], conj: ['CONJ', 'SCONJ'],
  pron: ['PRON'], det: ['DET'], article: ['DET'], num: ['NUM'], intj: ['INTJ'],
};
const hash = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

interface Example { text: string; start: number; end: number; lemmas: string[]; pos: PartOfSpeech[]; heading: string }
const examples: Example[] = [];
const seen = new Set<string>();
let lines = 0, all = 0, usable = 0;

let truncated = '';
const input = file.endsWith('.gz') ? createReadStream(file).pipe(createGunzip()) : createReadStream(file, 'utf8');
try {
for await (const line of createInterface({ input })) {
  if (!line.trim()) continue;
  lines++;
  let e: { word?: unknown; pos?: unknown; lang_code?: unknown; senses?: unknown };
  try { e = JSON.parse(line); } catch { continue; }
  if (e.lang_code !== 'es' || typeof e.word !== 'string' || /\s/.test(e.word)) continue;
  const pos = POS[String(e.pos)];
  if (!pos) continue;
  const word = norm(e.word);
  // a reflexive headword (sentarse) illustrates forms of the plain verb too
  const lemmas = e.pos === 'verb' && /se$/u.test(word) && word.length > 4 ? [word, word.slice(0, -2)] : [word];
  for (const s of Array.isArray(e.senses) ? e.senses as Array<{ form_of?: unknown; examples?: unknown }> : []) {
    if (Array.isArray(s.form_of) && s.form_of.length) continue; // an example under an inflected-form entry does not name the lemma
    for (const ex of Array.isArray(s.examples) ? s.examples as Array<{ text?: unknown; bold_text_offsets?: unknown }> : []) {
      all++;
      const text = ex.text;
      const off = ex.bold_text_offsets;
      if (typeof text !== 'string' || !Array.isArray(off) || off.length !== 1 || !Array.isArray(off[0])) continue;
      const [start, end] = off[0] as [number, number];
      if (text !== text.trim() || /[\r\n]/.test(text) || text.length > 400 || text !== text.normalize('NFC')) continue;
      const key = `${text}|${start}|${word}|${String(e.pos)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      usable++;
      if ((hash(text) % 2 === 0) !== (split === 'dev')) continue;
      if (hash(key) % sample !== 0) continue;
      examples.push({ text, start, end, lemmas, pos, heading: `${e.word}/${String(e.pos)}` });
    }
  }
}
} catch (err) {
  if (!args.includes('--allow-truncated')) { console.error(`the dictionary file could not be read to its end: ${err instanceof Error ? err.message : String(err)}`); process.exit(1); }
  truncated = ' — THE FILE ENDED EARLY: figures are for the part read';
}

/** The adapter without any use of the neighbours: each word analysed alone, nothing refined. */
const alone: LanguageAdapter = { ...es, analyze: (tokens) => tokens.map((t) => es.analyze([t])[0]), refine: undefined };
const registryOf = (a: LanguageAdapter): AdapterRegistry => ({ get: (lang) => (lang === 'es' ? a : real.get(lang)), all: () => real.all().map((x) => (x.lang === 'es' ? a : x)) });

const template = loadBundledCorpus().find((d) => d.lang === 'es' && d.id === 'dialogue-01')!;
const docOf = (batch: Example[], n: number) => ({
  ...template, id: `eval-context-${n}`, title: `eval ${n}`,
  sections: [{ paragraphs: batch.map((x) => ({ sentences: [{ text: x.text }] })) }],
}) as unknown as typeof template;

const lexicon = createFileLexiconSource(dictDir, 'es');
const info = await lexicon.info();
if (!info) { console.error(`no Spanish dictionary under ${dictDir}: run npm run dict:build first`); process.exit(1); }

type Kind = 'no context' | 'pipeline' | 'adapter only';
const KINDS: Kind[] = ['no context', 'pipeline', 'adapter only'];
const stat = Object.fromEntries(KINDS.map((k) => [k, { n: 0, among: 0, first: 0, ambiguous: 0, ambiguousFirst: 0 }])) as Record<Kind, { n: number; among: number; first: number; ambiguous: number; ambiguousFirst: number }>;
const coverage = { words: 0, wordList: 0, ruleWordList: 0, dictionary: 0, dictionaryWithRule: 0, ruleDictionaryLemma: 0, guess: 0, none: 0 };
const failures: string[] = [];
const absent: string[] = [];
const absentKinds = new Map<string, number>();
let skipped = 0;

const isGold = (c: AnalysisCandidate | undefined, x: Example): boolean => !!c && c.lemma !== undefined && x.lemmas.includes(norm(c.lemma)) && !!c.pos && x.pos.includes(c.pos);
const kindsOf = (cands: AnalysisCandidate[]): number => new Set(cands.map((c) => `${c.lemma !== undefined ? norm(c.lemma) : ''}|${c.pos === 'AUX' ? 'VERB' : c.pos}`)).size;

const BATCH = 400;
for (let b = 0; b * BATCH < examples.length; b++) {
  const batch = examples.slice(b * BATCH, (b + 1) * BATCH);
  const doc = docOf(batch, b);
  const plans = {
    'no context': (await planWithDictionary([doc], registryOf(alone), () => lexicon)).plans[0],
    pipeline: (await planWithDictionary([doc], real, () => lexicon)).plans[0],
    'adapter only': (await planWithDictionary([doc], real)).plans[0],
  } as const;
  batch.forEach((x, i) => {
    const sentence = plans.pipeline.sentences[i];
    if (!sentence || sentence.text !== x.text) { skipped++; return; }
    const ti = sentence.tokens.findIndex((t) => t.start === x.start && t.end === x.end && t.isWord);
    if (ti < 0) { skipped++; return; } // the bold span is not exactly one word
    for (const k of KINDS) {
      const cands = plans[k].sentences[i].analyzed[ti].candidates;
      const s = stat[k];
      s.n++;
      const among = cands.some((c) => isGold(c, x));
      if (among) s.among++;
      const first = isGold(cands[0], x);
      if (first) s.first++;
      if (among && kindsOf(cands) > 1) { s.ambiguous++; if (first) s.ambiguousFirst++; }
      if (k === 'pipeline' && !among) {
        // why the headword's reading is not there at all: nothing known, a guess only, or other readings
        const top = cands[0];
        const why = !top ? 'no reading' : top.unconfirmed ? 'rule guess only' : top.lemma !== undefined && x.lemmas.includes(norm(top.lemma)) ? `same lemma, another part of speech (${top.pos} for ${x.pos.join('/')})` : `another lemma (${top.origin ?? 'hand'})`;
        const bucket = why.startsWith('same lemma') ? 'same lemma, another part of speech' : why;
        absentKinds.set(bucket, (absentKinds.get(bucket) ?? 0) + 1);
        if (absent.length < show) absent.push(`[${x.heading}] ${x.text.slice(Math.max(0, x.start - 40), x.start)}«${x.text.slice(x.start, x.end)}»${x.text.slice(x.end, x.end + 30)}   → ${why}: ${cands.slice(0, 3).map((o) => `${o.lemma}/${o.pos}`).join(', ') || '—'}`);
      }
      if (k === 'pipeline' && among && !first && failures.length < show) {
        const c = cands[0];
        failures.push(`[${x.heading}] ${x.text.slice(Math.max(0, x.start - 45), x.start)}«${x.text.slice(x.start, x.end)}»${x.text.slice(x.end, x.end + 35)}   → ${c?.lemma}/${c?.pos} ${c?.notes?.context ? `(${String(c.notes.context)})` : '(no neighbour decided)'}; others: ${cands.slice(1, 4).map((o) => `${o.lemma}/${o.pos}`).join(', ')}`);
      }
    }
    // coverage of every word of the sentence, as the importer would store it
    sentence.tokens.forEach((t, j) => {
      if (!t.isWord) return;
      coverage.words++;
      const c = sentence.analyzed[j].candidates.find((q) => q.lemma || q.pos || q.gloss);
      if (!c) coverage.none++;
      else if (c.unconfirmed) coverage.guess++;
      else if (c.origin === 'dictionary') { if (c.notes?.rule) coverage.dictionaryWithRule++; else coverage.dictionary++; }
      else if (c.notes?.lemmaStatus === 'in the dictionary') coverage.ruleDictionaryLemma++;
      else if (c.origin === 'hand') coverage.wordList++;
      else coverage.ruleWordList++;
    });
  });
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(2)} %` : 'n/a');
console.log(`es:eval-context - split ${split}${sample > 1 ? `, 1 in ${sample}` : ''}; ${file} (${lines} lines${truncated}); dictionary ${info.id}; adapter ${es.version}`);
console.log(`examples in the file: ${all}; usable (one bold span, single line, one headword word): ${usable}; in this split: ${examples.length}; bold span not exactly one word: ${skipped}`);
for (const k of KINDS) {
  const s = stat[k];
  console.log(`${k.padEnd(13)} bold words ${s.n}: the headword's reading is among the readings ${pct(s.among, s.n)}; it is the first reading ${pct(s.first, s.n)}`);
  console.log(`${''.padEnd(13)} of ${s.ambiguous} words with competing readings (headword's among them): first reading right ${pct(s.ambiguousFirst, s.ambiguous)}`);
}
const c = coverage;
console.log(`coverage of all ${c.words} words of these sentences (pipeline): word list ${pct(c.wordList, c.words)}; rule on a word-list lemma ${pct(c.ruleWordList, c.words)}; dictionary and rule agree ${pct(c.dictionaryWithRule, c.words)}; dictionary alone ${pct(c.dictionary, c.words)}; rule on a dictionary lemma ${pct(c.ruleDictionaryLemma, c.words)}; rule guess only ${pct(c.guess, c.words)}; nothing ${pct(c.none, c.words)}`);
console.log(`pipeline, headword's reading absent: ${[...absentKinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('; ')}`);
if (absent.length) { console.log('\npipeline: the headword\'s reading was not among the readings'); for (const f of absent) console.log(`  ${f}`); }
if (failures.length) { console.log('\npipeline: the headword\'s reading was there but not first'); for (const f of failures) console.log(`  ${f}`); }
