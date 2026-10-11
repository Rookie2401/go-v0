/**
 * Versioned GoReview eligibility and ranking policy. These are experimental product weights,
 * not parameters of FSRS and not claims about scientifically optimal practice.
 */
import { KNOWLEDGE_LEVELS } from '../../../repository-contract/src';
import type { KnowledgeLevel, UnitKnowledge } from '../../../repository-contract/src';

export const KNOWABILITY_PRIORITY_POLICY_VERSION = 'knowability-priority@1';
export const DEFAULT_KNOWABILITY_WEIGHTS: Readonly<Record<KnowledgeLevel, number>> = Object.freeze({
  new: 0,
  seen: 0.3,
  recognized: 1.5,
  familiar: 1.5,
  known: 0.25,
  automatic: 0.03,
});

export interface KnowabilityPolicy {
  version?: string;
  weights?: Partial<Record<KnowledgeLevel, number>>;
  /** Minimum distinct encounter events before Seen can be considered. */
  seenEncounterThreshold?: number;
  /** Failure evidence must be recent enough to remain actionable. */
  automaticFailureWindow?: number;
}

export interface PrioritySignals {
  level: KnowledgeLevel;
  retrievability: number;
  stability?: number;
  due: boolean;
  overdueDays?: number;
  recentFailures?: number;
  readingRelevance?: number;
  encounters?: number;
  recentExposure?: number;
  evidenceQuality?: number;
  cost?: number;
  diversity?: number;
  explicitRequest?: boolean;
  seenEligible?: boolean;
  automaticFailure?: boolean;
}

export interface PriorityBreakdown {
  eligible: boolean;
  stage: number;
  forgettingRisk: number;
  readingRelevance: number;
  retrievalHistory: number;
  diversity: number;
  urgency: number;
  evidenceQuality: number;
  recentExposurePenalty: number;
  reviewCost: number;
  score: number;
}

export const PRIORITY_FACTOR_WEIGHTS = Object.freeze({ forgettingRisk: 0.45, readingRelevance: 0.25, retrievalHistory: 0.15, diversity: 0.05, urgency: 0.1 });

const clamp01 = (n: number | undefined, fallback = 0.5): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(1, n!)) : fallback;

export function validateKnowabilityPolicy(policy: KnowabilityPolicy = {}): void {
  if (policy.version !== undefined && policy.version !== KNOWABILITY_PRIORITY_POLICY_VERSION) {
    throw new RangeError(`unsupported knowability policy version: ${policy.version}`);
  }
  for (const level of KNOWLEDGE_LEVELS) {
    const weight = policy.weights?.[level];
    if (weight !== undefined && (!Number.isFinite(weight) || weight < 0 || (level === 'new' && weight !== 0))) {
      throw new RangeError(`invalid ${level} priority weight`);
    }
  }
  if (policy.seenEncounterThreshold !== undefined && (!Number.isInteger(policy.seenEncounterThreshold) || policy.seenEncounterThreshold < 2)) {
    throw new RangeError('seenEncounterThreshold must be an integer of at least 2');
  }
  if (policy.automaticFailureWindow !== undefined && (!Number.isInteger(policy.automaticFailureWindow) || policy.automaticFailureWindow < 1)) {
    throw new RangeError('automaticFailureWindow must be a positive integer');
  }
}

export function effectiveKnowabilityWeights(policy: KnowabilityPolicy = {}): Readonly<Record<KnowledgeLevel, number>> {
  validateKnowabilityPolicy(policy);
  return Object.freeze({ ...DEFAULT_KNOWABILITY_WEIGHTS, ...policy.weights, new: 0 });
}

/**
 * Eligibility is deliberately distinct from priority and FSRS due state.
 * New is never automatically admitted; Seen needs an evidence trigger; Automatic
 * requires a confirmed unassisted retrieval failure (or explicit learner request).
 */
export function eligibleByKnowability(input: Pick<PrioritySignals, 'level' | 'seenEligible' | 'automaticFailure' | 'explicitRequest'>): boolean {
  if (input.level === 'new') return input.explicitRequest === true;
  if (input.level === 'seen') return input.seenEligible === true || input.explicitRequest === true;
  if (input.level === 'automatic') return input.automaticFailure === true || input.explicitRequest === true;
  return true;
}

