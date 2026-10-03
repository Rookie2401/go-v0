// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import type { TellAttemptSubmitted } from '../../src/core';
import { bootstrap } from '../../src/app/bootstrap';
import type { BootstrapResult } from '../../src/app/bootstrap';
import { AppRoutes, Shell } from '../../src/ui/App';
import { AppProvider } from '../../src/ui/context';
import { resetPrefsForTests } from '../../src/ui/prefs';
import { button, byLabel, click, flush, installMediaStubs, q, qa, type } from './harness';

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
