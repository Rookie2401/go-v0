/**
 * Test doubles for the service: a Map-based RepositoryStore (the whole port, minimally), a recording engine, a
 * recording linguistics service and a fast crypto. The store's `dump()` serialises everything it holds, so tests can
 * prove what is NOT stored (sentence text, passwords, tokens).
 */
import { createHash, randomBytes } from 'node:crypto';
import { CONTRACT_VERSION, validateEvent } from '../../../packages/repository-contract/src';
import type {
  Account, AppendOutcome, AssistancePreferences, Device, Enrolment, EventFilter, FormAnalysis, GoEvent, LanguagePackInfo,
  Learner, LinguisticUnit, PrivateDocument, ProjectionEngine, RepositoryStore, ReviewCandidate, Session, StoredEvent, Team,
  Tombstone, UnitAlias, UnitKnowledge, UnitRelation,
} from '../../../packages/repository-contract/src';
import { createInProcessApi } from '../../../packages/repository-service/src/api';
import type { LearnerCorrection, ServiceDeps } from '../../../packages/repository-service/src/deps';
import { handle } from '../../../packages/repository-service/src/handler';
import type { RepositoryApi } from '../../../packages/repository-service/src/api';

// ───────────────────────────── store ─────────────────────────────

interface State {
  events: Map<string, StoredEvent[]>;
  units: Map<string, LinguisticUnit>;
  relations: UnitRelation[];
  analyses: Map<string, FormAnalysis>;
  aliases: UnitAlias[];
  packs: LanguagePackInfo[];
  knowledge: Map<string, UnitKnowledge[]>;
  cursors: Map<string, { seq: number; modelVersion: string }>;
  preferences: Map<string, AssistancePreferences>;
  documents: Map<string, PrivateDocument>;
  learners: Map<string, Learner>;
  accounts: Map<string, Account & { passwordHash: string }>;
  sessions: Map<string, Session & { tokenHash: string }>;
  devices: Map<string, Device>;
  enrolments: Map<string, Enrolment>;
  teams: Map<string, Team>;
  members: Map<string, Array<{ learnerId: string; role: 'member' | 'leader'; since: string }>>;
  tombstones: Tombstone[];
}

const fresh = (): State => ({
  events: new Map(), units: new Map(), relations: [], analyses: new Map(), aliases: [], packs: [], knowledge: new Map(), cursors: new Map(),
  preferences: new Map(), documents: new Map(), learners: new Map(), accounts: new Map(), sessions: new Map(), devices: new Map(),
  enrolments: new Map(), teams: new Map(), members: new Map(), tombstones: [],
});

export interface FakeStore extends RepositoryStore {
  /** Everything held, as JSON text (for "this is nowhere in the store" assertions). */
  dump(): string;
  state: State;
  appendCalls: number;
  applyTombstone(t: Tombstone): Promise<{ events: number; knowledge: number; documents: number }>;
}

