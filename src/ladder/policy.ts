/**
 * The thresholds of the ladder gate (docs/LADDER.md, "The gate"). One place; provisional, like the document says.
 *
 * Coverage is a fraction (0.92 = 92 %) of a unit's running words whose lemma appeared at least COVERAGE_MIN_ENCOUNTERS times
 * in the texts before it (Stage 0 included); PROPN and numerals count as known (a name only guessed from word marks does not: analyse.ts `isNameGuess`).
 */

/** Encounters in earlier texts after which a lemma counts as "known" for the audit. An audit threshold, not mastery. */
export const COVERAGE_MIN_ENCOUNTERS = 3;

/**
 * Warning / error floors for the coverage of a unit. `adapted` units use the `controlled` band (LADDER.md: reviewed like a
 * controlled text). The controlled warning was 92 % until 2026-10-06: drafters padded units with known words and avoided
 * ordinary ones to stay above it, which made the Spanish ladder stilted (docs/audits/B2-SIMULATION.md). A warning is
 * advice for a reviewer, never a target to write to.
 */
export const COVERAGE_BANDS = {
  controlled: { warn: 0.88, error: 0.85 },
  authentic: { warn: 0.92, error: 0.88 },
} as const;

/**
 * The first units after Stage 0 are allowed one band lower, because Stage 0 gives only a few hundred words
 * (warning at 85 %, error at 78 %). The spec states the figures once; they apply to every kind of unit.
 */
export const FIRST_UNITS_ALLOWANCE = { units: 2, warn: 0.85, error: 0.78 } as const;

/** Cliff: the drop (in percentage points) of a unit's coverage below the mean coverage of the previous three units. */
export const CLIFF = { previousUnits: 3, warnPoints: 6, errorPoints: 12 } as const;

/** New lemmas (never met before) per 100 running words. */
export const NEW_LEMMAS_PER_100 = { warn: 5, error: 9 } as const;

/**
 * Recycling: a lemma first met in a unit should appear at least `minEncounters` more times within the next `window` units;
 * the warning fires when more than `maxUnmetShare` of the unit's new lemmas miss that. Not judged for a unit with fewer than
 * `window` units after it (the window would be truncated).
 */
export const RECYCLING = { window: 6, minEncounters: 3, maxUnmetShare: 0.25 } as const;

/**
 * Orphans (a warning for every language, never an error): a lemma first met in a unit that is never met again in any later unit of
 * the ladder. The warning fires for a unit when more than `maxShare` of its new lemmas are orphans. A unit with fewer than
 * `minLaterUnits` readable units after it is not judged (the end of a ladder has nothing after it to come back in).
 */
export const ORPHANS = { maxShare: 0.15, minLaterUnits: 3 } as const;

/**
 * Recurrence intervals (a warning for every language, never an error). For each new lemma of a unit, the word distance between its
 * successive meetings (see gate.ts `recurrenceOf`); the warning fires for a unit when the median second gap is shorter than the
 * median first gap, i.e. the intervals do not widen. Judged only when at least `minLemmas` of the unit's new lemmas are met three or
 * more times (fewer would make a median noise).
 */
export const RECURRENCE = { minLemmas: 5 } as const;

/** A stage whose words are more than this share Scripture draws a warning. */
export const SCRIPTURE_SHARE_MAX = 0.4;

/** `ladder:place`: a candidate text can enter the ladder after the first unit at which its coverage reaches this. */
export const PLACEMENT_THRESHOLD = 0.95;

export interface LadderPolicy {
  minEncounters: number;
  coverage: { controlled: { warn: number; error: number }; authentic: { warn: number; error: number } };
  firstUnits: { units: number; warn: number; error: number };
  cliff: { previousUnits: number; warnPoints: number; errorPoints: number };
  newLemmasPer100: { warn: number; error: number };
  recycling: { window: number; minEncounters: number; maxUnmetShare: number };
  orphans: { maxShare: number; minLaterUnits: number };
  recurrence: { minLemmas: number };
  scriptureShareMax: number;
  placementThreshold: number;
}

export const POLICY: LadderPolicy = {
  minEncounters: COVERAGE_MIN_ENCOUNTERS,
  coverage: COVERAGE_BANDS,
  firstUnits: FIRST_UNITS_ALLOWANCE,
  cliff: CLIFF,
  newLemmasPer100: NEW_LEMMAS_PER_100,
  recycling: RECYCLING,
  orphans: ORPHANS,
  recurrence: RECURRENCE,
  scriptureShareMax: SCRIPTURE_SHARE_MAX,
  placementThreshold: PLACEMENT_THRESHOLD,
};
