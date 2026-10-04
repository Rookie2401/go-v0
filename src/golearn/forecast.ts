/**
 * Difficulty forecast — what a text will be like for THIS learner before he opens it. Optional to look at; never a gate;
 * writes nothing and emits nothing (a forecast is not exposure).
 *
 * Over the live sentences of the text (or `opts.sentenceIds`):
 *   predictedCoverage   shown-known + likely-familiar share of the word tokens (an estimate; 0..1)
 *   unknown forms       word forms never met by the learner (neither the form nor its credited lemma), split into
 *     properNouns         resolved POS PROPN
 *     newUsefulWords      not a name, and likely to recur: occurs ≥ FORECAST.usefulInWork times in this text plus the other
 *                         texts of the same work, or ≥ FORECAST.usefulInLibrary times across every stored text
 *     rareWords           the rest
 *   weakPhrases         phrase units met before whose last two reading encounters needed item-targeted help
 *   newConstructions    patterns of the text never met
 *   varieties           word tokens per non-'standard' register tag on the resolved analysis
 *   unanalysedWords     word tokens with no analysis at all
 * There is NO frequency data anywhere: "useful" means repeated in the text, its book or the library, and `limits` says so.
 * Deterministic: the same state gives the same forecast, in the same order (count, then surface, then id).
 */
import type { DifficultyForecast, ForecastItem, LanguageCode, Text } from '../core';
import { readingTail } from './agg';
import type { StoredItem } from './agg';
import { AnalysisCache } from './analysis';
import { analyzeText } from './coverage';
import { scoreProfile } from './personal';
import { FORECAST } from './policy';
import type { Ctx } from './state';
import { cmp, pct1, plural, round4 } from './util';

/** A reading forecast counts only what was READ: `encounterCount` also counts hearings, so the reading dimension decides. */
const metInReading = (r: { reading: { level: string } }) => r.reading.level !== 'unseen';

const byCount = (a: ForecastItem, b: ForecastItem) => b.count - a.count || cmp(a.surface, b.surface) || cmp(a.itemId, b.itemId);

interface Form { itemId: string; itemKind: 'form' | 'lemma'; surface: string; count: number; proper: boolean; gloss?: string; register: Set<string> }

