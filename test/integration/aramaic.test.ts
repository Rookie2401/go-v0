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
import { morphologicalIdentification } from '../../packages/goreview/src/exercises/morphological-identification';
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
    expect(docs.length).toBeGreaterThan(250);
    expect(validateBatch(docs, { registry }).documents.flatMap(d => d.issues).filter(i => i.severity === 'error')).toEqual([]);
    const store = createMemoryStore();
    const texts = await ingestAll(store, registry, docs);
    expect(texts.every(t => t.published)).toBe(true);
    const catalog = createCourseCatalog({ store });
    await catalog.install('aramaic-arc');
    expect(await catalog.works('aramaic-arc')).toHaveLength(docs.length);
    const library = createLibrary({ store, adapters: registry, fetch: noNetwork });
    await library.indexStore('arc');
    const path = await loadCoursePath(catalog, library, 'aramaic-arc');
    expect(path[0].available).toBe(true);
    expect(path[0].publishedWorks).toBe(docs.length);
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
    expect((await reloaded.recommend('arc-student', { lang: 'arc' })).some(r => r.textId !== texts[0].id)).toBe(true);
    const coverage = await reloaded.coverage('arc-student', texts[1].id);
    expect(coverage.wordTokens).toBeGreaterThan(0);
    expect(coverage.knownLexicalCoverage).toBe(0); // exposure is not comprehension
  });

  it('builds normal review facts and an exercise; Easy preserves the shared future due date', async () => {
    const noNetwork = (async () => new Response('not found', { status: 404 })) as typeof fetch;
    const api = { async unit() { return { ok: false, status: 404, error: 'not-found', message: 'missing', body: {} }; } } as unknown as RepositoryApi;
    const provider = packFactsFor({ fetch: noNetwork, baseUrl: 'https://test.local/' })('arc', api)!;
    expect(provider).toBeDefined();
    const unitId = 'form:arc:דָֽנִיֵּאל֙';
    const facts = await provider.factsFor(unitId, 'arc', 'arc-bib');
    expect(facts).toBeDefined();
    expect(facts?.lexicalRecognition).toMatchObject({ status: 'verified', lemma: 'דָּנִיֵּאל' });
    const questioned = await provider.factsFor('form:arc:תְּקִ֥ילְתָּה', 'arc', 'arc-bib');
    expect(questioned).toMatchObject({ status: 'requires-review', unit: { status: 'requires-review' }, lexicalRecognition: { status: 'withheld' }, constructionIds: [], featureExplanations: {} });
    expect(questioned?.features).toBeUndefined();
    expect(questioned?.pos).toBeUndefined();
    const mixed = await provider.factsFor('form:arc:דְנָה֙', 'arc', 'arc-bib');
    // the clean singular reading leads; Ezra 5:9's audit-questioned plural is kept below it as a flagged alternative
    expect(mixed?.status).toBe('high-confidence');
    expect(mixed?.features).toMatchObject({ Number: 'Sing' });
    const morphology = await morphologicalIdentification.build({ unitId: mixed!.unit.unitId, unitKind: 'form', languageId: 'arc', varietyId: 'arc-bib', dimension: 'morphological-analysis' }, mixed!, { now: T0, random: () => 0 });
    expect('unavailable' in morphology ? morphology.reason : undefined).toMatch(/no pack sentence holds this form/i); // no longer refused as conflicted
    const storedUnitId = 'form:arc:דְנָה֙';
    const storedApi = { async unit() { return { ok: true, data: {
      unit: { unitId: storedUnitId, kind: 'form', languageId: 'arc', label: 'דְנָה֙', packId: 'pack:arc', packVersion: '2',
        provenance: { source: 'dictionary', ref: 'oshb-aramaic', confidence: 0.98 }, status: 'requires-review', createdAt: T0,
        pos: 'PRON', features: { Number: 'Plur' } },
      relations: [], analyses: [{ analysisId: 'persisted-arc-flag', formId: storedUnitId, languageId: 'arc', candidates: [
        { lexemeId: 'lemma:arc:דֵּן:PRON', features: { Number: 'Plur' }, constructionIds: ['morph:arc:PRON:Number=Plur'],
          confidence: 0.98, reviewStatus: 'requires-review', provenance: { source: 'dictionary', ref: 'oshb-aramaic', confidence: 0.98 } },
      ], chosen: 0, status: 'requires-review', analyzerId: 'adapter-arc@2', packId: 'pack:arc', packVersion: '2', createdAt: T0 }],
    } }; } };
    const persistedProvider = packFactsFor({ fetch: noNetwork, baseUrl: 'https://test.local/' })('arc', storedApi as unknown as RepositoryApi)!;
    const persisted = await persistedProvider.factsFor(storedUnitId, 'arc', 'arc-bib');
    expect(persisted).toMatchObject({ status: 'requires-review', unit: { status: 'requires-review' } });
    const persistedMorphology = await morphologicalIdentification.build({ unitId: storedUnitId, unitKind: 'form', languageId: 'arc', varietyId: 'arc-bib', dimension: 'morphological-analysis' }, persisted!, { now: T0, random: () => 0 });
    expect('unavailable' in persistedMorphology ? persistedMorphology.reason : undefined).toMatch(/requires specialist review/i);
    const exercise = await writtenRecognition.build({ unitId, unitKind: 'form', languageId: 'arc', varietyId: 'arc-bib', dimension: 'written-recognition' }, facts!, { now: T0, random: () => 0 });
    expect('unavailable' in exercise ? exercise.reason : undefined).toBeUndefined();
    const kingUnitId = 'form:arc:מַלְכָּא֙';
    const kingFacts = await provider.factsFor(kingUnitId, 'arc', 'arc-bib');
    expect(kingFacts).toMatchObject({ status: 'high-confidence', lexicalRecognition: { status: 'verified', lemma: 'מֶלֶךְ' } });
    const kingRecognition = await writtenRecognition.build({ unitId: kingUnitId, unitKind: 'form', languageId: 'arc', varietyId: 'arc-bib', dimension: 'written-recognition' }, kingFacts!, { now: T0, random: () => 0 });
    expect('unavailable' in kingRecognition ? kingRecognition.reason : undefined).toBeUndefined();
    const kingMorphology = await morphologicalIdentification.build({ unitId: kingUnitId, unitKind: 'form', languageId: 'arc', varietyId: 'arc-bib', dimension: 'morphological-analysis' }, kingFacts!, { now: T0, random: () => 0 });
    expect('unavailable' in kingMorphology ? kingMorphology.reason : '').not.toMatch(/conflicted/i); // 133 clean determined readings outrank Dan 4:21's questioned one
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
