/**
 * Loading an analyser by import, for the places that are built with a bundler that can split code (the setup app) and for
 * tests. Each language is one dynamic import of its `src/analysers/<id>.ts`, so the bundler emits one chunk per analyser;
 * the content script does NOT use this file (it is a single classic script, and loads the prebuilt `analysers/<id>.js`
 * from the extension instead: content/index.ts).
 *
 * `loadAnalyser` registers the adapter with the parser (and, through the lean built-ins, with the pack runtime) and is
 * idempotent: a loaded language resolves at once.
 */
import type { LanguageAdapter } from '../../../../src/core';
import { getAnalyser, hasAnalyser, languageMeta, registerAnalyser } from '../parser/registry';

type AnalyserModule = { adapter: LanguageAdapter };

const IMPORTS: Readonly<Record<string, () => Promise<AnalyserModule>>> = {
  sq: () => import('./sq'),
  es: () => import('./es'),
  de: () => import('./de'),
  hi: () => import('./hi'),
  th: () => import('./th'),
  nb: () => import('./nb'),
  nn: () => import('./nn'),
};

/** Loads (once) and registers the analyser of a language; resolves with it, or undefined for a language the parser does not know. A failed import rejects. */
export async function loadAnalyser(languageId: string): Promise<LanguageAdapter | undefined> {
  if (!languageMeta(languageId)) return undefined;
  if (hasAnalyser(languageId)) return getAnalyser(languageId);
  const load = Object.prototype.hasOwnProperty.call(IMPORTS, languageId) ? IMPORTS[languageId] : undefined;
  if (!load) return undefined;
  const { adapter } = await load();
  registerAnalyser(languageId, adapter);
  return adapter;
}
