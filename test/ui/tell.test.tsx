// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import type { PracticeTask, SemanticGoal, TellAttemptSubmitted } from '../../src/core';
import { buildFixtureText } from '../../src/core';
import { bootstrap } from '../../src/app/bootstrap';
import type { BootstrapResult } from '../../src/app/bootstrap';
import { AppRoutes, Shell } from '../../src/ui/App';
import { AppProvider } from '../../src/ui/context';
import { resetPrefsForTests } from '../../src/ui/prefs';
import { button, byLabel, click, flush, installMediaStubs, q, qa, type } from './harness';
import { STORY_ID, seedStory } from './fixtures';

/** Practise saying it (/tell), the inspector and the testimony map — over the REAL engines (Spanish course). */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let boot: BootstrapResult;
let unmount: (() => Promise<void>) | undefined;
beforeEach(async () => {
  resetPrefsForTests(); localStorage.clear(); installMediaStubs();
  boot = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', features: { listen: false } });
});
afterEach(async () => { await unmount?.(); unmount = undefined; resetPrefsForTests(); localStorage.clear(); });

async function render(route: string) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <AppProvider services={boot.services} user={boot.user!} course={boot.course!} session="ses-tell">
        <MemoryRouter initialEntries={[route]}><Shell><AppRoutes /></Shell></MemoryRouter>
      </AppProvider>,
    );
  });
  await flush(20);
  unmount = async () => { await act(async () => root.unmount()); container.remove(); };
  return container;
}

