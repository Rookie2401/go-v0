/**
 * adapted from src/gotell/provider.ts (2026-10-09) — the `repairs` method of RuleBasedSuggestionProvider, as a pure function.
 *
 * Repairs come from the checker's own replacements, applied to the learner's sentence. When EVERY detected issue in the sentence
 * has a non-overlapping replacement, ONE combined repair is planned; otherwise each replacement is planned on its own. The legacy
 * provider then let the service re-run the checker and the never-add-content test on each result; here that validation is
 * `validateRewrite` in ../engine/analyze.ts, applied to every repair this function plans.
 */
import { applyEditsDetailed } from './text';

export interface Replaceable { suggestion?: { start: number; end: number; replacement: string } }

export interface PlannedRepair {
  /** Indexes into the list of errors this repair resolves. */
  errorIndexes: number[];
  suggested: string;
  /** Where the edits landed in `suggested` — the only places a repair may introduce words. */
  spans: Array<{ start: number; end: number }>;
}

const validSuggestion = (s: Replaceable['suggestion'], len: number): s is NonNullable<Replaceable['suggestion']> =>
  !!s && Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end <= len && s.start <= s.end;

export function planRepairs(text: string, errors: ReadonlyArray<Replaceable>): PlannedRepair[] {
  const valid = errors.map((e, i) => ({ i, s: validSuggestion(e.suggestion, text.length) ? e.suggestion : undefined })).filter((x): x is { i: number; s: NonNullable<Replaceable['suggestion']> } => !!x.s);
  if (errors.length > 1 && valid.length === errors.length) {
    const all = applyEditsDetailed(text, valid.map((v) => v.s));
    if (all && all.text !== text) return [{ errorIndexes: valid.map((v) => v.i), suggested: all.text, spans: all.spans }];
  }
  const out: PlannedRepair[] = [];
  for (const v of valid) {
    const one = applyEditsDetailed(text, [v.s]);
    if (one && one.text !== text) out.push({ errorIndexes: [v.i], suggested: one.text, spans: one.spans });
  }
  return out;
}
