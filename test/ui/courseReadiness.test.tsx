// @vitest-environment jsdom
// Readiness and pace for every course (R5): a course whose stages are shelves gets the same "You are working at" line and
// "How is this going?" as the Thai ladder. Uses the real createCourseCatalog on the memory store and the harness's scripted GoLearn.
import { afterEach, describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { GERMAN_COURSE_ID, GERMAN_SHELVES, HINDI_COURSE_ID, HINDI_SHELVES, NORWEGIAN_COURSE_ID, NORWEGIAN_SHELVES, SPANISH_COURSE_ID, SPANISH_SHELVES } from '../../src/course';
import { AppRoutes, Shell } from '../../src/ui/App';
import { button, byLabel, choose, click, makeHarness, q, qa } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;

describe('the German course page (shelves, no ladder)', () => {
  it('renders StageStatus: the shelf he is working at, with Change and "How is this going?"', async () => {
    const h = await makeHarness({ courseId: GERMAN_COURSE_ID });
    mounted = await h.mount(app(), { router: '/course' });
    expect(q(mounted.container, '[data-testid="shelf-course"]')).not.toBeNull();
    const status = byLabel(mounted.container, 'Your stage');
    expect(q(status, '[data-testid="current-stage"]')!.textContent).toBe(GERMAN_SHELVES[0]!.label);
    expect(button(status, 'Change').getAttribute('aria-expanded')).toBe('false');
    expect(button(status, 'How is this going?').getAttribute('aria-expanded')).toBe('false');
    // no ladder is listed and nothing looks like a lock, a badge or a score
    expect(qa(mounted.container, '[data-stage]')).toHaveLength(0);
    expect(mounted.container.textContent!.toLowerCase()).not.toMatch(/locked|unlock|badge|level up/);
  });

  it('asks GoLearn for the readiness of the current shelf only when opened, and shows the signals and the pace', async () => {
    const h = await makeHarness({
      courseId: GERMAN_COURSE_ID,
      learn: {
        stageReadiness: {
          verdict: 'stay', explanation: 'Keep reading on this shelf for now.',
          signals: [
            { key: 'lookup-rate', status: 'met', target: '4 or fewer per 100 words', explanation: '3 lookups per 100 words over your last 300 sentences.' },
            { key: 'retention', status: 'not-met', target: '85 % without help', explanation: '70 of 100 words came back without help.' },
          ],
        },
        pace: { wordsPerMinute: 41.6, sentences: 80, lookupsPer100Words: 3, rescuesPer100Sentences: 2.5, trend: 'faster' },
      },
    });
    mounted = await h.mount(app(), { router: '/course' });
    h.learn.stageReadiness.mockClear(); // the catalogue asked once, to pick the current shelf
    expect(h.learn.stageReadiness).not.toHaveBeenCalled();
    await click(button(mounted.container, 'How is this going?'));
    expect(h.learn.stageReadiness).toHaveBeenCalledWith('u1', GERMAN_COURSE_ID, ids.stage(GERMAN_COURSE_ID, 's0'));
    const panel = q(mounted.container, '[data-testid="readiness"]')!;
    expect(panel.textContent).toContain('Keep reading on this shelf for now.');
    expect(q(panel, '[data-signal="lookup-rate"]')!.textContent).toContain('met');
    expect(q(panel, '[data-signal="retention"]')!.textContent).toContain('not yet');
    expect(q(panel, '[data-testid="pace"]')!.textContent).toContain('About 42 words a minute');
    expect(panel.textContent).toContain('advice');
  });

  it('moves to the next shelf when GoLearn says the first is ready, and Change stores his own choice', async () => {
    const h = await makeHarness({ courseId: GERMAN_COURSE_ID, learn: { stageReadiness: { verdict: 'insufficient-data' } } });
    h.learn.stageReadiness.mockImplementation(async (userId: string, courseId: string, stageId?: string) => ({
      userId, courseId, stageId: stageId ?? '', signals: [], explanation: '',
      verdict: stageId === ids.stage(GERMAN_COURSE_ID, 's0') ? 'ready-to-advance' : 'insufficient-data',
    }));
    mounted = await h.mount(app(), { router: '/course' });
    expect(q(mounted.container, '[data-testid="current-stage"]')!.textContent).toBe(GERMAN_SHELVES[1]!.label);
    const status = byLabel(mounted.container, 'Your stage');
    await click(button(status, 'Change'));
    expect(qa(status, 'select option')).toHaveLength(GERMAN_SHELVES.length);
    await choose(q<HTMLSelectElement>(status, 'select')!, ids.stage(GERMAN_COURSE_ID, 's5'));
    expect(q(mounted.container, '[data-testid="current-stage"]')!.textContent).toBe(GERMAN_SHELVES[5]!.label);
    expect((await h.services.catalog.currentStage('u1', GERMAN_COURSE_ID))!.id).toBe(ids.stage(GERMAN_COURSE_ID, 's5'));
    expect(button(status, 'Change').getAttribute('aria-expanded')).toBe('false');
  });
});

describe.each([
  ['Spanish', SPANISH_COURSE_ID, SPANISH_SHELVES],
  ['Hindi', HINDI_COURSE_ID, HINDI_SHELVES],
  ['Norwegian', NORWEGIAN_COURSE_ID, NORWEGIAN_SHELVES],
] as const)('%s', (_name, courseId, shelves) => {
  it('shows StageStatus with its first shelf and a "How is this going?" that answers', async () => {
    const h = await makeHarness({ courseId });
    mounted = await h.mount(app(), { router: '/course' });
    expect(q(mounted.container, '[data-testid="current-stage"]')!.textContent).toBe(shelves[0]!.label);
    await click(button(mounted.container, 'How is this going?'));
    expect(h.learn.stageReadiness).toHaveBeenCalledWith('u1', courseId, shelves[0]!.id);
    expect(q(mounted.container, '[data-testid="readiness"]')).not.toBeNull();
    expect(q(mounted.container, '[data-testid="pace"]')).not.toBeNull();
  });
});
