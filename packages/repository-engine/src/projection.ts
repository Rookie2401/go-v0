/**
 * The pure fold: observations -> UnitKnowledge rows. No I/O.
 *
 * Every update is a commutative accumulation (weighted sums, min, max, set union); the derived fields (score,
 * confidence, retention, uncertainty) are recomputed from the sums after every step, so a row is always consistent with
 * its own counters. `foldObservations` additionally sorts into a canonical order before folding, so even floating-point
 * rounding cannot depend on arrival order. Sums are kept to 1e-9.
 *
 * These estimates are hypotheses until calibrated against independent assessments.
 */
import { DIMENSIONS } from '../../repository-contract/src';
import type { Dimension, DimensionEstimate, GoEvent, Tombstone, UnitKnowledge } from '../../repository-contract/src';
import { observationsOf } from './evidence';
import type { Observation } from './evidence';
import { RECOGNITION_LEVEL_DIMENSIONS, levelOf } from './levels';

/** Pseudo-observations at 0.5 that every judged dimension starts from: a prior of "undecided". */
export const PRIOR = 1;
/** confidence = W / (W + CONFIDENCE_SATURATION) x (1 - disagreement). */
export const CONFIDENCE_SATURATION = 2;
/** Exposure "familiarity" = W / (W + EXPOSURE_SATURATION); exposure is a count of meetings, not a judgement. */
export const EXPOSURE_SATURATION = 3;
/** Retention half-life in days = HALF_LIFE_BASE_DAYS + HALF_LIFE_PER_WEIGHT x (weight of the dimension it rests on). A hypothesis. */
export const HALF_LIFE_BASE_DAYS = 2;
export const HALF_LIFE_PER_WEIGHT = 3;

const DAY_MS = 86_400_000;
const r9 = (x: number): number => Math.round(x * 1e9) / 1e9;

