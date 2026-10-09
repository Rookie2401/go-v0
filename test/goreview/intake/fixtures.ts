/** Shared fixtures for the intake, planner, session and transfer tests (fakes for the sibling modules live here too). */
import type { Dimension, DimensionEstimate, GoEvent, ReviewCandidate, UnitKnowledge } from '../../../packages/repository-contract/src';
import { DIMENSIONS } from '../../../packages/repository-contract/src';
import type {
  AudioAvailability, DeckItem, ExerciseFamily, IntakeInput, IntakeOutcome, ReviewPreferences, ScheduleState, Scheduler, UnitFacts,
} from '../../../packages/goreview/src/types';
import { FAMILY_DIMENSION } from '../../../packages/goreview/src/types';

export const NOW = '2026-10-08T10:00:00.000Z';
export const LANG = 'sq';

export const prefs = (over: Partial<ReviewPreferences> = {}): ReviewPreferences => ({
  languageId: LANG, sessionMinutes: 10, maxNew: 3, desiredRetention: 0.9, includeListening: true, grammarShare: 0.3, prioritizeSaved: true, ...over,
});

export const audioOk: AudioAvailability = { available: true, eligibleForEvidence: true, reason: 'reviewed recording' };
export const audioPractice: AudioAvailability = { available: true, eligibleForEvidence: false, reason: 'synthetic device voice' };
export const audioNone: AudioAvailability = { available: false, eligibleForEvidence: false, reason: 'no voice installed' };

export const candidate = (over: Partial<ReviewCandidate> = {}): ReviewCandidate => ({
  unitId: 'form:sq:librin', kind: 'form', score: 0.7,
  reasons: [{ rule: 'looked-up-often', weight: 0.6, detail: '3 lookups this week' }, { rule: 'recently-met', weight: 0.2 }],
  targetDimension: 'readingRecognition', eligibility: { eligible: true, status: 'verified', caveats: [] }, cost: 0.2, ...over,
});

const estimate = (over: Partial<DimensionEstimate> = {}): DimensionEstimate => ({
  score: 0.3, confidence: 0.2, observations: 1, positive: 0, negative: 1, weight: 1, contexts: 1, ...over,
});

export function knowledge(unitId: string, dims: Partial<Record<Dimension, Partial<DimensionEstimate>>> = {}): UnitKnowledge {
  return {
    learnerId: 'L1', unitId, languageId: LANG,
    dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, estimate(dims[d])])) as Record<Dimension, DimensionEstimate>,
    retention: { estimate: 0.5, halfLifeDays: 3, basedOn: 'none' }, uncertainty: 0.5, modelVersion: 'test', basis: { events: 1 },
  };
}

export const scheduleState = (over: Partial<ScheduleState> = {}): ScheduleState => ({
  due: NOW, stability: 5, difficulty: 5, elapsedDays: 1, scheduledDays: 1, reps: 2, lapses: 0, phase: 'review', lastReview: '2026-10-07T10:00:00.000Z',
  algorithm: 'fake', parametersVersion: '0', ...over,
});

export const deckItem = (over: Partial<DeckItem> & { unitId?: string; family?: ExerciseFamily } = {}): DeckItem => {
  const family = over.family ?? 'written-recognition';
  const unitId = over.unitId ?? 'form:sq:librin';
  return {
    itemId: `card:${FAMILY_DIMENSION[family]}:${unitId}`, unitId, unitKind: 'form', languageId: LANG, dimension: FAMILY_DIMENSION[family], family,
    addedAt: '2026-10-01T10:00:00.000Z', addedBy: 'intake', reasons: [], schedule: scheduleState(),
    history: [{ at: '2026-10-07T10:00:00.000Z', rating: 3, outcome: 'correct', deviceId: 'D1', exerciseId: 'x', family, elapsedDays: 1 }],
    status: 'active', ...over,
  };
};

export const intakeInput = (over: Partial<IntakeInput> = {}): IntakeInput => ({
  candidate: candidate(), existing: [], audio: audioOk, saved: new Set(), preferences: prefs(), now: NOW, ...over,
});

/** A scheduler whose "retrievability" IS the stability field, so tests control ordering directly. Due = `due <= now`. */
export const fakeScheduler: Scheduler = {
  algorithm: 'fake', parametersVersion: '0', desiredRetention: 0.9,
  newState: (now) => scheduleState({ due: now, stability: 0, reps: 0, phase: 'new', lastReview: undefined }),
  review: (s, _r, now) => ({ ...s, lastReview: now, reps: s.reps + 1 }),
  retrievability: (s) => s.stability,
  isDue: (s, now) => Date.parse(s.due) <= Date.parse(now),
};

/** A due, reviewed item of one family with a chosen recall probability. */
export const dueItem = (unitId: string, recall: number, family: ExerciseFamily = 'written-recognition', over: Partial<DeckItem> = {}): DeckItem =>
  deckItem({ unitId, family, schedule: scheduleState({ stability: recall, due: '2026-10-08T09:00:00.000Z' }), ...over });

export const testNow = (unitId: string, over: Partial<ReviewCandidate> = {}, family: ExerciseFamily = 'written-recognition'): IntakeOutcome => ({
  unitId, decision: 'test-now', reasons: ['score high'], proposed: { dimension: FAMILY_DIMENSION[family], family },
  candidate: candidate({ unitId, ...over }),
});

export const facts = (unitId = 'form:sq:librin', over: Partial<UnitFacts> = {}): UnitFacts => ({
  unit: {
    unitId, kind: 'form', languageId: LANG, label: 'librin', packId: 'p', packVersion: '1', provenance: { source: 'hand-lexicon', ref: 'x', confidence: 1 },
    status: 'verified', createdAt: NOW,
  } as UnitFacts['unit'],
  relations: [], analyses: [], status: 'verified', glosses: ['the book'], constructionIds: [], featureExplanations: {}, siblingForms: [],
  exampleSentences: [], pronunciationNotes: [], ...over,
});

let counter = 0;
export function ev(kind: GoEvent['kind'], payload: Record<string, unknown>, over: Partial<GoEvent> = {}): GoEvent {
  counter += 1;
  return {
    id: `e${String(counter).padStart(5, '0')}`, v: 2, learnerId: 'L1', enrolmentId: 'E1', languageId: LANG, at: `2026-10-0${1 + (counter % 7)}T10:00:00.000Z`,
    producer: { app: 'gopractice-review', version: '0.1.0', deviceId: 'D1' }, kind, subject: {}, payload, ...over,
  };
}
