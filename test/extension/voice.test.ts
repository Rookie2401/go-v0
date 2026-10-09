// @vitest-environment jsdom
/**
 * Pronunciation in the content script runs through GoListen's device provider: strict language match, nothing remote
 * without consent, no network in the page.
 */
import { describe, expect, it } from 'vitest';
import { createDevicePronouncer } from '../../packages/golearn-extension/src/content/voice';
import { getChrome, getContentChrome } from '../../packages/golearn-extension/src/platform';

interface V { name: string; lang: string; localService?: boolean; voiceURI?: string }
const speechWith = (voices: V[]) => {
  const s = { spoken: [] as Array<{ text?: string; lang: string; rate: number; voice: unknown }>, cancelled: 0, paused: 0, getVoices: () => voices, speak(u: { text?: string; lang: string; rate: number; voice: unknown }) { s.spoken.push(u); }, cancel() { s.cancelled++; }, pause() { s.paused++; }, resume() {} };
  return s;
};
const utterance = (text: string) => ({ text, lang: '', rate: 1, voice: null as unknown, onend: null, onerror: null });
const make = (voices: V[], remoteConsent = false) => {
  const speech = speechWith(voices);
  return { speech, p: createDevicePronouncer({ speech, utterance, remoteConsent: () => remoteConsent, voiceWaitMs: 0 }) };
};

describe('the device pronouncer (GoListen\'s device provider)', () => {
  it('plays a local Albanian voice, labelled practice, and reports the voice id', async () => {
    const { speech, p } = make([{ name: 'Anila', lang: 'sq-AL', localService: true }]);
    expect(await p.availability('sq')).toEqual({ available: true, note: 'Computer voice, practice only: not counted as listening. Nothing is sent anywhere.' });
    const r = await p.play('shtëpinë', 'sq');
    expect(r).toEqual({ ok: true, voice: 'synthetic', voiceId: 'device:Anila' });
    expect(speech.spoken).toHaveLength(1);
    expect(speech.spoken[0]).toMatchObject({ text: 'shtëpinë', lang: 'sq-AL', rate: 1 });
  });

  it('never substitutes another language\'s voice: an English voice is not Albanian', async () => {
    const { speech, p } = make([{ name: 'Zira', lang: 'en-US', localService: true }, { name: 'Anna', lang: 'de-DE', localService: true }]);
    const a = await p.availability('sq');
    expect(a.available).toBe(false);
    expect(a.note).toMatch(/no sq voice/);
    expect(a.note).toMatch(/other languages \(de-DE, en-US\); none of them is used/);
    expect(await p.play('shtëpinë', 'sq')).toMatchObject({ ok: false });
    expect(speech.spoken).toEqual([]);
  });

  it('a voice that sends text to the browser vendor needs the learner\'s consent', async () => {
    const cloud: V = { name: 'Cloud', lang: 'sq-AL', localService: false };
    const refused = make([cloud], false);
    const a = await refused.p.availability('sq');
    expect(a.available).toBe(false);
    expect(a.note).toMatch(/sends the text to the browser vendor's speech service; remote speech is off/);
    expect(await refused.p.play('shtëpinë', 'sq')).toMatchObject({ ok: false });
    expect(refused.speech.spoken).toEqual([]);
    const allowed = make([cloud], true);
    expect((await allowed.p.availability('sq')).note).toMatch(/not local; you allowed it/);
    expect(await allowed.p.play('shtëpinë', 'sq')).toMatchObject({ ok: true });
  });

  it('no speech synthesis at all is a plain line', async () => {
    const p = createDevicePronouncer({ speech: null, voiceWaitMs: 0 });
    expect(await p.availability('sq')).toEqual({ available: false, note: 'Speech is not available in this browser.' });
    expect(await p.play('x', 'sq')).toEqual({ ok: false, message: 'Speech is not available in this browser.' });
  });

  it('a local voice is preferred to a networked one; stop() cancels what is playing', async () => {
    const { speech, p } = make([{ name: 'Cloud', lang: 'sq', localService: false }, { name: 'Local', lang: 'sq-AL', localService: true }], true);
    expect(await p.play('libër', 'sq')).toMatchObject({ ok: true, voiceId: 'device:Local' });
    const before = speech.cancelled;
    p.stop?.();
    expect(speech.cancelled).toBeGreaterThan(before);
  });

  it('another language gets its own strict registry', async () => {
    const { p } = make([{ name: 'Anna', lang: 'de-DE', localService: true }]);
    expect((await p.availability('de')).available).toBe(true);
    expect((await p.availability('sq')).available).toBe(false);
  });

  it('a voice list that arrives late is announced through onChange', () => {
    const listeners: Array<() => void> = [];
    const speech = { ...speechWith([]), addEventListener: (_t: string, cb: () => void) => { listeners.push(cb); }, removeEventListener: (_t: string, cb: () => void) => { listeners.splice(listeners.indexOf(cb), 1); } };
    const p = createDevicePronouncer({ speech, utterance, voiceWaitMs: 0 });
    let n = 0;
    const off = p.onChange!(() => { n++; });
    listeners.forEach((l) => l());
    expect(n).toBe(1);
    off();
    expect(listeners).toHaveLength(0);
  });
});

describe('getContentChrome', () => {
  const g = globalThis as { chrome?: unknown };
  it('needs messaging only (no storage), and ignores an ordinary page\'s chrome object', () => {
    try {
      g.chrome = { csi() { return {}; }, loadTimes() { return {}; } };
      expect(getContentChrome()).toBeUndefined();
      g.chrome = { runtime: {} };
      expect(getContentChrome()).toBeUndefined();
      const runtime = { onMessage: { addListener() {}, removeListener() {} }, sendMessage: async () => undefined, id: 'x' };
      g.chrome = { runtime, storage: { local: {} } };
      const c = getContentChrome()!;
      expect(c.runtime).toBe(runtime);
      expect((c as unknown as { storage?: unknown }).storage).toBeUndefined(); // the content script is not handed the storage areas
      g.chrome = { runtime };
      expect(getContentChrome()).toBeDefined();
      expect(getChrome()).toBeUndefined(); // no storage: not the privileged API
    } finally { delete g.chrome; }
  });
});
