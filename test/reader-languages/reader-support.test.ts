// @vitest-environment node
/**
 * The reader's view of the capability reports (packages/golearn-extension/src/language/capabilities.ts): what the card can
 * offer in each language is derived from what the pack really supports, and the setup page's level label is the
 * experimental wording for German, Hindi and Thai.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioAvailability, audioOf, packCapabilities as reportWithAudio, readerSupport, readerSupportList } from '../../packages/golearn-extension/src/language/capabilities';
import type { GoListenEnv } from '../../packages/golisten/src/environment';
import { fakeSpeech, voice } from '../golisten/pronounce-fakes';
import { PARSER_LANGUAGES } from '../../packages/golearn-extension/src/parser';
import { PACKS, packCapabilities } from '../../packages/language-packs/src';

describe('readerSupport', () => {
  it('has one entry per pack, and a language with no pack has none', () => {
    expect(readerSupportList().map((s) => s.languageId)).toEqual(Object.keys(PACKS));
    expect(readerSupport('xx')).toBeUndefined();
    expect(readerSupport('constructor')).toBeUndefined();
  });

  it('the parser can read exactly the packs that are wired: all ten, Norwegian Bokmål, Nynorsk and (since 2026-10-17) Latin, Hebrew and Greek included', () => {
    for (const s of readerSupportList()) expect(s.parseable, s.languageId).toBe(PARSER_LANGUAGES.includes(s.languageId));
    expect(readerSupportList().map((s) => s.parseable)).toEqual([true, true, true, true, true, true, true, true, true, true]);
    for (const l of ['nb', 'nn']) {
      const s = readerSupport(l)!;
      expect(s.lines.join('\n'), l).not.toMatch(/cannot read selections/);
      expect(s.lines[0], l).toBe('Experimental: nothing in this pack has been reviewed by a native speaker.');
      expect(s.offers, l).toMatchObject({ lemma: true, morphology: true, phrases: true, constructions: true, syntaxRoles: false, productionChecks: false });
    }
  });

  it('the setup page’s words: installable, and experimental (German, Hindi, Thai, Norwegian)', () => {
    expect(readerSupport('sq')!.levelLabel).toBe('installable');
    expect(readerSupport('es')!.levelLabel).toBe('installable');
    for (const l of ['de', 'hi', 'th', 'nb', 'nn', 'la']) expect(readerSupport(l)!.levelLabel, l).toBe('experimental, seed-only lemmatisation, unreviewed');
  });

  it('what a card offers is what the report states, and never syntax roles', () => {
    for (const s of readerSupportList().filter((x) => x.parseable)) {
      const r = packCapabilities(s.languageId)!;
      expect(s.offers, s.languageId).toMatchObject({ lemma: r.lemma.supported, morphology: r.morphology.supported, phrases: r.phrases.supported, constructions: r.constructions.supported, syntaxRoles: false, productionChecks: r.checker.offered });
      expect(s.report, s.languageId).toEqual(packCapabilities(s.languageId, audioOf));
    }
    expect(readerSupport('th')!.offers.morphology).toBe(false);
    expect(readerSupport('th')!.lines).toContain('No morphology for this language.');
    expect(readerSupport('de')!.offers.productionChecks).toBe(false);
    expect(readerSupport('sq')!.offers.productionChecks).toBe(true);
  });

  it('the plain lines are honest: experimental, seed-only lemmas, limited word boundaries (Thai), no syntactic roles, no checking of writing', () => {
    const th = readerSupport('th')!.lines.join('\n');
    expect(th).toMatch(/Experimental: nothing in this pack has been reviewed by a native speaker/);
    expect(th).toMatch(/Lemmas come from a small word list/);
    expect(th).toMatch(/Word boundaries are limited/);
    expect(th).toMatch(/No syntactic roles/);
    expect(th).toMatch(/Nothing you write is checked/);
    expect(readerSupport('de')!.lines.join('\n')).not.toMatch(/Word boundaries are limited/);
    expect(readerSupport('sq')!.lines.join('\n')).toMatch(/Machine-drafted: no native speaker has checked this pack/);
    expect(readerSupport('sq')!.lines.join('\n')).not.toMatch(/Nothing you write is checked/);
  });
});

describe('audio: GoListen’s registry, read by the extension’s view, not a hand-written claim', () => {
  it('Albanian: no recordings, a device-voice template, two remote voices, per-letter notes; Spanish: device template, three remote voices, no notes', () => {
    expect(audioOf('sq')).toMatchObject({ recordings: 0, deviceVoiceTemplate: true, phoneticNotes: true, listeningEvidence: false });
    expect(audioOf('sq').remoteVoices).toEqual(['azure-speech:sq-AL-AnilaNeural', 'azure-speech:sq-AL-IlirNeural']);
    expect(audioOf('es')).toMatchObject({ recordings: 0, deviceVoiceTemplate: true, phoneticNotes: false });
    expect(audioOf('es').remoteVoices).toHaveLength(3);
  });

  it('German has one demonstration recording and nothing else; Hindi, Thai and Norwegian have no audio at all, and say what is missing', () => {
    const de = audioOf('de');
    expect(de).toMatchObject({ recordings: 1, deviceVoiceTemplate: false, remoteVoices: [] });
    expect(de.gaps.join(' ')).toMatch(/demonstration asset, not a pronunciation resource/);
    for (const lang of ['hi', 'th', 'nb', 'nn']) {
      const a = audioOf(lang);
      expect(a, lang).toMatchObject({ recordings: 0, deviceVoiceTemplate: false, remoteVoices: [], phoneticNotes: false, listeningEvidence: false });
      expect(a.gaps.join(' '), lang).toMatch(/no .* voice registered|nothing is claimed/);
    }
    expect(audioOf('xx').gaps.join(' ')).toMatch(/No voices are registered for xx/);
  });

  it('no pack ever has listening evidence, and the reader’s report carries the audio line', () => {
    for (const s of readerSupportList()) expect(s.report.audio?.listeningEvidence, s.languageId).toBe(false);
    expect(reportWithAudio('hi')!.audio).toEqual(audioOf('hi'));
    expect(readerSupport('hi')!.lines).toContain('No voice is registered for this language: nothing can be played.');
    expect(readerSupport('de')!.lines).toContain('The only audio is a short demonstration clip; no voice can read other text aloud.');
    expect(readerSupport('sq')!.lines.join(' ')).not.toMatch(/No voice is registered/);
  });

  const env = (voices: Array<ReturnType<typeof voice>>): GoListenEnv => ({
    consent: () => ({ remoteSpeech: false }), speech: fakeSpeech(voices), utterance: () => ({ lang: '', rate: 1, voice: null, onend: null, onerror: null }),
    proxyBase: '/api/speech', now: () => 0, voiceWaitMs: 0, cache: new Map(),
  }) as GoListenEnv;

  it('the live half goes through GoListen’s own availability function: a matching device voice makes Spanish speakable, a missing one does not', async () => {
    const yes = await audioAvailability('es', env([voice('Fake Spanish', 'es-ES')]));
    expect(yes.canPronounce).toBe(true);
    const no = await audioAvailability('es', env([voice('English', 'en-US')]));
    expect(no.canPronounce).toBe(false);
    expect(no.voices.find((v) => v.provider === 'device')?.state).toBe('unavailable');
  });

  it('Hindi has no voice at all, whatever the device offers', async () => {
    const r = await audioAvailability('hi', env([voice('Fake Hindi', 'hi-IN')]));
    expect(r.canPronounce).toBe(false);
    expect(r.voices).toEqual([]);
    expect(r.gaps.join(' ')).toMatch(/no Hindi voice registered/);
  });
});

describe('the content script stays light', () => {
  it('neither the resolver nor the parser imports the capability view, the voice registry or the manifests', () => {
    const root = path.resolve(__dirname, '../../packages/golearn-extension/src');
    for (const f of ['language/resolve.ts', 'language/index.ts', 'parser/index.ts', 'parser/cardModel.ts']) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      expect(src, f).not.toMatch(/language-packs|golisten|\.\/capabilities/);
    }
  });
});
