/**
 * The GoReview workspace model: everything the dashboard shows, loaded from the local event log, the Repository's
 * candidates (live, or the last list the service sent) and GoListen's availability. Rendering lives in the screens;
 * this file has no DOM, so a test can read the model directly.
 */
import type { GoEvent, ReviewCandidate, UnitKnowledge, SchedulerProfile } from '../../repository-contract/src';
import { effectiveReviewEvents } from '../../repository-contract/src';
import type { VocabularyItem } from '../../repository-service/src/api';
import { createReviewEligibilityContext, reviewEligibility, type ReviewEligibilityContext } from '../src/planner/eligibility';
import { remediationBacklog } from '../src/planner/remediation';
import { eventHead } from './engine';
import { admissionBudget } from '../src/planner/budget';
import type { AudioAvailability, DeckItem, IntakeOutcome, ReviewPreferences, SessionPlan, SessionState } from '../src/types';
import type { AppContext } from './context';
import { candidatesKey, type CandidateChoice } from './state';
import type { ActiveRun, ExerciseReadiness, Identity, SessionDriver } from './ports';
import { activeSchedulerProfile, schedulerProfileSelection } from './profiles';
import { isClassUnit } from './classEssentials';
import { readSnapshot, RECOVERY_SCOPE_VERSION, restoreMissing, writeSnapshot, type ReviewSnapshot } from './snapshot';
import { KNOWABILITY_PRIORITY_POLICY_VERSION } from '../src/planner/priority-policy';
import { orderIntakeByPriority } from '../src/intake/intake';

/** Preparing admission is read-only with respect to progress. CardAdded belongs to
 * the first evidence-bearing answer, not to a dashboard visit or candidate refresh.
 */
async function prepareAdmissions(ctx: AppContext, model: ReviewModel): Promise<ReviewModel> {
  const limit = Math.max(0, model.prefs.maxNew);
  const eligible = (limit > 0 ? model.outcomes : []).filter(o => model.choices[o.unitId] !== 'later' && o.proposed
    && ['test-now', 'test-later', 'low-priority'].includes(o.decision)
    && !model.deck.some(i => i.unitId === o.unitId && (i.invalidatedAt || i.schedulingIssue || i.history.some(h => h.conflict)
      || i.status === 'suspended' || i.status === 'dismissed' || i.dimension === o.proposed?.dimension)));
  const rankedInputs = eligible.map(o => ({ ...o, explicitlySelected: model.saved.has(o.unitId) }));
  const candidates = orderIntakeByPriority(rankedInputs, { prioritizeSaved: model.prefs.prioritizeSaved,
    readingSignals: model.events, languageId: model.identity.languageId, now: model.now }).map(entry => entry.outcome);
  let api: Awaited<ReturnType<AppContext['api']>>['api'] | undefined;
  let readinessIncomplete = false;
  if (candidates.length && !model.provisional) {
    try { api = (await ctx.api()).api; }
    catch { readinessIncomplete = true; }
  }
  const ready = new Set<string>(), unavailable = new Map<string, string>();
  for (const outcome of candidates) {
    if (ready.size >= limit) break;
    // a provisional model is this device's saved deck, whose exercises were checked when it was saved: no service round trip per word (the live
    // model that follows checks again)
    if (model.provisional) { if (outcome.decision === 'test-now') ready.add(outcome.unitId); continue; }
    const proposed = outcome.proposed!;
    if (proposed.family.startsWith('audio-') && (!model.prefs.includeListening || !model.audio.available)) continue; // a computer voice is practice: allowed
    try {
      const request = { unitId: outcome.unitId, unitKind: outcome.candidate.kind, languageId: model.identity.languageId,
        ...(model.prefs.varietyId ? { varietyId: model.prefs.varietyId } : {}), dimension: proposed.dimension, family: proposed.family, api: api!, now: model.now };
      const readiness: ExerciseReadiness = api && ctx.engine.exerciseReadiness ? await ctx.engine.exerciseReadiness(request)
        : { available: !!api && !!ctx.engine.exerciseAvailable && await ctx.engine.exerciseAvailable(request) };
      if (readiness.available) ready.add(outcome.unitId);
      else {
        if (readiness.retryable !== false) readinessIncomplete = true;
        unavailable.set(outcome.unitId, readiness.reason ?? 'No usable exercise could be built for this word yet.');
      }
    } catch (error) {
      readinessIncomplete = true;
      unavailable.set(outcome.unitId, error instanceof Error ? error.message : 'The exercise could not be checked.');
    }
  }
  const notShortlisted = new Set(candidates.filter(o => !ready.has(o.unitId) && !unavailable.has(o.unitId)).map(o => o.unitId));
  const blocked = new Map<string, { decision: IntakeOutcome['decision']; reason: string }>();
  for (const outcome of model.outcomes) {
    if (!outcome.proposed) continue;
    const item = model.deck.find(i => i.unitId === outcome.unitId && (i.dimension === outcome.proposed!.dimension
      || i.invalidatedAt || i.schedulingIssue || i.history.some(h => h.conflict)));
    if (!item) continue;
    const invalid = !!item.invalidatedAt || !!item.schedulingIssue || item.history.some(h => h.conflict);
    blocked.set(outcome.unitId, { decision: invalid ? 'needs-validation' : 'already-covered', reason: invalid
      ? 'Current review history is invalidated or conflicted; verified repair is required before a new exercise.'
      : 'This exercise is already represented in the current deck.' });
  }
  const outcomes = model.outcomes.map(o => blocked.has(o.unitId) ? { ...o, decision: blocked.get(o.unitId)!.decision, proposed: undefined,
    reasons: [blocked.get(o.unitId)!.reason, ...o.reasons] }
    : ready.has(o.unitId) ? { ...o, decision: 'test-now' as const }
    : unavailable.has(o.unitId) ? { ...o, decision: 'needs-validation' as const, proposed: undefined,
      reasons: [`${unavailable.get(o.unitId)} It remains in My vocab.`, ...o.reasons] }
      : o.decision === 'test-now' && notShortlisted.has(o.unitId) ? { ...o, decision: 'test-later' as const,
        reasons: ["Not included in this session's practice group; it remains available for a later session.", ...o.reasons] } : o);
  const prepared = { ...model, outcomes, candidateReadinessIncomplete: readinessIncomplete || model.candidateReadinessIncomplete,
    candidateSnapshotEligible: !!model.candidateSnapshotEligible && !readinessIncomplete,
    candidateNote: [model.candidateNote, unavailable.size
    ? unavailable.size + ' word' + (unavailable.size === 1 ? '' : 's') + ' waiting for a usable exercise.' : undefined].filter(Boolean).join(' ') || undefined };
  if (prepared.candidateSnapshotEligible && prepared.candidates) {
    const objectives = [
      ...(prepared.prefs.practiceGoals?.includes('retrieval') ? ['productiveRetrieval'] : []),
      ...(prepared.prefs.practiceGoals?.includes('application') ? ['grammaticalUnderstanding', 'contextualProduction'] : []),
      ...(prepared.prefs.includeListening && prepared.prefs.practiceGoals?.includes('listening') ? ['listeningRecognition'] : []),
      ...(prepared.prefs.practiceGoals?.includes('recognition') ? ['readingRecognition'] : []),
    ];
    const { learnerId, languageId, enrolmentId, varietyId } = prepared.identity;
    const fetchedAt = prepared.knowledgeStatus.fetchedAt;
    const cacheKey = `${candidatesKey(learnerId, enrolmentId)}:${objectives.join(',')}`;
    const cache: CandidateCache = { version: 1, fetchedAt, priorityPolicyVersion: KNOWABILITY_PRIORITY_POLICY_VERSION, recoveryScopeVersion: RECOVERY_SCOPE_VERSION, enrolmentId, ...(varietyId ? { varietyId } : {}), objectives, candidates: prepared.candidates, knowledge: prepared.knowledge };
    await ctx.deps.area.set({ [cacheKey]: cache }).catch(() => undefined);
    await writeSnapshot(ctx, learnerId, languageId, { model: { savedAt: fetchedAt, contextVersion: 2, priorityPolicyVersion: KNOWABILITY_PRIORITY_POLICY_VERSION, recoveryScopeVersion: RECOVERY_SCOPE_VERSION, enrolmentId,
      ...(varietyId ? { varietyId } : {}), objectives, outcomes, knowledge: prepared.knowledge, candidates: prepared.candidates,
      markEventIds: marksOf(prepared.events).markEventIds } });
  }
  return prepared;
}

