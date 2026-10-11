/**
 * PLANNING — composes one review session from the deck, the intake outcomes and the learner's preferences. Pure: it
 * reads, it never writes. A plan is a proposal; nothing is recorded until the learner answers (the session runner).
 *
 * Eligible due, weak and new items compete in one priority-sorted pool. Knowability stage weights apply across comparable
 * items; maxNew is an introduction cap, not a priority tier.
 *
 * Time. Estimated seconds per item (estimates, not measurements): written recognition / meaning-to-form 25 s; a CHOICE
 * question 15 s (written recognition and phrase comprehension while the item is still new or learning, because those are
 * offered as choices first); grammar (morphological identification, grammar application) 35 s; sentence completion 40 s;
 * audio 30 s plus 8 s for each EXPECTED replay (one is assumed). The plan never exceeds `sessionMinutes`.
 *
 * Listening. A listening item is planned only when `includeListening && audio.available`. Otherwise a DUE listening item
 * is asked in its written counterpart (and the plan says so: the result then counts as reading, never as listening) and a
 * NEW listening item is not added at all. When the audio is available but is only practice (not evidence-eligible) the item
 * is planned and flagged: the runner will record it with evidence quality 'none'.
 *
 * Cost/benefit. benefit = retrievability deficit (1 − recall probability; 1 for a new item) × the Repository's candidate
 * score (0.5 when the unit has no candidate) ÷ cost, with cost = estimated seconds / 30 × (1 + candidate.cost). The
 * versioned Knowability priority multiplies this value before the global order is selected.
 */
import type {
  AudioAvailability, DeckItem, ExerciseFamily, IntakeOutcome, PlannedItem, ReviewPreferences, Scheduler, SessionPlan,
} from '../types';
import type { GoEvent, UnitKnowledge } from '../../../repository-contract/src';
import { FAMILY_DIMENSION } from '../types';
import { itemIdFor } from '../scheduler/deck';
import { cardReasonFor } from '../intake/intake';
import { eligibleByKnowability, hasConfirmedAutomaticFailure, scoreReviewPriority, seenEligibility, type KnowabilityPolicy } from './priority-policy';

const GRAMMAR_FAMILY_SET: ReadonlySet<ExerciseFamily> = new Set<ExerciseFamily>(['morphological-identification', 'grammar-application']);
const AUDIO_FAMILY_SET: ReadonlySet<ExerciseFamily> = new Set<ExerciseFamily>(['audio-to-meaning', 'audio-transcription']);

/** Seconds per kind of item; estimates the planner documents and a host may replace with measured latencies. */
export const ESTIMATED_SECONDS = { written: 25, choice: 15, grammar: 35, sentenceCompletion: 40, audio: 30, replay: 8 } as const;
export const EXPECTED_REPLAYS = 1;
export const WEAK_AGAIN_COUNT = 2;
export const WEAK_WINDOW = 10;
export const LEECH_AGAIN_THRESHOLD = 5;

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

export interface PlanInput {
  deck: DeckItem[];
  intake: IntakeOutcome[];
  preferences: ReviewPreferences;
  audio: AudioAvailability;
  scheduler: Scheduler;
  now: string;
  /** Units for which the learner repeatedly asked for help (repeated AssistanceRequested). */
  recentHelp?: Set<string>;
  /** Repository projections and raw event evidence used to decide stage eligibility and ranking. */
  knowledge?: UnitKnowledge[];
  readingSignals?: GoEvent[];
  /** Units the learner explicitly selected for practice; may bypass the New-stage automatic exclusion. */
  manuallySelectedUnitIds?: Set<string>;
  priorityPolicy?: KnowabilityPolicy;
  /** Optional measured seconds per card, clamped to a conservative finite range. */
  observedReviewSeconds?: Record<string, number>;
  random: () => number;
}

interface Cand { planned: PlannedItem; benefit: number; priority: number; recall: number; bucket: 'due' | 'weak' | 'new' }

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const isLive = (i: DeckItem, nowMs: number): boolean =>
  i.status === 'active' || (i.status === 'snoozed' && i.snoozedUntil !== undefined && Date.parse(i.snoozedUntil) <= nowMs);

/** Recent Again ratings among the last WEAK_WINDOW reviews. */
const effectiveHistory = (i: DeckItem) => i.history.filter((h) => h.retracted !== true);
export const recentAgains = (i: DeckItem): number => effectiveHistory(i).slice(-WEAK_WINDOW).filter((h) => h.rating === 1).length;

