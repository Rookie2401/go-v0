/**
 * The analysers a pack runtime can use without being handed one. THIS file is the full set (every adapter linked in
 * statically) and is what servers, tests and the other apps get.
 *
 * The browser extension does not want seven analysers inside its background worker or its content script, so its builds
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
import { nbAdapter } from '../../../src/adapters/nb';
import { nnAdapter } from '../../../src/adapters/nn';
import { laAdapter } from '../../../src/adapters/la';
import { heAdapter } from '../../../src/adapters/he';
import { elAdapter } from '../../../src/adapters/el';
import type { LanguageAdapter } from '../../../src/core';

/**
 * The analysers bundled with the runtime: the installable pack (Albanian), Spanish at a minimal level, and the experimental
 * packs (German, Hindi, Thai, Norwegian Bokmål and Nynorsk, Hebrew, Greek). A language outside this set falls back to the
 * tokenize-only analyser.
 */
const BUILT_IN: Readonly<Record<string, LanguageAdapter>> = Object.freeze({ sq: sqAdapter, es: esAdapter, de: deAdapter, hi: hiAdapter, th: thAdapter, nb: nbAdapter, nn: nnAdapter, la: laAdapter, he: heAdapter, el: elAdapter });

/** The analyser the runtime bundles for a language, if any. */
export function builtInAdapter(languageId: string): LanguageAdapter | undefined {
  return Object.prototype.hasOwnProperty.call(BUILT_IN, languageId) ? BUILT_IN[languageId] : undefined;
}
