/**
 * Probe: where does the Spanish adapter face a real choice in the bundled Spanish texts?
 * A token counts as a homograph when its candidates differ in lemma or part of speech (two readings of the same
 * verb, "habla" 3sg / imperative, are not counted here). Prints every such form with its first reading, the others,
 * and each context, so that a person can judge the choices. Run: npx vite-node scripts/probe-es-homographs.mts
 */
import { createAdapterRegistry } from '../src/adapters';
import { loadBundledCorpus } from '../src/ingest';

const es = createAdapterRegistry().get('es');
const docs = loadBundledCorpus().filter((d) => d.lang === 'es');
let words = 0;
let ambiguous = 0;
const seen = new Map<string, { first: string; rest: string; n: number; contexts: string[] }>();
for (const d of docs) for (const s of d.sections) for (const p of s.paragraphs) {
  const sentences = 'sentences' in p ? p.sentences.map((x) => x.text) : es.segmentSentences(p.text).map((x) => x.text);
  for (const text of sentences) {
    const toks = es.tokenize(text);
    const res = es.analyze(toks);
    res.forEach((r, i) => {
      if (!toks[i].isWord) return;
      words++;
      const c = r.candidates;
      if (c.length < 2) return;
      const key = (x: (typeof c)[number]) => `${x.lemma}/${x.pos}`;
      const kinds = [...new Set(c.map(key))];
      if (kinds.length < 2) return;
      ambiguous++;
      const k = `${toks[i].normalized} → ${key(c[0])}`;
      const e = seen.get(k) ?? { first: `${key(c[0])} ${c[0].confidence}`, rest: kinds.slice(1).join(', '), n: 0, contexts: [] };
      e.n++;
      const ctx = `${toks.slice(Math.max(0, i - 3), i).map((t) => t.surface).join('')}[${toks[i].surface}]${toks.slice(i + 1, i + 4).map((t) => t.surface).join('')}`;
      if (e.contexts.length < (process.argv.includes('--all') ? 99 : 4)) e.contexts.push(ctx);
      seen.set(k, e);
    });
  }
}
console.log(`${docs.length} documents, ${words} word tokens, ${ambiguous} with readings that differ in lemma or part of speech (${((100 * ambiguous) / words).toFixed(1)} %), ${seen.size} distinct forms`);
for (const [k, e] of [...seen.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${String(e.n).padStart(4)}  ${k}   | others: ${e.rest}`);
  for (const c of e.contexts) console.log(`        ${c}`);
}
