/**
 * Review candidates: explainable rules over the knowledge rows. Every candidate carries the rules that scored it, so
 * "why this item?" always has an answer. The score is a ranking aid, not a schedule and not a probability.
 *
 * Never one card per encountered form: a unit with only exposure (no lookup, no assistance request, no demonstrated
 * error) is excluded unless its frequency says it is common. When several forms of one construction give trouble, the
 * CONSTRUCTION is proposed and its forms are demoted (grammaticalLeverage). A unit that already has a card is not proposed again.
 */
import { DIMENSIONS } from '../../repository-contract/src';
import type { Dimension, FormAnalysis, LearningGoal, LinguisticUnit, ReviewCandidate, UnitKind, UnitKnowledge } from '../../repository-contract/src';
import { eligibilityFor, validationFor } from './eligibility';

const DAY_MS = 86_400_000;

/** Rule weights (documented in README). */
export const CANDIDATE_RULES = {
  recentEncounter: { weight: 0.15, withinDays: 7 },
  repeatedLookups: { weight: 0.2, minNegativeExposure: 2 },
  demonstratedError: { weight: 0.25 },
  weakButSeen: { weight: 0.2, readingBelow: 0.5 },
  /** >= 3 distinct forms of one construction in difficulty (an error ever, or a lookup / assistance request / failed recognition within `windowDays`). */
  grammaticalLeverage: { weight: 0.3, minFailedForms: 3, explainedFactor: 0.5, windowDays: 30 },
  /** wordFrequency: graded by the unit's own `frequency.rank`; a unit is also a candidate on frequency alone up to `maxRank`. */
  wordFrequency: { veryCommonRank: 500, veryCommonWeight: 0.15, weight: 0.1, maxRank: 2000 },
  goalMatch: { weight: 0.05 },
  /** A unit whose latest deck event is CardAdded is not proposed again; with `includeCovered` it is listed with this penalty. */
  existingCoverage: { weight: -0.3 },
  priorReview: { weight: -0.15, withinDays: 2 },
  expectedBenefit: { weight: 0.1, confidenceFrom: 0.2, confidenceTo: 0.7 },
  /** A unit in the pack's mission word list (only when the pack facts expose one). */
  missionRelevance: { weight: 0.1 },
  /**
   * projection@3, the learner's own latest mark (`UnitKnowledge.selfMark`). "New to me" (`learning`) is a direct request for help: a strong
   * recognition candidate (0.2, the same as weakButSeen; with the demonstratedError its negative reading observation already earns, a marked word
   * outranks a merely looked-up one). "I recognise it" / "I can use it" (`known` / `productive`) is a standing claim: the unit is NOT proposed
   * as a recognition item while no evidence dated after the mark disagrees (a later lookup, assistance request, or failed judgement). Once such
   * evidence exists the unit is proposed again and the reason `selfMarkContradicted` (weight 0, explanation only) says so.
   */
  selfMark: { learningWeight: 0.2 },
  /** benefit (sum of the positive reasons) over burden (cost): a cheap, valuable item gains a little, a costly, marginal one loses a little. */
  benefitVsBurden: { cheapRatio: 2, cheapWeight: 0.05, costlyRatio: 0.5, costlyWeight: -0.05 },
  /** A capped analysis (experimental, seed-only or unreviewed resource) is a strong negative whatever the producer's confidence. */
  analysisConfidence: { cappedWeight: -0.3, unreviewedWeight: -0.1 },
  cost: { base: 0.2, perWord: 0.1 },
  maxIneligible: 5,
} as const;

/** Said once when a pack exposes no mission word list, so the missing rule is never mistaken for a zero. */
export const MISSION_SKIPPED_NOTE = 'missionRelevance skipped: the language pack exposes no mission word list';

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
  /** unit id -> instants of lookups, assistance requests and failed recognitions (the construction rule's window reads these). Absent: the row's exposure is used. */
  struggles?: Map<string, string[]>;
  /** The pack's mission word list, when its facts expose one. Absent: missionRelevance is skipped and `notes` says so. */
  missionUnits?: ReadonlySet<string>;
  /** List units that already have a card too (with the existingCoverage penalty) instead of dropping them. */
  includeCovered?: boolean;
  /** Receives notes about rules that could not run. */
  notes?: string[];
  /**
   * unit id -> instants of evidence that could contradict a standing "I know it" self-mark: lookups, assistance requests and every negative
   * judged observation. Absent: the row's own lastAt / exposure counters are used (coarser).
   */
  against?: Map<string, string[]>;
}

