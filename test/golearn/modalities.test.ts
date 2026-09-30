import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { DimensionState } from '../../src/core';
import { createHarness } from './harness';
import { ES_STORY, buildSpanish } from './fixtures';

const U = 'u1';
const F = (w: string) => ids.form('es', w);
const EMPTY: DimensionState = { level: 'unseen', confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0 };

describe('DEMO 2 — reading ≠ listening', () => {
  it('reading recognition does not change listening (and listening does not change reading)', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    for (const s of ['s1', 's2', 's3']) await h.understood(U, 'es', ES_STORY, [0], s);
    const afterReading = await h.golearn.getItemState(U, F('creo'));
    expect(afterReading?.reading.level).toBe('recognized');
    expect(afterReading?.listening).toEqual(EMPTY); // listening untouched
    const lemma = await h.golearn.getItemState(U, ids.lemma('es', 'creer', 'VERB'));
    expect(lemma?.listening).toEqual(EMPTY);

    await h.listen(U, 'es', ES_STORY, [0]);
    const afterListen = await h.golearn.getItemState(U, F('creo'));
    expect(afterListen?.listening.level).toBe('encountered'); // heard once: exposure, not comprehension
    expect(afterListen?.listening.exposures).toBe(1);
    expect(afterListen?.listening.evidence).toBe(0);
    expect(afterListen?.reading).toEqual(afterReading?.reading); // reading untouched
    expect(afterListen?.writing).toEqual(EMPTY);
    expect(afterListen?.speaking).toEqual(EMPTY);
  });

  it('a listening completion creates listening encounters only, on the listen surface', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.listen(U, 'es', ES_STORY, [0, 1], { speed: 0.85 });
    const encs = await h.store.encounters.where('userId', U);
    expect(encs.length).toBeGreaterThan(0);
    for (const e of encs) {
      expect(e.modality).toBe('listening');
      expect(e.surface).toBe('listen');
      expect(e.playbackSpeed).toBe(0.85);
      expect(e.evidenceKind).toBe('exposure');
    }
    for (const row of await h.store.learnerItems.where('userId', U)) {
      expect(row.reading).toEqual(EMPTY);
      expect(row.listening.level).toBe('encountered');
    }
  });

  it('playing, replaying and revealing are not evidence; demonstrated listening is discounted by speed and replays; a transcript makes it assisted', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.bus.emit({ type: 'AudioPlayed', userId: U, lang: 'es', surface: 'listen', session: 'l1', dedupeKey: 'a1', textId: ES_STORY, segmentId: 'sg', sentenceIds: [`${ES_STORY}/s0`], speed: 1, transcriptVisible: false, speech: true, voiceReviewed: true } as never);
    await h.bus.emit({ type: 'AudioReplayed', userId: U, lang: 'es', surface: 'listen', session: 'l1', dedupeKey: 'a2', textId: ES_STORY, segmentId: 'sg', sentenceIds: [`${ES_STORY}/s0`], speed: 1, transcriptVisible: false, count: 1, speech: true, voiceReviewed: true } as never);
    expect(await h.store.encounters.count()).toBe(0);

    await h.listen('fast', 'es', ES_STORY, [0], { speed: 1 });
    await h.listen('slow', 'es', ES_STORY, [0], { speed: 0.7, replays: 2 });
    await h.listen('shown', 'es', ES_STORY, [0], { speed: 1, transcript: true });
    for (const u of ['fast', 'slow', 'shown']) await h.report(u, 'es', ES_STORY, [0], { session: 'l1', modality: 'listening' });
    const fast = await h.golearn.getItemState('fast', F('creo'));
    const slow = await h.golearn.getItemState('slow', F('creo'));
    const shown = await h.golearn.getItemState('shown', F('creo'));
    expect(fast!.listening.evidence).toBe(1);
    expect(slow!.listening.evidence).toBeGreaterThan(0);
    expect(slow!.listening.evidence).toBeLessThan(fast!.listening.evidence);
    expect(shown!.listening.evidence).toBe(0); // the transcript was help: assisted, not demonstrated
    expect(shown!.listening.assisted).toBe(1);
    expect(fast!.listening.unassisted).toBe(1);
  });

  it('a listening report only upgrades audio that really counted, in either order', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.report('none', 'es', ES_STORY, [0], { session: 'l1', modality: 'listening' });
    expect(await h.store.encounters.count()).toBe(0); // nothing was heard: a listening report is not evidence
    await h.listen('none', 'es', ES_STORY, [0], { session: 'l1' }); // the audio arrives after the report
    expect((await h.golearn.getItemState('none', F('creo')))!.listening.level).toBe('recognized_with_help');
    await h.report('fixture', 'es', ES_STORY, [0], { session: 'l1', modality: 'listening' });
    await h.listen('fixture', 'es', ES_STORY, [0], { session: 'l1', speech: false });
    expect(await h.golearn.getItemState('fixture', F('creo'))).toBeUndefined();
  });

  it('a second completion in the same session keeps the better evidence (idempotent, no double count)', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.listen(U, 'es', ES_STORY, [0], { session: 'l1', translation: true }); // revealed translation: help
    const weak = (await h.store.encounters.where('itemId', F('creo')))[0];
    expect(weak.evidenceKind).toBe('assisted');
    await h.listen(U, 'es', ES_STORY, [0], { session: 'l1' }); // clean pass
    const better = await h.golearn.getItemState(U, F('creo'));
    expect(better!.listening.assisted).toBe(0);
    expect(better!.listening.exposures).toBe(1);
    expect(better!.encounterCount).toBe(1);
    await h.listen(U, 'es', ES_STORY, [0], { session: 'l1', translation: true }); // a worse repeat changes nothing
    const again = await h.golearn.getItemState(U, F('creo'));
    expect(again!.listening.assisted).toBe(0);
    expect(again!.listening.exposures).toBe(1);
  });
});

