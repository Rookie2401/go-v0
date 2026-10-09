/**
 * Adapts `createLinguisticService` (repository-linguistics) to the service's small `LinguisticsPort`. Structural types
 * only, so this file imports nothing from the sibling package: main.ts passes the real service in.
 */
import type { FormAnalysis, LinguisticUnit, UnitRelation } from '../../repository-contract/src';
import type { LearnerCorrection, LinguisticsPort, LookupInput, LookupResult } from './deps';

export interface RealLinguisticService {
  resolveAndStore(input: LookupInput): Promise<LookupResult>;
  lookup(unitId: string): Promise<{ unit?: LinguisticUnit; relations: { out: UnitRelation[]; in: UnitRelation[] }; analyses: FormAnalysis[] }>;
  correct(
    formId: string,
    correction: { lexemeId?: string; features?: Record<string, string>; by: 'learner' | 'reviewer'; reason?: string; sentenceKey?: string },
    now?: string,
  ): Promise<{ analysis: FormAnalysis; invalidated: Array<FormAnalysis | string> }>;
}

export function adaptLinguistics(real: RealLinguisticService): LinguisticsPort {
  return {
    async resolveAndStore(input) {
      const r = await real.resolveAndStore(input);
      return { formId: r.formId, units: r.units, relations: r.relations, ...(r.analysis ? { analysis: r.analysis } : {}) };
    },
    async lookup(unitId) {
      const r = await real.lookup(unitId);
      if (!r.unit) return undefined;
      return { unit: r.unit, relations: [...r.relations.out, ...r.relations.in], analyses: r.analyses };
    },
    async correct(formId, correction: LearnerCorrection, now) {
      const r = await real.correct(formId, {
        by: correction.by,
        ...(correction.lexemeId ? { lexemeId: correction.lexemeId } : {}),
        ...(correction.features ? { features: correction.features } : {}),
        ...(correction.reason ? { reason: correction.reason } : {}),
        ...(correction.sentenceKey ? { sentenceKey: correction.sentenceKey } : {}),
      }, now);
      return { analysis: r.analysis, invalidated: r.invalidated.map((a) => (typeof a === 'string' ? a : a.analysisId)) };
    },
  };
}
