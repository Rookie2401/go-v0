/**
 * The alphabet trainer's scheduler: a Leitner box system plus "10 letters at a time" batching. Pure: no React, no storage, no
 * clock of its own (every function takes `now`, in milliseconds since the epoch), so it can be tested by hand-moving time.
 *
 * Boxes. Every card the learner has met sits in a box 0 to 7. The box says how long the card may rest before it is asked
 * again:
 *
 *   box 0   again in this session (a new card, or one answered wrongly)
 *   box 1   10 minutes
 *   box 2   1 day
 *   box 3   3 days
 *   box 4   7 days
 *   box 5   16 days
 *   box 6   35 days
 *   box 7   90 days
 *
 * A right answer moves the card up one box (and stops at 7); a wrong answer sends it back to box 0, so it is asked again
 * straight away. A card in box 2 or higher has been answered right on at least two separate occasions (box 1 asks again only
 * after ten minutes), which is what "learned" means here.
 *
 * Batches. The deck is taught in consecutive slices of 10 cards (the last may be shorter). Batch k+1 opens by itself when every
 * card of batches 1..k is learned (box >= 2); the learner can also open the next one at any time ("Start the next 10 now").
 * Once a batch has been opened or any of its cards has been met, it stays open, even if a later lapse makes it "learning" again.
 *
 * A session: `nextSession` lists what to show now (the cards that are due, the oldest due first, then the not-yet-met cards of
 * the first open batch that still has some). The UI works through that list, puts a card answered wrongly back a few places
 * later (`requeue`), and asks `nextSession` again when the list is empty; when it comes back empty, the session is over and
 * `nextReviewText` says when something is due next.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** How long a card rests in each box, in milliseconds (box 0 rests not at all). */
export const BOX_INTERVALS_MS: readonly number[] = [0, 10 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY, 90 * DAY];
export const MAX_BOX = BOX_INTERVALS_MS.length - 1;
/** Letters taught at a time. */
export const BATCH_SIZE = 10;
/** A card is "learned" from this box up (two right answers on separate occasions). */
export const LEARNED_BOX = 2;
/** How many other cards come between a wrongly answered card and its next showing in the same session. */
export const RELEARN_GAP = 3;

export interface CardProgress {
  box: number;
  /** When the card is next due (ms since the epoch). */
  due: number;
  /** Times answered. */
  reps: number;
  /** Times answered wrongly. */
  lapses: number;
  /** When it was last answered (ms since the epoch). */
  last: number;
}

export interface AlphabetState {
  version: 1;
  /** Only cards that have been answered at least once have an entry. */
  cards: Record<string, CardProgress>;
  /** How many batches the learner has opened by choice ("Start the next 10 now"); batches also open by being learned. */
  started: number;
}

export function emptyState(): AlphabetState {
  return { version: 1, cards: {}, started: 1 };
}

// ─────────────────────────────── storage form ───────────────────────────────

export function serializeState(state: AlphabetState): string {
  return JSON.stringify(state);
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Reads a stored state back; anything that is not a state (or is damaged in part) is dropped, never thrown on. */
export function parseState(json: string | undefined | null): AlphabetState {
  if (!json) return emptyState();
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return emptyState(); }
  if (typeof raw !== 'object' || raw === null) return emptyState();
  const r = raw as { cards?: unknown; started?: unknown };
  const cards: Record<string, CardProgress> = {};
  if (typeof r.cards === 'object' && r.cards !== null) {
    for (const [id, v] of Object.entries(r.cards as Record<string, unknown>)) {
      const c = v as Partial<CardProgress> | null;
      if (!c || typeof c !== 'object' || !finite(c.box) || !finite(c.due)) continue;
      cards[id] = {
        box: Math.min(MAX_BOX, Math.max(0, Math.trunc(c.box))),
        due: c.due,
        reps: finite(c.reps) ? Math.max(0, Math.trunc(c.reps)) : 0,
        lapses: finite(c.lapses) ? Math.max(0, Math.trunc(c.lapses)) : 0,
        last: finite(c.last) ? c.last : 0,
      };
    }
  }
  return { version: 1, cards, started: finite(r.started) ? Math.max(1, Math.trunc(r.started)) : 1 };
}

// ─────────────────────────────── answering ───────────────────────────────

/** The state after the learner answered `cardId`: right = one box up, wrong = back to box 0. Does not change `state`. */
export function answer(state: AlphabetState, cardId: string, correct: boolean, now: number): AlphabetState {
  const before = state.cards[cardId];
  const box = correct ? Math.min(MAX_BOX, (before?.box ?? 0) + 1) : 0;
  const next: CardProgress = {
    box,
    due: now + BOX_INTERVALS_MS[box],
    reps: (before?.reps ?? 0) + 1,
    lapses: (before?.lapses ?? 0) + (correct ? 0 : 1),
    last: now,
  };
  return { ...state, cards: { ...state.cards, [cardId]: next } };
}

