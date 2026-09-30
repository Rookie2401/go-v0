/**
 * Coverage, scripture readiness. Nothing here generates text: it only reads the store.
 *
 * A word token is
 *   known   — its form OR its credited lemma has (manual-mark-adjusted) reading level ≥ `recognized`
 *   partial — not known, but the form or lemma has been met (reading or listening)
 *   unseen  — otherwise
 * Bands (soft, lexical only): ≥0.95 comfortable · ≥0.88 productive-challenge · ≥0.75 difficult · else stretch.
 * expectedDifficulty (0..1) blends: 0.60 × lexical gap (scaled so 75 % known = 1.0), 0.15 × unknown phrases,
 * 0.10 × unfamiliar-pattern ratio, 0.15 × sentence length (6 words = 0, 20+ words = 1). It is advisory only.
 */
import type {
  ComfortBand, ItemKind, LearnerItemState, PatternOccurrence, PersonalizedCoverage, PhraseOccurrence, ScriptureReadiness,
  Sentence, Token,
} from '../core';
import { ids } from '../core';
import { AnalysisCache } from './analysis';
import { RECOGNIZED_EVIDENCE_REF, bandFor, levelAtLeast } from './policy';
import type { Ctx } from './state';
import { effectiveReadingLevel } from './state';

export type Cls = 'known' | 'partial' | 'unseen';

export interface Classified {
  token: Token;
  cls: Cls;
  lemmaId?: string;
  formState?: LearnerItemState;
  lemmaState?: LearnerItemState;
  listeningKnown: boolean;
}

const seen = (s?: LearnerItemState) => !!s && (s.reading.level !== 'unseen' || s.listening.level !== 'unseen');

export async function classifyTokens(ctx: Ctx, userId: string, tokens: Token[], cache: AnalysisCache): Promise<Classified[]> {
  await cache.prefetch(tokens.map((t) => t.id));
  const lemmaIds = await Promise.all(tokens.map((t) => cache.lemmaIdOf(t.id)));
  const wanted = new Set<string>();
  tokens.forEach((t, i) => { wanted.add(t.formId); const l = lemmaIds[i]; if (l) wanted.add(l); });
  const list = [...wanted];
  const rows = await ctx.store.learnerItems.getMany(list.map((i) => ids.learnerItem(userId, i)));
  const states = new Map<string, LearnerItemState>();
  list.forEach((id, i) => { const r = rows[i]; if (r) states.set(id, r); });

  return tokens.map((token, i) => {
    const lemmaId = lemmaIds[i];
    const formState = states.get(token.formId);
    const lemmaState = lemmaId ? states.get(lemmaId) : undefined;
    const known = levelAtLeast(effectiveReadingLevel(formState), 'recognized') || levelAtLeast(effectiveReadingLevel(lemmaState), 'recognized');
    const cls: Cls = known ? 'known' : seen(formState) || seen(lemmaState) ? 'partial' : 'unseen';
    const listeningKnown = levelAtLeast(formState?.listening.level ?? 'unseen', 'recognized') || levelAtLeast(lemmaState?.listening.level ?? 'unseen', 'recognized');
    return { token, cls, lemmaId, formState, lemmaState, listeningKnown };
  });
}

