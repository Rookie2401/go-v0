// @vitest-environment node
/**
 * AUDIT §19 (part 2) — device voices are strictly language-matched, and the per-language voice / audio-quality table
 * (sq, de, es, hi, th, nb, nn, he, el, la) is BUILT here from `defaultRegistries()`, the packs' pronunciation blocks and probes of the
 * two device-voice paths (the shared GoListen and the GoLearn extension's content-script pronouncer). "none" is stated
 * where nothing exists. The rows are written to the audit rows file when AUDIT_ROWS_DIR is set.
 */
import { describe, expect, it } from 'vitest';
import { PACKS } from '../../packages/language-packs/src';
import { albanianRegistry, createGoListen, defaultRegistries, deviceRegistry, indexRegistries } from '../../packages/golisten/src';
import type { GoListenOptions } from '../../packages/golisten/src';
import { createAudioDeps } from '../../packages/gopractice/audio';
import { createDevicePronouncer } from '../../packages/golearn-extension/src/content/voice';
import { EN, ES, fakeAudio, fakeFetch, fakeObjectUrls, fakeSpeech, fakeUtterance, jsonResponse, SQ, SQ_AL, SQ_NET, voice, wavResponse } from '../golisten/pronounce-fakes';
import { flushRowsAfterAll, note } from './model.support';

flushRowsAfterAll('listen.voices');

const LANGS = ['sq', 'de', 'es', 'hi', 'th', 'nb', 'nn', 'he', 'el', 'la'] as const;
type Lang = (typeof LANGS)[number];

const opts = (o: Partial<GoListenOptions> = {}): GoListenOptions => ({
  registries: defaultRegistries(), consent: () => ({ remoteSpeech: false }), speech: fakeSpeech([]), audio: fakeAudio(900),
  fetch: undefined, objectUrl: fakeObjectUrls(), utterance: fakeUtterance, voiceWaitMs: 0, ...o,
});

// ═════════════════════════════ strict language matching: the shared GoListen ═════════════════════════════

describe('§19 device voices are strictly language-matched (shared GoListen, Albanian)', () => {
  const NEIGHBOURS = [EN, ES, voice('Fake Serbian', 'sr-RS'), voice('Fake Macedonian', 'mk-MK'), voice('Fake Kosovo', 'sq-XK'), voice('Fake Italian', 'it-IT'), voice('Fake Greek', 'el-GR')];

  it('with only other-language voices installed (English default, neighbours, even sq-XK) nothing is spoken and no voice is substituted', async () => {
    const speech = fakeSpeech(NEIGHBOURS);
    const g = createGoListen(opts({ speech, registries: [deviceRegistry('sq', ['sq-AL', 'sq'], 'Albanian')] })); // device path only: the remote path has its own consent rules
    for (const kind of ['word', 'phrase', 'sentence'] as const) {
      const r = await g.pronounce({ languageId: 'sq', text: 'shkollë', kind, autoplay: true });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe('no-voice');
        expect(r.message).toMatch(/none of them is used/);
        expect(r.message).not.toContain('shkollë'); // the text never appears in a failure message
      }
    }
    expect(speech.spoken).toEqual([]);
    const a = await g.availability('sq');
    expect(a.canPronounce).toBe(false);
    expect(a.voices.find((v) => v.provider === 'device')!.state).toBe('unavailable');
    note('V1', '§19', 'Albanian with only EN, ES, sr-RS, mk-MK, sq-XK, it-IT, el-GR voices installed', 'no-voice for word/phrase/sentence; nothing spoken; device entry unavailable', `reasons no-voice×3; spoken ${speech.spoken.length}; device entry ${a.voices.find((v) => v.provider === 'device')!.state}`);
  });

  it.each([['sq-AL'], ['sq'], ['sq_AL'], ['SQ-al']])('a voice tagged "%s" IS accepted, and the utterance carries that voice and its own language tag', async (tag) => {
    const v = voice(`Albanian ${tag}`, tag);
    const speech = fakeSpeech([EN, ES, v]);
    const g = createGoListen(opts({ speech }));
    const r = await g.pronounce({ languageId: 'sq', text: 'shkollë', kind: 'word', autoplay: true });
    expect(r.ok).toBe(true);
    expect(speech.spoken).toHaveLength(1);
    expect(speech.spoken[0]!.voice).toBe(v);
    expect(speech.spoken[0]!.lang).toBe(tag);
  });

  it('asking for another language\'s voice by id is refused (wrong-language-voice) and nothing is spoken; the right voice by id works', async () => {
    const speech = fakeSpeech([EN, SQ_AL]);
    const g = createGoListen(opts({ speech }));
    const wrong = await g.pronounce({ languageId: 'sq', text: 'shkollë', kind: 'word', voiceId: 'device:Fake English', autoplay: true });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toBe('wrong-language-voice');
    expect(speech.spoken).toEqual([]);
    const right = await g.pronounce({ languageId: 'sq', text: 'shkollë', kind: 'word', voiceId: 'device:Fake Albanian AL', autoplay: true });
    expect(right.ok).toBe(true);
    expect(speech.spoken[0]!.voice).toBe(SQ_AL);
  });

  it('a networked (non-local) Albanian voice needs the remote-speech consent; local voices are preferred over it; the default voice is never a fallback', async () => {
    const speechNet = fakeSpeech([EN, SQ_NET]);
    const noConsent = await createGoListen(opts({ speech: speechNet })).pronounce({ languageId: 'sq', text: 'shkollë', kind: 'word', autoplay: true });
    expect(noConsent.ok).toBe(false);
    if (!noConsent.ok) expect(noConsent.reason).toBe('no-consent');
    expect(speechNet.spoken).toEqual([]);
    const withConsent = await createGoListen(opts({ speech: speechNet, consent: () => ({ remoteSpeech: true }) })).pronounce({ languageId: 'sq', text: 'shkollë', kind: 'word', autoplay: true, processingPermission: 'allowed', preferred: 'device' });
    expect(withConsent.ok).toBe(true);

    const both = fakeSpeech([SQ_NET, SQ, EN]);
    const r = await createGoListen(opts({ speech: both })).pronounce({ languageId: 'sq', text: 'shkollë', kind: 'word', autoplay: true });
    expect(r.ok).toBe(true);
    expect(both.spoken[0]!.voice).toBe(SQ); // local first even though the networked voice is listed first
  });

  it('an English-only device gives Albanian nothing, in assessment too: the stimulus is unavailable, never an English-voiced Albanian word', async () => {
    const speech = fakeSpeech([EN]);
    const s = await createGoListen(opts({ speech })).assessment().prepareStimulus({ languageId: 'sq', kind: 'word', text: 'shkollë', itemIds: ['x'] });
    expect('unavailable' in s).toBe(true);
    expect(speech.spoken).toEqual([]);
  });
});