export const benefitOf = (deficit: number, score: number, seconds: number, cost: number): number =>
  (deficit * score) / Math.max(0.1, (seconds / 30) * (1 + cost));

const comparePriority = (a: Cand, b: Cand): number =>
  b.priority * b.benefit - a.priority * a.benefit || a.planned.item.itemId.localeCompare(b.planned.item.itemId);

export function planSession(input: PlanInput): SessionPlan {
  const { deck, intake, preferences, audio, scheduler, now, random } = input;
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) throw new RangeError(`not an ISO timestamp: ${now}`);
  const recentHelp = input.recentHelp ?? new Set<string>();
  const budget = preferences.sessionMinutes === 0 ? Number.POSITIVE_INFINITY : Math.max(0, preferences.sessionMinutes) * 60;
  const knowledgeByUnit = new Map<string, UnitKnowledge>();
  for (const row of [...(input.knowledge ?? []), ...intake.flatMap((o) => o.knowledge ? [o.knowledge] : [])]) knowledgeByUnit.set(row.unitId, row);
  const signalsFor = (unitId: string) => (input.readingSignals ?? []).filter((e) => e.subject?.itemIds?.includes(unitId));
  const recentFor = (unitId: string, withinDays: number) => signalsFor(unitId).filter((e) => {
    const t = Date.parse(e.at); return Number.isFinite(t) && nowMs >= t && nowMs - t <= withinDays * 86_400_000;
  });
  const stageOf = (unitId: string): UnitKnowledge['level'] | undefined => knowledgeByUnit.get(unitId)?.level;
  const candidateOf = new Map(intake.map((o) => [o.unitId, o.candidate] as const));
  const listeningOk = preferences.includeListening && audio.available;

  const skipped: SessionPlan['skipped'] = [];
  const items: PlannedItem[] = [];
  let used = 0;
  let grammar = 0;

  /** The family actually asked, with the notes that explain any change. */
  const resolve = (family: ExerciseFamily): { family: ExerciseFamily; notes: string[] } => {
    if (!isAudioFamily(family)) return { family, notes: [] };
    if (listeningOk) return { family, notes: audio.eligibleForEvidence ? [] : ['listening practice only: this audio cannot count as listening evidence'] };
    const why = !preferences.includeListening ? 'listening is switched off' : `no suitable audio (${audio.reason})`;
    return { family: writtenCounterpart(family), notes: [`${why}: asked in writing, so the result counts as reading, not listening`] };
  };

  const make = (item: DeckItem, why: string[], deficit: number, isNew: boolean, recall = 0, explicit = false, bucket: Cand['bucket'] = isNew ? 'new' : 'due'): Cand => {
    const r = resolve(item.family);
    const measured = input.observedReviewSeconds?.[item.itemId];
    const seconds = Number.isFinite(measured) && measured! > 0 && measured! <= 900 ? measured! : estimateSeconds(r.family, item.schedule.phase);
    const cand = candidateOf.get(item.unitId);
    const stage = stageOf(item.unitId) ?? (isNew ? 'seen' : 'known');
    const events = signalsFor(item.unitId);
    const recent = recentFor(item.unitId, 30);
    const history = effectiveHistory(item);
    const failureCount = history.slice(-WEAK_WINDOW).filter((h) => h.rating === 1).length;
    const readingEvents = recent.filter((e) => ['EncounterRecorded', 'SelectionLookedUp', 'AnalysisShown'].includes(e.kind));
    const encounterSignal = Math.min(0.25, (knowledgeByUnit.get(item.unitId)?.encounters ?? events.filter((e) => e.kind === 'EncounterRecorded').length) / 40);
    const readingRelevance = Math.max(encounterSignal, Math.min(1, readingEvents.length / 3));
    const distinctContexts = new Set(readingEvents.flatMap((e) => e.subject?.sentenceKey ? [e.subject.sentenceKey] : []));
    const diversity = distinctContexts.size ? Math.min(1, distinctContexts.size / 3) : 0.5;
    const seenEligible = seenEligibility({
      knowledge: knowledgeByUnit.get(item.unitId), explicitRequest: explicit || item.addedBy === 'learner',
      assistanceRequests: events.filter((e) => e.kind === 'AssistanceRequested').length,
      readingRelevance,
      policy: input.priorityPolicy,
    });
    const automaticFailure = hasConfirmedAutomaticFailure(events, item.unitId, input.priorityPolicy?.automaticFailureWindow ?? 10);
    const priority = explicit && stage === 'new' ? 1 : scoreReviewPriority({
      level: stage, retrievability: recall, stability: item.schedule.stability, due: bucket === 'due',
      overdueDays: bucket === 'due' ? Math.max(0, (nowMs - Date.parse(item.schedule.due)) / 86_400_000) : 0,
      recentFailures: failureCount, readingRelevance,
      encounters: knowledgeByUnit.get(item.unitId)?.encounters ?? events.filter((e) => e.kind === 'EncounterRecorded').length,
      recentExposure: recent.filter((e) => ['EncounterRecorded', 'SelectionLookedUp'].includes(e.kind)).length / 3,
      evidenceQuality: knowledgeByUnit.get(item.unitId)?.uncertainty === undefined ? 0.5 : 1 - knowledgeByUnit.get(item.unitId)!.uncertainty,
      cost: 0, diversity,
      explicitRequest: explicit || item.addedBy === 'learner', seenEligible, automaticFailure,
    }, input.priorityPolicy);
    return {
      planned: { item, family: r.family, why: [...why, ...r.notes], estimatedSeconds: seconds, isNew },
      benefit: benefitOf(deficit, cand?.score ?? 0.5, seconds, cand?.cost ?? 0),
      priority,
      recall,
      bucket,
    };
  };

  const add = (c: Cand): boolean => {
    if (used + c.planned.estimatedSeconds > budget) return false;
    items.push(c.planned);
    used += c.planned.estimatedSeconds;
    if (isGrammarFamily(c.planned.family)) grammar += 1;
    return true;
  };

  // ── classify the deck ──
  const live = deck.filter((i) => isLive(i, nowMs));
  const pool: Cand[] = [];
  for (const item of live) {
    const history = effectiveHistory(item);
    const reviewed = history.length > 0;
    const helped = recentHelp.has(item.unitId);
    const againCount = recentAgains(item);
    const isWeak = againCount >= WEAK_AGAIN_COUNT || helped;
    const weakWhy = [
      ...(againCount >= WEAK_AGAIN_COUNT ? [`repeated weak point: ${againCount} Again in the last ${Math.min(WEAK_WINDOW, history.length)} effective reviews`] : []),
      ...(helped ? ['you asked for help with this unit repeatedly'] : []),
    ];
    const stage = stageOf(item.unitId) ?? 'known'; // legacy deck maintenance; fresh items need an actual stage below
    const manual = input.manuallySelectedUnitIds?.has(item.unitId) === true;
    if (againCount >= LEECH_AGAIN_THRESHOLD && !manual) {
      skipped.push({ itemId: item.itemId, why: `deferred for content repair: ${againCount} Again ratings in the last ${Math.min(WEAK_WINDOW, history.length)} effective reviews; automatic practice is paused` });
      continue;
    }
    if (!eligibleByKnowability({ level: stage, seenEligible: seenEligibility({ knowledge: knowledgeByUnit.get(item.unitId), assistanceRequests: signalsFor(item.unitId).filter((e) => e.kind === 'AssistanceRequested').length, explicitRequest: manual || item.addedBy === 'learner', readingRelevance: recentFor(item.unitId, 30).filter((e) => ['EncounterRecorded', 'SelectionLookedUp', 'AnalysisShown'].includes(e.kind)).length / 3, policy: input.priorityPolicy }), automaticFailure: hasConfirmedAutomaticFailure(signalsFor(item.unitId), item.unitId, input.priorityPolicy?.automaticFailureWindow ?? 10), explicitRequest: manual || item.addedBy === 'learner' })) {
      skipped.push({ itemId: item.itemId, why: `level ${stage}: not eligible for automatic review` });
      continue;
    }
    if (!reviewed) {
      pool.push(make(item, ['new in the deck: not reviewed yet', ...weakWhy], 1, true, 0, manual, 'new'));
      continue;
    }
    const r = scheduler.retrievability(item.schedule, now);
    if (scheduler.isDue(item.schedule, now)) {
      pool.push(make(item, [`due: recall probability ${pct(r)}`, ...weakWhy], 1 - r, false, r, false, 'due'));
    } else if (isWeak) {
      pool.push(make(item, [`not due yet (recall ${pct(r)}), but ${weakWhy.join('; ')}`], Math.max(0.05, 1 - r), false, r, false, 'weak'));
    }
  }
  const deckIds = new Set(deck.map((i) => i.itemId));
  const admitted = new Set<string>(); // an outcome list that names the same unit twice must not ask (or review) it twice
  for (const o of intake) {
    if (o.decision !== 'test-now' || !o.proposed) continue;
    const stage = knowledgeByUnit.get(o.unitId)?.level;
    const manual = o.explicitlySelected === true || input.manuallySelectedUnitIds?.has(o.unitId) === true;
    if (!stage && !manual) {
      skipped.push({ itemId: itemIdFor(o.unitId, o.proposed.dimension), why: 'no confirmed knowledge stage: fresh items require observed learner evidence or explicit selection' });
      continue;
    }
    if (stage === 'new' && !manual) {
      skipped.push({ itemId: itemIdFor(o.unitId, o.proposed.dimension), why: 'level New: automatic review excludes it until the learner explicitly selects practice' });
      continue;
    }
    if (stage === 'automatic' && !manual && !hasConfirmedAutomaticFailure(signalsFor(o.unitId), o.unitId, input.priorityPolicy?.automaticFailureWindow ?? 10)) {
      skipped.push({ itemId: itemIdFor(o.unitId, o.proposed.dimension), why: 'level Automatic: no confirmed unassisted retrieval failure' });
      continue;
    }
    if (stage === 'seen' && !manual && !seenEligibility({ knowledge: knowledgeByUnit.get(o.unitId), assistanceRequests: signalsFor(o.unitId).filter((e) => e.kind === 'AssistanceRequested').length, readingRelevance: recentFor(o.unitId, 30).filter((e) => ['EncounterRecorded', 'SelectionLookedUp', 'AnalysisShown'].includes(e.kind)).length / 3, policy: input.priorityPolicy })) {
      skipped.push({ itemId: itemIdFor(o.unitId, o.proposed.dimension), why: 'level Seen: no qualifying evidence for deliberate practice' });
      continue;
    }
    const itemId = itemIdFor(o.unitId, o.proposed.dimension);
    const key = `${o.unitId}|${o.proposed.family}`;
    if (admitted.has(key) || admitted.has(itemId)) continue; // duplicate outcome: the first one stands
    admitted.add(key);
    admitted.add(itemId);
    if (deckIds.has(itemId)) continue; // the deck already has it in some state; intake never re-adds
    if (isAudioFamily(o.proposed.family) && !listeningOk) {
      skipped.push({ itemId, why: `listening item not added: ${!preferences.includeListening ? 'listening is switched off' : `no suitable audio (${audio.reason})`}` });
      continue;
    }
    const item: DeckItem = {
      itemId, unitId: o.unitId, unitKind: o.candidate.kind, languageId: preferences.languageId,
      dimension: o.proposed.dimension, family: o.proposed.family, addedAt: now, addedBy: 'intake',
      reasons: [cardReasonFor(o.candidate, o.reasons[0] ?? 'intake')], schedule: scheduler.newState(now), history: [], status: 'active',
    };
    pool.push(make(item, ['new from intake', ...o.reasons], 1, true, 0, manual, 'new'));
  }
  const newLimit = Math.max(0, preferences.maxNew);
  let dueCount = 0;
  let newCount = 0;
  for (const c of pool.sort(comparePriority)) {
    if (c.bucket === 'new' && newCount >= newLimit) {
      skipped.push({ itemId: c.planned.item.itemId, why: `beyond the limit of ${newLimit} new item(s) per session` });
      continue;
    }
    if (!add(c)) {
      skipped.push({ itemId: c.planned.item.itemId, why: c.bucket === 'due' ? 'over budget (still due; nothing was written)' : c.bucket === 'new' && !deckIds.has(c.planned.item.itemId) ? 'over budget (not added to the deck)' : 'over budget (stays in the deck)' });
      continue;
    }
    if (c.bucket === 'due') dueCount += 1;
    if (c.bucket === 'new') newCount += 1;
  }

  return {
    planId: `plan:${now}:${Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0')}`,
    createdAt: now,
    languageId: preferences.languageId,
    budgetMinutes: preferences.sessionMinutes,
    items,
    skipped,
    dueCount,
    newCount,
    listeningCount: items.filter((p) => isAudioFamily(p.family)).length,
    grammarCount: grammar,
  };
}

/** The assessment dimension an item is actually asked along in a plan (differs from `item.dimension` after a listening fallback). */
export const askedDimension = (p: PlannedItem) => FAMILY_DIMENSION[p.family];
