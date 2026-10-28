import { effectiveReviewEvents, selectReviewEvidenceEvents, type GoEvent } from '../../../repository-contract/src';
import type { DeckItem, ExerciseFamily } from '../types';
export type RemediationReason = 'failed-retrieval' | 'productive-retrieval-difficulty' | 'morphological-difficulty'
  | 'contextual-difficulty' | 'listening-difficulty' | 'repeated-failure';
export interface RemediationCandidate { itemId: string; unitId: string; failureEventId: string; failures: number; repairRequired: boolean; reasons: RemediationReason[]; studiedAt?: string; readyAt?: string; ready: boolean; needsStudy: boolean }
const REVIEW = new Set(['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed']);
export const REMEDIATION_DELAY_MS = 10 * 60_000;
export interface RemediationEvidenceIndex {
  reviewsByCard: ReadonlyMap<string, readonly GoEvent[]>;
  effectiveMarkersByCard: ReadonlyMap<string, readonly GoEvent[]>;
}

/** Labels describe the target of the recorded unsuccessful exercise, not a guessed cause of the error. */
function reasonForFamily(family: ExerciseFamily | undefined): RemediationReason {
  if (family === 'meaning-to-form' || family === 'sentence-completion') return 'productive-retrieval-difficulty';
  if (family === 'audio-to-meaning' || family === 'audio-transcription') return 'listening-difficulty';
  if (family === 'morphological-identification') return 'morphological-difficulty';
  if (family === 'grammar-application' || family === 'phrase-comprehension') return 'contextual-difficulty';
  return 'failed-retrieval';
}

const isExerciseFamily = (value: unknown): value is ExerciseFamily => typeof value === 'string'
  && ['written-recognition','meaning-to-form','morphological-identification','grammar-application','sentence-completion','phrase-comprehension','audio-to-meaning','audio-transcription'].includes(value);
