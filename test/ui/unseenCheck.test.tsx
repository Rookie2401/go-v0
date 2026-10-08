// @vitest-environment jsdom
/**
 * The unseen-text check in the stage status (R7). REAL: the component, R3's prompt generator, the Reader's text loader, the memory
 * store and bus. FAKE: the check service in the flow tests (the engine is tested in test/golearn/assessment.test.ts); the due rule
 * is exercised for real through StageStatus on the German course.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { buildFixtureText } from '../../src/core';
import type { FixtureSentence } from '../../src/core/testing';
import type { Stage, TextCompleted } from '../../src/core';
import { GERMAN_COURSE_ID } from '../../src/course';
import type { PendingCheck, UnseenCheckResult, UnseenCheckService } from '../../src/golearn/assessment';
import { UnseenCheck, UNSEEN_EXPLANATION } from '../../src/ui/course/UnseenCheck';
import { AppRoutes, Shell } from '../../src/ui/App';
import { button, byLabel, click, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const TEXT_ID = 'text:es:unseen';
const STAGE = { id: 'stage:honduras-es:g1', label: 'Grade 1' } as unknown as Stage;

const SENTENCES: FixtureSentence[] = [
  { tokens: [{ surface: 'El', lemma: 'el', pos: 'DET' }, { surface: 'hombre', lemma: 'hombre', pos: 'NOUN' }, { surface: 'compró', lemma: 'comprar', pos: 'VERB' }, { surface: 'una', lemma: 'uno', pos: 'DET' }, { surface: 'manzana', lemma: 'manzana', pos: 'NOUN' }, { surface: 'roja', lemma: 'rojo', pos: 'ADJ' }, { surface: '.', isWord: false }] },
  { tokens: [{ surface: 'La', lemma: 'el', pos: 'DET' }, { surface: 'mujer', lemma: 'mujer', pos: 'NOUN' }, { surface: 'cantaba', lemma: 'cantar', pos: 'VERB' }, { surface: 'una', lemma: 'uno', pos: 'DET' }, { surface: 'canción', lemma: 'canción', pos: 'NOUN' }, { surface: 'antigua', lemma: 'antiguo', pos: 'ADJ' }, { surface: '.', isWord: false }] },
  { tokens: [{ surface: 'Los', lemma: 'el', pos: 'DET' }, { surface: 'niños', lemma: 'niño', pos: 'NOUN' }, { surface: 'miraban', lemma: 'mirar', pos: 'VERB' }, { surface: 'el', lemma: 'el', pos: 'DET' }, { surface: 'camino', lemma: 'camino', pos: 'NOUN' }, { surface: 'largo', lemma: 'largo', pos: 'ADJ' }, { surface: '.', isWord: false }] },
];
const TEXTS = ['El hombre compró una manzana roja.', 'La mujer cantaba una canción antigua.', 'Los niños miraban el camino largo.'];

const PENDING: PendingCheck = {
  textId: TEXT_ID, title: 'El mercado', lang: 'es', coverageAtPick: 0.914, words: 400, pickedAt: '2026-03-01T10:00:00.000Z', heldUntil: '2026-04-30T10:00:00.000Z', stageId: STAGE.id,
};

/** A scripted check service: `status` says what the learner is offered, `start` what a click on "Choose a text" gives. */
function fakeService(o: { due?: boolean; pending?: PendingCheck; last?: UnseenCheckResult; start?: PendingCheck | undefined } = {}) {
  const svc = {
    status: vi.fn(async () => ({ due: o.due ?? false, ...(o.pending ? { pending: o.pending } : {}), ...(o.last ? { last: o.last } : {}) })),
    start: vi.fn(async () => ('start' in o ? o.start : PENDING)),
    record: vi.fn(async (_u: string, p: PendingCheck, right: number, total: number): Promise<UnseenCheckResult> => ({ textId: p.textId, promptsRight: right, promptsTotal: total, coverageAtPick: p.coverageAtPick, at: '2026-03-02T10:00:00.000Z' })),
    abandon: vi.fn(async () => undefined),
  };
  return svc satisfies UnseenCheckService;
}

