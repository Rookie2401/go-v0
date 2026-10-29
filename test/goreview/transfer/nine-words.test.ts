// @vitest-environment jsdom
/**
 * DIAGNOSTIC (no production code touched): an engine-level, deterministic reproduction of the report "GoReview keeps cycling
 * through about nine words, rated-Easy words come back soon, sessions hold only 2-3 cards, a much larger GoLearn vocabulary
 * never gets in". The real FSRS scheduler (ts-fsrs 5.4.2, FSRS-6, steps 1m/10m, relearning 10m), the real fold, the real
 * planner, the real intake (gatherCandidates) and the real app planner (planFromEntries) run over fake clocks.
 *
 * Tests labelled `// OBSERVED:` assert what the engine DOES, whether or not that is what a learner would want; none of them is
 * a bug report written as a failing assertion.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { GoEvent, KnowledgeLevel, ReviewCandidate, UnitKnowledge } from '../../../packages/repository-contract/src';
import { validateEvent } from '../../../packages/repository-contract/src';
import { createFsrsScheduler } from '../../../packages/goreview/src/scheduler/fsrs';
import { buildCardRemoved, foldDeckItems, itemIdFor } from '../../../packages/goreview/src/scheduler/deck';
import { planSession } from '../../../packages/goreview/src/planner/planner';
import { admissionBudget } from '../../../packages/goreview/src/planner/budget';
import { remediationBacklog } from '../../../packages/goreview/src/planner/remediation';
import { choosePractice } from '../../../packages/goreview/src/planner/learning-policy';
import { reviewEligibility } from '../../../packages/goreview/src/planner/eligibility';
import { decideIntake } from '../../../packages/goreview/src/intake/intake';
import { gatherCandidates } from '../../../packages/goreview/src/intake/fetch';
import type { AssessmentDimension, DeckItem, ExerciseFamily, IntakeOutcome, PlannedItem, ReviewIntent, ReviewPreferences, SessionPlan, UnitFacts } from '../../../packages/goreview/src/types';
import { classCards, isClassUnit } from '../../../packages/goreview/app/classEssentials';
import { planFromEntries, type DeckEntry } from '../../../packages/goreview/app/deckModel';
import type { ReviewModel } from '../../../packages/goreview/app/workspace';
import type { AppContext } from '../../../packages/goreview/app/context';
import { audioOk, candidate, facts, knowledge, prefs } from '../intake/fixtures';

// ───────────────────────────── clocks, ids and event builders ─────────────────────────────

const L = 'L', E = 'E-sq', LANG = 'sq';
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const SIM0 = Date.parse('2026-10-26T09:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();
let seq = 0;
const nid = (prefix: string): string => `${prefix}-${String(++seq).padStart(5, '0')}`;

const SPEC = {
  rec: { dimension: 'written-recognition', family: 'written-recognition' },
  ret: { dimension: 'meaning-to-target-retrieval', family: 'meaning-to-form' },
  lis: { dimension: 'auditory-recognition', family: 'audio-to-meaning' },
  ctx: { dimension: 'productive-recall', family: 'sentence-completion' },
} as const satisfies Record<string, { dimension: AssessmentDimension; family: ExerciseFamily }>;
type Kind = keyof typeof SPEC;
const cardOf = (unit: string, kind: Kind): string => itemIdFor(unit, SPEC[kind].dimension);
const AUTO: ReviewIntent = { kind: 'automatic' };
const SAVED = (requestedAt: number): ReviewIntent => ({ kind: 'explicit', reason: 'saved-deck', requestedAt: iso(requestedAt) });

const producer = { app: 'gopractice-review', version: 'nine-words', deviceId: 'D1' };
function cardAdded(unit: string, kind: Kind, at: number, intent: ReviewIntent = AUTO, unitKind = 'form', admissionAt = at): GoEvent {
  const s = SPEC[kind];
  const e: GoEvent = { id: nid('add'), v: 3, learnerId: L, enrolmentId: E, languageId: LANG, at: iso(at), producer, kind: 'CardAdded',
    subject: { cardId: cardOf(unit, kind), itemIds: [unit] },
    payload: { lifecycle: 'create', unitId: unit, unitKind, dimension: s.dimension, family: s.family, addedBy: 'intake', admission: { at: iso(admissionAt), intent } },
    evidence: { quality: 'none' } };
  expect(validateEvent(e), e.id).toEqual([]);
  return e;
}
interface ReviewSpec { unit: string; kind: Kind; at: number; rating: 1 | 2 | 3 | 4; previous: string | null; intent?: ReviewIntent; dueBefore?: string; rBefore?: number; device?: string; id?: string }
function reviewEvent(s: ReviewSpec): GoEvent {
  const spec = SPEC[s.kind];
  const e: GoEvent = { id: s.id ?? nid('rev'), v: 3, learnerId: L, enrolmentId: E, languageId: LANG, at: iso(s.at), producer: { ...producer, deviceId: s.device ?? 'D1' }, kind: 'CardReviewed',
    subject: { cardId: cardOf(s.unit, s.kind), itemIds: [s.unit] },
    payload: { cardKind: 'recognition', family: spec.family, assessmentDimension: spec.dimension, rating: s.rating,
      grade: s.rating === 1 ? 'again' : s.rating === 2 ? 'hard' : s.rating === 3 ? 'good' : 'easy',
      correct: s.rating > 1, outcome: s.rating > 1 ? 'correct' : 'incorrect', responseMode: 'typed', hinted: false, retrievalAttempted: true,
      expectedPreviousReviewId: s.previous,
      ...(s.intent ? { practiceIntent: s.intent } : {}), ...(s.dueBefore ? { scheduledDueBefore: s.dueBefore } : {}), ...(s.rBefore !== undefined ? { retrievabilityBefore: s.rBefore } : {}) },
    evidence: { quality: 'moderate', sourceReliability: 1 } };
  expect(validateEvent(e), e.id).toEqual([]);
  return e;
}
const ignoreMark = (unit: string, at: number): GoEvent => {
  const e: GoEvent = { id: nid('mark'), v: 3, learnerId: L, enrolmentId: E, languageId: LANG, at: iso(at), producer, kind: 'ItemMarked',
    subject: { itemIds: [unit] }, payload: { mark: 'ignore' }, evidence: { quality: 'none' } };
  expect(validateEvent(e), e.id).toEqual([]);
  return e;
};
/** A history of (minutes before `origin`, rating) pairs, oldest first, as one chained card. */
function seed(events: GoEvent[], unit: string, kind: Kind, steps: ReadonlyArray<readonly [number, 1 | 2 | 3 | 4]>, origin = SIM0, unitKind = 'form'): void {
  events.push(cardAdded(unit, kind, origin - steps[0]![0] * MIN - MIN, AUTO, unitKind));
  let previous: string | null = null;
  for (const [ago, rating] of steps) {
    const e = reviewEvent({ unit, kind, at: origin - ago * MIN, rating, previous });
    events.push(e); previous = e.id;
  }
}
const D = 1440; // minutes per day

// ───────────────────────────── the world ─────────────────────────────

const scheduler = createFsrsScheduler();
const PREFS: ReviewPreferences = prefs({ cardsPerDeck: 20, maxNew: 5, dailyNewLimit: 5, sessionMinutes: 10,
  practiceGoals: ['recognition', 'retrieval', 'application', 'listening'], includeListening: true });

const NINE = Array.from({ length: 9 }, (_, i) => `form:sq:w${i + 1}`);
const NINE_HISTORY: Array<ReadonlyArray<readonly [number, 1 | 2 | 3 | 4]>> = [
  [[12 * D, 3], [11 * D, 3], [8 * D, 1], [8 * D - 15, 3], [4 * D, 2]],            // w1 review, due 10-26 09:00 (a struggling word: a lapse and Hard answers keep the interval short)
  [[10 * D, 3], [9 * D, 3], [6 * D, 1], [6 * D - 15, 3], [3 * D, 2]],             // w2 review, due 10-27
  [[12 * D, 3], [11 * D, 3], [8 * D, 1], [8 * D - 15, 3], [5 * D, 2], [2 * D, 2]], // w3 review, due 10-30 (6 reviews)
  [[10 * D, 3], [9 * D, 3], [7 * D, 1], [7 * D - 15, 3], [4 * D, 1], [4 * D - 15, 3]], // w4 review, overdue since 10-23 (6 reviews)
  [[10 * D, 3], [6 * D, 3], [3 * D, 3], [25, 1]],                      // w5 Again 25 min ago: relearning, due 10 min after the Again = already due
  [[8 * D, 3], [5 * D, 3], [2 * D, 1]],                                // w6 Again two days ago: relearning, long overdue
  [[9 * D, 3], [4 * D, 3], [1 * D, 3], [40, 1]],                       // w7 Again 40 min ago: relearning, due
  [[11 * D, 3], [10 * D, 3], [7 * D, 1], [7 * D - 15, 3], [5 * D, 3]], // w8 review, overdue since 10-25
  [[7 * D, 3], [3 * D, 3], [5, 1]],                                    // w9 Again 5 min ago: relearning, due at 09:05
];
const VARIANT_WORDS = [NINE[0]!, NINE[3]!, NINE[7]!]; // w1, w4, w8 also have a retrieval card and a listening card
/** Words whose Repository candidate asks for ANOTHER skill than recognition, though a recognition card already exists. */
const OTHER_TARGET: Record<string, { target: ReviewCandidate['targetDimension']; level: KnowledgeLevel }> = {
  [NINE[1]!]: { target: 'productiveRetrieval', level: 'known' },       // w2
  [NINE[2]!]: { target: 'listeningRecognition', level: 'familiar' },   // w3
  [NINE[4]!]: { target: 'contextualProduction', level: 'familiar' },   // w5
};
const INVENTORY = Array.from({ length: 40 }, (_, i) => `form:sq:inv${String(i + 1).padStart(2, '0')}`);
const NEW_LEVEL = ['form:sq:new1', 'form:sq:new2', 'form:sq:new3', 'form:sq:new4'];
const DISMISSED = ['form:sq:ign1', 'form:sq:ign2'];
const SUSPENDED = 'form:sq:susp1';
const NO_FACTS = ['form:sq:nofacts1', 'form:sq:nofacts2', 'form:sq:nofacts3'];

