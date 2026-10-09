/**
 * The rules both stores share, written once so memory and SQLite cannot drift apart. Pure functions only: no I/O, no
 * clock beyond the injected one, nothing that knows which backend calls it.
 */
import { STATUS_RANK, validateEvent } from '../../repository-contract/src';
import type {
  AnalysisStatus, EventFilter, FormAnalysis, GoEvent, LanguagePackInfo, PrivateDocument, RepositoryStore, SourceRef, StoredEvent, Tombstone,
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
  if (want.locator !== undefined && ref.locator !== want.locator) return false;
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
  return STATUS_RANK[incoming] >= STATUS_RANK[existing];
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
 * `deleteDocument`: the body is blanked and `deletedAt` set. The revision moves on, so a device that still holds the old
 * text cannot overwrite the deletion with a stale `putDocument`.
 */
export function deletedDocument(d: PrivateDocument, at: string): PrivateDocument {
  return { ...d, body: '', deletedAt: at, updatedAt: at, revision: d.revision + 1 };
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

/** What `createMemoryStore` and `openSqliteStore` return: the port, plus event removal and the full erasure counts. */
export interface ConcreteStore extends RepositoryStore, EventRemover {
  eraseLearner(learnerId: string): Promise<EraseCounts>;
}

export const zeroErase =(): EraseCounts => ({ events: 0, documents: 0, knowledge: 0, preferences: 0, sessions: 0, devices: 0, enrolments: 0, tombstones: 0, teamMemberships: 0, accounts: 0, learners: 0 });
