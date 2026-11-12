// @vitest-environment jsdom
/**
 * GoReview's start-up work (2026-11-11, the owner: "the loading is so inconsistent and unstable").
 *
 * The review and web builds replace packages/language-packs/src/builtins.ts (all ten adapters linked in, every lexicon built at load) with
 * packages/goreview/app/leanBuiltins.ts: each language's adapter is its own chunk, fetched the first time that language is needed. This file
 * runs the app's start modules with that replacement (the same swap the build makes) and checks:
 *   (a) importing the start modules builds no language's lexicon; asking for one language builds only that one;
 *   (b) every analysis is identical to the one the full registry gave before the change (golden file, recorded from the adapters' own output);
 *   (c) a chunk that cannot be fetched is reported with a retryable message (and the next call tries again, nothing is remembered).
 * Bundle sizes are measured by scripts/loadcheck/goreview/bundle-report.vite.config.mjs, not here (a build is too slow for a unit test).
 *
 * Re-record the golden file (only after a deliberate change to an adapter or a pack's sentences): GOREVIEW_RECORD=1 npx vitest run test/loading/goreview.startup.test.ts
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// the swap the review build makes (vite.config.ts, plugin goreview-lean-builtins)
vi.mock('../../packages/language-packs/src/builtins', () => import('../../packages/goreview/app/leanBuiltins'));

const GOLDEN = path.resolve(process.cwd(), 'test/loading/goreview.startup.golden.json');
const LANGS = ['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn', 'la', 'he', 'el'] as const;

type Golden = Record<string, Array<{ text: string; summary: string; sha256: string }>>;

/** The fixed analyses: every sentence the language's pack validates, plus one word no list knows. */
async function sentencesOf(lang: string): Promise<string[]> {
  const { PACKS } = await import('../../packages/language-packs/src/registry');
  const pack = PACKS[lang]!;
  return [...pack.validation.map((v) => v.sentence ?? v.surface), 'Xyzqwk'];
}

/** What a language's adapter says about a text, hashed whole (any difference in any reading changes it) and summarised (so a failure reads). */
function analyse(adapter: import('../../src/core').LanguageAdapter, text: string): { text: string; summary: string; sha256: string } {
  const tokens = adapter.tokenize(text);
  const analysed = adapter.analyze(tokens);
  const phrases = adapter.detectPhrases ? adapter.detectPhrases(tokens, analysed) : [];
  const json = JSON.stringify({ tokens, analysed, phrases });
  const summary = analysed.filter((a) => a.token.isWord).map((a) => `${a.token.normalized}=${a.candidates[0]?.lemma ?? '?'}/${a.candidates[0]?.pos ?? '?'}`).join(' ');
  return { text, summary, sha256: crypto.createHash('sha256').update(json).digest('hex') };
}

