import type { GoEvent } from './index';

export const REVIEW_GRADE_KINDS = ['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed'] as const;
const ratingOf = (e: GoEvent): unknown => ((e.payload && typeof e.payload === 'object' ? e.payload : {}) as Record<string, unknown>).rating;
const isReviewGrade = (e: GoEvent): boolean => (REVIEW_GRADE_KINDS as readonly string[]).includes(e.kind) &&
  Number.isFinite(Date.parse(e.at)) && typeof e.subject?.cardId === 'string' && e.subject.cardId.length > 0 &&
  Number.isInteger(ratingOf(e)) && (ratingOf(e) as number) >= 1 && (ratingOf(e) as number) <= 4 && e.correctionOf === undefined;
const sameItems = (a: string[] = [], b: string[] = []): boolean => {
  const x = [...new Set(a)].sort(); const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};
const compareEvent = (a: GoEvent, b: GoEvent): number => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * A correction retracts one original grade for scheduling/evidence; it never edits the immutable event log.
 * Invalid, chained, mismatched and duplicate corrections have no effect. The earliest valid correction per target
 * is canonical, so a later duplicate cannot retract a correction or otherwise change the result. All correction
 * events are excluded from the effective stream; invalid ones remain only in immutable history.
 */
export function effectiveReviewEvents(events: GoEvent[]): GoEvent[] {
  const byEventId = new Map<string, GoEvent>();
  for (const e of events) {
    const current = byEventId.get(e.id);
    if (!current || JSON.stringify(e) < JSON.stringify(current)) byEventId.set(e.id, e);
  }
  const unique = [...byEventId.values()];
  const grades = unique.filter(isReviewGrade);
  const byId = new Map(grades.map((e) => [e.id, e]));
  const firstCorrection = new Map<string, GoEvent>();
  const corrections = unique.filter((e) => e.correctionOf !== undefined).sort(compareEvent);
  for (const c of corrections) {
    const target = byId.get(c.correctionOf!);
    const cp = (c.payload && typeof c.payload === 'object' ? c.payload : {}) as Record<string, unknown>;
    if (!target || c.id === target.id || !Number.isFinite(Date.parse(c.at)) || c.kind !== target.kind || c.learnerId !== target.learnerId || c.enrolmentId !== target.enrolmentId ||
        c.languageId !== target.languageId || c.varietyId !== target.varietyId || c.subject?.cardId !== target.subject?.cardId || !c.subject?.cardId ||
        !c.subject?.itemIds?.length || !target.subject?.itemIds?.length || !sameItems(c.subject.itemIds, target.subject.itemIds) ||
        Date.parse(c.at) <= Date.parse(target.at) || cp.rating !== null || cp.challenged !== true || c.evidence?.quality !== 'none') continue;
    if (!firstCorrection.has(target.id)) firstCorrection.set(target.id, c);
  }
  const retracted = new Set(firstCorrection.keys());
  const correctionEventIds = new Set(corrections.map((e) => e.id));
  return unique.filter((e) => !retracted.has(e.id) && !correctionEventIds.has(e.id));
}

/** The review ids removed by {@link effectiveReviewEvents}; handy for explainable scheduler/history views. */
export function retractedReviewIds(events: GoEvent[]): string[] {
  const unique = new Map<string, GoEvent>();
  for (const e of events) if (!unique.has(e.id) || JSON.stringify(e) < JSON.stringify(unique.get(e.id))) unique.set(e.id, e);
  const effective = new Set(effectiveReviewEvents([...unique.values()]).map((e) => e.id));
  return [...unique.values()].filter((e) => isReviewGrade(e) && !effective.has(e.id)).map((e) => e.id).sort();
}
