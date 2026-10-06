/**
 * rankLibrary — which texts to offer this learner next, from candidates whose PROFILES are known (they need not be imported).
 *
 * score (0..1) = Σ weight × part, parts each in 0..1 (weights and targets live in policy.ts, RANKING):
 *   comprehensibility  peaks at the coverage the `challenge` option asks for (easy 97 %, steady 93 %, stretch 88 %), not at 100 %:
 *                      it rises up to the target and falls gently above it. Coverage = shown + likely familiar + half of the words
 *                      met before (the rest of the words are new).
 *   challenge          how well the number of NEW constructions fits the option (a stretch text may bring a few; an easy one none)
 *   interest           the candidate's stream or domains match what the learner said he is interested in
 *   reinforcement      natural repetition: words and phrases he has met and still needs help with that this text contains. A struggle
 *                      (and, at half weight, words he is practising saying in GoTell and cannot yet say on his own)
 *                      raises the value of texts that use the item in context; it never produces a drill
 *   regional           the candidate's variety against the course's target variety
 *   novelty            not yet read
 *   quality            published, and rights on record in a state that can be relied on
 * ANTI-PATHOLOGY (each is tested):
 *   1. a controlled text (written for the course) never outranks an authentic text of comparable comprehensibility (coverage within
 *      RANKING.comparableCoverage) when it is ahead only because of comprehensibility: its score is held just below
 *   2. controlled texts are a ramp, not the course: their score is multiplied by 1 - controlledFade x (the share of authentic candidates
 *      already at 90 % predicted coverage), so their weight falls as real texts become readable
 *   3. at most two consecutive results from one work (a work is the stored text's work, else the text id without its chapter suffix),
 *      and a result by the same author as the one before keeps only 90 % of its score
 * Every result carries its reasons in plain words, the most important first. Deterministic: ties are broken by text id.
 */
import type { LearnerItemState, ProfileScore, RankCandidate, RankOptions, RankedText, TextProfile } from '../core';
import { RANKING, REACH, WHOLE_RANKING, levelAtLeast } from './policy';
import { rowsByItemId, scoreProfile } from './personal';
import { productiveGaps } from './productive';
import type { LemmaReadings } from './personal';
import { effectiveEstimate, effectiveReadingLevel } from './state';
import type { Ctx } from './state';
import { pct1, plural } from './util';

type Challenge = NonNullable<RankOptions['challenge']>;
const RELIABLE_RIGHTS = new Set(['verified-public-domain', 'verified-open-licence', 'course-authored', 'user-supplied']);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** 1 at the target coverage, falling linearly below it, and gently above it. */
export function comprehensibility(coverage: number, target: number): number {
  if (coverage <= target) return clamp01(1 - (target - coverage) / RANKING.belowSpan);
  return clamp01(1 - RANKING.aboveSlope * (coverage - target));
}

function regionalFit(variety: string | undefined, target: string | undefined): number {
  if (!target) return 0.5; // nothing to compare with: the same for every candidate
  if (!variety || variety === 'es' || variety === 'general') return 0.6;
  if (variety === target) return 1;
  if (variety === 'es-hist') return 0.2;
  if (variety === 'es-ES') return 0.3;
  return variety.startsWith('es-') || variety === target.split('-')[0] ? 0.8 : 0.4; // another Latin American / general variety
}

/** The work a text belongs to, for "no more than two in a row from one work". */
async function workKeys(ctx: Ctx, candidates: RankCandidate[]): Promise<Map<string, string>> {
  const ids = candidates.map((c) => c.profile.textId);
  const stored = await ctx.store.texts.getMany(ids);
  const out = new Map<string, string>();
  ids.forEach((id, i) => out.set(id, stored[i]?.workId ?? id.replace(/(?:[-_/]ch?\d+|[-_/]\d+)$/i, '')));
  return out;
}

