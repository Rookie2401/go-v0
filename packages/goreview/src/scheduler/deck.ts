/**
 * The deck is a FOLD over the learner's event log, never a mutable record of its own. The Repository's events are the
 * source of truth; this file only reads them. Re-folding the same event multiset gives the same deck on every device,
 * whatever order the events arrived in: events are sorted by (at, id) first, duplicates by id are dropped, and every
 * rule below is a deterministic function of that sorted list.
 *
 * Events consumed (all by `subject.cardId` = the item id, see `itemIdFor`):
 *   CardAdded            payload { unitId, unitKind, dimension, family, reason?, addedBy }  creates or re-activates the item
 *   CardRemoved          payload { reason: 'dismissed' | 'suspended' | 'snoozed', until? }    sets the status
 *   CardReviewed / AssessmentAnswered / ListeningAssessed
 *                        payload { rating: 1..4 | null, outcome?, exerciseId?, family?, correct? }
 *                        a rating advances the schedule and appends a history entry; no rating (null or absent) changes nothing
 *                        and is only counted in `unscored` (invalid question, failed audio, challenged answer, ...).
 *   ReviewItemInvalidated payload { reason: 'analysis-invalidated', cardId }   the answer key (the analysis it was built on) was
 *                        reported wrong: the item is SUSPENDED with `suspendedReason`, so no exercise is built on it until a
 *                        later CardAdded (someone who can fix the pack re-adds it) re-activates it.
 */
import type { EventKind, GoEvent } from '../../../repository-contract/src';
import { retractedReviewIds, validateEvent } from '../../../repository-contract/src';
import { ASSESSMENT_DIMENSIONS, EXERCISE_FAMILIES } from '../types';
import type { AssessmentDimension, DeckItem, ExerciseFamily, GradeOutcome, Rating, ReviewLogEntry, Scheduler } from '../types';

export const PRODUCER_APP = 'gopractice-review' as const;
const DEFAULT_PRODUCER_VERSION = '0.1.0';
const SURFACE = 'review-deck';

export const REVIEW_EVENT_KINDS: readonly EventKind[] = ['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed'];
const OUTCOMES: readonly GradeOutcome[] = ['correct', 'incorrect', 'partial', 'ambiguous', 'invalid-question', 'unable-to-grade'];

/** The deck item id for a unit tested along one assessment dimension. */
export const itemIdFor = (unitId: string, dimension: AssessmentDimension): string => `card:${dimension}:${unitId}`;

// ───────────────────────────── the fold ─────────────────────────────

export interface DeckFold {
  /** Items in a stable order (by `addedAt`, then item id). */
  items: DeckItem[];
  /** Review events that carried no rating, per item: kept out of the schedule and the history on purpose. */
  unscored: Record<string, number>;
  /** Events the fold read but could not apply, and why (never silent). */
  ignored: Array<{ eventId: string; kind: string; reason: string }>;
}

export interface FoldOptions {
  /** Keep only this language's events (and so only its items). */
  languageId?: string;
  /** The instant the deck is read at; a snooze that ends at or before it is over. */
  now: string;
}

