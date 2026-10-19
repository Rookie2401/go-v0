/**
 * The five course-language adapters and the registry the engines consume.
 */
import type { AdapterRegistry, LanguageAdapter, LanguageCode } from '../core';
import { LANGUAGES } from '../core';
import { esAdapter } from './es';
import { sqAdapter } from './sq';
import { thAdapter } from './th';
import { hiAdapter } from './hi';
import { deAdapter } from './de';
import { nbAdapter } from './nb';
import { nnAdapter } from './nn';
import { heAdapter } from './he';
import { elAdapter } from './el';
import { laAdapter } from './la';

export { esAdapter, sqAdapter, thAdapter, hiAdapter, deAdapter, nbAdapter, nnAdapter, heAdapter, elAdapter, laAdapter };
export * from './shared';

const BY_LANG: Record<LanguageCode, LanguageAdapter> = {
  es: esAdapter, sq: sqAdapter, th: thAdapter, hi: hiAdapter, de: deAdapter, nb: nbAdapter, nn: nnAdapter, he: heAdapter, el: elAdapter, la: laAdapter,
};

/** Registry over the course-language adapters, in `LANGUAGES` order. `get` throws for an unknown language code. */
export function createAdapterRegistry(): AdapterRegistry {
  return {
    get(lang: LanguageCode): LanguageAdapter {
      const a = BY_LANG[lang];
      if (!a) throw new Error(`no adapter for language "${String(lang)}"`);
      return a;
    },
    all(): LanguageAdapter[] {
      return LANGUAGES.map((l) => BY_LANG[l]);
    },
  };
}
