/**
 * Lazy loading of the full Whitaker lexicon (lexicon-full-data.ts, about 2.3 MB of text, 39,000 entries). The seed lexicon stays
 * inline, so the analyser works the moment its chunk is loaded; `loadLatinLexicon()` fetches the rest with a dynamic import (the bundler
 * makes it a chunk of its own beside the analyser, `analysers/shared-*.js`, readable from the page by the same manifest pattern) and adds
 * it to the lexicon. Idempotent; a load in flight is shared. Analysis before the load completes sees the seed lexicon only.
 */
import { latinLexicon } from './lexicon';
import { installPriors } from './priors';
import { VULGATE_FORM_PRIORS } from './priors-vulgate';

let pending: Promise<number> | undefined;

/** Resolves with the number of lexemes added (0 when already loaded). */
export function loadLatinLexicon(): Promise<number> {
  const lexicon = latinLexicon();
  if (lexicon.full) return Promise.resolve(0);
  // the Vulgate's hand-written priors come after the generated table, so a form listed in both takes the Vulgate's reading (2026-10-25); the
  // names of the Vulgate (lexicon-names-data.ts) are added after Whitaker and Lewis & Short, so a name they decline is not added twice
  pending ??= Promise.all([import('./lexicon-full-data'), import('./lexicon-ls-data'), import('./lexicon-names-data'), import('./priors-data')]).then(([m, ls, names, p]) => { installPriors(p.FORM_PRIORS + '\n' + VULGATE_FORM_PRIORS); const n = lexicon.extend(m.FULL_LEXICON); return n + lexicon.extend(ls.LS_LEXICON) + lexicon.extend(names.NAMES_LEXICON); }).catch((e: unknown) => { pending = undefined; throw e; });
  return pending;
}

/** True once the full lexicon has been added. */
export const latinLexiconLoaded = (): boolean => latinLexicon().full;