/**
 * WHOLE-LIBRARY SIGNALS (optional; a ranking without them is exactly the one described above). Four more factors, each added with
 * its weight from policy.ts (WHOLE_RANKING, provisional); the score is divided by 1 + the weights of the factors that had data, so
 * a missing signal never lowers or raises a score. All of them follow the READING-ONLY rules of evidence@8: what was only heard is
 * never read, and synthetic speech is never a listening signal (the caller passes `listenEligible` only for a learner whose
 * listening has been credited, and only for texts whose recording is a reviewed human one).
 *   usefulUnknown  words (lemmas) never met in reading that recur in at least WHOLE_RANKING.usefulMinTexts of the UNREAD candidates:
 *                  learning them pays off again in the next texts
 *   overdue        words met in reading whose latest READING evidence is older than WHOLE_RANKING.overdueDays
 *   variety        steps away from the domain of the last texts read (`recentGroups`, most recent first)
 *   listening      a reviewed human recording exists (`listenEligible`)
 */
export interface RankSignals {
  recentGroups?: readonly string[];
  listenEligible?: ReadonlySet<string>;
}
export type ExtraKey = keyof typeof WHOLE_RANKING.weights;
/**
 * `reach` turns on the RECOMMENDATION measure (REACH in policy.ts; used by `recommend`, never by the lists the learner browses):
 * coverage with proper names and numerals left out, a yield term for what the text would teach, the floor of what is in reach
 * (below it a text is offered only when nothing is in reach, and then said to be above his level), and the soft cap on Scripture
 * (`scriptureShare`: its share of what he read lately).
 */
export type RankOptionsWhole = RankOptions & { signals?: RankSignals; reach?: { scriptureShare?: number } };
export type RankedTextWhole = RankedText & { extra?: Partial<Record<ExtraKey, number>>; reach?: ReachInfo };
/** A candidate that says whether it is Scripture (its primary stream is not the only way to be one). */
export type RankCandidateWhole = RankCandidate & { scripture?: boolean };

/** The group a text belongs to for "variety of domain": its first domain, else its stream. */
export const domainOf = (x: { domains?: readonly string[]; stream?: string }): string | undefined => x.domains?.[0] ?? x.stream;

// ───────────────────────────── the recommendation's own measure: names left out, yield counted ─────────────────────────────

/**
 * What a text is, for recommending it. Names (PROPN) and numerals are left OUT of numerator and denominator: a genealogy is easy only
 * through its names, and teaches nothing. Lemma-based (a profile's lemma ids end in their part of speech); a profile without enough
 * lemmas falls back to the form-based shares (`basis: 'forms'`, no yield).
 */
export interface Reach {
  /** Shown-understood plus likely-familiar share of the non-name words. */
  coverage: number;
  /** The same plus half of the words met before: what the comprehensibility part is judged on. */
  effective: number;
  /**
   * New words per word: the distinct lemmas not yet known (a word met a hundred times counts once) per word of the text, names INCLUDED in the
   * count of words (a list of names teaches little for the reading it costs). What reading it would teach; absent on the form-based fallback.
   */
  yield?: number;
  /** Names and numerals as a share of the words that carry a lemma. */
  nameShare: number;
  basis: 'lemmas' | 'forms';
}
/** 0 in reach and teaches · 1 in reach but teaches (almost) nothing · 2 out of reach. */
export type ReachTier = 0 | 1 | 2;
export type ReachInfo = Reach & { tier: ReachTier; aboveLevel: boolean; scripturePenalty: number };

const NAME_LEMMA = /:(?:PROPN|NUM)$/;

/** The tier of a measure: out of reach below the floor, else low-yield below `minYield` (a measure without yield is never low-yield). */
export const reachTier = (r: Pick<Reach, 'coverage' | 'yield'>): ReachTier =>
  r.coverage < REACH.floor ? 2 : r.yield !== undefined && r.yield < REACH.minYield ? 1 : 0;

