/**
 * The language tags a device voice must carry for each language (GoListen matches them strictly: no neighbour language is
 * ever "close enough"). Availability is measured from the browser, not assumed from the language. Kept in a module of its own, with no
 * audio import, so the popup can say which chosen languages this browser can speak without reaching the audio code
 * (only the content script may reach GoListen's playback code: test/audit/conformance.structure.test.ts).
 */
import { ALBANIAN_DEVICE_TAGS, SPANISH_DEVICE_TAGS, GERMAN_DEVICE_TAGS, HINDI_DEVICE_TAGS, THAI_DEVICE_TAGS, BOKMAL_DEVICE_TAGS, NYNORSK_DEVICE_TAGS, HEBREW_DEVICE_TAGS, GREEK_DEVICE_TAGS, LATIN_DEVICE_TAGS } from '../../../golisten/src/deviceTags';

export const DEVICE_TAGS: Readonly<Record<string, readonly string[]>> = {
  sq: ALBANIAN_DEVICE_TAGS,
  de: GERMAN_DEVICE_TAGS, es: SPANISH_DEVICE_TAGS, hi: HINDI_DEVICE_TAGS, th: THAI_DEVICE_TAGS, nb: BOKMAL_DEVICE_TAGS, nn: NYNORSK_DEVICE_TAGS, he: HEBREW_DEVICE_TAGS, el: GREEK_DEVICE_TAGS, la: LATIN_DEVICE_TAGS,
};

/** Does any of these voices (the browser's `speechSynthesis.getVoices()`) serve the language, by the same strict tag rule? */
export function hasDeviceVoice(languageId: string, voices: ReadonlyArray<{ lang: string }>): boolean {
  const tags = DEVICE_TAGS[languageId];
  if (!tags) return false;
  const norm = (t: string) => t.toLowerCase().replace(/_/g, '-');
  return voices.some((v) => tags.some((t) => norm(v.lang) === norm(t)));
}
