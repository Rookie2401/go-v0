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
