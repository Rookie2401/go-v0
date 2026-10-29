/**
 * PLANNING — composes one review session from the deck, the intake outcomes and the learner's preferences. Pure: it
 * reads, it never writes. A plan is a proposal; nothing is recorded until the learner answers (the session runner).
 *
 * Due learning precedes overdue reviews; stage attention ranks comparable work. Remediation is a separate persistent projection.
 *
 * Time. Estimated seconds per item (estimates, not measurements): written recognition / meaning-to-form 25 s; a CHOICE
 * question 15 s (written recognition and phrase comprehension while the item is still new or learning, because those are
 * offered as choices first); grammar (morphological identification, grammar application) 35 s; sentence completion 40 s;
 * audio 30 s plus 8 s for each EXPECTED replay (one is assumed). The plan never exceeds `sessionMinutes`.
 *
 * Listening. A listening item is planned only when `includeListening && audio.available`. Otherwise its listening
 * obligation remains due and the item is skipped; written practice cannot replace a listening assessment. When audio is
 * available but only practice (not evidence-eligible), the item is planned and flagged and records no knowledge evidence.
 *
 * Cost/benefit. benefit = retrievability deficit (1 − recall probability; 1 for a new item) × the Repository's candidate
 * score (0.5 when the unit has no candidate) ÷ cost, with cost = estimated seconds / 30 × (1 + candidate.cost). The
 * versioned Knowability priority multiplies this value within comparable scheduling queues.
 */
import type {
  AudioAvailability, DeckItem, ExerciseFamily, IntakeOutcome, PlannedItem, ReviewPreferences, Scheduler, SessionPlan,
} from '../types';
import { createReviewEligibilityContext, reviewEligibility } from './eligibility';
import { admissionBudget } from './budget';
import { selectReviewEvidenceEvents, type GoEvent, type UnitKnowledge } from '../../../repository-contract/src';
import { FAMILY_DIMENSION } from '../types';
import { itemIdFor } from '../scheduler/deck';
import { cardReasonFor } from '../intake/intake';
import { scoreReviewPriority, type KnowabilityPolicy } from './priority-policy';
import { chooseMicrodeckTarget, microdeckMaximum, type MicrodeckObservation, type MicrodeckPolicyOptions } from './microdeck';
import { workloadAwareAdmission, type WorkloadAdmissionPolicy } from './admission-policy';

const GRAMMAR_FAMILY_SET: ReadonlySet<ExerciseFamily> = new Set<ExerciseFamily>(['morphological-identification', 'grammar-application']);
const AUDIO_FAMILY_SET: ReadonlySet<ExerciseFamily> = new Set<ExerciseFamily>(['audio-to-meaning', 'audio-transcription']);

/** Seconds per kind of item; estimates the planner documents and a host may replace with measured latencies. */
export const ESTIMATED_SECONDS = { written: 25, choice: 15, grammar: 35, sentenceCompletion: 40, audio: 30, replay: 8 } as const;
export const EXPECTED_REPLAYS = 1;
export const WEAK_AGAIN_COUNT = 2;
export const WEAK_WINDOW = 10;
export const LEECH_AGAIN_THRESHOLD = 5;
const REVIEW_FAMILIES: ReadonlySet<string> = new Set(['written-recognition','meaning-to-form','morphological-identification','grammar-application','phrase-comprehension','sentence-completion','audio-to-meaning','audio-transcription']);

export const isGrammarFamily = (f: ExerciseFamily): boolean => GRAMMAR_FAMILY_SET.has(f);
export const isAudioFamily = (f: ExerciseFamily): boolean => AUDIO_FAMILY_SET.has(f);

/** The written family that asks the same recognition-or-retrieval question without sound. */
export const writtenCounterpart = (f: ExerciseFamily): ExerciseFamily => {
  if (f === 'audio-to-meaning') return 'written-recognition';
  if (f === 'audio-transcription') return 'meaning-to-form';
  return f;
};

