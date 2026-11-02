// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import { createReviewEngine } from '../../packages/goreview/app/engine';
import { evidenceFor, ratingFor, registry } from '../../packages/goreview/src';
import { writtenRecognition } from '../../packages/goreview/src/exercises/written-recognition';
import { createFactsProvider } from '../../packages/goreview/src/facts/provider';
import { packFor } from '../../packages/language-packs/src';
import type { RepositoryApi } from '../../packages/repository-service/src/api';
import type { ReviewFacts } from '../../packages/goreview/src/facts/review-facts';
import { installGreekIndex, resetGreekIndexes } from '../../src/adapters/greek/index-store';
import { KOINE_CORE } from '../../src/adapters/greek/generated/koine-core';
import type { AnalysisCandidate } from '../../src/core';

const assetRequests: string[] = [];
const fetchAssets = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  assetRequests.push(url.pathname);
  if (url.pathname === '/lexicon/el/koine-index.json.gz') {
    const source = path.join(path.resolve(__dirname, '../../public'), 'lexicon/el/koine-index.json');
    return new Response(gzipSync(fs.readFileSync(source)));
  }
  if (/^\/dict\/[^/]+\/manifest\.json$/u.test(url.pathname)) {
    const file = path.join(path.resolve(__dirname, '../../public'), decodeURIComponent(url.pathname));
    if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    return new Response(JSON.stringify({ ...manifest, hasFrequency: false }));
  }
  if (/\/frequency\.json$/u.test(url.pathname)) return new Response('not found', { status: 404 });
  const file = path.join(path.resolve(__dirname, '../../public'), decodeURIComponent(url.pathname));
  return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
}) as typeof fetch;
const api = { async unit() { return { ok: false, status: 404, error: 'not-found', message: 'missing', body: {} }; } } as unknown as RepositoryApi;
const greekSurface = 'ἐγέννησεν';
beforeEach(() => { resetGreekIndexes(); installGreekIndex(KOINE_CORE); assetRequests.length = 0; });

