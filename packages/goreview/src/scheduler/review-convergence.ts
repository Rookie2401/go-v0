/** Compatibility re-export: shared classification lives in repository-contract so the engine never imports GoReview. */
export { classifyReviewEvents as classifyReviewConvergence } from '../../../repository-contract/src';
export type { ReviewClassification as ReviewConvergence } from '../../../repository-contract/src';
