import { validateExercise } from '../src/exercises/validate';
import { schedulerForReviewProfile } from '../src/scheduler/replay-profile';
/**
 * The one file that imports GoReview's modules and adapts them to the `ReviewEngine` port (ports.ts). Everything the
 * screens know about intake, scheduling, planning and the session runner comes through that port.
 *
 * The exercise builders and the evidence builder are injected (`EngineOptions`) so the shell does not decide which
 * families exist: `main.ts` hands over GoReview's registry and `evidenceFor`; a test hands over small fakes.
 */
import type { GoEvent, SchedulerProfile } from '../../repository-contract/src';
import {
  applyControls, buildCardAdded, createFsrsScheduler, createSessionRunner, decideIntake, explainIntake, explainItem, foldDeckItems,
  gatherCandidates, measuresFor, planSession, reviewHistory, resolveBuilder,
} from '../src';
import type { BuilderRegistry, FactsProvider, GradingPort, IntakeOutcome, Exercise } from '../src';
import type { RepositoryApi } from '../../repository-service/src/api';
import type { DeckItem } from '../src/types';
import type { ExerciseReadiness, ExerciseReadinessRequest, ItemControl, RecoveryRequest, ReviewEngine } from './ports';
import { classFacts, isClassUnit } from './classEssentials';
import { recoverCandidates } from './recoveredCandidates';
import { createReviewEligibilityContext } from '../src/planner/eligibility';
import { indexPracticeEvidence } from '../src/planner/learning-policy';

/**
 * What a fold of the learner's log is valid for: the log's length, its first, middle and last event ids (the signature the freshness checks use).
 * An event appended or removed changes it; nothing else about the log can change under the same signature.
 */
export const eventHead = (events: readonly GoEvent[]): string =>
  `${events.length}|${events[0]?.id ?? ''}|${events[events.length >> 1]?.id ?? ''}|${events.at(-1)?.id ?? ''}`;
/** A snooze ends at or before the instant the deck is read at; this instant is before any snooze could have ended, so the fold keeps every snooze. */
const NO_SNOOZE_ENDED = '0001-01-01T00:00:00.000Z';

export interface EngineOptions {
  builders: BuilderRegistry;
  evidenceFor: GradingPort['evidenceFor'];
  ratingFor: GradingPort['ratingFor'];
  /** The pack facts for a language, or undefined when the pack cannot supply them (the exercise is then not built). */
  factsFor?(languageId: string, api: RepositoryApi): FactsProvider | undefined;
  /** Starts fetching a language's analyser in the background (the review build loads each language's analyser as its own chunk). */
  warmLanguage?(languageId: string): void;
  now?: () => string;
  random?: () => number;
}

const noFacts: FactsProvider = { factsFor: async () => undefined };
const WARM_FACTS_TTL_MS = 30_000;

