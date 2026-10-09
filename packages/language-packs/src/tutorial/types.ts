/**
 * The orientation a pack ships: a few short screens about the writing system, the sounds, the first words and two
 * sentence patterns, one demonstration passage, and the concept cards that explain how the application works.
 * It is data. The application decides how to show it; skipping and repeating are the application's job.
 */

export type TutorialStepKind = 'alphabet' | 'sounds' | 'words' | 'patterns' | 'passage' | 'concept' | 'practice';

export interface TutorialExample { surface: string; gloss: string; note?: string }

export interface TutorialPractice {
  instruction: string;
  /** The sentence the application shows and parses with the real analyser. */
  sentence: string;
  /** The word the learner is asked to select (exactly as written in the sentence). */
  target: string;
}

/** Authorship and review of a passage or step that teaches the language itself. Never claims a person checked it. */
export interface TutorialAuthorship {
  authorship: 'machine-drafted';
  reviewed: false;
  reviewNeeded: 'native speaker';
}

export interface TutorialPassage extends TutorialAuthorship {
  title: string;
  /** The English line is the drafter's own, not a published translation. */
  sentences: Array<{ text: string; gloss: string }>;
}

export interface TutorialStep {
  id: string;
  kind: TutorialStepKind;
  title: string;
  /** Plain text, no markup. */
  body: string;
  examples?: TutorialExample[];
  practice?: TutorialPractice;
  /** Present on the demonstration passage only. */
  passage?: TutorialPassage;
  estimatedMinutes: number;
}

export interface Tutorial extends TutorialAuthorship {
  ref: string;
  languageId: string;
  estimatedMinutes: number;
  skippable: true;
  steps: TutorialStep[];
  /** One honest sentence the application may show above the tutorial. */
  notice: string;
}
