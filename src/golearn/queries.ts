/** Read side: item knowledge, known lists, analysis resolution / override, token and sentence support. */
import type {
  AssistanceLevel, Encounter, ItemKnowledge, LanguageCode, LearnerItemState, Lemma, PartOfSpeech, SentenceSupport,
  TokenAnalysis, TokenSupport,
} from '../core';
import { itemKindOf, ids } from '../core';
import { publicRow } from './agg';
import { AnalysisCache, morphologyLine, pickAnalysis } from './analysis';
import { classifyTokens } from './coverage';
import { COMPETING_MARGIN, UNCERTAIN_BELOW, levelAtLeast, productionKindOf } from './policy';
import type { Ctx } from './state';
import { byAtThenId, effectiveEstimate, effectiveReadingLevel, emptyDimension } from './state';

export type ItemRef = { itemId?: string; surface?: string; lang: LanguageCode };

/** A row as seen by readers: the reading dimension reflects the manual-mark floor/cap (and an unknown mark silences the estimate). */
function displayRow(row: LearnerItemState): LearnerItemState {
  const level = effectiveReadingLevel(row);
  const estimatedFamiliar = effectiveEstimate(row);
  return level === row.reading.level && estimatedFamiliar === row.reading.estimatedFamiliar
    ? row : { ...row, reading: { ...row.reading, level, estimatedFamiliar } };
}

export async function queryItems(ctx: Ctx, userId: string, refs: ItemRef[]): Promise<ItemKnowledge[]> {
  const memo: { forms?: Map<LanguageCode, Array<{ id: string; normalized: string }>> } = {};
  const out: ItemKnowledge[] = [];
  for (const r of refs) out.push(await queryOne(ctx, userId, r, memo));
  return out;
}

async function seenForms(ctx: Ctx, userId: string, lang: LanguageCode, memo: { forms?: Map<LanguageCode, Array<{ id: string; normalized: string }>> }) {
  memo.forms ??= new Map();
  let list = memo.forms.get(lang);
  if (!list) {
    const prefix = `form:${lang}:`;
    list = (await ctx.store.learnerItems.where('userId', userId))
      .filter((r) => r.lang === lang && r.itemKind === 'form' && r.encounterCount > 0)
      .map((r) => ({ id: r.itemId, normalized: r.itemId.slice(prefix.length) }));
    memo.forms.set(lang, list);
  }
  return list;
}

async function queryOne(
  ctx: Ctx, userId: string, ref: ItemRef, memo: { forms?: Map<LanguageCode, Array<{ id: string; normalized: string }>> },
): Promise<ItemKnowledge> {
  let itemId = ref.itemId;
  if (!itemId) {
    if (ref.surface === undefined) throw new Error('queryItem needs an itemId or a surface');
    itemId = ids.form(ref.lang, ctx.adapters.get(ref.lang).normalize(ref.surface));
  }
  const itemKind = itemKindOf(itemId);
  const stored = await ctx.store.learnerItems.get(ids.learnerItem(userId, itemId));
  const row = stored ? displayRow(stored) : undefined;
  const exactFormSeen = (stored?.encounterCount ?? 0) > 0;

  const relatedSeen = await isRelatedSeen(ctx, userId, ref.lang, itemId, itemKind, memo);

  const productionEvidence = { independent: 0, selfRepaired: 0, assisted: 0, copied: 0 };
  if (stored && (stored.writing.evidence > 0 || stored.speaking.evidence > 0)) {
    const encs = (await ctx.store.encounters.where('itemId', itemId))
      .filter((e) => e.userId === userId && (e.modality === 'writing' || e.modality === 'speaking'));
    for (const e of encs) {
      const k = e.productionKind ?? productionKindOf(e.assistance);
      if (k === 'independent') productionEvidence.independent++;
      else if (k === 'self-repaired') productionEvidence.selfRepaired++;
      else if (k === 'assisted') productionEvidence.assisted++;
      else productionEvidence.copied++;
    }
  }

  // Counts by evidence kind over reading + listening. An unassisted encounter is an exposure or a demonstration.
  const rd = row?.reading, ls = row?.listening;
  const exposureCount = (rd?.exposures ?? 0) + (ls?.exposures ?? 0);
  const assistedCount = (rd?.assisted ?? 0) + (ls?.assisted ?? 0);
  const demonstratedCount = (rd ? rd.unassisted - rd.exposures : 0) + (ls ? ls.unassisted - ls.exposures : 0);

  return {
    itemId, itemKind, exists: !!row, encounterCount: row?.encounterCount ?? 0, textIds: row?.textIds ?? [],
    ...(row?.lastSeenAt ? { lastSeenAt: row.lastSeenAt } : {}),
    reading: row?.reading ?? emptyDimension(), listening: row?.listening ?? emptyDimension(),
    writing: row?.writing ?? emptyDimension(), speaking: row?.speaking ?? emptyDimension(),
    exactFormSeen, relatedSeen, exposureCount, assistedCount, demonstratedCount, productionEvidence,
  };
}

