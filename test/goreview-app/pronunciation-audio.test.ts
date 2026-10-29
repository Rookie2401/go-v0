import { describe, expect, it } from 'vitest';
import { createAudioDeps } from '../../packages/goreview/app/audio';
import { albanianRegistry } from '../../packages/golisten/src';
import { fakeSpeech, fakeUtterance, SQ } from '../golisten/pronounce-fakes';

describe('GoReview pronunciation adapter', () => {
  it('forwards pronunciation to the real GoListen device provider', async () => {
    const speech = fakeSpeech([SQ]);
    const audio = createAudioDeps({ consent: () => false, registries: [albanianRegistry()], speech, utterance: fakeUtterance, voiceWaitMs: 0 });
    const result = await audio.pronounce!({ languageId: 'sq', text: 'shtepi', kind: 'word', autoplay: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      result.playback.play();
      expect(speech.spoken[0]?.text).toBe('shtepi');
      expect(audio.source()).toBeDefined();
      result.playback.dispose();
    }
  });
});
