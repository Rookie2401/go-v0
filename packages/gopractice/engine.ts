/**
 * The one file that imports GoReview's modules and adapts them to the `ReviewEngine` port (ports.ts). Everything the
 * screens know about intake, scheduling, planning and the session runner comes through that port.
 *
 * The exercise builders and the evidence builder are injected (`EngineOptions`) so the shell does not decide which
 * families exist: `main.ts` hands over GoReview's registry and `evidenceFor`; a test hands over small fakes.
 */
import type { GoEvent, SchedulerProfile } from '../repository-contract/src';
import {
  applyControls, buildCardAdded, createFsrsScheduler, createSessionRunner, decideIntake, explainIntake, explainItem, foldDeckItems,
  gatherCandidates, measuresFor, planSession, reviewHistory, resolveBuilder,
} from '../goreview/src';
import type { BuilderRegistry, FactsProvider, GradingPort, IntakeOutcome } from '../goreview/src';
import type { RepositoryApi } from '../repository-service/src/api';
import type { ItemControl, ReviewEngine } from './ports';

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

export function createReviewEngine(opts: EngineOptions): ReviewEngine {
  const now = opts.now ?? (() => new Date().toISOString());
  const random = opts.random ?? Math.random;
  const scheduler = (desiredRetention: number, profile?: SchedulerProfile) => createFsrsScheduler({ desiredRetention,
    ...(profile ? { parameters: profile.parameters, maximumInterval: profile.maximumInterval } : {}) });
  const factsOf = (languageId: string, api: RepositoryApi): FactsProvider => opts.factsFor?.(languageId, api) ?? noFacts;

  return {
    factsFor: (unitId, languageId, api) => factsOf(languageId, api).factsFor(unitId, languageId),
    async exerciseAvailable(request) {
      const facts = await factsOf(request.languageId, request.api).factsFor(request.unitId, request.languageId);
      const builder = resolveBuilder(opts.builders, request.family);
      if (!facts || !builder) return false;
      const target = { unitId: request.unitId, unitKind: request.unitKind, languageId: request.languageId, dimension: request.dimension };
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
      const facts = opts.factsFor?.(req.prefs.languageId, req.api);
      if (facts) {
        return gatherCandidates({
          api: { candidates: async () => req.candidates, knowledge: async () => req.knowledge },
          facts, audio: async () => req.audio, deck: req.deck, saved: req.saved, preferences: req.prefs, now: req.now, enrolmentId: '', limit: req.candidates.length || 1,
        });
      }
      // without pack facts the decision rests on the Repository's candidate alone; the session still refuses what cannot be built
      const byUnit = new Map(req.knowledge.map((k) => [k.unitId, k] as const));
      return req.candidates.map((candidate): IntakeOutcome => decideIntake({
        candidate, knowledge: byUnit.get(candidate.unitId), existing: req.deck, audio: req.audio, saved: req.saved, preferences: req.prefs, now: req.now,
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
      observedReviewSeconds: req.observedReviewSeconds,
    }),

    startSession(start) {
      const runner = createSessionRunner({
        plan: start.plan, builders: opts.builders, facts: factsOf(start.ctx.languageId, start.api),
        grading: { ratingFor: opts.ratingFor, evidenceFor: opts.evidenceFor },
        ...(start.assessment ? { audio: start.assessment } : {}),
        scheduler: scheduler(start.prefs.desiredRetention),
        schedulerForItem: () => scheduler(start.prefs.desiredRetention, start.schedulerProfile),
        identity: { learnerId: start.ctx.learnerId, enrolmentId: start.ctx.enrolmentId, deviceId: start.ctx.deviceId },
        record: start.record, persist: start.persist, now, random, committedEvents: start.committedEvents,
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
        undo: (resultId, reason) => runner.undo(resultId, reason ?? 'learner corrected review grade'),
      };
    },

    explainItem: (item, events) => explainItem(item, reviewHistory(events, { itemId: item.itemId })),
    itemHistory: (events, itemId) => reviewHistory(events, { itemId }).items[itemId],
    measures: (events, unitId) => measuresFor(events, unitId),
  };
}
