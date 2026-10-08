/**
 * The optional speaker / writtenStandard / spokenTranscript / alignment declarations of an imported recording
 * (docs/norway/SPEC.md §6): validated when present, carried onto the stored asset and manifest, and invisible when absent.
 */
import { describe, expect, it } from 'vitest';
import type { LanguageCode } from '../../src/core';
import { canonicalTextSha256, encodeWav, releaseIdOf } from '../../src/golisten';
import type { AudioImportManifest } from '../../src/core/contracts/golisten';
import { addStory, makeEnv } from './support';

const sineWav = (durationMs = 1600) => {
  const n = Math.floor(22050 * durationMs / 1000);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin(i * 2 * Math.PI * 220 / 22050) * 0.15;
  return encodeWav({ samples, sampleRate: 22050, channels: 1 });
};

async function fixture(lang: LanguageCode = 'nb', extra: Partial<AudioImportManifest> = {}) {
  const env = await makeEnv();
  const text = await addStory(env.store, lang);
  const sentences = (await env.store.sentences.where('textId', text.id)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const manifest: AudioImportManifest = {
    id: `test-${lang}-meta-v1`, textId: text.id, contentVersion: text.contentVersion,
    textSha256: await canonicalTextSha256(text.id, text.contentVersion, sentences), releaseId: releaseIdOf(text),
    lang, locale: lang === 'nn' ? 'nn-NO' : 'nb-NO', narrator: 'synthetic fixture tone', kind: 'synthetic', qualityState: 'machine_checked',
    syntheticProvider: { id: 'test-tone-provider', terms: 'No retention; unit-test only.', retention: 'none' }, textDerivative: 'allowed',
    recording: { owner: 'GoListen unit-test fixture', basis: 'Locally generated tone; not speech', attribution: 'Unit-test-only synthetic tone' },
    performance: { performer: 'test-tone-provider', permission: 'Unit-test generation' },
    rights: { status: 'approved', playInApp: true, stream: true, offline: true, redistribute: false, segment: true, transform: false,
      textDerivative: 'allowed', providerRetention: 'none' },
    coverage: sentences.map((s, i) => ({ sentenceId: s.id, startMs: i * 450, endMs: (i + 1) * 450, reviewState: 'reviewed' as const })),
    ...extra,
  };
  return { ...env, text, sentences, manifest, bytes: sineWav() };
}

type F = Awaited<ReturnType<typeof fixture>>;
const run = (f: F, manifest: AudioImportManifest = f.manifest, origin: 'curated' | 'learner' = 'curated') => f.gl.importRecording({ manifest, bytes: f.bytes, origin });
const rejects = async (f: F, patch: Partial<AudioImportManifest>, re: RegExp) => {
  await expect(run(f, { ...f.manifest, ...patch })).rejects.toThrow(re);
};

describe('recording metadata: validation', () => {
  it('speaker needs a non-empty id, boolean native and text fields, and never a template placeholder', async () => {
    const f = await fixture();
    await rejects(f, { speaker: { id: '' } }, /speaker id is required/);
    await rejects(f, { speaker: { id: '   ' } }, /speaker id is required/);
    await rejects(f, { speaker: { id: '<speaker id>' } }, /placeholder/);
    await rejects(f, { speaker: { id: 's1', native: 'yes' as unknown as boolean } }, /native must be true or false/);
    await rejects(f, { speaker: { id: 's1', region: 7 as unknown as string } }, /region must be text/);
    await rejects(f, { speaker: { id: 's1', dialect: '<dialect>' } }, /placeholder/);
    await rejects(f, { speaker: 'Kari' as unknown as AudioImportManifest['speaker'] }, /speaker must be an object/);
  });

  it("writtenStandard is 'nb' or 'nn', only for Norwegian texts, and must match the text's language", async () => {
    const nb = await fixture('nb');
    await rejects(nb, { writtenStandard: 'no' as unknown as 'nb' }, /must be 'nb' or 'nn'/);
    await rejects(nb, { writtenStandard: 'nn' }, /does not match the text's language nb/);
    const nn = await fixture('nn');
    await rejects(nn, { writtenStandard: 'nb' }, /does not match the text's language nn/);
    const de = await fixture('de');
    await rejects(de, { writtenStandard: 'nb' }, /only to Norwegian/);
    await expect(run(nn, { ...nn.manifest, writtenStandard: 'nn' })).resolves.toBeTruthy();
  });

  it('spokenTranscript sentence ids must be sentences of the text; spoken wording is required; no sentence twice', async () => {
    const f = await fixture();
    const [s0, s1] = f.sentences;
    await rejects(f, { spokenTranscript: [{ sentenceId: 'nb:nope/s9', spoken: 'e' }] }, /unknown or retired sentence/);
    await rejects(f, { spokenTranscript: [{ sentenceId: s0.id, spoken: '' }] }, /spoken wording/);
    await rejects(f, { spokenTranscript: [{ sentenceId: s0.id, spoken: 'a' }, { sentenceId: s0.id, spoken: 'b' }] }, /twice/);
    await rejects(f, { spokenTranscript: 'e' as unknown as [] }, /must be a list/);
    await expect(run(f, { ...f.manifest, spokenTranscript: [{ sentenceId: s0.id, spoken: 'eg kan ikkje' }, { sentenceId: s1.id, spoken: 'e' }] })).resolves.toBeTruthy();
  });

  it('alignment unit is sentence | phrase | word; confidence is 0..1; method is text', async () => {
    const f = await fixture();
    await rejects(f, { alignment: { unit: 'syllable' as unknown as 'word' } }, /alignment unit must be one of/);
    await rejects(f, { alignment: { unit: 'word', confidence: 1.2 } }, /confidence must be a number from 0 to 1/);
    await rejects(f, { alignment: { unit: 'word', confidence: -0.1 } }, /confidence must be a number from 0 to 1/);
    await rejects(f, { alignment: { unit: 'word', confidence: Number.NaN } }, /confidence must be a number from 0 to 1/);
    await rejects(f, { alignment: { unit: 'word', method: '' } }, /alignment method is required/);
    for (const [i, unit] of (['sentence', 'phrase', 'word'] as const).entries()) {
      const g = await fixture('nb', { id: `unit-${i}`, alignment: { unit, confidence: i / 2 } });
      await expect(run(g)).resolves.toBeTruthy();
    }
  });
});

describe('recording metadata: carried onto the stored asset and manifest', () => {
  it('stores every declaration as given (known fields only), and the manifest keeps the short forms', async () => {
    const f = await fixture('nn');
    const s0 = f.sentences[0];
    const r = await run(f, {
      ...f.manifest, writtenStandard: 'nn',
      speaker: { id: ' spk-bergen-01 ', native: true, region: 'west', locality: 'Bergen', dialect: 'bergensk', extra: 'dropped' } as AudioImportManifest['speaker'],
      spokenTranscript: [{ sentenceId: s0.id, spoken: 'eg e ikkje' }],
      alignment: { unit: 'phrase', method: 'forced-aligner', confidence: 0.82 },
    });
    expect(r.asset.speaker).toEqual({ id: 'spk-bergen-01', native: true, region: 'west', locality: 'Bergen', dialect: 'bergensk' });
    expect(r.asset.writtenStandard).toBe('nn');
    expect(r.asset.spokenTranscript).toEqual([{ sentenceId: s0.id, spoken: 'eg e ikkje' }]);
    expect(r.asset.alignment).toEqual({ unit: 'phrase', method: 'forced-aligner', confidence: 0.82 });
    expect(r.manifest).toMatchObject({ speakerId: 'spk-bergen-01', writtenStandard: 'nn', alignmentUnit: 'phrase' });
    const stored = await f.store.audioAssets.get(r.asset.id);
    expect(stored?.speaker?.id).toBe('spk-bergen-01');
    expect((await f.store.manifests.get(r.manifest.id))?.writtenStandard).toBe('nn');
    // the text is untouched: the spoken wording is a declaration about the recording, not an edit of the script
    expect((await f.store.sentences.get(s0.id))?.text).toBe(s0.text);
  });

  it('a manifest that omits them gets no such keys at all (behaviour unchanged)', async () => {
    const f = await fixture('nb');
    const r = await run(f);
    for (const k of ['speaker', 'writtenStandard', 'spokenTranscript', 'alignment']) expect(Object.prototype.hasOwnProperty.call(r.asset, k)).toBe(false);
    for (const k of ['speakerId', 'writtenStandard', 'alignmentUnit']) expect(Object.prototype.hasOwnProperty.call(r.manifest, k)).toBe(false);
    // and an existing-style re-import of the same bytes is still idempotent
    const again = await run(f);
    expect(again.reused).toBe(true);
    expect(again.asset).toEqual(r.asset);
  });

  it('identical bytes with a different speaker are refused like any other conflicting metadata; the same declaration is idempotent', async () => {
    const f = await fixture('nb', { speaker: { id: 'a', native: true } });
    const first = await run(f);
    expect((await run(f)).reused).toBe(true);
    await expect(run(f, { ...f.manifest, speaker: { id: 'b', native: true } })).rejects.toThrow(/different text, rights, speaker/);
    await expect(run(f, { ...f.manifest, speaker: undefined })).rejects.toThrow(/different text, rights, speaker/);
    expect((await f.store.audioAssets.get(first.asset.id))?.speaker?.id).toBe('a');
  });

  it('a learner import may carry them too; they are declarations and change no trust fact', async () => {
    const f = await fixture('nb', { writtenStandard: 'nb', speaker: { id: 'learner-voice', native: false } });
    const r = await run(f, f.manifest, 'learner');
    expect(r.asset.speaker).toEqual({ id: 'learner-voice', native: false });
    expect(r.asset.qualityState).toBe('machine_checked');
    expect(r.asset.rights?.reviewedAt).toBeUndefined();
  });
});
