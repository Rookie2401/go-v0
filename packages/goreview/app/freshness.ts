/**
 * Planning-time freshness. A ReviewModel is folded at one instant (`model.now`) and painted; the learner may leave the screen open and
 * press Start / Begin / Continue much later. A plan made from the old model is made at the old instant: a learning return that came due
 * since is missing, a snooze that expired is still snoozed, a review that crossed its due time is absent, a remediation item whose
 * ten-minute delay elapsed is not ready, and the UTC-day new-card allowance may have reset. Every entry point that starts, resumes or
 * continues work therefore asks `freshModel` first: it returns the model it was given when that is still the truth, and otherwise
 * loads the model again.
 *
 * Cheap by design: no deck is folded here. What is read is the saved preferences, the local log (its length and its last event), and
 * the model itself (the earliest instant at which its plan could change, computed once per model object).
 */
import type { DeckItem } from '../src/types';
import type { AppContext } from './context';
import { effectiveRemediation } from './deckModel';
import { loadReviewModel, type ReviewModel } from './workspace';

/** A model older than this is loaded again even when no pending instant is known (the plan also depends on things the model only samples). */
export const MODEL_MAX_AGE_MS = 5 * 60_000;

const DAY_MS = 86_400_000;
const cache = new WeakMap<ReviewModel, number | undefined>();

/** The next UTC midnight strictly after `ms`: the new-card allowance is counted per UTC day. */
const nextUtcMidnight = (ms: number): number => (Math.floor(ms / DAY_MS) + 1) * DAY_MS;

/**
 * The earliest instant after `model.now` at which the plan could differ from the one the model gives: a deck or Class Essentials item's
 * due time, a snooze's end, the moment a remediation item's delay elapses (ready), or the next UTC midnight (the new-card allowance).
 * Undefined only when `model.now` is not a timestamp. The UTC midnight is always pending, so for a valid model it is never later than 24 h.
 */
export function nextChangeAt(model: ReviewModel): string | undefined {
  const now = Date.parse(model.now);
  if (!Number.isFinite(now)) return undefined;
  if (cache.has(model)) { const hit = cache.get(model); return hit === undefined ? undefined : new Date(hit).toISOString(); }
  let next = nextUtcMidnight(now);
  const consider = (iso: string | undefined): void => {
    if (!iso) return;
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t > now && t < next) next = t;
  };
  const items: DeckItem[] = [...model.deck, ...(model.classDeck ?? [])].filter((i) => !i.invalidatedAt && i.status !== 'dismissed');
  for (const item of items) {
    if (item.status !== 'suspended') consider(item.schedule?.due);
    if (item.status === 'snoozed') consider(item.snoozedUntil);
  }
  // the shared remediation projection: a studied item becomes ready when its delay elapses
  for (const c of effectiveRemediation(model).all) if (!c.ready) consider(c.readyAt);
  cache.set(model, next);
  return new Date(next).toISOString();
}

/** Whether the schedule has moved on since the model was folded: `nowMs` has reached the model's next pending instant. */
export function planCouldHaveChanged(model: ReviewModel, nowMs: number): boolean {
  const at = nextChangeAt(model);
  return at !== undefined && nowMs >= Date.parse(at);
}

/**
 * True when planning from `model` at `nowIso` gives what a fresh load would: the same learner and language, the same saved
 * preferences, the same local log (length and last event), the instant before every pending change, and not more than five minutes on.
 */
export async function modelIsFresh(ctx: AppContext, model: ReviewModel, nowIso: string): Promise<boolean> {
  const now = Date.parse(nowIso), then = Date.parse(model.now);
  if (!Number.isFinite(now) || !Number.isFinite(then)) return false;
  if (now < then || now - then > MODEL_MAX_AGE_MS) return false;
  if (planCouldHaveChanged(model, now)) return false;
  const { learnerId, languageId, enrolmentId } = model.identity;
  const identity = await ctx.identity();
  if (!identity || identity.learnerId !== learnerId || identity.languageId !== languageId || identity.enrolmentId !== enrolmentId) return false;
  const prefs = await ctx.state.getPrefs(learnerId, languageId);
  if (JSON.stringify(prefs) !== JSON.stringify(model.prefs)) return false;
  const events = await ctx.events(languageId);
  if (events.length !== model.events.length) return false;
  return events.at(-1)?.id === model.events.at(-1)?.id;
}

/**
 * The model to plan with: the one given when it is still fresh, otherwise the model loaded again (the one given when loading fails or
 * there is no learner). Never throws.
 */
export async function freshModel(ctx: AppContext, model: ReviewModel): Promise<ReviewModel> {
  try {
    if (await modelIsFresh(ctx, model, ctx.deps.now().toISOString())) return model;
    return (await loadReviewModel(ctx)) ?? model;
  } catch { return model; }
}
