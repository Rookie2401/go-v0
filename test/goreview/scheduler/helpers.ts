import type { EventKind, GoEvent } from '../../../packages/repository-contract/src';
import { buildCardAdded } from '../../../packages/goreview/src/scheduler';
import type { AssessmentDimension, ExerciseFamily } from '../../../packages/goreview/src/types';

export const LEARNER = 'learner-1';
export const ENROL = 'enrol-grc';

export const DAY = 86_400_000;
export const T0 = '2026-03-01T09:00:00.000Z';
export const at = (offsetMs: number, from = T0): string => new Date(Date.parse(from) + offsetMs).toISOString();

export function added(unitId: string, when: string, o: { dimension?: AssessmentDimension; family?: ExerciseFamily; languageId?: string; deviceId?: string; reason?: string; addedBy?: 'intake' | 'learner' } = {}): GoEvent {
  return buildCardAdded({
    learnerId: LEARNER, enrolmentId: ENROL, languageId: o.languageId ?? 'grc', at: when, deviceId: o.deviceId ?? 'dev-A',
    unitId, unitKind: 'lexeme', dimension: o.dimension ?? 'written-recognition', family: o.family ?? 'written-recognition',
    addedBy: o.addedBy ?? 'intake', ...(o.reason ? { reason: o.reason } : {}),
  });
}

let seq = 0;
/** A review-family event as GoReview's evidence builder would write it (rating may be null/absent: an unscored result). */
export function reviewed(itemId: string, when: string, rating: 1 | 2 | 3 | 4 | null | undefined, o: { kind?: Extract<EventKind, 'CardReviewed' | 'AssessmentAnswered' | 'ListeningAssessed'>; deviceId?: string; languageId?: string; extra?: Record<string, unknown> } = {}): GoEvent {
  const kind = o.kind ?? 'CardReviewed';
  const base: Record<string, unknown> =
    kind === 'CardReviewed' ? { cardKind: 'recognition', grade: 'good', correct: true, hinted: false }
    : kind === 'AssessmentAnswered' ? { constructionId: 'c1', task: 'apply', correct: true, hinted: false }
    : { stimulus: 'word', voice: 'synthetic', answerShownBefore: false, correct: true, responseMode: 'choice' };
  return {
    id: `rev-${++seq}-${when}`, v: 2, learnerId: LEARNER, enrolmentId: ENROL, languageId: o.languageId ?? 'grc', at: when,
    producer: { app: 'gopractice-review', version: '0.1.0', deviceId: o.deviceId ?? 'dev-A' },
    kind, subject: { cardId: itemId }, payload: { ...base, ...(rating !== undefined ? { rating } : {}), ...o.extra },
  };
}

/** Deterministic shuffle (mulberry32), so a failing permutation is reproducible. */
export function shuffled<T>(xs: readonly T[], seed: number): T[] {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}
