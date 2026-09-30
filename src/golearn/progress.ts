/**
 * Reading progress: what was on screen and finished, read from the event log. Completion is about sentences seen,
 * never about vocabulary (that is coverage). Sentence order / membership always comes from `Sentence.index` and the
 * live (not retired) sentences of the text, never from ids.
 */
import type { DomainEvent, LanguageCode, ReadingProgress } from '../core';
import { liveSentences } from './coverage';
import type { Ctx, StoredEncounter } from './state';

export type Degree = 'all' | 'most' | 'some' | 'little';

export interface TextActivity {
  /** sentence id → time it was first seen (view, or a report that it was understood) */
  viewed: Map<string, string>;
  /** latest TextCompleted */
  completedAt?: string;
  /** latest text-scope reading report */
  report?: { degree: Degree; at: string };
}

/** Per-text activity of one learner (optionally one language or one text), from the event log. */
export async function activityByText(ctx: Ctx, userId: string, filter?: { lang?: LanguageCode; textId?: string }): Promise<Map<string, TextActivity>> {
  const events: DomainEvent[] = await ctx.bus.history({ userId, types: ['SentenceViewed', 'TextCompleted', 'ComprehensionReported'] });
  const out = new Map<string, TextActivity>();
  const get = (textId: string) => {
    let a = out.get(textId);
    if (!a) out.set(textId, (a = { viewed: new Map() }));
    return a;
  };
  for (const e of events) {
    if (filter?.lang && e.lang !== filter.lang) continue;
    if (e.type === 'SentenceViewed') {
      if (filter?.textId && e.textId !== filter.textId) continue;
      const a = get(e.textId);
      if (!a.viewed.has(e.sentenceId)) a.viewed.set(e.sentenceId, e.at);
    } else if (e.type === 'TextCompleted') {
      if (filter?.textId && e.textId !== filter.textId) continue;
      const a = get(e.textId);
      if (!a.completedAt || e.at > a.completedAt) a.completedAt = e.at;
    } else if (e.type === 'ComprehensionReported' && e.modality === 'reading') {
      if (filter?.textId && e.textId !== filter.textId) continue;
      const a = get(e.textId);
      if (e.degree === 'all') for (const sid of e.sentenceIds) if (!a.viewed.has(sid)) a.viewed.set(sid, e.at);
      if (e.scope === 'text') a.report = { degree: e.degree, at: e.at };
    }
  }
  return out;
}

/** The number of live sentences viewed and the completion time (explicit TextCompleted, else when the last live sentence was first seen). */
export function progressOf(act: TextActivity | undefined, live: Array<{ id: string }>): { viewed: number; completedAt?: string } {
  const times = live.map((s) => act?.viewed.get(s.id)).filter((t): t is string => !!t);
  const viewed = times.length;
  if (act?.completedAt) return { viewed, completedAt: act.completedAt };
  if (live.length > 0 && viewed === live.length) return { viewed, completedAt: [...times].sort().at(-1) };
  return { viewed };
}

export async function readingProgress(ctx: Ctx, userId: string, textId: string): Promise<ReadingProgress> {
  const text = await ctx.store.texts.get(textId);
  if (!text) throw new Error(`unknown text: ${textId}`);
  const live = await liveSentences(ctx, textId);
  const act = (await activityByText(ctx, userId, { textId })).get(textId);
  const p = progressOf(act, live);
  const liveIds = new Set(live.map((s) => s.id));
  const listened = new Set<string>();
  for (const e of (await ctx.store.encounters.where('textId', textId)) as StoredEncounter[]) {
    if (e.userId === userId && e.modality === 'listening' && liveIds.has(e.sentenceId)) listened.add(e.sentenceId);
  }
  return {
    textId, sentencesTotal: live.length, sentencesViewed: p.viewed,
    ...(p.completedAt ? { completedAt: p.completedAt } : {}),
    ...(act?.report ? { reportedComprehension: act.report.degree } : {}),
    listenedSentences: listened.size,
  };
}
