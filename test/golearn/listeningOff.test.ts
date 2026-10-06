/**
 * PLAN8 — GoListen is deferred: `createGoLearn({ listening: false })` says and recommends nothing about listening, but the
 * engine's behaviour with the default (true) is unchanged and listening events already in a log fold exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { withoutHeadCache } from './harness';
import { ES_STORY, buildSpanish } from './fixtures';
import { COURSE, buildChapter, filler, stageRow, workRow } from './courseFixtures';

const U = 'u1';
const F = (w: string) => ids.form('es', w);
const mk = (listening: boolean | undefined, audio = true) => createHarness({ listening, audioEligible: async () => audio });

/** A story read, finished and heard (real speech), plus a second story to read next. */
async function heard(h: Harness) {
  await buildSpanish(h.store);
  await buildChapter(h.store, { slug: 'next', sentences: filler(2) });
  await h.understood(U, 'es', ES_STORY, [0, 1, 2, 3], 's1');
  await h.complete(U, 'es', ES_STORY, 's1');
  await h.listen(U, 'es', ES_STORY, [0, 1], { session: 'l1', transcript: true });
}

describe('recommendations', () => {
  it('offers listen-to-read-text by default, never when listening is off; everything else is the same', async () => {
    const on = mk(undefined);
    const off = mk(false);
    for (const h of [on, off]) await heard(h);
    const reasons = async (h: Harness) => (await h.golearn.recommend(U, { limit: 20 })).map((r) => r.reason);
    expect(await reasons(on)).toContain('listen-to-read-text');
    expect(await reasons(off)).not.toContain('listen-to-read-text');
    // one recommendation per text: where the listening one won, the next best reason for that text shows instead; other texts are unchanged
    const others = async (h: Harness) => (await h.golearn.recommend(U, { limit: 20 })).filter((r) => r.textId !== ES_STORY);
    expect(await others(off)).toEqual(await others(on));
    expect((await off.golearn.recommend(U, { limit: 20 })).some((r) => r.textId === ES_STORY && r.reason !== 'listen-to-read-text')).toBe(true);
  });
});

describe('stage readiness', () => {
  async function stage(h: Harness) {
    await h.store.stages.put(stageRow(1, 'g1'));
    await h.store.works.put(workRow('w1', 'g1'));
    await buildChapter(h.store, { slug: 'r1', work: 'w1', chapter: 1, sentences: filler(40) });
    const id = ids.text('es', 'r1');
    await h.viewAll(U, 'es', id, 40, 's1');
    await h.listen(U, 'es', id, Array.from({ length: 35 }, (_, i) => i), { session: 'l1' });
    return ids.stage(COURSE, 'g1');
  }

  it('has a listening signal by default and omits it entirely when listening is off (and does not count it)', async () => {
    const on = mk(undefined);
    const off = mk(false);
    const onStage = await stage(on);
    const offStage = await stage(off);
    const a = await on.golearn.stageReadiness(U, COURSE, onStage);
    const b = await off.golearn.stageReadiness(U, COURSE, offStage);
    expect(a.signals.some((s) => s.key === 'listening')).toBe(true);
    expect(b.signals.some((s) => s.key === 'listening')).toBe(false);
    expect(b.signals.map((s) => s.key)).toEqual(a.signals.filter((s) => s.key !== 'listening').map((s) => s.key));
    expect(a.signals.find((s) => s.key === 'listening')!.status).not.toBe('not-available'); // it had data to count
    // the signals both versions share are the same
    expect(b.signals).toEqual(a.signals.filter((s) => s.key !== 'listening'));
    expect(b.explanation).not.toMatch(/listen|audio|heard/i);
  });
});

describe('item history and explanations', () => {
  it('history: no listening line and the label says so; reading and the rest are unchanged', async () => {
    const on = mk(undefined);
    const off = mk(false);
    for (const h of [on, off]) await heard(h);
    const a = await on.golearn.itemHistory(U, F('creo'));
    const b = await off.golearn.itemHistory(U, F('creo'));
    expect(a.lines.some((l) => l.startsWith('Listening:'))).toBe(true);
    expect(b.listening).toBe('not part of this version');
    expect(b.lines.some((l) => /listen|heard|audio/i.test(l))).toBe(false);
    expect(b.lines).toEqual(a.lines.filter((l) => !l.startsWith('Listening:')));
    expect({ ...b, listening: a.listening, lines: a.lines }).toEqual(a);
  });

  it('explanations: audio plays that were ignored are not mentioned when listening is off; real listening evidence still is', async () => {
    const on = mk(undefined);
    const off = mk(false);
    for (const h of [on, off]) {
      await buildSpanish(h.store);
      await h.view(U, 'es', ES_STORY, 0, 's1');
      await h.listen(U, 'es', ES_STORY, [0], { session: 'l1', speech: false, voiceReviewed: false }); // fixture audio: ignored
    }
    expect((await on.golearn.explainItem(U, F('creo'))).summary).toMatch(/audio play/);
    expect((await off.golearn.explainItem(U, F('creo'))).summary).not.toMatch(/audio|listen|heard/i);

    // evidence that exists is still told
    const h = mk(false);
    await heard(h);
    expect((await h.golearn.explainItem(U, F('creo'))).summary).toMatch(/heard/);
  });

  it('readingProgress still carries listenedSentences', async () => {
    const off = mk(false);
    await heard(off);
    expect((await off.golearn.readingProgress(U, ES_STORY)).listenedSentences).toBe(2);
    const none = mk(false);
    await buildSpanish(none.store);
    expect((await none.golearn.readingProgress(U, ES_STORY)).listenedSentences).toBe(0);
  });
});

describe('the flag changes what is said, never what is stored', () => {
  it('the same log folds to identical rows with listening on and off, and a rebuild keeps them', async () => {
    const snapshot = async (h: Harness) => JSON.stringify({
      items: withoutHeadCache((await h.store.learnerItems.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1))),
      encounters: (await h.store.encounters.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)),
    });
    const on = mk(true);
    const off = mk(false);
    for (const h of [on, off]) {
      await heard(h);
      await h.listen(U, 'es', ES_STORY, [2], { session: 'l2' });
      await h.report(U, 'es', ES_STORY, [0, 1], { session: 'l2', modality: 'listening' });
    }
    const a = await snapshot(on);
    expect(JSON.parse(a).encounters.some((e: { modality: string }) => e.modality === 'listening')).toBe(true);
    expect(await snapshot(off)).toBe(a);
    await off.golearn.rebuild(U);
    expect(await snapshot(off)).toBe(a);
    expect((await off.golearn.listKnown(U, 'es', 'listening', 'encountered')).length).toBeGreaterThan(0); // the history is there for a later V2
  });
});
