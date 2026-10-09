/**
 * Review eligibility (§11): which analyses may support an assessment of which dimension.
 * verified / high-confidence: eligible. provisional: eligible to be shown for recognition only, with a caveat; never
 * as the basis of a grammar or productive item. conflicted, invalidated or unknown: not eligible, with the reason.
 */
import { STATUS_RANK } from '../../repository-contract/src';
import type { AnalysisStatus, Dimension, FormAnalysis, LinguisticUnit, ReviewEligibility } from '../../repository-contract/src';

/** Dimensions a provisional analysis may still be reviewed for. */
export const RECOGNITION_DIMENSIONS: readonly Dimension[] = ['readingRecognition', 'listeningRecognition', 'assistedRecognition'];

export function eligibilityFor(unit: LinguisticUnit | undefined, analyses: FormAnalysis[], target: Dimension): ReviewEligibility {
  if (!unit) return { eligible: false, status: 'unknown', reason: 'unit is not in the linguistic store' };
  // An invalidated analysis is history. If a form has analyses and none is live, the form has no usable reading.
  const live = analyses.filter((a) => a.status !== 'invalidated');
  if (analyses.length > 0 && live.length === 0) return { eligible: false, status: 'invalidated', reason: 'every analysis of this form is invalidated' };
  let status: AnalysisStatus = unit.status;
  const caveats: string[] = [];
  if (live.length > 0) {
    const best = live.reduce((a, b) => (STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a));
    if (STATUS_RANK[best.status] < STATUS_RANK[status]) status = best.status;
    if (best.candidates.length > 1 && best.chosen === undefined) caveats.push(`ambiguous: ${best.candidates.length} readings, none chosen`);
  }
  if (status === 'invalidated') return { eligible: false, status, reason: 'analysis invalidated' };
  if (status === 'conflicted') return { eligible: false, status, reason: 'analysis conflicted: sources disagree' };
  if (status === 'provisional') {
    if (!RECOGNITION_DIMENSIONS.includes(target)) return { eligible: false, status, reason: `provisional analysis cannot support ${target}` };
    return { eligible: true, status, caveats: ['provisional analysis; shown with caveats', ...caveats] };
  }
  return { eligible: true, status, caveats };
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
