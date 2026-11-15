/**
 * A scripted learner session for the deck fold: a seeded history, then one step per thing that can happen to a log
 * (an answer, a lapse, a new card graduating, a snooze, a suspension, a dismissal, a resume, an event of another language,
 * an event that is no card's, a sync pulling OLDER events into the middle of the log, a causal chain, a duplicate delivery, a review of a card never added).
 * Each step says how the log changes and the instant the deck is read at; `runScript` hands every step's log to a fold function.
 */
import { CONTRACT_VERSION, type GoEvent } from '../../packages/repository-contract/src';
import { buildCardRemoved } from '../../packages/goreview/src/scheduler/deck';
import { cardAdded, ids, reviewed, unitOf } from '../goreview-app/helpers';

export const A = ids('L1', 'sq');
const DAY = 86_400_000;
const T = Date.parse('2026-10-01T09:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();
export const cardId = (n: number): string => `card:meaning-to-target-retrieval:lemma:sq:card${n}:NOUN`;
const removedBase = { v: CONTRACT_VERSION, learnerId: 'L1', enrolmentId: A.enrolmentId, languageId: 'sq', deviceId: 'dev-x' } as const;

function lookup(i: number, at: string, lang = 'sq'): GoEvent {
  return {
    id: `lookup-${lang}-${i}`, v: CONTRACT_VERSION, learnerId: 'L1', enrolmentId: A.enrolmentId, languageId: lang, at,
    producer: { app: 'golearn-ext', version: 'test', deviceId: 'dev-old' }, kind: 'SelectionLookedUp',
    subject: { itemIds: [unitOf(`look${i % 50}`, lang)] }, payload: { surface: `look${i % 50}`, tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'test', helpShown: [] }, dedupeKey: `lookup-${lang}-${i}`,
  };
}

/** `extra` puts a payload field (a causal predecessor) on a review. */
function review(card: number, rating: 1 | 2 | 3 | 4, at: string, extra: Record<string, unknown> = {}, id?: string): GoEvent {
  const e = reviewed(A, `card${card}`, 'meaning-to-form', rating, at);
  return { ...e, id: id ?? e.id, payload: { ...e.payload, ...extra } };
}
export const reviewIdOf = (card: number, at: string): string => `rev-card${card}-${at}`;

export interface Step { name: string; at: string; log: GoEvent[] }

/** @param cards how many seeded cards; @param lookups how many seeded lookups (a quadrupled history is `scale(4)`). */
export function buildScript(cards = 40, lookups = 300): Step[] {
  const log: GoEvent[] = [];
  for (let i = 0; i < lookups; i++) log.push(lookup(i, iso(T - 60 * DAY + i * 60_000)));
  for (let c = 0; c < cards; c++) {
    log.push(cardAdded(A, `card${c}`, 'meaning-to-form', iso(T + c * 60_000)));
    for (let r = 0; r < 3; r++) log.push(review(c, c % 9 === 0 && r === 2 ? 1 : 3, iso(T + (r + 1) * 4 * DAY + c * 60_000)));
  }
  const steps: Step[] = [];
  const now = T + 40 * DAY;
  const snap = (name: string, at = now + steps.length * 60_000): void => { steps.push({ name, at: iso(at), log: [...log] }); };
  const push = (...e: GoEvent[]): void => { log.push(...e); };
  let t = now;
  const tick = (): string => iso((t += 60_000));

  snap('seeded history');
  push(review(0, 3, tick())); snap('an answer');
  push(review(1, 3, tick())); snap('another answer');
  push(review(2, 1, tick())); snap('a wrong answer (a lapse)');
  push(review(2, 3, tick())); snap('the lapsed card answered right');
  push(review(3, 4, tick())); snap('an easy answer');
  push(review(4, 2, tick())); snap('a hard answer');
  // a new card graduating: added, then reviewed until it leaves learning
  push(cardAdded(A, `card${cards}`, 'meaning-to-form', tick())); snap('a new card added');
  for (let r = 0; r < 3; r++) { push(review(cards, 3, tick())); snap(`the new card, review ${r + 1}`); }
  // controls
  const until = iso(now + 30 * DAY);
  push(buildCardRemoved({ ...removedBase, at: tick(), itemId: cardId(5), reason: 'snoozed', until })); snap('a snooze');
  steps.push({ name: 'the snooze read after it ended', at: iso(now + 31 * DAY), log: [...log] });
  steps.push({ name: 'the snooze read before it ended again', at: iso(now + 1 * DAY), log: [...log] });
  push(buildCardRemoved({ ...removedBase, at: tick(), itemId: cardId(6), reason: 'suspended' })); snap('a suspension');
  push(buildCardRemoved({ ...removedBase, at: tick(), itemId: cardId(7), reason: 'dismissed' })); snap('a dismissal');
  push(cardAdded(A, 'card6', 'meaning-to-form', tick())); snap('a resume (the card added again)');
  push(review(6, 3, tick())); snap('the resumed card answered');
  // events that are not this deck's
  push(lookup(9001, tick())); snap('a lookup (no card)');
  push(lookup(9002, tick(), 'de')); snap('a lookup of another language');
  push(cardAdded(ids('L1', 'de'), 'karte0', 'meaning-to-form', tick(), { lang: 'de' })); snap('a card of another language');
  // a causal chain
  const parentAt = iso(T + 3 * 4 * DAY + 9 * 60_000);
  push(review(9, 3, tick(), { expectedPreviousReviewId: reviewIdOf(9, parentAt) })); snap('a review naming its predecessor (a lapse was last)');
  push(review(10, 3, tick(), { expectedPreviousReviewId: 'rev-not-there' })); snap('a review naming a predecessor that is not there');
  // a sync pulling older events into the middle of the log
  const older = review(1, 3, iso(T + 2 * DAY + 60_000));
  const olderRemoval = buildCardRemoved({ ...removedBase, at: iso(T + 1 * DAY), itemId: cardId(8), reason: 'suspended' });
  log.splice(Math.floor(log.length / 2), 0, older, olderRemoval); snap('a sync pulled older events into the middle');
  push(review(11, 3, tick())); snap('an answer after the sync');
  const dupe = log.find((e) => e.kind === 'CardReviewed')!;
  push(dupe); snap('a duplicate delivery of an event already in the log');
  push(review(12, 3, tick())); snap('an answer after the duplicate');
  push(review(9999, 3, tick())); snap('a review of a card that was never added');
  push(review(13, 3, tick(), {}, 'rev-card13-same-id'), review(14, 3, tick(), {}, 'rev-card14-b')); snap('two answers at once');
  push(review(15, 3, tick(), { listeningPractice: true })); snap('a listening answer');
  return steps;
}
