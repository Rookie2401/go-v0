// @vitest-environment node
/**
 * AUDIT §18 (part 2) — the deck is a fold over the event log: concurrent devices, offline attempts, duplicates, scheduler
 * upgrade, backlog under a time budget, candidate de-duplication, audio-based reviews, and the split between scheduling
 * (rating) and evidence (correct). Real pieces: FSRS scheduler, foldDeck, the REAL store (de-duplication happens there),
 * the real projection engine, planSession, decideIntake.
 */
import { describe, expect, it } from 'vitest';
import { default_w } from 'ts-fsrs';
import { createFsrsScheduler, buildCardAdded, buildCardRemoved, foldDeck, itemIdFor } from '../../packages/goreview/src/scheduler';
import { planSession } from '../../packages/goreview/src/planner';
import { decideIntake, proposeFor } from '../../packages/goreview/src/intake';
import type { DeckItem, IntakeOutcome, Rating, ReviewPreferences } from '../../packages/goreview/src/types';
import type { EventKind, GoEvent, ReviewCandidate } from '../../packages/repository-contract/src';
import { validateEvent } from '../../packages/repository-contract/src';
import { append, changed, DAY, ENROL, flushRowsAfterAll, LEARNER, makeWorld, MIN, note, rowsOf, shuffled } from './model.support';

flushRowsAfterAll('scheduler.deck');

const T0 = '2026-03-01T09:00:00.000Z';
const t = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();
const SCHED = createFsrsScheduler();
const UNIT = 'lemma:sq:shkollë:NOUN';
const ITEM = itemIdFor(UNIT, 'written-recognition');
const GRADE: Record<Rating, 'again' | 'hard' | 'good' | 'easy'> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

const cardAdded = (unitId = UNIT, at = T0, deviceId = 'dev-A', dimension: 'written-recognition' | 'auditory-recognition' = 'written-recognition') =>
  buildCardAdded({ learnerId: LEARNER, enrolmentId: ENROL, languageId: 'sq', at, deviceId, unitId, unitKind: 'lexeme', dimension, family: dimension === 'written-recognition' ? 'written-recognition' : 'audio-to-meaning', addedBy: 'intake' });

interface RevOpts { kind?: Extract<EventKind, 'CardReviewed' | 'ListeningAssessed' | 'AssessmentAnswered'>; device?: string; id?: string; dedupeKey?: string; unit?: string; item?: string; evidence?: GoEvent['evidence']; extra?: Record<string, unknown>; voice?: 'recorded' | 'synthetic' }
let n = 0;
/** A review event shaped like GoReview's evidence builder writes it: rating for the deck, `correct` for the engine. */
function review(at: string, rating: Rating | null, o: RevOpts = {}): GoEvent {
  n += 1;
  const kind = o.kind ?? 'CardReviewed';
  const unit = o.unit ?? UNIT;
  const item = o.item ?? ITEM;
  const correct = rating !== null && rating >= 3;
  const base: Record<string, unknown> = kind === 'CardReviewed'
    ? { cardKind: 'recognition', grade: rating === null ? 'again' : GRADE[rating], correct, hinted: false, answerShownBefore: false }
    : kind === 'ListeningAssessed'
      ? { stimulus: 'word', voice: o.voice ?? 'recorded', answerShownBefore: false, correct, responseMode: 'choice', hinted: false }
      : { constructionId: 'morph:sq:NOUN:X', task: 'interpret', correct, hinted: false };
  const dedupeKey = o.dedupeKey ?? `review:${item}:ex-${n}:${at}`;
  return {
    id: o.id ?? `rv-${String(n).padStart(5, '0')}-${o.device ?? 'A'}`, v: 2, learnerId: LEARNER, enrolmentId: ENROL, languageId: 'sq', at,
    producer: { app: 'gopractice-review', version: 'audit', deviceId: o.device ?? 'dev-A' }, kind, subject: { cardId: item, itemIds: [unit] },
    payload: { ...base, ...(rating === null ? {} : { rating }), outcome: correct ? 'correct' : 'incorrect', exerciseId: `ex-${n}`, ...o.extra }, dedupeKey,
    ...(o.evidence ? { evidence: o.evidence } : {}),
  };
}

const foldOf = (events: readonly GoEvent[], s = SCHED, now = t(400 * DAY)) => foldDeck(events, s, { now });
const itemOf = (events: readonly GoEvent[], s = SCHED, id = ITEM) => foldOf(events, s).items.find((i) => i.itemId === id)!;
const stable = (i: DeckItem): string => JSON.stringify(i);

