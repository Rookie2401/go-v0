/**
 * The in-memory Repository store: tests, the demo app, a development server. Same port, same rules (./rules) as the
 * SQLite store; nothing persists. Everything handed in or out is copied, so a caller can never mutate a stored row.
 */
import { provenanceColumns } from '../../repository-contract/src';
import type {
  Account, AppendOutcome, AssistancePreferences, Device, Enrolment, EventFilter, EncounterEventSummary, FormAnalysis, LanguagePackInfo, Learner,
  LinguisticUnit, PrivateDocument, ReviewStatusSummary, Session, StoredEvent, Team, Tombstone, UnitAlias, UnitKnowledge, UnitRelation,
} from '../../repository-contract/src';
import {
  appendIssues, expectedReviewPredecessorIssue, assertSameOwner, byKey, carried, carriedAnalysis, clampLimit, decidePutDocument, defaultNow, deletedDocument, envelopeOf, invalidated,
  latestPack, matchesFilter, mayReplaceAnalysis, mayReplaceByRank, normalizeEmail, outcomeId, relationKey, sortPacks, tombstonedEventIds, withCorrection, zeroErase,
} from './rules';
import type { ConcreteStore, EraseCounts, ProvenanceCount, StoreOptions } from './rules';
import { applyTombstone as applyDeletion } from './deletion';

const copy = <T>(v: T): T => structuredClone(v);
const k2 = (a: string, b: string): string => `${a}\u0000${b}`;

