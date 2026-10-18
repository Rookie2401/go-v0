/**
 * The ports of the Repository: what the store must provide, what the engine computes, what the service exposes.
 * Implemented by packages/repository-store (memory + SQLite), packages/repository-engine, packages/repository-service;
 * consumed through this contract only. All methods are async so a remote binding can satisfy them.
 */
import type { GoEvent } from './index';
import type { FormAnalysis, LanguagePackInfo, LinguisticUnit, UnitAlias, UnitCorrection, UnitRelation } from './units';
import type { AssistancePreferences, Device, Enrolment, Learner, ReviewCandidate, SuitabilityEstimate, Team, UnitKnowledge } from './learner';
import type { KnowledgeLevel } from './knowledge-levels';

// ───────────────────────────── events (Layer B) ─────────────────────────────

export interface AppendOutcome { id: string; stored: boolean; duplicateOf?: string; issues?: Array<{ path: string; message: string }> }

export interface EventFilter {
  learnerId: string;
  languageId?: string;
  kinds?: string[];
  unitId?: string;
  /** `at` lower bound (inclusive), ISO. */
  since?: string;
  /** Pagination over the stored order (`seq`), for sync. */
  afterSeq?: number;
  /** Optional newest-first ordering for bounded recent activity views. */
  order?: 'asc' | 'desc';
  limit?: number;
}

export interface StoredEvent extends GoEvent { seq: number; recordedAt: string }
export interface EncounterEventSummary { unitId: string; event: StoredEvent }
export interface EncounterDateRange { unitId: string; firstEncounter?: string; lastEncounter?: string }
export interface ReviewStatusSummary { unitId: string; event: StoredEvent }

export interface EventLog {
  /** Validates, de-duplicates on id and dedupeKey, stamps `recordedAt`, never overwrites. */
  append(learnerId: string, events: GoEvent[]): Promise<AppendOutcome[]>;
  list(filter: EventFilter): Promise<StoredEvent[]>;
  get(learnerId: string, id: string): Promise<StoredEvent | undefined>;
  /** Highest seq for the learner (0 when empty). */
  head(learnerId: string): Promise<number>;
  /** Bounded recent encounter/assistance metadata for a page of units; does not load full event histories. */
  listEncounterSummaries?(learnerId: string, languageId: string, unitIds: string[], perUnitLimit: number): Promise<EncounterEventSummary[]>;
  /** Exact encounter date bounds for a page of units, grouped from indexed event references. */
  getEncounterDateRanges?(learnerId: string, languageId: string, unitIds: string[]): Promise<EncounterDateRange[]>;
  /** Latest status event per card for units on a page; event history remains untouched. */
  listReviewStatusSummaries?(learnerId: string, languageId: string, unitIds: string[]): Promise<ReviewStatusSummary[]>;
  /** Units with at least one actual AssistanceRequested event in the language. */
  listAssistanceRequestedUnitIds?(learnerId: string, languageId: string, unitIds: string[]): Promise<string[]>;
}

// ───────────────────────────── linguistic knowledge (Layer A) ─────────────────────────────

export interface LinguisticStore {
  getUnits(ids: string[]): Promise<LinguisticUnit[]>;
  putUnits(units: LinguisticUnit[]): Promise<void>;
  findUnits(q: { languageId: string; kind?: string; label?: string; limit?: number }): Promise<LinguisticUnit[]>;
  relationsOf(unitId: string, direction?: 'out' | 'in' | 'both'): Promise<UnitRelation[]>;
  putRelations(rels: UnitRelation[]): Promise<void>;
  getAnalysis(analysisId: string): Promise<FormAnalysis | undefined>;
  analysesOfForm(formId: string, sentenceKey?: string): Promise<FormAnalysis[]>;
  putAnalyses(a: FormAnalysis[]): Promise<void>;
  /** Marks an analysis invalidated (status + reason + supersededBy); the row remains. */
  invalidateAnalysis(analysisId: string, reason: string, supersededBy?: string): Promise<void>;
  aliasesFor(ids: string[]): Promise<UnitAlias[]>;
  /** Aliases whose canonical target is one of the requested ids (for learner-facing alternate-form search). */
  aliasesTo?(ids: string[]): Promise<UnitAlias[]>;
  putAliases(a: UnitAlias[]): Promise<void>;
  /**
   * Contract v3. Appends `correction` to the unit's `provenance.corrections` (oldest first; the unit's other fields are untouched) and,
   * when `flag` is set, moves the unit to `requires-review` where the rule allows it: only from `provisional`, or from any live status when the
   * correction is by a `reviewer`; `invalidated`, `conflicted` and `requires-review` are never changed. This is the one way a status goes DOWN
   * (a normal `putUnits` never lowers it). Returns the stored unit and whether its status changed, or undefined when there is no such unit.
   * Optional so a store written before v3 still satisfies the port.
   */
  recordUnitCorrection?(unitId: string, correction: UnitCorrection, flag: boolean): Promise<{ unit: LinguisticUnit; statusChanged: boolean } | undefined>;
  getPack(packId: string, version?: string): Promise<LanguagePackInfo | undefined>;
  putPack(p: LanguagePackInfo): Promise<void>;
  listPacks(languageId?: string): Promise<LanguagePackInfo[]>;
}