describe('DEMO 3 — assisted vs independent production', () => {
  it('weights independent > self-repaired > assisted > copied, in writing only', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    const readingBefore = (await h.golearn.getItemState(U, F('creo')))!;

    await h.produce(U, 'es', F('creo'), 'independent');
    await h.produce(U, 'es', F('dios'), 'self-repaired');
    await h.produce(U, 'es', F('yo'), 'assisted');
    await h.produce(U, 'es', F('en'), 'copied');

    const w = async (word: string) => (await h.golearn.getItemState(U, F(word)))!.writing;
    expect((await w('creo')).evidence).toBe(1);
    expect((await w('dios')).evidence).toBe(0.8);
    expect((await w('yo')).evidence).toBe(0.4);
    expect((await w('en')).evidence).toBe(0.2);
    expect((await w('creo')).level).toBe('used_independently');
    expect((await w('dios')).level).toBe('used_independently');
    expect((await w('yo')).level).toBe('used_with_assistance');
    expect((await w('en')).level).toBe('used_with_assistance');
    expect((await w('creo')).unassisted).toBe(1);
    expect((await w('yo')).assisted).toBe(1);

    // reading / listening / speaking untouched
    const after = (await h.golearn.getItemState(U, F('creo')))!;
    expect(after.reading).toEqual(readingBefore.reading);
    expect(after.listening).toEqual(EMPTY);
    expect(after.speaking).toEqual(EMPTY);
    expect(after.encounterCount).toBe(readingBefore.encounterCount);
  });

  it('the same item produced assisted vs independently ends at different writing evidence', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.produce('indep', 'es', F('creo'), 'independent');
    await h.produce('helped', 'es', F('creo'), 'assisted');
    const a = (await h.golearn.getItemState('indep', F('creo')))!.writing;
    const b = (await h.golearn.getItemState('helped', F('creo')))!.writing;
    expect(a.evidence).toBeGreaterThan(b.evidence);
    expect(a.level).toBe('used_independently');
    expect(b.level).toBe('used_with_assistance');
    // many assisted uses (distinct sentences) never turn into independent use
    for (let i = 0; i < 6; i++) await h.produce('helped', 'es', F('creo'), 'assisted', { session: `p${i + 2}` });
    const c = (await h.golearn.getItemState('helped', F('creo')))!.writing;
    expect(c.level).toBe('used_with_assistance');
    expect(c.unassisted).toBe(0);
  });

  it('speaking production touches only speaking; production never creates reading evidence', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.produce(U, 'es', F('creo'), 'independent', { modality: 'speaking' });
    const s = (await h.golearn.getItemState(U, F('creo')))!;
    expect(s.speaking.level).toBe('used_independently');
    expect(s.writing).toEqual(EMPTY);
    expect(s.reading).toEqual(EMPTY);
    expect(s.listening).toEqual(EMPTY);
    expect(s.encounterCount).toBe(0);
    expect(s.textIds).toEqual([]);
  });

  it('the same (item, sentence) is recorded once, ever — across sessions, revisions and replays; queryItem reports the mix', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.produce(U, 'es', F('creo'), 'independent', { session: 'p1', sentenceText: 'Yo creo.' });
    await h.golearn.handle((await h.bus.history({ userId: U, types: ['ProductionRecorded'] }))[0]); // replay
    await h.produce(U, 'es', F('creo'), 'copied', { session: 'p9', revisionId: 'rev9', sentenceText: 'Yo creo.' }); // same sentence, later revision
    await h.produce(U, 'es', F('creo'), 'assisted', { session: 'p2', revisionId: 'rev2', sentenceText: 'Creo en Dios.' });
    await h.produce(U, 'es', F('creo'), 'copied', { session: 'p3', revisionId: 'rev3', sentenceText: 'Dios me hace creer.' });
    const k = await h.golearn.queryItem(U, { itemId: F('creo'), lang: 'es' });
    expect(k.productionEvidence).toEqual({ independent: 1, selfRepaired: 0, assisted: 1, copied: 1 });
    expect(k.writing.evidence).toBeCloseTo(1.6, 6);
  });

  it('an explicit sentenceHash identifies the sentence, whatever its text', async () => {
    const h = createHarness();
    await h.produce(U, 'es', F('creo'), 'independent', { sentenceHash: 'h1', sentenceText: 'a' });
    await h.produce(U, 'es', F('creo'), 'independent', { sentenceHash: 'h1', sentenceText: 'b' });
    await h.produce(U, 'es', F('creo'), 'independent', { sentenceHash: 'h2', sentenceText: 'a' });
    expect((await h.golearn.queryItem(U, { itemId: F('creo'), lang: 'es' })).productionEvidence.independent).toBe(2);
  });
});

