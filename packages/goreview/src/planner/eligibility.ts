import type { GoEvent, UnitKnowledge } from '../../../repository-contract/src';
import type { DeckItem, ReviewIntent } from '../types';
import { confirmedAutomaticFailureUnitsFromSelected, hasConfirmedAutomaticFailure, seenEligibility } from './priority-policy';
import { indexRemediationEvidence, remediationBacklog, type RemediationCandidate, type RemediationEvidenceIndex } from './remediation';
import { selectReviewEvidenceEvents } from '../../../repository-contract/src';
export interface ReviewEligibilityContext {
  selectedReviewEvidence: ReturnType<typeof selectReviewEvidenceEvents>;
  sortedEvents: readonly GoEvent[];
  latestMarkByUnit: ReadonlyMap<string, string>;
  latestLifecycleByCard: ReadonlyMap<string, GoEvent>;
  reviewEventsByCard: ReadonlyMap<string, readonly GoEvent[]>;
  automaticFailureUnits: ReadonlySet<string>;
  remediationByCard: ReadonlyMap<string, RemediationCandidate>;
  remediationEvidence: RemediationEvidenceIndex;
}
export interface ReviewEligibilityInput { item?: DeckItem; itemId?: string; unitId: string; knowledge?: UnitKnowledge; events: readonly GoEvent[]; now: string; intent?: ReviewIntent; remainingNew?: number; factsInvalidated?: boolean; context?: ReviewEligibilityContext }
export interface ReviewEligibilityResult { eligible: boolean; reason?: string }

/** One immutable evidence/index snapshot shared by every card in a single planning call. */
export function createReviewEligibilityContext(deck: readonly DeckItem[], events: readonly GoEvent[], now: string): ReviewEligibilityContext {
  const sortedEvents = [...events].filter(e => Number.isFinite(Date.parse(e.at))).sort((a,b) => Date.parse(a.at)-Date.parse(b.at) || a.id.localeCompare(b.id));
  const latestMarkByUnit = new Map<string, string>(), latestLifecycleByCard = new Map<string, GoEvent>();
  const reviewEventsByCard = new Map<string, GoEvent[]>();
  for (const e of sortedEvents) {
    if (e.kind === 'ItemMarked' && typeof e.payload.mark === 'string') for (const unitId of e.subject.itemIds ?? []) latestMarkByUnit.set(unitId, e.payload.mark);
    if (e.subject.cardId && (e.kind === 'CardRemoved' || e.kind === 'ReviewItemInvalidated' || e.kind === 'CardAdded' && e.payload.lifecycle !== 'create')) latestLifecycleByCard.set(e.subject.cardId, e);
    if (e.subject.cardId && ['CardReviewed','AssessmentAnswered','ListeningAssessed'].includes(e.kind)) (reviewEventsByCard.get(e.subject.cardId) ?? reviewEventsByCard.set(e.subject.cardId, []).get(e.subject.cardId)!).push(e);
  }
  const selectedReviewEvidence = selectReviewEvidenceEvents(events);
  const selected = selectedReviewEvidence.events;
  const remediationEvidence = indexRemediationEvidence(events, selected);
  const remediationByCard = new Map(remediationBacklog(deck, events, now, remediationEvidence).map(row => [row.itemId, row]));
  return { selectedReviewEvidence, sortedEvents, latestMarkByUnit, latestLifecycleByCard, reviewEventsByCard,
    automaticFailureUnits: confirmedAutomaticFailureUnitsFromSelected(selected), remediationByCard, remediationEvidence };
}

