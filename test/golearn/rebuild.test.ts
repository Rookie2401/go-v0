import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { withoutHeadCache } from './harness';
import { ES_JOHN, ES_STORY, buildSpanish, buildSpanishScripture } from './fixtures';

const F = (w: string) => ids.form('es', w);

async function snapshot(h: Harness, userId: string) {
  const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : 1);
  return {
    items: withoutHeadCache((await h.store.learnerItems.where('userId', userId)).sort(byId)),
    encounters: (await h.store.encounters.where('userId', userId)).sort(byId),
  };
}

async function play(h: Harness, u: string) {
  await h.view(u, 'es', ES_STORY, 0, 's1');
  await h.help(u, 'es', ES_STORY, 0, 1, F('creo'), 2, 's1');
  await h.view(u, 'es', ES_STORY, 1, 's1');
  await h.rescue(u, 'es', ES_STORY, [1], 's1');
  await h.help(u, 'es', ES_STORY, 3, 1, F('perdona'), 1, 's1'); // help BEFORE its view
  await h.view(u, 'es', ES_STORY, 3, 's1');
  await h.view(u, 'es', ES_JOHN, 0, 's2', 'scripture');
  await h.view(u, 'es', ES_STORY, 0, 's2');
  await h.listen(u, 'es', ES_STORY, [0, 1], { speed: 0.85, transcript: true, session: 'l1' });
  await h.listen(u, 'es', ES_STORY, [0], { session: 'l1' });
  await h.report(u, 'es', ES_STORY, [0, 1, 3], { session: 's1' }); // "all" — but help / rescue already touched some items
  await h.report(u, 'es', ES_STORY, [0], { session: 'l1', modality: 'listening' });
  await h.report(u, 'es', ES_STORY, [0, 1, 2, 3], { session: 's2', degree: 'some', scope: 'text' }); // not item evidence
  await h.listen(u, 'es', ES_STORY, [2], { session: 'l2', speech: false }); // fixture audio: excluded, stays in the log
  await h.complete(u, 'es', ES_STORY, 's2');
  await h.produce(u, 'es', F('creo'), 'independent');
  await h.produce(u, 'es', F('dios'), 'assisted', { modality: 'speaking' });
  await h.mark(u, 'es', F('corazón'), 'known');
  await h.mark(u, 'es', F('pecado'), 'unknown');
}

describe('rebuild(userId)', () => {
  it('replays the bus history into identical learner state', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    await play(h, 'u1');
    await play(h, 'u2');
    const before = await snapshot(h, 'u1');
    const otherBefore = await snapshot(h, 'u2');
    expect(before.items.length).toBeGreaterThan(10);
    expect(before.encounters.some((e) => e.evidenceKind === 'demonstrated')).toBe(true);
    expect(before.encounters.some((e) => e.evidenceKind === 'assisted')).toBe(true);
    expect(before.encounters.some((e) => e.evidenceKind === 'exposure')).toBe(true);
    expect(before.encounters.some((e) => e.evidenceKind === 'production')).toBe(true);
    expect(before.encounters.length).toBeGreaterThan(20);
    const phraseEvents = (await h.bus.history({ userId: 'u1', types: ['PhraseEncountered'] })).length;

    await h.golearn.rebuild('u1');

    expect(await snapshot(h, 'u1')).toEqual(before);
    expect(await snapshot(h, 'u2')).toEqual(otherBefore); // other users untouched
    expect((await h.bus.history({ userId: 'u1', types: ['PhraseEncountered'] })).length).toBe(phraseEvents); // no re-emission
  });

  it('restores state that was wiped or corrupted', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await play(h, 'u1');
    const before = await snapshot(h, 'u1');
    for (const r of before.items) await h.store.learnerItems.delete(r.id);
    for (const e of before.encounters.slice(0, 5)) await h.store.encounters.delete(e.id);
    await h.store.learnerItems.put({ ...before.items[0], encounterCount: 999 });
    await h.golearn.rebuild('u1');
    expect(await snapshot(h, 'u1')).toEqual(before);
    // and is idempotent
    await h.golearn.rebuild('u1');
    expect(await snapshot(h, 'u1')).toEqual(before);
  });

  it('keeps folding live events correctly after a rebuild', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view('u1', 'es', ES_STORY, 0, 's1');
    await h.golearn.rebuild('u1');
    await h.view('u1', 'es', ES_STORY, 0, 's2');
    expect((await h.golearn.getItemState('u1', F('creo')))?.encounterCount).toBe(2);
    await h.report('u1', 'es', ES_STORY, [0], { session: 's2' });
    await h.rescue('u1', 'es', ES_STORY, [0], 's2'); // help after the report still wins
    const kinds = (await h.store.encounters.where('itemId', F('creo'))).map((e) => e.evidenceKind).sort();
    expect(kinds).toEqual(['assisted', 'exposure']);
  });

  it('is the identity under evidence@8: help scopes (word tap, English, explanation, tap-before-view) rebuild to the same encounters and estimates', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    for (const s of ['s1', 's2', 's3']) await h.viewAll('u1', 'es', ES_STORY, 4, s);
    await h.help('u1', 'es', ES_JOHN, 0, 3, F('cree'), 2, 's4'); // a tap BEFORE the view of its sentence
    await h.view('u1', 'es', ES_JOHN, 0, 's4', 'scripture');
    await h.view('u1', 'es', ES_JOHN, 1, 's4', 'scripture');
    await h.rescue('u1', 'es', ES_JOHN, [0, 1], 's4');
    await h.view('u1', 'es', ES_STORY, 0, 's5');
    await h.help('u1', 'es', ES_STORY, 0, 1, F('creo'), 1, 's5');
    await h.bus.emit({ type: 'SentenceExplanationRevealed', userId: 'u1', lang: 'es', surface: 'corpus', session: 's5', dedupeKey: 'expl', sentenceId: `${ES_STORY}/s0` } as never);
    const before = await snapshot(h, 'u1');
    const coverage = JSON.stringify(await h.golearn.coverage('u1', ES_JOHN));
    expect(before.encounters.some((e) => (e as { itemHelp?: number }).itemHelp !== undefined)).toBe(true);
    expect(before.encounters.some((e) => e.assistance === 5 && (e as { itemHelp?: number }).itemHelp === undefined)).toBe(true);
    await h.golearn.rebuild('u1');
    expect(await snapshot(h, 'u1')).toEqual(before);
    expect(JSON.stringify(await h.golearn.coverage('u1', ES_JOHN))).toBe(coverage);
  });

  it('stamps the policy version in meta', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view('u1', 'es', ES_STORY, 0);
    await h.golearn.rebuild('u1');
    expect((await h.store.meta.all()).map((m) => m.value)).toEqual(['evidence@8']);
  });

  it('rebuilds a user with no events to an empty state', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.golearn.rebuild('nobody');
    expect(await h.store.learnerItems.count()).toBe(0);
  });
});