export function createFakeStore(clock: () => string): FakeStore {
  let s = fresh();
  const docKey = (l: string, d: string): string => `${l}\u0000${d}`;
  const store: FakeStore = {
    get state() { return s; },
    appendCalls: 0,
    dump: () => JSON.stringify(s, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v)),

    // events
    async append(learnerId, events) {
      store.appendCalls++;
      const list = s.events.get(learnerId) ?? [];
      const outcomes: AppendOutcome[] = [];
      for (const e of events) {
        const issues = validateEvent(e);
        if (issues.length) { outcomes.push({ id: e.id, stored: false, issues }); continue; }
        if (e.learnerId !== learnerId) { outcomes.push({ id: e.id, stored: false, issues: [{ path: 'learnerId', message: 'not this learner' }] }); continue; }
        const dup = list.find((x) => x.id === e.id || (e.dedupeKey !== undefined && x.dedupeKey === e.dedupeKey));
        if (dup) { outcomes.push({ id: e.id, stored: false, duplicateOf: dup.id }); continue; }
        list.push({ ...e, seq: list.length + 1, recordedAt: clock() });
        outcomes.push({ id: e.id, stored: true });
      }
      s.events.set(learnerId, list);
      return outcomes;
    },
    async list(f: EventFilter) {
      let xs = [...(s.events.get(f.learnerId) ?? [])];
      if (f.languageId) xs = xs.filter((e) => e.languageId === f.languageId);
      if (f.kinds?.length) xs = xs.filter((e) => f.kinds!.includes(e.kind));
      if (f.unitId) xs = xs.filter((e) => e.subject.itemIds?.includes(f.unitId!));
      if (f.since) xs = xs.filter((e) => Date.parse(e.at) >= Date.parse(f.since!));
      if (f.afterSeq) xs = xs.filter((e) => e.seq > f.afterSeq!);
      return f.limit ? xs.slice(0, f.limit) : xs;
    },
    async get(learnerId, id) { return (s.events.get(learnerId) ?? []).find((e) => e.id === id); },
    async head(learnerId) { return (s.events.get(learnerId) ?? []).length; },

    // linguistic
    async getUnits(ids) { return ids.flatMap((i) => (s.units.has(i) ? [s.units.get(i)!] : [])); },
    async putUnits(us) { for (const u of us) s.units.set(u.unitId, u); },
    async findUnits(q) { return [...s.units.values()].filter((u) => u.languageId === q.languageId && (!q.kind || u.kind === q.kind) && (!q.label || u.label === q.label)).slice(0, q.limit ?? 50); },
    async relationsOf(id, dir = 'both') { return s.relations.filter((r) => (dir !== 'in' && r.fromId === id) || (dir !== 'out' && r.toId === id)); },
    async putRelations(rs) { s.relations.push(...rs); },
    async getAnalysis(id) { return s.analyses.get(id); },
    async analysesOfForm(formId, sentenceKey) { return [...s.analyses.values()].filter((a) => a.formId === formId && (sentenceKey === undefined || a.sentenceKey === sentenceKey)); },
    async putAnalyses(as) { for (const a of as) s.analyses.set(a.analysisId, a); },
    async invalidateAnalysis(id, reason, supersededBy) { const a = s.analyses.get(id); if (a) s.analyses.set(id, { ...a, status: 'invalidated', reason, ...(supersededBy ? { supersededBy } : {}) }); },
    async aliasesFor(ids) { return s.aliases.filter((a) => ids.includes(a.oldId)); },
    async putAliases(as) { s.aliases.push(...as); },
    async getPack(packId, version) { return s.packs.find((p) => p.packId === packId && (!version || p.version === version)); },
    async putPack(p) { s.packs.push(p); },
    async listPacks(languageId) { return s.packs.filter((p) => !languageId || p.languageId === languageId); },

    // projection
    async getKnowledge(learnerId, unitIds) { return (s.knowledge.get(learnerId) ?? []).filter((k) => !unitIds || unitIds.includes(k.unitId)); },
    async putKnowledge(rows) { for (const r of rows) s.knowledge.set(r.learnerId, [...(s.knowledge.get(r.learnerId) ?? []).filter((k) => k.unitId !== r.unitId), r]); },
    async clearKnowledge(learnerId) { s.knowledge.delete(learnerId); },
    async getProjectionCursor(learnerId) { return s.cursors.get(learnerId); },
    async putProjectionCursor(learnerId, c) { s.cursors.set(learnerId, c); },
    async getPreferences(learnerId, languageId) { return s.preferences.get(`${learnerId}|${languageId ?? ''}`); },
    async putPreferences(p) { s.preferences.set(`${p.learnerId}|${p.languageId ?? ''}`, p); },

    // documents
    async getDocument(l, d) { return s.documents.get(docKey(l, d)); },
    async listDocuments(l) { return [...s.documents.values()].filter((d) => d.learnerId === l); },
    async putDocument(doc, expectedRevision) {
      const cur = s.documents.get(docKey(doc.learnerId, doc.docId));
      if ((cur?.revision ?? 0) !== expectedRevision) return { ok: false, current: cur! };
      s.documents.set(docKey(doc.learnerId, doc.docId), { ...doc });
      return { ok: true };
    },
    async deleteDocument(l, d) {
      const cur = s.documents.get(docKey(l, d));
      if (cur) s.documents.set(docKey(l, d), { ...cur, body: '', revision: cur.revision + 1, deletedAt: clock(), updatedAt: clock() });
    },

    // identity — getAccount returns the stored object as is, hash included, so the service must strip it
    async getLearner(id) { return s.learners.get(id); },
    async putLearner(l) { s.learners.set(l.learnerId, l); },
    async getAccountByEmail(email) { return [...s.accounts.values()].find((a) => a.email === email); },
    async getAccount(id) { return s.accounts.get(id); },
    async putAccount(a) { s.accounts.set(a.accountId, a); },
    async getSessionByTokenHash(h) { return [...s.sessions.values()].find((x) => x.tokenHash === h); },
    async putSession(x) { s.sessions.set(x.sessionId, x); },
    async revokeSession(id, at) { const x = s.sessions.get(id); if (x) s.sessions.set(id, { ...x, revokedAt: at }); },
    async getDevice(l, d) { return s.devices.get(`${l}|${d}`); },
    async putDevice(d) { s.devices.set(`${d.learnerId}|${d.deviceId}`, d); },
    async listEnrolments(l) { return [...s.enrolments.values()].filter((e) => e.learnerId === l); },
    async putEnrolment(e) { s.enrolments.set(e.enrolmentId, e); },
    async getTeam(id) { return s.teams.get(id); },
    async putTeam(t) { s.teams.set(t.teamId, t); },
    async listTeamMembers(id) { return s.members.get(id) ?? []; },
    async putTeamMember(teamId, learnerId, role, since) { s.members.set(teamId, [...(s.members.get(teamId) ?? []).filter((m) => m.learnerId !== learnerId), { learnerId, role, since }]); },

    // tombstones
    async listTombstones(l) { return s.tombstones.filter((t) => t.learnerId === l); },
    async putTombstone(t) { s.tombstones.push(t); },
    /** The service tests do not exercise deletion itself (the store suites and the privacy audit do): the fake records the instruction. */
    async applyTombstone(t) { s.tombstones.push(t); return { events: 0, knowledge: 0, documents: 0 }; },

    async transaction(fn) {
      const before = structuredClone(s);
      try { return await fn(); } catch (e) { s = before; throw e; }
    },
    async eraseLearner(learnerId) {
      const events = (s.events.get(learnerId) ?? []).length;
      const knowledge = (s.knowledge.get(learnerId) ?? []).length;
      const docs = [...s.documents.keys()].filter((k) => k.startsWith(`${learnerId}\u0000`));
      s.events.delete(learnerId); s.knowledge.delete(learnerId); s.cursors.delete(learnerId);
      for (const k of docs) s.documents.delete(k);
      for (const [k, v] of s.sessions) if (v.learnerId === learnerId) s.sessions.delete(k);
      for (const [k, v] of s.devices) if (v.learnerId === learnerId) s.devices.delete(k);
      for (const [k, v] of s.enrolments) if (v.learnerId === learnerId) s.enrolments.delete(k);
      for (const k of [...s.preferences.keys()]) if (k.startsWith(`${learnerId}|`)) s.preferences.delete(k);
      s.tombstones = s.tombstones.filter((t) => t.learnerId !== learnerId);
      return { events, documents: docs.length, knowledge };
    },
    async close() { /* nothing to close */ },
  };
  return store;
}

