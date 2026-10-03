/**
 * The practice scheduler — "what is the most useful thing this learner is almost able to say on his own right now?"
 *
 * Every goal gets a score = Σ weight × factor (each factor in 0..1; overload, recent failures and a recent model count
 * against). Every factor is kept with its value, weight, contribution and a plain reason, so the choice can be inspected
 * ("Selected because: …"). Deterministic: ties are broken by goal id.
 *
 *   importance        how central the meaning is (catalog importance; testimony goals by their place in the story)
 *   weakness          room to grow: 1 − level/7
 *   input             GoLearn → GoTell: the share of the meaning's ideas he has met words for in reading or listening
 *   due               spaced retrieval: 1 when a retrieval is due, rising towards it before; 0.6 for a meaning never tried
 *   sinceIndependent  time since he last said it on his own (saturates at 14 days)
 *   transfer          the share of its ideas he can already say on his own in OTHER meanings (recombination)
 *   frontier          predicted success near the sweet spot (0.65): neither trivial nor hopeless
 *   novelty           never tried
 *   overload  (−)     ideas he has never met words for: this would be new language, not retrieval
 *   recentFailure (−) failures in the last 24 hours
 *   recentModel (−)   a full model or heavy help shown in the last 30 minutes: retrieval now would only be repetition
 *   tooSoon (−)       tried before and not yet due: the share of the spacing interval still to run (spacing helps memory)
 * predictedSuccess is a heuristic from level, input and lapses — not a calibrated probability; it is shown as such.
 */
import type { ProductiveGoalState, ProductiveLevel, ScheduleCandidate, SchedulerFactor, SelectionExplanation, SemanticGoal, TaskFamily } from '../../core';
import { DUE_HOURS, LEVEL_NAME, RECENT_EXPOSURE_MS } from './state';

export const SCHEDULER_POLICY = 'tell-scheduler@1';

export const WEIGHTS = {
  importance: 0.2, weakness: 0.12, input: 0.15, due: 0.2, sinceIndependent: 0.05, transfer: 0.1, frontier: 0.15, novelty: 0.05,
  overload: -0.2, recentFailure: -0.1, recentModel: -0.35, tooSoon: -0.25,
} as const;

const BASE_SUCCESS: Record<ProductiveLevel, number> = { 0: 0.15, 1: 0.3, 2: 0.42, 3: 0.55, 4: 0.7, 5: 0.8, 6: 0.88, 7: 0.92 };
const SWEET_SPOT = 0.65;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface GoalSignals {
  goal: SemanticGoal;
  state: ProductiveGoalState;
  /** concept → has he met a word for it (GoLearn encounters, reading or listening). */
  inputByConcept: Map<string, boolean>;
  /** concepts he has said on his own in other goals. */
  saidElsewhere: Set<string>;
  failuresLast24h: number;
  /** most recent heavy help (scaffold/model) shown for this goal, ISO. */
  lastHeavyHelpAt?: string;
  retellAvailable?: { textId: string; title: string };
}

export function predictedSuccess(level: ProductiveLevel, input: number, lapses: number): number {
  const p = BASE_SUCCESS[level] + (level < 4 ? 0.25 * input : 0) - 0.05 * Math.min(lapses, 3);
  return round3(Math.min(0.97, Math.max(0.05, p)));
}

const hoursBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3600_000;
const SECTION_LABEL: Record<string, string> = {
  background: 'background', childhood: 'childhood', 'knowledge-of-christianity': 'what you knew', 'understanding-of-sin': 'sin',
  conviction: 'conviction', repentance: 'repentance', faith: 'faith', forgiveness: 'forgiveness', grace: 'grace',
  transformation: 'change', 'present-faith': 'faith today', 'why-sharing': 'why you share',
};

export function chooseFamily(sig: GoalSignals): { family: TaskFamily; reason: string } {
  const { goal, state } = sig;
  if (state.level >= 4) {
    const order: TaskFamily[] = ['answer-question', 'retell', 'testimony-part', 'express'];
    for (const f of order) {
      if (state.independentFamilies.includes(f)) continue;
      if (f === 'answer-question' && !goal.question) continue;
      if (f === 'retell' && !sig.retellAvailable) continue;
      if (f === 'testimony-part' && goal.domain !== 'testimony') continue;
      return { family: f, reason: `You have said it on your own in ${state.independentFamilies.join(', ') || 'one kind of task'}; a different kind of task (${f}) checks that it transfers.` };
    }
    return { family: goal.question ? 'answer-question' : 'express', reason: 'You have said it on your own in every kind of task available; this keeps it fresh.' };
  }
  if (state.attempts === 0 && goal.components.every((c) => sig.saidElsewhere.has(c.concept))) {
    return { family: 'transfer', reason: 'You can already say each of its ideas on your own in other sentences: putting them together is a transfer test.' };
  }
  if (sig.retellAvailable && state.level >= 2) return { family: 'retell', reason: `You have read this meaning in "${sig.retellAvailable.title}": retelling it from memory.` };
  if (goal.domain === 'testimony') return { family: 'testimony-part', reason: 'It is part of your testimony.' };
  return { family: 'express', reason: 'Say the meaning in your own words.' };
}

export function startRung(p: number, state: ProductiveGoalState, input: number): { rung: number; reason: string } {
  // every task starts with free production; this only decides where the FIRST hint starts, if he asks for one
  if (p >= 0.4 || state.level >= 3) return { rung: 0, reason: 'Try it on your own first; help starts with the smallest hint.' };
  if (state.level >= 1 || input >= 0.5) return { rung: 3, reason: 'Try it on your own first; it is still new, so the first hint names a missing idea in English.' };
  return { rung: 7, reason: 'Try it on your own first; you have not met words for most of its ideas, so the first hint is the shape of the sentence (a frame). The help shrinks as you progress.' };
}

