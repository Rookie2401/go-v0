// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateEvent, type GoEvent } from '../../packages/repository-contract/src';
import { KEYS } from '../../packages/golearn-extension/app/state';
import { createTutorialLookup, sameWord } from '../../packages/golearn-extension/app/tutorialLookup';
import { EVENT_KEY_PREFIX } from '../../packages/golearn-extension/src/store';
import { selectText, stubLayout } from './domtools';
import { DEMO_SENTENCE, destroyRigs, fakeBackground, flush, makeRig, signIn, until, type Rig } from './helpers';

let restore: () => void;
beforeEach(() => { restore = stubLayout(); });
afterEach(() => { destroyRigs(); restore(); document.body.innerHTML = ''; });

const rows = async (rig: Rig): Promise<GoEvent[]> => Object.entries(await rig.area.get(null)).filter(([k]) => k.startsWith(EVENT_KEY_PREFIX)).map(([, v]) => v as GoEvent);
const goToPractice = async (rig: Rig): Promise<HTMLElement> => {
  await rig.go('tutorial');
  rig.q('#tutorial-next').click(); // the concept step → the practice step
  await until(() => rig.root.querySelector('#demo-paragraph'));
  return rig.q('#demo-paragraph');
};
const hostPresent = (): boolean => !!document.querySelector('[data-golearn-host]');

describe('the orientation', () => {
  it('shows the pack’s steps one at a time, with the honest notice, progress and the examples', async () => {
    const rig = await makeRig();
    await rig.go('tutorial');
    expect(rig.q('#tutorial-progress').textContent).toBe('Step 1 of 3 · about 1 min');
    expect(rig.q('#tutorial-title').textContent).toBe('How the card works');
    expect(rig.text()).toContain('no native speaker has checked this orientation');
    expect(rig.q<HTMLButtonElement>('#tutorial-back').disabled).toBe(true);
    rig.q('#tutorial-next').click();
    await until(() => rig.q('#tutorial-progress').textContent?.startsWith('Step 2'));
    expect(rig.q<HTMLButtonElement>('#tutorial-back').disabled).toBe(false);
    await flush(20);
    expect(((await rig.area.get(KEYS.app))[KEYS.app] as { tutorialStep: number }).tutorialStep).toBe(1);
  });

  it('can be skipped in one click, and says so', async () => {
    const rig = await makeRig();
    await rig.go('tutorial');
    expect(rig.root.querySelector('.rail li[data-route="tutorial"] .mark.done')).toBeNull();
    rig.q('#tutorial-skip').click();
    await until(() => rig.root.querySelector('#tutorial-state'));
    expect(rig.q('#tutorial-state').getAttribute('data-state')).toBe('skipped');
    expect(rig.q('#tutorial-state').textContent).toBe('You skipped the orientation.');
    expect(((await rig.area.get(KEYS.app))[KEYS.app] as { tutorial: string }).tutorial).toBe('skipped');
    await until(() => rig.root.querySelector('.rail li[data-route="tutorial"] .mark.done'));
  });

  it('can be repeated: Repeat orientation starts again from step one, after finishing or skipping', async () => {
    const rig = await makeRig();
    await rig.go('tutorial');
    rig.q('#tutorial-skip').click();
    await until(() => rig.root.querySelector('#tutorial-repeat'));
    rig.q('#tutorial-repeat').click();
    await until(() => rig.root.querySelector('#tutorial-progress'));
    expect(rig.q('#tutorial-progress').textContent).toMatch(/^Step 1 of 3/);
    expect(((await rig.area.get(KEYS.app))[KEYS.app] as { tutorial: string }).tutorial).toBe('pending');
    // finish for real: practise, then Next through to Finish
    const para = await goToPractice(rig);
    selectText(para, 'shtëpinë');
    para.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => !rig.q<HTMLButtonElement>('#tutorial-next').disabled);
    rig.q('#tutorial-next').click();
    await until(() => rig.q('#tutorial-next').textContent === 'Finish');
    rig.q('#tutorial-next').click();
    await until(() => rig.root.querySelector('#tutorial-state'));
    expect(rig.q('#tutorial-state').getAttribute('data-state')).toBe('done');
    rig.q('#tutorial-repeat').click();
    await until(() => rig.root.querySelector('#tutorial-progress'));
    expect(rig.q('#tutorial-progress').textContent).toMatch(/^Step 1 of 3/);
  });

  it('a practice step completes only when the real parser sees the target word selected', async () => {
    const rig = await makeRig();
    const para = await goToPractice(rig);
    expect(para.textContent).toBe(DEMO_SENTENCE);
    const next = rig.q<HTMLButtonElement>('#tutorial-next');
    expect(next.disabled).toBe(true);

    // a different word: a real card still opens, but the step stays open and the learner is pointed back
    selectText(para, 'libër');
    para.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => /Now double-click/.test(rig.q('#tutorial-feedback').textContent ?? ''));
    expect(hostPresent()).toBe(true);
    expect(next.disabled).toBe(true);
    expect(rig.q('.demo').getAttribute('data-complete')).toBeNull();

    // the target word: the step completes
    selectText(para, 'shtëpinë');
    para.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => !next.disabled);
    expect(rig.q('.demo').getAttribute('data-complete')).toBe('true');
    expect(rig.q('#tutorial-feedback').textContent).toMatch(/Yes — that is “shtëpinë”/);
    expect(rig.q('#tutorial-feedback').textContent).toMatch(/recorded as a tutorial encounter/);
    expect(hostPresent()).toBe(true); // the real card is on the page
  });

  it('the keyboard route (Select it for me) takes the same path as the double-click', async () => {
    const rig = await makeRig();
    const para = await goToPractice(rig);
    expect(para).toBeTruthy();
    rig.q('#demo-select').click();
    await until(() => !rig.q<HTMLButtonElement>('#tutorial-next').disabled);
    expect(hostPresent()).toBe(true);
  });

  it('a selection outside the demonstration paragraph, or a long one, opens nothing', async () => {
    const rig = await makeRig();
    const para = await goToPractice(rig);
    selectText(rig.q('#tutorial-title'), 'Try it');
    para.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush(20);
    expect(hostPresent()).toBe(false);
    selectText(para, 'Unë po lexoj një libër');
    para.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush(20);
    expect(hostPresent()).toBe(false);
    expect(rig.q('#tutorial-feedback').textContent).toMatch(/single word or a short phrase/);
  });

  it('the passage step opens a card on any word without gating Next', async () => {
    const rig = await makeRig();
    await rig.go('tutorial');
    rig.q('#tutorial-next').click();
    await until(() => rig.root.querySelector('#demo-paragraph'));
    const skipTo = rig.q<HTMLButtonElement>('#tutorial-next');
    selectText(rig.q('#demo-paragraph'), 'shtëpinë');
    rig.q('#demo-paragraph').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => !skipTo.disabled);
    skipTo.click();
    await until(() => rig.q('#tutorial-title').textContent === 'A short passage');
    const sentence = rig.q('.demo .demo-sentence');
    expect(sentence.textContent).toBe('Nëna pi çaj në shtëpi.');
    selectText(sentence, 'çaj');
    sentence.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => /Looked up “çaj”/.test(rig.q('#tutorial-feedback').textContent ?? ''));
    expect(rig.q<HTMLButtonElement>('#tutorial-next').disabled).toBe(false);
  });

  it('leaving the screen removes the card from the page', async () => {
    const rig = await makeRig();
    const para = await goToPractice(rig);
    selectText(para, 'shtëpinë');
    para.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(hostPresent);
    await rig.go('privacy');
    expect(hostPresent()).toBe(false);
  });

  it('says plainly when the language has no orientation', async () => {
    const rig = await makeRig();
    await signIn(rig);
    await rig.app.ctx.state.setSession({ ...(await rig.app.ctx.state.getSession())!, enrolmentId: 'e', languageId: 'es' });
    await rig.go('tutorial');
    expect(rig.text()).toContain('There is no orientation for Spanish yet');
  });
});