// ═════════════════════════════ strict language matching: the GoLearn extension pronouncer ═════════════════════════════

describe('§19 the extension\'s content-script pronouncer uses the same strict rule for every language of the product', () => {
  /** Voices of languages near to each target; none of them may ever be used for it. */
  const OTHER_TAGS = ['en-US', 'sq-AL', 'de-DE', 'es-ES', 'hi-IN', 'th-TH', 'nb-NO', 'nn-NO', 'he-IL', 'el-GR', 'da-DK', 'sv-SE', 'nl-NL', 'pt-PT', 'ca-ES', 'ur-IN', 'mr-IN', 'sr-RS', 'mk-MK', 'lo-LA', 'is-IS'];
  const tagsOf = (l: Lang): string[] => ({ sq: ['sq'], de: ['de'], es: ['es'], hi: ['hi'], th: ['th'], nb: ['nb', 'no'], nn: ['nn'], he: ['he', 'iw'], el: ['el'], la: ['la', 'it'] }[l]); // la: the Italian voice is Latin's registered stand-in (deviceTags.ts)
  const familyOf = (tag: string): string => tag.toLowerCase().split(/[-_]/)[0]!;

  it.each(LANGS)('%s: no voice is used when only other languages\' voices are installed; its own voice is used when present', async (lang) => {
    const others = OTHER_TAGS.filter((t) => !tagsOf(lang).includes(familyOf(t))).map((t) => voice(`V ${t}`, t, { default: t === 'en-US' }));
    const speech = fakeSpeech(others);
    const p = createDevicePronouncer({ speech, utterance: fakeUtterance, voiceWaitMs: 0 });
    const a = await p.availability(lang);
    expect(a.available, a.note).toBe(false);
    const played = await p.play('x', lang);
    expect(played.ok).toBe(false);
    expect(speech.spoken).toEqual([]);

    const own = voice(`Own ${lang}`, lang === 'nb' ? 'nb-NO' : `${lang}-${lang === 'sq' ? 'AL' : lang === 'de' ? 'DE' : lang === 'es' ? 'ES' : lang === 'hi' ? 'IN' : lang === 'th' ? 'TH' : lang === 'he' ? 'IL' : lang === 'el' ? 'GR' : lang === 'la' ? 'VA' : 'NO'}`);
    const speech2 = fakeSpeech([...others, own]);
    const p2 = createDevicePronouncer({ speech: speech2, utterance: fakeUtterance, voiceWaitMs: 0 });
    expect((await p2.availability(lang)).available).toBe(true);
    expect((await p2.play('x', lang)).ok).toBe(true);
    expect(speech2.spoken[0]!.voice).toBe(own);
  });

  it('the two Norwegian standards are not interchangeable: a Nynorsk voice never serves Bokmål, a Bokmål or generic "no" voice never serves Nynorsk', async () => {
    const check = async (lang: 'nb' | 'nn', tag: string): Promise<boolean> =>
      (await createDevicePronouncer({ speech: fakeSpeech([voice('v', tag)]), utterance: fakeUtterance, voiceWaitMs: 0 }).availability(lang)).available;
    expect(await check('nb', 'nn-NO')).toBe(false);
    expect(await check('nn', 'nb-NO')).toBe(false);
    expect(await check('nn', 'no-NO')).toBe(false);
    expect(await check('nn', 'no')).toBe(false);
    expect(await check('nb', 'nb-NO')).toBe(true);
    expect(await check('nb', 'no-NO')).toBe(true); // the generic Norwegian voice is a registered Bokmål tag
    note('V2', '§19', 'Norwegian voices across the two written standards', 'nn voice never serves nb; nb/no voices never serve nn; no-NO serves nb only', 'nb←nn-NO false; nn←nb-NO false; nn←no-NO false; nn←no false; nb←nb-NO true; nb←no-NO true');
  });
});

