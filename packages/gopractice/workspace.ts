/**
 * The GoReview workspace model: everything the dashboard shows, loaded from the local event log, the Repository's
 * candidates (live, or the last list the service sent) and GoListen's availability. Rendering lives in the screens;
 * this file has no DOM, so a test can read the model directly.
 */
import type { GoEvent, ReviewCandidate, UnitKnowledge, SchedulerProfile } from '../repository-contract/src';
import { effectiveReviewEvents } from '../repository-contract/src';
import type { AudioAvailability, DeckItem, IntakeOutcome, ReviewPreferences, SessionPlan, SessionState } from '../goreview/src/types';
import type { AppContext } from './context';
import { candidatesKey, type CandidateChoice } from './state';
import type { ActiveRun, Identity, SessionDriver } from './ports';
import { activeSchedulerProfile } from './profiles';
import { readSnapshot, restoreMissing, writeSnapshot } from './snapshot';

// Automatic admission is deliberately serialized in this process. The event id and dedupe key below also make a
// second tab/retry harmless: the Repository's append boundary sees the same CardAdded identity.
const automaticDeckLocks = new Map<string, Promise<void>>();
const stableId = (text: string): string => {
  let h = 14695981039346656037n;
  for (let i = 0; i < text.length; i++) { h ^= BigInt(text.charCodeAt(i)); h = BigInt.asUintN(64, h * 1099511628211n); }
  return h.toString(16).padStart(16, '0');
};

