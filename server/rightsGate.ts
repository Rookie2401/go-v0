/**
 * The rights gate of the production build (a Vite plugin). While Vite bundles `data/corpus/**.json`:
 *   - a document whose rights are unverified is replaced by `null`, so its text is not in the bundle at all
 *     (`loadBundledCorpus` drops the nulls); the build says which documents were left out;
 *   - a document that claims a status without its evidence, or that can never be bundled, stops the build.
 * Development and tests are untouched: they see every document, labelled as it is. The rule itself is
 * src/ingest/rights.ts (`bundleDecision`); `npm run rights:check` applies the same rule with the catalogue.
 *
 * WHERE THE BUILD IS RELEASED. Set GO_RELEASE_JURISDICTIONS (e.g. "US,DE,EU") and the build also consults the
 * catalogue: a public-domain or licensed text whose work records no rights basis for one of those jurisdictions is left
 * out, exactly as `npm run rights:check -- --release US,DE,EU` reports. Without the variable the build makes no claim
 * about where it may be distributed and leaves nothing out on that ground (it says so).
 */
import type { Plugin } from 'vite';
import { bundleDecision, type RightsContext } from '../src/ingest/rights.ts';
import { parseRelease, rightsContext } from '../src/ingest/rightsCatalogue.ts';

const CORPUS = /[\\/]data[\\/]corpus[\\/].+\.json$/;

export function rightsGate(options: { release?: readonly string[] } = {}): Plugin {
  const excluded: string[] = [];
  const release = options.release ?? parseRelease(process.env.GO_RELEASE_JURISDICTIONS);
  let ctx: RightsContext = {};
  return {
    name: 'go-rights-gate',
    enforce: 'pre',
    apply: 'build',
    async buildStart() {
      if (!release) return;
      // the catalogue is plain data (src/course imports only the contract); loaded only for a build that names its jurisdictions
      const course = await import('../src/course/index.ts');
      ctx = rightsContext(course as Record<string, unknown>, release);
    },
    transform(code, id) {
      const file = id.split('?')[0];
      if (!CORPUS.test(file)) return null;
      let doc: unknown;
      try { doc = JSON.parse(code); } catch { this.error(`rights gate: ${file} is not valid JSON`); }
      const d = bundleDecision(doc, ctx);
      const name = file.replace(/^.*[\\/]data[\\/]corpus[\\/]/, '').replace(/\\/g, '/');
      if (d.verdict === 'refuse') this.error(`rights gate: ${name} cannot be bundled — ${d.reason}`);
      if (d.verdict === 'exclude') {
        excluded.push(`${name}: ${d.reason}`);
        return { code: 'null', map: null };
      }
      return null;
    },
    buildEnd() {
      this.warn(release
        ? `rights gate: this build is released in ${release.join(', ')}; a public-domain or licensed text without a recorded basis for each of them was left out`
        : 'rights gate: no release jurisdictions given (GO_RELEASE_JURISDICTIONS): this build makes no claim about where it may be distributed');
      if (excluded.length === 0) return;
      this.warn(`rights gate: ${excluded.length} document(s) left out of this build:\n${excluded.map((e) => `  - ${e}`).join('\n')}`);
    },
  };
}
