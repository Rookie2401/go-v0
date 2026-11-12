/**
 * Pack facts for GoReview's exercises, from the language packs: the manifest (validation sentences, features,
 * constructions), the runtime (dictionary glosses fetched lazily from the asset base) and the analyser. A language whose
 * pack is not installable, or has no real analyser, yields no facts, and GoReview then builds nothing for it: it never
 * invents a gloss or a sentence.
 */
import { createFactsProvider, repositoryLookup } from '../src';
import type { AttestedFormLemma } from '../src/facts/provider';
import type { FactsProvider } from '../src';
import { createPackRuntime, packFor } from '../../language-packs/src';
import type { RepositoryApi } from '../../repository-service/src/api';
import { createHebrewShardLoader } from '../../../src/adapters/hebrew/shards';
import type { HebrewShardLoader } from '../../../src/adapters/hebrew/shards';
import { createGreekShardLoader } from '../../../src/adapters/greek/shards';
import { installGreekIndex, installedGreekIndexes, type GreekFormIndex } from '../../../src/adapters/greek/index-store';
import type { GreekShardLoader } from '../../../src/adapters/greek/shards';
import type { ShardSource } from '../../../src/adapters/shared/shards';
import { builtInAdapter } from '../../language-packs/src/runtime';
import { loadBuiltInAdapter } from '../../language-packs/src/builtins';
import { readShardBytes } from '../../../src/adapters/shared/shards';
import { createFormsSource } from '../../../src/dict/forms';

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
  const formsIndexes = new Map<string, ReturnType<typeof createFormsSource>>();
  const runtimeSourceFailures = new Map<string, number>();
  const hebrewLoaders = new Map<string, Promise<HebrewShardLoader>>();
  const greekLoaders = new Map<string, Promise<GreekShardLoader>>();
  let koineIndex: Promise<void> | undefined;
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
  const ensureGreekKoine = (): Promise<boolean> => {
    if (!koineIndex && installedGreekIndexes().some(index => index.id === 'morphgnt-sblgnt' && !index.shard)) {
      koineIndex = Promise.resolve();
      return Promise.resolve(false);
    }
    if (!koineIndex) {
      koineIndex = source.fetchBytes!('lexicon/el/koine-index.json.gz').then(readShardBytes).then((value) => {
        const index = value as Partial<GreekFormIndex>;
        if (index.schema !== 1 || index.id !== 'morphgnt-sblgnt' || index.codes !== 'morphgnt' || index.period !== 'el-koi'
          || typeof index.built !== 'string' || !index.built || !index.source?.label || !index.source.licence || !index.source.url
          || !index.forms || !index.lemmas || !index.bare)
          throw new Error('Invalid MorphGNT Koine index');
        installGreekIndex(index as GreekFormIndex);
      }).catch((error) => { koineIndex = undefined; throw error; });
      return koineIndex.then(() => true);
    }
    return koineIndex.then(() => false);
  };
  const ensureGreekKeys = async (keys: string[], period: 'ancient' | 'modern'): Promise<boolean> => {
    if (!keys.length) return false;
    const base = `lexicon/el/${period}`;
    let job = greekLoaders.get(base);
    if (!job) {
      job = createGreekShardLoader(source, { base, maxLoaded: 24 });
      greekLoaders.set(base, job);
      job.catch(() => { if (greekLoaders.get(base) === job) greekLoaders.delete(base); });
    }
    const loader = await job;
    let changed = false;
    for (let i = 0; i < keys.length; i += 8) {
      const result = await loader.ensure(keys.slice(i, i + 8));
      if (result.failed.length) throw new Error(`${base}: ${result.failed.map((x) => x[1]).join(', ')}`);
      if (result.loaded.length) changed = true;
    }
    return changed;
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
      const keys = manifest.validation.flatMap((item) => builtInAdapter('he')!.tokenize(item.sentence ?? item.surface)
        .filter((t) => t.isWord).map((t) => t.normalized));
      pending = ensureHebrewKeys(keys);
      hebrewSentencesReady.set(manifest.version, pending);
      pending.catch(() => { if (hebrewSentencesReady.get(manifest.version) === pending) hebrewSentencesReady.delete(manifest.version); });
    }
    return pending;
  };
  const hebrewUnitKeys = (unitId: string): string[] => {
    if (unitId.startsWith('form:he:')) return builtInAdapter('he')!.tokenize(unitId.slice('form:he:'.length)).filter((t) => t.isWord).map((t) => t.normalized);
    if (unitId.startsWith('lemma:he:')) {
      const body = unitId.slice('lemma:he:'.length);
      const split = body.lastIndexOf(':');
      return builtInAdapter('he')!.tokenize(split < 0 ? body : body.slice(0, split)).filter((t) => t.isWord).map((t) => t.normalized);
    }
    return [];
  };
  const ensureGreekFor = async (unitIds: string[], varietyId?: string): Promise<boolean> => {
    const keys = unitIds.flatMap(greekUnitKeys);
    if (varietyId === 'el-koi') return ensureGreekKoine();
    const body = unitIds.find(id => id.startsWith('form:el:') || id.startsWith('lemma:el:'))?.replace(/^(?:form|lemma):el:/u, '').replace(/:[A-Z]+$/u, '') ?? '';
    const period = varietyId === 'el-mod' ? 'modern' : varietyId === 'el-att' || varietyId === 'el-hom'
      ? 'ancient' : /[\u0313-\u0345]/u.test(body.normalize('NFD')) ? 'ancient' : 'modern';
    return ensureGreekKeys(keys, period);
  };
  const greekUnitKeys = (unitId: string): string[] => {
    if (unitId.startsWith('form:el:')) return builtInAdapter('el')!.tokenize(unitId.slice('form:el:'.length)).filter((t) => t.isWord).map((t) => t.normalized);
    if (unitId.startsWith('lemma:el:')) {
      const body = unitId.slice('lemma:el:'.length);
      const split = body.lastIndexOf(':');
      return builtInAdapter('el')!.tokenize(split < 0 ? body : body.slice(0, split)).filter((t) => t.isWord).map((t) => t.normalized);
    }
    return [];
  };
  type Provider = FactsProvider & { prime(unitIds: string[], varietyId?: string): Promise<void>; clearPrime(): void };
  const providerFor = (languageId: string, api: RepositoryApi, manifest: NonNullable<ReturnType<typeof packFor>>): Provider | undefined => {
    let runtime = runtimes.get(languageId);
    if (!runtime) {
      const trackedFetch: typeof fetch = async (input, init) => {
        try {
          const response = await opts.fetch(input, init);
          if (!response.ok) runtimeSourceFailures.set(languageId, (runtimeSourceFailures.get(languageId) ?? 0) + 1);
          return response;
        } catch (error) { runtimeSourceFailures.set(languageId, (runtimeSourceFailures.get(languageId) ?? 0) + 1); throw error; }
      };
      runtime = createPackRuntime(manifest, { fetch: trackedFetch, baseUrl: opts.baseUrl });
      runtimes.set(languageId, runtime);
    }
    let attestedFormLemma: ((form: string) => Promise<AttestedFormLemma | undefined>) | undefined;
    if (languageId === 'de') {
      let formIndex = formsIndexes.get(languageId);
      if (!formIndex) {
        const dictionaryPath = manifest.lexical.dictionary?.baseUrl ?? 'dict/de';
        const root = dictionaryPath.replace(/\/?de\/?$/u, '');
        formIndex = createFormsSource('de', { fetch: opts.fetch, base: `${opts.baseUrl.replace(/\/+$/u, '')}${root ? `/${root.replace(/^\/+|\/+$/gu, '')}` : ''}`, throwOnError: true });
        formsIndexes.set(languageId, formIndex);
      }
      attestedFormLemma = async form => {
        const rows = await formIndex!.lookupForms([form]);
        const hits = rows.get(form) ?? [];
        const identities = new Map(hits.map(hit => [`${hit.lemma}\0${hit.pos ?? ''}`, hit]));
        if (identities.size === 1) return [...identities.values()][0];
        if (identities.size > 1) return { status: 'ambiguous', reason: 'The German forms index records several different lemma readings for this form.' };
        return undefined;
      };
    }
    const adapter = runtime.analyzer().adapter;
    if (!adapter) return undefined;
    // one facts provider per target variety: a period (Biblical Hebrew, Koine Greek) reads the pack's sentences in that period and
    // prefers its examples; the plain provider serves a learner with no variety and every language without period varieties
    const unit = repositoryLookup(api);
    const plain = createFactsProvider({ unit, pack: { manifest, runtime, ...(attestedFormLemma ? { attestedFormLemma } : {}) }, adapter,
      sourceFailureCount: () => runtimeSourceFailures.get(languageId) ?? 0 });
    const byVariety = new Map<string, ReturnType<typeof createFactsProvider>>();
    const forVariety = (varietyId?: string): ReturnType<typeof createFactsProvider> => {
      if (!varietyId || adapter.varieties?.[varietyId]?.kind !== 'period') return plain;
      let p = byVariety.get(varietyId);
      if (!p) { p = createFactsProvider({ unit, pack: { manifest, runtime, ...(attestedFormLemma ? { attestedFormLemma } : {}) }, adapter, varietyId,
        sourceFailureCount: () => runtimeSourceFailures.get(languageId) ?? 0 }); byVariety.set(varietyId, p); }
      return p;
    };
    const clearGreekSentenceCaches = (): void => { plain.clearSentenceCache(); byVariety.forEach(provider => provider.clearSentenceCache()); };
    return {
      prime: async (unitIds: string[], varietyId?: string) => {
        if (languageId === 'he' && unitIds.some((id) => id.startsWith('form:he:'))) {
          await ensureHebrewSentenceSet(manifest);
          await ensureHebrewKeys(unitIds.flatMap(hebrewUnitKeys));
          await ensureHebrewFrequency();
        }
        if (languageId === 'el') {
          if (await ensureGreekFor(unitIds, varietyId ?? manifest.varietyId)) clearGreekSentenceCaches();
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
        if (languageId === 'el' && requestedLanguage === 'el') {
          try {
            if (await ensureGreekFor([unitId], varietyId ?? manifest.varietyId)) clearGreekSentenceCaches();
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
    } as Provider;
  };
  return (languageId, api) => {
    const manifest = packFor(languageId);
    if (!manifest || manifest.status !== 'installable') return undefined;
    // the analyser is already here (the full build links every one; the review build once the language has been used): as always
    if (builtInAdapter(languageId)) return providerFor(languageId, api, manifest);
    // not yet: the provider exists at once, the language's analyser chunk is fetched the first time it is used (once, kept); a failed
    // fetch rejects with AdapterLoadError, which the exercise readiness and session build report as a retryable problem, and the next call tries again
    let built: Provider | undefined;
    let pending: Promise<Provider | undefined> | undefined;
    const ready = (): Promise<Provider | undefined> => {
      if (!pending) {
        pending = loadBuiltInAdapter(languageId).then((adapter) => (adapter ? (built = providerFor(languageId, api, manifest)) : undefined));
        pending.catch(() => { pending = undefined; });
      }
      return pending;
    };
    return {
      prime: async (unitIds: string[], varietyId?: string) => { await (await ready())?.prime(unitIds, varietyId); },
      clearPrime: () => built?.clearPrime(),
      factsFor: async (unitId, requestedLanguage, varietyId) => (await ready())?.factsFor(unitId, requestedLanguage, varietyId),
    } as Provider;
  };
}