// ═════════════════════════════ concurrent devices, offline, duplicates ═════════════════════════════

describe('§18 concurrent devices and offline attempts', () => {
  const plan = (device: (i: number) => string): GoEvent[] => {
    // five reviews of one item at growing gaps; the device that made each is given by `device`
    const gaps = [1, 3, 9, 20, 41];
    const ratings: Rating[] = [3, 3, 1, 3, 3];
    return gaps.map((g, i) => review(t(g * DAY), ratings[i]!, { device: device(i), id: `rv-fixed-${i}`, dedupeKey: `review:${ITEM}:fixed-${i}` }));
  };

  it('two devices reviewing the same item offline give the schedule one device would have computed, and both appear in the history', () => {
    const added = cardAdded();
    const oneDevice = itemOf([added, ...plan(() => 'dev-A')]);
    const twoDevices = itemOf([added, ...plan((i) => (i % 2 ? 'dev-B' : 'dev-A'))]);
    expect(JSON.stringify(twoDevices.schedule)).toBe(JSON.stringify(oneDevice.schedule));
    expect(twoDevices.history.map((h) => [h.at, h.rating])).toEqual(oneDevice.history.map((h) => [h.at, h.rating]));
    expect(new Set(twoDevices.history.map((h) => h.deviceId))).toEqual(new Set(['dev-A', 'dev-B']));
    expect(twoDevices.history.map((h) => h.at)).toEqual([...twoDevices.history.map((h) => h.at)].sort());
    note('S11', '§18', 'two devices review one item offline (5 reviews, alternating, one Again)', 'schedule byte-identical to the single-device fold; history in time order with both device ids', `final due ${twoDevices.schedule.due}, lapses ${twoDevices.schedule.lapses}, history devices ${twoDevices.history.map((h) => h.deviceId.slice(-1)).join('')}`);
  });

  it('twenty random arrival orders of the log all fold to the same deck', () => {
    const events = [cardAdded(), ...plan((i) => (i % 2 ? 'dev-B' : 'dev-A'))];
    const ref = stable(itemOf(events));
    for (let seed = 1; seed <= 20; seed++) expect(stable(itemOf(shuffled(events, seed)))).toBe(ref);
    note('S12', '§18', '20 shuffled arrival orders of a 6-event log', 'identical deck every time', '20/20 identical');
  });

  it('offline attempts that reach the store late (recordedAt and seq out of order) fold exactly as if they had arrived in order', async () => {
    const w = await makeWorld('memory');
    const events = [cardAdded(), ...plan(() => 'dev-A')];
    const inOrder = stable(itemOf(events));
    // the phone was offline for the 3rd and 4th reviews: the server sees 1, 2, 5, then 3 and 4
    const arrival = [events[0]!, events[1]!, events[2]!, events[5]!, events[3]!, events[4]!];
    for (const e of arrival) await w.store.append(LEARNER, [e]);
    const log = await w.store.list({ learnerId: LEARNER });
    expect(log.map((e) => e.id)).toEqual(arrival.map((e) => e.id)); // the log really is out of event time
    expect(stable(itemOf(log))).toBe(inOrder);
    note('S13', '§18', 'offline reviews arrive after a later review (log out of event-time order)', 'deck equals the in-order fold', 'identical');
  });

  it('a review dated before the item was added (a device clock behind) is not applied to the deck, is reported in `ignored`, and still counts as evidence for the engine', async () => {
    const skewed = review(t(5 * MIN), 3, { device: 'dev-B' });
    const w = await makeWorld('memory');
    await append(w, cardAdded(UNIT, t(10 * MIN), 'dev-A'), skewed);
    expect((await rowsOf(w)).get(UNIT)!.dimensions.readingRecognition.observations).toBe(1);
    const fold = foldOf([cardAdded(UNIT, t(10 * MIN), 'dev-A'), skewed]);
    expect(fold.items[0]!.history).toEqual([]);
    expect(fold.ignored).toHaveLength(1);
    expect(fold.ignored[0]!.reason).toMatch(/not been added/);
    note('S14', '§18', 'review from a device whose clock is 5 minutes behind the CardAdded', 'reported in ignored (not silent); the learner\'s evidence still reaches the engine', `ignored: ${fold.ignored[0]!.reason}`);
  });
});

