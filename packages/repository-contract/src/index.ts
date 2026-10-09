/**
 * @go/repository-contract — the only module GoLearn (app + extension), GoReview and GoTell may import from the
 * Repository. Contract version 2 (2026-10-08, Prompt 3): the event envelope and families (Layer B), the linguistic
 * knowledge units (Layer A, ./units), the derived learner state and identity (Layer C, ./learner), the typed payloads
 * with runtime validators (./payloads) and the ports the store, engine and service implement (./ports).
 * See docs/ecosystem/GO-REPOSITORY-DESIGN.md and docs/ecosystem/REPOSITORY-*.md.
 *
 * Boundary rules (enforced by test/ecosystem/boundaries.test.ts):
 *  - this package imports nothing from src/ or from any other package;
 *  - application packages import this package and never each other.
 */
import { validatePayload } from './payloads';
import type { ValidationIssue } from './units';

export * from './units';
export * from './learner';
export * from './payloads';
export * from './ports';
export type { ValidationIssue };

export const CONTRACT_VERSION = 2 as const;
/** Envelopes of these versions are accepted at the write boundary; v1 rows (the extension prototype) lack the optional v2 fields only. */
export const ACCEPTED_VERSIONS: readonly number[] = [1, 2];

export type Producer = 'golearn-ext' | 'golearn-app' | 'gopractice-review' | 'gopractice-tell' | 'repository' | 'import';

export type EventFamily = 'reading-context' | 'reading-report' | 'listening' | 'review' | 'writing' | 'correction' | 'profile';

/** The event kinds; each family grows by versioned addition, never by renaming. Payload shapes: ./payloads PAYLOAD_KINDS. */
export const EVENT_KINDS = {
  'reading-context': ['EncounterRecorded', 'SelectionLookedUp', 'AnalysisShown', 'AssistanceRequested', 'PronunciationPlayed'],
  'reading-report': ['UnderstoodMarked', 'ItemMarked'],
  listening: ['ListeningCompleted', 'ListeningAssessed'],
  review: ['CardReviewed', 'CardAdded', 'CardRemoved', 'AssessmentAnswered'],
  writing: ['DraftSaved', 'SentenceSubmitted', 'CorrectionAccepted', 'CorrectionRejected', 'ProductionRecorded'],
  correction: ['AnalysisCorrected', 'ReviewItemInvalidated'],
  profile: ['EnrolmentChanged', 'PackInstalled', 'PrivacySettingChanged', 'ConsentGiven', 'ConsentWithdrawn', 'PreferenceChanged'],
} as const satisfies Record<EventFamily, readonly string[]>;

export type EventKind = (typeof EVENT_KINDS)[EventFamily][number];

export const familyOf = (kind: EventKind): EventFamily =>
  (Object.keys(EVENT_KINDS) as EventFamily[]).find((f) => (EVENT_KINDS[f] as readonly string[]).includes(kind))!;

/** A context is identified, never copied: a hash of the sentence and where it came from. */
export interface SourceRef {
  kind: 'web' | 'ebook' | 'file' | 'demo' | 'practice' | 'writing';
  title?: string;
  locator?: string;
}

export interface EventSubject {
  itemIds?: string[];
  sentenceKey?: string; // hash of the exact sentence text, never the text
  sourceRef?: SourceRef;
  cardId?: string;
  draftId?: string;
}

export interface Provenance {
  packId: string;
  analyzerId: string;
  confidence?: number;
  /** Validation status of the analysis the event rests on, when known (see units.ts). */
  status?: string;
  /** The analysis row the event refers to, when one was stored. */
  analysisId?: string;
}

/** The producer's own statement of evidence strength; the engine may lower it and never raises it. */
export interface EvidenceNote {
  quality: 'none' | 'weak' | 'moderate' | 'strong';
  /** Whether any help (gloss, hint, translation, correction) was present when the observation was made. */
  assisted?: boolean;
  /** Reliability of the source producing the judgement, 0..1 (a self-report is less reliable than a graded answer). */
  sourceReliability?: number;
}

/** The source surface inside the producing application (a tutorial screen, a reading card, a listening exercise). */
export type SourceSurface = string;

export interface GoEvent<K extends EventKind = EventKind, P = Record<string, unknown>> {
  id: string;
  v: number; // one of ACCEPTED_VERSIONS; new events use CONTRACT_VERSION
  learnerId: string;
  enrolmentId: string;
  languageId: string;
  varietyId?: string;
  at: string; // ISO, device clock
  recordedAt?: string; // ISO, set by the Repository on append
  producer: { app: Producer; version: string; deviceId: string; surface?: SourceSurface };
  kind: K;
  subject: EventSubject;
  payload: P;
  /** Idempotency key: the same key from the same learner is stored once, across retries and devices. */
  dedupeKey?: string;
  evidence?: EvidenceNote;
  provenance?: Provenance;
  /** Parser / pack versions that processed the observation, when relevant. */
  processing?: { parserVersion?: string; packVersion?: string };
  /** A correction never edits: it references the event it corrects. */
  correctionOf?: string;
}

