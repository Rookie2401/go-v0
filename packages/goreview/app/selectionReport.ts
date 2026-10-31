/**
 * The selection report: a read-only answer to "why am I seeing this word again, and why not the others?".
 *
 * It joins the Review model (deck, Class Essentials deck, intake outcomes, knowledge) with the plan the home built
 * (`planCurrentDeck(...).plan`) and gives EVERY deck card, every class card and every intake outcome exactly one row with a
 * stable machine-readable `code` (the engine's `ExclusionCode`). It writes nothing and changes no ordering or count.
 *
 * Privacy. Rows carry unit ids and scheduling numbers only. The word itself (`label`) appears ONLY when the caller asks for
 * it (`includeLabels`). Never a sentence, a gloss, a credential or the learner's email; detail text is built from codes,
 * dates and engine reason strings, and any occurrence of the word inside a reason is masked unless labels are requested.
 */
import { KNOWABILITY_PRIORITY_POLICY_VERSION } from '../src/planner/priority-policy';
import { createFsrsScheduler } from '../src/scheduler/fsrs';
import { schedulerForReviewProfile } from '../src/scheduler/replay-profile';
import { itemIdFor } from '../src/scheduler/deck';
import type { DeckItem, ExclusionCode, IntakeOutcome, PlannedItem, Scheduler, SessionPlan } from '../src/types';
import { unitLabel } from './format';
import type { ReviewModel } from './workspace';

export interface SelectionRow {
  unitId: string;
  cardId?: string;
  dimension?: string;
  family?: string;
  kind: 'deck' | 'class' | 'candidate';
  status: 'selected' | 'excluded';
  code: ExclusionCode;
  detail: string;
  level?: string;
  phase?: string;
  due?: string;
  retrievability?: number;
  stability?: number;
  lapses?: number;
  reps?: number;
  queue?: string;
  intakeDecision?: string;
  /** Present only when `includeLabels` was requested. */
  label?: string;
}

export interface SelectionReport {
  generatedAt: string;
  languageId: string;
  policy: { algorithm: string; parametersVersion: string; priorityPolicyVersion: string };
  counts: { vocabularyUnits: number; knowledgeRows: number; candidates: number; deckCards: number; classCards: number; selected: number; skipped: number; withheld: number };
  knowledge?: unknown;
  rows: SelectionRow[];
}

/** Fields other agents may add to ReviewModel during the same change; read defensively. */
interface OptionalModelFields { knowledgeStatus?: unknown; withheld?: unknown }

const effective = (item: DeckItem) => item.history.filter(h => !h.retracted && !h.scheduleExcluded && !h.conflict);
const LEARNING = new Set(['learning', 'relearning']);
const round = (n: number, digits = 4): number => Math.round(n * 10 ** digits) / 10 ** digits;

function resolveScheduler(model: ReviewModel): Scheduler {
  const fallback = createFsrsScheduler({ desiredRetention: model.prefs.desiredRetention });
  if (!model.schedulerProfile) return fallback;
  const resolved = schedulerForReviewProfile(model.schedulerProfile, fallback);
  return 'error' in resolved ? fallback : resolved.scheduler;
}

