// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { destroyRigs, dueCard, fakeAudio, fakePlayback, ids, key, makeRig, queued, startWith, until, FAKE_BUILDERS, type as typeInto } from './helpers';
import type { PronunciationRequest } from '../../packages/golisten/src/contracts';
afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
// Match the real written-recognition builder's default response mode. The
// general session fixture uses multiple choice for its separate choice tests.
const builders = FAKE_BUILDERS.map((builder) => builder.family !== 'written-recognition' ? builder : {
  ...builder,
  async build(...args: Parameters<typeof builder.build>) {
    const exercise = await builder.build(...args);
    if ('unavailable' in exercise) return exercise;
    return { ...exercise, responseMode: 'typed-or-self' as const, prompt: { instruction: exercise.prompt.instruction, stimulusText: exercise.prompt.stimulusText } };
  },
});

describe('traditional word flashcards', () => {
  it('uses GoListen pronunciation for the visible word, marks it as assistance, and keeps it out of listening evidence', async () => {
    const requests: PronunciationRequest[] = [];
    const handle = fakePlayback(false, 'playing');
    const audio = fakeAudio({ pronounce: async (request) => {
      requests.push(request);
      return { ok: true, voice: { voiceId: 'device:Hindi', languageId: 'hi', provider: 'device', execution: 'local', synthetic: true, licence: 'device', qualityVerification: 'unverified', knownLimitations: [], supports: ['word'], suitableForAssessment: false, label: 'Hindi device' }, playback: handle, provenance: { source: 'device-tts', voiceId: 'device:Hindi', generatedFromText: true, note: 'practice only' } };
    } });
    const rig = await makeRig({ signedIn: true, builders, audio });
    await startWith(rig, dueCard(A, 'shtepi', 'written-recognition'));
    rig.q('#pronounce').click();
    await until(() => handle.plays === 1, 'pronunciation playback');
    expect(requests[0]).toMatchObject({ languageId: 'sq', kind: 'word', text: 'shtepi', autoplay: false });
    expect(await queued(rig)).toEqual([]);
    key('Enter');
    rig.q('[data-grade="good"]').click();
    await until(() => !!rig.root.querySelector('#summary'), 'summary');
    expect(handle.disposed).toBe(true);
    const review = (await queued(rig)).find((event) => event.kind === 'CardReviewed');
    expect(review?.payload).toMatchObject({ hinted: true });
  });

  it('disposes a pronunciation that resolves after navigation and never starts it', async () => {
    let resolve!: (value: any) => void;
    const pending = new Promise<any>((r) => { resolve = r; });
    const handle = fakePlayback();
    const audio = fakeAudio({ pronounce: async () => pending });
    const rig = await makeRig({ signedIn: true, builders, audio });
    await startWith(rig, dueCard(A, 'shtepi', 'written-recognition'));
    rig.q('#pronounce').click();
    await rig.go('settings');
    resolve({ ok: true, voice: { voiceId: 'device:Hindi', languageId: 'hi', provider: 'device', execution: 'local', synthetic: true, licence: 'device', qualityVerification: 'unverified', knownLimitations: [], supports: ['word'], suitableForAssessment: false, label: 'Hindi device' }, playback: handle, provenance: { source: 'device-tts', voiceId: 'device:Hindi', generatedFromText: true, note: 'practice only' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(handle.plays).toBe(0);
  });

  it('shows provider failures honestly and offers target-language pronunciation after a productive answer', async () => {
    const requests: PronunciationRequest[] = [];
    const audio = fakeAudio({ pronounce: async (request) => {
      requests.push(request);
      return { ok: false, reason: 'no-consent', message: 'Remote speech is disabled.', alternatives: ['Continue without audio.'] };
    } });
    const rig = await makeRig({ signedIn: true, builders, audio });
    await startWith(rig, dueCard(A, 'shtepi', 'meaning-to-form'));
    expect(rig.root.querySelector('#pronounce')).toBeNull();
    typeInto(rig.q<HTMLInputElement>('#answer-input'), 'shtepi');
    key('Enter', rig.q('#answer-input'));
    await until(() => !!rig.root.querySelector('#feedback'), 'feedback');
    expect(rig.root.querySelector('#pronounce')).not.toBeNull();
    rig.q('#pronounce').click();
    await until(() => (rig.q('#pronunciation-status').textContent ?? '').includes('Remote speech is disabled'), 'provider error');
    expect(requests[0]).toMatchObject({ languageId: 'sq', text: 'shtepi', kind: 'word' });
  });

  it('conceals the meaning, flips without recording, then grades once and advances', async () => {
    const rig = await makeRig({ signedIn: true, builders });
    await startWith(rig, [...dueCard(A, 'shtepi', 'written-recognition'), ...dueCard(A, 'zog', 'written-recognition')]);
    expect(rig.q('.flashcard').getAttribute('data-side')).toBe('front');
    expect(rig.root.querySelector('#answer-input')).toBeNull();
    expect(rig.root.querySelector('#retrieval-attempted')).toBeNull();
    expect(rig.root.querySelector('#revealed-answer')).toBeNull();
    expect(await queued(rig)).toEqual([]);
    key('Enter');
    expect(rig.q('.flashcard').getAttribute('data-side')).toBe('back');
    expect(rig.q('#revealed-answer').textContent).toBe('house');
    expect(await queued(rig)).toEqual([]);
    rig.q('[data-grade="good"]').click();
    await until(() => rig.q('#session-progress').textContent === '2 of 2', 'next flashcard');
    const events = await queued(rig);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ grade: 'good', rating: 3 });
    expect(rig.q('.flashcard').getAttribute('data-side')).toBe('front');
    expect(rig.root.querySelector('#revealed-answer')).toBeNull();
  });

  it('offers optional typing and records nothing for an abandoned revealed card', async () => {
    const rig = await makeRig({ signedIn: true, builders });
    await startWith(rig, dueCard(A, 'shtepi', 'written-recognition'));
    rig.q('#type-answer').click();
    expect(rig.root.querySelector('#answer-input')).not.toBeNull();
    rig.q('#reveal').click();
    rig.q('#finish-early').click();
    await until(() => !!rig.root.querySelector('#summary'), 'finished session');
    expect(await queued(rig)).toEqual([]);
  });
});
