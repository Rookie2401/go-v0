/**
 * Recommendations by ACTUAL state. They only ever point at existing texts / testimonies (ids), never generate text,
 * only consider the learner's current course language, and only PUBLISHED texts unless `includeUnpublished`.
 * One recommendation per text (best score wins). Input always sorts before `rehearse-testimony`.
 *
 *  new learner (no reading in this language)
 *     first-text            the easiest published input text (lowest staticLevel, then lowest expected difficulty): score 1.0.
 *                           If nothing is published: one note (no textId) saying what is awaited.
 *  learner with reading history ("completed" means an EXPLICIT TextCompleted — `finishedAt`; a text whose sentences were all
 *                           seen but not finished is IN PROGRESS, never completed)
 *     reread                a completed text whose last text-level self-report was below `all` (little 0.92 · some 0.88 ·
 *                           most 0.72) or whose latest reading sitting needed heavy help (≥ 40 % of word encounters, 0.70)
 *     next-input            a text in progress 0.90, or an unread published input text: productive-challenge 0.85 ·
 *                           comfortable 0.80 · difficult 0.65 · stretch 0.50 (band uses demonstrated + estimated coverage);
 *                           +0.10 per matching interest. Never empty while an unread published input text exists.
 *     listen-to-read-text   a completed text, ONLY when `deps.audioEligible?.(textId)` resolves true (reviewed real speech
 *                           exists) and not every sentence has been heard yet: 0.60
 *     reinforces-weak-items a completed text still mostly "met, not shown": 0.30 + 0.60 × partial, cap 0.55
 *     prepares-scripture    (targetTextId) published texts that really contain gap items: 0.5 + 0.45 × covered / gaps
 *     revisit-scripture     published scripture in a workable band read with help (≥ 20 % of its encounters at assistance ≥ 3)
 *  testimony
 *     rehearse-testimony    the learner's testimony with an accepted revision: 0.5, always after the input items.
 *  nothing to offer        an honest note (no textId) when nothing is published, or everything published has been read.
 */
import type { LanguageCode, PersonalizedCoverage, Recommendation, RecommendationReason, Text } from '../core';
import { analyzeText, liveSentences, scriptureReadiness } from './coverage';
import { HEAVY_HELP_FRACTION } from './policy';
import { readingProgressMany } from './progress';
import type { Degree } from './progress';
import type { Ctx, StoredEncounter } from './state';
import { sittingOf } from './state';

const REASON_ORDER: RecommendationReason[] = [
  'first-text', 'reread', 'next-input', 'prepares-scripture', 'revisit-scripture', 'easy-story', 'reinforces-weak-items',
  'listen-to-read-text', 'rehearse-testimony',
];
const INPUT_KINDS: ReadonlySet<Text['kind']> = new Set(['story', 'dialogue', 'nonfiction', 'transcript']);
const LEVEL_RANK = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'native'];
const REPORT_SCORE: Record<Degree, number> = { all: 0, most: 0.72, some: 0.88, little: 0.92 };
const REPORT_WORD: Record<Degree, string> = { all: 'all', most: 'most', some: 'some', little: 'little' };
const BAND_SCORE = { 'productive-challenge': 0.85, comfortable: 0.8, difficult: 0.65, stretch: 0.5 } as const;

