/**
 * findOccurrences — live, visible sentences of the store that contain an item: search, and natural examples of a word.
 *
 *   form     the tokens of that form (token index `formId`)
 *   lemma    the tokens whose resolved analysis credits that lemma (analysis index `lemmaId`, then the tokens by id)
 *   phrase   the phrase's occurrences (occurrence index `phraseId`)
 *   pattern  the construction's occurrences (occurrence index `patternId`)
 *   orth     writing-system items are not located in a text: none
 * LIVE: a sentence a revision retired (`retiredInVersion`) is history and never returned. VISIBLE: the text is published, unless
 * `includeUnpublished` (preview). The walk goes through the matches in text-id order (then sentence id) and stops at `limit` (default 20, at most 200),
 * checking sentences and texts in batches; the page it returns is in text-id, then reading order. A very common item therefore costs the
 * index read plus batches up to the limit, not the corpus.
 */
import type { LanguageCode, Sentence, Text } from '../core';
import { itemKindOf } from '../core';
import { AnalysisCache } from './analysis';
import type { Ctx } from './state';

type Hit = { sentenceId: string; textId: string; tokenIds: string[] };

export async function findOccurrences(
  ctx: Ctx, q: { lang: LanguageCode; itemId: string; textIds?: string[]; includeUnpublished?: boolean; limit?: number },
): Promise<Hit[]> {
  const limit = Math.min(200, Math.max(0, q.limit ?? 20));
  if (limit === 0) return [];
  const kind = itemKindOf(q.itemId);
  if (kind === 'orth') return [];
  const only = q.textIds ? new Set(q.textIds) : undefined;

  // candidates: (sentence, tokens) pairs from the index of the item's kind
  const bySentence = new Map<string, { textId: string; tokenIds: string[] }>();
  const add = (sentenceId: string, textId: string, tokenIds: string[]) => {
    if (only && !only.has(textId)) return;
    const cur = bySentence.get(sentenceId);
    if (cur) { for (const t of tokenIds) if (!cur.tokenIds.includes(t)) cur.tokenIds.push(t); } else bySentence.set(sentenceId, { textId, tokenIds: [...tokenIds] });
  };
  if (kind === 'phrase') {
    for (const o of await ctx.store.phraseOccurrences.where('phraseId', q.itemId)) if (o.lang === q.lang) add(o.sentenceId, o.textId, o.tokenIds);
  } else if (kind === 'pattern') {
    for (const o of await ctx.store.patternOccurrences.where('patternId', q.itemId)) if (o.lang === q.lang) add(o.sentenceId, o.textId, o.tokenIds);
  } else if (kind === 'form') {
    for (const t of await ctx.store.tokens.where('formId', q.itemId)) if (t.isWord && t.lang === q.lang) add(t.sentenceId, t.textId, [t.id]);
  } else {
    const cache = new AnalysisCache(ctx.store);
    const rows = await ctx.store.analyses.where('lemmaId', q.itemId);
    const tokenIds = [...new Set(rows.map((r) => r.tokenId))].sort();
    for (let i = 0; i < tokenIds.length; i += 400) {
      const toks = await ctx.store.tokens.getMany(tokenIds.slice(i, i + 400));
      for (const t of toks) {
        if (!t || !t.isWord || t.lang !== q.lang || (only && !only.has(t.textId))) continue;
        if ((await cache.lemmaIdOf(t.id)) === q.itemId) add(t.sentenceId, t.textId, [t.id]);
      }
    }
  }

  // live and visible, in text then reading order, stopping at the limit
  const ordered = [...bySentence.entries()].sort((a, b) => (a[1].textId < b[1].textId ? -1 : a[1].textId > b[1].textId ? 1 : a[0] < b[0] ? -1 : 1));
  const texts = new Map<string, Text | undefined>();
  const out: Array<Hit & { index: number }> = [];
  for (let i = 0; i < ordered.length && out.length < limit; i += 200) {
    const batch = ordered.slice(i, i + 200);
    const sentences = (await ctx.store.sentences.getMany(batch.map(([id]) => id))) as Array<Sentence | undefined>;
    const need = [...new Set(batch.map(([, v]) => v.textId))].filter((t) => !texts.has(t));
    const rows = await ctx.store.texts.getMany(need);
    need.forEach((t, j) => texts.set(t, rows[j]));
    batch.forEach(([sentenceId, v], j) => {
      const s = sentences[j];
      const text = texts.get(v.textId);
      if (!s || s.retiredInVersion !== undefined || !text || (!text.published && !q.includeUnpublished)) return;
      out.push({ sentenceId, textId: v.textId, tokenIds: v.tokenIds, index: s.index });
    });
  }
  return out
    .sort((a, b) => (a.textId < b.textId ? -1 : a.textId > b.textId ? 1 : a.index - b.index))
    .slice(0, limit)
    .map(({ sentenceId, textId, tokenIds }) => ({ sentenceId, textId, tokenIds }));
}
