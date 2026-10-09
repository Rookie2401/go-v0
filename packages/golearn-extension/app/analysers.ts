/**
 * How the setup application brings a language's analyser into memory (the pack installer's validation, the orientation and
 * the share screen all parse with the real analyser). Two ways, chosen at build time (`__GOLEARN_ANALYSERS__`, app/vite.config.ts):
 *
 *   'url'     the extension's setup page, a single classic script: import the extension's prebuilt `analysers/<id>.js`
 *             (the same chunks the content script loads). Nothing is linked into app.js but Albanian.
 *   otherwise the hosted web app and the tests: one dynamic import per language (`src/analysers/loaders.ts`), which Vite splits
 *             into a chunk per analyser.
 */
import { createAnalyserLoader } from '../src/analysers/urlLoader';
import { loadAnalyser as loadChunk } from '../src/analysers/loaders';
import { getContentChrome } from '../src/platform';

declare const __GOLEARN_ANALYSERS__: string | undefined;

let viaUrl: ((languageId: string) => Promise<void>) | undefined;
const urlEnsure = (languageId: string): Promise<void> => (viaUrl ??= createAnalyserLoader(getContentChrome()))(languageId);
const chunkEnsure = async (languageId: string): Promise<void> => { await loadChunk(languageId); };

/**
 * Loads (once) the analyser of a language; resolves when it is registered with the parser and the pack runtime. Rejects when the
 * chunk cannot be read. A language without an analyser resolves too: the caller finds out from the parser. The choice is a
 * build-time constant, so the build that does not use a way carries none of its code.
 */
export const ensureAnalyser: (languageId: string) => Promise<void> =
  typeof __GOLEARN_ANALYSERS__ === 'string' && __GOLEARN_ANALYSERS__ === 'url' ? urlEnsure : chunkEnsure;
