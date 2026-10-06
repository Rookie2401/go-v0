import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildFixtureText, createMemoryStore, seedBasics, StoreEventBus } from '../../src/core';
import type { AudioSegmentCompleted, DomainEvent, SentenceViewed, TextViewed } from '../../src/core/events';
import type { EventInput } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { ingestDocument, type CorpusDocument } from '../../src/ingest';
import { createGoLearn } from '../../src/golearn';
import { createGoListen, listeningEmitter, registerListeningAssessment, resolvePlaybackFacts } from '../../src/golisten';
import type { AudioImportManifest } from '../../src/core/contracts/golisten';
import { startListeningAssessment, submitListeningAssessment, listeningAssessmentAvailability, type ListeningAssessmentRegistryEntry } from '../../src/golisten/assessment';

const registryId = 'de-unseen-self-report-01';

async function prepared(register = true) {
  const store = createMemoryStore();
  await seedBasics(store);
  const bus = new StoreEventBus(store);
  const adapters = createAdapterRegistry();
  const doc = JSON.parse(await readFile('test/fixtures/golisten/de-guten-tag.text.json', 'utf8')) as CorpusDocument;
  const importManifest = JSON.parse(await readFile('test/fixtures/golisten/de-guten-tag.audio.json', 'utf8')) as AudioImportManifest;
  const text = await ingestDocument(store, adapters, doc);
  const golearn = createGoLearn({ store, bus, adapters });
  golearn.attach();
  const gl = createGoListen({ store, bus, adapters });
  const imported = await gl.importRecording({ manifest: importManifest, bytes: new Uint8Array(await readFile('test/fixtures/golisten/de-guten-tag.wav')), origin: 'curated' });
  // Test-only metadata exercises the reviewed-human branches. It does not claim the sample has received acoustic QA.
  await store.audioAssets.put({ ...imported.asset, audioKind: 'human', isSpeech: true, qualityState: 'human_reviewed' });
  for (const segmentId of imported.manifest.segmentIds) {
    const segment = await store.audioSegments.get(segmentId);
    const voice = segment ? await store.voices.get(segment.voiceConfigId) : undefined;
    if (voice) await store.voices.put({ ...voice, isSpeech: true, reviewStatus: 'reviewed' });
  }
  const sentenceIds = (await store.sentences.where('textId', text.id)).filter((s) => s.retiredInVersion === undefined).map((s) => s.id);
  const entry: ListeningAssessmentRegistryEntry = { id: registryId, textId: text.id, manifestId: imported.manifest.id,
    contentVersion: text.contentVersion, sentenceIds, approved: true, basis: 'learner-self-report-only' };
  if (register) await registerListeningAssessment(store, golearn, entry);
  return { store, bus, gl, golearn, text, imported, entry };
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

async function emitPriorExposure(
  env: Awaited<ReturnType<typeof prepared>>,
  type: 'TokenHelpOpened' | 'PhraseHelpOpened' | 'GrammarHelpOpened' | 'SentenceExplanationRevealed' | 'DecodingRevealed' | 'SentenceReread' | 'SentenceViewed',
  options: { userId?: string; lang?: 'de' | 'es'; textId?: string } = {},
) {
  const sentenceId = env.entry.sentenceIds[0];
  const token = (await env.store.tokens.where('sentenceId', sentenceId))[0]!;
  const input = {
    type, userId: options.userId ?? 'u1', lang: options.lang ?? 'de', at: new Date().toISOString(), surface: 'corpus' as const,
    session: `prior:${type}`, dedupeKey: `prior:${type}:${options.userId ?? 'u1'}:${options.lang ?? 'de'}:${options.textId ?? ''}`,
    sentenceId,
    ...(type === 'SentenceViewed' ? { textId: options.textId ?? env.text.id, tokenIds: [token.id] } : {}),
    ...(type === 'TokenHelpOpened' ? { tokenId: token.id, itemId: token.formId, level: 1 as const } : {}),
    ...(type === 'PhraseHelpOpened' ? { phraseOccurrenceId: 'prior-phrase', phraseId: 'prior-phrase' } : {}),
    ...(type === 'GrammarHelpOpened' ? { patternId: 'prior-pattern', tokenIds: [token.id] } : {}),
    ...(type === 'DecodingRevealed' ? { tokenId: token.id, itemId: token.formId, features: [], romanization: false } : {}),
  };
  await env.bus.emit(input as EventInput<DomainEvent>);
}

describe('locked unseen listening assessment infrastructure', () => {
  it('registers protection through one path, rebuilds prior learner state, and preserves the event log', async () => {
    const env = await prepared(false);
    const sentenceId = env.entry.sentenceIds[0];
    const tokenIds = (await env.store.tokens.where('sentenceId', sentenceId)).map((t) => t.id);
    await env.bus.emit<SentenceViewed>({ type: 'SentenceViewed', userId: 'u1', lang: 'de', at: new Date().toISOString(), surface: 'corpus',
      session: 'ordinary-reading', dedupeKey: 'ordinary-reading-before-lock', textId: env.text.id, sentenceId, tokenIds } as EventInput<SentenceViewed>);
    const ordinary = await buildFixtureText(env.store, { lang: 'de', slug: 'unprotected-reading', sentences: [
      { tokens: [{ surface: 'Wort', lemma: 'Wort', pos: 'NOUN' }] },
    ] });
    const ordinarySentence = (await env.store.sentences.where('textId', ordinary.id))[0];
    const ordinaryTokens = await env.store.tokens.where('sentenceId', ordinarySentence.id);
    await env.bus.emit<SentenceViewed>({ type: 'SentenceViewed', userId: 'u1', lang: 'de', at: new Date().toISOString(), surface: 'corpus',
      session: 'ordinary-reading-2', dedupeKey: 'ordinary-reading-stays', textId: ordinary.id, sentenceId: ordinarySentence.id,
      tokenIds: ordinaryTokens.map((token) => token.id) } as EventInput<SentenceViewed>);
    await env.golearn.settled();
    expect((await env.store.encounters.where('userId', 'u1')).some((e) => e.textId === env.text.id)).toBe(true);
    const before = await env.store.events.where('userId', 'u1');

    await expect(registerListeningAssessment(env.store, env.golearn, env.entry)).resolves.toEqual(['u1']);
    expect((await env.store.texts.get(env.text.id))?.listeningAssessmentId).toBe(env.entry.id);
    expect((await env.store.meta.get(`listening-assessment-registry:${env.entry.id}`))?.value).toBe(JSON.stringify(env.entry));
    expect((await env.store.encounters.where('userId', 'u1')).some((e) => e.textId === env.text.id)).toBe(false);
    expect((await env.store.encounters.where('userId', 'u1')).some((e) => e.textId === ordinary.id)).toBe(true);
    expect((await env.store.events.where('userId', 'u1'))).toEqual(before);
  });

  it('does not register stale or incomplete sentence bindings', async () => {
    const env = await prepared(false);
    const changed = { ...env.entry, contentVersion: env.entry.contentVersion + 1 };
    await expect(registerListeningAssessment(env.store, env.golearn, changed)).rejects.toThrow(/missing, unpublished, stale/);
    expect((await env.store.texts.get(env.text.id))?.listeningAssessmentId).toBeUndefined();
    expect(await env.store.meta.get(`listening-assessment-registry:${env.entry.id}`)).toBeUndefined();
  });

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

  it('treats standalone sentence help and explanation events as prior exposure', async () => {
    for (const type of ['TokenHelpOpened', 'PhraseHelpOpened', 'GrammarHelpOpened', 'SentenceExplanationRevealed', 'DecodingRevealed', 'SentenceReread'] as const) {
      const env = await prepared();
      await emitPriorExposure(env, type);
      expect(await listeningAssessmentAvailability(env.store, 'u1', env.text.id), type).toMatchObject({ state: 'contaminated' });
    }
  });

  it('matches exposure only to the learner, target language, and sentence’s current text association', async () => {
    const env = await prepared();
    await emitPriorExposure(env, 'TokenHelpOpened', { userId: 'another-learner' });
    await emitPriorExposure(env, 'TokenHelpOpened', { lang: 'es' });
    await emitPriorExposure(env, 'SentenceViewed', { textId: 'text:de:unrelated' });
    expect(await listeningAssessmentAvailability(env.store, 'u1', env.text.id)).toMatchObject({ state: 'ready' });
    await emitPriorExposure(env, 'TokenHelpOpened');
    expect(await listeningAssessmentAvailability(env.store, 'u1', env.text.id)).toMatchObject({ state: 'contaminated' });
  });
});