export function estimateSeconds(family: ExerciseFamily, phase?: DeckItem['schedule']['phase']): number {
  const E = ESTIMATED_SECONDS;
  switch (family) {
    case 'written-recognition':
    case 'phrase-comprehension': return phase === 'new' || phase === 'learning' ? E.choice : E.written;
    case 'meaning-to-form': return E.written;
    case 'morphological-identification':
    case 'grammar-application': return E.grammar;
    case 'sentence-completion': return E.sentenceCompletion;
    case 'audio-to-meaning':
    case 'audio-transcription': return E.audio + E.replay * EXPECTED_REPLAYS;
  }
}

export function microdeckObservations(events: readonly GoEvent[], languageId: string, now: string, selectedInput?: ReturnType<typeof selectReviewEvidenceEvents>): MicrodeckObservation[] {
  const cutoff = Date.parse(now) - 90 * 86_400_000;
  const selected = selectedInput ?? selectReviewEvidenceEvents(events);
  const rows = selected.events.filter(event => (event.payload.expectedPreviousReviewId === undefined || selected.canonicalIds.has(event.id)) && (() => {
    const payload = event.payload;
    return event.languageId === languageId && ['CardReviewed','AssessmentAnswered','ListeningAssessed'].includes(event.kind)
      && typeof payload.family === 'string' && REVIEW_FAMILIES.has(payload.family)
      && ['moderate','strong'].includes(String(event.evidence?.quality)) && !event.evidence?.assisted
      && payload.hinted !== true && payload.answerShownBefore !== true && payload.transcriptShownBefore !== true
      && payload.retrievalAttempted !== false && Number.isFinite(Date.parse(event.at)) && Date.parse(event.at) >= cutoff
      && Date.parse(event.at) <= Date.parse(now);
  })()).sort((a,b) => Date.parse(a.at)-Date.parse(b.at) || a.id.localeCompare(b.id)).slice(-30);
  const recentByCard = new Map<string, number[]>(), repeatedEventIds = new Set<string>();
  for (const event of rows) {
    const cardId = event.subject.cardId!;
    const ratings = recentByCard.get(cardId) ?? [];
    ratings.push(Number(event.payload.rating));
    const recent = ratings.slice(-WEAK_WINDOW);
    if (event.payload.rating === 1 && recent.filter(r => r === 1).length >= 2) repeatedEventIds.add(event.id);
    recentByCard.set(cardId, recent);
  }
  return rows.map(event => {
    const family = event.payload.family as ExerciseFamily;
    const seconds = Number(event.payload.reviewSeconds);
    return { family, ...(Number.isFinite(seconds) && seconds > 0 && seconds <= 900 ? { observedSeconds: seconds, expectedSeconds: estimateSeconds(family) } : {}),
      ...(typeof event.payload.correct === 'boolean' ? { correct: event.payload.correct } : {}), repeatedFailure: repeatedEventIds.has(event.id) };
  });
}

