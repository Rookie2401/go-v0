/// <reference types="node" />
/**
 * npm run sq:eval-ud -- --treebank <dir-or-file.conllu> --split dev|test [--show N] [--name STAF] [--dict public/dict]
 *
 * How far does the Albanian adapter agree with a Universal Dependencies treebank (UD_Albanian-STAF, UD_Albanian-TSA,
 * UD_Gheg-GPS)? For each sentence of the chosen split the adapter tokenizes the text and analyses it, and the result
 * is compared with the treebank: token boundaries, multiword tokens (ta = të + e, t'i, s'ka ... against the adapter's
 * `parts`), and, where the boundaries agree, part of speech, lemma and the morphological features both sides state;
 * plus how many word tokens have no reading at all. The measures are defined in `src/bench/sq/compare.ts`.
 *
 * What this is NOT:
 *   - A treebank is not ground truth. STAF's lemmas and features are "automatic with corrections" (so they carry a
 *     parser's mistakes and its conventions); TSA is 60 sentences from Wikipedia; an agreement figure says how far two
 *     annotation systems agree, not how correct either one is. The headline lemma measure is "lemma equal", with the
 *     most frequent differing pairs listed so that a person can tell a convention from a mistake.
 *   - GPS is spoken Gheg with code-switching and disfluencies, not Standard Albanian. A low score there is expected and
 *     says nothing about Standard texts.
 *   - Not a source of course text. The treebanks are research and validation material: downloaded only with the
 *     owner's permission into data/research/ud/ (git-ignored), never bundled, never shown to a learner, never copied
 *     into data/corpus/. This script reads them and writes nothing.
 *
 * With `--dict <dir>` the readings are those the IMPORTER would store with the dictionary installed under <dir>/sq
 * (words the adapter cannot read are looked up, guessed lemmas are checked against it): the same comparison, so the two
 * runs show what the dictionary changes on running prose. The sentences are planned in memory and nothing is written.
 *
 * Held-out discipline: sentences are split by a stable hash of `sent_id` (even = dev, odd = test). `dev` may be looked
 * at and tuned on, with `--show N` listing examples. `test` is reported as it comes, `--show` is refused for it (and
 * the tables that would print words from it are withheld): its failures are not to be looked at.
 *
 * Needs no network. Exit 1 on bad arguments, on `--show` with `--split test`, when the path does not exist, or when a
 * file is not valid CoNLL-U.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../src/adapters';
import type { AnalyzedToken, RawToken } from '../src/core';
import type { CorpusDocument } from '../src/ingest/format';
import { createFileLexiconSource } from '../src/dict/file';
import { planWithDictionary } from '../src/ingest/import';
import { parseConllu, type UdSentence } from '../src/bench/sq/conllu';
import { compareWithTreebank, splitOf, type ComparableAdapter, type Split } from '../src/bench/sq/compare';
import { formatReport } from '../src/bench/sq/report';

const USAGE = 'usage: npm run sq:eval-ud -- --treebank <dir-or-file.conllu> --split dev|test [--show N] [--name STAF] [--dict public/dict]';
const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const die = (message: string): never => { console.error(message); process.exit(1); };

const treebank = opt('treebank');
const split = opt('split');
if (!treebank || (split !== 'dev' && split !== 'test')) die(USAGE);
const showRaw = opt('show');
const show = showRaw === undefined ? 0 : Number(showRaw);
if (!Number.isInteger(show) || show < 0) die(`--show wants a whole number, got "${String(showRaw)}"\n${USAGE}`);
if (show > 0 && split === 'test') die('--show is refused for the held-out split (test): its failures are not to be looked at');

if (!existsSync(treebank!)) {
  die(`${treebank} does not exist.\n`
    + 'The Universal Dependencies treebanks for Albanian (UD_Albanian-STAF, UD_Albanian-TSA, UD_Gheg-GPS) are research material:\n'
    + 'they must be downloaded only with the owner\'s permission, into data/research/ud/<name>/ (git-ignored), and are never shipped.');
}

const files = statSync(treebank!).isDirectory()
  ? readdirSync(treebank!).filter((f) => f.endsWith('.conllu')).sort().map((f) => path.join(treebank!, f))
  : [treebank!];
if (files.length === 0) die(`no .conllu file in ${treebank}`);

const sentences: UdSentence[] = [];
for (const f of files) {
  try {
    sentences.push(...parseConllu(readFileSync(f, 'utf8')));
  } catch (err) {
    die(`${f}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const name = opt('name') ?? path.basename(treebank!.replace(/[\\/]+$/, ''));
const registry = createAdapterRegistry();
const adapter = registry.get('sq');
const tokenCount = sentences.reduce((n, s) => n + s.tokens.length, 0);

console.log(`treebank ${name}: ${files.length} file(s), ${sentences.length} sentences, ${tokenCount} surface tokens (punctuation included)`);
console.log(`adapter ${adapter.name} (${adapter.lang}) version ${adapter.version}`);
console.log('a treebank is research material and not ground truth; see the header of scripts/sq-eval-ud.mts');
console.log('');

// with a dictionary: the importer's readings of each sentence, planned in memory (nothing is written, nothing kept)
let compared: ComparableAdapter = adapter;
const dictDir = opt('dict');
if (dictDir) {
  const source = createFileLexiconSource(dictDir, 'sq');
  const info = await source.info();
  if (!info) die(`no Albanian dictionary under ${dictDir}/sq (build one with npm run dict:build)`);
  const chosen = sentences.filter((s) => splitOf(s.id) === split);
  const docs = chosen.map((s, i) => ({
    schemaVersion: 2, id: `ud-${i}`, lang: 'sq', title: 'treebank sentence', contentType: 'article',
    source: { id: `src:sq:ud-${i}`, title: 'treebank sentence', rights: 'research-only', attribution: 'Universal Dependencies', licenseNote: 'CC BY-SA 4.0' },
    review: { status: 'unreviewed' },
    sections: [{ paragraphs: [{ sentences: [{ text: s.text }] }] }],
  })) as unknown as CorpusDocument[];
  const { plans } = await planWithDictionary(docs, registry, () => source);
  const key = (tokens: RawToken[]): string => tokens.map((t) => t.surface).join('\u0001');
  const planned = new Map<string, AnalyzedToken[]>();
  let fromDictionary = 0, decided = 0, lemmaOnly = 0, joined = 0;
  for (const p of plans) {
    planned.set(key(p.sentences.flatMap((x) => x.tokens)), p.sentences.flatMap((x) => x.analyzed));
    fromDictionary += p.dictionary?.tokens ?? 0; decided += p.dictionary?.decided ?? 0; lemmaOnly += p.dictionary?.lemmaOnly ?? 0; joined += p.dictionary?.joined ?? 0;
  }
  let missed = 0;
  compared = { ...adapter, analyze: (tokens) => { const hit = planned.get(key(tokens)); if (!hit || hit.length !== tokens.length) { missed++; return adapter.analyze(tokens); } return hit; } };
  console.log(`dictionary ${info!.id}: ${fromDictionary} word(s) read from it alone, ${decided} guessed word(s) it decided, ${lemmaOnly} guessed lemma(s) it lists, ${joined} word(s) with a dictionary reading beside the adapter's`);
  process.on('exit', () => { if (missed) console.log(`(${missed} sentence(s) fell back to the adapter alone: the importer split them differently)`); });
  console.log('');
}

const result = compareWithTreebank(sentences, compared, { split: split as Split, show, name });
for (const l of formatReport(result)) console.log(l);
