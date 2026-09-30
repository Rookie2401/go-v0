import { COURSES } from '../core/config';
import type { LanguageCode, VoiceConfig } from '../core/model';
import type { TtsProvider } from '../core/contracts/golisten';
import { FIXTURE_DISCLAIMER, FIXTURE_ENGINE, FIXTURE_PROVIDER_ID } from './fixtureProvider';
import type { Runtime } from './types';

export function providerOf(rt: Runtime, providerId: string): TtsProvider {
  const p = rt.providers.get(providerId);
  if (!p) throw new Error(`GoListen: provider "${providerId}" is not registered`);
  return p;
}

/**
 * Explicit voice resolution. The course's ordered `preferredLocales` are tried against the default
 * provider's voices; if none matches, the provider's first voice is used and the fallback is recorded:
 * `requestedLocale` (what the course wanted) vs `actualLocale` (what will be delivered).
 * An existing VoiceConfig row is reused unchanged so a human's `approved` decision is never reset.
 */
export async function resolveVoiceConfig(rt: Runtime, lang: LanguageCode, courseId?: string): Promise<VoiceConfig> {
  const course = courseId
    ? (await rt.store.courses.get(courseId)) ?? COURSES.find((c) => c.id === courseId)
    : (await rt.store.courses.all()).find((c) => c.lang === lang) ?? COURSES.find((c) => c.lang === lang);
  if (!course) throw new Error(`GoListen: no course for ${courseId ?? lang}`);
  if (course.lang !== lang) throw new Error(`GoListen: course ${course.id} is ${course.lang}, not ${lang}`);
  const provider = providerOf(rt, rt.defaultProviderId);
  const voices = await provider.listVoices(lang);
  if (voices.length === 0) throw new Error(`GoListen: provider ${provider.id} has no ${lang} voice`);
  let chosen = undefined as (typeof voices)[number] | undefined;
  for (const loc of course.preferredLocales) {
    chosen = voices.find((v) => v.locale.toLowerCase() === loc.toLowerCase());
    if (chosen) break;
  }
  const requestedLocale = course.preferredLocales[0] ?? voices[0].locale;
  const fellBack = !chosen || chosen.locale.toLowerCase() !== requestedLocale.toLowerCase();
  chosen ??= voices[0];
  const id = `${requestedLocale}:${provider.id}:${chosen.id}`;
  const existing = await rt.store.voices.get(id);
  if (existing && existing.courseId === course.id) return existing;
  const notes: string[] = [];
  if (provider.id === FIXTURE_PROVIDER_ID) notes.push(FIXTURE_DISCLAIMER);
  if (fellBack) notes.push(`Fallback accent: course asked for ${requestedLocale}, provider delivers ${chosen.locale}.`);
  const row: VoiceConfig = {
    id, lang, courseId: course.id, providerId: provider.id,
    engine: provider.id === FIXTURE_PROVIDER_ID ? FIXTURE_ENGINE : undefined,
    voiceId: chosen.id, requestedLocale, actualLocale: chosen.locale,
    approved: false, // a human QA pass flips this, never the pipeline
    qaNote: notes.join(' ') || undefined,
  };
  await rt.store.voices.put(row);
  return row;
}
