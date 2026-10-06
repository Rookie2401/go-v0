import { describe, expect, it } from 'vitest';
import type { LanguageCode } from '../../src/core';
import { buildPlayerManifest, canonicalTextSha256, editionIdOf, encodeWav, releaseIdOf } from '../../src/golisten';
import type { AudioImportManifest } from '../../src/core/contracts/golisten';
import { FakeSpeechProvider, LANGS, addScripture, addStory, makeEnv } from './support';

const sineWav = (durationMs = 1600) => {
  const n = Math.floor(22050 * durationMs / 1000);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin(i * 2 * Math.PI * 220 / 22050) * 0.15;
  return encodeWav({ samples, sampleRate: 22050, channels: 1 });
};

async function fixture(lang: LanguageCode = 'de') {
  const env = await makeEnv();
  const text = await addStory(env.store, lang);
  const sentences = (await env.store.sentences.where('textId', text.id)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const manifest: AudioImportManifest = {
    id: 'test-de-tone-fixture-v1', textId: text.id, contentVersion: text.contentVersion,
    textSha256: await canonicalTextSha256(text.id, text.contentVersion, sentences), releaseId: releaseIdOf(text),
    lang, locale: 'de-DE', narrator: 'synthetic fixture tone', kind: 'synthetic', qualityState: 'machine_checked',
    syntheticProvider: { id: 'test-tone-provider', terms: 'No retention; unit-test only.', retention: 'none' }, textDerivative: 'allowed',
    recording: { owner: 'GoListen unit-test fixture', basis: 'Locally generated tone; not speech', attribution: 'Unit-test-only synthetic tone' },
    performance: { performer: 'test-tone-provider', permission: 'Unit-test generation' },
    rights: { status: 'approved', playInApp: true, stream: true, offline: true, redistribute: false, segment: true, transform: false,
      textDerivative: 'allowed', providerRetention: 'none' },
    coverage: sentences.map((s, i) => ({ sentenceId: s.id, startMs: i * 450, endMs: (i + 1) * 450, reviewState: 'reviewed' })),
  };
  return { ...env, text, sentences, manifest, bytes: sineWav() };
}

describe('rights-aware local recording import', () => {
  it.each(LANGS)('binds only the selected %s text release and leaves its script untouched', async (lang) => {
    const f = await fixture(lang);
    const result = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated' });
    expect(result.asset.lang).toBe(lang);
    expect(result.asset.textBinding).toMatchObject({ textId: f.text.id, releaseId: `${f.text.id}@${f.text.contentVersion}`, textSha256: f.manifest.textSha256 });
    expect((await f.store.sentences.where('textId', f.text.id)).map((s) => s.text)).toEqual(f.sentences.map((s) => s.text));
  });

  it('binds reviewed WAV timing to the exact text release and exposes rights-bound sentence ranges', async () => {
    const f = await fixture();
    const result = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated', reviewer: 'Unit-test alignment reviewer' });
    expect(result.manifest.complete).toBe(true);
    expect(result.imported).toBe(3);
    expect(result.asset).toMatchObject({ audioKind: 'synthetic', sourceType: 'generated-tts', qualityState: 'machine_checked', textBinding: { textId: f.text.id, contentVersion: f.text.contentVersion, textSha256: f.manifest.textSha256 } });
    expect(await f.gl.assetUrl(result.asset.id)).toBeTruthy();
    expect(await f.gl.offlinePackage(result.asset.id)).toMatchObject({ asset: { rights: { offline: true } }, rights: { attribution: 'Unit-test-only synthetic tone' } });
    const pm = await buildPlayerManifest(f.store, result.manifest);
    expect(pm.segments.map((s) => s.rangeMs)).toEqual([{ startMs: 0, endMs: 450 }, { startMs: 450, endMs: 900 }, { startMs: 900, endMs: 1350 }]);
    expect(pm.segments.every((s) => s.playAllowed && s.exactTextBound && s.qualityState === 'machine_checked')).toBe(true);
  });

  it('does not trust a learner-provided reviewed timing claim', async () => {
    const f = await fixture();
    const result = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'learner' });
    const alignments = await f.store.alignments.where('assetId', result.asset.id);
    expect(alignments).toHaveLength(0);
    const player = await buildPlayerManifest(f.store, result.manifest);
    expect(player.segments).toHaveLength(1);
    expect(player.segments[0]).toMatchObject({ rangeMs: undefined, reviewedAlignmentIds: [] });
    expect(player.segments[0].sentenceIds).toEqual(f.sentences.map((s) => s.id));
    expect(result.asset.qualityState).toBe('machine_checked');
  });

  it('persists reviewed sentence timings only for curated import with a named reviewer', async () => {
    const f = await fixture();
    const result = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated', reviewer: 'Unit-test alignment reviewer' });
    const alignments = await f.store.alignments.where('assetId', result.asset.id);
    expect(alignments).toHaveLength(f.sentences.length);
    expect(alignments.every((a) => a.reviewState === 'reviewed')).toBe(true);
    const player = await buildPlayerManifest(f.store, result.manifest);
    expect(player.segments.map((s) => s.rangeMs)).toEqual(f.manifest.coverage.map((c) => ({ startMs: c.startMs, endMs: c.endMs })));
  });

  it('keeps a lawful imported recording playable when a default TTS provider is registered', async () => {
    const f = await fixture();
    const imported = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated' });
    f.gl.registerProvider(new FakeSpeechProvider());
    f.gl.setDefaultProvider('fake-speech');
    const status = await f.gl.audioStatus(f.text.id);
    expect(status).toMatchObject({ state: 'preview-only', playAllowed: true, sourceType: 'generated-tts' });
    expect(await f.gl.getManifest(f.text.id)).toMatchObject({ id: imported.manifest.id, voiceConfigId: imported.manifest.voiceConfigId });
  });

  it('is idempotent for an exact same import and rejects conflicting claims over identical bytes', async () => {
    const f = await fixture();
    const first = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated' });
    const again = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated' });
    expect(again.asset.id).toBe(first.asset.id);
    expect(again.reused).toBe(true);
    await expect(f.gl.importRecording({ manifest: { ...f.manifest, id: 'different-narrator', narrator: 'Someone else' }, bytes: f.bytes, origin: 'curated' }))
      .rejects.toThrow(/different text, rights, speaker/);
  });

  it('rejects a text hash, release, Bible edition, or THSV11 mismatch', async () => {
    const f = await fixture();
    await expect(f.gl.importRecording({ manifest: { ...f.manifest, textSha256: '0'.repeat(64) }, bytes: f.bytes, origin: 'curated' })).rejects.toThrow(/SHA-256 mismatch/);
    await expect(f.gl.importRecording({ manifest: { ...f.manifest, releaseId: 'other-release' }, bytes: f.bytes, origin: 'curated' })).rejects.toThrow(/release/);
    const bible = await addScripture(f.store, 'de');
    const bibleSentences = (await f.store.sentences.where('textId', bible.id)).filter((s) => s.retiredInVersion === undefined);
    const badEdition: AudioImportManifest = { ...f.manifest, id: 'wrong-edition', textId: bible.id, lang: 'de', contentVersion: bible.contentVersion,
      releaseId: releaseIdOf(bible), editionId: `${editionIdOf(bible)}-other`, textSha256: await canonicalTextSha256(bible.id, bible.contentVersion, bibleSentences), coverage: bibleSentences.map((s, i) => ({ sentenceId: s.id, startMs: i * 400, endMs: (i + 1) * 400, reviewState: 'reviewed' })) };
    await expect(f.gl.importRecording({ manifest: badEdition, bytes: f.bytes, origin: 'curated' })).rejects.toThrow(/Bible edition mismatch/);
    await f.store.texts.put({ ...f.text, version: 'THSV11' });
    await expect(f.gl.importRecording({ manifest: { ...f.manifest, textSha256: await canonicalTextSha256(f.text.id, f.text.contentVersion, f.sentences) }, bytes: f.bytes, origin: 'curated' })).rejects.toThrow(/THSV11/);
  });

  it('rejects pending, denied, revoked, missing, and non-play rights', async () => {
    const f = await fixture();
    for (const rights of [
      { ...f.manifest.rights, status: 'pending' as const },
      { ...f.manifest.rights, status: 'denied' as const },
      { ...f.manifest.rights, status: 'revoked' as const },
      { ...f.manifest.rights, playInApp: false },
    ]) await expect(f.gl.importRecording({ manifest: { ...f.manifest, id: `rights-${rights.status}`, rights }, bytes: f.bytes, origin: 'curated' })).rejects.toThrow(/not approved/);
  });

  it('requires segmentation permission for a cropped single-sentence excerpt and rejects QA-rejected audio', async () => {
    const f = await fixture();
    const one = f.manifest.coverage[0];
    await expect(f.gl.importRecording({ manifest: { ...f.manifest, id: 'cropped-one-no-seg', rights: { ...f.manifest.rights, segment: false }, coverage: [{ ...one, startMs: 20, endMs: 400 }] }, bytes: f.bytes, origin: 'curated' }))
      .rejects.toThrow(/segmentation permission/);
    await expect(f.gl.importRecording({ manifest: { ...f.manifest, id: 'rejected-qa', qualityState: 'rejected' }, bytes: f.bytes, origin: 'curated' }))
      .rejects.toThrow(/marked rejected/);
  });

  it('keeps checked-only timing coarse and supports lawful partial passage coverage', async () => {
    const f = await fixture();
    const partial = { ...f.manifest, id: 'coarse-partial', coverage: [{ ...f.manifest.coverage[0], reviewState: 'checked' as const }] };
    const result = await f.gl.importRecording({ manifest: partial, bytes: f.bytes, origin: 'curated' });
    expect(result.manifest.complete).toBe(false);
    expect(result.manifest.segmentIds).toHaveLength(1);
    expect(await f.gl.alignments(result.manifest.segmentIds[0])).toEqual([]);
    const player = await buildPlayerManifest(f.store, result.manifest);
    expect(player.segments[0].rangeMs).toBeUndefined();
    expect(player.segments[0].sentenceIds).toEqual([f.sentences[0].id]);
  });

  it('blocks playback and offline packaging after revocation or exact-text mutation', async () => {
    const f = await fixture();
    const result = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated' });
    const revoked = { ...result.asset, rights: { ...result.asset.rights!, status: 'revoked' as const } };
    await f.store.audioAssets.put(revoked);
    expect(await f.gl.assetUrl(revoked.id)).toBeUndefined();
    expect(await f.gl.offlinePackage(revoked.id)).toBeUndefined();
    await f.store.audioAssets.put(result.asset);
    await f.store.sentences.put({ ...f.sentences[0], text: f.sentences[0].text + ' changed' });
    expect(await f.gl.assetUrl(result.asset.id)).toBeUndefined();
    expect(await f.gl.offlinePackage(result.asset.id)).toBeUndefined();
  });

  it('preserves complete rights and exact text metadata in an offline package', async () => {
    const f = await fixture();
    const result = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated' });
    const offline = await f.gl.offlinePackage(result.asset.id);
    expect(offline?.bytes).toEqual(f.bytes);
    expect(offline?.textBinding).toMatchObject({ releaseId: f.manifest.releaseId, editionId: undefined, textSha256: f.manifest.textSha256 });
    expect(offline?.rights).toMatchObject({ status: 'approved', offline: true, attribution: 'Unit-test-only synthetic tone' });
  });
});
