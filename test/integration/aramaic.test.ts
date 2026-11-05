import { describe, expect, it } from 'vitest';
import { StoreEventBus, createMemoryStore } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { createCourseCatalog } from '../../src/course';
import { createLibrary } from '../../src/library';
import { loadCoursePath } from '../../src/course/pathAvailability';
import { createGoLearn } from '../../src/golearn';
import { ingestAll, loadBundledCorpus, validateBatch } from '../../src/ingest';
import { PACKS, installPack, verifyInstalled } from '../../packages/language-packs/src';
import { memoryStorage } from '../language-packs/helpers';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import type { RepositoryApi } from '../../packages/repository-service/src/api';
import { writtenRecognition } from '../../packages/goreview/src/exercises/written-recognition';
import { buildCardAdded, createFsrsScheduler, foldDeck, itemIdFor } from '../../packages/goreview/src/scheduler';
import { reviewed, T0 } from '../goreview/scheduler/helpers';

describe('Aramaic vertical slice through the existing ecosystem', () => {
  it('installs with no network, imports the readings, retains vocabulary, and returns shared reading coverage', async () => {
    const storage = memoryStorage();
    const noNetwork = (async () => { throw new Error('No network needed for the compiled seed'); }) as typeof fetch;
    const installed = await installPack(PACKS.arc, { fetch: noNetwork, baseUrl: 'https://test.local/', storage });
    expect(installed.ok, JSON.stringify(installed)).toBe(true);
    expect(await verifyInstalled(PACKS.arc, storage)).toMatchObject({ installed: true, current: true, validationFailures: 0 });
    const registry = createAdapterRegistry();
    const docs = loadBundledCorpus().filter(d => d.lang === 'arc').sort((a, b) => (a.work?.chapter?.index ?? 0) - (b.work?.chapter?.index ?? 0));
    expect(docs).toHaveLength(2);
    expect(validateBatch(docs, { registry }).documents.flatMap(d => d.issues).filter(i => i.severity === 'error')).toEqual([]);
    const store = createMemoryStore();
    const texts = await ingestAll(store, registry, docs);
    expect(texts.every(t => t.published)).toBe(true);
    const catalog = createCourseCatalog({ store });
    await catalog.install('aramaic-arc');
    expect(await catalog.works('aramaic-arc')).toHaveLength(2);
    const library = createLibrary({ store, adapters: registry, fetch: noNetwork });
    await library.indexStore('arc');
    const path = await loadCoursePath(catalog, library, 'aramaic-arc');
    expect(path[0].available).toBe(true);
    expect(path[0].publishedWorks).toBe(2);
    const clock = () => '2026-11-05T10:00:00.000Z';
    const bus = new StoreEventBus(store, clock);
    const golearn = createGoLearn({ store, bus, adapters: registry, clock });
    golearn.attach();
    const firstSuggestions = await golearn.recommend('arc-student', { lang: 'arc' });
    expect(firstSuggestions.some(r => texts.some(t => t.id === r.textId))).toBe(true);
    const sentences = await store.sentences.where('textId', texts[0].id);
    for (const s of sentences) await bus.emit({
      type: 'SentenceViewed', userId: 'arc-student', lang: 'arc', surface: 'scripture', session: 'read-1',
      dedupeKey: 'arc-view:' + s.id, textId: texts[0].id, sentenceId: s.id, tokenIds: [],
    } as never);
    await golearn.settled();
    const before = await golearn.queryItem('arc-student', { lang: 'arc', surface: 'מַלְכָּא֙' });
    expect(before.encounterCount).toBeGreaterThan(0);
    expect(before.reading.level).toBe('encountered'); // GoLearn's raw exposure state; Repository presents the shared Seen state.
    expect((await golearn.queryItem('arc-student', { lang: 'he', surface: 'מַלְכָּא֙' })).encounterCount).toBe(0);
    const reloaded = createGoLearn({ store, bus, adapters: registry, clock });
    expect((await reloaded.queryItem('arc-student', { lang: 'arc', surface: 'מַלְכָּא֙' })).encounterCount).toBe(before.encounterCount);
    expect((await reloaded.readingProgress('arc-student', texts[0].id)).sentencesSeen).toBeGreaterThan(0);
    expect((await reloaded.recommend('arc-student', { lang: 'arc' })).some(r => r.textId === texts[1].id)).toBe(true);
    const coverage = await reloaded.coverage('arc-student', texts[1].id);
    expect(coverage.wordTokens).toBeGreaterThan(0);
    expect(coverage.knownLexicalCoverage).toBe(0); // exposure is not comprehension
  });

  it('builds normal review facts and an exercise; Easy preserves the shared future due date', async () => {
    const noNetwork = (async () => new Response('not found', { status: 404 })) as typeof fetch;
    const api = { async unit() { return { ok: false, status: 404, error: 'not-found', message: 'missing', body: {} }; } } as unknown as RepositoryApi;
    const provider = packFactsFor({ fetch: noNetwork, baseUrl: 'https://test.local/' })('arc', api)!;
    expect(provider).toBeDefined();
    const unitId = 'form:arc:מַלְכָּא';
    const facts = await provider.factsFor(unitId, 'arc', 'arc-bib');
    expect(facts).toBeDefined();
    expect(facts?.lexicalRecognition).toMatchObject({ status: 'verified', lemma: 'מֶלֶךְ' });
    const exercise = await writtenRecognition.build({ unitId, unitKind: 'form', languageId: 'arc', varietyId: 'arc-bib', dimension: 'written-recognition' }, facts!, { now: T0, random: () => 0 });
    expect('unavailable' in exercise ? exercise.reason : undefined).toBeUndefined();
    const add = buildCardAdded({ learnerId: 'learner-1', enrolmentId: 'enrol-grc', languageId: 'arc', at: T0, deviceId: 'a',
      unitId, unitKind: 'form', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'learner' });
    const cardId = itemIdFor(unitId, 'written-recognition');
    const easy = reviewed(cardId, T0, 4, { languageId: 'arc' });
    const scheduler = createFsrsScheduler();
    const first = foldDeck([add, easy], scheduler, { now: T0, languageId: 'arc' });
    expect(first.items).toHaveLength(1);
    expect(Date.parse(first.items[0].schedule.due)).toBeGreaterThan(Date.parse(T0));
    expect(foldDeck([easy, add], scheduler, { now: T0, languageId: 'arc' }).items).toEqual(first.items);
    expect(foldDeck([add, easy], scheduler, { now: T0, languageId: 'he' }).items).toHaveLength(0);
  });
});