/**
 * Related = another form of the same lemma (via token → analysis → lemma tables) or an inflection /
 * compound component according to `adapter.relate`, already met by this learner.
 */
async function isRelatedSeen(
  ctx: Ctx, userId: string, lang: LanguageCode, itemId: string, itemKind: string,
  memo: { forms?: Map<LanguageCode, Array<{ id: string; normalized: string }>> },
): Promise<boolean> {
  if (itemKind === 'phrase' || itemKind === 'pattern' || itemKind === 'orth') return false;
  const cache = new AnalysisCache(ctx.store);
  const lemmaIds = new Set<string>();
  if (itemKind === 'lemma') lemmaIds.add(itemId);
  else {
    const toks = (await ctx.store.tokens.where('formId', itemId)).slice(0, 50);
    await cache.prefetch(toks.map((t) => t.id));
    for (const t of toks) { const l = await cache.lemmaIdOf(t.id); if (l) lemmaIds.add(l); }
  }
  const siblings = new Set<string>();
  for (const lemmaId of lemmaIds) {
    const rows = (await ctx.store.analyses.where('lemmaId', lemmaId)).slice(0, 500);
    const toks = await ctx.store.tokens.getMany(rows.map((r) => r.tokenId));
    for (const t of toks) if (t && t.formId !== itemId) siblings.add(t.formId);
  }
  if (siblings.size > 0) {
    const states = await ctx.store.learnerItems.getMany([...siblings].map((f) => ids.learnerItem(userId, f)));
    if (states.some((s) => s && s.encounterCount > 0)) return true;
  }
  if (itemKind !== 'form') return false;
  // Fallback for forms the corpus has never tokenized (e.g. learner-typed): ask the adapter.
  const adapter = ctx.adapters.get(lang);
  const normalized = itemId.slice(`form:${lang}:`.length);
  for (const f of await seenForms(ctx, userId, lang, memo)) {
    if (f.id === itemId) continue;
    if (adapter.relate(normalized, f.normalized) !== 'none') return true;
  }
  return false;
}

export async function listKnown(
  ctx: Ctx, userId: string, lang: LanguageCode, modality: 'reading' | 'listening' | 'writing', minLevel: string,
): Promise<LearnerItemState[]> {
  levelAtLeast('unseen', minLevel); // throws on an unknown level
  // Writing-system (`orth`) items are not vocabulary: a consonant class is not a known word.
  const rows = (await ctx.store.learnerItems.where('userId', userId)).filter((r) => r.lang === lang && r.itemKind !== 'orth');
  return rows
    .map((r) => publicRow(displayRow(r)))
    .filter((r) => levelAtLeast(r[modality].level, minLevel) && r[modality].level !== 'unseen')
    .sort((a, b) => b[modality].evidence - a[modality].evidence || (a.itemId < b.itemId ? -1 : 1));
}