// ═════════════════════════════ the table ═════════════════════════════

/** Accepted device tags of the extension pronouncer, found by probing a fixed candidate list per language. */
const PROBE: Record<Lang, string[]> = {
  sq: ['sq', 'sq-AL', 'sq-XK', 'sq-MK'],
  de: ['de', 'de-DE', 'de-AT', 'de-CH', 'de-LI'],
  es: ['es', 'es-ES', 'es-MX', 'es-US', 'es-HN', 'es-AR', 'es-CO'],
  hi: ['hi', 'hi-IN'],
  th: ['th', 'th-TH'],
  nb: ['nb', 'nb-NO', 'no', 'no-NO', 'nn-NO'],
  nn: ['nn', 'nn-NO', 'nb-NO', 'no', 'no-NO'],
  he: ['he', 'he-IL', 'iw', 'yi', 'ar-SA'],
  el: ['el', 'el-GR', 'el-CY', 'grc', 'tr-TR'],
  la: ['la', 'la-VA', 'it', 'it-IT', 'es-ES', 'fr-FR', 'ro-RO'],
};

async function acceptedTags(lang: Lang): Promise<string[]> {
  const ok: string[] = [];
  for (const tag of PROBE[lang]) {
    const p = createDevicePronouncer({ speech: fakeSpeech([voice('probe', tag)]), utterance: fakeUtterance, voiceWaitMs: 0 });
    if ((await p.availability(lang)).available) ok.push(tag);
  }
  return ok;
}

