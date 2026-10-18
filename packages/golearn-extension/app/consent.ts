/**
 * The remote-speech switch of the setup page as a recorded fact: turning it on or off writes a ConsentGiven /
 * ConsentWithdrawn event (scope `remote-speech`, payload `{ consent, scope }` as GoTell's switch writes it) through the
 * page's own event path (`ctx.record`: the background worker in the extension, which attributes the event to the learner and
 * queues it for the Repository; the shared event log otherwise).
 *
 * Order: turning ON records first and only then switches on, so consent is never on without its record (a refused record
 * leaves it off); turning OFF switches off at once and then records.
 */
import { CONTRACT_VERSION, type GoEvent } from '../../repository-contract/src';
import type { AppContext } from './context';
import type { Settings } from './state';

export const REMOTE_SPEECH_SCOPE = 'remote-speech';

export function remoteSpeechConsentEvent(input: {
  learnerId: string; enrolmentId: string; languageId: string; deviceId: string; appVersion: string; at: string; eventId: string; on: boolean; inExtension: boolean;
}): GoEvent {
  return {
    id: input.eventId, v: CONTRACT_VERSION, learnerId: input.learnerId, enrolmentId: input.enrolmentId, languageId: input.languageId,
    at: input.at,
    // the extension's recorder admits its own producer and replaces the identity; the hosted web app is its own producer
    producer: { app: input.inExtension ? 'golearn-ext' : 'golearn-app', version: input.appVersion, deviceId: input.deviceId, surface: 'privacy' },
    kind: input.on ? 'ConsentGiven' : 'ConsentWithdrawn', subject: {},
    payload: { consent: REMOTE_SPEECH_SCOPE, scope: REMOTE_SPEECH_SCOPE },
    dedupeKey: `${REMOTE_SPEECH_SCOPE}:${input.on ? 'given' : 'withdrawn'}:${input.eventId}`,
  };
}

export type RemoteSpeechResult =
  | { ok: true; settings: Settings; recorded: boolean }
  | { ok: false; message: string; settings: Settings };

/** `languageId`: the language the learner is working in (the active enrolment, else the page's pack); consent is recorded against it. */
export async function setRemoteSpeechConsent(ctx: AppContext, on: boolean, languageId: string | undefined): Promise<RemoteSpeechResult> {
  const current = await ctx.state.getSettings();
  const id = await ctx.identity();
  const at = ctx.deps.now().toISOString();
  const eventId = `consent-${ctx.deps.now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const event = remoteSpeechConsentEvent({
    learnerId: id.learnerId, enrolmentId: id.enrolmentId, languageId: languageId || 'und', deviceId: id.deviceId,
    appVersion: ctx.deps.appVersion, at, eventId, on, inExtension: ctx.inExtension,
  });
  if (on) {
    const r = await ctx.record(event);
    if (r === 'failed') return { ok: false, message: 'Your consent could not be recorded, so remote speech stays off.', settings: current };
    return { ok: true, settings: await ctx.setSettings({ remoteSpeechConsent: true }), recorded: true };
  }
  const settings = await ctx.setSettings({ remoteSpeechConsent: false });
  const r = await ctx.record(event);
  return { ok: true, settings, recorded: r !== 'failed' };
}

/** Which texts the learner accepted at sign-up. The documents are drafts for now; the version names them. */
export const TERMS_SCOPE = 'terms-and-privacy';
export const TERMS_VERSION = 'draft-2026-10-17';

/**
 * Creating an account records that the learner accepted the Terms and the Privacy Policy as a ConsentGiven event (scope
 * `terms-and-privacy`), through the same path as the speech switch. Best effort: an account is not refused because the record failed.
 */
export async function recordTermsAcceptance(ctx: AppContext): Promise<RecordOutcome> {
  try {
    const id = await ctx.identity();
    const at = ctx.deps.now().toISOString();
    const eventId = `consent-${ctx.deps.now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const event: GoEvent = {
      id: eventId, v: CONTRACT_VERSION, learnerId: id.learnerId, enrolmentId: id.enrolmentId, languageId: 'und', at,
      producer: { app: ctx.inExtension ? 'golearn-ext' : 'golearn-app', version: ctx.deps.appVersion, deviceId: id.deviceId, surface: 'signin' },
      kind: 'ConsentGiven', subject: {},
      payload: { consent: TERMS_SCOPE, scope: TERMS_SCOPE, documents: ['terms', 'privacy-policy'], version: TERMS_VERSION },
      dedupeKey: `${TERMS_SCOPE}:given:${eventId}`,
    };
    return await ctx.record(event);
  } catch { return 'failed'; }
}
type RecordOutcome = Awaited<ReturnType<AppContext['record']>>;