// ───────────────────────────── engine ─────────────────────────────

export interface FakeEngine extends ProjectionEngine {
  projectCalls: string[];
  candidateCalls: Array<{ learnerId: string; enrolmentId: string; limit?: number }>;
  failProject: boolean;
}

export function createFakeEngine(store: RepositoryStore): FakeEngine {
  const prefs = (learnerId: string, languageId?: string): AssistancePreferences => {
    const d = <T,>(value: T) => ({ value, origin: 'default' as const });
    return {
      learnerId, ...(languageId ? { languageId } : {}), explanationDepth: d('brief'), terminology: d('plain'), transliteration: d('on-request'),
      pronunciationFirst: d(false), translationAvailable: d(true), visualAssistance: d('standard'), accessibility: d([]), updatedAt: '2026-10-08T00:00:00.000Z',
    };
  };
  const engine: FakeEngine = {
    modelVersion: 'fake-1',
    projectCalls: [],
    candidateCalls: [],
    failProject: false,
    async project(learnerId) {
      engine.projectCalls.push(learnerId);
      if (engine.failProject) throw new Error('boom: this must never reach the client');
      return { folded: 0, cursor: await store.head(learnerId) };
    },
    async rebuild() { return []; },
    knowledge: (learnerId, unitIds) => store.getKnowledge(learnerId, unitIds),
    async preferences(learnerId, languageId) { return prefs(learnerId, languageId); },
    async candidates(learnerId, enrolmentId, opts) {
      engine.candidateCalls.push({ learnerId, enrolmentId, limit: opts?.limit });
      const c: ReviewCandidate = { unitId: 'lemma:sq:libër:NOUN', kind: 'lexeme', score: 0.5, reasons: [], targetDimension: 'readingRecognition', eligibility: { eligible: true, status: 'provisional', caveats: [] }, cost: 0.1 };
      return [c];
    },
    async suitability(_l, languageId) { return { languageId, tokens: 0, wordTokens: 0, recognized: 0, uncertain: 0, unknown: 0, familiarUnits: [], difficultUnits: [], difficultConstructions: [], reliability: 0, coverageGaps: [], modelVersion: 'fake-1' }; },
  };
  return engine;
}

