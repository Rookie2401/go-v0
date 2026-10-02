/// <reference types="node" />
/**
 * npx vite-node scripts/probe-es-pipeline-diff.mts [-- --dict public/dict] [--all]
 *
 * Does installing the dictionary change how words the course ALREADY reads are read? The course's own Spanish texts
 * are written within the word list, so the adapter alone reads every word of them; with the dictionary installed the
 * importer adds its readings beside the adapter's and lets the context rules choose. Every word whose FIRST reading
 * then differs is listed here, grouped, with one context each — for a person to judge. The in-sentence evaluation
 * (es:eval-context) cannot see this: it looks at one marked word per example, never at the function words around it.
 * This probe found, on 2026-10-01, 124 changed first readings, nearly all for the worse (es → a letter name, para →
 * parar); see docs/spanish/DICTIONARY.md.
 * Needs the built dictionary (public/dict/es). Reads only; writes nothing.
 */
import { createAdapterRegistry } from '../src/adapters';
import { createFileLexiconSource } from '../src/dict/file';
import { loadBundledCorpus } from '../src/ingest';
import { planWithDictionary } from '../src/ingest/import';

const args = process.argv.slice(2).filter((a) => a !== '--');
const at = args.indexOf('--dict');
const dictDir = at >= 0 && args[at + 1] ? args[at + 1] : 'public/dict';
const all = args.includes('--all');

const registry = createAdapterRegistry();
const lexicon = createFileLexiconSource(dictDir, 'es');
const info = await lexicon.info();
if (!info) { console.error(`no Spanish dictionary under ${dictDir}: run npm run dict:build first`); process.exit(1); }

const docs = loadBundledCorpus().filter((d) => d.lang === 'es');
let words = 0;
let joined = 0;
const diffs = new Map<string, { n: number; contexts: string[] }>();
for (const doc of docs) {
  const alone = (await planWithDictionary([doc], registry)).plans[0];
  const withDict = (await planWithDictionary([doc], registry, () => lexicon)).plans[0];
  joined += withDict.dictionary?.joined ?? 0;
  withDict.sentences.forEach((s, si) => {
    s.tokens.forEach((t, ti) => {
      if (!t.isWord) return;
      words++;
      const a = alone.sentences[si].analyzed[ti].candidates[0];
      const b = s.analyzed[ti].candidates[0];
      const ka = `${a?.lemma}/${a?.pos}`;
      const kb = `${b?.lemma}/${b?.pos}`;
      if (ka === kb) return;
      const key = `${t.normalized}: ${ka} → ${kb}${b?.origin === 'dictionary' ? ' (dictionary)' : ''}${b?.notes?.context ? ` [${String(b.notes.context)}]` : ''}`;
      const e = diffs.get(key) ?? { n: 0, contexts: [] };
      e.n++;
      if (e.contexts.length < (all ? 99 : 2)) e.contexts.push(`${s.text.slice(Math.max(0, t.start - 30), t.start)}«${t.surface}»${s.text.slice(t.end, t.end + 25)}`);
      diffs.set(key, e);
    });
  });
}
const total = [...diffs.values()].reduce((n, e) => n + e.n, 0);
console.log(`es pipeline diff - ${docs.length} documents, ${words} words; dictionary ${info.id}; adapter ${registry.get('es').version}`);
console.log(`words that got a dictionary reading beside the adapter's: ${joined}; words whose FIRST reading differs from the adapter's alone: ${total} (${((100 * total) / words).toFixed(2)} %), ${diffs.size} distinct`);
for (const [k, e] of [...diffs.entries()].sort((x, y) => y[1].n - x[1].n)) {
  console.log(`${String(e.n).padStart(4)}  ${k}`);
  for (const c of e.contexts) console.log(`        ${c}`);
}
