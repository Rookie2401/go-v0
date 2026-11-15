/**
 * The projection engine: reads the event log, folds it into UnitKnowledge rows, and answers preference, candidate and
 * suitability questions from those rows. It writes only projection rows, the cursor and the preference cache; it never
 * writes a linguistic row (it only reads the LinguisticStore).
 */
import type {
  AssistancePreferences, EventLog, FormAnalysis, IdentityStore, LinguisticStore, LinguisticUnit, ProjectionEngine, ProjectionStore, ReviewCandidate,
  StoredEvent, SuitabilityEstimate, TombstoneStore, UnitKnowledge,
} from '../../repository-contract/src';
import { CANDIDATE_RULES, rankCandidates } from './candidates';
import type { CardState } from './candidates';
import { observationsOf } from './evidence';
import type { Observation } from './evidence';
import { derivePreferences } from './preferences';
import { compareAt, countersOf, dedupeEvents, foldObservations, isTombstoned, makeResolver, observationsFromEvents, retentionAt } from './projection';
import type { ExposureCounters, UnitResolver } from './projection';
import { estimateSuitability } from './suitability';

/**
 * projection@7: shared causal review validity and per-dimension delayed independent evidence gate inferred Known. A deliberate New mark
 * starts a fresh visible inference window; historical numeric evidence remains available. Rebuild older rows from immutable events.
 * projection@6: the same rows, refolded under the mark rule of 2026-10-26 (the owner's rule: after the first automatic step from New to Seen,
 * only the learner changes a word's state; `levels.ts` markStatus). The rule changed without a version step, so rows the service and the
 * on-device Repositories had folded before it kept their old level (a word marked Known that was looked up afterwards read Seen) until the
 * unit's next event. A stored cursor at projection@5 is rebuilt from the immutable events on the next read, as every version step is; the
 * dimension estimates come out unchanged, only the level of a marked row can move, back to the mark. Nothing stored is rewritten.
 * projection@5: the six knowledge levels. `UnitKnowledge.level` (new, seen, recognized, familiar, known, automatic; `levelOf`), `UnitKnowledge.encounters`
 * (distinct encounter events) and a `selfMark` that is a LEVEL (a stored legacy `learning` / `known` / `productive` mark is read through `levelOfMark`);
 * ItemMarked accepts the six level words beside the legacy ones; the candidate rules draw units by level, and review is a progression, not a request.
 * The evidence every stored event carries is unchanged, so a rebuild gives the same dimension estimates as projection@3 plus the new fields; nothing
 * stored is rewritten. projection@5 stops inferring `automatic` from production counts and carries an existing projection@4 automatic row as
 * `legacyKnowability` metadata until a later explicit non-automatic mark or an unassisted productive retrieval failure. It creates no event or self-mark.
 * (projection@3: `selfMark` and the `productive` mark credited to productiveRetrieval. projection@2: the eighth dimension,
 * phraseComprehension, and language-basis weighting of exposure.) A stored cursor at another version is rebuilt from the immutable events on the next read.
 */
export const MODEL_VERSION = 'projection@7';
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
  objectiveDimensions?: import('../../repository-contract/src').Dimension[];
}
export interface ProjectionEngineX extends ProjectionEngine {
  candidates(learnerId: string, enrolmentId: string, opts?: CandidateOptions): Promise<ReviewCandidate[]>;
  /** Exposure kinds behind a unit's exposure estimate (the contract row keeps only positive/negative; see README "exposure encoding"). */
  counters(learnerId: string, unitId: string): Promise<ExposureCounters>;
}

/** Judged dimensions whose negative observation counts as "struggled with it" for the construction rule. */
const STRUGGLE_DIMENSIONS: ReadonlySet<string> = new Set(['readingRecognition', 'listeningRecognition', 'assistedRecognition', 'phraseComprehension']);

/** A lookup, an assistance request or a failed recognition: what the construction rule's window reads (`candidates`). */
export const isStruggleObservation = (o: Observation): boolean =>
  o.dimension === 'exposure' ? o.counter === 'lookup' || o.counter === 'assistance' : o.outcome === 'negative' && STRUGGLE_DIMENSIONS.has(o.dimension);

