import { describe, expect, it } from 'vitest';
import { createMemoryArea } from '../../../packages/repository-sync/src/area';
import { listRecoverable, createSessionRunner, summarize } from '../../../packages/goreview/src/session/runner';
import type { RunnerDeps } from '../../../packages/goreview/src/session/runner';
import { foldDeck } from '../../../packages/goreview/src/scheduler/deck';
import { fakeScheduler } from '../intake/fixtures';
import {
  clock, factsProvider, fakeAudioSource, fakeBuilders, fakeGrading, IDENTITY, makePlan, MISSING, queueRecorder, response, right, simpleRecorder,
  syntheticVoice, wrong, validateEvent,
} from './helpers';
import type { BuilderLog } from './helpers';

function setup(over: Partial<RunnerDeps> = {}, log: BuilderLog = { builds: [], grades: 0 }) {
  const rec = simpleRecorder();
  const persist = createMemoryArea();
  const deps: RunnerDeps = {
    plan: makePlan(), builders: fakeBuilders(log), facts: factsProvider, audio: fakeAudioSource(), scheduler: fakeScheduler,
    identity: IDENTITY, record: rec.record, persist, now: clock(), random: () => 0.5, ...over,
  };
  return { deps, rec, persist, log, runner: createSessionRunner(deps) };
}

describe('answer: record before advancing', () => {
  it('grades, rates, records one valid event with deterministic ids, then advances and persists', async () => {
    const { runner, rec, persist } = setup();
    const cur = await runner.current();
    expect(cur?.index).toBe(0);
    expect(cur?.total).toBe(3);
    const r = await runner.answer(right());
    expect(r.grading.outcome).toBe('correct');
    expect(r.rating).toBe(3);
    expect(r.evidence?.kind).toBe('CardReviewed');
    expect(r.evidence?.subject.cardId).toBe(r.itemId);
    expect(r.evidence?.subject.itemIds).toEqual([r.target.unitId]);
    expect(r.evidence?.payload).toMatchObject({ rating: 3, outcome: 'correct', exerciseId: r.exerciseId });
    expect(r.evidence?.id).toBe(`gr:${runner.sessionId}:0:CardReviewed`);
    expect(validateEvent(r.evidence!)).toEqual([]);
    expect(rec.batches).toHaveLength(1);
    expect(runner.state().index).toBe(1);
    expect(runner.state().results).toHaveLength(1);
    const saved = (await persist.get(`goreview:session:${runner.sessionId}`))[`goreview:session:${runner.sessionId}`] as { index: number };
    expect(saved.index).toBe(1);
  });

  it('persists bounded active review duration as metadata without changing the grade', async () => {
    const { runner, rec } = setup();
    const result = await runner.answer(right({ reviewSeconds: 42.5 }));
    expect(result.response.reviewSeconds).toBe(42.5);
    expect(result.rating).toBe(3);
    expect(rec.all()[0].payload).toHaveProperty('reviewSeconds', 42.5);
    expect(validateEvent(rec.all()[0])).toEqual([]);
  });

  it.each([0, -1, 901, Number.NaN, Number.POSITIVE_INFINITY])('omits invalid review duration %s from event metadata', async (reviewSeconds) => {
    const { runner, rec } = setup();
    await runner.answer(right({ reviewSeconds }));
    expect(rec.all()[0].payload).not.toHaveProperty('reviewSeconds');
    expect(rec.all()[0].payload).toHaveProperty('rating', 3);
  });

  it('the event is recorded BEFORE the session state is persisted', async () => {
    const order: string[] = [];
    const base = createMemoryArea();
    const persist = { ...base, set: async (i: Record<string, unknown>) => { order.push('persist'); return base.set(i); } };
    const { runner } = setup({ persist, record: async () => { order.push('record'); } });
    await runner.answer(right());
    expect(order).toEqual(['persist', 'record', 'persist']);
  });

  it('if record throws, nothing advanced: same exercise, no result, nothing persisted, and a retry works', async () => {
    let fail = true;
    const rec = simpleRecorder();
    const { runner, persist } = setup({ record: async (e) => { if (fail) throw new Error('queue full'); await rec.record(e); } });
    const first = await runner.current();
    await expect(runner.answer(right())).rejects.toThrow('queue full');
    expect(runner.state().index).toBe(0);
    expect(runner.state().results).toEqual([]);
    expect(await persist.list('goreview:session:')).toHaveLength(1); // the untouched initial state is recoverable
    expect((await runner.current())?.exercise.exerciseId).toBe(first?.exercise.exerciseId);
    fail = false;
    const r = await runner.answer(right());
    expect(r.rating).toBe(3);
    expect(rec.batches).toHaveLength(1);
    expect(runner.state().index).toBe(1);
  });

  it('a persistence failure before the first exercise blocks the attempt so the session can be recovered safely', async () => {
    const base = createMemoryArea();
    const persist = { ...base, set: async () => { throw new Error('disk full'); } };
    const { runner, rec } = setup({ persist });
    await expect(runner.answer(right())).rejects.toThrow('could not save the session before showing an exercise');
    expect(rec.batches).toHaveLength(0);
    expect(runner.state().index).toBe(0);
    expect(runner.persistErrors()).toEqual(['disk full']);
  });

  it('a page that died after record is repaired by deterministic ids: re-answering is a duplicate in the queue, not a second observation', async () => {
    const q = queueRecorder();
    const base = createMemoryArea();
    let writes = 0;
    const dead = { ...base, set: async (items: Record<string, unknown>) => {
      writes += 1;
      if (writes > 1) throw new Error('page died');
      return base.set(items);
    } }; // the initial state reached storage; the post-record checkpoint did not
    const plan = makePlan();
    const a = setup({ plan, record: q.record, persist: dead, now: clock() }).runner;
    await a.answer(right());
    const b = setup({ plan, record: q.record, now: clock() }).runner;
    await b.answer(right());
    expect(await q.queue.size()).toBe(1); // the same event id twice → one row
  });

  it('is incorrect when wrong: rating 1 (Again) and an incorrect event', async () => {
    const { runner } = setup();
    const r = await runner.answer(wrong());
    expect(r.grading.outcome).toBe('incorrect');
    expect(r.rating).toBe(1);
    expect(r.evidence?.payload).toMatchObject({ correct: false, rating: 1 });
  });

  it('events recorded by a session fold into the deck: the review advances the schedule', async () => {
    const { runner, rec } = setup();
    await runner.answer(right());
    const plan = runner.state().plan;
    const item = plan.items[0].item;
    const added = { ...rec.all()[0] };
    const fold = foldDeck([
      { ...added, kind: 'CardAdded', id: 'a1', at: '2026-10-01T00:00:00.000Z', subject: { cardId: item.itemId }, payload: { unitId: item.unitId, unitKind: 'form', dimension: item.dimension, family: item.family, addedBy: 'intake' } },
      ...rec.all(),
    ], fakeScheduler, { now: '2026-10-09T00:00:00.000Z' });
    expect(fold.ignored).toEqual([]);
    expect(fold.items[0].history).toHaveLength(1);
    expect(fold.items[0].history[0].rating).toBe(3);
  });
});

