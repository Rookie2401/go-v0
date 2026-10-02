/**
 * The doors each course offers on Home and Explore. A door is an orientation — a stream, a subject or a range of
 * shelves — never a separate course. One line per course: a course without a line gets one door per available stream.
 */
import { GERMAN_COURSE_ID, GERMAN_DOORS } from './german';
import { SPANISH_COURSE_ID, SPANISH_DOORS } from './spanish';

export interface CourseDoor {
  key: string;
  label: string;
  stream?: string;
  domain?: string;
  /** Shelf keys ('s5', 's6', 's7') the door covers. */
  stages?: readonly string[];
}

export const COURSE_DOORS: Record<string, readonly CourseDoor[]> = {
  [SPANISH_COURSE_ID]: SPANISH_DOORS,
  [GERMAN_COURSE_ID]: GERMAN_DOORS,
};