describe('§18 duplicate submissions', () => {
  it('the same event id twice, and the same dedupeKey under a new id from another device: the store keeps one, the deck is unchanged', async () => {
    const w = await makeWorld('memory');
    const e1 = review(t(DAY), 3, { dedupeKey: 'review:K1' });
    await w.store.append(LEARNER, [cardAdded(), e1]);
    const before = stable(itemOf(await w.store.list({ learnerId: LEARNER })));
    const head = await w.store.head(LEARNER);
    const sameId = await w.store.append(LEARNER, [e1]);
    const sameKey = await w.store.append(LEARNER, [{ ...e1, id: 'rv-other-device', producer: { ...e1.producer, deviceId: 'dev-B' } }]);
    expect([sameId[0]!.stored, sameKey[0]!.stored]).toEqual([false, false]);
    expect(sameKey[0]!.duplicateOf).toBe(e1.id);
    expect(await w.store.head(LEARNER)).toBe(head);
    expect(stable(itemOf(await w.store.list({ learnerId: LEARNER })))).toBe(before);
    // the engine sees no second observation either
    await w.engine.project(LEARNER);
    note('S15', '§18', 'duplicate id / duplicate dedupeKey (store)', 'neither stored; deck byte-identical', `stored ${sameId[0]!.stored}/${sameKey[0]!.stored}; duplicateOf ${sameKey[0]!.duplicateOf}; head ${head} unchanged`);
  });

  it('the fold collapses a repeated id by itself; a repeated dedupeKey under another id reaching the fold directly is applied twice (the store is the only guard)', () => {
    const e1 = review(t(DAY), 3, { id: 'rv-dup', dedupeKey: 'review:K2' });
    const once = itemOf([cardAdded(), e1]);
    expect(stable(itemOf([cardAdded(), e1, { ...e1 }]))).toBe(stable(once));
    const twice = itemOf([cardAdded(), e1, { ...e1, id: 'rv-dup-b' }]);
    expect(twice.history.length).toBe(2);
    expect(twice.schedule.reps).toBe(once.schedule.reps + 1);
    note('S16', '§18', 'dedupeKey-duplicate fed directly to foldDeck (bypassing the store)', 'observation: not collapsed; the guard is the store, which every real path passes through', `history ${once.history.length} → ${twice.history.length} entries`);
  });

  it('re-adding an item (CardAdded twice, or after a dismiss) keeps one item with its history', () => {
    const r = review(t(DAY), 3);
    const fold = foldOf([cardAdded(), cardAdded(UNIT, t(2 * DAY)), r]);
    expect(fold.items).toHaveLength(1);
    expect(fold.items[0]!.history).toHaveLength(1);
    const dismissed = foldOf([cardAdded(), r, buildCardRemoved({ learnerId: LEARNER, enrolmentId: ENROL, languageId: 'sq', at: t(3 * DAY), deviceId: 'dev-A', itemId: ITEM, reason: 'dismissed' }), cardAdded(UNIT, t(4 * DAY))]);
    expect(dismissed.items[0]).toMatchObject({ status: 'active' });
    expect(dismissed.items[0]!.history).toHaveLength(1);
  });
});

// ═════════════════════════════ scheduler upgrade ═════════════════════════════

