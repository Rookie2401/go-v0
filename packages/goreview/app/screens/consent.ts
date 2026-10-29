/**
 * The remote-speech switch as a recorded fact. A consent is an event (the API document, section 5: "consents are events"),
 * so turning the switch on or off writes a ConsentGiven / ConsentWithdrawn event through the app's own queue (`ctx.record`),
 * the same shape GoTell's remote-assistance switch uses (payload `{ consent, scope }`).
 *
 * Order, as in GoTell: turning ON records first and only then switches on, so consent is never on without its record (if the
 * record is refused the switch stays off); turning OFF switches off at once, so nothing more can be sent, and then records.
 * Consent belongs to a learner, so turning ON needs a signed-in learner with a language; turning OFF always works.
 */
import { CONTRACT_VERSION, type GoEvent } from '../../../repository-contract/src';
import type { AppContext } from '../context';
import type { Settings } from '../state';

/** The consent key in the payload (the service reads `consent`, then `scope`, then `key`). */
export const REMOTE_SPEECH_SCOPE = 'remote-speech';

export interface ConsentIdentity { learnerId: string; enrolmentId: string; languageId: string; varietyId?: string; deviceId: string }

export function remoteSpeechConsentEvent(input: { identity: ConsentIdentity; appVersion: string; at: string; eventId: string; on: boolean }): GoEvent {
  const { identity: id } = input;
  return {
    id: input.eventId, v: CONTRACT_VERSION, learnerId: id.learnerId, enrolmentId: id.enrolmentId, languageId: id.languageId,
    ...(id.varietyId ? { varietyId: id.varietyId } : {}),
    at: input.at,
    producer: { app: 'gopractice-review', version: input.appVersion, deviceId: id.deviceId, surface: 'settings' },
    kind: input.on ? 'ConsentGiven' : 'ConsentWithdrawn', subject: {},
    payload: { consent: REMOTE_SPEECH_SCOPE, scope: REMOTE_SPEECH_SCOPE },
    dedupeKey: `${REMOTE_SPEECH_SCOPE}:${input.on ? 'given' : 'withdrawn'}:${input.eventId}`,
  };
}

export type RemoteSpeechResult =
  | { ok: true; settings: Settings; recorded: boolean }
  | { ok: false; message: string; settings: Settings };

export async function setRemoteSpeechConsent(ctx: AppContext, on: boolean): Promise<RemoteSpeechResult> {
  const current = await ctx.state.getSettings();
  const id = await ctx.identity();
  const event = (): GoEvent => remoteSpeechConsentEvent({
    identity: id!, appVersion: ctx.deps.appVersion, at: ctx.deps.now().toISOString(), eventId: `consent-${ctx.deps.newId()}`, on,
  });
  if (on) {
    if (!id) return { ok: false, message: 'Sign in and choose a language first: your consent is kept in your record, and remote speech stays off until it can be.', settings: current };
    const r = await ctx.record([event()]);
    if (r.refused.length) return { ok: false, message: `Your consent could not be recorded, so remote speech stays off (${r.refused[0].issues.join('; ')}).`, settings: current };
    return { ok: true, settings: await ctx.setSettings({ remoteSpeechConsent: true }), recorded: true };
  }
  const settings = await ctx.setSettings({ remoteSpeechConsent: false });
  if (!id) return { ok: true, settings, recorded: false };
  const r = await ctx.record([event()]);
  return { ok: true, settings, recorded: r.refused.length === 0 };
}
