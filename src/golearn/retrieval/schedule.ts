/**
 * Retrieval practice: the schedule. Pure functions, no store, no clock.
 *
 * One schedule per learner item (a lemma, or any item the learner asks to practise). The interval table is GoTell's
 * `DUE_HOURS` (src/gotell/productive/state.ts), copied rather than imported so that the two engines can be tuned apart:
 *
 *   level   0     1    2    3     4     5      6      7
 *   due     now   4 h  8 h  24 h  48 h  120 h  288 h  720 h     (after the answer that put the item on that level)
 *
 * An answer has one of three outcomes (what the learner did, not what the engine believes about the word):
 *   independent  the word was typed with nothing shown        → level + 1 (at most 7); next prompt after DUE_HOURS[new level]
 *   assisted     the word was typed after its first letter    → the level never rises: it is held between 1 and 3 ("needs a cue"),
 *                was shown                                       next prompt after DUE_HOURS[that level]
 *   miss         the word had to be shown                     → a lapse: a word on level 4 or more goes back to level 3 (as GoTell's
 *                                                                 lapse rule), a lower level is kept; next prompt in RETRY_HOURS
 * Only independent and assisted answers are evidence (index.ts emits the existing ProductionRecorded for them); a miss
 * records nothing in GoLearn, it only moves the schedule.
 */

export type RetrievalLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type RetrievalOutcome = 'independent' | 'assisted' | 'miss';

/** Hours until the next prompt after an answer that leaves the item on this level. Same numbers as GoTell's DUE_HOURS. */
export const RETRIEVAL_DUE_HOURS: Record<RetrievalLevel, number> = { 0: 0, 1: 4, 2: 8, 3: 24, 4: 48, 5: 120, 6: 288, 7: 720 };
/** After a miss the word comes back after this many hours (GoTell: FAILURE_RETRY_HOURS). */
export const RETRY_HOURS = 4;
/** The daily set never holds more than this many prompts (a word the learner queues himself is not counted against it). */
export const DAILY_CAP = 20;

/** A word is weak when it is only `encountered` / `recognized_with_help` and has been met at least this many times. */
export const WEAK_MIN_MET = 2;
/** A word is overdue when it has not been met for this many days and has been met at least OVERDUE_MIN_MET times. */
export const OVERDUE_DAYS = 14;
export const OVERDUE_MIN_MET = 3;

export interface ItemSchedule {
  level: RetrievalLevel;
  /** ISO time from which the item is due. Absent for an item that has never been answered (it is due as soon as it is a candidate). */
  dueAt?: string;
  attempts: number;
  lapses: number;
  lastAt?: string;
  lastOutcome?: RetrievalOutcome;
  /** The learner asked to practise this word now ("practise" in the Vocabulary table): due at once, beyond the daily cap. */
  queuedAt?: string;
}

export interface RetrievalState {
  v: 1;
  items: Record<string, ItemSchedule>;
  /** The local day `doneToday` counts. */
  day: string;
  /** Prompts finished (answered, or given up) on `day`. */
  doneToday: number;
}

export const emptyRetrievalState = (): RetrievalState => ({ v: 1, items: {}, day: '', doneToday: 0 });

