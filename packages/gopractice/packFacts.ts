/**
 * Pack facts for GoReview's exercises, from the language packs: the manifest (validation sentences, features,
 * constructions), the runtime (dictionary glosses fetched lazily from the asset base) and the analyser. A language whose
 * pack is not installable, or has no real analyser, yields no facts, and GoReview then builds nothing for it: it never
 * invents a gloss or a sentence.
 */
import { createFactsProvider, repositoryLookup } from '../goreview/src';
import type { FactsProvider } from '../goreview/src';
import { createPackRuntime, packFor } from '../language-packs/src';
import type { RepositoryApi } from '../repository-service/src/api';

export function packFactsFor(opts: { fetch: typeof fetch; baseUrl: string }): (languageId: string, api: RepositoryApi) => FactsProvider | undefined {
  const runtimes = new Map<string, ReturnType<typeof createPackRuntime>>();
  return (languageId, api) => {
    const manifest = packFor(languageId);
    if (!manifest || manifest.status !== 'installable') return undefined;
    let runtime = runtimes.get(languageId);
    if (!runtime) { runtime = createPackRuntime(manifest, { fetch: opts.fetch, baseUrl: opts.baseUrl }); runtimes.set(languageId, runtime); }
    const adapter = runtime.analyzer().adapter;
    if (!adapter) return undefined;
    return createFactsProvider({ unit: repositoryLookup(api), pack: { manifest, runtime }, adapter });
  };
}
