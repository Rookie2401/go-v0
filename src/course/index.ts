/**
 * Course catalogue: the ladder of a course (data in ./thai, held in the store by ./catalog) and the questions asked of it.
 */
export { THAI_ASSISTANCE, THAI_AUDIO_POLICY, THAI_COURSE_ID, THAI_OUTSIDE_LADDER, THAI_SCRIPTURE_POLICY, THAI_STAGES, THAI_WORKS } from './thai';
export { createCourseCatalog, mergeWork, stageMetaId } from './catalog';
export type { CourseCatalogDeps } from './catalog';
