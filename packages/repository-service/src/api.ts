/**
 * A typed client for the Repository service: one method per route. Used by the applications and the sync client.
 * `createRepositoryApi({ baseUrl, fetch, token? })` talks over any `fetch`; `createInProcessApi(deps)` calls `handle`
 * directly with `Request` objects (no sockets) for tests and the integration test.
 *
 * Every method resolves (it does not throw on an HTTP error): `{ ok: true, status, data }` or
 * `{ ok: false, status, error, message, body }`. `createSession` keeps the token it is given for the calls after it.
 */
import type {
  AssistancePreferences, Enrolment, GoEvent, LearningGoal, LinguisticUnit, Learner, PrivateDocument, ReviewCandidate,
  StoredEvent, SyncPullRequest, SyncPullResponse, SyncPushRequest, SyncPushResponse, Tombstone, UnitKnowledge, KnowledgeLevel, SourceRef,
  UnitRelation, FormAnalysis, LanguagePackInfo, AppendOutcome, UnitProvenance, ProvenanceOrigin, ValidationLevel,
} from '../../repository-contract/src';
import type { CorrectionResult, ServiceDeps } from './deps';
import { handle } from './handler';

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; message: string; body: Record<string, unknown> };

export interface EventsResponse { outcomes: AppendOutcome[]; stored: number; duplicates: number; head: number; projected: boolean }
export interface MeResponse {
  learner: Learner | undefined;
  account: { accountId: string; email: string; createdAt: string };
  enrolments: Enrolment[];
  devices: Array<{ deviceId: string; platform?: string; registeredAt?: string; lastSyncAt?: string }>;
  consents: Array<{ key: string; given: boolean; at: string }>;
}
export interface EnrolInput { teamId?: string; languageId: string; varietyId?: string; scriptId?: string; packId: string; packVersion: string; goals: LearningGoal[] }
export interface LookupRequest { languageId: string; surface: string; sentence?: string; sentenceKey?: string; selStart?: number; selEnd?: number }
export interface EventsQuery { afterSeq?: number; kinds?: string[]; unitId?: string; languageId?: string; since?: string; limit?: number }
export interface VocabularyQuery {
  languageId: string; level?: KnowledgeLevel; search?: string; after?: string; limit?: number; minEncounters?: number;
  firstEncounterFrom?: string; firstEncounterTo?: string; lastEncounterFrom?: string; lastEncounterTo?: string;
  requiresAssistance?: boolean; unresolved?: boolean; reviewStatus?: 'none' | 'active' | 'suspended'; sourceRef?: string;
}
export interface VocabularyItem { knowledge: UnitKnowledge; unit?: LinguisticUnit; surfaceForms: string[]; firstEncounter?: string; lastEncounter?: string; assistanceCount?: number; reviewStatus?: 'none' | 'active' | 'suspended'; sources: SourceRef[] }
export interface VocabularyPage { items: VocabularyItem[]; nextCursor?: string; catalog: { total: number; counts: Record<KnowledgeLevel, number> } }
export type DocumentMeta = Omit<PrivateDocument, 'body'>;
/** A unit's provenance as the service reports it: the v3 defaults are filled in (a v2 row reads as origin "import", validation "unreviewed"). */
export type ReportedProvenance = UnitProvenance & { origin: ProvenanceOrigin; validation: ValidationLevel };
export interface UnitReport { unit: LinguisticUnit; relations: UnitRelation[]; analyses: FormAnalysis[]; provenance: ReportedProvenance }
export interface UnitCorrectionInput { reason: string; from?: string; to?: string; lexemeId?: string; features?: Record<string, string>; sentenceKey?: string }