export function createMemoryStore(opts: StoreOptions = {}): ConcreteStore {
  const now = opts.now ?? defaultNow;

  // events
  const logs = new Map<string, StoredEvent[]>();
  const idOwner = new Map<string, string>();
  const dedupe = new Map<string, string>();
  const heads = new Map<string, number>();
  // layer A
  const units = new Map<string, LinguisticUnit>();
  const relations = new Map<string, UnitRelation>();
  const analyses = new Map<string, FormAnalysis>();
  const aliases = new Map<string, UnitAlias>();
  const packs = new Map<string, LanguagePackInfo>();
  // layer C
  const knowledge = new Map<string, UnitKnowledge>();
  const cursors = new Map<string, { seq: number; modelVersion: string }>();
  const preferences = new Map<string, AssistancePreferences>();
  // documents
  const documents = new Map<string, PrivateDocument>();
  // identity
  const learners = new Map<string, Learner>();
  const accounts = new Map<string, Account & { passwordHash: string }>();
  const sessions = new Map<string, Session & { tokenHash: string }>();
  const devices = new Map<string, Device>();
  const enrolments = new Map<string, Enrolment>();
  const teams = new Map<string, Team>();
  const members = new Map<string, { teamId: string; learnerId: string; role: 'member' | 'leader'; since: string }>();
  const tombstones = new Map<string, Tombstone>();

  const logOf = (learnerId: string): StoredEvent[] => {
    let l = logs.get(learnerId);
    if (!l) logs.set(learnerId, (l = []));
    return l;
  };
  const stripSecret = <T extends { passwordHash?: string; tokenHash?: string }>(row: T): Omit<T, 'passwordHash' | 'tokenHash'> => {
    const { passwordHash: _p, tokenHash: _t, ...rest } = row;
    return copy(rest);
  };

  const removeEvents = (learnerId: string, ids: Set<string>): number => {
    const log = logs.get(learnerId);
    if (!log) return 0;
    let n = 0;
    const kept: StoredEvent[] = [];
    for (const e of log) {
      if (!ids.has(e.id)) { kept.push(e); continue; }
      idOwner.delete(e.id);
      if (e.dedupeKey !== undefined) dedupe.delete(k2(learnerId, e.dedupeKey));
      n++;
    }
    logs.set(learnerId, kept);
    return n;
  };

  const store: ConcreteStore = {
    // ───────────────────────────── events ─────────────────────────────
    async append(learnerId, events) {
      const blocked = tombstonedEventIds([...tombstones.values()].filter((t) => t.learnerId === learnerId));
      const out: AppendOutcome[] = [];
      for (const e of events) {
        const id = outcomeId(e);
        const issues = appendIssues(learnerId, e);
        if (issues.length) { out.push({ id, stored: false, issues }); continue; }
        const owner = idOwner.get(e.id);
        if (owner === learnerId) { out.push({ id, stored: false, duplicateOf: id }); continue; }
        if (owner !== undefined) { out.push({ id, stored: false, issues: [{ path: 'id', message: 'event id already in use' }] }); continue; }
        if (e.dedupeKey !== undefined) {
          const first = dedupe.get(k2(learnerId, e.dedupeKey));
          if (first !== undefined) { out.push({ id, stored: false, duplicateOf: first }); continue; }
        }
        if (blocked.has(e.id)) { out.push({ id, stored: false, issues: [{ path: 'id', message: 'this event was deleted by a tombstone' }] }); continue; }
        const casIssue = expectedReviewPredecessorIssue(e, logs.get(learnerId) ?? []);
        if (casIssue) { out.push({ id, stored: false, issues: [casIssue] }); continue; }
        const seq = (heads.get(learnerId) ?? 0) + 1;
        heads.set(learnerId, seq);
        const recordedAt = now();
        const stored: StoredEvent = { ...envelopeOf(e, recordedAt), seq, recordedAt };
        logOf(learnerId).push(stored);
        idOwner.set(e.id, learnerId);
        if (e.dedupeKey !== undefined) dedupe.set(k2(learnerId, e.dedupeKey), e.id);
        out.push({ id, stored: true });
      }
      return out;
    },
    async list(f: EventFilter) {
      const limit = clampLimit(f.limit);
      const out: StoredEvent[] = [];
      const source = f.order === 'desc' ? [...(logs.get(f.learnerId) ?? [])].reverse() : (logs.get(f.learnerId) ?? []);
      for (const e of source) {
        if (!matchesFilter(e, f)) continue;
        out.push(copy(e));
        if (out.length >= limit) break;
      }
      return out;
    },
    async listEncounterSummaries(learnerId, languageId, unitIds, perUnitLimit) {
      const wanted = new Set(unitIds);
      const counts = new Map<string, number>();
      const out: EncounterEventSummary[] = [];
      const recent = [...(logs.get(learnerId) ?? [])].reverse();
      for (const event of recent) {
        if (event.languageId !== languageId || !['EncounterRecorded', 'SelectionLookedUp', 'AssistanceRequested'].includes(event.kind)) continue;
        for (const unitId of event.subject.itemIds ?? []) {
          if (!wanted.has(unitId)) continue;
          const n = counts.get(unitId) ?? 0;
          if (n >= perUnitLimit) continue;
          counts.set(unitId, n + 1);
          out.push({ unitId, event: copy(event) });
        }
      }
      return out;
    },
    async getEncounterDateRanges(learnerId, languageId, unitIds) {
      const wanted = new Set(unitIds);
      const dates = new Map<string, { first: string; last: string }>();
      for (const e of logs.get(learnerId) ?? []) {
        if (e.languageId !== languageId || !['EncounterRecorded', 'SelectionLookedUp', 'AssistanceRequested'].includes(e.kind)) continue;
        for (const id of e.subject.itemIds ?? []) {
          if (!wanted.has(id)) continue;
          const d = dates.get(id);
          if (!d) dates.set(id, { first: e.at, last: e.at });
          else {
            if (Date.parse(e.at) < Date.parse(d.first)) d.first = e.at;
            if (Date.parse(e.at) > Date.parse(d.last)) d.last = e.at;
          }
        }
      }
      return [...wanted].map((unitId) => ({ unitId, ...(dates.has(unitId) ? { firstEncounter: dates.get(unitId)!.first, lastEncounter: dates.get(unitId)!.last } : {}) }));
    },
    async listReviewStatusSummaries(learnerId, languageId, unitIds) {
      const wanted = new Set(unitIds);
      const latest = new Map<string, ReviewStatusSummary>();
      for (const e of logs.get(learnerId) ?? []) {
        if (e.languageId !== languageId || !['CardAdded', 'CardRemoved', 'ReviewItemInvalidated'].includes(e.kind) || !e.subject.cardId) continue;
        for (const unitId of e.subject.itemIds ?? []) {
          if (!wanted.has(unitId)) continue;
          const key = `${unitId}\u0000${e.subject.cardId}`;
          const old = latest.get(key)?.event;
          if (!old || Date.parse(e.at) > Date.parse(old.at) || (Date.parse(e.at) === Date.parse(old.at) && e.id > old.id)) latest.set(key, { unitId, event: copy(e) });
        }
      }
      return [...latest.values()];
    },
    async listAssistanceRequestedUnitIds(learnerId, languageId, unitIds) {
      const wanted = new Set(unitIds);
      const found = new Set<string>();
      for (const e of logs.get(learnerId) ?? []) {
        if (e.languageId !== languageId || e.kind !== 'AssistanceRequested') continue;
        for (const id of e.subject.itemIds ?? []) if (wanted.has(id)) found.add(id);
      }
      return [...found];
    },
    async get(learnerId, id) {
      if (idOwner.get(id) !== learnerId) return undefined;
      const e = (logs.get(learnerId) ?? []).find((x) => x.id === id);
      return e ? copy(e) : undefined;
    },
    async head(learnerId) {
      return heads.get(learnerId) ?? 0;
    },
    async deleteEvents(learnerId, ids) {
      return removeEvents(learnerId, new Set(ids));
    },

    // ───────────────────────────── layer A ─────────────────────────────
    async getUnits(ids) {
      const out: LinguisticUnit[] = [];
      for (const id of new Set(ids)) { const u = units.get(id); if (u) out.push(copy(u)); }
      return out;
    },
    async putUnits(rows) {
      for (const u of rows) {
        const cur = units.get(u.unitId);
        if (mayReplaceByRank(cur?.status, u.status)) units.set(u.unitId, copy(carried(cur, u)));
      }
    },
    async recordUnitCorrection(unitId, correction, flag) {
      const cur = units.get(unitId);
      if (!cur) return undefined;
      const r = withCorrection(cur, correction, flag);
      units.set(unitId, copy(r.unit));
      return copy(r);
    },
    async findUnits(q) {
      const limit = clampLimit(q.limit);
      return [...units.values()]
        .filter((u) => u.languageId === q.languageId && (q.kind === undefined || u.kind === q.kind) && (q.label === undefined || u.label === q.label))
        .sort(byKey((u) => [u.unitId]))
        .slice(0, limit)
        .map(copy);
    },
    async relationsOf(unitId, direction = 'both') {
      return [...relations.values()]
        .filter((r) => (direction !== 'in' && r.fromId === unitId) || (direction !== 'out' && r.toId === unitId))
        .sort(byKey((r) => [r.fromId, r.relation, r.toId]))
        .map(copy);
    },
    async putRelations(rows) {
      for (const r of rows) {
        const cur = relations.get(relationKey(r));
        if (mayReplaceByRank(cur?.status, r.status)) relations.set(relationKey(r), copy(carried(cur, r)));
      }
    },
    async getAnalysis(analysisId) {
      const a = analyses.get(analysisId);
      return a ? copy(a) : undefined;
    },
    async analysesOfForm(formId, sentenceKey) {
      return [...analyses.values()]
        .filter((a) => a.formId === formId && (sentenceKey === undefined || a.sentenceKey === sentenceKey))
        .sort(byKey((a) => [a.analysisId]))
        .map(copy);
    },
    async putAnalyses(rows) {
      for (const a of rows) {
        const cur = analyses.get(a.analysisId);
        if (mayReplaceAnalysis(cur, a)) analyses.set(a.analysisId, copy(carriedAnalysis(cur, a)));
      }
    },
    async invalidateAnalysis(analysisId, reason, supersededBy) {
      const a = analyses.get(analysisId);
      if (a) analyses.set(analysisId, invalidated(a, reason, supersededBy));
    },
    async aliasesFor(ids) {
      const want = new Set(ids);
      return [...aliases.values()]
        .filter((a) => want.has(a.oldId))
        .sort(byKey((a) => [a.oldId, a.newId, a.packVersion]))
        .map(copy);
    },
    async aliasesTo(ids) {
      const want = new Set(ids);
      return [...aliases.values()].filter((a) => want.has(a.newId)).sort(byKey((a) => [a.newId, a.oldId, a.packVersion])).map(copy);
    },
    async putAliases(rows) {
      for (const a of rows) aliases.set(`${a.oldId}|${a.newId}|${a.packVersion}`, copy(a));
    },
    async getPack(packId, version) {
      const all = [...packs.values()].filter((p) => p.packId === packId);
      const p = version === undefined ? latestPack(all) : all.find((x) => x.version === version);
      return p ? copy(p) : undefined;
    },
    async putPack(p) {
      packs.set(k2(p.packId, p.version), copy(p));
    },
    async listPacks(languageId) {
      return sortPacks([...packs.values()].filter((p) => languageId === undefined || p.languageId === languageId)).map(copy);
    },

    // ───────────────────────────── layer C ─────────────────────────────
    async getKnowledge(learnerId, unitIds) {
      const want = unitIds ? new Set(unitIds) : undefined;
      return [...knowledge.values()]
        .filter((k) => k.learnerId === learnerId && (!want || want.has(k.unitId)))
        .sort(byKey((k) => [k.unitId]))
        .map(copy);
    },
    async getKnowledgePage(learnerId, q) {
      const sourceUnits = q.sourceRef === undefined ? undefined : new Set((logs.get(learnerId) ?? []).filter((e) => e.languageId === q.languageId && ['EncounterRecorded', 'SelectionLookedUp', 'AssistanceRequested'].includes(e.kind) &&
        Object.values(e.subject.sourceRef ?? {}).includes(q.sourceRef)).flatMap((e) => e.subject.itemIds ?? []));
      return [...knowledge.values()].filter((k) => k.learnerId === learnerId && k.languageId === q.languageId && k.unitId > (q.after ?? '') && (!sourceUnits || sourceUnits.has(k.unitId)))
        .sort(byKey((k) => [k.unitId])).slice(0, Math.max(1, Math.min(500, q.limit))).map(copy);
    },
    async getEncounteredKnowledgeStats(learnerId, languageId) {
      const counts = { new: 0, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 };
      for (const k of knowledge.values()) if (k.learnerId === learnerId && k.languageId === languageId && k.encounters > 0) counts[k.level]++;
      return { total: Object.values(counts).reduce((a, b) => a + b, 0), counts };
    },
    async putKnowledge(rows) {
      for (const k of rows) knowledge.set(k2(k.learnerId, k.unitId), copy(k));
    },
    async clearKnowledge(learnerId) {
      for (const [key, k] of [...knowledge]) if (k.learnerId === learnerId) knowledge.delete(key);
    },
    async getProjectionCursor(learnerId) {
      const c = cursors.get(learnerId);
      return c ? { ...c } : undefined;
    },
    async putProjectionCursor(learnerId, cursor) {
      cursors.set(learnerId, { seq: cursor.seq, modelVersion: cursor.modelVersion });
    },
    async getPreferences(learnerId, languageId) {
      const p = preferences.get(k2(learnerId, languageId ?? ''));
      return p ? copy(p) : undefined;
    },
    async putPreferences(p) {
      preferences.set(k2(p.learnerId, p.languageId ?? ''), copy(p));
    },

    // ───────────────────────────── documents ─────────────────────────────
    async getDocument(learnerId, docId) {
      const d = documents.get(k2(learnerId, docId));
      return d ? copy(d) : undefined;
    },
    async listDocuments(learnerId) {
      return [...documents.values()].filter((d) => d.learnerId === learnerId).sort(byKey((d) => [d.docId])).map(copy);
    },
    async putDocument(doc, expectedRevision) {
      const key = k2(doc.learnerId, doc.docId);
      const decision = decidePutDocument(documents.get(key), doc, expectedRevision);
      if ('conflict' in decision) return decision.conflict as { ok: false; current: PrivateDocument };
      documents.set(key, decision.write);
      return { ok: true };
    },
    async deleteDocument(learnerId, docId) {
      const key = k2(learnerId, docId);
      const d = documents.get(key);
      if (d) documents.set(key, deletedDocument(d, now()));
    },

    // ───────────────────────────── identity ─────────────────────────────
    async getLearner(learnerId) {
      const l = learners.get(learnerId);
      return l ? copy(l) : undefined;
    },
    async putLearner(l) {
      learners.set(l.learnerId, copy(l));
    },
    async getAccountByEmail(email) {
      const want = normalizeEmail(email);
      for (const a of accounts.values()) if (a.email === want) return copy(a);
      return undefined;
    },
    async getAccount(accountId) {
      const a = accounts.get(accountId);
      return a ? (stripSecret(a) as Account) : undefined;
    },
    async putAccount(a) {
      const email = normalizeEmail(a.email);
      for (const other of accounts.values()) if (other.email === email && other.accountId !== a.accountId) throw new Error('email already in use');
      assertSameOwner('account', accounts.get(a.accountId)?.learnerId, a.learnerId);
      accounts.set(a.accountId, { ...copy(a), email });
    },
    async getSessionByTokenHash(tokenHash) {
      for (const s of sessions.values()) if (s.tokenHash === tokenHash) return stripSecret(s) as Session;
      return undefined;
    },
    async putSession(s) {
      for (const other of sessions.values()) if (other.tokenHash === s.tokenHash && other.sessionId !== s.sessionId) throw new Error('token hash already in use');
      assertSameOwner('session', sessions.get(s.sessionId)?.learnerId, s.learnerId);
      sessions.set(s.sessionId, copy(s));
    },
    async revokeSession(sessionId, at) {
      const s = sessions.get(sessionId);
      if (s && s.revokedAt === undefined) s.revokedAt = at;
    },
    async getDevice(learnerId, deviceId) {
      const d = devices.get(k2(learnerId, deviceId));
      return d ? copy(d) : undefined;
    },
    async putDevice(d) {
      devices.set(k2(d.learnerId, d.deviceId), copy(d));
    },
    async listEnrolments(learnerId) {
      return [...enrolments.values()]
        .filter((e) => e.learnerId === learnerId)
        .sort(byKey((e) => [e.startedAt, e.enrolmentId]))
        .map(copy);
    },
    async putEnrolment(e) {
      assertSameOwner('enrolment', enrolments.get(e.enrolmentId)?.learnerId, e.learnerId);
      enrolments.set(e.enrolmentId, copy(e));
    },
    async getTeam(teamId) {
      const t = teams.get(teamId);
      return t ? copy(t) : undefined;
    },
    async putTeam(t) {
      teams.set(t.teamId, copy(t));
    },
    async listTeamMembers(teamId) {
      return [...members.values()]
        .filter((m) => m.teamId === teamId)
        .sort(byKey((m) => [m.since, m.learnerId]))
        .map((m) => ({ learnerId: m.learnerId, role: m.role, since: m.since }));
    },
    async putTeamMember(teamId, learnerId, role, since) {
      members.set(k2(teamId, learnerId), { teamId, learnerId, role, since });
    },

    // ───────────────────────────── tombstones ─────────────────────────────
    async listTombstones(learnerId) {
      return [...tombstones.values()]
        .filter((t) => t.learnerId === learnerId)
        .sort(byKey((t) => [t.createdAt, t.tombstoneId]))
        .map(copy);
    },
    async putTombstone(t) {
      assertSameOwner('tombstone', tombstones.get(t.tombstoneId)?.learnerId, t.learnerId);
      tombstones.set(t.tombstoneId, copy(t));
    },

    // ───────────────────────────── whole-store ─────────────────────────────
    async transaction(fn) {
      return fn();
    },
    async eraseLearner(learnerId): Promise<EraseCounts> {
      const c = zeroErase();
      const log = logs.get(learnerId) ?? [];
      c.events = removeEvents(learnerId, new Set(log.map((e) => e.id)));
      logs.delete(learnerId);
      heads.delete(learnerId);
      const sweep = <V>(m: Map<string, V>, owns: (v: V) => boolean): number => {
        let n = 0;
        for (const [key, v] of [...m]) if (owns(v)) { m.delete(key); n++; }
        return n;
      };
      c.knowledge = sweep(knowledge, (k) => k.learnerId === learnerId);
      cursors.delete(learnerId);
      c.preferences = sweep(preferences, (p) => p.learnerId === learnerId);
      c.documents = sweep(documents, (d) => d.learnerId === learnerId);
      c.sessions = sweep(sessions, (s) => s.learnerId === learnerId);
      c.devices = sweep(devices, (d) => d.learnerId === learnerId);
      c.enrolments = sweep(enrolments, (e) => e.learnerId === learnerId);
      c.tombstones = sweep(tombstones, (t) => t.learnerId === learnerId);
      c.teamMemberships = sweep(members, (m) => m.learnerId === learnerId);
      c.accounts = sweep(accounts, (a) => a.learnerId === learnerId);
      c.learners = sweep(learners, (l) => l.learnerId === learnerId);
      return c;
    },
    async applyTombstone(t) {
      return applyDeletion(store, t);
    },
    async provenanceStats() {
      const tally = new Map<string, ProvenanceCount>();
      const add = (table: ProvenanceCount['table'], row: Parameters<typeof provenanceColumns>[0]): void => {
        const { origin, validation } = provenanceColumns(row);
        const key = `${table}\u0000${origin}\u0000${validation}`;
        const c = tally.get(key);
        if (c) c.count++; else tally.set(key, { table, origin, validation, count: 1 });
      };
      for (const u of units.values()) add('units', u);
      for (const r of relations.values()) add('relations', r);
      for (const a of analyses.values()) add('analyses', a);
      return [...tally.values()].sort(byKey((c) => [c.table, c.origin, c.validation]));
    },
    async close() {
      // nothing to release
    },
  };
  return store;
}
