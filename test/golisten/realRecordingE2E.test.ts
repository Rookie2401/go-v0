import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createMemoryStore, seedBasics, StoreEventBus, type SentenceViewed, type ListeningPositionSaved } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { ingestDocument, type CorpusDocument } from '../../src/ingest';
import { createGoLearn } from '../../src/golearn';
import { buildPlayerManifest, createGoListen, emitPlayerEffects, listeningEmitter, PlayerMachine } from '../../src/golisten';
import type { AudioImportManifest } from '../../src/core/contracts/golisten';
import { latestListeningCheckpoint, listeningProgress } from '../../src/golisten/progress';

describe('lawful real recording through canonical ingestion and listening', () => {
  it('plays the exact greeting, preserves rescue/slowdown facts, resumes, and does not manufacture mastery', async () => {
    const store = createMemoryStore();
    await seedBasics(store);
    const bus = new StoreEventBus(store);
    const adapters = createAdapterRegistry();
    const doc = JSON.parse(await readFile('test/fixtures/golisten/de-guten-tag.text.json', 'utf8')) as CorpusDocument;
    const manifest = JSON.parse(await readFile('test/fixtures/golisten/de-guten-tag.audio.json', 'utf8')) as AudioImportManifest;
    const text = await ingestDocument(store, adapters, doc);
    expect(text.published).toBe(true);
    const gl = createGoListen({ store, bus, adapters });
    const learning = createGoLearn({ store, bus, adapters });
    learning.attach();
    const sentence = (await store.sentences.where('textId', text.id))[0];
    const tokenIds = (await store.tokens.where('sentenceId', sentence.id)).map((t) => t.id);
    await bus.emit<SentenceViewed>({ type: 'SentenceViewed', userId: 'u1', lang: 'de', surface: 'corpus', session: 'reading',
      dedupeKey: 'existing-reading', textId: text.id, sentenceId: sentence.id, tokenIds, dwellMs: 6000, contentVersion: 1 });
    await learning.settled();
    const readingBefore = (await store.learnerItems.all()).map((x) => ({ id: x.id, reading: x.reading }));
    const recording = await gl.importRecording({ manifest, bytes: new Uint8Array(await readFile('test/fixtures/golisten/de-guten-tag.wav')), origin: 'curated' });
    expect(await gl.assetUrl(recording.asset.id)).toBeTruthy();
    expect(recording.asset).toMatchObject({ isSpeech: true, qualityState: 'machine_checked', textBinding: { textId: text.id } });
    expect((await gl.audioStatus(text.id)).evidenceEligible).toBe(false);
    const input = await buildPlayerManifest(store, recording.manifest);
    const machine = new PlayerMachine(input, { autoAdvance: false });
    const emitter = listeningEmitter(bus, { store, userId: 'u1', lang: 'de', session: 'listening', textId: text.id });
    const dispatch = async (action: Parameters<PlayerMachine['dispatch']>[0]) => {
      const effects = machine.dispatch(action);
      await emitPlayerEffects(emitter, machine.state, effects);
      return effects;
    };
    const firstSegment = input.segments[0].segmentId;
    await bus.emit<ListeningPositionSaved>({ type: 'ListeningPositionSaved', userId: 'u1', lang: 'de', surface: 'listen', session: 'listening', dedupeKey: 'early-cursor',
      at: '2020-01-01T00:00:00.000Z', textId: text.id, manifestId: recording.manifest.id, segmentId: firstSegment, positionMs: 1000 });
    expect((await latestListeningCheckpoint(store, 'u1', text.id, recording.manifest.id))?.positionMs).toBe(1000);
    await dispatch({ type: 'restorePosition', segmentId: firstSegment, positionMs: 1000 });
    await dispatch({ type: 'play' });
    for (let ms = 1000; ms <= 2500; ms += 250) await dispatch({ type: 'position', ms, observedAtMs: ms - 1000 });
    const naturalEnd = Math.round(recording.asset.durationMs);
    // Native `ended` may fire without a final `timeupdate`; its media clock is still authoritative for transport position.
    await dispatch({ type: 'ended', observedPositionMs: naturalEnd });
    const partialEnd = (await bus.history()).filter((e) => e.type === 'AudioAbandoned').at(-1);
    expect(partialEnd?.type).toBe('AudioAbandoned');
    if (partialEnd?.type === 'AudioAbandoned') expect(partialEnd.positionMs).toBeGreaterThanOrEqual(recording.asset.durationMs - 60);
    if (partialEnd?.type === 'AudioAbandoned') {
      // Older persisted rows may omit these optional facts while the event carries normalized facts.
      await store.audioAssets.put({ ...recording.asset, sourceType: undefined, audioKind: undefined } as never);
      await store.events.put({ ...partialEnd, sourceType: 'licensed-recording', audioKind: 'human' });
    }
    expect(await latestListeningCheckpoint(store, 'u1', text.id, recording.manifest.id)).toBeUndefined();
    await store.audioAssets.put(recording.asset);
    expect((await bus.history()).filter((e) => e.type === 'AudioPlayed')).toHaveLength(1);

    // A natural end below the audible-exposure threshold clears navigation state, but the next full pass can still earn exposure.
    await dispatch({ type: 'play' });
    for (let ms = 0; ms <= 2500; ms += 250) await dispatch({ type: 'position', ms, observedAtMs: ms });
    await dispatch({ type: 'ended' });
    await dispatch({ type: 'ended' }); // duplicate browser callbacks cannot add another pass
    expect((await bus.history()).filter((e) => e.type === 'AudioSegmentCompleted')).toHaveLength(1);
    expect((await bus.history()).filter((e) => e.type === 'AudioPlayed')).toHaveLength(2);
    expect(await latestListeningCheckpoint(store, 'u1', text.id, recording.manifest.id)).toBeUndefined();
    let progress = await listeningProgress(store, 'u1', text.id);
    expect(progress.completedExposureSentences).toBe(1);
    expect(progress.masteryEligibleSentences).toBe(0);
    await dispatch({ type: 'replay' });
    await dispatch({ type: 'revealTranscript' });
    await dispatch({ type: 'setSpeed', speed: 0.85 });
    for (let ms = 0; ms <= 2500; ms += 250) await dispatch({ type: 'position', ms, observedAtMs: 3000 + ms / 0.85 });
    await dispatch({ type: 'ended' });
    progress = await listeningProgress(store, 'u1', text.id);
    expect(progress.transcriptAssistedSentences).toBe(1);
    expect(progress.slowedSentences).toBe(1);
    expect(progress.sources).toContain('licensed-recording');
    expect((await bus.history()).filter((e) => e.type === 'AudioSegmentCompleted').every((e) => e.audioKind === 'human')).toBe(true);
    await bus.emit<ListeningPositionSaved>({ type: 'ListeningPositionSaved', userId: 'u1', lang: 'de', surface: 'listen', session: 'listening', dedupeKey: 'cursor',
      textId: text.id, manifestId: recording.manifest.id, segmentId: firstSegment, positionMs: 1000 });
    const cursor = await latestListeningCheckpoint(store, 'u1', text.id, recording.manifest.id);
    expect(cursor?.positionMs).toBe(1000);
    const reopened = new PlayerMachine(input);
    expect(reopened.dispatch({ type: 'restorePosition', segmentId: firstSegment, positionMs: cursor!.positionMs }).some((x) => x.type === 'play')).toBe(false);
    expect(reopened.state.positionMs).toBe(1000);
    await learning.settled();
    expect((await store.learnerItems.all()).map((x) => ({ id: x.id, reading: x.reading }))).toEqual(readingBefore);
    expect((await store.encounters.all()).filter((e) => e.modality === 'listening')).toHaveLength(0);
  });
});
