/**
 * Voice registries, one per language. A registry is DATA: which voices GoListen may offer for a language, with their
 * licence, whether they are synthetic, how far they are verified, and what is honestly missing. Availability (is the
 * voice there right now?) is resolved against the environment in listing.ts.
 *
 * Albanian (sq) in this repository:
 *   recorded  none. No Albanian recording exists here; nothing is claimed.
 *   device    whatever `speechSynthesis.getVoices()` offers whose lang is exactly "sq" or "sq-AL". No other voice is
 *             ever substituted. None is installed on the development machine.
 *   remote    Azure Neural "sq-AL-AnilaNeural" and "sq-AL-IlirNeural" through the same-origin speech proxy
 *             (server/speechHandler.ts). Synthetic, unverified, needs the learner's consent and a server key.
 * German (de) carries one demonstration recording (Wikimedia Commons De-Guten_Tag.oga, public domain), so playback can
 * be shown end to end. It says "Guten Tag!" and nothing else.
 */
import type { PronunciationKind, PhoneticDetail, VoiceDescriptor } from './contracts';
import { albanianPhonetics } from './phonetics';

export type VoiceSource =
  | { kind: 'device'; langTags: string[] }
  | { kind: 'remote'; providerId: string; providerVoice: string; locale: string }
  | { kind: 'recorded'; recordings: RecordedClip[] };

export interface RecordedClip {
  /** What the recording says. A request is served by a recording only when its text matches this. */
  text: string;
  url: string;
  attribution: string;
}

/** A registry entry: the voice's public descriptor plus how to reach it. */
export interface VoiceEntry extends VoiceDescriptor { source: VoiceSource }

export interface VoiceRegistry {
  languageId: string;
  entries: VoiceEntry[];
  /** What is honestly NOT available for this language, shown in `availability()` and in failure alternatives. */
  gaps: string[];
  /** Phonetic notes that need no audio (rule-based; see phonetics.ts). */
  phonetics?: (text: string, kind: PronunciationKind) => PhoneticDetail | undefined;
}

const ALL_KINDS: PronunciationKind[] = ['word', 'phrase', 'sentence'];

export const DEVICE_LICENCE = 'Provided by the device or browser; the operating-system or browser vendor\'s terms apply';
export const AZURE_LICENCE = 'Microsoft Azure Speech terms (owner\'s subscription)';
export const AZURE_PROVIDER_ID = 'azure-speech'; // SPEECH_PROVIDER_ID in server/speechHandler.ts (not imported: package boundary)

export const SYNTHETIC_LIMITATIONS = [
  'Synthetic speech: practice only, never counted as listening evidence.',
  'Pronunciation accuracy for this language has not been checked by a native speaker.',
];

/** A device-voice template for a language: expanded into one entry per matching installed voice when listed. */
export function deviceEntry(languageId: string, langTags: string[], languageName: string): VoiceEntry {
  return {
    voiceId: `device:${languageId}`, languageId, provider: 'device', execution: 'local', synthetic: true,
    licence: DEVICE_LICENCE, qualityVerification: 'unverified', knownLimitations: [...SYNTHETIC_LIMITATIONS],
    supports: [...ALL_KINDS], suitableForAssessment: false, label: `Device voice (${languageName})`,
    source: { kind: 'device', langTags },
  };
}

/** A registry that offers only the device's own voices for the language. */
export function deviceRegistry(languageId: string, langTags: string[], languageName: string): VoiceRegistry {
  return {
    languageId,
    entries: [deviceEntry(languageId, langTags, languageName)],
    gaps: [`No ${languageName} recordings are registered; nothing is claimed.`],
  };
}

function azureEntry(providerVoice: string, who: string, gender: string, lang = { languageId: 'sq', locale: 'sq-AL', name: 'Albanian' }): VoiceEntry {
  return {
    voiceId: `${AZURE_PROVIDER_ID}:${providerVoice}`, languageId: lang.languageId, varietyId: lang.locale, provider: 'remote', execution: 'remote',
    synthetic: true, licence: AZURE_LICENCE, qualityVerification: 'unverified',
    knownLimitations: [
      ...SYNTHETIC_LIMITATIONS,
      'The text is sent to a speech service: it plays only with the learner\'s consent and a key configured on the server.',
      'The voice has never been called against the live service from this repository (proxy tested against a mock only).',
    ],
    supports: [...ALL_KINDS], suitableForAssessment: false, label: `Azure Neural ${who} (${lang.name}, ${gender}), synthetic`,
    source: { kind: 'remote', providerId: AZURE_PROVIDER_ID, providerVoice, locale: lang.locale },
  };
}

export const ALBANIAN_DEVICE_TAGS = ['sq-AL', 'sq'] as const;

