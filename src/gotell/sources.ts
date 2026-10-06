/**
 * Where did the learner actually meet this language? `store.encounters` (written by GoLearn from the event log)
 * -> the sentence -> the text. Every suggestion carries these, so "you have met this" is never an assertion
 * without a sentence to point at. No source means the item is new to the learner.
 */
import type { AppStore, Encounter, Sentence, SuggestionSource, Text } from '../core';

const SURFACE_RANK: Record<Encounter['surface'], number> = { corpus: 0, scripture: 0, listen: 1, testimony: 2 };

export interface SourceFinder {
  /** Up to `limit` distinct sentences where `userId` met `itemId`, the learner's own testimony last. */
  forItem(userId: string, itemId: string, limit?: number): Promise<SuggestionSource[]>;
}

/** A finder with per-call caches: create one per analysis / intent request, never keep it (learner state moves on). */
export function createSourceFinder(store: AppStore): SourceFinder {
  const encCache = new Map<string, Promise<Encounter[]>>();
  const sentCache = new Map<string, Promise<Sentence | undefined>>();
  const textCache = new Map<string, Promise<Text | undefined>>();
  const encounters = (userId: string, itemId: string) => {
    const k = `${userId}|${itemId}`;
    let p = encCache.get(k);
    if (!p) { p = store.encounters.where('itemId', itemId).then((rows) => rows.filter((r) => r.userId === userId)); encCache.set(k, p); }
    return p;
  };
  const sentence = (id: string) => { let p = sentCache.get(id); if (!p) { p = store.sentences.get(id); sentCache.set(id, p); } return p; };
  const text = (id: string) => { let p = textCache.get(id); if (!p) { p = store.texts.get(id); textCache.set(id, p); } return p; };

  return {
    async forItem(userId, itemId, limit = 2) {
      const rows = [...(await encounters(userId, itemId))].sort((a, b) => SURFACE_RANK[a.surface] - SURFACE_RANK[b.surface] || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      const out: SuggestionSource[] = [];
      const seen = new Set<string>();
      for (const r of rows) {
        if (out.length >= limit) break;
        if (seen.has(r.sentenceId)) continue;
        const [s, t] = await Promise.all([sentence(r.sentenceId), text(r.textId)]);
        if (!s || s.retiredInVersion !== undefined || !t || (t.listeningAssessmentId !== undefined || t.readingAssessmentId !== undefined)) continue;
        const corpus = await store.corpora.get(t.corpusId);
        const ownTestimony = t.kind === 'testimony' && t.corpusId === `testimony:${userId}`;
        if (((t.kind === 'testimony' || corpus?.kind === 'testimony') && !ownTestimony) || (!ownTestimony && t.published !== true)) continue;
        seen.add(r.sentenceId);
        out.push({ itemId, textId: t.id, textTitle: t.title, sentenceId: s.id, excerpt: s.text, surface: r.surface });
      }
      return out;
    },
  };
}

/** De-duplicate sources by sentence, keeping the first (caller orders by importance). */
export function mergeSources(groups: SuggestionSource[][], max = 6): SuggestionSource[] {
  const out: SuggestionSource[] = [];
  const seen = new Set<string>();
  for (const g of groups) for (const s of g) {
    if (seen.has(s.sentenceId) || out.length >= max) continue;
    seen.add(s.sentenceId);
    out.push(s);
  }
  return out;
}
