/**
 * Stage 0 — the zero-to-language bootstrap layer (docs/STAGE0.md).
 *
 * One shared model for all languages, configured per language (src/stage0/lang/*). Content is authored as data
 * (data/stage0/<lang>/*.json) in the AUTHORING shapes below; it never requires application code. Learner state is a pure
 * function of the event log (Stage0* events plus the ordinary reading/rescue/production events the scenes emit), like
 * GoTell practice: no new table, no Dexie migration, carried by backups.
 *
 * Kept apart, never collapsed into one "known": reading recognition, listening recognition (per channel, and native audio
 * vs a computer voice), orthographic decoding (per orth feature), construction recognition, written production, spoken
 * production, and support dependence.
 */
import type { LanguageCode } from '../model';

// ───────────────────────── provenance ─────────────────────────

/** Who wrote a piece of content and whether a named person has reviewed THIS wording. */
export interface Stage0Provenance {
  authoring: 'ai-drafted' | 'human-authored';
  /** "AI model (Claude), 2026-10-04" — never blank. */
  drafter: string;
  review: {
    status: 'unreviewed' | 'reviewed' | 'changes-requested';
    /** A named person; required for 'reviewed'. */
    reviewer?: string;
    date?: string;
    /** Content signature the review covers (src/stage0/validate.ts: signatureOf). A wording edit invalidates it. */
    signature?: string;
    notes?: string;
  };
}

/** Planned or attached audio for one line or word. Only a reviewed native recording is listening evidence. */
export interface Stage0Audio {
  status: 'needed' | 'recorded';
  /** GoListen asset id of a curated recording (importRecording origin 'curated'). */
  assetId?: string;
  speaker?: string;
  reviewedBy?: string;
}

// ───────────────────────── authoring: scenes ─────────────────────────

export interface Stage0Line {
  /** Stable within its scene ("l1"); referenced by checks and production tasks. */
  id: string;
  /** Canonical target-language text. Never romanized. */
  text: string;
  /** The meaning in English — the rescue, shown only on request. */
  en: string;
  /** Character id from data/stage0/world.json. */
  speaker?: string;
  /** Visual context (emoji), shown while the scene is new; meaning before translation. */
  picture?: string;
  audio?: Stage0Audio;
}

export type Stage0CheckKind = 'meaning-choice' | 'true-false' | 'picture-choice' | 'who';

/** A comprehension check on one or more lines. Answered before or after rescue — the difference is recorded. */
export interface Stage0Check {
  id: string;
  lines: string[];
  kind: Stage0CheckKind;
  /** Early checks ask in English; later ones may ask in the target language (`target`). */
  question: { en: string; target?: string };
  options: Array<{ en?: string; target?: string; picture?: string }>;
  answer: number;
}

export type Stage0ProductionKind = 'copy' | 'choose' | 'substitute' | 'complete' | 'recall' | 'answer' | 'describe' | 'retell';

/** One accepted answer; `{x}` marks a personal slot (the learner's own name, town …) that accepts any word. */
export interface Stage0Accept { text: string; speakerForm?: 'm' | 'f' }

export interface Stage0ProductionTask {
  id: string;
  kind: Stage0ProductionKind;
  /** What to do, in English. */
  prompt: string;
  /** Lines (in this scene) or construction ids this task makes him retrieve. */
  basedOn: string[];
  /** The frame shown for substitute/complete ("Me llamo ___."). Copy shows the model; recall/answer/describe/retell show neither. */
  frame?: string;
  /** For choose: the options (target language). */
  options?: string[];
  /** Accepted answers. Matching ignores case, punctuation and spacing; `{x}` slots accept any one or more words. */
  accept: Stage0Accept[];
  /** A personal slot's meaning ("your name"), for the prompt and the inspector. */
  personal?: string;
  /** Spoken as well as written (a recording is invited; never scored). */
  speak?: boolean;
}

