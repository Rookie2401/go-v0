import catalog from './models.json';

/** Public pinned model metadata only. No endpoint, credentials, downloaded weights, or analyser imports. */
export const LOCAL_TRANSLATION_LANGUAGES = ['sq', 'hi', 'es', 'de', 'th', 'nb', 'nn'] as const;
export type LocalTranslationLanguage = typeof LOCAL_TRANSLATION_LANGUAGES[number];
export interface LocalTranslationModel { readonly id: string; readonly revision: string; readonly label: string; readonly modelSource: string; readonly license: string }
export const LOCAL_TRANSLATION_MODELS: Readonly<Record<LocalTranslationLanguage, LocalTranslationModel>> = Object.freeze(
  Object.fromEntries(LOCAL_TRANSLATION_LANGUAGES.map((language) => [language, Object.freeze({ ...catalog[language] })]))
) as Readonly<Record<LocalTranslationLanguage, LocalTranslationModel>>;

export function isLocalTranslationLanguage(value: unknown): value is LocalTranslationLanguage {
  return typeof value === 'string' && (LOCAL_TRANSLATION_LANGUAGES as readonly string[]).includes(value);
}
export function localModelFor(language: unknown): LocalTranslationModel | undefined {
  return isLocalTranslationLanguage(language) ? LOCAL_TRANSLATION_MODELS[language] : undefined;
}