const PRODUCERS: readonly Producer[] = ['golearn-ext', 'golearn-app', 'gopractice-review', 'gopractice-tell', 'repository', 'import'];
const ALL_KINDS = new Set<string>(Object.values(EVENT_KINDS).flat());
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const QUALITIES = ['none', 'weak', 'moderate', 'strong'];

/** Runtime validation at the write boundary: the Repository refuses what the types alone cannot refuse. */
export function validateEvent(e: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!e || typeof e !== 'object') return [{ path: '', message: 'not an object' }];
  const x = e as Record<string, unknown>;
  const str = (k: string) => { if (typeof x[k] !== 'string' || !(x[k] as string).length) issues.push({ path: k, message: 'required string' }); };
  for (const k of ['id', 'learnerId', 'enrolmentId', 'languageId', 'at']) str(k);
  if (typeof x.id === 'string' && x.id.length > 200) issues.push({ path: 'id', message: 'at most 200 characters' });
  if (!ACCEPTED_VERSIONS.includes(x.v as number)) issues.push({ path: 'v', message: `contract version ${ACCEPTED_VERSIONS.join(' or ')} required` });
  if (typeof x.at === 'string' && !ISO.test(x.at)) issues.push({ path: 'at', message: 'ISO 8601 timestamp required' });
  if (x.recordedAt !== undefined && (typeof x.recordedAt !== 'string' || !ISO.test(x.recordedAt))) issues.push({ path: 'recordedAt', message: 'ISO 8601 timestamp' });
  if (!ALL_KINDS.has(String(x.kind))) issues.push({ path: 'kind', message: 'unknown event kind' });
  const p = x.producer as Record<string, unknown> | undefined;
  if (!p || !PRODUCERS.includes(p.app as Producer) || typeof p.version !== 'string' || typeof p.deviceId !== 'string') issues.push({ path: 'producer', message: 'app, version and deviceId required' });
  if (!x.subject || typeof x.subject !== 'object') issues.push({ path: 'subject', message: 'required object' });
  else {
    const s = x.subject as Record<string, unknown>;
    if (s.sentenceText !== undefined || s.text !== undefined) issues.push({ path: 'subject', message: 'a subject identifies a context; it never carries its text' });
    if (s.itemIds !== undefined && (!Array.isArray(s.itemIds) || s.itemIds.some((i) => typeof i !== 'string'))) issues.push({ path: 'subject.itemIds', message: 'array of unit ids' });
  }
  if (!x.payload || typeof x.payload !== 'object') issues.push({ path: 'payload', message: 'required object' });
  else if (ALL_KINDS.has(String(x.kind))) issues.push(...validatePayload(String(x.kind), x.payload));
  if (x.correctionOf !== undefined && typeof x.correctionOf !== 'string') issues.push({ path: 'correctionOf', message: 'event id' });
  if (x.dedupeKey !== undefined && (typeof x.dedupeKey !== 'string' || !x.dedupeKey.length || x.dedupeKey.length > 300)) issues.push({ path: 'dedupeKey', message: 'non-empty string up to 300 characters' });
  if (x.evidence !== undefined) {
    const ev = x.evidence as Record<string, unknown>;
    if (!ev || typeof ev !== 'object' || !QUALITIES.includes(String(ev.quality))) issues.push({ path: 'evidence.quality', message: `one of ${QUALITIES.join(', ')}` });
    if (ev && ev.sourceReliability !== undefined && (typeof ev.sourceReliability !== 'number' || ev.sourceReliability < 0 || ev.sourceReliability > 1)) issues.push({ path: 'evidence.sourceReliability', message: 'number within 0..1' });
  }
  if (x.provenance !== undefined) {
    const pr = x.provenance as Record<string, unknown>;
    if (!pr || typeof pr !== 'object' || typeof pr.packId !== 'string' || typeof pr.analyzerId !== 'string') issues.push({ path: 'provenance', message: 'packId and analyzerId required' });
  }
  return issues;
}

/** The queries the applications may ask; implemented by the engine package, consumed through this contract only. */
export interface RepositoryQueries {
  itemKnowledge(learnerId: string, itemIds: string[]): Promise<Record<string, ItemKnowledgeView>>;
  priorities(learnerId: string, enrolmentId: string, limit: number): Promise<PriorityView[]>;
}

/** A compact view for applications; the full seven-dimension row is `UnitKnowledge` (./learner). */
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