export function scoreGoal(sig: GoalSignals, now: string): { family: TaskFamily; selection: SelectionExplanation } {
  const { goal, state } = sig;
  const n = goal.components.length;
  const met = goal.components.filter((c) => sig.inputByConcept.get(c.concept)).length;
  const input = n ? met / n : 0;
  const unmet = goal.components.filter((c) => !sig.inputByConcept.get(c.concept));
  const elsewhere = goal.components.filter((c) => sig.saidElsewhere.has(c.concept)).length;
  const p = predictedSuccess(state.level, input, state.lapses);

  let due: number;
  let dueReason: string;
  let tooSoon = 0;
  if (state.attempts === 0) { due = 0.6; dueReason = 'You have not tried to say it yet.'; }
  else if (state.dueAt && state.dueAt <= now) { due = 1; dueReason = `A retrieval is due (last tried ${Math.round(hoursBetween(state.lastAttemptAt!, now))} h ago).`; }
  else {
    const interval = Math.max(1, DUE_HOURS[state.level]);
    const left = state.dueAt ? hoursBetween(now, state.dueAt) : interval;
    due = clamp01(0.5 * (1 - left / interval));
    tooSoon = clamp01(left / interval);
    dueReason = `Not due yet (due in about ${Math.max(1, Math.round(left))} h).`;
  }
  const since = state.lastIndependentAt ? clamp01(hoursBetween(state.lastIndependentAt, now) / (14 * 24)) : 0.5;
  const recentModel = sig.lastHeavyHelpAt && Date.parse(now) - Date.parse(sig.lastHeavyHelpAt) < RECENT_EXPOSURE_MS ? 1 : 0;

  const f = (key: keyof typeof WEIGHTS, value: number, reason: string): SchedulerFactor => {
    const v = round3(clamp01(value));
    return { key, value: v, weight: WEIGHTS[key], contribution: round3(WEIGHTS[key] * v), reason };
  };
  const factors: SchedulerFactor[] = [
    f('importance', goal.importance, goal.section ? `It is part of your testimony (${SECTION_LABEL[goal.section] ?? goal.section}).` : `It is useful in ${goal.domain} conversations.`),
    f('weakness', 1 - state.level / 7, `You are at P${state.level} (${LEVEL_NAME[state.level]}).`),
    f('input', input, n ? `You have met words for ${met} of its ${n} idea${n === 1 ? '' : 's'} in your reading or listening.` : 'It has no ideas to look up.'),
    f('due', due, dueReason),
    f('sinceIndependent', since, state.lastIndependentAt ? `Last said on your own ${Math.round(hoursBetween(state.lastIndependentAt, now) / 24)} day(s) ago.` : 'Not yet said on your own.'),
    f('transfer', n ? elsewhere / n : 0, elsewhere ? `You can already say ${elsewhere} of its ideas on your own in other sentences.` : 'None of its ideas is yet said on your own elsewhere.'),
    f('frontier', 1 - Math.abs(p - SWEET_SPOT) / SWEET_SPOT, `Predicted success about ${Math.round(p * 100)} % (a heuristic, not a measurement); best near ${Math.round(SWEET_SPOT * 100)} %.`),
    f('novelty', state.attempts === 0 ? 1 : 0, state.attempts === 0 ? 'Never tried.' : 'Tried before.'),
    f('overload', state.level === 0 && n ? unmet.length / n : 0, state.level > 0 ? 'Not counted: you have already said it.' : unmet.length ? `You have not met words for: ${unmet.map((c) => c.english).join(', ')} — that would be new language.` : 'Every idea uses words you have met.'),
    f('recentFailure', sig.failuresLast24h >= 2 ? 1 : sig.failuresLast24h === 1 ? 0.5 : 0, sig.failuresLast24h ? `${sig.failuresLast24h} unsuccessful attempt(s) in the last 24 hours.` : 'No recent failures.'),
    f('tooSoon', tooSoon, tooSoon > 0 ? `Practised recently and not due yet: spacing it out helps you remember.` : state.attempts === 0 ? 'Never practised.' : 'Due now.'),
    f('recentModel', recentModel, recentModel ? 'A model or heavy help for it was shown in the last 30 minutes: saying it now would be repetition, not retrieval.' : 'No recent model.'),
  ];
  const score = round3(factors.reduce((s, x) => s + x.contribution, 0));
  const { family, reason: familyReason } = chooseFamily(sig);
  const start = startRung(p, state, input);
  // "Selected because": the factors that pushed the score up the most, then what holds it down
  const positive = factors.filter((x) => x.contribution > 0.02).sort((a, b) => b.contribution - a.contribution).slice(0, 4).map((x) => x.reason);
  const negative = factors.filter((x) => x.contribution < -0.01).map((x) => `Held back: ${x.reason}`);
  return {
    family,
    selection: { score, factors, reasons: [...positive, ...negative], predictedSuccess: p, familyReason, startRung: start.rung, startReason: start.reason, policy: SCHEDULER_POLICY },
  };
}

export function rankGoals(signals: GoalSignals[], now: string): ScheduleCandidate[] {
  return signals
    .map((sig) => { const r = scoreGoal(sig, now); return { goal: sig.goal, state: sig.state, family: r.family, selection: r.selection }; })
    .sort((a, b) => b.selection.score - a.selection.score || (a.goal.id < b.goal.id ? -1 : 1));
}
