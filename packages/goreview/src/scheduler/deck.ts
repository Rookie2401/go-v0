/**
 * The deck is a FOLD over the learner's event log, never a mutable record of its own. The Repository's events are the
 * source of truth; this file only reads them. Re-folding the same event multiset gives the same deck on every device,
 * whatever order the events arrived in: events are ordered by actual time and causal predecessors, conflicting duplicate identities are diagnosed, and every
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
 *                        explicit facts repair workflow resolves it; ordinary Resume cannot override invalidation.
 */
import { schedulerForReviewProfile } from './replay-profile';
import { classifyReviewConvergence } from './review-convergence';
import type { EventKind, GoEvent } from '../../../repository-contract/src';
import { isValidReviewClaim, retractedReviewIds, validateEvent } from '../../../repository-contract/src';
import { ASSESSMENT_DIMENSIONS, EXERCISE_FAMILIES, FAMILY_DIMENSION } from '../types';
import { validateExercise } from '../exercises/validate';
import type { AssessmentDimension, DeckItem, Exercise, ExerciseFamily, GradeOutcome, Rating, ReviewLogEntry, Scheduler, UnitFacts } from '../types';

export const PRODUCER_APP = 'gopractice-review' as const;
const DEFAULT_PRODUCER_VERSION = '0.1.0';
const SURFACE = 'review-deck';
const FINGERPRINT_RE = /^sha256:[a-f0-9]{64}$/u;

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
  /** Scope to one learner. Omit only for a single-learner event stream. */
  learnerId?: string;
  /** Keep only this language's events (and so only its items). */
  languageId?: string;
  /** The instant the deck is read at; a snooze that ends at or before it is over. */
  now: string;
}

const sameCardScope = (a: GoEvent, b: GoEvent): boolean => a.learnerId === b.learnerId
  && a.languageId === b.languageId && a.subject?.cardId === b.subject?.cardId;

/** Keep wall-clock order, but topologically order same-instant causal reviews and same-instant card creation. */
function orderAtAndCausality(events: readonly GoEvent[]): GoEvent[] {
  const byTime = new Map<number, GoEvent[]>();
  for (const event of events) {
    const time = Date.parse(event.at), bucket = byTime.get(time) ?? [];
    bucket.push(event); byTime.set(time, bucket);
  }
  const result: GoEvent[] = [];
  for (const time of [...byTime.keys()].sort((a, b) => a - b)) {
    const bucket = byTime.get(time)!.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const byId = new Map(bucket.map(e => [e.id, e]));
    const outgoing = new Map(bucket.map(e => [e.id, new Set<string>()]));
    const indegree = new Map(bucket.map(e => [e.id, 0]));
    const edge = (before: GoEvent, after: GoEvent): void => {
      if (before.id === after.id || outgoing.get(before.id)!.has(after.id)) return;
      outgoing.get(before.id)!.add(after.id); indegree.set(after.id, indegree.get(after.id)! + 1);
    };
    for (const event of bucket) {
      if (REVIEW_EVENT_KINDS.includes(event.kind as EventKind)) {
        const parentId = event.payload.expectedPreviousReviewId;
        const parent = typeof parentId === 'string' ? byId.get(parentId) : undefined;
        if (parent && REVIEW_EVENT_KINDS.includes(parent.kind as EventKind) && sameCardScope(parent, event)) edge(parent, event);
        for (const addition of bucket) if (addition.kind === 'CardAdded' && sameCardScope(addition, event)) edge(addition, event);
      }
    }
    const ready = bucket.filter(e => indegree.get(e.id) === 0);
    const emitted = new Set<string>();
    while (ready.length) {
      ready.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const next = ready.shift()!;
      if (emitted.has(next.id)) continue;
      emitted.add(next.id); result.push(next);
      for (const id of outgoing.get(next.id)!) {
        indegree.set(id, indegree.get(id)! - 1);
        if (indegree.get(id) === 0) ready.push(byId.get(id)!);
      }
    }
    // Cycles are rejected by convergence; retain stable order so malformed data remains inspectable.
    result.push(...bucket.filter(e => !emitted.has(e.id)));
  }
  return result;
}

