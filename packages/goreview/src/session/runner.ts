/**
 * SESSION RUNNER — walks a SessionPlan one exercise at a time, grades, records, and survives a dead page.
 *
 * The order inside `answer()` is the guarantee: grade → rating → evidence → RECORD (`deps.record`, the device queue, which
 * persists before it resolves) → only then append the result, advance and persist the session. If `record` throws, nothing
 * advanced: the same exercise is still current and the learner can answer again. If the page dies after `record`, the
 * recovered session re-asks that item, and the result's event ids are DETERMINISTIC (`gr:<session>:<index>:<kind>`), so the
 * repeat is a duplicate the queue and the Repository drop, not a second observation.
 *
 * Rules:
 *  - `skip()` writes nothing: the item stays due. An exercise that fails to build (no facts, builder refuses, validation
 *    issues, ineligible analysis, audio failure to prepare) is skipped with the reason and never shown.
 *  - A new item (from intake, not yet in the deck) gets its `CardAdded` in the SAME `record` batch as its first scored
 *    event, so a card exists only once the learner has been asked it. An unrecorded attempt adds no card.
 *  - Audio failure (`response.audioFailed`): outcome 'unable-to-grade', rating null, evidence null — nothing is recorded.
 *  - `transcriptShownBefore`: the item is not a listening item any more. The RESULT is DOWNGRADED to a written-recognition
 *    result (family and target dimension 'written-recognition', no listening metadata). Its evidence is what the evidence
 *    builder makes of a shown transcript: a reading review (answerShownBefore) with quality 'none'; the rating still reaches
 *    the schedule. The learner is credited with neither listening nor evidence of reading.
 *  - Practice-only audio (synthetic/unverified voice): the listening event is recorded with evidence quality 'none'.
 *  - 'invalid-question' or 'unable-to-grade': rating null, no event (nothing about the learner was observed).
 *  - CHALLENGE. Two ways, both honest about what they can undo:
 *      a) `answer({ ...response, challenged: true })` — the learner disputes the key before it counts. The result is kept,
 *         rating null, and the recorded event has evidence quality 'none' (so the fold counts it as unscored).
 *      b) `challenge(reason, { keyIsWrong })` after the answer was recorded. The log is append-only, so this appends a
 *         correction event (same kind, `correctionOf` the original, rating null, quality 'none') and marks the result.
 *         It CANNOT rewind the schedule the first event already advanced (the deck fold has no undo event); callers that
 *         can should use (a) after showing `preview(response)`. Only when `keyIsWrong` is true — the learner says the answer
 *         key itself is wrong and marks it so — a `ReviewItemInvalidated { reason: 'analysis-invalidated', cardId }`
 *         is also recorded, withdrawing the item for review by someone who can fix the pack. Without that mark, the item
 *         stays and only the result is challenged.
 *  - The persisted state is `goreview:session:<id>`; a persistence failure after a successful record is collected in
 *    `persistErrors()` and does not fail the answer (the answer is already safe in the queue).
 */
import type { GoEvent } from '../../../repository-contract/src';
import { validateEvent } from '../../../repository-contract/src';
import type { AssessmentSource } from '../../../golisten/src/contracts';
import type { KeyValueArea } from '../../../repository-sync/src/area';
import { getOne } from '../../../repository-sync/src/area';
import { FAMILY_DIMENSION } from '../types';
import type {
  BuildContext, DeckItem, Exercise, ExerciseBuilder, ExerciseFamily, FactsProvider, Grading, PlannedItem, Rating, Response,
  ReviewResult, ReviewTarget, Scheduler, SessionPlan, SessionState, UnitFacts,
} from '../types';
import { assertValidEvent, buildCardAdded, PRODUCER_APP } from '../scheduler/deck';
import { resultScoring, scoreListening } from '../listening/assessment';
import type { ListeningScore } from '../listening/assessment';
import { isAudioFamily } from '../planner/planner';
import { evidenceFor as buildEvidenceFor } from '../exercises/evidence';
import { ratingFor as defaultRatingFor } from '../grading/grade';

export const SESSION_KEY_PREFIX = 'goreview:session:';
export const NEW_FROM_INTAKE = 'new from intake';
export const SESSION_VERSION = 1;

/** A plan item the deck does not have yet (it was born in this plan from an intake outcome). */
export const isNewToDeck = (p: PlannedItem): boolean => p.isNew && p.why[0] === NEW_FROM_INTAKE;

