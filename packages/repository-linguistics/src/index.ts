/**
 * @go/repository-linguistics — Layer A of the Go Repository: linguistic knowledge independent of any learner.
 * Imports only the contract, the Albanian adapter and the core types. See ../README.md.
 */
export { resolveSelection, statusFor, analysisIdOf, CLOSE, HIGH_CONFIDENCE, SQ_VARIETY } from './resolver';
export type { ResolveInput, Resolution, StatusOptions } from './resolver';
export { albanianPack, genericPack, packFor, ALBANIAN_PACK_ID, packValidation, genericValidation, withValidation } from './packs';
export {
  createLinguisticService, LEARNER_CORRECTION_CONFIDENCE, REVIEWER_CORRECTION_CONFIDENCE, CERTAIN_MIGRATION,
} from './service';
export type { Correction, CorrectionResult, LinguisticService, LookupResult, MigrationChange } from './service';