// ───────────────────────────── linguistics ─────────────────────────────

export function createFakeLinguistics(store: RepositoryStore, clock: () => string): ServiceDeps['linguistics'] & {
  resolveCalls: Array<Record<string, unknown>>; correctCalls: Array<{ formId: string; correction: Record<string, unknown>; now: string }>;
} {
  const fake = {
    resolveCalls: [] as Array<Record<string, unknown>>,
    correctCalls: [] as Array<{ formId: string; correction: Record<string, unknown>; now: string }>,
    async resolveAndStore(input: { languageId: string; surface: string; sentence?: string; sentenceKey?: string }) {
      fake.resolveCalls.push({ ...input });
      const formId = `form:${input.languageId}:${input.surface.toLowerCase()}`;
      const provenance = { source: 'rule' as const, ref: 'fake', confidence: 0.5 };
      const unit: LinguisticUnit = { unitId: formId, kind: 'form', languageId: input.languageId, label: input.surface, packId: 'fake', packVersion: '1', provenance, status: 'provisional', createdAt: clock() };
      // like the real service: the analysis keeps the sentence KEY and never the sentence
      const analysis: FormAnalysis = {
        analysisId: `analysis:${formId}@${input.sentenceKey ?? 'none'}`, formId, languageId: input.languageId, ...(input.sentenceKey ? { sentenceKey: input.sentenceKey } : {}),
        candidates: [{ confidence: 0.5, provenance }], chosen: 0, status: 'provisional', analyzerId: 'fake', packId: 'fake', packVersion: '1', createdAt: clock(),
      };
      await store.putUnits([unit]);
      await store.putAnalyses([analysis]);
      return { formId, units: [unit], relations: [] as UnitRelation[], analysis };
    },
    async lookup(unitId: string) {
      const [unit] = await store.getUnits([unitId]);
      if (!unit) return undefined;
      return { unit, relations: await store.relationsOf(unitId), analyses: await store.analysesOfForm(unitId) };
    },
    async correct(formId: string, correction: LearnerCorrection, now: string) {
      fake.correctCalls.push({ formId, correction: { ...correction }, now });
      const analysis: FormAnalysis = {
        analysisId: `analysis:${formId}@correction:${now}`, formId, languageId: formId.split(':')[1], candidates: [{ confidence: 0.6, provenance: { source: 'learner', ref: 'correction', confidence: 0.6 } }],
        chosen: 0, status: 'provisional', analyzerId: 'correction:learner', packId: 'fake', packVersion: '1', createdAt: now,
      };
      await store.putAnalyses([analysis]);
      return { analysis, invalidated: [] as string[] };
    },
  };
  return fake;
}

// ───────────────────────────── crypto, clock, harness ─────────────────────────────

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

export function createFakeCrypto() {
  const calls = { hash: 0, verify: 0, verifiedHashes: [] as string[] };
  return {
    calls,
    async hashPassword(pw: string) { calls.hash++; return `fake$${sha(pw)}`; },
    async verifyPassword(pw: string, hash: string) { calls.verify++; calls.verifiedHashes.push(hash); return hash === `fake$${sha(pw)}`; },
    randomToken: () => randomBytes(32).toString('base64url'),
    sha256: sha,
  };
}

export interface Clock { now: () => string; set(iso: string): void; advance(ms: number): void }
export function createClock(start = '2026-10-08T10:00:00.000Z'): Clock {
  let t = Date.parse(start);
  return { now: () => new Date(t).toISOString(), set: (iso) => { t = Date.parse(iso); }, advance: (ms) => { t += ms; } };
}

