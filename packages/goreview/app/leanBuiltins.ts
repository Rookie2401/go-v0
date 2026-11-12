/**
 * GoReview's replacement for `packages/language-packs/src/builtins.ts` in its own web builds (the review build and the plain web build; see
 * the `goreview-lean-builtins` plugin in vite.config.ts). The full module links all ten language adapters into the main script, so every
 * start evaluated (and parsed) the lexicons of languages the learner was not studying, about a second on a phone. Here each adapter is its
 * own chunk (`assets/lang-<id>-<hash>.js`), fetched the first time that language is needed, once, and kept for the life of the page; the
 * service worker keeps the chunk of a language that was used, so it also opens offline.
 *
 * Same exports as the full module: `builtInAdapter` is synchronous and answers only for a language already loaded (a caller that may run
 * before the language is loaded awaits `loadBuiltInAdapter` first); `loadBuiltInAdapter` resolves to the adapter, or rejects with an
 * `AdapterLoadError` (retryable: the next call fetches again, a failure is never remembered).
 */
import type { LanguageAdapter } from '../../../src/core';
import { AdapterLoadError } from '../../language-packs/src/adapterLoadError';

export { AdapterLoadError };

const LOADERS: Readonly<Record<string, () => Promise<LanguageAdapter>>> = Object.freeze({
  sq: () => import('../../../src/adapters/sq').then((m) => m.sqAdapter),
  es: () => import('../../../src/adapters/es').then((m) => m.esAdapter),
  de: () => import('../../../src/adapters/de').then((m) => m.deAdapter),
  hi: () => import('../../../src/adapters/hi').then((m) => m.hiAdapter),
  th: () => import('../../../src/adapters/th').then((m) => m.thAdapter),
  nb: () => import('../../../src/adapters/nb').then((m) => m.nbAdapter),
  nn: () => import('../../../src/adapters/nn').then((m) => m.nnAdapter),
  la: () => import('../../../src/adapters/la').then((m) => m.laAdapter),
  he: () => import('../../../src/adapters/he').then((m) => m.heAdapter),
  el: () => import('../../../src/adapters/el').then((m) => m.elAdapter),
});

const loaded = new Map<string, LanguageAdapter>();
const loading = new Map<string, Promise<LanguageAdapter>>();

/** The analyser of a language that has been loaded; undefined until then (and for a language with none). */
export function builtInAdapter(languageId: string): LanguageAdapter | undefined {
  return loaded.get(languageId);
}

/** Loads a language's analyser (one fetch however many callers ask at once); undefined for a language that has none; rejects with `AdapterLoadError`. */
export function loadBuiltInAdapter(languageId: string): Promise<LanguageAdapter | undefined> {
  const kept = loaded.get(languageId);
  if (kept) return Promise.resolve(kept);
  if (!Object.prototype.hasOwnProperty.call(LOADERS, languageId)) return Promise.resolve(undefined);
  let job = loading.get(languageId);
  if (!job) {
    job = LOADERS[languageId]!().then(
      (adapter) => { loaded.set(languageId, adapter); loading.delete(languageId); return adapter; },
      (cause: unknown) => { loading.delete(languageId); throw new AdapterLoadError(languageId, cause); },
    );
    loading.set(languageId, job);
  }
  return job;
}

/** Which languages have been loaded so far, in the order they finished (for tests and diagnostics). */
export function loadedAdapterLanguages(): string[] {
  return [...loaded.keys()];
}
