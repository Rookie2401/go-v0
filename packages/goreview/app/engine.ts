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
import type { ItemControl, ReviewEngine } from './ports';
import { classFacts, isClassUnit } from './classEssentials';

export interface EngineOptions {
  builders: BuilderRegistry;
  evidenceFor: GradingPort['evidenceFor'];
  ratingFor: GradingPort['ratingFor'];
  /** The pack facts for a language, or undefined when the pack cannot supply them (the exercise is then not built). */
  factsFor?(languageId: string, api: RepositoryApi): FactsProvider | undefined;
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
  // Pack analyzers are language scoped, while their repository lookup is API scoped. Reuse the
  // provider only for the exact API client (the context keeps that client stable per service/token).
  const providers = new WeakMap<RepositoryApi, Map<string, FactsProvider>>();
  const warmFacts = new WeakMap<RepositoryApi, Map<string, { at: number; facts: Awaited<ReturnType<FactsProvider['factsFor']>> }>>();
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
    const cache = warmFacts.get(api);
    const key = factsKey(languageId, unitId, varietyId);
    const entry = cache?.get(key);
    cache?.delete(key); // successful intake facts are consumed exactly once by deck admission
    return entry && Date.now() - entry.at < WARM_FACTS_TTL_MS ? entry.facts ?? undefined : undefined;
  };

  return {
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
    primeFacts: (languageId, api, unitIds) => (factsOf(languageId, api) as FactsProvider & { prime?(ids: string[]): Promise<void> }).prime?.(unitIds) ?? Promise.resolve(),
    async exerciseAvailable(request) {
      const facts = takeWarmFacts(request.api, request.languageId, request.unitId, request.varietyId) ?? await factsOf(request.languageId, request.api).factsFor(request.unitId, request.languageId, request.varietyId);
      const builder = resolveBuilder(opts.builders, request.family);
      if (!facts || !builder) return false;
      const target = { unitId: request.unitId, unitKind: request.unitKind, languageId: request.languageId, dimension: request.dimension, ...(request.varietyId ? { varietyId: request.varietyId } : {}) };
      const context = { now: request.now, random: () => 0 };
      if (!builder.canBuild(target, facts, context)) return false;
      const built = await builder.build(target, facts, context);
      return !('unavailable' in built) && built.validation.ok && built.eligibility.eligible;
    },
    scheduler: (prefs, profile) => scheduler(prefs.desiredRetention, profile),
    // New grades carry their own exact profile. Unversioned legacy grades use
    // the supported 90% default, never a newly activated personal profile.
    foldDeck: (events, languageId, _prefs, at) => foldDeckItems(events, scheduler(0.9), { languageId, now: at }),

    async intake(req) {
      const facts = configuredFactsOf(req.prefs.languageId, req.api);
      if (facts) {
        const cache = warmFacts.get(req.api);
        for (const id of new Set([...req.candidates.map((c) => c.unitId), ...req.deck.map((item) => item.unitId)])) {
          if (cache) for (const key of cache.keys()) if (key.startsWith(`${req.prefs.languageId}\u0000`) && key.endsWith(`\u0000${id}`)) cache.delete(key);
        }
        const captured = new Map<string, Awaited<ReturnType<FactsProvider['factsFor']>>>();
        const capturing: FactsProvider = { ...facts, async factsFor(unitId, languageId, varietyId) {
          const value = await facts.factsFor(unitId, languageId, varietyId);
          if (value) captured.set(unitId, value); // never retain missing/failed facts
          return value;
        } };
        const out = await gatherCandidates({
          api: { candidates: async () => req.candidates, knowledge: async () => req.knowledge },
          facts: Object.assign(capturing, { prime: (ids: string[]) => (facts as FactsProvider & { prime?(ids: string[]): Promise<void> }).prime?.(ids) ?? Promise.resolve() }),
          audio: async () => req.audio, deck: req.deck, saved: req.saved, preferences: req.prefs, now: req.now, enrolmentId: '', limit: req.candidates.length || 1,
          readingSignals: req.events, secondaryPractice: req.secondaryPractice, intent: req.intent,
        });
        if (captured.size) {
          let cache = warmFacts.get(req.api);
          if (!cache) { cache = new Map(); warmFacts.set(req.api, cache); }
          for (const [key, entry] of cache) if (Date.now() - entry.at >= WARM_FACTS_TTL_MS) cache.delete(key);
          for (const [id, value] of captured) cache.set(factsKey(req.prefs.languageId, id, req.prefs.varietyId), { at: Date.now(), facts: value });
          while (cache.size > 256) cache.delete(cache.keys().next().value!);
        }
        return out;
      }
      // without pack facts the decision rests on the Repository's candidate alone; the session still refuses what cannot be built
      const byUnit = new Map(req.knowledge.map((k) => [k.unitId, k] as const));
      return req.candidates.map((candidate): IntakeOutcome => decideIntake({
        candidate, knowledge: byUnit.get(candidate.unitId), existing: req.deck, audio: req.audio, saved: req.saved, preferences: req.prefs, now: req.now,
        readingSignals: req.events, secondaryPractice: req.secondaryPractice, intent: req.intent,
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