describe('GoReview start-up: nothing of a language is built until it is asked for', () => {
  it('importing the start modules evaluates no adapter and builds no lexicon', async () => {
    const { lexiconStats } = await import('../../src/adapters/shared');
    const lean = await import('../../packages/goreview/app/leanBuiltins');
    expect(lexiconStats.constructed).toBe(0);
    // the whole start graph: the app entry, the facts and engine, the pack framework, the exercise builders
    await import('../../packages/goreview/app/main');
    await import('../../packages/goreview/app/packFacts');
    await import('../../packages/goreview/app/engine');
    await import('../../packages/goreview/app/tellEngine');
    await import('../../packages/language-packs/src');
    await import('../../packages/goreview/src');
    expect(lean.loadedAdapterLanguages()).toEqual([]);
    expect(lexiconStats.constructed).toBe(0);
    const { builtInAdapter } = await import('../../packages/language-packs/src/runtime');
    for (const lang of LANGS) expect(builtInAdapter(lang), lang).toBeUndefined();
  });

  it('the pack manifests, the catalogue and the capability reports are listed without loading a single adapter', async () => {
    const { lexiconStats } = await import('../../src/adapters/shared');
    const { loadedAdapterLanguages } = await import('../../packages/goreview/app/leanBuiltins');
    const { PACKS, albanianManifest } = await import('../../packages/language-packs/src');
    expect(Object.keys(PACKS).sort()).toEqual([...LANGS].sort());
    expect(albanianManifest().analyzer.version).toBe('9');
    expect(loadedAdapterLanguages()).toEqual([]);
    expect(lexiconStats.constructed).toBe(0);
  });

  it('the Albanian pack constants are the adapter\'s own version and capabilities', async () => {
    const { sqAdapter } = await import('../../src/adapters/sq');
    const { SQ_VERSION, SQ_CAPABILITIES } = await import('../../packages/language-packs/src/packs/sq');
    const s = sqAdapter.support;
    const caps: string[] = [];
    if (s.tokenization !== 'none') caps.push('tokenization');
    if (s.sentenceSegmentation !== 'none') caps.push('sentence-segmentation');
    if (s.lemmatization !== 'none') caps.push('lemma');
    if (s.morphology !== 'none') caps.push('morphology');
    if (s.phraseDetection !== 'none') caps.push('phrases');
    caps.push('constructions', 'pronunciation-notes');
    if (s.productionChecks !== 'none') caps.push('production-checks');
    expect(SQ_VERSION).toBe(String(sqAdapter.version));
    expect([...SQ_CAPABILITIES]).toEqual(caps);
  });

  it('asking for one language loads and builds that language only; the facts provider asks when it is first used, once', async () => {
    const { lexiconStats } = await import('../../src/adapters/shared');
    const lean = await import('../../packages/goreview/app/leanBuiltins');
    const { packFactsFor } = await import('../../packages/goreview/app/packFacts');
    const provider = packFactsFor({ fetch: (async () => { throw new Error('offline'); }) as typeof fetch, baseUrl: './' })('es', {} as never);
    // the provider exists at once and has loaded nothing
    expect(provider).toBeDefined();
    expect(lean.loadedAdapterLanguages()).toEqual([]);
    expect(lexiconStats.constructed).toBe(0);
    await (provider as unknown as { prime(ids: string[]): Promise<void> }).prime([]);
    expect(lean.loadedAdapterLanguages()).toEqual(['es']);
    const afterSpanish = lexiconStats.constructed;
    expect(afterSpanish).toBeGreaterThan(0);
    // asking again, and asking for the same language through the loader, fetches and builds nothing more
    await Promise.all([lean.loadBuiltInAdapter('es'), lean.loadBuiltInAdapter('es')]);
    expect(lexiconStats.constructed).toBe(afterSpanish);
    // another language adds its own and only its own
    await lean.loadBuiltInAdapter('hi');
    expect(lean.loadedAdapterLanguages()).toEqual(['es', 'hi']);
    expect(lexiconStats.constructed).toBeGreaterThan(afterSpanish);
    for (const other of ['th', 'nb', 'nn', 'he', 'el', 'de', 'la', 'sq']) expect(lean.loadedAdapterLanguages()).not.toContain(other);
  });
});

describe('GoReview start-up: analyses are identical to the full registry\'s', () => {
  it('every language, through the on-demand loader and through the full registry, matches the golden file', async () => {
    const { createAdapterRegistry } = await import('../../src/adapters');
    const lean = await import('../../packages/goreview/app/leanBuiltins');
    const registry = createAdapterRegistry();
    const record = process.env.GOREVIEW_RECORD === '1';
    const golden: Golden = record ? {} : JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
    for (const lang of LANGS) {
      const texts = await sentencesOf(lang);
      const fromFull = texts.map((t) => analyse(registry.get(lang), t));
      const loaded = await lean.loadBuiltInAdapter(lang);
      expect(loaded, lang).toBeDefined();
      const fromLean = texts.map((t) => analyse(loaded!, t));
      expect(fromLean, `${lang}: on-demand adapter`).toEqual(fromFull);
      if (record) golden[lang] = fromFull;
      else expect(fromFull, `${lang}: against the golden file`).toEqual(golden[lang]);
    }
    if (record) fs.writeFileSync(GOLDEN, JSON.stringify(golden, null, 1) + '\n');
    expect(Object.keys(golden).sort()).toEqual([...LANGS].sort());
  });
});

