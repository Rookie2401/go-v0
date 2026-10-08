/**
 * Stage 0 gates (engine audit 2026-10-07, items 13 and 15), on the REAL engines with the Spanish pack:
 *   - a scene step counts toward the exit only when its comprehension checks are SECURE (the latest answer to each is right);
 *   - the ladder after Stage 0 opens only when an exit's READING section passed, or by the learner's recorded override;
 *   - the exit's speaking section passes only with a recorded retelling the learner judged "yes" or "partly".
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Stage0PathOverridden, Stage0SelfCheck } from '../../src/core';
import { createLadderPath } from '../../src/ladder/path';
import { STAGE0_LANGS, checksSecure, createStage0, foldStage0, ladderOpening, readingPassed, selfCheckPasses } from '../../src/stage0';
import type { Stage0ServiceImpl } from '../../src/stage0';
import { makeApp, makeClock, seedUser } from '../integration/harness';

const U = 'gates-es';

let app: ReturnType<typeof makeApp>;
let s0: Stage0ServiceImpl;
let clock: ReturnType<typeof makeClock>;

beforeEach(async () => {
  clock = makeClock();
  app = makeApp({ clock });
  await seedUser(app.store, U, 'honduras-es');
  s0 = createStage0({ store: app.store, bus: app.bus, adapters: app.adapters, clock: clock.now }).forUser(U);
  await s0.ensureTexts('es');
});

const sceneOf = (stepId: string) => s0.scene('es', s0.pack('es')!.path.steps.find((s) => s.id === stepId)!.ref!)!;
const wrongChoice = (stepId: string, checkId: string) => { const c = sceneOf(stepId).checks.find((x) => x.id === checkId)!; return (c.answer + 1) % c.options.length; };
const rightChoice = (stepId: string, checkId: string) => sceneOf(stepId).checks.find((x) => x.id === checkId)!.answer;
const answer = (stepId: string, checkId: string, right: boolean) =>
  s0.answerCheck(U, 'es', stepId, checkId, right ? rightChoice(stepId, checkId) : wrongChoice(stepId, checkId), 'read', 'none');
const view = async (stepId: string) => (await s0.overview(U, 'es')).steps.find((s) => s.step.id === stepId)!;

/** One exit attempt. Reading answered right or wrong; writing answered right; speaking as given (or not at all). */
async function takeExit(o: { reading: boolean; speaking?: { recordingId?: string; selfCheck?: Stage0SelfCheck } }) {
  const a = await s0.startExit(U, 'es', { microphone: true });
  const form = s0.exitForm('es', a.formId)!;
  for (const c of form.reading.checks) await s0.answerExit(U, 'es', a.attemptId, 'reading', c.id, { choice: o.reading ? c.answer : (c.answer + 1) % c.options.length, lookups: 0 });
  for (const w of form.writing) await s0.answerExit(U, 'es', a.attemptId, 'writing', w.id, { text: w.accept[0].text.replace(/\{x\}/g, 'Carla') });
  if (o.speaking) await s0.answerExit(U, 'es', a.attemptId, 'speaking', form.speaking[0].id, { ...(o.speaking.recordingId ? { recordingId: o.speaking.recordingId } : {}), ...(o.speaking.selfCheck ? { selfCheck: o.speaking.selfCheck } : {}) });
  return s0.finishExit(U, 'es', a.attemptId);
}
const section = (r: Awaited<ReturnType<typeof takeExit>>, name: string) => r.sections.find((s) => s.section === name)!;
const pathStage0 = async () => (await createLadderPath({ store: app.store, stage0: s0 }).view(U, 'es')).stage0;

