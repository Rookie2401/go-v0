/**
 * The rules both stores share, written once so memory and SQLite cannot drift apart. Pure functions only: no I/O, no
 * clock beyond the injected one, nothing that knows which backend calls it.
 */
import { MAX_CORRECTIONS, STATUS_RANK, effectiveReviewEvents, invalidateFieldStates, sourceLocator, validateEvent } from '../../repository-contract/src';
import type {
  AnalysisStatus, EventFilter, FormAnalysis, GoEvent, LanguagePackInfo, LinguisticUnit, PrivateDocument, RepositoryStore, SourceRef, StoredEvent, Tombstone,
  ProvenanceOrigin, UnitCorrection, UnitProvenance, ValidationLevel,
} from '../../repository-contract/src';

/** Options both stores accept. */
export interface StoreOptions {
  /** ISO clock stamped into `recordedAt`; injectable so tests are deterministic. */
  now?: () => string;
}

/** The two things the concrete stores offer beyond the port: physical event removal for tombstones. */
export interface EventRemover {
  /** Physically removes the learner's events with these ids; returns how many rows went. Used by `applyTombstone` only. */
  deleteEvents(learnerId: string, ids: string[]): Promise<number>;
}

export const DEFAULT_LIST_LIMIT = 1000;
export const MAX_LIST_LIMIT = 5000;

export const defaultNow = (): string => new Date().toISOString();

export function clampLimit(limit: number | undefined, fallback = DEFAULT_LIST_LIMIT): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(MAX_LIST_LIMIT, Math.max(1, Math.floor(limit)));
}

/** What an event must satisfy before a store writes it under `learnerId`; empty array = accepted. */
export function appendIssues(learnerId: string, e: unknown): Array<{ path: string; message: string }> {
  const issues = validateEvent(e);
  if (typeof learnerId !== 'string' || !learnerId.length) issues.push({ path: 'learnerId', message: 'a learner id is required' });
  else if (e && typeof e === 'object' && (e as GoEvent).learnerId !== learnerId) {
    issues.push({ path: 'learnerId', message: 'a store never writes one learner’s event under another learner' });
  }
  return issues;
}

/** Atomic review-history compare-and-set. Legacy payloads omit the token and remain ingestible. */
export function expectedReviewPredecessorIssue(e: GoEvent, existing: GoEvent[]): { path: string; message: string } | undefined {
  const payload = e.payload as Record<string, unknown>;
  if (payload.expectedPreviousReviewId === undefined) return undefined;
  const cardId = e.subject.cardId;
  if (!cardId) return { path: 'subject.cardId', message: 'a versioned review must name its card' };
  const sameCard = existing.filter((x) => x.learnerId === e.learnerId && x.languageId === e.languageId && x.subject.cardId === cardId);
  const isGrade = ['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed'].includes(e.kind) && Number.isInteger(payload.rating) && Number(payload.rating) >= 1 && Number(payload.rating) <= 4;
  const isCorrection = e.correctionOf !== undefined && payload.rating === null;
  if (isGrade && !sameCard.some((x) => x.kind === 'CardAdded' && Date.parse(x.at) <= Date.parse(e.at))) {
    return { path: 'subject.cardId', message: 'a versioned grade requires an earlier CardAdded event for this card' };
  }
  if (isCorrection && !sameCard.some((x) => x.id === e.correctionOf)) {
    return { path: 'correctionOf', message: 'a review correction must reference an existing grade for this card' };
  }
  const effective = effectiveReviewEvents(sameCard)
    .filter((x) => ['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed'].includes(x.kind) && typeof (x.payload as Record<string, unknown>).rating === 'number')
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
  const latest = effective.at(-1)?.id ?? null;
  if (payload.expectedPreviousReviewId !== latest) {
    return { path: 'payload.expectedPreviousReviewId', message: `stale review predecessor; expected ${latest ?? 'no prior graded review'}. Keep this review for recovery and refresh the schedule.` };
  }
  return undefined;
}

