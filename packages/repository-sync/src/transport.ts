/**
 * Pushing around a refused event. The service refuses a whole `/sync/push` batch when any event in it is invalid
 * (`422 invalid-events`, "nothing was stored") and names the bad ones by index. One event the service will never accept
 * (a clock gone wrong, a kind from a build it does not know) must not hold every later event of the learner back for ever:
 * it is reported as refused (the sync client sets it aside as a `rejected:` row the learner can see) and the rest is sent
 * again in the same round. Written once here so every host's transport behaves alike (GoLearn's worker, GoPractice).
 */
import type { AppendOutcome, GoEvent, SyncPushRequest, SyncPushResponse, ValidationIssue } from '../../repository-contract/src';

/** What one attempt to push returned, in the shape of the typed API client's `ApiResult` (the sync package does not import the service). */
export type PushAttempt =
  | { ok: true; data: SyncPushResponse }
  | { ok: false; status: number; error: string; message?: string; body?: Record<string, unknown> };

/** The per-event refusals of a 422 `invalid-events` body (`issues: [{ index, id?, issues }]`), as outcomes the sync client understands. */
export function refusedEvents(issues: unknown, sent: GoEvent[]): AppendOutcome[] {
  if (!Array.isArray(issues)) return [];
  const out: AppendOutcome[] = [];
  for (const b of issues as Array<{ index?: unknown; issues?: unknown }>) {
    const ev = typeof b?.index === 'number' ? sent[b.index] : undefined;
    if (ev && Array.isArray(b.issues) && b.issues.length) out.push({ id: ev.id, stored: false, issues: b.issues as ValidationIssue[] });
  }
  return out;
}

/**
 * `send(req)` once; if the service refused individual events, send the rest again (events it named are reported as refused outcomes of the
 * final response). Any other failure is returned as it came, for the caller to turn into its own error. At most a few rounds: a second 422
 * can only name events the first one did not, which the service does not do, so the loop is a bound, not an expectation.
 */
export async function pushIsolatingRefusals(send: (req: SyncPushRequest) => Promise<PushAttempt>, req: SyncPushRequest): Promise<PushAttempt> {
  let current = req;
  const refused: AppendOutcome[] = [];
  for (let round = 0; round < 5; round++) {
    const r = await send(current);
    if (r.ok) return refused.length ? { ok: true, data: { ...r.data, outcomes: [...r.data.outcomes, ...refused] } } : r;
    if (r.status !== 422 || r.error !== 'invalid-events' || !current.events.length) return r;
    const now = refusedEvents(r.body?.issues, current.events);
    if (!now.length) return r;
    refused.push(...now);
    const bad = new Set(now.map((o) => o.id));
    current = { ...current, events: current.events.filter((e) => !bad.has(e.id)) };
  }
  return { ok: false, status: 422, error: 'invalid-events', message: 'the service kept refusing events' };
}
