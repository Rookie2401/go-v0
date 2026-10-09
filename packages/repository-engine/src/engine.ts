/**
 * The projection engine: reads the event log, folds it into UnitKnowledge rows, and answers preference, candidate and
 * suitability questions from those rows. It writes only projection rows, the cursor and the preference cache; it never
 * writes a linguistic row (it only reads the LinguisticStore).
 */
import type {
  AssistancePreferences, EventLog, FormAnalysis, IdentityStore, LinguisticStore, LinguisticUnit, ProjectionEngine, ProjectionStore, ReviewCandidate,
  StoredEvent, SuitabilityEstimate, TombstoneStore, UnitKnowledge,
} from '../../repository-contract/src';
import { rankCandidates } from './candidates';
import type { CardState } from './candidates';
import { observationsOf } from './evidence';
import { derivePreferences } from './preferences';
import { compareAt, countersOf, dedupeEvents, foldObservations, isTombstoned, makeResolver, observationsFromEvents, retentionAt } from './projection';
import type { ExposureCounters, UnitResolver } from './projection';
import { estimateSuitability } from './suitability';

export const MODEL_VERSION = 'projection@1';
const PAGE = 500;

export type EngineStore = EventLog & ProjectionStore & LinguisticStore & TombstoneStore & Pick<IdentityStore, 'listEnrolments'>;
export interface EngineDeps { store: EngineStore; now?: () => string; modelVersion?: string }
export interface ProjectionEngineX extends ProjectionEngine {
  /** Exposure kinds behind a unit's exposure estimate (the contract row keeps only positive/negative; see README "exposure encoding"). */
  counters(learnerId: string, unitId: string): Promise<ExposureCounters>;
}

const byUnitId = (a: { unitId: string }, b: { unitId: string }): number => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0);

