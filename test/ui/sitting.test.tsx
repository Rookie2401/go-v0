// @vitest-environment jsdom
/**
 * One sitting-stable session id per learner (src/ui/sitting.ts): persisted in localStorage with a last-activity
 * timestamp, reused for 30 minutes of inactivity, so reloads and route revisits reuse their dedupe keys.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentenceViewed, TextViewed } from '../../src/core';
import { ids } from '../../src/core';
import { Reader } from '../../src/ui/reader/Reader';
import { ManualViewDetector } from '../../src/ui/reader/viewDetection';
import { SITTING_GAP_MS, newSession, resetSittingsForTests, sittingSession, touchSitting } from '../../src/ui/sitting';
import { flush, makeHarness } from './harness';
import type { Harness, Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';
import { act } from 'react';

const MIN = 60 * 1000;

describe('sittingSession (storage)', () => {
  beforeEach(() => { localStorage.clear(); resetSittingsForTests(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('creates an id, stores it with a last-activity time, and reuses it while that activity is under 30 minutes old', () => {
    const t0 = Date.UTC(2026, 8, 30, 10, 0, 0);
    const a = sittingSession('u1', t0);
    expect(a).toMatch(/^ses:/);
    expect(JSON.parse(localStorage.getItem('go-v0:sitting:u1')!)).toEqual({ id: a, lastActivityAt: t0 });
    expect(sittingSession('u1', t0 + 1 * MIN)).toBe(a);
    expect(sittingSession('u1', t0 + 29 * MIN + 59_000)).toBe(a);
    expect(SITTING_GAP_MS).toBe(30 * MIN);
  });

  it('starts a new sitting (and stores it) once 30 minutes have passed without activity', () => {
    const t0 = Date.UTC(2026, 8, 30, 10, 0, 0);
    const a = sittingSession('u1', t0);
    const b = sittingSession('u1', t0 + 31 * MIN);
    expect(b).not.toBe(a);
    expect(JSON.parse(localStorage.getItem('go-v0:sitting:u1')!)).toEqual({ id: b, lastActivityAt: t0 + 31 * MIN });
    expect(sittingSession('u1', t0 + 32 * MIN)).toBe(b);
  });

  it('activity extends the sitting: it is the time since the LAST activity that counts', () => {
    const t0 = Date.UTC(2026, 8, 30, 10, 0, 0);
    const a = sittingSession('u1', t0);
    touchSitting('u1', a, t0 + 20 * MIN);
    expect(sittingSession('u1', t0 + 45 * MIN)).toBe(a); // 25 minutes since the touch
    expect(sittingSession('u1', t0 + 51 * MIN)).not.toBe(a); // 31 minutes since the touch
  });

  it('is kept per learner', () => {
    const t0 = Date.UTC(2026, 8, 30, 10, 0, 0);
    expect(sittingSession('u1', t0)).not.toBe(sittingSession('u2', t0));
  });

  it('survives a reload: the memory is gone, the stored record is not', () => {
    const t0 = Date.UTC(2026, 8, 30, 10, 0, 0);
    const a = sittingSession('u1', t0);
    resetSittingsForTests(); // a fresh page load has no in-memory state
    expect(sittingSession('u1', t0 + 5 * MIN)).toBe(a);
  });

  it('a corrupt record is replaced, not trusted', () => {
    localStorage.setItem('go-v0:sitting:u1', '{ nope');
    expect(sittingSession('u1', Date.now())).toMatch(/^ses:/);
    localStorage.setItem('go-v0:sitting:u1', JSON.stringify({ id: 5, lastActivityAt: 'x' }));
    expect(sittingSession('u1', Date.now())).toMatch(/^ses:/);
  });

  it('with storage blocked it still works for this page load (in memory)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const t0 = Date.UTC(2026, 8, 30, 10, 0, 0);
    const a = sittingSession('u1', t0);
    expect(sittingSession('u1', t0 + MIN)).toBe(a);
    expect(sittingSession('u1', t0 + 31 * MIN)).not.toBe(a);
  });

  it('newSession ids are distinct', () => {
    expect(newSession()).not.toBe(newSession());
  });
});

describe('the app uses the sitting id (AppProvider), not a fresh id per page load', () => {
  let h: Harness;
  let mounted: Mounted | undefined;
  beforeEach(async () => { h = await makeHarness(); await seedStory(h.store); });
  afterEach(async () => { vi.useRealTimers(); await mounted?.unmount(); mounted = undefined; });

  const mountReader = async () => {
    const detector = new ManualViewDetector();
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" createDetector={detector.factory} />, { session: null });
    return detector;
  };
  const see = async (d: ManualViewDetector, i: number) => { await act(async () => { d.see(ids.sentence(STORY_ID, i)); }); await flush(); };
  const sessions = async () => [...new Set((await h.events()).map((e) => e.session))];

  it('a remount and a simulated reload reuse the session and its dedupe keys: nothing is counted twice', async () => {
    let d = await mountReader();
    await see(d, 0);
    const first = (await sessions())[0];
    expect(await sessions()).toHaveLength(1);

    await mounted!.unmount(); // a route revisit
    d = await mountReader();
    await see(d, 0);
    expect(await h.events('SentenceViewed')).toHaveLength(1);
    expect(await h.events('TextViewed')).toHaveLength(1);

    await mounted!.unmount(); // a reload: nothing in memory, the stored record remains
    resetSittingsForTests();
    d = await mountReader();
    await see(d, 0);
    await see(d, 1);
    expect(await sessions()).toEqual([first]);
    const views = (await h.events('SentenceViewed')) as SentenceViewed[];
    expect(views.map((v) => v.sentenceId)).toEqual([ids.sentence(STORY_ID, 0), ids.sentence(STORY_ID, 1)]);
    expect((await h.events('TextViewed')) as TextViewed[]).toHaveLength(1);
  });

  it('a new session id is used after 31 minutes without activity (so a genuine second sitting is not deduped away)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-30T10:00:00Z') });
    let d = await mountReader();
    await see(d, 0);
    const first = (await sessions())[0];

    await mounted!.unmount();
    vi.setSystemTime(new Date('2026-09-30T10:31:00Z'));
    resetSittingsForTests();
    d = await mountReader();
    await see(d, 0); // the same sentence, in a new sitting
    const all = await sessions();
    expect(all).toHaveLength(2);
    expect(all[1]).not.toBe(first);
    expect(await h.events('SentenceViewed')).toHaveLength(2);
  });

  it('every event the learner causes refreshes the sitting: activity at minute 20 keeps it alive at minute 45', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-30T10:00:00Z') });
    let d = await mountReader();
    const first = (await sessions())[0]; // the reader's TextViewed was emitted at mount

    vi.setSystemTime(new Date('2026-09-30T10:20:00Z'));
    await see(d, 1); // an event at minute 20 (touches the stored record)
    await mounted!.unmount();
    vi.setSystemTime(new Date('2026-09-30T10:45:00Z')); // 45 min after the start, 25 after the last event
    resetSittingsForTests();
    d = await mountReader();
    await see(d, 2);
    expect(await sessions()).toEqual([first]);
  });
});
