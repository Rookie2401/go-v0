// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import type { ComprehensionReported, Stage0CheckAnswered } from '../../src/core';
import { bootstrap } from '../../src/app/bootstrap';
import type { BootstrapResult } from '../../src/app/bootstrap';
import { AppRoutes, Shell } from '../../src/ui/App';
import { AppProvider } from '../../src/ui/context';
import { resetPrefsForTests } from '../../src/ui/prefs';
import { bundledStage0 } from '../../src/stage0';
import { button, click, flush, installMediaStubs, q, qa } from './harness';

/** Stage 0 from a blank Spanish profile, over the REAL engines: Home's way in, the path, one scene, the exit's promise. */
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
      <AppProvider services={boot.services} user={boot.user!} course={boot.course!} session="ses-s0">
        <MemoryRouter initialEntries={[route]}><Shell><AppRoutes /></Shell></MemoryRouter>
      </AppProvider>,
    );
  });
  await flush(30);
  unmount = async () => { await act(async () => root.unmount()); container.remove(); };
  return container;
}

describe('Start from zero (Spanish)', () => {
  it('Home offers a way in for a learner who knows nothing', async () => {
    const page = await render('/');
    expect(q(page, '[data-testid="stage0-entry"]')!.textContent).toMatch(/Start from zero/);
  });

  it('the path page says what the content is, asks the speaker form once, and shows independence, not points', async () => {
    const page = await render('/start');
    expect(q(page, '[data-testid="stage0-draft"]')!.textContent).toMatch(/AI model.*not yet checked by a native speaker/);
    expect(q(page, '[data-testid="stage0-sound"]')!.textContent).toMatch(/No recordings of native speakers exist yet/);
    await click(button(page, 'Forms for a woman'));
    await flush(20);
    expect(page.textContent).not.toMatch(/which forms should Go teach you/);
    expect(q(page, '[aria-label="Your independence"]')!.textContent).toMatch(/Sentences understood before any English/);
    expect(qa(page, '[data-step]').length).toBe(bundledStage0().packs.get('es')!.path.steps.length);
    expect(q(page, '[data-testid="stage0-continue"]')!.textContent).toMatch(/Begin: Hello, I am Sam/);
  });

  it('a scene: lines one at a time, English only on request, the answer recorded with whether English came first', async () => {
    const page = await render('/start/s01');
    expect(qa(page, '.stage0-line')).toHaveLength(1);
    for (let i = 0; i < 4; i++) { await click(button(page, 'Next line')); await flush(5); }
    expect(qa(page, '.stage0-line')).toHaveLength(5);
    expect(page.textContent).not.toMatch(/My name is Sam/); // the English is not shown until asked
    const english = qa<HTMLButtonElement>(page, '.stage0-line button').filter((b) => b.textContent === 'English');
    await click(english[1]); // line 2
    await flush(10);
    expect(page.textContent).toMatch(/My name is Sam/);
    await click(qa<HTMLButtonElement>(page, '[data-check="c1"] .stage0-option')[0]);
    await click(qa<HTMLButtonElement>(page, '[data-check="c2"] .stage0-option')[0]);
    await flush(20);
    const answers = (await boot.services.bus.history({ userId: boot.user!.id, types: ['Stage0CheckAnswered'] })) as Stage0CheckAnswered[];
    expect(answers.map((a) => [a.checkId, a.correct, a.rescuedBefore])).toEqual([['c1', true, true], ['c2', true, false]]);
    // only the unrescued answer reached GoLearn as understood
    const reports = (await boot.services.bus.history({ userId: boot.user!.id, types: ['ComprehensionReported'] })) as ComprehensionReported[];
    expect(reports).toHaveLength(1);
    expect(q(page, '[aria-label="Your turn"]')).not.toBeNull();
  });

  it('the exit check promises unseen material and says listening cannot be given without native recordings', async () => {
    const page = await render('/start/exit');
    expect(page.textContent).toMatch(/sentences you have not seen/);
    expect(page.textContent).toMatch(/none exist yet/);
    expect(page.textContent).toMatch(/counts as seen/);
  });
});
