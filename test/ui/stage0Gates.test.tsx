// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Every test starts the whole app (real bootstrap: the course's corpus and its ladder imported): ~10 s each, more under load.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
import { createIndexedMemoryStore } from '../../src/sim/store'; // indexed, same semantics: a real bootstrap per test on the plain store's scans timed out
import type { AppStore, Stage0CheckAnswered, Stage0PathOverridden, Stage0SpeakingRecorded, Stage0StepCompleted, UserRecordingCreated } from '../../src/core';
import { bootstrap } from '../../src/app/bootstrap';
import type { BootstrapResult } from '../../src/app/bootstrap';
import { AppRoutes, Shell } from '../../src/ui/App';
import { AppProvider } from '../../src/ui/context';
import { resetPrefsForTests } from '../../src/ui/prefs';
import { bundledStage0 } from '../../src/stage0';
import { button, click, flush, installMediaStubs, q, qa, type } from './harness';

/**
 * Stage 0 gates in the UI, over the REAL engines (Spanish): a wrong answer shows the line again and asks again; a step left with a
 * question still wrong says "not secure yet" and the path marks it; a spoken task is a retelling (picture + English cue, the line
 * hidden until after the recording, then the model beside the recording and "did you say the same thing?"); the Stage 0 home
 * shows the exit's sections and the learner's own way to open the path.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let boot: BootstrapResult;
let store: AppStore;
let unmount: (() => Promise<void>) | undefined;
beforeEach(async () => {
  resetPrefsForTests(); localStorage.clear(); installMediaStubs();
  store = createIndexedMemoryStore();
  boot = await bootstrap({ store, courseId: 'honduras-es', features: { listen: false } });
});
afterEach(async () => { await unmount?.(); unmount = undefined; vi.unstubAllGlobals(); resetPrefsForTests(); localStorage.clear(); });

async function render(route: string) {
  await unmount?.();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <AppProvider services={boot.services} user={boot.user!} course={boot.course!} session="ses-s0g">
        <MemoryRouter initialEntries={[route]}><Shell><AppRoutes /></Shell></MemoryRouter>
      </AppProvider>,
    );
  });
  await flush(30);
  unmount = async () => { await act(async () => root.unmount()); container.remove(); };
  return container;
}

const pack = () => bundledStage0().packs.get('es')!;
const scene = (id: string) => pack().scenes.get(id)!;
const options = (page: HTMLElement, checkId: string) => qa<HTMLButtonElement>(page, `[data-check="${checkId}"] .stage0-option`);
const history = (types: string[]) => boot.services.bus.history({ userId: boot.user!.id, types: types as never });

async function readAllLines(page: HTMLElement, sceneId: string) {
  for (let i = 1; i < scene(sceneId).lines.length; i++) { await click(button(page, 'Next line')); await flush(5); }
}
const answerCheck = async (page: HTMLElement, sceneId: string, checkId: string, right: boolean) => {
  const c = scene(sceneId).checks.find((x) => x.id === checkId)!;
  const choice = right ? c.answer : (c.answer + 1) % c.options.length;
  await click(options(page, checkId)[choice]);
  await flush(20);
};
const hasButton = (page: HTMLElement, label: string) => qa<HTMLButtonElement>(page, 'button').some((b) => (b.textContent ?? '').trim() === label);

describe('the retry loop inside a scene step', () => {
  it('a wrong answer shows the line again and asks again; the step can be finished only when every question is right', async () => {
    const page = await render('/start/s01');
    await readAllLines(page, 'es-s01');
    expect(q(page, '[data-testid="stage0-retry"]')).toBeNull();

    await answerCheck(page, 'es-s01', 'c1', false);
    const c1 = q(page, '[data-check="c1"]')!;
    expect(c1.getAttribute('data-result')).toBe('wrong');
    expect(c1.getAttribute('data-tries')).toBe('1');
    const again = q(c1, '[data-testid="stage0-retry"]')!;
    expect(again.textContent).toMatch(/here is the line again/);
    expect(again.textContent).toContain('Me llamo Sam'); // the check's own line (l2), shown again
    expect(options(page, 'c1').every((b) => !b.disabled)).toBe(true); // it asks again: nothing is locked in
    expect(q(page, '[data-testid="stage0-not-secure"]')!.textContent).toMatch(/Not secure yet/);

    await answerCheck(page, 'es-s01', 'c2', true);
    expect(hasButton(page, 'Finish this step')).toBe(false); // c1 is still wrong
    expect(q(page, '[aria-label="Your turn"]')).toBeNull();

    await answerCheck(page, 'es-s01', 'c1', true);
    expect(q(c1, '[data-testid="stage0-retry"]')).toBeNull();
    expect(c1.getAttribute('data-result')).toBe('right');
    expect(c1.getAttribute('data-tries')).toBe('2');
    expect(q(page, '[data-testid="stage0-not-secure"]')).toBeNull();
    expect(hasButton(page, 'Finish this step')).toBe(true);
    expect(q(page, '[aria-label="Your turn"]')).not.toBeNull();

    // every answer is an event; the latest per check stands
    const answers = (await history(['Stage0CheckAnswered'])) as Stage0CheckAnswered[];
    expect(answers.map((a) => [a.checkId, a.correct])).toEqual([['c1', false], ['c2', true], ['c1', true]]);
    const ov = await boot.services.stage0!.overview(boot.user!.id, 'es');
    expect(ov.steps[0]).toMatchObject({ checksSecure: true }); // secure, though not yet finished

    await click(button(page, 'Finish this step'));
    await flush(20);
    expect((await history(['Stage0StepCompleted'])) as Stage0StepCompleted[]).toHaveLength(1);
    expect((await boot.services.stage0!.overview(boot.user!.id, 'es')).steps[0]).toMatchObject({ status: 'done', counts: true, notSecure: false });
  });

  it('a step left with a question still wrong is not finished and the Stage 0 home marks it "not secure yet"', async () => {
    const page = await render('/start/s01');
    await readAllLines(page, 'es-s01');
    await answerCheck(page, 'es-s01', 'c1', false);
    await answerCheck(page, 'es-s01', 'c2', true);
    await click(button(page, 'Leave for now'));
    await flush(20);
    expect(await history(['Stage0StepCompleted'])).toHaveLength(0);

    const home = await render('/start');
    const row = q(home, '[data-step="s01"]')!;
    expect(row.querySelector('[data-secure="false"]')!.textContent).toBe('not secure yet');
    expect(row.querySelector('[data-secure="true"]')).toBeNull();
    expect(row.textContent).toMatch(/Not secure yet: 1 of 2/);
    expect(q(home, '[data-step="s02"] [data-secure]')).toBeNull();
  });

  it('a step finished with every question right is marked "secure" on the Stage 0 home', async () => {
    const page = await render('/start/s01');
    await readAllLines(page, 'es-s01');
    await answerCheck(page, 'es-s01', 'c1', true);
    await answerCheck(page, 'es-s01', 'c2', true);
    await click(button(page, 'Finish this step'));
    await flush(20);
    const home = await render('/start');
    expect(q(home, '[data-step="s01"] [data-secure="true"]')!.textContent).toBe('secure');
    expect(q(home, '[data-step="s01"] [data-secure="false"]')).toBeNull();
  });
});

describe('speaking is a retelling', () => {
  class FakeRecorder {
    state = 'inactive'; mimeType = 'audio/webm';
    ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; onerror: (() => void) | null = null;
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }) }); this.onstop?.(); }
  }

  async function toTheSpokenTask() {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [] }) } });
    const page = await render('/start/s01');
    await readAllLines(page, 'es-s01');
    await answerCheck(page, 'es-s01', 'c1', true);
    await answerCheck(page, 'es-s01', 'c2', true);
    const task = q(page, '[data-task="p2"]')!; // "Now give your own name." — a substitute task that is also spoken
    await type(q<HTMLInputElement>(task, 'input')!, 'Me llamo Rafa');
    await click(button(task, 'Check'));
    await flush(20);
    return { page, task };
  }

  it('shows a picture and the English meaning, hides the line until after the recording, then the model beside it with a yes / partly / no self-check', async () => {
    const { task } = await toTheSpokenTask();
    expect(q(task, '[data-stage="cue"]')).not.toBeNull();
    // the cue: the picture of the line it is based on and the English; the target line is nowhere on screen, not even the typed answer
    const cue = q(task, '[data-testid="stage0-cue"]')!;
    expect(cue.textContent).toContain('🙂');
    expect(cue.textContent).toContain('Now give your own name.');
    expect(task.textContent).not.toContain('Me llamo Rafa');
    expect(task.textContent).not.toContain('Me llamo ___'); // the frame is hidden too
    expect(q(task, 'input')).toBeNull();
    expect(q(task, '[data-testid="stage0-compare"]')).toBeNull();
    expect(hasButton(task, 'Hear the model')).toBe(false);

    await click(button(task, /Record yourself/));
    await click(button(task, /Stop/));
    await flush(20);

    // after the recording: the recording and the model side by side, and the question
    expect(q(task, '[data-stage="compare"]')).not.toBeNull();
    const compare = q(task, '[data-testid="stage0-compare"]')!;
    expect(compare.textContent).toContain('Hear yourself');
    expect(compare.textContent).toContain('Me llamo Rafa');
    expect(task.textContent).toContain('Compare: did you say the same thing?');
    const recs = await store.recordings.all();
    expect(recs).toHaveLength(1);
    expect(recs[0].target).toEqual({ text: 'Me llamo Rafa' });
    expect(await history(['Stage0SpeakingRecorded'])).toHaveLength(0); // nothing is recorded as an attempt until it is compared

    await click(button(task, 'Partly'));
    await flush(20);
    const spoken = (await history(['Stage0SpeakingRecorded'])) as Stage0SpeakingRecorded[];
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatchObject({ stepId: 's01', itemId: 'p2', recordingId: recs[0].id, selfCheck: 'partly' });
    const created = (await history(['UserRecordingCreated'])) as UserRecordingCreated[];
    expect(created.map((c) => c.recordingId)).toEqual([recs[0].id]);
    expect(q(task, '[data-stage="done"]')!.textContent).toMatch(/stays on this device/);
    expect((await boot.services.stage0!.overview(boot.user!.id, 'es')).meters.speaking.recorded).toBe(1);
  });

  it('"No" is recorded as no; nothing is scored by a machine (the attempt carries only the learner\'s own judgement)', async () => {
    const { task } = await toTheSpokenTask();
    await click(button(task, /Record yourself/));
    await click(button(task, /Stop/));
    await flush(20);
    await click(button(task, 'No'));
    await flush(20);
    const spoken = (await history(['Stage0SpeakingRecorded'])) as Stage0SpeakingRecorded[];
    expect(spoken.map((s) => s.selfCheck)).toEqual(['no']);
    expect(Object.keys(spoken[0]).filter((k) => /score|grade|confidence/i.test(k))).toEqual([]);
  });

  it('on a device that cannot record, the learner says it aloud, sees the line, and can still compare (it will not count as a recording)', async () => {
    const page = await render('/start/s01');
    await readAllLines(page, 'es-s01');
    await answerCheck(page, 'es-s01', 'c1', true);
    await answerCheck(page, 'es-s01', 'c2', true);
    const task = q(page, '[data-task="p2"]')!;
    await type(q<HTMLInputElement>(task, 'input')!, 'Me llamo Rafa');
    await click(button(task, 'Check'));
    await flush(20);
    expect(task.textContent).toMatch(/cannot record here/);
    await click(button(task, /I said it aloud/));
    expect(q(task, '[data-testid="stage0-compare"]')!.textContent).toContain('Not recorded on this device');
    await click(button(task, 'Yes'));
    await flush(20);
    const spoken = (await history(['Stage0SpeakingRecorded'])) as Stage0SpeakingRecorded[];
    expect(spoken).toHaveLength(1);
    expect(spoken[0].recordingId).toBeUndefined();
    expect(spoken[0].selfCheck).toBe('yes');
    expect(await history(['UserRecordingCreated'])).toHaveLength(0);
  });
});

describe('the Stage 0 home: the exit\'s sections and the way to open the path', () => {
  it('says the path is closed until the reading part passes, and the learner can open it himself (confirmed, recorded, shown)', async () => {
    const home = await render('/start');
    const gate = q(home, '[data-testid="stage0-ladder"]')!;
    expect(gate.getAttribute('data-open')).toBe('false');
    expect(gate.textContent).toMatch(/closed/);
    expect(gate.textContent).toMatch(/reading part of the check passes/);

    await click(button(home, 'I know this already — open the path'));
    expect(await history(['Stage0PathOverridden'])).toHaveLength(0); // asked first
    await click(button(home, 'Not now'));
    expect(await history(['Stage0PathOverridden'])).toHaveLength(0);
    await click(button(home, 'I know this already — open the path'));
    await click(button(home, 'Yes, open the path'));
    await flush(20);

    const events = (await history(['Stage0PathOverridden'])) as Stage0PathOverridden[];
    expect(events).toHaveLength(1);
    const open = q(home, '[data-testid="stage0-ladder"]')!;
    expect(open.getAttribute('data-open')).toBe('true');
    expect(open.getAttribute('data-by')).toBe('override');
    expect(q(open, '[data-testid="stage0-override-note"]')!.textContent).toContain(events[0].at.slice(0, 10));
    expect(hasButton(home, 'I know this already — open the path')).toBe(false);
  });

  it('shows each section of the last check plainly, and the path open once its reading part passed', async () => {
    const s0 = boot.services.stage0!;
    const userId = boot.user!.id;
    const a = await s0.startExit(userId, 'es', { microphone: true });
    const form = s0.exitForm('es', a.formId)!;
    for (const c of form.reading.checks) await s0.answerExit(userId, 'es', a.attemptId, 'reading', c.id, { choice: c.answer, lookups: 0 });
    await s0.answerExit(userId, 'es', a.attemptId, 'speaking', form.speaking[0].id, { recordingId: 'rec-x', selfCheck: 'no' });
    await s0.finishExit(userId, 'es', a.attemptId);

    const home = await render('/start');
    const list = q(home, '[data-testid="stage0-exit-sections"]')!;
    const bySection = Object.fromEntries(qa(list, 'li').map((li) => [li.getAttribute('data-section'), li.getAttribute('data-status')]));
    expect(bySection).toMatchObject({ reading: 'passed', listening: 'unavailable', writing: 'not-yet', speaking: 'not-yet' });
    expect(list.textContent).toMatch(/Reading: passed/);
    expect(list.textContent).toMatch(/Listening: not given/);
    expect(list.textContent).toMatch(/Speaking: not yet/);
    const gate = q(home, '[data-testid="stage0-ladder"]')!;
    expect(gate.getAttribute('data-open')).toBe('true');
    expect(gate.getAttribute('data-by')).toBe('exit');
    expect(gate.textContent).toMatch(/passed the reading part/);
  });

  it('a failed reading part leaves the path closed on the home, with the section shown as not yet', async () => {
    const s0 = boot.services.stage0!;
    const userId = boot.user!.id;
    const a = await s0.startExit(userId, 'es', { microphone: false });
    const form = s0.exitForm('es', a.formId)!;
    for (const c of form.reading.checks) await s0.answerExit(userId, 'es', a.attemptId, 'reading', c.id, { choice: (c.answer + 1) % c.options.length });
    const result = await s0.finishExit(userId, 'es', a.attemptId);
    expect(result.sections.find((s) => s.section === 'reading')!.status).toBe('not-yet');
    const home = await render('/start');
    const gate = q(home, '[data-testid="stage0-ladder"]')!;
    expect(gate.getAttribute('data-open')).toBe('false');
    expect(q(home, '[data-testid="stage0-exit-sections"] [data-section="reading"]')!.getAttribute('data-status')).toBe('not-yet');
  });
});

describe('the exit check\'s speaking part', () => {
  it('cues with the English prompt only, shows the model after the recording, records the self-check, and the result names what opened the path', async () => {
    class Recorder {
      state = 'inactive'; mimeType = 'audio/webm';
      ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; onerror: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([9])], { type: 'audio/webm' }) }); this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', Recorder);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [] }) } });
    const page = await render('/start/exit');
    await click(button(page, 'Start the check'));
    await flush(20);
    const speaking = q(page, '[aria-label="Speaking"]')!;
    const form = pack().exits.get('es-exit-a')!;
    const item = form.speaking[0];
    expect(q(speaking, '[data-testid="stage0-cue"]')!.textContent).toContain(item.prompt);
    expect(speaking.textContent).not.toContain(item.model);
    await click(button(speaking, /Record yourself/));
    await click(button(speaking, /Stop/));
    await flush(20);
    expect(q(speaking, '[data-testid="stage0-compare"]')!.textContent).toContain(item.model);
    await click(button(speaking, 'Yes'));
    await flush(20);

    // read the passage right so the reading part passes; then finish
    for (const c of form.reading.checks) {
      await click(qa<HTMLButtonElement>(page, `[aria-label="Reading"] [data-check="${c.id}"] .stage0-option`)[c.answer]);
    }
    await flush(20);
    const exitAnswers = (await history(['Stage0ExitAnswered'])) as Array<{ section: string; itemId: string; selfCheck?: string; recordingId?: string }>;
    const spoken = exitAnswers.find((a) => a.section === 'speaking')!;
    expect(spoken).toMatchObject({ itemId: item.id, selfCheck: 'yes' });
    expect(spoken.recordingId).toBeTruthy();

    await click(button(page, 'Finish the check'));
    await flush(20);
    const result = q(page, '[aria-label="Your result"]')!;
    expect(q(result, '[data-testid="stage0-ladder-line"]')!.textContent).toMatch(/reading part passed: the path after Stage 0 is open/);
    expect(q(result, '[data-section="speaking"]')!.getAttribute('data-status')).toBe('recorded'); // judged "yes" by the learner
    expect(q(result, '[data-section="reading"]')!.getAttribute('data-status')).toBe('passed');
  });
});
