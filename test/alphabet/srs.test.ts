// The alphabet trainer's scheduler: Leitner boxes, intervals, batches of 10, sessions (pure, hand-moved time).
import { describe, expect, it } from 'vitest';
import {
  BATCH_SIZE, BOX_INTERVALS_MS, DAY, HOUR, LEARNED_BOX, MAX_BOX, MINUTE, answer, batchStatus, batches, canStartNext, currentBatchIndex, due,
  emptyState, nextDueAt, nextReviewText, nextSession, openBatchCount, parseState, requeue, serializeState, startNextBatch, waitPhrase,
} from '../../src/alphabet/srs';
import type { AlphabetState } from '../../src/alphabet/srs';

const T0 = Date.UTC(2026, 9, 3, 9, 0, 0);
const deck = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}` }));
const ids = (cards: Array<{ id: string }>) => cards.map((c) => c.id);

/** Answer a card right `times` times, each time at the moment it falls due. */
function learn(state: AlphabetState, id: string, times: number, start = T0): AlphabetState {
  let s = state;
  let now = start;
  for (let i = 0; i < times; i++) {
    s = answer(s, id, true, now);
    now = s.cards[id].due;
  }
  return s;
}

describe('boxes and intervals', () => {
  it('has the eight boxes with the intervals of the design', () => {
    expect(BOX_INTERVALS_MS).toEqual([0, 10 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY, 90 * DAY]);
    expect(MAX_BOX).toBe(7);
    expect(BATCH_SIZE).toBe(10);
    expect(LEARNED_BOX).toBe(2);
  });

  it('moves a card up one box per right answer and schedules it by the box interval', () => {
    let s = emptyState();
    let now = T0;
    for (let box = 1; box <= MAX_BOX; box++) {
      s = answer(s, 'c1', true, now);
      expect(s.cards.c1.box).toBe(box);
      expect(s.cards.c1.due).toBe(now + BOX_INTERVALS_MS[box]);
      expect(s.cards.c1.reps).toBe(box);
      now = s.cards.c1.due;
    }
    // the top box stays the top box
    s = answer(s, 'c1', true, now);
    expect(s.cards.c1.box).toBe(MAX_BOX);
    expect(s.cards.c1.due).toBe(now + 90 * DAY);
  });

  it('sends a wrong answer back to box 0, due at once, and counts the lapse', () => {
    let s = learn(emptyState(), 'c1', 4);
    expect(s.cards.c1.box).toBe(4);
    s = answer(s, 'c1', false, T0 + 50 * DAY);
    expect(s.cards.c1).toMatchObject({ box: 0, due: T0 + 50 * DAY, lapses: 1, reps: 5 });
    // a wrong answer on a brand-new card is box 0 as well
    expect(answer(emptyState(), 'c2', false, T0).cards.c2).toMatchObject({ box: 0, due: T0, lapses: 1 });
  });

  it('does not change the state it is given', () => {
    const before = emptyState();
    const frozen = JSON.stringify(before);
    answer(before, 'c1', true, T0);
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe('due cards', () => {
  it('lists the due cards oldest first, and not the ones that are resting', () => {
    let s = emptyState();
    s = answer(s, 'a', true, T0); //            box 1, due T0 + 10 min
    s = answer(s, 'b', false, T0 + 2 * MINUTE); // box 0, due T0 + 2 min
    s = answer(s, 'c', true, T0 + 1 * MINUTE); // box 1, due T0 + 11 min
    s = learn(s, 'd', 3, T0); //                box 3, due far off
    expect(due(s, T0)).toEqual([]);
    expect(due(s, T0 + 2 * MINUTE)).toEqual(['b']);
    expect(due(s, T0 + 10 * MINUTE)).toEqual(['b', 'a']);
    expect(due(s, T0 + 11 * MINUTE)).toEqual(['b', 'a', 'c']);
    expect(due(s, T0 + 12 * MINUTE)).not.toContain('d');
  });

  it('knows when the next card falls due', () => {
    let s = emptyState();
    expect(nextDueAt(s, T0)).toBeNull();
    s = answer(s, 'a', true, T0);
    s = answer(s, 'b', true, T0 + 5 * MINUTE);
    expect(nextDueAt(s, T0)).toBe(T0 + 10 * MINUTE);
    expect(nextDueAt(s, T0 + 10 * MINUTE)).toBe(T0 + 15 * MINUTE); // the first is due now, the second is next
    expect(nextDueAt(s, T0 + 20 * MINUTE)).toBeNull();
  });
});

describe('next-review wording', () => {
  it('says minutes, hours, tomorrow, days, weeks and months', () => {
    expect(waitPhrase(30_000)).toBe('in 1 minute');
    expect(waitPhrase(10 * MINUTE)).toBe('in 10 minutes');
    expect(waitPhrase(59 * MINUTE)).toBe('in 59 minutes');
    expect(waitPhrase(1 * HOUR)).toBe('in 1 hour');
    expect(waitPhrase(3 * HOUR)).toBe('in 3 hours');
    expect(waitPhrase(3 * HOUR + 20 * MINUTE)).toBe('in 3 hours');
    expect(waitPhrase(1 * DAY)).toBe('tomorrow');
    expect(waitPhrase(22 * HOUR)).toBe('tomorrow');
    expect(waitPhrase(3 * DAY)).toBe('in 3 days');
    expect(waitPhrase(16 * DAY)).toBe('in 2 weeks');
    expect(waitPhrase(35 * DAY)).toBe('in 5 weeks');
    expect(waitPhrase(90 * DAY)).toBe('in 3 months');
  });

  it('builds the sentence from the state', () => {
    expect(nextReviewText(emptyState(), T0)).toBeNull();
    const s = answer(emptyState(), 'a', true, T0);
    expect(nextReviewText(s, T0)).toBe('next review in 10 minutes');
    expect(nextReviewText(s, T0 + 9 * MINUTE)).toBe('next review in 1 minute');
    expect(nextReviewText(learn(emptyState(), 'a', 2, T0), T0 + 10 * MINUTE)).toBe('next review tomorrow');
    expect(nextReviewText(answer(emptyState(), 'a', true, T0 + 3 * HOUR - 10 * MINUTE), T0)).toBe('next review in 3 hours');
  });
});

describe('batches of 10', () => {
  it('cuts the deck into consecutive slices of 10, the last possibly shorter', () => {
    const b = batches(deck(23));
    expect(b.map((x) => x.length)).toEqual([10, 10, 3]);
    expect(ids(b[1])[0]).toBe('c11');
    expect(batches(deck(0))).toEqual([]);
    expect(batches(deck(10)).map((x) => x.length)).toEqual([10]);
  });

  it('classifies a batch as not started, learning or learned (every card at box 2 or more)', () => {
    const d = deck(20);
    const first = batches(d)[0];
    let s = emptyState();
    expect(batchStatus(first, s)).toBe('not-started');
    s = answer(s, 'c1', true, T0);
    expect(batchStatus(first, s)).toBe('learning');
    for (const c of first) s = answer(s, c.id, true, T0);
    expect(batchStatus(first, s)).toBe('learning'); // everyone is at box 1
    for (const c of first) s = learn(s, c.id, 2);
    expect(batchStatus(first, s)).toBe('learned');
    s = answer(s, 'c3', false, T0 + 5 * DAY);
    expect(batchStatus(first, s)).toBe('learning'); // a lapse takes it back
  });

  it('opens the first batch only; the 11th card never appears before the first 10 are learned', () => {
    const d = deck(25);
    let s = emptyState();
    expect(openBatchCount(d, s)).toBe(1);
    expect(ids(nextSession(d, s, T0))).toEqual(ids(d.slice(0, 10)));

    // nine of ten learned: still closed
    for (const c of d.slice(0, 9)) s = learn(s, c.id, 2);
    expect(openBatchCount(d, s)).toBe(1);
    const now = T0 + 1 * HOUR; // the nine learned cards are resting until tomorrow
    expect(ids(nextSession(d, s, now))).toEqual(['c10']);
    expect(ids(nextSession(d, s, now))).not.toContain('c11');

    // the tenth learned: the second batch opens by itself
    s = learn(s, 'c10', 2);
    expect(openBatchCount(d, s)).toBe(2);
    expect(currentBatchIndex(d, s)).toBe(1);
    expect(ids(nextSession(d, s, T0 + 60 * DAY))).toEqual(expect.arrayContaining(ids(d.slice(10, 20))));
    expect(ids(nextSession(d, s, T0 + 60 * DAY))).not.toContain('c21');
  });

  it('opens the next batch on request, whatever the state of the first', () => {
    const d = deck(25);
    let s = emptyState();
    expect(canStartNext(d, s)).toBe(true);
    s = startNextBatch(d, s);
    expect(openBatchCount(d, s)).toBe(2);
    // the unmet cards of the first batch still come first; the second batch waits behind them
    expect(ids(nextSession(d, s, T0))).toEqual(ids(d.slice(0, 10)));
    // once the first batch has been met, the second is the current one
    for (const c of d.slice(0, 10)) s = answer(s, c.id, true, T0);
    expect(currentBatchIndex(d, s)).toBe(1);
    expect(ids(nextSession(d, s, T0))).toEqual(ids(d.slice(10, 20)));
    // and again for the third, then there is no more to open
    s = startNextBatch(d, s);
    expect(openBatchCount(d, s)).toBe(3);
    s = startNextBatch(d, s);
    expect(openBatchCount(d, s)).toBe(3);
    expect(canStartNext(d, s)).toBe(false);
  });

  it('never offers more than one batch of new cards at once', () => {
    const d = deck(40);
    let s = startNextBatch(d, startNextBatch(d, emptyState()));
    expect(openBatchCount(d, s)).toBe(3);
    expect(nextSession(d, s, T0)).toHaveLength(10);
    s = answer(s, 'c1', true, T0);
    expect(nextSession(d, s, T0)).toHaveLength(9);
  });

  it('keeps a batch open after a lapse and ignores cards no longer in the deck', () => {
    const d = deck(20);
    let s = emptyState();
    for (const c of d.slice(0, 10)) s = learn(s, c.id, 2);
    s = answer(s, 'c11', true, T0);
    s = answer(s, 'c1', false, T0 + 9 * DAY);
    expect(openBatchCount(d, s)).toBe(2);
    s = answer(s, 'gone', false, T0);
    expect(ids(nextSession(d, s, T0 + 9 * DAY))).toContain('c1');
    expect(ids(nextSession(d, s, T0 + 9 * DAY))).not.toContain('gone');
  });
});

describe('a session', () => {
  it('lists due reviews first, oldest due first, then the new cards of the current batch', () => {
    const d = deck(25);
    let s = emptyState();
    s = answer(s, 'c3', true, T0); //      due T0 + 10 min
    s = answer(s, 'c1', true, T0 + 1 * MINUTE); // due T0 + 11 min
    s = answer(s, 'c2', false, T0 + 2 * MINUTE); // due T0 + 2 min
    const now = T0 + 20 * MINUTE;
    expect(ids(nextSession(d, s, now))).toEqual(['c2', 'c3', 'c1', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']);
  });

  it('shows a wrong card again in the same session, then spaces it out as it is learned', () => {
    const d = deck(12);
    let s = emptyState();
    const now = T0;
    let queue = ids(nextSession(d, s, now));
    expect(queue).toHaveLength(10);

    // c1 is answered wrongly: it is due at once, so a fresh look at the session still lists it
    s = answer(s, 'c1', false, now);
    expect(s.cards.c1.box).toBe(0);
    expect(ids(nextSession(d, s, now))[0]).toBe('c1');
    // the UI puts it back a few cards later
    queue = requeue(queue.slice(1), 'c1');
    expect(queue.indexOf('c1')).toBe(3);
    expect(queue).toHaveLength(10);

    // answered right the second time: box 1, resting for ten minutes, no longer in the session
    s = answer(s, 'c1', true, now);
    expect(s.cards.c1).toMatchObject({ box: 1, due: now + 10 * MINUTE, lapses: 1 });
    expect(ids(nextSession(d, s, now))).not.toContain('c1');
    expect(ids(nextSession(d, s, now + 10 * MINUTE))[0]).toBe('c1');
  });

  it('ends when nothing is due and says when the next review is', () => {
    const d = deck(10);
    let s = emptyState();
    for (const c of d) s = answer(s, c.id, true, T0);
    expect(nextSession(d, s, T0)).toEqual([]); // all met, none due, the batch is not yet learned
    expect(nextReviewText(s, T0)).toBe('next review in 10 minutes');
    // ten minutes later everything is due; answering right moves the batch to box 2
    expect(ids(nextSession(d, s, T0 + 10 * MINUTE))).toHaveLength(10);
    for (const c of d) s = answer(s, c.id, true, T0 + 10 * MINUTE);
    expect(batchStatus(d, s)).toBe('learned');
    expect(nextSession(d, s, T0 + 10 * MINUTE)).toEqual([]);
    expect(nextReviewText(s, T0 + 10 * MINUTE)).toBe('next review tomorrow');
  });

  it('requeue puts a card the given number of places back, or at the end of a short queue', () => {
    expect(requeue(['b', 'c', 'd', 'e', 'f'], 'a')).toEqual(['b', 'c', 'd', 'a', 'e', 'f']);
    expect(requeue(['b', 'c'], 'a')).toEqual(['b', 'c', 'a']);
    expect(requeue([], 'a')).toEqual(['a']);
    expect(requeue(['b', 'a', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
  });
});

describe('storage form', () => {
  it('round-trips', () => {
    const s = startNextBatch(deck(30), learn(emptyState(), 'c1', 3));
    expect(parseState(serializeState(s))).toEqual(s);
  });

  it('survives damage by dropping what it cannot read', () => {
    expect(parseState(undefined)).toEqual(emptyState());
    expect(parseState('not json')).toEqual(emptyState());
    expect(parseState('42')).toEqual(emptyState());
    const s = parseState(JSON.stringify({ cards: { ok: { box: 99, due: 5, reps: 1, lapses: 0, last: 1 }, bad: { box: 'x' }, worse: null }, started: -4 }));
    expect(Object.keys(s.cards)).toEqual(['ok']);
    expect(s.cards.ok.box).toBe(MAX_BOX);
    expect(s.started).toBe(1);
  });
});