export interface Stage0Note {
  id: string;
  kind: 'grammar' | 'sound' | 'usage' | 'culture';
  /** Plain words; no terminology unless explained. */
  title: string;
  text: string;
  /** Coverage ids the note explains. */
  explains: string[];
  /**
   * Shown only after the learner has met the phenomenon in this many scenes (experience → notice → explanation).
   * 0 = available at once. The note stays available on request regardless.
   */
  afterScenes: number;
}

export interface Stage0Scene {
  id: string;
  lang: LanguageCode;
  kind: 'scene';
  version: number;
  title: { en: string; target?: string };
  /** Who and what from the shared world. */
  world: { characters: string[]; places?: string[]; things?: string[] };
  lines: Stage0Line[];
  /** What this scene sets out to introduce (new) — everything else is expected to be known from earlier steps. */
  introduces: { words: string[]; constructions: string[]; orth?: string[] };
  /** Coverage-map ids this scene deliberately represents (introduced or recycled). */
  represents: string[];
  /** Coverage ids used before their prerequisites ON PURPOSE (as an unanalysed chunk) — the validator accepts these. */
  intentional?: string[];
  checks: Stage0Check[];
  production?: Stage0ProductionTask[];
  notes?: Stage0Note[];
  /** Listening is part of this scene's plan (audio slots on every line). */
  listening: boolean;
  provenance: Stage0Provenance;
}

// ───────────────────────── authoring: sound & script steps ─────────────────────────

/** A word used to teach sounds/letters — always a real word with meaning, never a bare letter. */
export interface Stage0SoundWord { text: string; en: string; picture?: string; audio?: Stage0Audio }

export type Stage0DecodeKind = 'which-reading' | 'which-word' | 'which-tone' | 'segment';

/**
 * A decoding check. which-reading: shown target script, choose how it is said (options are readings — used as the answer
 * key, never as a reading surface). which-word: hear (or read a meaning cue) and choose the written word. which-tone (Thai):
 * from the spelling, which tone. segment (Thai): tap where words begin in an unspaced line (answer = boundary offsets).
 */
export interface Stage0DecodeCheck {
  id: string;
  kind: Stage0DecodeKind;
  word: string;
  prompt?: string;
  options?: string[];
  answer?: number;
  /** segment: character offsets (in `word`) where a new word starts, excluding 0. */
  boundaries?: number[];
}

export interface Stage0SoundStep {
  id: string;
  lang: LanguageCode;
  kind: 'sounds';
  version: number;
  title: { en: string };
  /** Sound / orth feature ids this step focuses (es/de/sq: the language config's features; hi/th: adapter orth features). */
  features: string[];
  words: Stage0SoundWord[];
  /** Two or three plain sentences; the deeper explanation is opened on request. */
  explanation: { short: string; more?: string };
  checks: Stage0DecodeCheck[];
  provenance: Stage0Provenance;
}

// ───────────────────────── authoring: path, coverage, exit ─────────────────────────

export type Stage0StepKind = 'scene' | 'sounds' | 'review' | 'exit';

export interface Stage0PathStep {
  id: string;
  kind: Stage0StepKind;
  /** The scene or sound step id (review: the scene revisited; exit: absent). */
  ref?: string;
  /** Review: which listening channel the revisit uses. */
  channel?: Stage0Channel;
}

export interface Stage0Path {
  lang: LanguageCode;
  version: number;
  steps: Stage0PathStep[];
  /** Where the learner goes after a passed exit: existing GoLearn texts (ids), in order. */
  next: Array<{ textId: string; title: string; note?: string }>;
}

/** The hidden curriculum-engineering map: what a scene may assume, and what it teaches. Not shown as a syllabus. */
export interface Stage0CoverageEntry {
  id: string;
  kind: 'construction' | 'grammar' | 'sound' | 'orth' | 'pragmatics';
  label: string;
  prerequisites: string[];
}

export interface Stage0ExitForm {
  id: string;
  /** An unseen passage built from the path's language. */
  reading: { lines: Stage0Line[]; checks: Stage0Check[] };
  /** Unseen audio items (each line needs a recording; without one the section is unavailable, never faked). */
  listening: { lines: Stage0Line[]; checks: Stage0Check[] };
  writing: Stage0ProductionTask[];
  speaking: Array<{ id: string; prompt: string; model: string }>;
  /** Script languages: unseen words to decode, tone and segmentation items. */
  decoding?: Stage0DecodeCheck[];
  provenance: Stage0Provenance;
}

