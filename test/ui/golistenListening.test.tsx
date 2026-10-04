// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Route, Routes } from 'react-router-dom';
import { TextPage } from '../../src/ui/pages/TextPage';
import { ListenPage } from '../../src/ui/listen/ListenPage';
import { ListenHome } from '../../src/ui/listen/ListenHome';
import { ids, buildFixtureText } from '../../src/core';
import type { AudioStatus, ListeningPositionSaved } from '../../src/core';
import { canonicalTextSha256, releaseIdOf } from '../../src/golisten/rights';
import { button, choose, click, flush, installMediaStubs, makeHarness, pickFiles, qa, seedAudio } from './harness';
import type { Harness, Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

async function open(h: Harness, route: string) {
  mounted = await h.mount(<Routes>
    <Route path="/listen/:textId" element={<ListenPage />} />
    <Route path="/listen" element={<ListenHome />} />
    <Route path="/read/:textId" element={<TextPage mode="corpus" />} />
    <Route path="/scripture/:textId" element={<TextPage mode="scripture" />} />
  </Routes>, { router: route });
  return mounted;
}

async function seedReviewedRecording(h: Harness, textId: string, sentenceIds: string[]) {
  const manifest = await seedAudio(h.store, h.voice, textId, sentenceIds);
  const text = (await h.store.texts.get(textId))!;
  const sentences = (await h.store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const textSha256 = await canonicalTextSha256(textId, text.contentVersion, sentences);
  for (const id of manifest.segmentIds) {
    const segment = (await h.store.audioSegments.get(id))!;
    const asset = (await h.store.audioAssets.get(segment.assetId!))!;
    await h.store.audioAssets.put({
      ...asset, sourceType: 'human-recording', audioKind: 'human', isSpeech: true, narratorOrVoiceId: 'Test narrator',
      qualityState: 'human_reviewed',
      rights: { id: `rights:${id}`, status: 'approved', recordingOwner: 'Test recorder', recordingBasis: 'Local test recording', performanceOwner: 'Test narrator', performancePermission: 'Permission granted for this test', playInApp: true, stream: true, offline: false, redistribute: false, segment: true, transform: false, reviewedAt: '2026-10-03T00:00:00.000Z' },
      textBinding: { textId, contentVersion: text.contentVersion, textSha256, releaseId: releaseIdOf(text) },
    });
  }
  return manifest;
}

describe('GoListen learner surface', () => {
  it('starts in Listen Only without flashing transcript or creating reading exposure', async () => {
    const h = await makeHarness({ listen: { providerId: 'azure', approved: true } });
    await seedStory(h.store);
    await seedReviewedRecording(h, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
    const view = await open(h, `/listen/${STORY_ID}`);

    expect(view.container.querySelector('[data-testid="golisten-session"]')?.getAttribute('data-listen-mode')).toBe('only');
    expect(view.container.textContent).not.toContain('Yo creo en Dios.');
    expect(view.container.querySelector('.reader')).toBeNull();
    expect(await h.events('TextViewed')).toHaveLength(0);
    expect(await h.events('SentenceViewed')).toHaveLength(0);
    expect(view.container.querySelector('[aria-label="Audio player"]')).toBeTruthy();
  });

  it('Read + Listen reveals only the current sentence and still waits for explicit Reader handoff', async () => {
    const h = await makeHarness({ listen: { providerId: 'azure', approved: true } });
    await seedStory(h.store);
    await seedReviewedRecording(h, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
    const view = await open(h, `/listen/${STORY_ID}`);

    await click(button(view.container, 'Read + listen'));
    expect(view.container.textContent).toContain('Yo creo en Dios.');
    expect(view.container.textContent).not.toContain('Dios me perdonó.');
    expect(view.container.querySelector('.reader')).toBeNull();
    expect(await h.events('TextViewed')).toHaveLength(0);
  });

  it('opens GoLearn only after recording transcript reveal first', async () => {
    const h = await makeHarness({ listen: { providerId: 'azure', approved: true } });
    await seedStory(h.store);
    await seedReviewedRecording(h, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
    const view = await open(h, `/listen/${STORY_ID}`);

    await click(button(view.container, 'Open text and word support'));
    expect(view.container.querySelector('.reader')).toBeTruthy();
    const events = await h.events();
    const transcriptAt = events.findIndex((e) => e.type === 'TranscriptRevealed');
    const viewedAt = events.findIndex((e) => e.type === 'TextViewed');
    expect(transcriptAt).toBeGreaterThanOrEqual(0);
    expect(viewedAt).toBeGreaterThan(transcriptAt);
  });

  it('keeps private and unpublished text behind the same canonical gates', async () => {
    const h = await makeHarness();
    await h.store.corpora.put({ id: 'private-testimony', lang: 'es', kind: 'testimony', title: 'Private' });
    const privateText = await buildFixtureText(h.store, { lang: 'es', slug: 'private', corpusId: 'private-testimony', kind: 'testimony', title: 'A private testimony', sentences: [{ text: 'Yo creo.', tokens: [{ surface: 'Yo', isWord: true }] }] });
    const unpublished = await buildFixtureText(h.store, { lang: 'es', slug: 'unpublished', published: false, title: 'Secret passage', sentences: [{ text: 'No mostrar.', tokens: [{ surface: 'No', isWord: true }] }] });

    const privateView = await open(h, `/listen/${privateText.id}`);
    expect(privateView.container.textContent).toContain('not available for listening');
    expect(privateView.container.textContent).not.toContain('A private testimony');
    expect(privateView.container.querySelector('[aria-label="Audio player"]')).toBeNull();
    await privateView.unmount(); mounted = undefined;

    const unpublishedView = await open(h, `/listen/${unpublished.id}`);
    expect(unpublishedView.container.querySelector('[data-testid="listen-unpublished"]')).toBeTruthy();
    expect(unpublishedView.container.textContent).not.toContain('Secret passage');
    expect(unpublishedView.container.textContent).not.toContain('No mostrar.');
  });

  it('keeps protected listening-assessment text out of direct reader and listening routes', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    const text = (await h.store.texts.get(STORY_ID))!;
    await h.store.texts.put({ ...text, listeningAssessmentId: 'protected-check' });

    const listen = await open(h, `/listen/${STORY_ID}`);
    expect(listen.container.textContent).not.toContain(text.title);
    expect(listen.container.textContent).not.toContain('Yo creo en Dios.');
    await listen.unmount(); mounted = undefined;

    const read = await open(h, `/read/${STORY_ID}`);
    expect(read.container.textContent).not.toContain(text.title);
    expect(read.container.textContent).not.toContain('Yo creo en Dios.');
  });

  it('shows a real GoListen home and an honest empty state without trying synthesis', async () => {
    const h = await makeHarness({ listen: { unavailable: true } });
    await seedStory(h.store);
    const view = await open(h, '/listen');
    expect(view.container.querySelector('[data-testid="golisten-home"]')).toBeTruthy();
    expect(view.container.textContent).toContain('No approved listening audio is ready');
    expect(view.container.textContent).toContain('GoLearn reading');
    expect(h.listen.ensureAudio).not.toHaveBeenCalled();
  });

  it('puts a valid saved position at the top of the GoListen home as Continue listening', async () => {
    const h = await makeHarness({ listen: { providerId: 'azure', approved: true } });
    await seedStory(h.store);
    const manifest = await seedReviewedRecording(h, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
    await h.bus.emit<ListeningPositionSaved>({
      type: 'ListeningPositionSaved', userId: 'u1', lang: 'es', surface: 'listen', session: 'ses-test', dedupeKey: 'resume:story',
      textId: STORY_ID, manifestId: manifest.id, segmentId: manifest.segmentIds[1], positionMs: 240, at: '2026-10-03T10:00:00.000Z',
    });
    const view = await open(h, '/listen');
    const resume = qa<HTMLAnchorElement>(view.container, 'a').find((a) => a.textContent?.includes('Continue listening'));
    expect(resume?.getAttribute('href')).toBe(`/listen/${encodeURIComponent(STORY_ID)}`);
    expect(resume?.textContent).toContain('Continue where you paused');
  });

  it('keeps a fully heard lawful recording available for replay without opening a reading session', async () => {
    installMediaStubs();
    const h = await makeHarness({ listen: { providerId: 'azure', approved: true } });
    await seedStory(h.store);
    await seedReviewedRecording(h, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
    h.listen.audioStatus.mockResolvedValue({
      textId: STORY_ID, state: 'ready', isSpeech: true, textContentVersion: 1, audioContentVersion: 1,
      readySegments: 3, totalSegments: 3, failedSegments: 0, evidenceEligible: true, playAllowed: true,
      sourceType: 'human-recording', qualityState: 'human_reviewed',
    } satisfies AudioStatus);

    const session = await open(h, `/listen/${STORY_ID}`);
    const audio = session.container.querySelector('audio')!;
    for (let i = 0; i < 3; i++) {
      if (i === 0) await click(button(session.container, 'Play'));
      await act(async () => { audio.currentTime = 0.8; audio.dispatchEvent(new Event('timeupdate')); });
      await act(async () => { audio.dispatchEvent(new Event('ended')); });
      await flush();
    }
    expect(await h.events('AudioSegmentCompleted')).toHaveLength(3);
    expect(await h.events('TextViewed')).toHaveLength(0);
    expect(await h.events('SentenceViewed')).toHaveLength(0);
    await session.unmount(); mounted = undefined;

    const home = await open(h, '/listen');
    expect(home.container.textContent).toContain('No unfinished listening passages');
    const replay = home.container.querySelector<HTMLAnchorElement>(`[data-testid="listen-available-recordings"] a[href="/listen/${encodeURIComponent(STORY_ID)}"]`);
    expect(replay?.textContent).toContain('Open recording');
    await click(replay!);
    await flush();
    expect(home.container.querySelector('section.player')?.getAttribute('data-audio-state')).toBe('ready');
    await click(button(home.container, 'Play'));
    expect(home.container.querySelector<HTMLAudioElement>('audio')?.src).toContain('blob:test/asset:0');
  });

  it('the upload form says plainly that an uploaded recording is not a review, and always imports as a learner import', async () => {
    const h = await makeHarness({ listen: { unavailable: true } });
    const story = await seedStory(h.store);
    const importRecording = vi.fn(async () => ({ manifest: {}, asset: {}, imported: 1, reused: false }));
    (h.listen as unknown as Record<string, unknown>).importRecording = importRecording;
    const home = await open(h, '/listen');
    const warning = home.container.querySelector('[data-testid="import-warning"]')!;
    expect(warning.textContent).toMatch(/plays on this device/);
    expect(warning.textContent).toMatch(/counts toward listening progress only after a named reviewer approves it for the course/);
    expect(warning.textContent).toMatch(/rights stated in the manifest are your own statement/);

    await choose(home.container.querySelector<HTMLSelectElement>('select[aria-label="Text release"]')!, story.id);
    // the manifest claims everything; none of it may travel as a review
    const manifest = JSON.stringify({ textId: story.id, kind: 'human', qualityState: 'approved', rights: { status: 'approved' } });
    // (jsdom's File has no text()/arrayBuffer(): give these two the reads the form uses)
    const manifestFile = Object.assign(new File([manifest], 'm.json', { type: 'application/json' }), { text: async () => manifest });
    const audioFile = Object.assign(new File([new Uint8Array([1, 2, 3])], 'a.wav', { type: 'audio/wav' }), { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    await pickFiles(home.container.querySelector<HTMLInputElement>('input[aria-label="Recording manifest"]')!, [manifestFile]);
    await pickFiles(home.container.querySelector<HTMLInputElement>('input[aria-label="Audio file"]')!, [audioFile]);
    await click(button(home.container, 'Check and add recording'));
    expect(importRecording).toHaveBeenCalledTimes(1);
    expect((importRecording.mock.calls[0] as unknown[])[0]).toMatchObject({ origin: 'learner' });
    expect(((importRecording.mock.calls[0] as unknown[])[0] as { reviewer?: string }).reviewer).toBeUndefined();
    expect(home.container.textContent).toMatch(/only after a named reviewer approves it/);
  });

  it('disambiguates identical release titles in the recording import selector', async () => {
    const h = await makeHarness({ listen: { unavailable: true } });
    const story = await seedStory(h.store);
    await buildFixtureText(h.store, { lang: 'es', slug: 'same-title-other-release', title: story.title, sentences: [{ text: 'Hola.', tokens: [{ surface: 'Hola', isWord: true }] }] });
    const home = await open(h, '/listen');
    const options = qa<HTMLOptionElement>(home.container, 'select[aria-label="Text release"] option').map((option) => option.textContent);
    expect(options.some((label) => label?.includes(`${story.title} · v${story.contentVersion} · ${story.id}`))).toBe(true);
    expect(options.some((label) => label?.includes('same-title-other-release'))).toBe(true);
  });

  it('updates the listening progress when playback completes without counting a position tick', async () => {
    installMediaStubs();
    const h = await makeHarness({ listen: { providerId: 'azure', approved: true } });
    await seedStory(h.store);
    await seedAudio(h.store, h.voice, STORY_ID, [0, 1, 2].map((i) => ids.sentence(STORY_ID, i)));
    const view = await open(h, `/listen/${STORY_ID}`);
    expect(view.container.querySelector('[data-testid="listen-progress"]')?.textContent).toContain('Heard: 0 of 3 sentences');

    const audio = view.container.querySelector('audio')!;
    await click(button(view.container, 'Play'));
    await act(async () => { audio.currentTime = 0.8; audio.dispatchEvent(new Event('timeupdate')); });
    await flush();
    expect(view.container.querySelector('[data-testid="listen-progress"]')?.textContent).toContain('Heard: 0 of 3 sentences');
    await act(async () => { audio.dispatchEvent(new Event('ended')); });
    await flush();
    expect(view.container.querySelector('[data-testid="listen-progress"]')?.textContent).toContain('Heard: 1 of 3 sentences');
    expect(view.container.querySelector('[data-testid="listen-progress"]')?.textContent).toContain('not been reviewed for listening evidence');
  });
});
