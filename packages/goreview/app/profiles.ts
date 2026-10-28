import { CONTRACT_VERSION, validateEvent, type GoEvent, type SchedulerProfile } from '../../repository-contract/src';
import { createFsrsScheduler } from '../src/scheduler/fsrs';
import { KNOWABILITY_PRIORITY_POLICY_VERSION } from '../src/planner/priority-policy';
import type { AppContext } from './context';
import { button, field, h, p, setStatus, statusLine } from './dom';

export const PROFILE_KEY = 'goreview.schedulerProfile';

/** Explicit profile assertions stay in the shared Repository event stream. */
export function activeSchedulerProfile(events: readonly GoEvent[]): SchedulerProfile | undefined {
  const newest = events.filter((e) => e.kind === 'PreferenceChanged' && e.payload.key === PROFILE_KEY)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id))[0];
  const value = newest?.payload.value as SchedulerProfile | null | undefined;
  if (!value) return undefined;
  try {
    if (!Array.isArray(value.parameters) || value.parameters.length !== 21) return undefined;
    const scheduler = createFsrsScheduler({ parameters: value.parameters, desiredRetention: value.desiredRetention, maximumInterval: value.maximumInterval });
    if (scheduler.parametersVersion !== value.parametersVersion) return undefined;
    return { ...scheduler.profile!, priorityPolicyVersion: KNOWABILITY_PRIORITY_POLICY_VERSION };
  } catch { return undefined; }
}

export async function profileControls(ctx: AppContext): Promise<HTMLElement> {
  const details = h('details', { id: 'scheduler-personalization', class: 'card' }, h('summary', {}, 'Advanced memory personalization'));
  const identity = await ctx.identity();
  if (!identity) { details.append(p('Choose a language first.')); return details; }
  const file = h('input', { id: 'scheduler-candidate', type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  const status = statusLine();
  const active = activeSchedulerProfile(await ctx.events(identity.languageId));
  details.append(p(active ? 'An explicitly selected personal profile is active for future reviews.' : 'Supported default parameters are active.'),
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
