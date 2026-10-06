import records from './curriculum-acquired-works.json';
import type { Work } from '../core';
/** Exact acquired editions, separate from learner-specific readiness. */
export const CURRICULUM_ACQUIRED_WORKS = records as unknown as Work[];
