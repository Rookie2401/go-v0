/** Probe: print each adapter's declared support and the bundled corpus' publication state. */
import { createMemoryStore } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import { importDocuments, loadBundledCorpus } from '../src/ingest';

const adapters = createAdapterRegistry();
for (const a of adapters.all()) {
  const s = a.support;
  console.log(`${a.lang}: tok=${s.tokenization} sent=${s.sentenceSegmentation} lemma=${s.lemmatization} morph=${s.morphology} phrase=${s.phraseDetection} checks=${s.productionChecks}`);
  for (const l of s.limitations) console.log(`    - ${l}`);
}
const report = await importDocuments(createMemoryStore(), adapters, loadBundledCorpus());
for (const d of report.documents) console.log(`${d.textId}: ${d.published ? 'PUBLISHED' : 'blocked'} coverage=${(d.analysisCoverage.coverage * 100).toFixed(0)}%${d.published ? '' : ' — ' + d.unpublishedReasons[0]}`);
