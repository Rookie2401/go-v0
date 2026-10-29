/**
 * The learner scenarios the release brief names that scenarios.test.ts (A–H) does not: a returning learner with a large overdue backlog,
 * a history of thousands of cards and tens of thousands of reviews (reconstruction stays deterministic and bounded), and a multilingual
 * learner whose languages and scripts never share a card. Deterministic fake clocks; no network; the real FSRS scheduler and planner.
 * The timing bounds are coarse (a slow laptop under a full test run passes them by a wide margin): they catch a quadratic regression,
 * not a slow build.
 */
import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { validateEvent } from '../../../packages/repository-contract/src';
import { createFsrsScheduler } from '../../../packages/goreview/src/scheduler/fsrs';
import { foldDeckItems, itemIdFor } from '../../../packages/goreview/src/scheduler/deck';
import { planSession } from '../../../packages/goreview/src/planner/planner';
import { audioOk, prefs } from '../intake/fixtures';

const T0 = '2026-06-01T08:00:00.000Z';
const DAY = 86_400_000;
const at = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();

function added(id: string, unit: string, lang: string, when = T0): GoEvent {
  const card = itemIdFor(unit, 'written-recognition');
  return { id, v: 3, learnerId: 'L', enrolmentId: `E-${lang}`, languageId: lang, at: when, producer: { app: 'gopractice-review', version: 'scale', deviceId: 'D1' },
    kind: 'CardAdded', subject: { cardId: card, itemIds: [unit] },
    payload: { lifecycle: 'create', unitId: unit, unitKind: 'form', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'intake' }, evidence: { quality: 'none' } };
}
function review(id: string, unit: string, lang: string, when: string, rating: 1 | 2 | 3 | 4, previous: string | null, device = 'D1'): GoEvent {
  const card = itemIdFor(unit, 'written-recognition');
  return { id, v: 3, learnerId: 'L', enrolmentId: `E-${lang}`, languageId: lang, at: when, producer: { app: 'gopractice-review', version: 'scale', deviceId: device },
    kind: 'CardReviewed', subject: { cardId: card, itemIds: [unit] },
    payload: { cardKind: 'recognition', family: 'written-recognition', assessmentDimension: 'written-recognition', rating, grade: rating === 1 ? 'again' : rating === 2 ? 'hard' : 'good',
      correct: rating > 1, outcome: rating > 1 ? 'correct' : 'incorrect', responseMode: 'typed', hinted: false, retrievalAttempted: true, expectedPreviousReviewId: previous },
    evidence: { quality: 'moderate', sourceReliability: 1 } };
}
/** `cards` units, each created at T0 and reviewed `reviews` times a day apart, chained by predecessor; a fifth of the answers are lapses. */
function history(cards: number, reviews: number, lang = 'sq'): GoEvent[] {
  const events: GoEvent[] = [];
  for (let c = 0; c < cards; c++) {
    const unit = `form:${lang}:w${c}`;
    events.push(added(`add-${lang}-${c}`, unit, lang));
    let previous: string | null = null;
    for (let r = 0; r < reviews; r++) {
      const id = `rev-${lang}-${c}-${r}`;
      events.push(review(id, unit, lang, at((r + 1) * DAY + c * 1000), (c + r) % 5 === 0 ? 1 : 3, previous));
      previous = id;
    }
  }
  return events;
}
const shuffle = <T>(xs: readonly T[], seed: number): T[] => {
  let s = seed >>> 0; const a = [...xs];
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
};

