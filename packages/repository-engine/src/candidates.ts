/**
 * Review candidates: explainable rules over the knowledge rows. Every candidate carries the rules that scored it, so
 * "why this item?" always has an answer. The score is a ranking aid, not a schedule and not a probability.
 *
 * Never one card per encountered form: a unit with only exposure (no lookup, no assistance request, no demonstrated
 * error) is excluded unless its frequency says it is common. When several forms of one construction give trouble, the
 * CONSTRUCTION is proposed and its forms are demoted (grammaticalLeverage). A unit that already has a card is not proposed again.
 *
 * REVIEW IS A PROGRESSION (projection@4, docs/ecosystem/KNOWLEDGE-LEVELS.md). Whether a unit is a candidate, and what it is proposed for, follows its
 * knowledge LEVEL (`UnitKnowledge.level`); the learner never asks for review and nothing is required from a card:
 *   new, seen            proposed for RECOGNITION practice once they were looked up, got wrong, are common, or the learner marked them new / seen.
 *   recognized, familiar proposed for reading RECOGNITION (and its retention) on the same signals; decayed retention raises the score but is not,
 *                        alone, a reason (a word recognised once is not re-tested just because time passed: that would flood the queue).
 *   known                proposed for RETRIEVAL (productiveRetrieval; recognition when the unit cannot support a production item), only when its
 *                        retention has decayed or it is a common word.
 *   automatic            proposed only when retention has decayed below the threshold, or when later evidence contradicted the learner's mark.
 * A self-mark of level L is contradicted when later evidence puts the unit two or more levels below it (`markStatus`); the unit is then drawn by
 * the level the evidence supports and the reason `selfMarkContradicted` says so. Every candidate carries a `knowledgeLevel` reason naming its level.
 */
import { DIMENSIONS, KNOWLEDGE_LEVEL_RANK, KNOWLEDGE_LEVEL_WORDS, levelOfMark } from '../../repository-contract/src';
import type { Dimension, FormAnalysis, KnowledgeLevel, LearningGoal, LinguisticUnit, ReviewCandidate, UnitKind, UnitKnowledge } from '../../repository-contract/src';
import { eligibilityFor, validationFor } from './eligibility';
import { LEVEL_THRESHOLDS, levelOf } from './levels';

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
   * The learner's own latest mark (`UnitKnowledge.selfMark`, a level). A mark of `new` or `seen` (the old "New to me") is a direct request for help:
   * a strong recognition candidate (0.2, the same as weakButSeen; with the demonstratedError its negative reading observation already earns, a marked
   * word outranks a merely looked-up one). A mark of recognized or better is a standing claim, and the unit is drawn by its LEVEL (see the header) while
   * no evidence dated after the mark disagrees. Once such evidence puts the unit two levels below the mark, the unit is drawn by the evidence's level and
   * the reason `selfMarkContradicted` (weight 0, explanation only) says so.
   */
  selfMark: { learningWeight: 0.2 },
  /**
   * projection@4, the level policy. `decayed`: a unit whose retention estimate (already decayed to `now`) is below `retentionBelow` AND whose
   * strongest dimension was last observed at least `decayedAfterHalfLives` half-lives ago is due again: for a known or automatic unit this is (with
   * a contradicted mark or a common word) the only way it is proposed; for a lower level it adds weight to a unit that is already drawn; `decayedWeight` is its reason's weight. The `knowledgeLevel` reason has weight 0: it explains.
   */
  level: { retentionBelow: 0.3, decayedAfterHalfLives: 1, decayedWeight: 0.15 },
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
}

const JUDGED = DIMENSIONS.filter((d) => d !== 'exposure');
const TARGETABLE: Dimension[] = ['readingRecognition', 'listeningRecognition', 'productiveRetrieval', 'contextualProduction', 'grammaticalUnderstanding', 'phraseComprehension'];
const isConstruction = (u?: LinguisticUnit): boolean => u?.kind === 'morph-construction' || u?.kind === 'syntactic-construction';
const hasError = (r?: UnitKnowledge): boolean => !!r && JUDGED.some((d) => r.dimensions[d].negative > 0);

/** What each level is proposed for when no dimension shows a demonstrated error: below known, recognition; known and automatic, retrieval. */
export const LEVEL_DEFAULT_TARGET: Record<KnowledgeLevel, Dimension> = {
  new: 'readingRecognition', seen: 'readingRecognition', recognized: 'readingRecognition', familiar: 'readingRecognition',
  known: 'productiveRetrieval', automatic: 'productiveRetrieval',
};

/** One sentence per level: what the unit is proposed for and why (the `knowledgeLevel` reason's detail). */
const LEVEL_PURPOSE: Record<KnowledgeLevel, string> = {
  new: 'not understood yet; proposed for recognition practice',
  seen: 'met or looked up, nothing shows it was understood; proposed for recognition practice',
  recognized: 'understood once or with help; reading it unaided moves it to Familiar',
  familiar: 'recognised repeatedly; reliable recognition moves it to Known',
  known: 'recognised reliably; retrieving it moves it to Automatic',
  automatic: 'produced without help; checked only because later evidence or retention decay questions it',
};

const levelRank = (l: KnowledgeLevel): number => KNOWLEDGE_LEVEL_RANK[l];
const levelTitle = (l: KnowledgeLevel): string => KNOWLEDGE_LEVEL_WORDS[l].title;