describe('what the orientation records', () => {
  it('in the web app: a validated local row with producer.surface = tutorial, evidence none, and no sentence text', async () => {
    const rig = await makeRig();
    const para = await goToPractice(rig);
    selectText(para, 'shtëpinë');
    para.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => /recorded as a tutorial encounter/.test(rig.q('#tutorial-feedback').textContent ?? ''));
    const events = await rows(rig);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(validateEvent(e)).toEqual([]);
    expect(e.kind).toBe('SelectionLookedUp');
    expect(e.producer).toMatchObject({ app: 'golearn-app', surface: 'tutorial', version: '0.1.0-test' });
    expect(e.evidence).toEqual({ quality: 'none', assisted: true });
    expect(e.languageId).toBe('sq');
    expect(e.subject.sourceRef).toEqual({ kind: 'demo', title: 'GoLearn orientation', locator: '#/tutorial' });
    expect(e.subject.sentenceKey).toBeTruthy();
    expect(e.subject.itemIds!.some((i) => i.includes('shtëpi'))).toBe(true);
    expect(e.payload).toMatchObject({ surface: 'shtëpinë', contextKind: 'sentence', readerId: 'demo-reader' });
    expect(JSON.stringify(e)).not.toContain('lexoj'); // the sentence is a hash, never text
    // a local identity until there is an account
    expect(e.learnerId).toBe('local-learner');
  });

  it('with an account and an enrolment, the row carries the learner’s ids', async () => {
    const rig = await makeRig();
    await signIn(rig);
    await rig.app.ctx.state.setSession({ ...(await rig.app.ctx.state.getSession())!, enrolmentId: 'enr-9', languageId: 'sq' });
    const para = await goToPractice(rig);
    selectText(para, 'shtëpinë');
    para.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => /recorded as a tutorial encounter/.test(rig.q('#tutorial-feedback').textContent ?? ''));
    const e = (await rows(rig))[0];
    expect(e).toMatchObject({ learnerId: 'learner-ana', enrolmentId: 'enr-9' });
    expect(validateEvent(e)).toEqual([]);
  });

  it('in the extension: sent by golearn:record to the background as the extension’s own producer, with surface = tutorial', async () => {
    const rig = await makeRig({ extension: true });
    const bg = fakeBackground(rig);
    const para = await goToPractice(rig);
    selectText(para, 'shtëpinë');
    para.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => bg.recorded.length === 1);
    const e = bg.recorded[0] as unknown as GoEvent;
    expect(e.producer).toMatchObject({ app: 'golearn-ext', surface: 'tutorial' }); // the worker’s recorder admits only its own producer and replaces identity and device
    expect(e.kind).toBe('SelectionLookedUp');
    expect(validateEvent(e)).toEqual([]);
    expect(await rows(rig)).toHaveLength(0); // the worker owns the write
    await until(() => /recorded as a tutorial encounter/.test(rig.q('#tutorial-feedback').textContent ?? ''));
  });

  it('in the extension, a worker that refuses the event: the learner is told it was not recorded, and nothing is written behind its back', async () => {
    const rig = await makeRig({ extension: true });
    rig.chrome!.events.onMessage.addListener((m, _s, respond) => {
      if ((m as { type?: string }).type === 'golearn:record') { respond({ ok: false, error: 'kind-not-allowed' }); return true; }
      return undefined;
    });
    const para = await goToPractice(rig);
    selectText(para, 'shtëpinë');
    para.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => /could not be recorded/.test(rig.q('#tutorial-feedback').textContent ?? ''));
    expect(await rows(rig)).toHaveLength(0);
    expect(rig.q<HTMLButtonElement>('#tutorial-next').disabled).toBe(false); // the step itself still completes
  });

  it('in the extension without a worker that answers: written to the extension’s own store', async () => {
    const rig = await makeRig({ extension: true });
    const para = await goToPractice(rig);
    selectText(para, 'shtëpinë');
    para.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => /recorded as a tutorial encounter/.test(rig.q('#tutorial-feedback').textContent ?? ''));
    const stored = await rows(rig);
    expect(stored).toHaveLength(1);
    expect(stored[0].producer.surface).toBe('tutorial');
  });

  it('looking the same word up twice in one run is recorded once', async () => {
    const rig = await makeRig();
    const para = await goToPractice(rig);
    for (let i = 0; i < 2; i++) {
      selectText(para, 'shtëpinë');
      para.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await flush(30);
    }
    expect(await rows(rig)).toHaveLength(1);
  });
});