async function learnerLang(ctx: Ctx, userId: string, targetTextId?: string): Promise<LanguageCode | undefined> {
  const user = await ctx.store.users.get(userId);
  const course = user ? await ctx.store.courses.get(user.courseId) : undefined;
  if (course) return course.lang;
  if (targetTextId) { const t = await ctx.store.texts.get(targetTextId); if (t) return t.lang; }
  const counts = new Map<LanguageCode, number>();
  for (const r of await ctx.store.learnerItems.where('userId', userId)) counts.set(r.lang, (counts.get(r.lang) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const cap = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1e4) / 1e4;

export async function recommend(
  ctx: Ctx, userId: string,
  opts?: { limit?: number; targetTextId?: string; interests?: string[]; includeUnpublished?: boolean; lang?: LanguageCode },
): Promise<Recommendation[]> {
  const lang = opts?.lang ?? (await learnerLang(ctx, userId, opts?.targetTextId));
  if (!lang) return [];
  const limit = opts?.limit ?? 5;
  const interests = new Set(opts?.interests ?? []);
  const includeUnpublished = opts?.includeUnpublished ?? false;
  const langName = (await ctx.store.languages.get(lang))?.name ?? lang;

  const texts = (await ctx.store.texts.where('lang', lang)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const visible = (t: Text) => includeUnpublished || t.published;
  const inputAll = texts.filter((t) => INPUT_KINDS.has(t.kind));
  const input = inputAll.filter(visible);
  const withheld = inputAll.filter((t) => !visible(t));

  const records = await readingProgressMany(ctx, userId, texts.map((t) => t.id)); // ONE read of the log
  const liveByText = new Map<string, Awaited<ReturnType<typeof liveSentences>>>();
  const live = async (textId: string) => {
    let l = liveByText.get(textId);
    if (!l) liveByText.set(textId, (l = await liveSentences(ctx, textId)));
    return l;
  };
  // "Completed" is an explicit TextCompleted OF THE CURRENT content version (`finishedAt`); a text revised since is in progress again.
  const progress = new Map<string, { total: number; seen: number; understood: number; finishedAt?: string }>();
  for (const t of texts) {
    const r = records.get(t.id)!;
    progress.set(t.id, { total: r.sentencesTotal, seen: r.sentencesSeen, understood: r.sentencesUnderstood, finishedAt: r.finishedAt });
  }
  const hasReading = [...records.values()].some((r) => r.sentencesSeen > 0 || r.sentencesUnderstood > 0 || r.finishedAt || r.finishedEarlierVersion || r.earlierVersions);

  // Writing-system (`orth`) encounters say nothing about which text to read next: they would only dilute the word-level shares below.
  const myEncounters = ((await ctx.store.encounters.where('userId', userId)) as StoredEncounter[]).filter((e) => e.lang === lang && e.itemKind !== 'orth');
  const byText = new Map<string, StoredEncounter[]>();
  for (const e of myEncounters) {
    let l = byText.get(e.textId);
    if (!l) byText.set(e.textId, (l = []));
    l.push(e);
  }

  const best = new Map<string, Recommendation>(); // keyed by textId
  const offer = (r: Recommendation) => {
    const key = r.textId ?? `testimony:${r.testimonyId}`;
    const cur = best.get(key);
    const rank = (x: Recommendation) => x.score * 1000 - REASON_ORDER.indexOf(x.reason);
    if (!cur || rank(r) > rank(cur)) best.set(key, r);
  };
  const partialIds = (a: Awaited<ReturnType<typeof analyzeText>>, n: number) => {
    const counts = new Map<string, number>();
    for (const c of a.classified) if (c.cls === 'partial') counts.set(c.token.formId, (counts.get(c.token.formId) ?? 0) + 1);
    return [...counts.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, n).map(([id]) => id);
  };
  const pctOf = (x: number) => Math.round(x * 100);
  const notes: Recommendation[] = [];

  // ── input ──
  if (!hasReading) {
    if (input.length > 0) {
      const ranked: Array<{ t: Text; rank: number; difficulty: number }> = [];
      for (const t of input) {
        const cov = (await analyzeText(ctx, userId, t.id)).coverage;
        const r = t.staticLevel ? LEVEL_RANK.indexOf(t.staticLevel) : LEVEL_RANK.length;
        ranked.push({ t, rank: r < 0 ? LEVEL_RANK.length : r, difficulty: cov.expectedDifficulty });
      }
      ranked.sort((a, b) => a.rank - b.rank || a.difficulty - b.difficulty || (a.t.id < b.t.id ? -1 : 1));
      const first = ranked[0].t;
      offer({
        reason: 'first-text', textId: first.id, reinforces: [], score: 1,
        // Say what the text is: an unpublished text can only be here because preview mode asked for it.
        explanation: first.published
          ? `A good place to start: "${first.title}" is the easiest published ${langName} text${first.staticLevel ? ` (${first.staticLevel})` : ''}.`
          : `A good place to start: "${first.title}" is the easiest ${langName} text in preview (not published)${first.staticLevel ? `, level ${first.staticLevel}` : ''}.`,
      });
    } else {
      notes.push({
        reason: 'first-text', reinforces: [], score: 0,
        explanation: noneExplanation(langName, withheld, includeUnpublished),
      });
    }
  } else {
    for (const t of input) {
      const p = progress.get(t.id)!;
      const rec = records.get(t.id)!;
      const bonus = t.tags.some((x) => interests.has(x)) ? 0.1 : 0;
      if (p.finishedAt) {
        const cov = await analyzeText(ctx, userId, t.id);
        const reported = rec.reportedComprehension;
        const below = reported && reported !== 'all' ? { degree: reported } : undefined;
        const heavy = await heavyHelp(byText.get(t.id) ?? []);
        if (below || heavy) {
          offer({
            reason: 'reread', textId: t.id, band: cov.coverage.band, reinforces: partialIds(cov, 10),
            score: cap(Math.max(below ? REPORT_SCORE[below.degree] : 0, heavy ? 0.7 : 0) + bonus),
            explanation: below
              ? `You said you understood ${REPORT_WORD[below.degree]} of "${t.title}"; reading it again is the quickest way to make it yours.`
              : `You needed a lot of help the last time you read "${t.title}"; a second reading should go more easily.`,
          });
        }
        if (cov.coverage.partialCoverage >= 0.25) {
          offer({
            reason: 'reinforces-weak-items', textId: t.id, band: cov.coverage.band, reinforces: partialIds(cov, 10),
            score: cap(Math.min(0.55, 0.3 + 0.6 * cov.coverage.partialCoverage) + bonus),
            explanation: `${pctOf(cov.coverage.partialCoverage)} % of its words were met but not yet shown understood.`,
          });
        }
        if (ctx.audioEligible && (await ctx.audioEligible(t.id))) {
          const heard = new Set((byText.get(t.id) ?? []).filter((e) => e.modality === 'listening').map((e) => e.sentenceId));
          const liveIds = new Set((await live(t.id)).map((s) => s.id));
          const heardLive = [...heard].filter((id) => liveIds.has(id)).length;
          if (heardLive < p.total) {
            offer({
              reason: 'listen-to-read-text', textId: t.id, band: cov.coverage.band, reinforces: [], score: cap(0.6 + bonus),
              explanation: `You have read "${t.title}"; real recorded speech is available, so you can now hear the same words.`,
            });
          }
        }
      } else if (p.seen > 0 || p.understood > 0) {
        const cov = await analyzeText(ctx, userId, t.id);
        offer({
          reason: 'next-input', textId: t.id, band: cov.coverage.band, reinforces: partialIds(cov, 8), score: cap(0.9 + bonus / 2),
          explanation: p.seen >= p.total && p.total > 0
            ? `You have seen every sentence of "${t.title}" but have not marked it finished.`
            : `You are partway through "${t.title}" (${p.seen} of ${p.total} sentences seen).`,
        });
      } else {
        const cov = await analyzeText(ctx, userId, t.id);
        offer({
          reason: 'next-input', textId: t.id, band: cov.coverage.band, reinforces: partialIds(cov, 8),
          score: cap(BAND_SCORE[cov.coverage.band] + bonus),
          explanation: `Not started yet; about ${pctOf(cov.coverage.knownLexicalCoverage + cov.coverage.estimatedFamiliarCoverage)} % of its words are already shown or likely familiar.`,
        });
      }
    }
  }

  // ── scripture ──
  for (const text of texts) {
    if (text.kind !== 'scripture' || !visible(text)) continue;
    const enc = byText.get(text.id) ?? [];
    const reading = enc.filter((e) => e.modality === 'reading');
    if (reading.length === 0) continue;
    const assisted = reading.filter((e) => e.assistance >= 3).length;
    if (assisted / reading.length < 0.2) continue;
    const a = await analyzeText(ctx, userId, text.id);
    const cov: PersonalizedCoverage = a.coverage;
    if (cov.band !== 'comfortable' && cov.band !== 'productive-challenge') continue;
    const f = assisted / reading.length;
    const bonus = text.tags.some((t) => interests.has(t)) ? 0.1 : 0;
    offer({
      reason: 'revisit-scripture', textId: text.id, band: cov.band, reinforces: partialIds(a, 10), score: cap(0.45 + 0.35 * f + bonus),
      explanation: `You read this passage with help before; about ${pctOf(cov.knownLexicalCoverage + cov.estimatedFamiliarCoverage)} % of its words are now shown or likely familiar.`,
    });
  }

  if (opts?.targetTextId) {
    const target = await ctx.store.texts.get(opts.targetTextId);
    if (target && (visible(target))) {
      const cov = (await analyzeText(ctx, userId, target.id)).coverage;
      if (cov.band !== 'comfortable') {
        const ready = await scriptureReadiness(ctx, userId, target.id, undefined, { includeUnpublished });
        const n = Math.max(1, ready.gaps.length);
        for (const p of ready.preparatoryTexts) {
          offer({
            reason: 'prepares-scripture', textId: p.textId, band: p.band, reinforces: p.covers,
            score: cap(0.5 + 0.45 * (p.covers.length / n)),
            explanation: `Contains ${p.covers.length} of the ${ready.gaps.length} words still to be shown understood in ${target.title}.`,
          });
        }
      }
    }
  }

  const inputs = [...best.values()]
    .sort((a, b) => b.score - a.score || REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason)
      || ((a.textId ?? '') < (b.textId ?? '') ? -1 : 1));

  // ── testimony (always after input) ──
  const rehearse: Recommendation[] = [];
  for (const t of await ctx.store.testimonies.where('userId', userId)) {
    if (t.lang !== lang || !t.currentRevisionId) continue;
    rehearse.push({
      reason: 'rehearse-testimony', testimonyId: t.id, reinforces: [], score: 0.5,
      explanation: 'Rehearse your latest testimony aloud; repetition makes it yours.',
    });
  }

  if (inputs.length === 0 && notes.length === 0 && hasReading) {
    notes.push({
      reason: 'next-input', reinforces: [], score: 0,
      explanation: input.length === 0
        ? noneExplanation(langName, withheld, includeUnpublished)
        : `You have read every published ${langName} text so far; more will appear here as they are reviewed and published.`,
    });
  }

  return [...inputs, ...notes, ...rehearse].slice(0, limit);
}

function noneExplanation(langName: string, withheld: Text[], includeUnpublished: boolean): string {
  if (includeUnpublished || withheld.length === 0) return `No ${langName} text has been imported yet.`;
  const reasons = [...new Set(withheld.flatMap((t) => t.unpublishedReasons))].slice(0, 3);
  return `No ${langName} text is published yet: ${withheld.length} imported text${withheld.length === 1 ? ' is' : 's are'} waiting`
    + (reasons.length ? ` (${reasons.join('; ')})` : '') + '. You can still use preview mode to see them.';
}

/** Help was heavy when ≥ HEAVY_HELP_FRACTION of the word encounters of the LATEST reading sitting needed help. */
async function heavyHelp(encounters: StoredEncounter[]): Promise<boolean> {
  const words = encounters.filter((e) => e.modality === 'reading' && e.itemKind === 'form');
  if (words.length === 0) return false;
  const latest = new Map<string, string>();
  for (const e of words) { const s = sittingOf(e); if (!latest.has(s) || e.at > latest.get(s)!) latest.set(s, e.at); }
  const sitting = [...latest.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))[0][0];
  const inSitting = words.filter((e) => sittingOf(e) === sitting);
  return inSitting.length >= 3 && inSitting.filter((e) => e.assistance > 0).length / inSitting.length >= HEAVY_HELP_FRACTION;
}
