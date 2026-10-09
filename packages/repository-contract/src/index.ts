/**
 * @go/repository-contract — the only module GoLearn (app + extension), GoReview and GoTell may import from the
 * Repository. Scaffolding for the architectural phase (2026-10-08): the event envelope, the event families, and a
 * runtime validator. No engine, no store, no UI. See docs/ecosystem/GO-REPOSITORY-DESIGN.md §5.
 *
 * Boundary rules (enforced by test/ecosystem/boundaries.test.ts):
 *  - this package imports nothing from src/ or from any other package;
 *  - application packages import this package and never each other.
 */

export const CONTRACT_VERSION = 1 as const;

export type Producer = 'golearn-ext' | 'golearn-app' | 'gopractice-review' | 'gopractice-tell' | 'repository';

export type EventFamily = 'reading-context' | 'reading-report' | 'listening' | 'review' | 'writing' | 'profile';

/** The event kinds of the first vertical slice; each family grows by versioned addition, never by renaming. */
export const EVENT_KINDS = {
  'reading-context': ['SelectionLookedUp', 'AnalysisShown', 'PronunciationPlayed'],
  'reading-report': ['UnderstoodMarked', 'ItemMarked'],
  listening: ['ListeningCompleted', 'ListeningAssessed'],
  review: ['CardReviewed', 'CardAdded', 'CardRemoved', 'AssessmentAnswered'],
  writing: ['DraftSaved', 'SentenceSubmitted', 'CorrectionAccepted', 'CorrectionRejected', 'ProductionRecorded'],
  profile: ['EnrolmentChanged', 'PackInstalled', 'PrivacySettingChanged', 'ConsentGiven', 'ConsentWithdrawn'],
} as const satisfies Record<EventFamily, readonly string[]>;

export type EventKind = (typeof EVENT_KINDS)[EventFamily][number];

export const familyOf = (kind: EventKind): EventFamily =>
  (Object.keys(EVENT_KINDS) as EventFamily[]).find((f) => (EVENT_KINDS[f] as readonly string[]).includes(kind))!;

/** A context is identified, never copied: a hash of the sentence and where it came from. */
export interface SourceRef {
  kind: 'web' | 'ebook' | 'file' | 'demo';
  title?: string;
  locator?: string;
}

export interface EventSubject {
  itemIds?: string[];
  sentenceKey?: string; // hash of the exact sentence text (ids.sentenceKey in the engine), never the text
  sourceRef?: SourceRef;
  cardId?: string;
  draftId?: string;
}

export interface Provenance {
  packId: string;
  analyzerId: string;
  confidence?: number;
}

export interface GoEvent<K extends EventKind = EventKind, P = Record<string, unknown>> {
  id: string;
  v: typeof CONTRACT_VERSION;
  learnerId: string;
  enrolmentId: string;
  languageId: string;
  at: string; // ISO, device clock
  recordedAt?: string; // ISO, set by the Repository on sync
  producer: { app: Producer; version: string; deviceId: string };
  kind: K;
  subject: EventSubject;
  payload: P;
  dedupeKey?: string;
  provenance?: Provenance;
  /** A correction never edits: it references the event it corrects. */
  correctionOf?: string;
}

export interface ValidationIssue { path: string; message: string }

const PRODUCERS: readonly Producer[] = ['golearn-ext', 'golearn-app', 'gopractice-review', 'gopractice-tell', 'repository'];
const ALL_KINDS = new Set<string>(Object.values(EVENT_KINDS).flat());
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Runtime validation at the write boundary: the Repository refuses what the types alone cannot refuse. */
export function validateEvent(e: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!e || typeof e !== 'object') return [{ path: '', message: 'not an object' }];
  const x = e as Record<string, unknown>;
  const str = (k: string) => { if (typeof x[k] !== 'string' || !(x[k] as string).length) issues.push({ path: k, message: 'required string' }); };
  for (const k of ['id', 'learnerId', 'enrolmentId', 'languageId', 'at']) str(k);
  if (x.v !== CONTRACT_VERSION) issues.push({ path: 'v', message: `contract version ${CONTRACT_VERSION} required` });
  if (typeof x.at === 'string' && !ISO.test(x.at)) issues.push({ path: 'at', message: 'ISO 8601 timestamp required' });
  if (!ALL_KINDS.has(String(x.kind))) issues.push({ path: 'kind', message: 'unknown event kind' });
  const p = x.producer as Record<string, unknown> | undefined;
  if (!p || !PRODUCERS.includes(p.app as Producer) || typeof p.version !== 'string' || typeof p.deviceId !== 'string') issues.push({ path: 'producer', message: 'app, version and deviceId required' });
  if (!x.subject || typeof x.subject !== 'object') issues.push({ path: 'subject', message: 'required object' });
  else {
    const s = x.subject as Record<string, unknown>;
    if (s.sentenceText !== undefined || s.text !== undefined) issues.push({ path: 'subject', message: 'a subject identifies a context; it never carries its text' });
  }
  if (!x.payload || typeof x.payload !== 'object') issues.push({ path: 'payload', message: 'required object' });
  if (x.correctionOf !== undefined && typeof x.correctionOf !== 'string') issues.push({ path: 'correctionOf', message: 'event id' });
  return issues;
}

/** The queries the applications may ask; implemented by the engine package, consumed through this contract only. */
export interface RepositoryQueries {
  itemKnowledge(learnerId: string, itemIds: string[]): Promise<Record<string, ItemKnowledgeView>>;
  priorities(learnerId: string, enrolmentId: string, limit: number): Promise<PriorityView[]>;
}

export interface ItemKnowledgeView {
  itemId: string;
  reading: { level: string; confidence: number; decayed: boolean };
  listening: { level: string; confidence: number };
  writing: { level: string; confidence: number };
  lastMetAt?: string;
  /** Which observations the estimate rests on, so every estimate can be traced to events. */
  basis: { encounters: number; demonstrations: number; productions: number; reviews: number };
}

export interface PriorityView { itemId: string; score: number; reasons: string[] }

export interface RepositoryWriter {
  /** Appends after validation; returns the stored id. Idempotent on `dedupeKey`. Never overwrites. */
  append(event: GoEvent): Promise<string>;
}