describe('scale and the remaining learner scenarios', () => {
  it('I a returning learner: 1,500 cards all overdue after sixty days away plan as one bounded batch, with the whole backlog counted and nothing invented', () => {
    const scheduler = createFsrsScheduler();
    const events = history(1500, 1);
    const now = at(60 * DAY);
    const started = performance.now();
    const deck = foldDeckItems(events, scheduler, { languageId: 'sq', now });
    const folded = performance.now() - started;
    expect(deck).toHaveLength(1500);
    expect(deck.every((item) => scheduler.isDue(item.schedule, now))).toBe(true);
    const planned = performance.now();
    const plan = planSession({ deck, intake: [], preferences: prefs({ maxNew: 5, dailyNewLimit: 5, cardsPerDeck: 10, sessionMinutes: 10 }), audio: audioOk, scheduler, now, readingSignals: events, learnerId: 'L', random: () => 0.1 });
    const planning = performance.now() - planned;
    expect(deck.filter((item) => scheduler.isDue(item.schedule, now))).toHaveLength(1500); // the whole backlog is due
    expect(plan.availableWork?.questions).toBeGreaterThanOrEqual(plan.items.length); // and the plan says more waits than it shows
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items.length).toBeLessThanOrEqual(10);
    expect(plan.items.every((item) => !item.isNew)).toBe(true); // nothing new is admitted while the backlog is there (no intake was offered anyway)
    expect(folded).toBeLessThan(5_000);
    expect(planning).toBeLessThan(3_000);
  });

  it('J thousands of cards and tens of thousands of chained reviews reconstruct within bounds, and identically from any delivery order', () => {
    const scheduler = createFsrsScheduler();
    const events = history(2000, 10); // 2,000 cards, 20,000 reviews, 22,000 events
    const now = at(30 * DAY);
    const started = performance.now();
    const deck = foldDeckItems(events, scheduler, { languageId: 'sq', now });
    const folded = performance.now() - started;
    expect(deck).toHaveLength(2000);
    expect(deck.every((item) => item.schedule.reps === 10 && item.history.length === 10)).toBe(true);
    expect(deck.every((item) => item.history.every((h) => !h.scheduleExcluded && !h.conflict))).toBe(true); // a clean chain excludes nothing
    expect(folded).toBeLessThan(15_000);
    const again = foldDeckItems(shuffle(events, 7), scheduler, { languageId: 'sq', now });
    expect(again.map((i) => [i.itemId, i.schedule.due, i.schedule.stability, i.schedule.reps])).toEqual(deck.map((i) => [i.itemId, i.schedule.due, i.schedule.stability, i.schedule.reps]));
    const planned = performance.now();
    const plan = planSession({ deck, intake: [], preferences: prefs({ maxNew: 3, dailyNewLimit: 3, cardsPerDeck: 10, sessionMinutes: 10 }), audio: audioOk, scheduler, now, readingSignals: events, learnerId: 'L', random: () => 0.1 });
    expect(performance.now() - planned).toBeLessThan(5_000);
    expect(plan.items.length).toBeLessThanOrEqual(10);
    expect(plan.dueCount).toBe(plan.items.filter((i) => !i.isNew).length); // the batch's due items; the backlog stays in availableWork
    expect(plan.availableWork?.questions).toBeGreaterThanOrEqual(plan.items.length);
  });

  it('K a multilingual learner: the same spelling in two languages, a right-to-left pointed word and a Greek word are four cards; each language folds and plans alone', () => {
    const scheduler = createFsrsScheduler();
    const units = [['de', 'form:de:ja'], ['sq', 'form:sq:ja'], ['he', 'form:he:שָׁלוֹם'], ['el', 'form:el:λόγος']] as const;
    const events: GoEvent[] = [];
    for (const [lang, unit] of units) {
      events.push(added(`add-${lang}`, unit, lang));
      events.push(review(`rev-${lang}`, unit, lang, at(DAY), lang === 'he' ? 1 : 3, null));
    }
    for (const e of events) expect(validateEvent(e), e.id).toEqual([]);
    const ids = new Set(events.filter((e) => e.kind === 'CardAdded').map((e) => e.subject.cardId));
    expect(ids.size).toBe(4);
    const now = at(10 * DAY);
    for (const [lang, unit] of units) {
      const deck = foldDeckItems(events, scheduler, { languageId: lang, now });
      expect(deck.map((i) => i.unitId)).toEqual([unit]);
      expect(deck[0]!.languageId).toBe(lang);
      const plan = planSession({ deck, intake: [], preferences: prefs({ languageId: lang, maxNew: 0, dailyNewLimit: 0, cardsPerDeck: 5, sessionMinutes: 5 }), audio: audioOk, scheduler, now, readingSignals: events.filter((e) => e.languageId === lang), learnerId: 'L', random: () => 0.1 });
      expect(plan.items.map((i) => i.item.languageId)).toEqual(plan.items.map(() => lang));
    }
    // the Hebrew lapse moved only the Hebrew card
    const he = foldDeckItems(events, scheduler, { languageId: 'he', now })[0]!, de = foldDeckItems(events, scheduler, { languageId: 'de', now })[0]!;
    expect(he.history[0]!.outcome).toBe('incorrect');
    expect(de.history[0]!.outcome).toBe('correct');
    expect(he.schedule.due).not.toBe(de.schedule.due);
  });
});