export function albanianRegistry(): VoiceRegistry {
  return {
    languageId: 'sq',
    entries: [
      { ...deviceEntry('sq', [...ALBANIAN_DEVICE_TAGS], 'Albanian'), varietyId: 'sq-AL' },
      azureEntry('sq-AL-AnilaNeural', 'Anila', 'female'),
      azureEntry('sq-AL-IlirNeural', 'Ilir', 'male'),
    ],
    gaps: [
      'No Albanian recordings exist; nothing is claimed.',
      'No Albanian voice is installed on the development machine; a device voice appears only if the device offers one tagged sq or sq-AL.',
      'No native-reviewed Albanian audio exists, so there is no Albanian listening evidence.',
    ],
    phonetics: (text) => albanianPhonetics(text),
  };
}

export const DEMO_RECORDING_TEXT = 'Guten Tag!';
/** Where a host serves the demonstration file (test/fixtures/golisten/de-guten-tag.wav) from; override with `url`. */
export const DEFAULT_DEMO_URL = '/demo/de-guten-tag.wav';

export function demoGermanRegistry(opts: { url?: string } = {}): VoiceRegistry {
  const attribution = 'Recording uploaded by Beagle Beck, Wikimedia Commons, 27 February 2007; PD-self (https://commons.wikimedia.org/wiki/File:De-Guten_Tag.oga). Author attributed as assumed in the source metadata.';
  return {
    languageId: 'de',
    entries: [{
      voiceId: 'recording:de-guten-tag-commons', languageId: 'de', varietyId: 'de-DE', provider: 'recorded', execution: 'local', synthetic: false,
      licence: 'Public domain (PD-self dedication by the uploader), Wikimedia Commons File:De-Guten_Tag.oga',
      qualityVerification: 'unverified',
      knownLimitations: [
        'Demonstration asset: one two-word greeting and nothing else.',
        'No native-speaker review of the recording; the performer was not independently investigated.',
        'Not suitable for listening assessment.',
      ],
      supports: ['phrase'], suitableForAssessment: false, label: 'demonstration asset (German recording)',
      source: { kind: 'recorded', recordings: [{ text: DEMO_RECORDING_TEXT, url: opts.url ?? DEFAULT_DEMO_URL, attribution }] },
    }],
    gaps: ['This is a demonstration asset, not a pronunciation resource for German.'],
  };
}

/** The device-voice language tags accepted for Spanish: Honduras (the course's target), Latin America (general), Mexico, Spain. */
export const SPANISH_DEVICE_TAGS = ['es-HN', 'es-419', 'es-MX', 'es-ES'] as const;

/**
 * Spanish (es), the second language to go through the same shared interfaces as Albanian (prompt 6, section 25).
 *   recorded  none.
 *   device    whatever the device offers tagged es-HN, es-419, es-MX or es-ES (strict: a bare "es" or es-AR is not accepted).
 *   remote    Azure Neural es-HN and es-MX voices through the same proxy; synthetic, unverified, consent and a key required.
 */
export function spanishRegistry(): VoiceRegistry {
  const hn = { languageId: 'es', locale: 'es-HN', name: 'Spanish, Honduras' };
  const mx = { languageId: 'es', locale: 'es-MX', name: 'Spanish, Mexico' };
  return {
    languageId: 'es',
    entries: [
      deviceEntry('es', [...SPANISH_DEVICE_TAGS], 'Spanish'),
      azureEntry('es-HN-CarlosNeural', 'Carlos', 'male', hn),
      azureEntry('es-HN-KarlaNeural', 'Karla', 'female', hn),
      azureEntry('es-MX-DaliaNeural', 'Dalia', 'female', mx),
    ],
    gaps: [
      'No Spanish recordings exist; nothing is claimed.',
      'No native-reviewed Spanish audio exists, so there is no Spanish listening evidence.',
      'A device voice appears only if the device offers one tagged es-HN, es-419, es-MX or es-ES; a voice for another Spanish variety (es-AR, es-CO …) or a bare "es" is not substituted.',
      'There is no Spanish phonetic-notes rule set in GoListen yet (Albanian has one), so a Spanish card shows no per-letter pronunciation notes from GoListen.',
    ],
  };
}

export function defaultRegistries(opts: { demoUrl?: string } = {}): VoiceRegistry[] {
  return [albanianRegistry(), demoGermanRegistry({ url: opts.demoUrl }), spanishRegistry()];
}

/** Merges registries of the same language (entries and gaps concatenate; the first `phonetics` wins). */
export function indexRegistries(registries: readonly VoiceRegistry[]): Map<string, VoiceRegistry> {
  const out = new Map<string, VoiceRegistry>();
  for (const r of registries) {
    const have = out.get(r.languageId);
    if (!have) { out.set(r.languageId, { ...r, entries: [...r.entries], gaps: [...r.gaps] }); continue; }
    have.entries.push(...r.entries);
    have.gaps.push(...r.gaps.filter((g) => !have.gaps.includes(g)));
    have.phonetics ??= r.phonetics;
  }
  return out;
}

export const descriptorOf = (e: VoiceEntry): VoiceDescriptor => {
  const { source, ...d } = e;
  return d;
};