describe('a scene step counts toward the exit only when its checks are secure', () => {
  it('a step finished with a check still wrong is not secure: it stays "started", does not count, and is marked', async () => {
    await answer('s01', 'c1', true);
    await answer('s01', 'c2', false);
    await s0.completeStep(U, 'es', 's01');
    const v = await view('s01');
    expect(v).toMatchObject({ status: 'started', checksSecure: false, counts: false, notSecure: true });
    expect(v.detail).toMatch(/Not secure yet: 1 of 2/);
    const st = await s0.state(U, 'es');
    expect(checksSecure(sceneOf('s01'), st.steps.get('s01'))).toEqual({ secure: false, right: 1, total: 2 });
  });

  it('answering the wrong check again (the retry loop) makes the step secure: the latest answer stands', async () => {
    await answer('s01', 'c1', true);
    await answer('s01', 'c2', false);
    await answer('s01', 'c2', true);
    await s0.completeStep(U, 'es', 's01');
    expect(await view('s01')).toMatchObject({ status: 'done', checksSecure: true, counts: true, notSecure: false });
    // ... and a later wrong answer to the same question takes the step back out (the learner is not credited for an old answer)
    await answer('s01', 'c1', false);
    expect(await view('s01')).toMatchObject({ status: 'started', counts: false, notSecure: true });
  });

  it('a step with nothing answered yet is merely begun, not "not secure"; "Continue" skips a not-secure step until the new ones are done', async () => {
    await s0.supportUsed(U, 'es', 's01', 'english', ['l1']); // a step is begun once any Stage 0 event exists for it
    expect(await view('s01')).toMatchObject({ status: 'started', counts: false, notSecure: false });
    await answer('s01', 'c1', false);
    await s0.completeStep(U, 'es', 's01'); // left behind not secure
    const ov = await s0.overview(U, 'es');
    expect(ov.steps[0].notSecure).toBe(true);
    expect(ov.next?.id).toBe('s02'); // the next new step, not a loop back
    expect(ov.nextReason).not.toMatch(/Not secure/);
  });

  it('secure here means counts toward the exit; "secure" status still needs the checks unaided and the tasks produced', async () => {
    await answer('s01', 'c1', true);
    await answer('s01', 'c2', true);
    await s0.completeStep(U, 'es', 's01');
    expect(await view('s01')).toMatchObject({ status: 'done', counts: true }); // tasks not produced yet
    await s0.submitProduction(U, 'es', 's01', 'p1', 'Me llamo Sam', ['model']);
    await s0.submitProduction(U, 'es', 's01', 'p2', 'Me llamo Ana', []);
    expect(await view('s01')).toMatchObject({ status: 'secure', counts: true });
  });
});

describe('the ladder opens only after the exit\'s READING section passed', () => {
  it('finishing every scene does not open it', async () => {
    const scenes = s0.pack('es')!.path.steps.filter((s) => s.kind === 'scene');
    for (const s of scenes) await s0.completeStep(U, 'es', s.id);
    expect((await s0.overview(U, 'es')).ladder).toEqual({ open: false });
    expect(await pathStage0()).toMatchObject({ applicable: true, done: false, scenesDone: scenes.length });
  });

  it('an exit whose reading section did not pass leaves it closed, whatever else passed', async () => {
    const r = await takeExit({ reading: false, speaking: { recordingId: 'rec-1', selfCheck: 'yes' } });
    expect(section(r, 'reading').status).toBe('not-yet');
    expect(section(r, 'writing').status).toBe('passed');
    expect(readingPassed(r)).toBe(false);
    expect((await s0.overview(U, 'es')).ladder.open).toBe(false);
    expect(await pathStage0()).toMatchObject({ done: false, verdict: 'not-yet', readingNotPassed: true });
    expect(r.verdictDetail).toMatch(/opens when the reading part passes/);
  });

  it('an exit whose reading section passed opens it, even when the overall verdict is "not yet"', async () => {
    const r = await takeExit({ reading: true }); // speaking never answered: the verdict is not-yet
    expect(r.verdict).toBe('not-yet');
    expect(section(r, 'reading').status).toBe('passed');
    expect(r.verdictDetail).toMatch(/reading part passed/);
    expect((await s0.overview(U, 'es')).ladder).toEqual({ open: true, by: 'exit' });
    expect(await pathStage0()).toMatchObject({ done: true, by: 'exit', verdict: 'not-yet' });
  });

  it('a later failed attempt does not close a path that an earlier reading pass opened', async () => {
    await takeExit({ reading: true });
    await takeExit({ reading: false });
    expect((await s0.overview(U, 'es')).ladder.open).toBe(true);
    expect((await pathStage0()).done).toBe(true);
  });

  it('readingPassed reads the section, or the verdict for a result with no sections', () => {
    expect(readingPassed(undefined)).toBe(false);
    expect(readingPassed({ sections: [{ section: 'reading', status: 'passed' }], verdict: 'not-yet' })).toBe(true);
    expect(readingPassed({ sections: [{ section: 'reading', status: 'not-yet' }], verdict: 'ready' })).toBe(false);
    expect(readingPassed({ sections: [], verdict: 'ready' })).toBe(true);
    expect(readingPassed({ sections: [], verdict: 'ready-provisional' })).toBe(true);
    expect(readingPassed({ sections: [], verdict: 'not-yet' })).toBe(false);
  });
});

