/**
 * Unit-boundary metrics against a gold set. A boundary is the offset at which a new reading unit starts (excluding the
 * first), exactly as in the gold format. Micro-averaged precision / recall / F1 overall and per stratum (the constructed
 * set's strata are hazards), paragraph exact-match (the system's boundary set equals the gold one), and every case with
 * an error retained, each error named: over-split (a boundary the gold does not have), under-split (a gold boundary
 * missing), shifted (an over-split and an under-split within SHIFT_WINDOW characters of one another).
 * 0/0 is reported as 1, as in `shared.prf`; the raw counts are always carried.
 */
import { canonicalBoundaries, prf, setCounts, type Prf } from '../shared';
import type { UnitGoldCase } from './gold';
import { boundariesOfSpans, coversParagraph, type UnitSystem } from './systems';

export const SHIFT_WINDOW = 3;

export type UnitErrorKind = 'over-split' | 'under-split' | 'shifted';

export interface UnitError {
  kind: UnitErrorKind;
  /** The system's offset (over-split, shifted) or the gold offset (under-split). */
  at: number;
  /** For `shifted`: where the gold has the boundary. */
  goldAt?: number;
  /** The text around the offset with `⟂` marking the cut. */
  context: string;
}

export interface CaseResult {
  id: string;
  stratum: string;
  paragraph: string;
  gold: number[];
  system: number[];
  tp: number;
  fp: number;
  fn: number;
  exact: boolean;
  /** False when the system's spans do not slice the paragraph exactly (a defect in the system, reported). */
  covers: boolean;
  errors: UnitError[];
}

const around = (text: string, at: number, r = 10): string =>
  `${text.slice(Math.max(0, at - r), at).replace(/\n/g, '↵')}⟂${text.slice(at, at + r).replace(/\n/g, '↵')}`;

export function classifyErrors(paragraph: string, gold: readonly number[], system: readonly number[]): UnitError[] {
  const g = new Set(gold);
  const s = new Set(system);
  const extra = system.filter((b) => !g.has(b)).sort((a, b) => a - b);
  const missing = gold.filter((b) => !s.has(b)).sort((a, b) => a - b);
  const usedMissing = new Set<number>();
  const errors: UnitError[] = [];
  for (const e of extra) {
    const near = missing.filter((m) => !usedMissing.has(m)).sort((a, b) => Math.abs(a - e) - Math.abs(b - e))[0];
    if (near !== undefined && Math.abs(near - e) <= SHIFT_WINDOW) {
      usedMissing.add(near);
      errors.push({ kind: 'shifted', at: e, goldAt: near, context: around(paragraph, e) });
    } else {
      errors.push({ kind: 'over-split', at: e, context: around(paragraph, e) });
    }
  }
  for (const m of missing) if (!usedMissing.has(m)) errors.push({ kind: 'under-split', at: m, context: around(paragraph, m) });
  return errors.sort((a, b) => a.at - b.at);
}

export function evaluateCase(c: UnitGoldCase, system: UnitSystem): CaseResult {
  const spans = system.split(c.paragraph);
  const sys = canonicalBoundaries(c.paragraph, boundariesOfSpans(spans));
  const { tp, fp, fn } = setCounts(c.unitBoundaries, sys);
  return {
    id: c.id, stratum: c.stratum, paragraph: c.paragraph, gold: c.unitBoundaries, system: sys, tp, fp, fn,
    exact: fp === 0 && fn === 0, covers: coversParagraph(c.paragraph, spans),
    errors: classifyErrors(c.paragraph, c.unitBoundaries, sys),
  };
}

export interface Aggregate extends Prf { paragraphs: number; exact: number; exactRate: number }

export function aggregate(results: readonly CaseResult[]): Aggregate {
  let tp = 0, fp = 0, fn = 0, exact = 0;
  for (const r of results) { tp += r.tp; fp += r.fp; fn += r.fn; if (r.exact) exact++; }
  return { ...prf(tp, fp, fn), paragraphs: results.length, exact, exactRate: results.length ? exact / results.length : 1 };
}

export interface UnitReport {
  system: string;
  overall: Aggregate;
  byStratum: Array<{ stratum: string } & Aggregate>;
  results: CaseResult[];
  /** Cases with at least one error, in file order. */
  failing: CaseResult[];
}

export function evaluateSystem(cases: readonly UnitGoldCase[], system: UnitSystem): UnitReport {
  const results = cases.map((c) => evaluateCase(c, system));
  const strata = [...new Set(cases.map((c) => c.stratum))];
  return {
    system: system.id,
    overall: aggregate(results),
    byStratum: strata.map((stratum) => ({ stratum, ...aggregate(results.filter((r) => r.stratum === stratum)) })),
    results,
    failing: results.filter((r) => !r.exact),
  };
}

/** Error counts by kind, over a set of results. */
export function errorCounts(results: readonly CaseResult[]): Record<UnitErrorKind, number> {
  const out: Record<UnitErrorKind, number> = { 'over-split': 0, 'under-split': 0, shifted: 0 };
  for (const r of results) for (const e of r.errors) out[e.kind]++;
  return out;
}
