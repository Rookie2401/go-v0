/**
 * Who vouches for a recording. A learner's upload is the uploader's own statement: it plays, but it is never a review and
 * never listening evidence. Only a curated import with a NAMED reviewer records a review. Synthetic speech is practice only.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LanguageCode } from '../../src/core';
import { buildPlayerManifest, canonicalTextSha256, encodeWav, readImportRecord, releaseIdOf, SYNTHETIC_PRACTICE } from '../../src/golisten';
import type { AudioImportManifest } from '../../src/core/contracts/golisten';
import { addStory, makeEnv } from './support';

const sineWav = (durationMs = 1600) => {
  const n = Math.floor(22050 * durationMs / 1000);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin(i * 2 * Math.PI * 220 / 22050) * 0.15;
  return encodeWav({ samples, sampleRate: 22050, channels: 1 });
};

/** A HUMAN recording manifest that claims the strongest things a manifest can claim. */
async function fixture(lang: LanguageCode = 'de', over: Partial<AudioImportManifest> = {}) {
  const env = await makeEnv({ allowFixture: false });
  const text = await addStory(env.store, lang);
  const sentences = (await env.store.sentences.where('textId', text.id)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const manifest: AudioImportManifest = {
    id: 'human-claims-everything', textId: text.id, contentVersion: text.contentVersion,
    textSha256: await canonicalTextSha256(text.id, text.contentVersion, sentences), releaseId: releaseIdOf(text),
    lang, locale: 'de-DE', narrator: 'A. Speaker', kind: 'human', qualityState: 'approved',
    recording: { owner: 'A. Speaker', basis: 'Recorded by the speaker for this app' },
    performance: { performer: 'A. Speaker', permission: 'The speaker agreed to play-back in the app' },
    rights: { status: 'approved', playInApp: true, stream: true, offline: false, redistribute: false, segment: true, transform: false },
    coverage: sentences.map((s, i) => ({ sentenceId: s.id, startMs: i * 450, endMs: (i + 1) * 450, reviewState: 'reviewed' as const })),
    ...over,
  };
  return { ...env, text, sentences, manifest, bytes: sineWav() };
}

describe('learner import: plays, but is not a review', () => {
  it('caps the quality at machine_checked, leaves the voice unreviewed, stamps no review, and records the claims as declared', async () => {
    const f = await fixture();
    // A manifest cannot smuggle in its own review stamp or rights id either.
    const sneaky = { ...f.manifest, rights: { ...f.manifest.rights, reviewedAt: '2020-01-01T00:00:00.000Z', id: 'rights:forged', recordingBasis: 'forged' } } as unknown as AudioImportManifest;
    const r = await f.gl.importRecording({ manifest: sneaky, bytes: f.bytes, origin: 'learner' });
    expect(r.asset).toMatchObject({ audioKind: 'human', qualityState: 'machine_checked' });
    expect(r.asset.rights!.reviewedAt).toBeUndefined();
    expect(r.asset.rights!.id).not.toBe('rights:forged');
    expect(r.asset.rights!.recordingBasis).toMatch(/^Stated by the uploader, not verified: Recorded by the speaker/);
    expect(r.asset.rights!.performancePermission).toMatch(/^Stated by the uploader, not verified:/);
    const voice = (await f.store.voices.get(r.manifest.voiceConfigId))!;
    expect(voice).toMatchObject({ approved: false, reviewStatus: 'unreviewed' });
    expect(voice.id).toMatch(/^learner-import:/);
    expect(voice.qaNote).toMatch(/uploader's own statements/);
    expect(await readImportRecord(f.store, r.asset.id)).toMatchObject({
      origin: 'learner', declaredKind: 'human', declaredQualityState: 'approved', declaredRightsStatus: 'approved', manifestId: 'human-claims-everything',
    });
    expect((await readImportRecord(f.store, r.asset.id))!.reviewer).toBeUndefined();
  });

  it('plays normally, but audioStatus says it is not listening evidence', async () => {
    const f = await fixture();
    const r = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'learner' });
    expect(await f.gl.assetUrl(r.asset.id)).toBeTruthy();
    const pm = await buildPlayerManifest(f.store, r.manifest);
    expect(pm.segments.every((s) => s.ready && s.playAllowed && s.qualityState === 'machine_checked')).toBe(true);
    const st = await f.gl.audioStatus(f.text.id);
    expect(st).toMatchObject({ state: 'preview-only', playAllowed: true, evidenceEligible: false, qualityState: 'machine_checked' });
    expect(st.reason).toMatch(/no named reviewer has approved it/);
  });

  it('a self-declared "synthetic" learner import is capped the same way', async () => {
    const f = await fixture('de', {
      kind: 'synthetic', qualityState: 'human_reviewed', textDerivative: 'allowed',
      syntheticProvider: { id: 'some-tts', terms: 'No retention', retention: 'none' },
      rights: { status: 'approved', playInApp: true, stream: true, offline: false, redistribute: false, segment: true, transform: false, textDerivative: 'allowed', providerRetention: 'none' },
    });
    const r = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'learner' });
    expect(r.asset.qualityState).toBe('machine_checked');
    expect((await f.gl.audioStatus(f.text.id)).evidenceEligible).toBe(false);
  });

  it('refuses a reviewer argument and an unknown origin', async () => {
    const f = await fixture();
    await expect(f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'learner', reviewer: 'Someone' })).rejects.toThrow(/cannot carry a reviewer/);
    await expect(f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes } as never)).rejects.toThrow(/origin must be/);
    await expect(f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'admin' } as never)).rejects.toThrow(/origin must be/);
    expect(await f.store.audioAssets.count()).toBe(0);
  });

  it('a learner re-import of the same bytes never changes a curated review (and cannot reuse its voice)', async () => {
    const f = await fixture();
    const curated = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated', reviewer: 'Dr. Reviewer' });
    const again = await f.gl.importRecording({ manifest: { ...f.manifest, id: 'same-bytes-by-learner' }, bytes: f.bytes, origin: 'learner' }).catch((e: unknown) => e);
    // Same bytes, but the rights id differs (it is derived from the manifest id): refused rather than merged.
    expect(String((again as Error).message)).toMatch(/identical audio bytes already have different/);
    const sameRights = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'learner' });
    expect(sameRights.reused).toBe(true);
    expect((await f.store.audioAssets.get(curated.asset.id))!.qualityState).toBe('approved');
    expect(await readImportRecord(f.store, curated.asset.id)).toMatchObject({ origin: 'curated', reviewer: 'Dr. Reviewer' });
    const learnerVoice = (await f.store.voices.get(sameRights.manifest.voiceConfigId))!;
    expect(learnerVoice).toMatchObject({ reviewStatus: 'unreviewed', approved: false });
    expect(sameRights.manifest.voiceConfigId).not.toBe(curated.manifest.voiceConfigId);
    // the curated manifest and its voice are untouched
    expect((await f.store.voices.get(curated.manifest.voiceConfigId))!.reviewStatus).toBe('reviewed');
  });
});