describe('§18 scheduler-version upgrade', () => {
  const events = (): GoEvent[] => [
    cardAdded(),
    review(t(0 + MIN), 3, { id: 'u1' }), review(t(11 * MIN), 3, { id: 'u2' }), review(t(3 * DAY), 3, { id: 'u3' }),
    review(t(15 * DAY), 1, { id: 'u4' }), review(t(15 * DAY + 11 * MIN), 3, { id: 'u5' }), review(t(40 * DAY), 4, { id: 'u6' }),
  ];
  const v1 = createFsrsScheduler();
  const v2 = createFsrsScheduler({ desiredRetention: 0.8 });
  const tuned = [...default_w];
  tuned[2] = tuned[2]! * 1.1;
  const v3 = createFsrsScheduler({ parameters: tuned });

  it('a different parametersVersion recomputes every schedule from the history; the history itself is intact and the log is untouched', () => {
    const log = events();
    const frozenLog = JSON.stringify(log);
    const a = itemOf(log, v1);
    const b = itemOf(log, v2);
    const c = itemOf(log, v3);
    expect(new Set([v1.parametersVersion, v2.parametersVersion, v3.parametersVersion]).size).toBe(3);
    expect([a.schedule.parametersVersion, b.schedule.parametersVersion, c.schedule.parametersVersion]).toEqual([v1.parametersVersion, v2.parametersVersion, v3.parametersVersion]);
    // new schedule differs…
    expect(b.schedule.due).not.toBe(a.schedule.due);
    expect(c.schedule.stability).not.toBe(a.schedule.stability);
    // …the history (what the learner did) does not
    const core = (i: DeckItem) => i.history.map((h) => [h.at, h.rating, h.outcome, h.deviceId, h.exerciseId, h.family]);
    expect(core(b)).toEqual(core(a));
    expect(core(c)).toEqual(core(a));
    expect(a.history).toHaveLength(6);
    // reversible and non-destructive: folding with v1 again gives the first answer; the events were not touched
    expect(stable(itemOf(log, v1))).toBe(stable(a));
    expect(JSON.stringify(log)).toBe(frozenLog);
    note('S17', '§18', 'upgrade: v1 (0.9) → v2 (0.8) → v3 (tuned weights) re-fold of 6 reviews incl. one lapse', 'schedule re-stamped and recomputed; history entries identical; v1 re-fold reproduces the first result; log untouched', `due v1 ${a.schedule.due.slice(0, 10)} / v2 ${b.schedule.due.slice(0, 10)} / v3 ${c.schedule.due.slice(0, 10)}; stamps ${a.schedule.parametersVersion}, ${b.schedule.parametersVersion}, ${c.schedule.parametersVersion}; history rows identical`);
  });

  it('history elapsedDays is a property of the dates, so it too is identical under another scheduler', () => {
    const a = itemOf(events(), v1);
    const b = itemOf(events(), v2);
    expect(b.history.map((h) => h.elapsedDays)).toEqual(a.history.map((h) => h.elapsedDays));
  });

  it('a deck item stamped by the old scheduler is never mixed: every item of the fold carries the new stamp', () => {
    const log = [...events(), cardAdded('lemma:sq:tjetër:NOUN', t(2 * DAY)), review(t(5 * DAY), 3, { unit: 'lemma:sq:tjetër:NOUN', item: itemIdFor('lemma:sq:tjetër:NOUN', 'written-recognition') })];
    const fold = foldOf(log, v2);
    expect(fold.items.map((i) => i.schedule.parametersVersion)).toEqual([v2.parametersVersion, v2.parametersVersion]);
  });
});

// ═════════════════════════════ backlog and the planner budget ═════════════════════════════

