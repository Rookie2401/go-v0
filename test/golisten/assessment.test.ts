import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createMemoryStore, seedBasics, StoreEventBus } from '../../src/core';
import type { AudioSegmentCompleted, TextViewed } from '../../src/core/events';
import { createAdapterRegistry } from '../../src/adapters';
import { ingestDocument, type CorpusDocument } from '../../src/ingest';
import { createGoListen, listeningEmitter, resolvePlaybackFacts } from '../../src/golisten';
import type { AudioImportManifest } from '../../src/core/contracts/golisten';
import { startListeningAssessment, submitListeningAssessment, listeningAssessmentAvailability, type ListeningAssessmentRegistryEntry } from '../../src/golisten/assessment';

const registryId = 'de-unseen-self-report-01';

async function prepared() {
  const store = createMemoryStore();
  await seedBasics(store);
  const bus = new StoreEventBus(store);
  const adapters = createAdapterRegistry();
  const doc = JSON.parse(await readFile('test/fixtures/golisten/de-guten-tag.text.json', 'utf8')) as CorpusDocument;
  const importManifest = JSON.parse(await readFile('test/fixtures/golisten/de-guten-tag.audio.json', 'utf8')) as AudioImportManifest;
  const text = await ingestDocument(store, adapters, doc);
  const gl = createGoListen({ store, bus, adapters });
  const imported = await gl.importRecording({ manifest: importManifest, bytes: new Uint8Array(await readFile('test/fixtures/golisten/de-guten-tag.wav')) });
  // Test-only metadata exercises the reviewed-human branches. It does not claim the sample has received acoustic QA.
  await store.audioAssets.put({ ...imported.asset, audioKind: 'human', isSpeech: true, qualityState: 'human_reviewed' });
  for (const segmentId of imported.manifest.segmentIds) {
    const segment = await store.audioSegments.get(segmentId);
    const voice = segment ? await store.voices.get(segment.voiceConfigId) : undefined;
    if (voice) await store.voices.put({ ...voice, isSpeech: true, reviewStatus: 'reviewed' });
  }
  const sentenceIds = (await store.sentences.where('textId', text.id)).filter((s) => s.retiredInVersion === undefined).map((s) => s.id);
  await store.texts.put({ ...text, listeningAssessmentId: registryId });
  const entry: ListeningAssessmentRegistryEntry = { id: registryId, textId: text.id, manifestId: imported.manifest.id,
    contentVersion: text.contentVersion, sentenceIds, approved: true, basis: 'learner-self-report-only' };
  await store.meta.put({ id: `listening-assessment-registry:${registryId}`, value: JSON.stringify(entry), updatedAt: new Date().toISOString() });
  return { store, bus, gl, text, imported, entry };
}

async function begin(env: Awaited<ReturnType<typeof prepared>>, session = 'try-1') {
  const started = await startListeningAssessment(env.store, env.bus, { userId: 'u1', lang: 'de', textId: env.text.id, sessionId: session });
  if (started.state !== 'ready') throw new Error(started.reason);
  expect(started.state).toBe('ready');
  return started;
}

async function finish(env: Awaited<ReturnType<typeof prepared>>, session: string) {
  const segment = (await env.store.audioSegments.getMany(env.imported.manifest.segmentIds))[0]!;
  const facts = await resolvePlaybackFacts(env.store, { segmentId: segment.id, sentenceIds: segment.sentenceIds });
  if (!facts.ready) throw new Error(`test audio not ready: ${JSON.stringify({ facts, segment, asset: await env.store.audioAssets.get(segment.assetId ?? '') })}`);
  const emitter = listeningEmitter(env.bus, { userId: 'u1', lang: 'de', textId: env.text.id, session });
  await emitter.played({ segmentId: segment.id, sentenceIds: segment.sentenceIds }, { speed: 1, transcriptVisible: false });
  await env.bus.emit<AudioSegmentCompleted>({ type: 'AudioSegmentCompleted', userId: 'u1', lang: 'de', surface: 'listen', session,
    dedupeKey: `complete:${session}`, textId: env.text.id, segmentId: segment.id, sentenceIds: segment.sentenceIds,
    assetId: facts.assetId, speech: true, voiceReviewed: true, sourceType: facts.sourceType, audioKind: 'human',
    qualityState: 'human_reviewed', rightsId: facts.rightsId, rightsApproved: true, exactTextBound: true,
    textSha256: facts.textSha256, contentVersion: facts.contentVersion, releaseId: facts.releaseId, editionId: facts.editionId,
    narratorOrVoiceId: facts.narratorOrVoiceId, locale: facts.locale, speed: 1, transcriptVisible: false, replayCount: 0,
    revealedTranscript: false, revealedTranslation: false, heardCoverageRatio: 1, audibleCoverageVersion: 'observed-playback@1' });
  return { segment, emitter };
}