describe('createTutorialLookup with the real parser and the real card', () => {
  it('opens the extension’s own card for the selected word: lemma, meaning, confidence, and the recorded line', async () => {
    const rig = await makeRig();
    document.body.insertAdjacentHTML('beforeend', `<p id="p">${DEMO_SENTENCE}</p>`);
    const p = document.getElementById('p')!;
    const outcomes: string[] = [];
    const look = createTutorialLookup({ ctx: rig.app.ctx, languageId: 'sq', onOutcome: (o) => outcomes.push(o.card.surface) });
    selectText(p, 'shtëpinë');
    const o = await look.lookup(p);
    expect(o!.card.lemma).toBe('shtëpi');
    expect(o!.card.languageId).toBe('sq');
    expect(o!.card.context.kind).toBe('sentence');
    expect(o!.recorded).toBe('recorded');
    expect(outcomes).toEqual(['shtëpinë']);
    const card = look.ui.root()!;
    expect(look.ui.isOpen()).toBe(true);
    expect(card.textContent).toContain('shtëpi');
    expect(card.textContent).toContain('Encounter recorded.');
    expect(card.querySelector('[role="dialog"]')).toBeTruthy();
    look.destroy();
    expect(look.ui.isOpen()).toBe(false);
  });

  it('compares the target and the looked-up word without regard to case, edge punctuation or composition', () => {
    expect(sameWord('Shtëpinë', 'shtëpinë')).toBe(true);
    expect(sameWord('shtëpinë.', 'shtëpinë')).toBe(true);
    expect(sameWord('shtëpinë', 'shtëpinë')).toBe(true);
    expect(sameWord('shtëpi', 'shtëpinë')).toBe(false);
  });
});