function know(unit: string, level: KnowledgeLevel, encounters = 3): UnitKnowledge {
  return { ...knowledge(unit, { readingRecognition: { score: level === 'known' ? 0.7 : 0.5, confidence: 0.5, observations: encounters, positive: Math.max(0, encounters - 1), negative: 1 } }),
    learnerId: L, level, encounters, uncertainty: 0.4, firstSeenAt: iso(SIM0 - 20 * DAY), lastSeenAt: iso(SIM0 - DAY) };
}
const cand = (unit: string, score: number, over: Partial<ReviewCandidate> = {}): ReviewCandidate => candidate({ unitId: unit, kind: 'form', score, ...over });

interface World { events: GoEvent[]; candidates: ReviewCandidate[]; knowledge: UnitKnowledge[]; ignored: Set<string> }
function buildWorld(): World {
  const events: GoEvent[] = [], candidates: ReviewCandidate[] = [], rows: UnitKnowledge[] = [];
  NINE.forEach((unit, i) => {
    seed(events, unit, 'rec', NINE_HISTORY[i]!);
    const other = OTHER_TARGET[unit];
    candidates.push(cand(unit, 0.99 - i * 0.005, other ? { targetDimension: other.target } : {}));
    rows.push(know(unit, other?.level ?? 'familiar', 8));
  });
  for (const unit of VARIANT_WORDS) {
    seed(events, unit, 'ret', [[9 * D, 3], [8 * D, 3], [5 * D, 1], [5 * D - 15, 3], [2 * D, 2]]);
    seed(events, unit, 'lis', [[8 * D, 3], [7 * D, 3], [4 * D, 1], [4 * D - 15, 3], [1.5 * D, 2]]);
  }
  INVENTORY.forEach((unit, i) => {
    const level: KnowledgeLevel = i % 3 === 0 ? 'seen' : i % 3 === 1 ? 'recognized' : 'familiar';
    candidates.push(cand(unit, 0.95 - i * 0.01)); rows.push(know(unit, level, 3));
  });
  NEW_LEVEL.forEach((unit) => { candidates.push(cand(unit, 0.97)); rows.push(know(unit, 'new', 0)); });
  DISMISSED.forEach((unit) => { candidates.push(cand(unit, 0.96)); rows.push(know(unit, 'recognized', 3)); events.push(ignoreMark(unit, SIM0 - 3 * DAY)); });
  seed(events, SUSPENDED, 'rec', [[5 * D, 3]]);
  events.push(buildCardRemoved({ learnerId: L, enrolmentId: E, languageId: LANG, at: iso(SIM0 - 1 * HOUR), deviceId: 'D1', itemId: cardOf(SUSPENDED, 'rec'), reason: 'suspended' }));
  candidates.push(cand(SUSPENDED, 0.9)); rows.push(know(SUSPENDED, 'familiar', 4));
  NO_FACTS.forEach((unit) => { candidates.push(cand(unit, 0.995)); rows.push(know(unit, 'familiar', 4)); });
  return { events, candidates, knowledge: rows, ignored: new Set(DISMISSED) };
}
const validatedFacts = (unit: string): UnitFacts => {
  const base = facts(unit);
  return { ...base, unit: { ...base.unit, provenance: { ...base.unit.provenance, validation: 'production-validated' } } } as UnitFacts;
};
/** Verified pack facts for every unit except the named ones; the productive and contextual targets need production-validated facts (intake.ts:183). */
const factsProvider = (noFacts: ReadonlySet<string>) => async (unitId: string): Promise<UnitFacts | undefined> => {
  if (noFacts.has(unitId)) return undefined;
  return unitId in OTHER_TARGET ? validatedFacts(unitId) : facts(unitId);
};

async function intakeFor(world: Pick<World, 'candidates' | 'knowledge' | 'ignored'>, events: GoEvent[], deck: DeckItem[], now: number, preferences = PREFS,
  provider: (u: string) => Promise<UnitFacts | undefined> = factsProvider(new Set(NO_FACTS)), withKnowledge = true): Promise<IntakeOutcome[]> {
  return gatherCandidates({
    // the app drops dismissed vocabulary before intake (workspace.ts `proposed`)
    api: { candidates: async () => world.candidates.filter((c) => !world.ignored.has(c.unitId)), knowledge: async (ids) => withKnowledge ? world.knowledge.filter((k) => ids.includes(k.unitId)) : [] },
    facts: { factsFor: (u) => provider(u) }, audio: async () => audioOk, deck, saved: new Set(), preferences, now: iso(now), enrolmentId: E,
    limit: world.candidates.length, readingSignals: events });
}
const deckAt = (events: readonly GoEvent[], now: number): DeckItem[] => foldDeckItems(events, scheduler, { learnerId: L, languageId: LANG, now: iso(now) });
const planAuto = (deck: DeckItem[], intake: IntakeOutcome[], events: GoEvent[], world: Pick<World, 'knowledge'>, now: number, preferences = PREFS): SessionPlan =>
  planSession({ deck, intake, preferences, audio: audioOk, scheduler, now: iso(now), knowledge: world.knowledge, readingSignals: events, learnerId: L, random: () => 0.1 });
const effective = (item: DeckItem) => item.history.filter((h) => !h.retracted && !h.scheduleExcluded && !h.conflict);

// ───────────────────────────── app-layer fakes for "Repeat this batch" / saved decks ─────────────────────────────

function fakeCtx(): AppContext {
  return { api: async () => ({ api: {} }),
    engine: { exerciseAvailable: async () => true,
      plan: (req: { deck: DeckItem[]; intake: IntakeOutcome[]; prefs: ReviewPreferences; audio: typeof audioOk; now: string; knowledge?: UnitKnowledge[]; readingSignals?: GoEvent[];
        observedReviewSeconds?: Record<string, number>; intent?: ReviewIntent }) => planSession({ deck: req.deck, intake: req.intake, preferences: req.prefs, audio: req.audio, scheduler,
        now: req.now, random: () => 0.1, knowledge: req.knowledge, readingSignals: req.readingSignals, observedReviewSeconds: req.observedReviewSeconds, intent: req.intent, learnerId: L }) } } as unknown as AppContext;
}
function fakeModel(world: Pick<World, 'knowledge'>, events: GoEvent[], now: number): ReviewModel {
  const wholeDeck = deckAt(events, now);
  return { identity: { learnerId: L, enrolmentId: E, languageId: LANG, deviceId: 'D1' }, prefs: PREFS, events, deck: wholeDeck.filter((i) => !isClassUnit(i.unitId)),
    classDeck: wholeDeck.filter((i) => isClassUnit(i.unitId)), audio: audioOk, outcomes: [], knowledge: world.knowledge, dismissed: [], choices: {}, saved: new Set(),
    candidateSource: 'live', now: iso(now), algorithm: scheduler.algorithm, parametersVersion: scheduler.parametersVersion } as unknown as ReviewModel;
}
const entriesFor = (deck: DeckItem[], units: string[]): DeckEntry[] => units.map((u) => {
  const i = deck.find((x) => x.itemId === cardOf(u, 'rec'))!;
  return { itemId: i.itemId, unitId: i.unitId, unitKind: i.unitKind, label: u.split(':')[2]!, dimension: i.dimension, family: i.family };
});

// ───────────────────────────── the simulation ─────────────────────────────

interface ItemTrace { cardId: string; unitId: string; family: string; queue: string; isNew: boolean; intent: string; origin: string;
  dueBefore: string | null; rBefore: number | null; phaseBefore: string; answerAt: string;
  dueAfter: string; phaseAfter: string; stabilityAfter: number; scheduledDaysAfter: number; repsAfter: number; historyBefore: number; historyAfter: number;
  earlyPractice: boolean; independentDueAfter: string; independentPhaseAfter: string }
interface SessionTrace { n: string; kind: 'auto' | 'saved'; at: string; budgetBefore: { used: number; remaining: number }; budgetAfter: { used: number; remaining: number };
  batchReasons: string[]; availableWork: SessionPlan['availableWork']; dueCount: number; newCount: number; planned: number; target: number | undefined;
  items: ItemTrace[]; skipped: Array<{ itemId: string; why: string }>; skippedByWhy: Record<string, number>; decisions: Record<string, number>;
  newlyAdmittedUnits: string[]; unitsNotMentioned: string[]; cardsPerUnit: Record<string, number> }
