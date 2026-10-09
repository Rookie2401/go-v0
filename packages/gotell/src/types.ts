/**
 * GoTell — the domain types shared by its modules (Prompt 6, Part A). GoTell helps a learner express their own ideas:
 * the learner's text is the artefact, corrections are proposals, authorship is tracked, and nothing is ever replaced
 * silently. Independent of GoReview: no deck, no schedule, no review history is read or written here.
 * Imports: the repository contract only.
 */
import type { AnalysisStatus, GoEvent, PrivateDocument, UnitKnowledge } from '../../repository-contract/src';

// ───────────────────────────── modes and prompts ─────────────────────────────

export const WRITING_MODES = ['free', 'guided', 'testimony', 'missionary', 'narrative', 'targeted'] as const;
export type WritingMode = (typeof WRITING_MODES)[number];

export const PROMPT_CATEGORIES = ['personal-background', 'mission-communication', 'testimony', 'scripture-theology', 'general'] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

/** A writing prompt: a communicative goal, never the learner's content. Text is in English (the instruction) plus optional target-language framing. */
export interface WritingPrompt {
  promptId: string;
  category: PromptCategory;
  /** Languages the prompt is written for ('*' = any). */
  languageIds: string[];
  varietyIds?: string[];
  teams: string[]; // team ids it suits; empty = all
  goal: string; // the communicative goal in one sentence
  instruction: string; // what to write, in English
  /** Difficulty guidance for the writer, not a CEFR label. */
  difficulty: 'first-sentences' | 'short-paragraph' | 'connected-paragraphs';
  vocabularyDomains: string[];
  grammarTargets: string[]; // pack construction ids or feature keys
  culturalNotes: string[];
  /** Optional sentence frames from the pack, shown only on request (Level 3+). */
  frames?: string[];
  validation: { authorship: 'owner' | 'machine-drafted'; reviewed: boolean; reviewNeeded?: string; source?: string };
  /** For testimony prompts: an optional section tag; never a required order. */
  section?: string;
}

// ───────────────────────────── the learner, as GoTell reads it ─────────────────────────────

export interface WriterProfile {
  learnerId: string;
  languageId: string;
  varietyId?: string;
  /** Units with productive evidence (contextualProduction or productiveRetrieval weight > 0). */
  productive: string[];
  /** Units with reading recognition evidence but no productive evidence. */
  recognisedOnly: string[];
  /** Constructions with more negative than positive grammatical evidence. */
  weakConstructions: string[];
  /** Error categories that recurred in earlier writing (from the learner's own ProductionRecorded / corrections). */
  recurringErrors: string[];
  /** Units met recently (exposure within 14 days). */
  recent: string[];
  explanationDepth: 'label' | 'brief' | 'explanatory';
  /** The learner's declared goals (free text, their own). */
  goals: WritingGoal[];
  /** Rough band from the evidence counts, with its basis; never a CEFR label. */
  band: { level: 'first-sentences' | 'short-paragraph' | 'connected-paragraphs'; basis: string[] };
}

export interface WritingGoal { goalId: string; text: string; createdAt: string; done?: boolean }

export interface ProfileSource {
  knowledge(unitIds?: string[]): Promise<UnitKnowledge[]>;
  events(): Promise<GoEvent[]>;
  preferences(): Promise<{ explanationDepth?: string } | undefined>;
}

// ───────────────────────────── analysis ─────────────────────────────

export const ISSUE_CLASSES = [
  'grammatically-wrong', 'semantically-unclear', 'acceptable-but-awkward', 'regional-variation', 'register-difference', 'stylistic-alternative', 'uncertain-analysis',
] as const;
export type IssueClass = (typeof ISSUE_CLASSES)[number];

export interface TextSpan { start: number; end: number }

export interface Issue {
  issueId: string;
  sentenceIndex: number;
  span: TextSpan; // offsets into the sentence text
  surface: string;
  /** The checker's category (spelling, agreement, case, definiteness, …) as the adapter names it. */
  category: string;
  class: IssueClass;
  /** 0..1 from the checker and the analysis status; low confidence → class 'uncertain-analysis'. */
  confidence: number;
  provenance: { source: 'adapter-checker' | 'pack-rule' | 'remote-assistant' | 'learner'; ref: string };
  /** Short description of the issue type (Level 2 hint text). */
  hint: string;
  /** Explanation of the grammatical relationship (Level 4), from the pack. */
  explanation?: string;
  /** Units involved. */
  unitIds: string[];
  affectsMeaning: boolean;
}

