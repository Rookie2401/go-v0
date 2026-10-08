/**
 * Held-out texts of the unseen-text check (engine package R7; COURSE-AUDIT-2026-10-07 section 4.3 item 11).
 *
 * The text chosen for a check must be one the learner has not seen, and it stays out of every recommendation for HELD_OUT_DAYS
 * so that nothing else offers it (or lets it be read ahead of the check). No existing exclusion fits: `readingAssessmentId` and
 * `editorialTags` are properties of the TEXT, shared by every learner and written at import, while a runtime pick is one learner's
 * and temporary. So the store keeps one `meta` row per learner, a JSON map  textId -> held until (ISO)  (the `heldOut` map of
 * the GoLearn store), and two places read it:
 *   - candidates.ts `rankWholeLibrary`   passes it to the shortlist as `excludeIds` (the whole-library step of `recommend`),
 *   - recommend.ts                       adds it to `notOffered` (the store-side step: rereads, scripture revisits, ladder texts).
 * Expired entries are ignored on read and dropped on the next write. Nothing here is item evidence and nothing is folded.
 */
import type { Ctx } from './state';

/** How long a text picked for a check stays out of recommendation. */
export const HELD_OUT_DAYS = 60;
const DAY_MS = 86_400_000;

type StoreCtx = Pick<Ctx, 'store'>;
export const heldOutMetaId = (userId: string): string => `unseen-heldout:${encodeURIComponent(userId)}`;

async function readMap(ctx: StoreCtx, userId: string): Promise<Record<string, string>> {
  const row = await ctx.store.meta.get(heldOutMetaId(userId));
  if (!row) return {};
  try {
    const v: unknown = JSON.parse(row.value);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, until] of Object.entries(v as Record<string, unknown>)) if (typeof until === 'string') out[k] = until;
    return out;
  } catch { return {}; }
}

/** The text ids held out for this learner at `now` (ISO). Cheap: one row. */
export async function heldOutIds(ctx: StoreCtx, userId: string, now: string): Promise<Set<string>> {
  const map = await readMap(ctx, userId);
  const t = Date.parse(now);
  return new Set(Object.entries(map).filter(([, until]) => Number.isNaN(t) || Date.parse(until) > t).map(([id]) => id));
}

/** The map as stored, expired entries included (tests and the status line). */
export async function heldOutUntil(ctx: StoreCtx, userId: string): Promise<ReadonlyMap<string, string>> {
  return new Map(Object.entries(await readMap(ctx, userId)));
}

/** Hold `textId` out of recommendation for `days` from `now`. Drops entries that have already expired. */
export async function holdOut(ctx: StoreCtx, userId: string, textId: string, now: string, days: number = HELD_OUT_DAYS): Promise<string> {
  const map = await readMap(ctx, userId);
  const t = Date.parse(now);
  for (const [id, until] of Object.entries(map)) if (!Number.isNaN(t) && Date.parse(until) <= t) delete map[id];
  const until = new Date(t + days * DAY_MS).toISOString();
  map[textId] = until;
  await ctx.store.meta.put({ id: heldOutMetaId(userId), value: JSON.stringify(map), updatedAt: now });
  return until;
}
