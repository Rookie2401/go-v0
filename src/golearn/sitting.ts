/**
 * Sittings — derived from event TIME per learner, never trusted from the UI's `session` string.
 *
 * A sitting is a run of a learner's evidence events (the `FOLD_TYPES`) where no two consecutive events are
 * `SITTING_GAP_MS` or more apart. The sitting key is the ISO time of the sitting's FIRST event, so it is a pure
 * function of the event log: live folding, restart-and-continue and `rebuild` all derive the same keys.
 *
 * A reload, a route revisit or a new UI session id inside a sitting therefore cannot start a new sitting, and so
 * cannot mint a second exposure encounter for the same (item, sentence, modality). Events are assumed to arrive in
 * time order (the bus stamps `at` when it appends); an event stamped earlier than the latest one already seen joins
 * the current sitting.
 */
import { SITTING_GAP_MS } from '../core';

type Timed = { id: string; at: string };

export class SittingIndex {
  private readonly of = new Map<string, string>();
  private lastMs = Number.NaN;
  private current: string | undefined;

  /** The sitting key of an event; events must be added in (at, id) order. Idempotent per event id. */
  add(e: Timed): string {
    const known = this.of.get(e.id);
    if (known !== undefined) return known;
    const ms = Date.parse(e.at);
    const starts = this.current === undefined
      || (Number.isFinite(ms) && Number.isFinite(this.lastMs) && ms - this.lastMs >= SITTING_GAP_MS);
    if (starts) this.current = e.at;
    if (Number.isFinite(ms) && (!Number.isFinite(this.lastMs) || ms > this.lastMs)) this.lastMs = ms;
    this.of.set(e.id, this.current!);
    return this.current!;
  }

  get(eventId: string): string | undefined {
    return this.of.get(eventId);
  }
}

export const byAtId = (a: Timed, b: Timed) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Sitting key per event id for a learner's evidence events (any order in; sorted by time, then id). */
export function assignSittings(events: Timed[]): Map<string, string> {
  const idx = new SittingIndex();
  const out = new Map<string, string>();
  for (const e of [...events].sort(byAtId)) out.set(e.id, idx.add(e));
  return out;
}
