/**
 * Review candidates: explainable rules over the knowledge rows. Every candidate carries the rules that scored it, so
 * "why this item?" always has an answer. The score is a ranking aid, not a schedule and not a probability.
 *
 * Never one card per encountered form: a unit with only exposure (no lookup, no assistance request, no demonstrated
 * error) is excluded unless its frequency says it is common.
 */
import { DIMENSIONS } from '../../repository-contract/src';
import type { Dimension, FormAnalysis, LearningGoal, LinguisticUnit, ReviewCandidate, UnitKind, UnitKnowledge } from '../../repository-contract/src';
import { eligibilityFor } from './eligibility';

const DAY_MS = 86_400_000;

/** Rule weights (documented in README). */
export const CANDIDATE_RULES = {
  recentEncounter: { weight: 0.15, withinDays: 7 },
  repeatedLookups: { weight: 0.2, minNegativeExposure: 2 },
  demonstratedError: { weight: 0.25 },
  weakButSeen: { weight: 0.2, readingBelow: 0.5 },
  grammaticalLeverage: { weight: 0.3, minFailedForms: 3, explainedFactor: 0.5 },
  frequency: { weight: 0.1, maxRank: 2000 },
  goalMatch: { weight: 0.05 },
  existingCoverage: { weight: -0.3 },
  priorReview: { weight: -0.15, withinDays: 2 },
  expectedBenefit: { weight: 0.1, confidenceFrom: 0.2, confidenceTo: 0.7 },
  cost: { base: 0.2, perWord: 0.1 },
  maxIneligible: 5,
} as const;

/** Heuristic: which unit kinds serve which goal. `custom` matches nothing (no way to know). */
export const GOAL_UNIT_KINDS: Record<LearningGoal['kind'], readonly UnitKind[]> = {
  reading: ['lexeme', 'sense', 'form', 'multiword', 'morph-construction', 'syntactic-construction'],
  scripture: ['lexeme', 'sense', 'form', 'multiword', 'morph-construction', 'syntactic-construction'],
  listening: ['form', 'lexeme', 'phonological-distinction', 'pronunciation-pattern'],
  speaking: ['lexeme', 'form', 'multiword', 'syntactic-construction', 'pronunciation-pattern'],
  conversation: ['lexeme', 'form', 'multiword', 'syntactic-construction', 'pronunciation-pattern'],
  writing: ['lexeme', 'form', 'multiword', 'morph-construction', 'syntactic-construction', 'orthographic-pattern'],
  custom: [],
};

export interface CardState { covered: boolean; lastReviewAt?: string }

export interface CandidateInputs {
  rows: UnitKnowledge[];
  units: Map<string, LinguisticUnit>;
  analyses: Map<string, FormAnalysis[]>;
  /** construction id -> ids of the forms that `realize` it (only forms the learner has a row for need be listed). */
  realizedBy: Map<string, string[]>;
  cards: Map<string, CardState>;
  goals: LearningGoal[];
  now: string;
  limit: number;
}

const JUDGED = DIMENSIONS.filter((d) => d !== 'exposure');
const TARGETABLE: Dimension[] = ['readingRecognition', 'listeningRecognition', 'productiveRetrieval', 'contextualProduction', 'grammaticalUnderstanding'];
const isConstruction = (u?: LinguisticUnit): boolean => u?.kind === 'morph-construction' || u?.kind === 'syntactic-construction';
const hasError = (r?: UnitKnowledge): boolean => !!r && JUDGED.some((d) => r.dimensions[d].negative > 0);

function targetOf(row: UnitKnowledge | undefined, unit: LinguisticUnit | undefined): Dimension {
  if (isConstruction(unit)) return 'grammaticalUnderstanding';
  let best: Dimension | undefined;
  if (row) for (const d of TARGETABLE) if (row.dimensions[d].negative > 0 && (best === undefined || row.dimensions[d].score < row.dimensions[best].score)) best = d;
  return best ?? 'readingRecognition';
}