const isRating = (x: unknown): x is Rating => x === 1 || x === 2 || x === 3 || x === 4;
const isExplicitIntent = (x: unknown): boolean => !!x && typeof x === 'object' && (x as { kind?: unknown }).kind === 'explicit';
const isSchedulableReview = (e: GoEvent): boolean => isValidReviewClaim(e) && !!e.subject?.cardId && isRating(e.payload.rating)
  && e.payload.hinted !== true && e.payload.answerShownBefore !== true && e.payload.transcriptShownBefore !== true
  && e.evidence?.assisted !== true && e.evidence?.quality !== 'none';
const isDimension = (x: unknown): x is AssessmentDimension => typeof x === 'string' && (ASSESSMENT_DIMENSIONS as readonly string[]).includes(x);
const isFamily = (x: unknown): x is ExerciseFamily => typeof x === 'string' && (EXERCISE_FAMILIES as readonly string[]).includes(x);
const nonEmpty = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const validInstant = (x: unknown): x is string => typeof x === 'string' && !Number.isNaN(Date.parse(x));
const stableJson = (value: unknown): string => JSON.stringify(value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'seq' && key !== 'recordedAt')) : value, (_key, nested) => nested && typeof nested === 'object' && !Array.isArray(nested)
  ? Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : nested);

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
    if (opts.learnerId !== undefined && e.learnerId !== opts.learnerId) continue;
    if (opts.languageId !== undefined && e.languageId !== opts.languageId) continue;
    if (Number.isNaN(Date.parse(e.at))) { ignore(e, 'unparseable timestamp'); continue; }
    orderable.push(e);
  }
  const learnerIds = new Set(orderable.map(e => e.learnerId));
  if (opts.learnerId === undefined && learnerIds.size > 1) throw new RangeError('foldDeck requires learnerId when events contain multiple learners');
  if (opts.languageId === undefined) {
    const languagesByCard = new Map<string, Set<string>>();
    for (const e of orderable) {
      const cardId = e.subject?.cardId;
      if (!cardId) continue;
      const languages = languagesByCard.get(cardId) ?? new Set<string>();
      languages.add(e.languageId); languagesByCard.set(cardId, languages);
    }
    if ([...languagesByCard.values()].some(languages => languages.size > 1)) throw new RangeError('foldDeck requires languageId when a card ID appears in multiple languages');
  }
  const canonical = new Map<string, GoEvent>();
  const conflictingIds = new Set<string>();
  for (const e of orderable) {
    const previous = canonical.get(e.id);
    if (!previous) canonical.set(e.id, e);
    else if (stableJson(e) !== stableJson(previous)) {
      conflictingIds.add(e.id);
      if (stableJson(e) < stableJson(previous)) canonical.set(e.id, e);
    }
  }
  orderable.splice(0, orderable.length, ...canonical.values());
  orderable.splice(0, orderable.length, ...orderAtAndCausality(orderable));

  const retracted = new Set(retractedReviewIds(orderable.filter(e => !conflictingIds.has(e.id))));
  const reviewGroups = new Map<string, GoEvent[]>();
  for (const e of orderable) { const id=e.subject?.cardId; if(id && (REVIEW_EVENT_KINDS as readonly string[]).includes(e.kind)) { const group=reviewGroups.get(id)??[];group.push(e);reviewGroups.set(id,group); } }
  const convergence = new Map([...reviewGroups].map(([id,events]) => [id,classifyReviewConvergence(events,retracted,conflictingIds)]));

  const items = new Map<string, DeckItem>();
  const seen = new Set<string>();

  for (const e of orderable) {
    if (seen.has(e.id)) continue; // the same event delivered twice (retries, two sync paths)
    seen.add(e.id);
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    if (e.correctionOf) {
      if (conflictingIds.has(e.id)) { ignore(e, 'conflicting duplicate event ID'); continue; }
      if (retracted.has(e.correctionOf)) continue;
      ignore(e, 'invalid review correction: target, kind, identity, card or timestamp did not match');
      continue;
    }
    const itemId = e.subject?.cardId;
    if (conflictingIds.has(e.id) && !(REVIEW_EVENT_KINDS as readonly string[]).includes(e.kind)) { ignore(e, 'conflicting duplicate event ID'); continue; }

    if (e.kind === 'CardAdded') {
      if (conflictingIds.has(e.id)) { ignore(e, 'conflicting duplicate event ID'); continue; }
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
        if (payload.lifecycle === 'create') { ignore(e, 'duplicate create event does not reactivate an existing card'); continue; }
        if (existing.schedulingIssue) { existing.status='suspended'; existing.suspendedReason=existing.schedulingIssue; ignore(e,'cannot resume while a required historical scheduler profile is unsupported'); continue; }
        if (payload.lifecycle === 'facts-repaired') {
          const invalidationId = payload.invalidationEventId;
          const invalidation = typeof invalidationId === 'string' ? orderable.find(x => x.id === invalidationId && x.kind === 'ReviewItemInvalidated') : undefined;
          const originalReviewId = invalidation?.payload.reviewEventId;
          const originalReview = typeof originalReviewId === 'string' ? orderable.find(x => x.id === originalReviewId && REVIEW_EVENT_KINDS.includes(x.kind as EventKind)) : undefined;
          const withdrawal = originalReview ? orderable.find(x => x.correctionOf === originalReview.id && x.kind === originalReview.kind
            && sameCardScope(x, originalReview) && x.enrolmentId === originalReview.enrolmentId && x.varietyId === originalReview.varietyId
            && x.payload.rating === null && x.payload.challenged === true && x.evidence?.quality === 'none'
            && Date.parse(x.at) > Date.parse(originalReview.at) && Date.parse(x.at) <= Date.parse(invalidation!.at)) : undefined;
          const oldFingerprint = originalReview?.payload.assessmentFingerprint;
          const repairFingerprint = payload.verifiedAssessmentFingerprint;
          const repairIndex = orderable.indexOf(e), invalidationIndex = invalidation ? orderable.indexOf(invalidation) : -1;
          // The sorted fold order resolves equal timestamps. Preserve controls applied after
          // invalidation and before repair, including controls ordered first within the repair instant.
          const controlledAfterInvalidation = !!invalidation && orderable.some((x, i) => i > invalidationIndex && i < repairIndex
            && sameCardScope(x, invalidation) && x.enrolmentId === invalidation.enrolmentId && x.varietyId === invalidation.varietyId
            && (x.kind === 'CardRemoved' || x.kind === 'CardAdded' && x.payload.lifecycle !== 'facts-repaired' && x.payload.lifecycle !== 'create'));
          if (!existing.invalidatedAt || existing.invalidatedBy !== invalidationId || !invalidation || invalidation.subject.cardId !== itemId
            || !isFamily(payload.family) || FAMILY_DIMENSION[payload.family] !== existing.dimension
            || invalidation.learnerId !== e.learnerId || invalidation.enrolmentId !== e.enrolmentId || invalidation.languageId !== e.languageId
            || invalidation.varietyId !== e.varietyId
            || !Number.isFinite(Date.parse(e.at)) || Date.parse(e.at) <= Date.parse(invalidation.at)
            || !originalReview || originalReview.subject.cardId !== itemId || originalReview.learnerId !== e.learnerId
            || originalReview.enrolmentId !== e.enrolmentId || originalReview.languageId !== e.languageId || originalReview.varietyId !== invalidation.varietyId
            || Date.parse(originalReview.at) > Date.parse(invalidation.at) || !withdrawal
            || typeof oldFingerprint !== 'string' || !FINGERPRINT_RE.test(oldFingerprint)
            || typeof repairFingerprint !== 'string' || !FINGERPRINT_RE.test(repairFingerprint) || repairFingerprint === oldFingerprint
            || !Array.isArray(payload.sourceFactIds) || !payload.sourceFactIds.length || payload.sourceFactIds.some(id => typeof id !== 'string' || !id.length)) {
            ignore(e, 'facts repair did not prove changed, validated facts for the current invalidation'); continue;
          }
          delete existing.invalidatedAt; delete existing.invalidatedBy;
          if (!controlledAfterInvalidation) { existing.status = 'active'; delete existing.snoozedUntil; delete existing.suspendedReason; }
          else if (existing.status !== 'suspended') delete existing.suspendedReason;
          else existing.suspendedReason ??= 'suspended by learner';
          existing.family = payload.family;
          if (reason && !existing.reasons.includes(reason)) existing.reasons.push(reason);
          continue;
        }
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
      item.invalidatedAt = e.at;
      item.invalidatedBy = e.id;
      delete item.snoozedUntil;
      const review = typeof payload.reviewEventId === 'string' ? orderable.find(x => x.id === payload.reviewEventId && REVIEW_EVENT_KINDS.includes(x.kind as EventKind)) : undefined;
      const withdrawal = review ? orderable.find(x => x.correctionOf === review.id && x.kind === review.kind && sameCardScope(x, review)
        && x.payload.rating === null && x.payload.challenged === true && Date.parse(x.at) <= Date.parse(e.at)) : undefined;
      item.suspendedReason = !review || !withdrawal || typeof review.payload.assessmentFingerprint !== 'string' || !FINGERPRINT_RE.test(review.payload.assessmentFingerprint)
        ? 'this invalidation predates verified facts provenance; contact the pack maintainer'
        : nonEmpty(payload.reason) ? payload.reason : 'analysis-invalidated';
      continue;
    }

    if ((REVIEW_EVENT_KINDS as readonly string[]).includes(e.kind)) {
      let item = nonEmpty(itemId) ? items.get(itemId) : undefined;
      // Recover only self-consistent, canonical old vocabulary reviews. This is a
      // projection repair; no historical event is rewritten or invented.
      if (!item && nonEmpty(itemId) && isSchedulableReview(e) && isDimension(payload.assessmentDimension)
        && isFamily(payload.family) && FAMILY_DIMENSION[payload.family] === payload.assessmentDimension && e.subject?.itemIds?.length === 1) {
        const unitId = e.subject.itemIds[0], expected = itemIdFor(unitId, payload.assessmentDimension);
        const prefix = unitId.split(':')[0], kind = prefix === 'lemma' ? 'lexeme' : prefix;
        const validUnitId = unitId.split(':').length >= 2 && unitId.split(':').every(part => part.length > 0);
        if (validUnitId && itemId === expected && ['lexeme','form','multiword','construction'].includes(kind)) {
          item = { itemId, unitId, unitKind: kind, languageId: e.languageId, dimension: payload.assessmentDimension, family: payload.family,
            addedAt: e.at, addedBy: 'intake', reasons: ['Recovered a canonical legacy review without CardAdded.'],
            schedule: scheduler.newState(e.at), history: [], status: 'active' };
          items.set(itemId,item); ignore(e,'recovered missing canonical card creation from legacy review');
        }
      }
      if (!item) { ignore(e, 'review of an item that has not been added (yet, in event time)'); continue; }
      if (!isSchedulableReview(e)) { out.unscored[item.itemId] = (out.unscored[item.itemId] ?? 0) + 1; continue; }
      const gradeRating = payload.rating as Rating;
      const policy = convergence.get(item.itemId);
      let excluded = conflictingIds.has(e.id) ? 'conflicting duplicate event ID'
        : retracted.has(e.id) ? 'review was retracted'
        : payload.expectedPreviousReviewId !== undefined && !policy?.effectiveIds.has(e.id)
          ? policy?.excludedReasons.get(e.id) ?? 'causal predecessor chain is unresolved' : undefined;
      if (!excluded && payload.expectedPreviousReviewId !== undefined) {
        const parent = payload.expectedPreviousReviewId;
        const excludedParent = item.history.find(h => h.eventId === parent && h.scheduleExcluded && !h.retracted);
        if (excludedParent) excluded = 'causal predecessor excluded: ' + String(parent);
      }
      if (!excluded && payload.expectedPreviousReviewId !== undefined) {
        const expected = policy?.resolvedParents.get(e.id) ?? null;
        const previous = [...item.history].reverse().find(h => !h.retracted && !h.scheduleExcluded && !h.conflict)?.eventId ?? null;
        if (expected !== previous) excluded = 'stale predecessor: expected ' + String(expected) + ', effective head is ' + String(previous);
      }
      const resolved = schedulerForReviewProfile(payload.schedulerProfile, scheduler);
      if ('error' in resolved && !excluded) { excluded = resolved.error; item.status = 'suspended'; item.suspendedReason = resolved.error; item.schedulingIssue = resolved.error; }
      let next = item.schedule;
      // Explicit practice (a saved deck, selected words, Repeat this batch) of a card that is not yet due: the answer stays in the causal
      // chain and in the Repository's evidence, but a success does not move the schedule (no learning step is skipped and no interval
      // grows from a repetition minutes apart); a failure is a lapse wherever it happens. The first review of a fresh card, and any
      // review at or after the due time, schedules as usual: one memory history, actual elapsed time (the owner's brief, 2026-10-29).
      const earlyPractice = !excluded && isExplicitIntent(payload.practiceIntent) && gradeRating !== 1
        && item.history.some(h => !h.retracted && !h.scheduleExcluded && !h.conflict) && Date.parse(e.at) < Date.parse(item.schedule.due);
      if (!excluded && !earlyPractice && 'scheduler' in resolved) {
        try { next = resolved.scheduler.review(item.schedule, gradeRating, e.at); }
        catch (error) { excluded = 'review cannot be scheduled: ' + (error instanceof Error ? error.message : String(error)); }
      }
      const entry: ReviewLogEntry = { at: e.at, rating: gradeRating, outcome: outcomeOf(payload), deviceId: e.producer?.deviceId ?? 'unknown',
        exerciseId: nonEmpty(payload.exerciseId) ? payload.exerciseId : e.id, family: isFamily(payload.family) ? payload.family : item.family,
        elapsedDays: next.elapsedDays, eventId: e.id, ...(retracted.has(e.id) ? { retracted: true } : {}),
        ...(earlyPractice ? { earlyPractice: true } : {}),
        ...(excluded ? { scheduleExcluded: excluded, conflict: !retracted.has(e.id) } : {}) };
      item.history.push(entry);
      if (excluded) { if (!retracted.has(e.id)) ignore(e,excluded); }
      else { item.schedule = next; const note = policy?.rebasedNotes.get(e.id); if(note)ignore(e,note); }
    }

  }

  for (const item of items.values()) {
    if(item.schedulingIssue || item.invalidatedAt){ item.status='suspended'; item.suspendedReason=item.schedulingIssue??item.suspendedReason??'analysis-invalidated; a verified facts repair is required'; delete item.snoozedUntil; }
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

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !['seq','recordedAt','createdAt','updatedAt','fetchedAt','packVersion','version','provenance'].includes(key))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, nested]) => [key, canonical(nested)]));
  return value;
}

