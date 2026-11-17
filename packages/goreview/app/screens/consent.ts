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

/** Where an acceptance waits for the learner's first language (see recordTermsAcceptance). */
export const TERMS_PENDING_KEY = 'gopractice:terms-pending';

/**
 * Creating an account records that the learner accepted the Terms and the Privacy Policy, as GoLearn setup does. Best effort: an account is not
 * refused because the record failed.
 *
 * The service stores an event only under one of the learner's enrolments and from a device the session registered, and a new account has no
 * language yet (until 2026-11-17 the event was sent with enrolmentId "account" and was refused, so nothing was recorded). The acceptance is
 * therefore kept on this device, with the time it was given, and recorded by `flushTermsAcceptance` as soon as the learner has a language:
 * straight after the first one is chosen in #/setup, or on the next visit when it was chosen elsewhere.
 */
export async function recordTermsAcceptance(ctx: AppContext): Promise<void> {
  try {
    const session = await ctx.state.getSession();
    if (!session) return;
    await ctx.deps.area.set({ [TERMS_PENDING_KEY]: { learnerId: session.learnerId, at: ctx.deps.now().toISOString() } });
    await flushTermsAcceptance(ctx);
  } catch { /* the account stands either way */ }
}

/** One flush at a time per app: the header and the language list both ask after a language is chosen, and the acceptance is recorded once. */
const flushing = new WeakMap<AppContext, Promise<void>>();

/** Records a waiting acceptance once the learner has a language (through the app's own queue); keeps it waiting otherwise. Never throws. */
export function flushTermsAcceptance(ctx: AppContext): Promise<void> {
  const running = flushing.get(ctx);
  if (running) return running;
  const run = flushOnce(ctx).finally(() => { if (flushing.get(ctx) === run) flushing.delete(ctx); });
  flushing.set(ctx, run);
  return run;
}

async function flushOnce(ctx: AppContext): Promise<void> {
  try {
    const waiting = (await ctx.deps.area.get(TERMS_PENDING_KEY))[TERMS_PENDING_KEY] as { learnerId?: string; at?: string } | undefined;
    if (!waiting?.learnerId || !waiting.at) return;
    const id = await ctx.identity();
    if (!id || id.learnerId !== waiting.learnerId) return;
    const eventId = `consent-${ctx.deps.newId()}`;
    const r = await ctx.record([{
      id: eventId, v: CONTRACT_VERSION, learnerId: id.learnerId, enrolmentId: id.enrolmentId, languageId: id.languageId, ...(id.varietyId ? { varietyId: id.varietyId } : {}),
      at: waiting.at,
      producer: { app: 'gopractice-review', version: ctx.deps.appVersion, deviceId: id.deviceId, surface: 'signin' },
      kind: 'ConsentGiven', subject: {},
      payload: { consent: 'terms-and-privacy', scope: 'terms-and-privacy', documents: ['terms', 'privacy-policy'], version: 'draft-2026-10-17' },
      dedupeKey: `terms-and-privacy:given:${eventId}`,
    }]);
    if (!r.refused.length) await ctx.deps.area.remove(TERMS_PENDING_KEY);
  } catch { /* it stays waiting and is tried again */ }
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
