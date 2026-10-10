import { DIMENSIONS } from '../../packages/repository-contract/src';
import type { Dimension, DimensionEstimate, GoEvent, UnitKnowledge } from '../../packages/repository-contract/src';
import type { ProfileSource, WriterProfile } from '../../packages/gotell/src/types';

export const NOW = '2026-10-09T12:00:00.000Z';
export const LEARNER = 'L1';

const est = (over: Partial<DimensionEstimate> = {}): DimensionEstimate => ({
  score: 0, confidence: 0, observations: 0, positive: 0, negative: 0, weight: 0, contexts: 0, ...over,
});

/** A knowledge row with the given dimension overrides; every other dimension is empty. */
export function row(unitId: string, dims: Partial<Record<Dimension, Partial<DimensionEstimate>>> = {}, over: Partial<UnitKnowledge> = {}): UnitKnowledge {
  const dimensions = Object.fromEntries(DIMENSIONS.map((d) => [d, est(dims[d])])) as Record<Dimension, DimensionEstimate>;
  return {
    learnerId: LEARNER, unitId, languageId: 'sq', dimensions,
    retention: { estimate: 0, halfLifeDays: 1, basedOn: 'none' }, level: 'seen', encounters: 1, uncertainty: 1, modelVersion: 'test', basis: { events: 0 }, ...over,
  };
}

export function event(kind: GoEvent['kind'], payload: Record<string, unknown>, over: Partial<GoEvent> = {}): GoEvent {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`, v: 1, learnerId: LEARNER, enrolmentId: 'en1', languageId: 'sq', at: '2026-10-08T10:00:00.000Z',
    producer: { app: 'gopractice-tell', version: 't', deviceId: 'd1' }, kind, subject: {}, payload, ...over,
  };
}

export const goalEvent = (value: Record<string, unknown> | null, at = '2026-10-08T10:00:00.000Z'): GoEvent =>
  event('PreferenceChanged', { key: 'gotell:goal', origin: 'explicit', value }, { at });

export function source(rows: UnitKnowledge[], events: GoEvent[] = [], depth?: string): ProfileSource {
  return { knowledge: async () => rows, events: async () => events, preferences: async () => (depth ? { explanationDepth: depth } : undefined) };
}

/** A hand-made profile for guidance and selection tests. */
export function profile(over: Partial<WriterProfile> = {}): WriterProfile {
  return {
    learnerId: LEARNER, languageId: 'sq', productive: [], recognisedOnly: [], weakConstructions: [], recurringErrors: [], recent: [],
    explanationDepth: 'brief', goals: [], band: { level: 'first-sentences', basis: ['test'] }, ...over,
  };
}
