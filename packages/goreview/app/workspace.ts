/**
 * The GoReview workspace model: everything the dashboard shows, loaded from the local event log, the Repository's
 * candidates (live, or the last list the service sent) and GoListen's availability. Rendering lives in the screens;
 * this file has no DOM, so a test can read the model directly.
 */
import type { GoEvent, ReviewCandidate, UnitKnowledge, SchedulerProfile } from '../../repository-contract/src';
import { effectiveReviewEvents } from '../../repository-contract/src';
import { reviewEligibility } from '../src/planner/eligibility';
import { admissionBudget } from '../src/planner/budget';
import type { AudioAvailability, DeckItem, IntakeOutcome, ReviewPreferences, SessionPlan, SessionState } from '../src/types';
import type { AppContext } from './context';
import { candidatesKey, type CandidateChoice } from './state';
import type { ActiveRun, Identity, SessionDriver } from './ports';
import { activeSchedulerProfile, schedulerProfileSelection } from './profiles';
import { isClassUnit } from './classEssentials';
import { readSnapshot, restoreMissing, writeSnapshot } from './snapshot';

/** Preparing admission is read-only with respect to progress. CardAdded belongs to
 * the first evidence-bearing answer, not to a dashboard visit or candidate refresh.
 */
async function prepareAdmissions(ctx: AppContext, model: ReviewModel): Promise<ReviewModel> {
  const limit = Math.max(0, model.prefs.maxNew);
  if (!limit) return model;
  const { api } = await ctx.api();
  const candidates = model.outcomes.filter(o => model.choices[o.unitId] !== 'later' && o.proposed
    && ['test-now', 'test-later', 'low-priority'].includes(o.decision)
    && !model.deck.some(i => i.unitId === o.unitId && (i.status === 'suspended' || i.status === 'dismissed' || i.dimension === o.proposed?.dimension)))
    .sort((a,b) => b.candidate.score - a.candidate.score || a.unitId.localeCompare(b.unitId));
  const ready = new Set<string>(), unavailable = new Set<string>();
  for (const outcome of candidates) {
    if (ready.size >= limit) break;
    const proposed = outcome.proposed!;
    if (proposed.family.startsWith('audio-') && (!model.prefs.includeListening || !model.audio.available)) continue; // a computer voice is practice: allowed
    try {
      if (ctx.engine.exerciseAvailable && await ctx.engine.exerciseAvailable({ unitId: outcome.unitId, unitKind: outcome.candidate.kind,
        languageId: model.identity.languageId, dimension: proposed.dimension, family: proposed.family, api, now: model.now })) ready.add(outcome.unitId);
      else unavailable.add(outcome.unitId);
    } catch { unavailable.add(outcome.unitId); }
  }
  const outcomes = model.outcomes.map(o => ready.has(o.unitId) ? { ...o, decision: 'test-now' as const }
    : unavailable.has(o.unitId) ? { ...o, decision: 'needs-validation' as const, proposed: undefined,
      reasons: ['No usable exercise could be built for this word yet; it remains in My words.', ...o.reasons] } : o);
  return { ...model, outcomes, candidateNote: [model.candidateNote, unavailable.size
    ? unavailable.size + ' word' + (unavailable.size === 1 ? '' : 's') + ' waiting for a usable exercise.' : undefined].filter(Boolean).join(' ') || undefined };
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
  candidateNote?: string;
  /** How complete the knowledge behind `knowledge` is: a unit in `missing` has NO row because its batch failed, which is not the same as New. */
  knowledgeStatus: KnowledgeStatus;
  /** Candidates held out of AUTOMATIC new admission because their knowledge could not be loaded (never treated as New). */
  withheld: WithheldUnit[];
  now: string;
  algorithm: string;
  parametersVersion: string;
}

