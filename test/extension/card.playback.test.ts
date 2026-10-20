// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import { createDevicePronouncer } from '../../packages/golearn-extension/src/content/voice';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import type { SpeechUtteranceLike } from '../../packages/golisten/src/ports';
import { setBody, stubLayout } from './dom';

let ui: CardUI;
let restore: () => void;
const hearings: SpeechUtteranceLike[] = [];
const events: unknown[] = [];
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const say = () => ui.root()!.querySelector<HTMLButtonElement>('.say')!;
beforeEach(async () => {
  restore = stubLayout(); setBody('<p>Unë lexoj librin.</p>'); hearings.length = events.length = 0;
  const pronouncer = createDevicePronouncer({
    speech: { getVoices: () => [{ name: 'Test local Albanian', lang: 'sq-AL', localService: true }],
      speak: (u) => { hearings.push(u); }, cancel() {}, pause() {}, resume() {} },
    utterance: (text) => ({ text, voice: null, lang: '', rate: 1, onend: null, onerror: null }), voiceWaitMs: 0,
  });
  ui = createCardUI({ doc: document, pronouncer });
  ui.show(parseSelection({ surface: 'librin', context: { kind: 'sentence', confidence: 1, sentence: 'Unë lexoj librin.', selStart: 10, selEnd: 16 }, languageId: 'sq' }),
    { rect: { top: 50, left: 50, right: 100, bottom: 80, width: 50, height: 30 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' },
    { actions: { onPronounced: (event) => events.push(event) } });
  await flush();
});
afterEach(() => { ui.destroy(); restore(); });

describe('GoLearn uses GoListen playback completion and recovery', () => {
  it('shows unavailable voice status on the card', async () => {
    ui.destroy();
    ui = createCardUI({ doc: document, pronouncer: {
      availability: () => ({ available: false, note: 'Speech is not available in this browser.' }),
      play: () => ({ ok: false, message: 'unreachable' }),
    } });
    ui.show(parseSelection({ surface: 'librin', context: { kind: 'sentence', confidence: 1, sentence: 'Unë lexoj librin.', selStart: 10, selEnd: 16 }, languageId: 'sq' }),
      { rect: { top: 50, left: 50, right: 100, bottom: 80, width: 50, height: 30 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' });
    await flush();
    const note = ui.root()!.querySelector<HTMLElement>('.pron')!;
    expect(note.className).toContain('note');
    expect(note.textContent).toBe('Speech is not available in this browser.');
  });

  it('shows preparing, playing, paused, and finished playback status', async () => {
    ui.destroy();
    let state: ((value: 'idle' | 'playing' | 'paused' | 'ended' | 'error') => void) | undefined;
    ui = createCardUI({ doc: document, pronouncer: {
      availability: () => ({ available: true, note: 'local' }),
      onPlaybackState: (cb) => { state = cb; return () => { state = undefined; }; },
      play: () => { state?.('playing'); return { ok: true, voice: 'synthetic' }; },
    } });
    ui.show(parseSelection({ surface: 'librin', context: { kind: 'sentence', confidence: 1, sentence: 'Unë lexoj librin.', selStart: 10, selEnd: 16 }, languageId: 'sq' }),
      { rect: { top: 50, left: 50, right: 100, bottom: 80, width: 50, height: 30 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' });
    await flush();
    say().click();
    expect(ui.root()!.textContent).toContain('Playing pronunciation');
    state?.('paused');
    expect(ui.root()!.textContent).toContain('Pronunciation paused.');
    state?.('ended');
    await flush();
    expect(ui.root()!.textContent).toContain('It is not listening evidence');
  });

  it('keeps a synchronous playing/ended callback and records one completed hearing', async () => {
    ui.destroy();
    const events: unknown[] = [];
    let state: ((value: 'idle' | 'playing' | 'paused' | 'ended' | 'error') => void) | undefined;
    ui = createCardUI({ doc: document, pronouncer: {
      availability: () => ({ available: true, note: 'local' }),
      onPlaybackState: (cb) => { state = cb; return () => { state = undefined; }; },
      play: () => { state?.('playing'); state?.('ended'); return { ok: true, voice: 'synthetic' }; },
      stop() { state?.('idle'); },
    } });
    ui.show(parseSelection({ surface: 'librin', context: { kind: 'sentence', confidence: 1, sentence: 'Unë lexoj librin.', selStart: 10, selEnd: 16 }, languageId: 'sq' }),
      { rect: { top: 50, left: 50, right: 100, bottom: 80, width: 50, height: 30 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' },
      { actions: { onPronounced: (event) => events.push(event) } });
    await flush();
    say().click();
    await flush();
    expect(events).toHaveLength(1);
    expect(ui.root()!.textContent).toContain('It is not listening evidence');
  });

  it('Stop is available during preparation and prevents speech from starting', async () => {
    say().click();
    const stop = [...ui.root()!.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Stop pronunciation')!;
    expect(stop.disabled).toBe(false);
    stop.click();
    await flush();
    expect(hearings).toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(say().disabled).toBe(false);
    expect(ui.root()!.textContent).toContain('Pronunciation stopped.');
  });
  it('dismissal cancels pronunciation before its preparation finishes', async () => {
    say().click();
    ui.dismiss('close');
    await flush();
    expect(hearings).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
  it('replacing a card with a message cancels pending playback and unsubscribes its state', async () => {
    say().click();
    ui.showMessage('Another selection', { rect: { top: 50, left: 50, right: 100, bottom: 80, width: 50, height: 30 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' });
    await flush();
    expect(hearings).toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(ui.root()!.textContent).toContain('Another selection');
  });
  it('showing a different word cancels the old pending pronunciation', async () => {
    say().click();
    ui.show(parseSelection({ surface: 'lexoj', context: { kind: 'sentence', confidence: 1, sentence: 'Unë lexoj librin.', selStart: 4, selEnd: 9 }, languageId: 'sq' }),
      { rect: { top: 50, left: 50, right: 100, bottom: 80, width: 50, height: 30 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' });
    await flush();
    expect(hearings).toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(say().disabled).toBe(false);
  });
  it('shows a delayed browser error, records nothing, and lets the learner retry', async () => {
    say().click(); await flush();
    expect(hearings).toHaveLength(1);
    expect(events).toHaveLength(0);
    hearings[0].onerror?.({ error: 'audio-busy' });
    expect(ui.root()!.textContent).toContain('Pronunciation could not play');
    expect(say().disabled).toBe(false);
    say().click();
    // Starting a retry clears the previous failure immediately, even while the new voice
    // request is still preparing. A stale error must not flicker over the new attempt.
    expect(ui.root()!.textContent).not.toContain('Pronunciation could not play');
    await flush();
    hearings[1].onend?.();
    expect(events).toEqual([expect.objectContaining({ voice: 'synthetic', repeated: false })]);
    expect(ui.root()!.textContent).toContain('It is not listening evidence');
  });
  it('records each completed hearing once, marking a replay', async () => {
    say().click(); await flush(); hearings[0].onend?.();
    say().click(); await flush(); hearings[1].onend?.();
    expect(events).toEqual([expect.objectContaining({ repeated: false }), expect.objectContaining({ repeated: true })]);
  });
  it('pronounces the requested sentence only on demand and records exposure without its text', async () => {
    ui.update({ pronunciationSentence: 'Unë lexoj librin.', pronunciationContext: { readerId: 'web-generic', varietyId: 'sq-standard', kind: 'word' } });
    [...ui.root()!.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'See full sentence')!.click();
    expect(hearings).toHaveLength(0);
    ui.root()!.querySelector<HTMLButtonElement>('.listenSentence')!.click(); await flush();
    expect(hearings[0].text).toBe('Unë lexoj librin.'); expect(events).toHaveLength(0);
    hearings[0].onend?.(); expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('Unë lexoj librin.');
  });
  it('changes the next playback speed and discards late completion after Stop', async () => {
    const speed = ui.root()!.querySelector<HTMLSelectElement>('select[aria-label="Pronunciation speed"]')!;
    speed.value = '0.5'; speed.dispatchEvent(new Event('change'));
    say().click(); await flush();
    expect(hearings[0].rate).toBe(0.5);
    [...ui.root()!.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Stop pronunciation')!.click();
    hearings[0].onend?.();
    expect(events).toHaveLength(0);
  });
});
