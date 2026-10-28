import { CONTRACT_VERSION, validateEvent, type GoEvent, type SchedulerProfile } from '../repository-contract/src';
import { createFsrsScheduler } from '../goreview/src/scheduler/fsrs';
import { schedulerForReviewProfile } from '../goreview/src/scheduler/replay-profile';
import { KNOWABILITY_PRIORITY_POLICY_VERSION } from '../goreview/src/planner/priority-policy';
import type { AppContext } from './context';
import { button, field, h, p, setStatus, statusLine } from './dom';

export const PROFILE_KEY = 'goreview.schedulerProfile';

export interface SchedulerProfileSelection { profile?: SchedulerProfile; error?: string; reset?: boolean }
export function schedulerProfileSelection(events: readonly GoEvent[]): SchedulerProfileSelection {
  const candidates = events.filter(e => e.kind === 'PreferenceChanged' && e.payload.key === PROFILE_KEY && Number.isFinite(Date.parse(e.at)));
  const byId = new Map<string, GoEvent>(), conflicts = new Set<string>();
  const identity = (event: GoEvent) => JSON.stringify(event, (key,value) => key === 'seq' || key === 'recordedAt' ? undefined : value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)) : value);
  for (const e of candidates) {
    const old = byId.get(e.id);
    if (old && identity(old) !== identity(e)) conflicts.add(e.id);
    if (!old || identity(e) < identity(old)) byId.set(e.id,e);
  }
  const newest = [...byId.values()].sort((a,b) => Date.parse(b.at)-Date.parse(a.at) || (b.id<a.id?-1:b.id>a.id?1:0))[0];
  if (!newest) return {};
  if (conflicts.has(newest.id)) return { error: 'The selected memory profile has conflicting event identities. Select a valid profile or return to supported defaults.' };
  const value = newest.payload.value;
  if (value === null) return { reset: true };
  if (value === undefined) return { error: 'The selected profile assertion has no settings. Return to supported defaults.' };
  const resolved = schedulerForReviewProfile(value, createFsrsScheduler());
  if ('error' in resolved) return { error: resolved.error + '. Select a valid profile or return to supported defaults.' };
  if (!resolved.scheduler.profile?.parameters || resolved.scheduler.profile.parameters.length !== 21) return { error: 'The selected profile has no supported FSRS parameter vector.' };
  return { profile: { ...resolved.scheduler.profile, parameters: [...resolved.scheduler.profile.parameters], priorityPolicyVersion: KNOWABILITY_PRIORITY_POLICY_VERSION } };
}
/** Compatibility accessor. Hosts must inspect schedulerProfileSelection.error before scheduling. */
export function activeSchedulerProfile(events: readonly GoEvent[]): SchedulerProfile | undefined {
  return schedulerProfileSelection(events).profile;
}

export async function profileControls(ctx: AppContext): Promise<HTMLElement> {
  const details = h('details', { id: 'scheduler-personalization', class: 'card' }, h('summary', {}, 'Advanced memory personalization'));
  const identity = await ctx.identity();
  if (!identity) { details.append(p('Choose a language first.')); return details; }
  const file = h('input', { id: 'scheduler-candidate', type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  const status = statusLine();
  const selection = schedulerProfileSelection(await ctx.events(identity.languageId));
  const active = selection.profile;
  details.append(p(selection.error ?? (active ? 'An explicitly selected personal profile is active for future reviews.' : 'Supported default parameters are active.')),
    p('Import a validated candidate from the local official optimizer. This changes future reviews; past grades retain their own parameter profiles. No history is uploaded.'), field('Candidate report', file));
  const recordProfile = async (value: SchedulerProfile | null) => {
    const context = await ctx.eventContext();
    if (!context) throw new Error('Choose a language first.');
    const event: GoEvent = { id: `profile:${ctx.deps.newId()}`, v: CONTRACT_VERSION, learnerId: context.learnerId,
      enrolmentId: context.enrolmentId, languageId: context.languageId, at: context.now,
      producer: { app: 'gopractice-review', version: context.appVersion, deviceId: context.deviceId, surface: 'scheduler-settings' },
      kind: 'PreferenceChanged', subject: {}, payload: { key: PROFILE_KEY, value, origin: 'explicit' }, evidence: { quality: 'none' } };
    if (validateEvent(event).length) throw new Error('The profile does not satisfy the Repository contract.');
    const saved = await ctx.record([event]);
    if (saved.refused.length) throw new Error(saved.refused[0].issues.join('; '));
  };
  const activate = button('Use this candidate', () => { void (async () => {
    activate.disabled = true;
    try {
      const selected = file.files?.[0];
      if (!selected || selected.size > 32_000) throw new Error('Choose a candidate report smaller than 32 KB.');
      const candidate = JSON.parse(await selected.text());
      if (candidate.status !== 'candidate' || candidate.languageId !== identity.languageId || candidate.objective !== 'written-recognition'
        || candidate.policyVersion !== 'goreview-optimization@1' || candidate.reviews < 400 || candidate.targets < 50
        || !Array.isArray(candidate.parameters) || candidate.parameters.length !== 21 || candidate.parameters.some((x: unknown) => typeof x !== 'number' || !Number.isFinite(x))
        || !(candidate.candidate?.logLoss < candidate.baseline?.logLoss) || !(candidate.candidate?.rmseBins <= candidate.baseline?.rmseBins)) throw new Error('This report is not a validated recognition candidate for the selected language.');
      const prefs = await ctx.state.getPrefs(identity.learnerId, identity.languageId);
      const scheduler = createFsrsScheduler({ parameters: candidate.parameters, desiredRetention: prefs.desiredRetention });
      await recordProfile({ ...scheduler.profile!, priorityPolicyVersion: KNOWABILITY_PRIORITY_POLICY_VERSION });
      setStatus(status, 'Personal profile saved for future recognition reviews. Existing review history is preserved.', 'ok');
    } catch (error) { setStatus(status, error instanceof Error ? error.message : 'The candidate could not be activated.', 'error'); }
    finally { activate.disabled = false; }
  })(); }, { id: 'activate-scheduler-profile', class: 'btn' });
  const reset = button('Return to supported defaults', () => { void recordProfile(null).then(() => setStatus(status, 'Supported defaults restored for future reviews.', 'ok'), () => setStatus(status, 'The profile change could not be recorded.', 'error')); }, { id: 'reset-scheduler-profile', class: 'btn' });
  details.append(activate, reset, status);
  return details;
}
