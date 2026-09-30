import { describe, expect, it } from 'vitest';
import { hash } from '../../src/core';
import { FixtureTtsProvider } from '../../src/golisten';
import { LANGS, STORY, makeEnv } from './support';

const sentenceText = (lang: (typeof LANGS)[number]) => {
  const sep = lang === 'th' ? '' : ' ';
  return STORY[lang][0].tokens.map((t, i) => (i > 0 && t.isWord !== false ? sep : '') + t.surface).join('');
};

describe.each(LANGS)('ensureSentenceAudio - testimony sentences (%s)', (lang) => {
  it('creates a synthetic text-less segment keyed on the context, ready only with a validated asset', async () => {
    const { store, gl } = await makeEnv();
    const text = sentenceText(lang);
    const ctx = `tst:u1:${lang}/r1/s0`;
    const seg = await gl.ensureSentenceAudio({ lang, text, ownerId: 'u1', contextId: ctx, runNow: true });
    expect(seg.status).toBe('ready');
    expect(seg.sentenceIds).toEqual([]);
    expect(seg.textId).toBe(ctx);
    expect(seg.displayText).toBe(text);
    expect(seg.speechText).toBe(text);
    expect(seg.assetId).toBeTruthy();
    const asset = (await gl.getAsset(seg.assetId!))!;
    expect(asset.validation!.ok).toBe(true);
    expect(asset.generation).toMatchObject({ providerId: 'fixture', sourceTextHash: hash(text) });
    expect(await store.assets.has(asset.id)).toBe(true);
    expect(await gl.alignments(seg.id)).toEqual([]); // no sentence ids -> nothing to align by construction
    expect((await gl.diagnostics(ctx)).segments.map((s) => s.segmentId)).toEqual([seg.id]);
  });

  it('is idempotent and content-addressed: the same sentence in a later revision reuses the audio', async () => {
    const { store, gl } = await makeEnv();
    const fixture = gl.providers()[0] as FixtureTtsProvider;
    const text = sentenceText(lang);
    const a = await gl.ensureSentenceAudio({ lang, text, ownerId: 'u1', contextId: 'r1/s0', runNow: true });
    const again = await gl.ensureSentenceAudio({ lang, text, ownerId: 'u1', contextId: 'r2/s0', runNow: true });
    expect(again.id).toBe(a.id);
    expect(again.status).toBe('ready');
    expect(fixture.calls).toHaveLength(1);
    expect(await store.audioAssets.count()).toBe(1);
    const other = await gl.ensureSentenceAudio({ lang, text: sentenceText(lang) + ' ' + sentenceText(lang), ownerId: 'u1', contextId: 'r2/s1', runNow: true });
    expect(other.id).not.toBe(a.id);
    expect(fixture.calls).toHaveLength(2);
  });
});

describe('ensureSentenceAudio details', () => {
  it('returns a pending segment without an asset when runNow is false, and runJobs completes it', async () => {
    const { store, gl } = await makeEnv();
    const seg = await gl.ensureSentenceAudio({ lang: 'de', text: 'Ich glaube an Gott.', ownerId: 'u1', contextId: 'r1/s0' });
    expect(seg.status).toBe('pending');
    expect(seg.assetId).toBeUndefined();
    expect(await store.audioAssets.count()).toBe(0);
    expect(await gl.runJobs()).toBe(1);
    const ready = (await gl.getSegment(seg.id))!;
    expect(ready.status).toBe('ready');
    expect(ready.assetId).toBeTruthy();
  });

  it('never speaks a bracketed verse marker pasted into a testimony sentence', async () => {
    const { gl } = await makeEnv();
    const seg = await gl.ensureSentenceAudio({ lang: 'es', text: '[16] Dios me perdonó.', ownerId: 'u1', contextId: 'r1/s0', runNow: true });
    expect(seg.displayText).toBe('[16] Dios me perdonó.');
    expect(seg.speechText).toBe('Dios me perdonó.');
    expect(seg.speechText).not.toMatch(/\d/);
  });

  it('rejects empty text and does not call the provider for it', async () => {
    const { gl } = await makeEnv();
    const fixture = gl.providers()[0] as FixtureTtsProvider;
    await expect(gl.ensureSentenceAudio({ lang: 'th', text: '   ', ownerId: 'u1', contextId: 'r1/s0' })).rejects.toThrow(/empty/);
    expect(fixture.calls).toHaveLength(0);
  });

  it('a testimony sentence that is only punctuation is failed, never ready', async () => {
    const { gl } = await makeEnv();
    const seg = await gl.ensureSentenceAudio({ lang: 'es', text: '...', ownerId: 'u1', contextId: 'r1/s0', runNow: true });
    expect(seg.status).toBe('failed');
    expect(seg.assetId).toBeUndefined();
  });
});
