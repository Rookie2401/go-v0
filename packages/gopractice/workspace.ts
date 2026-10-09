/**
 * The GoReview workspace model: everything the dashboard shows, loaded from the local event log, the Repository's
 * candidates (live, or the last list the service sent) and GoListen's availability. Rendering lives in the screens;
 * this file has no DOM, so a test can read the model directly.
 */
import type { GoEvent, ReviewCandidate, UnitKnowledge } from '../repository-contract/src';
import type { AudioAvailability, DeckItem, IntakeOutcome, ReviewPreferences, SessionPlan } from '../goreview/src/types';
import type { AppContext } from './context';
import { candidatesKey, type CandidateChoice } from './state';
import type { ActiveRun, Identity, SessionDriver } from './ports';

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
  const prefs = await state.getPrefs(identity.learnerId, identity.languageId);
  const events = await ctx.events(identity.languageId);
  const scheduler = engine.scheduler(prefs);
  const deck = engine.foldDeck(events, identity.languageId, prefs, now);
  const counts = countDeck(deck, { scheduler, now });
  const { saved, ignored } = marksOf(events);

  const audioDeps = await ctx.audio();
  let audio: AudioAvailability = NO_AUDIO;
  if (audioDeps) { try { audio = await audioDeps.availability(identity.languageId); } catch { audio = { ...NO_AUDIO, reason: 'audio availability could not be determined' }; } }

  // candidates: live when the service answers, else the last list it sent
  let candidates: ReviewCandidate[] = [];
  let knowledge: UnitKnowledge[] = [];
  let candidateSource: ReviewModel['candidateSource'] = 'none';
  let candidateNote: string | undefined;
  const cacheKey = candidatesKey(identity.learnerId, identity.enrolmentId);
  try {
    const { api, session } = await ctx.api();
    if (!session) throw new Error('not signed in');
    const c = await api.candidates(identity.enrolmentId, 40);
    if (!c.ok) throw new Error(c.message || `the service answered ${c.status}`);
    candidates = c.data.candidates;
    if (candidates.length) {
      const k = await api.knowledge([...new Set(candidates.map((x) => x.unitId))].slice(0, 200));
      knowledge = k.ok ? k.data.knowledge : [];
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
  if (proposed.length) {
    try { outcomes = await engine.intake({ api: (await ctx.api()).api, candidates: proposed, knowledge, deck, saved, prefs, audio, now }); }
    catch (e) { candidateNote = `Intake failed (${e instanceof Error ? e.message : 'unknown error'}).`; }
  }
  const choices = await state.getChoices(identity.learnerId);
  return {
    identity, prefs, events, deck, counts, audio, outcomes, dismissed: [...ignored], choices, saved, candidateSource,
    ...(candidateNote ? { candidateNote } : {}), now, algorithm: scheduler.algorithm, parametersVersion: scheduler.parametersVersion,
  };
}

// ───────────────────────────── starting a session ─────────────────────────────

export type StartResult =
  | { ok: true; run: ActiveRun }
  | { ok: false; message: string };

/** Plans a session from the model and opens the driver. Nothing is written until the learner answers. */
export async function beginSession(ctx: AppContext, model: ReviewModel): Promise<StartResult> {
  const { engine, deps } = ctx;
  const ectx = await ctx.eventContext();
  if (!ectx) return { ok: false, message: 'Choose a language first.' };
  const now = ectx.now;
  const plan: SessionPlan = engine.plan({ deck: model.deck, intake: model.outcomes.filter((o) => model.choices[o.unitId] !== 'later'), prefs: model.prefs, audio: model.audio, now });
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
    record: async (events) => {
      const r = await ctx.record(events);
      if (r.refused.length) throw new Error(`the device queue refused an event (${r.refused[0].issues.join('; ')})`);
    },
  });
  return { ok: true, run: { driver, plan, ctx: ectx, addedCount: newToDeck, startedAt: deps.now().getTime(), results: [], skipped: [], withheld: [], controls: [] } };
}
