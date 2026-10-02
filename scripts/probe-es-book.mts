/// <reference types="node" />
/**
 * npx vite-node scripts/probe-es-book.mts -- <file.txt> [--dict public/dict] [--title "…"] [--show 40]
 *
 * What does the Spanish pipeline make of a real book? Reads a plain-text file, runs the source quality check, splits it
 * into chapters exactly as an import would, and PLANS the import with the installed dictionary — nothing is written
 * to any database. Reports time, memory, and what kind of reading every word ends up with; lists the most frequent
 * words that stay a rule guess or get no reading at all, for a person to look at.
 * What it does not tell: whether the readings are RIGHT. That needs a hand-checked sample.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../src/adapters';
import { createFileLexiconSource } from '../src/dict/file';
import { planWithDictionary } from '../src/ingest/import';
import { plainTextToDocuments } from '../src/ingest/plaintext';
import { inspectText } from '../src/ingest/quality';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a) => !a.startsWith('--') && a !== opt('dict') && a !== opt('title') && a !== opt('show'));
if (!file || !fs.existsSync(file)) { console.error('usage: npx vite-node scripts/probe-es-book.mts -- <file.txt> [--dict public/dict] [--title "…"] [--show 40]'); process.exit(1); }
const show = Number(opt('show') ?? 30);
const title = opt('title') ?? path.basename(file).replace(/\.[^.]+$/, '');

const registry = createAdapterRegistry();
const es = registry.get('es');
const lexicon = createFileLexiconSource(opt('dict') ?? 'public/dict', 'es');
const info = await lexicon.info();

const raw = fs.readFileSync(file, 'utf8');
const quality = inspectText(raw, { lang: 'es' });
console.log(`es book probe - ${file}: ${raw.length.toLocaleString('en-US')} characters; dictionary ${info?.id ?? 'NONE INSTALLED'}; adapter ${es.version}`);
console.log(`source quality: ${quality.verdict}; ${quality.flags.map((f) => `${f.code} ${f.severity} ×${f.count}`).join(', ') || 'no flags'}`);

const t0 = performance.now();
const { documents, notes } = plainTextToDocuments(raw, { lang: 'es', title, idPrefix: `probe-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, paragraphs: 'blank-line', unwrap: true, stripBoilerplate: true });
console.log(`split: ${documents.length} chapter document(s) in ${Math.round(performance.now() - t0)} ms; ${notes.slice(0, 4).join(' | ')}`);

const heap0 = process.memoryUsage().heapUsed;
const t1 = performance.now();
const kinds = { wordList: 0, ruleWordList: 0, dictAndRule: 0, dictAlone: 0, ruleDictLemma: 0, guess: 0, none: 0 };
const guessForms = new Map<string, number>();
const noneForms = new Map<string, number>();
let words = 0, sentences = 0, doubtful = 0, joined = 0, decided = 0, lemmaOnly = 0, dictOnly = 0;
const distinct = new Set<string>();
for (const doc of documents) {
  const { plans, notes: n } = await planWithDictionary([doc], registry, info ? () => lexicon : undefined);
  if (n.size) console.log(`  note for ${doc.id}: ${[...n.values()].join('; ')}`);
  const plan = plans[0];
  joined += plan.dictionary?.joined ?? 0; decided += plan.dictionary?.decided ?? 0; lemmaOnly += plan.dictionary?.lemmaOnly ?? 0; dictOnly += plan.dictionary?.tokens ?? 0;
  for (const s of plan.sentences) {
    sentences++;
    s.tokens.forEach((t, i) => {
      if (!t.isWord) return;
      words++;
      distinct.add(t.normalized);
      const cands = s.analyzed[i].candidates;
      const c = cands.find((q) => q.lemma || q.pos || q.gloss);
      if (!c) { kinds.none++; noneForms.set(t.normalized, (noneForms.get(t.normalized) ?? 0) + 1); return; }
      if (c.unconfirmed) { kinds.guess++; guessForms.set(t.normalized, (guessForms.get(t.normalized) ?? 0) + 1); }
      else if (c.origin === 'dictionary') { if (c.notes?.rule) kinds.dictAndRule++; else kinds.dictAlone++; }
      else if (c.notes?.lemmaStatus === 'in the dictionary') kinds.ruleDictLemma++;
      else if (c.origin === 'hand') kinds.wordList++;
      else kinds.ruleWordList++;
      // what the word sheet would call "possibly": below 0.6, or another word or part of speech within 0.2
      const rivals = cands.slice(1).some((r) => c.confidence - r.confidence < 0.2 - 1e-9 && (r.lemma !== c.lemma || r.pos !== c.pos));
      if (c.confidence < 0.6 || rivals) doubtful++;
    });
  }
}
const ms = performance.now() - t1;
const pct = (n: number) => `${((100 * n) / Math.max(1, words)).toFixed(2)} %`;
console.log(`planned: ${sentences.toLocaleString('en-US')} sentences, ${words.toLocaleString('en-US')} words (${distinct.size.toLocaleString('en-US')} distinct forms) in ${(ms / 1000).toFixed(1)} s (${(ms / Math.max(1, words)).toFixed(3)} ms per word); heap grew ${Math.round((process.memoryUsage().heapUsed - heap0) / 1e6)} MB`);
console.log(`first reading comes from: word list ${pct(kinds.wordList)}; rule on a word-list lemma ${pct(kinds.ruleWordList)}; dictionary and rule agree ${pct(kinds.dictAndRule)}; dictionary alone ${pct(kinds.dictAlone)}; rule on a dictionary lemma ${pct(kinds.ruleDictLemma)}; rule guess only ${pct(kinds.guess)}; nothing ${pct(kinds.none)}`);
console.log(`dictionary: ${dictOnly} words only it knew, ${decided} guesses decided, ${lemmaOnly} read by rule from a lemma it lists, ${joined} word-list words that got another reading beside; words the word sheet would call "possibly": ${pct(doubtful)}`);
const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, show).map(([f, n]) => `${f}×${n}`).join(', ');
console.log(`\nmost frequent words left as a rule guess (${guessForms.size} distinct): ${top(guessForms)}`);
console.log(`\nmost frequent words with no reading (${noneForms.size} distinct): ${top(noneForms)}`);