async function mountCheck(h: Harness, svc: UnseenCheckService) {
  mounted = await h.mount(
    <Routes>
      <Route path="/" element={<UnseenCheck stage={STAGE} service={svc} />} />
      <Route path="/read/:id" element={<p data-testid="reader-stub">the reader</p>} />
    </Routes>,
  );
  return mounted;
}
const box = () => q(mounted!.container, '[data-testid="unseen-check"]');

describe('the offer', () => {
  it('shows nothing when no check is due and none has ever been taken', async () => {
    const h = await makeHarness();
    await mountCheck(h, fakeService());
    expect(box()).toBeNull();
    expect(q(mounted!.container, '[data-testid="unseen-last"]')).toBeNull();
  });

  it('when due, explains itself in plain words and offers "Choose a text" and "Not now"', async () => {
    const h = await makeHarness();
    await mountCheck(h, fakeService({ due: true }));
    expect(box()).not.toBeNull();
    expect(box()!.textContent).toContain('A short check on a text you have not seen. It changes nothing in your record; it tells you how your reading is going.');
    expect(UNSEEN_EXPLANATION).toContain('changes nothing in your record');
    expect(button(box()!, 'Choose a text')).toBeTruthy();
    await click(button(box()!, 'Not now'));
    expect(box()).toBeNull();
  });

  it('is due for real through StageStatus after eight finished texts, and not after seven', async () => {
    const h = await makeHarness({ courseId: GERMAN_COURSE_ID });
    const finish = (n: number) => h.bus.emit<TextCompleted>({
      type: 'TextCompleted', userId: 'u1', lang: 'de', surface: 'corpus', session: 's', dedupeKey: `done:${n}`, textId: `text:de:t${n}`,
    });
    for (let i = 0; i < 7; i++) await finish(i);
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/course' });
    expect(q(mounted.container, '[data-testid="unseen-check"]')).toBeNull();
    await mounted.unmount();
    await finish(7);
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/course' });
    const status = byLabel(mounted.container, 'Your stage');
    expect(q(status, '[data-testid="unseen-check"]')!.textContent).toContain('changes nothing in your record');
  });

  it('says plainly when no unseen text sits at his reach, and asks nothing', async () => {
    const h = await makeHarness();
    await mountCheck(h, fakeService({ due: true, start: undefined }));
    await click(button(box()!, 'Choose a text'));
    expect(box()!.textContent).toMatch(/nothing is asked of you/);
    expect(qa(box()!, 'button')).toHaveLength(0);
  });
});

describe('reading the text', () => {
  it('names the chosen text, opens it in the ordinary reader, and lets him let it go', async () => {
    const h = await makeHarness();
    await buildFixtureText(h.store, { lang: 'es', slug: 'unseen', title: 'El mercado', kind: 'story', sentences: SENTENCES });
    const svc = fakeService({ due: true });
    await mountCheck(h, svc);
    await click(button(box()!, 'Choose a text'));
    expect(svc.start).toHaveBeenCalledWith('u1', 'es', STAGE.id);
    expect(q(box()!, '[data-testid="unseen-title"]')!.textContent).toBe('El mercado');
    expect(box()!.textContent).toMatch(/Help is there when you want it, and the reader counts it/);
    await click(button(box()!, 'Open the text'));
    expect(q(mounted!.container, '[data-testid="reader-stub"]')).not.toBeNull();
  });

  it('a check left pending shows up again where it was, and "Let this one go" ends it without a result', async () => {
    const h = await makeHarness();
    const svc = fakeService({ pending: PENDING });
    await mountCheck(h, svc);
    expect(q(box()!, '[data-testid="unseen-title"]')!.textContent).toBe('El mercado');
    await click(button(box()!, 'Let this one go'));
    expect(svc.abandon).toHaveBeenCalled();
    expect(svc.record).not.toHaveBeenCalled();
  });
});