describe('the real sibling modules', () => {
  it('GoReview\'s own registry and grading port plug into the runner', async () => {
    const { registry } = await import('../../../packages/goreview/src/exercises');
    const { resolveBuilder, defaultGradingPort } = await import('../../../packages/goreview/src/session/runner');
    expect(resolveBuilder(registry, 'written-recognition')?.family).toBe('written-recognition');
    expect(resolveBuilder(registry, 'audio-to-meaning')?.family).toBe('audio-to-meaning');
    expect(defaultGradingPort.ratingFor({ outcome: 'correct', confidence: 1, explanation: '' }, response())).toBe(3);
    expect(defaultGradingPort.ratingFor({ outcome: 'incorrect', confidence: 1, explanation: '' }, response())).toBe(1);
    const { runner } = setup({ builders: registry });
    // the real written-recognition builder, real grading and the real evidence builder, end to end on the minimal fake facts
    const cur = await runner.current();
    expect(cur?.exercise.family).toBe('written-recognition');
    const r = await runner.answer(right());
    expect(r.grading.outcome).toBe('correct');
    expect(r.evidence?.kind).toBe('CardReviewed');
    expect(validateEvent(r.evidence!)).toEqual([]);
  });
});

describe('grading port', () => {
  it('uses the injected port instead of the default when given one', async () => {
    const { runner, rec } = setup({ grading: fakeGrading });
    const r = await runner.answer(right());
    expect(r.evidence?.payload).toMatchObject({ cardKind: 'recognition', grade: 'good' });
    expect(rec.all()[0].id).toBe(`gr:${runner.sessionId}:0:CardReviewed`); // ids are the runner's, whatever the port made
    expect(validateEvent(rec.all()[0])).toEqual([]);
  });

  it('refuses to record an invalid event from a port, and records nothing', async () => {
    const broken = { ratingFor: fakeGrading.ratingFor, evidenceFor: () => ({ id: 'x', v: 2, kind: 'CardReviewed', payload: {} }) as never };
    const { runner, rec } = setup({ grading: broken });
    await expect(runner.answer(right())).rejects.toThrow('invalid');
    expect(rec.batches).toEqual([]);
    expect(runner.state().index).toBe(0);
  });
});