/** Total order on ISO timestamps: by instant, then by string so equal instants written differently still order. */
export function compareAt(a: string, b: string): number {
  const d = Date.parse(a) - Date.parse(b);
  if (d !== 0 && !Number.isNaN(d)) return d < 0 ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function emptyEstimate(exposure = false): DimensionEstimate {
  return { score: exposure ? 0 : 0.5, confidence: 0, observations: 0, positive: 0, negative: 0, weight: 0, contexts: 0 };
}

export function emptyRow(learnerId: string, unitId: string, languageId: string, modelVersion: string): UnitKnowledge {
  const dimensions = {} as Record<Dimension, DimensionEstimate>;
  for (const d of DIMENSIONS) dimensions[d] = emptyEstimate(d === 'exposure');
  return {
    learnerId, unitId, languageId, dimensions,
    retention: { estimate: 0, halfLifeDays: HALF_LIFE_BASE_DAYS, basedOn: 'none' },
    level: 'new', encounters: 0,
    uncertainty: 1, modelVersion, basis: { events: 0 },
  };
}

/**
 * Auxiliary accumulators a row cannot carry (the contract's row has only counts): exact distinct contexts, the
 * weighted-difficulty sums and the distinct event ids. One FoldState belongs to one row's fold; an engine folds a
 * unit from all of its observations with a fresh state, which makes `contexts`, `difficulty` and `basis.events` exact.
 * Folding a single observation into a stored row with no state seeds the state from the row (contexts and events
 * then count the new observation once; they are exact only if it is genuinely new).
 */
export interface FoldState {
  seeded: boolean;
  eventOffset: number;
  contextOffset: Partial<Record<Dimension, number>>;
  contexts: Partial<Record<Dimension, Set<string>>>;
  difficulty: Partial<Record<Dimension, { sum: number; w: number }>>;
  events: Set<string>;
  /** Event id of the observation behind the row's current `selfMark` (the tie-break when two marks share an instant); '' for a seeded row. */
  selfMarkEventId: string;
  /** projection@4: the observations folded in this state (the level is computed from them once the fold is done: see `finalizeRow`). */
  observations: Observation[];
  /** projection@4: the encounters a stored row already counted, when this state was seeded from it. */
  encounterOffset: number;
}
export const newFoldState = (): FoldState => ({ seeded: false, eventOffset: 0, contextOffset: {}, contexts: {}, difficulty: {}, events: new Set(), selfMarkEventId: '', observations: [], encounterOffset: 0 });

function seed(state: FoldState, row: UnitKnowledge): void {
  state.seeded = true;
  state.eventOffset = row.basis.events;
  state.encounterOffset = row.encounters ?? 0;
  for (const d of DIMENSIONS) {
    const e = row.dimensions[d];
    state.contextOffset[d] = e.contexts;
    if (e.difficulty !== undefined && e.weight > 0) state.difficulty[d] = { sum: e.difficulty * e.weight, w: e.weight };
  }
}

function derive(e: DimensionEstimate, exposure: boolean): void {
  if (exposure) {
    e.score = r9(e.weight / (e.weight + EXPOSURE_SATURATION));
    e.confidence = r9(e.weight / (e.weight + CONFIDENCE_SATURATION));
    return;
  }
  e.score = r9((0.5 * PRIOR + e.positive) / (PRIOR + e.weight));
  const pn = e.positive + e.negative;
  const disagreement = pn > 0 ? (2 * Math.min(e.positive, e.negative)) / pn : 0;
  e.confidence = r9((e.weight / (e.weight + CONFIDENCE_SATURATION)) * (1 - disagreement));
}

/** Retention and uncertainty from the dimension estimates (exposure never counts as knowledge). */
function deriveRow(dims: Record<Dimension, DimensionEstimate>): Pick<UnitKnowledge, 'retention' | 'uncertainty'> {
  let basedOn: Dimension | 'none' = 'none';
  let best = -1;
  let maxConf = 0;
  for (const d of DIMENSIONS) {
    if (d === 'exposure' || dims[d].observations === 0) continue;
    maxConf = Math.max(maxConf, dims[d].confidence);
    // strength = score x confidence: one weak positive must not read as strong retention.
    const strength = dims[d].score * dims[d].confidence;
    if (strength > best) { best = strength; basedOn = d; }
  }
  if (basedOn === 'none') return { retention: { estimate: 0, halfLifeDays: HALF_LIFE_BASE_DAYS, basedOn: 'none' }, uncertainty: 1 };
  return {
    retention: { estimate: r9(best), halfLifeDays: r9(HALF_LIFE_BASE_DAYS + HALF_LIFE_PER_WEIGHT * dims[basedOn].weight), basedOn },
    uncertainty: r9(1 - maxConf),
  };
}

/**
 * True when an observation is an ENCOUNTER with the unit (projection@4 `UnitKnowledge.encounters`): the learner met it in text (an encounter, a lookup, an
 * assistance request) or recognised it (any recognition judgement, assisted or not). Playing its audio, producing it and marking it are not encounters.
 */
export function isEncounterObservation(o: Observation): boolean {
  if (o.selfMark !== undefined) return false;
  if (o.dimension === 'exposure') return o.counter !== 'playback';
  return o.dimension === 'assistedRecognition' || RECOGNITION_LEVEL_DIMENSIONS.includes(o.dimension);
}

/**
 * Sets `encounters` (distinct events) and `level` from the observations a fold has seen (projection@4). The level needs the evidence dated AFTER
 * the learner's mark, which only the observations can give, so it is computed once per unit when its fold is complete rather than at every step.
 */
export function finalizeRow(row: UnitKnowledge, state: FoldState): UnitKnowledge {
  const encounters = state.encounterOffset + new Set(state.observations.filter(isEncounterObservation).map((o) => o.eventId)).size;
  const mark = row.selfMark;
  let since: UnitKnowledge['dimensions'] | undefined;
  let evidence: UnitKnowledge['dimensions'] | undefined;
  if (mark) {
    // the evidence proper: the unit folded without its self-reports (a mark is a claim, not a recognition)
    let own: UnitKnowledge | undefined;
    const ownState = newFoldState();
    for (const o of [...state.observations].filter((x) => x.selfMark === undefined).sort(compareObservations)) own = foldOne(own, o, row.modelVersion, ownState);
    evidence = (own ?? emptyRow(row.learnerId, row.unitId, row.languageId, row.modelVersion)).dimensions;
    const fresh = state.observations.filter((o) => o.selfMark === undefined && compareAt(o.at, mark.at) > 0).sort(compareObservations);
    const st = newFoldState();
    let acc: UnitKnowledge | undefined;
    for (const o of fresh) acc = foldOne(acc, o, row.modelVersion, st);
    since = (acc ?? emptyRow(row.learnerId, row.unitId, row.languageId, row.modelVersion)).dimensions;
  }
  return { ...row, encounters, level: levelOf(row, since, evidence) };
}

/** Folds one observation into a row (pure; returns a new row, level and encounters set). Commutative with every other fold up to 1e-9. */
export function foldObservation(row: UnitKnowledge | undefined, o: Observation, modelVersion: string, state: FoldState = newFoldState()): UnitKnowledge {
  return finalizeRow(foldOne(row, o, modelVersion, state), state);
}

/** The accumulation step shared by `foldObservation` (finalised at once) and `foldObservations` (finalised when a unit's fold is complete). */
function foldOne(row: UnitKnowledge | undefined, o: Observation, modelVersion: string, state: FoldState): UnitKnowledge {
  const base = row ?? emptyRow(o.learnerId, o.unitId, o.languageId, modelVersion);
  if (!state.seeded) seed(state, base);
  const dim = o.dimension;
  const exposure = dim === 'exposure';
  if (!exposure && o.outcome === 'exposure') return base; // a judged dimension takes judgements only
  state.observations.push(o);
  const prev = base.dimensions[dim];
  const e: DimensionEstimate = { ...prev };
  e.observations = prev.observations + 1;
  e.weight = r9(prev.weight + o.weight);
  if (exposure) {
    // Encoding (documented): exposure.positive counts encounters and playbacks, exposure.negative counts lookups and assistance requests.
    if (o.counter === 'lookup' || o.counter === 'assistance') e.negative = prev.negative + 1;
    else e.positive = prev.positive + 1;
  } else if (o.outcome === 'positive') e.positive = r9(prev.positive + o.weight);
  else e.negative = r9(prev.negative + o.weight);

  const cmp = prev.lastAt === undefined ? 1 : compareAt(o.at, prev.lastAt);
  if (cmp > 0) { e.lastAt = o.at; e.lastAssisted = o.assisted; } else if (cmp === 0) e.lastAssisted = (prev.lastAssisted ?? false) || o.assisted;

  if (o.sentenceKey) {
    const set = (state.contexts[dim] ??= new Set<string>());
    set.add(o.sentenceKey);
  }
  e.contexts = (state.contextOffset[dim] ?? 0) + (state.contexts[dim]?.size ?? 0);
  if (o.difficulty !== undefined) {
    const acc = (state.difficulty[dim] ??= { sum: 0, w: 0 });
    acc.sum += o.difficulty * o.weight;
    acc.w += o.weight;
    e.difficulty = r9(acc.sum / acc.w);
  }
  e.sourceReliability = prev.sourceReliability === undefined ? o.sourceReliability : Math.min(prev.sourceReliability, o.sourceReliability);
  derive(e, exposure);

  const dimensions = { ...base.dimensions, [dim]: e };
  state.events.add(o.eventId);
  // projection@3: the LATEST explicit mark wins. "Latest" is the fold's own recency order: event instant, then event id. A max over
  // that total order, so it is commutative like the other accumulations.
  let selfMark = base.selfMark;
  if (o.selfMark !== undefined) {
    const c = selfMark === undefined ? 1 : compareAt(o.at, selfMark.at) || (o.eventId < state.selfMarkEventId ? -1 : o.eventId > state.selfMarkEventId ? 1 : 0);
    if (c > 0) { selfMark = { mark: o.selfMark, at: o.at }; state.selfMarkEventId = o.eventId; }
  }
  const lastCmp = base.lastSeenAt === undefined ? 1 : compareAt(o.at, base.lastSeenAt) || (o.eventId < (base.basis.lastEventId ?? '') ? -1 : o.eventId > (base.basis.lastEventId ?? '') ? 1 : 0);
  return {
    ...base,
    dimensions,
    ...deriveRow(dimensions),
    ...(selfMark !== undefined ? { selfMark } : {}),
    firstSeenAt: base.firstSeenAt === undefined || compareAt(o.at, base.firstSeenAt) < 0 ? o.at : base.firstSeenAt,
    lastSeenAt: lastCmp > 0 ? o.at : base.lastSeenAt,
    modelVersion,
    basis: { events: state.eventOffset + state.events.size, lastEventId: lastCmp > 0 ? o.eventId : base.basis.lastEventId },
  };
}

const dimIndex = new Map<Dimension, number>(DIMENSIONS.map((d, i) => [d, i]));
/** Canonical order: instant, event id, dimension, outcome, weight, counter. Total, so the fold input order is fixed. */
export function compareObservations(a: Observation, b: Observation): number {
  return compareAt(a.at, b.at)
    || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)
    || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0)
    || (dimIndex.get(a.dimension)! - dimIndex.get(b.dimension)!)
    || (a.outcome < b.outcome ? -1 : a.outcome > b.outcome ? 1 : 0)
    || (a.weight - b.weight)
    || ((a.counter ?? '') < (b.counter ?? '') ? -1 : (a.counter ?? '') > (b.counter ?? '') ? 1 : 0);
}