describe('§19 per-language voice and audio-quality table (sq, de, es, hi, th, nb, nn)', () => {
  it('is built from defaultRegistries() + the packs\' pronunciation blocks + probes, with "none" where nothing exists', async () => {
    const registries = indexRegistries(defaultRegistries());
    const quiet = createGoListen(opts());
    // a speech proxy with a key that offers EVERY remote voice the registries name, so "online" measures the registries and not the fake
    const offered = [...registries.values()].flatMap((r) => r.entries.filter((e) => e.source.kind === 'remote').map((e) => ({ id: e.source.kind === 'remote' ? e.source.providerVoice : '', lang: e.languageId })));
    const proxy = fakeFetch((url) => {
      if (url.endsWith('/status')) return jsonResponse(200, { configured: true, provider: 'azure-speech', providerVersion: 'audit', region: 'x', format: 'riff-24khz-16bit-mono-pcm', maxChars: 5000 });
      if (url.includes('/voices')) { const l = new URL(url, 'http://x').searchParams.get('lang'); return jsonResponse(200, { voices: offered.filter((v) => v.lang === l).map((v) => ({ id: v.id, name: v.id, lang: v.lang, locale: v.id.split('-').slice(0, 2).join('-') })) }); }
      if (url.endsWith('/synthesize')) return wavResponse();
      return jsonResponse(404, { error: 'not-found' });
    });
    const online = createGoListen(opts({ consent: () => ({ remoteSpeech: true }), fetch: proxy.fetch }));
    const table: Array<Record<string, string>> = [];

    for (const lang of LANGS) {
      const pack = PACKS[lang]!;
      const pr = pack.pronunciation;
      const reg = registries.get(lang);
      const by = (k: string) => reg?.entries.filter((e) => e.provider === k) ?? [];
      const recordings = by('recorded');
      const remote = by('remote');
      const device = by('device');
      const reviewed = (reg?.entries ?? []).filter((e) => !e.synthetic && e.suitableForAssessment && e.qualityVerification === 'native-reviewed');
      const a0 = await quiet.availability(lang);
      const a1 = await online.availability(lang);
      const tags = await acceptedTags(lang);
      const row = {
        lang,
        pack: `${pack.status}; registryRef ${pr.registryRef}; recordings ${pr.recordings}; notes ${pr.notesAvailable ? 'yes' : 'no'}; deviceVoiceExpected ${pr.deviceVoiceExpected}`,
        packRemote: pr.remoteVoice.voices.length ? pr.remoteVoice.voices.join(', ') : 'none',
        registry: reg ? 'yes' : 'none',
        recordings: recordings.length ? recordings.map((e) => `${e.label} [${e.qualityVerification}; ${e.supports.join('/')}]`).join('; ') : 'none',
        device: device.length ? `template in shared registry (tags ${device.map((e) => (e.source.kind === 'device' ? e.source.langTags.join(', ') : '')).join('; ')})` : 'none in shared registry',
        deviceExt: tags.length ? tags.join(', ') : 'none',
        extNotInShared: device.length ? (tags.filter((t) => !device.some((e) => e.source.kind === 'device' && e.source.langTags.map((x) => x.toLowerCase()).includes(t.toLowerCase()))).join(', ') || 'none') : 'n/a (no shared device entry)',
        packVsRegistryRemote: remote.length || pr.remoteVoice.voices.length ? (JSON.stringify([...pr.remoteVoice.voices].sort()) === JSON.stringify(remote.map((e) => e.voiceId.split(':')[1]).sort()) ? 'same' : `differ (pack: ${pr.remoteVoice.voices.join(', ') || 'none'}; registry: ${remote.map((e) => e.voiceId.split(':')[1]).join(', ') || 'none'})`) : 'none both',
        remote: remote.length ? remote.map((e) => e.voiceId.split(':')[1]).join(', ') : 'none',
        phonetics: reg?.phonetics ? 'rule-based letter notes (registry)' : 'none',
        evidence: reviewed.length ? 'possible' : 'none (no reviewed human recording)',
        quiet: `${a0.canPronounce ? 'can speak' : 'cannot speak'}; ${a0.voices.map((v) => `${v.provider}:${v.state}`).join(', ') || 'no voices'}`,
        online: `${a1.canPronounce ? 'can speak' : 'cannot speak'}; ${a1.voices.map((v) => `${v.provider}:${v.state}`).join(', ') || 'no voices'}`,
        gap: (a0.gaps[0] ?? '').slice(0, 90),
      };
      table.push(row);
      note(`T-${lang}`, 'voice-table', lang, 'see columns', JSON.stringify(row));
    }

    // facts every row must satisfy today (the table is evidence, these are the invariants it must keep)
    const row = (l: Lang) => table.find((r) => r.lang === l)!;
    expect(table.every((r) => r.evidence.startsWith('none'))).toBe(true); // no language has listening-evidence-grade audio
    expect(row('sq').registry).toBe('yes');
    expect(row('sq').remote).toBe('sq-AL-AnilaNeural, sq-AL-IlirNeural');
    expect(row('sq').packRemote).toBe(row('sq').remote); // pack and registry name the same two voices
    expect(row('sq').online).toMatch(/^can speak/);
    expect(row('sq').quiet).toMatch(/^cannot speak/);
    expect(row('de').recordings).toMatch(/demonstration asset.*unverified.*phrase/);
    // the table is derived, so its own claims are cross-checked against the registries it was derived from
    for (const l of LANGS) {
      expect(row(l).registry === 'yes', l).toBe(registries.has(l));
      if (!registries.has(l)) expect(row(l).online, l).toMatch(/^cannot speak; no voices/); // "none" is stated, not guessed
    }
    expect(table.filter((r) => r.registry === 'none').length + table.filter((r) => r.registry === 'yes').length).toBe(LANGS.length);
    // the extension accepts a device voice for every language of the product, but only for its own tags
    for (const l of LANGS) expect(row(l).deviceExt, l).not.toBe('none');
    expect(row('es').deviceExt).toBe('es-ES, es-MX, es-HN'); // the probe inventory has no es-419 voice
    expect(row('nn').deviceExt).toBe('nn, nn-NO');
    expect(row('he').deviceExt).toBe('he, he-IL, iw');
    expect(row('el').deviceExt).toBe('el, el-GR');
    expect(row('la').deviceExt).toBe('la, la-VA, it, it-IT'); // the Italian stand-in is registered; Spanish, French, Romanian never serve Latin
    expect(row('sq').deviceExt).toBe('sq, sq-AL');
  });

  it('the pack of every language says "no recordings"; the registry holds exactly one demonstration clip (German) — pack and registry disagree only there', () => {
    const registries = indexRegistries(defaultRegistries());
    const withClips = LANGS.filter((l) => (registries.get(l)?.entries ?? []).some((e) => e.provider === 'recorded'));
    expect(withClips).toEqual(['de']);
    expect(LANGS.every((l) => PACKS[l]!.pronunciation.recordings === 'none')).toBe(true);
    note('V3', '§19', 'recordings declared by packs vs registered', 'packs: none everywhere; registry: one German demonstration clip, unreviewed, not suitable for assessment', 'agree except de (demonstration asset, flagged "not a pronunciation resource")');
  });

  it('the Albanian registry offers exactly the voices its pack and README promise, all synthetic, none suitable for assessment', () => {
    const r = albanianRegistry();
    expect(r.entries.map((e) => [e.provider, e.synthetic, e.suitableForAssessment, e.qualityVerification])).toEqual([
      ['device', true, false, 'unverified'], ['remote', true, false, 'unverified'], ['remote', true, false, 'unverified'],
    ]);
    expect(r.gaps.join(' ')).toMatch(/No Albanian recordings/);
  });

  it('DEFECT D7 (fixed): every pack registryRef names a registry that exists and every language answers; device speech is available only for each language\'s strict tags', async () => {
    const registries = indexRegistries(defaultRegistries());
    const dangling = LANGS.filter((l) => !registries.has(PACKS[l]!.pronunciation.registryRef.replace('golisten:', '')));
    const detail: string[] = [];
    const hearable: string[] = [];
    // a typical device voice for each language (a regional tag, as phones and desktops ship them)
    const TYPICAL: Record<Lang, string> = { sq: 'sq-AL', de: 'de-DE', es: 'es-ES', hi: 'hi-IN', th: 'th-TH', nb: 'nb-NO', nn: 'nn-NO', he: 'he-IL', el: 'el-GR', la: 'it-IT' };
    for (const lang of LANGS) {
      const deps = createAudioDeps({ consent: () => false, registries: defaultRegistries(), speech: fakeSpeech([voice(`Own ${lang}`, TYPICAL[lang])]), audio: fakeAudio(900), voiceWaitMs: 0, utterance: fakeUtterance, objectUrl: fakeObjectUrls() });
      const g = createGoListen(opts({ speech: fakeSpeech([voice(`Own ${lang}`, TYPICAL[lang])]) }));
      const cap = await g.availability(lang); // capability reporting: answers for every pack language, never throws
      expect(cap.languageId).toBe(lang);
      expect(cap.gaps.length, `${lang} says what is missing`).toBeGreaterThan(0);
      const avail = (await deps.availability(lang)).available;
      const stim = await deps.source()!.prepareStimulus({ languageId: lang, kind: 'word', text: 'xyz', itemIds: ['u'] });
      const usable = avail && !('unavailable' in stim);
      if (usable) hearable.push(lang);
      detail.push(`${lang}: registry ${registries.has(lang) ? 'yes' : 'none'}, entries ${registries.get(lang)?.entries.length ?? 0}, availability ${avail}, arbitrary word ${'unavailable' in stim ? 'unavailable' : 'prepared'}`);
    }
    expect(hearable).toEqual(LANGS); // every language has a strict device template; synthetic speech remains practice only
    note('D7', '§19', 'GoReview/GoPractice audio availability per language with a matching device voice installed; pack registryRef resolution', 'every registryRef resolves; every language answers; device speech is offered only for its own language tags', `registryRef with no registry: [${dangling}]; hearable with a typical device voice: [${hearable}] (${detail.join('; ')}).`);
    expect(dangling).toEqual([]);
  });
});