/** The last explicit mark per unit (ItemMarked), so a later 'ignore' or 'known' cancels an earlier 'saved'. */
export function marksOf(events: readonly GoEvent[]): { saved: Set<string>; ignored: Set<string> } {
  const last = new Map<string, string>();
  const sorted = events.filter((e) => e.kind === 'ItemMarked').sort((a, b) => Date.parse(a.at)-Date.parse(b.at) || a.id.localeCompare(b.id));
  for (const e of sorted) {
    const mark = (e.payload as { mark?: string }).mark;
    if (!mark) continue;
    for (const id of e.subject.itemIds ?? []) last.set(id, mark);
  }
  const saved = new Set<string>();
  const ignored = new Set<string>();
  for (const [id, m] of last) { if (m === 'saved') saved.add(id); if (m === 'ignore') ignored.add(id); }
  return { saved, ignored };
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

interface CandidateCache { fetchedAt: string; candidates: ReviewCandidate[]; knowledge: UnitKnowledge[] }

export async function loadReviewModel(ctx: AppContext): Promise<ReviewModel | undefined> {
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
  const { saved, ignored } = marksOf(events);

  const audioDeps = await ctx.audio();
  let audio: AudioAvailability = NO_AUDIO;
  if (audioDeps) { try { audio = await audioDeps.availability(identity.languageId); } catch { audio = { ...NO_AUDIO, reason: 'audio availability could not be determined' }; } }

  // candidates: live when the service (or, with no account, the device's own Repository) answers, else the last list it sent
  let candidates: ReviewCandidate[] = [];
  let knowledge: UnitKnowledge[] = [];
  let candidateSource: ReviewModel['candidateSource'] = 'none';
  let candidateNote: string | undefined;
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
  const cacheKey = `${candidatesKey(identity.learnerId, identity.enrolmentId)}:${objectives.join(',')}`;
  try {
    const { api } = await ctx.api();
    if ((await ctx.mode()) === 'none') throw new Error('not signed in');
    let cursor: string | undefined;
    const cursors = new Set<string>();
    do {
      const c = await api.candidates(identity.enrolmentId, 200, cursor, objectives);
      if (!c.ok) throw new Error(c.message || `the service answered ${c.status}`);
      candidates.push(...c.data.candidates.filter((x) => !isClassUnit(x.unitId)));
      cursor = c.data.nextCursor;
      if (cursor && cursors.has(cursor)) throw new Error('The candidate service repeated a page cursor.');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    const unitIds = [...new Set([...candidates.map((x) => x.unitId), ...deck.map((x) => x.unitId)])];
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
      await deps.area.set({ [cacheKey]: { fetchedAt: now, candidates, knowledge } satisfies CandidateCache });
    } else {
      // Some batches failed: keep what arrived, fill the gap from the last complete snapshot where it covers a unit, and
      // report the rest. The candidate cache and the snapshot (the last complete copies) are NOT overwritten by a partial load.
      const snapModel = (await readSnapshot(ctx, identity.learnerId, identity.languageId))?.model;
      const earlier = new Map((snapModel?.knowledge ?? []).map((k) => [k.unitId, k]));
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
    if (cached && Array.isArray(cached.candidates)) {
      candidates = cached.candidates; knowledge = cached.knowledge ?? []; candidateSource = 'cached';
      // the cache is written only after a complete live load, so its knowledge stands for every unit it listed
      const cachedUnits = new Set([...candidates.map((x) => x.unitId), ...deck.map((x) => x.unitId)]);
      knowledgeStatus = { source: 'cached', requested: cachedUnits.size, resolved: cachedUnits.size, missing: [], fetchedAt: cached.fetchedAt };
      candidateNote = `The service could not be reached (${e instanceof Error ? e.message : 'unknown error'}); these candidates are from ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC.`;
    } else {
      candidateNote = `Candidates could not be fetched (${e instanceof Error ? e.message : 'unknown error'}). The deck below still works offline.`;
    }
  }

  const proposed = candidates.filter((c) => !ignored.has(c.unitId));
  let outcomes: IntakeOutcome[] = [];
  let intakeFailed = false;
  if (proposed.length) {
    try { outcomes = await engine.intake({ api: (await ctx.api()).api, candidates: proposed, knowledge, deck, saved, prefs, audio, now, events }); }
    catch (e) { intakeFailed = true; candidateNote = `Intake failed (${e instanceof Error ? e.message : 'unknown error'}).`; }
  }
  // Offline the service cannot answer for intake: the outcomes of the last successful load stand in (minus what the deck has taken since).
  if (candidateSource === 'live' && !intakeFailed) {
    // only a fully resolved live load replaces the last complete snapshot
    if (knowledgeComplete) await writeSnapshot(ctx, identity.learnerId, identity.languageId, { model: { savedAt: now, outcomes, knowledge } });
  } else if (!outcomes.length || intakeFailed) {
    const snap = (await readSnapshot(ctx, identity.learnerId, identity.languageId))?.model;
    if (snap) {
      const held = new Set(deck.filter((i) => i.status !== 'dismissed').map((i) => `${i.unitId}|${i.dimension}`));
      const goals = prefs.practiceGoals;
      const stillSelected = (family: string): boolean => !goals || (
        family === 'meaning-to-form' ? goals.includes('retrieval') :
        family === 'morphological-identification' || family === 'grammar-application' || family === 'sentence-completion' ? goals.includes('application') :
        family === 'audio-to-meaning' || family === 'audio-transcription' ? goals.includes('listening') && prefs.includeListening :
        ['written-recognition', 'phrase-comprehension'].includes(family) ? goals.includes('recognition') : true
      );
      outcomes = snap.outcomes.filter((o) => !ignored.has(o.unitId)
        && !(o.proposed && held.has(`${o.unitId}|${o.proposed.dimension}`))
        && (!o.proposed || o.explicitlySelected || stillSelected(o.proposed.family)));
      if (!knowledge.length) { knowledge = snap.knowledge; knowledgeStatus = { source: 'cached', requested: snap.knowledge.length, resolved: snap.knowledge.length, missing: [], fetchedAt: snap.savedAt }; }
      candidateNote = `The service could not be reached; the proposals are from this device's copy of ${snap.savedAt.slice(0, 16).replace('T', ' ')} UTC.`;
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
  const choices = await state.getChoices(identity.learnerId);
  const base: ReviewModel = {
    identity, prefs, events, deck, classDeck, counts, audio, outcomes, knowledge, schedulerProfile, schedulerIssue: profileSelection.error, dismissed: [...ignored], choices, saved, candidateSource, knowledgeStatus, withheld,
    ...(candidateNote ? { candidateNote } : {}), now, algorithm: scheduler.algorithm, parametersVersion: scheduler.parametersVersion,
  };
  return prepareAdmissions(ctx, base);
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
  return async (planned: import('../src/types').PlannedItem, at: string): Promise<{ eligible: boolean; reason?: string }> => {
    const [events, prefs] = await Promise.all([ctx.events(model.identity.languageId), ctx.state.getPrefs(model.identity.learnerId, model.identity.languageId)]);
    const profile = schedulerProfileSelection(events);
    if (profile.error) return { eligible:false, reason:profile.error };
    const whole = ctx.engine.foldDeck(events, model.identity.languageId, prefs, at);
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
    return reviewEligibility({item,itemId:planned.item.itemId,unitId,knowledge,events,now:at,intent,remainingNew:Math.min(prefs.maxNew,budget.remaining)});
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
    startedAt: Date.parse(state.startedAt), results: [...state.results],
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