describe('separate lexical base-meaning recognition', () => {
  it('keeps a Greek inflected form, never its lemma, in the prompt and leaves its inflected meaning unclaimed', async () => {
    const provider = packFactsFor({ fetch: fetchAssets, baseUrl: 'http://assets.local/' })('el', api)!;
    const facts = await provider.factsFor(`form:el:${greekSurface}`, 'el', 'el-koi') as ReviewFacts | undefined;
    expect(facts?.lexicalRecognition).toMatchObject({ status: 'verified', evidence: 'attested-form-reading', lemma: 'γεννάω' });
    expect(facts?.glosses).toEqual([]);
    expect(facts?.wordAnalysis?.inflectedMeaning).toBeNull();
    expect(facts?.relations).toContainEqual(expect.objectContaining({ fromId: `form:el:${greekSurface}`, relation: 'form-of', toId: 'lemma:el:γεννάω:VERB', status: 'high-confidence' }));
    const built = await writtenRecognition.build({ unitId: `form:el:${greekSurface}`, unitKind: 'form', languageId: 'el', varietyId: 'el-koi', dimension: 'written-recognition' }, facts!, { now: '2026-11-01T00:00:00.000Z', random: () => 0 });
    expect('unavailable' in built ? built.reason : built.prompt.instruction).toContain('base meaning');
    if ('unavailable' in built) return;
    expect(built.prompt.stimulusText).toBe('ἐγέννησεν');
      expect(JSON.stringify(built.prompt)).not.toContain('γεννάω');
    const withContext: ReviewFacts = { ...facts!, exampleSentences: [{ text: `${greekSurface} was recorded.`, source: 'pack-validation', surface: greekSurface, start: 0, end: greekSurface.length }],
      exampleReadings: [{ surface: greekSurface, lemma: 'γεννάω', pos: 'VERB', features: {}, status: 'provisional' }] };
    const contextualBuild = await writtenRecognition.build({ unitId: `form:el:${greekSurface}`, unitKind: 'form', languageId: 'el', varietyId: 'el-koi', dimension: 'written-recognition' }, withContext, { now: '2026-11-01T00:00:00.000Z', random: () => 0 });
    if (!('unavailable' in contextualBuild)) {
      expect(contextualBuild.prompt.instruction).toContain('base meaning');
      expect(contextualBuild.prompt.stimulusText).toBe(greekSurface);
      expect(contextualBuild).not.toHaveProperty('context');
    }
    expect(built.answerKey.explanation).toContain('γεννάω');
    expect(built.answerKey.explanation).toContain('inflected or contextual meaning was not assessed');
    expect(built.builtFrom.facts).toContain('meaning:lexical-base');
    expect(writtenRecognition.grade(built, { typed: 'bring forth', hinted: false, assistance: [] }, { now: '2026-11-01T00:00:00.000Z' }).outcome).toBe('correct');
    expect(writtenRecognition.grade(built, { typed: 'nonsense', hinted: false, assistance: [] }, { now: '2026-11-01T00:00:00.000Z' }).outcome).toBe('incorrect');
    for (const surface of ['βαβυλῶνος', 'χριστοῦ']) {
      const sample = await provider.factsFor(`form:el:${surface}`, 'el', 'el-koi') as ReviewFacts | undefined;
      expect(sample?.lexicalRecognition?.status, surface).toBe('verified');
      expect(sample?.wordAnalysis?.inflectedMeaning, surface).toBeNull();
    }
    const pronoun = await provider.factsFor('form:el:αὐτοῦ', 'el', 'el-koi') as ReviewFacts | undefined;
    expect(pronoun?.lexicalRecognition).toMatchObject({ status: 'withheld', reason: expect.stringContaining('one Greek lemma and part of speech') });
    const subjectPronoun = await provider.factsFor('form:el:ἐγώ', 'el', 'el-koi') as ReviewFacts | undefined;
    expect(subjectPronoun?.lexicalRecognition?.status).toBe('verified');
    const pronounBuild = await writtenRecognition.build({ unitId: 'form:el:ἐγώ', unitKind: 'form', languageId: 'el', varietyId: 'el-koi', dimension: 'written-recognition' }, subjectPronoun!, { now: '2026-11-01T00:00:00.000Z', random: () => 0 });
    if (!('unavailable' in pronounBuild)) expect(writtenRecognition.grade(pronounBuild, { typed: 'I', hinted: false, assistance: [] }, { now: '2026-11-01T00:00:00.000Z' }).outcome).toBe('correct');
    const article = await provider.factsFor('form:el:ὁ', 'el', 'el-koi') as ReviewFacts | undefined;
    const articleBuild = await writtenRecognition.build({ unitId: 'form:el:ὁ', unitKind: 'form', languageId: 'el', varietyId: 'el-koi', dimension: 'written-recognition' }, article!, { now: '2026-11-01T00:00:00.000Z', random: () => 0 });
    if (!('unavailable' in articleBuild)) {
      expect(articleBuild.answerKey.accepted).toContain('the');
      expect(writtenRecognition.grade(articleBuild, { typed: 'the', hinted: false, assistance: [] }, { now: '2026-11-01T00:00:00.000Z' }).outcome).toBe('correct');
      expect(writtenRecognition.grade(articleBuild, { typed: '', hinted: false, assistance: [] }, { now: '2026-11-01T00:00:00.000Z' }).outcome).toBe('unable-to-grade');
    }
  });

  it('uses only a unique attested German forms-index link and dictionary headword meaning', async () => {
    const provider = packFactsFor({ fetch: fetchAssets, baseUrl: 'http://assets.local/' })('de', api)!;
    const herankam = await provider.factsFor('form:de:herankam', 'de') as ReviewFacts | undefined;
    expect(herankam?.lexicalRecognition).toMatchObject({ status: 'verified', lemma: 'herankommen', evidence: 'attested-form-reading' });
    expect(herankam?.glosses).toEqual([]);
    expect(herankam?.lexicalRecognition?.attribution).toContain('Wiktionary');
    expect(herankam?.relations).toContainEqual(expect.objectContaining({ fromId: 'form:de:herankam', relation: 'form-of', toId: 'lemma:de:herankommen:VERB', status: 'high-confidence' }));
    const built = await writtenRecognition.build({ unitId: 'form:de:herankam', unitKind: 'form', languageId: 'de', varietyId: 'de-DE', dimension: 'written-recognition' }, herankam!, { now: '2026-11-01T00:00:00.000Z', random: () => 0 });
    expect('unavailable' in built ? built.reason : built.prompt.instruction).toContain('base meaning');
    if (!('unavailable' in built)) {
      expect(built.prompt.stimulusText).toBe('herankam');
      expect(JSON.stringify(built.prompt)).not.toContain('herankommen');
      expect(built.answerKey.explanation).toContain('herankommen');
      expect(writtenRecognition.grade(built, { typed: 'to approach', hinted: false, assistance: [] }, { now: '2026-11-01T00:00:00.000Z' }).outcome).toBe('correct');
      expect(writtenRecognition.grade(built, { typed: '', hinted: false, assistance: [] }, { now: '2026-11-01T00:00:00.000Z' }).outcome).toBe('unable-to-grade');
    }
    const dem = await provider.factsFor('form:de:dem', 'de') as ReviewFacts | undefined;
    const die = await provider.factsFor('form:de:die', 'de') as ReviewFacts | undefined;
    for (const facts of [dem, die]) {
      if (facts?.lexicalRecognition?.status === 'verified') {
        expect(facts.glosses).toEqual([]);
        expect(facts.lexicalRecognition.evidence).toBe('attested-form-reading');
      }
    }
    expect(dem?.lexicalRecognition).toMatchObject({ status: 'withheld', reason: expect.stringContaining('several different lemma readings') });
    expect(die?.lexicalRecognition).toMatchObject({ status: 'withheld', reason: expect.stringContaining('several different lemma readings') });
    const ambiguousBuild = await writtenRecognition.build({ unitId: 'form:de:dem', unitKind: 'form', languageId: 'de', varietyId: 'de-DE', dimension: 'written-recognition' }, dem!, { now: '2026-11-01T00:00:00.000Z', random: () => 0 });
    expect('unavailable' in ambiguousBuild ? ambiguousBuild.reason : '').toContain('several different lemma readings');

    // A prior successful lookup does not turn a later asset outage into a durable unsupported result;
    // strict form-index and dictionary reads are retryable and the same provider can recover.
    let failForms = true;
    const formsFetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://assets.local/');
      if (failForms && url.pathname.startsWith('/dict/de/forms/')) throw new Error('forms source offline');
      return fetchAssets(input);
    }) as typeof fetch;
    const formsProvider = packFactsFor({ fetch: formsFetch, baseUrl: 'http://assets.local/' })('de', api)!;
    const unavailableForms = await formsProvider.factsFor('form:de:herankam', 'de');
    expect(unavailableForms).toBeUndefined();
    failForms = false;
    expect((await formsProvider.factsFor('form:de:herankam', 'de'))?.lexicalRecognition?.status).toBe('verified');

    let failDictionary = false;
    const dictionaryFetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://assets.local/');
      if (failDictionary && url.pathname.startsWith('/dict/de/') && !url.pathname.includes('/forms/')) throw new Error('dictionary source offline');
      return fetchAssets(input);
    }) as typeof fetch;
    const dictionaryProvider = packFactsFor({ fetch: dictionaryFetch, baseUrl: 'http://assets.local/' })('de', api)!;
    const dictionaryEngine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, now: () => '2026-11-01T00:00:00.000Z',
      factsFor: () => dictionaryProvider });
    failDictionary = true;
    const dictionaryReadiness = await dictionaryEngine.exerciseReadiness!({ unitId: 'form:de:herankam', unitKind: 'form', languageId: 'de', varietyId: 'de-DE',
      dimension: 'written-recognition', family: 'written-recognition', api, now: '2026-11-01T00:00:00.000Z' });
    expect(dictionaryReadiness.available).toBe(false);
    expect(dictionaryReadiness.retryable).toBe(true);
    failDictionary = false;
    expect((await dictionaryProvider.factsFor('form:de:herankam', 'de'))?.lexicalRecognition?.status).toBe('verified');
    expect(assetRequests.some(url => /^\/dict\/[^/]+\/frequency\.json$/u.test(url))).toBe(false);
  });

  it('withholds Greek fallback when the top source is rule-only or readings point to different lexemes', async () => {
    const provider = packFactsFor({ fetch: fetchAssets, baseUrl: 'http://assets.local/' })('el', api)!;
    const cases = ['form:el:αὐτοῦ', 'form:el:βαβυλῶνος', 'form:el:χριστοῦ', 'form:el:ἄγνωστον'];
    for (const unitId of cases) {
      const facts = await provider.factsFor(unitId, 'el', 'el-koi') as ReviewFacts | undefined;
      if (facts?.lexicalRecognition?.status === 'withheld') expect(facts.lexicalRecognition.reason).toBeTruthy();
      expect(facts?.lexicalRecognition?.status === 'verified' && facts.status === 'conflicted').toBe(false);
    }
    const unsupported = await provider.factsFor('form:el:☃', 'el', 'el-koi');
    expect(unsupported?.lexicalRecognition?.status).not.toBe('verified');

    const ruleCandidate: AnalysisCandidate = { lemma: 'λύω', pos: 'VERB', morph: {}, gloss: 'to loosen', confidence: 0.8, origin: 'rule', sourceId: 'el-rules@1' };
    const tokenize = (text: string) => [{ surface: text, normalized: text, start: 0, end: text.length, isWord: true }];
    const fake = createFactsProvider({
      unit: async () => undefined,
      pack: { manifest: packFor('el')!, runtime: { gloss: async () => undefined } },
      adapter: { tokenize, normalize: (text: string) => text, analyze: (tokens: ReturnType<typeof tokenize>) => tokens.map(token => ({ token, candidates: [ruleCandidate], analyzer: 'test' })) },
    });
    const ruleFacts = await fake.factsFor('form:el:λυει', 'el') as ReviewFacts | undefined;
    expect(ruleFacts?.lexicalRecognition).toMatchObject({ status: 'withheld', reason: expect.stringContaining('rule reading') });

    const makeDictionaryFact = (candidates: AnalysisCandidate[]) => createFactsProvider({
      unit: async () => undefined,
      pack: { manifest: packFor('el')!, runtime: { gloss: async () => undefined } },
      adapter: { tokenize, normalize: (text: string) => text, analyze: (tokens: ReturnType<typeof tokenize>) => tokens.map(token => ({ token, candidates, analyzer: 'test' })) },
    });
    const posAmbiguous = await makeDictionaryFact([
      { ...ruleCandidate, origin: 'dictionary', sourceId: 'morphgnt-sblgnt' },
      { ...ruleCandidate, pos: 'NOUN', origin: 'dictionary', sourceId: 'morphgnt-sblgnt' },
    ]).factsFor('form:el:λυει', 'el') as ReviewFacts | undefined;
    expect(posAmbiguous?.lexicalRecognition).toMatchObject({ status: 'withheld', reason: expect.stringContaining('lemma and part of speech') });
    const unconfirmed = await makeDictionaryFact([{ ...ruleCandidate, origin: 'dictionary', sourceId: 'morphgnt-sblgnt', unconfirmed: true }]).factsFor('form:el:λυει', 'el') as ReviewFacts | undefined;
    expect(unconfirmed?.lexicalRecognition).toMatchObject({ status: 'withheld', reason: expect.stringContaining('no confirmed base-meaning gloss') });
  });
});
