/**
 * The language tags a device voice must carry for each language (GoListen matches them strictly: no neighbour language is
 * ever "close enough"). Albanian has none: no device ships an Albanian voice today. Kept in a module of its own, with no
 * GoListen import, so the popup can say which chosen languages this browser can speak without reaching the audio code
 * (only the content script may reach GoListen: test/audit/conformance.structure.test.ts).
 */
export const DEVICE_TAGS: Readonly<Record<string, readonly string[]>> = {
  de: ['de-DE', 'de-AT', 'de-CH', 'de'], es: ['es-HN', 'es-ES', 'es-MX', 'es-US', 'es'], hi: ['hi-IN', 'hi'], th: ['th-TH', 'th'], nb: ['nb-NO', 'nb', 'no-NO', 'no'], nn: ['nn-NO', 'nn'],
};

/** Does any of these voices (the browser's `speechSynthesis.getVoices()`) serve the language, by the same strict tag rule? Albanian: never. */
export function hasDeviceVoice(languageId: string, voices: ReadonlyArray<{ lang: string }>): boolean {
  const tags = DEVICE_TAGS[languageId];
  if (!tags) return false;
  const norm = (t: string) => t.toLowerCase().replace(/_/g, '-');
  return voices.some((v) => tags.some((t) => norm(v.lang) === norm(t)));
}
