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
 *     listen-to-read-text   a completed text, ONLY when `deps.audioEligible?.(textId)` resolves true AND the store holds a lawful,
 *                           exact-bound, reviewed HUMAN recording of it (synthetic speech never qualifies), and not every
 *                           sentence has been heard yet: 0.60
 *     reinforces-weak-items a completed text still mostly "met, not shown": 0.30 + 0.60 × partial, cap 0.55
 *     prepares-scripture    (targetTextId) published texts that really contain gap items: 0.5 + 0.45 × covered / gaps
 *     revisit-scripture     published scripture in a workable band read with help (≥ 20 % of its encounters at assistance ≥ 3)
 *  the ladder (R4, adaptive; the unit just finished decides)
 *     reread-before-next    the LAST completed ladder unit went badly - its text-level report was below "most" (some / little) or help
 *                           covered more than LADDER_HELP_FRACTION (25 %) of the word encounters of its latest sitting: that unit once
 *                           more (0.95); if it was already reread, the unit before it (0.95). "Next on your path" then drops to 0.94.
 *     stage0-recall         the last TWO completed units both went badly: Stage 0's home (/start, its recall card), 0.945, no text.
 *  testimony
 *     rehearse-testimony    the learner's testimony with an accepted revision: 0.5, always after the input items.
 *  nothing to offer        an honest note (no textId) when nothing is published, or everything published has been read.
 *
 * WHAT IS OFFERED AS NEW READING (REACH in policy.ts; from the simulated student of docs/audits/B2-SIMULATION.md):
 *   - coverage is the recommendation's own: proper names and numerals are left out of numerator and denominator (a genealogy is
 *     "easy" only through its names), and a text that would teach (almost) nothing new comes after every text in reach that does;
 *   - nothing below the floor is offered while a text at or above it exists - 75 % for texts written for the course (controlled /
 *     adapted), 85 % for AUTHENTIC texts (the library, Scripture; REACH.floorAuthentic); with none in reach the closest few are offered
 *     and said plainly to be above his level, and the ladder's "Next on your path" still leads;
 *   - `opts.challenge` (easy / steady / stretch, Settings -> Reading) moves the coverage the comprehensibility part peaks at (rank.ts);
 *   - a library text bringing back several ladder ORPHAN lemmas he has met (words the ladder teaches once and never uses again) is
 *     lifted by at most ORPHAN_BOOST.max (rank.ts `orphanLift`): the gate's orphan list feeds the reinforcement rule;
 *   - Scripture is soft-capped in what he READS: above 35 % of his last 20 texts / 20,000 words, Scripture candidates lose score
 *     proportionally (never removed: with little else in reach it is still offered);
 *   - rereads and reinforcement come after the new input in reach, are never of the text he has just read again, and never of a text
 *     he read at under 75 % coverage among the last five;
 *   - front matter / prefaces and texts tagged `superseded-by-ladder` are never offered.
 */
import type { LanguageAdapter, LanguageCode, LearnerItemState, PersonalizedCoverage, Recommendation, RecommendationReason, Text, TextProfile } from '../core';
import { heldOutIds } from './heldout';
import { isFrontMatterText, isSuperseded, isStage0Text, learnerSnapshot, rankWholeLibrary, storePager } from './candidates';
import type { LearnerSnapshot, WholeLibraryDeps } from './candidates';
import { analyzeText, liveSentences, scriptureReadiness } from './coverage';
import { hasHumanReviewedRecording } from './eligibility';
import { rowsByItemId } from './personal';
import { HEAVY_HELP_FRACTION, LADDER_HELP_FRACTION, REACH } from './policy';
import { readingProgressMany } from './progress';
import type { Degree } from './progress';
import { nameFreeLemmas, reachFloor, reachOf, reachTier, scriptureFactor } from './rank';
import type { Reach, ReachInfo, ReachTier } from './rank';
import type { Ctx, StoredEncounter } from './state';
import { sittingOf } from './state';
import { cachedProfile } from '../library/store-index';

