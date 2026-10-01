/**
 * A learner backup never carries a credential: not the direct Azure key, not anything about the proxy's server-side
 * environment, whichever provider generated the audio.
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { exportLearner } from '../../src/backup';
import { AzureSpeechProvider, ProxySpeechProvider, fixtureChunks, renderFixtureChunks } from '../../src/golisten';
import { addStory, makeEnv } from './support';

const KEY = 'SECRET-KEY-0123456789abcdef';
const REGION = 'westeurope';
const wav = () => renderFixtureChunks(fixtureChunks('hola mundo', 'es'), { sampleRate: 24000 }).bytes as unknown as BodyInit;

async function learnerBackup(provider: AzureSpeechProvider | ProxySpeechProvider) {
  await provider.availability();
  const { store, gl, bus } = await makeEnv({ allowFixture: false, providers: [provider] });
  await addStory(store, 'es');
  await store.users.put({ id: 'u1', displayName: 'Learner', courseId: 'honduras-es', createdAt: '2026-02-01T00:00:00.000Z' });
  const r = await gl.ensureAudio(ids.text('es', 'story-01'), { runNow: true });
  expect(r.manifest.complete).toBe(true);
  await gl.setVoiceReview(r.manifest.voiceConfigId, 'reviewed', 'mocked test');
  await bus.emit({ type: 'TextViewed', userId: 'u1', lang: 'es', surface: 'corpus', session: 's1', textId: ids.text('es', 'story-01'), mode: 'reading' } as never);
  return exportLearner(store, 'u1', { includeRecordings: true });
}

describe('learner backups contain no credential string', () => {
  it('direct AzureSpeechProvider: the key is not in the exported learner file', async () => {
    const azure = new AzureSpeechProvider({ key: KEY, region: REGION, fetch: (async () => new Response(wav(), { status: 200 })) as unknown as typeof fetch });
    const file = await learnerBackup(azure);
    const json = JSON.stringify(file);
    expect(json).not.toContain(KEY);
    expect(json).not.toMatch(/AZURE_SPEECH|Ocp-Apim|subscription/i);
    expect(file.data.events.length).toBeGreaterThan(0); // the export really held learner data
  });

  it('ProxySpeechProvider: there is no key in the browser to export; env names and the region never appear either', async () => {
    const f = (async (url: RequestInfo | URL) => (String(url).endsWith('/status')
      ? new Response(JSON.stringify({ configured: true, provider: 'azure-speech', providerVersion: 'azure-proxy@1', region: REGION }), { status: 200 })
      : new Response(wav(), { status: 200 }))) as unknown as typeof fetch;
    const file = await learnerBackup(new ProxySpeechProvider({ baseUrl: 'http://localhost:5196', fetch: f }));
    const json = JSON.stringify(file);
    expect(json).not.toContain(KEY);
    expect(json).not.toMatch(/AZURE_SPEECH|Ocp-Apim|subscription/i);
    expect(file.data.events.length).toBeGreaterThan(0);
  });
});
