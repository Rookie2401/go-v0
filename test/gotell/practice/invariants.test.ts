/**
 * The invariants the productive engine must never break (docs/GOTELL.md, "Invariants"). Real adapters, fake receptive state.
 */
import { describe, expect, it } from 'vitest';
import type { ProductionRecorded, TellAttemptSubmitted, TellInterventionShown, TellTaskPresented } from '../../../src/core';
import { emptyState, foldStates } from '../../../src/gotell';
import { hintToModel, makePracticeWorld, meet, say, taskFor } from './world';

const BELIEVE = 'goal:t.believe-jesus';

describe('GoTell practice — invariants', () => {
  it('repeating the full model is never independent (in the task, and in another task shortly after)', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const t = await taskFor(w.practice, BELIEVE);
    const shown = await hintToModel(w.practice, 'A', t.taskId);
    const model = shown.assistance.find((s) => s.kind === 'full-model')!;
    expect(model.review).toBe('unreviewed'); // MODEL LANGUAGE says what it is
    const { attempt, task } = await say(w.practice, t.taskId, model.content);
    expect(attempt.outcome).toBe('success');
    expect(attempt.tier).toBe('model');
    expect(attempt.afterModel).toBe(true);
    expect(attempt.levelAfter).toBe(1);
    expect(task.closedAs).toBe('model-reproduced');
    const prod = (await w.events(['ProductionRecorded'])) as ProductionRecorded[];
    expect(prod.length).toBeGreaterThan(0);
    expect(prod.every((e) => e.kind === 'copied')).toBe(true);

    // a new task right away, no help in it: the model was seen minutes ago, so it still counts as copied
    const t2 = await taskFor(w.practice, BELIEVE);
    expect(t2.assistance).toEqual([]);
    const r2 = await say(w.practice, t2.taskId, 'Creo en Jesús.');
    expect(r2.attempt.tier).toBe('none');
    expect(r2.attempt.levelAfter).toBe(1);
    expect(r2.attempt.rule).toMatch(/full model .*min earlier/);

    // after the recency window, an unaided retrieval is independent
    w.jumpMinutes(45);
    const t3 = await taskFor(w.practice, BELIEVE);
    const r3 = await say(w.practice, t3.taskId, 'Yo creo en Jesús.');
    expect(r3.attempt.levelAfter).toBe(4);
  });

  it('assistance provenance is preserved: every attempt carries the full ordered lineage of steps shown before it', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const t = await taskFor(w.practice, BELIEVE);
    const a1 = (await say(w.practice, t.taskId, 'Yo en Jesús.')).attempt; // believe missing
    expect(a1.assistance).toEqual([]);
    await w.practice.hint('A', t.taskId);
    await w.practice.hint('A', t.taskId);
    const a2 = (await say(w.practice, t.taskId, 'Yo amo Jesús.')).attempt;
    const steps = ((await w.events(['TellInterventionShown'])) as TellInterventionShown[]).map((e) => e.step);
    expect(a2.assistance.map((s) => s.id)).toEqual(steps.map((s) => s.id));
    expect(a2.assistance.map((s) => s.kind)).toEqual(['conceptual-hint', 'english-cue']);
    expect(a2.tier).toBe('cue');
    await w.practice.hint('A', t.taskId);
    const a3 = (await say(w.practice, t.taskId, 'Yo creo en Jesús.')).attempt;
    expect(a3.assistance.slice(0, 2)).toEqual(a2.assistance); // cumulative, unchanged
    expect(a3.assistance).toHaveLength(3);
  });

  it('original attempts are immutable: later attempts and reads never rewrite an earlier record', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const t = await taskFor(w.practice, BELIEVE);
    await say(w.practice, t.taskId, 'yo creer en jesus');
    const before = JSON.stringify((await w.events(['TellAttemptSubmitted']))[0]);
    await w.practice.hint('A', t.taskId);
    await say(w.practice, t.taskId, 'Yo creo en Jesús.');
    await w.practice.states('A', 'es');
    await w.practice.schedule('A', 'es');
    const after = (await w.events(['TellAttemptSubmitted'])) as TellAttemptSubmitted[];
    expect(JSON.stringify(after[0])).toBe(before);
    expect(after[0].record.text).toBe('yo creer en jesus'); // exactly as typed, errors and all
    expect(after.map((e) => e.record.number)).toEqual([1, 2]);
  });

  it('productive and receptive state can disagree in both directions', async () => {
    const w = await makePracticeWorld();
    // A has met the words (receptive) but never said it: P0
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const states = await w.practice.states('A', 'es');
    expect(states.find((s) => s.goalId === BELIEVE)!.level).toBe(0);
    const sched = await w.practice.schedule('A', 'es');
    expect(sched.find((c) => c.goal.id === BELIEVE)!.selection.factors.find((f) => f.key === 'input')!.value).toBe(1);
    // B has met nothing, yet says it unaided: P4 with no receptive evidence at all
    const pB = w.practiceFor('B');
    const t = await taskFor(pB, BELIEVE, 'es', 'B');
    expect(t.assistance).toEqual([]); // every task starts with free production, even far from his reading
    expect(t.selection.startRung).toBe(7); // …but his first hint would be a frame
    expect(t.nextHint?.kind).toBe('sentence-frame');
    const r = await pB.submit('B', t.taskId, 'Creo en Jesús.');
    expect(r.attempt.levelAfter).toBe(4);
    expect(await w.golearn.listKnown('B', 'es', 'reading', 'encountered')).toEqual([]);
  });

  it('a failed retrieval never touches receptive state', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const snapshot = JSON.stringify(await w.golearn.listKnown('A', 'es', 'reading', 'encountered'));
    const t = await taskFor(w.practice, BELIEVE);
    await say(w.practice, t.taskId, 'No sé.');
    await say(w.practice, t.taskId, 'Hola.');
    await w.practice.close('A', t.taskId);
    expect(JSON.stringify(await w.golearn.listKnown('A', 'es', 'reading', 'encountered'))).toBe(snapshot);
    // and the failures produced no production evidence
    expect(await w.events(['ProductionRecorded'])).toEqual([]);
  });

  it('self-repair is distinguishable from a model correction', async () => {
    // self-repair: only "look again here" was shown
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const t = await taskFor(w.practice, BELIEVE);
    const bad = (await say(w.practice, t.taskId, 'Yo creer en Jesús.')).attempt;
    expect(bad.outcome).toBe('meaning-only');
    expect(bad.language.findings[0].family).toBe('morphology');
    const flagged = await w.practice.hint('A', t.taskId);
    expect(flagged.assistance.at(-1)!.kind).toBe('issue-flagged');
    expect(flagged.assistance.at(-1)!.content).not.toMatch(/creo/); // the cue does not give the fix away
    const fixed = (await say(w.practice, t.taskId, 'Yo creo en Jesús.')).attempt;
    expect(fixed.selfRepair).toBe(true);
    expect(fixed.levelAfter).toBe(3);
    expect(fixed.rule).toMatch(/self-repair/);
    expect(((await w.events(['ProductionRecorded'])) as ProductionRecorded[]).every((e) => e.kind === 'self-repaired')).toBe(true);

    // model correction: the correction itself was shown
    const v = await makePracticeWorld();
    meet(v, 'A', 'es', ['creo', 'jesús']);
    const u = await taskFor(v.practice, BELIEVE);
    await say(v.practice, u.taskId, 'Yo creer en Jesús.');
    await v.practice.hint('A', u.taskId);
    const corrected = await v.practice.hint('A', u.taskId);
    expect(corrected.assistance.at(-1)!.kind).toBe('morphological-correction');
    expect(corrected.assistance.at(-1)!.content).toMatch(/creo/);
    const after = (await say(v.practice, u.taskId, 'Yo creo en Jesús.')).attempt;
    expect(after.selfRepair).toBe(false);
    expect(after.levelAfter).toBe(2);
    expect(((await v.events(['ProductionRecorded'])) as ProductionRecorded[]).every((e) => e.kind === 'assisted')).toBe(true);
  });

  it('promotion rules are explicit: P4 → P5 (later day) → P6 (later day, new kind of task)', async () => {
    const { esStoryC } = await import('../fixtures');
    const w = await makePracticeWorld();
    await esStoryC(w as never, 'A'); // he has read "Yo creo en Dios." — so a retelling task exists for this meaning
    const d1 = await taskFor(w.practice, BELIEVE);
    expect(d1.family).toBe('testimony-part');
    expect((await say(w.practice, d1.taskId, 'Creo en Jesús.')).attempt).toMatchObject({ levelBefore: 0, levelAfter: 4 });
    const again = await taskFor(w.practice, BELIEVE);
    expect(again.family).toBe('answer-question'); // at P4+ the scheduler picks a kind of task not yet used
    expect((await say(w.practice, again.taskId, 'Yo creo en Jesús.')).attempt.levelAfter).toBe(4); // same day: still P4

    w.jumpDays(1);
    const d2 = await taskFor(w.practice, BELIEVE);
    expect(d2.family).toBe('retell');
    expect(d2.retellSource?.title).toBe('Story C');
    const r2 = (await say(w.practice, d2.taskId, 'Yo creo en Jesús.')).attempt;
    expect(r2.levelAfter).toBe(5); // a later day; a new kind of task does not jump to P6 before retrieval is stable
    expect(r2.rule).toMatch(/^P5/);

    w.jumpDays(1);
    const d3 = await taskFor(w.practice, BELIEVE);
    expect(d3.family).toBe('express');
    const r3 = (await say(w.practice, d3.taskId, 'Creo en Jesús.')).attempt;
    expect(r3.levelAfter).toBe(6);
    expect(r3.rule).toMatch(/transfers/);
    const st = (await w.practice.states('A', 'es')).find((s) => s.goalId === BELIEVE)!;
    expect(st.history.map((h) => h.to)).toEqual([4, 4, 5, 6]);
  });

  it('a delayed transfer task is offered for a meaning whose ideas are all said elsewhere', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['dios', 'perdonó', 'pecado', 'jesús', 'perdona']);
    const t = await taskFor(w.practice, 'goal:t.god-forgave');
    expect((await say(w.practice, t.taskId, 'Dios perdonó mi pecado.')).attempt.levelAfter).toBe(4);
    const c = (await w.practice.schedule('A', 'es')).find((x) => x.goal.id === 'goal:s.jesus-forgives')!;
    expect(c.family).toBe('transfer');
    expect(c.selection.factors.find((f) => f.key === 'transfer')!.value).toBe(1);
  });

  it('a lapse lowers the current level but keeps the peak, and receptive state is untouched', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const t = await taskFor(w.practice, BELIEVE);
    await say(w.practice, t.taskId, 'Creo en Jesús.');
    w.jumpDays(1);
    const t2 = await taskFor(w.practice, BELIEVE);
    const fail = (await say(w.practice, t2.taskId, 'Yo sé Jesús.')).attempt;
    expect(fail.levelAfter).toBe(3);
    const st = (await w.practice.states('A', 'es')).find((s) => s.goalId === BELIEVE)!;
    expect(st).toMatchObject({ level: 3, peak: 4, lapses: 1 });
    expect(fail.errors.some((e) => e.code === 'meaning.key-term-substitution')).toBe(true); // "know" for "believe"
    const ok = (await say(w.practice, t2.taskId, 'Creo en Jesús.')).attempt; // same task, no hint: still independent
    expect(ok.levelAfter).toBe(5);
  });

  it('Scripture is quoted exactly and never written to', async () => {
    const { esScriptureIntent } = await import('../fixtures');
    const w = await makePracticeWorld();
    const text = await esScriptureIntent(w as never, 'A');
    const sentences = JSON.stringify(await w.store.sentences.where('textId', text.id));
    const t = await taskFor(w.practice, 'goal:t.not-understand-sin');
    await say(w.practice, t.taskId, 'No entendía.'); // "sin" missing
    let task = t;
    for (let i = 0; i < 12 && !task.assistance.some((s) => s.kind === 'phrase-supplied'); i++) task = await w.practice.hint('A', t.taskId);
    const quote = task.assistance.find((s) => s.kind === 'phrase-supplied')!;
    expect(quote.source).toBe('reading');
    const stored = (await w.store.sentences.get(quote.sourceRef!.sentenceId!))!;
    expect(quote.content).toContain(`"${stored.text}"`);
    expect(quote.content).toMatch(/Scripture, quoted exactly/);
    expect(JSON.stringify(await w.store.sentences.where('textId', text.id))).toBe(sentences);
    expect(await w.store.texts.get(text.id)).toEqual(text);
  });

  it('the scheduler explains its choice, and the task keeps the explanation it was chosen with', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús', 'dios']);
    const ranked = await w.practice.schedule('A', 'es');
    expect(ranked.length).toBeGreaterThan(5);
    for (const c of ranked) {
      const sum = c.selection.factors.reduce((s, f) => s + f.contribution, 0);
      expect(Math.abs(sum - c.selection.score)).toBeLessThan(0.002);
      expect(c.selection.reasons.length).toBeGreaterThan(0);
      for (const f of c.selection.factors) expect(f.reason.length).toBeGreaterThan(0);
    }
    const t = (await w.practice.next('A', 'es'))!;
    expect(t.goal.id).toBe(ranked[0].goal.id);
    const ev = ((await w.events(['TellTaskPresented'])) as TellTaskPresented[])[0];
    expect(ev.selection).toEqual(ranked[0].selection);
    expect(t.selection.reasons).toEqual(ranked[0].selection.reasons);
    // the schedule itself records nothing
    const n = (await w.events()).length;
    await w.practice.schedule('A', 'es');
    expect((await w.events()).length).toBe(n);
  });

  it('an interpreter (LLM) cannot change an outcome or a level: its answer is validated and advisory', async () => {
    const liar = { id: 'fake-llm', interpret: async () => ({ concepts: ['believe', 'jesus'], confidence: 0.99, note: 'Looks right to me.' }) };
    const w = await makePracticeWorld({ interpreter: liar });
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const t = await taskFor(w.practice, BELIEVE);
    const r = (await say(w.practice, t.taskId, 'Me gusta la pizza.')).attempt;
    expect(r.outcome).not.toBe('success');
    expect(r.levelAfter).toBe(0);
    expect(r.evaluator.id).toBe('deterministic');
    expect(r.evaluator.advisory).toMatchObject({ providerId: 'fake-llm', agrees: false });
    expect(await w.events(['ProductionRecorded'])).toEqual([]);

    const malformed = { id: 'bad-llm', interpret: async () => ({ concepts: ['salvation-by-works'], confidence: 7 }) };
    const v = await makePracticeWorld({ interpreter: malformed });
    meet(v, 'A', 'es', ['creo', 'jesús']);
    const u = await taskFor(v.practice, BELIEVE);
    const r2 = (await say(v.practice, u.taskId, 'Creo en Jesús.')).attempt;
    expect(r2.evaluator.advisory).toBeUndefined();
    expect(r2.evaluator.advisoryRejected).toMatch(/unknown concept/);
    expect(r2.levelAfter).toBe(4); // decided without it

    const broken = { id: 'down-llm', interpret: async () => { throw new Error('network'); } };
    const x = await makePracticeWorld({ interpreter: broken });
    meet(x, 'A', 'es', ['creo', 'jesús']);
    const y = await taskFor(x.practice, BELIEVE);
    expect((await say(x.practice, y.taskId, 'Creo en Jesús.')).attempt.evaluator.advisoryRejected).toMatch(/network/);
  });

  it('productive state is a pure function of the log (rebuildable from a backup of the events)', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const t = await taskFor(w.practice, BELIEVE);
    await say(w.practice, t.taskId, 'Yo creer en Jesús.');
    await w.practice.hint('A', t.taskId);
    await say(w.practice, t.taskId, 'Yo creo en Jesús.');
    const states = await w.practice.states('A', 'es');
    // a second engine over the same events
    const copy = await makePracticeWorld();
    for (const e of await w.store.events.all()) await copy.store.events.put(e);
    expect(await copy.practice.states('A', 'es')).toEqual(states);
    // and the record's stored before/after agree with the fold
    const recs = ((await w.events(['TellAttemptSubmitted'])) as TellAttemptSubmitted[]);
    const folded = foldStates([], recs.map((e) => ({ at: e.at, record: e.record })), [], []);
    expect(folded.get(BELIEVE)!.level).toBe(recs.at(-1)!.record.levelAfter);
    expect(emptyState('x').level).toBe(0);
  });

  it('practice never writes My Testimony data, texts or receptive state', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const tables = async () => ({
      testimonies: (await w.store.testimonies.all()).length, revisions: (await w.store.revisions.all()).length,
      suggestions: (await w.store.suggestions.all()).length, drafts: (await w.store.drafts.all()).length,
      texts: (await w.store.texts.all()).length, sentences: (await w.store.sentences.all()).length, encounters: (await w.store.encounters.all()).length,
    });
    const before = await tables();
    const t = await taskFor(w.practice, BELIEVE);
    await say(w.practice, t.taskId, 'Yo creer en Jesús.');
    await w.practice.hint('A', t.taskId);
    await say(w.practice, t.taskId, 'Yo creo en Jesús.');
    await w.practice.defineGoal('A', 'es', { meaning: 'I trust God.' });
    await w.practice.testimonyMap('A', 'es');
    expect(await tables()).toEqual(before);
  });

  it('privacy: a learner cannot read or act on another learner\'s practice', async () => {
    const w = await makePracticeWorld();
    meet(w, 'A', 'es', ['creo', 'jesús']);
    const t = await taskFor(w.practice, BELIEVE);
    const asB = w.practiceFor('B');
    await expect(asB.next('A', 'es')).rejects.toThrow(/not permitted/);
    await expect(asB.submit('A', t.taskId, 'Creo en Jesús.')).rejects.toThrow(/not permitted/);
    await expect(asB.submit('B', t.taskId, 'Creo en Jesús.')).rejects.toThrow(/not found/);
    expect(await asB.task('B', t.taskId)).toBeUndefined();
    expect(await asB.attempts('B', 'es')).toEqual([]);
  });
});
