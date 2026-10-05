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
import type { LearnerItemState, RankCandidate, RankOptions, RankedText } from '../core';
import { RANKING, WHOLE_RANKING } from './policy';
import { rowsByItemId, scoreProfile } from './personal';
import { productiveGaps } from './productive';
import type { LemmaReadings } from './personal';
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
export type RankOptionsWhole = RankOptions & { signals?: RankSignals };
export type RankedTextWhole = RankedText & { extra?: Partial<Record<ExtraKey, number>> };

/** The group a text belongs to for "variety of domain": its first domain, else its stream. */
export const domainOf = (x: { domains?: readonly string[]; stream?: string }): string | undefined => x.domains?.[0] ?? x.stream;

const DAY_MS = 86_400_000;

async function extraParts(ctx: Ctx, userId: string, candidates: RankCandidate[], sig: RankSignals) {
  const X = WHOLE_RANKING;
  const unread = candidates.filter((c) => !c.alreadyRead);
  const lemmas = new Set<string>();
  for (const c of candidates) for (const [l] of c.profile.lemmas) lemmas.add(l);
  const rows = lemmas.size > 0 ? await rowsByItemId(ctx, userId, [...lemmas]) : new Map<string, LearnerItemState>();
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
  const candidates = offered.filter((_, i) => stored[i]?.listeningAssessmentId === undefined);
  const challenge: Challenge = opts.challenge ?? 'steady';
  const target = RANKING.targetCoverage[challenge];
  const interests = new Set((opts.interests ?? []).map((s) => s.toLowerCase()));
  const memo: LemmaReadings = new Map();
  const W = RANKING.weights;
  const gaps = await productiveGaps(ctx, userId);
  const extras = opts.signals && candidates.length > 0 ? await extraParts(ctx, userId, candidates, opts.signals) : undefined;

  const scored = [];
  for (const c of candidates) {
    const profile = await scoreProfile(ctx, userId, c.profile, { domains: c.domains, variety: opts.targetVariety, ...(gaps.size ? { productiveGaps: gaps } : {}) }, memo);
    const coverage = profile.knownShare + profile.familiarShare;
    const effective = coverage + 0.5 * profile.metShare;
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
    scored.push({ c, profile, coverage, parts, matched, extra, base: extras ? (core + added) / extras.norm : core });
  }

  // 2. controlled texts are a ramp: their weight falls as authentic candidates become comprehensible
  const authentic = scored.filter((s) => !s.c.controlled);
  const authShare = authentic.length > 0 ? authentic.filter((s) => s.coverage >= RANKING.authenticComprehensible).length / authentic.length : 0;
  const fade = 1 - RANKING.controlledFade * authShare;
  const rows = scored.map((s) => ({ ...s, score: s.c.controlled ? s.base * fade : s.base }));

  // 1. never ahead of a comparable authentic text on comprehensibility alone: when the controlled text leads only because its
  //    comprehensibility part is higher (everything else is at least as good for the authentic one), hold it just below
  const rowOf = new Map(rows.map((r) => [r.c, r]));
  const others = (r: { base: number; parts: RankedText['parts'] }) => r.base - W.comprehensibility * r.parts.comprehensibility;
  for (const s of rows) {
    if (!s.c.controlled) continue;
    for (const a of authentic) {
      const ar = rowOf.get(a.c)!;
      if (Math.abs(ar.coverage - s.coverage) > RANKING.comparableCoverage) continue;
      if (s.score >= ar.score && others(ar) + 1e-9 >= others(s) * fade) s.score = ar.score - 1e-4;
    }
  }

  // 3. order, then no more than two in a row from one work, and a small step down for the same author twice running
  const works = await workKeys(ctx, candidates);
  const pool = [...rows].sort((a, b) => b.score - a.score || (a.c.profile.textId < b.c.profile.textId ? -1 : 1));
  const limit = Math.max(0, opts.limit ?? 10);
  const picked: Array<(typeof rows)[number] & { final: number }> = [];
  while (picked.length < limit && pool.length > 0) {
    const last = picked[picked.length - 1];
    const lastTwo = picked.slice(-RANKING.maxConsecutiveFromWork).map((p) => works.get(p.c.profile.textId));
    const blocked = (r: (typeof rows)[number]) => lastTwo.length === RANKING.maxConsecutiveFromWork && lastTwo.every((w) => w === works.get(r.c.profile.textId));
    const effectiveScore = (r: (typeof rows)[number]) => (last && r.c.author && r.c.author === last.c.author ? r.score * RANKING.sameAuthorKeeps : r.score);
    let bestI = -1;
    for (let i = 0; i < pool.length; i++) {
      if (blocked(pool[i])) continue;
      if (bestI < 0 || effectiveScore(pool[i]) > effectiveScore(pool[bestI]) + 1e-12) bestI = i;
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
      if (k === 'comprehensibility') reasons.push(`About ${pct1(r.coverage)} % of its words are shown understood or likely familiar${r.parts.comprehensibility >= 0.8 ? ', close to what you asked for' : ''}.`);
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
    return {
      textId: r.c.profile.textId, score: round4(clamp01(r.final)), parts: r.parts, reasons, profile: r.profile,
      ...(ex && Object.keys(ex.parts).length > 0 ? { extra: ex.parts } : {}),
    };
  });
}