/** Folds many observations (any order, duplicates of the same event/unit/dimension collapsed) into one row per unit. */
export function foldObservations(observations: Observation[], modelVersion: string): Map<string, UnitKnowledge> {
  const sorted = [...observations].sort(compareObservations);
  const states = new Map<string, FoldState>();
  const rows = new Map<string, UnitKnowledge>();
  const seen = new Set<string>();
  for (const o of sorted) {
    const key = `${o.eventId}\u0000${o.unitId}\u0000${o.dimension}`;
    if (seen.has(key)) continue; // one event contributes once to a unit's dimension, however it arrived or was re-targeted
    seen.add(key);
    let st = states.get(o.unitId);
    if (!st) states.set(o.unitId, (st = newFoldState()));
    rows.set(o.unitId, foldOne(rows.get(o.unitId), o, modelVersion, st));
  }
  for (const [unitId, row] of rows) rows.set(unitId, finalizeRow(row, states.get(unitId)!));
  return rows;
}

/** Applies the retention decay at `nowIso` (read-time view; stored rows hold the undecayed strength). */
export function retentionAt(row: UnitKnowledge, nowIso: string): UnitKnowledge {
  const b = row.retention.basedOn;
  if (b === 'none') return row;
  const last = row.dimensions[b].lastAt;
  if (!last || Number.isNaN(Date.parse(last))) return row;
  const days = Math.max(0, (Date.parse(nowIso) - Date.parse(last)) / DAY_MS);
  if (Number.isNaN(days)) return row;
  return { ...row, retention: { ...row.retention, estimate: r9(row.retention.estimate * Math.pow(2, -days / row.retention.halfLifeDays)) } };
}

