/**
 * Coverage, scripture readiness. Nothing here generates text: it only reads the store.
 *
 * A word token of the CURRENT version of a text (sentences with `retiredInVersion` are skipped, order is
 * `Sentence.index`, never an id) is
 *   known      — its form OR its credited lemma has (manual-mark-adjusted) reading level ≥ `recognized`: DEMONSTRATED
 *   estimated  — not known, but its form or lemma is "likely familiar" (≥ 4 help-free exposures over ≥ 2 sittings,
 *                no help with THAT item lately; the English shown for a sentence does not veto it — policy.ts, evidence@7).
 *                An ESTIMATE: reported separately, never merged into `knownLexicalCoverage`
 *   partial    — met IN READING (read, or needed help while reading) but neither known nor estimated. Hearing a word is a
 *                listening fact: it never moves a word out of `unseen` here, nor into `partial` (`listeningCoverage` is its own measure)
 *   unseen     — otherwise
 * known + estimated + partial + unseen = 1.
 * Bands (soft, lexical only) use known + estimated and say so in `explanation`:
 *   ≥0.95 comfortable · ≥0.88 productive-challenge · ≥0.75 difficult · else stretch.
 * `asOf` = time of the latest evidence event folded for the learner in the text's language; the numbers are a pure function of the log up to it
 * (same evidence ⇒ byte-identical coverage, on every call and after `rebuild`).
 * expectedDifficulty (0..1) blends: 0.60 × lexical gap (scaled so 75 % known+estimated = 1.0), 0.15 × unknown phrases,
 * 0.10 × unfamiliar-pattern ratio, 0.15 × sentence length (6 words = 0, 20+ words = 1). It is advisory only.
 *
 * Scripture readiness `gaps` = CONTENT words (not function words: ADP DET CONJ SCONJ AUX PART PRON CLF PUNCT; tokens the
 * adapter could not analyse count as content) of the passage that are not demonstrated, grouped by lemma (else form), with
 * status unseen / exposed (met, maybe estimated, never needed help) / needed-help. Preparatory texts must actually contain
 * gap items in live sentences, never the target, never scripture or testimony, published only unless includeUnpublished.
 */
import type {
  ComfortBand, ItemKind, LearnerItemState, PartOfSpeech, PatternOccurrence, PersonalizedCoverage, PhraseOccurrence,
  ScriptureReadiness, Sentence, Token,
} from '../core';
import { ids } from '../core';
import { AnalysisCache, askedLemmaId, creditableLemmaId, isNonHeadPiece } from './analysis';
import { RECOGNIZED_EVIDENCE_REF, bandFor, levelAtLeast } from './policy';
import type { Ctx } from './state';
import { effectiveEstimate, effectiveReadingLevel } from './state';

export type Cls = 'known' | 'estimated' | 'partial' | 'unseen';

export interface Classified {
  token: Token;
  cls: Cls;
  pos?: PartOfSpeech;
  lemmaId?: string;
  formState?: LearnerItemState;
  lemmaState?: LearnerItemState;
  listeningKnown: boolean;
  /**
   * Set on a piece of a lexical unit that is not its head (the "auf" of "steht … auf"): part of ONE word. It is classified exactly
   * as the head is (the head's form and the unit's lemma) and carries no lemma of its own, so that a unit is counted, listed and
   * grouped once, on its head. Absent on every other token.
   */
  unitPiece?: true;
}

/** Met IN READING. Nothing heard is a reading measure: a word only heard is still new to the reader. */
const met = (s?: LearnerItemState) => !!s && s.reading.level !== 'unseen';