/** The local calendar day of an instant ("2026-10-07"). */
export function localDay(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const addHours = (iso: string, hours: number): string => new Date(Date.parse(iso) + hours * 3600_000).toISOString();

const clampLevel = (n: number): RetrievalLevel => Math.max(0, Math.min(7, Math.round(n))) as RetrievalLevel;

/** The schedule after one answer (pure: returns a new object). A queued word stops being queued once it is answered. */
export function applyOutcome(prev: ItemSchedule | undefined, outcome: RetrievalOutcome, at: string): ItemSchedule {
  const base: ItemSchedule = prev ?? { level: 0, attempts: 0, lapses: 0 };
  const next: ItemSchedule = { level: base.level, attempts: base.attempts + 1, lapses: base.lapses, lastAt: at, lastOutcome: outcome };
  if (outcome === 'independent') {
    next.level = clampLevel(base.level + 1);
    next.dueAt = addHours(at, RETRIEVAL_DUE_HOURS[next.level]);
  } else if (outcome === 'assisted') {
    next.level = clampLevel(Math.max(1, Math.min(3, base.level)));
    next.dueAt = addHours(at, RETRIEVAL_DUE_HOURS[next.level]);
  } else {
    if (base.level >= 1) next.lapses = base.lapses + 1;
    next.level = base.level >= 4 ? 3 : base.level;
    next.dueAt = addHours(at, RETRY_HOURS);
  }
  return next;
}

export type CandidateReason = 'queued' | 'retry' | 'due' | 'weak' | 'overdue';

/** What the engine needs to know about a learner item to decide whether it is a candidate (a slice of LearnerItemState). */
export interface ItemFacts {
  readingLevel: string;
  encounterCount: number;
  lastSeenAt?: string;
  manualMark?: 'known' | 'unknown';
}

/**
 * Why an item is on today's list, or undefined when it is not.
 *   A word already in the cycle (it has a schedule) is on the list exactly when it is due (or queued): its level on the reading
 *   side no longer decides, the interval does. A word never practised is a candidate when it is
 *     weak     encountered / recognized_with_help with at least WEAK_MIN_MET encounters, or
 *     overdue  met at least OVERDUE_MIN_MET times but not for OVERDUE_DAYS days.
 *   A word the learner marked "I know it" is left alone unless he queued it himself.
 */
export function candidateReason(facts: ItemFacts, sched: ItemSchedule | undefined, nowIso: string): CandidateReason | undefined {
  if (sched?.queuedAt) return 'queued';
  if (facts.manualMark === 'known') return undefined;
  if (sched && sched.attempts > 0) {
    if (sched.dueAt && sched.dueAt > nowIso) return undefined;
    return sched.lastOutcome === 'miss' ? 'retry' : 'due';
  }
  if (sched?.dueAt && sched.dueAt > nowIso) return undefined;
  if ((facts.readingLevel === 'encountered' || facts.readingLevel === 'recognized_with_help') && facts.encounterCount >= WEAK_MIN_MET) return 'weak';
  if (facts.encounterCount >= OVERDUE_MIN_MET && facts.lastSeenAt && Date.parse(nowIso) - Date.parse(facts.lastSeenAt) >= OVERDUE_DAYS * 86_400_000) return 'overdue';
  return undefined;
}

const REASON_RANK: Record<CandidateReason, number> = { queued: 0, retry: 1, due: 2, weak: 3, overdue: 4 };
const LEVEL_RANK: Record<string, number> = { unseen: 0, encountered: 1, recognized_with_help: 2, recognized: 3, rapid: 4 };

/** Order of the day's set: what he asked for, then misses, then what is due, then the weakest words first, then the most often met. */
export function compareCandidates(
  a: { reason: CandidateReason; facts: ItemFacts; itemId: string },
  b: { reason: CandidateReason; facts: ItemFacts; itemId: string },
): number {
  return REASON_RANK[a.reason] - REASON_RANK[b.reason]
    || (LEVEL_RANK[a.facts.readingLevel] ?? 9) - (LEVEL_RANK[b.facts.readingLevel] ?? 9)
    || b.facts.encounterCount - a.facts.encounterCount
    || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0);
}

/** `doneToday` for `nowIso`: the stored count while the local day is the same, otherwise zero. */
export function doneOn(state: RetrievalState, nowIso: string): number {
  return state.day === localDay(nowIso) ? state.doneToday : 0;
}

export function parseRetrievalState(raw: string | undefined): RetrievalState {
  if (!raw) return emptyRetrievalState();
  try {
    const o = JSON.parse(raw) as Partial<RetrievalState>;
    if (!o || o.v !== 1 || typeof o.items !== 'object' || o.items === null) return emptyRetrievalState();
    return { v: 1, items: o.items as Record<string, ItemSchedule>, day: typeof o.day === 'string' ? o.day : '', doneToday: Number(o.doneToday) || 0 };
  } catch {
    return emptyRetrievalState();
  }
}
