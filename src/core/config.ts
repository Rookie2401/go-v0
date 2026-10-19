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
  { id: 'nb', name: 'Norwegian (Bokmål)', endonym: 'Norsk bokmål', script: 'Latn', direction: 'ltr', whitespaceDelimited: true },
  { id: 'nn', name: 'Norwegian (Nynorsk)', endonym: 'Norsk nynorsk', script: 'Latn', direction: 'ltr', whitespaceDelimited: true },
  { id: 'he', name: 'Hebrew', endonym: 'עברית', script: 'Hebr', direction: 'rtl', whitespaceDelimited: true },
  { id: 'el', name: 'Greek', endonym: 'Ελληνικά', script: 'Grek', direction: 'ltr', whitespaceDelimited: true },
  { id: 'la', name: 'Latin', endonym: 'Latina', script: 'Latn', direction: 'ltr', whitespaceDelimited: true },
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
  {
    id: 'norway-nb', lang: 'nb', country: 'Norway', title: 'Norway → Norwegian (Bokmål)', preferredLocales: ['nb-NO', 'nb', 'no'],
    readsLangs: ['nn'],
    // Active target: contemporary written Bokmål (2005 norm). Nynorsk is a separate written standard, read receptively in
    // its own accounts (its items are `nn` items, never credited to Bokmål). The historical varieties (Riksmål,
    // Dano-Norwegian, Landsmål, Høgnorsk) are recognition-only.
    variety: { target: 'nb', within: [] },
  },
  {
    id: 'hebrew', lang: 'he', country: 'Israel', title: 'Hebrew', preferredLocales: ['he-IL', 'he'],
    // Default target: Modern Hebrew. Biblical Hebrew is a PERIOD variety of the same language (kind 'period'): a learner may
    // make it the target instead (the enrolment's varietyId), and a Biblical reading is then 'target' and a Modern one
    // receptive. Mishnaic and Medieval Hebrew are recognised from the sources' labels, not analysed. Biblical Aramaic is a
    // heritage language: read as its own language, never credited to Hebrew.
    variety: { target: 'he-mod', within: [] },
  },
  {
    id: 'greek', lang: 'el', country: 'Greece', title: 'Greek', preferredLocales: ['el-GR', 'el'],
    // Default target: Modern Greek. Homeric, Attic and Koine are period varieties a learner may target instead; Medieval
    // (Byzantine) Greek is recognised from labels, not analysed.
    variety: { target: 'el-mod', within: [] },
  },
  {
    id: 'latin-la', lang: 'la', country: 'Rome', title: 'Latin', preferredLocales: ['la'],
    // No variety policy yet: Classical Latin is the working target; the Vulgate and later Latin are read as Latin of their period.
  },
];

/** The course for a language: the course whose own language it is; for a companion language (Nynorsk) the course that reads it. */
export const courseForLang = (lang: Language['id']) => (COURSES.find((c) => c.lang === lang) ?? COURSES.find((c) => c.readsLangs?.includes(lang)))!;

/**
 * Whether a course opens a text or imports a document of this language: its own language, or a companion language it
 * also reads (`readsLangs`). A course without `readsLangs` reads exactly its own language.
 */
export const courseReads = (course: Pick<Course, 'lang' | 'readsLangs'>, lang: Language['id']): boolean =>
  course.lang === lang || (course.readsLangs?.includes(lang) ?? false);

/** Every language a course reads: its own first, then its companions. */
export const courseLangs = (course: Pick<Course, 'lang' | 'readsLangs'>): Language['id'][] => [
  course.lang,
  ...(course.readsLangs ?? []).filter((l) => l !== course.lang),
];

/**
 * Product scope switches. GoListen playback, lawful recording import, and listening evidence are enabled.
 * The UI still reflects availability and rights from the stored assets; it does not assume every text has audio.
 */
export interface Features { listen: boolean }
export const FEATURES: Features = { listen: true };
