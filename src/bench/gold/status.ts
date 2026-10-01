/**
 * Course gold set, status: sentences per stratum against the target. Counts only: held-out sentences are counted,
 * never shown. Only sentences a named person has checked (checkedBy) count toward the target.
 */
import { COURSE_STRATA, COURSE_TARGET, type GoldSentence } from './types';

export interface StratumStatus { stratum: string; checked: number; heldOut: number; unchecked: number }

export interface GoldStatus {
  strata: StratumStatus[];
  checkedTotal: number;
  heldOutTotal: number;
  target: { min: number; max: number };
  emptyStrata: string[];
  /** 'below' (< min), 'within' (min..max), 'above' (> max). */
  vsTarget: 'below' | 'within' | 'above';
  missingToMin: number;
}

export function goldStatus(sentences: readonly GoldSentence[]): GoldStatus {
  const strata: StratumStatus[] = COURSE_STRATA.map((stratum) => ({ stratum, checked: 0, heldOut: 0, unchecked: 0 }));
  const byName = new Map(strata.map((s) => [s.stratum as string, s]));
  for (const g of sentences) {
    const s = byName.get(g.stratum);
    if (!s) continue; // not a course stratum (e.g. the Wiktionary set)
    if (g.checkedBy) { s.checked++; if (g.heldOut) s.heldOut++; } else s.unchecked++;
  }
  const checkedTotal = strata.reduce((a, s) => a + s.checked, 0);
  return {
    strata,
    checkedTotal,
    heldOutTotal: strata.reduce((a, s) => a + s.heldOut, 0),
    target: { ...COURSE_TARGET },
    emptyStrata: strata.filter((s) => s.checked === 0).map((s) => s.stratum),
    vsTarget: checkedTotal < COURSE_TARGET.min ? 'below' : checkedTotal > COURSE_TARGET.max ? 'above' : 'within',
    missingToMin: Math.max(0, COURSE_TARGET.min - checkedTotal),
  };
}