/** `rows` are the learner's LEMMA rows (reading only counts, as everywhere: what was only heard is not read). */
export function reachOf(
  profile: TextProfile, rows: ReadonlyMap<string, LearnerItemState>, scored: Pick<ProfileScore, 'knownShare' | 'familiarShare' | 'metShare'>,
): Reach {
  let names = 0;
  let free = 0;
  let known = 0;
  let met = 0;
  let unknownTypes = 0;
  for (const [lemma, n] of profile.lemmas) {
    if (NAME_LEMMA.test(lemma)) { names += n; continue; }
    free += n;
    const row = rows.get(lemma);
    if (row && (levelAtLeast(effectiveReadingLevel(row), 'recognized') || effectiveEstimate(row))) { known += n; continue; }
    unknownTypes += 1;
    if (row && row.reading.level !== 'unseen') met += n;
  }
  if (free < REACH.minNameFreeWords || names + free < REACH.minLemmaShare * Math.max(1, profile.words)) {
    const coverage = scored.knownShare + scored.familiarShare;
    return { coverage, effective: coverage + 0.5 * scored.metShare, nameShare: 0, basis: 'forms' };
  }
  const coverage = known / free;
  return { coverage, effective: coverage + (0.5 * met) / free, yield: unknownTypes / (names + free), nameShare: names / (names + free), basis: 'lemmas' };
}

/** The lemma ids (names and numerals excluded) of some profiles, for one read of the learner's rows. */
export const nameFreeLemmas = (profiles: Iterable<TextProfile>): string[] => {
  const out = new Set<string>();
  for (const p of profiles) for (const [l] of p.lemmas) if (!NAME_LEMMA.test(l)) out.add(l);
  return [...out];
};

/** The factor a Scripture candidate's score is multiplied by when Scripture is more than its share of what he read lately (1 = none). */
export function scriptureFactor(recentShare: number | undefined): number {
  if (recentShare === undefined || recentShare <= REACH.scriptureShare) return 1;
  return Math.max(0, 1 - (REACH.scripturePenalty * (recentShare - REACH.scriptureShare)) / (1 - REACH.scriptureShare));
}

const DAY_MS = 86_400_000;

async function extraParts(ctx: Ctx, userId: string, candidates: RankCandidate[], sig: RankSignals, preloaded?: ReadonlyMap<string, LearnerItemState>) {
  const X = WHOLE_RANKING;
  const unread = candidates.filter((c) => !c.alreadyRead);
  const lemmas = new Set<string>();
  for (const c of candidates) for (const [l] of c.profile.lemmas) lemmas.add(l);
  // `preloaded` = the rows of EVERY lemma of the candidates, already read by the caller (an absent lemma has no row)
  const rows = preloaded ?? (lemmas.size > 0 ? await rowsByItemId(ctx, userId, [...lemmas]) : new Map<string, LearnerItemState>());
  // reading-only: a lemma that was only heard is still unknown for reading
  const unknown = (l: string) => { const r = rows.get(l); return !r || (r.reading.level === 'unseen' && !r.manualMark); };
  const df = new Map<string, number>();
  for (const c of unread) for (const [l] of c.profile.lemmas) if (unknown(l)) df.set(l, (df.get(l) ?? 0) + 1);
  const cutoff = Date.parse(ctx.clock()) - X.overdueDays * DAY_MS;
  let anyDated = false;
  for (const r of rows.values()) if (r.reading.level !== 'unseen' && r.reading.lastEvidenceAt) { anyDated = true; break; }

  const active: Record<ExtraKey, boolean> = {
    usefulUnknown: unread.length >= X.usefulMinTexts,
    overdue: anyDated,
    variety: (sig.recentGroups?.length ?? 0) > 0,
    listening: sig.listenEligible !== undefined,
  };
  const recent = sig.recentGroups ?? [];
  const per = new Map<string, { parts: Partial<Record<ExtraKey, number>>; useful: number; overdue: number }>();
  for (const c of candidates) {
    const words = Math.max(1, c.profile.words);
    let useful = 0;
    let overdue = 0;
    for (const [l, n] of c.profile.lemmas) {
      if (!c.alreadyRead && (df.get(l) ?? 0) >= X.usefulMinTexts) useful += n;
      const r = rows.get(l);
      const at = r && r.reading.level !== 'unseen' ? r.reading.lastEvidenceAt : undefined;
      if (at && Date.parse(at) < cutoff) overdue += n;
    }
    const parts: Partial<Record<ExtraKey, number>> = {};
    if (active.usefulUnknown) parts.usefulUnknown = clamp01(useful / words / X.usefulFullShare);
    if (active.overdue) parts.overdue = clamp01(overdue / words / X.overdueFullShare);
    if (active.variety) {
      const g = domainOf(c);
      const i = g === undefined ? -1 : recent.indexOf(g);
      parts.variety = i < 0 ? 1 : i / Math.max(2, recent.length);
    }
    if (active.listening) parts.listening = sig.listenEligible!.has(c.profile.textId) ? 1 : 0;
    for (const k of Object.keys(parts) as ExtraKey[]) parts[k] = round4(parts[k]!);
    per.set(c.profile.textId, { parts, useful, overdue });
  }
  const norm = 1 + (Object.keys(active) as ExtraKey[]).filter((k) => active[k]).reduce((s, k) => s + X.weights[k], 0);
  return { per, norm };
}