async function admitAutomaticDeck(ctx: AppContext, model: Pick<ReviewModel, 'identity' | 'deck' | 'outcomes' | 'choices' | 'prefs' | 'now' | 'audio'>, unavailable = new Set<string>()): Promise<GoEvent[]> {
  const lockKey = `${model.identity.learnerId}:${model.identity.languageId}`;
  const previous = automaticDeckLocks.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  automaticDeckLocks.set(lockKey, chain);
  await previous;
  try {
    const data = await ctx.data();
    const markerKey = `auto-deck:candidates:${model.identity.languageId}`;
    // Intake decisions change to `already-covered` after admission; the marker tracks source evidence and target,
    // rather than that derived deck state, so a refresh of the same candidate pool cannot grow the deck.
    const signature = JSON.stringify({ maxNew: model.prefs.maxNew, prioritizeSaved: model.prefs.prioritizeSaved, listening: model.prefs.includeListening, audio: model.audio, candidates: model.outcomes.map((o) => [o.unitId, o.candidate.score, o.candidate.targetDimension, o.candidate.eligibility, o.knowledge?.level, o.knowledge?.basis, o.explicitlySelected, model.choices[o.unitId] ?? '']).sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0) });
    if (data && (await data.area.get(markerKey))[markerKey] === signature) return [];
    // `maxNew` is the admission batch bound. The planner still enforces its own per-session new-item budget, while
    // using a batch bound here lets a newly surfaced higher-scoring candidate displace no existing card or history.
    const remaining = Math.max(0, model.prefs.maxNew);
    if (!remaining) return [];
    const ectx = await ctx.eventContext();
    if (!ectx) return [];
    const { api } = await ctx.api();
    const candidates = model.outcomes
      .filter((o) => model.choices[o.unitId] !== 'later')
      .filter((o) => o.proposed && (o.decision === 'test-now' || o.decision === 'test-later' || o.decision === 'low-priority'))
      .filter((o) => !model.deck.some((i) => i.unitId === o.unitId && (i.status === 'dismissed' || i.status === 'suspended')))
      .filter((o) => !model.deck.some((i) => i.unitId === o.unitId && i.dimension === o.proposed?.dimension && i.status !== 'dismissed'))
      .sort((a, b) => (model.prefs.prioritizeSaved ? Number(b.explicitlySelected === true) - Number(a.explicitlySelected === true) : 0)
        || (Number.isFinite(b.candidate.score) ? b.candidate.score : -Infinity) - (Number.isFinite(a.candidate.score) ? a.candidate.score : -Infinity)
        || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
    const added: GoEvent[] = [];
    const addedKeys = new Set<string>();
    let hadUnavailable = false;
    for (const outcome of candidates) {
      if (added.length >= remaining) break;
      const proposed = outcome.proposed!;
      const key = `${outcome.unitId}|${proposed.dimension}`;
      if (addedKeys.has(key) || model.deck.some((i) => i.unitId === outcome.unitId && i.dimension === proposed.dimension && i.status !== 'dismissed')) continue;
      if (proposed.family.startsWith('audio-') && (!model.prefs.includeListening || !model.audio.available || !model.audio.eligibleForEvidence)) continue;
      if (!ctx.engine.exerciseAvailable) { unavailable.add(outcome.unitId); hadUnavailable = true; continue; }
      try {
        if (!(await ctx.engine.exerciseAvailable({ unitId: outcome.unitId, unitKind: outcome.candidate.kind, languageId: model.identity.languageId, dimension: proposed.dimension, family: proposed.family, api, now: model.now }))) { unavailable.add(outcome.unitId); hadUnavailable = true; continue; }
      } catch { unavailable.add(outcome.unitId); hadUnavailable = true; continue; }
      // A failed build is deliberately not cached. A repaired pack or changed builder must be retried on the next
      // review load even when the candidate evidence snapshot is unchanged.
      const reason = `automatic deck (${outcome.decision}; score ${outcome.candidate.score.toFixed(2)}): ${outcome.reasons.join('; ')}`;
      const event = ctx.engine.cardAdded({ ...ectx, now: model.now }, { unitId: outcome.unitId, unitKind: outcome.candidate.kind, dimension: proposed.dimension, family: proposed.family, reasons: [reason] }, 'intake');
      const identity = stableId(`${model.identity.learnerId}|${model.identity.languageId}|${outcome.unitId}|${proposed.dimension}`);
      event.id = `auto-card:${identity}`;
      event.dedupeKey = `auto-card:${identity}`;
      const result = await ctx.record([event]);
      if (!result.refused.length) { added.push(event); addedKeys.add(key); }
      else hadUnavailable = true;
    }
    if (data && added.length && !hadUnavailable) await data.area.set({ [markerKey]: signature });
    return added;
  } finally {
    release();
    if (automaticDeckLocks.get(lockKey) === chain) automaticDeckLocks.delete(lockKey);
  }
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

export interface ReviewModel {
  identity: Identity;
  prefs: ReviewPreferences;
  events: GoEvent[];
  deck: DeckItem[];
  counts: DeckCounts;
  audio: AudioAvailability;
  outcomes: IntakeOutcome[];
  knowledge: UnitKnowledge[];
  schedulerProfile?: SchedulerProfile;
  /** Candidates the learner dismissed (ItemMarked ignore) and so are not proposed. */
  dismissed: string[];
  choices: Record<string, CandidateChoice>;
  saved: Set<string>;
  candidateSource: 'live' | 'cached' | 'none';
  candidateNote?: string;
  now: string;
  algorithm: string;
  parametersVersion: string;
}

/** The last explicit mark per unit (ItemMarked), so a later 'ignore' or 'known' cancels an earlier 'saved'. */
export function marksOf(events: readonly GoEvent[]): { saved: Set<string>; ignored: Set<string> } {
  const last = new Map<string, string>();
  const sorted = events.filter((e) => e.kind === 'ItemMarked').sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
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

interface CandidateCache { fetchedAt: string; candidates: ReviewCandidate[]; knowledge: UnitKnowledge[] }

export async function loadReviewModel(ctx: AppContext): Promise<ReviewModel | undefined> {
  const identity = await ctx.identity();
  if (!identity) return undefined;
  const { deps, state, engine } = ctx;
  const now = deps.now().toISOString();
  await restoreMissing(ctx, identity.learnerId, identity.languageId);
  const prefs = await state.getPrefs(identity.learnerId, identity.languageId);
  const events = await ctx.events(identity.languageId);
  const schedulerProfile = activeSchedulerProfile(events);
  const scheduler = engine.scheduler(prefs, schedulerProfile);
  const deck = engine.foldDeck(events, identity.languageId, prefs, now);
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
  const cacheKey = candidatesKey(identity.learnerId, identity.enrolmentId);
  try {
    const { api } = await ctx.api();
    if ((await ctx.mode()) === 'none') throw new Error('not signed in');
    let cursor: string | undefined;
    const cursors = new Set<string>();
    do {
      const c = await api.candidates(identity.enrolmentId, 200, cursor);
      if (!c.ok) throw new Error(c.message || `the service answered ${c.status}`);
      candidates.push(...c.data.candidates);
      cursor = c.data.nextCursor;
      if (cursor && cursors.has(cursor)) throw new Error('The candidate service repeated a page cursor.');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    const unitIds = [...new Set([...candidates.map((x) => x.unitId), ...deck.map((x) => x.unitId)])];
    for (let offset = 0; offset < unitIds.length; offset += 200) {
      const k = await api.knowledge(unitIds.slice(offset, offset + 200));
      if (k.ok) knowledge.push(...k.data.knowledge);
    }
    candidateSource = 'live';
    await deps.area.set({ [cacheKey]: { fetchedAt: now, candidates, knowledge } satisfies CandidateCache });
  } catch (e) {
    const cached = (await deps.area.get(cacheKey))[cacheKey] as CandidateCache | undefined;
    if (cached && Array.isArray(cached.candidates)) {
      candidates = cached.candidates; knowledge = cached.knowledge ?? []; candidateSource = 'cached';
      candidateNote = `The service could not be reached (${e instanceof Error ? e.message : 'unknown error'}); these candidates are from ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC.`;
    } else {
      candidateNote = `Candidates could not be fetched (${e instanceof Error ? e.message : 'unknown error'}). The deck below still works offline.`;
    }
  }

  const proposed = candidates.filter((c) => !ignored.has(c.unitId));
  let outcomes: IntakeOutcome[] = [];
  let intakeFailed = false;
  if (proposed.length) {
    try { outcomes = await engine.intake({ api: (await ctx.api()).api, candidates: proposed, knowledge, deck, saved, prefs, audio, now }); }
    catch (e) { intakeFailed = true; candidateNote = `Intake failed (${e instanceof Error ? e.message : 'unknown error'}).`; }
  }
  // Offline the service cannot answer for intake: the outcomes of the last successful load stand in (minus what the deck has taken since).
  if (candidateSource === 'live' && !intakeFailed) {
    await writeSnapshot(ctx, identity.learnerId, identity.languageId, { model: { savedAt: now, outcomes, knowledge } });
  } else if (!outcomes.length || intakeFailed) {
    const snap = (await readSnapshot(ctx, identity.learnerId, identity.languageId))?.model;
    if (snap) {
      const held = new Set(deck.filter((i) => i.status !== 'dismissed').map((i) => `${i.unitId}|${i.dimension}`));
      outcomes = snap.outcomes.filter((o) => !ignored.has(o.unitId) && !(o.proposed && held.has(`${o.unitId}|${o.proposed.dimension}`)));
      if (!knowledge.length) knowledge = snap.knowledge;
      candidateNote = `The service could not be reached; the proposals are from this device's copy of ${snap.savedAt.slice(0, 16).replace('T', ' ')} UTC.`;
    }
  }
  const choices = await state.getChoices(identity.learnerId);
  const base: ReviewModel = {
    identity, prefs, events, deck, counts, audio, outcomes, knowledge, schedulerProfile, dismissed: [...ignored], choices, saved, candidateSource,
    ...(candidateNote ? { candidateNote } : {}), now, algorithm: scheduler.algorithm, parametersVersion: scheduler.parametersVersion,
  };
  const unavailable = new Set<string>();
  const added = await admitAutomaticDeck(ctx, base, unavailable);
  if (!added.length && !unavailable.size) return base;
  const refreshedEvents = await ctx.events(identity.languageId);
  const refreshedDeck = engine.foldDeck(refreshedEvents, identity.languageId, prefs, now);
  const addedUnits = new Set(added.map((e) => e.subject.itemIds?.[0]).filter((id): id is string => !!id));
  const refreshedOutcomes = base.outcomes.map((o) => addedUnits.has(o.unitId)
    ? { ...o, decision: 'already-covered' as const, proposed: undefined, reasons: ['automatically added to the deck on review load', ...o.reasons] }
    : unavailable.has(o.unitId) ? { ...o, decision: 'needs-validation' as const, proposed: undefined, reasons: ['No usable exercise could be built for this word yet; it remains in My words.', ...o.reasons] } : o);
  const assemblyNote = `Automatic deck: ${added.length} card${added.length === 1 ? '' : 's'} added${unavailable.size ? `; ${unavailable.size} word${unavailable.size === 1 ? '' : 's'} waiting for a usable exercise` : ''}.`;
  return { ...base, candidateNote: [base.candidateNote, assemblyNote].filter(Boolean).join(' '), events: refreshedEvents, deck: refreshedDeck, outcomes: refreshedOutcomes, counts: countDeck(refreshedDeck, { scheduler, now }) };
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

export async function resumeSession(ctx: AppContext, sessionId: string): Promise<StartResult> {
  const saved = (await recoverableSessions(ctx)).find((s) => s.sessionId === sessionId);
  if (!saved) return { ok: false, message: 'That session is no longer available. Your committed reviews are preserved.' };
  const [ectx, data, identity] = await Promise.all([ctx.eventContext(), ctx.data(), ctx.identity()]);
  if (!ectx || !data || !identity) return { ok: false, message: 'Choose a language first.' };
  const prefs = await ctx.state.getPrefs(identity.learnerId, identity.languageId);
  const { api } = await ctx.api();
  const audio = await ctx.audio();
  const driver = ctx.engine.startSession({ prefs, plan: saved.plan, ctx: ectx, api, persist: data.area,
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
  const now = ectx.now;
  // the home plans its own deck (with its fallback fill, ./deckModel) and hands that plan over; without one the session is planned as the details page always did
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
    prefs: model.prefs, plan, ctx: ectx, ...(audioDeps?.source() ? { assessment: audioDeps.source() } : {}), api, persist: data.area,
    committedEvents: () => ctx.events(model.identity.languageId),
    schedulerProfile: model.schedulerProfile,
    record: async (events) => {
      const r = await ctx.record(events);
      if (r.refused.length) throw new Error(`the device queue refused an event (${r.refused[0].issues.join('; ')})`);
    },
  });
  return { ok: true, run: { driver, plan, ctx: ectx, addedCount: newToDeck, startedAt: deps.now().getTime(), results: [], skipped: [], withheld: [], controls: [] } };
}
