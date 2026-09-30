import { COURSES } from '../core/config';
import type { LanguageCode, VoiceConfig } from '../core/model';
import { REVIEW_OK } from '../core/model';
import type { TtsProvider } from '../core/contracts/golisten';
import { AudioUnavailableError } from './errors';
import { FIXTURE_DISCLAIMER, FIXTURE_ENGINE, FIXTURE_PROVIDER_ID } from './fixtureProvider';
import { requireUsable, selectProvider, usability } from './providers';
import type { Runtime } from './types';

/** Registered provider by id, or AudioUnavailable (an unregistered provider cannot synthesize). */
export function providerOf(rt: Runtime, providerId: string): TtsProvider {
  const p = rt.providers.get(providerId);
  if (!p) throw new AudioUnavailableError('no-provider', `provider "${providerId}" is not registered`);
  return p;
}

/** True only for a voice of a real speech provider that a human has auditioned. Legacy rows without the fields are NOT reviewed. */
export function isVoiceReviewed(v: Pick<VoiceConfig, 'isSpeech' | 'reviewStatus'> | undefined): boolean {
  return !!v && v.isSpeech === true && !!v.reviewStatus && REVIEW_OK.includes(v.reviewStatus);
}

/**
 * Fills fields older rows lack and applies the review-reset rule: a voice's review belongs to the provider version
 * that was auditioned. If the provider version changed, the audio will be regenerated (the cache key includes the
 * version) and nobody has heard it, so the voice returns to 'unreviewed'. Never invents a review.
 */
export function normalizeVoice(row: VoiceConfig, provider: TtsProvider): VoiceConfig {
  const v: VoiceConfig = { ...row };
  v.isSpeech = row.isSpeech ?? provider.isSpeech;
  v.reviewStatus = row.reviewStatus ?? 'unreviewed';
  if (row.providerVersion === undefined) v.providerVersion = provider.version;
  else if (row.providerVersion !== provider.version) {
    v.providerVersion = provider.version;
    if (REVIEW_OK.includes(v.reviewStatus)) {
      v.reviewStatus = 'unreviewed';
      v.approved = false;
      v.qaNote = [row.qaNote, `Provider version changed ${row.providerVersion} -> ${provider.version}: earlier review (${row.reviewStatus}) no longer applies; audition again.`].filter(Boolean).join(' ');
    }
  }
  return v;
}

export interface VoicePlan { voice: VoiceConfig; provider: TtsProvider; persisted: boolean }

/**
 * Explicit voice resolution WITHOUT writing: the course's ordered `preferredLocales` are tried against the selected
 * provider's voices; if none matches, the provider's first voice is used and the fallback is recorded:
 * `requestedLocale` (what the course wanted) vs `actualLocale` (what will be delivered).
 * An existing VoiceConfig row is reused so a human's review decision is never reset (except by a provider-version change).
 * Throws AudioUnavailable when no usable provider exists.
 */
export async function planVoice(rt: Runtime, lang: LanguageCode, courseId?: string): Promise<VoicePlan> {
  const course = courseId
    ? (await rt.store.courses.get(courseId)) ?? COURSES.find((c) => c.id === courseId)
    : (await rt.store.courses.all()).find((c) => c.lang === lang) ?? COURSES.find((c) => c.lang === lang);
  if (!course) throw new Error(`GoListen: no course for ${courseId ?? lang}`);
  if (course.lang !== lang) throw new Error(`GoListen: course ${course.id} is ${course.lang}, not ${lang}`);
  const provider = requireUsable(await selectProvider(rt));
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
  if (existing && existing.courseId === course.id) {
    const v = normalizeVoice(existing, provider);
    return { voice: v, provider, persisted: JSON.stringify(v) === JSON.stringify(existing) };
  }
  const notes: string[] = [];
  if (!provider.isSpeech) notes.push(provider.id === FIXTURE_PROVIDER_ID ? FIXTURE_DISCLAIMER : `${provider.id} is not a speech provider: preview only.`);
  if (fellBack) notes.push(`Fallback accent: course asked for ${requestedLocale}, provider delivers ${chosen.locale}.`);
  const voice: VoiceConfig = {
    id, lang, courseId: course.id, providerId: provider.id,
    engine: provider.id === FIXTURE_PROVIDER_ID ? FIXTURE_ENGINE : undefined,
    voiceId: chosen.id, requestedLocale, actualLocale: chosen.locale,
    approved: false, // a human audition flips this (setVoiceReview), never the pipeline
    qaNote: notes.join(' ') || undefined,
    reviewStatus: 'unreviewed', providerVersion: provider.version, isSpeech: provider.isSpeech,
  };
  return { voice, provider, persisted: false };
}

export async function resolveVoiceConfig(rt: Runtime, lang: LanguageCode, courseId?: string): Promise<VoiceConfig> {
  const plan = await planVoice(rt, lang, courseId);
  if (!plan.persisted) await rt.store.voices.put(plan.voice);
  return plan.voice;
}

/** Like planVoice but returns undefined instead of throwing AudioUnavailable (for status reporting). */
export async function planVoiceQuiet(rt: Runtime, lang: LanguageCode, courseId?: string): Promise<VoicePlan | undefined> {
  try { return await planVoice(rt, lang, courseId); } catch (e) {
    if (e instanceof Error && e.name === 'AudioUnavailable') return undefined;
    throw e;
  }
}

/**
 * Gate for a STORED voice config: its provider must be registered and usable, otherwise AudioUnavailable (nothing
 * has been written). Persists row normalisation (missing fields, review reset on a provider-version change).
 */
export async function gateVoice(rt: Runtime, row: VoiceConfig): Promise<{ voice: VoiceConfig; provider: TtsProvider }> {
  const provider = providerOf(rt, row.providerId);
  const u = await usability(rt, provider);
  requireUsable({ provider, usable: u.usable, why: u.why });
  const voice = normalizeVoice(row, provider);
  if (JSON.stringify(voice) !== JSON.stringify(row)) await rt.store.voices.put(voice);
  return { voice, provider };
}