export const NO_AUDIO: AudioAvailability = { available: false, eligibleForEvidence: false, reason: 'no audio is available in this browser' };

export interface DeckCounts {
  /** Reviewed items whose schedule says due now. */
  due: number;
  /** Items still in their first steps (learning or relearning). */
  learning: number;
  /** Items in the deck that have never been reviewed. */
  fresh: number;
  suspended: number;
  snoozed: number;
  dismissed: number;
  total: number;
}

export interface KnowledgeStatus {
  /** live: every batch answered; partial: some did not (rows that arrived are kept, a gap may be filled from the last snapshot);
   * cached: the last complete copy stands in for the service; unavailable: nothing could be loaded. */
  source: 'live' | 'partial' | 'cached' | 'unavailable';
  requested: number;
  resolved: number;
  /** Unit ids whose knowledge is unknown (their batch failed and no earlier copy covers them). */
  missing: string[];
  /** ISO time of the data in use (now when live; the snapshot's or cache's time when an earlier copy is used). */
  fetchedAt: string;
  note?: string;
}

export interface WithheldUnit { unitId: string; code: 'knowledge-unresolved'; detail: string }

export interface ReviewModel {
  /** The Class Essentials cards in the deck fold: kept apart from `deck`, so the ordinary queue never meets them. */
  classDeck?: DeckItem[];
  identity: Identity;
  prefs: ReviewPreferences;
  events: GoEvent[];
  deck: DeckItem[];
  counts: DeckCounts;
  audio: AudioAvailability;
  outcomes: IntakeOutcome[];
  knowledge: UnitKnowledge[];
  schedulerProfile?: SchedulerProfile;
  schedulerIssue?: string;
  /** Candidates the learner dismissed (ItemMarked ignore) and so are not proposed. */
  dismissed: string[];
  choices: Record<string, CandidateChoice>;
  saved: Set<string>;
  candidateSource: 'live' | 'cached' | 'none';
  candidates?: ReviewCandidate[];
  /** Internal completion gate: only a complete recovery may replace either durable candidate snapshot. */
  candidateSnapshotEligible?: boolean;
  /** Exercise readiness was transiently uncheckable; preserve the last good snapshot and retry soon. */
  candidateReadinessIncomplete?: boolean;
  candidateNote?: string;
  /** A vocabulary catalogue recovery attempt was incomplete; the home must retry on its next visit. */
  candidateRecoveryIncomplete?: boolean;
  /** Built from this device's last complete prepared deck without asking the service (`loadReviewModel(ctx, { savedOnly: true })`): the home paints it
   * at once and replaces it when the live load arrives. Never written back as a snapshot. */
  provisional?: boolean;
  /** How complete the knowledge behind `knowledge` is: a unit in `missing` has NO row because its batch failed, which is not the same as New. */
  knowledgeStatus: KnowledgeStatus;
  /** Candidates held out of AUTOMATIC new admission because their knowledge could not be loaded (never treated as New). */
  withheld: WithheldUnit[];
  now: string;
  algorithm: string;
  parametersVersion: string;
}

/** The last explicit mark per unit (ItemMarked), so a later 'ignore' or 'known' cancels an earlier 'saved'. */
export function marksOf(events: readonly GoEvent[]): { saved: Set<string>; ignored: Set<string>; known: Set<string>; markEventIds: Record<string, string> } {
  const last = new Map<string, { mark: string; eventId: string }>();
  const sorted = events.filter((e) => e.kind === 'ItemMarked').sort((a, b) => Date.parse(a.at)-Date.parse(b.at) || a.id.localeCompare(b.id));
  for (const e of sorted) {
    const mark = (e.payload as { mark?: string }).mark;
    if (!mark) continue;
    for (const id of e.subject.itemIds ?? []) last.set(id, { mark, eventId: e.id });
  }
  const saved = new Set<string>();
  const ignored = new Set<string>();
  const known = new Set<string>();
  for (const [id, value] of last) { if (value.mark === 'saved') saved.add(id); if (value.mark === 'ignore') ignored.add(id); if (value.mark === 'known' || value.mark === 'automatic') known.add(id); }
  return { saved, ignored, known, markEventIds: Object.fromEntries([...last].map(([id, value]) => [id, value.eventId])) };
}

export function countDeck(deck: DeckItem[], model: { scheduler: { isDue(s: DeckItem['schedule'], now: string): boolean }; now: string }): DeckCounts {
  const c: DeckCounts = { due: 0, learning: 0, fresh: 0, suspended: 0, snoozed: 0, dismissed: 0, total: deck.length };
  for (const i of deck) {
    if (i.status === 'suspended') { c.suspended += 1; continue; }
    if (i.status === 'dismissed') { c.dismissed += 1; continue; }
    if (i.status === 'snoozed') { c.snoozed += 1; continue; }
    if (i.history.length === 0) { c.fresh += 1; continue; }
    if (i.schedule.phase === 'learning' || i.schedule.phase === 'relearning') c.learning += 1;
    if (model.scheduler.isDue(i.schedule, model.now)) c.due += 1;
  }
  return c;
}

/** How many `GET /knowledge` batches one home load asks for at once. */
export const KNOWLEDGE_PARALLEL = 4;
/** How many unit ids one `GET /knowledge` batch carries. */
export const KNOWLEDGE_BATCH = 200;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const utc = (iso: string): string => iso.slice(0, 16).replace('T', ' ') + ' UTC';

interface CandidateCache { version?: 1; fetchedAt: string; priorityPolicyVersion?: string; recoveryScopeVersion?: string; enrolmentId?: string; varietyId?: string; objectives?: string[]; candidates: ReviewCandidate[]; knowledge: UnitKnowledge[] }

/**
 * The home's model. `savedOnly` (2026-11-08: signed in, the home took 20-70 s to open because every visit rebuilt the deck from the service, page by
 * page) builds it from this device's last complete prepared deck and asks the service nothing; it is undefined when there is no such copy. The home
 * paints that at once and then asks for the live one.
 */
/** Between two walks of the vocabulary, at least this long: a home re-entered or refreshed meanwhile reuses the last complete walk. */
export const RECOVERY_SCAN_MIN_INTERVAL_MS = 10 * 60_000;
/** After this long a walk is repeated even if the vocabulary did not grow. */
export const RECOVERY_SCAN_MAX_AGE_MS = 2 * 60 * 60_000;
interface RecoveryScanResult { unresolvedVocabulary: VocabularyItem[]; vocabularyComplete: boolean; fullKnowledge: UnitKnowledge[]; fullKnowledgeRead: boolean; notes: string[]; reused: boolean }
interface RecoveryScanEntry { done?: { at: number; total: number; unresolvedVocabulary: VocabularyItem[]; fullKnowledge: UnitKnowledge[] }; running?: Promise<RecoveryScanResult> }
/** Per app (as refreshEntries), per learner and language: the last COMPLETE walk, and the walk under way. Module-level, so a route change keeps it. */
const recoveryScans = new WeakMap<AppContext, Map<string, RecoveryScanEntry>>();
/** Tests (and a sign-out) forget the walks. */
export const forgetRecoveryScans = (ctx: AppContext): void => { recoveryScans.delete(ctx); };

