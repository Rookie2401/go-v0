/**
 * Review eligibility (§11): which analyses may support an assessment of which dimension.
 *
 * Two inputs decide, and they are not interchangeable (a row with no validation stated is a v2 row and reads as `unreviewed`, as the contract's `provenanceOf` says):
 *  - the analysis STATUS (how sure the producer is: verified, high-confidence, provisional, requires-review, conflicted, invalidated);
 *  - the VALIDATION level of the unit and analysis (how far the resource behind it has been checked: production-validated,
 *    experimental, seed-only, unreviewed, incomplete, unsupported).
 * Confidence alone never raises a status, and a status never outruns its validation: an experimental, seed-only or unreviewed
 * analysis is at most `provisional` whatever number its producer attached, and an incomplete or unsupported one needs review.
 *
 * Gate table (README has the same one):
 *   validation                          status reached          eligible for
 *   production-validated                as stated               verified, high-confidence: every dimension; provisional: recognition only
 *   experimental / seed-only / unreviewed  capped at provisional   recognition dimensions only, with caveats; never grammatical, productive or phrase items
 *   incomplete / unsupported            requires-review         nothing
 * conflicted, invalidated, requires-review and an unknown unit are never eligible, each with a reason.
 */
import { STATUS_RANK, provenanceOf } from '../../repository-contract/src';
import type { AnalysisStatus, Dimension, FormAnalysis, LinguisticUnit, ReviewEligibility, ValidationLevel } from '../../repository-contract/src';

/** Dimensions a provisional analysis may still be reviewed for. */
export const RECOGNITION_DIMENSIONS: readonly Dimension[] = ['readingRecognition', 'listeningRecognition', 'assistedRecognition'];

/** The engine's name for the contract's status rank: verified > high-confidence > provisional > requires-review > conflicted > invalidated (higher is more trustworthy). */
export type EffectiveStatus = AnalysisStatus;
export const STATUS_ORDER: Readonly<Record<AnalysisStatus, number>> = STATUS_RANK;
const statusRank = (s: string): number => (Object.prototype.hasOwnProperty.call(STATUS_ORDER, s) ? STATUS_ORDER[s as AnalysisStatus] : 0);

/** The contract's validation levels ordered by how far the resource has been checked, lowest trust first (the contract lists them in another order). */
export const VALIDATION_ORDER: readonly ValidationLevel[] = ['unsupported', 'incomplete', 'unreviewed', 'seed-only', 'experimental', 'production-validated'];
const validationRank = (v: ValidationLevel): number => VALIDATION_ORDER.indexOf(v);

/** Levels that cap a status at `provisional`. */
const CAPPED: ReadonlySet<ValidationLevel> = new Set<ValidationLevel>(['experimental', 'seed-only', 'unreviewed']);
/** Levels that make the analysis unusable until a person reviews it. */
const UNUSABLE: ReadonlySet<ValidationLevel> = new Set<ValidationLevel>(['incomplete', 'unsupported']);

/**
 * The validation level a provenance states, read as the contract reads it (`provenanceOf`): a v2 row with none is `unreviewed`, and so is a value this
 * engine does not know. undefined only when there is no provenance at all.
 */
function statedValidation(p: UnitProvenanceLike | undefined): ValidationLevel | undefined {
  if (!p) return undefined;
  const v: string = provenanceOf(p).validation;
  return (VALIDATION_ORDER as readonly string[]).includes(v) ? (v as ValidationLevel) : 'unreviewed';
}
type UnitProvenanceLike = Parameters<typeof provenanceOf>[0];

const lowestValidation = (xs: Array<ValidationLevel | undefined>): ValidationLevel | undefined =>
  xs.reduce<ValidationLevel | undefined>((lo, v) => (v === undefined ? lo : lo === undefined || validationRank(v) < validationRank(lo) ? v : lo), undefined);

/** The validation of an analysis: the lowest of its own provenance (if any) and its chosen candidate's (every candidate's when none is chosen). */
export function validationOfAnalysis(a: FormAnalysis): ValidationLevel | undefined {
  const cands = a.chosen !== undefined && a.candidates[a.chosen] ? [a.candidates[a.chosen]] : a.candidates;
  return lowestValidation([statedValidation(a.provenance), ...cands.map((c) => statedValidation(c.provenance))]);
}

/** Validation the unit and its best live analysis together support: the lowest of the two. */
export function effectiveValidation(unit: LinguisticUnit, best: FormAnalysis | undefined): ValidationLevel | undefined {
  return lowestValidation([statedValidation(unit.provenance), best ? validationOfAnalysis(best) : undefined]);
}