describe('skip', () => {
  it('writes no event, keeps the item due and advances', async () => {
    const { runner, rec, deps } = setup();
    const planBefore = JSON.stringify(deps.plan);
    await runner.skip('not now');
    expect(rec.batches).toEqual([]);
    expect(runner.state().index).toBe(1);
    expect(runner.state().results).toEqual([]);
    expect(runner.skips()).toMatchObject([{ index: 0, reason: 'not now', kind: 'learner' }]);
    expect(JSON.stringify(deps.plan)).toBe(planBefore);
    const item = deps.plan.items[0].item;
    expect(fakeScheduler.isDue(item.schedule, runner.state().startedAt)).toBe(true);
  });

  it('skipping everything finishes with nothing recorded', async () => {
    const { runner, rec } = setup();
    for (let i = 0; i < 3; i++) await runner.skip();
    expect(await runner.current()).toBeNull();
    const s = await runner.finish();
    expect(s.status).toBe('finished');
    expect(rec.batches).toEqual([]);
    expect(summarize(s, runner.skips())).toMatchObject({ answered: 0, skipped: 3, remaining: 0 });
  });
});

describe('recovery', () => {
  it('reconciles a committed deterministic review after a crash without inventing a result or skip', async () => {
    const q = queueRecorder();
    const plan = makePlan();
    const base = createMemoryArea();
    let writes = 0;
    const dead = { ...base, set: async (items: Record<string, unknown>) => {
      writes += 1;
      if (writes > 1) throw new Error('page died');
      return base.set(items);
    } };
    const first = setup({ plan, record: q.record, persist: dead, now: clock() }).runner;
    await first.answer(right());

    const recovered = setup({ plan, persist: base, record: q.record, committedEvents: () => q.recorded.flat() });
    expect(await recovered.runner.recover(first.sessionId)).toBe(true);
    expect(recovered.runner.state().index).toBe(1);
    expect(recovered.runner.state().results).toEqual([]);
    expect(recovered.runner.skips()).toEqual([]);
    expect(recovered.runner.state().recoveryNotes).toHaveLength(1);
    expect(recovered.runner.state().recoveryNotes?.[0]).toContain(`gr:${first.sessionId}:0:CardReviewed`);
    expect((await recovered.runner.current())?.index).toBe(1);
    expect(recovered.rec.batches).toEqual([]);
  });

  it('a new runner over the same area resumes mid-session', async () => {
    const plan = makePlan();
    const persist = createMemoryArea();
    const a = setup({ plan, persist });
    await a.runner.answer(right());
    await a.runner.skip();
    expect(await listRecoverable(persist)).toEqual([a.runner.sessionId]);

    const b = setup({ plan, persist, sessionId: 'unrelated' });
    expect(await b.runner.recover('does-not-exist')).toBe(false);
    expect(await b.runner.recover(a.runner.sessionId)).toBe(true);
    expect(b.runner.state().index).toBe(2);
    expect(b.runner.state().results).toHaveLength(1);
    expect(b.runner.skips()).toHaveLength(1);
    const cur = await b.runner.current();
    expect(cur?.planned.item.unitId).toBe('form:sq:u3');
    await b.runner.answer(wrong());
    expect(b.runner.state().results.map((r) => r.grading.outcome)).toEqual(['correct', 'incorrect']);
    expect(await b.runner.current()).toBeNull();
    await b.runner.finish();
    expect(await listRecoverable(persist)).toEqual([]);
  });

  it('a finished session is no longer answerable', async () => {
    const { runner } = setup();
    await runner.finish();
    await expect(runner.answer(right())).rejects.toThrow('not in progress');
  });
});

