/**
 * Reading progress, read from the event log. Five notions are kept apart (see `ReadingProgress`):
 *
 *   displayed / previewed  `TextViewed` (any mode)          counts NOTHING
 *   reading exposure       `SentenceViewed`                 `sentencesSeen` — live sentences with a real view
 *   explicit completion    `TextCompleted`                  `finishedAt` — never inferred, however many sentences were seen
 *   reported understanding `ComprehensionReported` 'all'    `sentencesUnderstood` — live sentences, no sentence-level help
 *                                                            (explanation / English rescue) in the sitting of the report
 *   estimated familiarity  item-level estimate              never progress
 *
 * A report never fabricates a view: "Understood" on a sentence the learner never dwelt on still demonstrates its items
 * (fold.ts) and counts as understood here, but `sentencesSeen` only counts `SentenceViewed`. Sentence order / membership
 * always comes from the LIVE (not retired) sentences of the CURRENT content version, never from ids.
 */
import type { DomainEvent, LanguageCode, ReadingProgress } from '../core';
import { liveSentences } from './coverage';
import { FOLD_TYPES } from './fold';
import { assignSittings } from './sitting';
import type { Ctx, StoredEncounter } from './state';

export type Degree = 'all' | 'most' | 'some' | 'little';

export interface TextActivity {
  /** sentence id → sittings in which it was really viewed (a `SentenceViewed`; reports never add to this) */
  viewed: Map<string, Set<string>>;
  /** sentence ids reported understood ('all', reading) in a sitting without sentence-level help */
  understood: Set<string>;
  /** latest explicit TextCompleted */
  finishedAt?: string;
  /** latest text-scope reading report */
  report?: { degree: Degree; at: string };
}

export interface Progress {
  /** live sentences with a real reading exposure */
  seen: number;
  /** live sentences reported understood without sentence-level help */
  understood: number;
  /** distinct sittings in which live sentences of the text were seen */
  sittings: number;
  /** explicit completion only */
  finishedAt?: string;
}

const EVENT_TYPES = [...FOLD_TYPES, 'TextCompleted'] as const;

/** Per-text activity of one learner (optionally one language or one text), from the event log. */
export async function activityByText(ctx: Ctx, userId: string, filter?: { lang?: LanguageCode; textId?: string }): Promise<Map<string, TextActivity>> {
  const events: DomainEvent[] = await ctx.bus.history({ userId, types: [...EVENT_TYPES] });
  // Sittings are derived from ALL of the learner's evidence events, whatever the filter (a language filter must not split one).
  const sittings = assignSittings(events.filter((e) => e.type !== 'TextCompleted'));
  const out = new Map<string, TextActivity>();
  const get = (textId: string) => {
    let a = out.get(textId);
    if (!a) out.set(textId, (a = { viewed: new Map(), understood: new Set(), }));
    return a;
  };
  // sentence-level help per sitting: `${sitting}\n${sentenceId}`
  const rescued = new Set<string>();
  const key = (sitting: string, sentenceId: string) => `${sitting}\n${sentenceId}`;
  const reports: Array<{ textId: string; sentenceIds: string[]; sitting: string }> = [];

  for (const e of events) {
    if (e.type === 'SentenceExplanationRevealed') rescued.add(key(sittings.get(e.id) ?? '', e.sentenceId));
    else if (e.type === 'EnglishRescueRevealed') for (const sid of e.sentenceIds) rescued.add(key(sittings.get(e.id) ?? '', sid));
    if (filter?.lang && e.lang !== filter.lang) continue;
    if (e.type === 'SentenceViewed') {
      if (filter?.textId && e.textId !== filter.textId) continue;
      const a = get(e.textId);
      let set = a.viewed.get(e.sentenceId);
      if (!set) a.viewed.set(e.sentenceId, (set = new Set()));
      set.add(sittings.get(e.id) ?? '');
    } else if (e.type === 'TextCompleted') {
      if (filter?.textId && e.textId !== filter.textId) continue;
      const a = get(e.textId);
      if (!a.finishedAt || e.at > a.finishedAt) a.finishedAt = e.at;
    } else if (e.type === 'ComprehensionReported' && e.modality === 'reading') {
      if (filter?.textId && e.textId !== filter.textId) continue;
      const a = get(e.textId);
      if (e.degree === 'all') reports.push({ textId: e.textId, sentenceIds: e.sentenceIds, sitting: sittings.get(e.id) ?? '' });
      if (e.scope === 'text') a.report = { degree: e.degree, at: e.at };
    }
  }
  for (const r of reports) {
    const a = get(r.textId);
    for (const sid of r.sentenceIds) if (!rescued.has(key(r.sitting, sid))) a.understood.add(sid);
  }
  return out;
}

/** Progress numbers of one text from its activity, over the LIVE sentences only. `finishedAt` is the explicit completion, nothing else. */
export function progressOf(act: TextActivity | undefined, live: Array<{ id: string }>): Progress {
  let seen = 0;
  let understood = 0;
  const sittings = new Set<string>();
  for (const s of live) {
    const v = act?.viewed.get(s.id);
    if (v && v.size > 0) { seen += 1; for (const k of v) sittings.add(k); }
    if (act?.understood.has(s.id)) understood += 1;
  }
  return { seen, understood, sittings: sittings.size, ...(act?.finishedAt ? { finishedAt: act.finishedAt } : {}) };
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
    textId, contentVersion: text.contentVersion, sentencesTotal: live.length,
    sentencesSeen: p.seen, sentencesUnderstood: p.understood,
    ...(p.finishedAt ? { finishedAt: p.finishedAt } : {}),
    ...(act?.report ? { reportedComprehension: act.report.degree } : {}),
    sittings: p.sittings,
    listenedSentences: listened.size,
  };
}
