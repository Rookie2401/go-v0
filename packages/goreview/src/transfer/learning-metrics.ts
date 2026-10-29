/** Descriptive local measures from the canonical event stream; never mastery or causal efficacy claims. */
import { canonicalReviewEventKey, effectiveReviewEvents, selectReviewEvidenceEvents, type GoEvent } from '../../../repository-contract/src';
import type { DeckItem } from '../types';

const DAY = 86_400_000;
const REVIEW_KINDS = new Set(['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed']);
const FULL_SUCCESS = new Set(['correct']);
const DIMENSION = new Map<string, 'reading' | 'listening' | 'production' | 'grammar'>([
  ['written-recognition','reading'], ['meaning-recall','reading'], ['phrase-comprehension','reading'],
  ['meaning-to-target-retrieval','production'], ['productive-recall','production'],
  ['auditory-recognition','listening'], ['auditory-transcription','listening'],
  ['construction-understanding','grammar'], ['morphological-analysis','grammar'],
]);

export interface LearningMetrics {
  independentReviews: number;
  independentConcurrentSiblingAttempts: number;
  delayedAttempts: number;
  /** Delayed events with objective correct OR an explicitly successful Hard/partial retrieval. */
  delayedCorrect: number;
  delayedFullyCorrect: number;
  delayedSuccessfulDifficult: number;
  delayedFailed: number;
  completedDue: number;
  outstandingDue: number;
  overdueCards: number;
  medianOverdueDays: number | null;
  maxOverdueDays: number | null;
  earlyReviews: number;
  dueReviewsObserved: number;
  timedReviewCoverage: number | null;
  delayedRecallCoverage: number | null;
  repeatedFailureCards: number;
  reassessedAfterFailure: number;
  successfulReassessments: number;
  measuredSeconds: number;
  timedReviews: number;
  medianResponseSeconds: number | null;
  delayedRetainedTargets: number;
  secondsPerDelayedRetainedTarget: number | null;
  recognitionThenProduction: number;
  listeningAttempts: number;
  readingAttempts: number;
  productionAttempts: number;
  grammarAttempts: number;
  newAdmissions: number;
  admittedCardsReviewed: number;
  admittedCardsWithDelayedSuccess: number;
  admissionFollowupCoverage: number | null;
  admissionDelayedSuccessRate: number | null;
  remediationPresentations: number;
  remediationSuccessfulOutcomes: number;
  scheduledOverlapPresentations: number;
  explicitPracticePresentations: number;
  predictionSamples: number;
  predictionBrier: number | null;
  audioPredictionSamples: number;
  audioPredictionBrier: number | null;
}

/** Objective full success; a successful difficult recall is returned separately. */
function fullyCorrect(event: GoEvent): boolean {
  const p = event.payload as Record<string, unknown>;
  return p.correct === true && (p.outcome === undefined || FULL_SUCCESS.has(String(p.outcome))) && Number(p.rating) > 1;
}
function successfulDifficult(event: GoEvent): boolean {
  const p = event.payload as Record<string, unknown>;
  // Current GoReview encodes retrievalSucceeded as correct:true, while outcome:'partial' records the minor defect.
  // The evidence quality/reliability gate is applied by the caller; weak self-grades therefore stay out.
  return p.correct === true && p.outcome === 'partial' && Number(p.rating) === 2;
}
function failed(event: GoEvent): boolean {
  const p = event.payload as Record<string, unknown>;
  return p.correct === false || Number(p.rating) === 1 || p.outcome === 'incorrect';
}
function assisted(event: GoEvent): boolean {
  const p = event.payload as Record<string, unknown>;
  return p.hinted === true || p.assisted === true || p.answerShownBefore === true || p.transcriptShownBefore === true ||
    p.retrievalAttempted === false || (Array.isArray(p.assistance) && p.assistance.length > 0) || event.evidence?.assisted === true;
}
function reliableIndependent(event: GoEvent): boolean {
  const p = event.payload as Record<string, unknown>;
  const qualityOkay=(event.evidence?.quality === 'moderate' || event.evidence?.quality === 'strong') &&
    (event.evidence?.sourceReliability === undefined || event.evidence.sourceReliability >= 0.8) && !assisted(event) &&
    (p.responseMode === undefined || p.responseMode === 'typed') && p.choice === undefined && p.selfGraded !== true;
  if(!qualityOkay)return false;
  if(event.kind==='ListeningAssessed') return validListeningAttempt(event)&&p.responseMode==='typed';
  return true;
}
function validListeningAttempt(event:GoEvent):boolean{
  const p=event.payload as Record<string,unknown>;
  return p.voice==='recorded'&&p.answerShownBefore===false&&p.audioPlayed!==false&&p.audioFailed!==true&&p.transcriptShownBefore!==true;
}
function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const mid = sorted.length >>> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
function eventUnit(event: GoEvent): string | undefined {
  const p = event.payload as Record<string, unknown>;
  return event.subject.itemIds?.[0] ?? (typeof p.unitId === 'string' ? p.unitId : undefined);
}
function eventFamily(event: GoEvent): string {
  const p = event.payload as Record<string, unknown>;
  return String(p.assessmentDimension ?? p.family ?? '');
}

