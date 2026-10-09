/**
 * The analysers a pack runtime can use without being handed one. THIS file is the full set (every adapter linked in
 * statically) and is what servers, tests and the other apps get.
 *
 * The browser extension does not want five analysers inside its background worker or its content script, so its builds
 * (packages/golearn-extension/vite.config.ts, plugin `golearn-lean-builtins`) swap this module for
 * packages/golearn-extension/src/analysers/builtins.ts, which has Albanian linked in and reads every other language from the
 * parser's analyser registry (filled by the lazily loaded `analysers/<id>.js` chunks). The exported function is the same
 * synchronous one in both, so no caller changes: where an analyser is not loaded, `builtInAdapter` says `undefined` and the
 * runtime falls back to the tokenize-only analyser, which says so.
 */
import { sqAdapter } from '../../../src/adapters/sq';
import { esAdapter } from '../../../src/adapters/es';
import { deAdapter } from '../../../src/adapters/de';
import { hiAdapter } from '../../../src/adapters/hi';
import { thAdapter } from '../../../src/adapters/th';
import type { LanguageAdapter } from '../../../src/core';

/**
 * The analysers bundled with the runtime: the installable pack (Albanian), Spanish at a minimal level, and the three
 * experimental packs (German, Hindi, Thai). Norwegian is planned and has none: it falls back to the tokenize-only analyser.
 */
const BUILT_IN: Readonly<Record<string, LanguageAdapter>> = Object.freeze({ sq: sqAdapter, es: esAdapter, de: deAdapter, hi: hiAdapter, th: thAdapter });

/** The analyser the runtime bundles for a language, if any (Norwegian has none: its packs are planned). */
export function builtInAdapter(languageId: string): LanguageAdapter | undefined {
  return Object.prototype.hasOwnProperty.call(BUILT_IN, languageId) ? BUILT_IN[languageId] : undefined;
}
