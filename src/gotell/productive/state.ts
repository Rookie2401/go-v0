/**
 * Productive state — a PURE function of the event log. Nothing stores a level: it is recomputed from the attempts, the
 * interventions shown and the saved testimony versions, so it can always be audited and rebuilt.
 *
 * Promotion rules (explicit, one per level; `rule` on the state names the one that fired):
 *   A success is an attempt whose meaning came across AND in which the checker found nothing. Its SUPPORT is the strongest
 *   step shown before it in its task — or, if stronger, any step shown for the same goal in the last RECENT_EXPOSURE_MS
 *   (a model seen three minutes ago in another task still counts as seen).
 *     support model     → at least P1   (said after a full model: never independent)
 *     support scaffold  → at least P2   (frame, gap, choice, dictionary form, a read sentence, a correction)
 *     support cue       → at least P3   (concept hint, English cue, first letter, "look again here")
 *     support none      → independent:  P4 once; P5 when independent again on a later day; P6 when, already at P5, it is
 *                         said independently on a later day in a kind of task in which it had not yet been said on its
 *                         own (transfer, once retrieval is stable)
 *   P7: the meaning appears in a saved version of the learner's testimony, in a sentence written with no suggestion and not
 *   copied from a model or frame GoTell showed (spontaneous use; detected by the service, folded here).
 *   An assisted success never lowers a level; levels only rise through these rules.
 * Lapse: a free attempt (no help in the task, nothing shown recently) that fails while the level is P4 or above sets the
 * current level back to P3 ("needs a cue again"), counts a lapse, and keeps the peak. The next independent success
 * restores the level from the counters. Receptive state (GoLearn) is never touched by any of this.
 * Spacing: a retrieval is due after DUE_HOURS[level] from the last attempt (after a failure: FAILURE_RETRY_HOURS).
 */
import type { AssistanceStep, ProductiveGoalState, ProductiveLevel, SemanticGoal, SupportTier, TaskFamily, TellAttemptRecord } from '../../core';
import { strongestTier, tierRank } from './ladder';

export const RECENT_EXPOSURE_MS = 30 * 60 * 1000;
export const DUE_HOURS: Record<ProductiveLevel, number> = { 0: 0, 1: 4, 2: 8, 3: 24, 4: 48, 5: 120, 6: 288, 7: 720 };
export const FAILURE_RETRY_HOURS = 4;

export const LEVEL_NAME: Record<ProductiveLevel, string> = {
  0: 'not yet said',
  1: 'said after seeing a model',
  2: 'said with a lot of help',
  3: 'said after a small hint',
  4: 'said on your own once',
  5: 'said on your own on two different days',
  6: 'said on your own in a new kind of task',
  7: 'used in your own testimony',
};

export interface TimedAttempt { at: string; record: TellAttemptRecord }
export interface TimedStep { at: string; goalId: string; taskId: string; step: AssistanceStep }
export interface Spontaneous { at: string; goalId: string; revisionId: string; sentenceIndex: number; text: string }

export const emptyState = (goalId: string): ProductiveGoalState => ({
  goalId, level: 0, peak: 0, rule: 'P0: not yet said.', attempts: 0, independentSuccesses: 0, independentDays: [], independentFamilies: [], lapses: 0, history: [],
});

const day = (iso: string) => iso.slice(0, 10);
const addHours = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3600_000).toISOString();
const maxLevel = (a: ProductiveLevel, b: ProductiveLevel): ProductiveLevel => (a >= b ? a : b);

/** The support an attempt counts with: its task's lineage, or a stronger step shown for the goal shortly before. */
export function effectiveSupport(attempt: TimedAttempt, steps: TimedStep[]): { tier: SupportTier; recent?: TimedStep } {
  const own = attempt.record.tier;
  const t = Date.parse(attempt.at);
  let best: TimedStep | undefined;
  for (const s of steps) {
    if (s.goalId !== attempt.record.goalId || s.taskId === attempt.record.taskId) continue;
    const ts = Date.parse(s.at);
    if (ts > t || t - ts > RECENT_EXPOSURE_MS) continue;
    if (!best || tierRank(s.step.tier) > tierRank(best.step.tier)) best = s;
  }
  if (best && tierRank(best.step.tier) > tierRank(own)) return { tier: best.step.tier, recent: best };
  return { tier: own };
}

