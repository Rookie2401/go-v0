/**
 * Test world for GoTell practice: memory store, real event bus, the REAL language adapters (so catalog model wordings and
 * the real checkers are exercised), a fake GoLearn whose receptive state each test sets, and a clock the test moves.
 */
import { StoreEventBus, createMemoryStore, ids, seedBasics } from '../../../src/core';
import type { DomainEvent, EventType, GoTellPractice, InterpretationProvider, LanguageCode, PracticeTask, TellAttemptRecord } from '../../../src/core';
import { createAdapterRegistry } from '../../../src/adapters';
import { createGoTell } from '../../../src/gotell';
import { FakeGoLearn } from '../fakes';
import type { World } from '../fakes';

export interface PracticeWorld extends World {
  practice: GoTellPractice;
  practiceFor: (userId: string) => GoTellPractice;
  jumpMinutes: (m: number) => void;
  jumpDays: (d: number) => void;
  events: (types?: EventType[]) => Promise<DomainEvent[]>;
}

export async function makePracticeWorld(opts: { interpreter?: InterpretationProvider; start?: string } = {}): Promise<PracticeWorld> {
  const store = createMemoryStore();
  await seedBasics(store, 'A');
  await store.users.put({ id: 'B', displayName: 'B', courseId: 'honduras-es', createdAt: '2026-01-01T00:00:00.000Z' });
  let t = Date.parse(opts.start ?? '2026-10-01T08:00:00.000Z');
  const now = () => new Date((t += 1000)).toISOString();
  const bus = new StoreEventBus(store, now);
  const golearn = new FakeGoLearn(store);
  const registry = createAdapterRegistry();
  const gotell = createGoTell({ store, bus, adapters: registry, golearn, clock: now, ...(opts.interpreter ? { interpreter: opts.interpreter } : {}) });
  const practiceFor = (userId: string) => gotell.forUser(userId).practice!;
  return {
    store, bus, golearn, registry, gotell, now, practice: practiceFor('A'), practiceFor,
    jumpMinutes: (m) => { t += m * 60_000; },
    jumpDays: (d) => { t += d * 86_400_000; },
    events: (types) => bus.history({ userId: 'A', ...(types ? { types } : {}) }),
  };
}

/** Give learner `userId` receptive state for these surface forms (as if met in reading). */
export function meet(w: PracticeWorld, userId: string, lang: LanguageCode, forms: string[]) {
  for (const f of forms) w.golearn.learn(userId, lang, ids.form(lang, f.toLowerCase()), { level: 'recognized', count: 3 });
}

/** Ask for hints until the full model is shown; returns the task. */
export async function hintToModel(p: GoTellPractice, userId: string, taskId: string): Promise<PracticeTask> {
  let task = (await p.task(userId, taskId))!;
  for (let i = 0; i < 20 && !task.assistance.some((s) => s.kind === 'full-model'); i++) task = await p.hint(userId, taskId);
  return task;
}

export async function say(p: GoTellPractice, taskId: string, text: string, userId = 'A'): Promise<{ task: PracticeTask; attempt: TellAttemptRecord }> {
  return p.submit(userId, taskId, text);
}

/** A fresh task for a goal, chosen by the learner. */
export async function taskFor(p: GoTellPractice, goalId: string, lang: LanguageCode = 'es', userId = 'A'): Promise<PracticeTask> {
  const t = await p.next(userId, lang, { goalId });
  if (!t) throw new Error(`no task for ${goalId}`);
  return t;
}