export interface Correction {
  correctionId: string;
  issueIds: string[];
  sentenceIndex: number;
  original: string;
  /** The revised sentence (Level 4); never applied without the learner's acceptance. */
  suggested: string;
  explanation: string;
  /** Flags a change of meaning / negation / chronology / key term; such a correction is shown, never applied silently. */
  meaningChange?: string;
  /** Alternatives (Level 5) with register/variant notes; empty when none is known. */
  alternatives: Array<{ text: string; note: string }>;
  /** Validation: the checker re-run on the suggestion, and that nothing beyond the issue spans was added. */
  validation: { checkerClean: boolean; addsOnlyWithinSpans: boolean; issues: string[] };
  confidence: number;
  provenance: Issue['provenance'];
}

export interface SentenceAnalysis {
  index: number;
  text: string;
  tokens: string[];
  unitIds: string[];
  /** Fraction of word tokens among the writer's productive or recognised units (0..1); informational. */
  familiarity: number;
  issues: Issue[];
  corrections: Correction[];
  /** What the checker cannot see for this language (honesty line). */
  checkerCoverage: string;
  analysisStatus: AnalysisStatus | 'none';
}

export interface DraftAnalysis {
  draftId: string;
  languageId: string;
  textHash: string;
  sentences: SentenceAnalysis[];
  analyzerId: string;
  packVersion: string;
  at: string;
}

// ───────────────────────────── graduated assistance ─────────────────────────────

/** Level 1 identify · 2 hint · 3 targeted help · 4 correction · 5 alternatives · 6 model expression (only on request). */
export type AssistanceLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface AssistanceRequest { draftId: string; sentenceIndex: number; issueId?: string; level: AssistanceLevel; at: string }

export interface AssistanceStep {
  level: AssistanceLevel;
  /** What was shown, exactly. */
  content: string;
  /** Units revealed by this step (what the learner did not have to produce). */
  revealedUnitIds: string[];
  source: 'adapter-checker' | 'pack-grammar' | 'pack-sentence' | 'learner-own-sentence' | 'remote-assistant' | 'none';
  /** For a model (6): where the wording comes from and its review state. */
  review?: 'unreviewed' | 'reviewed' | 'learner-own';
  at: string;
}

// ───────────────────────────── documents, versions, authorship ─────────────────────────────

export const AUTHORSHIP = ['independent', 'after-hint', 'revised-after-feedback', 'copied-from-model', 'ai-generated', 'reproduced-later'] as const;
export type Authorship = (typeof AUTHORSHIP)[number];

export interface SentenceVersion { text: string; authorship: Authorship; assistance: AssistanceLevel[]; at: string }

export interface DraftVersion {
  versionId: string;
  at: string;
  text: string;
  textHash: string;
  deviceId: string;
  /** Per sentence, how it came to be. */
  sentences: SentenceVersion[];
  note?: string;
}

/** The draft as GoTell keeps it: current text plus the immutable version list, inside one private document. */
export interface DraftRecord {
  draftId: string;
  languageId: string;
  varietyId?: string;
  mode: WritingMode;
  promptId?: string;
  title: string;
  text: string;
  versions: DraftVersion[];
  /** Steps shown for the current text, in order, so authorship can be judged at save time. */
  assistance: AssistanceStep[];
  createdAt: string;
  updatedAt: string;
}

export interface DraftStore {
  list(): Promise<Array<Pick<PrivateDocument, 'docId' | 'title' | 'updatedAt' | 'revision' | 'kind' | 'languageId'>>>;
  load(draftId: string): Promise<{ record: DraftRecord; revision: number } | undefined>;
  /** Optimistic save; a conflict returns the current server record for the merge rules. */
  save(record: DraftRecord, expectedRevision: number): Promise<{ ok: true; revision: number } | { ok: false; current: { record: DraftRecord; revision: number } }>;
  remove(draftId: string): Promise<void>;
}

// ───────────────────────────── evidence ─────────────────────────────

export interface WritingEvidence {
  events: GoEvent[];
  /** Human-readable: what was claimed and what was not. */
  summary: string[];
}

export interface Identity { learnerId: string; enrolmentId: string; deviceId: string; languageId: string; varietyId?: string }

// ───────────────────────────── remote assistance (consent-gated port; no provider is wired) ─────────────────────────────

export interface RemoteAssistant {
  readonly providerId: string;
  /** Returns proposals for one sentence; the caller validates every proposal before showing it. */
  propose(input: { languageId: string; sentence: string; intendedMeaning?: string }): Promise<Array<{ suggested: string; explanation: string; confidence: number }>>;
}

export interface ConsentGate { remoteAssistance(): boolean }
