/**
 * The six knowledge levels, computed (projection@4). One function, `levelOf`, turns a unit's dimension estimates and the learner's own
 * latest mark into the level every app reads: new, seen, recognized, familiar, known, automatic (vocabulary and words in
 * `repository-contract/src/knowledge-levels.ts`; the full description is docs/ecosystem/KNOWLEDGE-LEVELS.md).
 *
 * WHAT EVIDENCE SAYS (`evidenceLevelOf`, from the dimension estimates alone; every threshold is a hypothesis until calibrated):
 *   new         no observation at all.
 *   seen        something was observed (a lookup, an exposure, a help request, a failed attempt) but nothing shows it was understood.
 *   recognized  understood with help (a positive assistedRecognition), OR recognised at least once without help (a positive recognition
 *               observation) while the estimate is still below FAMILIAR_SCORE. A produced answer or a correct unaided recall counts too.
 *   familiar    a recognition dimension with score >= 0.6 over >= 2 observations.
 *   known       a recognition dimension with score >= 0.8 over >= 4 observations.
 *   automatic   not inferred from production counts in the current model; it requires an explicit learner mark or preserved legacy state.
 * "A recognition dimension" is readingRecognition or listeningRecognition (the owner's rule: listening counts too) and, because a phrase or a
 * construction is understood as a whole, also phraseComprehension and grammaticalUnderstanding; the highest level any of them reaches counts.
 * The score is the engine's own estimate (prior 0.5, weighted positives), so a self-report alone (weight <= 0.09) never reaches a threshold.
 *
 * WHAT THE LEARNER SAYS (`UnitKnowledge.selfMark`, already a level): the newest self-mark decides the level outright, and it holds until the
 * learner marks the word again (the owner's rule, 2026-10-26: after the first automatic step from New to Seen, only the learner changes a
 * word's state):
 *   - a mark of `new` is released by ANY later observation (2026-10-10): "new" means not met, so meeting the word after saying so (a click
 *     that looks it up, an exposure, a help request, a failed attempt: anything dated after the mark) makes it at least `seen`; the level is
 *     max(seen, what the evidence says). An observation dated BEFORE the mark never releases it.
 *   - every other mark is in force whatever comes after it: a lookup, an exposure, a help request, a failed or a correct answer neither
 *     lowers nor raises the level. (Until 2026-10-26 evidence two levels against the mark "contradicted" it, so opening the card of a word
 *     marked Known read it back down to Seen, and evidence two levels above "released" it upward; `MarkStatus` keeps both words for the
 *     stored rows and reasons that still name them.)
 * Without a mark, the level is what the evidence says, so the first lookup of a word takes it from New to Seen by itself.
 * `evidenceDims` is the unit folded WITHOUT its self-mark observations, so a self-report never counts toward a threshold it did not earn (the fold
 * builds it exactly; without it the row's own dimensions are used, self-report included, which can only add a weak observation).
 * `since` is the evidence dated after the mark, which the fold builds exactly from the unit's observations. Without it (a caller holding
 * only a stored row) the dimensions whose latest observation is after the mark stand in for it, which is coarser: a pre-mark lookup in a
 * dimension that was touched again counts as later.
 */
import { DIMENSIONS, KNOWLEDGE_LEVELS, KNOWLEDGE_LEVEL_RANK } from '../../repository-contract/src';
import type { Dimension, DimensionEstimate, KnowledgeLevel, UnitKnowledge } from '../../repository-contract/src';

/** The thresholds, in one place. */
export const LEVEL_THRESHOLDS = {
  /** familiar: recognition score and observations. */
  familiar: { score: 0.6, observations: 2 },
  /** known: recognition score and observations. */
  known: { score: 0.8, observations: 4 },
  /** A mark is contradicted / released when the evidence is this many levels away from it. */
  contradictionGap: 2,
} as const;

/** The dimensions that show a unit was understood (listening counts like reading; a phrase or a construction is understood as a whole). */
export const RECOGNITION_LEVEL_DIMENSIONS: readonly Dimension[] = ['readingRecognition', 'listeningRecognition', 'phraseComprehension', 'grammaticalUnderstanding'];
/** The dimensions that show a unit was produced. */
export const PRODUCTION_LEVEL_DIMENSIONS: readonly Dimension[] = ['productiveRetrieval', 'contextualProduction'];

