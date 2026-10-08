// @vitest-environment jsdom
/**
 * Practice listening in the reader (R8, audit 2026-10-07 section 4.4 item 14): the device's computer voice says a sentence, or
 * each sentence in turn, labelled as practice and never as listening evidence. The tests use a fake speechSynthesis (jsdom has
 * none) with the voices a test names.
 *   - the control is there for Spanish and Norwegian, picks the course's preferred locale first, and speaks at 1.0 or 0.8;
 *   - a device with no voice gets disabled buttons and one plain note;
 *   - nothing is written: no event, no encounter, no GoListen call;
 *   - a reviewed recording hides the control; unreviewed or synthetic audio does not.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import { Reader } from '../../src/ui/reader/Reader';
import { PRACTICE_LABEL, pickDeviceVoice, practiceVoiceTags, speakable } from '../../src/ui/reader/useListen';
import { button, click, flush, makeHarness, q, qa, seedAudio } from './harness';
import type { Harness, Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let h: Harness;
let mounted: Mounted | undefined;

interface Said { text: string; rate: number; voice: string; lang: string }
let said: Said[] = [];
let pending = false; // when true an utterance never ends by itself (a test ends it)
let ender: (() => void) | undefined;
let cancels = 0;

function installSpeech(voices: Array<{ name: string; lang: string }>): void {
  class FakeUtterance {
    text: string; rate = 1; voice: { name: string; lang: string } | null = null; lang = '';
    onend: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor(text: string) { this.text = text; }
  }
  const synth = {
    getVoices: () => voices,
    speak: (u: FakeUtterance) => {
      said.push({ text: u.text, rate: u.rate, voice: u.voice?.name ?? '', lang: u.lang });
      if (pending) { ender = () => u.onend?.(); return; }
      queueMicrotask(() => u.onend?.());
    },
    cancel: () => { cancels += 1; },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  Object.defineProperty(globalThis, 'speechSynthesis', { configurable: true, writable: true, value: synth });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: FakeUtterance });
}
function removeSpeech(): void {
  delete (globalThis as Record<string, unknown>).speechSynthesis;
  delete (globalThis as Record<string, unknown>).SpeechSynthesisUtterance;
}

beforeEach(() => { said = []; pending = false; ender = undefined; cancels = 0; });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; removeSpeech(); });

const hearButtons = () => qa<HTMLButtonElement>(mounted!.container, 'button').filter((b) => /^Hear it \(practice\): sentence/.test(b.getAttribute('aria-label') ?? ''));
const note = (id: string) => q(mounted!.container, `[data-testid="${id}"]`);

async function esReader(opts?: Parameters<typeof makeHarness>[0]) {
  h = await makeHarness(opts);
  await seedStory(h.store);
  mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
}

describe('the pure parts', () => {
  it('tries the course locales first, then Stage 0\'s, without repeats', () => {
    const tags = practiceVoiceTags('es', { lang: 'es', preferredLocales: ['es-HN', 'es-419', 'es-MX'] });
    expect(tags.slice(0, 3)).toEqual(['es-HN', 'es-419', 'es-MX']);
    expect(new Set(tags.map((t) => t.toLowerCase())).size).toBe(tags.length);
    // a companion language does not borrow the course's locales
    expect(practiceVoiceTags('nn', { lang: 'nb', preferredLocales: ['nb-NO'] })).not.toContain('nb-NO');
  });

  it('matches a tag exactly, then by language prefix, and reads Android underscores', () => {
    const v = (lang: string) => ({ name: lang, lang }) as SpeechSynthesisVoice;
    expect(pickDeviceVoice([v('es-ES'), v('es-MX')], ['es-HN', 'es-MX', 'es-ES'])?.lang).toBe('es-MX');
    expect(pickDeviceVoice([v('no-NO')], ['nb-NO', 'nb', 'no'])?.lang).toBe('no-NO');
    expect(pickDeviceVoice([v('es_US')], ['es-US'])?.lang).toBe('es_US');
    expect(pickDeviceVoice([v('fr-FR')], ['es-HN', 'es'])).toBeUndefined();
  });

  it('does not say an inline verse number', () => {
    expect(speakable('[17:1] Und der HERR redete.')).toBe('Und der HERR redete.');
  });
});

describe('with a device voice', () => {
  it('Spanish: a "Hear it" button on every sentence, the practice label, and the course\'s preferred voice at normal speed', async () => {
    installSpeech([{ name: 'Spain', lang: 'es-ES' }, { name: 'Mexico', lang: 'es-MX' }]);
    await esReader();
    expect(q(mounted!.container, '[data-testid="listen-practice"]')).not.toBeNull();
    expect(note('practice-label')!.textContent).toBe(PRACTICE_LABEL);
    expect(note('practice-label')!.textContent).toMatch(/computer voice, practice only: not counted as listening/i);
    expect(hearButtons()).toHaveLength(3);
    expect(button(mounted!.container, 'Read along (practice)').disabled).toBe(false);
    await click(hearButtons()[1]);
    expect(said).toEqual([{ text: 'Dios me perdonó.', rate: 1, voice: 'Mexico', lang: 'es-MX' }]); // es-MX is earlier in Honduras' list than es-ES
  });

  it('the slow toggle says the sentence at 0.8', async () => {
    installSpeech([{ name: 'Mexico', lang: 'es-MX' }]);
    await esReader();
    await click(button(mounted!.container, /^Slow/));
    await click(hearButtons()[0]);
    expect(said.map((s) => s.rate)).toEqual([0.8]);
    expect(said[0].text).toBe('Yo creo en Dios.');
  });

  it('Read along says each sentence in turn, marks the one being said, and can be stopped', async () => {
    installSpeech([{ name: 'Mexico', lang: 'es-MX' }]);
    await esReader();
    await click(button(mounted!.container, 'Read along (practice)'));
    await flush();
    expect(said.map((s) => s.text)).toEqual(['Yo creo en Dios.', 'Dios me perdonó.', 'Entendí mi pecado.']);
    expect(q(mounted!.container, '[data-practice="on"]')).toBeNull(); // finished: nothing is marked any more

    said = []; pending = true;
    await click(button(mounted!.container, 'Read along (practice)'));
    expect(q(mounted!.container, '[data-practice="on"]')?.getAttribute('data-sentence-id')).toBe(ids.sentence(STORY_ID, 0));
    const before = cancels;
    await click(button(mounted!.container, 'Stop reading along'));
    expect(cancels).toBeGreaterThan(before);
    expect(q(mounted!.container, '[data-practice="on"]')).toBeNull();
    ender?.();
    await flush();
    expect(said.map((s) => s.text)).toEqual(['Yo creo en Dios.']); // the later sentences were never started
  });

  it('Norwegian: the control is there for the Norway course, with a Norwegian voice', async () => {
    installSpeech([{ name: 'Nora', lang: 'nb-NO' }]);
    h = await makeHarness({ courseId: 'norway-nb' });
    const text = await buildFixtureText(h.store, { lang: 'nb', slug: 'hei', title: 'Hei', sentences: [{ tokens: [{ surface: 'Jeg', lemma: 'jeg' }, { surface: 'tror', lemma: 'tro' }, { surface: '.', isWord: false }] }] });
    mounted = await h.mount(<Reader textId={text.id} mode="corpus" />);
    expect(note('practice-label')!.textContent).toBe(PRACTICE_LABEL);
    expect(hearButtons()).toHaveLength(1);
    await click(hearButtons()[0]);
    expect(said).toHaveLength(1);
    expect(said[0].text).toMatch(/^Jeg tror/);
    expect(said[0].voice).toBe('Nora');
    expect(said[0].lang).toBe('nb-NO');
  });
});

describe('without a device voice', () => {
  it('no speechSynthesis at all: disabled buttons, one plain note, no per-sentence buttons, reading unaffected', async () => {
    removeSpeech();
    await esReader();
    expect(button(mounted!.container, 'Read along (practice)').disabled).toBe(true);
    expect(button(mounted!.container, 'Hear it (practice)').disabled).toBe(true);
    expect(note('practice-unavailable')!.textContent).toBe('This device has no Spanish computer voice, so there is no practice sound here. Reading is not affected.');
    expect(note('practice-label')).toBeNull();
    expect(hearButtons()).toHaveLength(0);
    expect(q(mounted!.container, 'article.reader')).not.toBeNull();
  });

  it('a synthesizer with only other languages is the same as none', async () => {
    installSpeech([{ name: 'Marie', lang: 'fr-FR' }]);
    await esReader();
    expect(note('practice-unavailable')).not.toBeNull();
    expect(hearButtons()).toHaveLength(0);
    expect(said).toEqual([]);
  });
});

describe('it is practice only: nothing is written', () => {
  it('hearing a sentence and reading along write no event, no encounter, and ask GoListen for nothing but its status', async () => {
    installSpeech([{ name: 'Mexico', lang: 'es-MX' }]);
    await esReader();
    const eventsBefore = await h.events();
    const encountersBefore = await h.store.encounters.all();
    const callsBefore = h.listen.audioStatus.mock.calls.length;

    await click(hearButtons()[0]);
    await click(button(mounted!.container, /^Slow/));
    await click(button(mounted!.container, 'Read along (practice)'));
    await flush();
    expect(said.length).toBeGreaterThan(3);

    const eventsAfter = await h.events();
    expect(eventsAfter).toEqual(eventsBefore);
    expect(eventsAfter.filter((e) => /^(Audio|Listening)/.test(e.type))).toEqual([]);
    expect(await h.store.encounters.all()).toEqual(encountersBefore);
    expect(h.listen.audioStatus.mock.calls.length).toBe(callsBefore); // not asked again
    expect(h.listen.ensureAudio).not.toHaveBeenCalled();
    expect(h.listen.runJobs).not.toHaveBeenCalled();
  });
});

describe('a real recording wins', () => {
  const REVIEWED = (h0: Harness) => ({ ...h0.voice, isSpeech: true, reviewStatus: 'reviewed' as const, approved: true, providerId: 'azure' });

  it('a reviewed human recording hides the control altogether and keeps the device voice quiet', async () => {
    installSpeech([{ name: 'Mexico', lang: 'es-MX' }]);
    h = await makeHarness({ listen: { approved: true, providerId: 'azure' } });
    await seedStory(h.store);
    await seedAudio(h.store, REVIEWED(h), STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    expect((await h.listen.audioStatus(STORY_ID)).evidenceEligible).toBe(true);
    expect(q(mounted.container, '[data-testid="listen-practice"]')).toBeNull();
    expect(hearButtons()).toHaveLength(0);
    expect(qa(mounted.container, '[data-practice-host]')).toHaveLength(0);
    expect(mounted.container.textContent).not.toContain(PRACTICE_LABEL);
    expect(said).toEqual([]);
  });

  it('audio that is not evidence (an unreviewed voice, the development fixture) does not hide it', async () => {
    installSpeech([{ name: 'Mexico', lang: 'es-MX' }]);
    h = await makeHarness(); // fixture provider, not approved: status is preview-only
    await seedStory(h.store);
    await seedAudio(h.store, h.voice, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    expect((await h.listen.audioStatus(STORY_ID)).state).toBe('preview-only');
    expect(q(mounted.container, '[data-testid="listen-practice"]')).not.toBeNull();
    expect(hearButtons()).toHaveLength(3);
  });

  it('with listening switched off the reader never asks GoListen, and the control is there', async () => {
    installSpeech([{ name: 'Mexico', lang: 'es-MX' }]);
    await esReader({ features: { listen: false } });
    expect(h.listen.audioStatus).not.toHaveBeenCalled();
    expect(hearButtons()).toHaveLength(3);
  });

  it('when GoListen cannot answer, the control stays', async () => {
    installSpeech([{ name: 'Mexico', lang: 'es-MX' }]);
    await esReader();
    h.listen.audioStatus.mockRejectedValue(new Error('store closed'));
    await mounted!.unmount();
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    expect(hearButtons()).toHaveLength(3);
  });
});