export async function predictDifficulty(
  ctx: Ctx, userId: string, textId: string, opts?: { sentenceIds?: string[] },
): Promise<DifficultyForecast> {
  const text = await ctx.store.texts.get(textId);
  if (!text) throw new Error(`unknown text: ${textId}`);
  if (text.listeningAssessmentId !== undefined) throw new Error(`protected listening-assessment material has no forecast: ${textId}`);
  const a = await analyzeText(ctx, userId, textId, opts?.sentenceIds);
  const { coverage } = a;
  const n = a.classified.length;
  const predictedCoverage = round4(Math.min(1, coverage.knownLexicalCoverage + coverage.estimatedFamiliarCoverage));

  // ── words ──
  const cache = new AnalysisCache(ctx.store);
  await cache.prefetch(a.classified.map((c) => c.token.id));
  const varieties: Record<string, number> = {};
  const fresh = new Map<string, Form>();
  let unanalysed = 0;
  for (const c of a.classified) {
    const analysis = await cache.resolve(c.token.id);
    if (!analysis) unanalysed += 1;
    for (const tag of analysis?.register ?? []) if (tag !== 'standard') varieties[tag] = (varieties[tag] ?? 0) + 1;
    if (c.cls !== 'unseen') continue;
    if (c.unitPiece) continue; // the other piece of a lexical unit is the same new word as its head: listed once, with the head
    // a lexical unit written as several words is listed once, under its lemma, as a dictionary lists it ("aufstehen")
    const unit = analysis?.unit && analysis.lemmaId ? analysis.unit : undefined;
    const key = unit ? analysis!.lemmaId! : c.token.formId;
    let f = fresh.get(key);
    if (!f) {
      let gloss = analysis?.gloss;
      if (!gloss && analysis?.lemmaId) gloss = (await ctx.store.lemmas.get(analysis.lemmaId))?.gloss;
      f = {
        itemId: key, itemKind: unit ? 'lemma' : 'form', surface: unit ? unit.display : c.token.surface, count: 0, proper: false, register: new Set(),
        ...(gloss ? { gloss } : {}),
      };
      fresh.set(key, f);
    }
    f.count += 1;
    if (analysis?.pos === 'PROPN') f.proper = true;
    for (const tag of analysis?.register ?? []) f.register.add(tag);
  }

  // Recurrence of new, non-name forms: this text + the other texts of its work, and the whole library (live sentences only).
  const sentenceLive = new Map<string, boolean>();
  const textRows = new Map<string, Text | undefined>();
  const occurrences = async (formId: string): Promise<{ work: number; library: number }> => {
    const toks = (await ctx.store.tokens.where('formId', formId)).filter((t) => t.isWord);
    const unknownSentences = [...new Set(toks.map((t) => t.sentenceId))].filter((s) => !sentenceLive.has(s));
    const rows = await ctx.store.sentences.getMany(unknownSentences);
    unknownSentences.forEach((s, i) => sentenceLive.set(s, !!rows[i] && rows[i]!.retiredInVersion === undefined));
    const unknownTexts = [...new Set(toks.map((t) => t.textId))].filter((t) => !textRows.has(t));
    const trows = await ctx.store.texts.getMany(unknownTexts);
    unknownTexts.forEach((t, i) => textRows.set(t, trows[i]));
    let work = 0;
    let library = 0;
    for (const t of toks) {
      if (!sentenceLive.get(t.sentenceId)) continue;
      library += 1;
      if (t.textId !== textId && text.workId && textRows.get(t.textId)?.workId === text.workId) work += 1;
    }
    return { work, library };
  };

  const properNouns: ForecastItem[] = [];
  const newUsefulWords: ForecastItem[] = [];
  const rareWords: ForecastItem[] = [];
  for (const f of [...fresh.values()].sort((x, y) => cmp(x.itemId, y.itemId))) {
    const item: ForecastItem = {
      itemId: f.itemId, itemKind: f.itemKind, surface: f.surface, count: f.count,
      ...(f.gloss ? { gloss: f.gloss } : {}), ...(f.register.size ? { register: [...f.register].sort() } : {}),
    };
    if (f.proper) { properNouns.push(item); continue; }
    let useful = f.count >= FORECAST.usefulInWork;
    if (!useful && f.itemKind === 'form') { // recurrence is counted by form: a unit's lemma has no form tokens to count
      const o = await occurrences(f.itemId);
      useful = f.count + o.work >= FORECAST.usefulInWork || Math.max(o.library, f.count) >= FORECAST.usefulInLibrary;
    }
    (useful ? newUsefulWords : rareWords).push(item);
  }
  properNouns.sort(byCount);
  newUsefulWords.sort(byCount);
  rareWords.sort(byCount);

  // ── phrases the learner met before but still needed help with ──
  const phraseCounts = new Map<string, number>();
  for (const p of a.phrases) phraseCounts.set(p.occ.phraseId, (phraseCounts.get(p.occ.phraseId) ?? 0) + 1);
  const weakPhrases: ForecastItem[] = [];
  for (const [phraseId, count] of phraseCounts) {
    const state = a.phrases.find((p) => p.occ.phraseId === phraseId)?.state;
    if (!state || !metInReading(state)) continue;
    // the help flags of the phrase's last reading encounters are kept on its row (agg.ts): no encounter is read
    const tail = readingTail((state as StoredItem).agg).slice(-FORECAST.weakPhraseTail);
    if (tail.length < FORECAST.weakPhraseTail || !tail.every((h) => h === 1)) continue;
    const phrase = await ctx.store.phrases.get(phraseId);
    weakPhrases.push({ itemId: phraseId, itemKind: 'phrase', surface: phrase?.display ?? phraseId, count, ...(phrase?.gloss ? { gloss: phrase.gloss } : {}) });
  }
  weakPhrases.sort(byCount);

  // ── constructions never met ──
  const patternCounts = new Map<string, number>();
  for (const p of a.patterns) patternCounts.set(p.occ.patternId, (patternCounts.get(p.occ.patternId) ?? 0) + 1);
  const newConstructions: ForecastItem[] = [];
  for (const [patternId, count] of patternCounts) {
    const state = await ctx.store.learnerItems.get(`${userId}|${patternId}`);
    if (state && metInReading(state)) continue; // a construction only heard is still new to the reader
    const pattern = await ctx.store.patterns.get(patternId);
    newConstructions.push({ itemId: patternId, itemKind: 'pattern', surface: pattern?.title ?? patternId, count, ...(pattern?.explanation ? { gloss: pattern.explanation } : {}) });
  }
  newConstructions.sort(byCount);

  // ── limits ──
  const limits = ["No frequency data: 'useful' means repeated in this text, this book or your library"];
  if (n > 0 && unanalysed / n > FORECAST.unanalysedShare) {
    limits.push(`${unanalysed} of ${plural(n, 'word')} (${pct1(unanalysed / n)} %) have no analysis, so Go cannot say which are names or what they mean; they are listed by how often they occur.`);
  }
  const lang: LanguageCode = text.lang;
  const metForms = (await ctx.store.learnerItems.where('userId', userId)).filter((r) => r.lang === lang && r.itemKind === 'form' && metInReading(r)).length;
  if (metForms < FORECAST.minHistoryForms) {
    limits.push('You have read very little so far, so the estimate of which words you already know rests on very little.');
  }

  const baseSummary = `Predicted coverage ${pct1(predictedCoverage)} % (an estimate). ${plural(newUsefulWords.length, 'new useful word')} · ${plural(rareWords.length, 'rare word')}`
    + ` · ${plural(weakPhrases.length, 'weak phrase')} · ${plural(newConstructions.length, 'new construction')}.`;

  // Generic features of the text and the personal estimate built from its stored profile (the library package; absent when it cannot
  // say, for instance for a scoped forecast, which describes only part of the text).
  let features: DifficultyForecast['features'];
  let personal: DifficultyForecast['personal'];
  let partsKnownCompounds = 0;
  if (!opts?.sentenceIds) {
    try {
      const lib = await import('../library');
      features = await lib.featuresOfStoredText(ctx.store, textId);
      const profile = await lib.profileOfStoredText(ctx.store, textId);
      if (profile) {
        const work = text.workId ? await ctx.store.works.get(text.workId) : undefined;
        const score = await scoreProfile(ctx, userId, profile, { domains: work?.domains, variety: work?.variety });
        personal = score.personal;
        partsKnownCompounds = score.compounds?.partsKnown ?? 0;
        features ??= profile.features;
      }
    } catch {
      features = undefined; // the library cannot profile this text: the forecast simply has no features / personal part
      personal = undefined;
      partsKnownCompounds = 0;
    }
  }

  // A ForecastItem has no field for a note, so the new compounds whose parts the learner all knows are counted in the summary
  // instead. They STAY new words (the list above includes them): knowing the parts is an estimate of how readable the whole is,
  // not knowledge of it, and the summary says so.
  const summary = baseSummary + (partsKnownCompounds > 0
    ? ` ${plural(partsKnownCompounds, 'new compound')} in it ${partsKnownCompounds === 1 ? 'is' : 'are'} made of words you know (the whole may still mean something new).` : '');

  return {
    textId, userId, coverage, predictedCoverage, newUsefulWords, rareWords, weakPhrases, newConstructions, properNouns,
    varieties, unanalysedWords: unanalysed, limits, summary,
    ...(features ? { features } : {}), ...(personal ? { personal } : {}),
  };
}
