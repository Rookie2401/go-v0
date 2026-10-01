/**
 * Provider selection and availability. The rule that keeps fixture audio out of normal use lives here:
 *
 *   usable(provider) = provider.availability().available  AND  (provider.isSpeech  OR  allowFixture)
 *
 * `selectProvider` picks, in order: the explicitly chosen default; the first usable real provider; the fixture
 * (only with allowFixture); otherwise nothing, and the caller reports why.
 */
import type { ProviderAvailability, TtsProvider } from '../core/contracts/golisten';
import { AudioUnavailableError, unavailableMessage, type UnavailableReason } from './errors';
import { FIXTURE_PROVIDER_ID } from './fixtureProvider';
import type { Runtime } from './types';

export async function probe(p: TtsProvider): Promise<ProviderAvailability> {
  try {
    const a = await p.availability();
    return a && typeof a.available === 'boolean' ? a : { available: false, reason: 'provider-error', detail: 'provider returned no availability' };
  } catch (e) {
    return { available: false, reason: 'provider-error', detail: e instanceof Error ? e.message : String(e) };
  }
}

export interface Usability { usable: boolean; why: ProviderAvailability }

export async function usability(rt: Runtime, p: TtsProvider): Promise<Usability> {
  if (!p.isSpeech && !rt.allowFixture) {
    return { usable: false, why: { available: false, reason: 'no-provider', detail: `${p.id} is not a speech provider and fixture audio is disabled` } };
  }
  const a = await probe(p);
  return { usable: a.available, why: a };
}

export interface Selection { provider?: TtsProvider; usable: boolean; why: ProviderAvailability }

const NONE: ProviderAvailability = { available: false, reason: 'no-provider', detail: 'no speech provider is registered' };

export async function selectProvider(rt: Runtime): Promise<Selection> {
  if (rt.defaultProviderId) {
    const p = rt.providers.get(rt.defaultProviderId);
    if (p) { const u = await usability(rt, p); return { provider: p, usable: u.usable, why: u.why }; }
  }
  const all = [...rt.providers.values()];
  let firstReal: Selection | undefined;
  for (const p of all.filter((x) => x.isSpeech)) {
    const u = await usability(rt, p);
    if (u.usable) return { provider: p, usable: true, why: u.why };
    firstReal ??= { provider: p, usable: false, why: u.why };
  }
  if (rt.allowFixture) {
    const fixtureFirst = all.filter((x) => !x.isSpeech).sort((a, b) => Number(b.id === FIXTURE_PROVIDER_ID) - Number(a.id === FIXTURE_PROVIDER_ID));
    for (const p of fixtureFirst) {
      const u = await usability(rt, p);
      if (u.usable) return { provider: p, usable: true, why: u.why };
    }
  }
  return firstReal ?? { usable: false, why: NONE };
}

/** The reason a real provider gave, in the vocabulary of `realSpeechReason` (a real provider never answers 'development-fixture'). */
const realReason = (a: ProviderAvailability | undefined): NonNullable<ProviderAvailability['realSpeechReason']> =>
  !a?.reason || a.reason === 'development-fixture' ? 'no-provider' : a.reason;

/**
 * GoListen.availability(): real speech available / only the development fixture / nothing (with the reason).
 *
 * Two meanings, kept apart:
 *   `available`   — playback of SOME kind is possible. Callers that mean "can anything play or be generated" read this
 *                   (Player's job runner, bootstrap's queued-audio resume, audioStatus's "unavailable" gate).
 *   `realSpeech`  — a real speech provider is usable. Only this may be shown as "real speech is available".
 * When only the fixture is usable (preview), `realSpeechReason` / `realSpeechDetail` carry the first real provider's own answer.
 */
export async function aggregateAvailability(rt: Runtime): Promise<ProviderAvailability> {
  const all = [...rt.providers.values()];
  let firstReal: ProviderAvailability | undefined;
  for (const p of all.filter((x) => x.isSpeech)) {
    const a = await probe(p);
    if (a.available) return { available: true, realSpeech: true, detail: p.id };
    firstReal ??= a;
  }
  const realDetail = firstReal ? firstReal.detail : NONE.detail;
  const why = { realSpeechReason: realReason(firstReal ?? NONE), ...(realDetail ? { realSpeechDetail: realDetail } : {}) };
  if (rt.allowFixture) {
    for (const p of all.filter((x) => !x.isSpeech)) {
      const a = await probe(p);
      if (a.available) return { available: true, reason: 'development-fixture', realSpeech: false, ...why, detail: a.detail ?? `${p.id}: not speech, development only` };
    }
  }
  return { ...(firstReal ?? NONE), realSpeech: false, ...why };
}

export function unavailableOf(a: ProviderAvailability): { reason: UnavailableReason; detail?: string } {
  const reason = a.reason && a.reason !== 'development-fixture' ? a.reason : 'no-provider';
  return { reason, detail: a.detail };
}

/** Learner-facing sentence for a non-available availability. */
export function availabilityMessage(a: ProviderAvailability): string {
  const u = unavailableOf(a);
  return unavailableMessage(u.reason, u.detail);
}

/** Throws AudioUnavailable (nothing written yet) unless `sel` holds a usable provider. */
export function requireUsable(sel: Selection): TtsProvider {
  if (!sel.provider || !sel.usable) {
    const u = unavailableOf(sel.why);
    throw new AudioUnavailableError(u.reason, u.detail);
  }
  return sel.provider;
}
