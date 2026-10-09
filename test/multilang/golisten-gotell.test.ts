// @vitest-environment jsdom
/**
 * Multi-language extensibility, part 4: GoListen (capability reporting for a second language) and GoTell (language
 * configuration read from the pack registry). Spanish adds a registry of DATA to GoListen and a manifest to the pack
 * registry; neither needed new code paths.
 */
import { describe, expect, it } from 'vitest';
import {
  AZURE_LICENCE, SPANISH_DEVICE_TAGS, albanianRegistry, createGoListen, defaultRegistries, deviceRegistry, indexRegistries, spanishRegistry,
} from '../../packages/golisten/src';
import type { FetchLike, SpeechVoiceLike } from '../../packages/golisten/src';
import { packFor, PACKS } from '../../packages/language-packs/src';
import { guidancePackFor } from '../../packages/gotell/src/prompts/pack-source';
import { promptsFor, validatePrompt } from '../../packages/gotell/src/prompts/registry';
import { EN, ES, SQ_AL, fakeAudio, fakeFetch, fakeObjectUrls, fakeSpeech, fakeUtterance, jsonResponse, wavResponse, voice } from '../golisten/pronounce-fakes';
import type { FakeFetch } from '../golisten/pronounce-fakes';

const ES_HN = voice('Fake Honduran', 'es-HN');
const ES_419 = voice('Fake Latin American', 'es-419');
const ES_MX = voice('Fake Mexican', 'es-MX');
const ES_AR = voice('Fake Argentine', 'es-AR');
const ES_BARE = voice('Fake Spanish (bare tag)', 'es');
const ES_NET = voice('Cloud Spanish', 'es-ES', { localService: false });

const proxy = (offer: string[]): FakeFetch => fakeFetch((url) => {
  if (url.endsWith('/status')) return jsonResponse(200, { configured: true, provider: 'azure-speech', providerVersion: 'azure-proxy@1', format: 'riff-24khz-16bit-mono-pcm', maxChars: 5000 });
  if (url.includes('/voices')) return jsonResponse(200, { voices: offer.map((id) => ({ id, name: `Azure ${id}`, lang: 'es', locale: id.split('-').slice(0, 2).join('-') })) });
  if (url.endsWith('/synthesize')) return wavResponse();
  return jsonResponse(404, { error: 'not-found' });
});

function make(o: { voices?: SpeechVoiceLike[]; consent?: boolean; net?: FakeFetch } = {}) {
  const state = { consent: o.consent ?? false };
  const g = createGoListen({
    registries: defaultRegistries(), consent: () => ({ remoteSpeech: state.consent }), speech: fakeSpeech(o.voices ?? []),
    audio: fakeAudio(), fetch: o.net?.fetch as FetchLike | undefined, objectUrl: fakeObjectUrls(), utterance: fakeUtterance, voiceWaitMs: 0,
  });
  return { g, state };
}

describe('the Spanish registry', () => {
  const es = spanishRegistry();

  it('is data in the default registries: a device template, Azure es voices, no recordings, nothing claimed beyond that', () => {
    expect(defaultRegistries().map((r) => r.languageId)).toEqual(['sq', 'de', 'es']);
    expect(es.languageId).toBe('es');
    expect(es.entries.map((e) => e.provider)).toEqual(['device', 'remote', 'remote', 'remote']);
    expect(es.entries.some((e) => e.provider === 'recorded')).toBe(false);
    expect(es.entries.every((e) => e.languageId === 'es')).toBe(true);
    expect(es.entries[0].source).toEqual({ kind: 'device', langTags: ['es-HN', 'es-419', 'es-MX', 'es-ES'] });
    expect([...SPANISH_DEVICE_TAGS]).toEqual(['es-HN', 'es-419', 'es-MX', 'es-ES']);
    expect(es.gaps.join(' ')).toMatch(/No Spanish recordings exist/);
    expect(es.gaps.join(' ')).toMatch(/phonetic/);
    expect(es.phonetics).toBeUndefined();
  });

  it('declares the Azure voices synthetic, remote, unverified, never for assessment, behind consent; ids do not collide with Albanian’s', () => {
    const azure = es.entries.filter((e) => e.provider === 'remote');
    expect(azure.map((e) => e.source.kind === 'remote' && e.source.providerVoice)).toEqual(['es-HN-CarlosNeural', 'es-HN-KarlaNeural', 'es-MX-DaliaNeural']);
    expect(azure.map((e) => e.source.kind === 'remote' && e.source.locale)).toEqual(['es-HN', 'es-HN', 'es-MX']);
    for (const e of azure) {
      expect(e).toMatchObject({ synthetic: true, execution: 'remote', qualityVerification: 'unverified', suitableForAssessment: false, licence: AZURE_LICENCE });
      expect(e.knownLimitations.join(' ')).toMatch(/consent/);
      expect(e.label).toMatch(/Spanish/);
    }
    const sqIds = new Set(albanianRegistry().entries.map((e) => e.voiceId));
    expect(es.entries.map((e) => e.voiceId).filter((id) => sqIds.has(id))).toEqual([]);
    // Albanian's own entries are unchanged by generalising the Azure entry
    expect(albanianRegistry().entries.map((e) => e.label)).toEqual(['Device voice (Albanian)', 'Azure Neural Anila (Albanian, female), synthetic', 'Azure Neural Ilir (Albanian, male), synthetic']);
    expect(albanianRegistry().entries.slice(1).map((e) => e.varietyId)).toEqual(['sq-AL', 'sq-AL']);
  });

  it('agrees with the Spanish pack manifest: device voices expected, the same remote voices, no recordings', () => {
    const p = packFor('es')!.pronunciation;
    expect(p.registryRef).toBe('golisten:es');
    expect(p.deviceVoiceExpected).toBe(true);
    expect(p.recordings).toBe('none');
    expect(p.remoteVoice.voices).toEqual(es.entries.filter((e) => e.provider === 'remote').map((e) => (e.source.kind === 'remote' ? e.source.providerVoice : '')));
    expect(packFor('sq')!.pronunciation.deviceVoiceExpected).toBe(false); // Albanian: none installed on the development machine
  });

  it('merges with another Spanish registry like any language, and leaves other languages alone', () => {
    const merged = indexRegistries([spanishRegistry(), deviceRegistry('es', ['es-PE'], 'Spanish')]).get('es')!;
    expect(merged.entries).toHaveLength(5);
    expect(indexRegistries(defaultRegistries()).get('sq')!.entries).toHaveLength(3);
  });
});