// ───────────────────────────── derived state (Layer C) ─────────────────────────────

export interface ProjectionStore {
  getKnowledge(learnerId: string, unitIds?: string[]): Promise<UnitKnowledge[]>;
  /** Indexed page over a learner's derived rows; cursor is the last returned unit id. */
  getKnowledgePage?(learnerId: string, q: { languageId: string; after?: string; limit: number; minEncounters?: number; sourceRef?: string }): Promise<UnitKnowledge[]>;
  /** Exact full-catalog encountered counts, computed from indexed projection rows. */
  getEncounteredKnowledgeStats?(learnerId: string, languageId: string): Promise<{ total: number; counts: Record<KnowledgeLevel, number> }>;
  putKnowledge(rows: UnitKnowledge[]): Promise<void>;
  /** Removes every projection row of the learner (for a rebuild). */
  clearKnowledge(learnerId: string): Promise<void>;
  getProjectionCursor(learnerId: string): Promise<{ seq: number; modelVersion: string } | undefined>;
  putProjectionCursor(learnerId: string, cursor: { seq: number; modelVersion: string }): Promise<void>;
  getPreferences(learnerId: string, languageId?: string): Promise<AssistancePreferences | undefined>;
  putPreferences(p: AssistancePreferences): Promise<void>;
}

// ───────────────────────────── private documents (GoTell), apart from events ─────────────────────────────

