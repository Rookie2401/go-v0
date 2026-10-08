import { describe, expect, it } from 'vitest';
import { COURSES } from '../../src/core';
import { FIXTURE_ENGINE, FixtureTtsProvider, fixtureChunks, inspectWav, validateWav } from '../../src/golisten';
import { LANGS } from './support';

const SAMPLE: Record<string, string> = {
  es: 'Yo creo en Dios.', sq: 'Unë besoj te Zoti.', th: 'ฉันเชื่อในพระเจ้า', hi: 'मैं परमेश्वर पर विश्वास करता हूँ।', de: 'Ich glaube an Gott.',
  nb: 'Jeg tror på Gud.', nn: 'Eg trur på Gud.',
};

describe('FixtureTtsProvider', () => {
  const p = new FixtureTtsProvider();

  it('declares itself as a fixture with no word boundaries, ssml or phoneme support', () => {
    expect(p.id).toBe('fixture');
    const c = p.capabilities();
    expect(c.wordBoundaries).toBe(false);
    expect(c.ssml).toBe(false);
    expect(c.phonemeOverrides).toBe(false);
    expect(c.outputFormats).toEqual(['audio/wav']);
    expect(p.disclaimer).toMatch(/not speech/i);
  });

  it('is not speech, and its availability says it is a development fixture', async () => {
    expect(p.isSpeech).toBe(false);
    expect(await p.availability()).toMatchObject({ available: true, reason: 'development-fixture' });
  });

  it.each(LANGS)('%s: returns a real, decodable PCM16 mono 22050 Hz WAV and NEVER word marks', async (lang) => {
    const voices = await p.listVoices(lang);
    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0].name).toMatch(/not speech/i);
    const r = await p.synthesize({ text: SAMPLE[lang], lang, locale: voices[0].locale, voiceId: voices[0].id, format: 'audio/wav', settings: {} });
    expect(r.mime).toBe('audio/wav');
    expect(r.sampleRate).toBe(22050);
    expect(r.channels).toBe(1);
    expect(r.engine).toBe(FIXTURE_ENGINE);
    expect(r.wordMarks).toBeUndefined();
    expect(r.actualLocale).toBe(voices[0].locale);
    const insp = inspectWav(r.bytes);
    expect(insp.validation.ok).toBe(true);
    expect(insp.sampleRate).toBe(22050);
    expect(insp.channels).toBe(1);
    expect(Math.abs(insp.durationMs! - r.durationMs)).toBeLessThan(2);
  });

  it('is deterministic, and duration scales with the amount of text', async () => {
    const v = (await p.listVoices('es'))[0];
    const synth = (text: string) => p.synthesize({ text, lang: 'es', locale: v.locale, voiceId: v.id, format: 'audio/wav', settings: {} });
    const a1 = await synth('Dios me perdonó');
    const a2 = await synth('Dios me perdonó');
    expect(Array.from(a1.bytes)).toEqual(Array.from(a2.bytes));
    const short = await synth('Dios');
    const long = await synth('Yo creo en Dios porque Dios me perdonó y entiendo mi corazón');
    expect(long.durationMs).toBeGreaterThan(short.durationMs * 3);
    expect(validateWav(long.bytes).ok).toBe(true);
  });

  it('different texts produce different audio bytes (so content addressing distinguishes them)', async () => {
    const v = (await p.listVoices('de'))[0];
    const synth = (text: string) => p.synthesize({ text, lang: 'de', locale: v.locale, voiceId: v.id, format: 'audio/wav', settings: {} });
    const a = await synth('Ich glaube');
    const b = await synth('Gott vergibt');
    expect(Array.from(a.bytes)).not.toEqual(Array.from(b.bytes));
  });

  it('chunks Thai (no spaces) into word-like pieces rather than one blob', () => {
    const chunks = fixtureChunks('ฉันเชื่อในพระเจ้า', 'th');
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.map((c) => c.text).join('')).toBe('ฉันเชื่อในพระเจ้า');
  });

  it('fails loudly on unknown voice, wrong format and nothing speakable', async () => {
    const v = (await p.listVoices('es'))[0];
    await expect(p.synthesize({ text: 'hola', lang: 'es', locale: 'es-419', voiceId: 'nope', format: 'audio/wav', settings: {} })).rejects.toThrow(/unknown voice/);
    await expect(p.synthesize({ text: 'hola', lang: 'es', locale: v.locale, voiceId: v.id, format: 'audio/mpeg', settings: {} })).rejects.toThrow(/wav/);
    await expect(p.synthesize({ text: ' ... ', lang: 'es', locale: v.locale, voiceId: v.id, format: 'audio/wav', settings: {} })).rejects.toThrow(/speakable/);
  });

  it('offers no es-HN voice, so the Honduras course falls back to es-419 (recorded, not hidden)', async () => {
    const locales = (await p.listVoices('es')).map((v) => v.locale);
    expect(locales).not.toContain('es-HN');
    expect(locales).toContain('es-419');
    expect(COURSES.find((c) => c.lang === 'es')!.preferredLocales[0]).toBe('es-HN');
  });
});
