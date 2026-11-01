/**
 * Pack facts for GoReview's exercises, from the language packs: the manifest (validation sentences, features,
 * constructions), the runtime (dictionary glosses fetched lazily from the asset base) and the analyser. A language whose
 * pack is not installable, or has no real analyser, yields no facts, and GoReview then builds nothing for it: it never
 * invents a gloss or a sentence.
 */
import { createFactsProvider, repositoryLookup } from '../src';
import type { FactsProvider } from '../src';
import { createPackRuntime, packFor } from '../../language-packs/src';
import type { RepositoryApi } from '../../repository-service/src/api';
import { createHebrewShardLoader } from '../../../src/adapters/hebrew/shards';
import type { HebrewShardLoader } from '../../../src/adapters/hebrew/shards';
import type { ShardSource } from '../../../src/adapters/shared/shards';
import { heAdapter } from '../../../src/adapters/he';
import { readShardBytes } from '../../../src/adapters/shared/shards';

interface HebrewFormFrequencyIndex {
  schema: 1;
  id: 'oshb-tanakh-form-frequency';
  indexId: 'oshb-tanakh';
  source: { label: string; licence: string; url: string; retrieved: string; note: string };
  built: string;
  forms: Record<string, { rank: number; count: number }>;
}

export function packFactsFor(opts: { fetch: typeof fetch; baseUrl: string; lexiconBaseUrl?: string }): (languageId: string, api: RepositoryApi) => FactsProvider | undefined {
  const runtimes = new Map<string, ReturnType<typeof createPackRuntime>>();
  const hebrewLoaders = new Map<string, Promise<HebrewShardLoader>>();
  let hebrewFrequency: Promise<HebrewFormFrequencyIndex> | undefined;
  const lexiconBase = opts.lexiconBaseUrl ?? opts.baseUrl;
  const source: ShardSource = {
    async fetchJson(path) { const r = await opts.fetch(`${lexiconBase}${path}`); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); },
    async fetchBytes(path) { const r = await opts.fetch(`${lexiconBase}${path}`); if (!r.ok) throw new Error(`${path}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); },
  };
  const ensureHebrewKeys = async (keys: string[]): Promise<void> => {
    if (!keys.length) return;
    await Promise.all(['biblical', 'modern'].map(async (period) => {
      const base = `lexicon/he/${period}`;
      let job = hebrewLoaders.get(base);
      if (!job) {
        job = createHebrewShardLoader(source, { base, maxLoaded: 24 });
        hebrewLoaders.set(base, job);
        job.catch(() => { if (hebrewLoaders.get(base) === job) hebrewLoaders.delete(base); });
      }
      const loader = await job;
      // ensure reports per-shard failures and remains retryable; a transient miss must not poison this unit or loader.
      const result = await loader.ensure(keys);
      if (result.failed.length) throw new Error(`${base}: ${result.failed.map((x) => x[1]).join(', ')}`);
    }));
  };
  const ensureHebrewFrequency = (): Promise<HebrewFormFrequencyIndex> => {
    if (!hebrewFrequency) {
      hebrewFrequency = source.fetchBytes!('lexicon/he/biblical/form-frequency.json.gz')
        .then(readShardBytes)
        .then((value) => {
          if (!value || typeof value !== 'object') throw new Error('Invalid OSHB form-frequency index');
          const index = value as Partial<HebrewFormFrequencyIndex>;
          if (index.schema !== 1 || index.id !== 'oshb-tanakh-form-frequency' || index.indexId !== 'oshb-tanakh'
            || !index.source || typeof index.source !== 'object' || typeof index.source.label !== 'string'
            || typeof index.source.licence !== 'string' || typeof index.source.url !== 'string'
            || typeof index.source.retrieved !== 'string' || typeof index.source.note !== 'string'
            || typeof index.built !== 'string' || !index.built
            || !index.forms || typeof index.forms !== 'object' || Array.isArray(index.forms)) throw new Error('Invalid OSHB form-frequency index');
          return index as HebrewFormFrequencyIndex;
        })
        .catch((error) => { hebrewFrequency = undefined; throw error; });
    }
    return hebrewFrequency;
  };
  const hebrewSentencesReady = new Map<string, Promise<void>>();
  const ensureHebrewSentenceSet = (manifest: NonNullable<ReturnType<typeof packFor>>): Promise<void> => {
    let pending = hebrewSentencesReady.get(manifest.version);
    if (!pending) {
      const keys = manifest.validation.flatMap((item) => heAdapter.tokenize(item.sentence ?? item.surface)
        .filter((t) => t.isWord).map((t) => t.normalized));
      pending = ensureHebrewKeys(keys);
      hebrewSentencesReady.set(manifest.version, pending);
      pending.catch(() => { if (hebrewSentencesReady.get(manifest.version) === pending) hebrewSentencesReady.delete(manifest.version); });
    }
    return pending;
  };
  const hebrewUnitKeys = (unitId: string): string[] => {
    if (unitId.startsWith('form:he:')) return heAdapter.tokenize(unitId.slice('form:he:'.length)).filter((t) => t.isWord).map((t) => t.normalized);
    if (unitId.startsWith('lemma:he:')) {
      const body = unitId.slice('lemma:he:'.length);
      const split = body.lastIndexOf(':');
      return heAdapter.tokenize(split < 0 ? body : body.slice(0, split)).filter((t) => t.isWord).map((t) => t.normalized);
    }
    return [];
  };
  return (languageId, api) => {
    const manifest = packFor(languageId);
    if (!manifest || manifest.status !== 'installable') return undefined;
    let runtime = runtimes.get(languageId);
    if (!runtime) { runtime = createPackRuntime(manifest, { fetch: opts.fetch, baseUrl: opts.baseUrl }); runtimes.set(languageId, runtime); }
    const adapter = runtime.analyzer().adapter;
    if (!adapter) return undefined;
    // one facts provider per target variety: a period (Biblical Hebrew, Koine Greek) reads the pack's sentences in that period and
    // prefers its examples; the plain provider serves a learner with no variety and every language without period varieties
    const unit = repositoryLookup(api);
    const plain = createFactsProvider({ unit, pack: { manifest, runtime }, adapter });
    const byVariety = new Map<string, ReturnType<typeof createFactsProvider>>();
    const forVariety = (varietyId?: string): ReturnType<typeof createFactsProvider> => {
      if (!varietyId || adapter.varieties?.[varietyId]?.kind !== 'period') return plain;
      let p = byVariety.get(varietyId);
      if (!p) { p = createFactsProvider({ unit, pack: { manifest, runtime }, adapter, varietyId }); byVariety.set(varietyId, p); }
      return p;
    };
    return {
      prime: async (unitIds: string[]) => {
        if (languageId === 'he' && unitIds.some((id) => id.startsWith('form:he:'))) {
          await ensureHebrewSentenceSet(manifest);
          await ensureHebrewKeys(unitIds.flatMap(hebrewUnitKeys));
          await ensureHebrewFrequency();
        }
        // Start the Repository snapshot's consume window after remote pack assets load.
        await plain.prime(unitIds);
      },
      clearPrime: () => plain.clearPrime?.(),
      factsFor: async (unitId, requestedLanguage, varietyId) => {
        if (languageId === 'he' && requestedLanguage === 'he') {
          try {
            // Do every asset operation before entering createFactsProvider: it catches unit/analyser failures by design,
            // so an installation error there could otherwise build and retain a core-only sentence cache.
            await ensureHebrewSentenceSet(manifest);
            await ensureHebrewKeys(hebrewUnitKeys(unitId));
          } catch { return undefined; }
        }
        const facts = await forVariety(varietyId).factsFor(unitId, requestedLanguage, varietyId);
        if (!facts || languageId !== 'he' || requestedLanguage !== 'he' || !unitId.startsWith('form:he:')
          || !facts.unit.provenance.ref?.startsWith('goreview-facts:pack-derived@') || facts.unit.frequency) return facts;
        try {
          const index = await ensureHebrewFrequency();
          // Frequency belongs to the exact Biblical Hebrew form key. Never copy a lemma
          // rank or normalize an unpointed surface into a different attested form.
          const exactForm = unitId.slice('form:he:'.length);
          if (facts.unit.label !== exactForm) return facts;
          const frequency = index.forms[exactForm];
          if (!frequency || !Number.isInteger(frequency.rank) || frequency.rank < 1
            || !Number.isInteger(frequency.count) || frequency.count < 1) return facts;
          return { ...facts, unit: { ...facts.unit, frequency: {
            rank: frequency.rank, source: 'Open Scriptures Hebrew Bible — attested Hebrew form frequency',
          } } };
        } catch { return undefined; }
      },
    } as FactsProvider & { prime(unitIds: string[]): Promise<void>; clearPrime(): void };
  };
}
