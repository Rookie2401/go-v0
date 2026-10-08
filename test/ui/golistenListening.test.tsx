// @vitest-environment jsdom
/**
 * Listening inside the Reader. GoListen is GoLearn's listening subsystem: it runs alongside GoLearn's parsing of every text and has
 * no doorway of its own. A text with a recording shows the ListenBar in the Reader (Listen only / Read + listen / Listen first,
 * speed, replay, seeking, checkpoints, the same crediting); a text with none shows the computer-voice practice bar; the old
 * `/listen` routes redirect into reading. The evidence semantics are pinned in test/golisten; this file pins the learner surface.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { useLocation } from 'react-router-dom';
import { AppRoutes, Shell } from '../../src/ui/App';
import { ids, buildFixtureText } from '../../src/core';
import type { AudioStatus, ListeningPositionSaved } from '../../src/core';
import { canonicalTextSha256, releaseIdOf } from '../../src/golisten/rights';
import { button, catalogText, click, flush, installMediaStubs, makeHarness, qa, seedAudio } from './harness';
import type { Harness, Mounted } from './harness';
import { JOHN_ID, STORY_ID, seedJohn, seedStory } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

/** Where the router is, readable from the DOM. */
function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; }

async function open(h: Harness, route: string) {
  mounted = await h.mount(<><Shell><AppRoutes /></Shell><Where /></>, { router: route });
  await flush();
  return mounted;
}

const where = (c: HTMLElement) => c.querySelector('[data-testid="where"]')!.textContent;
const bar = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-testid="listen-bar"]');
const sentences = (c: HTMLElement) => qa(c, '.reader-body .sent');
const concealedCount = (c: HTMLElement) => qa(c, '.reader-body .sent.is-concealed').length;
const modeButtons = (c: HTMLElement) => qa<HTMLButtonElement>(c, '[aria-label="Listening mode"] button');