export function createReviewEngine(opts: EngineOptions): ReviewEngine {
  const now = opts.now ?? (() => new Date().toISOString());
  const random = opts.random ?? Math.random;
  const scheduler = (desiredRetention: number, profile?: SchedulerProfile) => {
    const fallback = createFsrsScheduler({desiredRetention});
    const resolved = schedulerForReviewProfile(profile, fallback);
    if ('error' in resolved) throw new Error(resolved.error);
    return resolved.scheduler;
  };
  /**
   * One fold of the log per event head (2026-11-10: a session folded the whole log about ten times per answered card). The fold depends on `now`
   * only through one rule (a snooze whose end is at or before `now` is over: deck.ts, last pass), so it is made once with every snooze kept and
   * that rule is applied to each reading; the items are the same as `foldDeckItems(events, scheduler(retention), opts)`. Holds the latest head
   * only (a different head clears it), so it never grows, and never serves a fold of an older log. The items are shared: read, never mutate.
   *
   * The next head is usually the last one plus a few events at the end (an answer). The fold is per card (a card's item is a function of that
   * card's own events: ordering, retractions, convergence and conflicts are all scoped by card id), so then only the cards those events name are
   * folded again, from their own events, and every other item is the object the last head had. Anything the premise does not cover folds the
   * whole log, as before: the log is not the last one plus a suffix (an older event arrived, one went, ids changed), an id repeats, a time cannot
   * be read, an event brings a second learner, an event names an event of another card, or the key was not read at the last head.
   */
  const shared = { head: '', folds: new Map<string, DeckItem[]>() };
  interface LangState {
    head: string; ids: string[]; n: number; learners: Set<string>; byCard: Map<string, GoEvent[]>;
    /** every event of the language by id, with the card it names ('' for none) */
    cardById: Map<string, string>;
    /** the events other events name by id (a correction's target, an invalidation's review, a review's predecessor, a repair's invalidation): named id -> the cards naming it */
    refs: Map<string, Set<string>>;
    /** a repeated id, an unreadable time, or an event naming another card's event was seen: only whole-log folds are exact for this log */
    unsafe: boolean;
    /** the log length of the previous state, when this one was reached by adding events at the end that change nothing but cards (else undefined) */
    from: number | undefined; touched: Set<string>;
  }
  const langs = new Map<string, LangState>();
  interface KeyState { lang: LangState; n: number; items: Map<string, DeckItem>; sorted: DeckItem[] }
  const keyStates = new Map<string, KeyState>();
  const cardOf = (e: GoEvent): string | undefined => { const id = e.subject?.cardId; return typeof id === 'string' && id.length > 0 ? id : undefined; };
  const sortedItems = (m: Map<string, DeckItem>): DeckItem[] => [...m.values()].sort((a, b) => Date.parse(a.addedAt) - Date.parse(b.addedAt) || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
  const addLangEvent = (s: LangState, e: GoEvent, language: string, touched: Set<string> | undefined): void => {
    if (e.languageId !== language) return;
    if (Number.isNaN(Date.parse(e.at))) { s.unsafe = true; return; }
    const card = cardOf(e);
    if (s.cardById.has(e.id)) s.unsafe = true; else s.cardById.set(e.id, card ?? '');
    if (!s.learners.has(e.learnerId)) { s.learners.add(e.learnerId); if (touched) s.from = undefined; }
    // Where the fold reads across cards: an event names another event by id, and deck.ts looks that id up in the WHOLE log. An invalidation's
    // `reviewEventId` is read whatever card it is of; a review's `expectedPreviousReviewId` is checked against every card's retractions; a
    // correction and a facts repair name their targets the same way. Every app writes these within one card. When one names an event of
    // ANOTHER card (malformed, but a log may hold it; found by the random sessions of test/loading/goreview.fold.random.test.ts), a card's item
    // is no longer a function of that card's own events: whole-log folds only. The named event may also arrive after the one naming it.
    const pointedAtBy = s.refs.get(e.id);
    if (pointedAtBy && [...pointedAtBy].some(c => c !== (card ?? ''))) s.unsafe = true;
    if (card !== undefined) {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      for (const target of [e.correctionOf, p.reviewEventId, p.expectedPreviousReviewId, p.invalidationEventId]) {
        if (typeof target !== 'string') continue;
        const targetCard = s.cardById.get(target);
        if (targetCard !== undefined && targetCard !== card) s.unsafe = true;
        const cards = s.refs.get(target);
        if (cards) cards.add(card); else s.refs.set(target, new Set([card]));
      }
    }
    if (card === undefined) return;
    const group = s.byCard.get(card);
    if (group) group.push(e); else s.byCard.set(card, [e]);
    touched?.add(card);
  };
  function langState(events: readonly GoEvent[], language: string, head: string): LangState {
    const prev = langs.get(language);
    if (prev?.head === head) return prev;
    if (prev && !prev.unsafe && events.length >= prev.n) {
      let same = true;
      for (let i = 0; i < prev.n; i++) if (events[i]?.id !== prev.ids[i]) { same = false; break; }
      if (same) {
        const touched = new Set<string>();
        prev.from = prev.n;
        for (let i = prev.n; i < events.length; i++) { addLangEvent(prev, events[i], language, touched); prev.ids.push(events[i].id); }
        prev.n = events.length; prev.head = head; prev.touched = touched;
        if (prev.unsafe) prev.from = undefined;
        return prev;
      }
    }
    const s: LangState = { head, ids: events.map(e => e.id), n: events.length, learners: new Set(), byCard: new Map(), cardById: new Map(), refs: new Map(), unsafe: false, from: undefined, touched: new Set() };
    for (const e of events) addLangEvent(s, e, language, undefined);
    langs.set(language, s);
    return s;
  }
  function sharedFold(events: readonly GoEvent[], retention: number, opts: { languageId?: string; learnerId?: string; now: string }): DeckItem[] {
    const atMs = Date.parse(opts.now);
    // what the fold itself refuses or cannot share (a bad instant, no language) is left to the fold
    if (Number.isNaN(atMs) || opts.languageId === undefined) return foldDeckItems(events, scheduler(retention), opts);
    const head = eventHead(events);
    if (shared.head !== head) { shared.head = head; shared.folds.clear(); }
    const language = opts.languageId;
    const state = langState(events, language, head);
    const learners = state.learners;
    // a learner filter that removes nothing is the same fold as none; a log of several learners without one is the fold's own error
    const scope = opts.learnerId === undefined ? (learners.size > 1 ? undefined : '*')
      : (learners.size === 0 || (learners.size === 1 && learners.has(opts.learnerId))) ? '*' : opts.learnerId;
    if (scope === undefined) return foldDeckItems(events, scheduler(retention), opts);
    const key = `${retention}|${language}|${scope}`;
    let items = shared.folds.get(key);
    if (!items) {
      const sched = scheduler(retention);
      const last = keyStates.get(key);
      if (scope === '*' && !state.unsafe && last && last.lang === state && state.from !== undefined && last.n === state.from) {
        try {
          const refolded = [...state.touched].map(card => [card, foldDeckItems(state.byCard.get(card) ?? [], sched, { languageId: language, now: NO_SNOOZE_ENDED })] as const);
          for (const [card, folded] of refolded) if (folded.length) last.items.set(card, folded[0]); else last.items.delete(card);
        } catch (error) { keyStates.delete(key); throw error; }
        if (state.touched.size) last.sorted = sortedItems(last.items);
        last.n = state.n;
        items = last.sorted;
      } else {
        items = foldDeckItems(events, sched, { languageId: language, ...(scope === '*' ? {} : { learnerId: scope }), now: NO_SNOOZE_ENDED });
        if (scope === '*' && !state.unsafe) keyStates.set(key, { lang: state, n: state.n, items: new Map(items.map(i => [i.itemId, i])), sorted: items });
        else keyStates.delete(key);
      }
      shared.folds.set(key, items);
    }
    let out = items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status !== 'snoozed' || item.snoozedUntil === undefined || !(Date.parse(item.snoozedUntil) <= atMs)) continue;
      if (out === items) out = [...items];
      const { snoozedUntil: _ended, ...rest } = item;
      out[i] = { ...rest, status: 'active' };
    }
    return out;
  }
  // Pack analyzers are language scoped, while their repository lookup is API scoped. Reuse the
  // provider only for the exact API client (the context keeps that client stable per service/token).
  const providers = new WeakMap<RepositoryApi, Map<string, FactsProvider>>();
  const warmFacts = new WeakMap<RepositoryApi, Map<string, { at: number; facts: Awaited<ReturnType<FactsProvider['factsFor']>> }>>();
  const stagedFacts = new WeakMap<RepositoryApi, Map<string, { at: number; facts: Awaited<ReturnType<FactsProvider['factsFor']>> }>>();
  /** Class Essentials phrases are answered from the deck's own table; every other unit goes to the pack, as before. */
  const withClass = (base: FactsProvider): FactsProvider => ({ ...base, factsFor: async (unitId, languageId, varietyId) => (isClassUnit(unitId) ? classFacts(unitId, languageId) : base.factsFor(unitId, languageId, varietyId)) });
  const factsOf = (languageId: string, api: RepositoryApi): FactsProvider => withClass(packFactsOf(languageId, api));
  const packFactsOf = (languageId: string, api: RepositoryApi): FactsProvider => {
    let byLanguage = providers.get(api);
    if (!byLanguage) { byLanguage = new Map(); providers.set(api, byLanguage); }
    if (!byLanguage.has(languageId)) {
      const configured = opts.factsFor?.(languageId, api);
      // A missing provider can become available later (for example after a pack is loaded),
      // so only positive provider lookups are memoized.
      if (configured) byLanguage.set(languageId, configured);
      else return noFacts;
    }
    return byLanguage.get(languageId)!;
  };
  const configuredFactsOf = (languageId: string, api: RepositoryApi): FactsProvider | undefined => opts.factsFor?.(languageId, api);
  const factsKey = (languageId: string, unitId: string, varietyId?: string): string => `${languageId}\u0000${varietyId ?? ''}\u0000${unitId}`;
  const takeWarmFacts = (api: RepositoryApi, languageId: string, unitId: string, varietyId?: string): Awaited<ReturnType<FactsProvider['factsFor']>> | undefined => {
    // Admission may use Object.create(api) as its provider scope; intake's
    // one-shot built facts still belong to the underlying API identity.
    const parent = Object.getPrototypeOf(api) as RepositoryApi | null;
    const cache = warmFacts.get(api) ?? (parent && typeof parent.units === 'function' && typeof parent.unit === 'function' ? warmFacts.get(parent) : undefined);
    const key = factsKey(languageId, unitId, varietyId);
    const entry = cache?.get(key);
    cache?.delete(key); // successful intake facts are consumed exactly once by deck admission
    return entry && Date.now() - entry.at < WARM_FACTS_TTL_MS ? entry.facts ?? undefined : undefined;
  };
  const takeStagedFacts = (api: RepositoryApi, languageId: string, unitId: string, varietyId?: string): Awaited<ReturnType<FactsProvider['factsFor']>> | undefined => {
    const cache = stagedFacts.get(api);
    const key = factsKey(languageId, unitId, varietyId);
    const entry = cache?.get(key);
    cache?.delete(key);
    return entry && Date.now() - entry.at < WARM_FACTS_TTL_MS ? entry.facts ?? undefined : undefined;
  };
  const exerciseReadiness = async (request: ExerciseReadinessRequest): Promise<ExerciseReadiness> => {
    try {
      const facts = takeWarmFacts(request.api, request.languageId, request.unitId, request.varietyId)
        ?? await factsOf(request.languageId, request.api).factsFor(request.unitId, request.languageId, request.varietyId);
      if (!facts) return { available: false, reason: 'Verified facts for this word are unavailable.', retryable: true };
      if (facts.unit.unitId !== request.unitId || facts.unit.languageId !== request.languageId)
        return { available: false, reason: 'The current facts belong to another word or language.', retryable: true };
      if (facts.status === 'invalidated' || facts.status === 'conflicted' || facts.status === 'requires-review')
        return { available: false, reason: 'The source reading is invalidated, conflicted, or awaiting review.', retryable: false };
      const builder = resolveBuilder(opts.builders, request.family);
      if (!builder) return { available: false, reason: `No builder is available for ${request.family}.`, retryable: false };
      const target = { unitId: request.unitId, unitKind: request.unitKind, languageId: request.languageId, dimension: request.dimension, ...(request.varietyId ? { varietyId: request.varietyId } : {}) };
      const context = { now: request.now, random: () => 0 };
      const canBuild = builder.canBuild(target, facts, context);
      const built = await builder.build(target, facts, context);
      if ('unavailable' in built) return { available: false, reason: built.reason, retryable: false };
      if (!canBuild) return { available: false, reason: 'The exercise builder rejected the current source facts.', retryable: false };
      const validation = validateExercise(built);
      if (!built.eligibility.eligible || !built.validation.ok || !validation.ok)
        return { available: false, reason: 'The source material did not pass exercise validation.', retryable: false };
      return { available: true };
    } catch (error) {
      return { available: false, reason: error instanceof Error ? error.message : 'The source facts could not be checked.', retryable: true };
    }
  };

  return {
    warmLanguage: (languageId) => { try { opts.warmLanguage?.(languageId); } catch { /* met again when the language is first used */ } },
    canRecoverCandidates: (languageId, api) => configuredFactsOf(languageId, api) !== undefined,
    async recoverCandidates(request: RecoveryRequest) {
      const base = configuredFactsOf(request.languageId, request.api);
      if (!base) return { candidates: [], complete: false, note: `The ${request.languageId} pack facts are unavailable.` };
      const captured = new Map<string, Awaited<ReturnType<FactsProvider['factsFor']>>>();
      const capturing: FactsProvider & { prime?(ids: string[], varietyId?: string): Promise<void>; clearPrime?(): void } = {
        async factsFor(unitId, languageId, varietyId) {
          const value = await base.factsFor(unitId, languageId, varietyId);
          if (value) captured.set(factsKey(languageId, unitId, varietyId), value);
          return value;
        },
        prime: (ids, varietyId) => (base as FactsProvider & { prime?(unitIds: string[], varietyId?: string): Promise<void> }).prime?.(ids, varietyId) ?? Promise.resolve(),
        clearPrime: () => (base as FactsProvider & { clearPrime?(): void }).clearPrime?.(),
      };
      const recovered = await recoverCandidates({ ...request, facts: capturing });
      if (captured.size) {
        let cache = stagedFacts.get(request.api);
        if (!cache) { cache = new Map(); stagedFacts.set(request.api, cache); }
        for (const [key, facts] of captured) cache.set(key, { at: Date.now(), facts });
      }
      return recovered;
    },
    async repairMaterial(request) {
      const prepared=new Set<NonNullable<Exercise['prompt']['audio']>>();
      let handedOff=false,released=false;
      const release=()=>{if(released)return;released=true;for(const stimulus of prepared)request.assessment?.releaseStimulus?.(stimulus);};
      const audio=request.assessment?{...request.assessment,prepareStimulus:async(...args:Parameters<NonNullable<typeof request.assessment>['prepareStimulus']>)=>{
        const stimulus=await request.assessment!.prepareStimulus(...args);
        if(!('unavailable' in stimulus))prepared.add(stimulus);
        return stimulus;
      }}:undefined;
      try {
        const item=request.item;
        const facts=await factsOf(item.languageId,request.api).factsFor(item.unitId,item.languageId,item.varietyId);
        const builder=resolveBuilder(opts.builders,item.family);
        if(!facts||!builder)return {unavailable:'Verified study material or its exercise builder is unavailable.'};
        if(facts.unit.unitId!==item.unitId||facts.unit.languageId!==item.languageId)
          return {unavailable:'Current study facts belong to another unit or language.'};
        if(facts.status==='invalidated'||facts.status==='conflicted'||facts.analyses.length>0&&facts.analyses.every(a=>a.status==='invalidated'))
          return {unavailable:'The current facts are invalidated or conflicted; they cannot be used for study or repair.'};
        const target={unitId:item.unitId,unitKind:item.unitKind,languageId:item.languageId,dimension:item.dimension,...(item.varietyId?{varietyId:item.varietyId}:{})};
        const context={now:request.now,random:()=>0,...(audio?{audio}:{})};
        if(!builder.canBuild(target,facts,context))return {unavailable:'Current facts cannot build a valid exercise for this skill.'};
        const exercise=await builder.build(target,facts,context);
        if('unavailable' in exercise)return {unavailable:exercise.reason};
        if(exercise.prompt.audio)prepared.add(exercise.prompt.audio);
        if(exercise.family!==item.family||exercise.target.unitId!==item.unitId||exercise.target.languageId!==item.languageId||exercise.target.dimension!==item.dimension)
          return {unavailable:'Rebuilt study material does not match this card and skill.'};
        const validation=validateExercise(exercise);
        if(!exercise.eligibility.eligible||!exercise.validation.ok||!validation.ok)
          return {unavailable:'Current material did not pass exercise validation: '+[...exercise.validation.issues,...validation.issues].join('; ')};
        handedOff=true;return {facts,exercise,release};
      } catch(error){return {unavailable:error instanceof Error?error.message:'Study material could not be rebuilt.'};}
      finally{if(!handedOff)release();}
    },
    factsFor: (unitId, languageId, api) => factsOf(languageId, api).factsFor(unitId, languageId),
    // the pack's provider batches unit reads (prime); a provider without it answers one by one, as before
    primeFacts: (languageId, api, unitIds, varietyId) => (factsOf(languageId, api) as FactsProvider & { prime?(ids: string[], varietyId?: string): Promise<void> }).prime?.(unitIds, varietyId) ?? Promise.resolve(),
    clearPrimedFacts: (languageId, api) => (factsOf(languageId, api) as FactsProvider & { clearPrime?(): void }).clearPrime?.(),
    exerciseReadiness,
    exerciseAvailable: async request => (await exerciseReadiness(request)).available,
    scheduler: (prefs, profile) => scheduler(prefs.desiredRetention, profile),
    // New grades carry their own exact profile. Unversioned legacy grades use
    // the supported 90% default, never a newly activated personal profile.
    foldDeck: (events, languageId, _prefs, at) => foldDeckItems(events, scheduler(0.9), { languageId, now: at }),
    foldDeckShared: (events, languageId, _prefs, at) => sharedFold(events, 0.9, { languageId, now: at }),

    async intake(req) {
      // Intake starts a new facts snapshot. Unused one-shot values from the last
      // dashboard/session must not be consumed as if they belonged to this pass.
      warmFacts.get(req.api)?.clear();
      const facts = configuredFactsOf(req.prefs.languageId, req.api);
      if (facts) {
        const captured = new Map<string, Awaited<ReturnType<FactsProvider['factsFor']>>>();
        const capturing: FactsProvider & { clearPrime?(): void; prime?(ids: string[], varietyId?: string): Promise<void> } = { ...facts, async factsFor(unitId, languageId, varietyId) {
          const value = takeStagedFacts(req.api, languageId, unitId, varietyId) ?? await facts.factsFor(unitId, languageId, varietyId);
          if (value) captured.set(unitId, value); // never retain missing/failed facts
          return value;
        }, clearPrime: () => (facts as FactsProvider & { clearPrime?(): void }).clearPrime?.() };
        const out = await gatherCandidates({
          api: { candidates: async () => req.candidates, knowledge: async () => req.knowledge },
          facts: Object.assign(capturing, {
            prime: (ids: string[], varietyId?: string) => (facts as FactsProvider & { prime?(ids: string[], varietyId?: string): Promise<void> }).prime?.(ids, varietyId) ?? Promise.resolve(),
            clearPrime: () => (facts as FactsProvider & { clearPrime?(): void }).clearPrime?.(),
          }),
          audio: async () => req.audio, deck: req.deck, saved: req.saved, preferences: req.prefs, now: req.now, enrolmentId: '', limit: req.candidates.length || 1,
          readingSignals: req.events, secondaryPractice: req.secondaryPractice, intent: req.intent,
        });
        if (captured.size) {
          let cache = warmFacts.get(req.api);
          if (!cache) { cache = new Map(); warmFacts.set(req.api, cache); }
          const rankedIds = out.filter(o => o.proposed).sort((a,b) => b.candidate.score - a.candidate.score || a.unitId.localeCompare(b.unitId)).map(o => o.unitId);
          const stored = new Set<string>();
          for (const id of [...rankedIds, ...captured.keys()]) {
            if (stored.has(id) || !captured.has(id)) continue;
            stored.add(id);
            cache.set(factsKey(req.prefs.languageId, id, req.prefs.varietyId), { at: Date.now(), facts: captured.get(id)! });
            if (cache.size >= 256) break; // keep the highest-ranked build candidates for prepareAdmissions
          }
        }
        return out;
      }
      // without pack facts the decision rests on the Repository's candidate alone; the session still refuses what cannot be built
      const byUnit = new Map(req.knowledge.map((k) => [k.unitId, k] as const));
      // the history is read once for every candidate, as gatherCandidates does (each decision otherwise re-selects the whole history)
      const eligibilityContext = createReviewEligibilityContext(req.deck, req.events ?? [], req.now);
      const practiceEvidenceByUnit = indexPracticeEvidence(eligibilityContext.selectedReviewEvidence.events);
      return req.candidates.map((candidate): IntakeOutcome => decideIntake({
        candidate, knowledge: byUnit.get(candidate.unitId), existing: req.deck, audio: req.audio, saved: req.saved, preferences: req.prefs, now: req.now,
        readingSignals: req.events, secondaryPractice: req.secondaryPractice, intent: req.intent,
        automaticFailureUnits: eligibilityContext.automaticFailureUnits, practiceEvidenceByUnit, eligibilityContext,
      }));
    },
    explainIntake,

    cardAdded: (ctx, item, addedBy) => buildCardAdded({
      learnerId: ctx.learnerId, enrolmentId: ctx.enrolmentId, languageId: ctx.languageId, ...(ctx.varietyId ? { varietyId: ctx.varietyId } : {}),
      at: ctx.now, deviceId: ctx.deviceId, producerVersion: ctx.appVersion,
      unitId: item.unitId, unitKind: item.unitKind, dimension: item.dimension, family: item.family, addedBy, ...(item.reasons[0] ? { reason: item.reasons[0] } : {}),
    }),

    controlEvent(ctx, item, control: ItemControl): GoEvent | undefined {
      const controls = control.kind === 'snooze' ? { snooze: [{ itemId: item.itemId, until: control.until }] }
        : control.kind === 'suspend' ? { suspend: [item.itemId] }
          : control.kind === 'dismiss' ? { dismiss: [item.itemId] } : { resume: [item.itemId] };
      return applyControls([item], controls, { learnerId: ctx.learnerId, enrolmentId: ctx.enrolmentId, deviceId: ctx.deviceId, now: ctx.now, ...(ctx.varietyId ? { varietyId: ctx.varietyId } : {}) }).events[0];
    },

    plan: (req) => planSession({
      deck: req.deck, intake: req.intake, preferences: req.prefs, audio: req.audio, scheduler: scheduler(req.prefs.desiredRetention, req.schedulerProfile), now: req.now,
      ...(req.recentHelp ? { recentHelp: req.recentHelp } : {}), random,
      knowledge: req.knowledge, readingSignals: req.readingSignals,
      observedReviewSeconds: req.observedReviewSeconds, intent: req.intent, learnerId: req.learnerId, remediationItemIds:req.remediationItemIds,
      ...(req.fillPool ? { fillPool: req.fillPool } : {}),
    }),

    startSession(start) {
      const runner = createSessionRunner({
        plan: start.plan, preferences:start.prefs, builders: opts.builders, facts: factsOf(start.ctx.languageId, start.api),
        grading: { ratingFor: opts.ratingFor, evidenceFor: opts.evidenceFor },
        ...(start.assessment ? { audio: start.assessment } : {}),
        scheduler: scheduler(start.prefs.desiredRetention),
        schedulerForItem: () => scheduler(start.prefs.desiredRetention, start.schedulerProfile),
        identity: { learnerId: start.ctx.learnerId, enrolmentId: start.ctx.enrolmentId, deviceId: start.ctx.deviceId },
        record: start.record, persist: start.persist, now, random, committedEvents: start.committedEvents, canPresent: start.canPresent,
        fold: (events, _scheduler, foldOpts) => sharedFold(events, start.prefs.desiredRetention, foldOpts),
      });
      return {
        plan: start.plan,
        current: async () => (await runner.current()) ?? undefined,
        preview: (response) => runner.preview(response),
        answer: (response) => runner.answer(response),
        skip: (reason) => runner.skip(reason),
        skips: () => runner.skips().map((s) => ({ itemId: s.itemId, reason: s.reason, kind: s.kind })),
        state: () => runner.state(),
        finish: () => runner.finish(),
        recover: (sessionId) => runner.recover(sessionId),
        undo: (resultId, reason, opts) => runner.undo(resultId, reason ?? 'learner corrected review grade', opts),
      };
    },

    explainItem: (item, events) => explainItem(item, reviewHistory(events, { itemId: item.itemId })),
    itemHistory: (events, itemId) => reviewHistory(events, { itemId }).items[itemId],
    measures: (events, unitId) => measuresFor(events, unitId),
  };
}
