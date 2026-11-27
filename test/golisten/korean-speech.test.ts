// @vitest-environment node
/**
 * A Korean homonym's lemma string carries the dictionary's number (눈² = snow). The number is identity, never spelling: whatever reaches a
 * voice, on the device or on the remote path, is the headword (packages/repository-contract/src/lemma-display.ts, applied in
 * packages/golisten/src/providers/types.ts `spokenText`). Korean voices are ko-KR / ko only.
 */
import { describe, expect, it } from 'vitest';
import { createGoListen, defaultRegistries } from '../../packages/golisten/src';
import type { GoListenOptions } from '../../packages/golisten/src';
import { displayLemma, lemmaHomonymNumber, lemmaLookupKeys, speechSafeText, unitIdLabel } from '../../packages/repository-contract/src';
import { EN, fakeAudio, fakeObjectUrls, fakeSpeech, fakeUtterance, voice } from './pronounce-fakes';

const KO = voice('Fake Korean', 'ko-KR');
const JA = voice('Fake Japanese', 'ja-JP');
const opts = (o: Partial<GoListenOptions> = {}): GoListenOptions => ({
  registries: defaultRegistries(), consent: () => ({ remoteSpeech: false }), speech: fakeSpeech([]), audio: fakeAudio(900),
  fetch: undefined, objectUrl: fakeObjectUrls(), utterance: fakeUtterance, voiceWaitMs: 0, ...o,
});

describe('the shared lemma-display helper', () => {
  it('shows, speaks and searches the headword of a numbered Korean lemma; the number is a label', () => {
    expect(displayLemma('ko', '눈²')).toBe('눈');
    expect(displayLemma('ko', '묻다¹')).toBe('묻다');
    expect(displayLemma('ko-KR', '배³')).toBe('배');
    expect(displayLemma('ko', '눈')).toBe('눈');
    expect(lemmaHomonymNumber('ko', '눈²')).toBe(2);
    expect(lemmaHomonymNumber('ko', '묻다¹⁰')).toBe(10);
    expect(lemmaHomonymNumber('ko', '눈')).toBeUndefined();
  });

  it('leaves every other language alone, and an exponent that is not a homonym number', () => {
    expect(displayLemma('sq', 'shtëpi')).toBe('shtëpi');
    expect(displayLemma('en', 'm²')).toBe('m²');
    expect(displayLemma('ko', 'm²')).toBe('m²'); // only after a Hangul syllable
    expect(displayLemma(undefined, '눈²')).toBe('눈²');
    expect(lemmaHomonymNumber('sq', 'x²')).toBeUndefined();
  });

  it('dictionary keys: the numbered headword finds its own entry, the bare headword is the fallback; a page address is the bare spelling', () => {
    expect(lemmaLookupKeys('ko', '눈²')).toEqual(['눈²']); // never the bare headword as a fallback: it holds every homonym
    expect(lemmaLookupKeys('ko', '눈')).toEqual(['눈']);
    expect(lemmaLookupKeys('sq', 'libër')).toEqual(['libër']);
  });

  it('speech and search text never carry a number after a Hangul syllable, wherever it stands', () => {
    expect(speechSafeText('ko', '눈²')).toBe('눈');
    expect(speechSafeText('ko', '눈² 와 배¹ 그리고 묻다³.')).toBe('눈 와 배 그리고 묻다.');
    expect(speechSafeText('ko', 'KBS² 2024')).toBe('KBS² 2024');
    expect(speechSafeText('sq', 'shtëpi²')).toBe('shtëpi²');
  });

  it('a unit id is labelled by its headword', () => {
    expect(unitIdLabel('lemma:ko:눈²:NOUN')).toBe('눈');
    expect(unitIdLabel('lemma:ko:눈:NOUN')).toBe('눈');
    expect(unitIdLabel('form:ko:눈이')).toBe('눈이');
    expect(unitIdLabel('lemma:sq:libër:NOUN')).toBe('libër');
    expect(unitIdLabel('plain')).toBe('plain');
  });
});

describe('text sent to a voice', () => {
  it('the device voice is given 눈 for 눈², and a ko-KR voice is chosen for it', async () => {
    const speech = fakeSpeech([EN, JA, KO]);
    const r = await createGoListen(opts({ speech })).pronounce({ languageId: 'ko', text: '눈²', kind: 'word', autoplay: true });
    expect(r.ok).toBe(true);
    expect(speech.spoken).toHaveLength(1);
    expect(speech.spoken[0]!.text).toBe('눈');
    expect(speech.spoken[0]!.voice).toBe(KO);
    expect(speech.spoken[0]!.lang).toBe('ko-KR');
  });

  it('a phrase keeps its words and loses only the number', async () => {
    const speech = fakeSpeech([KO]);
    await createGoListen(opts({ speech })).pronounce({ languageId: 'ko', text: '눈²  이 와요', kind: 'phrase', autoplay: true });
    expect(speech.spoken[0]!.text).toBe('눈 이 와요');
  });

  it('only a Korean voice serves Korean: English and Japanese voices are never substituted', async () => {
    const speech = fakeSpeech([EN, JA]);
    const r = await createGoListen(opts({ speech })).pronounce({ languageId: 'ko', text: '눈', kind: 'word', autoplay: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['no-voice', 'no-consent']).toContain(r.reason); // the registry also offers Azure's ko-KR voices, which need the learner's consent
    expect(speech.spoken).toEqual([]);
  });
});