export function learningMetrics(events: readonly GoEvent[], deck: readonly DeckItem[], scope: { learnerId: string; languageId: string; now: string }): LearningMetrics {
  const now = Date.parse(scope.now);
  const out: LearningMetrics = {
    independentReviews:0, independentConcurrentSiblingAttempts:0, delayedAttempts:0, delayedCorrect:0, delayedFullyCorrect:0, delayedSuccessfulDifficult:0, delayedFailed:0,
    completedDue:0, outstandingDue:0, overdueCards:0, medianOverdueDays:null, maxOverdueDays:null, earlyReviews:0,
    dueReviewsObserved:0, timedReviewCoverage:null, delayedRecallCoverage:null, repeatedFailureCards:0, reassessedAfterFailure:0,
    successfulReassessments:0, measuredSeconds:0, timedReviews:0, medianResponseSeconds:null, delayedRetainedTargets:0,
    secondsPerDelayedRetainedTarget:null, recognitionThenProduction:0, listeningAttempts:0, readingAttempts:0, productionAttempts:0,
    grammarAttempts:0, newAdmissions:0, admittedCardsReviewed:0, admittedCardsWithDelayedSuccess:0,
    admissionFollowupCoverage:null, admissionDelayedSuccessRate:null, remediationPresentations:0, remediationSuccessfulOutcomes:0,
    scheduledOverlapPresentations:0, explicitPracticePresentations:0, predictionSamples:0, predictionBrier:null,
    audioPredictionSamples:0, audioPredictionBrier:null,
  };
  if (!Number.isFinite(now)) return out;

  // Resolve corrections and causal branches from the complete as-of history; future events must not affect current measures.
  const asOfEvents=events.filter(e=>Number.isFinite(Date.parse(e.at))&&Date.parse(e.at)<=now);
  const selection = selectReviewEvidenceEvents(asOfEvents);
  const rows = selection.events.filter(e => !selection.assistedIds.has(e.id) && typeof e.subject.cardId==='string' && e.subject.cardId.length>0 && e.learnerId === scope.learnerId && e.languageId === scope.languageId &&
    REVIEW_KINDS.has(e.kind) && Number.isInteger(e.payload.rating) && Number(e.payload.rating) >= 1 && Number(e.payload.rating) <= 4 &&
    e.evidence?.quality !== undefined && e.evidence.quality !== 'none' && !assisted(e) &&
    (e.kind!=='ListeningAssessed'||validListeningAttempt(e)) && Number.isFinite(Date.parse(e.at)) && Date.parse(e.at) <= now)
    .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id));

  const priorByCard = new Map<string, GoEvent>(), canonicalSchedulePriorByCard=new Map<string,GoEvent>(), recognitionAt = new Map<string, number>(), retainedCards = new Set<string>(),
    transferredUnits = new Set<string>(), failedCards = new Set<string>(), failuresByCard = new Map<string, number[]>(), admissions = new Map<string, number>(),
    admittedReviewed = new Set<string>(), admittedDelayedSuccess = new Set<string>();
  // Admissions are lifecycle facts, not review events. Count one live create per card before replaying its reviews.
  const lifecycle = effectiveReviewEvents(uniqueSemanticRows(asOfEvents,'CardAdded')).filter(e => e.learnerId === scope.learnerId && e.languageId === scope.languageId && e.kind === 'CardAdded' &&
    Number.isFinite(Date.parse(e.at)) && Date.parse(e.at) <= now && (e.payload as Record<string,unknown>).lifecycle === 'create');
  for (const event of lifecycle) {
    const card=event.subject.cardId; if (!card || admissions.has(card)) continue;
    admissions.set(card,Date.parse(event.at)); out.newAdmissions++;
  }
  const latencies: number[] = [];
  let predictionLoss = 0, audioLoss = 0;
  for (const event of rows) {
    const card = event.subject.cardId;
    if (!card) continue;
    out.independentReviews++;
    if(selection.independentSiblingIds.has(event.id))out.independentConcurrentSiblingAttempts++;
    const prior = priorByCard.get(card), at = Date.parse(event.at), delayed = !!prior && at - Date.parse(prior.at) >= DAY;
    const canonicalScheduleClaim=event.payload.expectedPreviousReviewId===undefined||selection.canonicalIds.has(event.id);
    const schedulePrior=canonicalScheduleClaim?canonicalSchedulePriorByCard.get(card):undefined;
    const scheduleDelayed=!!schedulePrior&&at-Date.parse(schedulePrior.at)>=DAY;
    const reliable = reliableIndependent(event), isFull = fullyCorrect(event), isDifficult = successfulDifficult(event), isSuccess = isFull || isDifficult;
    const unit = eventUnit(event), dimension = DIMENSION.get(eventFamily(event));
    if (event.payload.overlap==='remediation'||event.payload.presentationReason==='remediation-reassessment') {
      out.remediationPresentations++; if (reliable&&isSuccess) out.remediationSuccessfulOutcomes++;
    }
    if (event.payload.overlap==='scheduled') out.scheduledOverlapPresentations++;
    if (event.payload.overlap==='explicit') out.explicitPracticePresentations++;
    const admissionAt=admissions.get(card), admitted=admissionAt!==undefined&&at>=admissionAt;
    if (delayed && reliable) {
      out.delayedAttempts++;
      if (isFull) out.delayedFullyCorrect++;
      if (isDifficult) out.delayedSuccessfulDifficult++;
      if (failed(event)) out.delayedFailed++;
      if (isSuccess) { out.delayedCorrect++; retainedCards.add(card); if (admitted) admittedDelayedSuccess.add(card); }
    }
    if (admitted) admittedReviewed.add(card);
    if (event.payload.rating === 2 && (event.payload.responseMode === 'self-graded' || event.payload.selfGraded === true)) {
      // Counted as observed review load, never as objective successful retrieval.
    }
    const due = typeof event.payload.scheduledDueBefore === 'string' ? Date.parse(event.payload.scheduledDueBefore) : NaN;
    if (canonicalScheduleClaim&&Number.isFinite(due)) { out.dueReviewsObserved++; if (at < due) out.earlyReviews++; else out.completedDue++; }
    if (failedCards.has(card) && delayed && reliable) {
      out.reassessedAfterFailure++;
      if (isSuccess) { out.successfulReassessments++; failedCards.delete(card); }
    }
    if (failed(event)) failedCards.add(card);
    const ratings=failuresByCard.get(card)??[];ratings.push(Number(event.payload.rating));failuresByCard.set(card,ratings.slice(-10));
    const seconds = event.payload.reviewSeconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 && seconds <= 900) { out.measuredSeconds += seconds; out.timedReviews++; latencies.push(seconds); }
    if (dimension === 'reading') out.readingAttempts++;
    if (dimension === 'listening') out.listeningAttempts++;
    if (dimension === 'production') out.productionAttempts++;
    if (dimension === 'grammar') out.grammarAttempts++;
    if (dimension === 'reading' && isSuccess && reliable && unit && !recognitionAt.has(unit)) recognitionAt.set(unit,at);
    if (dimension === 'production' && isSuccess && reliable && unit && recognitionAt.has(unit) && at-recognitionAt.get(unit)! >= DAY) transferredUnits.add(unit);

    const predicted = event.payload.retrievabilityBefore;
    if (canonicalScheduleClaim&&reliable && scheduleDelayed && typeof predicted === 'number' && Number.isFinite(predicted) && predicted >= 0 && predicted <= 1 && (isFull || isDifficult || failed(event))) {
      const actual = isSuccess ? 1 : 0, loss = (predicted-actual)**2;
      predictionLoss += loss; out.predictionSamples++;
      if (dimension === 'listening') { audioLoss += loss; out.audioPredictionSamples++; }
    }
    priorByCard.set(card,event);
    if(canonicalScheduleClaim)canonicalSchedulePriorByCard.set(card,event);
  }
  // Objective GoTell use is an observed transfer outcome, not a review and never inferred from a saved deck.
  const productions=uniqueSemanticRows(asOfEvents,'ProductionRecorded').filter(e=>e.learnerId===scope.learnerId&&e.languageId===scope.languageId&&
    Number.isFinite(Date.parse(e.at))&&Date.parse(e.at)<=now&&!e.correctionOf&&e.producer.app==='gopractice-tell'&&
    (e.evidence?.quality==='moderate'||e.evidence?.quality==='strong')&&
    (e.evidence.sourceReliability===undefined||e.evidence.sourceReliability>=.8)&&!e.evidence.assisted&&
    e.payload.authorship==='independent'&&e.payload.usedCorrectly===true&&e.payload.assisted!==true&&
    !(Array.isArray(e.payload.assistance)&&e.payload.assistance.length));
  for (const production of productions) {
    const ids=[...(production.subject.itemIds??[]),...(typeof production.payload.unitId==='string'?[production.payload.unitId]:[])];
    for (const unit of ids) { const seen=recognitionAt.get(unit); if (seen!==undefined&&Date.parse(production.at)-seen>=DAY) { transferredUnits.add(unit); break; } }
  }
  out.admittedCardsReviewed=admittedReviewed.size;
  out.admittedCardsWithDelayedSuccess=admittedDelayedSuccess.size;
  out.admissionFollowupCoverage=out.newAdmissions ? admittedReviewed.size/out.newAdmissions : null;
  out.admissionDelayedSuccessRate=admittedReviewed.size ? admittedDelayedSuccess.size/admittedReviewed.size : null;
  out.delayedRetainedTargets=retainedCards.size; out.recognitionThenProduction=transferredUnits.size;
  out.medianResponseSeconds=median(latencies);
  out.secondsPerDelayedRetainedTarget=retainedCards.size && out.timedReviews ? out.measuredSeconds/retainedCards.size : null;
  out.timedReviewCoverage=out.independentReviews ? out.timedReviews/out.independentReviews : null;
  out.delayedRecallCoverage=out.independentReviews ? out.delayedAttempts/out.independentReviews : null;
  out.predictionBrier=out.predictionSamples ? predictionLoss/out.predictionSamples : null;
  out.audioPredictionBrier=out.audioPredictionSamples ? audioLoss/out.audioPredictionSamples : null;

  const overdueDays: number[]=[];
  for (const item of deck) {
    // `deck` must be folded as of scope.now; ignore any row that visibly contains future history.
    if(Date.parse(item.addedAt)>now||item.history.some(h=>Number.isFinite(Date.parse(h.at))&&Date.parse(h.at)>now))continue;
    if (item.status !== 'active' || !item.history.some(h=>!h.retracted&&!h.scheduleExcluded&&!h.conflict)) continue;
    const due=Date.parse(item.schedule.due); if (!Number.isFinite(due) || due>now) continue;
    out.outstandingDue++;
    const age=Math.max(0,(now-due)/DAY); overdueDays.push(age); if(age>0) out.overdueCards++;
    const ratings=(failuresByCard.get(item.itemId)??[]).filter(rating=>rating===1).length;
    if(ratings>=5) out.repeatedFailureCards++;
  }
  out.medianOverdueDays=median(overdueDays); out.maxOverdueDays=overdueDays.length?Math.max(...overdueDays):null;
  return out;
}

function uniqueSemanticRows(events:readonly GoEvent[],kind:string):GoEvent[] {
  const byId=new Map<string,Map<string,GoEvent>>();
  for(const event of events) {
    if(event.kind!==kind) continue;
    const shape=canonicalReviewEventKey(event),shapes=byId.get(event.id)??new Map<string,GoEvent>();
    shapes.set(shape,event);byId.set(event.id,shapes);
  }
  return [...byId.values()].filter(shapes=>shapes.size===1).map(shapes=>[...shapes.values()][0]!);
}