/**
 * The raw reads the candidate recovery needs: every vocabulary row without a catalogue unit (a walk of the unsorted listing, 100 a page) and the
 * learner's whole knowledge. Costly for the service (about 100 MB of allocation for 3,500 words), so (2026-11-12):
 *   - one walk at a time per learner and language, however often the home is built (a second build waits for the first walk);
 *   - within RECOVERY_SCAN_MIN_INTERVAL_MS of a complete walk, nothing is asked: the last walk is reused;
 *   - after that, one page is asked; if the vocabulary's size (catalog.total) is what the last walk saw, and that walk is younger than
 *     RECOVERY_SCAN_MAX_AGE_MS, it is reused; otherwise the walk continues from that page;
 *   - only a complete walk (every page and the whole knowledge read) is kept, so a failure (a restarting service) never pins a partial result.
 */
async function recoveryScan(ctx: AppContext, api: Awaited<ReturnType<AppContext['api']>>['api'], identity: Identity): Promise<RecoveryScanResult> {
  let byApp = recoveryScans.get(ctx);
  if (!byApp) { byApp = new Map(); recoveryScans.set(ctx, byApp); }
  const key = `${identity.learnerId}|${identity.languageId}`;
  let entry = byApp.get(key);
  if (!entry) { entry = {}; byApp.set(key, entry); }
  if (entry.running) return entry.running;
  const held = entry;
  const run = (async (): Promise<RecoveryScanResult> => {
    const at = ctx.deps.now().getTime();
    const done = held.done;
    const reuse = (): RecoveryScanResult => ({ unresolvedVocabulary: done!.unresolvedVocabulary, vocabularyComplete: true, fullKnowledge: done!.fullKnowledge, fullKnowledgeRead: true, notes: [], reused: true });
    if (done && at - done.at < RECOVERY_SCAN_MIN_INTERVAL_MS) return reuse();
    const notes: string[] = [];
    const unresolvedVocabulary: VocabularyItem[] = [];
    const cursors = new Set<string>();
    let after: string | undefined;
    let vocabularyComplete = false;
    let total = -1;
    try {
      while (true) {
        // unsorted (2026-11-08): this scan reads every row and its order is never used, and a sorted page makes the service read and sort the whole
        // vocabulary again for each page of 100 (a large vocabulary paid for that once per page, on every visit to the home)
        // light, and only the rows with no catalogue unit (2026-11-13): the scan reads nothing else of a row, and a full page made the service read up to
        // 25 events for each of its 100 rows (35 such pages cost it about 100 MB). A service older than that ignores both and answers in full, so the
        // filter below stays
        const page = await api.vocabulary({ languageId: identity.languageId, limit: 100, detail: 'light', catalogued: false, ...(after ? { after } : {}) });
        if (!page.ok) throw new Error(page.message || `the service answered ${page.status}`);
        if (total < 0) {
          total = typeof page.data.catalog?.total === 'number' ? page.data.catalog.total : -1;
          // the vocabulary has not grown since the last complete walk, and that walk is recent enough: the first page was the only cost
          if (done && total >= 0 && total === done.total && at - done.at < RECOVERY_SCAN_MAX_AGE_MS) return reuse();
        }
        unresolvedVocabulary.push(...page.data.items.filter((item) => item.knowledge.languageId === identity.languageId && !item.unit));
        after = page.data.nextCursor;
        if (!after) { vocabularyComplete = true; break; }
        if (cursors.has(after)) throw new Error('the vocabulary service repeated a page cursor');
        cursors.add(after);
      }
    } catch (e) {
      notes.push(`Some ${identity.languageId} vocabulary rows could not be checked for local review (${e instanceof Error ? e.message : 'unknown error'}); the service's candidates remain available.`);
    }

    // The raw vocabulary endpoint carries the original UnitKnowledge rows even when
    // its optional catalogue unit is absent. The full knowledge read is authoritative
    // where present; vocabulary rows fill any gaps without crossing language scopes.
    let fullKnowledge: UnitKnowledge[] = [];
    let fullKnowledgeRead = false;
    try {
      const result = await api.knowledge();
      if (!result.ok) throw new Error(result.message || `the service answered ${result.status}`);
      fullKnowledge = result.data.knowledge.filter((row) => row.languageId === identity.languageId && typeof row.unitId === 'string');
      fullKnowledgeRead = true;
    } catch (e) {
      notes.push(`${identity.languageId} learning history could not be fully refreshed (${e instanceof Error ? e.message : 'unknown error'}); local candidates are based only on rows that loaded.`);
    }
    if (vocabularyComplete && fullKnowledgeRead && total >= 0) held.done = { at, total, unresolvedVocabulary, fullKnowledge };
    return { unresolvedVocabulary, vocabularyComplete, fullKnowledge, fullKnowledgeRead, notes, reused: false };
  })();
  held.running = run;
  try { return await run; } finally { held.running = undefined; }
}