describe('§18 backlog: 50 due items against a ten-minute budget', () => {
  const PREFS: ReviewPreferences = { languageId: 'sq', sessionMinutes: 10, maxNew: 3, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true };
  const AUDIO = { available: false, eligibleForEvidence: false, reason: 'off' };

  /** 50 items, each reviewed Good twice early (so it is in Review state), at different ages so the recall probabilities differ. */
  function backlog(): GoEvent[] {
    const out: GoEvent[] = [];
    for (let i = 0; i < 50; i++) {
      const unit = `lemma:sq:w${String(i).padStart(2, '0')}:NOUN`;
      const item = itemIdFor(unit, 'written-recognition');
      const start = i * 2 * DAY; // staggered starts
      out.push(cardAdded(unit, t(start)));
      out.push(review(t(start + MIN), 3, { unit, item }), review(t(start + 11 * MIN), 3, { unit, item }));
    }
    return out;
  }
  const NOW = t(200 * DAY);
  const intakeNone: IntakeOutcome[] = [];
  const mkPlan = (deck: DeckItem[], over: Partial<ReviewPreferences> = {}, intake = intakeNone) =>
    planSession({ deck, intake, preferences: { ...PREFS, ...over }, audio: AUDIO, scheduler: SCHED, now: NOW, random: () => 0.5 });

  it('plans the most forgotten items first, fits the budget, lists every other due item as skipped (still due, nothing written)', () => {
    const deck = foldDeck(backlog(), SCHED, { now: NOW }).items;
    expect(deck).toHaveLength(50);
    expect(deck.every((i) => SCHED.isDue(i.schedule, NOW))).toBe(true);
    const frozen = JSON.stringify(deck);
    const plan = mkPlan(deck);
    const seconds = plan.items.reduce((s, p) => s + p.estimatedSeconds, 0);
    expect(seconds).toBeLessThanOrEqual(PREFS.sessionMinutes * 60);
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items.length).toBeLessThan(50);
    expect(plan.dueCount).toBe(plan.items.length);
    expect(plan.dueCount + plan.skipped.filter((s) => s.why.startsWith('over budget')).length).toBe(50);
    expect(new Set(plan.items.map((p) => p.item.itemId)).size).toBe(plan.items.length);
    // packed: not even the cheapest remaining item fits
    expect(seconds + Math.min(...plan.skipped.map(() => 25))).toBeGreaterThan(PREFS.sessionMinutes * 60);
    // ordered by forgetting: every planned item is at most as well remembered as every skipped one
    const recall = (id: string) => SCHED.retrievability(deck.find((d) => d.itemId === id)!.schedule, NOW);
    const planned = plan.items.map((p) => recall(p.item.itemId));
    const skipped = plan.skipped.map((s) => recall(s.itemId));
    expect(Math.max(...planned)).toBeLessThanOrEqual(Math.min(...skipped) + 1e-9);
    // reading is pure: the deck is byte-identical and the skipped items are still due
    expect(JSON.stringify(deck)).toBe(frozen);
    expect(plan.skipped.every((s) => SCHED.isDue(deck.find((d) => d.itemId === s.itemId)!.schedule, NOW))).toBe(true);
    note('S18', '§18', 'backlog: 50 due items, 10-minute budget, written recognition', 'Σ estimated seconds ≤ 600; lowest-recall items first; 50 − planned listed as skipped "over budget"; deck unchanged', `${plan.items.length} planned (${seconds} s of 600), ${plan.skipped.length} skipped, dueCount ${plan.dueCount}; planned recall ${Math.min(...planned).toFixed(2)}–${Math.max(...planned).toFixed(2)} ≤ skipped ${Math.min(...skipped).toFixed(2)}–${Math.max(...skipped).toFixed(2)}`);
  });

  it('a zero-minute budget plans nothing and loses nothing; a bigger budget plans more; due items always outrank new ones', () => {
    const deck = foldDeck(backlog(), SCHED, { now: NOW }).items;
    const none = mkPlan(deck, { sessionMinutes: 0 });
    expect(none.items).toHaveLength(0);
    expect(none.skipped).toHaveLength(50);
    expect(mkPlan(deck, { sessionMinutes: 20 }).items.length).toBeGreaterThan(mkPlan(deck, { sessionMinutes: 10 }).items.length);
    const fresh: IntakeOutcome = { unitId: 'lemma:sq:brandnew:NOUN', decision: 'test-now', reasons: ['score high'], proposed: { dimension: 'written-recognition', family: 'written-recognition' }, candidate: { unitId: 'lemma:sq:brandnew:NOUN', kind: 'lexeme', score: 0.9, reasons: [], targetDimension: 'readingRecognition', eligibility: { eligible: true, status: 'verified', caveats: [] }, cost: 0.2 } };
    const withNew = mkPlan(deck, {}, [fresh]);
    expect(withNew.newCount).toBe(0); // the backlog used the whole budget: a new item is not added on top of 50 overdue ones
    expect(withNew.skipped.some((s) => s.itemId === itemIdFor('lemma:sq:brandnew:NOUN', 'written-recognition'))).toBe(true);
  });

  it('answering the planned items clears them from the due list and the next plan moves on to the rest (the backlog drains)', () => {
    let log = backlog();
    let deck = foldDeck(log, SCHED, { now: NOW }).items;
    const first = mkPlan(deck);
    let clock = Date.parse(NOW);
    for (const p of first.items) {
      clock += 20_000;
      log = [...log, review(new Date(clock).toISOString(), 3, { unit: p.item.unitId, item: p.item.itemId })];
    }
    deck = foldDeck(log, SCHED, { now: new Date(clock).toISOString() }).items;
    const dueNow = deck.filter((i) => SCHED.isDue(i.schedule, new Date(clock).toISOString()));
    expect(dueNow.length).toBe(50 - first.items.length);
    const second = planSession({ deck, intake: [], preferences: PREFS, audio: AUDIO, scheduler: SCHED, now: new Date(clock).toISOString(), random: () => 0.5 });
    const firstIds = new Set(first.items.map((p) => p.item.itemId));
    expect(second.items.every((p) => !firstIds.has(p.item.itemId))).toBe(true);
    note('S19', '§18', 'backlog drains over two sessions', 'answered items leave the due list; the next plan contains only the rest', `session 1: ${first.items.length} answered; ${dueNow.length} still due; session 2 plans ${second.items.length}, none repeated`);
  });
});

