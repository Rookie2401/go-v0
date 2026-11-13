/**
 * The Biblical Aramaic analyser as the background worker sees it. The worker build (vite.config.ts `leanAramaic`) swaps
 * `src/adapters/arc` for this module where the linguistic service's resolver links it, so the corpus seed stays in the
 * content script's analyser chunk (dist/analysers/arc.js) and out of background.js. The static description (version,
 * script, support, sources) is real; analysis reads the parser's registry at call time and, while the analyser is not
 * loaded there, throws, so the resolver records the form alone, as it does for Spanish.
 */
import type { LanguageAdapter } from '../../../../src/core';
import { ARC_SOURCES, ARC_SUPPORT, ARC_VARIETIES, ARC_VERSION } from '../../../../src/adapters/aramaic/meta';
import { getAnalyser } from '../parser/registry';

const STATIC: Readonly<Record<string, unknown>> = {
  lang: 'arc', name: 'Biblical Aramaic', script: 'Hebr', version: ARC_VERSION,
  varieties: ARC_VARIETIES, support: ARC_SUPPORT, sources: ARC_SOURCES,
};

export const arcAdapter: LanguageAdapter = new Proxy({} as LanguageAdapter, {
  get(_target, key) {
    const real = getAnalyser('arc') as unknown as Record<PropertyKey, unknown> | undefined;
    if (real) { const v = real[key]; return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(real) : v; }
    if (typeof key === 'string' && Object.hasOwn(STATIC, key)) return STATIC[key];
    if (key === 'describeMorph' || key === 'then') return undefined;
    return () => { throw new Error('the Biblical Aramaic analyser is not loaded in the background worker'); };
  },
});