const byAtThenId = (a: GoEvent, b: GoEvent): number => {
  const ta = Date.parse(a.at);
  const tb = Date.parse(b.at);
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

const isRating = (x: unknown): x is Rating => x === 1 || x === 2 || x === 3 || x === 4;
const isDimension = (x: unknown): x is AssessmentDimension => typeof x === 'string' && (ASSESSMENT_DIMENSIONS as readonly string[]).includes(x);
const isFamily = (x: unknown): x is ExerciseFamily => typeof x === 'string' && (EXERCISE_FAMILIES as readonly string[]).includes(x);
const nonEmpty = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const validInstant = (x: unknown): x is string => typeof x === 'string' && !Number.isNaN(Date.parse(x));

function outcomeOf(payload: Record<string, unknown>): GradeOutcome {
  if (OUTCOMES.includes(payload.outcome as GradeOutcome)) return payload.outcome as GradeOutcome;
  if (payload.correct === true) return 'correct';
  if (payload.correct === false) return 'incorrect';
  return 'ambiguous';
}

export function foldDeck(events: readonly GoEvent[], scheduler: Scheduler, opts: FoldOptions): DeckFold {
  const nowMs = Date.parse(opts.now);
  if (Number.isNaN(nowMs)) throw new RangeError(`not an ISO timestamp: ${opts.now}`);

  const out: DeckFold = { items: [], unscored: {}, ignored: [] };
  const ignore = (e: GoEvent, reason: string): void => { out.ignored.push({ eventId: e.id, kind: e.kind, reason }); };

  // A malformed `at` cannot be ordered: it is set aside before sorting, so the rest stays deterministic.
  const orderable: GoEvent[] = [];
  for (const e of events) {
    if (opts.languageId !== undefined && e.languageId !== opts.languageId) continue;
    if (Number.isNaN(Date.parse(e.at))) { ignore(e, 'unparseable timestamp'); continue; }
    orderable.push(e);
  }
  orderable.sort(byAtThenId);

  const retracted = new Set(retractedReviewIds(orderable));

  const items = new Map<string, DeckItem>();
  const seen = new Set<string>();

  for (const e of orderable) {
    if (seen.has(e.id)) continue; // the same event delivered twice (retries, two sync paths)
    seen.add(e.id);
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    if (e.correctionOf) {
      if (retracted.has(e.correctionOf)) continue;
      ignore(e, 'invalid review correction: target, kind, identity, card or timestamp did not match');
      continue;
    }
    const itemId = e.subject?.cardId;

    if (e.kind === 'CardAdded') {
      if (!nonEmpty(itemId)) { ignore(e, 'CardAdded without subject.cardId'); continue; }
      if (!nonEmpty(payload.unitId) || !nonEmpty(payload.unitKind) || !isDimension(payload.dimension) || !isFamily(payload.family) || (payload.addedBy !== 'intake' && payload.addedBy !== 'learner')) {
        ignore(e, 'CardAdded payload needs unitId, unitKind, a known dimension and family, and addedBy'); continue;
      }
      const reason = typeof payload.reason === 'string' && payload.reason.length ? payload.reason : undefined;
      const existing = items.get(itemId);
      if (!existing) {
        items.set(itemId, {
          itemId,
          unitId: payload.unitId,
          unitKind: payload.unitKind,
          languageId: e.languageId,
          ...(e.varietyId !== undefined ? { varietyId: e.varietyId } : {}),
          dimension: payload.dimension,
          family: payload.family,
          addedAt: e.at,
          addedBy: payload.addedBy,
          reasons: reason ? [reason] : [],
          schedule: scheduler.newState(e.at),
          history: [],
          status: 'active',
        });
      } else {
        // Re-activation: the schedule and history survive; the preferred family and the reasons are brought up to date.
        existing.status = 'active';
        delete existing.snoozedUntil;
        delete existing.suspendedReason;
        existing.family = payload.family;
        if (reason && !existing.reasons.includes(reason)) existing.reasons.push(reason);
      }
      continue;
    }

    if (e.kind === 'CardRemoved') {
      const item = nonEmpty(itemId) ? items.get(itemId) : undefined;
      if (!item) { ignore(e, 'CardRemoved for an item that is not in the deck'); continue; }
      const why = payload.reason;
      if (why === 'dismissed' || why === 'suspended') {
        item.status = why;
        delete item.snoozedUntil;
        delete item.suspendedReason;
      } else if (why === 'snoozed') {
        if (!validInstant(payload.until)) { ignore(e, 'a snooze needs a valid `until`'); continue; }
        item.status = 'snoozed';
        item.snoozedUntil = payload.until;
      } else ignore(e, 'CardRemoved reason must be dismissed, suspended or snoozed');
      continue;
    }

    if (e.kind === 'ReviewItemInvalidated') {
      const item = nonEmpty(itemId) ? items.get(itemId) : undefined;
      if (!item) { ignore(e, 'ReviewItemInvalidated for an item that is not in the deck'); continue; }
      item.status = 'suspended';
      delete item.snoozedUntil;
      item.suspendedReason = nonEmpty(payload.reason) ? payload.reason : 'analysis-invalidated';
      continue;
    }

    if ((REVIEW_EVENT_KINDS as readonly string[]).includes(e.kind)) {
      const item = nonEmpty(itemId) ? items.get(itemId) : undefined;
      if (!item) { ignore(e, 'review of an item that has not been added (yet, in event time)'); continue; }
      if (!isRating(payload.rating)) {
        out.unscored[item.itemId] = (out.unscored[item.itemId] ?? 0) + 1;
        continue;
      }
      const next = scheduler.review(item.schedule, payload.rating, e.at);
      const entry: ReviewLogEntry = {
        at: e.at,
        rating: payload.rating,
        outcome: outcomeOf(payload),
        deviceId: e.producer?.deviceId ?? 'unknown',
        exerciseId: nonEmpty(payload.exerciseId) ? payload.exerciseId : e.id,
        family: isFamily(payload.family) ? payload.family : item.family,
        elapsedDays: next.elapsedDays,
        eventId: e.id,
        ...(retracted.has(e.id) ? { retracted: true } : {}),
      };
      item.history.push(entry);
      if (!retracted.has(e.id)) item.schedule = next;
    }
  }

  for (const item of items.values()) {
    if (item.status === 'snoozed' && item.snoozedUntil !== undefined && Date.parse(item.snoozedUntil) <= nowMs) {
      item.status = 'active';
      delete item.snoozedUntil;
    }
  }

  out.items = [...items.values()].sort((a, b) => Date.parse(a.addedAt) - Date.parse(b.addedAt) || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
  return out;
}

/** Convenience: the items of a fold. */
export const foldDeckItems = (events: readonly GoEvent[], scheduler: Scheduler, opts: FoldOptions): DeckItem[] => foldDeck(events, scheduler, opts).items;

// ───────────────────────────── event builders ─────────────────────────────

export interface EventBase {
  learnerId: string;
  enrolmentId: string;
  languageId: string;
  varietyId?: string;
  at: string;
  deviceId: string;
  /** Overrides the generated event id. */
  id?: string;
  producerVersion?: string;
}

export interface CardAddedInput extends EventBase {
  unitId: string;
  unitKind: string;
  dimension: AssessmentDimension;
  family: ExerciseFamily;
  addedBy: 'intake' | 'learner';
  reason?: string;
  /** Overrides `itemIdFor(unitId, dimension)`. */
  itemId?: string;
}

export interface CardRemovedInput extends EventBase {
  itemId: string;
  reason: 'dismissed' | 'suspended' | 'snoozed';
  /** Required for `snoozed`: the instant the snooze ends. */
  until?: string;
}

const dedupeKeyFor = (itemId: string, kind: 'CardAdded' | 'CardRemoved', at: string): string => `card:${itemId}:${kind}:${at}`;

function envelope(i: EventBase, kind: 'CardAdded' | 'CardRemoved', itemId: string): Pick<GoEvent, 'id' | 'v' | 'learnerId' | 'enrolmentId' | 'languageId' | 'at' | 'producer' | 'dedupeKey' | 'evidence'> & { varietyId?: string } {
  const dedupeKey = dedupeKeyFor(itemId, kind, i.at);
  return {
    id: i.id ?? `${dedupeKey}:${i.deviceId}`,
    v: 2,
    learnerId: i.learnerId,
    enrolmentId: i.enrolmentId,
    languageId: i.languageId,
    ...(i.varietyId !== undefined ? { varietyId: i.varietyId } : {}),
    at: i.at,
    producer: { app: PRODUCER_APP, version: i.producerVersion ?? DEFAULT_PRODUCER_VERSION, deviceId: i.deviceId, surface: SURFACE },
    dedupeKey,
    // Managing the deck is bookkeeping, not an observation of the learner's knowledge.
    evidence: { quality: 'none' },
  };
}

export function buildCardAdded(i: CardAddedInput): GoEvent {
  const itemId = i.itemId ?? itemIdFor(i.unitId, i.dimension);
  return {
    ...envelope(i, 'CardAdded', itemId),
    kind: 'CardAdded',
    subject: { cardId: itemId, itemIds: [i.unitId] },
    payload: { unitId: i.unitId, unitKind: i.unitKind, dimension: i.dimension, family: i.family, addedBy: i.addedBy, ...(i.reason ? { reason: i.reason } : {}) },
  };
}

export function buildCardRemoved(i: CardRemovedInput): GoEvent {
  if (i.reason === 'snoozed' && !validInstant(i.until)) throw new RangeError('a snooze needs `until`, an ISO timestamp');
  if (i.reason !== 'snoozed' && i.until !== undefined) throw new RangeError('`until` belongs to a snooze only');
  return {
    ...envelope(i, 'CardRemoved', i.itemId),
    kind: 'CardRemoved',
    subject: { cardId: i.itemId },
    payload: { reason: i.reason, ...(i.until ? { until: i.until } : {}) },
  };
}

/** Throws when a built event would be refused at the Repository's write boundary. */
export function assertValidEvent(e: GoEvent): GoEvent {
  const issues = validateEvent(e);
  if (issues.length) throw new Error(`invalid event ${e.id}: ${issues.map((x) => `${x.path} ${x.message}`).join('; ')}`);
  return e;
}