/** One read of the learner's log: only these kinds, optionally one language, optionally only events at or after `since` (the store's `at` bound). */
interface EventSlice { kinds: readonly string[]; languageId?: string; since?: string }

/**
 * The event kinds that can produce a struggle observation (evidence.ts `draftsOf`): lookups, layers and assistance requests (exposure counters `lookup` /
 * `assistance`, and a phrase or sentence request's negative assistedRecognition), a "new / seen / learning" mark, a hinted or failed written or listening
 * review, a failed or hinted grammar answer, an assisted failed production. A test walks every event kind to keep this list complete.
 */
export const STRUGGLE_EVENT_KINDS = ['SelectionLookedUp', 'AnalysisShown', 'AssistanceRequested', 'ItemMarked', 'ProductionRecorded', 'CardReviewed', 'AssessmentAnswered', 'ListeningAssessed'] as const;
/** Review kinds: whether one counts depends on its card's whole history (chains, corrections, retractions), so these are read without a time bound. */
const REVIEW_EVENT_KINDS = ['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed'] as const;
const WINDOWED_STRUGGLE_KINDS = STRUGGLE_EVENT_KINDS.filter((k) => !(REVIEW_EVENT_KINDS as readonly string[]).includes(k));
/** The deck lifecycle kinds the card state reads in full (the latest of them per card and dimension decides coverage). */
const DECK_EVENT_KINDS = ['CardAdded', 'CardRemoved', 'ReviewItemInvalidated'] as const;
/** What `derivePreferences` counts or reads whole, whatever their number: the learner's own preference events and requests. */
const PREFERENCE_EVENT_KINDS = ['PreferenceChanged', 'AssistanceRequested', 'PronunciationPlayed'] as const;
/** The remaining kinds it reads: the help events of a sentence (the audio-first rule) and the latest event that fed any preference (`updatedAt`). */
const HELP_EVENT_KINDS = ['SelectionLookedUp', 'AnalysisShown'] as const;
const HOUR_MS = 3_600_000;
/** `updatedAt` looks for the newest help event in growing windows ending now (hours); only when none is found does it read them all. */
const RECENCY_WINDOWS_HOURS = [1, 8, 64, 512, 4096] as const;
const DAY_MS = 86_400_000;

const isoOrUndefined = (ms: number): string | undefined => (Number.isFinite(ms) && Math.abs(ms) < 8.64e15 ? new Date(ms).toISOString() : undefined);

/** A Map that remembers which keys were asked for (`rankCandidates` reads analyses only through `get`). */
class AskedMap<V> extends Map<string, V> {
  readonly asked = new Set<string>();
  override get(key: string): V | undefined { this.asked.add(key); return super.get(key); }
}

const byUnitId = (a: { unitId: string }, b: { unitId: string }): number => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0);

/** Carry the old automatic label as explicit migration metadata, never as a synthetic learner mark or event. */
function carryLegacyAutomatic(rows: UnitKnowledge[], previousRows: UnitKnowledge[], observations: Observation[], migratedAt: string, migrate: boolean): UnitKnowledge[] {
  const previous = new Map(previousRows.map((row) => [row.unitId, row]));
  return rows.map((row) => {
    const old = previous.get(row.unitId);
    let legacy = old?.legacyKnowability;
    if (!legacy && migrate && old?.modelVersion === 'projection@4' && old.level === 'automatic' && old.selfMark?.mark !== 'automatic') { // a row still at @4 (never refolded by @5) is carried the same way
      legacy = { level: 'automatic', modelVersion: 'projection@4', migratedAt, basis: 'legacy-production-inference' };
    }
    if (!legacy) return row;
    const newExplicitMark = row.selfMark && Date.parse(row.selfMark.at) > Date.parse(legacy.migratedAt) && row.selfMark.mark !== 'automatic';
    const confirmedFailure = observations.some((o) => o.unitId === row.unitId && o.dimension === 'productiveRetrieval' && o.outcome === 'negative' && !o.assisted && Date.parse(o.at) > Date.parse(legacy!.migratedAt));
    if (newExplicitMark || confirmedFailure) return row;
    return { ...row, level: 'automatic', legacyKnowability: legacy };
  });
}