export async function rankLibrary(ctx: Ctx, userId: string, offered: RankCandidate[], opts: RankOptionsWhole = {}): Promise<RankedTextWhole[]> {
  // Protected listening-assessment material is never offered for reading (a candidate that is not imported has no stored text and stays).
  const stored = await ctx.store.texts.getMany(offered.map((c) => c.profile.textId));
  const privateCorpusIds = new Set((await ctx.store.corpora.where('kind', 'testimony')).map((c) => c.id));
  const candidates = offered.filter((_, i) => {
    const text = stored[i];
    return !text || (text.kind !== 'testimony' && !privateCorpusIds.has(text.corpusId) && text.listeningAssessmentId === undefined && text.readingAssessmentId === undefined);
  });
  const challenge: Challenge = opts.challenge ?? 'steady';
  const target = RANKING.targetCoverage[challenge];
  const interests = new Set((opts.interests ?? []).map((s) => s.toLowerCase()));
  const memo: LemmaReadings = new Map();
  const W = RANKING.weights;
  const gaps = await productiveGaps(ctx, userId);
  // RECOMMENDING (`opts.reach`): the lemma rows of every candidate, read once, for the names-left-out coverage and the yield
  const lemmaRows = opts.reach && candidates.length > 0
    ? await rowsByItemId(ctx, userId, [...new Set(candidates.flatMap((c) => c.profile.lemmas.map(([l]) => l)))]) : undefined;
  const extras = opts.signals && candidates.length > 0 ? await extraParts(ctx, userId, candidates, opts.signals, lemmaRows) : undefined;
  const penalty = opts.reach ? scriptureFactor(opts.reach.scriptureShare) : 1;

  const scored = [];
  for (const c of candidates) {
    const profile = await scoreProfile(ctx, userId, c.profile, { domains: c.domains, variety: opts.targetVariety, ...(gaps.size ? { productiveGaps: gaps } : {}) }, memo);
    const rc = lemmaRows ? reachOf(c.profile, lemmaRows, profile) : undefined;
    const coverage = rc ? rc.coverage : profile.knownShare + profile.familiarShare;
    const effective = rc ? rc.effective : coverage + 0.5 * profile.metShare;
    const matched = [c.stream, ...(c.domains ?? [])].filter((x): x is string => !!x && interests.has(x.toLowerCase()));
    const ideal = RANKING.idealNewPatterns[challenge];
    const parts: RankedText['parts'] = {
      comprehensibility: comprehensibility(effective, target),
      challenge: clamp01(1 - Math.abs(profile.newPatterns.length - ideal) / (ideal + 3)),
      interest: matched.length > 0 ? 1 : 0,
      reinforcement: clamp01((profile.weakItems.length + RANKING.productiveWeight * (profile.productiveItems?.length ?? 0)) / RANKING.reinforcementFull),
      regional: regionalFit(c.variety, opts.targetVariety),
      novelty: c.alreadyRead ? 0.1 : 1,
      quality: (c.published === false ? 0 : 0.7) + (c.rights && RELIABLE_RIGHTS.has(c.rights) ? 0.3 : c.rights ? 0.1 : 0.15),
    };
    for (const k of Object.keys(parts) as Array<keyof typeof parts>) parts[k] = round4(clamp01(parts[k]));
    const extra = extras?.per.get(c.profile.textId);
    const core = (Object.keys(W) as Array<keyof typeof W>).reduce((s, k) => s + W[k] * parts[k], 0);
    const added = extra ? (Object.keys(extra.parts) as ExtraKey[]).reduce((s, k) => s + WHOLE_RANKING.weights[k] * extra.parts[k]!, 0) : 0;
    let base = extras ? (core + added) / extras.norm : core;
    // what reading it would teach: the share of the non-name words that are lemmas not yet known (a measure without it adds nothing)
    if (rc?.yield !== undefined) base = (base + REACH.yieldWeight * clamp01(rc.yield / REACH.yieldFullShare)) / (1 + REACH.yieldWeight);
    const scripture = (c as RankCandidateWhole).scripture ?? c.stream === 'scripture';
    const pen = scripture ? penalty : 1;
    scored.push({ c, profile, coverage, parts, matched, extra, base, rc, tier: (rc ? reachTier(rc) : 0) as ReachTier, pen });
  }

  // 2. controlled texts are a ramp: their weight falls as authentic candidates become comprehensible
  const authentic = scored.filter((s) => !s.c.controlled);
  const authShare = authentic.length > 0 ? authentic.filter((s) => s.coverage >= RANKING.authenticComprehensible).length / authentic.length : 0;
  const fade = 1 - RANKING.controlledFade * authShare;
  let rows = scored.map((s) => ({ ...s, score: (s.c.controlled ? s.base * fade : s.base) * s.pen }));
  // RECOMMENDING: a text below the floor is offered only when NOTHING is in reach (then the closest few, never led with)
  let aboveLevel = false;
  if (opts.reach && rows.length > 0) {
    if (rows.some((r) => r.tier < 2)) rows = rows.filter((r) => r.tier < 2);
    else {
      aboveLevel = true;
      rows = [...rows].sort((a, b) => b.coverage - a.coverage || b.score - a.score || (a.c.profile.textId < b.c.profile.textId ? -1 : 1)).slice(0, REACH.closestFew);
      rows.forEach((r, i) => { r.score = r.coverage * REACH.aboveLevelScore - i * 1e-4; }); // nearest first (ties by merit), never above what is not above his level
    }
  }

  // 1. never ahead of a comparable authentic text on comprehensibility alone: when the controlled text leads only because its
  //    comprehensibility part is higher (everything else is at least as good for the authentic one), hold it just below
  const rowOf = new Map(rows.map((r) => [r.c, r]));
  const others = (r: { base: number; parts: RankedText['parts'] }) => r.base - W.comprehensibility * r.parts.comprehensibility;
  for (const s of rows) {
    if (!s.c.controlled) continue;
    for (const a of authentic) {
      const ar = rowOf.get(a.c);
      if (!ar) continue; // left out above (below the floor)
      if (Math.abs(ar.coverage - s.coverage) > RANKING.comparableCoverage) continue;
      if (s.score >= ar.score && others(ar) + 1e-9 >= others(s) * fade) s.score = ar.score - 1e-4;
    }
  }

  // 3. order, then no more than two in a row from one work, and a small step down for the same author twice running
  const works = await workKeys(ctx, candidates);
  // (a text that would teach almost nothing new always comes after those that teach something: TIER_STEP is more than any score gap)
  const TIER_STEP = 2;
  const pool = [...rows].sort((a, b) => b.score - TIER_STEP * b.tier - (a.score - TIER_STEP * a.tier) || (a.c.profile.textId < b.c.profile.textId ? -1 : 1));
  const limit = Math.max(0, opts.limit ?? 10);
  const picked: Array<(typeof rows)[number] & { final: number }> = [];
  while (picked.length < limit && pool.length > 0) {
    const last = picked[picked.length - 1];
    const lastTwo = picked.slice(-RANKING.maxConsecutiveFromWork).map((p) => works.get(p.c.profile.textId));
    const blocked = (r: (typeof rows)[number]) => lastTwo.length === RANKING.maxConsecutiveFromWork && lastTwo.every((w) => w === works.get(r.c.profile.textId));
    const effectiveScore = (r: (typeof rows)[number]) => (last && r.c.author && r.c.author === last.c.author ? r.score * RANKING.sameAuthorKeeps : r.score);
    const ordering = (r: (typeof rows)[number]) => effectiveScore(r) - TIER_STEP * r.tier;
    let bestI = -1;
    for (let i = 0; i < pool.length; i++) {
      if (blocked(pool[i])) continue;
      if (bestI < 0 || ordering(pool[i]) > ordering(pool[bestI]) + 1e-12) bestI = i;
    }
    if (bestI < 0) bestI = 0; // only one work is left: nothing else to offer
    const [r] = pool.splice(bestI, 1);
    picked.push({ ...r, final: effectiveScore(r) });
  }

  return picked.map((r) => {
    const contributions = (Object.keys(W) as Array<keyof typeof W>).map((k) => [k, W[k] * r.parts[k]] as const).sort((a, b) => b[1] - a[1]);
    const reasons: string[] = [];
    const ex = r.extra;
    const exContrib = ex ? (Object.keys(ex.parts) as ExtraKey[]).map((k) => [k, WHOLE_RANKING.weights[k] * ex.parts[k]!] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : [];
    const extraReason = (k: ExtraKey): string | undefined => {
      if (!ex) return undefined;
      if (k === 'usefulUnknown' && ex.useful > 0) return 'Its new words come up again in other texts you could read, so learning them pays off.';
      if (k === 'overdue' && ex.overdue > 0) return `It brings back words you have not met in reading for over ${Math.round(WHOLE_RANKING.overdueDays / 7)} weeks.`;
      if (k === 'variety') return 'It is on a different subject from what you read last.';
      if (k === 'listening') return 'A recording by a human speaker is available, so you can also hear it.';
      return undefined;
    };
    for (const [k, v] of exContrib) { if (v >= RANKING.reasonMin || k === 'listening') { const why = extraReason(k); if (why) reasons.push(why); } }
    for (const [k, v] of contributions) {
      // interest and reinforcement are told whenever they apply: they are the reasons the learner can act on
      if (v < RANKING.reasonMin && k !== 'interest' && k !== 'reinforcement') continue;
      if (k === 'comprehensibility') reasons.push(`About ${pct1(r.coverage)} % of its words${r.rc ? ' (names and numbers left out)' : ''} are shown understood or likely familiar${r.parts.comprehensibility >= 0.8 ? ', close to what you asked for' : ''}.`);
      else if (k === 'interest' && r.matched.length > 0) reasons.push(`It matches your interest in ${r.matched.join(', ')}.`);
      else if (k === 'reinforcement') {
        if (r.profile.weakItems.length > 0) reasons.push(`It uses ${plural(r.profile.weakItems.length, 'word')} or phrase${r.profile.weakItems.length === 1 ? '' : 's'} you have met but still need help with, in natural context.`);
        const practising = r.profile.productiveItems?.length ?? 0;
        if (practising > 0) reasons.push(`It uses ${plural(practising, 'word')} you are practising saying (GoTell), in natural context.`);
      }
      else if (k === 'regional' && r.parts.regional >= 0.8) reasons.push('It is written in the variety of the language you are learning.');
      else if (k === 'novelty' && !r.c.alreadyRead) reasons.push('You have not read it yet.');
      else if (k === 'quality' && r.parts.quality >= 0.9) reasons.push('It is published, with its rights on record.');
      else if (k === 'challenge' && r.parts.challenge >= 0.9 && r.profile.newPatterns.length > 0) reasons.push(`It brings ${plural(r.profile.newPatterns.length, 'new construction')}, about what you asked for.`);
    }
    if (r.c.controlled && authShare > 0) reasons.push('It was written for the course; it counts for less as ordinary texts become readable for you.');
    if (reasons.length === 0) reasons.push('It is the best match among the texts offered.');
    if (r.rc) {
      if (aboveLevel) reasons.unshift(`It is above your level for now: only about ${pct1(r.rc.coverage)} % of its words (names and numbers left out) are shown understood or likely familiar. It is the closest to your level among the texts offered.`);
      else if (r.tier === 1) reasons.push('It would teach you little that is new: nearly all of its words, names aside, are words you already know.');
      if (r.pen < 1) reasons.push('Scripture is already a large share of what you have read lately, so it is offered after other texts.');
    }
    return {
      textId: r.c.profile.textId, score: round4(clamp01(r.final)), parts: r.parts, reasons, profile: r.profile,
      ...(ex && Object.keys(ex.parts).length > 0 ? { extra: ex.parts } : {}),
      ...(r.rc ? { reach: { ...r.rc, tier: r.tier, aboveLevel, scripturePenalty: r.pen } } : {}),
    };
  });
}