export interface TextAnalysis {
  coverage: PersonalizedCoverage;
  sentences: Sentence[];
  classified: Classified[];
  phrases: Array<{ occ: PhraseOccurrence; known: boolean; state?: LearnerItemState }>;
  patterns: Array<{ occ: PatternOccurrence; known: boolean }>;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export async function analyzeText(ctx: Ctx, userId: string, textId: string, sentenceIds?: string[]): Promise<TextAnalysis> {
  const text = await ctx.store.texts.get(textId);
  if (!text) throw new Error(`unknown text: ${textId}`);
  const only = sentenceIds ? new Set(sentenceIds) : undefined;
  const sentences = (await ctx.store.sentences.where('textId', textId)).filter((s) => !only || only.has(s.id)).sort((a, b) => a.index - b.index);
  const order = new Map(sentences.map((s, i) => [s.id, i]));
  const tokens = (await ctx.store.tokens.where('textId', textId))
    .filter((t) => t.isWord && order.has(t.sentenceId))
    .sort((a, b) => order.get(a.sentenceId)! - order.get(b.sentenceId)! || a.index - b.index);

  const cache = new AnalysisCache(ctx.store);
  const classified = await classifyTokens(ctx, userId, tokens, cache);

  const phraseOccs = (await ctx.store.phraseOccurrences.where('textId', textId)).filter((o) => order.has(o.sentenceId));
  const patternOccs = (await ctx.store.patternOccurrences.where('textId', textId)).filter((o) => order.has(o.sentenceId));
  const itemRows = async (occIds: string[]) => {
    const uniq = [...new Set(occIds)];
    const rows = await ctx.store.learnerItems.getMany(uniq.map((i) => ids.learnerItem(userId, i)));
    const m = new Map<string, LearnerItemState>();
    uniq.forEach((id, i) => { const r = rows[i]; if (r) m.set(id, r); });
    return m;
  };
  const phraseStates = await itemRows(phraseOccs.map((o) => o.phraseId));
  const patternStates = await itemRows(patternOccs.map((o) => o.patternId));
  const isKnown = (s?: LearnerItemState) => levelAtLeast(effectiveReadingLevel(s), 'recognized');
  const phrases = phraseOccs.map((occ) => ({ occ, state: phraseStates.get(occ.phraseId), known: isKnown(phraseStates.get(occ.phraseId)) }));
  const patterns = patternOccs.map((occ) => ({ occ, known: isKnown(patternStates.get(occ.patternId)) }));

  const n = classified.length;
  const count = (c: Cls) => classified.filter((x) => x.cls === c).length;
  const known = n ? count('known') / n : 1;
  const partial = n ? count('partial') / n : 0;
  const unseen = n ? count('unseen') / n : 0;

  const fresh = new Map<string, { surface: string; count: number }>();
  for (const c of classified) {
    if (c.cls !== 'unseen') continue;
    const cur = fresh.get(c.token.formId);
    if (cur) cur.count += 1; else fresh.set(c.token.formId, { surface: c.token.surface, count: 1 });
  }
  const newItems = [...fresh.entries()]
    .map(([itemId, v]) => ({ itemId, itemKind: 'form' as ItemKind, surface: v.surface, count: v.count }))
    .sort((a, b) => b.count - a.count || (a.surface < b.surface ? -1 : a.surface > b.surface ? 1 : 0) || (a.itemId < b.itemId ? -1 : 1));

  const knownPhraseCoverage = phrases.length ? phrases.filter((p) => p.known).length / phrases.length : 1;
  const unfamiliarPatterns = [...new Set(patterns.filter((p) => !p.known).map((p) => p.occ.patternId))].sort();
  const distinctPatterns = new Set(patterns.map((p) => p.occ.patternId)).size;
  const avgSentenceLength = sentences.length ? n / sentences.length : 0;

  const expectedDifficulty = Math.round(clamp01(
    0.6 * clamp01((1 - known) / 0.25)
    + 0.15 * (1 - knownPhraseCoverage)
    + 0.1 * (distinctPatterns ? unfamiliarPatterns.length / distinctPatterns : 0)
    + 0.15 * clamp01((avgSentenceLength - 6) / 14),
  ) * 1e4) / 1e4;

  const coverage: PersonalizedCoverage = {
    userId, textId, sentenceIds: sentences.map((s) => s.id), wordTokens: n,
    knownLexicalCoverage: known, partialCoverage: partial, unseenCoverage: unseen, newItems,
    knownPhraseCoverage, unfamiliarPatterns, avgSentenceLength,
    listeningCoverage: n ? classified.filter((c) => c.listeningKnown).length / n : 1,
    band: bandFor(known), expectedDifficulty,
  };
  return { coverage, sentences, classified, phrases, patterns };
}

const BAND_FACTOR: Record<ComfortBand, number> = { comfortable: 1, 'productive-challenge': 1, difficult: 0.6, stretch: 0.3 };

function parseLemmaSurface(lemmaId: string): string {
  const m = /^lemma:[^:]+:(.*?)(?::[A-Z]+)?$/.exec(lemmaId);
  return m ? m[1] : lemmaId;
}

const textOfToken = (tokenId: string) => tokenId.replace(/\/s\d+\/t\d+$/, '');

export async function scriptureReadiness(ctx: Ctx, userId: string, textId: string, sentenceIds?: string[]): Promise<ScriptureReadiness> {
  const a = await analyzeText(ctx, userId, textId, sentenceIds);
  const { classified } = a;
  const lvl = (s: LearnerItemState | undefined, dim: 'reading' | 'listening') =>
    dim === 'reading' ? effectiveReadingLevel(s) : (s?.listening.level ?? 'unseen');
  const better = (x: string, y: string) => (levelAtLeast(x, y) ? x : y);

  const familiar = new Map<string, { itemId: string; surface: string; readingLevel: string; listeningLevel: string }>();
  for (const c of classified) {
    if (c.cls !== 'known' || familiar.has(c.token.formId)) continue;
    familiar.set(c.token.formId, {
      itemId: c.token.formId, surface: c.token.surface,
      readingLevel: better(lvl(c.formState, 'reading'), lvl(c.lemmaState, 'reading')),
      listeningLevel: better(lvl(c.formState, 'listening'), lvl(c.lemmaState, 'listening')),
    });
  }

  const unfam = new Map<string, { itemId: string; surface: string; lemmaId?: string; lemmaKnown: boolean; count: number }>();
  for (const c of classified) {
    if (c.cls === 'known') continue;
    const cur = unfam.get(c.token.formId);
    if (cur) cur.count += 1;
    else unfam.set(c.token.formId, {
      itemId: c.token.formId, surface: c.token.surface, ...(c.lemmaId ? { lemmaId: c.lemmaId } : {}),
      lemmaKnown: levelAtLeast(effectiveReadingLevel(c.lemmaState), 'recognized_with_help'), count: 1,
    });
  }
  const byCount = <T extends { count: number; surface: string }>(x: T, y: T) => y.count - x.count || (x.surface < y.surface ? -1 : x.surface > y.surface ? 1 : 0);

  const knownPhrases = [...new Set(a.phrases.filter((p) => p.known).map((p) => p.occ.phraseId))].sort();

  // Prerequisites: lemma (or form when no lemma) items whose acquisition raises coverage most.
  // gain = tokens in passage × (1 − progress), progress = min(1, reading evidence / RECOGNIZED_EVIDENCE_REF).
  const groups = new Map<string, { itemKind: ItemKind; surface: string; count: number; evidence: number }>();
  for (const c of classified) {
    if (c.cls === 'known') continue;
    const id = c.lemmaId ?? c.token.formId;
    const state = c.lemmaId ? c.lemmaState : c.formState;
    const cur = groups.get(id);
    if (cur) cur.count += 1;
    else groups.set(id, {
      itemKind: c.lemmaId ? 'lemma' : 'form', count: 1, evidence: state?.reading.evidence ?? 0,
      surface: c.lemmaId ? parseLemmaSurface(c.lemmaId) : c.token.normalized,
    });
  }
  const prereqs: ScriptureReadiness['prerequisites'] = [];
  for (const [itemId, g] of groups) {
    prereqs.push({ itemId, itemKind: g.itemKind, surface: g.surface, gain: g.count * (1 - Math.min(1, g.evidence / RECOGNIZED_EVIDENCE_REF)) });
  }
  // Unknown phrases count at half weight: their tokens are already credited to their words.
  const phraseGroups = new Map<string, { tokens: number; evidence: number }>();
  for (const p of a.phrases) {
    if (p.known) continue;
    const cur = phraseGroups.get(p.occ.phraseId);
    if (cur) cur.tokens += p.occ.tokenIds.length;
    else phraseGroups.set(p.occ.phraseId, { tokens: p.occ.tokenIds.length, evidence: p.state?.reading.evidence ?? 0 });
  }
  for (const [itemId, g] of phraseGroups) {
    const phrase = await ctx.store.phrases.get(itemId);
    prereqs.push({ itemId, itemKind: 'phrase', surface: phrase?.display ?? itemId, gain: 0.5 * g.tokens * (1 - Math.min(1, g.evidence / RECOGNIZED_EVIDENCE_REF)) });
  }
  prereqs.sort((x, y) => y.gain - x.gain || (x.itemId < y.itemId ? -1 : 1));
  const prerequisites = prereqs.slice(0, 25);

  // Preparatory texts: existing non-scripture texts of this language containing prerequisites. Generated
  // texts are allowed but flagged.
  const covers = new Map<string, Set<string>>();
  const add = (tid: string, itemId: string) => { let s = covers.get(tid); if (!s) covers.set(tid, (s = new Set())); s.add(itemId); };
  for (const p of prerequisites) {
    if (p.itemKind === 'lemma') for (const r of await ctx.store.analyses.where('lemmaId', p.itemId)) add(textOfToken(r.tokenId), p.itemId);
    else if (p.itemKind === 'form') for (const t of await ctx.store.tokens.where('formId', p.itemId)) add(t.textId, p.itemId);
    else for (const o of await ctx.store.phraseOccurrences.where('phraseId', p.itemId)) add(o.textId, p.itemId);
  }
  covers.delete(textId);
  const target = await ctx.store.texts.get(textId);
  const cands: Array<{ textId: string; covers: string[]; generated: boolean }> = [];
  for (const [tid, set] of covers) {
    const t = await ctx.store.texts.get(tid);
    if (!t || t.lang !== target?.lang || t.kind === 'scripture' || t.kind === 'testimony') continue;
    cands.push({ textId: tid, covers: [...set].sort(), generated: t.generated || t.kind === 'generated-prep' });
  }
  cands.sort((x, y) => y.covers.length - x.covers.length || (x.textId < y.textId ? -1 : 1));
  const scored: Array<{ textId: string; covers: string[]; band: ComfortBand; generated: boolean; score: number }> = [];
  for (const c of cands.slice(0, 12)) {
    const band = (await analyzeText(ctx, userId, c.textId)).coverage.band;
    scored.push({ ...c, band, score: c.covers.length * BAND_FACTOR[band] });
  }
  scored.sort((x, y) => y.score - x.score || Number(x.generated) - Number(y.generated) || (x.textId < y.textId ? -1 : 1));

  return {
    textId, sentenceIds: a.coverage.sentenceIds, coverage: a.coverage,
    familiarItems: [...familiar.values()],
    unfamiliarForms: [...unfam.values()].sort(byCount),
    knownPhrases,
    difficultPatterns: a.coverage.unfamiliarPatterns,
    prerequisites,
    preparatoryTexts: scored.slice(0, 10).map(({ textId: tid, covers: cv, band, generated }) => ({ textId: tid, covers: cv, band, generated })),
  };
}
