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
  {
    id: 'honduras-es', lang: 'es', country: 'Honduras', title: 'Honduras → Spanish', preferredLocales: ['es-HN', 'es-419', 'es-MX', 'es-US', 'es-ES'],
    // Active target: modern Honduran / Central American Spanish within general Latin American Spanish. Voseo is part of
    // it; vosotros (Spain) and the historical language are for recognition only.
    variety: { target: 'es-HN', within: ['es-CA', 'es-419'], activeFeatures: ['voseo'] },
  },
  {
    id: 'albania-sq', lang: 'sq', country: 'Albania', title: 'Albania → Albanian', preferredLocales: ['sq-AL'],
    // Active target: Standard Albanian. Gheg, the other dialects and pre-standard spelling are for recognition only:
    // a form is related to its Standard equivalent, never counted as Standard.
    variety: { target: 'sq', within: [] },
  },
  { id: 'thailand-th', lang: 'th', country: 'Thailand', title: 'Thailand → Thai', preferredLocales: ['th-TH'] },
  {
    id: 'india-hi', lang: 'hi', country: 'India', title: 'India → Hindi', preferredLocales: ['hi-IN'],
    // Active target: Modern Standard Hindi in all its everyday layers (Sanskrit-derived, Persian- and Arabic-derived,
    // English loans). Awadhi, Braj and the language of the sant poets are heritage languages: readable, never counted.
    variety: { target: 'hi-IN', within: [] },
  },
  {
    id: 'germany-de', lang: 'de', country: 'Germany', title: 'Germany → German', preferredLocales: ['de-DE'],
    // Active target: modern Standard German of Germany. Austrian and Swiss Standard German, dialect and older spelling are
    // for recognition only.
    variety: { target: 'de-DE', within: [] },
  },
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