export interface Harness {
  deps: ServiceDeps;
  store: FakeStore;
  engine: FakeEngine;
  linguistics: ReturnType<typeof createFakeLinguistics>;
  crypto: ReturnType<typeof createFakeCrypto>;
  clock: Clock;
  logs: string[];
  /** A client in the harness with no token. */
  api(token?: string): RepositoryApi;
}

export function createHarness(): Harness {
  const clock = createClock();
  const store = createFakeStore(clock.now);
  const engine = createFakeEngine(store);
  const linguistics = createFakeLinguistics(store, clock.now);
  const crypto = createFakeCrypto();
  const logs: string[] = [];
  const deps: ServiceDeps = { store, engine, linguistics, crypto, now: clock.now, log: (l) => logs.push(l) };
  return { deps, store, engine, linguistics, crypto, clock, logs, api: (token) => createInProcessApi(deps, token) };
}

export interface Signed { api: RepositoryApi; learnerId: string; token: string; email: string; password: string; deviceId: string }

/** Creates an account, signs in on a device, and enrols in Albanian. */
export async function signUp(h: Harness, email: string, deviceId = 'dev-1', opts: { enrol?: boolean } = {}): Promise<Signed & { enrolmentId?: string }> {
  const password = 'correct horse battery';
  const created = await h.api().createAccount({ email, password, displayName: email.split('@')[0] });
  if (!created.ok) throw new Error(`createAccount failed: ${created.status} ${created.error}`);
  const api = h.api();
  const session = await api.createSession({ email, password, deviceId, platform: 'test' });
  if (!session.ok) throw new Error(`createSession failed: ${session.status} ${session.error}`);
  const out: Signed & { enrolmentId?: string } = { api, learnerId: created.data.learnerId, token: session.data.token, email, password, deviceId };
  if (opts.enrol !== false) {
    const e = await api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    if (!e.ok) throw new Error(`enrol failed: ${e.status} ${e.error}`);
    out.enrolmentId = e.data.enrolment.enrolmentId;
  }
  return out;
}

let counter = 0;
/** A valid event of the given kind for a learner (default: a card review). */
export function makeEvent(who: { learnerId: string; enrolmentId?: string; deviceId?: string }, over: Partial<GoEvent> = {}): GoEvent {
  counter++;
  return {
    id: `ev-${counter}-${Math.random().toString(36).slice(2, 8)}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId ?? 'enrol-x', languageId: 'sq',
    at: '2026-10-08T09:59:00.000Z', producer: { app: 'gopractice-review', version: '1', deviceId: who.deviceId ?? 'dev-1' }, kind: 'CardReviewed',
    subject: { itemIds: ['lemma:sq:libër:NOUN'], cardId: 'c1' }, payload: { cardKind: 'recall', grade: 'good', correct: true, hinted: false }, ...over,
  };
}

export const lookupEvent = (who: { learnerId: string; enrolmentId?: string; deviceId?: string }, over: Partial<GoEvent> = {}): GoEvent => makeEvent(who, {
  kind: 'SelectionLookedUp', producer: { app: 'golearn-ext', version: '1', deviceId: who.deviceId ?? 'dev-1' }, subject: { itemIds: ['form:sq:shtëpinë'], sentenceKey: 'ab12' },
  payload: { surface: 'shtëpinë', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] }, ...over,
});

export const productionEvent = (who: { learnerId: string; enrolmentId?: string; deviceId?: string }, over: Partial<GoEvent> = {}): GoEvent => makeEvent(who, {
  kind: 'ProductionRecorded', producer: { app: 'gopractice-tell', version: '1', deviceId: who.deviceId ?? 'dev-1' }, subject: { itemIds: ['lemma:sq:libër:NOUN'], draftId: 'd1' },
  payload: { mode: 'free', assisted: false, assistance: [], usedCorrectly: 'unjudged', draftId: 'd1', wordCount: 4 }, ...over,
});

/** A raw request to the handler (status, headers and body as sent, no client in between). */
export async function raw(h: Harness, method: string, path: string, opts: { token?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {}): Promise<{ status: number; body: Record<string, any>; headers: Headers }> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const payload = opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);
  const res = await handle(new Request(`http://repository.local${path}`, { method, headers, ...(payload !== undefined ? { body: payload } : {}) }), h.deps);
  const text = res.status === 204 ? '' : await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {}, headers: res.headers };
}