describe('the questions and the result line', () => {
  /** The right answer to the question on screen: the choice that restores a sentence of the text, or yes/no by whether the statement is one. */
  async function answer(right: boolean) {
    const sentence = q(mounted!.container, '[data-testid="unseen-sentence"]')!.textContent!;
    const choices = byLabel(mounted!.container, 'Choices');
    const buttons = qa<HTMLButtonElement>(choices, 'button');
    let pick: HTMLButtonElement;
    if (buttons.length === 2 && buttons[0].textContent === 'Yes') {
      const inText = TEXTS.includes(sentence);
      pick = buttons.find((b) => (b.textContent === 'Yes') === (inText === right))!;
    } else {
      const fits = (b: HTMLButtonElement) => TEXTS.includes(sentence.replace('_____', b.textContent!));
      pick = buttons.find((b) => fits(b) === right)!;
    }
    await click(pick);
  }

  it('R3\'s prompts are the measure: three questions, then "Unseen text: 2 of 3 right, 91 % of words known at the start"', async () => {
    const h = await makeHarness();
    await buildFixtureText(h.store, { lang: 'es', slug: 'unseen', title: 'El mercado', kind: 'story', sentences: SENTENCES });
    const svc = fakeService({ pending: PENDING });
    await mountCheck(h, svc);
    await click(button(box()!, 'I have read it: ask me'));
    expect(byLabel(mounted!.container, 'Questions about the text')).toBeTruthy();
    expect(byLabel(mounted!.container, 'Questions about the text').textContent).toContain('Question 1 of 3');

    await answer(true);
    await click(button(box()!, 'Next'));
    await answer(true);
    await click(button(box()!, 'Next'));
    await answer(false);
    await click(button(box()!, 'See the result'));

    expect(svc.record).toHaveBeenCalledTimes(1);
    expect(svc.record).toHaveBeenCalledWith('u1', PENDING, 2, 3);
    expect(q(box()!, '[data-testid="unseen-result"]')!.textContent).toBe('Unseen text: 2 of 3 right, 91 % of words known at the start');
    expect(box()!.textContent).toMatch(/not a level/);
    expect(box()!.textContent).not.toMatch(/\b[ABC][12]\b|CEFR/);
    // the questions are not evidence: the check emitted nothing itself (its single event is the service's, here faked)
    expect(await h.events('ComprehensionReported')).toHaveLength(0);
  });

  it('"Stop for now" goes back to the reading with the check still pending, recording nothing', async () => {
    const h = await makeHarness();
    await buildFixtureText(h.store, { lang: 'es', slug: 'unseen', title: 'El mercado', kind: 'story', sentences: SENTENCES });
    const svc = fakeService({ pending: PENDING });
    await mountCheck(h, svc);
    await click(button(box()!, 'I have read it: ask me'));
    await click(button(box()!, 'Stop for now'));
    expect(button(box()!, 'I have read it: ask me')).toBeTruthy();
    expect(svc.record).not.toHaveBeenCalled();
  });

  it('a text that is not on this device yet asks him to open it first', async () => {
    const h = await makeHarness();
    await mountCheck(h, fakeService({ pending: PENDING })); // no text stored
    await click(button(box()!, 'I have read it: ask me'));
    expect(box()!.textContent).toMatch(/not on this device yet/);
  });
});

describe('after a result', () => {
  it('when nothing is due, the last result stays as one quiet line', async () => {
    const h = await makeHarness();
    const last: UnseenCheckResult = { textId: TEXT_ID, promptsRight: 3, promptsTotal: 3, coverageAtPick: 0.9, at: '2026-03-02T10:00:00.000Z' };
    await mountCheck(h, fakeService({ last }));
    expect(box()).toBeNull();
    expect(q(mounted!.container, '[data-testid="unseen-last"]')!.textContent).toBe('Unseen text: 3 of 3 right, 90 % of words known at the start');
  });
});
