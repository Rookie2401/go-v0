// @vitest-environment jsdom
/**
 * Settings → Content → Recordings. Recordings are curation, not a destination: GoListen is GoLearn's listening layer, shown in the
 * Reader; the form that adds a recording and the list of which texts have one (and what review it has) live here.
 * The checks and the trust cap are those of the old listening page: a learner's upload is always `origin: 'learner'`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes, Shell } from '../../src/ui/App';
import { ids, buildFixtureText } from '../../src/core';
import { button, byLabel, catalogText, choose, click, makeHarness, pickFiles, q, qa, seedAudio } from './harness';
import type { Harness, Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const open = async (h: Harness) => {
  mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/settings' });
  return mounted;
};
const recordings = () => byLabel(mounted!.container, 'Recordings');
const storyIds = () => [0, 1, 2].map((i) => ids.sentence(STORY_ID, i));
/** What GoListen reports for a lawful, playable recording (the fake derives no `playAllowed`). */
const playable = { status: () => ({ playAllowed: true, sourceType: 'human-recording' as const }) };

describe('Settings → Content → Recordings: which texts have a recording', () => {
  it('is inside Content, not a section of its own, and says so plainly when there are none', async () => {
    const h = await makeHarness({ listen: { unavailable: true } });
    await seedStory(h.store);
    await open(h);
    expect(byLabel(mounted!.container, 'Content').contains(recordings())).toBe(true);
    expect(qa(mounted!.container, '[data-settings-section]').map((s) => s.getAttribute('data-settings-section'))).not.toContain('recordings');
    expect(q(recordings(), '[data-testid="recordings-empty"]')!.textContent).toContain('No recordings on this device for this language yet');
  });

  it('lists a reviewed recording as counted, with a link into the Reader', async () => {
    const h = await makeHarness({ listen: { providerId: 'azure', approved: true, ...playable } });
    await seedStory(h.store);
    await seedAudio(h.store, h.voice, STORY_ID, storyIds());
    await open(h);
    const row = q(recordings(), `li[data-text-id="${STORY_ID}"]`)!;
    expect(row.textContent).toContain('Story 1');
    expect(row.getAttribute('data-evidence')).toBe('yes');
    expect(q(row, '[data-testid="recording-state"]')!.textContent).toBe('Reviewed recording: counts as listening.');
    expect(row.querySelector('a')!.getAttribute('href')).toBe(`/read/${encodeURIComponent(STORY_ID)}`);
  });

  it('lists an unreviewed recording as plays-here-only, and leaves out audio that is not a recording', async () => {
    const h = await makeHarness({ listen: { ...playable } }); // fixture voice: preview-only
    await seedStory(h.store);
    await seedAudio(h.store, h.voice, STORY_ID, storyIds());
    await open(h);
    const row = q(recordings(), `li[data-text-id="${STORY_ID}"]`)!;
    expect(row.getAttribute('data-evidence')).toBe('no');
    expect(q(row, '[data-testid="recording-state"]')!.textContent).toMatch(/^Not reviewed: plays on this device, not counted as listening\./);
    await mounted!.unmount(); mounted = undefined;

    const h2 = await makeHarness({ listen: { status: () => ({ playAllowed: true, sourceType: 'generated-tts' as const, isSpeech: false }) } });
    await seedStory(h2.store);
    await seedAudio(h2.store, h2.voice, STORY_ID, storyIds());
    await open(h2);
    expect(q(recordings(), `li[data-text-id="${STORY_ID}"]`)).toBeNull();
  });

  it('lists a manifest whose text this device has not opened by its catalogue title, without opening it', async () => {
    const h = await makeHarness({ listen: { providerId: 'azure', approved: true, ...playable } });
    const story = await seedStory(h.store);
    await seedAudio(h.store, h.voice, STORY_ID, storyIds());
    await h.store.texts.delete(STORY_ID);
    await h.store.catalog.put(catalogText({ id: STORY_ID, title: story.title, stream: 'library' }) as never);
    h.library.items.push(catalogText({ id: STORY_ID, title: story.title, stream: 'library' }));
    await open(h);
    const row = q(recordings(), `li[data-text-id="${STORY_ID}"]`);
    expect(row?.textContent).toContain(story.title);
    expect(row?.querySelector('a')?.getAttribute('href')).toBe(`/read/${encodeURIComponent(STORY_ID)}`);
    expect(h.library.opened).toEqual([]);
    expect(h.listen.ensureAudio).not.toHaveBeenCalled();
  });

  it('is not there when listening is switched off', async () => {
    const h = await makeHarness({ features: { listen: false } });
    await open(h);
    expect(q(mounted!.container, '[data-testid="recordings"]')).toBeNull();
    expect(h.listen.audioStatus).not.toHaveBeenCalled();
  });
});

