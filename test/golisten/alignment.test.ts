import { describe, expect, it } from 'vitest';
import { ids, type LanguageCode, type WordMark } from '../../src/core';
import { LANGS, MarksTestProvider, addStory, makeEnv } from './support';

const tid = (lang: LanguageCode) => ids.text(lang, 'story-01');

async function setup(lang: LanguageCode, marksOpts: ConstructorParameters<typeof MarksTestProvider>[1] = {}, extra: { substitution?: { match: string; value: string } } = {}) {
  let provider!: MarksTestProvider;
  const env = await makeEnv({ providerFactory: (reg) => [(provider = new MarksTestProvider(reg, marksOpts))], defaultProviderId: 'marks-test' });
  await addStory(env.store, lang);
  if (extra.substitution) {
    await env.store.pronunciations.put({ id: 'sub1', lang, match: extra.substitution.match, mechanism: 'substitution', value: extra.substitution.value, provenance: 'human', reviewed: true, lexiconVersion: '1' });
  }
  const r = await env.gl.ensureAudio(tid(lang), { runNow: true });
  return { ...env, provider, r };
}

describe.each(LANGS)('word alignment from provider marks (%s)', (lang) => {
  it('maps every mark to the segmented token it covers (method provider-marks), keeping sentence alignment too', async () => {
    const { store, gl, r } = await setup(lang);
    expect(r.manifest.complete).toBe(true);
    for (let i = 0; i < 3; i++) {
      const seg = (await gl.getSegment(r.manifest.segmentIds[i]))!;
      const asset = (await gl.getAsset(seg.assetId!))!;
      const als = await gl.alignments(seg.id);
      const sentence = als.filter((a) => a.unit === 'sentence');
      expect(sentence).toHaveLength(1);
      expect(sentence[0]).toMatchObject({ method: 'by-construction', confidence: 1, startMs: 0, endMs: asset.durationMs });

      const words = als.filter((a) => a.unit === 'word');
      const tokens = (await store.tokens.where('sentenceId', seg.sentenceIds[0])).filter((t) => t.isWord).sort((a, b) => a.index - b.index);
      expect(words.map((w) => w.unitId).sort()).toEqual(tokens.map((t) => t.id).sort());
      // timings are strictly increasing in token order, inside the audio, and never invented
      const byToken = new Map(words.map((w) => [w.unitId, w]));
      let prevEnd = -1;
      for (const t of tokens) {
        const a = byToken.get(t.id)!;
        expect(a).toMatchObject({ method: 'provider-marks', confidence: 0.9, assetId: asset.id, segmentId: seg.id });
        expect(a.alignerVersion).toBe('provider:marks-test@test-1');
        expect(a.startMs).toBeGreaterThanOrEqual(prevEnd);
        expect(a.endMs).toBeGreaterThan(a.startMs);
        expect(a.endMs).toBeLessThanOrEqual(asset.durationMs);
        prevEnd = a.endMs;
      }
    }
    const d = await gl.diagnostics(tid(lang));
    expect(d.segments.every((s) => s.alignmentMethods.join() === 'by-construction,provider-marks' && s.minAlignmentConfidence === 0.9)).toBe(true);
  });
});