// ───────────────────────────── events -> observations ─────────────────────────────

/** Events with the same id are one event; when copies differ the lexicographically smallest serialisation wins (deterministic). */
export function dedupeEvents<E extends GoEvent>(events: E[]): E[] {
  const byId = new Map<string, E>();
  for (const e of events) {
    const cur = byId.get(e.id);
    if (!cur) byId.set(e.id, e);
    else if (cur !== e && JSON.stringify(e) < JSON.stringify(cur)) byId.set(e.id, e);
  }
  return [...byId.values()];
}

/** True when a tombstone of the event's learner covers the event (whole learner, one event, a time range or a source). */
export function isTombstoned(e: GoEvent, tombstones: Tombstone[]): boolean {
  for (const t of tombstones) {
    if (t.learnerId !== e.learnerId) continue;
    const s = t.scope;
    if (s.kind === 'learner') return true;
    if (s.kind === 'event' && s.id === e.id) return true;
    if (s.kind === 'range') {
      const at = Date.parse(e.at);
      if (at >= Date.parse(s.from) && at <= Date.parse(s.to)) return true;
    }
    if (s.kind === 'source') {
      const ref = e.subject?.sourceRef;
      if (ref && ref.kind === s.sourceRef.kind && (s.sourceRef.title === undefined || ref.title === s.sourceRef.title) && (s.sourceRef.locator === undefined || ref.locator === s.sourceRef.locator)) return true;
    }
  }
  return false;
}

