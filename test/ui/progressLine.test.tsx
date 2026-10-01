// @vitest-environment jsdom
/**
 * The ONE progress line (wording from the canonical record only) and the ONE read path (after settled(), re-read on events).
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { SentenceViewed } from '../../src/core';
import { ids } from '../../src/core';
import { Reader } from '../../src/ui/reader/Reader';
import { FINISHED_EXPLANATION, ProgressLine, needsFinishedExplanation, progressParts, progressSummary } from '../../src/ui/coverage';
import { flush, makeHarness, q } from './harness';
import type { Harness, Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const p = { userId: 'u1', lang: 'es' as const, textId: 't', contentVersion: 2, sentencesTotal: 10, sentencesSeen: 2, sentencesUnderstood: 0, sittings: 1, listenedSentences: 0 };
const seen = (h: Harness, i: number) => h.bus.emit<SentenceViewed>({
  type: 'SentenceViewed', userId: 'u1', lang: 'es', surface: 'corpus', session: 's0', dedupeKey: `sv:${i}`, textId: STORY_ID, sentenceId: ids.sentence(STORY_ID, i), tokenIds: [], dwellMs: 2000, contentVersion: 1,
});

describe('the progress line is built only from the canonical record', () => {
  it('"Finished" only for finishedAt; "Finished an earlier version" only for finishedEarlierVersion; earlier exposure is reported, not counted', () => {
    expect(progressParts(p)).toEqual(['Seen 2 of 10 sentences']);
    expect(progressSummary({ ...p, finishedAt: '2026-10-01T10:00:00.000Z' })).toBe('Seen 2 of 10 sentences · Finished (your mark)');
    expect(progressSummary({ ...p, finishedEarlierVersion: { version: 1, at: '2026-09-01T10:00:00.000Z' } })).toBe('Seen 2 of 10 sentences · Finished an earlier version — the text has changed since');
    expect(progressSummary({ ...p, finishedEarlierVersion: { at: 'x' }, earlierVersions: { sentencesSeen: 4, sentencesUnderstood: 0 } }))
      .toBe('Seen 2 of 10 sentences · Finished an earlier version — the text has changed since · 4 more seen in an earlier version');
    expect(progressSummary({ ...p, sentencesUnderstood: 3, earlierVersions: { sentencesSeen: 1, sentencesUnderstood: 0 } })).toBe('Seen 2 of 10 sentences · Understood 3 of 10 (your report) · 1 more seen in an earlier version');
    expect(progressSummary({ ...p, earlierVersions: { sentencesSeen: 0, sentencesUnderstood: 2 } })).toBe('Seen 2 of 10 sentences'); // nothing seen earlier ⇒ nothing said
    // when both facts exist, this version's completion wins: the earlier one is not shown as a second "Finished"
    expect(progressSummary({ ...p, finishedAt: 'a', finishedEarlierVersion: { at: 'b' } })).toBe('Seen 2 of 10 sentences · Finished (your mark)');
    for (const x of [p, { ...p, finishedAt: 'a' }, { ...p, finishedEarlierVersion: { at: 'b' } }]) expect(progressSummary(x)).not.toMatch(/\bRead\b/);
  });

  it('the explanation is needed exactly when the text is finished (this or an earlier version) with Seen below the total', () => {
    expect(needsFinishedExplanation(p)).toBe(false); // seen but not finished: nothing to explain
    expect(needsFinishedExplanation({ ...p, finishedAt: 'a' })).toBe(true);
    expect(needsFinishedExplanation({ ...p, finishedEarlierVersion: { at: 'a' } })).toBe(true);
    expect(needsFinishedExplanation({ ...p, finishedAt: 'a', sentencesSeen: 10 })).toBe(false);
    expect(FINISHED_EXPLANATION).toBe('You marked this text finished. “Seen” counts sentences that stayed on screen long enough in this version, so the two can differ.');
  });

  it('renders the same string either way; the explanation is a title (inside links) or a disclosure (reader)', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <>
          <div id="a"><ProgressLine progress={{ ...p, finishedAt: 'x' }} testId="t1" /></div>
          <div id="b"><ProgressLine progress={{ ...p, finishedAt: 'x' }} testId="t2" explain="disclosure" /></div>
          <div id="c"><ProgressLine progress={{ ...p, sentencesSeen: 10, finishedAt: 'x' }} testId="t3" /></div>
        </>,
      );
    });
    expect(q(container, '[data-testid="t1"]')!.textContent).toBe(q(container, '[data-testid="t2"]')!.textContent);
    expect(q(container, '#a [data-testid="t1-why"]')!.getAttribute('title')).toBe(FINISHED_EXPLANATION);
    expect(q(container, '#a details')).toBeNull(); // a disclosure cannot live inside a link
    const details = q(container, '#b details')!;
    expect(details.querySelector('summary')!.textContent).toBe('Why?');
    expect(details.hasAttribute('open')).toBe(false);
    expect(q(container, '#b [data-testid="t2-why"]')!.textContent).toBe(FINISHED_EXPLANATION);
    expect(q(container, '#c [data-testid="t3-why"]')).toBeNull(); // everything seen: nothing to explain
    await act(async () => root.unmount()); container.remove();
  });
});

describe('reads wait for settled(): the numbers shown are never read from a half-applied fold', () => {
  it('a bus event does not trigger a read until settled() resolves, and the value shown is the one read after it (progress AND coverage)', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    expect(q(mounted.container, '[data-testid="reading-progress"]')!.textContent).toBe('Seen 0 of 3 sentences');
    // from now on the folds are "slow": settled() waits for a gate we control
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    h.learn.settled.mockImplementation(() => gate);
    const reads = h.learn.readingProgressMany.mock.calls.length;
    const covReads = h.learn.coverage.mock.calls.length;
    await seen(h, 0);
    await flush();
    expect(h.learn.readingProgressMany.mock.calls.length).toBe(reads); // no read while a fold may still be running
    expect(h.learn.coverage.mock.calls.length).toBe(covReads);
    expect(q(mounted.container, '[data-testid="reading-progress"]')!.textContent).toBe('Seen 0 of 3 sentences'); // the last settled value stays
    await act(async () => { open(); });
    await flush();
    expect(h.learn.readingProgressMany.mock.calls.length).toBeGreaterThan(reads);
    expect(h.learn.coverage.mock.calls.length).toBeGreaterThan(covReads);
    expect(q(mounted.container, '[data-testid="reading-progress"]')!.textContent).toBe('Seen 1 of 3 sentences');
  });

  it('a burst of events during a read costs a bounded number of reads (no timer, no stale overwrite)', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    h.learn.settled.mockImplementation(() => gate);
    const reads = h.learn.readingProgressMany.mock.calls.length;
    await seen(h, 0); await seen(h, 1); await seen(h, 2);
    h.learn.settled.mockImplementation(async () => undefined);
    await act(async () => { open(); });
    await flush();
    expect(h.learn.readingProgressMany.mock.calls.length - reads).toBeLessThanOrEqual(2);
    expect(q(mounted.container, '[data-testid="reading-progress"]')!.textContent).toBe('Seen 3 of 3 sentences');
  });

  it('another learner\'s events, and events about other texts, cause no read', async () => {
    const h = await makeHarness();
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    const reads = h.learn.readingProgressMany.mock.calls.length;
    await h.bus.emit<SentenceViewed>({ type: 'SentenceViewed', userId: 'someone-else', lang: 'es', surface: 'corpus', session: 's', dedupeKey: 'o1', textId: STORY_ID, sentenceId: ids.sentence(STORY_ID, 0), tokenIds: [] });
    await h.bus.emit<SentenceViewed>({ type: 'SentenceViewed', userId: 'u1', lang: 'es', surface: 'corpus', session: 's', dedupeKey: 'o2', textId: 'text:es:elsewhere', sentenceId: 'x', tokenIds: [] });
    await flush();
    expect(h.learn.readingProgressMany.mock.calls.length).toBe(reads);
  });
});