export async function resolveAnalysis(ctx: Ctx, tokenId: string): Promise<TokenAnalysis | undefined> {
  return pickAnalysis(await ctx.store.analyses.where('tokenId', tokenId));
}

function parseLemmaId(lang: LanguageCode, lemmaId: string): Lemma {
  const rest = lemmaId.slice(`lemma:${lang}:`.length);
  const m = /^(.*):([A-Z]+)$/.exec(rest);
  return m ? { id: lemmaId, lang, lemma: m[1], pos: m[2] as PartOfSpeech } : { id: lemmaId, lang, lemma: rest };
}

/**
 * Adds a human row (never deletes or edits prior rows). Encounters are untouched; `rebuild(userId)` is how an
 * override is applied retroactively to a learner's lemma evidence.
 */
export async function overrideAnalysis(
  ctx: Ctx, tokenId: string, patch: Partial<Pick<TokenAnalysis, 'lemmaId' | 'pos' | 'morph' | 'notes'>>, who: string,
): Promise<TokenAnalysis> {
  const token = await ctx.store.tokens.get(tokenId);
  if (!token) throw new Error(`unknown token: ${tokenId}`);
  const rows = await ctx.store.analyses.where('tokenId', tokenId);
  const resolved = pickAnalysis(rows);
  const analyzer = `human:${who}`;
  const n = rows.filter((r) => r.analyzer === analyzer).length;
  const row: TokenAnalysis = {
    id: ids.analysis(tokenId, analyzer, n), tokenId, lang: token.lang,
    morph: patch.morph ?? resolved?.morph ?? {}, confidence: 1, provenance: 'human', origin: 'reviewed', sourceId: analyzer, analyzer, createdAt: ctx.clock(),
  };
  const lemmaId = patch.lemmaId ?? resolved?.lemmaId;
  const pos = patch.pos ?? resolved?.pos;
  const notes = patch.notes ?? resolved?.notes;
  if (lemmaId) row.lemmaId = lemmaId;
  if (pos) row.pos = pos;
  if (notes) row.notes = notes;
  if (resolved) row.supersedes = resolved.id;
  if (lemmaId && !(await ctx.store.lemmas.get(lemmaId))) await ctx.store.lemmas.put(parseLemmaId(token.lang, lemmaId));
  await ctx.store.analyses.put(row);
  return row;
}

/** Every stored analysis of a token, newest first, each marked current (what `resolveAnalysis` returns) or superseded. Deletes nothing. */
export async function analysisHistory(ctx: Ctx, tokenId: string): Promise<Array<{ analysis: TokenAnalysis; status: 'current' | 'superseded' }>> {
  const rows = await ctx.store.analyses.where('tokenId', tokenId);
  const current = pickAnalysis(rows)?.id;
  return rows
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1))
    .map((analysis) => ({ analysis, status: analysis.id === current ? 'current' as const : 'superseded' as const }));
}