describe('manual marks', () => {
  it('are stored separately and only floor / cap the displayed reading level', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.mark(U, 'es', F('creo'), 'known');
    let st = (await h.golearn.getItemState(U, F('creo')))!;
    expect(st.manualMark).toBe('known');
    expect(st.reading.level).toBe('unseen'); // evidence untouched
    expect((await h.golearn.queryItem(U, { itemId: F('creo'), lang: 'es' })).reading.level).toBe('recognized'); // displayed floor

    for (const s of ['s1', 's2', 's3', 's4']) await h.understood(U, 'es', ES_STORY, [0], s);
    await h.mark(U, 'es', F('creo'), 'unknown');
    st = (await h.golearn.getItemState(U, F('creo')))!;
    expect(st.reading.level).toBe('recognized');
    expect((await h.golearn.queryItem(U, { itemId: F('creo'), lang: 'es' })).reading.level).toBe('recognized_with_help');

    await h.mark(U, 'es', F('creo'), 'clear');
    st = (await h.golearn.getItemState(U, F('creo')))!;
    expect(st.manualMark).toBeUndefined();
    expect((await h.golearn.queryItem(U, { itemId: F('creo'), lang: 'es' })).reading.level).toBe('recognized');

    await h.mark(U, 'es', F('zzz'), 'known');
    await h.mark(U, 'es', F('zzz'), 'clear');
    expect(await h.golearn.getItemState(U, F('zzz'))).toBeUndefined(); // nothing left to hold
  });
});
