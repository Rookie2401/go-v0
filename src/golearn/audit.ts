/**
 * Evidence audit + policy migration. Nothing is ever deleted from the log: excluded events are reported here, and
 * `rebuild` (which folds only eligible events) is how derived state is brought in line with the current policy.
 */
import type { DomainEvent, EvidenceAudit } from '../core';
import { listenVerdict } from './eligibility';
import type { AudioCompleted } from './eligibility';
import { POLICY_VERSION } from './policy';
import type { Ctx } from './state';

export const policyMetaId = (userId: string) => `golearn.policy:${userId}`;

export async function excludedListens(ctx: Ctx, userId: string): Promise<Array<{ event: AudioCompleted; reason: EvidenceAudit['excluded'][number]['reason'] }>> {
  const out: Array<{ event: AudioCompleted; reason: EvidenceAudit['excluded'][number]['reason'] }> = [];
  for (const e of await ctx.bus.history({ userId, types: ['AudioSegmentCompleted'] })) {
    const ev = e as AudioCompleted;
    const v = await listenVerdict(ctx, ev);
    if (!v.eligible) out.push({ event: ev, reason: v.reason });
  }
  return out;
}

export async function auditEvidence(ctx: Ctx, userId: string, rebuild: (userId: string) => Promise<void>, opts?: { rebuild?: boolean }): Promise<EvidenceAudit> {
  const events: DomainEvent[] = await ctx.store.events.where('userId', userId);
  const excluded = (await excludedListens(ctx, userId)).map(({ event, reason }) => ({ eventId: event.id, type: event.type, reason }));
  if (opts?.rebuild) await rebuild(userId);
  return { userId, policyVersion: POLICY_VERSION, totalEvents: events.length, excluded, rebuilt: !!opts?.rebuild };
}

/** Rebuild when the stored policy version differs (or is missing while derived state exists). Returns true if it rebuilt. */
export async function ensureCurrent(ctx: Ctx, userId: string, rebuild: (userId: string) => Promise<void>): Promise<boolean> {
  const row = await ctx.store.meta.get(policyMetaId(userId));
  if (row?.value === POLICY_VERSION) return false;
  const hasState = (await ctx.store.learnerItems.where('userId', userId)).length > 0
    || (await ctx.store.encounters.where('userId', userId)).length > 0;
  const hasEvents = (await ctx.store.events.where('userId', userId)).length > 0;
  if (!hasState && !hasEvents) {
    await ctx.store.meta.put({ id: policyMetaId(userId), value: POLICY_VERSION, updatedAt: ctx.clock() });
    return false;
  }
  await rebuild(userId); // stamps the meta row
  return true;
}

/**
 * Stamp the current policy on the FIRST write of derived state for a learner who has no stamp and no derived state.
 * Derived state that exists without a stamp is legacy data: it stays unstamped so `ensureCurrent` rebuilds it.
 * `checked` remembers users already looked at in this process (one meta read per user, not per event).
 */
export async function stampIfFresh(ctx: Ctx, userId: string, checked: Set<string>): Promise<void> {
  if (checked.has(userId)) return;
  checked.add(userId);
  if (await ctx.store.meta.get(policyMetaId(userId))) return;
  const hasState = (await ctx.store.learnerItems.where('userId', userId)).length > 0
    || (await ctx.store.encounters.where('userId', userId)).length > 0;
  if (hasState) return;
  await ctx.store.meta.put({ id: policyMetaId(userId), value: POLICY_VERSION, updatedAt: ctx.clock() });
}