export async function tokenSupport(ctx: Ctx, userId: string, tokenId: string, level: AssistanceLevel): Promise<TokenSupport> {
  const token = await ctx.store.tokens.get(tokenId);
  if (!token) throw new Error(`unknown token: ${tokenId}`);
  const support: TokenSupport = { token, phrases: [], patterns: [], priorEncounters: [], knownExamples: [], uncertain: false };
  if (level < 1) return support;

  // A sentence a revision retired is history: its phrase and pattern occurrences (kept so a rebuild can recreate the evidence) are
  // never offered, and neither is it offered as an example.
  const own = await ctx.store.sentences.get(token.sentenceId);
  const ownLive = !own || own.retiredInVersion === undefined;
  const analysis = await resolveAnalysis(ctx, tokenId);
  const lemma = analysis?.lemmaId ? await ctx.store.lemmas.get(analysis.lemmaId) : undefined;
  support.uncertain = !analysis || analysis.confidence < UNCERTAIN_BELOW || (analysis.alternatives ?? []).some((alt) => alt.confidence > analysis.confidence - COMPETING_MARGIN);
  if (lemma?.gloss) support.gloss = lemma.gloss; // level 1: gloss only

  if (level >= 2) {
    const occs = !ownLive ? [] : (await ctx.store.phraseOccurrences.where('sentenceId', token.sentenceId)).filter((o) => o.tokenIds.includes(tokenId));
    for (const occurrence of occs) {
      const phrase = await ctx.store.phrases.get(occurrence.phraseId);
      if (phrase) support.phrases.push({ phrase, occurrence });
    }
  }

  if (level >= 3) {
    if (analysis) support.analysis = analysis;
    if (lemma) support.lemma = lemma;
    const line = morphologyLine(analysis);
    if (line) support.morphologyLine = line;
    const pocc = !ownLive ? [] : (await ctx.store.patternOccurrences.where('sentenceId', token.sentenceId)).filter((o) => o.tokenIds.includes(tokenId));
    for (const o of pocc) {
      const p = await ctx.store.patterns.get(o.patternId);
      if (p && !support.patterns.some((x) => x.id === p.id)) support.patterns.push(p);
    }

    const itemIds = [token.formId, ...(lemma ? [lemma.id] : [])];
    const prior: Encounter[] = [];
    const taken = new Set<string>();
    for (const itemId of itemIds) {
      const encs = (await ctx.store.encounters.where('itemId', itemId))
        .filter((e) => e.userId === userId && (e.modality === 'reading' || e.modality === 'listening') && e.sentenceId !== token.sentenceId)
        .sort(byAtThenId);
      for (const e of encs) {
        const dupKey = `${e.sentenceId}|${e.modality}`;
        if (taken.has(dupKey)) continue;
        taken.add(dupKey);
        prior.push(e);
      }
    }
    support.priorEncounters = prior.sort(byAtThenId);
    const exampleItem = lemma?.id ?? token.formId;
    const examples: string[] = [];
    const liveSentence = new Map<string, boolean>();
    for (const e of (await ctx.store.encounters.where('itemId', exampleItem))
      .filter((x) => x.userId === userId && x.modality === 'reading' && x.sentenceId !== token.sentenceId)
      .sort(byAtThenId).reverse()) {
      if (examples.includes(e.sentenceId)) continue;
      let live = liveSentence.get(e.sentenceId);
      if (live === undefined) {
        const s = await ctx.store.sentences.get(e.sentenceId);
        liveSentence.set(e.sentenceId, (live = !!s && s.retiredInVersion === undefined));
      }
      if (!live) continue; // an example is a sentence of the current text
      examples.push(e.sentenceId);
      if (examples.length >= 10) break;
    }
    support.knownExamples = examples;
  }
  return support;
}

export async function sentenceSupport(ctx: Ctx, userId: string, sentenceId: string, opts?: { withRescue?: boolean }): Promise<SentenceSupport> {
  const sentence = await ctx.store.sentences.get(sentenceId);
  if (!sentence) throw new Error(`unknown sentence: ${sentenceId}`);
  const tokens = (await ctx.store.tokens.where('sentenceId', sentenceId)).sort((a, b) => a.index - b.index);
  const classified = await classifyTokens(ctx, userId, tokens.filter((t) => t.isWord), new AnalysisCache(ctx.store));
  const highlight: SentenceSupport['highlight'] = {};
  // The contract's highlight has three states; a "likely familiar" estimate is shown as partial, never as known.
  for (const c of classified) highlight[c.token.id] = c.cls === 'estimated' ? 'partial' : c.cls;
  const out: SentenceSupport = { sentence, tokens, highlight };
  // TODO(contract): there is no table for authored sentence explanations, so `explanation` is never set.
  if (opts?.withRescue) {
    const rescue = await ctx.store.rescues.get(ids.rescue(sentenceId));
    if (rescue) out.rescue = rescue;
  }
  return out;
}
