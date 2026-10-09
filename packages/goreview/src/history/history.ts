/**
 * REVIEW HISTORY — what the event log says was asked and answered, per deck item and per assessment dimension. Read-only:
 * counts and outcomes as recorded, never a mastery claim. The nine assessment dimensions stay apart (a written-recognition
 * pass says nothing about auditory recognition).
 *
 * Which dimension an event belongs to: `payload.assessmentDimension` (what GoReview's evidence builder writes) or `payload.dimension` when it is one of the nine, else the dimension of
 * `payload.family`, else the dimension parsed from the item id (`card:<dimension>:<unitId>`), else 'unclassified'.
 */
import type { GoEvent } from '../../../repository-contract/src';
import { ASSESSMENT_DIMENSIONS, FAMILY_DIMENSION } from '../types';
import type { AssessmentDimension, DeckItem, ExerciseFamily, GradeOutcome } from '../types';

export const REVIEW_KINDS: readonly string[] = ['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed'];

export interface HistoryEntry {
  eventId: string;
  at: string;
  outcome: GradeOutcome | 'unknown';
  rating: 1 | 2 | 3 | 4 | null;
  assisted: boolean;
  family?: ExerciseFamily;
}

export interface DimensionHistory {
  dimension: AssessmentDimension | 'unclassified';
  reviews: number;
  correct: number;
  incorrect: number;
  /** partial, ambiguous, invalid-question, unable-to-grade and unknown outcomes. */
  other: number;
  /** Reviews that carried no rating (and so never moved the schedule). */
  unscored: number;
  assisted: number;
  again: number;
  last?: HistoryEntry;
}

export interface ItemHistory {
  itemId: string;
  unitId?: string;
  reviews: number;
  byDimension: Partial<Record<AssessmentDimension | 'unclassified', DimensionHistory>>;
  first?: HistoryEntry;
  last?: HistoryEntry;
}

export interface ReviewHistory { items: Record<string, ItemHistory>; totalReviews: number }

export interface HistoryOptions { itemId?: string; unitId?: string; since?: string; until?: string; languageId?: string }

const isDimension = (x: unknown): x is AssessmentDimension => typeof x === 'string' && (ASSESSMENT_DIMENSIONS as readonly string[]).includes(x);
const OUTCOMES = ['correct', 'incorrect', 'partial', 'ambiguous', 'invalid-question', 'unable-to-grade'];

function dimensionOf(e: GoEvent, itemId: string): AssessmentDimension | 'unclassified' {
  const p = e.payload as Record<string, unknown>;
  if (isDimension(p.assessmentDimension)) return p.assessmentDimension;
  if (isDimension(p.dimension)) return p.dimension;
  if (typeof p.family === 'string' && p.family in FAMILY_DIMENSION) return FAMILY_DIMENSION[p.family as ExerciseFamily];
  const m = /^card:([^:]+):/u.exec(itemId);
  if (m && isDimension(m[1])) return m[1];
  return 'unclassified';
}

function outcomeOf(p: Record<string, unknown>): HistoryEntry['outcome'] {
  if (typeof p.outcome === 'string' && OUTCOMES.includes(p.outcome)) return p.outcome as GradeOutcome;
  if (p.correct === true) return 'correct';
  if (p.correct === false) return 'incorrect';
  return 'unknown';
}

export function reviewHistory(events: readonly GoEvent[], opts: HistoryOptions = {}): ReviewHistory {
  const since = opts.since ? Date.parse(opts.since) : undefined;
  const until = opts.until ? Date.parse(opts.until) : undefined;
  const seen = new Set<string>();
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: ReviewHistory = { items: {}, totalReviews: 0 };

  for (const e of sorted) {
    if (!REVIEW_KINDS.includes(e.kind) || seen.has(e.id)) continue;
    seen.add(e.id);
    if (opts.languageId !== undefined && e.languageId !== opts.languageId) continue;
    const t = Date.parse(e.at);
    if ((since !== undefined && t < since) || (until !== undefined && t > until)) continue;
    const itemId = e.subject?.cardId;
    if (!itemId) continue;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const unitId = e.subject.itemIds?.[0] ?? (typeof p.unitId === 'string' ? p.unitId : undefined);
    if (opts.itemId !== undefined && itemId !== opts.itemId) continue;
    if (opts.unitId !== undefined && unitId !== opts.unitId && !(e.subject.itemIds ?? []).includes(opts.unitId)) continue;

    const rating = p.rating === 1 || p.rating === 2 || p.rating === 3 || p.rating === 4 ? p.rating : null;
    const family = typeof p.family === 'string' && p.family in FAMILY_DIMENSION ? (p.family as ExerciseFamily) : undefined;
    const entry: HistoryEntry = {
      eventId: e.id, at: e.at, outcome: outcomeOf(p), rating, assisted: p.hinted === true || e.evidence?.assisted === true, ...(family ? { family } : {}),
    };
    const dim = dimensionOf(e, itemId);
    const item = (out.items[itemId] ??= { itemId, ...(unitId ? { unitId } : {}), reviews: 0, byDimension: {} });
    const d = (item.byDimension[dim] ??= { dimension: dim, reviews: 0, correct: 0, incorrect: 0, other: 0, unscored: 0, assisted: 0, again: 0 });
    item.reviews += 1;
    out.totalReviews += 1;
    d.reviews += 1;
    if (entry.outcome === 'correct') d.correct += 1;
    else if (entry.outcome === 'incorrect') d.incorrect += 1;
    else d.other += 1;
    if (rating === null) d.unscored += 1;
    if (rating === 1) d.again += 1;
    if (entry.assisted) d.assisted += 1;
    d.last = entry;
    item.first ??= entry;
    item.last = entry;
  }
  return out;
}

const DIM_LABEL = (d: string): string => d.replace(/-/gu, ' ');
const RATING = ['', 'Again', 'Hard', 'Good', 'Easy'];

/** A plain-language account of one deck item for the UI: why it is there, what was asked, and how it went. */
export function explainItem(item: DeckItem, history: ReviewHistory | ItemHistory | undefined): string {
  const h: ItemHistory | undefined = history && 'items' in history ? history.items[item.itemId] : history;
  const lines: string[] = [];
  lines.push(`Added ${item.addedAt.slice(0, 10)} ${item.addedBy === 'learner' ? 'by you' : 'from your reading'}${item.reasons.length ? `: ${item.reasons.map((r) => r.split(' | ')[0]).join('; ')}` : ''}.`);
  if (!h || h.reviews === 0) {
    lines.push('Not reviewed yet.');
  } else {
    lines.push(`Reviewed ${h.reviews} time${h.reviews === 1 ? '' : 's'}.`);
    for (const d of Object.values(h.byDimension)) {
      if (!d) continue;
      const bits = [`${d.correct} correct`, `${d.incorrect} incorrect`];
      if (d.other) bits.push(`${d.other} not judged`);
      if (d.assisted) bits.push(`${d.assisted} with help`);
      lines.push(`${DIM_LABEL(d.dimension)}: ${bits.join(', ')}${d.last ? `; last ${d.last.at.slice(0, 10)}${d.last.rating ? ` (${RATING[d.last.rating]})` : ' (not scheduled)'}` : ''}.`);
    }
  }
  if (item.status !== 'active') lines.push(`Currently ${item.status}${item.snoozedUntil ? ` until ${item.snoozedUntil.slice(0, 10)}` : ''}.`);
  else lines.push(`Next due ${item.schedule.due.slice(0, 10)}.`);
  return lines.join(' ');
}
