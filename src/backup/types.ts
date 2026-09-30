/**
 * Backup file format (format "go-backup", version 1) and the shapes restore/validate report.
 * Only the learner's SOURCE-OF-TRUTH rows are here. Corpus texts, generated audio and derived learner state
 * (encounters, learnerItems) are deliberately absent: they are rebuilt from the corpus + the event log.
 */
import type {
  Corpus, ContentSource, DomainEvent, EnglishRescue, GoTellSuggestion, GrammarPattern, Lemma, MetaRow, Paragraph,
  PatternOccurrence, Phrase, PhraseOccurrence, Sentence, Testimony, TestimonyDraft, TestimonyRevision, Text, TextSection,
  Token, TokenAnalysis, User, UserRecording,
} from '../core';

export const BACKUP_FORMAT = 'go-backup';
export const BACKUP_VERSION = 1;

/** The private `kind: 'testimony'` Texts (one per accepted revision) with everything hanging off them. */
export interface TestimonyContent {
  texts: Text[];
  sections: TextSection[];
  paragraphs: Paragraph[];
  sentences: Sentence[];
  tokens: Token[];
  analyses: TokenAnalysis[];
  rescues: EnglishRescue[];
  phraseOccurrences: PhraseOccurrence[];
  patternOccurrences: PatternOccurrence[];
}

/**
 * Content-keyed support rows the testimony content points at (its corpus, rights source, lemmas, phrases, patterns).
 * Restore only ever ADDS these when absent; it never modifies or deletes a row that already exists.
 */
export interface ReferenceRows {
  corpora: Corpus[];
  sources: ContentSource[];
  lemmas: Lemma[];
  phrases: Phrase[];
  patterns: GrammarPattern[];
}

export interface BackupAsset {
  mime: string;
  /** Standard base64 of the exact bytes. */
  base64: string;
  bytes: number;
}

export interface BackupData {
  user: User;
  events: DomainEvent[];
  testimonies: Testimony[];
  revisions: TestimonyRevision[];
  suggestions: GoTellSuggestion[];
  drafts: TestimonyDraft[];
  /** Recording METADATA is always present; the audio is in `assets` only when exported with includeRecordings. */
  recordings: UserRecording[];
  testimonyContent: TestimonyContent;
  reference: ReferenceRows;
  /** This learner's non-derived meta rows (policy/derived markers are excluded — see docs/STORAGE.md). */
  meta: MetaRow[];
  /** Recording audio by asset id (empty unless includeRecordings). */
  assets: Record<string, BackupAsset>;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  userId: string;
  /** GoLearn evidence-policy version recorded in `meta` at export time, when present (informational). */
  policyVersion?: string;
  includesRecordings: boolean;
  /** Row counts per collection (human-readable summary; also cross-checked by validateBackup). */
  counts: Record<string, number>;
  /** `fnv1a64:<hex>` over the canonical JSON of `data` (corruption / truncation detection, not tamper-proofing). */
  checksum: string;
  data: BackupData;
}

export type BackupIssueCode =
  | 'not-json' | 'not-a-backup' | 'unsupported-version' | 'bad-checksum' | 'malformed' | 'wrong-learner'
  | 'count-mismatch' | 'missing-audio' | 'dangling-reference';

export interface BackupIssue {
  code: BackupIssueCode;
  /** 'error' rejects the file; 'warning' is reported but does not block a restore. */
  severity: 'error' | 'warning';
  /** Actionable, user-facing wording. */
  message: string;
  /** Where in the file (e.g. "data.events[3].userId"), when known. */
  path?: string;
}

export interface TableStat {
  /** Rows written that did not exist. */
  added: number;
  /** Existing rows replaced (only where the merge rule says the backup's row is newer / further along). */
  updated: number;
  /** Rows already identical on the device. */
  unchanged: number;
  /** Rows on the device that differ but were kept (existing wins / is newer). */
  keptExisting: number;
}

export interface RestoreReport {
  userId: string;
  mode: 'merge' | 'replace';
  /** True when learner state derived from events is stale and GoLearn must `rebuild(userId)` (events were added or replaced). */
  needsRebuild: boolean;
  /** False when the restore changed nothing (e.g. the same file restored twice). */
  changed: boolean;
  events: { added: number; duplicateById: number; duplicateByDedupeKey: number; conflictingOwner: number };
  tables: Record<string, TableStat>;
  /** Rows deleted first by mode 'replace' (this learner's only). */
  removed: Record<string, number>;
  recordings: { audioRestored: number; metadataWithoutAudio: number };
  warnings: string[];
}
