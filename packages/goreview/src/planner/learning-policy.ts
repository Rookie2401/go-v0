import { selectReviewEvidenceEvents, type GoEvent, type ReviewCandidate, type UnitKnowledge } from '../../../repository-contract/src';
import type { AssessmentDimension, DeckItem, ExerciseFamily, ReviewPreferences } from '../types';
export interface PracticeChoice { dimension: AssessmentDimension; family: ExerciseFamily }
export type PracticeEvidenceByUnit = ReadonlyMap<string, readonly GoEvent[]>;
export interface ChoosePracticeInput { candidate: ReviewCandidate; knowledge?: UnitKnowledge; preferences: ReviewPreferences; events: readonly GoEvent[]; deck: readonly DeckItem[]; now: string; evidenceByUnit?: PracticeEvidenceByUnit }
export function indexPracticeEvidence(events: readonly GoEvent[]): PracticeEvidenceByUnit {
  const byUnit = new Map<string, GoEvent[]>();
  for (const event of events) {
    if (!['CardReviewed','AssessmentAnswered','ListeningAssessed'].includes(event.kind)) continue;
    for (const unitId of event.subject?.itemIds ?? []) (byUnit.get(unitId) ?? byUnit.set(unitId, []).get(unitId)!).push(event);
  }
  return byUnit;
}
/** One objective at a time. Recognition evidence is necessary before productive progression;
 * eligibility, facts and audio validity are independent caller gates.
 */
export function choosePractice({candidate,knowledge,preferences,events,deck,now,evidenceByUnit}: ChoosePracticeInput): PracticeChoice | undefined {
  const goals = new Set(preferences.practiceGoals ?? ['recognition']);
  const nowMs = Date.parse(now);
  const excludedIds = new Set(deck.filter(item => item.unitId === candidate.unitId)
    .flatMap(item => item.history.filter(h => h.retracted || h.scheduleExcluded || h.conflict).map(h => h.eventId).filter((id): id is string => !!id)));
  const candidateEvents = evidenceByUnit?.get(candidate.unitId)
    ?? indexPracticeEvidence(selectReviewEvidenceEvents(events).events).get(candidate.unitId) ?? [];
  const rows = candidateEvents.filter(e => e.languageId === preferences.languageId
    && !excludedIds.has(e.id)
    && ['CardReviewed','AssessmentAnswered','ListeningAssessed'].includes(e.kind)
    && ['written-recognition','phrase-comprehension'].includes(String(e.payload.family))
    && (e.payload.rating === 3 || e.payload.rating === 4) && e.payload.correct === true && (e.payload.outcome === undefined || e.payload.outcome === 'correct')
    && e.payload.hinted !== true && e.payload.answerShownBefore !== true && e.payload.transcriptShownBefore !== true && e.payload.retrievalAttempted !== false
    && !e.evidence?.assisted && ['moderate','strong'].includes(String(e.evidence?.quality))
    && Number.isFinite(Date.parse(e.at)) && Number.isFinite(nowMs) && Date.parse(e.at) <= nowMs)
    .sort((a,b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
  // Conflicting immutable ids and non-canonical review branches are removed by the shared projection above.
  const successes = rows.filter((e, i) => rows.findIndex(x => x.id === e.id) === i);
  const level = knowledge?.level;
  const target = candidate.objectiveDimension ?? candidate.targetDimension;
  // New items are taught by GoLearn; GoReview may only offer explicit, low-stakes recognition.
  // Intake independently rejects automatic New admissions.
  if (!level || level === 'new' || level === 'seen') return goals.has('recognition')
    ? (candidate.kind === 'multiword' ? {dimension:'phrase-comprehension',family:'phrase-comprehension'} : {dimension:'written-recognition',family:'written-recognition'})
    : undefined;
  const spacedRecognition = successes.length >= 2
    && Date.parse(successes.at(-1)!.at) - Date.parse(successes[0].at) >= 86_400_000;
  const ready = ['familiar','known','automatic'].includes(level) && spacedRecognition
    || level === 'recognized' && candidate.targetDimension === 'productiveRetrieval' && spacedRecognition;
  const establishedForApplication = ['familiar','known','automatic'].includes(level) && spacedRecognition;
  if (establishedForApplication && goals.has('listening') && preferences.includeListening && target === 'listeningRecognition')
    return {dimension:'auditory-recognition',family:'audio-to-meaning'};
  if (ready && goals.has('retrieval') && target === 'productiveRetrieval' && ['lexeme','form'].includes(candidate.kind))
    return {dimension:'meaning-to-target-retrieval',family:'meaning-to-form'};
  if (establishedForApplication && goals.has('application') && target === 'grammaticalUnderstanding' && ['form','morph-construction'].includes(candidate.kind))
    return candidate.kind === 'form' ? {dimension:'morphological-analysis',family:'morphological-identification'} : {dimension:'construction-understanding',family:'grammar-application'};
  if (establishedForApplication && goals.has('application') && target === 'contextualProduction')
    return {dimension:'productive-recall',family:'sentence-completion'};
  // A repository candidate that names a secondary objective must not silently
  // fall back to written recognition when its level, spaced evidence, preference,
  // or supported exercise family does not admit that objective.
  if (candidate.objectiveDimension && candidate.objectiveDimension !== candidate.targetDimension) return undefined;
  if (goals.has('recognition') || goals.has('retrieval')) return candidate.kind === 'multiword'
    ? {dimension:'phrase-comprehension',family:'phrase-comprehension'} : {dimension:'written-recognition',family:'written-recognition'};
  return undefined;
}