interface Simulation { rows: SessionTrace[]; events: GoEvent[]; world: World; text: string[] }
const countBy = <T,>(xs: readonly T[], key: (x: T) => string): Record<string, number> => { const out: Record<string, number> = {}; for (const x of xs) out[key(x)] = (out[key(x)] ?? 0) + 1; return out; };
const f4 = (n: number): number => Math.round(n * 10_000) / 10_000;

const SCHEDULE: Array<{ n: string; kind: 'auto' | 'saved'; at: number }> = [
  { n: 'S1', kind: 'auto', at: SIM0 },                                   // D1 09:00
  { n: 'S2', kind: 'auto', at: SIM0 + 20 * MIN },                        // D1 09:20
  { n: 'S3', kind: 'auto', at: SIM0 + 40 * MIN },                        // D1 09:40
  { n: 'S4', kind: 'auto', at: SIM0 + DAY },                             // D2 09:00
  { n: 'S5', kind: 'auto', at: SIM0 + DAY + 20 * MIN },                  // D2 09:20
  { n: 'SD1', kind: 'saved', at: SIM0 + DAY + 6 * HOUR },                // D2 15:00 saved deck of the nine (explicit)
  { n: 'SD2', kind: 'saved', at: SIM0 + DAY + 6 * HOUR + 10 * MIN },     // D2 15:10 "Repeat this batch" of SD1
  { n: 'S6', kind: 'auto', at: SIM0 + 2 * DAY },                         // D3 09:00
  { n: 'S7', kind: 'auto', at: SIM0 + 2 * DAY + 20 * MIN },              // D3 09:20
  { n: 'SD3', kind: 'saved', at: SIM0 + 2 * DAY + 3 * HOUR },            // D3 12:00 a second, overlapping saved deck of the same nine
  { n: 'S8', kind: 'auto', at: SIM0 + 4 * DAY },                         // D5 09:00
  { n: 'S9', kind: 'auto', at: SIM0 + 8 * DAY },                         // D9 09:00
];

async function simulate(rating: 3 | 4 = 4): Promise<Simulation> {
  const world = buildWorld();
  const events = [...world.events];
  const rows: SessionTrace[] = [], text: string[] = [];
  const trackedUnits = [...NINE, ...INVENTORY, ...NEW_LEVEL, ...DISMISSED, SUSPENDED, ...NO_FACTS];
  for (const s of SCHEDULE) {
    const deck = deckAt(events, s.at);
    const before = new Map(deck.map((i) => [i.itemId, i]));
    let plan: SessionPlan, outcomes: IntakeOutcome[] = [];
    if (s.kind === 'auto') {
      outcomes = await intakeFor(world, events, deck, s.at);
      plan = planAuto(deck, outcomes, events, world, s.at);
    } else {
      // a saved deck of the nine recognition cards (SD2 is "Repeat this batch" of SD1; SD3 an overlapping deck over the same nine)
      plan = await planFromEntries(fakeCtx(), fakeModel(world, events, s.at), entriesFor(deck, NINE), NINE.length);
    }
    const budgetBefore = admissionBudget(events, { learnerId: L, languageId: LANG, now: iso(s.at), maxNew: PREFS.maxNew, dailyNewLimit: PREFS.dailyNewLimit! });
    const answered: Array<{ planned: PlannedItem; answerAt: number; independent: ReturnType<typeof scheduler.review> }> = [];
    plan.items.forEach((planned, index) => {
      const answerAt = s.at + (index + 1) * 20_000;
      const inDeck = before.has(planned.item.itemId);
      const independent = scheduler.review(inDeck ? planned.item.schedule : scheduler.newState(iso(s.at)), rating, iso(answerAt)); // the library's own result for this rating
      const intent = planned.intent ?? AUTO;
      const kind = (Object.keys(SPEC) as Kind[]).find((k) => SPEC[k].family === planned.family)!;
      if (!inDeck) events.push(cardAdded(planned.item.unitId, kind, s.at, intent, planned.item.unitKind, answerAt)); // the runner writes CardAdded with the first answer
      const head = [...planned.item.history].reverse().find((h) => !h.retracted && !h.scheduleExcluded && !h.conflict)?.eventId ?? null;
      events.push(reviewEvent({ unit: planned.item.unitId, kind, at: answerAt, rating, previous: head, intent, dueBefore: planned.item.schedule.due,
        rBefore: effective(planned.item).length ? scheduler.retrievability(planned.item.schedule, iso(answerAt)) : 0, id: `gr:${s.n}:${index}:CardReviewed` }));
      answered.push({ planned, answerAt, independent });
    });
    const end = s.at + (plan.items.length + 1) * 20_000;
    const after = new Map(deckAt(events, end).map((i) => [i.itemId, i]));
    const itemRows: ItemTrace[] = answered.map(({ planned, answerAt, independent }) => {
      const b = before.get(planned.item.itemId), a = after.get(planned.item.itemId)!;
      const fresh = !b || effective(b).length === 0;
      return { cardId: planned.item.itemId, unitId: planned.item.unitId, family: planned.family, queue: planned.queue ?? '?', isNew: planned.isNew,
        intent: planned.intent?.kind === 'explicit' ? 'explicit:' + planned.intent.reason : 'automatic', origin: planned.origin ?? '?',
        dueBefore: fresh ? null : planned.item.schedule.due, rBefore: fresh ? null : f4(scheduler.retrievability(planned.item.schedule, iso(answerAt))),
        phaseBefore: fresh ? 'new' : planned.item.schedule.phase, answerAt: iso(answerAt),
        dueAfter: a.schedule.due, phaseAfter: a.schedule.phase, stabilityAfter: f4(a.schedule.stability), scheduledDaysAfter: a.schedule.scheduledDays, repsAfter: a.schedule.reps,
        historyBefore: b ? b.history.length : 0, historyAfter: a.history.length, earlyPractice: a.history.at(-1)?.earlyPractice === true,
        independentDueAfter: independent.due, independentPhaseAfter: independent.phase };
    });
    const budgetAfter = admissionBudget(events, { learnerId: L, languageId: LANG, now: iso(end), maxNew: PREFS.maxNew, dailyNewLimit: PREFS.dailyNewLimit! });
    const mentioned = new Set([...plan.items.map((p) => p.item.unitId), ...plan.skipped.map((x) => x.itemId.split(':').slice(2).join(':'))]);
    const cardsPerUnit: Record<string, number> = {};
    for (const i of after.values()) cardsPerUnit[i.unitId] = (cardsPerUnit[i.unitId] ?? 0) + 1;
    const row: SessionTrace = { n: s.n, kind: s.kind, at: iso(s.at), budgetBefore, budgetAfter, batchReasons: plan.batch?.reasons ?? [], availableWork: plan.availableWork,
      dueCount: plan.dueCount, newCount: plan.newCount, planned: plan.items.length, target: plan.batch?.targetQuestions, items: itemRows, skipped: plan.skipped,
      skippedByWhy: countBy(plan.skipped, (x) => x.why), decisions: countBy(outcomes, (o) => o.decision),
      newlyAdmittedUnits: itemRows.filter((r) => r.historyBefore === 0).map((r) => r.unitId), unitsNotMentioned: trackedUnits.filter((u) => !mentioned.has(u)), cardsPerUnit };
    rows.push(row);
    text.push(`── [answers rated ${rating}] ${row.n} (${row.kind}) ${row.at.slice(0, 16)}Z  allowance used ${budgetBefore.used}->${budgetAfter.used}, remaining ${budgetBefore.remaining}->${budgetAfter.remaining}; planned ${row.planned}/${row.target} (dueCount ${row.dueCount}, newCount ${row.newCount}); availableWork ${JSON.stringify(row.availableWork)}`);
    text.push(`   batch: ${row.batchReasons.join(' | ')}`);
    for (const r of itemRows) text.push(`   + ${r.cardId.replace('card:', '').padEnd(46)} ${r.queue.padEnd(8)} new=${r.isNew ? 'Y' : 'n'} ${r.intent.padEnd(20)} due ${(r.dueBefore ?? 'NEW').slice(5, 16)} R ${r.rBefore ?? '-'} ${r.phaseBefore} -> due ${r.dueAfter.slice(5, 16)} ${r.phaseAfter} S ${r.stabilityAfter} sd ${r.scheduledDaysAfter}${r.earlyPractice ? ' EARLY-PRACTICE(schedule unchanged)' : ''}`);
    for (const [why, n] of Object.entries(row.skippedByWhy)) text.push(`   - skipped x${n}: ${why}`);
    if (s.kind === 'auto') text.push(`   intake decisions: ${JSON.stringify(row.decisions)}; tracked units in neither plan.items nor plan.skipped: ${row.unitsNotMentioned.length}`);
  }
  return { rows, events, world, text };
}

// ───────────────────────────── tests ─────────────────────────────

