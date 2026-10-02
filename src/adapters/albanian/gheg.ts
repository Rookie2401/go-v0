/**
 * Gheg forms related to their Standard Albanian equivalents: correspondences, not translations (asht ↔ është,
 * me punue ↔ të punoj / për të punuar, nji ↔ një). The text is never changed. Package Q4.
 * STUB written by the coordinator: the signatures are final (docs/PLAN13.md), the body is the owning package's work.
 */

export interface SqCorrespondence {
  /** The Standard Albanian form (or forms) this written form corresponds to. */
  standard: string;
  /** Which regular correspondence or listed pair says so, in plain words. */
  rule: string;
  /** A listed pair is surer than a pattern. */
  confidence: number;
  /** 'aln' for Gheg in general; a narrower code only when the source says so. */
  variety: string;
}

/** Standard equivalents of a Gheg form, restricted to forms `known` accepts as Standard Albanian. May be empty. */
export function ghegToStandard(_form: string, _known: (form: string) => boolean): SqCorrespondence[] {
  return [];
}
