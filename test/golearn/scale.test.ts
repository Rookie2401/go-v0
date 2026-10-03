/**
 * evidence@7 — the cost of folding an event and of the screens' reads does not grow with the learner's history.
 * The fold must not read or scan an item's encounter history (or the encounter table at all); the reads the UI makes on every
 * screen must not read the learner's whole event table or all of his encounters. Writing-system items are aggregates, not rows.
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { Table } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { TH_STORY, buildThai } from './fixtures';
import { COURSE, buildChapter, filler, stageRow, workRow } from './courseFixtures';
import { fakeDecode, fakeFeatures } from './testAdapters';
import type { StoredItem } from '../../src/golearn/agg';

const U = 'u1';

/** Count the calls that read many rows at once (a scan or an index read), per table. */
function spy(h: Harness) {
  const calls: string[] = [];
  const wrap = (name: string, table: Table<{ id: string }>) => {
    for (const m of ['where', 'all'] as const) {
      const original = table[m].bind(table) as (...a: unknown[]) => Promise<unknown>;
      (table as unknown as Record<string, unknown>)[m] = (...a: unknown[]) => { calls.push(`${name}.${m}(${a.map(String).join(',')})`); return original(...a); };
    }
  };
  wrap('encounters', h.store.encounters as never);
  wrap('learnerItems', h.store.learnerItems as never);
  wrap('events', h.store.events as never);
  const history = h.bus.history.bind(h.bus);
  h.bus.history = (async (f) => { calls.push(`bus.history(${JSON.stringify(f?.types ?? null)})`); return history(f); }) as typeof h.bus.history;
  return { calls, reset: () => { calls.length = 0; } };
}

async function history(h: Harness, sittings: number) {
  for (let s = 0; s < sittings; s++) {
    await h.viewTimed(U, 'th', TH_STORY, 0, 2000, `p${s}`);
    await h.viewTimed(U, 'th', TH_STORY, 1, 2000, `p${s}`);
    if (s % 3 === 0) await h.report(U, 'th', TH_STORY, [0, 1], { session: `p${s}` });
  }
}

describe('folding does not scan', () => {
  it('after 40 sittings, a view, help, a decoding, a report and a production touch no encounter table scan and no event read', async () => {
    const h = createHarness({ decode: ['th'] });
    await buildThai(h.store);
    await history(h, 40);
    const s = spy(h);
    const word = ids.form('th', 'รัก');
    await h.viewTimed(U, 'th', TH_STORY, 0, 2000, 'now');
    await h.help(U, 'th', TH_STORY, 0, 2, word, 1, 'now');
    await h.decoding(U, 'th', TH_STORY, 0, 2, word, fakeFeatures(fakeDecode('รัก')), { romanization: true, session: 'now' });
    await h.rescue(U, 'th', TH_STORY, [0], 'now');
    await h.report(U, 'th', TH_STORY, [0, 1], { session: 'now' });
    await h.listen(U, 'th', TH_STORY, [0], { session: 'now' });
    await h.produce(U, 'th', word, 'independent');
    await h.mark(U, 'th', word, 'known');
    await h.golearn.settled();
    expect(s.calls.filter((c) => !/^events\./.test(c) || /events\.where\(userId|events\.all/.test(c))).toEqual([]); // the bus appends by key; nothing reads the log
    expect(s.calls.filter((c) => /^(encounters|learnerItems)\./.test(c))).toEqual([]);
    expect(s.calls.filter((c) => /^bus\.history/.test(c))).toEqual([]); // the folder's sitting index was loaded once, at the start
  });

  it('writing-system items keep no encounter rows, however much is read; word items keep one row per sentence and sitting', async () => {
    const h = createHarness({ decode: ['th'] });
    await buildThai(h.store);
    await history(h, 30);
    const encs = await h.store.encounters.where('userId', U);
    expect(encs.some((e) => e.itemKind === 'orth')).toBe(false);
    const rak = encs.filter((e) => e.itemId === ids.form('th', 'รัก'));
    expect(rak.length).toBe(60); // two sentences contain it, 30 sittings
    // yet the writing-system items know their whole history
    const feature = ids.orth('th', fakeFeatures(fakeDecode('รัก'))[0]);
    const state = await h.golearn.getItemState(U, feature);
    expect(state).toMatchObject({ itemKind: 'orth', encounterCount: 60 });
    expect(state).not.toHaveProperty('agg'); // the aggregate is not part of the contract row
    const row = (await h.store.learnerItems.get(`${U}|${feature}`)) as StoredItem;
    expect(Object.keys(row.agg.headR!.e).length).toBeLessThanOrEqual(2); // the current sitting only; earlier ones are plain counts
    expect(row.agg.texts).toEqual([TH_STORY]);
    expect(row.agg.counts).toEqual([60]);
    expect(row.agg.first).toMatchObject({ textId: TH_STORY, sentenceId: `${TH_STORY}/s0` });
  });

  it('the history of a writing-system item is answered from its aggregate', async () => {
    const h = createHarness({ decode: ['th'] });
    await buildThai(h.store);
    await history(h, 5);
    const feature = ids.orth('th', fakeFeatures(fakeDecode('รัก'))[0]);
    const hist = await h.golearn.itemHistory(U, feature);
    expect(hist).toMatchObject({ itemKind: 'orth', encounterCount: 10, byText: [{ textId: TH_STORY, count: 10 }], first: { textId: TH_STORY, sentenceId: `${TH_STORY}/s0` } });
    expect(hist.lines[0]).toMatch(/^You first met this in /);
    expect(hist.lines[1]).toBe('Met 10 times in 1 text.');
    expect((await h.golearn.explainItem(U, feature)).texts).toEqual([{ textId: TH_STORY, title: TH_STORY.replace('text:th:', ''), count: 10 }]);
  });

  it('the reads of every screen do not read the event table of the learner or scan his encounters', async () => {
    const h = createHarness({ decode: ['th'] });
    await buildThai(h.store);
    await buildChapter(h.store, { slug: 'k', work: 'w1', chapter: 1, lang: 'th', sentences: filler(3, ['รัก', 'โลก', 'ฉัน']) });
    await h.store.stages.bulkPut([stageRow(0, 'g1', 'grade', 'th')]);
    await h.store.works.put(workRow('w1', 'g1', 'spine', 0, 'th'));
    await history(h, 25);
    await h.viewAll(U, 'th', ids.text('th', 'k'), 3, 'k1');
    await h.golearn.settled();
    const s = spy(h);
    const t = ids.text('th', 'k');
    await h.golearn.coverage(U, TH_STORY);
    await h.golearn.readingProgress(U, TH_STORY);
    await h.golearn.readingProgressMany(U, [TH_STORY, t]);
    await h.golearn.predictDifficulty(U, t);
    await h.golearn.readingPace(U, { textId: TH_STORY });
    await h.golearn.readingPace(U, { stageId: ids.stage(COURSE, 'g1') });
    await h.golearn.stageReadiness(U, COURSE, ids.stage(COURSE, 'g1'));
    const bad = s.calls.filter((c) => /^bus\.history/.test(c) || /^events\.(all|where\(userId)/.test(c) || /^encounters\.(all|where\(userId)/.test(c));
    expect(bad).toEqual([]);
  });
});