export async function classifyTokens(ctx: Ctx, userId: string, tokens: Token[], cache: AnalysisCache): Promise<Classified[]> {
  await cache.prefetch(tokens.map((t) => t.id));
  const analyses = await Promise.all(tokens.map((t) => cache.resolve(t.id)));
  const lemmaIds = analyses.map((a) => creditableLemmaId(a));
  // A non-head piece of a unit is judged as its head is: by the head's form and by the unit's lemma (not by its own form).
  const pieces = analyses.map((a) => isNonHeadPiece(a));
  const headIds = [...new Set(analyses.flatMap((a, i) => (pieces[i] ? [a!.unit!.headTokenId] : [])))];
  const headTokens = new Map<string, Token>();
  if (headIds.length > 0) (await ctx.store.tokens.getMany(headIds)).forEach((t) => { if (t) headTokens.set(t.id, t); });
  const judged = tokens.map((t, i) => (pieces[i]
    ? { formId: headTokens.get(analyses[i]!.unit!.headTokenId)?.formId, lemmaId: askedLemmaId(analyses[i]) }
    : { formId: t.formId, lemmaId: lemmaIds[i] }));

  const wanted = new Set<string>();
  tokens.forEach((t, i) => {
    wanted.add(t.formId);
    const l = lemmaIds[i]; if (l) wanted.add(l);
    const j = judged[i]; if (j.formId) wanted.add(j.formId); if (j.lemmaId) wanted.add(j.lemmaId);
  });
  const list = [...wanted];
  const rows = await ctx.store.learnerItems.getMany(list.map((i) => ids.learnerItem(userId, i)));
  const states = new Map<string, LearnerItemState>();
  list.forEach((id, i) => { const r = rows[i]; if (r) states.set(id, r); });

  return Promise.all(tokens.map(async (token, i) => {
    const lemmaId = lemmaIds[i];
    const j = judged[i];
    // for an ordinary token these are the token's own form and credited lemma, exactly as before
    const formState = j.formId ? states.get(j.formId) : undefined;
    const lemmaState = j.lemmaId ? states.get(j.lemmaId) : undefined;
    const known = levelAtLeast(effectiveReadingLevel(formState), 'recognized') || levelAtLeast(effectiveReadingLevel(lemmaState), 'recognized');
    const cls: Cls = known ? 'known'
      : effectiveEstimate(formState) || effectiveEstimate(lemmaState) ? 'estimated'
        : met(formState) || met(lemmaState) ? 'partial' : 'unseen';
    const listeningKnown = levelAtLeast(formState?.listening.level ?? 'unseen', 'recognized') || levelAtLeast(lemmaState?.listening.level ?? 'unseen', 'recognized');
    const pos = analyses[i]?.pos;
    return { token, cls, ...(pos ? { pos } : {}), lemmaId, formState: pieces[i] ? states.get(token.formId) : formState, lemmaState, listeningKnown, ...(pieces[i] ? { unitPiece: true as const } : {}) };
  }));
}

export interface TextAnalysis {
  coverage: PersonalizedCoverage;
  sentences: Sentence[];
  classified: Classified[];
  phrases: Array<{ occ: PhraseOccurrence; known: boolean; state?: LearnerItemState }>;
  patterns: Array<{ occ: PatternOccurrence; known: boolean }>;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const pct = (x: number) => Math.round(x * 100);

/** The live (not retired) sentences of a text in reading order. */
export async function liveSentences(ctx: Ctx, textId: string): Promise<Sentence[]> {
  return (await ctx.store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
}

function explain(n: number, k: number, e: number, p: number, u: number): string {
  if (n === 0) return 'This text has no words to count.';
  return `Of ${n} words, ${pct(k)} % were shown understood (reported understood without help), ${pct(e)} % are likely familiar `
    + `(an estimate from help-free reading over several sittings; help with the word itself withdraws it, the English shown for a sentence does not), `
    + `${pct(p)} % were only met a few times or with help and ${pct(u)} % are new; `
    + `seeing a word is never counted as understanding it, hearing it does not change this reading measure, and the comfort band uses the first two together.`;
}

export async function analyzeText(ctx: Ctx, userId: string, textId: string, sentenceIds?: string[]): Promise<TextAnalysis> {
  const text = await ctx.store.texts.get(textId);
  if (!text) throw new Error(`unknown text: ${textId}`);
  const only = sentenceIds ? new Set(sentenceIds) : undefined;
  const sentences = (await liveSentences(ctx, textId)).filter((s) => !only || only.has(s.id));
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
  const estimated = n ? count('estimated') / n : 0;
  const partial = n ? count('partial') / n : 0;
  const unseen = n ? count('unseen') / n : 0;
  const effective = Math.min(1, known + estimated);

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
    0.6 * clamp01((1 - effective) / 0.25)
    + 0.15 * (1 - knownPhraseCoverage)
    + 0.1 * (distinctPatterns ? unfamiliarPatterns.length / distinctPatterns : 0)
    + 0.15 * clamp01((avgSentenceLength - 6) / 14),
  ) * 1e4) / 1e4;

  const asOf = await ctx.evidenceAsOf?.(userId, text.lang);
  const coverage: PersonalizedCoverage = {
    userId, textId, sentenceIds: sentences.map((s) => s.id), wordTokens: n,
    knownLexicalCoverage: known, estimatedFamiliarCoverage: estimated, partialCoverage: partial, unseenCoverage: unseen,
    explanation: explain(n, known, estimated, partial, unseen), newItems,
    knownPhraseCoverage, unfamiliarPatterns, avgSentenceLength,
    listeningCoverage: n ? classified.filter((c) => c.listeningKnown).length / n : 1,
    band: bandFor(effective), expectedDifficulty,
    ...(asOf ? { asOf } : {}),
  };
  return { coverage, sentences, classified, phrases, patterns };
}