/** Stable SHA-256 implementation, so assessment can still be recorded in non-secure legacy contexts. */
function sha256(bytes: Uint8Array): string {
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bitLength=bytes.length*8, paddedLength=Math.ceil((bytes.length+9)/64)*64, data=new Uint8Array(paddedLength); data.set(bytes); data[bytes.length]=0x80;
  const view=new DataView(data.buffer); view.setUint32(paddedLength-8,Math.floor(bitLength/0x100000000),false);view.setUint32(paddedLength-4,bitLength>>>0,false);
  const rotr=(x:number,n:number)=>(x>>>n)|(x<<(32-n));
  for(let offset=0;offset<paddedLength;offset+=64){const w=new Uint32Array(64);for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4,false);
    for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2],s0=rotr(a,7)^rotr(a,18)^(a>>>3),s1=rotr(b,17)^rotr(b,19)^(b>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}
    let [a,b,c,d,e,f,g,z]=h;
    for(let i=0;i<64;i++){const s1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g),t1=(z+s1+ch+K[i]+w[i])>>>0,s0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0;
      z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    h[0]=(h[0]+a)>>>0;h[1]=(h[1]+b)>>>0;h[2]=(h[2]+c)>>>0;h[3]=(h[3]+d)>>>0;h[4]=(h[4]+e)>>>0;h[5]=(h[5]+f)>>>0;h[6]=(h[6]+g)>>>0;h[7]=(h[7]+z)>>>0;
  }
  return h.map(x=>x.toString(16).padStart(8,'0')).join('');
}

