/**
 * A recording manifest filled in from a template (audio:packet) must not import while a slot still holds the template's
 * placeholder ("<name of the speaker>"): the importer is the real gate, not the packet's own readiness check.
 */
import { describe, expect, it } from 'vitest';
import { canonicalTextSha256, encodeWav, releaseIdOf } from '../../src/golisten';
import type { AudioImportManifest } from '../../src/core/contracts/golisten';
import { addStory, makeEnv } from './support';

const sineWav = (durationMs = 1600) => {
  const n = Math.floor(22050 * durationMs / 1000);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin(i * 2 * Math.PI * 220 / 22050) * 0.15;
  return encodeWav({ samples, sampleRate: 22050, channels: 1 });
};

async function fixture() {
  const env = await makeEnv({ allowFixture: false });
  const text = await addStory(env.store, 'de');
  const sentences = (await env.store.sentences.where('textId', text.id)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const manifest: AudioImportManifest = {
    id: 'from-a-template', textId: text.id, contentVersion: text.contentVersion,
    textSha256: await canonicalTextSha256(text.id, text.contentVersion, sentences), releaseId: releaseIdOf(text),
    lang: 'de', locale: 'de-DE', narrator: 'A. Speaker', kind: 'human', qualityState: 'approved',
    recording: { owner: 'A. Speaker', basis: 'Recorded by the speaker for this app' },
    performance: { performer: 'A. Speaker', permission: 'The speaker agreed to play-back in the app' },
    rights: { status: 'approved', playInApp: true, stream: true, offline: false, redistribute: false, segment: true, transform: false },
    coverage: sentences.map((s, i) => ({ sentenceId: s.id, startMs: i * 450, endMs: (i + 1) * 450, reviewState: 'reviewed' as const })),
  };
  return { ...env, manifest, bytes: sineWav() };
}

describe('template placeholders never import', () => {
  const required: Array<[string, (m: AudioImportManifest) => AudioImportManifest]> = [
    ['narrator', (m) => ({ ...m, narrator: '<name of the speaker>' })],
    ['locale', (m) => ({ ...m, locale: ' <locale> ' })],
    ['recording owner', (m) => ({ ...m, recording: { ...m.recording, owner: '<who owns the recording>' } })],
    ['recording basis', (m) => ({ ...m, recording: { ...m.recording, basis: '<>' } })],
    ['performer', (m) => ({ ...m, performance: { ...m.performance, performer: '<speaker>' } })],
    ['performance permission', (m) => ({ ...m, performance: { ...m.performance, permission: '<what the speaker agreed to>' } })],
    ['recording licence', (m) => ({ ...m, recording: { ...m.recording, license: '<licence, if any>' } })],
    ['attribution', (m) => ({ ...m, recording: { ...m.recording, attribution: '<credit line>' } })],
  ];
  for (const [name, edit] of required) {
    it(`refuses a ${name} left as the placeholder, for curated and learner imports alike`, async () => {
      const f = await fixture();
      const manifest = edit(f.manifest);
      await expect(f.gl.importRecording({ manifest, bytes: f.bytes, origin: 'curated', reviewer: 'B. Reviewer' })).rejects.toThrow(new RegExp(`${name} is still the template placeholder`));
      await expect(f.gl.importRecording({ manifest, bytes: f.bytes, origin: 'learner' })).rejects.toThrow(/template placeholder/);
      expect(await f.store.audioAssets.all()).toHaveLength(0);
    });
  }

  it('refuses a reviewer left as the placeholder', async () => {
    const f = await fixture();
    await expect(f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated', reviewer: '<named person>' })).rejects.toThrow(/reviewer is still the template placeholder/);
  });

  it('a filled-in manifest still imports, angle brackets inside a real value included (an e-mail address in the attribution)', async () => {
    const f = await fixture();
    const manifest = { ...f.manifest, recording: { ...f.manifest.recording, attribution: 'A. Speaker <a.speaker@example.org>' } };
    const r = await f.gl.importRecording({ manifest, bytes: f.bytes, origin: 'curated', reviewer: 'B. Reviewer' });
    expect(r.asset).toMatchObject({ audioKind: 'human', qualityState: 'approved' });
  });
});
