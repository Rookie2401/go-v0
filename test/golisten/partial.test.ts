/**
 * Partial generation is visible and usable: when some sentences are ready and others failed (or are still pending), the
 * status says "x of y sentences ready; n failed: <first error>", diagnostics name the failed sentences, and the ready
 * ones stay playable.
 */
import { describe, expect, it } from 'vitest';
import { ids, type LanguageCode, type SynthesisRequest, type SynthesisResult } from '../../src/core';
import { PlayerMachine, TtsProviderError, buildPlayerManifest, createPlayerModel, playableIndexes } from '../../src/golisten';
import { FakeSpeechProvider, LANGS, STORY, addStory, makeEnv, replaceSentence } from './support';

const tid = (lang: LanguageCode) => ids.text(lang, 'story-01');

/** TEST-ONLY real-speech stand-in that fails for chosen sentence texts. `kind` decides whether a retry could help. */
class SelectiveProvider extends FakeSpeechProvider {
  failing = new Set<string>();
  constructor(private readonly kind: 'bad-request' | 'server' = 'bad-request') { super({ id: 'selective', version: '1' }); }
  override async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    if (this.failing.has(req.text)) throw new TtsProviderError(this.kind, `refused "${req.text}"`);
    return super.synthesize(req);
  }
}
const sentenceText = (lang: LanguageCode, i: number) => {
  const s = STORY[lang][i];
  return s.tokens.map((t) => t.surface).join(lang === 'th' ? '' : ' ').replace(/ ([.।])/g, '$1');
};

