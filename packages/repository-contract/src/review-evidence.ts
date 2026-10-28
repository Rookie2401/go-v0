import type { GoEvent } from './index';
import { classifyReviewEvents, isValidReviewClaim } from './review-classification';
import { effectiveReviewEvents, retractedReviewIds } from './review-corrections';

const REVIEW_KINDS = new Set(['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed']);

/** Stable semantic identity for a review event across storage wrappers and JSON object-key ordering. */
export function canonicalReviewEventKey(event: GoEvent): string {
  const normalize = (value: unknown, root = false): unknown => {
    if (Array.isArray(value)) return value.map((item) => normalize(item, false));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !root || (key !== 'seq' && key !== 'recordedAt'))
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, nested]) => [key, normalize(nested, false)]));
  };
  return JSON.stringify(normalize(event, true));
}

export interface ReviewEvidenceSelection {
  /** Live, validated legacy/canonical/concurrent review events plus separately selected assisted claims. */
  events: GoEvent[];
  canonicalIds: Set<string>;
  independentSiblingIds: Set<string>;
  /** Causally located but assisted events, retained only for assistedRecognition evidence; never causal parents. */
  assistedIds: Set<string>;
  excludedReasons: Map<string, string>;
  rebasedNotes: Map<string, string>;
}

/**
 * Select review evidence from the complete immutable history. Exact duplicate ids collapse; conflicting variants
 * of an id are excluded, corrections are evaluated before filtering so retracted predecessors remain available to
 * rebase descendants, and causal sibling/concurrency rules come from the same contract classifier as FSRS.
 * Legacy rows without a predecessor field retain their prior sequential compatibility. Non-review events are not
 * returned, and this helper never mutates its input or the raw event log.
 */
export function selectReviewEvidenceEvents(rawEvents: readonly GoEvent[]): ReviewEvidenceSelection {
  const variants = new Map<string, Map<string, GoEvent>>();
  for (const event of rawEvents) {
    const serialized = canonicalReviewEventKey(event);
    const byShape = variants.get(event.id) ?? new Map<string, GoEvent>();
    byShape.set(serialized, event);
    variants.set(event.id, byShape);
  }
  const conflictingIds = new Set([...variants].filter(([, shapes]) => shapes.size > 1).map(([id]) => id));
  const unique = [...variants]
    .filter(([id]) => !conflictingIds.has(id))
    .map(([, shapes]) => [...shapes.values()][0]!)
    .sort(compareEvent);
  const reviews = unique.filter((event) => REVIEW_KINDS.has(event.kind));
  const retracted = new Set(retractedReviewIds(unique));
  const live = new Set(effectiveReviewEvents(unique).map((event) => event.id));
  const classified = classifyReviewEvents(reviews, retracted, conflictingIds);
  // Assisted answers remain weak assistedRecognition evidence, but still need a valid causal place in review
  // history. Classify a temporary scheduling-shaped copy (without changing the event or its evidence note) so an
  // assisted claim can be selected causally while it never advances FSRS from the original payload.
  const assisted = reviews.filter(hasAssistance);
  const assistedClaims = classifyReviewEvents(reviews.map((event) => ({
    ...event,
    payload: { ...event.payload, hinted: false, answerShownBefore: false, transcriptShownBefore: false },
    evidence: event.evidence ? { ...event.evidence, assisted: false } : undefined,
  })), retracted, conflictingIds);
  const canonicalIds = new Set([...classified.effectiveIds].filter((id) => live.has(id)));
  const independentSiblingIds = new Set([...classified.independentSiblingIds].filter((id) => live.has(id)));
  const assistedIds = new Set([...assistedClaims.effectiveIds, ...assistedClaims.independentSiblingIds]
    .filter((id) => live.has(id) && assisted.some((event) => event.id === id)));
  const selectedIds = new Set([...canonicalIds, ...independentSiblingIds, ...assistedIds]);
  const excludedReasons = new Map([...classified.excludedReasons, ...assistedClaims.excludedReasons]);

  for (const id of conflictingIds) excludedReasons.set(id, 'conflicting duplicate event ID');

  for (const event of reviews) {
    if (conflictingIds.has(event.id)) excludedReasons.set(event.id, 'conflicting duplicate event ID');
    else if (retracted.has(event.id)) excludedReasons.set(event.id, 'review was retracted');
    else if (!live.has(event.id)) excludedReasons.set(event.id, 'review is not in the effective correction stream');
    else if (event.payload.expectedPreviousReviewId === undefined && isValidReviewClaim(event)) selectedIds.add(event.id);
  }

  const events = reviews.filter((event) => selectedIds.has(event.id)).sort(compareEvent);
  return { events, canonicalIds, independentSiblingIds, assistedIds, excludedReasons, rebasedNotes: classified.rebasedNotes };
}

function hasAssistance(event: GoEvent): boolean {
  const p = event.payload as Record<string, unknown>;
  return p.hinted === true || p.answerShownBefore === true || p.transcriptShownBefore === true || p.assisted === true ||
    p.retrievalAttempted === false || (Array.isArray(p.assistance) && p.assistance.length > 0) || event.evidence?.assisted === true;
}

function compareEvent(a: GoEvent, b: GoEvent): number {
  const delta = Date.parse(a.at) - Date.parse(b.at);
  return (Number.isFinite(delta) ? delta : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
