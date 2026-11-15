/**
 * The six knowledge levels (owner, 2026-10-10): how well a learner knows a unit, as one scale shared by the Repository
 * (the projection computes `UnitKnowledge.level`), GoLearn (the underline on the page, the card's rating row), GoReview
 * (what to draw from) and GoReview (review is a natural progression along this scale, not a separate metric).
 *
 * The thresholds live in the engine (`packages/repository-engine`, `levelOf`), documented there and in
 * docs/ecosystem/GOLEARN-ACTIVE-DESIGN.md; this file holds only the vocabulary, its order and its words.
 */
export type KnowledgeLevel = 'new' | 'seen' | 'recognized' | 'familiar' | 'known' | 'automatic';

/** From the least to the most established. */
export const KNOWLEDGE_LEVELS: readonly KnowledgeLevel[] = ['new', 'seen', 'recognized', 'familiar', 'known', 'automatic'];

export const KNOWLEDGE_LEVEL_RANK: Record<KnowledgeLevel, number> = { new: 0, seen: 1, recognized: 2, familiar: 3, known: 4, automatic: 5 };

/** The words a learner sees for each level. */
export const KNOWLEDGE_LEVEL_WORDS: Record<KnowledgeLevel, { title: string; detail: string }> = {
  new: { title: 'New', detail: 'not met yet, or marked as new' },
  seen: { title: 'Seen', detail: 'met or looked up, nothing shows it was understood' },
  recognized: { title: 'Recognized', detail: 'understood with help, or recognised once' },
  familiar: { title: 'Familiar', detail: 'recognised repeatedly while reading' },
  known: { title: 'Known', detail: 'recognised reliably, or marked as known' },
  automatic: { title: 'Automatic', detail: 'produced or retrieved without help, or marked as automatic' },
};

export const isKnowledgeLevel = (v: unknown): v is KnowledgeLevel => typeof v === 'string' && (KNOWLEDGE_LEVELS as readonly string[]).includes(v);

/**
 * The learner's own marks before this scale (the card's three choices, stored in ItemMarked events that must keep their
 * meaning): "New to me" → new, "I recognise it" → recognized, "I can use it" → known. Stored events are never rewritten;
 * the projection reads old and new marks through this map.
 */
export const LEGACY_MARK_LEVEL: Record<'learning' | 'known' | 'productive', KnowledgeLevel> = { learning: 'new', known: 'recognized', productive: 'known' };

/** A mark as an event may carry it: one of the six levels, or one of the three older words. */
export type LevelMark = KnowledgeLevel | keyof typeof LEGACY_MARK_LEVEL;

export const levelOfMark = (mark: LevelMark): KnowledgeLevel => (isKnowledgeLevel(mark) ? mark : LEGACY_MARK_LEVEL[mark]);

/**
 * What a reader needs of a knowledge row to decide how to SHOW it (structural, so `UnitKnowledge` and the extension's compact
 * `KnowledgeView` both fit without this file importing either).
 */
export interface DisplayableRow {
  level?: string;
  selfMark?: unknown;
  dimensions?: Record<string, { observations?: number; negative?: number } | undefined>;
}

/**
 * Met only in passing (owner, 2026-11-05: "when the user clicks on a word to see the definition, it marks every word in that sentence as
 * seen"). A page or a verse records a bare encounter for every word on it, which the Repository rightly counts (GoReview draws a word after
 * three encounters) and lifts to Seen; the readers must not paint that as "seen". A row was met only in passing when ALL hold:
 *   - it has no `selfMark`;
 *   - its level is 'seen' (the engine's; callers whose row carries none pass the level they worked out);
 *   - `dimensions.exposure.negative` is 0 or absent (a lookup or an assistance request adds to it; an encounter and audio playback do not);
 *   - every dimension other than `exposure` has `observations` 0 or absent.
 * This is a DISPLAY rule only: the Repository's level is unchanged.
 */
export function metOnlyInPassing(row: DisplayableRow | null | undefined, level: string | undefined = row?.level): boolean {
  if (!row || row.selfMark || level !== 'seen') return false;
  const d = row.dimensions ?? {};
  if ((d.exposure?.negative ?? 0) > 0) return false;
  for (const [k, v] of Object.entries(d)) if (k !== 'exposure' && (v?.observations ?? 0) > 0) return false;
  return true;
}

/** The level to SHOW for one row: its level, except 'new' for a row met only in passing (see `metOnlyInPassing`). */
export function displayLevelOf(row: DisplayableRow | null | undefined, level: string | undefined = row?.level): KnowledgeLevel {
  const l = isKnowledgeLevel(level) ? level : 'new';
  return metOnlyInPassing(row, l) ? 'new' : l;
}