export type UnitResolver = (unitId: string) => string;
export const identityResolver: UnitResolver = (id) => id;

/**
 * Alias re-targeting: only `certain` aliases move evidence (`uncertain` leaves it on the old id). When several certain
 * aliases leave one old id the most confident, then latest pack version, then smallest new id wins; chains are followed
 * (bounded, cycle-safe).
 */
export function makeResolver(aliases: Array<{ oldId: string; newId: string; mapping: 'certain' | 'uncertain'; confidence: number; packVersion: string }>): UnitResolver {
  const best = new Map<string, string>();
  const ranked = aliases.filter((a) => a.mapping === 'certain' && a.oldId !== a.newId).sort((a, b) =>
    b.confidence - a.confidence || (a.packVersion < b.packVersion ? 1 : a.packVersion > b.packVersion ? -1 : 0) || (a.newId < b.newId ? -1 : a.newId > b.newId ? 1 : 0));
  for (const a of ranked) if (!best.has(a.oldId)) best.set(a.oldId, a.newId);
  return (id) => {
    let cur = id;
    const visited = new Set<string>([cur]);
    for (let hop = 0; hop < 8; hop++) {
      const next = best.get(cur);
      if (next === undefined || visited.has(next)) break;
      visited.add(next);
      cur = next;
    }
    return cur;
  };
}

/** Observations of the live (non-tombstoned, de-duplicated) events, with unit ids re-targeted through `resolve`. */
export function observationsFromEvents(events: GoEvent[], tombstones: Tombstone[], resolve: UnitResolver = identityResolver): Observation[] {
  const out: Observation[] = [];
  for (const e of dedupeEvents(events)) {
    if (isTombstoned(e, tombstones)) continue;
    for (const o of observationsOf(e)) out.push({ ...o, unitId: resolve(o.unitId) });
  }
  return out;
}

/** The whole pure pipeline: events -> rows (sorted by unit id). */
export function foldEvents(events: GoEvent[], opts: { modelVersion: string; tombstones?: Tombstone[]; resolve?: UnitResolver; only?: ReadonlySet<string> }): UnitKnowledge[] {
  let obs = observationsFromEvents(events, opts.tombstones ?? [], opts.resolve);
  if (opts.only) obs = obs.filter((o) => opts.only!.has(o.unitId));
  return [...foldObservations(obs, opts.modelVersion).values()].sort((a, b) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
}

/** Counts of the exposure kinds behind a unit's exposure estimate (the contract row stores only positive/negative). */
export interface ExposureCounters {
  encounters: number; lookups: number; assistance: number; playbacks: number;
  /** projection@2: encounter and lookup exposures by how their language was settled (`missing` = a v2 event with no language block). `undetermined` observes nothing and is not counted. */
  byLanguageBasis: Record<string, number>;
}
export function countersOf(observations: Observation[], unitId: string): ExposureCounters {
  const c: ExposureCounters = { encounters: 0, lookups: 0, assistance: 0, playbacks: 0, byLanguageBasis: {} };
  const seen = new Set<string>();
  for (const o of observations) {
    if (o.unitId !== unitId || o.dimension !== 'exposure') continue;
    const k = `${o.eventId}\u0000${o.counter ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (o.counter === 'lookup') c.lookups++;
    else if (o.counter === 'assistance') c.assistance++;
    else if (o.counter === 'playback') c.playbacks++;
    else c.encounters++;
    if (o.languageBasis !== undefined) c.byLanguageBasis[o.languageBasis] = (c.byLanguageBasis[o.languageBasis] ?? 0) + 1;
  }
  return c;
}