const BAND_FACTOR: Record<ComfortBand, number> = { comfortable: 1, 'productive-challenge': 1, difficult: 0.6, stretch: 0.3 };
const FUNCTION_POS: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>(['ADP', 'DET', 'CONJ', 'SCONJ', 'AUX', 'PART', 'PRON', 'CLF', 'PUNCT']);
const MAX_GAPS_SEARCHED = 60;

function parseLemmaSurface(lemmaId: string): string {
  const m = /^lemma:[^:]+:(.*?)(?::[A-Z]+)?$/.exec(lemmaId);
  return m ? m[1] : lemmaId;
}

export async function scriptureReadiness(
  ctx: Ctx, userId: string, textId: string, sentenceIds?: string[], opts?: { includeUnpublished?: boolean },
): Promise<ScriptureReadiness> {
  const includeUnpublished = opts?.includeUnpublished ?? false;
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
    if (c.cls === 'known' || c.unitPiece) continue; // a unit's other piece is listed with its head, never on its own
    const cur = unfam.get(c.token.formId);
    if (cur) cur.count += 1;
    else unfam.set(c.token.formId, {
      itemId: c.token.formId, surface: c.token.surface, ...(c.lemmaId ? { lemmaId: c.lemmaId } : {}),
      lemmaKnown: levelAtLeast(effectiveReadingLevel(c.lemmaState), 'recognized_with_help'), count: 1,
    });
  }
  const byCount = <T extends { count: number; surface: string }>(x: T, y: T) => y.count - x.count || (x.surface < y.surface ? -1 : x.surface > y.surface ? 1 : 0);

  const knownPhrases = [...new Set(a.phrases.filter((p) => p.known).map((p) => p.occ.phraseId))].sort();

  // Non-demonstrated tokens grouped by lemma (else form): the unit both prerequisites and gaps are built on.
  interface Group {
    itemKind: ItemKind; surface: string; normalized: string; count: number; evidence: number; estimated: boolean; content: boolean;
    lemmaState?: LearnerItemState; formStates: Map<string, LearnerItemState>;
  }
  const groups = new Map<string, Group>();
  for (const c of classified) {
    if (c.cls === 'known' || c.unitPiece) continue;
    const id = c.lemmaId ?? c.token.formId;
    const state = c.lemmaId ? c.lemmaState : c.formState;
    let g = groups.get(id);
    if (!g) {
      g = {
        itemKind: c.lemmaId ? 'lemma' : 'form', count: 0, evidence: state?.reading.evidence ?? 0, estimated: effectiveEstimate(state),
        surface: c.lemmaId ? parseLemmaSurface(c.lemmaId) : c.token.surface, normalized: c.lemmaId ? parseLemmaSurface(c.lemmaId) : c.token.normalized, content: false, lemmaState: c.lemmaState, formStates: new Map(),
      };
      groups.set(id, g);
    }
    g.count += 1;
    if (c.formState) g.formStates.set(c.token.formId, c.formState);
    if (!c.pos || !FUNCTION_POS.has(c.pos)) g.content = true;
  }

  // Prerequisites: items whose acquisition raises coverage most.
  // gain = tokens in passage × (1 − progress), progress = min(1, demonstrated evidence / RECOGNIZED_EVIDENCE_REF), at least 0.6 for an estimate.
  const prereqs: ScriptureReadiness['prerequisites'] = [];
  for (const [itemId, g] of groups) {
    const progress = Math.max(g.estimated ? 0.6 : 0, Math.min(1, g.evidence / RECOGNIZED_EVIDENCE_REF));
    prereqs.push({ itemId, itemKind: g.itemKind, surface: g.normalized, gain: g.count * (1 - progress) });
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

  // Gaps: content words not demonstrated.
  const gaps: ScriptureReadiness['gaps'] = [];
  for (const [itemId, g] of groups) {
    if (!g.content) continue;
    const states = [...(g.lemmaState ? [g.lemmaState] : []), ...g.formStates.values()];
    const needed = states.some((s) => s.reading.assisted > 0); // reading gaps: help while HEARING says nothing about reading it
    const exposed = states.some(met);
    gaps.push({ itemId, itemKind: g.itemKind, surface: g.surface, count: g.count, status: needed ? 'needed-help' : exposed ? 'exposed' : 'unseen' });
  }
  gaps.sort((x, y) => y.count - x.count || (x.surface < y.surface ? -1 : x.surface > y.surface ? 1 : 0) || (x.itemId < y.itemId ? -1 : 1));

  // Preparatory texts: texts that actually contain gap items in their live sentences.
  const target = await ctx.store.texts.get(textId);
  const searched = gaps.slice(0, MAX_GAPS_SEARCHED);
  const cache = new AnalysisCache(ctx.store);
  const tokenHits = new Map<string, Array<{ token: Token; gapId: string }>>(); // textId → hits
  const addHit = (token: Token | undefined, gapId: string) => {
    if (!token || !token.isWord || token.textId === textId) return;
    let l = tokenHits.get(token.textId);
    if (!l) tokenHits.set(token.textId, (l = []));
    l.push({ token, gapId });
  };
  for (const gap of searched) {
    if (gap.itemKind === 'lemma') {
      const rows = await ctx.store.analyses.where('lemmaId', gap.itemId);
      const toks = await ctx.store.tokens.getMany([...new Set(rows.map((r) => r.tokenId))]);
      await cache.prefetch(toks.filter((t): t is Token => !!t).map((t) => t.id));
      for (const t of toks) if (t && (await cache.lemmaIdOf(t.id)) === gap.itemId) addHit(t, gap.itemId);
    } else {
      for (const t of await ctx.store.tokens.where('formId', gap.itemId)) addHit(t, gap.itemId);
    }
  }
  const covers = new Map<string, Set<string>>();
  const unpublishedCovers = new Map<string, Set<string>>();
  for (const [tid, hits] of tokenHits) {
    const t = await ctx.store.texts.get(tid);
    if (!t || t.lang !== target?.lang || t.kind === 'scripture' || t.kind === 'testimony') continue;
    const sentences = await ctx.store.sentences.getMany([...new Set(hits.map((h) => h.token.sentenceId))]);
    const live = new Set(sentences.filter((s): s is Sentence => !!s && s.retiredInVersion === undefined).map((s) => s.id));
    const set = new Set(hits.filter((h) => live.has(h.token.sentenceId)).map((h) => h.gapId));
    if (set.size === 0) continue;
    if (t.published || includeUnpublished) covers.set(tid, set);
    else unpublishedCovers.set(tid, set);
  }
  const cands: Array<{ textId: string; covers: string[]; generated: boolean }> = [];
  for (const [tid, set] of covers) {
    const t = (await ctx.store.texts.get(tid))!;
    cands.push({ textId: tid, covers: [...set].sort(), generated: t.generated || t.kind === 'generated-prep' });
  }
  cands.sort((x, y) => y.covers.length - x.covers.length || (x.textId < y.textId ? -1 : 1));
  const scored: Array<{ textId: string; covers: string[]; band: ComfortBand; generated: boolean; score: number }> = [];
  for (const c of cands.slice(0, 12)) {
    const band = (await analyzeText(ctx, userId, c.textId)).coverage.band;
    scored.push({ ...c, band, score: c.covers.length * BAND_FACTOR[band] });
  }
  scored.sort((x, y) => y.score - x.score || Number(x.generated) - Number(y.generated) || (x.textId < y.textId ? -1 : 1));
  const preparatoryTexts = scored.slice(0, 10).map(({ textId: tid, covers: cv, band, generated }) => ({ textId: tid, covers: cv, band, generated }));

  const coveredGaps = new Set<string>();
  for (const set of covers.values()) for (const g of set) coveredGaps.add(g);
  const uncovered = searched.filter((g) => !coveredGaps.has(g.itemId));
  let limitation: string | undefined;
  if (uncovered.length > 0) {
    const names = uncovered.slice(0, 8).map((g) => g.surface).join(', ') + (uncovered.length > 8 ? `, and ${uncovered.length - 8} more` : '');
    const awaiting = [...unpublishedCovers.keys()].filter((tid) => [...unpublishedCovers.get(tid)!].some((g) => uncovered.some((u) => u.itemId === g)));
    limitation = `No ${includeUnpublished ? '' : 'published '}text in the library contains: ${names}.`
      + (awaiting.length > 0 ? ` ${awaiting.length} unpublished text(s) do, and are waiting for review.` : '');
  }

  return {
    textId, sentenceIds: a.coverage.sentenceIds, coverage: a.coverage,
    familiarItems: [...familiar.values()],
    unfamiliarForms: [...unfam.values()].sort(byCount),
    knownPhrases,
    difficultPatterns: a.coverage.unfamiliarPatterns,
    prerequisites, preparatoryTexts,
    gaps, corpusCanPrepare: gaps.length === 0 || preparatoryTexts.length > 0,
    ...(limitation ? { limitation } : {}),
  };
}