export function reviewEligibility(x: ReviewEligibilityInput): ReviewEligibilityResult {
  const t = Date.parse(x.now), item = x.item;
  if (!Number.isFinite(t)) return { eligible: false, reason: 'invalid planning timestamp' };
  const intent = x.intent ?? { kind: 'automatic' }, explicit = intent.kind === 'explicit';
  if (explicit && (!Number.isFinite(Date.parse(intent.requestedAt)) || Date.parse(intent.requestedAt) > t)) return { eligible: false, reason: 'invalid explicit practice request' };
  if (item?.schedulingIssue || item?.invalidatedAt) return {eligible:false,reason:item.schedulingIssue ?? item.suspendedReason ?? 'question invalidated; a verified facts repair is required'};
  if (item?.status === 'dismissed' || item?.status === 'suspended') return { eligible: false, reason: item.suspendedReason ?? (item.status + '; resume deliberately before practice') };
  if (item?.status === 'snoozed' && (!item.snoozedUntil || !Number.isFinite(Date.parse(item.snoozedUntil)) || Date.parse(item.snoozedUntil) > t)) return { eligible: false, reason: 'snoozed until its deadline' };
  const sorted = x.context?.sortedEvents ?? [...x.events].filter(e => Number.isFinite(Date.parse(e.at))).sort((a,b) => Date.parse(a.at)-Date.parse(b.at) || a.id.localeCompare(b.id));
  const mark = x.context ? x.context.latestMarkByUnit.get(x.unitId)
    : sorted.filter(e => e.kind === 'ItemMarked' && e.subject.itemIds?.includes(x.unitId)).at(-1)?.payload.mark;
  if (mark === 'ignore') return {eligible:false,reason:'dismissed vocabulary; restore it deliberately before practice'};
  const cardId = item?.itemId ?? x.itemId;
  const lifecycle = cardId ? (x.context ? x.context.latestLifecycleByCard.get(cardId)
    : sorted.filter(e => e.subject.cardId === cardId && (e.kind === 'CardRemoved' || e.kind === 'ReviewItemInvalidated' || e.kind === 'CardAdded' && e.payload.lifecycle !== 'create')).at(-1)) : undefined;
  if (lifecycle?.kind === 'ReviewItemInvalidated') return {eligible:false,reason:'question invalidated; repair its facts before assessment'};
  if (lifecycle?.kind === 'CardRemoved') {
    const reason = lifecycle.payload.reason, until = Date.parse(String(lifecycle.payload.until));
    if (reason === 'suspended' || reason === 'dismissed' || reason === 'snoozed' && (!Number.isFinite(until) || until > t))
      return {eligible:false,reason:String(reason) + '; learner control remains effective'};
  }
  if (x.factsInvalidated) return { eligible: false, reason: 'exercise facts are invalid or unavailable' };
  const history = item?.history.filter(h => !h.retracted && !h.scheduleExcluded && !h.conflict) ?? [];
  const due = !!item && history.length > 0 && Date.parse(item.schedule.due) <= t;
  if (item) {
    const indexedRepair = x.context?.remediationByCard.get(item.itemId);
    const repair = indexedRepair && indexedRepair.readyAt && Date.parse(x.now) >= Date.parse(indexedRepair.readyAt)
      ? { ...indexedRepair, ready: true }
      : x.context ? indexedRepair : remediationBacklog([item], x.events, x.now)[0];
    // Fallback histories are useful to old local sessions without a complete event replica.
    // Legacy session snapshots may omit the shared event log. Use the conservative history
    // fallback only when its effective review IDs are not represented in the event stream;
    // an authoritative projection can then deliberately clear a repaired leech.
    const reviewEvents = x.context ? (x.context.reviewEventsByCard.get(item.itemId) ?? [])
      : x.events.filter(e => e.subject?.cardId === item.itemId && ['CardReviewed','AssessmentAnswered','ListeningAssessed'].includes(e.kind));
    const historyRepresented = history.length > 0 && history.every(h => !!h.eventId && reviewEvents.some(e => e.id === h.eventId));
    const repairRequired = repair?.repairRequired ?? (!historyRepresented && history.slice(-10).filter(h => h.rating === 1).length >= 5);
    if (repairRequired && !(explicit && intent.reason === 'reassessment' && repair?.ready)) return { eligible: false, reason: 'content repair and a delayed independent reassessment are required' };
  }
  if (!history.length) {
    if (!explicit && (!x.knowledge?.level || x.knowledge.level === 'new')) return { eligible: false, reason: 'automatic admission needs observed knowledge beyond New' };
    if (!explicit && x.remainingNew !== undefined && x.remainingNew <= 0) return { eligible: false, reason: 'new-card budget exhausted' };
    if (!explicit && x.knowledge?.level === 'seen' && !seenEligibility({ knowledge: x.knowledge })) return { eligible: false, reason: 'Seen has insufficient admission evidence' };
  }
  // A due obligation survives Knowability promotion to Automatic.
  if (due) return { eligible: true };
  if (!explicit && x.knowledge?.level === 'automatic' && !(x.context ? x.context.automaticFailureUnits.has(x.unitId) : hasConfirmedAutomaticFailure(x.events, x.unitId))) return { eligible: false, reason: 'Automatic suppresses optional practice' };
  if (item && history.length && !explicit) return { eligible: false, reason: 'not due; early review requires an explicit request' };
  return { eligible: true };
}