describe('Practise saying it', () => {
  it('marks unreviewed catalog wording in both sentence frames and full models', async () => {
    const base = (await boot.services.gotell.practice!.next(boot.user!.id, 'es'))!;
    const assistance: PracticeTask['assistance'] = [
      {
        id: 'frame-sq', kind: 'sentence-frame', tier: 'scaffold', rung: 4,
        content: 'Unë ___ në ___.', revealedItemIds: ['form:1', 'form:2'], source: 'catalog-model',
        review: 'unreviewed', at: '2026-10-03T00:00:00.000Z',
      },
      {
        id: 'full-sq', kind: 'full-model', tier: 'model', rung: 8,
        content: 'Unë shkoj në shtëpi.', revealedItemIds: ['form:1', 'form:2'], source: 'catalog-model',
        review: 'unreviewed', at: '2026-10-03T00:00:01.000Z',
      },
    ];
    const task: PracticeTask = { ...base, lang: 'sq', assistance };
    const practice = boot.services.gotell.practice!;
    const fakePractice = { ...practice, goals: async () => [], states: async () => [], next: async () => task };
    Object.assign(boot.services.gotell, { practice: fakePractice, forUser: () => ({ ...boot.services.gotell, practice: fakePractice }) });

    const page = await render('/tell');
    const steps = qa(page, '.tell-step');
    expect(steps).toHaveLength(2);
    for (const step of steps) {
      expect(step.textContent).toContain('MODEL LANGUAGE — not your words; not yet reviewed by a native speaker');
    }
    expect(steps[0].getAttribute('data-kind')).toBe('sentence-frame');
    expect(task.assistance[0].source).toBe('catalog-model');
    expect(steps[0].textContent).toContain('Unë ___ në ___.');
  });

  it('links a retell task to its readable source and hides a protected or unavailable source', async () => {
    await seedStory(boot.services.store);
    const source = (await boot.services.store.texts.get(STORY_ID))!;
    await boot.services.store.texts.put({ ...source, published: true });
    const task: PracticeTask = {
      taskId: 'retell:1', userId: boot.user!.id, lang: 'es', goal: {} as SemanticGoal, family: 'retell',
      prompt: 'Retell this meaning in your own words.', retellSource: { textId: STORY_ID, title: source.title }, presentedAt: '2026-10-03T00:00:00.000Z',
      selection: { score: 1, factors: [], reasons: [], predictedSuccess: 0.2, familyReason: 'Retell a passage.', startRung: 0, startReason: 'Start simply.', policy: 'test' },
      assistance: [], attempts: [], open: true,
    };
    const practice = boot.services.gotell.practice!;
    const fakePractice = { ...practice, goals: async () => [], states: async () => [], next: async () => task };
    Object.assign(boot.services.gotell, { practice: fakePractice, forUser: () => ({ ...boot.services.gotell, practice: fakePractice }) });
    const page = await render('/tell');
    await flush(20);
    const sourceLink = q<HTMLAnchorElement>(page, '[data-testid="retell-source"] a')!;
    expect(sourceLink.textContent).toBe(source.title);
    expect(sourceLink.getAttribute('href')).toBe(`/read/${encodeURIComponent(STORY_ID)}`);
    await click(sourceLink);
    await flush(20);
    expect(q(page, 'article.reader')).toBeTruthy();
    await unmount?.(); unmount = undefined;

    const protectedSource = await buildFixtureText(boot.services.store, { lang: 'es', slug: 'protected-retell', title: 'Protected retell source', sentences: [{ text: 'No mostrar.', tokens: [{ surface: 'No', lemma: 'no' }] }] });
    await boot.services.store.texts.put({ ...protectedSource, published: true });
    await boot.services.store.texts.put({ ...protectedSource, listeningAssessmentId: 'assessment:retell' });
    const protectedPractice = { ...practice, goals: async () => [], states: async () => [], next: async () => ({ ...task, retellSource: { textId: protectedSource.id, title: protectedSource.title } }) };
    Object.assign(boot.services.gotell, { practice: protectedPractice, forUser: () => ({ ...boot.services.gotell, practice: protectedPractice }) });
    const hidden = await render('/tell');
    expect(q(hidden, '[data-testid="retell-source"]')?.textContent).toContain('no longer available');
    expect(q(hidden, '[data-testid="retell-source"] a')).toBeNull();
    expect(hidden.textContent).not.toContain('Protected retell source');
  });

  it('offers one meaning with its reasons, keeps MY LANGUAGE and MODEL LANGUAGE apart, and records each step', async () => {
    const page = await render('/tell');
    const task = q(page, '.tell-task')!;
    expect(task).not.toBeNull();
    expect(q(task, '.tell-prompt')!.textContent).toMatch(/Say in Spanish|Answer in Spanish|Your testimony/);
    expect(qa(task, '[aria-label="Selected because"] li').length).toBeGreaterThan(1);

    await type(byLabel<HTMLTextAreaElement>(page, 'Your words'), 'hola');
    await click(button(page, 'Check'));
    await flush(20);
    const attempt = q(page, '.tell-attempt')!;
    expect(attempt.textContent).toContain('MY LANGUAGE');
    expect(attempt.textContent).toContain('hola'); // exactly as typed
    expect(attempt.textContent).toMatch(/not complete yet/);

    // ask for help until the model appears
    for (let i = 0; i < 12 && !q(page, '.tell-step--model'); i++) {
      const hint = qa<HTMLButtonElement>(page, 'button').find((b) => /^Hint:/.test(b.textContent ?? ''));
      if (!hint) break;
      await click(hint);
      await flush(20);
    }
    const model = q(page, '.tell-step--model')!;
    expect(model.textContent).toMatch(/MODEL LANGUAGE — not your words; not yet reviewed by a native speaker/);
    const modelText = q(model, '.tell-step__text')!.textContent!.split('\n')[0];

    await type(byLabel<HTMLTextAreaElement>(page, 'Your words'), modelText);
    await click(button(page, 'Check'));
    await flush(20);
    expect(qa(page, '.tell-attempt').at(-1)!.textContent).toContain('MY LANGUAGE WITH ASSISTANCE');
    expect(q(page, '[data-testid="tell-done"]')!.textContent).toMatch(/with the model in front of you/);

    const recs = (await boot.services.bus.history({ userId: boot.user!.id, types: ['TellAttemptSubmitted'] })) as TellAttemptSubmitted[];
    expect(recs.map((r) => r.record.text)).toEqual(['hola', modelText]);
    expect(recs[1].record.tier).toBe('model');
    expect(recs[1].record.levelAfter).toBe(1);
  });

  it('the inspector shows every factor of every candidate, and records nothing', async () => {
    const before = (await boot.services.bus.history({ userId: boot.user!.id })).length;
    const page = await render('/tell/inspect');
    const cands = qa(page, '.cand');
    expect(cands.length).toBeGreaterThan(5);
    expect(qa(cands[0], 'tbody tr').length).toBe(12);
    expect(cands[0].textContent).toMatch(/Selected because:/);
    expect(q(page, '[aria-label="Error taxonomy"]')!.textContent).toContain('meaning.missing-concept');
    expect((await boot.services.bus.history({ userId: boot.user!.id })).length).toBe(before);
  });

  it('My Testimony links to practice and shows the testimony map when opened', async () => {
    const page = await render('/testimony');
    expect(qa<HTMLAnchorElement>(page, 'a').some((a) => /Practise saying parts of your testimony/.test(a.textContent ?? ''))).toBe(true);
    await click(button(page, 'Your testimony map'));
    await flush(20);
    const map = q(page, '[data-testid="testimony-map"]')!;
    expect(map.textContent).toMatch(/30-second version/);
    expect(qa(map, '.tell-map__node').length).toBe(11);
  });
});