describe('GoListen capability reporting for Spanish', () => {
  it('no Spanish voice installed: nothing can speak, the device template is listed as none installed, the gaps say what is missing', async () => {
    const a = await make({ voices: [EN, SQ_AL] }).g.availability('es');
    expect(a.languageId).toBe('es');
    expect(a.canPronounce).toBe(false);
    expect(a.voices.map((v) => v.state).sort()).toEqual(['needs-consent', 'needs-consent', 'needs-consent', 'unavailable']);
    expect(a.voices.find((v) => v.provider === 'device')!.label).toMatch(/none installed/);
    expect(a.gaps.join(' ')).toMatch(/No Spanish recordings exist/);
    // Albanian's availability is independent of Spanish: an Albanian voice makes sq pronounceable, not es
    const m = make({ voices: [SQ_AL] });
    expect((await m.g.availability('sq')).canPronounce).toBe(true);
    expect((await m.g.availability('es')).canPronounce).toBe(false);
  });

  it('device voices expected: canPronounce only when a fake speech lists an es-HN, es-419, es-MX or es-ES voice, best first', async () => {
    for (const v of [ES_HN, ES_419, ES_MX, ES]) expect((await make({ voices: [v] }).g.availability('es')).canPronounce, v.lang).toBe(true);
    const m = make({ voices: [EN, ES, ES_MX, ES_HN, SQ_AL] });
    const device = (await m.g.voices('es')).filter((v) => v.provider === 'device');
    expect(device.map((v) => v.label)).toEqual(['Device voice: Fake Honduran (es-HN)', 'Device voice: Fake Mexican (es-MX)', 'Device voice: Fake Spanish (es-ES)']);
    expect(device.every((v) => v.languageId === 'es' && v.synthetic && !v.suitableForAssessment && v.qualityVerification === 'unverified')).toBe(true);
    expect(device.map((v) => v.varietyId)).toEqual(['es-HN', 'es-MX', 'es-ES']);
  });

  it('the match is strict: a bare "es", another Spanish variety, an English or an Albanian voice is never substituted', async () => {
    const a = await make({ voices: [ES_BARE, ES_AR, EN, SQ_AL] }).g.availability('es');
    expect(a.canPronounce).toBe(false);
    expect(a.voices.find((v) => v.provider === 'device')!.state).toBe('unavailable');
  });

  it('a Spanish voice that is not local needs consent, like any remote voice', async () => {
    const m = make({ voices: [ES_NET] });
    const v = (await m.g.availability('es')).voices.find((x) => x.provider === 'device')!;
    expect(v.state).toBe('needs-consent');
    m.state.consent = true;
    expect((await m.g.availability('es')).voices.find((x) => x.provider === 'device')!.state).toBe('available');
  });

  it('remote Spanish voices: needs-consent first (and no request), then available only for the voices the proxy offers', async () => {
    const net = proxy(['es-HN-CarlosNeural', 'es-HN-KarlaNeural']);
    const off = make({ net });
    const states = async (g: ReturnType<typeof make>['g']) => Object.fromEntries((await g.availability('es')).voices.filter((v) => v.provider === 'remote').map((v) => [v.voiceId, v.state]));
    expect(Object.values(await states(off.g))).toEqual(['needs-consent', 'needs-consent', 'needs-consent']);
    expect(net.calls).toHaveLength(0);
    const on = make({ net: proxy(['es-HN-CarlosNeural', 'es-HN-KarlaNeural']), consent: true });
    expect(await states(on.g)).toEqual({
      'azure-speech:es-HN-CarlosNeural': 'available', 'azure-speech:es-HN-KarlaNeural': 'available', 'azure-speech:es-MX-DaliaNeural': 'unavailable',
    });
    expect((await on.g.availability('es')).canPronounce).toBe(true);
  });

  it('asks the proxy for Spanish voices, never Albanian ones, and sends no text while listing', async () => {
    const net = proxy(['es-HN-CarlosNeural']);
    await make({ net, consent: true }).g.availability('es');
    expect(net.calls.map((c) => c.url)).toEqual(['/api/speech/status', '/api/speech/voices?lang=es']);
    expect(net.calls.every((c) => !('body' in (c.init ?? {})))).toBe(true);
  });

  it('pronounce: a Spanish word plays on a Spanish device voice as practice (device TTS), and fails honestly without one or without consent', async () => {
    const ok = await make({ voices: [ES_HN] }).g.pronounce({ languageId: 'es', text: 'niños', kind: 'word' });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.voice).toMatchObject({ languageId: 'es', provider: 'device', synthetic: true });
    expect(ok.provenance).toMatchObject({ source: 'device-tts', generatedFromText: true });
    expect(ok.phonetic).toBeUndefined(); // no Spanish phonetic rule set in GoListen yet: honest absence, not an Albanian rule applied to Spanish
    const none = await make({ voices: [EN] }).g.pronounce({ languageId: 'es', text: 'niños', kind: 'word' });
    expect(none.ok).toBe(false);
    // the Albanian voice is never used for Spanish
    const wrong = await make({ voices: [SQ_AL] }).g.pronounce({ languageId: 'es', text: 'niños', kind: 'word' });
    expect(wrong.ok).toBe(false);
    // and the Spanish voice is never used for Albanian
    const reverse = await make({ voices: [ES_HN] }).g.pronounce({ languageId: 'sq', text: 'libër', kind: 'word' });
    expect(reverse.ok).toBe(false);
  });
});