export function createProjectionEngine(deps: EngineDeps): ProjectionEngineX {
  const store = deps.store;
  const modelVersion = deps.modelVersion ?? MODEL_VERSION;
  const now = deps.now ?? ((): string => new Date().toISOString());

  async function readEvents(learnerId: string, afterSeq = 0): Promise<StoredEvent[]> {
    const out: StoredEvent[] = [];
    let after = afterSeq;
    for (;;) {
      const page = await store.list({ learnerId, afterSeq: after, limit: PAGE });
      if (!page.length) break;
      out.push(...page);
      after = page.reduce((m, e) => Math.max(m, e.seq), after);
      if (page.length < PAGE) break;
    }
    return out.filter((e) => e.learnerId === learnerId);
  }

  /** Loads the `certain` aliases reachable from `ids` (following chains) into a resolver. */
  async function resolverFor(ids: Iterable<string>): Promise<UnitResolver> {
    const all = [] as Awaited<ReturnType<LinguisticStore['aliasesFor']>>;
    const asked = new Set<string>();
    let frontier = [...new Set(ids)];
    for (let round = 0; round < 6 && frontier.length; round++) {
      frontier.forEach((i) => asked.add(i));
      const got = await store.aliasesFor(frontier);
      all.push(...got);
      frontier = [...new Set(got.filter((a) => a.mapping === 'certain').map((a) => a.newId))].filter((i) => !asked.has(i));
    }
    return makeResolver(all);
  }

  async function attachStatus(rows: UnitKnowledge[]): Promise<UnitKnowledge[]> {
    if (!rows.length) return rows;
    const units = new Map((await store.getUnits(rows.map((r) => r.unitId))).map((u) => [u.unitId, u]));
    return rows.map((r) => {
      const u = units.get(r.unitId);
      return u ? { ...r, analysisStatus: u.status } : r;
    });
  }

  /** Observations of every live event of the learner, aliases applied. */
  async function liveObservations(learnerId: string, events: StoredEvent[]) {
    const tombstones = await store.listTombstones(learnerId);
    const raw = observationsFromEvents(events, tombstones);
    const resolve = await resolverFor(raw.map((o) => o.unitId));
    return { observations: raw.map((o) => ({ ...o, unitId: resolve(o.unitId) })), resolve, tombstones };
  }

  async function rebuildRows(learnerId: string): Promise<{ rows: UnitKnowledge[]; seq: number; read: number }> {
    const events = await readEvents(learnerId);
    const { observations } = await liveObservations(learnerId, events);
    const rows = await attachStatus([...foldObservations(observations, modelVersion).values()].sort(byUnitId));
    await store.clearKnowledge(learnerId);
    await store.putKnowledge(rows);
    const seq = events.reduce((m, e) => Math.max(m, e.seq), 0);
    await store.putProjectionCursor(learnerId, { seq, modelVersion });
    return { rows, seq, read: events.length };
  }

  const view = (rows: UnitKnowledge[]): UnitKnowledge[] => {
    const t = now();
    return rows.map((r) => retentionAt(r, t)).sort(byUnitId);
  };

  /**
   * Incremental step. The new events say which units are touched; each touched unit is then recomputed from ALL of its
   * events (so `contexts`, `difficulty` and `basis.events` stay exact and the result equals a rebuild). Cost: one scan
   * of the learner's log per call that has new events (O(N)) plus a fold of the touched units only. This is the price
   * of correctness under alias re-targeting, where a unit's events may sit under several ids; a store-side unit index
   * and a reverse alias lookup would remove the scan.
   * Not detected (call `rebuild()`): a new alias or a new tombstone affecting events older than the cursor.
   */
  async function project(learnerId: string): Promise<{ folded: number; cursor: number }> {
    const cursor = await store.getProjectionCursor(learnerId);
    if (!cursor || cursor.modelVersion !== modelVersion) {
      const r = await rebuildRows(learnerId);
      return { folded: r.read, cursor: r.seq };
    }
    const fresh = await readEvents(learnerId, cursor.seq);
    if (!fresh.length) return { folded: 0, cursor: cursor.seq };
    const seq = fresh.reduce((m, e) => Math.max(m, e.seq), cursor.seq);
    const events = await readEvents(learnerId);
    const { observations, resolve, tombstones } = await liveObservations(learnerId, events);
    const touched = new Set<string>();
    for (const e of dedupeEvents(fresh)) {
      if (isTombstoned(e, tombstones)) continue;
      for (const o of observationsOf(e)) touched.add(resolve(o.unitId));
    }
    const rows = await attachStatus([...foldObservations(observations.filter((o) => touched.has(o.unitId)), modelVersion).values()].sort(byUnitId));
    await store.putKnowledge(rows);
    await store.putProjectionCursor(learnerId, { seq, modelVersion });
    return { folded: fresh.length, cursor: seq };
  }

  /** Read paths are self-healing: they fold anything newer than the cursor (and rebuild on a model-version change) first. */
  async function ensureCurrent(learnerId: string): Promise<void> {
    const cursor = await store.getProjectionCursor(learnerId);
    if (!cursor || cursor.modelVersion !== modelVersion || cursor.seq < (await store.head(learnerId))) await project(learnerId);
  }

  async function knowledge(learnerId: string, unitIds?: string[]): Promise<UnitKnowledge[]> {
    await ensureCurrent(learnerId);
    if (!unitIds) return view(await store.getKnowledge(learnerId));
    const resolve = await resolverFor(unitIds);
    return view(await store.getKnowledge(learnerId, [...new Set(unitIds.map(resolve))]));
  }

  async function preferences(learnerId: string, languageId?: string): Promise<AssistancePreferences> {
    const events = await readEvents(learnerId);
    const tombstones = await store.listTombstones(learnerId);
    const live = events.filter((e) => !isTombstoned(e, tombstones));
    const prefs = derivePreferences(live, learnerId, languageId, now());
    const stored = await store.getPreferences(learnerId, languageId);
    if (!stored || JSON.stringify(stored) !== JSON.stringify(prefs)) await store.putPreferences(prefs);
    return prefs;
  }

  async function candidates(learnerId: string, enrolmentId: string, opts?: { limit?: number; now?: string }): Promise<ReviewCandidate[]> {
    const at = opts?.now ?? now();
    const enrolment = (await store.listEnrolments(learnerId)).find((e) => e.enrolmentId === enrolmentId);
    if (!enrolment) return [];
    const rows = (await knowledge(learnerId)).filter((r) => r.languageId === enrolment.languageId);
    const events = (await readEvents(learnerId)).filter((e) => e.languageId === enrolment.languageId);
    const tombstones = await store.listTombstones(learnerId);
    const resolve = await resolverFor([...rows.map((r) => r.unitId), ...events.flatMap((e) => e.subject?.itemIds ?? [])]);

    // Card state per unit: the latest of CardAdded / CardRemoved / ReviewItemInvalidated decides coverage.
    const cards = new Map<string, CardState>();
    const marks = new Map<string, { at: string; id: string; covered: boolean }>();
    for (const e of dedupeEvents(events)) {
      if (isTombstoned(e, tombstones)) continue;
      const ids = [...new Set((e.subject?.itemIds ?? []).map(resolve))];
      for (const id of ids) {
        const st = cards.get(id) ?? { covered: false };
        if (e.kind === 'CardReviewed' && (st.lastReviewAt === undefined || compareAt(e.at, st.lastReviewAt) > 0)) st.lastReviewAt = e.at;
        if (e.kind === 'CardAdded' || e.kind === 'CardRemoved' || e.kind === 'ReviewItemInvalidated') {
          const m = marks.get(id);
          if (!m || compareAt(e.at, m.at) > 0 || (compareAt(e.at, m.at) === 0 && e.id > m.id)) marks.set(id, { at: e.at, id: e.id, covered: e.kind === 'CardAdded' });
        }
        cards.set(id, st);
      }
    }
    for (const [id, m] of marks) cards.set(id, { ...(cards.get(id) ?? { covered: false }), covered: m.covered });

    // Constructions realised by forms the learner has failed on (the evidence for grammaticalLeverage).
    const realizedBy = new Map<string, string[]>();
    for (const r of rows) {
      if (!Object.entries(r.dimensions).some(([d, e]) => d !== 'exposure' && e.negative > 0)) continue;
      for (const rel of await store.relationsOf(r.unitId, 'out')) {
        if (rel.relation !== 'realizes' || rel.status === 'invalidated' || rel.status === 'conflicted') continue;
        (realizedBy.get(rel.toId) ?? realizedBy.set(rel.toId, []).get(rel.toId)!).push(r.unitId);
      }
    }

    const wanted = [...new Set([...rows.map((r) => r.unitId), ...realizedBy.keys()])];
    const units = new Map<string, LinguisticUnit>((await store.getUnits(wanted)).map((u) => [u.unitId, u]));
    const analyses = new Map<string, FormAnalysis[]>();
    for (const u of units.values()) if (u.kind === 'form') analyses.set(u.unitId, await store.analysesOfForm(u.unitId));

    return rankCandidates({ rows, units, analyses, realizedBy, cards, goals: enrolment.goals, now: at, limit: opts?.limit ?? 20 });
  }

  async function suitability(learnerId: string, languageId: string, sample: { unitIds: string[]; tokenCount: number; constructionIds?: string[] }): Promise<SuitabilityEstimate> {
    const resolve = await resolverFor([...sample.unitIds, ...(sample.constructionIds ?? [])]);
    const unitIds = sample.unitIds.map(resolve);
    const constructionIds = (sample.constructionIds ?? []).map(resolve);
    const distinct = [...new Set([...unitIds, ...constructionIds])];
    await ensureCurrent(learnerId);
    const rows = new Map((await store.getKnowledge(learnerId, distinct)).map((r) => [r.unitId, r]));
    const units = new Map((await store.getUnits(distinct)).map((u) => [u.unitId, u]));
    return estimateSuitability({ languageId, unitIds, tokenCount: sample.tokenCount, constructionIds, rows, units, modelVersion });
  }

  return {
    modelVersion,
    project,
    async rebuild(learnerId) {
      await rebuildRows(learnerId);
      return view(await store.getKnowledge(learnerId));
    },
    knowledge,
    preferences,
    candidates,
    suitability,
    async counters(learnerId, unitId) {
      const events = await readEvents(learnerId);
      const { observations, resolve } = await liveObservations(learnerId, events);
      return countersOf(observations, resolve(unitId));
    },
  };
}