describe('exercises that cannot be built are skipped with the reason and never shown', () => {
  it('no facts → skipped, and the next item is shown', async () => {
    const plan = makePlan({ due: 2 });
    plan.items[0].item.unitId = MISSING;
    const { runner } = setup({ plan });
    const cur = await runner.current();
    expect(cur?.planned.item.unitId).toBe('form:sq:u2');
    expect(runner.skips()).toMatchObject([{ index: 0, kind: 'build-failed' }]);
    expect(runner.skips()[0].reason).toContain('no verified facts');
  });

  it('a builder that fails its own validation is never shown', async () => {
    const { runner } = setup({ builders: fakeBuilders(undefined, { invalid: ['written-recognition'] }) });
    expect(await runner.current()).toBeNull();
    expect(runner.skips().map((s) => s.kind)).toEqual(['build-failed', 'build-failed', 'build-failed']);
    expect(runner.skips()[0].reason).toContain('ambiguous key');
  });

  it('no builder for the family, and a throwing builder', async () => {
    const none = setup({ builders: [] });
    expect(await none.runner.current()).toBeNull();
    expect(none.runner.skips()[0].reason).toContain('no exercise builder');
    const boom = setup({ builders: [{ ...fakeBuilders()[0], async build() { throw new Error('kaboom'); } }] });
    expect(await boom.runner.current()).toBeNull();
    expect(boom.runner.skips()[0].reason).toContain('kaboom');
  });

  it('an audio item without an audio source is unbuildable, not shown as a silent question', async () => {
    const plan = makePlan({ due: 1, dueFamilies: ['audio-to-meaning'] });
    const { runner } = setup({ plan, audio: undefined });
    expect(await runner.current()).toBeNull();
    expect(runner.skips()[0].reason).toContain('no audio source');
  });

  it('accepts the registry as a record or a map as well as an array', async () => {
    const list = fakeBuilders();
    const asRecord = Object.fromEntries(list.map((b) => [b.family, b]));
    const asMap = new Map(list.map((b) => [b.family, b] as const));
    for (const builders of [asRecord, asMap]) {
      const { runner } = setup({ builders });
      expect((await runner.current())?.exercise.family).toBe('written-recognition');
    }
  });

  it('builds the next exercise while the learner answers the current one', async () => {
    const log: BuilderLog = { builds: [], grades: 0 };
    const { runner } = setup({}, log);
    await runner.current();
    await new Promise((r) => setTimeout(r, 0));
    expect(log.builds).toEqual(['written-recognition:form:sq:u1', 'written-recognition:form:sq:u2']);
  });
});

describe('listening', () => {
  const audioPlan = () => makePlan({ due: 1, dueFamilies: ['audio-to-meaning'] });

  it('a reviewed recording yields a ListeningAssessed event with evidence and listening metadata', async () => {
    const { runner } = setup({ plan: audioPlan() });
    const r = await runner.answer(right({ audioPlayed: true, replays: 1 }));
    expect(r.family).toBe('audio-to-meaning');
    expect(r.evidence?.kind).toBe('ListeningAssessed');
    expect(r.evidence?.evidence?.quality).toBe('moderate');
    expect(r.scoring).toMatchObject({ voice: 'recorded', replays: 1, eligibleForEvidence: true, synthetic: false, pronunciationValidated: true });
    expect(validateEvent(r.evidence!)).toEqual([]);
  });

  it('a synthetic voice is practice: the result is kept, the event carries quality none', async () => {
    const { runner } = setup({ plan: audioPlan(), audio: fakeAudioSource(syntheticVoice) });
    const r = await runner.answer(right({ audioPlayed: true }));
    expect(r.scoring?.eligibleForEvidence).toBe(false);
    expect(r.scoring?.synthetic).toBe(true);
    expect(r.evidence?.evidence?.quality).toBe('none');
  });

  it('audio failure → unable-to-grade, rating null, evidence null, nothing recorded, but the result is kept and the session advances', async () => {
    const { runner, rec } = setup({ plan: audioPlan() });
    const r = await runner.answer(response({ audioFailed: true }));
    expect(r.grading.outcome).toBe('unable-to-grade');
    expect(r.rating).toBeNull();
    expect(r.evidence).toBeNull();
    expect(rec.batches).toEqual([]);
    expect(runner.state().results).toHaveLength(1);
    expect(runner.state().index).toBe(1);
  });

  it('transcript shown before the response → downgraded to a written-recognition result, no listening metadata, no listening event', async () => {
    const { runner } = setup({ plan: audioPlan() });
    const r = await runner.answer(right({ transcriptShownBefore: true, audioPlayed: true }));
    expect(r.family).toBe('written-recognition');
    expect(r.target.dimension).toBe('written-recognition');
    expect(r.scoring).toBeUndefined();
    expect(r.evidence?.kind).toBe('CardReviewed');
    expect(r.evidence?.payload).toMatchObject({ family: 'written-recognition', assessmentDimension: 'written-recognition', answerShownBefore: true });
    expect(r.evidence?.evidence?.quality).toBe('none'); // a reading review that claims nothing, per the evidence builder
    expect(r.rating).toBeNull(); // seeing a transcript is assistance, not independent recall
    expect(r.grading.outcome).toBe('correct');
  });
});