async function buildReviewModel(ctx: AppContext, opts: { savedOnly?: boolean } = {}): Promise<ReviewModel | undefined> {
  const identity = await ctx.identity();
  if (!identity) return undefined;
  const { deps, state, engine } = ctx;
  const now = deps.now().toISOString();
  await restoreMissing(ctx, identity.learnerId, identity.languageId);
  const prefs = await state.getPrefs(identity.learnerId, identity.languageId);
  const events = await ctx.events(identity.languageId);
  const profileSelection = schedulerProfileSelection(events);
  const schedulerProfile = profileSelection.profile;
  const scheduler = engine.scheduler(prefs, schedulerProfile);
  const wholeDeck = engine.foldDeck(events, identity.languageId, prefs, now);
  const deck = wholeDeck.filter((i) => !isClassUnit(i.unitId));
  const classDeck = wholeDeck.filter((i) => isClassUnit(i.unitId));
  const counts = countDeck(deck, { scheduler, now });
  const { saved, ignored, known, markEventIds } = marksOf(events);

  const audioDeps = await ctx.audio();
  let audio: AudioAvailability = NO_AUDIO;
  if (audioDeps) { try { audio = await audioDeps.availability(identity.languageId); } catch { audio = { ...NO_AUDIO, reason: 'audio availability could not be determined' }; } }

  // candidates: live when the service (or, with no account, the device's own Repository) answers, else the last list it sent
  let candidates: ReviewCandidate[] = [];
  let knowledge: UnitKnowledge[] = [];
  let candidateSource: ReviewModel['candidateSource'] = 'none';
  let candidateNote: string | undefined;
  let candidateApi: Awaited<ReturnType<AppContext['api']>>['api'] | undefined;
  let cachedPreparedModel: NonNullable<ReviewSnapshot['model']> | undefined;
  let recoveryIncomplete = false;
  const recoveryNotes: string[] = [];
  let requestedUnitIds: string[] = [];
  let knowledgeStatus: KnowledgeStatus = { source: 'unavailable', requested: 0, resolved: 0, missing: [], fetchedAt: now };
  /** Units whose knowledge batch failed and that no earlier copy covers. */
  const missing = new Set<string>();
  let knowledgeNote: string | undefined;
  /** True only when every knowledge batch of a live load answered: the one case that may replace the last complete snapshot. */
  let knowledgeComplete = false;
  const objectives = [
    ...(prefs.practiceGoals?.includes('retrieval') ? ['productiveRetrieval' as const] : []),
    ...(prefs.practiceGoals?.includes('application') ? ['grammaticalUnderstanding' as const, 'contextualProduction' as const] : []),
    ...(prefs.includeListening && prefs.practiceGoals?.includes('listening') ? ['listeningRecognition' as const] : []),
    ...(prefs.practiceGoals?.includes('recognition') ? ['readingRecognition' as const] : []),
  ];
  const snapshotMatches = (snapshot: ReviewSnapshot['model']): snapshot is NonNullable<ReviewSnapshot['model']> & { candidates: ReviewCandidate[] } => !!snapshot
    && snapshot.contextVersion === 2 && snapshot.priorityPolicyVersion === KNOWABILITY_PRIORITY_POLICY_VERSION
    && snapshot.recoveryScopeVersion === RECOVERY_SCOPE_VERSION && snapshot.enrolmentId === identity.enrolmentId
    && snapshot.varietyId === identity.varietyId && snapshot.objectives?.join(',') === objectives.join(',') && Array.isArray(snapshot.candidates);
  const cacheKey = `${candidatesKey(identity.learnerId, identity.enrolmentId)}:${objectives.join(',')}`;
  if (opts.savedOnly) {
    const snapModel = (await readSnapshot(ctx, identity.learnerId, identity.languageId).catch(() => undefined))?.model;
    if (!snapshotMatches(snapModel) || !snapModel) return undefined;
    candidates = snapModel.candidates; knowledge = snapModel.knowledge; candidateSource = 'cached';
    cachedPreparedModel = snapModel;
    knowledgeStatus = { source: 'cached', requested: knowledge.length, resolved: knowledge.length, missing: [], fetchedAt: snapModel.savedAt };
  } else try {
    const { api } = await ctx.api();
    candidateApi = api;
    if ((await ctx.mode()) === 'none') throw new Error('not signed in');
    const fetchedCandidates: ReviewCandidate[] = [];
    let cursor: string | undefined;
    const cursors = new Set<string>();
    do {
      const c = await api.candidates(identity.enrolmentId, 200, cursor, objectives);
      if (!c.ok) throw new Error(c.message || `the service answered ${c.status}`);
      fetchedCandidates.push(...c.data.candidates.filter((x) => !isClassUnit(x.unitId)));
      cursor = c.data.nextCursor;
      if (cursor && cursors.has(cursor)) throw new Error('The candidate service repeated a page cursor.');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    // A page sequence is one logical read. A later failure must never leak the
    // prefix as though it were a complete candidate universe.
    candidates = fetchedCandidates;
    const unitIds = [...new Set([...candidates.map((x) => x.unitId), ...deck.map((x) => x.unitId)])];
    requestedUnitIds = unitIds;
    // the knowledge batches are independent of one another: ask for them together (four at a time) instead of one after another.
    // A batch that fails (an HTTP error, a timeout, a thrown network error) is recorded, never silently dropped and never fatal.
    const batches: string[][] = [];
    for (let offset = 0; offset < unitIds.length; offset += KNOWLEDGE_BATCH) batches.push(unitIds.slice(offset, offset + KNOWLEDGE_BATCH));
    const rows = new Map<string, UnitKnowledge>();
    const failedIds = new Set<string>();
    const failures: string[] = [];
    for (let i = 0; i < batches.length; i += KNOWLEDGE_PARALLEL) {
      const group = batches.slice(i, i + KNOWLEDGE_PARALLEL);
      const answers = await Promise.allSettled(group.map(async (ids) => api.knowledge(ids)));
      answers.forEach((answer, n) => {
        if (answer.status === 'fulfilled' && answer.value.ok) { for (const k of answer.value.data.knowledge) rows.set(k.unitId, k); return; }
        for (const id of group[n]) failedIds.add(id);
        failures.push(answer.status === 'fulfilled'
          ? `the service answered ${answer.value.status}`
          : `the request failed (${answer.reason instanceof Error ? answer.reason.message : 'unknown error'})`);
      });
    }
    knowledge = [...rows.values()];
    candidateSource = 'live';
    if (!failedIds.size) {
      knowledgeComplete = true;
      knowledgeStatus = { source: 'live', requested: unitIds.length, resolved: unitIds.length, missing: [], fetchedAt: now };
    } else {
      // Some batches failed: keep what arrived, fill the gap from the last complete snapshot where it covers a unit, and
      // report the rest. The candidate cache and the snapshot (the last complete copies) are NOT overwritten by a partial load.
      const snapModel = (await readSnapshot(ctx, identity.learnerId, identity.languageId))?.model;
      const earlier = new Map((snapshotMatches(snapModel) ? snapModel.knowledge : []).map((k) => [k.unitId, k]));
      let filled = 0;
      for (const id of failedIds) {
        if (rows.has(id)) continue;
        const row = earlier.get(id);
        if (row) { knowledge.push(row); filled += 1; } else missing.add(id);
      }
      const reason = failures[0] + (failures.length > 1 ? ` and ${plural(failures.length - 1, 'other failure', 'other failures')}` : '')
        + ` for ${failures.length === 1 ? 'one batch' : plural(failures.length, 'batch', 'batches')}`;
      const nothing = !rows.size && !filled && unitIds.length > 0;
      knowledgeStatus = { source: nothing ? 'unavailable' : 'partial', requested: unitIds.length, resolved: unitIds.length - missing.size, missing: [...missing],
        fetchedAt: filled && snapModel ? snapModel.savedAt : now };
      knowledgeNote = (missing.size
        ? `Knowledge for ${plural(missing.size, 'word', 'words')} could not be loaded (${reason}); their new admissions are withheld until it loads.`
        : '')
        + (filled && snapModel ? `${missing.size ? ' ' : ''}Knowledge for ${plural(filled, 'word', 'words')} could not be refreshed (${reason}); this device's copy of ${utc(snapModel.savedAt)} is used for ${filled === 1 ? 'it' : 'them'}.` : '');
      knowledgeStatus.note = knowledgeNote;
    }
  } catch (e) {
    const cached = (await deps.area.get(cacheKey))[cacheKey] as CandidateCache | undefined;
    const snapModel = (await readSnapshot(ctx, identity.learnerId, identity.languageId))?.model;
    if (snapshotMatches(snapModel) && snapModel) {
      candidates = snapModel.candidates; knowledge = snapModel.knowledge; candidateSource = 'cached';
      cachedPreparedModel = snapModel;
      knowledgeStatus = { source: 'cached', requested: knowledge.length, resolved: knowledge.length, missing: [], fetchedAt: snapModel.savedAt };
      candidateNote = `The service could not be reached (${e instanceof Error ? e.message : 'unknown error'}); these candidates are from ${snapModel.savedAt.slice(0, 16).replace('T', ' ')} UTC.`;
    } else if (cached?.version === 1 && cached.priorityPolicyVersion === KNOWABILITY_PRIORITY_POLICY_VERSION && cached.recoveryScopeVersion === RECOVERY_SCOPE_VERSION && cached.enrolmentId === identity.enrolmentId && cached.varietyId === identity.varietyId
      && cached.objectives?.join(',') === objectives.join(',') && Array.isArray(cached.candidates)) {
      candidates = cached.candidates; knowledge = cached.knowledge ?? []; candidateSource = 'cached';
      // the cache is written only after a complete live load, so its knowledge stands for every unit it listed
      const cachedUnits = new Set([...candidates.map((x) => x.unitId), ...deck.map((x) => x.unitId)]);
      knowledgeStatus = { source: 'cached', requested: cachedUnits.size, resolved: cachedUnits.size, missing: [], fetchedAt: cached.fetchedAt };
      candidateNote = `The service could not be reached (${e instanceof Error ? e.message : 'unknown error'}); these candidates are from ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC.`;
    } else {
      candidateNote = `Candidates could not be fetched (${e instanceof Error ? e.message : 'unknown error'}). The deck below still works offline.`;
    }
  }

  // Event-derived words can be absent from the linguistic catalogue and therefore
  // from its capped candidate response. Ask the generic recovery port to inspect the
  // raw vocabulary for any language whose installed engine has a pack provider.
  if (candidateSource === 'live' && candidateApi && ctx.engine.recoverCandidates
    && ctx.engine.canRecoverCandidates?.(identity.languageId, candidateApi) === true) {
    // one walk of the vocabulary and one read of the whole knowledge, reused while the vocabulary has not grown (recoveryScan below): an open home
    // re-ran both on every live update and after every service restart, and each run took the service about 100 MB (2026-11-12: Render's 512 MB
    // instance ran out of memory after each walk, restarted, and was walked again)
    const scan = await recoveryScan(ctx, candidateApi, identity);
    const { unresolvedVocabulary, vocabularyComplete, fullKnowledge, fullKnowledgeRead } = scan;
    if (scan.notes.length) { recoveryIncomplete = true; recoveryNotes.push(...scan.notes); }
    const byKnowledge = new Map(knowledge.filter((row) => row.languageId === identity.languageId && typeof row.unitId === 'string').map((row) => [row.unitId, row]));
    // a reused read is older than the rows this build just fetched: it only fills gaps, it never overrides them
    for (const row of fullKnowledge) if (!scan.reused || !byKnowledge.has(row.unitId)) byKnowledge.set(row.unitId, row);
    for (const item of unresolvedVocabulary) if (!byKnowledge.has(item.knowledge.unitId)) byKnowledge.set(item.knowledge.unitId, item.knowledge);
    knowledge = [...byKnowledge.values()];
    const unresolvedIds = new Set(unresolvedVocabulary.map((item) => item.knowledge.unitId));
    for (const unitId of missing) if (byKnowledge.has(unitId)) missing.delete(unitId);
    const missingAfterFullRead = [...missing].filter((unitId) => !byKnowledge.has(unitId));
    const knowledgeSource: KnowledgeStatus['source'] = vocabularyComplete && fullKnowledgeRead && missingAfterFullRead.length === 0
      ? 'live' : !knowledge.length && requestedUnitIds.length > 0 ? 'unavailable' : 'partial';
    if (fullKnowledgeRead && missingAfterFullRead.length === 0) knowledgeComplete = true;
    knowledgeStatus = {
      ...knowledgeStatus,
      source: knowledgeSource,
      requested: Math.max(knowledgeStatus.requested, unresolvedIds.size, knowledge.length),
      resolved: Math.max(knowledgeStatus.resolved, knowledge.length),
      fetchedAt: now,
      missing: missingAfterFullRead,
    };
    if (fullKnowledgeRead && missingAfterFullRead.length === 0) {
      knowledgeNote = undefined;
      knowledgeStatus.note = undefined;
    }
    if (vocabularyComplete && fullKnowledgeRead) {
      try {
        const recovery = await ctx.engine.recoverCandidates({
          api: candidateApi, enrolmentId: identity.enrolmentId, languageId: identity.languageId,
          ...(identity.varietyId ? { varietyId: identity.varietyId } : {}), prefs, events, deck, knowledge,
          unresolvedVocabulary, existingCandidates: candidates, now,
        });
        if (!recovery.complete) {
          recoveryIncomplete = true;
          if (recovery.note) recoveryNotes.push(recovery.note);
        }
        const recovered = recovery.candidates;
        if (recovered.length) {
          const recoveredById = new Map(recovered.map((candidate) => [candidate.unitId, candidate]));
          candidates = candidates.map((candidate) => recoveredById.get(candidate.unitId) ?? candidate);
          const knownIds = new Set(candidates.map((candidate) => candidate.unitId));
          candidates.push(...recovered.filter((candidate) => !knownIds.has(candidate.unitId)));
        }
      } catch (e) {
        recoveryIncomplete = true;
        recoveryNotes.push(`Local ${identity.languageId} review candidates could not be checked (${e instanceof Error ? e.message : 'unknown error'}); the service's candidates remain available.`);
      }
    } else recoveryIncomplete = true;
  }

  // A completed candidate page is not enough to publish a partial recovery. If
  // vocabulary scanning, full knowledge, or pack recovery was incomplete, prefer
  // the last compatible prepared universe as a whole and keep the partial status.
  if (candidateSource === 'live' && recoveryIncomplete) {
    const previous = (await readSnapshot(ctx, identity.learnerId, identity.languageId))?.model;
    if (snapshotMatches(previous)) {
      cachedPreparedModel = previous;
      candidates = previous.candidates;
      knowledge = previous.knowledge;
      candidateSource = 'cached';
      knowledgeStatus = { source: 'partial', requested: Math.max(knowledgeStatus.requested, knowledge.length), resolved: knowledge.length,
        missing: [], fetchedAt: previous.savedAt, note: 'The latest vocabulary refresh was incomplete; the last complete word data is shown.' };
      candidateNote = `The latest vocabulary refresh was incomplete; using saved word data from ${previous.savedAt.slice(0, 16).replace('T', ' ')} UTC.`;
    }
  }
  if (candidateSource === 'cached' && recoveryIncomplete && cachedPreparedModel) {
    for (let i = 0; i < recoveryNotes.length; i++) {
      recoveryNotes[i] = recoveryNotes[i]!
        .replace(/the service's candidates remain available\./g, 'the last complete saved word data is shown.')
        .replace(/local candidates are based only on rows that loaded\./g, 'the last complete saved word data is shown.');
    }
  }

  let outcomes: IntakeOutcome[] = [];
  let intakeFailed = false;
  if (candidateSource === 'cached' && cachedPreparedModel) outcomes = cachedPreparedModel.outcomes;
  else if (candidates.some((c) => !ignored.has(c.unitId))) {
    const proposed = candidates.filter((c) => !ignored.has(c.unitId));
    try { outcomes = await engine.intake({ api: (await ctx.api()).api, candidates: proposed, knowledge, deck, saved, prefs, audio, now, events }); }
    catch (e) { intakeFailed = true; candidateNote = `Intake failed (${e instanceof Error ? e.message : 'unknown error'}).`; }
  }
  // Offline the service cannot answer for intake: the outcomes of the last successful load stand in (minus what the deck has taken since).
  const choices = await state.getChoices(identity.learnerId);
  if (candidateSource === 'live' && !intakeFailed) {
    // The prepared model is persisted after admission readiness is established below.
  } else if (candidateSource === 'cached' || !outcomes.length || intakeFailed) {
    const snap = (await readSnapshot(ctx, identity.learnerId, identity.languageId))?.model;
    if (cachedPreparedModel || snapshotMatches(snap)) {
      const preparedModel = cachedPreparedModel ?? snap!;
      const held = new Set(deck.filter((i) => i.status !== 'dismissed').map((i) => `${i.unitId}|${i.dimension}`));
      const goals = prefs.practiceGoals;
      const changedKnownMarks = new Set([...known].filter(unitId => !!markEventIds[unitId] && markEventIds[unitId] !== preparedModel.markEventIds?.[unitId]));
      const stillSelected = (family: string): boolean => !goals || (
        family === 'meaning-to-form' ? goals.includes('retrieval') :
        family === 'morphological-identification' || family === 'grammar-application' || family === 'sentence-completion' ? goals.includes('application') :
        family === 'audio-to-meaning' || family === 'audio-transcription' ? goals.includes('listening') && prefs.includeListening :
        ['written-recognition', 'phrase-comprehension'].includes(family) ? goals.includes('recognition') : true
      );
      outcomes = preparedModel.outcomes.map(o => ({ ...o, explicitlySelected: saved.has(o.unitId) })).filter((o) => !ignored.has(o.unitId)
        && (!changedKnownMarks.has(o.unitId) || o.explicitlySelected) && choices[o.unitId] !== 'later'
        && !(o.proposed && deck.some(i => i.unitId === o.unitId && (i.invalidatedAt || i.schedulingIssue || i.history.some(h => h.conflict)
          || i.status === 'suspended' || i.status === 'dismissed' || i.dimension === o.proposed!.dimension)))
        && !(o.proposed && held.has(`${o.unitId}|${o.proposed.dimension}`))
        && (!o.proposed || o.explicitlySelected || stillSelected(o.proposed.family)));
      if (!knowledge.length) { knowledge = preparedModel.knowledge; knowledgeStatus = { source: 'cached', requested: preparedModel.knowledge.length, resolved: preparedModel.knowledge.length, missing: [], fetchedAt: preparedModel.savedAt }; }
      candidateNote ??= `The service could not be reached; the proposals are from this device's copy of ${preparedModel.savedAt.slice(0, 16).replace('T', ' ')} UTC.`;
    }
  }
  // A unit whose knowledge could not be loaded is not New: it is held out of automatic admission, with a stable code and an
  // explanation. Explicitly selected work and scheduled (due) deck cards need no knowledge row and are untouched.
  const withheld: WithheldUnit[] = [];
  if (missing.size) {
    outcomes = outcomes.filter((o) => {
      if (!missing.has(o.unitId) || o.explicitlySelected) return true;
      withheld.push({ unitId: o.unitId, code: 'knowledge-unresolved',
        detail: 'Its knowledge could not be loaded, so it is not treated as new; it can be admitted automatically once the service answers.' });
      return false;
    });
    knowledgeNote = knowledgeNote?.replace('their new admissions are withheld', withheld.length
      ? `${plural(withheld.length, 'new admission is', 'new admissions are')} withheld` : 'no new admission is affected');
    knowledgeStatus.note = knowledgeNote;
  }
  if (knowledgeNote) candidateNote = [candidateNote, knowledgeNote].filter(Boolean).join(' ');
  if (recoveryNotes.length) candidateNote = [candidateNote, ...recoveryNotes].filter(Boolean).join(' ');
  const base: ReviewModel = {
    identity, prefs, events, deck, classDeck, counts, audio, outcomes, knowledge, candidates, candidateSnapshotEligible: candidateSource === 'live' && knowledgeComplete && !recoveryIncomplete && !intakeFailed,
    schedulerProfile, schedulerIssue: profileSelection.error, dismissed: [...ignored], choices, saved, candidateSource, knowledgeStatus, withheld,
    ...(recoveryIncomplete ? { candidateRecoveryIncomplete: true } : {}),
    ...(candidateNote && !opts.savedOnly ? { candidateNote } : {}), now, algorithm: scheduler.algorithm, parametersVersion: scheduler.parametersVersion,
    ...(opts.savedOnly ? { provisional: true } : {}),
  };
  return prepareAdmissions(ctx, base);
}

// ───────────────────────────── the local-first accessor (2026-11-10) ─────────────────────────────
//
// The rule: no screen and no press awaits the network when this device holds a usable local copy. The service only refreshes that copy in the
// background; when a refresh lands with something different, every open screen is told once (ctx.notifyData) and repaints. A press may wait for a
// refresh that is already running for at most PRESS_WAIT_MS, then goes on with local data.

/** The longest a press waits for a refresh that is already running. */
export const PRESS_WAIT_MS = 1_500;
/** The longest a caller waits for a refresh (the work itself may finish later and still writes its snapshot). */
export const REFRESH_DEADLINE_MS = 45_000;
/** A refresh is not started again sooner than this unless forced, the local log changed, or the last one failed. */
export const REFRESH_MIN_INTERVAL_MS = 60_000;
/** The live values; a test shortens them. */
export const reviewTiming = { pressWaitMs: PRESS_WAIT_MS, refreshDeadlineMs: REFRESH_DEADLINE_MS, minIntervalMs: REFRESH_MIN_INTERVAL_MS };

interface RefreshEntry {
  flight?: { promise: Promise<ReviewModel | undefined>; events: string };
  startedAt: number;
  ok: boolean;
  /** Event signature of the last completed refresh. */
  events?: string;
  /** The last completed live model (also an incomplete one: it carries the notes a screen shows). */
  last?: ReviewModel;
  /** The last model handed out was this device's saved copy: the refresh that completes next is announced even when nothing differs. */
  servedProvisional: boolean;
  servedSig?: string;
  revision: number;
}
const refreshEntries = new WeakMap<AppContext, Map<string, RefreshEntry>>();
const entryFor = (ctx: AppContext, id: Identity): RefreshEntry => {
  const map = refreshEntries.get(ctx) ?? new Map<string, RefreshEntry>();
  refreshEntries.set(ctx, map);
  const key = `${id.learnerId}|${id.enrolmentId}|${id.varietyId ?? ''}`;
  let entry = map.get(key);
  if (!entry) { entry = { startedAt: -Infinity, ok: false, servedProvisional: false, revision: 0 }; map.set(key, entry); }
  return entry;
};
/** Forgets what the accessor remembers for one app instance (a test that swaps the Repository under the app). */
export const forgetReviewModels = (ctx: AppContext): void => { refreshEntries.delete(ctx); };
/** Resolves once no refresh is running for the current learner (what it found has been announced to the open screens). */
export async function refreshIdle(ctx: AppContext): Promise<void> {
  const id = await ctx.identity();
  if (id) await entryFor(ctx, id).flight?.promise.catch(() => undefined);
}
/** Counts the refreshes that changed what a screen would show; a screen compares it with the number it painted at. */
export function reviewModelRevision(ctx: AppContext, id: Identity): number { return entryFor(ctx, id).revision; }

/** What a model is folded from: the local log (its length and last event) and the saved preferences. */
const eventsSig = async (ctx: AppContext, id: Identity): Promise<string> => {
  const [e, prefs] = await Promise.all([ctx.events(id.languageId), ctx.state.getPrefs(id.learnerId, id.languageId)]);
  return `${e.length}|${e.at(-1)?.id ?? ''}|${JSON.stringify(prefs)}`;
};
/** What a screen would show of a model; a provisional model counts as the live one it stands in for. */
function modelSig(m: ReviewModel): string {
  return JSON.stringify([m.events.length, m.events.at(-1)?.id ?? '', m.counts, m.provisional ? 'live' : m.candidateSource, m.provisional ? 'live' : m.knowledgeStatus.source,
    m.candidateReadinessIncomplete ?? false, !!m.candidateRecoveryIncomplete, m.withheld.length, m.deck.length, m.classDeck?.length ?? 0,
    m.outcomes.map((o) => `${o.unitId}|${o.decision}|${o.proposed?.family ?? ''}|${o.proposed?.dimension ?? ''}`)]);
}
const completeRefresh = (m: ReviewModel | undefined): boolean => !!m && !m.provisional && m.candidateSource === 'live' && m.knowledgeStatus.source === 'live'
  && !m.candidateReadinessIncomplete && !m.candidateRecoveryIncomplete;

/** `work`, or `fallback()` once `ms` have passed (the work itself is not stopped). */
async function within<T>(ctx: AppContext, ms: number, work: Promise<T>, fallback: () => Promise<T> | T): Promise<T> {
  let timer: number | undefined;
  const late = new Promise<T>((resolve, reject) => {
    timer = ctx.deps.win.setTimeout(() => { Promise.resolve().then(fallback).then(resolve, reject); }, ms) as unknown as number;
  });
  try { return await Promise.race([work, late]); } finally { if (timer !== undefined) ctx.deps.win.clearTimeout(timer); }
}

/**
 * The live load, single-flight per learner and enrolment. Concurrent callers share one promise; it is not started again within
 * REFRESH_MIN_INTERVAL_MS unless `force`, the local event log changed, or the last one failed or was incomplete. The caller waits at most
 * REFRESH_DEADLINE_MS and then gets what the device holds (the work goes on and still writes its snapshot, and the open screens are told when it lands).
 * Resolves to undefined when there is no learner, or nothing is held and the load failed.
 */
export async function refreshReviewModel(ctx: AppContext, opts: { force?: boolean } = {}): Promise<ReviewModel | undefined> {
  const id = await ctx.identity();
  if (!id) return undefined;
  const entry = entryFor(ctx, id);
  const fallback = async (): Promise<ReviewModel | undefined> => entry.last ?? await buildReviewModel(ctx, { savedOnly: true }).catch(() => undefined);
  const run = async (): Promise<ReviewModel | undefined> => {
    for (let round = 0; round < 3; round++) {
      const sig = await eventsSig(ctx, id);
      const now = ctx.deps.now().getTime();
      if (entry.flight) {
        // a load that started on an older log (or older preferences) does not answer for the log as it stands now: it is waited out, then replaced
        if (entry.flight.events !== sig) { await entry.flight.promise.catch(() => undefined); continue; }
        return entry.flight.promise;
      }
      const gap = entry.ok ? reviewTiming.minIntervalMs : 0; // a failed or incomplete refresh is tried again at the next ask (single-flight keeps it to one at a time)
      const due = !!opts.force || !entry.last || entry.events !== sig || now - entry.startedAt >= gap;
      if (!due) return entry.last;
      entry.startedAt = now;
      const promise: Promise<ReviewModel | undefined> = (async (): Promise<ReviewModel | undefined> => {
        let model: ReviewModel | undefined;
        try { model = await buildReviewModel(ctx); } catch { model = undefined; }
        entry.ok = completeRefresh(model);
        if (model) {
          entry.last = model; entry.events = sig;
          const shown = modelSig(model);
          const changed = entry.servedProvisional || entry.servedSig !== shown;
          entry.servedSig = shown; entry.servedProvisional = false;
          if (changed) { entry.revision += 1; try { ctx.notifyData(); } catch { /* a screen's repaint must not break the refresh */ } }
        }
        return model;
      })().finally(() => { if (entry.flight?.promise === promise) entry.flight = undefined; });
      entry.flight = { promise, events: sig };
      return promise;
    }
    return entry.flight?.promise ?? entry.last;
  };
  return within(ctx, reviewTiming.refreshDeadlineMs, run(), fallback);
}

/**
 * The model to paint or plan from, without waiting for the network when this device holds one: the last live model of this same log (folded
 * recently), else the model built from this device's last complete snapshot and the local log. The live refresh runs in the background (not
 * awaited). With `waitMs` a refresh that is running is waited for up to that long, and its model is returned if it arrived. When the device holds
 * nothing it waits for the refresh (at most REFRESH_DEADLINE_MS), unless `fallback` (a model the caller already has) is given.
 */
export async function currentReviewModel(ctx: AppContext, opts: { waitMs?: number; fallback?: ReviewModel; noRefresh?: boolean } = {}): Promise<ReviewModel | undefined> {
  const id = await ctx.identity();
  if (!id) return undefined;
  const entry = entryFor(ctx, id);
  let local: ReviewModel | undefined;
  const last = entry.last;
  if (last && !last.provisional) {
    const sig = await eventsSig(ctx, id);
    const now = ctx.deps.now().getTime(), then = Date.parse(last.now);
    // the other local stores a model reads besides the log and the preferences: the learner's per-word choices (Later)
    const choices = await ctx.state.getChoices(id.learnerId);
    const moved = [...last.deck, ...(last.classDeck ?? [])].some((i) => i.status === 'active' && Date.parse(i.schedule.due) > then && Date.parse(i.schedule.due) <= now);
    // a choice made since (Later) changes nothing the live load found: the same model with the choices as they stand now
    if (entry.events === sig && now >= then && now - then <= 5 * 60_000 && !moved) local = JSON.stringify(choices) === JSON.stringify(last.choices) ? last : { ...last, choices };
  }
  local ??= await buildReviewModel(ctx, { savedOnly: true }).catch(() => undefined);
  if (local) {
    if (local.provisional) { entry.servedProvisional = true; entry.servedSig = modelSig(local); }
    if (opts.noRefresh) return local;
    const refresh = refreshReviewModel(ctx).catch(() => undefined);
    if (opts.waitMs) {
      const live = await within(ctx, opts.waitMs, refresh, () => undefined);
      if (live && !live.provisional) return live;
    }
    return local;
  }
  const refresh = refreshReviewModel(ctx);
  if (!opts.fallback) return refresh;
  const given = opts.fallback;
  return within(ctx, opts.waitMs ?? 0, refresh.then((m) => m ?? given), () => given);
}

/**
 * The home's model as a full live load (or, with `savedOnly`, this device's last complete snapshot and no service call). A live load goes through the
 * single-flight: two concurrent ones never run, and one that started before the log changed is waited out and replaced. For a screen, prefer
 * `currentReviewModel`; this stays for a caller that needs the live answer itself (the developer page, the tests).
 */
export async function loadReviewModel(ctx: AppContext, opts: { savedOnly?: boolean } = {}): Promise<ReviewModel | undefined> {
  if (opts.savedOnly) return buildReviewModel(ctx, opts);
  return refreshReviewModel(ctx, { force: true });
}

// ───────────────────────────── starting a session ─────────────────────────────

export type StartResult =
  | { ok: true; run: ActiveRun }
  | { ok: false; message: string };

/** Robust recent duration estimates; idle, assisted and reversed grades are excluded. */
export function observedReviewSeconds(events: readonly GoEvent[]): Record<string, number> {
  const samples = new Map<string, number[]>();
  for (const event of effectiveReviewEvents([...events]).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))) {
    const seconds = event.payload.reviewSeconds;
    if (!event.subject.cardId || event.correctionOf || event.payload.rating == null
      || event.evidence?.assisted || event.payload.hinted || typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0 || seconds > 900) continue;
    const values = samples.get(event.subject.cardId) ?? [];
    values.push(seconds); samples.set(event.subject.cardId, values.slice(-10));
  }
  return Object.fromEntries([...samples].map(([id, values]) => {
    values.sort((a, b) => a - b);
    return [id, Math.max(5, values[Math.floor(values.length / 2)])];
  }));
}

