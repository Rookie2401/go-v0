/**
 * Language and course configuration — explicit, in one place.
 * Locale preferences are what GoListen asks a provider for; the actual locale delivered is recorded on
 * the VoiceConfig / AudioAsset, never assumed.
 */
import type { Course, Language } from './model';

export const LANGUAGE_ROWS: Language[] = [
  { id: 'es', name: 'Spanish', endonym: 'Español', script: 'Latn', direction: 'ltr', whitespaceDelimited: true },
  { id: 'sq', name: 'Albanian', endonym: 'Shqip', script: 'Latn', direction: 'ltr', whitespaceDelimited: true },
  { id: 'th', name: 'Thai', endonym: 'ไทย', script: 'Thai', direction: 'ltr', whitespaceDelimited: false },
  { id: 'hi', name: 'Hindi', endonym: 'हिन्दी', script: 'Deva', direction: 'ltr', whitespaceDelimited: true },
  { id: 'de', name: 'German', endonym: 'Deutsch', script: 'Latn', direction: 'ltr', whitespaceDelimited: true },
];

export const COURSES: Course[] = [
  { id: 'honduras-es', lang: 'es', country: 'Honduras', title: 'Honduras → Spanish', preferredLocales: ['es-HN', 'es-419', 'es-MX', 'es-US', 'es-ES'] },
  { id: 'albania-sq', lang: 'sq', country: 'Albania', title: 'Albania → Albanian', preferredLocales: ['sq-AL'] },
  { id: 'thailand-th', lang: 'th', country: 'Thailand', title: 'Thailand → Thai', preferredLocales: ['th-TH'] },
  { id: 'india-hi', lang: 'hi', country: 'India', title: 'India → Hindi', preferredLocales: ['hi-IN'] },
  { id: 'germany-de', lang: 'de', country: 'Germany', title: 'Germany → German', preferredLocales: ['de-DE'] },
];

export const courseForLang = (lang: Language['id']) => COURSES.find((c) => c.lang === lang)!;

/**
 * Product scope switches. GoListen (audio: synthesis, playback, recordings, listening evidence) is deferred to a
 * later V2 iteration by the course owner (2026-10-01). Its code stays in the repository, dormant and tested, so V2
 * starts from it; with `listen: false` the app registers no speech provider, makes no speech request, shows no audio
 * interface and makes no statement about listening. Flip the flag to bring it back.
 */
export interface Features { listen: boolean }
export const FEATURES: Features = { listen: false };
