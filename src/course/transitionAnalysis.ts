import type { LanguageCode, TextProfile } from '../core';

export interface StageExposure {
  stageId: string;
  lang: LanguageCode;
  publishedTexts: number;
  publishedWorks: number;
  tokens: number;
  medianWorkLength: number;
  forms: Record<string, number>;
  lemmas: Record<string, number>;
  patterns: Record<string, number>;
  genres: string[];
  registers: string[];
  orthographies: string[];
  /** Missing/low-confidence lemma analysis must not become a claim of known vocabulary. */
  analysedTokenShare: number;
}

export interface TransitionDiagnostic {
  from: string;
  to: string;
  risk: 'low' | 'moderate' | 'high' | 'broken';
  reasons: string[];
  lexicalOverlap: number | null;
  newLemmaDensity: number | null;
  newPatternShare: number | null;
  lengthRatio: number | null;
  basis: 'corpus-exposure-proxy';
}

const sum = (values: Record<string, number>) => Object.values(values).reduce((a, b) => a + b, 0);
const shareNew = (before: Record<string, number>, after: Record<string, number>) => {
  const total = sum(after);
  return total ? Object.entries(after).reduce((n, [id, count]) => n + (before[id] ? 0 : count), 0) / total : null;
};

/** Canonical corpus continuity, separate from GoLearn's learner-specific coverage. */
export function analyzeStageTransition(before: StageExposure, after: StageExposure): TransitionDiagnostic {
  if (before.lang !== after.lang) throw new Error('Stage transitions must remain within one language');
  const reasons: string[] = [];
  let severity = 0;
  const add = (level: number, reason: string) => { severity = Math.max(severity, level); reasons.push(reason); };
  if (!before.publishedTexts || !after.publishedTexts) add(3, `No accessible published reading in ${!before.publishedTexts ? before.stageId : after.stageId}.`);
  const newLemmaDensity = shareNew(before.lemmas, after.lemmas);
  const lexicalOverlap = newLemmaDensity === null ? null : 1 - newLemmaDensity;
  const newPatternShare = shareNew(before.patterns, after.patterns);
  const lengthRatio = before.medianWorkLength > 0 && after.medianWorkLength > 0 ? after.medianWorkLength / before.medianWorkLength : null;
  if (Math.min(before.analysedTokenShare, after.analysedTokenShare) < .7) add(1, 'Lemma analysis covers less than 70% of tokens; lexical overlap is partial evidence.');
  if (newLemmaDensity === null) add(1, 'No reliable lemma profile for the destination; vocabulary transition is unmeasured.');
  else if (newLemmaDensity > .25) add(2, `${Math.round(newLemmaDensity * 100)}% of analysed destination lemma tokens are absent from the prior stage.`);
  else if (newLemmaDensity > .1) add(1, `${Math.round(newLemmaDensity * 100)}% of analysed destination lemma tokens are new.`);
  if (lengthRatio !== null && lengthRatio > 4) add(2, `Median connected work length increases ${lengthRatio.toFixed(1)}×.`);
  else if (lengthRatio !== null && lengthRatio > 2) add(1, `Median connected work length increases ${lengthRatio.toFixed(1)}×.`);
  if (newPatternShare !== null && newPatternShare > .3) add(2, `${Math.round(newPatternShare * 100)}% of detected destination constructions are new.`);
  else if (newPatternShare === null) add(1, 'Clause/construction transition is unmeasured; no destination patterns detected.');
  const changed = (name: string, prior: string[], next: string[], level: number) => {
    const additions = next.filter(value => !prior.includes(value));
    if (additions.length) add(level, `New ${name}: ${additions.join(', ')}.`);
  };
  changed('genres', before.genres, after.genres, 1);
  changed('registers', before.registers, after.registers, after.registers.some(r => /archaic|historical|poetic|dialect|gheg/i.test(r)) ? 2 : 1);
  changed('orthography expectations', before.orthographies, after.orthographies, 2);
  if (before.publishedTexts && after.publishedTexts && (before.publishedWorks < 5 || after.publishedWorks < 5)) add(1, 'Fewer than five distinct connected works in an adjacent stage; exposure adequacy needs review.');
  if (!reasons.length) reasons.push('Measured features show no large jump; comprehension and repeated exposure still require learner validation.');
  return { from: before.stageId, to: after.stageId, risk: (['low', 'moderate', 'high', 'broken'] as const)[severity], reasons,
    lexicalOverlap, newLemmaDensity, newPatternShare, lengthRatio, basis: 'corpus-exposure-proxy' };
}

export function mergeProfileCounts(profiles: readonly TextProfile[], key: 'forms' | 'lemmas' | 'patterns'): Record<string, number> {
  const result: Record<string, number> = {};
  for (const p of profiles) for (const [id, count] of p[key]) result[id] = (result[id] ?? 0) + count;
  return result;
}