describe('locked unseen listening assessment infrastructure', () => {
  it('fails closed without a registry entry, including preview mode', async () => {
    const store = createMemoryStore();
    await seedBasics(store);
    const text = (await import('./support')).addStory;
    const story = await text(store, 'de');
    await store.texts.put({ ...story, listeningAssessmentId: registryId });
    expect(await listeningAssessmentAvailability(store, 'u1', story.id)).toMatchObject({ state: 'unavailable' });
    expect(await listeningAssessmentAvailability(store, 'u1', story.id, { preview: true })).toMatchObject({ state: 'unavailable' });
  });

  it('requires the requested and submitted language to match the protected text', async () => {
    const env = await prepared();
    expect(await startListeningAssessment(env.store, env.bus, { userId: 'u1', lang: 'es', textId: env.text.id, sessionId: 'wrong-lang' })).toMatchObject({ state: 'unavailable' });
    const { attempt } = await begin(env, 'right-lang');
    await finish(env, attempt.session);
    expect(await submitListeningAssessment(env.store, env.bus, { userId: 'u1', lang: 'es', attempt, report: 'understood' })).toBeNull();
  });

  it('accepts only a self-report after current reviewed lawful human audio was heard under the started conditions', async () => {
    const env = await prepared();
    const { attempt } = await begin(env);
    await finish(env, attempt.session);
    const submitted = await submitListeningAssessment(env.store, env.bus, { userId: 'u1', lang: 'de', attempt, report: 'understood' });
    expect(submitted).toMatchObject({ validity: 'uncontaminated', basis: 'learner-self-report', report: 'understood' });
  });

  it('marks transcript reveal and slowdown as contamination', async () => {
    const env = await prepared();
    const { attempt } = await begin(env);
    const { emitter, segment } = await finish(env, attempt.session);
    await emitter.transcriptRevealed({ segmentId: segment.id, sentenceIds: segment.sentenceIds }, { speed: 1, transcriptVisible: true });
    await emitter.speedChanged({ from: 1, to: 0.85 });
    const submitted = await submitListeningAssessment(env.store, env.bus, { userId: 'u1', lang: 'de', attempt, report: 'partly-understood' });
    expect(submitted).toMatchObject({ validity: 'contaminated' });
    expect(submitted?.contaminationReasons).toEqual(expect.arrayContaining(['transcript-or-translation-revealed', 'playback-speed-changed']));
  });

  it('rejects a forged empty sentence list and a rights revocation after start', async () => {
    const env = await prepared();
    const { attempt } = await begin(env);
    const forged = { ...attempt, sentenceIds: [] };
    expect(await submitListeningAssessment(env.store, env.bus, { userId: 'u1', lang: 'de', attempt: forged, report: 'understood' })).toBeNull();
    const asset = env.imported.asset;
    await env.store.audioAssets.put({ ...asset, audioKind: 'human', isSpeech: true, qualityState: 'human_reviewed', rights: { ...asset.rights!, status: 'revoked' } });
    expect(await submitListeningAssessment(env.store, env.bus, { userId: 'u1', lang: 'de', attempt, report: 'understood' })).toBeNull();
  });

  it('marks prior text exposure as contaminated before offering a challenge', async () => {
    const env = await prepared();
    const sentence = (await env.store.sentences.where('textId', env.text.id))[0]!;
    await env.bus.emit<TextViewed>({ type: 'TextViewed', userId: 'u1', lang: 'de', surface: 'corpus', session: 'read', dedupeKey: 'read-text', textId: env.text.id });
    expect(await listeningAssessmentAvailability(env.store, 'u1', env.text.id)).toMatchObject({ state: 'contaminated' });
    expect(sentence.textHash).toBeTruthy();
  });
});