function workloadAdmissionLimit(input: { deck: DeckItem[]; intake: IntakeOutcome[]; now: string; preferences: ReviewPreferences; scheduler: Scheduler; events: GoEvent[]; learnerId: string; dailyRemaining: number; policy?: Partial<WorkloadAdmissionPolicy>; context?: ReturnType<typeof createReviewEligibilityContext> }): ReturnType<typeof workloadAwareAdmission> {
  const { deck, intake, now, preferences, scheduler, events } = input;
  const eligibilityContext = input.context ?? createReviewEligibilityContext(deck, events, now);
  const nowMs = Date.parse(now);
  const sessionSeconds = preferences.sessionMinutes === 0 ? 0 : Math.max(0, preferences.sessionMinutes * 60);
  const eligible = (item: DeckItem, at: string, explicit = false) => reviewEligibility({ item, itemId:item.itemId, unitId:item.unitId,
    knowledge: undefined, events, now:at,
    ...(explicit ? { intent:{ kind:'explicit' as const, reason:'early-review' as const, requestedAt:now } } : { intent:{ kind:'automatic' as const } }),
    remainingNew:0, context:eligibilityContext }).eligible;
  let dueSeconds = 0, upcomingLearningSeconds = 0, upcomingReviewSeconds = 0;
  for (const item of deck) {
    if (!item.history.some(h => !h.retracted && !h.scheduleExcluded && !h.conflict)) continue;
    const dueAt = Date.parse(item.schedule.due);
    if (!eligible(item, scheduler.isDue(item.schedule, now) ? now : item.schedule.due, !scheduler.isDue(item.schedule, now))) continue;
    const seconds = estimateSeconds(item.family,item.schedule.phase);
    if (scheduler.isDue(item.schedule, now)) dueSeconds += seconds;
    else if (Number.isFinite(sessionSeconds) && dueAt > nowMs && dueAt <= nowMs + sessionSeconds * 1000) {
      if (['learning','relearning'].includes(item.schedule.phase)) upcomingLearningSeconds += seconds;
      else upcomingReviewSeconds += seconds;
    }
  }
  const newFamilies = intake.filter(x => x.decision === 'test-now' && x.proposed).map(x => x.proposed!.family);
  const avgNewSeconds = newFamilies.length ? newFamilies.reduce((sum,family) => sum+estimateSeconds(family,'new'),0)/newFamilies.length : ESTIMATED_SECONDS.written;
  const hardNewLimit = Math.min(Math.max(0,preferences.maxNew), Math.max(0,input.dailyRemaining));
  return workloadAwareAdmission({ hardNewLimit, sessionMinutes: preferences.sessionMinutes, dueSeconds, upcomingLearningSeconds, upcomingReviewSeconds,
    averageNewSeconds: avgNewSeconds, policy:input.policy });
}

