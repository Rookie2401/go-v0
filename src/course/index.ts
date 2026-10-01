/**
 * Course catalogue — STUB written by the coordinator so that the other packages compile.
 * Package E (docs/PLAN5.md) replaces the body of createCourseCatalog; the exported names and signatures are the contract.
 */
import type { AppStore, CourseCatalog, GoLearn } from '../core';

export { THAI_ASSISTANCE, THAI_COURSE_ID, THAI_OUTSIDE_LADDER, THAI_STAGES, THAI_WORKS } from './thai';

export interface CourseCatalogDeps {
  store: AppStore;
  /** Needed for currentStage (stage readiness). Without it currentStage returns the stored choice or the first stage. */
  golearn?: Pick<GoLearn, 'stageReadiness'>;
}

export function createCourseCatalog(_deps: CourseCatalogDeps): CourseCatalog {
  throw new Error('createCourseCatalog: not implemented yet (PLAN5 package E)');
}