/** Fingerprint the assessment target, stimulus, and grading key. Cosmetic text and distractors cannot prove key repair. */
export async function assessmentFingerprint(exercise: Exercise): Promise<string> {
  const prompt=exercise.prompt;
  const content={family:exercise.family,target:exercise.target,prompt:{stimulusText:prompt.stimulusText,meaning:prompt.meaning,sentenceWithGap:prompt.sentenceWithGap},
    answerKey:{accepted:[...exercise.answerKey.accepted].sort(),normalization:exercise.answerKey.normalization,features:exercise.answerKey.features}};
  return `sha256:${sha256(new TextEncoder().encode(JSON.stringify(canonical(content))))}`;
}

/** Backwards-compatible name for hosts: the digest is intentionally assessment-content based. */
export async function factsFingerprint(_facts: UnitFacts, exercise: Exercise): Promise<string> { return assessmentFingerprint(exercise); }

export interface VerifiedFactsRepairInput extends EventBase {
  item: DeckItem;
  invalidationEvent: GoEvent;
  events: readonly GoEvent[];
  currentFacts: UnitFacts;
  validatedExercise: Exercise;
}

/** Build an explicit, provenance-checked reactivation event; plain Resume/CardAdded cannot clear invalidation. */
export async function buildVerifiedFactsRepairEvent(x: VerifiedFactsRepairInput): Promise<GoEvent> {
  const fail = (message: string): never => { throw new RangeError(message); };
  const invalidation = x.invalidationEvent;
  if (!Number.isFinite(Date.parse(invalidation.at))) fail('the invalidation timestamp is invalid');
  if (!Number.isFinite(Date.parse(x.at))) fail('the repair timestamp is invalid');
  if (!x.events.some(e => e.id === invalidation.id && e.kind === 'ReviewItemInvalidated' && e.at === invalidation.at
    && e.learnerId === invalidation.learnerId && e.enrolmentId === invalidation.enrolmentId && e.languageId === invalidation.languageId
    && e.varietyId === invalidation.varietyId && e.subject.cardId === invalidation.subject.cardId && e.payload.reviewEventId === invalidation.payload.reviewEventId))
    fail('the supplied invalidation is not present in this card history');
  if (invalidation.kind !== 'ReviewItemInvalidated' || invalidation.subject.cardId !== x.item.itemId
    || invalidation.learnerId !== x.learnerId || invalidation.enrolmentId !== x.enrolmentId || invalidation.languageId !== x.languageId
    || invalidation.varietyId !== x.varietyId || invalidation.varietyId !== x.item.varietyId
    || !x.item.invalidatedAt || x.item.invalidatedBy !== invalidation.id || Date.parse(x.at) <= Date.parse(invalidation.at)) fail('this card is not suspended by the supplied invalidation or repair time does not follow it');
  const reviewId = invalidation.payload.reviewEventId;
  if (typeof reviewId !== 'string') fail('this invalidation predates verified facts provenance; contact the pack maintainer');
  const original = x.events.find(e => e.id === reviewId && REVIEW_EVENT_KINDS.includes(e.kind as EventKind));
  const oldFingerprint = original?.payload.assessmentFingerprint;
  const withdrawal = original && x.events.find(e => e.correctionOf === original.id && e.kind === original.kind && sameCardScope(e, original)
    && e.enrolmentId === original.enrolmentId && e.varietyId === original.varietyId && e.payload.rating === null && e.payload.challenged === true
    && e.evidence?.quality === 'none' && Number.isFinite(Date.parse(e.at)) && Date.parse(e.at) > Date.parse(original.at) && Date.parse(e.at) <= Date.parse(invalidation.at));
  if (!original || !Number.isFinite(Date.parse(original.at)) || original.subject.cardId !== x.item.itemId || original.learnerId !== x.learnerId || original.enrolmentId !== x.enrolmentId
    || original.languageId !== x.languageId || original.varietyId !== invalidation.varietyId || Date.parse(original.at) > Date.parse(invalidation.at)
    || !withdrawal || !Number.isFinite(Date.parse(withdrawal.at)) || Date.parse(withdrawal.at) <= Date.parse(original.at)
    || typeof oldFingerprint !== 'string' || !FINGERPRINT_RE.test(oldFingerprint))
    fail('the challenged question has no verifiable facts fingerprint or matching withdrawal; contact the pack maintainer');
  const ex = x.validatedExercise;
  const validation = validateExercise(ex);
  if (!ex.validation.ok || !validation.ok || !ex.eligibility.eligible || !isFamily(ex.family) || ex.target.unitId !== x.item.unitId || ex.target.unitKind !== x.item.unitKind || ex.target.languageId !== x.item.languageId
    || ex.target.varietyId !== x.item.varietyId || (x.currentFacts.unit.varietyId !== undefined && x.currentFacts.unit.varietyId !== x.item.varietyId)
    || ex.target.dimension !== x.item.dimension || FAMILY_DIMENSION[ex.family] !== x.item.dimension || !ex.builtFrom.facts.length || x.currentFacts.unit.unitId !== x.item.unitId
    || x.currentFacts.unit.languageId !== x.item.languageId || x.currentFacts.unit.kind !== x.item.unitKind || x.currentFacts.status !== 'verified' || x.currentFacts.unit.status !== 'verified')
    fail('current verified facts do not support a valid exercise for this card');
  const fingerprint = await factsFingerprint(x.currentFacts, ex);
  if (fingerprint === oldFingerprint) fail('the current verified assessment key has not changed since this question was invalidated');
  const event = buildCardAdded({ ...x, unitId: x.item.unitId, unitKind: x.item.unitKind, dimension: x.item.dimension,
    family: ex.family, addedBy: x.item.addedBy, itemId: x.item.itemId, reason: 'verified facts repair' });
  event.id = `goreview:facts-repaired:${x.item.itemId}:${invalidation.id}:${x.at}:${x.deviceId}`;
  event.dedupeKey = `goreview:facts-repaired:${x.item.itemId}:${invalidation.id}:${x.at}`;
  event.payload.lifecycle = 'facts-repaired';
  event.payload.invalidationEventId = invalidation.id;
  event.payload.verifiedAssessmentFingerprint = fingerprint;
  event.payload.sourceFactIds = [...new Set(ex.builtFrom.facts)];
  return assertValidEvent(event);
}

/** Throws when a built event would be refused at the Repository's write boundary. */
export function assertValidEvent(e: GoEvent): GoEvent {
  const issues = validateEvent(e);
  if (issues.length) throw new Error(`invalid event ${e.id}: ${issues.map((x) => `${x.path} ${x.message}`).join('; ')}`);
  return e;
}