/** A product ranking signal only; it never modifies FSRS state or stability. */
export function explainReviewPriority(signals: PrioritySignals, policy: KnowabilityPolicy = {}): PriorityBreakdown {
  const weights = effectiveKnowabilityWeights(policy);
  if (!(signals.level in weights)) throw new RangeError(`unknown knowability stage: ${String(signals.level)}`);
  const eligible = eligibleByKnowability(signals) && weights[signals.level] > 0;
  const forgettingRisk = 1 - clamp01(signals.retrievability);
  const readingRelevance = clamp01(signals.readingRelevance, 0);
  const retrievalHistory = Math.min(1, Math.max(0, Number.isFinite(signals.recentFailures) ? signals.recentFailures! : 0) * 0.2);
  const diversity = Number.isFinite(signals.diversity) ? Math.max(0, Math.min(1, signals.diversity!)) : 0.5;
  const overdueDays = Number.isFinite(signals.overdueDays) ? Math.max(0, signals.overdueDays!) : 0;
  const urgency = signals.due === true ? clamp01(overdueDays / 14, 0) : 0;
  const evidenceQuality = clamp01(signals.evidenceQuality, 0.5);
  const recentExposurePenalty = clamp01(signals.recentExposure, 0) * 0.3;
  const reviewCost = Number.isFinite(signals.cost) ? Math.max(0, signals.cost!) : 0;
  const combined = forgettingRisk * PRIORITY_FACTOR_WEIGHTS.forgettingRisk +
    readingRelevance * PRIORITY_FACTOR_WEIGHTS.readingRelevance +
    retrievalHistory * PRIORITY_FACTOR_WEIGHTS.retrievalHistory +
    diversity * PRIORITY_FACTOR_WEIGHTS.diversity + urgency * PRIORITY_FACTOR_WEIGHTS.urgency;
  const score = eligible ? weights[signals.level] * combined * evidenceQuality * (1 - recentExposurePenalty) / (1 + reviewCost) : 0;
  return { eligible, stage: weights[signals.level], forgettingRisk, readingRelevance, retrievalHistory, diversity, urgency, evidenceQuality, recentExposurePenalty, reviewCost, score };
}

export function scoreReviewPriority(signals: PrioritySignals, policy: KnowabilityPolicy = {}): number {
  return explainReviewPriority(signals, policy).score;
}

/** Seen is allowed after spaced encounters, repeat assistance, explicit request, or current/recent reading relevance. */
export function seenEligibility(input: {
  knowledge?: UnitKnowledge;
  assistanceRequests?: number;
  explicitRequest?: boolean;
  readingRelevance?: number;
  policy?: KnowabilityPolicy;
}): boolean {
  const policy = input.policy ?? {};
  validateKnowabilityPolicy(policy);
  if (input.explicitRequest || (input.assistanceRequests ?? 0) >= 2 || (input.readingRelevance ?? 0) >= 0.66) return true;
  const k = input.knowledge;
  const threshold = policy.seenEncounterThreshold ?? 2;
  return !!k && k.level === 'seen' && k.encounters >= threshold &&
    !!k.firstSeenAt && !!k.lastSeenAt && Number.isFinite(Date.parse(k.firstSeenAt)) && Number.isFinite(Date.parse(k.lastSeenAt)) &&
    Date.parse(k.lastSeenAt) - Date.parse(k.firstSeenAt) >= 6 * 60 * 60 * 1000;
}

/** A distinct unassisted wrong retrieval is the only implicit Automatic reactivation trigger. */
export function hasConfirmedAutomaticFailure(events: readonly import('../../../repository-contract/src').GoEvent[], unitId: string, window = 10): boolean {
  const byId = new Map(events.map((e) => [e.id, e] as const));
  const candidateCorrections = events.filter((e) => e.correctionOf).filter((correction) => {
    const original = byId.get(correction.correctionOf!);
    if (!original || original.correctionOf || original.kind !== correction.kind || original.learnerId !== correction.learnerId ||
      original.enrolmentId !== correction.enrolmentId || original.languageId !== correction.languageId ||
      original.subject?.cardId !== correction.subject?.cardId || !correction.subject?.itemIds || !original.subject?.itemIds ||
      correction.subject.itemIds.length !== original.subject.itemIds.length ||
      [...correction.subject.itemIds].sort().some((id, i) => id !== [...original.subject!.itemIds!].sort()[i]) ||
      Date.parse(correction.at) <= Date.parse(original.at)) return false;
    const p = correction.payload as Record<string, unknown>;
    return p.rating === null && p.challenged === true && correction.evidence?.quality === 'none';
  });
  const counts = new Map<string, number>();
  candidateCorrections.forEach((e) => counts.set(e.correctionOf!, (counts.get(e.correctionOf!) ?? 0) + 1));
  const corrected = new Set([...counts].filter(([, n]) => n === 1).map(([id]) => id));
  const relevant = events.filter((e) => !e.correctionOf && !corrected.has(e.id) && e.subject?.itemIds?.includes(unitId))
    .filter((e) => ['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed'].includes(e.kind))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id)).slice(-window);
  return relevant.some((e) => {
    const p = e.payload as Record<string, unknown>;
    return p.correct === false && p.hinted !== true && p.answerShownBefore !== true && p.rating === 1 && e.evidence?.assisted !== true && e.evidence?.quality !== 'none';
  });
}
