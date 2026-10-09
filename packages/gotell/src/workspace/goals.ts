/**
 * The learner's writing goals, kept as preference events: `PreferenceChanged { key: 'gotell:goal', value: WritingGoal }`.
 * A goal is the learner's own sentence; marking it done is a later event with the same `goalId`. The profile builder reads
 * the same convention, so this file and that one must agree on the key and the value shape.
 */
import { CONTRACT_VERSION, type GoEvent } from '../../../repository-contract/src';
import type { Identity, WritingGoal } from '../types';

export const GOAL_KEY = 'gotell:goal';
export const MAX_GOAL_CHARS = 300;

export interface GoalEventInput {
  identity: Identity;
  appVersion: string;
  at: string;
  eventId: string;
  goal: WritingGoal;
}

export function goalEvent(input: GoalEventInput): GoEvent {
  const { identity: id, goal } = input;
  const value: WritingGoal = { goalId: goal.goalId, text: goal.text, createdAt: goal.createdAt, ...(goal.done ? { done: true } : {}) };
  return {
    id: input.eventId, v: CONTRACT_VERSION, learnerId: id.learnerId, enrolmentId: id.enrolmentId, languageId: id.languageId,
    ...(id.varietyId ? { varietyId: id.varietyId } : {}),
    at: input.at,
    producer: { app: 'gopractice-tell', version: input.appVersion, deviceId: id.deviceId, surface: 'tell-goals' },
    kind: 'PreferenceChanged', subject: {},
    payload: { key: GOAL_KEY, value, origin: 'explicit' },
    dedupeKey: `${GOAL_KEY}:${goal.goalId}:${goal.done ? 'done' : 'open'}`,
  };
}

/** The goals the events describe: the latest event per goal wins; oldest goals first. */
export function foldGoals(events: readonly GoEvent[]): WritingGoal[] {
  const latest = new Map<string, { goal: WritingGoal; at: string }>();
  for (const e of events) {
    if (e.kind !== 'PreferenceChanged') continue;
    const p = e.payload as { key?: unknown; value?: unknown };
    if (p.key !== GOAL_KEY || !p.value || typeof p.value !== 'object') continue;
    const v = p.value as Partial<WritingGoal>;
    if (typeof v.goalId !== 'string' || typeof v.text !== 'string' || typeof v.createdAt !== 'string') continue;
    const prev = latest.get(v.goalId);
    if (prev && prev.at > e.at) continue;
    latest.set(v.goalId, { at: e.at, goal: { goalId: v.goalId, text: v.text, createdAt: v.createdAt, ...(v.done === true ? { done: true } : {}) } });
  }
  return [...latest.values()].map((x) => x.goal).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.goalId.localeCompare(b.goalId));
}

export function cleanGoalText(raw: string): string | undefined {
  const t = raw.replace(/\s+/gu, ' ').trim();
  return t && t.length <= MAX_GOAL_CHARS ? t : undefined;
}
