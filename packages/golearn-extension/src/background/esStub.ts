/**
 * The Spanish analyser as the background worker sees it. The worker build (vite.config.ts `leanSpanish`) swaps `src/adapters/es` for this module in the one
 * place it would otherwise be linked: the linguistic service's resolver (`repository-linguistics/src/resolver.ts`), which the device-local Repository uses.
 * The worker cannot `import()` an analyser chunk, so Spanish is not normally loaded there; the parser's registry is read at call time (it answers if a
 * future worker loads the analyser) and, while it is empty, every call throws and the resolver records the form alone ("the analyzer failed; only the
 * form is recorded"). The real adapter is untouched in the content script, the analyser chunk and the tests.
 */
import type { LanguageAdapter } from '../../../../src/core';
import { getAnalyser } from '../parser/registry';

export const esAdapter: LanguageAdapter = new Proxy({} as LanguageAdapter, {
  get(_target, key) {
    const real = getAnalyser('es') as unknown as Record<PropertyKey, unknown> | undefined;
    if (real) { const v = real[key]; return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(real) : v; }
    if (key === 'lang') return 'es';
    if (key === 'name') return 'Spanish';
    if (key === 'version') return '0';
    if (key === 'sources' || key === 'support' || key === 'describeMorph' || key === 'then') return undefined;
    return () => { throw new Error('the Spanish analyser is not loaded in the background worker'); };
  },
});