const REASON_ORDER: RecommendationReason[] = [
  'first-text', 'reread', 'reread-before-next', 'stage0-recall', 'next-input', 'prepares-scripture', 'revisit-scripture', 'easy-story', 'reinforces-weak-items',
  'listen-to-read-text', 'rehearse-testimony',
];
const INPUT_KINDS: ReadonlySet<Text['kind']> = new Set(['story', 'dialogue', 'nonfiction', 'transcript']);
const LEVEL_RANK = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'native'];
/** For a learner who has read nothing: how many texts tied for the lead (stated level, place) get a full personal estimate. */
const FIRST_TEXT_ESTIMATES = 24;
const REPORT_SCORE: Record<Degree, number> = { all: 0, most: 0.72, some: 0.88, little: 0.92 };
const REPORT_WORD: Record<Degree, string> = { all: 'all', most: 'most', some: 'some', little: 'little' };
const BAND_SCORE = { 'productive-challenge': 0.85, comfortable: 0.8, difficult: 0.65, stretch: 0.5 } as const;

// ───────────────────────────── seams: the ladder and the whole library ─────────────────────────────
//
// "Next on your path" and "the best next thing from the whole library" are both offered from here, but neither source is owned by
// GoLearn: the ladder is data (docs/LADDER.md) and the library is the app's (Library.search / Library.profile). Each is a
// registered source, absent by default (then recommendations come from the store alone, exactly as before).

/** One unit of a language's ladder (`data/ladder/<lang>/ladder.json`), as far as a recommendation needs to know it. */
export interface LadderStep { unitId: string; textId: string; title: string; stage: string; published: boolean }
export interface LadderPosition {
  /** The units the learner has not completed, in ladder order (the first few are enough). */
  steps: LadderStep[];
  /** The learner has completed the ladder: the whole library is then the only source. */
  finished: boolean;
  /**
   * The units the learner HAS completed, in ladder order (R4, adaptive ladder). Absent => the ladder is not adaptive for this source
   * and "Next on your path" is offered at 0.99 whatever happened on the previous unit, exactly as before.
   */
  done?: LadderStep[];
  /** Stage 0 is part of this learner's path, so its recall card exists to be pointed at after two bad units in a row. */
  stage0Recall?: boolean;
  /**
   * The ladder's ORPHAN lemma words (lemmas it introduces and never meets again; src/ladder/orphans.ts), lower-cased. A function so that
   * the ladder is analysed only when the list is wanted (and the answer cached); absent => no orphan boost.
   */
  orphans?: () => ReadonlySet<string> | undefined;
}
export type LadderPathSource = (args: { userId: string; lang: LanguageCode; completed: ReadonlySet<string>; adapter?: LanguageAdapter }) => Promise<LadderPosition | undefined>;

let ladderSource: LadderPathSource | undefined;
/**
 * TODO(ladder): `src/ladder` does not exist yet (docs/LADDER.md describes it). When it lands, the app's bootstrap registers
 * its reader here — load `data/ladder/<lang>/ladder.json`, walk the units in order, skip those whose `textId` is in `completed`,
 * and return the rest (`finished` when none is left). Until then no ladder step is offered and nothing else changes.
 */
export function setLadderPathSource(source: LadderPathSource | undefined): void { ladderSource = source; }

