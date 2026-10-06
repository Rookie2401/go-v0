/**
 * `ladder:place` logic: where could a candidate text enter the ladder? Measures the candidate's coverage (>= 3 earlier
 * encounters, PROPN and numerals known, a guessed name not) after Stage 0 and after each unit in turn, and finds the first point at which it
 * reaches the placement threshold (95 %). If it never does, the text is library material, not ladder material.
 */
import type { LanguageAdapter } from '../core';
import type { CorpusDocument } from '../ingest';
import { analyseDocument, Progress } from './analyse';
import { POLICY } from './policy';
import type { LadderPolicy } from './policy';
import type { LoadedLadder } from './types';

export interface PlacementStep {
  /** "stage0" (or "start" when the ladder has no Stage 0 head), then each unit id. */
  after: string;
  cov3: number;
}

export interface Placement {
  words: number;
  steps: PlacementStep[];
  threshold: number;
  /** The first point at which coverage reaches the threshold; undefined = library, not ladder. */
  enterAfter?: string;
  best: PlacementStep;
  /** The sentence `ladder:place` prints. */
  verdict: string;
}

export function placeCandidate(loaded: LoadedLadder, candidate: CorpusDocument, deps: { adapter: LanguageAdapter; policy?: LadderPolicy }): Placement {
  const policy = deps.policy ?? POLICY;
  const cand = analyseDocument(deps.adapter, candidate);
  const progress = new Progress(policy.minEncounters);
  const steps: PlacementStep[] = [];
  const measure = (after: string): void => { steps.push({ after, cov3: Number(progress.coverage(cand).cov3.toFixed(4)) }); };
  for (const h of loaded.head) progress.add(analyseDocument(deps.adapter, h.doc));
  measure(loaded.ladder.after === 'stage0' ? 'stage0' : 'start');
  for (const lu of loaded.units) {
    if (lu.status === 'ok' && lu.doc) progress.add(analyseDocument(deps.adapter, lu.doc));
    measure(lu.unit.id); // a missing unit adds nothing: the learner has not read it
  }
  const hit = cand.words > 0 ? steps.find((s) => s.cov3 >= policy.placementThreshold) : undefined;
  const best = steps.reduce((b, s) => (s.cov3 >= b.cov3 ? s : b), steps[0]);
  const pct = (x: number): string => `${(x * 100).toFixed(1)} %`;
  const verdict = hit
    ? `could enter after ${hit.after} (${pct(hit.cov3)} known, threshold ${pct(policy.placementThreshold)})`
    : `library, not ladder (best: ${pct(best.cov3)} after ${best.after === steps[steps.length - 1].after ? 'the last unit' : best.after})`;
  return { words: cand.words, steps, threshold: policy.placementThreshold, ...(hit ? { enterAfter: hit.after } : {}), best, verdict };
}
