/**
 * GoTell → GoLearn: what the learner is trying, and failing, to SAY.
 *
 * GoTell records, on each practice attempt, the items he has met in reading for the ideas he could not produce
 * (`gapItemIds`). While a meaning is not yet said on his own, those items are "productive gaps". GoLearn uses them for ONE
 * modest thing: a text that contains them in natural context is worth a little more as reinforcement (rank.ts). It never
 * turns them into a drill, never changes an item's receptive state, and forgets them once he says the meaning on his own
 * or after RANKING.productiveWindowDays.
 */
import type { TellAttemptSubmitted } from '../core';
import { RANKING } from './policy';
import type { Ctx } from './state';

export async function productiveGaps(ctx: Pick<Ctx, 'bus' | 'clock'>, userId: string): Promise<Set<string>> {
  const since = new Date(Date.parse(ctx.clock()) - RANKING.productiveWindowDays * 86_400_000).toISOString();
  const events = (await ctx.bus.history({ userId, types: ['TellAttemptSubmitted'], since })) as TellAttemptSubmitted[];
  const byGoal = new Map<string, Set<string>>();
  for (const e of [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))) {
    if (e.userId !== userId) continue;
    const r = e.record;
    if (r.outcome === 'success' && r.tier === 'none') { byGoal.delete(r.goalId); continue; }
    if (r.gapItemIds.length === 0) continue;
    const set = byGoal.get(r.goalId) ?? new Set<string>();
    r.gapItemIds.forEach((id) => set.add(id));
    byGoal.set(r.goalId, set);
  }
  return new Set([...byGoal.values()].flatMap((s) => [...s]));
}