function targetOf(row: UnitKnowledge | undefined, unit: LinguisticUnit | undefined, level: KnowledgeLevel): Dimension {
  if (isConstruction(unit)) return 'grammaticalUnderstanding';
  let best: Dimension | undefined;
  if (row) for (const d of TARGETABLE) if (row.dimensions[d].negative > 0 && (best === undefined || row.dimensions[d].score < row.dimensions[best].score)) best = d;
  return best ?? LEVEL_DEFAULT_TARGET[level];
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

  /** Retention has decayed: the estimate (already decayed to `now`) is below the threshold and the strongest dimension was last observed at least one half-life ago. */
  const decayedRetention = (row: UnitKnowledge | undefined): boolean => {
    if (!row || row.retention.basedOn === 'none') return false;
    const last = row.dimensions[row.retention.basedOn].lastAt;
    if (last === undefined || Number.isNaN(Date.parse(last))) return false;
    const days = (nowMs - Date.parse(last)) / DAY_MS;
    return row.retention.estimate < R.level.retentionBelow && days >= R.level.decayedAfterHalfLives * row.retention.halfLifeDays;
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
    // The level (projection@4; a row stored by an older projection has none, and the rules compute it from the row).
    const level: KnowledgeLevel = row ? row.level ?? levelOf(row) : 'new';
    const mark = row?.selfMark;
    const markLevel = mark ? levelOfMark(mark.mark) : undefined;
    // contradicted: the learner's mark claims two or more levels more than the evidence since supports (the level is then the evidence's)
    const contradicted = markLevel !== undefined && levelRank(markLevel) - levelRank(level) >= LEVEL_THRESHOLDS.contradictionGap;
    // a mark of new / seen in force is a request for help the learner made by marking, not by asking for a review
    const markedNew = markLevel !== undefined && !contradicted && level === markLevel && levelRank(level) <= levelRank('seen');
    const decayed = decayedRetention(row);
    const signalled = hasError(row) || lookups > 0 || common || !!lev || markedNew; // exposure alone is not a reason to review
    let drawn: boolean;
    switch (level) {
      case 'known': drawn = contradicted || decayed || common || !!lev; break; // a known unit is retrieved when its retention decayed or it is a common word
      case 'automatic': drawn = contradicted || decayed; break;
      case 'recognized': case 'familiar': drawn = signalled; break; // decayed retention only adds weight (below)
      default: drawn = signalled || contradicted; // new, seen
    }
    if (!drawn) continue;
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
    if (markedNew) add('selfMarkedNew', R.selfMark.learningWeight, level === 'new' ? `you marked it as new to you (${mark!.at})` : `you marked it as ${levelTitle(level).toLowerCase()} (${mark!.at})`);
    if (contradicted) add('selfMarkContradicted', 0, `you marked it as "${levelTitle(markLevel!)}" (${mark!.at}), but later evidence disagrees: it supports ${levelTitle(level)}`);
    if (decayed) add('retentionDecayed', R.level.decayedWeight, `retention ${row!.retention.estimate.toFixed(2)} is below ${R.level.retentionBelow} (half-life ${row!.retention.halfLifeDays.toFixed(1)} days)`);
    add('knowledgeLevel', 0, `${levelTitle(level)}${row ? ` (${row.encounters ?? 0} encounter${row.encounters === 1 ? '' : 's'})` : ''}: ${LEVEL_PURPOSE[level]}`);
    if (lev) add('grammaticalLeverage', R.grammaticalLeverage.weight, `repeated difficulty across ${lev.length} forms of ${unit?.label ?? id}`);
    if (common) add('wordFrequency', rank! <= R.wordFrequency.veryCommonRank ? R.wordFrequency.veryCommonWeight : R.wordFrequency.weight, `frequency rank ${rank}`);
    if (unit && inp.goals.some((g) => GOAL_UNIT_KINDS[g.kind].includes(unit.kind))) add('goalMatch', R.goalMatch.weight, 'unit kind serves a stated goal');
    if (inp.missionUnits?.has(id)) add('missionRelevance', R.missionRelevance.weight, "in the pack's mission word list");
    if (card?.covered) add('existingCoverage', R.existingCoverage.weight, 'already covered by a card');
    if (card?.lastReviewAt !== undefined && nowMs - Date.parse(card.lastReviewAt) <= R.priorReview.withinDays * DAY_MS) add('priorReview', R.priorReview.weight, `reviewed ${card.lastReviewAt}`);
    let target = targetOf(row, unit, level);
    const analysesOfUnit = unit?.kind === 'form' ? inp.analyses.get(id) ?? [] : [];
    let eligibility = eligibilityFor(unit, analysesOfUnit, target);
    // A known unit is proposed for retrieval; when its analysis cannot support a production item but can support recognition, recognition is asked instead.
    if (!eligibility.eligible && target === 'productiveRetrieval' && level === 'known') {
      const fallback = eligibilityFor(unit, analysesOfUnit, 'readingRecognition');
      if (fallback.eligible) { target = 'readingRecognition'; eligibility = fallback; add('levelTarget', 0, 'retrieval is not supported by this analysis; recognition is asked instead'); }
    }
    const tconf = row?.dimensions[target].confidence ?? 0;
    if (tconf >= R.expectedBenefit.confidenceFrom && tconf <= R.expectedBenefit.confidenceTo) add('expectedBenefit', R.expectedBenefit.weight, `confidence ${tconf.toFixed(2)} on ${target}: more evidence would change the estimate`);

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