const JUDGED = DIMENSIONS.filter((d) => d !== 'exposure');
const TARGETABLE: Dimension[] = ['readingRecognition', 'listeningRecognition', 'productiveRetrieval', 'contextualProduction', 'grammaticalUnderstanding', 'phraseComprehension'];
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
  const within = (at: string | undefined, days: number): boolean => at !== undefined && nowMs - Date.parse(at) <= days * DAY_MS && Date.parse(at) <= nowMs + DAY_MS;

  /** A form is in difficulty for the construction rule: an error ever, or a lookup / assistance request / failed recognition inside the window. */
  const troubled = (f: string): boolean => {
    const row = rowById.get(f);
    if (hasError(row)) return true;
    const w = R.grammaticalLeverage.windowDays;
    if (inp.struggles) return (inp.struggles.get(f) ?? []).some((t) => within(t, w));
    return (row?.dimensions.exposure.negative ?? 0) > 0 && within(row?.lastSeenAt, w);
  };

  // Constructions that explain many forms in difficulty (grammaticalLeverage): the construction is the unit to review, not each form.
  const leverage = new Map<string, string[]>();
  const explainedBy = new Map<string, string>();
  for (const [cid, forms] of [...inp.realizedBy].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const failed = [...new Set(forms)].filter(troubled).sort();
    if (failed.length >= R.grammaticalLeverage.minFailedForms) {
      leverage.set(cid, failed);
      for (const f of failed) if (!explainedBy.has(f)) explainedBy.set(f, cid);
    }
  }

  /** Evidence dated AFTER a self-mark that disagrees with it: a lookup, assistance request or negative judgement. */
  const laterEvidenceAgainst = (id: string, row: UnitKnowledge, markAt: string): boolean => {
    const after = (at: string | undefined): boolean => at !== undefined && Date.parse(at) > Date.parse(markAt);
    if (inp.against) return (inp.against.get(id) ?? []).some(after);
    // Without the instants: the latest observation of a dimension with a negative, or the latest exposure while lookups exist, is after the mark.
    return JUDGED.some((d) => row.dimensions[d].negative > 0 && after(row.dimensions[d].lastAt)) || (row.dimensions.exposure.negative > 0 && after(row.dimensions.exposure.lastAt));
  };

  const ids = new Set<string>([...rowById.keys(), ...leverage.keys()]);
  const eligibleOut: ReviewCandidate[] = [];
  const ineligibleOut: ReviewCandidate[] = [];
  if (!inp.missionUnits) inp.notes?.push(MISSION_SKIPPED_NOTE);

  for (const id of [...ids].sort()) {
    const row = rowById.get(id);
    const unit = inp.units.get(id);
    const lev = leverage.get(id);
    const rank = unit?.frequency?.rank;
    const common = rank !== undefined && rank <= R.wordFrequency.maxRank;
    const lookups = row?.dimensions.exposure.negative ?? 0;
    const mark = row?.selfMark;
    let contradicted = false;
    if (mark && mark.mark !== 'learning') {
      contradicted = laterEvidenceAgainst(id, row!, mark.at);
      if (!contradicted) continue; // the learner said they know it and nothing since disagrees: not proposed as a recognition item
    }
    const markedNew = mark?.mark === 'learning';
    if (!(hasError(row) || lookups > 0 || common || lev || markedNew)) continue; // exposure alone is not a reason to review
    const card = inp.cards.get(id);
    if (card?.covered && !inp.includeCovered) continue; // already in the deck: not proposed again

    const reasons: ReviewCandidate['reasons'] = [];
    const add = (rule: string, weight: number, detail?: string): void => { reasons.push(detail === undefined ? { rule, weight } : { rule, weight, detail }); };

    if (row?.lastSeenAt !== undefined && nowMs - Date.parse(row.lastSeenAt) <= R.recentEncounter.withinDays * DAY_MS) add('recentEncounter', R.recentEncounter.weight, `last seen ${row.lastSeenAt}`);
    if (lookups >= R.repeatedLookups.minNegativeExposure) add('repeatedLookups', R.repeatedLookups.weight, `${lookups} lookups or assistance requests`);
    if (hasError(row)) {
      const dims = JUDGED.filter((d) => row!.dimensions[d].negative > 0);
      add('demonstratedError', R.demonstratedError.weight, `errors in ${dims.join(', ')}`);
    }
    if (row && row.dimensions.readingRecognition.weight > 0 && row.dimensions.readingRecognition.score < R.weakButSeen.readingBelow) add('weakButSeen', R.weakButSeen.weight, `reading recognition ${row.dimensions.readingRecognition.score.toFixed(2)}`);
    if (markedNew) add('selfMarkedNew', R.selfMark.learningWeight, `you marked it as new to you (${mark!.at})`);
    if (contradicted) add('selfMarkContradicted', 0, `you marked it as "${mark!.mark === 'productive' ? 'I can use it' : 'I recognise it'}" (${mark!.at}), but later evidence disagrees`);
    if (lev) add('grammaticalLeverage', R.grammaticalLeverage.weight, `repeated difficulty across ${lev.length} forms of ${unit?.label ?? id}`);
    if (common) add('wordFrequency', rank! <= R.wordFrequency.veryCommonRank ? R.wordFrequency.veryCommonWeight : R.wordFrequency.weight, `frequency rank ${rank}`);
    if (unit && inp.goals.some((g) => GOAL_UNIT_KINDS[g.kind].includes(unit.kind))) add('goalMatch', R.goalMatch.weight, 'unit kind serves a stated goal');
    if (inp.missionUnits?.has(id)) add('missionRelevance', R.missionRelevance.weight, "in the pack's mission word list");
    if (card?.covered) add('existingCoverage', R.existingCoverage.weight, 'already covered by a card');
    if (card?.lastReviewAt !== undefined && nowMs - Date.parse(card.lastReviewAt) <= R.priorReview.withinDays * DAY_MS) add('priorReview', R.priorReview.weight, `reviewed ${card.lastReviewAt}`);
    const target = targetOf(row, unit);
    const tconf = row?.dimensions[target].confidence ?? 0;
    if (tconf >= R.expectedBenefit.confidenceFrom && tconf <= R.expectedBenefit.confidenceTo) add('expectedBenefit', R.expectedBenefit.weight, `confidence ${tconf.toFixed(2)} on ${target}: more evidence would change the estimate`);

    const analysesOfUnit = unit?.kind === 'form' ? inp.analyses.get(id) ?? [] : [];
    const eligibility = eligibilityFor(unit, analysesOfUnit, target);
    const cost = Math.round(Math.min(1, R.cost.base + R.cost.perWord * (unit?.label.trim().split(/\s+/u).filter(Boolean).length ?? 1)) * 1e9) / 1e9;

    // benefitVsBurden: a short, explained comparison of what the positive reasons promise against what the item costs to review.
    const benefit = reasons.reduce((s, r) => s + Math.max(0, r.weight), 0);
    const ratio = cost > 0 ? benefit / cost : 0;
    const bb = R.benefitVsBurden;
    if (benefit > 0 && ratio >= bb.cheapRatio) add('benefitVsBurden', bb.cheapWeight, `benefit ${benefit.toFixed(2)} vs burden ${cost.toFixed(2)}: cheap for what it offers`);
    else if (benefit > 0 && ratio < bb.costlyRatio) add('benefitVsBurden', bb.costlyWeight, `benefit ${benefit.toFixed(2)} vs burden ${cost.toFixed(2)}: costly for what it offers`);

    // analysisConfidence by validation level: confidence never raises trust, an unvalidated resource lowers it.
    const validation = unit ? validationFor(unit, analysesOfUnit) : undefined;
    if (eligibility.eligible && (validation === 'experimental' || validation === 'seed-only')) {
      add('analysisConfidence', R.analysisConfidence.cappedWeight, `${validation} resource: the analysis is provisional at best, whatever its confidence`);
    } else if (eligibility.eligible && validation === 'unreviewed') {
      // machine-drafted but installable and measured (the reference packs): a milder penalty than a seed-only analyser, still never verified
      add('analysisConfidence', R.analysisConfidence.unreviewedWeight, `${validation} resource: machine-drafted, not native-reviewed; recognition items only`);
    }

    const raw = reasons.reduce((s, r) => s + r.weight, 0);
    const cand: ReviewCandidate = { unitId: id, kind: unit?.kind ?? 'unknown', score: 0, reasons, targetDimension: target, eligibility, cost };
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
  // Only when the construction can actually be reviewed (eligible); an ineligible one leaves its forms as they are.
  const reviewable = new Set(eligibleOut.map((c) => c.unitId));
  for (const c of eligibleOut) {
    const cid = explainedBy.get(c.unitId);
    if (cid === undefined || cid === c.unitId || !reviewable.has(cid)) continue;
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