describe('curated import: a review is a fact a named person establishes', () => {
  it('requires a non-empty reviewer for human_reviewed and approved, and writes nothing without one', async () => {
    const f = await fixture();
    for (const reviewer of [undefined, '', '   ']) {
      await expect(f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated', reviewer })).rejects.toThrow(/name of the person who reviewed/);
    }
    await expect(f.gl.importRecording({ manifest: { ...f.manifest, qualityState: 'human_reviewed' }, bytes: f.bytes, origin: 'curated' })).rejects.toThrow(/reviewer/);
    expect(await f.store.audioAssets.count()).toBe(0);
    expect(await f.store.voices.count()).toBe(0);
  });

  it('records the reviewer and the review time, makes the voice reviewed, and the human recording becomes evidence-eligible', async () => {
    const f = await fixture();
    const r = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated', reviewer: '  Dr. Reviewer ' });
    expect(r.asset).toMatchObject({ audioKind: 'human', qualityState: 'approved' });
    expect(r.asset.rights!.reviewedAt).toBe(f.clock.now());
    expect(r.asset.rights!.recordingBasis).toBe('Recorded by the speaker for this app'); // not labelled as an unverified statement
    expect(await readImportRecord(f.store, r.asset.id)).toMatchObject({ origin: 'curated', reviewer: 'Dr. Reviewer', reviewedAt: f.clock.now(), declaredQualityState: 'approved' });
    const voice = (await f.store.voices.get(r.manifest.voiceConfigId))!;
    expect(voice).toMatchObject({ reviewStatus: 'reviewed', approved: true });
    expect(voice.qaNote).toMatch(/reviewed by Dr\. Reviewer/);
    expect(await f.gl.audioStatus(f.text.id)).toMatchObject({ state: 'ready', evidenceEligible: true, playAllowed: true, qualityState: 'approved' });
  });

  it('machine_checked needs no reviewer and stamps no review', async () => {
    const f = await fixture('de', { qualityState: 'machine_checked' });
    const r = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated' });
    expect(r.asset.rights!.reviewedAt).toBeUndefined();
    expect((await f.store.voices.get(r.manifest.voiceConfigId))!.reviewStatus).toBe('unreviewed');
    expect((await f.gl.audioStatus(f.text.id)).evidenceEligible).toBe(false);
  });

  it('a curated review may raise a machine-checked asset (same bytes, same rights) to reviewed, and the record names the reviewer', async () => {
    const f = await fixture('de', { qualityState: 'machine_checked' });
    await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated' });
    const upgraded = await f.gl.importRecording({ manifest: { ...f.manifest, qualityState: 'human_reviewed' }, bytes: f.bytes, origin: 'curated', reviewer: 'Dr. Reviewer' });
    expect(upgraded.asset.qualityState).toBe('human_reviewed');
    expect((await f.store.audioAssets.get(upgraded.asset.id))!.qualityState).toBe('human_reviewed');
    expect(await readImportRecord(f.store, upgraded.asset.id)).toMatchObject({ reviewer: 'Dr. Reviewer' });
    expect(await f.gl.audioStatus(f.text.id)).toMatchObject({ evidenceEligible: true });
  });

  it('a reviewed SYNTHETIC recording plays as practice and is never evidence', async () => {
    const f = await fixture('de', {
      kind: 'synthetic', qualityState: 'approved', textDerivative: 'allowed',
      syntheticProvider: { id: 'some-tts', terms: 'No retention', retention: 'none' },
      rights: { status: 'approved', playInApp: true, stream: true, offline: false, redistribute: false, segment: true, transform: false, textDerivative: 'allowed', providerRetention: 'none' },
    });
    await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated', reviewer: 'Dr. Reviewer' });
    const st = await f.gl.audioStatus(f.text.id);
    expect(st).toMatchObject({ state: 'ready', playAllowed: true, evidenceEligible: false, voiceReview: 'reviewed' });
    expect(st.reason).toBe(SYNTHETIC_PRACTICE);
    expect(st.reason).toMatch(/synthetic speech: practice only, not counted as listening/i);
  });
});

describe('eligibility changes are announced (so GoLearn can drop what it derived)', () => {
  it('import, re-import, voice review and revoked rights each notify, with the text where it is known', async () => {
    const f = await fixture();
    const seen: Array<string | undefined> = [];
    const off = f.gl.onEligibilityChange((id) => { seen.push(id); });
    const r = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated', reviewer: 'Dr. Reviewer' });
    await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated', reviewer: 'Dr. Reviewer' });
    expect(seen).toEqual([f.text.id, f.text.id]);
    await f.gl.setVoiceReview(r.manifest.voiceConfigId, 'unreviewed');
    expect(seen).toEqual([f.text.id, f.text.id, undefined]);
    expect((await f.gl.audioStatus(f.text.id)).evidenceEligible).toBe(false);
    await f.gl.setVoiceReview(r.manifest.voiceConfigId, 'reviewed');
    expect((await f.gl.audioStatus(f.text.id)).evidenceEligible).toBe(true);
    const revoked = await f.gl.revokeRights(r.asset.id);
    expect(revoked.rights!.status).toBe('revoked');
    expect(seen.at(-1)).toBe(f.text.id);
    expect(await f.gl.assetUrl(r.asset.id)).toBeUndefined();
    expect(await f.gl.audioStatus(f.text.id)).toMatchObject({ evidenceEligible: false, playAllowed: false });
    off();
    await f.gl.setVoiceReview(r.manifest.voiceConfigId, 'unreviewed');
    expect(seen).toHaveLength(5); // unsubscribed: the last change was not announced to this listener
  });

  it('a failing listener never fails the change', async () => {
    const f = await fixture();
    const bad = vi.fn(() => { throw new Error('boom'); });
    f.gl.onEligibilityChange(bad);
    const r = await f.gl.importRecording({ manifest: f.manifest, bytes: f.bytes, origin: 'curated', reviewer: 'Dr. Reviewer' });
    expect(r.imported).toBe(3);
    expect(bad).toHaveBeenCalledTimes(1);
  });
});
