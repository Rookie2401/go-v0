/**
 * Course catalogue contract: the ladder of a course and what each stage asks of the reader interface.
 * Implemented in src/course (data + lookup); consumed by the UI and by GoLearn's stage readiness.
 */
import type { AssistanceProfile, Stage, Work } from '../course';
import type { Text } from '../model';

export interface CourseCatalog {
  /** Seed the store with the ladder (idempotent; never overwrites rights fields a person has since verified). */
  install(courseId: string): Promise<void>;
  stages(courseId: string): Promise<Stage[]>; // ordered by index
  works(courseId: string, stageId?: string): Promise<Work[]>; // ordered: spine first, then order
  work(workId: string): Promise<Work | undefined>;
  /** The imported texts (chapters) of a work, in chapter order. Empty until the learner imports his copy. */
  textsOf(workId: string): Promise<Text[]>;
  /** The stage a text belongs to (through its work); undefined for texts outside the ladder (e.g. Scripture). */
  stageOfText(textId: string): Promise<Stage | undefined>;
  /**
   * The assistance profile the reader should use for a text: its stage's profile, or — for texts outside the
   * ladder — the profile of the stage the learner is currently working at.
   */
  assistanceFor(args: { courseId: string; textId?: string; currentStageId?: string }): Promise<AssistanceProfile>;
  /** The stage the learner is working at: the first stage whose readiness verdict is not 'ready-to-advance' (stored choice wins). */
  currentStage(userId: string, courseId: string): Promise<Stage | undefined>;
  setCurrentStage(userId: string, courseId: string, stageId: string): Promise<void>;
}