export interface RepositoryApi {
  /** The bearer token in use (set by `createSession`, or given at creation). */
  token: string | undefined;
  health(): Promise<ApiResult<{ ok: true; service: string; version: number; contractVersion?: number }>>;
  createAccount(input: { email: string; password: string; displayName?: string }): Promise<ApiResult<{ learnerId: string; accountId: string }>>;
  createSession(input: { email: string; password: string; deviceId: string; platform?: string }): Promise<ApiResult<{ token: string; learnerId: string; expiresAt: string }>>;
  deleteSession(): Promise<ApiResult<null>>;
  me(): Promise<ApiResult<MeResponse>>;
  deleteMe(confirmEmail: string): Promise<ApiResult<null>>;
  listEnrolments(): Promise<ApiResult<{ enrolments: Enrolment[] }>>;
  enrol(input: EnrolInput): Promise<ApiResult<{ enrolment: Enrolment }>>;
  /** Ends one of the learner's enrolments (`endedAt`); its events stay. */
  endEnrolment(enrolmentId: string): Promise<ApiResult<{ enrolment: Enrolment }>>;
  packs(languageId?: string): Promise<ApiResult<{ packs: LanguagePackInfo[] }>>;
  unit(unitId: string): Promise<ApiResult<UnitReport>>;
  /** A learner's challenge to a unit: appended to its provenance, and (from `provisional` only) the unit becomes `requires-review`; for a form given a lexeme or features, a superseding analysis as well. */
  correctUnit(unitId: string, input: UnitCorrectionInput): Promise<ApiResult<{ unit: LinguisticUnit; provenance: ReportedProvenance; statusChanged: boolean; result?: CorrectionResult }>>;
  /** Several units in one call (1 to 50 ids): the same view as `unit`, by id; unknown ids are in `missing`. */
  units(unitIds: string[]): Promise<ApiResult<{ units: Record<string, UnitReport>; missing: string[] }>>;
  lookup(input: LookupRequest): Promise<ApiResult<{ formId: string; units: LinguisticUnit[]; relations: UnitRelation[]; analysis: FormAnalysis | null; sentenceKey: string | null }>>;
  appendEvents(events: GoEvent[]): Promise<ApiResult<EventsResponse>>;
  listEvents(q?: EventsQuery): Promise<ApiResult<{ events: StoredEvent[]; head: number }>>;
  knowledge(unitIds?: string[]): Promise<ApiResult<{ knowledge: UnitKnowledge[] }>>;
  vocabulary(query: VocabularyQuery): Promise<ApiResult<VocabularyPage>>;
  candidates(enrolmentId: string, limit?: number): Promise<ApiResult<{ candidates: ReviewCandidate[] }>>;
  preferences(languageId?: string): Promise<ApiResult<{ preferences: AssistancePreferences }>>;
  submitReviews(events: GoEvent[]): Promise<ApiResult<EventsResponse>>;
  submitWriting(input: { observation: GoEvent; document?: { doc: PrivateDocument; expectedRevision: number } }): Promise<ApiResult<{ outcome: AppendOutcome; document?: DocumentMeta; projected: boolean }>>;
  listDocuments(): Promise<ApiResult<{ documents: DocumentMeta[] }>>;
  getDocument(docId: string): Promise<ApiResult<{ document: PrivateDocument }>>;
  putDocument(docId: string, doc: Partial<PrivateDocument> & Pick<PrivateDocument, 'languageId' | 'kind' | 'body'>, expectedRevision: number): Promise<ApiResult<{ document: DocumentMeta }>>;
  deleteDocument(docId: string): Promise<ApiResult<null>>;
  correct(input: { formId: string; lexemeId?: string; features?: Record<string, string>; reason?: string; enrolmentId?: string; languageId?: string }): Promise<ApiResult<{ result: CorrectionResult; outcome: AppendOutcome; projected: boolean }>>;
  syncPush(req: SyncPushRequest): Promise<ApiResult<SyncPushResponse>>;
  syncPull(req: SyncPullRequest): Promise<ApiResult<SyncPullResponse>>;
  exportAll(): Promise<ApiResult<Record<string, unknown>>>;
  putTombstone(scope: Tombstone['scope'], reason?: string): Promise<ApiResult<{ tombstone: Tombstone; applied?: { events: number; knowledge: number } }>>;
}

export interface ApiOptions { baseUrl: string; fetch: typeof fetch; token?: string }