export function createProjectionEngine(deps: EngineDeps): ProjectionEngineX {
  const store = deps.store;
  const modelVersion = deps.modelVersion ?? MODEL_VERSION;
  const now = deps.now ?? ((): string => new Date().toISOString());

  /**
   * The learner's events, optionally one slice of them (kinds, a language, an `at` lower bound), always in seq order. The slice is applied again here after the
   * store has applied what it can, so a store that ignores part of a filter gives the same answer (a superset is harmless to every caller).
   * How the slice is asked for matters on SQLite (EXPLAIN QUERY PLAN, no statistics): a `language_id` term makes the planner walk the language index, and
   * `kind IN (a, b, c)` with no time bound makes it walk the learner's whole log in seq order, reading every row's kind; both cost the length of the log
   * (50 ms for 20 matching rows among 12,000). So the language is never sent (it is a filter here), several kinds with no bound are read one kind at a time
   * (each answered from the (learner, kind, seq) index) and merged back into seq order, and a time-bounded read of several kinds goes in one call (the
   * (learner, at) index answers it).
   */
  async function readEvents(learnerId: string, afterSeq = 0, only?: EventSlice): Promise<StoredEvent[]> {
    if (only && only.kinds.length > 1 && only.since === undefined) {
      const parts: StoredEvent[] = [];
      for (const kind of only.kinds) parts.push(...await readEvents(learnerId, afterSeq, { ...only, kinds: [kind] }));
      return parts.sort((x, y) => x.seq - y.seq);
    }
    const out: StoredEvent[] = [];
    let after = afterSeq;
    for (;;) {
      const page = await store.list({ learnerId, afterSeq: after, limit: PAGE, ...(only ? { kinds: [...only.kinds], ...(only.since !== undefined ? { since: only.since } : {}) } : {}) });
      if (!page.length) break;
      out.push(...page);
      after = page.reduce((m, e) => Math.max(m, e.seq), after);
      if (page.length < PAGE) break;
    }
    return out.filter((e) => e.learnerId === learnerId && (!only || (only.kinds.includes(e.kind) && (only.languageId === undefined || e.languageId === only.languageId))));
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
    const previousRows = await store.getKnowledge(learnerId);
    const events = await readEvents(learnerId);
    const { observations } = await liveObservations(learnerId, events);
    const folded = [...foldObservations(observations, modelVersion).values()].sort(byUnitId);
    const rows = await attachStatus(carryLegacyAutomatic(folded, previousRows, observations, now(), true));
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
   * events (so `contexts`, `difficulty` and `basis.events` stay exact and the result equals a rebuild). Those events are read
   * through the store's unit index and a reverse alias lookup (`eventsReaching`), so a call costs what the touched units cost,
   * not the length of the learner's log (the audit of 2026-11-03 measured 4 s a batch at 100,000 events). Anything the index
   * cannot prove complete falls back to reading the whole log, which gives the same rows, only slower.
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
    // A valid review correction retracts an earlier event's evidence. Rebuild from the immutable log so the
    // projection removes that contribution instead of merely folding the correction as another observation.
    if (fresh.some((e) => e.correctionOf !== undefined)) {
      const rebuilt = await rebuildRows(learnerId);
      return { folded: fresh.length, cursor: rebuilt.seq };
    }
    const seq = fresh.reduce((m, e) => Math.max(m, e.seq), cursor.seq);
    const tombstones = await store.listTombstones(learnerId);
    const named = dedupeEvents(fresh).filter((e) => !isTombstoned(e, tombstones)).flatMap((e) => observationsOf(e).map((o) => o.unitId));
    const resolveNamed = await resolverFor(named);
    const touched = new Set(named.map(resolveNamed));
    const events = await eventsReaching(learnerId, touched) ?? await readEvents(learnerId);
    const { observations } = await liveObservations(learnerId, events);
    const rows = await attachStatus([...foldObservations(observations.filter((o) => touched.has(o.unitId)), modelVersion).values()].sort(byUnitId));
    const previousRows = await store.getKnowledge(learnerId, [...touched]);
    await store.putKnowledge(carryLegacyAutomatic(rows, previousRows, observations, now(), false));
    await store.putProjectionCursor(learnerId, { seq, modelVersion });
    return { folded: fresh.length, cursor: seq };
  }

  /**
   * The events a fold of `touched` needs: those naming a touched unit or an id with a certain alias into one, and, because review evidence is decided per
   * card, those naming any other item of a review among them. `undefined` when that cannot be shown complete (no index on this store, a chain of aliases or
   * items longer than expected, or a review whose predecessor is not there): the caller then reads the whole log.
   */
  async function eventsReaching(learnerId: string, touched: ReadonlySet<string>): Promise<StoredEvent[] | undefined> {
    if (!store.listEventsOfUnits || !store.aliasesTo) return undefined;
    const ids = new Set(touched);
    let frontier = [...ids];
    for (let round = 0; frontier.length; round++) {
      if (round === 6) return undefined;
      const into = await store.aliasesTo(frontier);
      frontier = [...new Set(into.filter((a) => a.mapping === 'certain').map((a) => a.oldId))].filter((i) => !ids.has(i));
      frontier.forEach((i) => ids.add(i));
    }
    const found = new Map<string, StoredEvent>();
    let want = [...ids];
    for (let round = 0; want.length; round++) {
      if (round === 6) return undefined;
      const page = await store.listEventsOfUnits(learnerId, want);
      const more = new Set<string>();
      for (const e of page) {
        found.set(e.id, e);
        if (e.subject?.cardId) for (const item of e.subject.itemIds ?? []) if (!ids.has(item)) more.add(item);
      }
      more.forEach((i) => ids.add(i));
      want = [...more];
    }
    for (const e of found.values()) {
      const previous = (e.payload as { expectedPreviousReviewId?: unknown } | undefined)?.expectedPreviousReviewId;
      if (typeof previous === 'string' && previous && !found.has(previous)) return undefined;
    }
    return [...found.values()].sort((a, b) => a.seq - b.seq);
  }

  /**
   * D2 (audit): an alias that becomes `certain` AFTER evidence was projected leaves the learner's row under the old key,
   * while every read resolves the old id to the new one and finds nothing. A row whose own id now resolves elsewhere
   * is therefore stale: the projection is rebuilt (clear + fold with the aliases applied), which re-keys or merges it.
   * The signature of each stale set is remembered per learner, so a cyclic alias set (whose resolution flips between two
   * ids) is rebuilt at most once per distinct state and cannot loop.
   */
  const rekeyed = new Map<string, Set<string>>();
  /**
   * The scan is skipped when the store offers `aliasStamp` and the stamp equals the one read before this learner's last scan (which found
   * nothing, or finished a rebuild): a stale row can only appear when an alias row is written, and rows the projection writes are keyed by
   * resolved ids. The stamp is read BEFORE scanning, so an alias written during the scan is seen next time. A store without `aliasStamp` scans every time.
   */
  const scannedAt = new Map<string, string>();
  async function rekeyIfAliased(learnerId: string): Promise<{ read: number; seq: number } | undefined> {
    const stamp = store.aliasStamp ? await store.aliasStamp() : undefined;
    if (stamp !== undefined && scannedAt.get(learnerId) === stamp) return undefined;
    const result = await scanForStale(learnerId);
    if (stamp !== undefined) scannedAt.set(learnerId, stamp);
    return result;
  }
  async function scanForStale(learnerId: string): Promise<{ read: number; seq: number } | undefined> {
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

  /**
   * `derivePreferences` uses five kinds and nothing else. Three are read whole (PreferenceChanged, AssistanceRequested, PronunciationPlayed: a learner's own
   * settings and requests). The other two (SelectionLookedUp, AnalysisShown) are the learner's most numerous events and feed only
   *   (a) `updatedAt`, the newest `at` among all five: found by reading them in growing windows that end now until one holds a live event (every event at or
   *       after the window's start is in that read, so the newest of them is there), and
   *   (b) the audio-first rule, which looks at the FIRST help event of each sentence that has an audio event: with no live PronunciationPlayed it cannot count
   *       anything, so nothing more is read; with one, an earlier help event of that sentence could be anywhere in the log (the port cannot filter by sentence), so
   *       those two kinds are read whole, as before.
   * Tombstones are applied to every read exactly as before; the answer is the one the whole log gives.
   */
  async function preferenceEvents(learnerId: string, languageId: string | undefined, tombstones: Awaited<ReturnType<TombstoneStore['listTombstones']>>): Promise<StoredEvent[]> {
    const lang = languageId === undefined ? {} : { languageId };
    const liveOnly = (events: StoredEvent[]): StoredEvent[] => events.filter((e) => !isTombstoned(e, tombstones));
    const own = liveOnly(await readEvents(learnerId, 0, { kinds: PREFERENCE_EVENT_KINDS, ...lang }));
    if (own.some((e) => e.kind === 'PronunciationPlayed')) return [...own, ...liveOnly(await readEvents(learnerId, 0, { kinds: HELP_EVENT_KINDS, ...lang }))];
    const nowMs = Date.parse(now());
    for (const hours of RECENCY_WINDOWS_HOURS) {
      const since = isoOrUndefined(nowMs - hours * HOUR_MS);
      if (since === undefined) break;
      const recent = liveOnly(await readEvents(learnerId, 0, { kinds: HELP_EVENT_KINDS, ...lang, since }));
      if (recent.length) return [...own, ...recent];
    }
    return [...own, ...liveOnly(await readEvents(learnerId, 0, { kinds: HELP_EVENT_KINDS, ...lang }))];
  }

  async function preferences(learnerId: string, languageId?: string): Promise<AssistancePreferences> {
    const tombstones = await store.listTombstones(learnerId);
    const live = await preferenceEvents(learnerId, languageId, tombstones);
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
    const tombstones = await store.listTombstones(learnerId);
    const language = { languageId: enrolment.languageId };
    const atMs = Date.parse(at);
    // Card state reads the deck lifecycle kinds in full (the latest of them per card and dimension decides coverage) and, of the reviews, only `lastReviewAt`
    // for the priorReview rule: a review older than its window cannot raise that rule, so only reviews at or after `at - withinDays` are read.
    const reviewSince = isoOrUndefined(atMs - CANDIDATE_RULES.priorReview.withinDays * DAY_MS);
    const events = [
      ...await readEvents(learnerId, 0, { kinds: DECK_EVENT_KINDS, ...language }),
      ...await readEvents(learnerId, 0, { kinds: ['CardReviewed'], ...language, ...(reviewSince !== undefined ? { since: reviewSince } : {}) }),
    ];
    const cardUnitOf = (e: StoredEvent): string | undefined => !(e.subject?.itemIds ?? []).length && e.subject?.cardId?.startsWith('card:') ? e.subject.cardId.split(':').slice(2).join(':') : undefined;
    const resolve = await resolverFor([...rows.map((r) => r.unitId), ...events.flatMap((e) => [...(e.subject?.itemIds ?? []), ...(cardUnitOf(e) ? [cardUnitOf(e)!] : [])])]);

    // Card state per unit and objective dimension: a written-recognition card does not
    // cover listening or production. Legacy lifecycle events without a dimension retain
    // the old same-target coverage behavior.
    const cards = new Map<string, CardState>();
    const marks = new Map<string, Map<string, { at: string; id: string; covered: boolean; blocked: boolean }>>();
    const objectiveDimension = (value: unknown): import('../../repository-contract/src').Dimension | undefined => ({
      'written-recognition': 'readingRecognition', 'phrase-comprehension': 'phraseComprehension',
      'meaning-recall': 'readingRecognition', 'audio-to-meaning': 'listeningRecognition', 'auditory-recognition': 'listeningRecognition',
      'auditory-transcription': 'listeningRecognition', 'meaning-to-target-retrieval': 'productiveRetrieval', 'meaning-to-form': 'productiveRetrieval',
      'morphological-identification': 'grammaticalUnderstanding', 'morphological-analysis': 'grammaticalUnderstanding',
      'grammar-application': 'grammaticalUnderstanding', 'construction-understanding': 'grammaticalUnderstanding',
      'sentence-completion': 'contextualProduction', 'productive-recall': 'contextualProduction', readingRecognition: 'readingRecognition', listeningRecognition: 'listeningRecognition',
      productiveRetrieval: 'productiveRetrieval', contextualProduction: 'contextualProduction', grammaticalUnderstanding: 'grammaticalUnderstanding',
      phraseComprehension: 'phraseComprehension', assistedRecognition: 'assistedRecognition',
    } as Record<string, import('../../repository-contract/src').Dimension>)[String(value)];
    for (const e of dedupeEvents(events)) {
      if (isTombstoned(e, tombstones)) continue;
      const idsFromSubject = e.subject?.itemIds ?? [];
      const cardUnit = !idsFromSubject.length && e.subject?.cardId?.startsWith('card:')
        ? e.subject.cardId.split(':').slice(2).join(':') : undefined;
      const ids = [...new Set([...idsFromSubject, ...(cardUnit ? [cardUnit] : [])].map(resolve))];
      for (const id of ids) {
        const st = cards.get(id) ?? { covered: false };
        if (e.kind === 'CardReviewed' && (st.lastReviewAt === undefined || compareAt(e.at, st.lastReviewAt) > 0)) st.lastReviewAt = e.at;
        if (e.kind === 'CardAdded' || e.kind === 'CardRemoved' || e.kind === 'ReviewItemInvalidated') {
          const cardDimension = objectiveDimension(e.payload.dimension) ?? objectiveDimension(e.subject.cardId?.slice('card:'.length).split(':', 1)[0]);
          const dimension = cardDimension;
          const reason = String(e.payload.reason ?? '');
          const until = Date.parse(String(e.payload.until ?? ''));
          const blocked = e.kind === 'ReviewItemInvalidated' || e.kind === 'CardRemoved' &&
            (reason === 'suspended' || reason === 'dismissed' || reason === 'snoozed' && Number.isFinite(until) && until > Date.parse(at));
          if (dimension) {
            const byDimension = marks.get(id) ?? new Map();
            const m = byDimension.get(dimension);
            if (!m || compareAt(e.at, m.at) > 0 || (compareAt(e.at, m.at) === 0 && e.id > m.id)) {
              byDimension.set(dimension, { at: e.at, id: e.id, covered: e.kind === 'CardAdded', blocked });
            }
            marks.set(id, byDimension);
          } else {
            const m = marks.get(id)?.get('*');
            if (!m || compareAt(e.at, m.at) > 0 || (compareAt(e.at, m.at) === 0 && e.id > m.id)) {
              const byDimension = marks.get(id) ?? new Map();
              byDimension.set('*', { at: e.at, id: e.id, covered: e.kind === 'CardAdded', blocked });
              marks.set(id, byDimension);
            }
          }
        }
        cards.set(id, st);
      }
    }
    for (const [id, byDimension] of marks) {
      const legacy = byDimension.get('*');
      const coveredDimensions = new Set([...byDimension].filter(([key, mark]) => key !== '*' && mark.covered).map(([key]) => key as import('../../repository-contract/src').Dimension));
      const blockedDimensions = new Set([...byDimension].filter(([key, mark]) => key !== '*' && mark.blocked).map(([key]) => key as import('../../repository-contract/src').Dimension));
      cards.set(id, { ...(cards.get(id) ?? { covered: false }), covered: legacy?.covered ?? false,
        ...(coveredDimensions.size ? { coveredDimensions } : {}), ...(blockedDimensions.size ? { blockedDimensions } : {}), ...(legacy?.blocked ? { blocked: true } : {}) });
    }

    // The units of the rows, in one batch: `common` (frequency) and the form / construction kinds are read from them for every row.
    const units = new Map<string, LinguisticUnit>((await store.getUnits(rows.map((r) => r.unitId))).map((u) => [u.unitId, u]));

    // Constructions realised by forms the learner is in difficulty with (the evidence for grammaticalLeverage). A `realizes` relation runs from a FORM to a
    // construction (contract units.ts RELATION_KINDS), so the lookup is made for rows whose unit is a form, or whose unit is not in the store (then nothing is known).
    const realizedBy = new Map<string, string[]>();
    for (const r of rows) {
      if (!Object.entries(r.dimensions).some(([, e]) => e.negative > 0)) continue;
      const kind = units.get(r.unitId)?.kind;
      if (kind !== undefined && kind !== 'form') continue;
      for (const rel of await store.relationsOf(r.unitId, 'out')) {
        if (rel.relation !== 'realizes' || rel.status === 'invalidated' || rel.status === 'conflicted' || rel.status === 'requires-review') continue;
        (realizedBy.get(rel.toId) ?? realizedBy.set(rel.toId, []).get(rel.toId)!).push(r.unitId);
      }
    }
    const missingUnits = [...realizedBy.keys()].filter((id) => !units.has(id));
    if (missingUnits.length) for (const u of await store.getUnits(missingUnits)) units.set(u.unitId, u);

    // When the learner struggled (lookup, assistance request, failed recognition) with each unit: the construction rule's window reads these. A construction is
    // proposed only when `minFailedForms` DISTINCT forms of it are in difficulty, so with no construction that has that many candidate forms the struggles
    // cannot change the ranking and none are read. Otherwise: the non-review struggle kinds from the window's start (a lookup older than the window is
    // never `within` it), the review kinds whole (a review counts or not by its card's full chain of earlier reviews, corrections and retractions).
    const struggles = new Map<string, string[]>();
    const leverageMayApply = [...realizedBy.values()].some((forms) => new Set(forms).size >= CANDIDATE_RULES.grammaticalLeverage.minFailedForms);
    if (leverageMayApply) {
      const since = isoOrUndefined(atMs - CANDIDATE_RULES.grammaticalLeverage.windowDays * DAY_MS);
      const struggleEvents = [
        ...await readEvents(learnerId, 0, { kinds: REVIEW_EVENT_KINDS, ...language }),
        ...await readEvents(learnerId, 0, { kinds: WINDOWED_STRUGGLE_KINDS, ...language, ...(since !== undefined ? { since } : {}) }),
      ];
      const struggleResolve = await resolverFor([...rows.map((r) => r.unitId), ...struggleEvents.flatMap((e) => e.subject?.itemIds ?? [])]);
      for (const o of observationsFromEvents(struggleEvents, tombstones, struggleResolve)) {
        if (isStruggleObservation(o)) (struggles.get(o.unitId) ?? struggles.set(o.unitId, []).get(o.unitId)!).push(o.at);
      }
    }

    // The pack's mission word list, if its facts expose one (`missionUnitIds`); none today, so the rule is skipped and says so in `opts.notes`.
    const pack = await store.getPack(enrolment.packId);
    const mission = (pack as { missionUnitIds?: unknown } | undefined)?.missionUnitIds;
    const missionUnits = Array.isArray(mission) ? new Set(mission.filter((m): m is string => typeof m === 'string')) : undefined;

    // Analyses are asked for by `rankCandidates` only for the form units it draws or weighs for another objective. Rank with what is loaded, load what it asked
    // for and was not given, and rank again until it asks for nothing new: the last pass was answered by the store for every analysis it used.
    const analyses = new AskedMap<FormAnalysis[]>();
    const loaded = new Set<string>();
    for (;;) {
      analyses.asked.clear();
      const notes: string[] = [];
      const ranked = rankCandidates({
        rows, units, analyses, realizedBy, cards, goals: enrolment.goals, now: at, limit: opts?.limit ?? 20, struggles,
        ...(opts?.objectiveDimensions ? { objectiveDimensions: opts.objectiveDimensions } : {}),
        ...(missionUnits ? { missionUnits } : {}), ...(opts?.includeCovered ? { includeCovered: true } : {}), ...(opts?.notes ? { notes } : {}),
      });
      const missing = [...analyses.asked].filter((id) => !loaded.has(id) && units.get(id)?.kind === 'form');
      if (!missing.length) { opts?.notes?.push(...notes); return ranked; }
      for (const id of missing) { analyses.set(id, await store.analysesOfForm(id)); loaded.add(id); }
    }
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
