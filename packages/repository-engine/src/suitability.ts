/**
 * Reading suitability of a permitted sample (§12). Counts how many of a sample's word tokens the learner's evidence
 * supports, lists likely difficulties and says how reliable that is. Never a level label of any scale.
 */
import type { LinguisticUnit, SuitabilityEstimate, UnitKnowledge } from '../../repository-contract/src';

export const SUITABILITY_RULES = {
  recognizedScore: 0.6, recognizedConfidence: 0.3,
  uncertainFrom: 0.4,
  difficultBelow: 0.4,
  difficultConstructionBelow: 0.5,
  densityWeight: 1,
} as const;

export interface SuitabilityInputs {
  languageId: string;
  /** One id per word-token occurrence of the sample (repeats count: this is a token count). */
  unitIds: string[];
  tokenCount: number;
  constructionIds: string[];
  rows: Map<string, UnitKnowledge>;
  units: Map<string, LinguisticUnit>;
  modelVersion: string;
}

const judgedWeight = (r: UnitKnowledge): number =>
  Object.entries(r.dimensions).reduce((s, [d, e]) => (d === 'exposure' ? s : s + e.weight), 0);

export function estimateSuitability(inp: SuitabilityInputs): SuitabilityEstimate {
  const R = SUITABILITY_RULES;
  const wordTokens = inp.unitIds.length;
  let recognized = 0, uncertain = 0, unknown = 0, evidenced = 0;
  const familiar = new Set<string>();
  const difficult: Array<{ unitId: string; reason: string }> = [];
  const classified = new Map<string, 'recognized' | 'uncertain' | 'unknown'>();

  const classify = (id: string): 'recognized' | 'uncertain' | 'unknown' => {
    const row = inp.rows.get(id);
    if (!row) return 'unknown'; // no row: nothing is known about the learner and this unit
    const rr = row.dimensions.readingRecognition;
    if (rr.observations > 0 && rr.score >= R.recognizedScore && rr.confidence >= R.recognizedConfidence) return 'recognized';
    if (rr.observations > 0 && rr.score < R.difficultBelow && rr.confidence >= R.recognizedConfidence) return 'unknown'; // confidently not known
    return 'uncertain'; // score 0.4-0.6, or too little confidence, or evidence only of other kinds (exposure, assisted)
  };
  for (const id of new Set(inp.unitIds)) classified.set(id, classify(id));
  for (const id of inp.unitIds) {
    const c = classified.get(id)!;
    if (c === 'recognized') recognized++; else if (c === 'uncertain') uncertain++; else unknown++;
    const row = inp.rows.get(id);
    if (row && judgedWeight(row) >= R.densityWeight) evidenced++;
  }
  for (const [id, c] of classified) if (c === 'recognized') familiar.add(id);

  for (const id of [...classified.keys()].sort()) {
    const rr = inp.rows.get(id)?.dimensions.readingRecognition;
    if (rr && rr.weight > 0 && rr.score < R.difficultBelow) {
      difficult.push({ unitId: id, reason: `reading recognition ${rr.score.toFixed(2)} on ${rr.weight.toFixed(2)} weighted observations (${rr.negative.toFixed(2)} negative)` });
    }
  }

  const difficultConstructions: Array<{ unitId: string; reason: string }> = [];
  for (const id of [...new Set(inp.constructionIds)].sort()) {
    const g = inp.rows.get(id)?.dimensions.grammaticalUnderstanding;
    if (g && g.weight > 0 && (g.score < R.difficultConstructionBelow || g.negative > g.positive)) {
      difficultConstructions.push({ unitId: id, reason: `grammatical understanding ${g.score.toFixed(2)}; ${g.positive.toFixed(2)} positive vs ${g.negative.toFixed(2)} negative` });
    }
  }

  // Pack coverage: how many distinct units the linguistic store can vouch for.
  const all = [...new Set([...inp.unitIds, ...inp.constructionIds])].sort();
  const coverageGaps: string[] = [];
  for (const id of all) {
    const u = inp.units.get(id);
    if (!u) coverageGaps.push(`${id}: not in the linguistic store`);
    else if (u.status === 'provisional' || u.status === 'conflicted' || u.status === 'invalidated') coverageGaps.push(`${id}: ${u.status} analysis`);
  }
  const packCoverage = all.length ? 1 - coverageGaps.length / all.length : 0;
  const evidenceDensity = wordTokens ? evidenced / wordTokens : 0;
  const reliability = Math.round(Math.min(1, evidenceDensity) * packCoverage * 1e9) / 1e9;

  return {
    languageId: inp.languageId, tokens: inp.tokenCount, wordTokens, recognized, uncertain, unknown,
    familiarUnits: [...familiar].sort(), difficultUnits: difficult, difficultConstructions, reliability, coverageGaps, modelVersion: inp.modelVersion,
  };
}
