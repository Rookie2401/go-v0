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
 * German (de) carries one demonstration recording (Wikimedia Commons De-Guten_Tag.oga, public domain) and a strict
 * device-voice template, so playback can be shown end to end. The recording says "Guten Tag!" and nothing else.
 */
import type { PronunciationKind, PhoneticDetail, VoiceDescriptor } from './contracts';
import { albanianPhonetics } from './phonetics';
import { ALBANIAN_DEVICE_TAGS, SPANISH_DEVICE_TAGS, GERMAN_DEVICE_TAGS, HINDI_DEVICE_TAGS, THAI_DEVICE_TAGS, BOKMAL_DEVICE_TAGS, NYNORSK_DEVICE_TAGS, HEBREW_DEVICE_TAGS, GREEK_DEVICE_TAGS, LATIN_DEVICE_TAGS } from './deviceTags';
export { ALBANIAN_DEVICE_TAGS, SPANISH_DEVICE_TAGS, GERMAN_DEVICE_TAGS, HINDI_DEVICE_TAGS, THAI_DEVICE_TAGS, BOKMAL_DEVICE_TAGS, NYNORSK_DEVICE_TAGS, HEBREW_DEVICE_TAGS, GREEK_DEVICE_TAGS, LATIN_DEVICE_TAGS } from './deviceTags';

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
      'The Albanian course includes Gheg material, but these voices are tagged Albanian (sq/sq-AL) and are not a Gheg (aln) quality claim; Gheg assessment audio requires separately reviewed Gheg recordings.',
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

/** Device tags accepted by the GoLearn content voice path for the experimental packs. */

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

/** Hindi voices listed by Azure Speech's standard text-to-speech catalog. */
function hindiRegistry(): VoiceRegistry {
  const hi = { languageId: 'hi', locale: 'hi-IN', name: 'Hindi (India)' };
  return {
    languageId: 'hi',
    entries: [
      deviceEntry('hi', [...HINDI_DEVICE_TAGS], 'Hindi'),
      azureEntry('hi-IN-SwaraNeural', 'Swara', 'female', hi),
      azureEntry('hi-IN-MadhurNeural', 'Madhur', 'male', hi),
    ],
    gaps: [
      'No Hindi recordings exist; nothing is claimed.',
      'No native-reviewed Hindi audio exists, so there is no Hindi listening evidence.',
      'A device voice appears only if the device offers one tagged hi-IN or hi.',
    ],
  };
}

/** Thai voices listed by Azure Speech's standard text-to-speech catalog. */
function thaiRegistry(): VoiceRegistry {
  const th = { languageId: 'th', locale: 'th-TH', name: 'Thai (Thailand)' };
  return {
    languageId: 'th',
    entries: [
      deviceEntry('th', [...THAI_DEVICE_TAGS], 'Thai'),
      azureEntry('th-TH-PremwadeeNeural', 'Premwadee', 'female', th),
      azureEntry('th-TH-NiwatNeural', 'Niwat', 'male', th),
    ],
    gaps: [
      'No Thai recordings exist; nothing is claimed.',
      'No native-reviewed Thai audio exists, so there is no Thai listening evidence.',
      'A device voice appears only if the device offers one tagged th-TH or th.',
    ],
  };
}

/**
 * A registry that holds NO voice for a language: capability reporting only. It exists so that `availability(languageId)`
 * and the pack's `registryRef` (`golisten:<lang>`) resolve for every language of the product, answering "cannot speak"
 * with the reasons, instead of "No voices are registered" (which is indistinguishable from a typo). It declares no
 * recording, no device template and no remote voice: nothing is claimed, no voice is validated, nothing can be heard or
 * assessed through it. A language moves out of this state by getting a real registry, not by editing this one.
 */
export function noAudioRegistry(languageId: string, languageName: string, extraGaps: string[] = []): VoiceRegistry {
  return {
    languageId,
    entries: [],
    gaps: [
      `GoListen has no ${languageName} voice registered: no recording, no device-voice template and no remote voice; nothing is claimed.`,
      `No ${languageName} audio exists in this repository, so there is no ${languageName} listening evidence.`,
      ...extraGaps,
    ],
  };
}

/** Synthetic pronunciation entries, with no demonstration recording or recording URL. */
export function pronunciationRegistries(): VoiceRegistry[] {
  const de = { languageId: 'de', locale: 'de-DE', name: 'German (Germany)' };
  return [
    albanianRegistry(),
    {
      languageId: 'de',
      gaps: ['No native-reviewed German pronunciation or qualified assessment recording is supplied.'],
      entries: [
        deviceEntry('de', [...GERMAN_DEVICE_TAGS], 'German'),
        azureEntry('de-DE-KatjaNeural', 'Katja', 'female', de),
        azureEntry('de-DE-ConradNeural', 'Conrad', 'male', de),
      ],
    },
    spanishRegistry(),
    hindiRegistry(),
    thaiRegistry(),
    deviceRegistry('nb', [...BOKMAL_DEVICE_TAGS], 'Norwegian Bokmål'),
    deviceRegistry('nn', [...NYNORSK_DEVICE_TAGS], 'Norwegian Nynorsk'),
    { ...deviceRegistry('he', [...HEBREW_DEVICE_TAGS], 'Hebrew'), gaps: ['No Hebrew recordings are registered; nothing is claimed.', 'No voice exists for Biblical Hebrew: a Modern Hebrew device voice is the only playback, and it is labelled Modern (it does not pronounce Biblical Hebrew).'] },
    { ...deviceRegistry('el', [...GREEK_DEVICE_TAGS], 'Greek'), gaps: ['No Greek recordings are registered; nothing is claimed.', 'No voice exists for ancient Greek (Homeric, Attic or Koine): a Modern Greek device voice is the only playback, and it is labelled Modern (it does not pronounce ancient Greek).'] },
    { ...deviceRegistry('la', [...LATIN_DEVICE_TAGS], 'Latin'), gaps: ['No Latin recordings are registered; nothing is claimed.', 'No device ships a Latin voice: an Italian device voice (it-IT) is the registered stand-in for the Ecclesiastical (Church) reading of the Vulgate texts, and it is labelled a stand-in (it does not pronounce classical Latin; vowel length is not spoken).'] },
  ];
}

export function defaultRegistries(opts: { demoUrl?: string } = {}): VoiceRegistry[] {
  const demo = demoGermanRegistry({ url: opts.demoUrl });
  return pronunciationRegistries().map(reg => reg.languageId === 'de'
    ? { ...reg, entries: [...demo.entries, ...reg.entries], gaps: [...demo.gaps, ...reg.gaps] } : reg);
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
