import type { AdapterRegistry, AppStore, EventBus, LanguageCode, Recommendation, Text, TextProfile } from '../core';
import type { Stage0ServiceImpl } from '../stage0';

export type SourceKind = 'stage0' | 'ladder' | 'library' | 'scripture' | 'bundled';
export type SimMode = 'normal' | 'preview';

/** The simulated clock: every reading of it moves it on a little; `jumpMinutes` ends a sitting (GoLearn's gap is 30 minutes). */
export interface SimClock {
  now(): string;
  jumpMinutes(m: number): void;
}

/** What the loop needs from the app. `createRealEngine` (engine.ts) builds it over the real bootstrap; tests build it by hand. */
export interface SimEngine {
  lang: LanguageCode;
  userId: string;
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  clock: SimClock;
  /** GoLearn.recommend for this learner. */
  recommend(opts: { limit: number; includeUnpublished: boolean }): Promise<Recommendation[]>;
  /** The Text the learner opens: from the store, else imported from the library (as the app does). Throws when it cannot be opened. */
  openText(textId: string): Promise<Text>;
  /** The profile of a text (library.profile): used only to judge whether an alternative would have taught more. */
  profileOf?(textId: string): Promise<TextProfile | undefined>;
  /** Stage 0, when the language has it (the real service). */
  stage0?: Stage0ServiceImpl;
  /** Ladder units by Text id, for labelling a text as a ladder text. */
  ladder?: ReadonlyMap<string, { unitId: string; stage: string; domain: string; kind: string }>;
  /** What this engine substitutes for the browser app, in words (reported verbatim). */
  substitutions: string[];
}

export interface SimOptions {
  /** Preview mode: every draft counts as reviewed (recommend with includeUnpublished). */
  includeUnpublished: boolean;
  /** Per run. Words count every row, Stage 0 included; `maxTexts` counts the texts read AFTER Stage 0. */
  maxWords: number;
  maxTexts: number;
  maxMinutes: number;
  /** The learner never rereads: a recommendation for a text he has finished is skipped (default: he follows the engine, rereads included). */
  skipRereads?: boolean;
  /** How many recommendations to ask for (default 5). */
  limit?: number;
  /** Called after every row (progress output). */
  onRow?: (row: SimRow) => void;
}

export interface SimRow {
  /** 1-based order over all rows (Stage 0 first). */
  n: number;
  phase: 'stage0' | 'main';
  textId: string;
  title: string;
  kind: SourceKind;
  /** Stage 0: the path step id. */
  step?: string;
  workId?: string;
  /** Domain, else genre, else stream (what the catalogue knows). */
  domain?: string;
  scripture: boolean;
  published: boolean;
  words: number;
  sentences: number;
  /** Share of the text's words known BEFORE reading it (>= 3 encounters or automatic): the probe's coverage. */
  cov3: number;
  /** Share of its words known at the moment they were read (the learner learns while reading). */
  covRead: number;
  lookups: number;
  lookupsPer100: number;
  sentencesWithHelp: number;
  sentencesWithoutHelp: number;
  /** Lemmas met for the first time in this text; lemmas that crossed the known line (3) in it. */
  newLemmasMet: number;
  newKnown: number;
  /** newKnown per 1,000 words of this text. */
  yieldPer1000: number;
  cumWords: number;
  cumKnown: number;
  cumMet: number;
  /** The text had been read (finished) before. */
  reread: boolean;
  reason: string;
  explanation: string;
  dupWords: number;
  twinOf?: string;
  dupOf?: string[];
  foreignWords: number;
  foreign?: Record<string, number>;
  /** cov3 >= 99.5 %, the text taught almost nothing, and another recommended text would have taught useful new words. */
  lowYield: boolean;
  /** An alternative from the same recommendation list that would have taught more (estimated from its profile). */
  better?: { textId: string; estCoverage: number; unknownLemmas: number };
}

export interface SkipRecord { afterRow: number; textId?: string; reason: string; detail?: string }

export type StopReason = 'no-openable-recommendation' | 'same-text-3-in-a-row' | 'max-words' | 'max-texts' | 'max-minutes';

export interface SimRun {
  lang: LanguageCode;
  mode: SimMode;
  options: Omit<SimOptions, 'onRow'>;
  substitutions: string[];
  stop: { reason: StopReason; detail: string };
  rows: SimRow[];
  skipped: SkipRecord[];
  /** known-lemma milestones: cumulative words when the learner's known lemmas first reached N. */
  milestones: Record<string, number | null>;
  stage0?: { steps: number; lemmas: number; knownShare: number; verdict: 'ready' | 'ready-provisional' | 'not-run' };
  elapsedMs: number;
  /** Where the time went (ms): the app's recommend(), opening + analysing the chosen text, Stage 0, and reading (emitting events). */
  timing: { recommendMs: number; openMs: number; stage0Ms: number; readMs: number };
}

export const MILESTONES = [1000, 2000, 3250, 5000, 8000] as const;