describe('the learner may open the path himself, and it is recorded', () => {
  it('"I know this already" is an event, folds into the state, opens the path and shows when', async () => {
    expect((await s0.overview(U, 'es')).ladder.open).toBe(false);
    await s0.overridePath(U, 'es');
    const events = (await app.bus.history({ userId: U, types: ['Stage0PathOverridden'] })) as Stage0PathOverridden[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'Stage0PathOverridden', lang: 'es', stepId: 'override' });
    const st = await s0.state(U, 'es');
    expect(st.override).toEqual({ at: events[0].at });
    expect(ladderOpening(st)).toEqual({ open: true, by: 'override', overriddenAt: events[0].at });
    const ov = await s0.overview(U, 'es');
    expect(ov.ladder).toEqual({ open: true, by: 'override', overriddenAt: events[0].at });
    expect(ov.exit).toBeUndefined(); // nothing is marked as passed
    expect(await pathStage0()).toMatchObject({ done: true, by: 'override' });
  });

  it('is the learner\'s own act: another user cannot open it for him; it is a pure fold of the log', async () => {
    const other = createStage0({ store: app.store, bus: app.bus, adapters: app.adapters, clock: clock.now }).forUser('someone-else');
    await expect(other.overridePath(U, 'es')).rejects.toThrow(/not permitted/);
    await s0.overridePath(U, 'es');
    const a = foldStage0('es', await app.bus.history({ userId: U }));
    const b = foldStage0('es', [...(await app.bus.history({ userId: U }))].reverse());
    expect(a.override).toEqual(b.override);
  });

  it('an exit that passed reading takes precedence in the record; the override is still remembered', async () => {
    await s0.overridePath(U, 'es');
    await takeExit({ reading: true });
    const ov = await s0.overview(U, 'es');
    expect(ov.ladder.open).toBe(true);
    expect(ov.ladder.by).toBe('exit');
    expect(ov.ladder.overriddenAt).toBeTruthy();
  });
});

describe('the exit\'s speaking section is a self-checked retelling', () => {
  it('every language needs at least one recorded attempt judged yes or partly', () => {
    for (const [lang, cfg] of Object.entries(STAGE0_LANGS)) {
      expect(cfg.exit.speaking.minRecorded, lang).toBeGreaterThanOrEqual(1);
      expect(cfg.exit.speaking.minSelfChecked, lang).toBeGreaterThanOrEqual(1);
    }
  });

  it('passes only with a recording the learner judged "yes" or "partly"', async () => {
    const yes = section(await takeExit({ reading: true, speaking: { recordingId: 'rec-1', selfCheck: 'yes' } }), 'speaking');
    expect(yes.status).toBe('recorded');
    expect(yes.detail).toMatch(/1 spoken retelling recorded; you judged 1 the same as the model/);
    expect(section(await takeExit({ reading: true, speaking: { recordingId: 'rec-2', selfCheck: 'partly' } }), 'speaking').status).toBe('recorded');
    const no = section(await takeExit({ reading: true, speaking: { recordingId: 'rec-3', selfCheck: 'no' } }), 'speaking');
    expect(no.status).toBe('not-yet');
    expect(no.detail).toMatch(/none judged the same as the model/);
  });

  it('recording anything is no longer enough: no self-check, or no recording, does not pass', async () => {
    expect(section(await takeExit({ reading: true, speaking: { recordingId: 'rec-4' } }), 'speaking').status).toBe('not-yet');
    expect(section(await takeExit({ reading: true, speaking: { selfCheck: 'yes' } }), 'speaking').status).toBe('not-yet'); // said aloud, never recorded
    expect(section(await takeExit({ reading: true }), 'speaking').status).toBe('not-yet');
  });

  it('the verdict follows: reading + writing + a yes retelling is ready-provisional (listening has no native audio); a "no" is not yet', async () => {
    expect((await takeExit({ reading: true, speaking: { recordingId: 'rec-5', selfCheck: 'partly' } })).verdict).toBe('ready-provisional');
    expect((await takeExit({ reading: true, speaking: { recordingId: 'rec-6', selfCheck: 'no' } })).verdict).toBe('not-yet');
  });

  it('without a microphone the speaking section is not given (unchanged), and the old wording still reads as yes', async () => {
    const a = await s0.startExit(U, 'es', { microphone: false });
    expect(a.unavailable).toContain('speaking');
    expect(selfCheckPasses('like-model')).toBe(true);
    expect(selfCheckPasses('different')).toBe(false);
    expect(selfCheckPasses('unsure')).toBe(false);
    expect(selfCheckPasses(undefined)).toBe(false);
  });

  it('a spoken retelling in a scene records the self-check on the attempt', async () => {
    await s0.recordSpeaking(U, 'es', 's01', 'p2', 'rec-s01', 'partly');
    const st = await s0.state(U, 'es');
    expect(st.steps.get('s01')!.speaking).toHaveLength(1);
    expect(st.steps.get('s01')!.speaking[0]).toMatchObject({ itemId: 'p2', recordingId: 'rec-s01', selfCheck: 'partly' });
    expect(st.meters.speaking.recorded).toBe(1);
  });
});
