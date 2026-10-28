import { ALGORITHM, createFsrsScheduler } from './fsrs';
import type { Scheduler, ScheduleProfile } from '../types';
export type RecordedSchedulerProfile = ScheduleProfile & { priorityPolicyVersion?: string };
export type ReviewSchedulerResolution = { scheduler: Scheduler } | { error: string };
/** Only an absent profile denotes legacy history. Invalid/unsupported profiles never silently default. */
export function schedulerForReviewProfile(value: unknown, fallback: Scheduler): ReviewSchedulerResolution {
  if (value === undefined) return { scheduler: fallback };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'invalid schedulerProfile: expected an object' };
  const p = value as Record<string, unknown>;
  if (p.algorithm !== ALGORITHM) return { error: 'unsupported scheduler algorithm: ' + String(p.algorithm) };
  if (typeof p.parametersVersion !== 'string' || !p.parametersVersion) return { error: 'invalid schedulerProfile.parametersVersion' };
  if (typeof p.desiredRetention !== 'number' || !Number.isFinite(p.desiredRetention) || p.desiredRetention <= 0 || p.desiredRetention >= 1) return { error: 'invalid schedulerProfile.desiredRetention' };
  if (p.maximumInterval !== undefined && (typeof p.maximumInterval !== 'number' || !Number.isFinite(p.maximumInterval) || p.maximumInterval < 1 || p.maximumInterval > 365000)) return { error: 'invalid schedulerProfile.maximumInterval' };
  if (p.parameters !== undefined && (!Array.isArray(p.parameters) || p.parameters.length !== 21 || p.parameters.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0))) return { error: 'invalid schedulerProfile.parameters' };
  if (p.enableShortTerm !== undefined && typeof p.enableShortTerm !== 'boolean') return { error: 'invalid schedulerProfile.enableShortTerm' };
  for (const key of ['learningSteps','relearningSteps'] as const) {
    const v = p[key];
    if (v !== undefined && (!Array.isArray(v) || v.length > 10 || v.some(s => typeof s !== 'string' || !/^[1-9]\d*(?:\.\d+)?[smhd]$/.test(s)))) return { error: 'invalid schedulerProfile.' + key };
  }
  try {
    const scheduler = createFsrsScheduler({ desiredRetention: p.desiredRetention,
      ...(p.maximumInterval !== undefined ? { maximumInterval: p.maximumInterval as number } : {}),
      ...(p.parameters !== undefined ? { parameters: p.parameters as number[] } : {}),
      ...(p.enableShortTerm !== undefined ? { enableShortTerm: p.enableShortTerm as boolean } : {}),
      ...(p.learningSteps !== undefined ? { learningSteps: p.learningSteps as string[] } : {}),
      ...(p.relearningSteps !== undefined ? { relearningSteps: p.relearningSteps as string[] } : {}) });
    if (scheduler.parametersVersion !== p.parametersVersion) return { error: 'schedulerProfile parametersVersion does not match its settings' };
    return { scheduler };
  } catch (error) { return { error: 'invalid schedulerProfile settings: ' + (error instanceof Error ? error.message : String(error)) }; }
}