export interface Stage0ExitCriteria {
  reading: { minCorrect: number; maxLookups: number };
  listening: { minCorrect: number };
  writing: { minAccepted: number };
  /** Spoken answers are recorded and self-checked against the model; never auto-scored. */
  speaking: { minRecorded: number };
  decoding?: { minCorrect: number };
}

// ───────────────────────── learner-facing state ─────────────────────────

/** How a scene's lines reach the learner: reading only, reading while hearing, hearing first (text on request), hearing only. */
export type Stage0Channel = 'read' | 'read+listen' | 'listen-first' | 'listen-only';
export type Stage0AudioSource = 'native' | 'computer-voice' | 'none';

/** Support available in Stage 0; every use is recorded. */
export type Stage0Support = 'english' | 'gloss' | 'transliteration' | 'segmentation' | 'picture' | 'note' | 'transcript' | 'model';

export interface Stage0FeatureState {
  feature: string;
  attempts: number;
  correct: number;
  /** Correct with no transliteration shown, in a row (the fading signal). */
  unaidedStreak: number;
  secure: boolean;
}

export interface Stage0Meters {
  /** Script / sound-spelling: features secure / features met. */
  decoding: { secure: number; met: number; total: number };
  /** Reading checks answered right before any English was revealed (recent window). */
  readingIndependence: { unaided: number; answered: number };
  /** Listening-only checks answered right, by audio source (native counts as evidence; a computer voice is practice). */
  listening: { native: { correct: number; answered: number }; computerVoice: { correct: number; answered: number } };
  /** Production accepted, by kind. */
  production: Partial<Record<Stage0ProductionKind, { accepted: number; attempts: number }>>;
  speaking: { recorded: number };
  /**
   * Constructions of the hidden coverage map: met (in a scene he worked on), recognized (every check of such a scene answered
   * right before any English), produced (in a task accepted without a model). Recognition is not production.
   */
  constructions: { met: number; recognized: number; produced: number; total: number };
  /** Share of recent reading where English or transliteration was used (falls as he becomes independent). */
  supportDependence: { english: number; transliteration: number; window: number };
}

export interface Stage0StepView {
  step: Stage0PathStep;
  title: string;
  status: 'new' | 'started' | 'done' | 'secure';
  /** Why this status ("3 of 3 checks right without English"). */
  detail: string;
}

/** What the scene player shows by default, decided from evidence — with the reasons. */
export interface Stage0Presentation {
  channel: Stage0Channel;
  audio: Stage0AudioSource;
  english: 'on-request';
  pictures: boolean;
  /** Words (by line id → token surfaces) shown with a reading under them; empty = none. */
  transliteration: Record<string, string[]>;
  segmentation: boolean;
  highlightNew: boolean;
  reasons: string[];
}

export interface Stage0Overview {
  lang: LanguageCode;
  available: boolean;
  /** "AI-drafted, not yet reviewed by a native speaker" etc. — always shown with the content. */
  contentStatus: string;
  steps: Stage0StepView[];
  next?: Stage0PathStep;
  nextReason?: string;
  meters: Stage0Meters;
  speakerForm?: 'm' | 'f';
  exit?: Stage0ExitResult;
  /** The ordinary GoLearn texts that follow Stage 0. */
  after: Stage0Path['next'];
  /**
   * Production as retrieval: an earlier task (in a scene already done) that he has met but not yet produced without a model —
   * preferring constructions met in the most scenes. Absent when there is none.
   */
  retrieval?: { stepId: string; taskId: string; prompt: string; why: string };
  /** For the next scene: the share of its words met on the path (curriculum), and the share this learner has met (GoLearn). */
  nextCoverage?: { curriculum: number; personal?: number };
}

export type Stage0ExitSection = 'reading' | 'listening' | 'writing' | 'speaking' | 'decoding';

export interface Stage0ExitSectionResult {
  section: Stage0ExitSection;
  status: 'passed' | 'not-yet' | 'unavailable' | 'recorded';
  score?: { correct: number; total: number };
  detail: string;
}