/** Learner-scoped resumable state; this is not a second vocabulary store. */
export async function recoverableSessions(ctx: AppContext): Promise<SessionState[]> {
  const [data, identity] = await Promise.all([ctx.data(), ctx.identity()]);
  if (!data || !identity) return [];
  const keys = await data.area.list('goreview:session:');
  const rows = keys.length ? await data.area.get(keys) : {};
  return Object.values(rows).filter((value): value is SessionState => {
    const s = value as SessionState | undefined;
    return !!s && s.status === 'in-progress' && s.plan?.languageId === identity.languageId
      && typeof s.sessionId === 'string' && Array.isArray(s.results)
      && Number.isInteger(s.index) && s.index >= 0 && s.index <= s.plan.items.length;
  }).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Recheck the shared policy against the newest local replica before presentation
 * and before recording. A stale saved plan is never authority over learner controls.
 */
function presentationGuard(ctx: AppContext, model: Pick<ReviewModel, 'identity' | 'knowledge'> & { events?: GoEvent[] }) {
  const currentKnowledge = new Map(model.knowledge.map(k => [k.unitId,k]));
  const revisions = new Map<string,string>();
  const knowledgeKinds = new Set(['EncounterRecorded','SelectionLookedUp','AnalysisShown','AssistanceRequested','ItemMarked','CardReviewed','AssessmentAnswered','ListeningAssessed']);
  const revision = (events: GoEvent[], unitId: string) => events.filter(e => knowledgeKinds.has(e.kind) && e.subject.itemIds?.includes(unitId)).map(e => e.id).sort().join('|');
  // One set of evidence indexes per event head (the log's signature): a decision per card used to sort and re-read the whole log. Only the latest head is kept.
  let shared: { head: string; base: ReviewEligibilityContext } | undefined;
  return async (planned: import('../src/types').PlannedItem, at: string): Promise<{ eligible: boolean; reason?: string }> => {
    const [events, prefs] = await Promise.all([ctx.events(model.identity.languageId), ctx.state.getPrefs(model.identity.learnerId, model.identity.languageId)]);
    const profile = schedulerProfileSelection(events);
    if (profile.error) return { eligible:false, reason:profile.error };
    const whole = (ctx.engine.foldDeckShared ?? ctx.engine.foldDeck)(events, model.identity.languageId, prefs, at);
    const item = whole.find(i => i.itemId === planned.item.itemId), unitId = planned.item.unitId, intent = planned.intent ?? { kind:'automatic' as const };
    const hasHistory = item?.history.some(h => !h.retracted && !h.scheduleExcluded && !h.conflict);
    if (!hasHistory && intent.kind === 'automatic') {
      const latest = revision(events,unitId), prior = revisions.get(unitId) ?? (model.events ? revision(model.events,unitId) : undefined);
      if (latest !== prior) {
        try {
          const response = await (await ctx.api()).api.knowledge([unitId]);
          const row = response.ok ? response.data.knowledge.find(k => k.unitId === unitId) : undefined;
          if (!row) return {eligible:false,reason:'Current admission evidence could not be verified; existing due and explicit practice remain available.'};
          currentKnowledge.set(unitId,row);revisions.set(unitId,latest);
        } catch { return {eligible:false,reason:'Current admission evidence is unavailable; no automatic new card was introduced.'}; }
      }
    }
    let knowledge = currentKnowledge.get(unitId);
    // A just-recorded explicit learner mark is already authoritative locally, even before projection sync.
    const mark = events.filter(e => e.kind === 'ItemMarked' && e.subject.itemIds?.includes(unitId))
      .sort((a,b) => Date.parse(a.at)-Date.parse(b.at) || a.id.localeCompare(b.id)).at(-1)?.payload.mark;
    if (knowledge && ['new','seen','recognized','familiar','known','automatic'].includes(String(mark)))
      knowledge = { ...knowledge, level:mark as UnitKnowledge['level'] };
    const budget = admissionBudget(events, { learnerId:model.identity.learnerId,languageId:model.identity.languageId,now:at,maxNew:prefs.maxNew,dailyNewLimit:prefs.dailyNewLimit??prefs.maxNew });
    const head = eventHead(events);
    // the indexes are the log's; the repair status is taken for this one card at `at`, as a context built at `at` would give it (deckModel's contextAt)
    if (shared?.head !== head) shared = { head, base: createReviewEligibilityContext([], events, at) };
    const context: ReviewEligibilityContext = { ...shared.base, remediationByCard: new Map(remediationBacklog(item ? [item] : [], events, at, shared.base.remediationEvidence).map(row => [row.itemId, row])) };
    return reviewEligibility({item,itemId:planned.item.itemId,unitId,knowledge,events,now:at,intent,remainingNew:Math.min(prefs.maxNew,budget.remaining),context});
  };
}

export async function resumeSession(ctx: AppContext, sessionId: string): Promise<StartResult> {
  const saved = (await recoverableSessions(ctx)).find((s) => s.sessionId === sessionId);
  if (!saved) return { ok: false, message: 'That session is no longer available. Your committed reviews are preserved.' };
  const [ectx, data, identity] = await Promise.all([ctx.eventContext(), ctx.data(), ctx.identity()]);
  if (!ectx || !data || !identity) return { ok: false, message: 'Choose a language first.' };
  const prefs = await ctx.state.getPrefs(identity.learnerId, identity.languageId);
  const profile = schedulerProfileSelection(await ctx.events(identity.languageId));
  if (profile.error) return {ok:false,message:profile.error};
  const { api } = await ctx.api();
  const audio = await ctx.audio();
  const snapshot = await readSnapshot(ctx, identity.learnerId, identity.languageId);
  const driver = ctx.engine.startSession({ prefs, plan: saved.plan, ctx: ectx, api, persist: data.area,
    canPresent: presentationGuard(ctx, { identity, knowledge: snapshot?.model?.knowledge ?? [] }),
    schedulerProfile: activeSchedulerProfile(await ctx.events(identity.languageId)),
    committedEvents: () => ctx.events(identity.languageId),
    ...(audio?.source() ? { assessment: audio.source() } : {}),
    record: async (events) => {
      const result = await ctx.record(events);
      if (result.refused.length) throw new Error(result.refused[0].issues.join('; '));
    },
  });
  if (!driver.recover || !(await driver.recover(sessionId))) return { ok: false, message: 'The saved session could not be restored.' };
  const state = driver.state();
  return { ok: true, run: { driver, plan: state.plan, ctx: ectx, addedCount: 0,
    startedAt: Date.parse(state.startedAt), resumed: true, results: [...state.results],
    skipped: driver.skips().map((s) => s.itemId), withheld: [], controls: [] } };
}

/** End without grading unanswered prompts or removing committed events. */
export async function endSavedSession(ctx: AppContext, sessionId: string): Promise<boolean> {
  const resumed = await resumeSession(ctx, sessionId);
  if (!resumed.ok) return false;
  await resumed.run.driver.finish();
  return true;
}

/** Plans a session from the model and opens the driver. Nothing is written until the learner answers. */
export async function beginSession(ctx: AppContext, model: ReviewModel, opts: { plan?: SessionPlan } = {}): Promise<StartResult> {
  const { engine, deps } = ctx;
  const ectx = await ctx.eventContext();
  if (!ectx) return { ok: false, message: 'Choose a language first.' };
  const profile = schedulerProfileSelection(await ctx.events(model.identity.languageId));
  if (profile.error) return { ok:false, message:profile.error };
  const prefs = await ctx.state.getPrefs(model.identity.learnerId, model.identity.languageId);
  const now = ectx.now;
  // Home supplies its eligible plan; detail entry points use the same core planner.
  const plan: SessionPlan = opts.plan ?? engine.plan({ deck: model.deck, intake: model.outcomes.filter((o) => model.choices[o.unitId] !== 'later'), prefs: model.prefs, audio: model.audio, now, knowledge: model.knowledge, readingSignals: model.events, schedulerProfile: model.schedulerProfile, observedReviewSeconds: observedReviewSeconds(model.events) });
  if (!plan.items.length) {
    return { ok: false, message: plan.skipped.length ? `Nothing fits this session: ${plan.skipped[0].why}.` : 'Nothing is due, and nothing new is worth adding right now.' };
  }
  // Items the planner takes from intake are not in the deck yet. The session runner writes each one's CardAdded together
  // with its first recorded answer, so a card exists only once the learner has been asked it.
  const have = new Set(model.deck.map((i) => i.itemId));
  const newToDeck = plan.items.filter((p) => !have.has(p.item.itemId)).length;
  const audioDeps = await ctx.audio();
  const { api } = await ctx.api();
  const data = await ctx.data();
  if (!data) return { ok: false, message: 'Sign in first.' };
  const driver: SessionDriver = engine.startSession({
    prefs, plan, ctx: ectx, ...(audioDeps?.source() ? { assessment: audioDeps.source() } : {}), api, persist: data.area,
    committedEvents: () => ctx.events(model.identity.languageId),
    schedulerProfile: profile.profile,
    canPresent: presentationGuard(ctx, model),
    record: async (events) => {
      const r = await ctx.record(events);
      if (r.refused.length) throw new Error(`the device queue refused an event (${r.refused[0].issues.join('; ')})`);
    },
  });
  return { ok: true, run: { driver, plan, ctx: ectx, addedCount: newToDeck, startedAt: deps.now().getTime(), results: [], skipped: [], withheld: [], controls: [] } };
}