describe('Settings → Content → Recordings: adding one', () => {
  const manifestFile = (manifest: string) => Object.assign(new File([manifest], 'm.json', { type: 'application/json' }), { text: async () => manifest });
  // (jsdom's File has no text()/arrayBuffer(): give these two the reads the form uses)
  const audioFile = () => Object.assign(new File([new Uint8Array([1, 2, 3])], 'a.wav', { type: 'audio/wav' }), { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });

  it('says plainly that an upload is not a review, and always imports as a learner import', async () => {
    const h = await makeHarness({ listen: { unavailable: true } });
    const story = await seedStory(h.store);
    const importRecording = vi.fn(async () => ({ manifest: {}, asset: {}, imported: 1, reused: false }));
    (h.listen as unknown as Record<string, unknown>).importRecording = importRecording;
    const view = await open(h);
    const warning = view.container.querySelector('[data-testid="import-warning"]')!;
    expect(warning.textContent).toMatch(/plays on this device/);
    expect(warning.textContent).toMatch(/counts toward listening progress only after a named reviewer approves it for the course/);
    expect(warning.textContent).toMatch(/rights stated in the manifest are your own statement/);

    await choose(view.container.querySelector<HTMLSelectElement>('select[aria-label="Text release"]')!, story.id);
    // the manifest claims everything; none of it may travel as a review
    const manifest = JSON.stringify({ textId: story.id, kind: 'human', qualityState: 'approved', rights: { status: 'approved' } });
    await pickFiles(view.container.querySelector<HTMLInputElement>('input[aria-label="Recording manifest"]')!, [manifestFile(manifest)]);
    await pickFiles(view.container.querySelector<HTMLInputElement>('input[aria-label="Audio file"]')!, [audioFile()]);
    await click(button(view.container, 'Check and add recording'));
    expect(importRecording).toHaveBeenCalledTimes(1);
    expect((importRecording.mock.calls[0] as unknown[])[0]).toMatchObject({ origin: 'learner' });
    expect(((importRecording.mock.calls[0] as unknown[])[0] as { reviewer?: string }).reviewer).toBeUndefined();
    expect(view.container.textContent).toMatch(/only after a named reviewer approves it/);
  });

  it('refuses a manifest for a different text than the one chosen, and imports nothing', async () => {
    const h = await makeHarness({ listen: { unavailable: true } });
    const story = await seedStory(h.store);
    const importRecording = vi.fn(async () => ({ manifest: {}, asset: {}, imported: 1, reused: false }));
    (h.listen as unknown as Record<string, unknown>).importRecording = importRecording;
    const view = await open(h);
    await choose(view.container.querySelector<HTMLSelectElement>('select[aria-label="Text release"]')!, story.id);
    await pickFiles(view.container.querySelector<HTMLInputElement>('input[aria-label="Recording manifest"]')!, [manifestFile(JSON.stringify({ textId: 'text:es:other' }))]);
    await pickFiles(view.container.querySelector<HTMLInputElement>('input[aria-label="Audio file"]')!, [audioFile()]);
    await click(button(view.container, 'Check and add recording'));
    expect(importRecording).not.toHaveBeenCalled();
    expect(q(view.container, '[role="alert"]')!.textContent).toContain('different text');
  });

  it('imports a recording for an exact lazy published text named by the manifest', async () => {
    const h = await makeHarness({ listen: { unavailable: true } });
    const lazyId = 'text:es:brand-new-lazy-release';
    h.library.items.push(catalogText({ id: lazyId, title: 'A newly added story', lang: 'es', published: true }));
    const importRecording = vi.fn(async () => ({ manifest: {}, asset: {}, imported: 1, reused: false }));
    (h.listen as unknown as Record<string, unknown>).importRecording = importRecording;
    const view = await open(h);
    expect(await h.store.texts.get(lazyId)).toBeUndefined();

    await choose(view.container.querySelector<HTMLSelectElement>('select[aria-label="Text release"]')!, '__manifest__');
    const manifest = JSON.stringify({ textId: lazyId, kind: 'human', qualityState: 'approved', rights: { status: 'approved' } });
    await pickFiles(view.container.querySelector<HTMLInputElement>('input[aria-label="Recording manifest"]')!, [manifestFile(manifest)]);
    await pickFiles(view.container.querySelector<HTMLInputElement>('input[aria-label="Audio file"]')!, [audioFile()]);
    await click(button(view.container, 'Check and add recording'));

    expect(h.library.opened).toEqual([lazyId]);
    expect((await h.store.texts.get(lazyId))?.published).toBe(true);
    expect(importRecording).toHaveBeenCalledTimes(1);
    expect((importRecording.mock.calls[0] as unknown[])[0]).toMatchObject({ manifest: { textId: lazyId }, origin: 'learner' });
  });

  it('disambiguates identical release titles in the selector', async () => {
    const h = await makeHarness({ listen: { unavailable: true } });
    const story = await seedStory(h.store);
    await buildFixtureText(h.store, { lang: 'es', slug: 'same-title-other-release', title: story.title, sentences: [{ text: 'Hola.', tokens: [{ surface: 'Hola', isWord: true }] }] });
    const view = await open(h);
    const options = qa<HTMLOptionElement>(view.container, 'select[aria-label="Text release"] option').map((option) => option.textContent);
    expect(options.some((label) => label?.includes(`${story.title} · v${story.contentVersion} · ${story.id}`))).toBe(true);
    expect(options.some((label) => label?.includes('same-title-other-release'))).toBe(true);
  });
});