/** Apply one attempt to a state (pure: returns a new state). */
export function applyAttempt(prev: ProductiveGoalState, a: TimedAttempt, steps: TimedStep[], firstFreeInTask: boolean): ProductiveGoalState {
  const s: ProductiveGoalState = { ...prev, independentDays: [...prev.independentDays], independentFamilies: [...prev.independentFamilies], history: [...prev.history] };
  s.attempts += 1;
  s.lastAttemptAt = a.at;
  const { tier, recent } = effectiveSupport(a, steps);
  const recentNote = recent ? ` (nothing was shown in this task, but ${recent.step.kind === 'full-model' ? 'a full model' : 'help'} for it was shown ${Math.max(1, Math.round((Date.parse(a.at) - Date.parse(recent.at)) / 60000))} min earlier)` : '';
  const from = s.level;
  let to = s.level;
  let rule = s.rule;

  if (a.record.outcome === 'success') {
    s.lastSuccessAt = a.at;
    if (tier === 'model') { to = maxLevel(to, 1); rule = `P1: said after a full model${recentNote}; repeating a model is never independent.`; }
    else if (tier === 'scaffold') { to = maxLevel(to, 2); rule = `P2: said with part of the wording given${recentNote}.`; }
    else if (tier === 'cue') { to = maxLevel(to, 3); rule = a.record.selfRepair ? 'P3: repaired after a hint that gave no wording (self-repair).' : 'P3: said after a small hint.'; }
    else {
      const d = day(a.at);
      const earlierDays = s.independentDays.filter((x) => x < d);
      const familiesBefore = new Set(s.independentFamilies);
      s.independentSuccesses += 1;
      s.lastIndependentAt = a.at;
      if (!s.independentDays.includes(d)) s.independentDays.push(d);
      if (!familiesBefore.has(a.record.family)) s.independentFamilies.push(a.record.family);
      let cand: ProductiveLevel = 4;
      rule = 'P4: said with no help.';
      if (earlierDays.length > 0) { cand = 5; rule = 'P5: said with no help again, on a later day.'; }
      if (earlierDays.length > 0 && prev.level >= 5 && !familiesBefore.has(a.record.family)) {
        cand = 6; rule = `P6: said with no help on a later day in a new kind of task (${a.record.family}) — it transfers.`;
      }
      // after a lapse the level comes back from the counters; otherwise it never goes down
      to = maxLevel(s.level, cand);
      if (to > cand) rule = `${rule} Level stays P${to} (reached before).`;
    }
  } else {
    s.lastFailureAt = a.at;
    if (firstFreeInTask && tier === 'none' && s.level >= 4) {
      to = 3;
      s.lapses += 1;
      rule = `P3: a free retrieval failed (lapse ${s.lapses}); back to "needs a cue" until it is said on its own again. Peak stays P${s.peak}.`;
    }
  }
  s.level = to;
  s.peak = maxLevel(s.peak, to);
  s.rule = rule;
  if (to !== from || a.record.outcome === 'success') s.history.push({ at: a.at, from, to, rule, attemptId: a.record.attemptId });
  s.dueAt = addHours(a.at, a.record.outcome === 'success' ? DUE_HOURS[s.level] : FAILURE_RETRY_HOURS);
  return s;
}

export function applySpontaneous(prev: ProductiveGoalState, sp: Spontaneous): ProductiveGoalState {
  const s: ProductiveGoalState = { ...prev, history: [...prev.history] };
  const from = s.level;
  s.level = 7;
  s.peak = 7;
  s.rule = 'P7: you used it in your own testimony, unprompted, with no suggestion and not copied from a model.';
  s.spontaneous = { revisionId: sp.revisionId, sentenceIndex: sp.sentenceIndex, text: sp.text };
  s.history.push({ at: sp.at, from, to: 7, rule: s.rule, revisionId: sp.revisionId });
  s.dueAt = addHours(sp.at, DUE_HOURS[7]);
  return s;
}

/** Fold the whole log for one learner and language into a state per goal. */
export function foldStates(goals: SemanticGoal[], attempts: TimedAttempt[], steps: TimedStep[], spontaneous: Spontaneous[]): Map<string, ProductiveGoalState> {
  const out = new Map<string, ProductiveGoalState>(goals.map((g) => [g.id, emptyState(g.id)]));
  type Item = { at: string; k: 0 | 1; a?: TimedAttempt; sp?: Spontaneous };
  const items: Item[] = [...attempts.map((a): Item => ({ at: a.at, k: 0, a })), ...spontaneous.map((sp): Item => ({ at: sp.at, k: 1, sp }))];
  items.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : x.k - y.k || ((x.a?.record.attemptId ?? '') < (y.a?.record.attemptId ?? '') ? -1 : 1)));
  const failedFreeTasks = new Set<string>();
  for (const it of items) {
    if (it.a) {
      const g = it.a.record.goalId;
      const prev = out.get(g) ?? emptyState(g);
      const first = !failedFreeTasks.has(it.a.record.taskId);
      if (it.a.record.outcome !== 'success') failedFreeTasks.add(it.a.record.taskId);
      out.set(g, applyAttempt(prev, it.a, steps, first));
    } else if (it.sp) {
      const prev = out.get(it.sp.goalId) ?? emptyState(it.sp.goalId);
      if (prev.spontaneous) continue; // the first spontaneous use is the evidence; later ones add nothing new
      out.set(it.sp.goalId, applySpontaneous(prev, it.sp));
    }
  }
  return out;
}

export const levelLabel = (l: ProductiveLevel): string => `P${l} · ${LEVEL_NAME[l]}`;
export const supportOf = (steps: AssistanceStep[]): SupportTier => strongestTier(steps);
export type { TaskFamily };