describe.each(LANGS)('partial generation (%s)', (lang) => {
  it('a failed sentence among ready ones: failed state, "2 of 3 sentences ready; 1 failed: <error>", failed sentence listed, ready ones playable', async () => {
    const p = new SelectiveProvider('bad-request');
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [p] });
    const text = await addStory(store, lang);
    const failing = (await store.sentences.where('textId', text.id)).find((s) => s.index === 0)!;
    p.failing.add(failing.text);

    const r = await gl.ensureAudio(tid(lang), { runNow: true });
    expect(r).toMatchObject({ failed: 1 });
    expect(r.manifest.complete).toBe(false);

    const st = await gl.audioStatus(tid(lang));
    expect(st).toMatchObject({ state: 'failed', readySegments: 2, totalSegments: 3, failedSegments: 1, evidenceEligible: false });
    expect(st.reason).toMatch(/^2 of 3 sentences ready; 1 failed: bad-request: refused /);
    expect(st.reason).toContain(failing.text);
    expect(st.reason).toMatch(/ready sentences can still be played/);

    const d = await gl.diagnostics(tid(lang));
    expect(d.deadJobs).toBe(1);
    expect(d.failedSentences).toHaveLength(1);
    expect(d.failedSentences![0]).toMatchObject({ sentenceId: failing.id, index: 0, text: failing.text, attempts: 1 });
    expect(d.failedSentences![0].error).toMatch(/^bad-request: refused /);
    expect((await gl.diagnostics()).failedSentences).toBeUndefined(); // only asked for a text

    // the manifest lists every sentence; the ready ones are playable, the failed one is skipped
    const pm = await buildPlayerManifest(store, r.manifest);
    expect(pm.segments).toHaveLength(3);
    expect(pm.segments.map((s) => s.ready)).toEqual([false, true, true]);
    expect(playableIndexes(pm)).toEqual([1, 2]);
    expect(createPlayerModel(pm).segmentIndex).toBe(1); // starts at the first ready sentence
    const machine = new PlayerMachine(pm);
    const effects = machine.dispatch({ type: 'play' });
    expect(effects.some((e) => e.type === 'load' && e.segmentIndex === 1)).toBe(true);
    expect(effects.some((e) => e.type === 'load' && e.segmentIndex === 0)).toBe(false);
  });

  it('retrying failed sentences recovers the rest of the text', async () => {
    const p = new SelectiveProvider('bad-request');
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [p] });
    const text = await addStory(store, lang);
    const failing = (await store.sentences.where('textId', text.id)).find((s) => s.index === 2)!;
    p.failing.add(failing.text);
    await gl.ensureAudio(tid(lang), { runNow: true });
    expect((await gl.audioStatus(tid(lang))).reason).toMatch(/^2 of 3 sentences ready; 1 failed:/);
    p.failing.clear();
    expect(await gl.retryDead()).toBe(1);
    await gl.runJobs();
    expect((await gl.getManifest(tid(lang)))!.complete).toBe(true);
    const st = await gl.audioStatus(tid(lang));
    expect(st.state).toBe('preview-only');
    expect((await gl.diagnostics(tid(lang))).failedSentences).toEqual([]);
  });

  it('a sentence still being retried is not "failed": generating, with the ready count and the retry reason', async () => {
    const p = new SelectiveProvider('server');
    const { store, gl, clock } = await makeEnv({ allowFixture: false, providers: [p], maxAttempts: 2, backoffBaseMs: 10 });
    const text = await addStory(store, lang);
    const failing = (await store.sentences.where('textId', text.id)).find((s) => s.index === 1)!;
    p.failing.add(failing.text);
    await gl.ensureAudio(tid(lang), { runNow: true });
    const st = await gl.audioStatus(tid(lang));
    expect(st).toMatchObject({ state: 'generating', readySegments: 2, totalSegments: 3, failedSegments: 0 });
    expect(st.reason).toMatch(/Generating audio: 2 of 3 ready\./);
    expect(st.reason).toMatch(/being retried after an error \(server: refused/);
    expect((await gl.diagnostics(tid(lang))).failedSentences).toEqual([]);

    clock.advance(1000); // second attempt fails too -> dead -> now it is a partial failure
    await gl.runJobs();
    const dead = await gl.audioStatus(tid(lang));
    expect(dead).toMatchObject({ state: 'failed', readySegments: 2, failedSegments: 1 });
    expect(dead.reason).toMatch(/^2 of 3 sentences ready; 1 failed: server: refused/);
    expect((await gl.diagnostics(tid(lang))).failedSentences).toHaveLength(1);
  });

  it('ready + failed + still pending: stays generating and says all three', async () => {
    const p = new SelectiveProvider('bad-request');
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [p] });
    const text = await addStory(store, lang);
    const live = (await store.sentences.where('textId', text.id)).sort((a, b) => a.index - b.index);
    p.failing.add(live[0].text);
    await gl.ensureAudio(tid(lang), { runNow: true }); // s0 dead, s1 + s2 ready
    await replaceSentence(store, text.id, 1, lang === 'th' ? 'ฉัน รัก โลก' : 'Una oración nueva.'); // s1 replaced: new sentence queued, not run
    await gl.ensureAudio(tid(lang)); // queue only
    const st = await gl.audioStatus(tid(lang));
    expect(st).toMatchObject({ state: 'generating', readySegments: 1, failedSegments: 1, totalSegments: 3 });
    expect(st.reason).toMatch(/^1 of 3 sentences ready; 1 failed: bad-request: refused .*; 1 still generating\./);
    const f = (await gl.diagnostics(tid(lang))).failedSentences!;
    expect(f).toHaveLength(1);
    expect(f[0].index).toBe(0);
  });

  it('every sentence failed keeps the original wording (no "ready" claim); nothing ready means nothing playable', async () => {
    const p = new SelectiveProvider('bad-request');
    const { store, gl } = await makeEnv({ allowFixture: false, providers: [p] });
    const text = await addStory(store, lang);
    for (const s of await store.sentences.where('textId', text.id)) p.failing.add(s.text);
    const r = await gl.ensureAudio(tid(lang), { runNow: true });
    const st = await gl.audioStatus(tid(lang));
    expect(st.state).toBe('failed');
    expect(st.reason).toMatch(/^3 of 3 sentences could not be voiced: bad-request: refused /);
    expect(st.reason).not.toMatch(/sentences ready/);
    expect((await gl.diagnostics(tid(lang))).failedSentences).toHaveLength(3);
    expect(playableIndexes(await buildPlayerManifest(store, r.manifest))).toEqual([]);
  });
});

describe('partial generation: sentence texts used above', () => {
  it('helper sanity (the STORY fixtures this file relies on)', () => {
    expect(sentenceText('es', 0)).toBe('Yo creo en Dios.');
  });
});
