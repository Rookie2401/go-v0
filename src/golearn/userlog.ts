/**
 * The learner's evidence events (the `FOLD_TYPES`), kept in memory by the folder and indexed by text.
 *
 * Progress, pace and readiness need the log (dwell times, reports, help per sitting). Reading the whole event table of the
 * learner on every screen grows with everything he has ever done; the folder already loads that log once per process (to
 * derive sittings) and sees every later event as it folds it, so reads take their events from here:
 *   events   every evidence event, in (time, id) order
 *   sittings the sitting of each event (the same index the folds use)
 *   byText   the events that concern one text (a sentence-level event is filed under the text its sentence id names), so a
 *            read for one text or one stage iterates that text's events, not the learner's whole history
 * Not stored anywhere: it is rebuilt from the log on start, and it is exactly the log.
 */
import type { DomainEvent } from '../core';

/** The sitting of an event, by event id (reading sittings and listening sittings are separate key spaces; see fold.ts). */
export interface SittingLookup { get(eventId: string): string | undefined }

export interface UserLog {
  events: DomainEvent[];
  sittings: SittingLookup;
  byText: Map<string, DomainEvent[]>;
}

/** "text:th:x/s12" → "text:th:x". Sentence ids are `${textId}/s${key}`. */
export const textOfSentenceId = (sentenceId: string): string => {
  const i = sentenceId.lastIndexOf('/s');
  return i < 0 ? sentenceId : sentenceId.slice(0, i);
};

/** The texts an event concerns. */
export function textsOfEvent(e: DomainEvent): string[] {
  const out = new Set<string>();
  if ('textId' in e && typeof e.textId === 'string') out.add(e.textId);
  if ('sentenceId' in e && typeof e.sentenceId === 'string') out.add(textOfSentenceId(e.sentenceId));
  if ('sentenceIds' in e && Array.isArray(e.sentenceIds)) for (const s of e.sentenceIds) out.add(textOfSentenceId(s));
  return [...out];
}

const before = (a: DomainEvent, b: DomainEvent) => a.at < b.at || (a.at === b.at && a.id < b.id);

/** Insert keeping (time, id) order; events nearly always arrive in order, so this is an append. */
export function insertEvent(list: DomainEvent[], e: DomainEvent) {
  let i = list.length;
  while (i > 0 && before(e, list[i - 1])) i -= 1;
  list.splice(i, 0, e);
}

/** The events of several texts, once each, in (time, id) order. */
export function eventsOfTexts(log: UserLog, textIds: Iterable<string>): DomainEvent[] {
  const seen = new Set<string>();
  const out: DomainEvent[] = [];
  for (const id of textIds) {
    for (const e of log.byText.get(id) ?? []) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
  }
  return out.sort((a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0));
}