describe('word alignment policy', () => {
  it('Thai: marks land on the segmented tokens even though the text has no spaces', async () => {
    const { store, gl, r } = await setup('th');
    const seg = (await gl.getSegment(r.manifest.segmentIds[0]))!;
    const sentence = (await store.sentences.get(seg.sentenceIds[0]))!;
    expect(sentence.text).toBe('ฉันเชื่อในพระเจ้า');
    const tokens = (await store.tokens.where('sentenceId', sentence.id)).sort((a, b) => a.index - b.index);
    expect(tokens.map((t) => t.surface)).toEqual(['ฉัน', 'เชื่อ', 'ใน', 'พระเจ้า']);
    const words = (await gl.alignments(seg.id)).filter((a) => a.unit === 'word');
    expect(words).toHaveLength(4);
    expect(words.map((w) => w.unitId).sort()).toEqual(tokens.map((t) => t.id).sort());
  });

  it('the production fixture provider never yields word alignments (it is not speech)', async () => {
    const env = await makeEnv();
    await addStory(env.store, 'th');
    const r = await env.gl.ensureAudio(tid('th'), { runNow: true });
    for (const id of r.manifest.segmentIds) expect((await env.gl.alignments(id)).every((a) => a.unit === 'sentence' && a.method === 'by-construction')).toBe(true);
  });

  it('marks from a provider that does not declare trustworthy word boundaries are ignored (and logged)', async () => {
    const { gl, r, store } = await setup('es', { wordBoundaries: false });
    for (const id of r.manifest.segmentIds) expect((await gl.alignments(id)).every((a) => a.unit === 'sentence')).toBe(true);
    expect((await gl.jobs()).every((j) => j.log.some((l) => /does not declare trustworthy word boundaries/.test(l.message)))).toBe(true);
    expect(await store.alignments.count()).toBe(3);
  });

  const bad: Array<[string, (m: WordMark[]) => WordMark[], RegExp]> = [
    ['a mark that ends after the audio', (m) => m.map((x, i) => (i === 0 ? { ...x, endMs: x.endMs + 60_000 } : x)), /outside audio/],
    ['a mark outside the text', (m) => m.map((x, i) => (i === 0 ? { ...x, charEnd: 9999 } : x)), /outside text/],
    ['marks out of time order', (m) => [...m].reverse(), /time order/],
    ['a non-finite mark', (m) => m.map((x, i) => (i === 0 ? { ...x, startMs: Number.NaN } : x)), /non-finite/],
  ];
  it.each(bad)('rejects all marks for %s instead of repairing them', async (_name, mutate, pattern) => {
    const { gl, r } = await setup('de', { mutateMarks: mutate });
    expect(r.manifest.complete).toBe(true); // the audio itself is valid
    for (const id of r.manifest.segmentIds) expect((await gl.alignments(id)).every((a) => a.unit === 'sentence')).toBe(true);
    expect((await gl.jobs()).every((j) => j.log.some((l) => pattern.test(l.message)))).toBe(true);
  });

  it('a mark spanning several tokens is not split: those tokens stay unaligned', async () => {
    const merge = (m: WordMark[]) => [{ charStart: m[0].charStart, charEnd: m[1].charEnd, startMs: m[0].startMs, endMs: m[1].endMs }, ...m.slice(2)];
    const { gl, r, store } = await setup('de', { mutateMarks: merge });
    const seg = (await gl.getSegment(r.manifest.segmentIds[0]))!; // "Ich glaube an Gott."
    const words = (await gl.alignments(seg.id)).filter((a) => a.unit === 'word');
    const tokens = (await store.tokens.where('sentenceId', seg.sentenceIds[0])).filter((t) => t.isWord).sort((a, b) => a.index - b.index);
    expect(tokens).toHaveLength(4);
    expect(words.map((w) => w.unitId).sort()).toEqual([tokens[2].id, tokens[3].id].sort());
  });

  it('when speech text differs from display text, only matching tokens are aligned, with lower confidence', async () => {
    const { gl, r, store } = await setup('es', {}, { substitution: { match: 'Dios', value: 'Diós' } });
    const seg = (await gl.getSegment(r.manifest.segmentIds[0]))!; // display "Yo creo en Dios." speech "Yo creo en Diós."
    expect(seg.speechText).toBe('Yo creo en Diós.');
    const words = (await gl.alignments(seg.id)).filter((a) => a.unit === 'word');
    const tokens = (await store.tokens.where('sentenceId', seg.sentenceIds[0])).filter((t) => t.isWord).sort((a, b) => a.index - b.index);
    expect(words.map((w) => w.unitId).sort()).toEqual(tokens.slice(0, 3).map((t) => t.id).sort()); // "Dios" stays unaligned
    expect(words.every((w) => w.confidence === 0.7)).toBe(true);
    const d = await gl.diagnostics(tid('es'));
    expect(d.segments[0].minAlignmentConfidence).toBe(0.7);
  });
});
