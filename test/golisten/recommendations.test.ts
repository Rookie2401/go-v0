import { describe, expect, it } from 'vitest';
import { ids, type SentenceViewed } from '../../src/core';
import { recommendListening } from '../../src/golisten/recommendations';
import { FakeSpeechProvider, addStory, makeEnv } from './support';

async function addLawfulSpeech(env: Awaited<ReturnType<typeof makeEnv>>, slug: string) {
  const text = await addStory(env.store, 'es', slug);
  const result = await env.gl.ensureAudio(text.id, { runNow: true });
  return { text, manifest: result.manifest };
}

describe('GoListen recommendations query', () => {
  it('ranks readable familiarity ahead of listen-first and excludes current audio after rights revocation', async () => {
    const env = await makeEnv({ allowFixture: false, providers: [new FakeSpeechProvider()] });
    const first = await addLawfulSpeech(env, 'first');
    const familiar = await addLawfulSpeech(env, 'familiar');
    await env.bus.emit<SentenceViewed>({ type: 'SentenceViewed', userId: 'u1', lang: 'es', surface: 'corpus', session: 'read-1',
      dedupeKey: 'read-familiar-sentence', textId: familiar.text.id, sentenceId: ids.sentence(familiar.text.id, 0), tokenIds: [] });

    const picks = await recommendListening(env.store, 'u1', 'es', { limit: 10 });
    expect(picks.findIndex((pick) => pick.textId === familiar.text.id)).toBeLessThan(picks.findIndex((pick) => pick.textId === first.text.id));
    expect(picks.find((pick) => pick.textId === familiar.text.id)).toMatchObject({ reason: 'listen-familiar', mode: 'listen-only' });
    for (const segmentId of familiar.manifest.segmentIds) {
      const segment = await env.store.audioSegments.get(segmentId);
      const asset = await env.store.audioAssets.get(segment!.assetId!);
      await env.store.audioAssets.put({ ...asset!, rights: { ...asset!.rights!, status: 'revoked' } });
    }
    expect((await recommendListening(env.store, 'u1', 'es', { limit: 10 })).some((pick) => pick.textId === familiar.text.id)).toBe(false);
  });

  it('excludes testimony by text or corpus kind and protected assessment text before applying the limit', async () => {
    const env = await makeEnv({ allowFixture: false, providers: [new FakeSpeechProvider()] });
    const regular = await addLawfulSpeech(env, 'regular');
    const privateByTextKind = await addLawfulSpeech(env, 'private-text-kind');
    await env.store.texts.put({ ...privateByTextKind.text, kind: 'testimony' });
    const privateCorpusText = await addLawfulSpeech(env, 'private-corpus-kind');
    await env.store.corpora.put({ id: 'private-testimony-corpus', lang: 'es', kind: 'testimony', title: 'Private testimony' });
    await env.store.texts.put({ ...privateCorpusText.text, corpusId: 'private-testimony-corpus' });
    const assessment = await addLawfulSpeech(env, 'protected-listening-test');
    await env.store.texts.put({ ...assessment.text, listeningAssessmentId: 'unseen-transfer-test' });

    const picks = await recommendListening(env.store, 'u1', 'es', { limit: 1 });
    expect(picks.map((pick) => pick.textId)).toEqual([regular.text.id]);
    const all = await recommendListening(env.store, 'u1', 'es', { limit: 10 });
    expect(all.some((pick) => pick.textId === privateByTextKind.text.id)).toBe(false);
    expect(all.some((pick) => pick.textId === privateCorpusText.text.id)).toBe(false);
    expect(all.some((pick) => pick.textId === assessment.text.id)).toBe(false);
  });
});