export interface PlanInput {
  deck: DeckItem[]; intake: IntakeOutcome[]; preferences: ReviewPreferences; audio: AudioAvailability; scheduler: Scheduler; now: string;
  recentHelp?: Set<string>; knowledge?: UnitKnowledge[]; readingSignals?: GoEvent[];
  manuallySelectedUnitIds?: Set<string>; priorityPolicy?: KnowabilityPolicy; observedReviewSeconds?: Record<string, number>;
  intent?: import('../types').ReviewIntent; learnerId?: string; random: () => number;
  /** Cards explicitly selected for delayed reassessment; instruction opportunities are projected separately. */
  remediationItemIds?: Set<string>;
  /** Testable transparent policy overrides for controlled comparisons; hard limits stay enforced. */
  microdeckPolicy?: MicrodeckPolicyOptions;
  admissionPolicy?: Partial<WorkloadAdmissionPolicy>;
  dueOrdering?: DueOrderingPolicy;
}
export const recentAgains = (item: DeckItem): number => item.history.filter(h => !h.retracted && !h.scheduleExcluded && !h.conflict).slice(-WEAK_WINDOW).filter(h => h.rating === 1).length;
export const benefitOf = (deficit: number, score: number, seconds: number, cost: number): number => deficit * score / Math.max(.1, seconds / 30 * (1 + cost));
export type DueOrderingPolicy = 'strict-due' | 'bounded-remediation';
interface QueueCandidate { planned: PlannedItem; tier: number; score: number; due: number }
export function orderQueueCandidates(pool: QueueCandidate[], policy: DueOrderingPolicy = 'strict-due'): QueueCandidate[] {
  const sorted = [...pool].sort((a,b) => a.tier-b.tier || (a.tier <= 1 ? a.due-b.due : 0) || b.score-a.score || a.planned.item.itemId.localeCompare(b.planned.item.itemId));
  if (policy !== 'bounded-remediation') return sorted;
  const learning = sorted.filter(x=>x.tier===0), due = sorted.filter(x=>x.tier===1), remediation = sorted.filter(x=>x.tier===2), fresh = sorted.filter(x=>x.tier>=3);
  const out = [...learning]; let remediationIndex=0;
  for (let index=0;index<due.length;index++) {
    out.push(due[index]!);
    if ((index+1)%4===0 && remediationIndex<remediation.length) out.push(remediation[remediationIndex++]!);
  }
  out.push(...remediation.slice(remediationIndex),...fresh);
  return out;
}
export function planSession(input: PlanInput): SessionPlan {
  const { deck, intake, preferences, scheduler, now, audio, random } = input;
  const nowMs = Date.parse(now); if (!Number.isFinite(nowMs)) throw new RangeError('not an ISO timestamp: ' + now);
  const events = input.readingSignals ?? [], intent = input.intent ?? { kind: 'automatic' as const };
  const knowledge = new Map([...intake.flatMap(o => o.knowledge ? [o.knowledge] : []), ...(input.knowledge ?? [])].map(k => [k.unitId,k]));
  const learnerIds = [...new Set(events.map(e => e.learnerId))];
  const learnerId = input.learnerId ?? (learnerIds.length === 1 ? learnerIds[0] : '');
  const eligibilityContext = createReviewEligibilityContext(deck, events, now);
  const budget = admissionBudget(events, { learnerId, languageId: preferences.languageId, now, maxNew: preferences.maxNew, dailyNewLimit: preferences.dailyNewLimit ?? preferences.maxNew });
  const admission = workloadAdmissionLimit({ deck, intake, now, preferences, scheduler, events, learnerId, dailyRemaining: budget.remaining, policy:input.admissionPolicy, context:eligibilityContext });
  const automaticNewLimit = admission.limit;
  const timeLimit = preferences.sessionMinutes === 0 ? Infinity : Math.max(0, preferences.sessionMinutes) * 60;
  const target = chooseMicrodeckTarget({ configuredMaximum: preferences.cardsPerDeck,
    observations: microdeckObservations(events, preferences.languageId, now, eligibilityContext.selectedReviewEvidence),
    policy:input.microdeckPolicy,
    cognitiveCost: intake.filter(o=>o.decision==='test-now').reduce((sum,o)=>sum+(Number.isFinite(o.candidate.cost)?o.candidate.cost:0),0)
      / Math.max(1,intake.filter(o=>o.decision==='test-now').length) });
  const backlog = [...eligibilityContext.remediationByCard.values()];
  const remediationById = new Map(backlog.map(candidate => [candidate.itemId, candidate]));
  const skipped: SessionPlan['skipped'] = [], pool: QueueCandidate[] = [];
  const make = (item: DeckItem, why: string[], exists: boolean, requested = intent, queueOverride?: NonNullable<PlannedItem['queue']>): void => {
    const hist = item.history.filter(h => !h.retracted && !h.scheduleExcluded && !h.conflict), fresh = !hist.length;
    const decision = reviewEligibility({ item: exists ? item : undefined, itemId:item.itemId, unitId: item.unitId, knowledge: knowledge.get(item.unitId), events,
      now, intent: requested, remainingNew: automaticNewLimit, context:eligibilityContext });
    if (!decision.eligible) { skipped.push({ itemId: item.itemId, why: decision.reason ?? 'not eligible' }); return; }
    if (isAudioFamily(item.family) && (!preferences.includeListening || !audio.available)) {
      skipped.push({ itemId: item.itemId, why: 'Listening remains due: suitable assessment audio is unavailable; writing cannot satisfy this listening obligation.' }); return;
    }
    if (isAudioFamily(item.family) && !audio.eligibleForEvidence) why = [...why, 'listening practice only: cannot count as listening evidence or a memory update'];
    const due = !fresh && scheduler.isDue(item.schedule, now);
    const queue: NonNullable<PlannedItem['queue']> = queueOverride ?? (fresh ? 'new' : due && ['learning','relearning'].includes(item.schedule.phase) ? 'learning' : 'due');
    const measured = input.observedReviewSeconds?.[item.itemId];
    const seconds = measured && Number.isFinite(measured) && measured > 0 && measured <= 900 ? measured : estimateSeconds(item.family,item.schedule.phase);
    const r = fresh ? 0 : scheduler.retrievability(item.schedule, now), k = knowledge.get(item.unitId), stage = k?.level ?? (fresh ? 'seen' : 'known');
    const candidate = intake.find(o => o.unitId === item.unitId)?.candidate;
    const score = scoreReviewPriority({ level: stage, retrievability: r, due, overdueDays: due ? Math.max(0,(nowMs-Date.parse(item.schedule.due))/86_400_000) : 0,
      recentFailures: recentAgains(item), encounters: k?.encounters, evidenceQuality: k ? 1-k.uncertainty : .5,
      seenEligible: true, automaticFailure: eligibilityContext.automaticFailureUnits.has(item.unitId), explicitRequest: requested.kind === 'explicit' }, input.priorityPolicy)
      * benefitOf(fresh ? 1 : Math.max(.01,1-r), candidate?.score ?? .5, seconds, candidate?.cost ?? 0);
    const overlap = !fresh && (queue === 'learning' || queue === 'due') ? 'scheduled' as const
      : queue === 'remediation' ? 'remediation' as const : !fresh && requested.kind === 'explicit' ? 'explicit' as const : undefined;
    const presentationReason = queue === 'learning' ? 'due-learning-return' : queue === 'remediation' ? 'remediation-reassessment'
      : !fresh && requested.kind === 'explicit' ? 'explicit-repeat' : queue === 'due' ? 'scheduled-review' : undefined;
    pool.push({ planned: { item, family: item.family, why, estimatedSeconds: seconds, isNew: fresh, intent: requested,
      schedulingCardExists: exists, ...(fresh && k ? {admissionKnowledge:k} : {}), origin: exists ? 'scheduled' : 'intake', queue,
      ...(overlap ? { overlap } : {}), ...(presentationReason ? { presentationReason } : {}) },
      tier: queue === 'learning' ? 0 : queue === 'due' ? 1 : queue === 'remediation' ? 2 : 3, score, due: Date.parse(item.schedule.due) });
  };
  for (const item of deck) {
    const explicit = intent.kind === 'explicit' && intent.reason === 'reassessment'
      ? { kind: 'automatic' as const }
      : input.manuallySelectedUnitIds?.has(item.unitId) ? { kind: 'explicit' as const, reason: 'early-review' as const, requestedAt: now } : intent;
    const history = item.history.filter(h => !h.retracted && !h.scheduleExcluded && !h.conflict);
    if (!history.length) make(item, ['new in the deck: not reviewed yet'], true, explicit);
    else if (scheduler.isDue(item.schedule,now)) make(item, ['due: independent review at the actual review time'], true, explicit);
    else if (explicit.kind === 'explicit') make(item, ['optional early practice at the actual review time'], true, explicit);
    else skipped.push({ itemId:item.itemId, why:'not due; optional remediation is separate from scheduled review' });
  }
  // Instructions are persisted opportunities, not scored questions. A scored reassessment only
  // enters this queue after the learner selects a studied, delayed-ready card.
  if (intent.kind === 'explicit' && intent.reason === 'reassessment') {
    for (const itemId of input.remediationItemIds ?? []) {
      const candidate = remediationById.get(itemId), item = deck.find(x => x.itemId === itemId);
      if (!candidate || !candidate.ready || !item || pool.some(x => x.planned.item.itemId === itemId)) {
        skipped.push({ itemId, why: candidate ? 'study the repair material and wait for the reassessment delay' : 'no current unresolved failure for this card' });
        continue;
      }
      make(item, ['delayed, independent reassessment selected after studying repair material'], true, intent, 'remediation');
    }
  }
  const deckIds = new Set(deck.map(i => i.itemId)), admitted = new Set<string>();
  for (const outcome of intake) {
    if (outcome.decision !== 'test-now' || !outcome.proposed) continue;
    const id = itemIdFor(outcome.unitId,outcome.proposed.dimension);
    if (deckIds.has(id) || admitted.has(id)) continue;
    admitted.add(id);
    const requested = outcome.intent ?? (input.manuallySelectedUnitIds?.has(outcome.unitId)
      ? { kind:'explicit' as const, reason:'selected-vocabulary' as const, requestedAt:now } : intent);
    const item: DeckItem = { itemId:id, unitId:outcome.unitId, unitKind:outcome.candidate.kind, languageId:preferences.languageId,
      ...(preferences.varietyId ? {varietyId:preferences.varietyId}:{}), dimension:outcome.proposed.dimension, family:outcome.proposed.family, addedAt:now,
      addedBy:requested.kind==='explicit'?'learner':'intake', reasons:[cardReasonFor(outcome.candidate,outcome.reasons[0]??'intake')],
      schedule:scheduler.newState(now), history:[],status:'active' };
    make(item,['new from intake',...outcome.reasons],false,requested);
  }
  const orderedPool = orderQueueCandidates(pool, input.dueOrdering);
  const items: PlannedItem[] = []; let used=0,newCount=0,availableNewCount=0,availableQuestions=0;
  for (const { planned } of orderedPool) {
    if (planned.isNew && planned.intent?.kind !== 'explicit' && availableNewCount >= automaticNewLimit) { skipped.push({itemId:planned.item.itemId,why:'session or daily new-item budget exhausted'});continue; }
    if (used+planned.estimatedSeconds > timeLimit) { skipped.push({itemId:planned.item.itemId,why:'over budget (still due; nothing was written)'});continue; }
    used+=planned.estimatedSeconds;
    availableQuestions++;
    if(planned.isNew && planned.intent?.kind!=='explicit')availableNewCount++;
    if (items.length >= target.targetQuestions) {
      skipped.push({itemId:planned.item.itemId,why:'eligible for the next micro-deck; no scheduling card was created'});
      continue;
    }
    items.push(planned);
    if(planned.isNew && planned.intent?.kind!=='explicit')newCount++;
  }
  const workloadLimit = Number.isFinite(timeLimit) ? timeLimit : 0;
  const estimatedSeconds = items.reduce((sum,item)=>sum+item.estimatedSeconds,0);
  const configuredMaximum = microdeckMaximum(preferences.cardsPerDeck);
  const countFromTime = Number.isFinite(timeLimit) ? Math.floor(timeLimit / 15) : configuredMaximum;
  const questionLimit = Math.max(items.length, Math.min(configuredMaximum, countFromTime));
  return { planId:'plan:'+now+':'+Math.floor(random()*36**6).toString(36).padStart(6,'0'),createdAt:now,languageId:preferences.languageId,
    budgetMinutes:preferences.sessionMinutes,items,skipped,intent,remediation:backlog,
    questionLimit, batch: { targetQuestions: target.targetQuestions, workloadLimit, estimatedSeconds,
      reasons: [...target.reasons, admission.reason] }, initialQuestionCount: items.length,
    availableWork: { questions: availableQuestions, newQuestions: availableNewCount },
    dueCount:items.filter(p=>!p.isNew&&scheduler.isDue(p.item.schedule,now)).length,newCount:items.filter(p=>p.isNew).length,
    listeningCount:items.filter(p=>isAudioFamily(p.family)).length,grammarCount:items.filter(p=>isGrammarFamily(p.family)).length };
}
export const askedDimension = (p: PlannedItem) => FAMILY_DIMENSION[p.family];
