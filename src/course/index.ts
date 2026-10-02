/**
 * Course catalogue: the ladder of a course (data in ./thai, held in the store by ./catalog) and the questions asked of it.
 */
export { THAI_ASSISTANCE, THAI_AUDIO_POLICY, THAI_COURSE_ID, THAI_OUTSIDE_LADDER, THAI_SCRIPTURE_POLICY, THAI_STAGES, THAI_WORKS } from './thai';
export { SPANISH_COURSE_ID, SPANISH_DOORS, SPANISH_OUTSIDE_SHELVES, SPANISH_SHELVES, SPANISH_STREAMS, SPANISH_WORKS } from './spanish';
export { GERMAN_COURSE_ID, GERMAN_DOORS, GERMAN_OUTSIDE_SHELVES, GERMAN_SCRIPTURE_POLICY, GERMAN_SHELVES, GERMAN_STREAMS, GERMAN_WORKS, LUTHER_1912_RIGHTS } from './german';
export { COURSE_DOORS } from './doors';
export type { CourseDoor } from './doors';
export { createCourseCatalog, mergeWork, stageMetaId } from './catalog';
export type { CourseCatalogDeps } from './catalog';
