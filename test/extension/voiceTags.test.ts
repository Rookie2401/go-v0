import { describe, expect, it } from 'vitest';
import { hasDeviceVoice } from '../../packages/golearn-extension/src/content/voiceTags';
import { createDevicePronouncer } from '../../packages/golearn-extension/src/content/voice';
import { DEVICE_TAGS } from '../../packages/golearn-extension/src/content/voiceTags';
import { defaultRegistries } from '../../packages/golisten/src/registry';

describe('popup language voice reporting agrees with actual pronunciation', () => {
  it('uses the same language policy as every shared device registry', () => {
    for (const registry of defaultRegistries()) {
      const entry = registry.entries.find((e) => e.source.kind === 'device');
      if (entry?.source.kind === 'device') expect(DEVICE_TAGS[registry.languageId]).toEqual(entry.source.langTags);
    }
  });
  it.each(['es-419', 'es_419'])('accepts the shared Latin American Spanish tag %s', async (lang) => {
    const voices = [{ name: 'Local', lang, localService: true }];
    const p = createDevicePronouncer({ speech: { getVoices: () => voices, speak() {}, cancel() {}, pause() {}, resume() {} }, voiceWaitMs: 0 });
    expect(hasDeviceVoice('es', voices)).toBe(true);
    expect((await p.availability('es')).available).toBe(true);
  });
  it.each(['es-US', 'es', 'es-AR'])('does not substitute Spanish tag %s', async (lang) => {
    const voices = [{ name: 'Local', lang, localService: true }];
    const p = createDevicePronouncer({ speech: { getVoices: () => voices, speak() {}, cancel() {}, pause() {}, resume() {} }, voiceWaitMs: 0 });
    expect(hasDeviceVoice('es', voices)).toBe(false);
    expect((await p.availability('es')).available).toBe(false);
  });
  it.each([
    ['sq', 'sq-AL'], ['sq', 'sq'], ['sq', 'sq_AL'],
    ['de', 'de-DE'], ['es', 'es-MX'], ['hi', 'hi-IN'], ['th', 'th-TH'],
  ])('%s recognises installed %s without assuming availability', async (languageId, lang) => {
    const voices = [{ name: 'Test local voice', lang, localService: true }];
    const pronouncer = createDevicePronouncer({
      speech: { getVoices: () => voices, speak() {}, cancel() {}, pause() {}, resume() {} },
      voiceWaitMs: 0,
    });
    expect(hasDeviceVoice(languageId, voices)).toBe(true);
    expect((await pronouncer.availability(languageId)).available).toBe(true);
    expect(hasDeviceVoice(languageId, [{ lang: 'en-US' }])).toBe(false);
  });
  it('does not claim Albanian from an unrelated voice or an empty list', () => {
    expect(hasDeviceVoice('sq', [])).toBe(false);
    expect(hasDeviceVoice('sq', [{ lang: 'sq-XK' }, { lang: 'en-US' }])).toBe(false);
  });
});