/** The part of a dimension estimate the level rules read. */
export type LevelEstimate = Pick<DimensionEstimate, 'observations' | 'positive' | 'negative' | 'score'> & Partial<Pick<DimensionEstimate, 'lastAt'>>;
export type LevelDimensions = Record<Dimension, LevelEstimate>;
export type LevelInput = { dimensions: LevelDimensions; selfMark?: UnitKnowledge['selfMark'] };

const rank = (l: KnowledgeLevel): number => KNOWLEDGE_LEVEL_RANK[l];
const higher = (a: KnowledgeLevel, b: KnowledgeLevel): KnowledgeLevel => (rank(a) >= rank(b) ? a : b);

/** The level the dimension estimates alone support (no self-mark). */
export function evidenceLevelOf(dims: LevelDimensions): KnowledgeLevel {
  const T = LEVEL_THRESHOLDS;
  if (!DIMENSIONS.some((d) => dims[d]?.observations > 0)) return 'new';
  let level: KnowledgeLevel = 'seen';
  if (dims.assistedRecognition?.positive > 0) level = higher(level, 'recognized');
  for (const d of RECOGNITION_LEVEL_DIMENSIONS) {
    const e = dims[d];
    if (!e || e.observations === 0) continue;
    if (e.score >= T.known.score && e.observations >= T.known.observations) level = higher(level, 'known');
    else if (e.score >= T.familiar.score && e.observations >= T.familiar.observations) level = higher(level, 'familiar');
    else if (e.positive > 0) level = higher(level, 'recognized');
  }
  for (const d of PRODUCTION_LEVEL_DIMENSIONS) {
    const e = dims[d];
    if (!e || e.observations === 0) continue;
    if (e.positive > 0) level = higher(level, 'recognized');
  }
  return level;
}

/** True when the dimensions hold something against a claim of knowledge: a lookup or help request (exposure.negative) or a failed judgement. */
export function holdsEvidenceAgainst(dims: LevelDimensions): boolean {
  return DIMENSIONS.some((d) => dims[d]?.negative > 0);
}

/** The dimensions whose latest observation is after `markAt` (all other dimensions emptied): the coarse stand-in for "evidence since the mark". */
function dimensionsTouchedAfter(dims: LevelDimensions, markAt: string): LevelDimensions {
  const out = {} as LevelDimensions;
  for (const d of DIMENSIONS) {
    const e = dims[d];
    out[d] = e && e.lastAt !== undefined && Date.parse(e.lastAt) > Date.parse(markAt) ? e : { observations: 0, positive: 0, negative: 0, score: 0.5 };
  }
  return out;
}

/** Why a self-mark does not decide the level, when it does not. */
export type MarkStatus = 'none' | 'in-force' | 'contradicted' | 'released';

/** The status of the learner's mark against the evidence dated after it, with the level the evidence supports. */
export function markStatus(k: LevelInput, since?: LevelDimensions, evidenceDims?: LevelDimensions): { status: MarkStatus; evidence: KnowledgeLevel } {
  const evidence = evidenceLevelOf(evidenceDims ?? k.dimensions);
  const mark = k.selfMark;
  if (!mark) return { status: 'none', evidence };
  const fresh = since ?? dimensionsTouchedAfter(k.dimensions, mark.at);
  if (!DIMENSIONS.some((d) => fresh[d]?.observations > 0)) return { status: 'in-force', evidence };
  // a mark of "new" says "not met": any observation after it is a meeting, so the evidence decides (and it is never below seen)
  if (mark.mark === 'new') return { status: 'released', evidence: higher('seen', evidence) };
  // every other mark holds until the learner marks the word again (2026-10-26, the owner's rule): a lookup, an exposure, a help request, a
  // failed or a correct answer after the mark neither lowers nor raises the level. Before, evidence two levels against the mark contradicted
  // it, so opening the card of a word marked Known read it back down to Seen; and evidence two levels above released it upward.
  return { status: 'in-force', evidence };
}

/**
 * The knowledge level of a unit. With no self-mark: what the evidence supports. With one: the mark, unless later evidence contradicts it or
 * moves far past it, in which case the evidence decides. See the header for every threshold.
 */
export function levelOf(k: LevelInput, since?: LevelDimensions, evidenceDims?: LevelDimensions): KnowledgeLevel {
  const { status, evidence } = markStatus(k, since, evidenceDims);
  return status === 'in-force' ? k.selfMark!.mark : evidence;
}

/** The six levels, lowest first (re-exported so the engine's callers need one import). */
export const LEVELS_IN_ORDER: readonly KnowledgeLevel[] = KNOWLEDGE_LEVELS;
