// @vitest-environment jsdom
// PLAN8: GoListen is deferred. With `features.listen = false` no audio interface and no statement about listening is shown.
// Uses the harness with `features: { listen: false }`; the same pages with `listen: true` are covered by the existing suites.
import { afterEach, describe, expect, it } from 'vitest';
import type { ReadingProgress, Recommendation } from '../../src/core';
import { THAI_COURSE_ID, THAI_WORKS } from '../../src/course';
import { AppRoutes, Shell } from '../../src/ui/App';
import { TextProgress } from '../../src/ui/coverage';
import { setPref } from '../../src/ui/prefs';
import { Testimony } from '../../src/ui/testimony/Testimony';
import { button, byLabel, click, makeHarness, q, qa, type as typeInto } from './harness';
import type { Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;
const off = { features: { listen: false } } as const;
const AUDIO_WORDS = /\b(audio|listen(ing|ed)?|hear(ing|d)?|speech|spoken|recording|recordings|shadow\w*|placeholder sound)\b/i;

describe('listening off: Settings', () => {
  it('has no Speech section, no nav entry for it, and nothing about audio, recordings or fixture sound anywhere on the page', async () => {
    const h = await makeHarness(off);
    mounted = await h.mount(app(), { router: '/settings' });
    expect(q(mounted.container, '[data-settings-section="speech"]')).toBeNull();
    expect(qa(mounted.container, '.settings__nav-btn').map((b) => b.textContent)).not.toContain('Speech');
    expect(q(mounted.container, '[data-testid="speech-availability"]')).toBeNull();
    // Advanced, opened: no direct key, no fixture switch, no audio diagnostics
    await click(button(byLabel(mounted.container, 'Advanced'), 'Advanced'));
    const adv = byLabel(mounted.container, 'Advanced');
    expect(q(adv, 'input[type="password"]')).toBeNull();
    expect(qa(mounted.container, '[aria-label="Development fixture audio"], [aria-label="Azure speech"], [aria-label="GoListen diagnostics"]')).toHaveLength(0);
    expect(adv.textContent).not.toMatch(AUDIO_WORDS);
    // Backup: no recordings option; Content: the preview note does not mention audio
    expect(q(mounted.container, '[aria-label="Include my recordings"]')).toBeNull();
    expect(byLabel(mounted.container, 'Content').textContent).not.toMatch(AUDIO_WORDS);
    expect(byLabel(mounted.container, 'Backup and recovery').textContent).not.toMatch(AUDIO_WORDS);
  });

  it('a backup still carries recordings that are on this device (the option is hidden, nothing is dropped)', async () => {
    const h = await makeHarness(off);
    mounted = await h.mount(app(), { router: '/settings' });
    await click(button(byLabel(mounted.container, 'Backup and recovery'), 'Export my data'));
    expect(h.controls.backup.exportLearner).toHaveBeenCalledWith('u1', { includeRecordings: true });
  });

  it('the evidence explanation and the vocabulary table make no statement about listening', async () => {
    const h = await makeHarness(off);
    mounted = await h.mount(app(), { router: '/settings' });
    await click(button(byLabel(mounted.container, 'Advanced'), 'Advanced'));
    expect(byLabel(mounted.container, 'Evidence').textContent).not.toMatch(AUDIO_WORDS);
    expect(byLabel(mounted.container, 'Vocabulary').textContent).not.toMatch(/\b(heard|hear|listening)\b/i);
  });

  it('with listening on, the same page keeps its Speech section, recordings option and fixture switch', async () => {
    const h = await makeHarness({ features: { listen: true } });
    mounted = await h.mount(app(), { router: '/settings' });
    expect(q(mounted.container, '[data-settings-section="speech"]')).not.toBeNull();
    expect(q(mounted.container, '[aria-label="Include my recordings"]')).not.toBeNull();
  });
});

describe('listening off: banners, Home, progress', () => {
  it('the preview banner does not mention audio or placeholder sound', async () => {
    const h = await makeHarness(off);
    setPref('preview', true);
    mounted = await h.mount(app());
    const banner = q(mounted.container, '[data-testid="preview-banner"]')!;
    expect(banner.textContent).toContain('Unreviewed content is showing');
    expect(banner.textContent).not.toMatch(AUDIO_WORDS);
    await mounted.unmount();
    const on = await makeHarness({ features: { listen: true } });
    setPref('preview', true); // a new harness resets the preferences
    mounted = await on.mount(app());
    expect(q(mounted.container, '[data-testid="preview-banner"]')!.textContent).toContain('placeholder sound');
  });

  it('Home drops an audio recommendation even if the engine offers one', async () => {
    const h = await makeHarness(off);
    await seedStory(h.store);
    const rec = (over: Partial<Recommendation>): Recommendation => ({ reason: 'next-input', reinforces: [], score: 1, explanation: 'because', ...over });
    h.learn.recommend.mockImplementation(async () => [rec({ reason: 'listen-to-read-text', textId: STORY_ID, explanation: 'Reviewed real speech exists.' }), rec({ reason: 'reread', textId: STORY_ID })]);
    mounted = await h.mount(app());
    expect(qa(mounted.container, 'ul.list li').map((li) => li.getAttribute('data-reason'))).toEqual(['reread']);
    expect(mounted.container.textContent).not.toMatch(AUDIO_WORDS);
  });

  it('the reader\'s progress block shows no "listened" figure (but does with listening on)', async () => {
    const progress: ReadingProgress = { userId: 'u1', lang: 'es', textId: STORY_ID, contentVersion: 1, sentencesTotal: 4, sentencesSeen: 2, sentencesUnderstood: 0, sittings: 1, listenedSentences: 3, reportedComprehension: 'most' };
    const h = await makeHarness(off);
    mounted = await h.mount(<TextProgress textId={STORY_ID} progress={progress} />);
    expect(q(mounted.container, '[data-testid="reading-extras"]')!.textContent).toContain('you said you understood most of it');
    expect(mounted.container.textContent).not.toMatch(/listened/);
    await mounted.unmount();
    const on = await makeHarness({ features: { listen: true } });
    mounted = await on.mount(<TextProgress textId={STORY_ID} progress={progress} />);
    expect(mounted.container.textContent).toContain('listened to 3 sentences');
  });
});

describe('listening off: the reading ladder', () => {
  it('does not show the LISTENING works or group; every other work is unchanged', async () => {
    const h = await makeHarness({ ...off, courseId: THAI_COURSE_ID });
    mounted = await h.mount(app(), { router: '/course' });
    for (const b of qa<HTMLButtonElement>(mounted.container, '.stage .disclosure__btn')) if (b.getAttribute('aria-expanded') !== 'true') await click(b);
    const audio = THAI_WORKS.filter((w) => w.role === 'audio');
    expect(audio.length).toBeGreaterThan(0);
    expect(qa(mounted.container, '[data-work]')).toHaveLength(THAI_WORKS.length - audio.length);
    for (const w of audio) expect(q(mounted.container, `[data-work="${w.id}"]`)).toBeNull();
    expect(qa(mounted.container, '[data-group="listening"]')).toHaveLength(0);
    expect(mounted.container.textContent).not.toContain('A listening recommendation');
    await mounted.unmount();
    const on = await makeHarness({ features: { listen: true }, courseId: THAI_COURSE_ID });
    mounted = await on.mount(app(), { router: '/course' });
    for (const b of qa<HTMLButtonElement>(mounted.container, '.stage .disclosure__btn')) if (b.getAttribute('aria-expanded') !== 'true') await click(b);
    expect(qa(mounted.container, '[data-work]')).toHaveLength(THAI_WORKS.length);
  });
});

describe('listening off: My Testimony', () => {
  it('a saved version shows no revision audio, no recorder and no shadowing controls', async () => {
    const h = await makeHarness(off);
    mounted = await h.mount(<Testimony />);
    await typeInto(byLabel<HTMLTextAreaElement>(mounted.container, 'Your testimony'), 'Yo creo en Dios.');
    await click(button(mounted.container, 'Save this version'));
    expect(mounted.container.textContent).toContain('Version 1');
    expect(q(mounted.container, '[aria-label="Listen and rehearse"]')).toBeNull();
    expect(qa(mounted.container, 'button').some((b) => /Record sentence|shadow/i.test(`${b.getAttribute('aria-label') ?? ''}${b.textContent}`))).toBe(false);
    await mounted.unmount();
    const on = await makeHarness({ features: { listen: true } });
    mounted = await on.mount(<Testimony />);
    await typeInto(byLabel<HTMLTextAreaElement>(mounted.container, 'Your testimony'), 'Yo creo en Dios.');
    await click(button(mounted.container, 'Save this version'));
    expect(q(mounted.container, '[aria-label="Listen and rehearse"]')).not.toBeNull();
  });
});