let SIM: Simulation, SIM_GOOD: Simulation;
describe('nine words: chronological reproduction (every answer rated Easy)', () => {
  beforeAll(async () => {
    SIM = await simulate(4);
    SIM_GOOD = await simulate(3);
    console.log('\n===== TRACE (nine words with history, 40 inventory units, ineligible units; every answer Easy=4; allowance 5/day) =====\n' + SIM.text.join('\n'));
    console.log('\n===== VARIANT TRACE: the same world, every answer rated Good=3 =====\n' + SIM_GOOD.text.join('\n'));
  }, 60_000);

  it('starting point: the nine words, three of them with retrieval and listening variants', () => {
    const deck = deckAt(SIM.world.events, SIM0);
    const nineCards = deck.filter((i) => NINE.includes(i.unitId) && i.dimension === 'written-recognition');
    expect(nineCards).toHaveLength(9);
    console.log('START STATES', JSON.stringify(Object.fromEntries(nineCards.map((i) => [i.unitId.split(':')[2], `${i.schedule.phase}@${i.schedule.due.slice(5, 16)}`]))));
    expect(deck.filter((i) => ['learning', 'relearning'].includes(i.schedule.phase)).length).toBeGreaterThanOrEqual(3);
    expect(deck.filter((i) => VARIANT_WORDS.includes(i.unitId)).length).toBe(9); // 3 words x (recognition + retrieval + listening)
    expect(NINE.every((u) => effective(deck.find((i) => i.itemId === cardOf(u, 'rec'))!).length >= 3)).toBe(true);
  });

  it('1: every Easy lands in the fold and moves the schedule forward; a review-phase Easy is >= 1 day out; a (re)learning Easy graduates', () => {
    const autoItems = SIM.rows.filter((r) => r.kind === 'auto').flatMap((r) => r.items);
    expect(autoItems.length).toBeGreaterThan(20);
    for (const r of autoItems) {
      expect(r.historyAfter, r.cardId).toBe(r.historyBefore + 1);
      expect(r.earlyPractice, r.cardId).toBe(false);
      expect(Date.parse(r.dueAfter), r.cardId).toBeGreaterThan(Date.parse(r.answerAt));
      expect(r.dueAfter, r.cardId).toBe(r.independentDueAfter); // the fold equals the library's own Easy
      expect(r.phaseAfter, r.cardId).toBe('review');
      expect(r.scheduledDaysAfter, r.cardId).toBeGreaterThanOrEqual(1);
      expect(Date.parse(r.dueAfter) - Date.parse(r.answerAt), r.cardId).toBeGreaterThanOrEqual(DAY - 1_000);
    }
    expect(autoItems.some((r) => r.phaseBefore === 'relearning')).toBe(true); // a relearning card graduated with Easy
    expect(autoItems.some((r) => r.phaseBefore === 'review')).toBe(true);
  });

  it('2: a card rated Easy in an automatic session is never planned again by a later automatic session unless its due passed', () => {
    const lastAnswer = new Map<string, string>();
    const returns: string[] = [];
    for (const row of SIM.rows) {
      if (row.kind === 'auto') for (const item of row.items) {
        const dueAfter = lastAnswer.get(item.cardId);
        if (dueAfter && Date.parse(dueAfter) > Date.parse(row.at)) returns.push(`${item.cardId} in ${row.n} before due ${dueAfter}`);
      }
      for (const item of row.items) lastAnswer.set(item.cardId, item.dueAfter);
    }
    expect(returns).toEqual([]);
  });

  it('OBSERVED (mechanism M1): "Repeat this batch" / a saved deck re-asks cards rated Easy minutes earlier, and the Easy changes nothing', () => {
    const sd1 = SIM.rows.find((r) => r.n === 'SD1')!, sd2 = SIM.rows.find((r) => r.n === 'SD2')!, sd3 = SIM.rows.find((r) => r.n === 'SD3')!;
    for (const row of [sd1, sd2, sd3]) {
      expect(row.items.length, row.n).toBe(9);
      expect(row.items.every((r) => r.intent === 'explicit:saved-deck')).toBe(true);
    }
    // SD2 is the 10-minute-later repeat of SD1: every card is asked again although SD1 just rated it Easy
    const sd1Cards = new Set(sd1.items.map((r) => r.cardId));
    expect(sd2.items.every((r) => sd1Cards.has(r.cardId))).toBe(true);
    // the schedule is unchanged by the repeat (earlyPractice): history grows, due stays, nothing is promoted further
    for (const r of [...sd2.items, ...sd3.items]) {
      expect(r.earlyPractice, r.cardId).toBe(true);
      expect(r.dueAfter, r.cardId).toBe(r.dueBefore);
      expect(r.historyAfter, r.cardId).toBe(r.historyBefore + 1);
    }
    // existing cards: asking them again spends no admission allowance
    expect(sd2.budgetAfter.used).toBe(sd2.budgetBefore.used);
    expect(sd3.budgetAfter.used).toBe(sd3.budgetBefore.used);
  });

  it('3: once the nine are not due, the next sessions admit new eligible inventory units up to the daily allowance, and are not empty', () => {
    const autoRows = SIM.rows.filter((r) => r.kind === 'auto');
    const admittedByDay: Record<string, string[]> = {};
    for (const row of autoRows) for (const u of row.newlyAdmittedUnits) (admittedByDay[row.at.slice(0, 10)] ??= []).push(u);
    console.log('NEW CARDS BY UTC DAY', JSON.stringify(admittedByDay));
    for (const [day, units] of Object.entries(admittedByDay)) expect(units.length, day).toBeLessThanOrEqual(5); // never past the 5/day allowance
    const allAdmitted = Object.values(admittedByDay).flat();
    for (const u of allAdmitted) expect([...NEW_LEVEL, ...DISMISSED, SUSPENDED, ...NO_FACTS], u).not.toContain(u); // only eligible units are admitted
    for (const row of autoRows) if ((row.availableWork?.questions ?? 0) > 0) expect(row.planned, row.n).toBeGreaterThan(0);
    expect(allAdmitted.filter((u) => INVENTORY.includes(u)).length).toBeGreaterThan(0);
  });

  it('4: when nothing is due and the allowance is spent, planSession returns no items; skipped explains the deck cards and the test-now outcomes only', async () => {
    // Day 1 at 12:00Z: S1-S3 answered everything that was due, and the allowance was used on day 1
    const events = SIM.events, world = SIM.world, now = SIM0 + 3 * HOUR;
    const deck = deckAt(events, now.valueOf());
    const budget = admissionBudget(events.filter((e) => Date.parse(e.at) <= now), { learnerId: L, languageId: LANG, now: iso(now), maxNew: 5, dailyNewLimit: 5 });
    const dayEvents = events.filter((e) => Date.parse(e.at) <= now);
    const outcomes = await intakeFor(world, dayEvents, deckAt(dayEvents, now), now);
    const plan = planAuto(deckAt(dayEvents, now), outcomes, dayEvents, world, now);
    const dueNow = deckAt(dayEvents, now).filter((i) => effective(i).length && scheduler.isDue(i.schedule, iso(now)) && i.status === 'active');
    const whys = [...new Set(plan.skipped.map((x) => x.why))].sort();
    console.log('NOTHING-DUE STATE', JSON.stringify({ at: iso(now), budget, dueNow: dueNow.length, items: plan.items.length, availableWork: plan.availableWork, whys, decisions: countBy(outcomes, (o) => o.decision), deckSize: deck.length }));
    expect(budget.remaining).toBe(0);
    expect(dueNow).toHaveLength(0);
    expect(plan.items).toEqual([]);
    expect(plan.availableWork).toEqual({ questions: 0, newQuestions: 0 });
    expect(whys).toContain('not due; optional remediation is separate from scheduled review');
    expect(whys).toContain('new-card budget exhausted');
    // OBSERVED: `skipped` lists deck cards and the TEST-NOW outcomes (planner.ts:224-236). Units intake did not make test-now
    // (level New, facts missing, suspended, beyond the comparative rank ...) appear nowhere in the plan; their reasons exist only on the IntakeOutcome.
    const mentioned = new Set(plan.skipped.map((x) => x.itemId));
    for (const u of [...NEW_LEVEL, ...NO_FACTS]) expect(mentioned.has(cardOf(u, 'rec')), u).toBe(false);
    const reasonOf = (u: string) => outcomes.find((o) => o.unitId === u)?.reasons[0];
    // Until 2026-10-29 fetch.ts sent every low-priority outcome that has no proposal through the facts step and relabelled a level-New unit
    // needs-validation with "the pack has no verified facts ..." FIRST, indistinguishable from a unit whose facts truly are missing. Now a
    // low-priority decision keeps its own reason first and the missing facts are noted after it.
    const newOutcome = outcomes.find((o) => o.unitId === NEW_LEVEL[0])!, noFactsOutcome = outcomes.find((o) => o.unitId === NO_FACTS[0])!;
    expect(newOutcome.decision).toBe('low-priority');
    expect(newOutcome.reasons).toEqual(['level New: automatic review excludes items not yet understood', 'the pack has no verified facts for this unit, so no exercise can be built']);
    expect(noFactsOutcome.decision).toBe('needs-validation');
    expect(reasonOf(NO_FACTS[0]!)).toBe('the pack has no verified facts for this unit, so no exercise can be built');
    expect(outcomes.find((o) => o.unitId === SUSPENDED)?.decision).toBe('already-covered');
    expect(reasonOf(SUSPENDED)).toBe('suspended; resume deliberately before practice');
    expect(outcomes.find((o) => o.unitId === DISMISSED[0]!)).toBeUndefined(); // dismissed vocabulary never reaches intake
  });

  it('4b: the distinct `why` strings the planner used across the whole simulation; dismissed vocabulary has its own reason at the shared gate', () => {
    const whys = [...new Set(SIM.rows.flatMap((r) => r.skipped.map((x) => x.why)))].sort();
    console.log('DISTINCT skipped.why STRINGS:\n  ' + whys.join('\n  '));
    expect(whys).toContain('not due; optional remediation is separate from scheduled review');
    expect(reviewEligibility({ unitId: DISMISSED[0]!, events: SIM.world.events, now: iso(SIM0), knowledge: know(DISMISSED[0]!, 'recognized'), remainingNew: 5 }))
      .toMatchObject({ eligible: false, reason: 'dismissed vocabulary; restore it deliberately before practice' });
  });

  it('5: cards per unit, and whether the retrieval / listening variants come due independently', () => {
    const final = deckAt(SIM.events, SIM0 + 9 * DAY);
    const perUnit = countBy(final, (i) => i.unitId);
    console.log('UNITS WITH MORE THAN ONE CARD (end of simulation):', Object.entries(perUnit).filter(([, n]) => n > 1).map(([u, n]) => `${u}=${n}`).join(', '));
    for (const u of VARIANT_WORDS) expect(perUnit[u], u).toBeGreaterThanOrEqual(3);
    for (const u of VARIANT_WORDS) {
      const dues = (['rec', 'ret', 'lis'] as Kind[]).map((k) => final.find((i) => i.itemId === cardOf(u, k))!.schedule.due);
      expect(new Set(dues).size, u + ' ' + dues.join(',')).toBeGreaterThan(1); // independent due instants
    }
    const start = deckAt(SIM.world.events, SIM0);
    const w1 = (['rec', 'ret', 'lis'] as Kind[]).map((k) => start.find((i) => i.itemId === cardOf(NINE[0]!, k))!.schedule.due);
    console.log('w1 due instants at start (rec | ret | lis):', w1.join(' | '));
    expect(new Set(w1).size).toBe(3);
    // OBSERVED: words whose Repository candidate asks for another skill got a SECOND card through intake, as a NEW admission (the same word, a different question)
    const second = SIM.rows.filter((r) => r.kind === 'auto').flatMap((r) => r.items).filter((r) => r.historyBefore === 0 && Object.keys(OTHER_TARGET).includes(r.unitId));
    console.log('second-card admissions for words already in the deck:', second.map((r) => `${r.cardId} ${r.answerAt.slice(0, 16)}`).join('; ') || 'none');
    expect(second.length).toBeGreaterThan(0);
    for (const r of second) expect(r.family).not.toBe('written-recognition');
  });
});

