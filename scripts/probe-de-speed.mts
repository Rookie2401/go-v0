/**
 * Probe: how long does German analysis take? Tokenizes and analyses every bundled German document with the real
 * adapter and reports time per word token, cold and warm; then the context-free engine on single forms and the
 * share of word tokens with a confirmed reading per document family. Run: npx vite-node scripts/probe-de-speed.mts
 */
import { createAdapterRegistry } from '../src/adapters';
import { deLexiconView } from '../src/adapters/german/lexicon';
import { analyzeGermanForm } from '../src/adapters/german/morphology';
import { loadBundledCorpus } from '../src/ingest';

const de = createAdapterRegistry().get('de');
const docs = loadBundledCorpus().filter((d) => d.lang === 'de');
const sentences: Array<{ family: string; text: string }> = [];
const family = (id: string): string => (/^weg-/.test(id) ? 'weg' : /^gespraech/.test(id) ? 'gespraeche' : /^deutschland/.test(id) ? 'deutschland' : /^bible-/.test(id) ? 'bible' : /^grimm-/.test(id) ? 'grimm' : 'other');
for (const d of docs) for (const s of d.sections) for (const p of s.paragraphs) {
  if ('sentences' in p) for (const x of p.sentences) sentences.push({ family: family(d.id), text: x.text });
  else for (const sp of de.segmentSentences(p.text)) sentences.push({ family: family(d.id), text: sp.text });
}
const run = () => {
  let words = 0;
  const t0 = performance.now();
  for (const s of sentences) { const toks = de.tokenize(s.text); de.analyze(toks); words += toks.filter((t) => t.isWord).length; }
  return { ms: performance.now() - t0, words };
};
const cold = run();
const warm = run();
console.log(`${docs.length} documents, ${sentences.length} sentences, ${cold.words} word tokens`);
console.log(`adapter.analyze: cold ${cold.ms.toFixed(0)} ms (${(cold.ms / cold.words).toFixed(2)} ms per word); warm ${warm.ms.toFixed(0)} ms (${(warm.ms / warm.words).toFixed(3)} ms per word)`);

// the share of word tokens with a confirmed reading (not `unconfirmed`), per family
const stat = new Map<string, { words: number; confirmed: number; any: number }>();
for (const s of sentences) {
  const toks = de.tokenize(s.text);
  const an = de.analyze(toks);
  const st = stat.get(s.family) ?? { words: 0, confirmed: 0, any: 0 };
  toks.forEach((t, i) => {
    if (!t.isWord) return;
    st.words++;
    const c = an[i].candidates;
    if (c.some((x) => !x.unconfirmed)) st.confirmed++;
    if (c.length) st.any++;
  });
  stat.set(s.family, st);
}
for (const [f, st] of [...stat].sort()) console.log(`  ${f.padEnd(12)} ${String(st.words).padStart(6)} words  confirmed ${(100 * st.confirmed / st.words).toFixed(1)} %  any reading ${(100 * st.any / st.words).toFixed(1)} %`);

const forms = ['gehen', 'Haus', 'guten', 'Männern', 'aufgestanden', 'Lebensversicherung', 'daß', 'xqzt', 'Qwertzuiop'];
for (const f of forms) {
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) analyzeGermanForm(f, deLexiconView);
  console.log(`  engine ${f.padEnd(20)} ${((performance.now() - t0) / 20).toFixed(3)} ms per call (warm: the engine caches forms)`);
}