/** Classify global evidence once, then index it by card for the whole planning pass. */
export function indexRemediationEvidence(events: readonly GoEvent[], selectedInput?: readonly GoEvent[]): RemediationEvidenceIndex {
  const reviewsByCard = new Map<string, GoEvent[]>(), effectiveMarkersByCard = new Map<string, GoEvent[]>();
  const selectedReviews = (selectedInput ?? selectReviewEvidenceEvents(events).events)
    .filter((e) => REVIEW.has(e.kind))
    .sort((a,b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
  for (const e of selectedReviews) if (e.subject?.cardId) (reviewsByCard.get(e.subject.cardId) ?? reviewsByCard.set(e.subject.cardId, []).get(e.subject.cardId)!).push(e);
  for (const e of effectiveReviewEvents([...events])) {
    if (e.kind !== 'PreferenceChanged' || e.payload.key !== 'goreview.remediation') continue;
    const value = e.payload.value as { cardId?: string } | undefined;
    if (value?.cardId) (effectiveMarkersByCard.get(value.cardId) ?? effectiveMarkersByCard.set(value.cardId, []).get(value.cardId)!).push(e);
  }
  return { reviewsByCard, effectiveMarkersByCard };
}

/** A projection of shared evidence, never a batch-local list. Corrections and excluded schedule branches do not create learner weaknesses. */
export function remediationBacklog(deck: readonly DeckItem[], events: readonly GoEvent[], now: string, index = indexRemediationEvidence(events)): RemediationCandidate[] {
  const t = Date.parse(now), out: RemediationCandidate[] = [];
  for (const item of deck) {
    if (item.invalidatedAt) continue;
    const reviews = (index.reviewsByCard.get(item.itemId) ?? []).filter(e => e.languageId === item.languageId
      && typeof e.payload.rating === 'number' && [1,2,3,4].includes(e.payload.rating)
      && !['invalid-question','ambiguous','unable-to-grade'].includes(String(e.payload.outcome)) && e.payload.challenged !== true
      && e.payload.audioFailed !== true && e.payload.hinted !== true && e.payload.answerShownBefore !== true && e.payload.transcriptShownBefore !== true && e.payload.retrievalAttempted !== false
      && !e.evidence?.assisted && e.evidence?.quality !== 'none' && Date.parse(e.at) <= t)
      .sort((a,b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
    const last = reviews.at(-1);
    if (!last) continue;
    const failure = [...reviews].reverse().find(e => Number(e.payload.rating) === 1 || e.payload.correct === false);
    if (!failure) continue;
    const failures = reviews.slice(-10).filter(e => e.payload.rating === 1).length;
    const repairRequired = failures >= 5;
    const ordinarilyUnresolved = Number(last.payload.rating) === 1 || last.payload.correct === false;
    if (!ordinarilyUnresolved && !repairRequired) continue;
    const marks = (index.effectiveMarkersByCard.get(item.itemId) ?? []).filter(e => {
      const value = e.payload.value as { cardId?: string; action?: string; failureEventId?: string } | undefined;
      return e.kind === 'PreferenceChanged' && e.payload.key === 'goreview.remediation' && e.learnerId === failure.learnerId
        && e.languageId === failure.languageId && value?.cardId === item.itemId && value.action === 'studied' && value.failureEventId === failure.id
        && Date.parse(e.at) >= Date.parse(failure.at) && Date.parse(e.at) <= t;
    }).sort((a,b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
    const studiedAt = marks.at(-1)?.at, readyAt = studiedAt ? new Date(Date.parse(studiedAt) + REMEDIATION_DELAY_MS).toISOString() : undefined;
    const ready = !!readyAt && t >= Date.parse(readyAt);
    const independentlyResolved = repairRequired && !ordinarilyUnresolved && readyAt
      && reviews.some(e => Date.parse(e.at) >= Date.parse(readyAt) && (e.payload.rating === 3 || e.payload.rating === 4)
        && e.payload.correct === true && (e.payload.outcome === undefined || e.payload.outcome === 'correct')
        && (e.evidence?.quality === 'moderate' || e.evidence?.quality === 'strong')
        && e.payload.hinted !== true && e.payload.answerShownBefore !== true && e.payload.transcriptShownBefore !== true && e.payload.retrievalAttempted !== false);
    if (independentlyResolved) continue;
    const loggedFamily = item.history.find(row => row.eventId === failure.id)?.family;
    const eventFamily = isExerciseFamily(failure.payload.family) ? failure.payload.family : undefined;
    const reasons: RemediationReason[] = [reasonForFamily(eventFamily ?? loggedFamily)];
    // Count repeated failures as observed. Do not call them "confusion" without a distinct response signal.
    if (failures >= 2) reasons.push('repeated-failure');
    out.push({ itemId: item.itemId, unitId: item.unitId, failureEventId: failure.id, failures, repairRequired, reasons,
      ...(studiedAt ? { studiedAt, readyAt } : {}), ready, needsStudy: !studiedAt });
  }
  return out;
}

export interface RemediationStudyInput { learnerId: string; enrolmentId: string; languageId: string; varietyId?: string; itemId: string; failureEventId: string; at: string; deviceId: string }
/** Persist an instruction-study marker. It records no answer, rating, or knowledge evidence. */
export function buildRemediationStudiedEvent(x: RemediationStudyInput): GoEvent {
  if (!Number.isFinite(Date.parse(x.at)) || !x.itemId || !x.failureEventId) throw new RangeError('a remediation study marker needs a card, failure event, and valid timestamp');
  const key = `goreview:remediation:${x.itemId}:${x.failureEventId}:${x.at}`;
  return {
    id: `${key}:${x.deviceId}`, v: 2, learnerId: x.learnerId, enrolmentId: x.enrolmentId, languageId: x.languageId,
    ...(x.varietyId !== undefined ? { varietyId: x.varietyId } : {}), at: x.at,
    producer: { app: 'gopractice-review', version: '0.1.0', deviceId: x.deviceId, surface: 'review-remediation' },
    kind: 'PreferenceChanged', subject: { cardId: x.itemId }, payload: { key: 'goreview.remediation', origin: 'explicit', value: { cardId: x.itemId, action: 'studied', failureEventId: x.failureEventId } },
    dedupeKey: key, evidence: { quality: 'none' },
  };
}