// ───────────────────────────── ports ─────────────────────────────

export type BuilderRegistry = ReadonlyArray<ExerciseBuilder> | ReadonlyMap<string, ExerciseBuilder> | Readonly<Record<string, ExerciseBuilder>>;

export interface Identity { learnerId: string; enrolmentId: string; deviceId: string }

export interface EvidenceInput {
  exercise: Exercise;
  response: Response;
  grading: Grading;
  rating: Rating | null;
  item: DeckItem;
  identity: Identity;
  at: string;
  /** Present for audio-first exercises that stay audio-first. */
  listening?: ListeningScore;
}

/** What the runner needs from GoReview's grading module (`ratingFor`, `evidenceFor`); injected so the runner owns no grading rule. */
export interface GradingPort {
  ratingFor(grading: Grading, response: Response): Rating | null;
  evidenceFor(input: EvidenceInput): GoEvent | null;
}

/** GoReview's own grading module as the port: the FSRS rating and the Repository event. */
export const defaultGradingPort: GradingPort = {
  ratingFor: defaultRatingFor,
  evidenceFor: (i) => buildEvidenceFor(i),
};

export interface RunnerDeps {
  plan: SessionPlan;
  builders: BuilderRegistry;
  facts: FactsProvider;
  /** Defaults to GoReview's own `ratingFor` and `evidenceFor` (`defaultGradingPort`). */
  grading?: GradingPort;
  audio?: AssessmentSource;
  scheduler: Scheduler;
  identity: Identity;
  /** The device queue: must persist before it resolves. */
  record: (events: GoEvent[]) => Promise<void>;
  persist: KeyValueArea;
  now: () => string;
  random: () => number;
  sessionId?: string;
  /** Distractor pool for choice questions. */
  pool?: () => Promise<UnitFacts[]> | UnitFacts[];
  /** True when the deck already has the item; defaults to "not a plan item born from intake". */
  inDeck?: (p: PlannedItem) => boolean;
}

export interface SkipRecord { index: number; itemId: string; reason: string; at: string; kind: 'learner' | 'build-failed' }

export interface PersistedSession extends SessionState { version: number; skips: SkipRecord[] }

export interface CurrentExercise {
  index: number;
  total: number;
  planned: PlannedItem;
  exercise: Exercise;
}

export interface SessionSummary { answered: number; correct: number; incorrect: number; notJudged: number; challenged: number; skipped: number; unbuildable: number; remaining: number; events: number }

export interface SessionRunner {
  sessionId: string;
  state(): SessionState;
  skips(): SkipRecord[];
  persistErrors(): string[];
  /** The exercise for the current item (null when the plan is finished); unbuildable items are skipped on the way. */
  current(): Promise<CurrentExercise | null>;
  /** Grades without recording anything: for feedback before the learner commits (or challenges). */
  preview(response: Response): Promise<Grading>;
  answer(response: Response): Promise<ReviewResult>;
  /** No event; the item stays due. */
  skip(reason?: string): Promise<void>;
  challenge(reason: string, opts?: { keyIsWrong?: boolean }): Promise<ReviewResult | undefined>;
  finish(): Promise<SessionState>;
  /** Loads a saved session (state and skips) from the area and continues from it; false when none exists. */
  recover(sessionId: string): Promise<boolean>;
}

// ───────────────────────────── helpers ─────────────────────────────