export interface Stage0ExitResult {
  attemptId: string;
  formId: string;
  startedAt: string;
  finishedAt?: string;
  /** False when this learner had seen any of the form's material before the attempt (it no longer tests transfer). */
  unseen: boolean;
  sections: Stage0ExitSectionResult[];
  /**
   * ready: every required section passed. ready-provisional: every AVAILABLE section passed, but one could not be given
   * (no native audio yet) — said so. not-yet: which sections to work on.
   */
  verdict?: 'ready' | 'ready-provisional' | 'not-yet';
  verdictDetail?: string;
}

/** Stage 0 for one learner and language. The UI calls only this. */
export interface Stage0Service {
  /** Whether Stage 0 exists for this language, and the status of its content. */
  available(lang: LanguageCode): boolean;
  /** Import the language's scenes as ordinary Texts (idempotent; no-op when unchanged). */
  ensureTexts(lang: LanguageCode): Promise<void>;
  overview(userId: string, lang: LanguageCode): Promise<Stage0Overview>;
  scene(lang: LanguageCode, id: string): Stage0Scene | undefined;
  soundStep(lang: LanguageCode, id: string): Stage0SoundStep | undefined;
  /** The scene's Text id and sentence ids per line (after ensureTexts). */
  sceneText(lang: LanguageCode, sceneId: string): Promise<{ textId: string; sentenceIds: Record<string, string> } | undefined>;
  /** `audio`: what this device can play for the step (a reviewed native recording, a computer voice, or nothing). */
  presentation(userId: string, lang: LanguageCode, stepId: string, audio?: Stage0AudioSource): Promise<Stage0Presentation>;
  setSpeakerForm(userId: string, lang: LanguageCode, form: 'm' | 'f'): Promise<void>;
  /** A line was on screen long enough to read (reading exposure through GoLearn). */
  lineSeen(userId: string, lang: LanguageCode, stepId: string, lineId: string): Promise<void>;
  /** A support was used (English, gloss, transliteration, transcript, note…). */
  supportUsed(userId: string, lang: LanguageCode, stepId: string, support: Stage0Support, lineIds: string[], detail?: { tokenId?: string; itemId?: string; features?: string[] }): Promise<void>;
  answerCheck(userId: string, lang: LanguageCode, stepId: string, checkId: string, choice: number, channel: Stage0Channel, audio: Stage0AudioSource): Promise<{ correct: boolean; rescued: boolean }>;
  answerDecode(userId: string, lang: LanguageCode, stepId: string, checkId: string, answer: number | number[], transliterationShown: boolean, audio: Stage0AudioSource): Promise<{ correct: boolean }>;
  submitProduction(userId: string, lang: LanguageCode, stepId: string, taskId: string, text: string, shown: Stage0Support[]): Promise<{ accepted: boolean; matched?: string; feedback: string }>;
  recordSpeaking(userId: string, lang: LanguageCode, stepId: string, itemId: string, recordingId: string | undefined, selfCheck: 'like-model' | 'different' | 'unsure'): Promise<void>;
  completeStep(userId: string, lang: LanguageCode, stepId: string): Promise<void>;
  // ── exit gate ──
  exitForm(lang: LanguageCode, formId: string): Stage0ExitForm | undefined;
  /** Starts an attempt on the next form this learner has not seen; records protected exposure at once. */
  startExit(userId: string, lang: LanguageCode, opts?: { microphone?: boolean }): Promise<{ attemptId: string; formId: string; unseen: boolean; unavailable: Stage0ExitSection[] }>;
  answerExit(userId: string, lang: LanguageCode, attemptId: string, section: Stage0ExitSection, itemId: string, answer: { choice?: number; boundaries?: number[]; text?: string; recordingId?: string; selfCheck?: 'like-model' | 'different' | 'unsure'; lookups?: number }): Promise<{ correct?: boolean; accepted?: boolean }>;
  finishExit(userId: string, lang: LanguageCode, attemptId: string): Promise<Stage0ExitResult>;
}