describe('challenge', () => {
  it('answering with challenged:true keeps the result, rating null, and records quality none', async () => {
    const { runner, rec } = setup();
    const r = await runner.answer(wrong({ challenged: true }));
    expect(r.response.challenged).toBe(true);
    expect(r.rating).toBeNull();
    expect(r.evidence?.evidence?.quality).toBe('none');
    expect(r.evidence?.payload).toMatchObject({ rating: null });
    expect(rec.all()).toHaveLength(1);
  });

  it('a challenge after the answer appends a correction (quality none, rating null, correctionOf), without inventing an invalidation', async () => {
    const { runner, rec } = setup();
    const answered = await runner.answer(wrong());
    const c = await runner.challenge('I typed it right');
    expect(c?.rating).toBeNull();
    expect(c?.response.challenged).toBe(true);
    expect(c?.evidence?.evidence?.quality).toBe('none');
    const events = rec.all();
    expect(events.map((e) => e.kind)).toEqual(['CardReviewed', 'CardReviewed']);
    expect(events[1].correctionOf).toBe(answered.evidence?.id);
    expect(events[1].payload).toMatchObject({ rating: null, challenged: true, challengeReason: 'I typed it right' });
    expect(events[1].payload.expectedPreviousReviewId).toBe(answered.evidence?.id);
    expect(events.some((e) => e.kind === 'ReviewItemInvalidated')).toBe(false);
    expect(validateEvent(events[1])).toEqual([]);
    expect(runner.state().results[0].rating).toBeNull();
    // a second challenge on the same result is a no-op
    await runner.challenge('again');
    expect(rec.all()).toHaveLength(2);
  });

  it('keyIsWrong also records ReviewItemInvalidated { analysis-invalidated, cardId }', async () => {
    const { runner, rec } = setup();
    const answered = await runner.answer(wrong());
    await runner.challenge('the key is wrong', { keyIsWrong: true });
    const inv = rec.all().find((e) => e.kind === 'ReviewItemInvalidated');
    expect(inv?.payload).toEqual({ reason: 'analysis-invalidated', cardId: answered.itemId });
    expect(validateEvent(inv!)).toEqual([]);
  });

  it('a challenge with nothing answered yet does nothing', async () => {
    const { runner, rec } = setup();
    expect(await runner.challenge('x')).toBeUndefined();
    expect(rec.batches).toEqual([]);
  });
});

describe('new items', () => {
  it('a new item gets its CardAdded in the same batch as its first event; a deck item does not', async () => {
    const plan = makePlan({ due: 1, newItems: [{ unitId: 'form:sq:fresh' }] });
    expect(plan.items.map((p) => p.isNew)).toEqual([true, false]);
    const { runner, rec } = setup({ plan });
    await runner.answer(right());
    await runner.answer(right());
    expect(rec.batches.map((b) => b.map((e) => e.kind))).toEqual([['CardAdded', 'CardReviewed'], ['CardReviewed']]);
    const added = rec.batches[0][0];
    expect(added.subject.cardId).toBe('card:written-recognition:form:sq:fresh');
    expect(added.payload).toMatchObject({ unitId: 'form:sq:fresh', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'intake' });
    expect(validateEvent(added)).toEqual([]);
    const fold = foldDeck(rec.all(), fakeScheduler, { now: '2026-10-09T00:00:00.000Z' });
    expect(fold.items.map((i) => i.unitId)).toEqual(['form:sq:fresh']);
    expect(fold.items[0].history).toHaveLength(1);
  });

  it('an unrecorded attempt adds no card (audio failure on a new listening item)', async () => {
    const plan = makePlan({ due: 0, newItems: [{ unitId: 'form:sq:l', family: 'audio-to-meaning' }] });
    expect(plan.items[0].family).toBe('audio-to-meaning');
    const { runner, rec } = setup({ plan });
    await runner.answer(response({ audioFailed: true }));
    expect(rec.batches).toEqual([]);
  });
});

describe('summary', () => {
  it('counts what happened', async () => {
    const { runner } = setup();
    await runner.answer(right());
    await runner.answer(wrong({ challenged: true }));
    await runner.skip();
    const s = summarize(runner.state(), runner.skips());
    expect(s).toEqual({ answered: 2, correct: 1, incorrect: 1, notJudged: 0, challenged: 1, skipped: 1, unbuildable: 0, remaining: 0, events: 2 });
  });

  it('preview grades without recording anything', async () => {
    const { runner, rec } = setup();
    const g = await runner.preview(right());
    expect(g.outcome).toBe('correct');
    expect(rec.batches).toEqual([]);
    expect(runner.state().index).toBe(0);
  });
});