/** Pure ranking. Eligible candidates by score, then (limited) ineligible ones with score 0. */
export function rankCandidates(inp: CandidateInputs): ReviewCandidate[] {
  const R = CANDIDATE_RULES;
  const rowById = new Map(inp.rows.map((r) => [r.unitId, r]));
  const nowMs = Date.parse(inp.now);

  // Constructions that explain many failed forms (grammaticalLeverage).
  const leverage = new Map<string, string[]>();
  const explainedBy = new Map<string, string>();
  for (const [cid, forms] of inp.realizedBy) {
    const failed = [...new Set(forms)].filter((f) => hasError(rowById.get(f))).sort();
    if (failed.length >= R.grammaticalLeverage.minFailedForms) {
      leverage.set(cid, failed);
      for (const f of failed) if (!explainedBy.has(f)) explainedBy.set(f, cid);
    }
  }

  const ids = new Set<string>([...rowById.keys(), ...leverage.keys()]);
  const eligibleOut: ReviewCandidate[] = [];
  const ineligibleOut: ReviewCandidate[] = [];

  for (const id of [...ids].sort()) {
    const row = rowById.get(id);
    const unit = inp.units.get(id);
    const lev = leverage.get(id);
    const rank = unit?.frequency?.rank;
    const common = rank !== undefined && rank <= R.frequency.maxRank;
    const lookups = row?.dimensions.exposure.negative ?? 0;
    if (!(hasError(row) || lookups > 0 || common || lev)) continue; // exposure alone is not a reason to review

    const reasons: ReviewCandidate['reasons'] = [];
    const add = (rule: string, weight: number, detail?: string): void => { reasons.push(detail === undefined ? { rule, weight } : { rule, weight, detail }); };

    if (row?.lastSeenAt !== undefined && nowMs - Date.parse(row.lastSeenAt) <= R.recentEncounter.withinDays * DAY_MS) add('recentEncounter', R.recentEncounter.weight, `last seen ${row.lastSeenAt}`);
    if (lookups >= R.repeatedLookups.minNegativeExposure) add('repeatedLookups', R.repeatedLookups.weight, `${lookups} lookups or assistance requests`);
    if (hasError(row)) {
      const dims = JUDGED.filter((d) => row!.dimensions[d].negative > 0);
      add('demonstratedError', R.demonstratedError.weight, `errors in ${dims.join(', ')}`);
    }
    if (row && row.dimensions.readingRecognition.weight > 0 && row.dimensions.readingRecognition.score < R.weakButSeen.readingBelow) add('weakButSeen', R.weakButSeen.weight, `reading recognition ${row.dimensions.readingRecognition.score.toFixed(2)}`);
    if (lev) add('grammaticalLeverage', R.grammaticalLeverage.weight, `explains failures on ${lev.length} forms`);
    if (common) add('frequency', R.frequency.weight, `frequency rank ${rank}`);
    if (unit && inp.goals.some((g) => GOAL_UNIT_KINDS[g.kind].includes(unit.kind))) add('goalMatch', R.goalMatch.weight, 'unit kind serves a stated goal');
    const card = inp.cards.get(id);
    if (card?.covered) add('existingCoverage', R.existingCoverage.weight, 'already covered by a card');
    if (card?.lastReviewAt !== undefined && nowMs - Date.parse(card.lastReviewAt) <= R.priorReview.withinDays * DAY_MS) add('priorReview', R.priorReview.weight, `reviewed ${card.lastReviewAt}`);
    const target = targetOf(row, unit);
    const tconf = row?.dimensions[target].confidence ?? 0;
    if (tconf >= R.expectedBenefit.confidenceFrom && tconf <= R.expectedBenefit.confidenceTo) add('expectedBenefit', R.expectedBenefit.weight, `confidence ${tconf.toFixed(2)} on ${target}: more evidence would change the estimate`);

    const raw = reasons.reduce((s, r) => s + r.weight, 0);
    const eligibility = eligibilityFor(unit, unit?.kind === 'form' ? inp.analyses.get(id) ?? [] : [], target);
    const cost = Math.min(1, R.cost.base + R.cost.perWord * (unit?.label.trim().split(/\s+/u).filter(Boolean).length ?? 1));
    const cand: ReviewCandidate = { unitId: id, kind: unit?.kind ?? 'unknown', score: 0, reasons, targetDimension: target, eligibility, cost: Math.round(cost * 1e9) / 1e9 };
    if (lev) cand.explains = lev;
    if (!eligibility.eligible) {
      if (raw <= 0) continue;
      add('analysisConfidence', -raw, `not eligible: ${eligibility.reason}`);
      ineligibleOut.push(cand);
    } else {
      cand.score = raw;
      eligibleOut.push(cand);
    }
  }

  // Forms explained by a construction candidate count for half: the construction is the better thing to review.
  for (const c of eligibleOut) {
    const cid = explainedBy.get(c.unitId);
    if (cid === undefined || cid === c.unitId) continue;
    const delta = -R.grammaticalLeverage.explainedFactor * c.score;
    c.reasons.push({ rule: 'explained-by-construction', weight: delta, detail: cid });
    c.score += delta;
  }
  const round = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 1e9) / 1e9;
  for (const c of eligibleOut) c.score = round(c.score);
  const byScore = (a: ReviewCandidate, b: ReviewCandidate): number => b.score - a.score || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0);
  const kept = eligibleOut.filter((c) => c.score > 0).sort(byScore).slice(0, inp.limit);
  const room = Math.max(0, inp.limit - kept.length);
  ineligibleOut.sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
  return [...kept, ...ineligibleOut.slice(0, Math.min(room, R.maxIneligible))];
}