// ═════════════════════════════ candidate de-duplication ═════════════════════════════

describe('§18 candidate de-duplication', () => {
  const cand = (unitId: string): ReviewCandidate => ({ unitId, kind: 'lexeme', score: 0.8, reasons: [{ rule: 'demonstratedError', weight: 0.25 }], targetDimension: 'readingRecognition', eligibility: { eligible: true, status: 'verified', caveats: [] }, cost: 0.2 });
  const PREFS: ReviewPreferences = { languageId: 'sq', sessionMinutes: 10, maxNew: 5, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true };
  const outcome = (unitId: string): IntakeOutcome => ({ unitId, decision: 'test-now', reasons: ['score high'], proposed: proposeFor(cand(unitId)), candidate: cand(unitId) });

  it('intake: once the item is in the deck, the same unit is already-covered; a dismissed one is not re-proposed', () => {
    const c = cand(UNIT);
    const first = decideIntake({ candidate: c, existing: [], audio: { available: false, eligibleForEvidence: false, reason: '' }, saved: new Set(), preferences: PREFS, now: T0 });
    expect(first.decision).toBe('test-now');
    const deck = foldDeck([cardAdded()], SCHED, { now: T0 }).items;
    expect(decideIntake({ candidate: c, existing: deck, audio: { available: false, eligibleForEvidence: false, reason: '' }, saved: new Set(), preferences: PREFS, now: T0 }).decision).toBe('already-covered');
    note('S20', '§18', 'same unit offered to intake twice', 'first test-now; once in the deck already-covered', 'test-now → already-covered');
  });

  it('planner: a unit already in the deck is not added again from intake', () => {
    const deck = foldDeck([cardAdded()], SCHED, { now: T0 }).items;
    const plan = planSession({ deck, intake: [outcome(UNIT)], preferences: PREFS, audio: { available: false, eligibleForEvidence: false, reason: '' }, scheduler: SCHED, now: T0, random: () => 0.5 });
    expect(plan.items.filter((p) => p.item.itemId === ITEM)).toHaveLength(1);
  });

  it('DEFECT D6 (fixed): the same unit twice among the intake outcomes yields ONE planned item (not asked twice, not reviewed twice)', () => {
    const plan = planSession({ deck: [], intake: [outcome(UNIT), outcome(UNIT)], preferences: PREFS, audio: { available: false, eligibleForEvidence: false, reason: '' }, scheduler: SCHED, now: T0, random: () => 0.5 });
    const ids = plan.items.map((p) => p.item.itemId);
    note('D6', '§18', 'intake outcomes [unit, unit] → planSession', 'one planned item', `${ids.length} planned items: ${[...new Set(ids)].join(' ; ')} ×${ids.length}; newCount ${plan.newCount}`);
    expect(ids).toEqual([ITEM]);
  });

  it('the fold itself keeps one deck item per (unit, dimension) however many CardAdded arrive, and two dimensions are two items by design', () => {
    const fold = foldOf([cardAdded(), cardAdded(), cardAdded(UNIT, t(MIN)), cardAdded(UNIT, t(2 * MIN), 'dev-A', 'auditory-recognition')]);
    expect(fold.items.map((i) => i.itemId).sort()).toEqual([itemIdFor(UNIT, 'auditory-recognition'), ITEM].sort());
  });
});

// ═════════════════════════════ audio-based review, and scheduling vs evidence ═════════════════════════════

