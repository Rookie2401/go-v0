/**
 * Gold format for word segmentation (JSON Lines, one sentence per line) and the strata of the course gold set.
 * See docs/thai/BENCHMARKS.md section 1 for the conventions (offsets, whitespace, punctuation).
 */

/** The eight strata of the course gold set (docs/PLAN6.md). */
export const COURSE_STRATA = ['stage0', 'mana-mani', 'childrens-literature', 'modern-literary', 'grade8-literary', 'regional', 'chotmai', 'scripture'] as const;
export type CourseStratum = (typeof COURSE_STRATA)[number];

/** The two strata of the set derived from Wiktionary usage examples (never the course's own). */
export const WIKTIONARY_STRATA = ['wiktionary-example', 'wiktionary-quotation'] as const;

export const ALL_STRATA: readonly string[] = [...COURSE_STRATA, ...WIKTIONARY_STRATA];

/** Overall target for the course gold set. */
export const COURSE_TARGET = { min: 500, max: 1000 } as const;

export const GOLD_RIGHTS = ['rights-safe', 'personal-copy', 'derived-cc-by-sa'] as const;
export type GoldRights = (typeof GOLD_RIGHTS)[number];

export interface GoldSource {
  title: string;
  licence: string;
  rights: GoldRights;
}

export interface GoldSentence {
  id: string;
  lang: 'th';
  stratum: string;
  /** Exact sentence text: NFC, no leading or trailing whitespace, no newline, no "|". */
  text: string;
  /** UTF-16 offsets at which a new word starts, excluding 0, strictly increasing. */
  boundaries: number[];
  source: GoldSource;
  /** Who or what drew the word boundaries (never left blank). */
  tokenizedBy: string;
  /** A named person who checked the boundaries by hand, and when (ISO date). Absent on machine-derived sets. */
  checkedBy?: string;
  checkedAt?: string;
  /** Held out: never printed by the tools, excluded from ordinary runs, evaluated only with an explicit --held-out. */
  heldOut?: boolean;
  notes?: string;
}

export interface GoldIssue { code: string; message: string }

/** One sentence of the editing format. */
export interface EditingEntry {
  id: string;
  heldOut: boolean;
  /** The sentence text with every "|" removed. */
  text: string;
  boundaries: number[];
}
