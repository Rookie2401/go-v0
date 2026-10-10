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

/**
 * projection@4: the six knowledge levels. `UnitKnowledge.level` (new, seen, recognized, familiar, known, automatic; `levelOf`), `UnitKnowledge.encounters`
 * (distinct encounter events) and a `selfMark` that is a LEVEL (a stored legacy `learning` / `known` / `productive` mark is read through `levelOfMark`);
 * ItemMarked accepts the six level words beside the legacy ones; the candidate rules draw units by level, and review is a progression, not a request.
 * The evidence every stored event carries is unchanged, so a rebuild gives the same dimension estimates as projection@3 plus the new fields; nothing
 * stored is rewritten. (projection@3: `selfMark` and the `productive` mark credited to productiveRetrieval. projection@2: the eighth dimension,
 * phraseComprehension, and language-basis weighting of exposure.) A stored cursor at another version is rebuilt from the immutable events on the next read.
 */
export const MODEL_VERSION = 'projection@4';
const PAGE = 500;

export type EngineStore = EventLog & ProjectionStore & LinguisticStore & TombstoneStore & Pick<IdentityStore, 'listEnrolments'>;
export interface EngineDeps { store: EngineStore; now?: () => string; modelVersion?: string }
export interface CandidateOptions {
  limit?: number;
  now?: string;
  /** List units that already have a card too (with the existingCoverage penalty); by default they are not proposed again. */
  includeCovered?: boolean;
  /** Receives notes about rules that could not run (for example a pack with no mission word list). */
  notes?: string[];
}
export interface ProjectionEngineX extends ProjectionEngine {
  candidates(learnerId: string, enrolmentId: string, opts?: CandidateOptions): Promise<ReviewCandidate[]>;
  /** Exposure kinds behind a unit's exposure estimate (the contract row keeps only positive/negative; see README "exposure encoding"). */
  counters(learnerId: string, unitId: string): Promise<ExposureCounters>;
}

/** Judged dimensions whose negative observation counts as "struggled with it" for the construction rule. */
const STRUGGLE_DIMENSIONS: ReadonlySet<string> = new Set(['readingRecognition', 'listeningRecognition', 'assistedRecognition', 'phraseComprehension']);

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
   * A `certain` alias added after rows exist is detected (rows still keyed by an id that now resolves elsewhere) and answered
   * with a rebuild, so live == rebuild (see `rekeyIfAliased`). Not detected (call `rebuild()`): a new tombstone affecting
   * events older than the cursor.
   */
  async function project(learnerId: string): Promise<{ folded: number; cursor: number }> {
    const cursor = await store.getProjectionCursor(learnerId);
    if (!cursor || cursor.modelVersion !== modelVersion) {
      const r = await rebuildRows(learnerId);
      return { folded: r.read, cursor: r.seq };
    }
    const rekeyed = await rekeyIfAliased(learnerId);
    if (rekeyed) return { folded: rekeyed.read, cursor: rekeyed.seq };
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

  /**
   * D2 (audit): an alias that becomes `certain` AFTER evidence was projected leaves the learner's row under the old key,
   * while every read resolves the old id to the new one and finds nothing. A row whose own id now resolves elsewhere
   * is therefore stale: the projection is rebuilt (clear + fold with the aliases applied), which re-keys or merges it.
   * The signature of each stale set is remembered per learner, so a cyclic alias set (whose resolution flips between two
   * ids) is rebuilt at most once per distinct state and cannot loop.
   */
  const rekeyed = new Map<string, Set<string>>();
  async function rekeyIfAliased(learnerId: string): Promise<{ read: number; seq: number } | undefined> {
    const rows = await store.getKnowledge(learnerId);
    if (!rows.length) return undefined;
    const resolve = await resolverFor(rows.map((r) => r.unitId));
    const stale = rows.filter((r) => resolve(r.unitId) !== r.unitId).map((r) => r.unitId).sort();
    if (!stale.length) return undefined;
    const signature = stale.join('|');
    const done = rekeyed.get(learnerId) ?? rekeyed.set(learnerId, new Set()).get(learnerId)!;
    if (done.has(signature)) return undefined;
    done.add(signature);
    return rebuildRows(learnerId);
  }

  /** Read paths are self-healing: they fold anything newer than the cursor (and rebuild on a model-version change or a newly certain alias) first. */
  async function ensureCurrent(learnerId: string): Promise<void> {
    const cursor = await store.getProjectionCursor(learnerId);
    if (!cursor || cursor.modelVersion !== modelVersion || cursor.seq < (await store.head(learnerId))) await project(learnerId);
    else await rekeyIfAliased(learnerId);
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

  async function candidates(learnerId: string, enrolmentId: string, opts?: CandidateOptions): Promise<ReviewCandidate[]> {
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

    // When the learner struggled (lookup, assistance request, failed recognition) with each unit: the construction rule's window reads these.
    const struggles = new Map<string, string[]>();
    for (const o of observationsFromEvents(events, tombstones, resolve)) {
      const struggle = o.dimension === 'exposure'
        ? o.counter === 'lookup' || o.counter === 'assistance'
        : o.outcome === 'negative' && STRUGGLE_DIMENSIONS.has(o.dimension);
      if (struggle) (struggles.get(o.unitId) ?? struggles.set(o.unitId, []).get(o.unitId)!).push(o.at);
    }

    // Constructions realised by forms the learner is in difficulty with (the evidence for grammaticalLeverage).
    const realizedBy = new Map<string, string[]>();
    for (const r of rows) {
      if (!Object.entries(r.dimensions).some(([, e]) => e.negative > 0)) continue;
      for (const rel of await store.relationsOf(r.unitId, 'out')) {
        if (rel.relation !== 'realizes' || rel.status === 'invalidated' || rel.status === 'conflicted' || rel.status === 'requires-review') continue;
        (realizedBy.get(rel.toId) ?? realizedBy.set(rel.toId, []).get(rel.toId)!).push(r.unitId);
      }
    }

    const wanted = [...new Set([...rows.map((r) => r.unitId), ...realizedBy.keys()])];
    const units = new Map<string, LinguisticUnit>((await store.getUnits(wanted)).map((u) => [u.unitId, u]));
    const analyses = new Map<string, FormAnalysis[]>();
    for (const u of units.values()) if (u.kind === 'form') analyses.set(u.unitId, await store.analysesOfForm(u.unitId));

    // The pack's mission word list, if its facts expose one (`missionUnitIds`); none today, so the rule is skipped and says so in `opts.notes`.
    const pack = await store.getPack(enrolment.packId);
    const mission = (pack as { missionUnitIds?: unknown } | undefined)?.missionUnitIds;
    const missionUnits = Array.isArray(mission) ? new Set(mission.filter((m): m is string => typeof m === 'string')) : undefined;

    return rankCandidates({
      rows, units, analyses, realizedBy, cards, goals: enrolment.goals, now: at, limit: opts?.limit ?? 20, struggles,
      ...(missionUnits ? { missionUnits } : {}), ...(opts?.includeCovered ? { includeCovered: true } : {}), ...(opts?.notes ? { notes: opts.notes } : {}),
    });
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
