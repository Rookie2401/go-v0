import { effectiveReviewEvents, type GoEvent } from '../../packages/repository-contract/src';
import { createFsrsScheduler, foldDeck } from '../../packages/goreview/src/scheduler';
/** Node-only personalization. Never bundled in the reader or run after each grade. */
import { computeParameters, FSRSBinding, FSRSBindingItem, FSRSBindingReview } from '@open-spaced-repetition/binding';
import { default_w } from 'ts-fsrs';

export const OPTIMIZATION_POLICY = Object.freeze({ version: 'goreview-optimization@1', minReviews: 400, minTargets: 50, minDays: 60, holdoutFraction: 0.2 });
export interface ReliableReview {
  eventId: string; targetId: string; languageId: string; objective: string; at: string;
  rating: 1 | 2 | 3 | 4; independent: boolean; corrected?: boolean;
}
export interface OptimizationReport {
  status: 'insufficient-history' | 'not-improved' | 'candidate';
  reason: string; policyVersion: string; reviews: number; targets: number;
  parameters?: number[];
  baseline?: { logLoss: number; rmseBins: number };
  candidate?: { logLoss: number; rmseBins: number };
  /** A candidate is not an active profile. Activation must be an explicit repository operation. */
  automaticallyActivated: false;
}

const DAY = 86_400_000;

/** Reject unreliable events, duplicate ids, mixed objectives and invalid clocks before ML. */
export function prepareOptimization(history: ReliableReview[], languageId: string, objective: string) {
  const seen = new Set<string>();
  const rows = history.filter((r) => {
    if (!r.independent || r.corrected || r.languageId !== languageId || r.objective !== objective
      || !r.eventId || !r.targetId || !Number.isFinite(Date.parse(r.at)) || ![1, 2, 3, 4].includes(r.rating)
      || seen.has(r.eventId)) return false;
    seen.add(r.eventId); return true;
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.eventId.localeCompare(b.eventId));
  const grouped = new Map<string, ReliableReview[]>();
  for (const row of rows) { const group = grouped.get(row.targetId) ?? []; group.push(row); grouped.set(row.targetId, group); }
  // Count actual delayed retrievals; hundreds of same-day clicks do not meet the gate.
  const delayed = [...grouped.values()].reduce((sum, group) => sum + group.slice(1).filter((r, i) => Date.parse(r.at) - Date.parse(group[i].at) >= DAY).length, 0);
  const spanDays = rows.length ? (Date.parse(rows.at(-1)!.at) - Date.parse(rows[0].at)) / DAY : 0;
  return { rows, grouped, delayed, spanDays };
}

export async function optimizeReviewProfile(history: ReliableReview[], scope: { languageId: string; objective: string }, currentParameters: number[] = [...default_w]): Promise<OptimizationReport> {
  if (currentParameters.length !== 21 || currentParameters.some((x) => !Number.isFinite(x))) throw new RangeError('The active FSRS profile must contain 21 finite parameters.');
  const prepared = prepareOptimization(history, scope.languageId, scope.objective);
  const base = { policyVersion: OPTIMIZATION_POLICY.version, reviews: prepared.delayed, targets: prepared.grouped.size, automaticallyActivated: false as const };
  if (prepared.delayed < OPTIMIZATION_POLICY.minReviews || prepared.grouped.size < OPTIMIZATION_POLICY.minTargets || prepared.spanDays < OPTIMIZATION_POLICY.minDays
    || !prepared.rows.some((r) => r.rating === 1) || !prepared.rows.some((r) => r.rating > 1)) {
    return { ...base, status: 'insufficient-history', reason: 'Keep the supported defaults: more varied independent delayed retrieval history is needed.' };
  }
  const cutoff = Date.parse(prepared.rows[Math.floor(prepared.rows.length * (1 - OPTIMIZATION_POLICY.holdoutFraction))].at);
  const train: FSRSBindingItem[] = [], heldout: FSRSBindingItem[] = [];
  for (const group of prepared.grouped.values()) {
    const reviews: FSRSBindingReview[] = [];
    for (let i = 0; i < group.length; i++) {
      const elapsed = i ? Math.floor((Date.parse(group[i].at) - Date.parse(group[i - 1].at)) / DAY) : 0;
      reviews.push(new FSRSBindingReview(group[i].rating, elapsed));
      if (i === 0 || elapsed < 1) continue;
      const item = new FSRSBindingItem([...reviews]);
      (Date.parse(group[i].at) < cutoff ? train : heldout).push(item);
    }
  }
  if (train.length < 200 || heldout.length < 50) return { ...base, status: 'insufficient-history', reason: 'The chronological validation split is too small.' };
  const baseline = new FSRSBinding(currentParameters).evaluate(heldout);
  const parameters = await computeParameters(train, { enableShortTerm: true, numRelearningSteps: 1, timeout: 30_000 });
  if (parameters.length !== 21 || parameters.some((x) => !Number.isFinite(x))) throw new Error('The official optimizer returned invalid parameters.');
  const candidate = new FSRSBinding(parameters).evaluate(heldout);
  const finite = [baseline.logLoss, baseline.rmseBins, candidate.logLoss, candidate.rmseBins].every(Number.isFinite);
  const improved = finite && candidate.logLoss < baseline.logLoss && candidate.rmseBins <= baseline.rmseBins;
  return { ...base, status: improved ? 'candidate' : 'not-improved', reason: improved
    ? 'A candidate improved chronological held-out prediction; it requires explicit activation.'
    : 'Keep the current profile: the candidate did not improve both validation measures.', baseline, candidate, ...(improved ? { parameters } : {}) };
}

/** Adapt raw exported activity to the same effective memory history used by the application.
 * Raw concurrent branches remain evidence, but cannot train FSRS as sequential retrievals.
 */
export function reliableReviewHistory(events: GoEvent[], languageId: string): ReliableReview[] {
  const learners=[...new Set(events.map(e=>e.learnerId))];
  if(learners.length>1)throw new Error('Optimize one learner at a time.');
  const instants=events.map(e=>Date.parse(e.at)).filter(Number.isFinite);
  const folded=foldDeck(events,createFsrsScheduler(),{languageId,learnerId:learners[0],now:new Date(instants.length?instants.reduce((a,b)=>Math.max(a,b),0):0).toISOString()});
  const valid=new Set(folded.items.flatMap(i=>i.history.filter(h=>!h.retracted&&!h.scheduleExcluded&&!h.conflict).map(h=>h.eventId)));
  return effectiveReviewEvents(events).filter(e=>valid.has(e.id)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||(a.id<b.id?-1:a.id>b.id?1:0)).map(e=>({
    eventId:e.id,targetId:e.subject.cardId!,languageId:e.languageId,
    objective:String(e.payload.assessmentDimension??e.payload.family??'unknown'),at:e.at,rating:e.payload.rating as 1|2|3|4,
    independent:e.evidence?.quality!==undefined && e.evidence.quality!=='none' && e.evidence.assisted!==true && e.payload.hinted!==true
      && e.payload.answerShownBefore!==true && e.payload.retrievalAttempted!==false,
  }));
}
