/**
 * The GoTell workspace port. The writing screens (packages/goreview/app/screens/tell/**) and the DOM-free session logic in
 * this folder depend on these interfaces only. `packages/goreview/app/tellEngine.ts` is the one file that wires the real
 * modules (engine, prompts, profile, documents, evidence, privacy) to the port; a test supplies a small fake.
 *
 * Independence: nothing here reads or writes anything of the review side of the application. The workspace needs the
 * Repository API, the learner's local area and the learner's own event log (goals are preference events) and nothing else.
 */
import type { GoEvent } from '../../../repository-contract/src';
import type { RepositoryApi } from '../../../repository-service/src/api';
import type {
  AssistanceRequest, AssistanceStep, Correction, DraftAnalysis, DraftRecord, DraftStore, DraftVersion, Identity, Issue, ProfileSource,
  PromptCategory, WriterProfile, WritingEvidence, WritingMode, WritingPrompt,
} from '../types';

// ───────────────────────────── small value types ─────────────────────────────

export type DraftExportFormat = 'json' | 'text' | 'markdown';
export const DRAFT_EXPORT_FORMATS: readonly DraftExportFormat[] = ['json', 'text', 'markdown'];

/** A file the learner downloads; produced by the engine, saved by the host. */
export interface FileOut { filename: string; mime: string; content: string }

export interface PromptPick { prompt: WritingPrompt; reason: string }

/** What the guidance panel shows for a prompt and/or a targeted expression; computed on the device. */
export interface PromptGuidance {
  /** Short plain sentences (difficulty guidance, what the writer already knows around this prompt). */
  lines: string[];
  /** Words the writer already uses that fit the task. */
  familiarWords: string[];
  /** Sentence frames; shown only on request. */
  frames: string[];
}

/** The outcome of one ladder step: the step as shown, or an honest refusal. */
export type AssistOutcome = { ok: true; step: AssistanceStep } | { ok: false; reason: string };

export interface DiffLine { kind: 'same' | 'added' | 'removed'; text: string }

export interface NewVersionInput {
  /** The record with the CURRENT text; `assistance` holds the steps shown for it. */
  record: DraftRecord;
  text: string;
  at: string;
  deviceId: string;
  note?: string;
}

export interface SaveEvidenceInput {
  identity: Identity;
  appVersion: string;
  at: string;
  /** The record AFTER `newVersion`; `version` is its newest version. */
  record: DraftRecord;
  version: DraftVersion;
  analysis?: DraftAnalysis;
  mode: WritingMode;
}

export interface CorrectionEvidenceInput {
  identity: Identity;
  appVersion: string;
  at: string;
  draftId: string;
  mode: WritingMode;
  outcome: 'accepted' | 'rejected';
  correction: Correction;
  issues: Issue[];
  /** The highest ladder level shown for the issue(s) before the response. */
  levelShown: number;
}

// ───────────────────────────── the engine port ─────────────────────────────

export interface TellEngine {
  readonly languageId: string;
  readonly varietyId?: string;
  /** False when no checker exists for the language: the learner can still write and save. */
  readonly analysisAvailable: boolean;
  readonly analysisUnavailableReason?: string;

  // prompts
  /** The prompts of this language for a mode (and optionally one category and one team). */
  prompts(opts: { mode: WritingMode; category?: PromptCategory; teamId?: string }): WritingPrompt[];
  promptById(promptId: string): WritingPrompt | undefined;
  suggestPrompt(profile: WriterProfile, opts: { mode: WritingMode; category?: PromptCategory; teamId?: string; exclude?: string[] }): PromptPick | undefined;
  /** Computed on the device. `intent` is the learner's English words for a targeted expression; it is never sent anywhere. */
  guidance(input: { prompt?: WritingPrompt; intent?: string; profile?: WriterProfile }): PromptGuidance;
  buildProfile(source: ProfileSource, identity: Identity): Promise<WriterProfile>;

  // checking
  analyze(draftId: string, text: string, profile?: WriterProfile): Promise<DraftAnalysis>;
  /** One ladder step. `prior` are the steps already shown for the same issue, in order. */
  assist(analysis: DraftAnalysis, req: AssistanceRequest, prior: AssistanceStep[]): Promise<AssistOutcome>;

  // documents
  readonly stores: {
    /** Autosave: the device only; never the network. */
    local: DraftStore;
    /** The combined store: reads merge the device and the account, writes reach the Repository (or wait for it). */
    synced: DraftStore & {
      /** Conflicts this store resolved: the other side kept the draft id, the local text became the copy. */
      conflicts?(): Array<{ draftId: string; copyId: string; reason: string }>;
      /** Draft ids edited here and not yet accepted by the account. */
      pendingPush?(): Promise<string[]>;
    };
  };
  /** Appends an immutable version; authorship is judged from `input.record.assistance`; the returned record has no pending assistance. */
  newVersion(input: NewVersionInput): DraftRecord;
  diff(version: DraftVersion, currentText: string): DiffLine[];
  /** A new version with the old text; the older versions stay. */
  restore(record: DraftRecord, versionId: string, at: string, deviceId: string): DraftRecord;
  exportDraft(record: DraftRecord, format: DraftExportFormat): FileOut;
  deleteDraft(draftId: string): Promise<void>;
  /** Sends the drafts the learner saved while the account could not be reached. Best effort; never throws. */
  flushPending?(): Promise<{ sent: number; waiting: number }>;

  // evidence (no text, ever)
  saveEvidence(input: SaveEvidenceInput): WritingEvidence;
  correctionEvidence(input: CorrectionEvidenceInput): WritingEvidence;

  // privacy
  privacy: {
    statement(): { title: string; sections: Array<{ heading: string; points: string[] }> };
    exportAll(): Promise<FileOut>;
    /** Removes every draft this device holds for the learner (the account copies stay). */
    cleanDevice(): Promise<{ removed: number }>;
    remote: {
      /** Name of the configured provider, or undefined when none is wired. */
      providerName(): string | undefined;
      consent(): boolean;
      setConsent(on: boolean): Promise<void>;
    };
  };
}

// ───────────────────────────── the host (what the shell gives the workspace) ─────────────────────────────

export type WorkspaceApi = Pick<RepositoryApi, 'knowledge' | 'listDocuments' | 'getDocument' | 'putDocument' | 'deleteDocument' | 'preferences'>
  & Partial<Pick<RepositoryApi, 'submitWriting'>>;

export interface SubmitReport { sent: number; queued: number; refused: Array<{ id: string; issues: string[] }> }

export interface TellHost {
  identity: Identity & { teamId?: string; email?: string };
  appVersion: string;
  now(): Date;
  newId(): string;
  api: WorkspaceApi;
  /** Observation events: tried through `submitWriting`, else (or when it fails) the shell's offline queue. Never throws. */
  submit(events: GoEvent[]): Promise<SubmitReport>;
  /** The learner's own events of this language from the local log; the workspace reads goal preferences from it. */
  events(): Promise<GoEvent[]>;
  /** A one-line account of the connection and what waits to be sent. */
  syncLine(): Promise<{ text: string; online: boolean }>;
  timers: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
  download(file: FileOut): void;
}