/** The best (highest-status) live analysis of a form, or undefined. */
function bestLive(analyses: FormAnalysis[]): FormAnalysis | undefined {
  const live = analyses.filter((a) => a.status !== 'invalidated');
  return live.length ? live.reduce((a, b) => (statusRank(b.status) > statusRank(a.status) ? b : a)) : undefined;
}

/** The validation level the unit and its best live analysis support, for the candidate rules (undefined = none stated). */
export const validationFor = (unit: LinguisticUnit, analyses: FormAnalysis[]): ValidationLevel | undefined => effectiveValidation(unit, bestLive(analyses));

const no = (status: AnalysisStatus, reason: string): ReviewEligibility => ({ eligible: false, status, reason });

export function eligibilityFor(unit: LinguisticUnit | undefined, analyses: FormAnalysis[], target: Dimension): ReviewEligibility {
  if (!unit) return { eligible: false, status: 'unknown', reason: 'unit is not in the linguistic store' };
  // A unit replaced by a corrected one is history: its answer key must not be used again (the alias says by what).
  if (unit.supersededBy) return no('invalidated', `superseded by ${unit.supersededBy}`);
  // An invalidated analysis is history. If a form has analyses and none is live, the form has no usable reading.
  const live = analyses.filter((a) => a.status !== 'invalidated');
  if (analyses.length > 0 && live.length === 0) return no('invalidated', 'every analysis of this form is invalidated');
  let status: AnalysisStatus = unit.status;
  const caveats: string[] = [];
  let best: FormAnalysis | undefined;
  if (live.length > 0) {
    best = live.reduce((a, b) => (statusRank(b.status) > statusRank(a.status) ? b : a));
    if (statusRank(best.status) < statusRank(status)) status = best.status;
    if (best.candidates.length > 1 && best.chosen === undefined) caveats.push(`ambiguous: ${best.candidates.length} readings, none chosen`);
  }
  if (status === 'invalidated') return no(status, 'analysis invalidated');
  if (status === 'conflicted') return no(status, 'analysis conflicted: sources disagree');
  if (status === 'requires-review') return no(status, 'analysis requires review before it can support an item');

  const validation = effectiveValidation(unit, best);
  if (validation !== undefined && UNUSABLE.has(validation)) {
    return no('requires-review', `${validation} analysis: a person must review it before it can support an item (confidence does not change this)`);
  }
  if (validation !== undefined && CAPPED.has(validation)) {
    // Confidence alone never raises a status: whatever the producer's number, this resource has not been validated for production.
    if (statusRank(status) > statusRank('provisional')) status = 'provisional';
    if (!RECOGNITION_DIMENSIONS.includes(target)) return no(status, `${validation} analysis cannot support ${target}: provisional at best, recognition only`);
    return { eligible: true, status: status, caveats: ['provisional analysis; shown with caveats', `${validation} resource: provisional at best, whatever the confidence`, ...caveats] };
  }
  if (status === 'provisional') {
    if (!RECOGNITION_DIMENSIONS.includes(target)) return no(status, `provisional analysis cannot support ${target}`);
    return { eligible: true, status: status, caveats: ['provisional analysis; shown with caveats', ...caveats] };
  }
  return { eligible: true, status: status, caveats };
}

/** Unit ids an analysis's candidates referenced (lexeme, sense, constructions): the review items to re-check when it is invalidated. */
export function affectedByInvalidation(analysis: FormAnalysis): string[] {
  const ids = new Set<string>();
  for (const c of analysis.candidates) {
    if (c.lexemeId) ids.add(c.lexemeId);
    if (c.senseId) ids.add(c.senseId);
    for (const k of c.constructionIds ?? []) ids.add(k);
  }
  return [...ids].sort();
}

/**
 * What a correction touches: every id the superseded analyses pointed at (`affected`, sorted) and the ones the corrected
 * analysis no longer points at (`withdraw`, sorted): the review items and candidates to withdraw. Ids both point at stay valid.
 */
export function affectedByCorrection(superseded: FormAnalysis[], corrected: FormAnalysis): { affected: string[]; withdraw: string[] } {
  const before = new Set(superseded.flatMap(affectedByInvalidation));
  const after = new Set(affectedByInvalidation(corrected));
  return { affected: [...new Set([...before, ...after])].sort(), withdraw: [...before].filter((i) => !after.has(i)).sort() };
}