async function seedReviewedRecording(h: Harness, textId: string, sentenceIds: string[]) {
  const manifest = await seedAudio(h.store, h.voice, textId, sentenceIds);
  const text = (await h.store.texts.get(textId))!;
  const rows = (await h.store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const textSha256 = await canonicalTextSha256(textId, text.contentVersion, rows);
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

const storyIds = () => [0, 1, 2].map((i) => ids.sentence(STORY_ID, i));
const REVIEWED = { providerId: 'azure', approved: true } as const;

describe('the ListenBar in the Reader (a reviewed recording)', () => {
  it('offers the three modes and the Player beside the text, opens in Read + listen, and hides the computer voice', async () => {
    installMediaStubs();
    const h = await makeHarness({ listen: REVIEWED });
    await seedStory(h.store);
    await seedReviewedRecording(h, STORY_ID, storyIds());
    const view = await open(h, `/read/${encodeURIComponent(STORY_ID)}`);
    const c = view.container;

    expect((await h.listen.audioStatus(STORY_ID)).evidenceEligible).toBe(true);
    expect(modeButtons(c).map((b) => b.textContent)).toEqual(['Listen only', 'Read + listen', 'Listen first']);
    expect(bar(c)!.getAttribute('data-listen-mode')).toBe('read-listen');
    expect(bar(c)!.getAttribute('data-evidence')).toBe('yes');
    expect(modeButtons(c)[1].getAttribute('aria-pressed')).toBe('true');
    expect(c.querySelector('.reader__main > section.player')).toBeTruthy(); // a direct child: the stylesheet pins it
    expect(c.querySelector('[data-testid="listen-practice"]')).toBeNull(); // a reviewed recording wins over the computer voice
    expect(concealedCount(c)).toBe(0);
    expect(c.textContent).toContain('Yo creo en Dios.');
  });

  it('Listen first hides the text until it has been heard; it is what ?listen=1 opens', async () => {
    installMediaStubs();
    const h = await makeHarness({ listen: REVIEWED });
    await seedStory(h.store);
    await seedReviewedRecording(h, STORY_ID, storyIds());
    const view = await open(h, `/read/${encodeURIComponent(STORY_ID)}?listen=1`);
    const c = view.container;

    expect(bar(c)!.getAttribute('data-listen-mode')).toBe('listen-first');
    expect(modeButtons(c)[2].getAttribute('aria-pressed')).toBe('true');
    expect(sentences(c)).toHaveLength(3);
    expect(concealedCount(c)).toBe(3);
    expect(await h.events('TranscriptRevealed')).toHaveLength(0);
    // Nothing is counted as read while the text is hidden
    expect(await h.events('SentenceViewed')).toHaveLength(0);
  });

  it('Listen only keeps the text hidden, and the modes switch without recording anything', async () => {
    installMediaStubs();
    const h = await makeHarness({ listen: REVIEWED });
    await seedStory(h.store);
    await seedReviewedRecording(h, STORY_ID, storyIds());
    const view = await open(h, `/read/${encodeURIComponent(STORY_ID)}`);
    const c = view.container;

    await click(button(c, 'Listen only'));
    expect(bar(c)!.getAttribute('data-listen-mode')).toBe('only');
    expect(concealedCount(c)).toBe(3);
    await click(button(c, 'Listen first'));
    expect(bar(c)!.getAttribute('data-listen-mode')).toBe('listen-first');
    expect(await h.events('TranscriptRevealed')).toHaveLength(0);
    expect(await h.events('AudioSegmentCompleted')).toHaveLength(0);
  });

  it('showing the text from Listen first saves the position, then records the transcript rescue, then shows it', async () => {
    installMediaStubs();
    const h = await makeHarness({ listen: REVIEWED });
    await seedStory(h.store);
    await seedReviewedRecording(h, STORY_ID, storyIds());
    const view = await open(h, `/read/${encodeURIComponent(STORY_ID)}?listen=1`);
    const c = view.container;

    await click(button(c, 'Play'));
    await act(async () => { const audio = c.querySelector('audio')!; audio.currentTime = 0.4; audio.dispatchEvent(new Event('timeupdate')); });
    await click(button(c, 'Read + listen'));
    await flush();

    expect(bar(c)!.getAttribute('data-listen-mode')).toBe('read-listen');
    expect(concealedCount(c)).toBe(0);
    const events = await h.events();
    const transcriptAt = events.findIndex((e) => e.type === 'TranscriptRevealed');
    const checkpointAt = events.findIndex((e) => e.type === 'ListeningPositionSaved');
    expect((events[checkpointAt] as ListeningPositionSaved).positionMs).toBe(400);
    expect(transcriptAt).toBeGreaterThanOrEqual(0);
    expect(transcriptAt).toBeGreaterThan(checkpointAt);
    expect(events.filter((e) => e.type === 'TranscriptRevealed')).toHaveLength(1);
  });

  it('keeps Listen first and offers a retry when saving the listening position fails', async () => {
    installMediaStubs();
    const h = await makeHarness({ listen: REVIEWED });
    await seedStory(h.store);
    await seedReviewedRecording(h, STORY_ID, storyIds());
    const view = await open(h, `/read/${encodeURIComponent(STORY_ID)}?listen=1`);
    const c = view.container;
    await click(button(c, 'Play'));
    await act(async () => { const audio = c.querySelector('audio')!; audio.currentTime = 0.4; audio.dispatchEvent(new Event('timeupdate')); });
    const originalEmit = h.bus.emit.bind(h.bus);
    const emit = vi.spyOn(h.bus, 'emit');
    let rejectedCheckpoint = false;
    emit.mockImplementation(async (input) => {
      if (!rejectedCheckpoint && input.type === 'ListeningPositionSaved') {
        rejectedCheckpoint = true;
        throw new Error('Could not save your listening position.');
      }
      return originalEmit(input);
    });

    await click(button(c, 'Read + listen'));
    expect(c.querySelector('[data-testid="listen-handoff-error"]')?.textContent).toBe('Could not save your listening position.');
    expect(bar(c)!.getAttribute('data-listen-mode')).toBe('listen-first');
    expect(concealedCount(c)).toBe(3);
    expect(c.querySelector('audio')).toBeTruthy();
    expect(await h.events('TranscriptRevealed')).toHaveLength(0);

    await click(button(c, 'Read + listen'));
    await flush();
    expect(c.querySelector('[data-testid="listen-handoff-error"]')).toBeNull();
    expect(bar(c)!.getAttribute('data-listen-mode')).toBe('read-listen');
    expect(concealedCount(c)).toBe(0);
    expect((await h.events('ListeningPositionSaved')).length).toBeGreaterThan(0);
    expect(await h.events('TranscriptRevealed')).toHaveLength(1);
    emit.mockRestore();
  });

  it('credits a heard sentence only after observed coverage, from inside the Reader, and never from a position tick', async () => {
    installMediaStubs();
    const h = await makeHarness({ listen: REVIEWED });
    await seedStory(h.store);
    await seedReviewedRecording(h, STORY_ID, storyIds());
    h.listen.audioStatus.mockResolvedValue({
      textId: STORY_ID, state: 'ready', isSpeech: true, textContentVersion: 1, audioContentVersion: 1,
      readySegments: 3, totalSegments: 3, failedSegments: 0, evidenceEligible: true, playAllowed: true,
      sourceType: 'human-recording', qualityState: 'human_reviewed',
    } satisfies AudioStatus);
    const view = await open(h, `/read/${encodeURIComponent(STORY_ID)}?listen=1`);
    const c = view.container;
    const audio = c.querySelector('audio')!;
    expect(c.querySelector('[data-testid="listen-progress"]')?.textContent).toContain('Heard: 0 of 3 sentences');

    await click(button(c, 'Play'));
    await act(async () => { audio.currentTime = 0.8; audio.dispatchEvent(new Event('timeupdate')); });
    await flush();
    expect(c.querySelector('[data-testid="listen-progress"]')?.textContent).toContain('Heard: 0 of 3 sentences');
    expect(await h.events('AudioSegmentCompleted')).toHaveLength(0);
    for (let i = 0; i < 3; i++) {
      if (i > 0) await act(async () => { audio.currentTime = 0.8; audio.dispatchEvent(new Event('timeupdate')); });
      await act(async () => { audio.dispatchEvent(new Event('ended')); });
      await flush();
    }
    expect(await h.events('AudioSegmentCompleted')).toHaveLength(3);
    expect(c.querySelector('[data-testid="listen-progress"]')?.textContent).toContain('Heard: 3 of 3 sentences');
    // Listen first kept the text out of reading exposure
    expect(await h.events('SentenceViewed')).toHaveLength(0);
  });

  it('is replayable from the Reader, with the recording still available', async () => {
    installMediaStubs();
    const h = await makeHarness({ listen: REVIEWED });
    await seedStory(h.store);
    await seedReviewedRecording(h, STORY_ID, storyIds());
    const view = await open(h, `/read/${encodeURIComponent(STORY_ID)}`);
    const c = view.container;
    expect(c.querySelector('section.player')?.getAttribute('data-audio-state')).toBe('ready');
    await click(button(c, 'Play'));
    expect(c.querySelector<HTMLAudioElement>('audio')?.src).toContain('blob:test/asset:0');
  });
});

describe('the ListenBar with audio that is not evidence', () => {
  it('unreviewed audio plays in the same Player with its own "not counted" label, beside the computer-voice practice', async () => {
    installMediaStubs();
    const h = await makeHarness(); // fixture voice: preview-only
    await seedStory(h.store);
    await seedAudio(h.store, h.voice, STORY_ID, storyIds());
    const view = await open(h, `/read/${encodeURIComponent(STORY_ID)}`);
    const c = view.container;

    expect((await h.listen.audioStatus(STORY_ID)).state).toBe('preview-only');
    expect(bar(c)!.getAttribute('data-evidence')).toBe('no');
    expect(c.querySelector('[data-testid="preview-audio-note"]')?.textContent).toMatch(/does not count|not counted|not passed/i);
    expect(c.querySelector('[data-testid="preview-audio-badge"]')).toBeTruthy();
    expect(c.querySelector('[data-testid="listen-practice"]')).toBeTruthy();
  });

  it('with no recording at all the computer-voice practice bar is the whole bar, and GoListen is asked for nothing more', async () => {
    const h = await makeHarness({ listen: { unavailable: true } });
    await seedStory(h.store);
    const view = await open(h, `/read/${encodeURIComponent(STORY_ID)}`);
    const c = view.container;

    expect(bar(c)).toBeNull();
    expect(c.querySelector('section.player')).toBeNull();
    expect(c.querySelector('[data-testid="listen-practice"]')).toBeTruthy();
    expect(h.listen.ensureAudio).not.toHaveBeenCalled();
    expect(h.listen.runJobs).not.toHaveBeenCalled();
  });
});

describe('the old listening links lead into reading', () => {
  it('/listen is the Reading page', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    const view = await open(h, '/listen');
    expect(where(view.container)).toBe('/read');
    expect(view.container.querySelector('[data-testid="golisten-home"]')).toBeNull();
  });

  it('/listen/:textId opens that text in the Reader with the bar in Listen first', async () => {
    installMediaStubs();
    const h = await makeHarness({ listen: REVIEWED });
    await seedStory(h.store);
    await seedReviewedRecording(h, STORY_ID, storyIds());
    const view = await open(h, `/listen/${encodeURIComponent(STORY_ID)}`);
    expect(where(view.container)).toBe(`/read/${encodeURIComponent(STORY_ID)}?listen=1`);
    expect(view.container.querySelector('article.reader')).toBeTruthy();
    expect(bar(view.container)!.getAttribute('data-listen-mode')).toBe('listen-first');
    expect(concealedCount(view.container)).toBe(3);
  });

  it('a scripture text redirects to its Scripture route, and an unknown id to the library route', async () => {
    const h = await makeHarness();
    await seedJohn(h.store);
    const john = await open(h, `/listen/${encodeURIComponent(JOHN_ID)}`);
    expect(where(john.container)).toBe(`/scripture/${encodeURIComponent(JOHN_ID)}?listen=1`);
    await john.unmount(); mounted = undefined;
    const unknown = await open(h, '/listen/text:es:nothing-here');
    expect(where(unknown.container)).toBe(`/read/${encodeURIComponent('text:es:nothing-here')}?listen=1`);
    expect(unknown.container.textContent).toContain('not in your library');
  });

  it('keeps private and unpublished text behind the same canonical gates', async () => {
    const h = await makeHarness();
    await h.store.corpora.put({ id: 'private-testimony', lang: 'es', kind: 'testimony', title: 'Private' });
    const privateText = await buildFixtureText(h.store, { lang: 'es', slug: 'private', corpusId: 'private-testimony', kind: 'testimony', title: 'A private testimony', sentences: [{ text: 'Yo creo.', tokens: [{ surface: 'Yo', isWord: true }] }] });
    const unpublished = await buildFixtureText(h.store, { lang: 'es', slug: 'unpublished', published: false, title: 'Secret passage', sentences: [{ text: 'No mostrar.', tokens: [{ surface: 'No', isWord: true }] }] });

    const privateView = await open(h, `/listen/${encodeURIComponent(privateText.id)}`);
    expect(privateView.container.textContent).toContain('not in your library');
    expect(privateView.container.textContent).not.toContain('A private testimony');
    expect(privateView.container.querySelector('section.player')).toBeNull();
    await privateView.unmount(); mounted = undefined;

    const unpublishedView = await open(h, `/listen/${encodeURIComponent(unpublished.id)}`);
    expect(unpublishedView.container.querySelector('[data-testid="unpublished-gate"]')).toBeTruthy();
    expect(unpublishedView.container.textContent).not.toContain('No mostrar.');
  });

  it('keeps protected listening-assessment text out of the direct routes', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    const text = (await h.store.texts.get(STORY_ID))!;
    await h.store.texts.put({ ...text, listeningAssessmentId: 'protected-check' });

    const listen = await open(h, `/listen/${encodeURIComponent(STORY_ID)}`);
    expect(listen.container.textContent).not.toContain('Yo creo en Dios.');
    expect(listen.container.querySelector('article.reader')).toBeNull();
    await listen.unmount(); mounted = undefined;

    const read = await open(h, `/read/${encodeURIComponent(STORY_ID)}`);
    expect(read.container.textContent).not.toContain('Yo creo en Dios.');
  });

  it('does not open or generate anything to answer a listening link for a text already on the device', async () => {
    const h = await makeHarness({ listen: { unavailable: true } });
    const story = await seedStory(h.store);
    h.library.items.push(catalogText({ id: story.id, title: story.title, stream: 'library' }));
    await open(h, `/listen/${encodeURIComponent(STORY_ID)}`);
    expect(h.library.opened).toEqual([]);
    expect(h.listen.ensureAudio).not.toHaveBeenCalled();
  });
});