export interface PrivateDocument {
  docId: string;
  learnerId: string;
  languageId: string;
  kind: 'draft' | 'testimony' | 'note';
  title?: string;
  /** The learner's own text; stored here and nowhere else; exported and deleted with the learner. */
  body: string;
  /** Monotonic per document; conflicts are resolved by the explicit rules in the sync package. */
  revision: number;
  deviceId: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface DocumentStore {
  getDocument(learnerId: string, docId: string): Promise<PrivateDocument | undefined>;
  listDocuments(learnerId: string): Promise<PrivateDocument[]>;
  /** Succeeds only when `expectedRevision` matches the stored revision (or the doc is new and expectedRevision is 0). */
  putDocument(doc: PrivateDocument, expectedRevision: number): Promise<{ ok: true } | { ok: false; current: PrivateDocument }>;
  /** Physical removal of the body; the row keeps `deletedAt`. */
  deleteDocument(learnerId: string, docId: string): Promise<void>;
}

// ───────────────────────────── identity and access ─────────────────────────────

export interface Account {
  accountId: string; learnerId: string; email: string; createdAt: string; disabledAt?: string;
  /** Additive (accounts hardening). When the email address was confirmed; absent = not yet. Accounts that predate verification are stamped with their `createdAt` by the migration. */
  verifiedAt?: string;
  /** Additive. A deletion was requested at this time and the data is purged at `deletionDueAt` unless cancelled before. */
  deletionRequestedAt?: string;
  deletionDueAt?: string;
}
export interface Session {
  sessionId: string; accountId: string; learnerId: string; deviceId: string; createdAt: string; expiresAt: string; revokedAt?: string;
  /** Additive. The last time the session was used (written at most every few minutes). */
  lastSeenAt?: string;
}

export interface IdentityStore {
  getLearner(learnerId: string): Promise<Learner | undefined>;
  putLearner(l: Learner): Promise<void>;
  getAccountByEmail(email: string): Promise<(Account & { passwordHash: string }) | undefined>;
  getAccount(accountId: string): Promise<Account | undefined>;
  putAccount(a: Account & { passwordHash: string }): Promise<void>;
  getSessionByTokenHash(tokenHash: string): Promise<Session | undefined>;
  putSession(s: Session & { tokenHash: string }): Promise<void>;
  revokeSession(sessionId: string, at: string): Promise<void>;
  getDevice(learnerId: string, deviceId: string): Promise<Device | undefined>;
  putDevice(d: Device): Promise<void>;
  listEnrolments(learnerId: string): Promise<Enrolment[]>;
  putEnrolment(e: Enrolment): Promise<void>;
  getTeam(teamId: string): Promise<Team | undefined>;
  putTeam(t: Team): Promise<void>;
  /** Team membership is a separate record and grants no access to learner data. */
  listTeamMembers(teamId: string): Promise<Array<{ learnerId: string; role: 'member' | 'leader'; since: string }>>;
  putTeamMember(teamId: string, learnerId: string, role: 'member' | 'leader', since: string): Promise<void>;
}

// ───────────────────────────── account security (additive) ─────────────────────────────

export type AccountTokenPurpose = 'verify-email' | 'reset-password';

/** A one-time secret mailed to the account holder. Only the sha256 of the token is stored. */
export interface AccountToken { tokenHash: string; accountId: string; purpose: AccountTokenPurpose; createdAt: string; expiresAt: string; usedAt?: string }

/**
 * One line of the security log. It never holds a password, a token or a token hash. `learnerId` is absent on rows that must outlive the learner
 * (the purge audit line carries only `subjectRef`, a truncated digest of the account id).
 */
export interface SecurityEvent {
  eventId: string;
  learnerId?: string;
  kind: SecurityEventKind;
  at: string;
  deviceId?: string;
  /** A short fixed-vocabulary note (for example a session id, or counts for a purge). Never free text from a client. */
  detail?: string;
  subjectRef?: string;
}
export type SecurityEventKind =
  | 'account-created' | 'sign-in' | 'sign-in-failed' | 'sign-out' | 'sessions-revoked'
  | 'email-verification-sent' | 'email-verified'
  | 'password-reset-requested' | 'password-reset-used'
  | 'export-requested' | 'deletion-requested' | 'deletion-cancelled' | 'deletion-purged';

/** What accounts hardening needs beyond `IdentityStore`. Optional on `RepositoryStore` so a store written before it still satisfies the port; the service answers 501 for the routes that need it. */
export interface SecurityStore {
  /** Replaces nothing: tokens are keyed by hash. */
  putAccountToken(t: AccountToken): Promise<void>;
  /** Atomically marks the token used and returns it, only if it exists, has this purpose, is unused and has not expired at `at`. Otherwise undefined and nothing changes. */
  consumeAccountToken(tokenHash: string, purpose: AccountTokenPurpose, at: string): Promise<AccountToken | undefined>;
  /** Removes the account's unused tokens of this purpose (a newer one replaces them). */
  clearAccountTokens(accountId: string, purpose: AccountTokenPurpose): Promise<void>;
  /** Removes tokens that expired or were used before `cutoff`; returns how many. */
  deleteAccountTokensBefore(cutoff: string): Promise<number>;
  /** Stamps `lastSeenAt` on a live session. */
  touchSession(sessionId: string, at: string): Promise<void>;
  /** Every session row of the learner (revoked and expired included), newest first. Never a token hash. */
  listSessions(learnerId: string): Promise<Session[]>;
  /** Revokes the learner's live sessions (all, or all but `exceptSessionId`); returns how many were revoked. */
  revokeSessions(learnerId: string, at: string, exceptSessionId?: string): Promise<number>;
  /** Deletes session rows that ended (revoked or expired) before `cutoff`; returns how many. */
  deleteSessionsEndedBefore(cutoff: string): Promise<number>;
  appendSecurityEvent(e: SecurityEvent): Promise<void>;
  /** The learner's own events, newest first; `null` lists the lines that name no learner (the purge audit), for the operator. */
  listSecurityEvents(learnerId: string | null, limit?: number): Promise<SecurityEvent[]>;
  deleteSecurityEventsBefore(cutoff: string): Promise<number>;
  /** Accounts whose requested deletion is due at `at`, oldest due first. */
  listAccountsDeletionDue(at: string, limit?: number): Promise<Account[]>;
}

// ───────────────────────────── deletion / tombstones ─────────────────────────────

export interface Tombstone {
  tombstoneId: string;
  learnerId: string;
  scope: { kind: 'learner' } | { kind: 'source'; sourceRef: { kind: string; title?: string; locator?: string } } | { kind: 'range'; from: string; to: string } | { kind: 'event'; id: string };
  createdAt: string;
  reason?: string;
}

export interface TombstoneStore {
  listTombstones(learnerId: string): Promise<Tombstone[]>;
  putTombstone(t: Tombstone): Promise<void>;
}

/** Everything together, with a transaction boundary. Memory and SQLite implementations in repository-store. */
export interface RepositoryStore extends EventLog, LinguisticStore, ProjectionStore, DocumentStore, IdentityStore, TombstoneStore {
  /** Runs `fn` atomically where the backend supports it (SQLite); the memory store runs it as is. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /** Additive: tokens, the session list and the security log. Absent on a store that predates accounts hardening. */
  security?: SecurityStore;
  /** Removes every row of the learner (events, projections, documents, sessions, devices, enrolments). Irreversible. */
  eraseLearner(learnerId: string): Promise<{ events: number; documents: number; knowledge: number }>;
  close(): Promise<void>;
}

// ───────────────────────────── engine ─────────────────────────────

export interface ProjectionEngine {
  readonly modelVersion: string;
  /** Folds unprocessed events (after the cursor) into the learner's knowledge rows; idempotent per seq. */
  project(learnerId: string): Promise<{ folded: number; cursor: number }>;
  /** Discards the rows and folds the whole log again; returns the rows for comparison. */
  rebuild(learnerId: string): Promise<UnitKnowledge[]>;
  knowledge(learnerId: string, unitIds?: string[]): Promise<UnitKnowledge[]>;
  preferences(learnerId: string, languageId?: string): Promise<AssistancePreferences>;
  candidates(learnerId: string, enrolmentId: string, opts?: { limit?: number; now?: string }): Promise<ReviewCandidate[]>;
  suitability(learnerId: string, languageId: string, sample: { unitIds: string[]; tokenCount: number; constructionIds?: string[] }): Promise<SuitabilityEstimate>;
}

// ───────────────────────────── sync ─────────────────────────────

export interface SyncPushRequest { deviceId: string; events: GoEvent[]; documents?: Array<{ doc: PrivateDocument; expectedRevision: number }>; clientTime: string }
export interface SyncPushResponse {
  outcomes: AppendOutcome[];
  /** Per document: accepted, or refused with the server's current copy (a revision conflict), or refused with a `reason` and no copy (`no-such-document`: the server has no document at that revision; `refused`: any other per-item failure). */
  documents: Array<{ docId: string; ok: boolean; current?: PrivateDocument; reason?: 'no-such-document' | 'refused' }>;
  serverTime: string;
  /** Milliseconds the client's clock is ahead of the server's (negative when behind). */
  clockSkewMs: number;
  head: number;
}
export interface SyncPullRequest {
  deviceId: string; afterSeq: number; limit?: number; documentsSince?: string;
  /**
   * `false`: send no documents at all (the reply's `documents` is empty). A client that does not keep private documents (GoLearn's worker, GoReview)
   * sets it so that a pull does not carry every document body on every round. Absent or `true`: as before. Additive: an older service ignores it.
   */
  documents?: boolean;
}
export interface SyncPullResponse {
  events: StoredEvent[]; documents: PrivateDocument[]; head: number; serverTime: string;
  /** More events lie beyond this page (the last event's `seq` is below `head`): ask again with `afterSeq` = that `seq`. Additive: an older service omits it and the client compares `seq` with `head`. */
  hasMore?: boolean;
}

/**
 * `GET /sync/status`: where the learner's event log stands.
 * `cursor` is opaque to clients: pass it back as `SyncWaitRequest.since`. It is the decimal text of the head sequence, so `Number(cursor)` is the
 * `afterSeq` that `POST /sync/pull` takes to receive everything after this point.
 */
export interface SyncStatusReply {
  cursor: string;
  /** The learner's stored event count (the log's head sequence). */
  events: number;
  /** ISO server time of the reply. */
  at: string;
}
/** `POST /sync/wait`: hold until events newer than `since` exist for this learner, or `timeoutMs` (default and maximum 25000) elapses. */
export interface SyncWaitRequest { since: string; timeoutMs?: number }
/** `changed: true` = events newer than `since` exist now (pull after `since`); `false` = the timeout elapsed or the service is shutting down. `cursor` and `events` are the current ones either way. */
export interface SyncWaitReply { changed: boolean; cursor: string; events: number }