let librarySource: WholeLibraryDeps | undefined;
/** The app registers its library here (`{ pager: (q) => library.search(q), profileOf: (id) => library.profile(id) }`) so that recommendations reach texts that are not imported. */
export function setWholeLibrarySource(source: WholeLibraryDeps | undefined): void { librarySource = source; }

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
  opts?: {
    limit?: number; targetTextId?: string; interests?: string[]; includeUnpublished?: boolean; lang?: LanguageCode;
    /** The whole-library step (default: the registered source, else the store's own catalogue); `false` turns it off. */
    wholeLibrary?: WholeLibraryDeps | false;
    /** How hard the suggestions should be (Settings -> Reading): where the comprehensibility part peaks. Default 'steady'. */
    challenge?: 'easy' | 'steady' | 'stretch';
  },
): Promise<Recommendation[]> {
  const lang = opts?.lang ?? (await learnerLang(ctx, userId, opts?.targetTextId));
  if (!lang) return [];
  const limit = opts?.limit ?? 5;
  const interests = new Set(opts?.interests ?? []);
  const includeUnpublished = opts?.includeUnpublished ?? false;
  const challenge = opts?.challenge;
  const langName = (await ctx.store.languages.get(lang))?.name ?? lang;

  // Protected listening-assessment material is never recommended, nor counted as something the learner could read.
  const privateCorpusIds = new Set((await ctx.store.corpora.where('kind', 'testimony')).map((c) => c.id));
  const texts = (await ctx.store.texts.where('lang', lang)).filter((t) => t.listeningAssessmentId === undefined && t.readingAssessmentId === undefined
    && t.kind !== 'testimony' && !privateCorpusIds.has(t.corpusId)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const visible = (t: Text) => includeUnpublished || t.published;
  // never offered as reading: a draft the ladder absorbed (`superseded-by-ladder`), and a work's front matter / preface
  const notOffered = new Set(texts.filter((t) => isSuperseded(t) || isStage0Text(t) || isFrontMatterText(t)).map((t) => t.id));
  for (const id of await heldOutIds(ctx, userId, ctx.clock())) notOffered.add(id); // held out for an unseen-text check (heldout.ts)
  const inputAll = texts.filter((t) => INPUT_KINDS.has(t.kind) && !notOffered.has(t.id));
  const input = inputAll.filter(visible);
  const withheld = inputAll.filter((t) => !visible(t));
  const scripturePublished = texts.some((t) => t.kind === 'scripture' && t.published);

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

  // What he read lately (reading encounters, newest first). A reread / reinforcement is never of the text he has just read, and never of
  // a text he could barely read among the last few: rereading what he could not read does not help.
  const recentRead = [...byText.entries()]
    .map(([id, es]) => [id, es.reduce((m, e) => (e.modality === 'reading' && e.at > m ? e.at : m), '')] as const)
    .filter(([, at]) => at !== '').sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : a[0] < b[0] ? -1 : 1)).map(([id]) => id);
  // the same text in the last TWO reading sittings (sentences viewed): he has just read it again, so not a third time in a row
  const log = await ctx.userLog(userId);
  const sittingAt = new Map<string, { at: string; textId: string }>();
  for (const e of log.events) {
    if (e.type !== 'SentenceViewed' || e.lang !== lang) continue;
    const key = `${log.sittings.get(e.id) ?? e.session}|${e.textId}`;
    const cur = sittingAt.get(key);
    if (!cur || e.at > cur.at) sittingAt.set(key, { at: e.at, textId: e.textId });
  }
  const sittingTexts = [...sittingAt.values()].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0)).map((x) => x.textId);
  const lastRead = sittingTexts.length >= 2 && sittingTexts[0] === sittingTexts[1] ? sittingTexts[0] : undefined;
  const unreadable = new Set(recentRead.slice(0, REACH.rereadLookback).filter((id) => readAtLowCoverage(byText.get(id) ?? [])));

  const best = new Map<string, Recommendation>(); // keyed by textId
  const offer = (r: Recommendation) => {
    const key = r.textId ?? (r.testimonyId ? `testimony:${r.testimonyId}` : r.reason);
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
  const freshStore: Array<{ text: Text; rec: Recommendation; known: number; familiar: number; met: number }> = [];

  // ── input ──
  if (!hasReading) {
    if (input.length > 0) {
      // A course's own reading path has an order: a chapter of a main ('spine') work is placed by shelf, work and chapter.
      // Among texts of the same stated level, the path's opening chapter comes before "easiest by estimate" — an estimate
      // made for someone who has read nothing cannot tell the first story of a series from the eighth.
      const placeOf = async (t: Text): Promise<[number, number, number] | undefined> => {
        if (!t.workId || t.chapter === undefined) return undefined;
        const work = await ctx.store.works.get(t.workId);
        if (!work || work.role !== 'spine') return undefined;
        const stage = await ctx.store.stages.get(work.stageId);
        return [stage?.index ?? Number.MAX_SAFE_INTEGER, work.order, t.chapter.index];
      };
      const byPlace = (a?: [number, number, number], b?: [number, number, number]) =>
        (a && b ? a[0] - b[0] || a[1] - b[1] || a[2] - b[2] : a ? -1 : b ? 1 : 0);
      // Stated level and place first (cheap); the personal estimate — a full analysis of the text — only for the few that tie for
      // the lead. Analysing every text of a course with a long ladder took minutes for the first suggestion (Albanian, 135 units).
      const ranked: Array<{ t: Text; rank: number; difficulty: number; place?: [number, number, number] }> = [];
      for (const t of input) {
        const r = t.staticLevel ? LEVEL_RANK.indexOf(t.staticLevel) : LEVEL_RANK.length;
        ranked.push({ t, rank: r < 0 ? LEVEL_RANK.length : r, difficulty: Number.POSITIVE_INFINITY, place: await placeOf(t) });
      }
      ranked.sort((a, b) => a.rank - b.rank || byPlace(a.place, b.place) || (a.t.id < b.t.id ? -1 : 1));
      const lead = ranked.filter((x) => x.rank === ranked[0].rank && byPlace(x.place, ranked[0].place) === 0).slice(0, FIRST_TEXT_ESTIMATES);
      for (const x of lead) x.difficulty = (await analyzeText(ctx, userId, x.t.id)).coverage.expectedDifficulty;
      ranked.sort((a, b) => a.rank - b.rank || byPlace(a.place, b.place) || a.difficulty - b.difficulty || (a.t.id < b.t.id ? -1 : 1));
      // A book is begun at its beginning: when the chosen text is a later chapter of a work, the earliest chapter of that
      // work among the texts on offer is the one to start with (a learner's own book: chapter 1 before chapter 2).
      let chosen = ranked[0];
      if (!chosen.place && chosen.t.workId && chosen.t.chapter !== undefined) {
        for (const r of ranked) {
          if (r.t.workId === chosen.t.workId && r.t.chapter !== undefined && r.t.chapter.index < chosen.t.chapter!.index) chosen = r;
        }
      }
      const first = chosen.t;
      const opens = chosen.place !== undefined;
      const beginsBook = chosen !== ranked[0];
      const level = first.staticLevel;
      offer({
        reason: 'first-text', textId: first.id, reinforces: [], score: 1,
        // Say what the text is: an unpublished text can only be here because preview mode asked for it.
        explanation: opens
          ? `A good place to start: "${first.title}" opens the course's own reading path${first.published ? '' : ' (in preview, not published)'}${level ? `, level ${level}` : ''}.`
          : beginsBook
            ? `A good place to start: "${first.title}", the first chapter of a book you can read here${first.published ? '' : ' (in preview, not published)'}.`
            : first.published
            ? `A good place to start: "${first.title}" is the easiest published ${langName} text${level ? ` (${level})` : ''}.`
            : `A good place to start: "${first.title}" is the easiest ${langName} text in preview (not published)${level ? `, level ${level}` : ''}.`,
      });
    } else {
      notes.push({
        reason: 'first-text', reinforces: [], score: 0,
        explanation: noneExplanation(langName, withheld, includeUnpublished, scripturePublished),
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
        if ((below || heavy) && !unreadable.has(t.id)) {
          offer({
            reason: 'reread', textId: t.id, band: cov.coverage.band, reinforces: partialIds(cov, 10),
            score: cap(Math.max(below ? REPORT_SCORE[below.degree] : 0, heavy ? 0.7 : 0) + bonus),
            explanation: below
              ? `You said you understood ${REPORT_WORD[below.degree]} of "${t.title}"; reading it again is the quickest way to make it yours.`
              : `You needed a lot of help the last time you read "${t.title}"; a second reading should go more easily.`,
          });
        }
        if (cov.coverage.partialCoverage >= 0.25 && !unreadable.has(t.id)) {
          offer({
            reason: 'reinforces-weak-items', textId: t.id, band: cov.coverage.band, reinforces: partialIds(cov, 10),
            score: cap(Math.min(0.55, 0.3 + 0.6 * cov.coverage.partialCoverage) + bonus),
            explanation: `${pctOf(cov.coverage.partialCoverage)} % of its words were met but not yet shown understood.`,
          });
        }
        // Only a reviewed HUMAN recording earns this: GoListen says so (`audioEligible`) and the stored audio must agree, so a text
        // voiced only by synthetic speech is never offered as "real recorded speech".
        if (ctx.listening && ctx.audioEligible && (await ctx.audioEligible(t.id)) && (await hasHumanReviewedRecording(ctx, t.id))) {
          const heard = new Set((byText.get(t.id) ?? []).filter((e) => e.modality === 'listening').map((e) => e.sentenceId));
          const liveIds = new Set((await live(t.id)).map((s) => s.id));
          const heardLive = [...heard].filter((id) => liveIds.has(id)).length;
          if (heardLive < p.total) {
            offer({
              reason: 'listen-to-read-text', textId: t.id, band: cov.coverage.band, reinforces: [], score: cap(0.6 + bonus),
              explanation: `You have read "${t.title}"; a reviewed recording by a human speaker is available, so you can now hear the same words.`,
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
        // offered below, once what is in reach, what teaches and how much Scripture he reads are known
        freshStore.push({
          text: t, known: cov.coverage.knownLexicalCoverage, familiar: cov.coverage.estimatedFamiliarCoverage, met: cov.coverage.partialCoverage,
          rec: {
            reason: 'next-input', textId: t.id, band: cov.coverage.band, reinforces: partialIds(cov, 8),
            score: cap(BAND_SCORE[cov.coverage.band] + bonus),
            explanation: `Not started yet; about ${pctOf(cov.coverage.knownLexicalCoverage + cov.coverage.estimatedFamiliarCoverage)} % of its words are already shown or likely familiar.`,
          },
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
    if (target && target.listeningAssessmentId === undefined && target.readingAssessmentId === undefined && visible(target)) {
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

  // ── the ladder, then the whole library ──
  // The ladder is the default route: the next unit he may open comes first ("Next on your path"). Whatever is not on the path is
  // chosen from the WHOLE catalogue by personal mastery (candidates.ts: prefilter, then rankLibrary), not from a sample.
  let whole: Awaited<ReturnType<typeof rankWholeLibrary>> | undefined;
  let onPath = false;
  let pathTextId: string | undefined;
  let snap: LearnerSnapshot | undefined;
  let ladderPosition: LadderPosition | undefined;
  let wholeWanted = false;
  if (opts?.wholeLibrary !== false) {
    const deps = opts?.wholeLibrary ?? librarySource ?? {};
    let total = 0;
    try { total = (await (deps.pager ?? storePager(ctx))({ lang, limit: 1, publishedOnly: !includeUnpublished })).total; } catch { total = 0; }
    snap = (total > 0 || ladderSource) ? await learnerSnapshot(ctx, userId, lang, [...interests]) : undefined;
    if (snap && ladderSource) {
      try {
        let adapter: LanguageAdapter | undefined;
        try { adapter = ctx.adapters.get(lang); } catch { adapter = undefined; }
        const position = await ladderSource({ userId, lang, completed: snap.completed, ...(adapter ? { adapter } : {}) });
        ladderPosition = position;
        const step = position?.finished ? undefined : position?.steps.find((s) => !snap!.completed.has(s.textId) && (s.published || includeUnpublished));
        // ── the adaptive ladder: how did the last unit go? (done = the completed units in ladder order) ──
        let nextScore = 0.99;
        const done = position?.done ?? [];
        if (position && done.length > 0) {
          const struggle = (textId: string) => {
            const rec = records.get(textId);
            if (!rec?.finishedAt) return undefined;
            const reported = rec.reportedComprehension;
            const below = reported === 'some' || reported === 'little' ? reported : undefined;
            const share = latestHelpShare(byText.get(textId) ?? []);
            const heavy = share !== undefined && share > LADDER_HELP_FRACTION;
            return { below, heavy, share, struggled: !!below || heavy, sittings: rec.sittings }; // sittings > 1: it has been read again
          };
          const last = done[done.length - 1];
          const before = done.length > 1 ? done[done.length - 2] : undefined;
          const sLast = struggle(last.textId);
          const sBefore = before ? struggle(before.textId) : undefined;
          if (sLast?.struggled) {
            const why = sLast.below ? `you said you understood ${REPORT_WORD[sLast.below]} of it` : `help covered ${pctOf(sLast.share ?? 0)} % of its words`;
            let target: LadderStep | undefined;
            let explanation = '';
            if (sLast.sittings < 2) {
              target = last;
              explanation = `You found the last unit hard (${why}): read "${last.title}" once more before moving on.`;
            } else if (before && sBefore && sBefore.sittings < 2) {
              target = before;
              explanation = `You found "${last.title}" hard even after reading it again: go back to the unit before it, "${before.title}", before moving on.`;
            }
            if (target) {
              offer({ reason: 'reread-before-next', textId: target.textId, reinforces: [], score: 0.95, explanation });
              nextScore = 0.94;
            }
            if (sBefore?.struggled && position.stage0Recall) {
              offer({
                reason: 'stage0-recall', reinforces: [], score: 0.945,
                explanation: 'The last two units were hard in a row: refresh the first words with the recall card in Stage 0 (Start from zero), then go on.',
              });
              nextScore = Math.min(nextScore, 0.94);
            }
          }
        }
        if (step) {
          onPath = true;
          pathTextId = step.textId;
          offer({
            reason: 'next-input', textId: step.textId, reinforces: [], score: nextScore,
            explanation: `Next on your path: "${step.title}" (${step.stage})${step.published ? '' : ' (in preview, not published)'}.`,
          });
        }
      } catch { /* a ladder that cannot be read is no ladder: the library still answers */ }
    }
    if (snap && total > 0) {
      wholeWanted = true;
      // the ladder's orphan words, only for a learner who has finished a unit (he cannot have met them before), and only when asked for
      let orphans: ReadonlySet<string> | undefined;
      if (ladderPosition?.orphans && snap.completed.size > 0) { try { orphans = ladderPosition.orphans(); } catch { orphans = undefined; } }
      try {
        whole = await rankWholeLibrary(ctx, userId, deps, {
          lang, ...(interests.size ? { interests: [...interests] } : {}), includeUnpublished, limit: Math.max(limit, 5), snapshot: snap, reach: true,
          ...(challenge ? { challenge } : {}), ...(orphans?.size ? { orphans } : {}),
        });
      } catch { whole = undefined; /* no ranking is not an error the learner can act on */ }
      for (const p of whole?.picks ?? []) {
        if (p.alreadyRead) continue; // a text he has read is for `reread` / `reinforces-weak-items`, which judge it by what he did
        offer({
          reason: 'next-input', textId: p.ranked.textId, reinforces: p.ranked.profile.weakItems.slice(0, 8), score: cap(p.ranked.score),
          explanation: p.ranked.reasons.join(' '),
        });
      }
    }
  }

  // ── new input: names left out, yield counted, the floor of what is in reach, the soft cap on Scripture ──
  // A text of the store that is not read yet is measured the way the whole-library ranking measures its picks (rank.ts `reachOf`).
  const reachById = new Map<string, Reach>();
  const floorById = new Map<string, number>(); // the floor a text is judged against: 75 % written for the course, 85 % authentic (rank.ts reachFloor)
  for (const p of whole?.picks ?? []) {
    if (p.alreadyRead || !p.ranked.reach) continue;
    reachById.set(p.ranked.textId, p.ranked.reach as ReachInfo);
    floorById.set(p.ranked.textId, (p.ranked.reach as ReachInfo).floor);
  }
  const pending = freshStore.filter((f) => !reachById.has(f.text.id));
  if (pending.length > 0) {
    const profiles = new Map<string, TextProfile>();
    for (const f of pending) { const p = await cachedProfile(ctx.store, f.text); if (p) profiles.set(f.text.id, p); }
    const rows = profiles.size > 0 ? await rowsByItemId(ctx, userId, nameFreeLemmas(profiles.values())) : new Map<string, LearnerItemState>();
    for (const f of pending) {
      floorById.set(f.text.id, reachFloor({ controlled: isCourseText(f.text), scripture: f.text.kind === 'scripture' }));
      const p = profiles.get(f.text.id);
      const shares = { knownShare: f.known, familiarShare: f.familiar, metShare: f.met };
      reachById.set(f.text.id, p ? reachOf(p, rows, shares, ctx.clock()) : { coverage: f.known + f.familiar, effective: f.known + f.familiar + 0.5 * f.met, nameShare: 0, basis: 'forms' });
    }
  }
  if (!snap && hasReading && freshStore.some((f) => f.text.kind === 'scripture')) {
    try { snap = await learnerSnapshot(ctx, userId, lang, [...interests]); } catch { snap = undefined; }
  }
  const scriptureCap = scriptureFactor(snap?.scriptureShare);
  for (const f of freshStore) offer({ ...f.rec, score: f.text.kind === 'scripture' ? cap(f.rec.score * scriptureCap) : f.rec.score });
  for (const id of notOffered) best.delete(id);

  const fresh = [...new Set([...freshStore.map((f) => f.text.id), ...(whole?.picks ?? []).filter((p) => !p.alreadyRead).map((p) => p.ranked.textId)])]
    .filter((id) => id !== pathTextId && best.get(id)?.reason === 'next-input' && reachById.has(id) && !(progress.get(id)?.seen));
  const tierOf = (id: string): ReachTier => reachTier(reachById.get(id)!, floorById.get(id) ?? REACH.floor);
  const inReach = fresh.filter((id) => tierOf(id) < 2);
  const aboveLevel = new Set<string>();
  if (inReach.length > 0) {
    for (const id of fresh) if (tierOf(id) === 2) best.delete(id); // nothing below the floor while anything at or above it exists
    // a text that would teach (almost) nothing new comes after every text in reach that teaches something
    const teaching = inReach.filter((id) => tierOf(id) === 0).map((id) => best.get(id)!.score);
    if (teaching.length > 0) {
      const lowest = Math.min(...teaching);
      for (const id of inReach) if (tierOf(id) === 1) { const r = best.get(id)!; best.set(id, { ...r, score: cap(Math.min(r.score, lowest * 0.9)) }); }
    }
  } else if (!hasReading) {
    // he has read nothing yet: every text is "0 %", so reach says nothing. The first text (and Stage 0, the path) lead alone;
    // the library waits until there is something to measure him by.
    for (const id of fresh) best.delete(id);
  } else {
    // nothing is in reach: the closest few, said plainly to be above his level (the ladder's next unit, when there is one, still leads)
    const closest = [...fresh].sort((a, b) => reachById.get(b)!.coverage - reachById.get(a)!.coverage || best.get(b)!.score - best.get(a)!.score || (a < b ? -1 : 1));
    for (const id of closest.slice(REACH.closestFew)) best.delete(id);
    closest.slice(0, REACH.closestFew).forEach((id, i) => {
      const r = best.get(id)!;
      aboveLevel.add(id);
      best.set(id, {
        ...r, score: cap(Math.min(r.score, reachById.get(id)!.coverage * REACH.aboveLevelScore - i * 1e-4)),
        explanation: `This is above your level for now: only about ${pctOf(reachById.get(id)!.coverage)} % of its words (names and numbers left out) are shown understood or likely familiar. It is the closest to your level among the texts offered.`,
      });
    });
  }
  // a reread is of a text he has not just read (unless nothing else is offered)
  if (lastRead && [...best.values()].some((r) => r.textId && r.textId !== lastRead)) {
    for (const r of [...best.values()]) if (r.textId === lastRead && (r.reason === 'reread' || r.reason === 'reinforces-weak-items')) best.delete(lastRead);
  }

  const isReread = (r: Recommendation) => r.reason === 'reread' || r.reason === 'reinforces-weak-items';
  const bySort = (a: Recommendation, b: Recommendation) => b.score - a.score || REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason)
    || ((a.textId ?? '') < (b.textId ?? '') ? -1 : 1);
  const sorted = [...best.values()].sort(bySort);
  // Rereads come only after the new input in reach: the path's next unit, a text in progress, an unread text that is in reach and teaches
  const isNewInReach = (r: Recommendation) => (r.reason === 'next-input' || r.reason === 'first-text') && !!r.textId && !aboveLevel.has(r.textId)
    && !(reachById.has(r.textId) && tierOf(r.textId) !== 0);
  const rest = sorted.filter((r) => !isReread(r));
  const lastNew = rest.reduce((m, r, i) => (isNewInReach(r) ? i : m), -1);
  const inputs = lastNew < 0 ? sorted : [...rest.slice(0, lastNew + 1), ...sorted.filter(isReread), ...rest.slice(lastNew + 1)];

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
        ? noneExplanation(langName, withheld, includeUnpublished, scripturePublished)
        : `You have read every published ${langName} text so far. ${whatToDo(ctx, [...progress.values()].some((p) => p.finishedAt), withheld.length > 0 && !includeUnpublished, challenge)}`
          + ' More will appear here as they are reviewed and published.',
    });
  }
  // The library was searched and nothing could be scored (no profile yet, or everything excluded): say what to do, never an empty Home.
  if (inputs.length === 0 && notes.length === 0 && wholeWanted && (whole?.picks.length ?? 0) === 0 && !onPath) {
    notes.push({
      reason: 'next-input', reinforces: [], score: 0,
      explanation: `No ${langName} text in the library could be matched to you yet. ${whatToDo(ctx, [...progress.values()].some((p) => p.finishedAt), withheld.length > 0 && !includeUnpublished, challenge)}`,
    });
  }

  return [...inputs, ...notes, ...rehearse].slice(0, limit);
}

/** What the learner can do when nothing new fits: reread, listen (only where recordings can exist), a harder shelf, preview. */
function whatToDo(ctx: Ctx, hasFinished: boolean, canPreview: boolean, challenge?: 'easy' | 'steady' | 'stretch'): string {
  const options: string[] = [];
  if (hasFinished) options.push('reread a text you found hard');
  if (ctx.listening && ctx.audioEligible) options.push('listen to one that has a recording by a human speaker');
  // the real setting: Settings -> Reading -> "How hard should suggestions be?" (already at stretch => only the shelf is left to try)
  options.push(challenge === 'stretch' ? 'try a harder shelf (Explore)' : 'try a harder shelf (Explore, or choose "stretch" under Settings, Reading, How hard should suggestions be?)');
  if (canPreview) options.push('turn on preview to see texts still awaiting review');
  const last = options.pop()!;
  return `To keep going, ${options.length ? `${options.join(', ')} or ${last}` : last}.`;
}

function noneExplanation(langName: string, withheld: Text[], includeUnpublished: boolean, scripturePublished = false): string {
  if (includeUnpublished || withheld.length === 0) return `No ${langName} text has been imported yet.`;
  // For the learner: the raw `unpublishedReasons` are developer wording and stay out of it (the preview badges show them in words).
  // "No text" would be untrue when the Scripture of this language is published: say what is missing, and where the rest is.
  return `The course's own ${langName} ${scripturePublished ? 'stories and dialogues' : 'texts'} are waiting for a native speaker's review, so none is offered here yet.`
    + ` The Reading shelves have texts from the library you can open now.`
    + `${scripturePublished ? ' Scripture is published: open it under Scripture.' : ''} Preview mode in Settings shows the waiting texts, marked as not yet reviewed.`;
}

/** Read at under `REACH.rereadMinCoverage` known: more than the rest of that share of the word encounters of the LATEST reading sitting needed help. */
function readAtLowCoverage(encounters: StoredEncounter[]): boolean {
  const words = encounters.filter((e) => e.modality === 'reading' && e.itemKind === 'form');
  if (words.length === 0) return false;
  const latest = new Map<string, string>();
  for (const e of words) { const s = sittingOf(e); if (!latest.has(s) || e.at > latest.get(s)!) latest.set(s, e.at); }
  const sitting = [...latest.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))[0][0];
  const inSitting = words.filter((e) => sittingOf(e) === sitting);
  return inSitting.length >= 3 && inSitting.filter((e) => e.assistance > 0).length / inSitting.length > 1 - REACH.rereadMinCoverage;
}

/** The share of the word encounters of the LATEST reading sitting that needed help; undefined with fewer than three word encounters. */
function latestHelpShare(encounters: StoredEncounter[]): number | undefined {
  const words = encounters.filter((e) => e.modality === 'reading' && e.itemKind === 'form');
  if (words.length === 0) return undefined;
  const latest = new Map<string, string>();
  for (const e of words) { const s = sittingOf(e); if (!latest.has(s) || e.at > latest.get(s)!) latest.set(s, e.at); }
  const sitting = [...latest.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))[0][0];
  const inSitting = words.filter((e) => sittingOf(e) === sitting);
  return inSitting.length >= 3 ? inSitting.filter((e) => e.assistance > 0).length / inSitting.length : undefined;
}

/** Help was heavy when ≥ HEAVY_HELP_FRACTION of the word encounters of the LATEST reading sitting needed help. */
async function heavyHelp(encounters: StoredEncounter[]): Promise<boolean> {
  const share = latestHelpShare(encounters);
  return share !== undefined && share >= HEAVY_HELP_FRACTION;
}

/** A text written for the course (controlled / adapted / bridge, or filed under the acquisition stream), not an authentic one. */
function isCourseText(t: Pick<Text, 'curriculum' | 'streams'>): boolean {
  const role = t.curriculum?.role;
  return role === 'controlled' || role === 'graded' || role === 'bridge' || (t.streams ?? []).includes('acquisition');
}