describe('§18 audio-based reviews fold like any review; scheduling and evidence are separate', () => {
  const ratings: Rating[] = [3, 3, 3, 1, 3, 4];
  const stream = (kind: 'CardReviewed' | 'ListeningAssessed' | 'AssessmentAnswered', item = ITEM): GoEvent[] =>
    ratings.map((r, i) => review(t((i === 0 ? 1 : [0, 2, 12, 30, 31, 80][i]!) * DAY + (i === 0 ? MIN : 0)), r, { kind, id: `a-${kind}-${i}`, item, dedupeKey: `k-${kind}-${i}` }));

  it('ListeningAssessed, CardReviewed and AssessmentAnswered with the same ratings at the same instants give the same schedule', () => {
    const base = cardAdded();
    const sched = (kind: 'CardReviewed' | 'ListeningAssessed' | 'AssessmentAnswered') => JSON.stringify(itemOf([base, ...stream(kind)]).schedule);
    expect(sched('ListeningAssessed')).toBe(sched('CardReviewed'));
    expect(sched('AssessmentAnswered')).toBe(sched('CardReviewed'));
    const listening = itemOf([cardAdded(UNIT, T0, 'dev-A', 'auditory-recognition'), ...stream('ListeningAssessed', itemIdFor(UNIT, 'auditory-recognition'))], SCHED, itemIdFor(UNIT, 'auditory-recognition'));
    expect(listening.dimension).toBe('auditory-recognition');
    expect(listening.history).toHaveLength(6);
    expect(listening.schedule.lapses).toBe(1);
    note('S21', '§18', 'ListeningAssessed with rating vs CardReviewed vs AssessmentAnswered', 'identical schedule from identical ratings; item keeps dimension auditory-recognition', `due ${listening.schedule.due.slice(0, 10)}, lapses ${listening.schedule.lapses}, ${listening.history.length} history rows`);
  });

  it('a listening review with no rating (failed audio, challenged) changes neither schedule nor history; it is counted as unscored', () => {
    const e = [cardAdded(), ...stream('ListeningAssessed').slice(0, 3), review(t(40 * DAY), null, { kind: 'ListeningAssessed' })];
    const fold = foldOf(e);
    expect(fold.items[0]!.history).toHaveLength(3);
    expect(fold.unscored[ITEM]).toBe(1);
    expect(JSON.stringify(fold.items[0]!.schedule)).toBe(JSON.stringify(itemOf(e.slice(0, 4)).schedule));
  });

  it('the same review event feeds two readers: the deck takes the RATING, the engine takes `correct` and the evidence note (synthetic audio schedules but is not evidence)', async () => {
    const w = await makeWorld('memory');
    const unit = 'form:sq:shkollë';
    const item = itemIdFor(unit, 'auditory-recognition');
    const added = cardAdded(unit, T0, 'dev-A', 'auditory-recognition');
    const synthetic = review(t(DAY), 3, { kind: 'ListeningAssessed', unit, item, voice: 'synthetic', evidence: { quality: 'none', assisted: false }, id: 'syn-1' });
    const recorded = review(t(2 * DAY), 3, { kind: 'ListeningAssessed', unit, item, voice: 'recorded', evidence: { quality: 'moderate', assisted: false }, id: 'rec-1' });
    expect(validateEvent(synthetic)).toEqual([]);
    expect(validateEvent(recorded)).toEqual([]);
    await append(w, added);
    const before = await rowsOf(w);
    await append(w, synthetic);
    expect(changed(before, await rowsOf(w))).toEqual([]); // practice: no knowledge moves
    await append(w, recorded);
    expect(changed(before, await rowsOf(w))).toEqual([`${unit}|listeningRecognition`]); // the reviewed recording moves listening only
    const deck = foldDeck(await w.store.list({ learnerId: LEARNER }), SCHED, { now: t(300 * DAY) }).items.find((i) => i.itemId === item)!;
    expect(deck.history.map((h) => h.rating)).toEqual([3, 3]); // both scheduled
    expect(deck.schedule.reps).toBe(2);
    note('S22', '§18', 'synthetic then recorded ListeningAssessed (both rating 3)', 'deck: 2 reviews scheduled; engine: only the recorded one moves listeningRecognition', `deck reps ${deck.schedule.reps}; engine moved ${JSON.stringify(changed(before, await rowsOf(w)))}`);
  });

  it('a challenged result (rating null, evidence none) moves neither reader', async () => {
    const w = await makeWorld('memory');
    const unit = 'form:sq:shkollë';
    const item = itemIdFor(unit, 'written-recognition');
    await append(w, cardAdded(unit), review(t(DAY), 3, { unit, item, id: 'ok-1' }));
    const before = await rowsOf(w);
    const challenged = review(t(2 * DAY), null, { unit, item, id: 'ch-1', evidence: { quality: 'none', assisted: false } });
    await append(w, challenged);
    expect(changed(before, await rowsOf(w))).toEqual([]);
    const fold = foldDeck(await w.store.list({ learnerId: LEARNER }), SCHED, { now: t(300 * DAY) });
    expect(fold.items[0]!.history).toHaveLength(1);
    expect(fold.unscored[item]).toBe(1);
  });
});