export function createRepositoryApi(opts: ApiOptions): RepositoryApi {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const self: { token: string | undefined } = { token: opts.token };

  async function call<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<ApiResult<T>> {
    const qs = query ? Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') : '';
    const headers: Record<string, string> = {};
    if (self.token) headers.Authorization = `Bearer ${self.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await opts.fetch(`${base}${path}${qs ? `?${qs}` : ''}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const text = response.status === 204 ? '' : await response.text();
    let parsed: unknown = null;
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = null; } }
    if (response.ok) return { ok: true, status: response.status, data: parsed as T };
    const b = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
    return { ok: false, status: response.status, error: String(b.error ?? 'error'), message: String(b.message ?? ''), body: b };
  }
  const enc = encodeURIComponent;

  const api: RepositoryApi = {
    get token() { return self.token; },
    set token(t) { self.token = t; },
    health: () => call('GET', '/health'),
    createAccount: (input) => call('POST', '/accounts', input),
    async createSession(input) {
      const r = await call<{ token: string; learnerId: string; expiresAt: string }>('POST', '/sessions', input);
      if (r.ok) self.token = r.data.token;
      return r;
    },
    async deleteSession() {
      const r = await call<null>('DELETE', '/sessions/current');
      if (r.ok) self.token = undefined;
      return r;
    },
    me: () => call('GET', '/me'),
    deleteMe: (confirmEmail) => call('DELETE', '/me', { confirmEmail }),
    listEnrolments: () => call('GET', '/enrolments'),
    enrol: (input) => call('POST', '/enrolments', input),
    endEnrolment: (enrolmentId) => call('POST', `/enrolments/${encodeURIComponent(enrolmentId)}/end`, {}),
    packs: (languageId) => call('GET', '/packs', undefined, { languageId }),
    unit: (unitId) => call('GET', `/units/${enc(unitId)}`),
    correctUnit: (unitId, input) => call('POST', `/units/${enc(unitId)}/corrections`, input),
    units: (unitIds) => call('POST', '/units/batch', { ids: unitIds }),
    lookup: (input) => call('POST', '/lookup', input),
    appendEvents: (events) => call('POST', '/events', { events }),
    listEvents: (q = {}) => call('GET', '/events', undefined, { afterSeq: q.afterSeq, kinds: q.kinds?.join(','), unitId: q.unitId, languageId: q.languageId, since: q.since, limit: q.limit }),
    knowledge: (unitIds) => call('GET', '/knowledge', undefined, { unitIds: unitIds?.join(',') }),
    vocabulary: (q) => call('GET', '/vocabulary', undefined, {
      languageId: q.languageId, level: q.level, search: q.search, after: q.after, limit: q.limit, minEncounters: q.minEncounters,
      firstEncounterFrom: q.firstEncounterFrom, firstEncounterTo: q.firstEncounterTo, lastEncounterFrom: q.lastEncounterFrom, lastEncounterTo: q.lastEncounterTo,
      requiresAssistance: q.requiresAssistance === undefined ? undefined : String(q.requiresAssistance),
      unresolved: q.unresolved === undefined ? undefined : String(q.unresolved), reviewStatus: q.reviewStatus, sourceRef: q.sourceRef,
    }),
    candidates: (enrolmentId, limit) => call('GET', '/candidates', undefined, { enrolmentId, limit }),
    preferences: (languageId) => call('GET', '/preferences', undefined, { languageId }),
    submitReviews: (events) => call('POST', '/reviews', { events }),
    submitWriting: (input) => call('POST', '/writing', input),
    listDocuments: () => call('GET', '/documents'),
    getDocument: (docId) => call('GET', `/documents/${enc(docId)}`),
    putDocument: (docId, doc, expectedRevision) => call('PUT', `/documents/${enc(docId)}`, { doc, expectedRevision }),
    deleteDocument: (docId) => call('DELETE', `/documents/${enc(docId)}`),
    correct: (input) => call('POST', '/corrections', input),
    syncPush: (req) => call('POST', '/sync/push', req),
    syncPull: (req) => call('POST', '/sync/pull', req),
    exportAll: () => call('GET', '/export'),
    putTombstone: (scope, reason) => call('POST', '/tombstones', { scope, ...(reason !== undefined ? { reason } : {}) }),
  };
  return api;
}

/** The same client, wired straight to `handle`: no sockets, no ports. */
export function createInProcessApi(deps: ServiceDeps, token?: string): RepositoryApi {
  const inProcess = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => handle(new Request(input, init), deps)) as typeof fetch;
  return createRepositoryApi({ baseUrl: 'http://repository.local', fetch: inProcess, token });
}