/** Ids of the cards due at `now`, the one that has waited longest first. */
export function due(state: AlphabetState, now: number): string[] {
  return Object.entries(state.cards)
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id]) => id);
}

/** When the next card falls due after `now` (ms since the epoch), or null when no card is waiting. */
export function nextDueAt(state: AlphabetState, now: number): number | null {
  let best: number | null = null;
  for (const c of Object.values(state.cards)) if (c.due > now && (best === null || c.due < best)) best = c.due;
  return best;
}

/** "in 10 minutes", "in 3 hours", "tomorrow", "in 5 days", "in 2 weeks", "in 3 months". */
export function waitPhrase(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  if (minutes < 60) return `in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 20) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.max(1, Math.round(ms / DAY));
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

/** "next review in 3 hours" / "next review tomorrow"; null when there is nothing to come back to. */
export function nextReviewText(state: AlphabetState, now: number): string | null {
  const at = nextDueAt(state, now);
  return at === null ? null : `next review ${waitPhrase(at - now)}`;
}

// ─────────────────────────────── batches ───────────────────────────────

interface HasId { id: string }

/** The deck cut into consecutive slices of `size` (10) cards. */
export function batches<C extends HasId>(deck: readonly C[], size = BATCH_SIZE): C[][] {
  const out: C[][] = [];
  for (let i = 0; i < deck.length; i += size) out.push(deck.slice(i, i + size));
  return out;
}

export type BatchStatus = 'not-started' | 'learning' | 'learned';

const isLearned = (state: AlphabetState, id: string) => (state.cards[id]?.box ?? 0) >= LEARNED_BOX;

export function batchStatus<C extends HasId>(batch: readonly C[], state: AlphabetState): BatchStatus {
  if (batch.length > 0 && batch.every((c) => isLearned(state, c.id))) return 'learned';
  return batch.some((c) => state.cards[c.id]) ? 'learning' : 'not-started';
}

/**
 * How many batches are open: the first; one more after every leading batch that is learned; any batch the learner opened by
 * choice; and any batch that has had a card answered in it (a lapse does not close what was open).
 */
export function openBatchCount<C extends HasId>(deck: readonly C[], state: AlphabetState): number {
  const all = batches(deck);
  if (all.length === 0) return 0;
  let leading = 0;
  while (leading < all.length && batchStatus(all[leading], state) === 'learned') leading++;
  let lastMet = -1;
  all.forEach((b, i) => { if (b.some((c) => state.cards[c.id])) lastMet = i; });
  return Math.min(all.length, Math.max(1, state.started, leading + 1, lastMet + 1));
}

/** The first open batch that still has cards the learner has not met (the "current" batch), or -1. */
export function currentBatchIndex<C extends HasId>(deck: readonly C[], state: AlphabetState): number {
  const all = batches(deck);
  const open = openBatchCount(deck, state);
  for (let i = 0; i < open; i++) if (all[i].some((c) => !state.cards[c.id])) return i;
  return -1;
}

/** Whether there is another batch to open by choice. */
export function canStartNext<C extends HasId>(deck: readonly C[], state: AlphabetState): boolean {
  return openBatchCount(deck, state) < batches(deck).length;
}

/** "Start the next 10 now": opens one more batch, whatever the state of the earlier ones. */
export function startNextBatch<C extends HasId>(deck: readonly C[], state: AlphabetState): AlphabetState {
  if (!canStartNext(deck, state)) return state;
  return { ...state, started: openBatchCount(deck, state) + 1 };
}

// ─────────────────────────────── sessions ───────────────────────────────

/**
 * What to show now: the due cards (oldest due first), then the cards of the current batch not yet met, in deck order. The
 * second part is at most one batch (10 cards): a later batch is never mixed in.
 */
export function nextSession<C extends HasId>(deck: readonly C[], state: AlphabetState, now: number): C[] {
  const byId = new Map(deck.map((c) => [c.id, c] as const));
  const reviews = due(state, now).flatMap((id) => { const c = byId.get(id); return c ? [c] : []; });
  const current = currentBatchIndex(deck, state);
  const fresh = current < 0 ? [] : batches(deck)[current].filter((c) => !state.cards[c.id]);
  return [...reviews, ...fresh];
}

/** Puts `id` back into a queue of card ids, `gap` places after the front (at the end when the queue is shorter). */
export function requeue(queue: readonly string[], id: string, gap = RELEARN_GAP): string[] {
  const rest = queue.filter((x) => x !== id);
  const at = Math.min(rest.length, gap);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