describe('GoTell language configuration', () => {
  it('the pack registry says Spanish is installable, with its tutorial and its team', async () => {
    const m = packFor('es')!;
    expect(m.status).toBe('installable');
    expect(m.tutorial).toMatchObject({ ref: 'tutorial/es', skippable: true });
    const { ES_TUTORIAL } = await import('../../packages/language-packs/src');
    expect(ES_TUTORIAL.ref).toBe(m.tutorial.ref);
    expect(ES_TUTORIAL.steps.length).toBeGreaterThan(5);
    const { TEAMS } = await import('../../packages/language-packs/src');
    expect(TEAMS.honduras.languages[0]).toMatchObject({ languageId: 'es', varietyId: 'es-HN', default: true });
  });

  it('guidance reads the Spanish pack’s own grammar notes (constructions and features), and says nothing it does not have', () => {
    const g = guidancePackFor('es');
    expect(g.explainConstruction('preterite')).toMatch(/completed event in the past/);
    expect(g.explainConstruction('ser-estar-adjective')).toMatch(/Ser says/);
    expect(g.explainConstruction('definite-accusative-singular')).toBeUndefined(); // an Albanian construction is not Spanish
    expect(g.explainFeature('Mood', 'Sub')).toMatch(/subjunctive/);
    expect(g.explainFeature('Mood', 'Sub')).toMatch(/Sub: subjunctive/);
    expect(g.explainFeature('Case', 'Acc')).toBeUndefined(); // Spanish has no Case feature in this pack
    expect(g.tutorialPatterns).toBeUndefined(); // the Albanian tutorial patterns are Albanian-only; honestly absent for Spanish
    expect(g.unitDomains).toBeUndefined();
    const sq = guidancePackFor('sq');
    expect(sq.explainConstruction('preterite')).toBeUndefined();
    expect(sq.tutorialPatterns?.().length).toBeGreaterThan(0);
    expect(guidancePackFor('xx').explainConstruction('preterite')).toBeUndefined();
  });

  it('writing prompts for a Spanish learner of the Honduras team are the language-neutral ones, valid, and none is Albanian', () => {
    const list = promptsFor({ languageId: 'es', teamId: 'honduras', mode: 'free' });
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) {
      expect(p.languageIds, p.promptId).toContain('*');
      expect(p.promptId, p.promptId).not.toMatch(/\.sq$/);
      expect(validatePrompt(p), p.promptId).toEqual([]);
    }
    const sq = promptsFor({ languageId: 'sq', teamId: 'albania', mode: 'free' });
    expect(sq.some((p) => p.languageIds.includes('sq'))).toBe(true);
    expect(list.some((p) => p.languageIds.includes('sq'))).toBe(false);
    // a different team's languages are not offered to the Honduras team
    expect(promptsFor({ languageId: 'es', teamId: 'albania', mode: 'free' }).every((p) => p.teams.length === 0 || p.teams.includes('albania'))).toBe(true);
  });

  it('the Spanish pack’s validation sentences are what GoTell attests as Spanish (and nothing Albanian leaks in)', () => {
    const sentences = PACKS.es.validation.map((c) => c.sentence);
    expect(sentences.length).toBeGreaterThanOrEqual(12);
    expect(sentences.join(' ')).toMatch(/Los niños leen los libros\./);
    expect(sentences.join(' ')).not.toMatch(/ë|çaj/);
  });
});
