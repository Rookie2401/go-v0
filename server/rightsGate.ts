/**
 * The rights gate of the production build (a Vite plugin). While Vite bundles `data/corpus/**.json`:
 *   - a document whose rights are unverified is replaced by `null`, so its text is not in the bundle at all
 *     (`loadBundledCorpus` drops the nulls); the build says which documents were left out;
 *   - a document that claims a status without its evidence, or that can never be bundled, stops the build.
 * Development and tests are untouched: they see every document, labelled as it is. The rule itself is
 * src/ingest/rights.ts (`bundleDecision`); `npm run rights:check` applies the same rule with the catalogue.
 */
import type { Plugin } from 'vite';
import { bundleDecision } from '../src/ingest/rights.ts';

const CORPUS = /[\\/]data[\\/]corpus[\\/].+\.json$/;

export function rightsGate(): Plugin {
  const excluded: string[] = [];
  return {
    name: 'go-rights-gate',
    enforce: 'pre',
    apply: 'build',
    transform(code, id) {
      const file = id.split('?')[0];
      if (!CORPUS.test(file)) return null;
      let doc: unknown;
      try { doc = JSON.parse(code); } catch { this.error(`rights gate: ${file} is not valid JSON`); }
      const d = bundleDecision(doc);
      const name = file.replace(/^.*[\\/]data[\\/]corpus[\\/]/, '').replace(/\\/g, '/');
      if (d.verdict === 'refuse') this.error(`rights gate: ${name} cannot be bundled — ${d.reason}`);
      if (d.verdict === 'exclude') {
        excluded.push(`${name}: ${d.reason}`);
        return { code: 'null', map: null };
      }
      return null;
    },
    buildEnd() {
      if (excluded.length === 0) return;
      this.warn(`rights gate: ${excluded.length} document(s) left out of this build:\n${excluded.map((e) => `  - ${e}`).join('\n')}`);
    },
  };
}
