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
import { ids, itemKindOf } from '../core';
import { AnalysisCache } from './analysis';
import { LEMMA_MIN_CONFIDENCE } from './policy';
import type { Ctx } from './state';
import { cmp } from './util';

/** Which spelling a token found under another spelling is written in (the written surface, today's spelling, the spelling norm). */
type Spelling = { tokenId: string; written: string; modern: string; period: string };
/** `spellings` is set only on a result that holds a token found through its older spelling; an ordinary result has exactly three fields. */
type Hit = { sentenceId: string; textId: string; tokenIds: string[]; spellings?: Spelling[] };

/** How many of a form's own tokens are asked which lemma the form is (the search never walks all of them). */
const FORM_LEMMA_SAMPLE = 50;

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
  const spellingsBy = new Map<string, Spelling[]>();
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
    const formTokens = (await ctx.store.tokens.where('formId', q.itemId)).filter((t) => t.isWord && t.lang === q.lang);
    for (const t of formTokens) add(t.sentenceId, t.textId, [t.id]);
    // The same word in another spelling: "dass" also finds "daß". Never a scan of the analyses: the form's own tokens say which lemma(s)
    // it is, and only that lemma's occurrences are looked through for an analysis that relates its older spelling to this one.
    const cache = new AnalysisCache(ctx.store);
    const wanted = q.itemId.slice(`form:${q.lang}:`.length);
    const norm = normalizerOf(ctx, q.lang);
    const lemmas = new Set<string>();
    for (const t of [...formTokens].sort((x, y) => cmp(x.id, y.id)).slice(0, FORM_LEMMA_SAMPLE)) {
      const l = await cache.lemmaIdOf(t.id);
      if (l) lemmas.add(l);
    }
    if (lemmas.size === 0) for (const l of lemmasOfWrittenForm(ctx, q.lang, wanted)) lemmas.add(l); // no token has the form: ask the adapter
    for (const lemmaId of lemmas) {
      const related = (await ctx.store.analyses.where('lemmaId', lemmaId)).filter((r) => r.orthography && norm(r.orthography.modern) === wanted);
      const tokenIds = [...new Set(related.map((r) => r.tokenId))].sort();
      for (let i = 0; i < tokenIds.length; i += 400) {
        for (const t of await ctx.store.tokens.getMany(tokenIds.slice(i, i + 400))) {
          if (!t || !t.isWord || t.lang !== q.lang || t.formId === q.itemId || (only && !only.has(t.textId))) continue;
          const a = await cache.resolve(t.id); // the analysis on show, not any stored row
          if (!a?.orthography || norm(a.orthography.modern) !== wanted) continue;
          add(t.sentenceId, t.textId, [t.id]);
          const list = spellingsBy.get(t.sentenceId) ?? spellingsBy.set(t.sentenceId, []).get(t.sentenceId)!;
          if (!list.some((s) => s.tokenId === t.id)) list.push({ tokenId: t.id, written: t.surface, modern: a.orthography.modern, period: a.orthography.period });
        }
      }
    }
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
    .map(({ sentenceId, textId, tokenIds }) => ({ sentenceId, textId, tokenIds, ...(spellingsBy.has(sentenceId) ? { spellings: spellingsBy.get(sentenceId)! } : {}) }));
}

/** The adapter's own normalization of a written form (NFC + lowercase when it cannot be asked). */
function normalizerOf(ctx: Ctx, lang: LanguageCode): (s: string) => string {
  try {
    const adapter = ctx.adapters.get(lang);
    return (s) => adapter.normalize(s);
  } catch {
    return (s) => s.normalize('NFC').toLowerCase();
  }
}

/** The lemma items an adapter reads in a written form (confidence of at least LEMMA_MIN_CONFIDENCE, as everywhere else). */
function lemmasOfWrittenForm(ctx: Ctx, lang: LanguageCode, form: string): string[] {
  try {
    const [analysed] = ctx.adapters.get(lang).analyze([{ surface: form, start: 0, end: form.length, isWord: true, normalized: form }]);
    const out: string[] = [];
    for (const c of analysed?.candidates ?? []) if (c.lemma && c.confidence >= LEMMA_MIN_CONFIDENCE) out.push(ids.lemma(lang, c.lemma, c.pos));
    return out;
  } catch {
    return []; // an adapter that cannot read the form simply gives no link
  }
}