export const outcomeId = (e: unknown): string => (e && typeof e === 'object' && typeof (e as GoEvent).id === 'string' ? (e as GoEvent).id : '');

/** The envelope as stored: the caller's `seq` (if a stored event is re-appended) is dropped and `recordedAt` is the store's. */
export function envelopeOf(e: GoEvent, recordedAt: string): GoEvent {
  const copy = structuredClone(e) as GoEvent & { seq?: number };
  delete copy.seq;
  copy.recordedAt = recordedAt;
  return copy;
}

/** Lexicographic comparison of key tuples: the order SQLite gives `ORDER BY a, b, c`, so both stores list alike. */
export function byKey<T>(key: (v: T) => string[]): (a: T, b: T) => number {
  return (a, b) => {
    const x = key(a);
    const y = key(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  };
}

export const atMs = (iso: string): number => Date.parse(iso);

/** Whether a stored event passes an `EventFilter` (everything but `limit`). */
export function matchesFilter(e: StoredEvent, f: EventFilter): boolean {
  if (e.learnerId !== f.learnerId) return false;
  if (f.languageId !== undefined && e.languageId !== f.languageId) return false;
  if (f.kinds !== undefined && !f.kinds.includes(e.kind)) return false;
  if (f.unitId !== undefined && !(e.subject.itemIds ?? []).includes(f.unitId)) return false;
  if (f.since !== undefined && !(atMs(e.at) >= atMs(f.since))) return false;
  if (f.afterSeq !== undefined && !(e.seq > f.afterSeq)) return false;
  return true;
}

/** A source tombstone matches by kind, and by title and locator wherever the tombstone names them. */
export function sourceMatches(ref: SourceRef | undefined, want: { kind: string; title?: string; locator?: string }): boolean {
  if (!ref || ref.kind !== want.kind) return false;
  if (want.title !== undefined && ref.title !== want.title) return false;
  // `sourceLocator` is the stored locator, or for a scripture reference `BOOK.chapter[.verse]` and for media `provider:mediaId` (contract v3).
  if (want.locator !== undefined && sourceLocator(ref) !== want.locator) return false;
  return true;
}

export const inRange = (at: string, from: string, to: string): boolean => atMs(at) >= atMs(from) && atMs(at) <= atMs(to);

/** An event whose id was tombstoned individually is never written again (a stale device resync must not undelete it). */
export function tombstonedEventIds(ts: Tombstone[]): Set<string> {
  const out = new Set<string>();
  for (const t of ts) if (t.scope.kind === 'event') out.add(t.scope.id);
  return out;
}

// ───────────────────────────── Layer A ─────────────────────────────

/** Whether an incoming unit/relation row may replace the stored one: never when it would lower the status rank. */
export function mayReplaceByRank(existing: AnalysisStatus | undefined, incoming: AnalysisStatus): boolean {
  if (existing === undefined) return true;
  // `requires-review` is sticky: a re-resolution that comes back `provisional` is the very row somebody challenged, so it must not wipe the
  // flag. Only a person's verdict (`high-confidence` or `verified`), or the same flag again, replaces it.
  if (existing === 'requires-review' && incoming === 'provisional') return false;
  return STATUS_RANK[incoming] >= STATUS_RANK[existing];
}

/**
 * The provenance to store when a row is rewritten. What the incoming row states wins; what it does not state is carried over from the
 * stored row, so a re-resolution by a producer that knows nothing of contract v3 (no `origin`, no `validation`) cannot erase the origin a
 * lookup was stamped with or the corrections people recorded. Corrections are never dropped.
 */
export function carryProvenance(existing: UnitProvenance | undefined, incoming: UnitProvenance): UnitProvenance {
  if (!existing) return incoming;
  const out: UnitProvenance = { ...incoming };
  for (const k of ['origin', 'validation', 'licenceId', 'packVersion', 'analyzerVersion', 'alternatives'] as const) {
    if (out[k] === undefined && existing[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = existing[k];
  }
  if (existing.corrections?.length) {
    const have = new Set((incoming.corrections ?? []).map((c) => `${c.at}\u0000${c.by}\u0000${c.reason}`));
    out.corrections = [...existing.corrections.filter((c) => !have.has(`${c.at}\u0000${c.by}\u0000${c.reason}`)), ...(incoming.corrections ?? [])].slice(-MAX_CORRECTIONS);
  }
  return out;
}

/** A unit or relation as it is stored over `existing`: same row, provenance carried. */
export function carried<T extends { provenance: UnitProvenance }>(existing: T | undefined, incoming: T): T {
  if (!existing) return incoming;
  const out = { ...incoming, provenance: carryProvenance(existing.provenance, incoming.provenance) };
  // Stage 7: a unit rewritten by a producer that states no field states keeps the stored ones
  const stored = (existing as { fieldStates?: unknown }).fieldStates;
  if (stored !== undefined && (incoming as { fieldStates?: unknown }).fieldStates === undefined) (out as { fieldStates?: unknown }).fieldStates = stored;
  return out;
}

/** An analysis as stored over `existing`: the analysis' own provenance (when it has one) is carried the same way. */
export function carriedAnalysis(existing: FormAnalysis | undefined, incoming: FormAnalysis): FormAnalysis {
  if (!existing) return incoming;
  // Stage 7: a rewrite that states no field states keeps the stored ones (a producer that predates Stage 7 cannot erase them)
  const withStates: FormAnalysis = incoming.fieldStates === undefined && existing.fieldStates !== undefined ? { ...incoming, fieldStates: existing.fieldStates } : incoming;
  if (!existing.provenance) return withStates;
  return { ...withStates, provenance: incoming.provenance ? carryProvenance(existing.provenance, incoming.provenance) : existing.provenance };
}

/**
 * `recordUnitCorrection` for one unit: appends the correction and, if `flag`, moves `provisional` (or, for a reviewer, any live status other than
 * conflicted) to `requires-review`. Pure; both stores call it. `invalidated`, `conflicted` and `requires-review` are never changed.
 */
export function withCorrection(unit: LinguisticUnit, correction: UnitCorrection, flag: boolean): { unit: LinguisticUnit; statusChanged: boolean } {
  const corrections = [...(unit.provenance.corrections ?? []), correction].slice(-MAX_CORRECTIONS);
  const movable = unit.status === 'provisional' || (correction.by === 'reviewer' && (unit.status === 'high-confidence' || unit.status === 'verified'));
  const statusChanged = flag && movable;
  return { unit: { ...unit, status: statusChanged ? 'requires-review' : unit.status, provenance: { ...unit.provenance, corrections } }, statusChanged };
}

/** An invalidated analysis is terminal; any other row follows the same no-downgrade rank rule as units. */
export function mayReplaceAnalysis(existing: FormAnalysis | undefined, incoming: FormAnalysis): boolean {
  if (!existing) return true;
  if (existing.status === 'invalidated') return false;
  return mayReplaceByRank(existing.status, incoming.status);
}

export const relationKey = (r: { fromId: string; relation: string; toId: string }): string => `${r.fromId}|${r.relation}|${r.toId}`;

export function invalidated(a: FormAnalysis, reason: string, supersededBy?: string): FormAnalysis {
  const out: FormAnalysis = { ...a, status: 'invalidated', reason };
  // Stage 7: every field the analysis stated reads invalidated (the row, its candidates and the old states' basis stay)
  const fs = invalidateFieldStates(a.fieldStates, reason);
  if (fs) out.fieldStates = fs;
  if (supersededBy !== undefined) out.supersededBy = supersededBy;
  return out;
}

/** Numeric-aware comparison of pack versions (`2.10` after `2.9`). */
export function compareVersions(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

export function latestPack(packs: LanguagePackInfo[]): LanguagePackInfo | undefined {
  return packs.reduce<LanguagePackInfo | undefined>((best, p) => (best === undefined || compareVersions(p.version, best.version) > 0 ? p : best), undefined);
}

export const sortPacks = (packs: LanguagePackInfo[]): LanguagePackInfo[] =>
  [...packs].sort((a, b) => a.packId.localeCompare(b.packId) || compareVersions(a.version, b.version));

// ───────────────────────────── identity ─────────────────────────────

/** Emails compare case-insensitively and trimmed; the stored form is the normalised one. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** A row keyed by a global id may only be rewritten by the learner that owns it. */
export function assertSameOwner(what: string, existingLearnerId: string | undefined, incomingLearnerId: string): void {
  if (existingLearnerId !== undefined && existingLearnerId !== incomingLearnerId) throw new Error(`${what} belongs to another learner`);
}

// ───────────────────────────── documents ─────────────────────────────

export type PutDocumentResult = { ok: true } | { ok: false; current: PrivateDocument };

/**
 * The optimistic-concurrency decision for `putDocument`. `stored` is the current row (or undefined). Returns the document
 * to write (revision = expected + 1) or the conflict result. A document that does not exist cannot be updated: the caller
 * asked to update revision N of something that is not there, and there is no `current` to hand back, so that is an error.
 */
export function decidePutDocument(stored: PrivateDocument | undefined, doc: PrivateDocument, expectedRevision: number): { write: PrivateDocument } | { conflict: PutDocumentResult } {
  if (!stored) {
    if (expectedRevision !== 0) throw new Error(`document ${doc.docId} does not exist; a new document needs expectedRevision 0`);
    return { write: { ...structuredClone(doc), revision: 1 } };
  }
  if (stored.revision !== expectedRevision) return { conflict: { ok: false, current: structuredClone(stored) } };
  return { write: { ...structuredClone(doc), revision: expectedRevision + 1 } };
}

/**
 * `deleteDocument`: the body and the title are blanked and `deletedAt` set. The revision moves on, so a device that still holds the old
 * text cannot overwrite the deletion with a stale `putDocument`.
 */
export function deletedDocument(d: PrivateDocument, at: string): PrivateDocument {
  // The title is the learner's own words as much as the body is (audit P-03): the receipt keeps the id, kind, language and device, never a word.
  const { title: _title, ...rest } = d;
  return { ...rest, body: '', deletedAt: at, updatedAt: at, revision: d.revision + 1 };
}

/** Summary counts of an erasure; the first three are the port's, the rest say what else went. */
export interface EraseCounts {
  events: number;
  documents: number;
  knowledge: number;
  preferences: number;
  sessions: number;
  devices: number;
  enrolments: number;
  tombstones: number;
  teamMemberships: number;
  accounts: number;
  learners: number;
}

export interface ProvenanceCount { table: 'units' | 'relations' | 'analyses'; origin: ProvenanceOrigin; validation: ValidationLevel; count: number }

/** What `createMemoryStore` and `openSqliteStore` return: the port, plus event removal and the full erasure counts. */
export interface ConcreteStore extends RepositoryStore, EventRemover {
  eraseLearner(learnerId: string): Promise<EraseCounts>;
  /** Records a tombstone, then physically removes what its scope names (event / source / range) and drops the projection so the engine refolds. See ./deletion. */
  applyTombstone(t: Tombstone): Promise<{ events: number; knowledge: number; documents: number }>;
  /** Rows of the shared linguistic tables counted by how they came to exist (contract v3 `origin` and `validation`; v2 rows are `import` / `unreviewed`). Sorted by table, origin, validation. */
  provenanceStats(): Promise<ProvenanceCount[]>;
  /** Operator maintenance (SQLite): empties the write-ahead log and rebuilds the file without its free pages. A no-op where there is nothing to compact. */
  compact?(): Promise<void>;
}

export const zeroErase =(): EraseCounts => ({ events: 0, documents: 0, knowledge: 0, preferences: 0, sessions: 0, devices: 0, enrolments: 0, tombstones: 0, teamMemberships: 0, accounts: 0, learners: 0 });