describe('GoReview start-up: a language chunk that cannot be fetched', () => {
  it('rejects with a retryable, readable error, remembers nothing, and loads on the next call', async () => {
    vi.resetModules();
    vi.doMock('../../src/adapters/th', () => { throw new Error('Failed to fetch dynamically imported module'); });
    const lean = await import('../../packages/goreview/app/leanBuiltins');
    const { AdapterLoadError } = await import('../../packages/language-packs/src/adapterLoadError');
    const failure = await lean.loadBuiltInAdapter('th').then(() => undefined, (e: unknown) => e);
    expect(failure).toBeInstanceOf(AdapterLoadError);
    expect((failure as InstanceType<typeof AdapterLoadError>).retryable).toBe(true);
    expect((failure as Error).message).toMatch(/could not be loaded.*Check your connection, then try again/);
    expect(lean.builtInAdapter('th')).toBeUndefined();
    expect(lean.loadedAdapterLanguages()).not.toContain('th');
    vi.doUnmock('../../src/adapters/th');
    vi.resetModules();
    const again = await import('../../packages/goreview/app/leanBuiltins');
    expect((await again.loadBuiltInAdapter('th'))?.version).toBeDefined();
    expect(again.builtInAdapter('th')).toBeDefined();
  });

  it('the exercise readiness check reports it as retryable with the same message, and passes once the chunk loads', async () => {
    vi.resetModules();
    vi.doMock('../../src/adapters/nb', () => { throw new Error('Failed to fetch dynamically imported module'); });
    // a fresh copy of the swapped module (the one the file-level mock made has already loaded every language)
    vi.doMock('../../packages/language-packs/src/builtins', () => import('../../packages/goreview/app/leanBuiltins'));
    const { packFactsFor } = await import('../../packages/goreview/app/packFacts');
    const { createReviewEngine } = await import('../../packages/goreview/app/engine');
    const { registry, evidenceFor, ratingFor } = await import('../../packages/goreview/src');
    const engine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, factsFor: packFactsFor({ fetch: (async () => { throw new Error('offline'); }) as typeof fetch, baseUrl: './' }) });
    const api = {} as never;
    const request = { api, languageId: 'nb', unitId: 'lemma:nb:hus:NOUN', unitKind: 'lemma', family: 'written-recognition', dimension: 'recognition', now: '2026-11-11T00:00:00.000Z' } as never;
    const failed = await engine.exerciseReadiness!(request);
    expect(failed.available, JSON.stringify(failed)).toBe(false);
    expect(failed.retryable, JSON.stringify(failed)).toBe(true);
    expect(failed.reason).toMatch(/could not be loaded.*Check your connection, then try again/);
    vi.doUnmock('../../src/adapters/nb');
    vi.resetModules();
    const { loadBuiltInAdapter } = await import('../../packages/goreview/app/leanBuiltins');
    expect(await loadBuiltInAdapter('nb')).toBeDefined();
  });
});

describe('GoReview start-up: the service worker keeps a language chunk once it was used', () => {
  const sw = fs.readFileSync(path.resolve(process.cwd(), 'packages/goreview/app/public/sw.js'), 'utf8');
  const config = fs.readFileSync(path.resolve(process.cwd(), 'packages/goreview/app/vite.config.ts'), 'utf8');

  it('language chunks are cached on demand in a build-versioned cache that a new build drops, and are left out of the precache list', () => {
    const SOURCE = String.raw`^assets\/lang-[a-z]+-[^/]+\.js$`;
    expect(sw, 'the worker answers a language chunk from the on-demand cache').toContain(`if (/${SOURCE}/.test(rel)) { event.respondWith(dictOnDemand(request, LANG_CACHE)); return; }`);
    const pattern = new RegExp(SOURCE);
    expect(pattern.test('assets/lang-he-CYZpbMfh.js')).toBe(true);
    expect(pattern.test('assets/lang-norwegian-CabqaPX8.js')).toBe(true);
    expect(pattern.test('assets/index-AI32qBV9.js')).toBe(false);
    expect(sw).toContain('var LANG_CACHE = LANG_PREFIX + BUILD_ID;');
    expect(sw).toContain('k.indexOf(LANG_PREFIX) === 0 && k !== LANG_CACHE');
    // the build leaves exactly these files out of the precache list (the same pattern)
    expect(config).toContain('!LANG_CHUNK.test(rel)');
    expect(config).toContain(`const LANG_CHUNK = /${SOURCE}/;`);
  });
});
