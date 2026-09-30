/**
 * Recommendations — a simple scorer over six reasons. It only ever points at existing texts / testimonies
 * (ids); it never generates text. One recommendation per text (best-scoring reason wins).
 *
 *  easy-story            comfortable / productive-challenge story not yet fully read; productive-challenge 0.8,
 *                        comfortable 0.6, damped by how much is already read; +0.1 per interest tag match
 *  reinforces-weak-items partial coverage ≥ 8 %: 0.3 + 1.2 × partial (cap 0.85), not for `stretch` texts
 *  listen-to-read-text   read text with reading coverage ≥ 0.8 but listening coverage < 0.6: 0.35 + 0.5 × gap
 *  prepares-scripture    (targetTextId, band ≠ comfortable) preparatory texts from scriptureReadiness:
 *                        0.5 + 0.45 × covers / prerequisites
 *  revisit-scripture     scripture in a workable band that was read with help (≥ 20 % of its encounters at
 *                        assistance ≥ 3): 0.45 + 0.35 × assisted fraction
 *  rehearse-testimony    the learner's testimony with an accepted revision: 0.5
 */
import type { LanguageCode, PersonalizedCoverage, Recommendation, RecommendationReason } from '../core';
import { analyzeText, scriptureReadiness } from './coverage';
import type { Ctx } from './state';

const REASON_ORDER: RecommendationReason[] = [
  'prepares-scripture', 'revisit-scripture', 'easy-story', 'reinforces-weak-items', 'listen-to-read-text', 'rehearse-testimony',
];

async function learnerLang(ctx: Ctx, userId: string, targetTextId?: string): Promise<LanguageCode | undefined> {
  const user = await ctx.store.users.get(userId);
  const course = user ? await ctx.store.courses.get(user.courseId) : undefined;
  if (course) return course.lang;
  if (targetTextId) { const t = await ctx.store.texts.get(targetTextId); if (t) return t.lang; }
  const counts = new Map<LanguageCode, number>();
  for (const r of await ctx.store.learnerItems.where('userId', userId)) counts.set(r.lang, (counts.get(r.lang) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export async function recommend(
  ctx: Ctx, userId: string, opts?: { limit?: number; targetTextId?: string; interests?: string[] },
): Promise<Recommendation[]> {
  const lang = await learnerLang(ctx, userId, opts?.targetTextId);
  if (!lang) return [];
  const limit = opts?.limit ?? 5;
  const interests = new Set(opts?.interests ?? []);
  const myEncounters = (await ctx.store.encounters.where('userId', userId)).filter((e) => e.modality === 'reading');
  const readSentences = new Map<string, Set<string>>();
  const assistedCount = new Map<string, { total: number; assisted: number }>();
  for (const e of myEncounters) {
    if (!readSentences.has(e.textId)) readSentences.set(e.textId, new Set());
    readSentences.get(e.textId)!.add(e.sentenceId);
    const c = assistedCount.get(e.textId) ?? { total: 0, assisted: 0 };
    c.total += 1; if (e.assistance >= 3) c.assisted += 1;
    assistedCount.set(e.textId, c);
  }

  const best = new Map<string, Recommendation>(); // keyed by textId
  const offer = (r: Recommendation) => {
    const key = r.textId ?? `testimony:${r.testimonyId}`;
    const cur = best.get(key);
    const rank = (x: Recommendation) => x.score * 1000 - REASON_ORDER.indexOf(x.reason);
    if (!cur || rank(r) > rank(cur)) best.set(key, r);
  };
  const cap = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1e4) / 1e4;

  const partialIds = (a: Awaited<ReturnType<typeof analyzeText>>, n: number) => {
    const counts = new Map<string, number>();
    for (const c of a.classified) if (c.cls === 'partial') counts.set(c.token.formId, (counts.get(c.token.formId) ?? 0) + 1);
    return [...counts.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, n).map(([id]) => id);
  };

  const texts = (await ctx.store.texts.where('lang', lang)).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const text of texts) {
    if (text.kind === 'testimony') continue;
    const a = await analyzeText(ctx, userId, text.id);
    const cov: PersonalizedCoverage = a.coverage;
    const total = a.sentences.length || 1;
    const readFraction = Math.min(1, (readSentences.get(text.id)?.size ?? 0) / total);
    const bonus = text.tags.some((t) => interests.has(t)) ? 0.1 : 0;

    if (text.kind === 'scripture') {
      const ac = assistedCount.get(text.id);
      const workable = cov.band === 'comfortable' || cov.band === 'productive-challenge';
      if (ac && ac.total > 0 && workable && ac.assisted / ac.total >= 0.2) {
        const f = ac.assisted / ac.total;
        offer({
          reason: 'revisit-scripture', textId: text.id, band: cov.band, reinforces: partialIds(a, 10), score: cap(0.45 + 0.35 * f + bonus),
          explanation: `You read this passage with help before; your coverage is now ${Math.round(cov.knownLexicalCoverage * 100)} %.`,
        });
      }
      continue;
    }

    if ((cov.band === 'comfortable' || cov.band === 'productive-challenge') && readFraction < 1) {
      const base = cov.band === 'productive-challenge' ? 0.8 : 0.6;
      offer({
        reason: 'easy-story', textId: text.id, band: cov.band, reinforces: partialIds(a, 8), score: cap(base * (1 - 0.4 * readFraction) + bonus),
        explanation: `${Math.round(cov.knownLexicalCoverage * 100)} % of the words are already familiar.`,
      });
    }
    if (cov.partialCoverage >= 0.08 && cov.band !== 'stretch') {
      offer({
        reason: 'reinforces-weak-items', textId: text.id, band: cov.band, reinforces: partialIds(a, 10),
        score: cap(Math.min(0.85, 0.3 + 1.2 * cov.partialCoverage) * (readFraction < 1 ? 1 : 0.8) + bonus),
        explanation: 'Reuses words you have met but not yet consolidated.',
      });
    }
    const listening = cov.listeningCoverage ?? 0;
    if (readFraction > 0 && cov.knownLexicalCoverage >= 0.8 && listening < 0.6) {
      offer({
        reason: 'listen-to-read-text', textId: text.id, band: cov.band, reinforces: [],
        score: cap(0.35 + 0.5 * (cov.knownLexicalCoverage - listening) + bonus),
        explanation: 'You can read this text; listening to it builds the same words by ear.',
      });
    }
  }

  if (opts?.targetTextId) {
    const target = await ctx.store.texts.get(opts.targetTextId);
    if (target) {
      const cov = (await analyzeText(ctx, userId, target.id)).coverage;
      if (cov.band !== 'comfortable') {
        const ready = await scriptureReadiness(ctx, userId, target.id);
        const n = Math.max(1, ready.prerequisites.length);
        for (const p of ready.preparatoryTexts) {
          offer({
            reason: 'prepares-scripture', textId: p.textId, band: p.band, reinforces: p.covers,
            score: cap(0.5 + 0.45 * (p.covers.length / n)),
            explanation: `Contains ${p.covers.length} of the ${ready.prerequisites.length} items that would most help you read ${target.title}.`,
          });
        }
      }
    }
  }

  for (const t of await ctx.store.testimonies.where('userId', userId)) {
    if (t.lang !== lang || !t.currentRevisionId) continue;
    offer({
      reason: 'rehearse-testimony', testimonyId: t.id, reinforces: [], score: 0.5,
      explanation: 'Rehearse your latest testimony aloud; repetition makes it yours.',
    });
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason)
      || ((a.textId ?? a.testimonyId ?? '') < (b.textId ?? b.testimonyId ?? '') ? -1 : 1))
    .slice(0, limit);
}
