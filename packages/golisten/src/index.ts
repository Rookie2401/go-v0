/**
 * GoListen: the shared pronunciation and phonological subsystem of the Go ecosystem (GoLearn now, GoReview next).
 * Imports only the Repository contract. See ../README.md.
 */
export * from './contracts';
export * from './ports';
export { createGoListen } from './golisten';
export type { GoListen, GoListenOptions } from './golisten';
export { listVoices, languageAvailability } from './listing';
export type { LanguageAvailability, ListedVoice } from './listing';
export {
  albanianRegistry, spanishRegistry, SPANISH_DEVICE_TAGS, deviceRegistry, deviceEntry, demoGermanRegistry, noAudioRegistry, defaultRegistries, indexRegistries, descriptorOf,
  DEFAULT_DEMO_URL, DEMO_RECORDING_TEXT, ALBANIAN_DEVICE_TAGS, AZURE_LICENCE, AZURE_PROVIDER_ID, DEVICE_LICENCE,
} from './registry';
export type { RecordedClip, VoiceEntry, VoiceRegistry, VoiceSource } from './registry';
export { createAssessmentSource, assessmentEvidence, evidenceValidity, listeningAssessedPayload, DEFAULT_REPLAYS_ALLOWED } from './assessment';
export { createPlayback, failedPlayback, clampRate, MIN_RATE, MAX_RATE } from './playback';
export type { PlaybackDriver, DriverCallbacks } from './playback';
export { createHtmlAudioPort, clipDriver } from './providers/audio';
export { DEVICE_PRACTICE_NOTE } from './providers/device';
export { albanianPhonetics } from './phonetics';
export { langMatches, normalizeText } from './environment';