describe('variant: the same world, every answer rated Good', () => {
  it('6: Good on a new card puts it in a 10-minute learning step, so the new cards of the day come straight back and the later sessions hold only 1-6 cards', () => {
    const rows = SIM_GOOD.rows.filter((r) => r.kind === 'auto');
    const byName = Object.fromEntries(rows.map((r) => [r.n, r]));
    console.log('GOOD VARIANT planned per auto session:', rows.map((r) => `${r.n}=${r.planned}(${r.items.map((i) => i.queue[0]).join('')})`).join(' '));
    // S2 / S3 / S5 (20 and 40 minutes later, allowance already spent): learning returns only, no new cards
    for (const n of ['S2', 'S3', 'S5']) {
      const row = byName[n]!;
      expect(row.budgetBefore.remaining === 0 || n === 'S2', n).toBe(true);
      expect(row.items.filter((i) => i.isNew && i.historyBefore === 0 && i.queue === 'new').length, n).toBeLessThanOrEqual(1);
      expect(row.planned, n).toBeLessThanOrEqual(6);
    }
    expect(byName.S3!.items.every((i) => i.queue === 'learning')).toBe(true);
    expect(byName.S5!.items.every((i) => i.queue === 'learning')).toBe(true);
    expect(byName.S3!.planned).toBeLessThanOrEqual(3); // OBSERVED: a 2-3 card session is the learning returns of cards introduced 40 minutes earlier
    // every one of those returning cards was introduced (CardAdded) in the previous session of the same day
    for (const i of byName.S5!.items) expect(i.historyBefore).toBe(1);
    // and with Easy the same sessions are empty or nearly so
    expect(SIM.rows.find((r) => r.n === 'S3')!.planned).toBe(0);
  });
});

// ───────────────────────────── probes ─────────────────────────────

