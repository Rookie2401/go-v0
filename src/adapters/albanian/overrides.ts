/**
 * Corrections of analyses that an upstream source (an external analyzer, a dictionary) or this adapter's own rules
 * get wrong, kept apart from both so that every correction is inspectable and reproducible: what was changed, why,
 * by whom, when. Empty until a reviewer records one. A learner-facing analysis that came through an override says so
 * (origin 'reviewed', sourceId 'adapter-sq:override:<id>').
 */
import type { PartOfSpeech } from '../../core';

export interface SqOverride {
  id: string;
  /** The written form (normalized) the override applies to; `lemma` + `pos` narrow it to one reading when given. */
  form: string;
  /** What the source said (verbatim) and which source and version said it. */
  source: { analysis: string; sourceId: string };
  /** What Go uses instead. */
  use: { lemma: string; pos: PartOfSpeech; morph: Record<string, string>; gloss?: string };
  reason: string;
  reviewer: string;
  date: string;
}

export const SQ_OVERRIDES: SqOverride[] = [];