export function resolveBuilder(registry: BuilderRegistry, family: ExerciseFamily): ExerciseBuilder | undefined {
  if (Array.isArray(registry)) return (registry as ExerciseBuilder[]).find((b) => b.family === family);
  if (registry instanceof Map) return registry.get(family);
  return (registry as Record<string, ExerciseBuilder>)[family];
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const clone = <T>(x: T): T => structuredClone(x);

type Built = { ok: true; exercise: Exercise; builder: ExerciseBuilder } | { ok: false; reason: string };

/** Which events the learner's result is allowed to claim, by outcome. */
const NO_EVENT_OUTCOMES = new Set(['invalid-question', 'unable-to-grade']);

export function summarize(state: SessionState, skips: SkipRecord[] = []): SessionSummary {
  const r = state.results;
  return {
    answered: r.length,
    correct: r.filter((x) => x.grading.outcome === 'correct').length,
    incorrect: r.filter((x) => x.grading.outcome === 'incorrect').length,
    notJudged: r.filter((x) => x.grading.outcome !== 'correct' && x.grading.outcome !== 'incorrect').length,
    challenged: r.filter((x) => x.response.challenged).length,
    skipped: skips.filter((s) => s.kind === 'learner').length,
    unbuildable: skips.filter((s) => s.kind === 'build-failed').length,
    remaining: Math.max(0, state.plan.items.length - state.index),
    events: r.filter((x) => x.evidence).length,
  };
}

/** Sessions saved in the area that never finished. */
export async function listRecoverable(area: KeyValueArea): Promise<string[]> {
  const keys = await area.list(SESSION_KEY_PREFIX);
  if (!keys.length) return [];
  const rows = await area.get(keys);
  return keys.filter((k) => (rows[k] as PersistedSession | undefined)?.status === 'in-progress').map((k) => k.slice(SESSION_KEY_PREFIX.length));
}

// ───────────────────────────── the runner ─────────────────────────────

export function createSessionRunner(deps: RunnerDeps): SessionRunner {
  const { builders, facts, audio, identity, record, persist, now, random } = deps;
  const gradingPort = deps.grading ?? defaultGradingPort;
  const sessionId = deps.sessionId ?? `s:${deps.plan.planId.replace(/^plan:/u, '')}`;
  const key = (id: string) => SESSION_KEY_PREFIX + id;
  const inDeck = deps.inDeck ?? ((p: PlannedItem) => !isNewToDeck(p));

  let st: PersistedSession = {
    version: SESSION_VERSION, sessionId, plan: clone(deps.plan), index: 0, results: [], startedAt: now(), deviceId: identity.deviceId,
    status: 'in-progress', skips: [],
  };
  const persistErrs: string[] = [];
  const cache = new Map<number, Promise<Built>>();

  async function save(): Promise<void> {
    try { await persist.set({ [key(st.sessionId)]: clone(st) }); } catch (e) { persistErrs.push(errText(e)); }
  }

  const planned = (i: number): PlannedItem | undefined => st.plan.items[i];

  const targetOf = (p: PlannedItem): ReviewTarget => ({
    unitId: p.item.unitId, unitKind: p.item.unitKind, languageId: p.item.languageId,
    ...(p.item.varietyId !== undefined ? { varietyId: p.item.varietyId } : {}), dimension: FAMILY_DIMENSION[p.family],
  });

  async function build(i: number): Promise<Built> {
    const p = planned(i);
    if (!p) return { ok: false, reason: 'no such plan item' };
    try {
      const builder = resolveBuilder(builders, p.family);
      if (!builder) return { ok: false, reason: `no exercise builder for ${p.family}` };
      const f = await facts.factsFor(p.item.unitId, p.item.languageId);
      if (!f) return { ok: false, reason: 'the pack has no verified facts for this unit' };
      const target = targetOf(p);
      const ctx: BuildContext = { now: now(), ...(isAudioFamily(p.family) && audio ? { audio } : {}), random, ...(deps.pool ? { pool: await deps.pool() } : {}) };
      if (isAudioFamily(p.family) && !audio) return { ok: false, reason: 'no audio source for a listening exercise' };
      if (!builder.canBuild(target, f, ctx)) return { ok: false, reason: `the facts do not support a ${p.family} exercise` };
      const ex = await builder.build(target, f, ctx);
      if ('unavailable' in ex) return { ok: false, reason: ex.reason };
      if (!ex.validation.ok) return { ok: false, reason: `the exercise failed its own validation: ${ex.validation.issues.join('; ') || 'no detail'}` };
      if (!ex.eligibility.eligible) return { ok: false, reason: `not eligible for assessment: ${ex.eligibility.reason}` };
      return { ok: true, exercise: ex, builder };
    } catch (e) {
      return { ok: false, reason: `the exercise could not be built (${errText(e)})` };
    }
  }

  const built = (i: number): Promise<Built> => {
    let b = cache.get(i);
    if (!b) { b = build(i); cache.set(i, b); }
    return b;
  };

  async function current(): Promise<CurrentExercise | null> {
    while (st.status === 'in-progress' && st.index < st.plan.items.length) {
      const i = st.index;
      const b = await built(i);
      if (b.ok) {
        void built(i + 1); // build the next while the learner answers this one
        return { index: i, total: st.plan.items.length, planned: st.plan.items[i], exercise: b.exercise };
      }
      st.skips.push({ index: i, itemId: st.plan.items[i].item.itemId, reason: b.reason, at: now(), kind: 'build-failed' });
      cache.delete(i);
      st.index += 1;
      await save();
    }
    return null;
  }

  /** Grading and result assembly shared by preview and answer. No writes. */
  async function assess(cur: CurrentExercise, response: Response) {
    const b = await built(cur.index);
    if (!b.ok) throw new Error(b.reason);
    const at = now();
    let exercise = b.exercise;
    let family: ExerciseFamily = exercise.family;
    let res: Response = { ...response, assistance: [...response.assistance] };
    let grading: Grading;
    let listening: ListeningScore | undefined;
    let scoring: ReviewResult['scoring'];

    if (isAudioFamily(exercise.family) && res.audioFailed) {
      grading = { outcome: 'unable-to-grade', confidence: 0, explanation: 'The audio could not be played, so the answer cannot be judged as listening.' };
    } else {
      grading = b.builder.grade(exercise, res, { now: at });
    }

    if (isAudioFamily(exercise.family) && !res.audioFailed) {
      if (res.transcriptShownBefore) {
        // not a listening result any more: the RESULT is re-labelled as written recognition (see the header); the evidence builder still sees the audio exercise and the transcript flag, and emits a reading review that claims nothing
        family = 'written-recognition';
        exercise = { ...exercise, family, target: { ...exercise.target, dimension: FAMILY_DIMENSION[family] }, prompt: { ...exercise.prompt, audio: undefined }, hiddenBeforeAnswer: [] };
      } else if (exercise.prompt.audio) {
        const stim = exercise.prompt.audio;
        const meta = audio?.scoringMetadata(stim, res.replays ?? 0);
        listening = scoreListening(stim, res.replays ?? 0, false, res, grading, meta);
        scoring = resultScoring(stim, listening);
      }
    }

    let rating: Rating | null = NO_EVENT_OUTCOMES.has(grading.outcome) || res.challenged ? null : gradingPort.ratingFor(grading, res);
    if (res.audioFailed) rating = null;
    return { exercise, evidenceExercise: b.exercise, family, response: res, grading, listening, scoring, rating, at };
  }

  function normalise(ev: GoEvent, cur: CurrentExercise, rating: Rating | null, result: Pick<ReviewResult, 'exerciseId' | 'family' | 'grading'>, index: number, quality?: 'none'): GoEvent {
    const e = clone(ev);
    e.id = `gr:${st.sessionId}:${index}:${e.kind}`;
    e.dedupeKey = `goreview:${st.sessionId}:${index}:${e.kind}`;
    e.learnerId = identity.learnerId;
    e.enrolmentId = identity.enrolmentId;
    e.producer = { ...e.producer, app: e.producer?.app ?? PRODUCER_APP, deviceId: identity.deviceId };
    e.subject = { ...e.subject, cardId: cur.planned.item.itemId, itemIds: [...new Set([...(e.subject?.itemIds ?? []), cur.planned.item.unitId])] };
    e.payload = { ...e.payload, rating, outcome: result.grading.outcome, exerciseId: result.exerciseId, family: result.family, ...('assessmentDimension' in e.payload ? { assessmentDimension: FAMILY_DIMENSION[result.family] } : {}) };
    if (quality) e.evidence = { ...(e.evidence ?? {}), quality, assisted: e.evidence?.assisted ?? false };
    return e;
  }

  async function answer(response: Response): Promise<ReviewResult> {
    if (st.status !== 'in-progress') throw new Error('the session is not in progress');
    const cur = await current();
    if (!cur) throw new Error('there is no current exercise');
    const a = await assess(cur, response);
    const index = cur.index;
    const resultId = `${st.sessionId}:${index}`;
    const item = cur.planned.item;

    const result: ReviewResult = {
      resultId, exerciseId: a.exercise.exerciseId, family: a.family, target: a.exercise.target, itemId: item.itemId,
      response: a.response, grading: a.grading, ...(a.scoring ? { scoring: a.scoring } : {}), at: a.at, deviceId: identity.deviceId,
      rating: a.rating, evidence: null,
    };

    let evidence: GoEvent | null = null;
    const claimable = !NO_EVENT_OUTCOMES.has(a.grading.outcome) && !a.response.audioFailed;
    if (claimable) {
      const raw = gradingPort.evidenceFor({ exercise: a.evidenceExercise, response: a.response, grading: a.grading, rating: a.rating, item, identity, at: a.at, ...(a.listening ? { listening: a.listening } : {}) });
      if (raw) evidence = normalise(raw, cur, a.rating, result, index, a.response.challenged ? 'none' : undefined);
    }
    if (evidence) {
      const issues = validateEvent(evidence);
      if (issues.length) throw new Error(`the evidence event is invalid (${issues.map((x) => `${x.path} ${x.message}`).join('; ')}); nothing was recorded`);
    }
    result.evidence = evidence;

    const events: GoEvent[] = [];
    if (evidence) {
      if (!inDeck(cur.planned)) {
        events.push(assertValidEvent(buildCardAdded({
          learnerId: identity.learnerId, enrolmentId: identity.enrolmentId, languageId: item.languageId,
          ...(item.varietyId !== undefined ? { varietyId: item.varietyId } : {}), at: st.plan.createdAt <= a.at ? st.plan.createdAt : a.at, deviceId: identity.deviceId,
          unitId: item.unitId, unitKind: item.unitKind, dimension: item.dimension, family: item.family, addedBy: item.addedBy,
          ...(item.reasons[0] ? { reason: item.reasons[0] } : {}), itemId: item.itemId,
        })));
      }
      events.push(evidence);
    }

    // RECORD FIRST. A throw here leaves the session exactly as it was.
    if (events.length) await record(events);

    st.results.push(result);
    st.index = index + 1;
    cache.delete(index);
    await save();
    return clone(result);
  }

  async function challenge(reason: string, opts: { keyIsWrong?: boolean } = {}): Promise<ReviewResult | undefined> {
    const idx = st.results.length - 1;
    const last = st.results[idx];
    if (!last || last.response.challenged) return last ? clone(last) : undefined;
    const at = now();
    const events: GoEvent[] = [];
    if (last.evidence) {
      const orig = last.evidence;
      const note: GoEvent = {
        ...clone(orig), id: `gr:${st.sessionId}:${idx}:challenge`, dedupeKey: `goreview:${st.sessionId}:${idx}:challenge`, at,
        correctionOf: orig.id, evidence: { quality: 'none', assisted: orig.evidence?.assisted ?? false },
        payload: { ...orig.payload, rating: null, challenged: true, challengeReason: reason.slice(0, 200) },
      };
      events.push(note);
    }
    if (opts.keyIsWrong) {
      const itemId = last.itemId;
      events.push({
        id: `gr:${st.sessionId}:${idx}:invalidated`, v: 2, learnerId: identity.learnerId, enrolmentId: identity.enrolmentId,
        languageId: last.target.languageId, ...(last.target.varietyId !== undefined ? { varietyId: last.target.varietyId } : {}), at,
        producer: { app: PRODUCER_APP, version: '0.1.0', deviceId: identity.deviceId, surface: 'review-session' },
        kind: 'ReviewItemInvalidated', subject: { cardId: itemId, itemIds: [last.target.unitId] },
        payload: { reason: 'analysis-invalidated', cardId: itemId },
        dedupeKey: `goreview:${st.sessionId}:${idx}:invalidated`, evidence: { quality: 'none' },
      });
    }
    for (const e of events) {
      const issues = validateEvent(e);
      if (issues.length) throw new Error(`invalid challenge event (${issues.map((x) => `${x.path} ${x.message}`).join('; ')})`);
    }
    if (events.length) await record(events);
    const updated: ReviewResult = {
      ...last, rating: null, response: { ...last.response, challenged: true }, evidence: events[0] && last.evidence ? events[0] : last.evidence,
    };
    st.results[idx] = updated;
    await save();
    return clone(updated);
  }

  return {
    sessionId,
    state: () => clone(st),
    skips: () => clone(st.skips),
    persistErrors: () => [...persistErrs],
    current,
    async preview(response) {
      const cur = await current();
      if (!cur) throw new Error('there is no current exercise');
      return (await assess(cur, response)).grading;
    },
    answer,
    async skip(reason = 'skipped by the learner') {
      if (st.status !== 'in-progress') return;
      const p = planned(st.index);
      if (!p) return;
      st.skips.push({ index: st.index, itemId: p.item.itemId, reason, at: now(), kind: 'learner' });
      cache.delete(st.index);
      st.index += 1;
      await save();
    },
    challenge,
    async finish() {
      if (st.status === 'in-progress') { st.status = 'finished'; st.finishedAt = now(); }
      await save();
      return clone(st);
    },
    async recover(id) {
      const saved = await getOne<PersistedSession>(persist, key(id));
      if (!saved) return false;
      st = clone(saved);
      st.skips ??= [];
      cache.clear();
      return true;
    },
  };
}