describe('probes P1-P11', () => {
  it('P1 Class Essentials: ten first-time class cards in one UTC day, asked as an explicit saved deck', async () => {
    const world = buildWorld();
    const now = SIM0 + 4 * HOUR; // 13:00Z; the class cards were first answered at 08:00-08:09Z the same UTC day
    const classUnits = classCards('sq').slice(0, 10).map((c) => c.unitId);
    const events = [...world.events];
    classUnits.forEach((unit, i) => {
      const t = SIM0 - HOUR + i * MIN;
      events.push(cardAdded(unit, 'rec', t, SAVED(t), 'lexeme'));
      events.push(reviewEvent({ unit, kind: 'rec', at: t + 20_000, rating: 4, previous: null, intent: SAVED(t) }));
    });
    expect(classUnits.every((u) => isClassUnit(u))).toBe(true);
    const budget = admissionBudget(events, { learnerId: L, languageId: LANG, now: iso(now), maxNew: 5, dailyNewLimit: 5 });
    const three = admissionBudget(events.filter((e) => !classUnits.slice(3).some((u) => e.subject.itemIds?.includes(u))), { learnerId: L, languageId: LANG, now: iso(now), maxNew: 5, dailyNewLimit: 5 });
    console.log('P1 admissionBudget with 10 / 3 class cards created today:', JSON.stringify(budget), JSON.stringify(three));
    // OBSERVED at master 19b66367 (budget.ts: "a creation counts whatever asked for it"): every first-time class card is one introduction,
    // so ten of them are {used: 10, remaining: 0}. A working tree that exempts `class:` units from the allowance reads {used: 0, remaining: 5}.
    expect([{ used: 10, remaining: 0 }, { used: 0, remaining: 5 }]).toContainEqual(budget);
    expect([{ used: 3, remaining: 2 }, { used: 0, remaining: 5 }]).toContainEqual(three);
    const exempt = budget.used === 0;
    // the previous UTC day does not count either way
    expect(admissionBudget(events, { learnerId: L, languageId: LANG, now: iso(now + DAY), maxNew: 5, dailyNewLimit: 5 })).toEqual({ used: 0, remaining: 5 });
    // the planner: class cards are kept out of `deck` by the app (workspace.ts `classDeck`), but their events stay in readingSignals and in the budget
    const deck = deckAt(events, now).filter((i) => !isClassUnit(i.unitId));
    const inventoryOnly = { ...world, candidates: world.candidates.filter((c) => !NINE.includes(c.unitId)) };
    const plan = planAuto(deck, await intakeFor(inventoryOnly, events, deck, now), events, world, now);
    const newItems = plan.items.filter((p) => p.isNew);
    console.log('P1 plan: new items', newItems.length, '| skipped reasons', JSON.stringify([...new Set(plan.skipped.map((x) => x.why))]), '| batch', plan.batch?.reasons.at(-1));
    if (!exempt) {
      expect(newItems).toHaveLength(0);
      expect(plan.availableWork?.newQuestions).toBe(0);
      expect(plan.skipped.map((x) => x.why)).toContain('new-card budget exhausted');
      expect(plan.batch?.reasons.at(-1)).toBe('Automatic new-card limit is zero.');
    } else expect(newItems.length).toBeGreaterThan(0);
    // control: the same learner with no class cards that day admits new units
    const control = planAuto(deckAt(world.events, now), await intakeFor(inventoryOnly, world.events, deckAt(world.events, now), now), world.events, world, now);
    console.log('P1 control (no class cards today): new items', control.items.filter((p) => p.isNew).length);
    expect(control.items.filter((p) => p.isNew).length).toBeGreaterThan(0);
  });

  it('P2 knowledge missing: with no knowledge rows no candidate reaches the planner; intake files every one under needs-validation with the "beyond New" reason SECOND', async () => {
    const world = buildWorld();
    const inventoryOnly = { ...world, candidates: world.candidates.filter((c) => INVENTORY.includes(c.unitId)) };
    const outcomes = await intakeFor(inventoryOnly, [], [], SIM0, PREFS, factsProvider(new Set()), false);
    const plan = planSession({ deck: [], intake: outcomes, preferences: PREFS, audio: audioOk, scheduler, now: iso(SIM0), readingSignals: [], learnerId: L, random: () => 0.1 });
    console.log('P2 first outcome:', JSON.stringify(outcomes[0]!.reasons), '| decisions', JSON.stringify(countBy(outcomes, (o) => o.decision)), '| plan.skipped', JSON.stringify(plan.skipped));
    // The shared gate refuses at decideIntake (low-priority, no proposal). Until 2026-10-29 fetch.ts then relabelled it needs-validation with the
    // facts sentence in FRONT, so a failed knowledge batch looked exactly like New and like missing facts; now the gate's reason stays first.
    // (The app layer separately withholds units whose knowledge batch failed with the code knowledge-unresolved, so they are not New either.)
    expect(outcomes).toHaveLength(40);
    for (const o of outcomes) {
      expect(o.decision).toBe('low-priority');
      expect(o.reasons).toEqual(['automatic admission needs observed knowledge beyond New', 'the pack has no verified facts for this unit, so no exercise can be built']);
    }
    expect(plan.items).toEqual([]);
    expect(plan.skipped).toEqual([]); // and the plan does not mention them at all
    expect(plan.availableWork).toEqual({ questions: 0, newQuestions: 0 });
    // Where the planner itself says "beyond New": an outcome that arrives as test-now while the knowledge row is absent (planner.ts make() -> eligibility.ts:77)
    const forced: IntakeOutcome[] = inventoryOnly.candidates.slice(0, 3).map((c) => ({ unitId: c.unitId, decision: 'test-now' as const, reasons: ['forced'],
      proposed: { dimension: 'written-recognition' as const, family: 'written-recognition' as const }, candidate: c }));
    const direct = planSession({ deck: [], intake: forced, preferences: PREFS, audio: audioOk, scheduler, now: iso(SIM0), readingSignals: [], learnerId: L, random: () => 0.1 });
    expect(direct.skipped.map((x) => x.why)).toEqual(Array(3).fill('automatic admission needs observed knowledge beyond New'));
  });

  it('P3 facts unavailable: a provider returning undefined makes the unit needs-validation; the planner never sees it (no skipped row either)', async () => {
    const world = buildWorld();
    const inventoryOnly = { ...world, candidates: world.candidates.filter((c) => INVENTORY.includes(c.unitId)) };
    const outcomes = await intakeFor(inventoryOnly, [], [], SIM0, PREFS, async () => undefined);
    console.log('P3 decisions (provider answers undefined for everything):', JSON.stringify(countBy(outcomes, (o) => o.decision)));
    const flipped = outcomes.filter((o) => o.decision === 'needs-validation');
    expect(flipped.length).toBeGreaterThan(0);
    for (const o of flipped) expect(o.reasons[0]).toBe('the pack has no verified facts for this unit, so no exercise can be built');
    expect(outcomes.filter((o) => o.decision === 'test-now')).toHaveLength(0);
    const plan = planSession({ deck: [], intake: outcomes, preferences: PREFS, audio: audioOk, scheduler, now: iso(SIM0), knowledge: world.knowledge, readingSignals: [], learnerId: L, random: () => 0.1 });
    expect(plan.items).toEqual([]);
    expect(plan.skipped).toEqual([]); // OBSERVED: nothing in plan.skipped explains them (planner.ts:224-225 reads test-now outcomes only)
    expect(plan.availableWork).toEqual({ questions: 0, newQuestions: 0 });
    const thrown = await intakeFor(inventoryOnly, [], [], SIM0, PREFS, async () => { throw new Error('pack index offline'); });
    expect(thrown.find((o) => o.decision === 'needs-validation')!.reasons[0]).toBe('pack facts could not be read (pack index offline)');
    // Session layer (runner.ts build(): "the pack has no verified facts for this unit" / "the facts do not support a ... exercise"): when intake had no
    // facts provider (engine.ts: "without pack facts the decision rests on the Repository's candidate alone") or the exercise cannot be built at
    // presentation time, the runner pushes a `build-failed` skip, writes NOTHING, and moves on; the card stays due / stays an intake candidate and the
    // planner has no memory of build failures, so the next plan offers the same card in the same position (see P10).
  });

  it('P4 learning steps: New+Good -> learning, due +10 min, planned FIRST (tier 0) 20 min later; New+Easy graduates, due >= 1 day', () => {
    const t0 = SIM0;
    const unitGood = 'form:sq:p4good', unitEasy = 'form:sq:p4easy', other = 'form:sq:p4old';
    const events: GoEvent[] = [];
    seed(events, other, 'rec', [[100 * D, 3], [99 * D, 3]], t0 - 12 * HOUR); // a review card long overdue by t0 + 20 min
    events.push(cardAdded(unitGood, 'rec', t0), reviewEvent({ unit: unitGood, kind: 'rec', at: t0 + 10_000, rating: 3, previous: null }));
    events.push(cardAdded(unitEasy, 'rec', t0), reviewEvent({ unit: unitEasy, kind: 'rec', at: t0 + 10_000, rating: 4, previous: null }));
    const later = t0 + 20 * MIN;
    const deck = deckAt(events, later);
    const good = deck.find((i) => i.unitId === unitGood)!, easy = deck.find((i) => i.unitId === unitEasy)!;
    console.log('P4 Good:', good.schedule.phase, good.schedule.due, '| Easy:', easy.schedule.phase, easy.schedule.due, 'scheduledDays', easy.schedule.scheduledDays);
    expect(good.schedule.phase).toBe('learning');
    expect(Date.parse(good.schedule.due)).toBe(t0 + 10_000 + 10 * MIN); // short-term step 10m
    expect(easy.schedule.phase).toBe('review');
    expect(easy.schedule.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(Date.parse(easy.schedule.due) - (t0 + 10_000)).toBeGreaterThanOrEqual(DAY);
    const plan = planSession({ deck, intake: [], preferences: PREFS, audio: audioOk, scheduler, now: iso(later), readingSignals: events, learnerId: L, random: () => 0.1 });
    expect(plan.items[0]!.item.unitId).toBe(unitGood);
    expect(plan.items[0]!.queue).toBe('learning');
    expect(plan.items.some((p) => p.item.unitId === unitEasy)).toBe(false);
    expect(plan.skipped.find((x) => x.itemId === easy.itemId)!.why).toBe('not due; optional remediation is separate from scheduled review');
    expect(plan.items.some((p) => p.item.unitId === other && p.queue === 'due')).toBe(true);
    events.push(reviewEvent({ unit: unitGood, kind: 'rec', at: later, rating: 3, previous: good.history[0]!.eventId! }));
    const graduated = deckAt(events, later + MIN).find((i) => i.unitId === unitGood)!;
    expect(graduated.schedule.phase).toBe('review'); // Good on the second step graduates it
    expect(graduated.schedule.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it('P5 per-dimension variants: a familiar word with spaced recognition successes is offered other skills; each is its own card with its own schedule', () => {
    const unit = 'form:sq:p5';
    const events: GoEvent[] = [];
    seed(events, unit, 'rec', [[5 * D, 3], [3 * D, 3], [1 * D, 4]]);
    const k = know(unit, 'familiar', 6);
    const choose = (target: ReviewCandidate['targetDimension'], goals: ReviewPreferences['practiceGoals'], includeListening = true) =>
      choosePractice({ candidate: cand(unit, 0.8, { targetDimension: target }), knowledge: k, preferences: { ...PREFS, practiceGoals: goals, includeListening }, events, deck: deckAt(events, SIM0), now: iso(SIM0) });
    const all = ['recognition', 'retrieval', 'application', 'listening'] as const;
    const table = {
      readingRecognition: choose('readingRecognition', [...all]), productiveRetrieval: choose('productiveRetrieval', [...all]),
      listeningRecognition: choose('listeningRecognition', [...all]), contextualProduction: choose('contextualProduction', [...all]),
      grammaticalUnderstanding: choose('grammaticalUnderstanding', [...all]), retrievalButGoalOff: choose('productiveRetrieval', ['recognition']),
      listeningButAudioOff: choose('listeningRecognition', [...all], false),
    };
    console.log('P5 choosePractice:', JSON.stringify(Object.fromEntries(Object.entries(table).map(([a, b]) => [a, b ? `${b.family}/${b.dimension}` : null]))));
    expect(table.readingRecognition?.family).toBe('written-recognition');
    expect(table.productiveRetrieval?.family).toBe('meaning-to-form');
    expect(table.listeningRecognition?.family).toBe('audio-to-meaning');
    expect(table.contextualProduction?.family).toBe('sentence-completion');
    expect(table.grammaticalUnderstanding?.family).toBe('morphological-identification');
    expect(table.retrievalButGoalOff?.family).toBe('written-recognition'); // goal not selected: falls back to recognition
    expect(table.listeningButAudioOff?.family).toBe('written-recognition'); // listening off: falls back to recognition (a card that exists -> already-covered)
    const ids = new Set(Object.values(table).filter(Boolean).map((c) => itemIdFor(unit, c!.dimension)));
    expect(ids.size).toBe(5); // recognition, retrieval, listening, contextual production, morphological analysis: five card ids for ONE word
    const recOnly = [...events];
    seed(events, unit, 'ret', [[2 * D, 3]]); seed(events, unit, 'lis', [[3 * D, 3], [2 * D, 3], [1 * D, 1]]);
    const deck = deckAt(events, SIM0);
    const by = (kind: Kind) => deck.find((i) => i.itemId === cardOf(unit, kind))!;
    expect(new Set([by('rec').schedule.due, by('ret').schedule.due, by('lis').schedule.due]).size).toBe(3);
    expect(by('lis').schedule.phase).toBe('relearning'); // an Again on listening ...
    expect(by('rec').schedule.due).toBe(deckAt(recOnly, SIM0).find((i) => i.itemId === cardOf(unit, 'rec'))!.schedule.due); // ... leaves the recognition schedule alone
    // intake: a second card for the SAME unit in ANOTHER dimension is not "already covered" (intake.ts rule 3 compares the Repository dimension)
    const outcome = decideIntake({ candidate: cand(unit, 0.8, { targetDimension: 'productiveRetrieval' }), knowledge: k, existing: deckAt(recOnly, SIM0),
      audio: audioOk, saved: new Set(), preferences: PREFS, now: iso(SIM0), readingSignals: recOnly, facts: validatedFacts(unit) });
    console.log('P5 intake for the retrieval objective:', outcome.decision, outcome.proposed?.family, '|', outcome.reasons.slice(0, 2).join(' / '));
    expect(outcome.decision).toBe('test-now');
    expect(outcome.proposed?.family).toBe('meaning-to-form');
    // and when the facts are only verified (not production-validated) the same objective is refused with this exact reason:
    const refused = decideIntake({ candidate: cand(unit, 0.8, { targetDimension: 'productiveRetrieval' }), knowledge: k, existing: deckAt(recOnly, SIM0),
      audio: audioOk, saved: new Set(), preferences: PREFS, now: iso(SIM0), readingSignals: recOnly, facts: facts(unit) });
    expect(refused.decision).toBe('needs-validation');
    console.log('P5 refusal text:', refused.reasons[0]);
  });

  it('P6 explicit saved-deck practice of a not-due card rated Easy leaves the schedule unchanged (earlyPractice); a failure is still a lapse', () => {
    const unit = 'form:sq:p6';
    const events: GoEvent[] = [];
    seed(events, unit, 'rec', [[9 * D, 3], [6 * D, 3], [2 * D, 3]]);
    const t = SIM0;
    const before = deckAt(events, t).find((i) => i.unitId === unit)!;
    expect(Date.parse(before.schedule.due)).toBeGreaterThan(t + HOUR); // not due
    const easy = reviewEvent({ unit, kind: 'rec', at: t, rating: 4, previous: before.history.at(-1)!.eventId!, intent: SAVED(t), dueBefore: before.schedule.due });
    const afterEasy = deckAt([...events, easy], t + MIN).find((i) => i.unitId === unit)!;
    console.log('P6 due before/after an explicit Easy:', before.schedule.due, afterEasy.schedule.due, '| reps', before.schedule.reps, afterEasy.schedule.reps, '| stability', before.schedule.stability, afterEasy.schedule.stability);
    expect(afterEasy.schedule.due).toBe(before.schedule.due);
    expect(afterEasy.schedule.reps).toBe(before.schedule.reps);
    expect(afterEasy.schedule.stability).toBe(before.schedule.stability);
    expect(afterEasy.history).toHaveLength(before.history.length + 1);
    expect(afterEasy.history.at(-1)!.earlyPractice).toBe(true);
    const planEarly = planSession({ deck: [afterEasy], intake: [], preferences: PREFS, audio: audioOk, scheduler, now: iso(t + HOUR), readingSignals: [...events, easy], learnerId: L, random: () => 0.1 });
    expect(planEarly.items).toEqual([]); // not planned automatically before the original due time
    const atDue = Date.parse(before.schedule.due) + MIN;
    const planDue = planSession({ deck: deckAt([...events, easy], atDue), intake: [], preferences: PREFS, audio: audioOk, scheduler, now: iso(atDue), readingSignals: [...events, easy], learnerId: L, random: () => 0.1 });
    expect(planDue.items.map((p) => p.item.unitId)).toEqual([unit]); // and planned at it
    // a DUE card asked in a saved deck schedules once; the repeat ten minutes later is early practice again
    const dueAt = atDue + HOUR;
    const first = reviewEvent({ unit, kind: 'rec', at: dueAt, rating: 4, previous: easy.id, intent: SAVED(dueAt) });
    const again = reviewEvent({ unit, kind: 'rec', at: dueAt + 10 * MIN, rating: 4, previous: first.id, intent: SAVED(dueAt + 10 * MIN) });
    const one = deckAt([...events, easy, first], dueAt + MIN).find((i) => i.unitId === unit)!, two = deckAt([...events, easy, first, again], dueAt + 11 * MIN).find((i) => i.unitId === unit)!;
    expect(one.schedule.reps).toBe(before.schedule.reps + 1);
    expect(two.schedule.due).toBe(one.schedule.due);
    expect(two.history.at(-1)!.earlyPractice).toBe(true);
    const fail = reviewEvent({ unit, kind: 'rec', at: dueAt + 20 * MIN, rating: 1, previous: again.id, intent: SAVED(dueAt + 20 * MIN) });
    const lapsed = deckAt([...events, easy, first, again, fail], dueAt + 21 * MIN).find((i) => i.unitId === unit)!;
    expect(lapsed.schedule.phase).toBe('relearning');
    expect(lapsed.schedule.lapses).toBe(before.schedule.lapses + 1);
  });

  it('P7 remediation: three cards whose last rating is Again are needsStudy, are not planned before they are due, and stay unresolved with no study marker', () => {
    const units = ['form:sq:r1', 'form:sq:r2', 'form:sq:r3'];
    const events: GoEvent[] = [];
    for (const u of units) seed(events, u, 'rec', [[6 * D, 3], [3 * D, 3], [3, 1]]); // Again three minutes ago
    const at = (offset: number) => SIM0 + offset;
    const plan = (offset: number) => planSession({ deck: deckAt(events, at(offset)), intake: [], preferences: PREFS, audio: audioOk, scheduler, now: iso(at(offset)), readingSignals: events, learnerId: L, random: () => 0.1 });
    const backlogAt = (offset: number) => remediationBacklog(deckAt(events, at(offset)), events, iso(at(offset)));
    const early = plan(0), b0 = backlogAt(0);
    console.log('P7 at +0:', JSON.stringify({ items: early.items.length, why: [...new Set(early.skipped.map((x) => x.why))], backlog: b0.map((b) => ({ id: b.itemId.slice(-2), needsStudy: b.needsStudy, ready: b.ready, failures: b.failures, reasons: b.reasons })) }));
    expect(b0).toHaveLength(3);
    expect(b0.every((b) => b.needsStudy && !b.ready && !b.repairRequired)).toBe(true);
    expect(early.items).toEqual([]); // relearning is due 10 min after the Again; three minutes later it is not due
    expect([...new Set(early.skipped.map((x) => x.why))]).toEqual(['not due; optional remediation is separate from scheduled review']);
    expect(early.remediation?.length).toBe(3);
    const due = plan(20 * MIN);
    expect(due.items.map((p) => p.queue)).toEqual(['learning', 'learning', 'learning']); // OBSERVED: due learning returns, AND still unresolved remediation
    expect(due.remediation?.every((r) => r.needsStudy)).toBe(true);
    for (const offset of [DAY, 3 * DAY, 30 * DAY]) {
      const b = backlogAt(offset);
      expect(b).toHaveLength(3);
      expect(b.every((x) => x.needsStudy && !x.ready)).toBe(true);
      expect(plan(offset).items.every((p) => p.queue === 'learning')).toBe(true);
    }
    // OBSERVED: the backlog is the card's LAST rating. One later Good/Easy answer (no study marker) removes the item.
    const head = deckAt(events, at(DAY)).find((i) => i.unitId === units[0])!.history.at(-1)!.eventId!;
    events.push(reviewEvent({ unit: units[0]!, kind: 'rec', at: at(DAY), rating: 4, previous: head }));
    expect(backlogAt(DAY + MIN)).toHaveLength(2);
  });

  it('P8 workload throttle: due work is reserved out of the session time before any new admission (a short session admits 0 new with allowance left)', () => {
    const world = buildWorld();
    const now = SIM0 + 10 * MIN;
    const run = (minutes: number) => {
      const preferences = { ...PREFS, sessionMinutes: minutes };
      const outcomes: IntakeOutcome[] = world.candidates.filter((x) => INVENTORY.slice(0, 8).includes(x.unitId)).map((c) => ({ unitId: c.unitId, decision: 'test-now' as const, reasons: ['score'],
        proposed: { dimension: 'written-recognition' as const, family: 'written-recognition' as const }, candidate: c }));
      const plan = planSession({ deck: deckAt(world.events, now), intake: outcomes, preferences, audio: audioOk, scheduler, now: iso(now), knowledge: world.knowledge, readingSignals: world.events, learnerId: L, random: () => 0.1 });
      return { minutes, items: plan.items.length, newItems: plan.items.filter((p) => p.isNew).length, reason: plan.batch?.reasons.at(-1) };
    };
    const results = [1, 3, 5, 10, 20].map(run);
    console.log('P8', JSON.stringify(results));
    // OBSERVED: limit = floor(remainingSeconds / (averageNewSeconds x 1.35)) after reserving due + upcoming seconds (admission-policy.ts:136-141)
    expect(results[0]!.newItems).toBe(0);
    expect(results[0]!.reason).toMatch(/^New admissions are capped at 0 after reserving \d+ seconds/);
    for (let i = 1; i < results.length; i++) expect(results[i]!.newItems).toBeGreaterThanOrEqual(results[i - 1]!.newItems);
    expect(results.at(-1)!.newItems).toBeLessThanOrEqual(5);
  });

  it('P9 a stale causal predecessor makes an Easy a no-op: the same-device sibling is excluded and the card is planned again', () => {
    const unit = 'form:sq:p9';
    const events: GoEvent[] = [];
    seed(events, unit, 'rec', [[9 * D, 3], [4 * D, 3], [2 * D, 3]]);
    const t = SIM0;
    const head = deckAt(events, t).find((i) => i.unitId === unit)!.history.at(-1)!.eventId!;
    // two plans built from the same snapshot (a resumed saved session; two tabs): both chain to the same head
    const again = reviewEvent({ unit, kind: 'rec', at: t, rating: 1, previous: head });
    const easy = reviewEvent({ unit, kind: 'rec', at: t + 5 * MIN, rating: 4, previous: head });
    const item = deckAt([...events, again, easy], t + 6 * MIN).find((i) => i.unitId === unit)!;
    console.log('P9 history:', JSON.stringify(item.history.slice(-2).map((h) => ({ rating: h.rating, excluded: h.scheduleExcluded }))), '| phase', item.schedule.phase, '| due', item.schedule.due);
    expect(item.history.at(-1)!.scheduleExcluded).toBe(`stale same-device sibling; canonical event is ${again.id}`);
    expect(item.schedule.phase).toBe('relearning'); // the Easy did not graduate it
    expect(Date.parse(item.schedule.due)).toBe(t + 10 * MIN);
    const later = t + 11 * MIN;
    const plan = planSession({ deck: deckAt([...events, again, easy], later), intake: [], preferences: PREFS, audio: audioOk, scheduler, now: iso(later), readingSignals: [...events, again, easy], learnerId: L, random: () => 0.1 });
    expect(plan.items.map((p) => p.queue)).toEqual(['learning']);
  });

  it('P10 the planner has no memory of runner build failures: a due card the session skips (it writes nothing) heads every re-plan and takes a micro-deck slot', () => {
    const events: GoEvent[] = [];
    const stuck = 'form:sq:stuck';
    seed(events, stuck, 'rec', [[100 * D, 3], [99 * D, 3]]); // the oldest due
    for (let i = 0; i < 6; i++) seed(events, `form:sq:ok${i}`, 'rec', [[60 * D + i, 3], [59 * D + i, 3]]);
    const run = (now: number) => planSession({ deck: deckAt(events, now), intake: [], preferences: { ...PREFS, cardsPerDeck: 4 }, audio: audioOk, scheduler, now: iso(now), readingSignals: events, learnerId: L, random: () => 0.1 });
    const a = run(SIM0), b = run(SIM0 + 10 * MIN), c = run(SIM0 + HOUR);
    expect(a.items[0]!.item.unitId).toBe(stuck);
    expect(b.items[0]!.item.unitId).toBe(stuck);
    expect(c.items[0]!.item.unitId).toBe(stuck);
    expect(a.items.length).toBe(4); // a micro-deck of 4: if the runner cannot build `stuck` (runner.ts build() -> `build-failed` skip) three cards are shown
    expect(a.skipped.some((x) => x.why === 'eligible for the next micro-deck; no scheduling card was created')).toBe(true);
  });

  it('P11 an unrated answer never schedules: a card whose answers carry rating null stays NEW and is planned as new in every session (computer-voice listening at master 19b66367)', () => {
    const unit = 'form:sq:p11', events: GoEvent[] = [];
    const creationAt = SIM0;
    events.push(cardAdded(unit, 'lis', creationAt, AUTO, 'form', creationAt + 20_000));
    // what runner.ts (master) records for a computer-voice answer: rating null, evidence quality 'none' (the answer is practice, never evidence)
    const unrated = (n: number, at: number): GoEvent => ({ ...reviewEvent({ unit, kind: 'lis', at, rating: 3, previous: null, id: `gr:p11:${n}` }),
      payload: { cardKind: 'recognition', grade: 'good', family: 'audio-to-meaning', assessmentDimension: 'auditory-recognition', rating: null, outcome: 'correct', correct: true, responseMode: 'choice', hinted: false, retrievalAttempted: true, expectedPreviousReviewId: null },
      evidence: { quality: 'none' } });
    for (let n = 0; n < 3; n++) events.push(unrated(n, creationAt + 20_000 + n * 20 * MIN));
    events.forEach((e) => expect(validateEvent(e), e.id).toEqual([]));
    const rowsOf = knowledgeRows(unit);
    const seen: Array<{ at: string; items: number; isNew: boolean; queue: string | undefined; budget: { used: number; remaining: number }; historyLen: number }> = [];
    for (const offset of [HOUR, 2 * HOUR, DAY, DAY + HOUR, 3 * DAY]) {
      const now = SIM0 + offset, deck = deckAt(events, now);
      const plan = planSession({ deck, intake: [], preferences: PREFS, audio: audioOk, scheduler, now: iso(now), knowledge: rowsOf, readingSignals: events, learnerId: L, random: () => 0.1 });
      seen.push({ at: iso(now).slice(5, 16), items: plan.items.length, isNew: !!plan.items[0]?.isNew, queue: plan.items[0]?.queue, budget: admissionBudget(events, { learnerId: L, languageId: LANG, now: iso(now), maxNew: 5, dailyNewLimit: 5 }), historyLen: deck[0]!.history.length });
    }
    console.log('P11', JSON.stringify(seen));
    // OBSERVED: three answered questions, zero scheduling history; the card is "new in the deck" and is asked again at every plan, on every day
    for (const s of seen) { expect(s.historyLen).toBe(0); expect(s.items).toBe(1); expect(s.isNew).toBe(true); expect(s.queue).toBe('new'); }
    // The same answers recorded with the computer-voice flag that later revisions add (payload.listeningPractice) schedule or not depending on the revision under test:
    const flagged = events.map((e) => (e.kind === 'CardReviewed' ? { ...e, payload: { ...e.payload, rating: 4, listeningPractice: true } } : e));
    const folded = deckAt(flagged, SIM0 + DAY)[0]!;
    console.log('P11 same answers with rating 4 + listeningPractice:true, quality none -> reps scheduled at this revision (0 = master 19b66367, 1 = a revision that honours the flag):', folded.schedule.reps);
    expect([0, 1]).toContain(folded.schedule.reps);
  });

  it('P11b nine such cards fill the new-card slots every day: the same five are planned in every session, the other four never advance (cycling through nine words)', () => {
    const units = Array.from({ length: 9 }, (_, i) => 'form:sq:stuck' + (i + 1));
    const events: GoEvent[] = [];
    const answers = (unit: string, n: number, at: number): GoEvent => ({ ...reviewEvent({ unit, kind: 'lis', at, rating: 3, previous: null, id: 'gr:' + unit + ':' + n }),
      payload: { cardKind: 'recognition', grade: 'good', family: 'audio-to-meaning', assessmentDimension: 'auditory-recognition', rating: null, outcome: 'correct', correct: true, responseMode: 'choice', hinted: false, retrievalAttempted: true, expectedPreviousReviewId: null },
      evidence: { quality: 'none' } });
    units.forEach((unit, i) => { events.push(cardAdded(unit, 'lis', SIM0 + i * MIN, AUTO, 'form', SIM0 + i * MIN + 20_000)); events.push(answers(unit, 0, SIM0 + i * MIN + 20_000)); });
    const rows = units.map((u) => know(u, 'familiar', 6));
    const plans = [HOUR, 2 * HOUR, DAY, 2 * DAY, 5 * DAY].map((offset) => {
      const now = SIM0 + offset;
      const plan = planSession({ deck: deckAt(events, now), intake: [], preferences: PREFS, audio: audioOk, scheduler, now: iso(now), knowledge: rows, readingSignals: events, learnerId: L, random: () => 0.1 });
      return { at: iso(now).slice(5, 16), items: plan.items.map((p) => p.item.unitId.slice(-1)).join(''), skipped: [...new Set(plan.skipped.map((x) => x.why))] };
    });
    console.log('P11b', JSON.stringify(plans));
    // OBSERVED: five of the nine (the limit min(maxNew, daily remaining) = 5) are planned as NEW in every session, always the same five (ties break on item id); the other four
    // are skipped "session or daily new-item budget exhausted" in every session, so the loop never leaves the first five.
    // (the day the nine were created their nine CardAdded events spent the whole allowance, so the same-day sessions are empty)
    expect(plans.slice(0, 2).map((p) => [p.items, p.skipped])).toEqual([['', ['new-card budget exhausted']], ['', ['new-card budget exhausted']]]);
    const later = plans.slice(2);
    expect(new Set(later.map((p) => p.items)).size).toBe(1);
    expect(later[0]!.items).toHaveLength(5);
    for (const p of later) expect(p.skipped).toEqual(['session or daily new-item budget exhausted']);
  });
});

function knowledgeRows(unit: string): UnitKnowledge[] { return [know(unit, 'familiar', 6)]; }