/** Recursively sorts object keys so the JSON text is stable whatever order a producer inserted them in. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(k => [k, stable((value as Record<string, unknown>)[k])]));
  }
  return value;
}

export function buildSelectionReport(model: ReviewModel, plan: SessionPlan, opts: { includeLabels?: boolean } = {}): SelectionReport {
  const includeLabels = opts.includeLabels === true;
  const scheduler = resolveScheduler(model);
  const optional = model as ReviewModel & OptionalModelFields;
  const nowMs = Date.parse(model.now);
  const classDeck = model.classDeck ?? [];
  const plannedById = new Map<string, PlannedItem>(plan.items.map(p => [p.item.itemId, p]));
  const skippedById = new Map(plan.skipped.map(s => [s.itemId, s]));
  const levelOf = new Map<string, string>();
  for (const o of model.outcomes) if (o.knowledge?.level) levelOf.set(o.unitId, o.knowledge.level);
  for (const k of model.knowledge) levelOf.set(k.unitId, k.level);
  const deckIds = new Set([...model.deck, ...classDeck].map(i => i.itemId));

  /** Masks the word inside engine-written text unless labels were asked for. */
  const scrub = (text: string, unitId: string): string => {
    if (includeLabels) return text;
    const word = unitLabel(unitId);
    if (!word || word === unitId || word.length < 2) return text;
    return text.split(word).join('[word]');
  };
  const labelProps = (unitId: string): { label?: string } => (includeLabels ? { label: unitLabel(unitId) } : {});

  const rows: SelectionRow[] = [];

  const deckRow = (item: DeckItem, kind: 'deck' | 'class'): SelectionRow => {
    const history = effective(item);
    const fresh = history.length === 0;
    const sched = item.schedule;
    const base = { unitId: item.unitId, cardId: item.itemId, dimension: item.dimension, family: item.family, kind };
    const numbers = {
      ...(levelOf.has(item.unitId) ? { level: levelOf.get(item.unitId) } : {}),
      phase: sched.phase, due: sched.due,
      ...(!fresh && Number.isFinite(nowMs) ? { retrievability: round(scheduler.retrievability(sched, model.now)) } : {}),
      stability: round(sched.stability), lapses: sched.lapses, reps: sched.reps,
    };
    const planned = plannedById.get(item.itemId);
    const finish = (status: SelectionRow['status'], code: ExclusionCode, detail: string, queue?: string): SelectionRow =>
      ({ ...base, status, code, detail: scrub(detail, item.unitId), ...numbers, ...(queue ? { queue } : {}), ...labelProps(item.unitId) } as SelectionRow);
    if (planned) return finish('selected', 'selected', planned.why.join('; '), planned.queue);
    const skip = skippedById.get(item.itemId);
    if (skip) return finish('excluded', skip.code ?? 'other', skip.why);
    // Not in the plan and not recorded as skipped (class cards, a held-out saved-deck unit, a scheduler issue): derive it.
    if (kind === 'class' && !fresh) {
      const due = Date.parse(sched.due) <= nowMs;
      return finish('excluded', due ? 'other' : LEARNING.has(sched.phase) ? 'learning-not-due' : 'scheduled-not-due',
        due ? 'Class Essentials practice is due; it runs in its own due-only session' : 'not due until ' + sched.due);
    }
    if (model.schedulerIssue) return finish('excluded', 'other', 'scheduler issue: ' + model.schedulerIssue);
    if (item.invalidatedAt) return finish('excluded', 'invalidated', 'question invalidated; a verified facts repair is required');
    if (item.status === 'snoozed') return finish('excluded', 'snoozed', 'snoozed' + (item.snoozedUntil ? ' until ' + item.snoozedUntil : ''));
    if (item.status === 'suspended') return finish('excluded', 'suspended', 'suspended');
    if (item.status === 'dismissed') return finish('excluded', 'dismissed', 'dismissed');
    if (fresh) {
      const level = levelOf.get(item.unitId);
      return level && level !== 'new' ? finish('excluded', 'outranked', 'new card not placed in this deck')
        : finish('excluded', 'knowledge-beyond-new-required', 'automatic admission needs observed knowledge beyond New');
    }
    if (Date.parse(sched.due) > nowMs) {
      return finish('excluded', LEARNING.has(sched.phase) ? 'learning-not-due' : 'scheduled-not-due', 'not due until ' + sched.due);
    }
    return finish('excluded', 'outranked', 'due but not placed in this deck');
  };

  for (const item of model.deck) rows.push(deckRow(item, 'deck'));
  for (const item of classDeck) rows.push(deckRow(item, 'class'));

  const outcomeRow = (o: IntakeOutcome): SelectionRow => {
    const cardId = o.proposed ? itemIdFor(o.unitId, o.proposed.dimension) : undefined;
    const base = { unitId: o.unitId, ...(cardId ? { cardId } : {}), ...(o.proposed ? { dimension: o.proposed.dimension, family: o.proposed.family } : {}), kind: 'candidate' as const };
    const level = o.knowledge?.level ?? levelOf.get(o.unitId);
    const tail = { ...(level ? { level } : {}), intakeDecision: o.decision, ...labelProps(o.unitId) };
    const finish = (status: SelectionRow['status'], code: ExclusionCode, detail: string, queue?: string): SelectionRow =>
      ({ ...base, status, code, detail: scrub(detail, o.unitId), ...(queue ? { queue } : {}), ...tail });
    const planned = cardId ? plannedById.get(cardId) : undefined;
    // A proposed card that already exists in the deck is accounted for by its deck row; this row records the overlap and never double-counts.
    if (cardId && deckIds.has(cardId) && (planned || o.decision === 'test-now')) return finish('excluded', 'other', 'proposed card already in the deck; see its deck row');
    if (planned) return finish('selected', 'selected', planned.why.join('; '), planned.queue);
    if (model.dismissed.includes(o.unitId)) return finish('excluded', 'dismissed', 'vocabulary dismissed by the learner');
    if (o.decision === 'test-now') {
      if (model.choices[o.unitId] === 'later') return finish('excluded', 'learner-control', 'postponed by the learner');
      const skip = cardId ? skippedById.get(cardId) : undefined;
      if (skip) return finish('excluded', skip.code ?? 'other', skip.why);
      return finish('excluded', 'outranked', 'eligible test-now candidate not placed in this deck');
    }
    if (o.decision === 'needs-validation' || o.decision === 'too-uncertain') {
      const facts = /fact|validat|exercise/i.test(o.reasons.join(' '));
      return finish('excluded', facts ? 'facts-unavailable' : 'other', o.decision);
    }
    return finish('excluded', 'other', o.decision);
  };

  for (const o of model.outcomes) rows.push(outcomeRow(o));
  // Anything in the plan that no row accounts for (a vocabulary or saved-deck card) still gets its single row.
  const covered = new Set(rows.flatMap(r => (r.status === 'selected' && r.cardId ? [r.cardId] : [])));
  for (const p of plan.items) {
    if (covered.has(p.item.itemId)) continue;
    rows.push({ unitId: p.item.unitId, cardId: p.item.itemId, dimension: p.item.dimension, family: p.family, kind: 'candidate', status: 'selected',
      code: 'selected', detail: scrub(p.why.join('; '), p.item.unitId), phase: p.item.schedule.phase, due: p.item.schedule.due,
      ...(p.queue ? { queue: p.queue } : {}), ...labelProps(p.item.unitId) });
  }

  const units = new Set<string>([...model.deck, ...classDeck].map(i => i.unitId));
  for (const o of model.outcomes) units.add(o.unitId);
  for (const k of model.knowledge) units.add(k.unitId);
  const withheld = optional.withheld;
  return {
    generatedAt: model.now,
    languageId: model.identity.languageId,
    policy: { algorithm: scheduler.algorithm, parametersVersion: scheduler.parametersVersion, priorityPolicyVersion: KNOWABILITY_PRIORITY_POLICY_VERSION },
    counts: {
      vocabularyUnits: units.size, knowledgeRows: model.knowledge.length, candidates: model.outcomes.length,
      deckCards: model.deck.length, classCards: classDeck.length,
      selected: rows.filter(r => r.status === 'selected').length, skipped: plan.skipped.length,
      withheld: Array.isArray(withheld) ? withheld.length : typeof withheld === 'number' ? withheld : 0,
    },
    ...(optional.knowledgeStatus !== undefined ? { knowledge: optional.knowledgeStatus } : {}),
    rows,
  };
}

/** Stable, parseable, 2-space JSON: the key order never depends on insertion order. */
export function selectionReportJson(report: SelectionReport): string {
  return JSON.stringify(stable(report), null, 2);
}
