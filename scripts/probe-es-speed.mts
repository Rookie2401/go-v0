/**
 * Probe: how long does Spanish analysis take? Tokenizes and analyses every bundled Spanish document with the real
 * adapter and reports time per word token, cold and warm. Run: npx vite-node scripts/probe-es-speed.mts
 */
import { createAdapterRegistry } from '../src/adapters';
import { analyzeSpanishForm } from '../src/adapters/spanish/morphology';
import { loadBundledCorpus } from '../src/ingest';

const es = createAdapterRegistry().get('es');
const docs = loadBundledCorpus().filter((d) => d.lang === 'es');
const sentences: string[] = [];
for (const d of docs) for (const s of d.sections) for (const p of s.paragraphs) {
  if ('sentences' in p) for (const x of p.sentences) sentences.push(x.text);
  else for (const sp of es.segmentSentences(p.text)) sentences.push(sp.text);
}
const run = () => {
  let words = 0;
  const t0 = performance.now();
  for (const s of sentences) { const toks = es.tokenize(s); es.analyze(toks); words += toks.filter((t) => t.isWord).length; }
  return { ms: performance.now() - t0, words };
};
const cold = run();
const warm = run();
console.log(`${docs.length} documents, ${sentences.length} sentences, ${cold.words} word tokens`);
console.log(`adapter.analyze: cold ${cold.ms.toFixed(0)} ms (${(cold.ms / cold.words).toFixed(2)} ms per word); warm ${warm.ms.toFixed(0)} ms (${(warm.ms / warm.words).toFixed(3)} ms per word)`);
const forms = ['hubiéramos', 'decírselo', 'hablamos', 'casas', 'tenés', 'trabucaban', 'mesa', 'libro', 'rápidamente', 'xqzt'];
for (const f of forms) {
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) analyzeSpanishForm(f, { knownLemma: () => true });
  console.log(`  engine ${f.padEnd(12)} ${((performance.now() - t0) / 20).toFixed(2)} ms per call`);
}
