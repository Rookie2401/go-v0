/**
 * evidence@7 — writing-system (`orth`) items and decoding help. Orth items are folded with the same policy as other items
 * (reading only), they are driven by the adapter's decoding, they never leak into anything that counts WORDS, the romanization
 * rescue is kept on the encounter, NoteOpened is not evidence, and everything rebuilds from the log.
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { ES_STORY, TH_STORY, buildSpanish, buildThai } from './fixtures';
import { fakeDecode, fakeFeatures } from './testAdapters';
import { KIND_OF } from '../../src/golearn/agg';
import type { StoredItem } from '../../src/golearn/agg';
import type { StoredEncounter } from '../../src/golearn/state';

const U = 'u1';
const F = (w: string) => ids.form('th', w);
const featuresOf = (surface: string) => fakeFeatures(fakeDecode(surface));
const orthOf = (surface: string) => featuresOf(surface).map((f) => ids.orth('th', f));

async function thai(opts: Parameters<typeof createHarness>[0] = { decode: ['th'] }): Promise<Harness> {
  const h = createHarness(opts);
  await buildThai(h.store);
  return h;
}
/**
 * A writing-system item has NO encounter rows (evidence@7): its encounters of the current sitting live in its aggregate. This
 * shows them in the shape of encounter rows, so the tests read the same for every kind of item.
 */
const orthEnc = async (h: Harness, itemId: string): Promise<StoredEncounter[]> => {
  const row = (await h.store.learnerItems.get(`${U}|${itemId}`)) as StoredItem | undefined;
  return Object.entries(row?.agg.headR?.e ?? {}).map(([sentenceId, e]) => ({
    id: `${itemId}@${sentenceId}`, userId: U, itemId, itemKind: 'orth', modality: 'reading', sentenceId, evidenceKind: KIND_OF[e[0]], assistance: e[1], weight: e[3] / 1e6,
    ...(e[2] > 0 ? { itemHelp: e[2] } : {}), ...(e[5] ? { romanized: true } : {}),
  })) as unknown as StoredEncounter[];
};
const enc = async (h: Harness, itemId: string): Promise<StoredEncounter[]> => {
  if (itemId.startsWith('orth:')) return orthEnc(h, itemId);
  return ((await h.store.encounters.where('itemId', itemId)) as StoredEncounter[]).filter((e) => e.userId === U).sort((a, b) => (a.id < b.id ? -1 : 1));
};

describe('orth items are folded from the adapter decoding', () => {
  it('a view yields one reading exposure per writing-system item of the sentence words', async () => {
    const h = await thai();
    await h.view(U, 'th', TH_STORY, 0);
    const wanted = new Set(['พระเจ้า', 'ทรง', 'รัก', 'โลก'].flatMap(orthOf));
    expect(wanted.size).toBeGreaterThan(3);
    for (const id of wanted) {
      const [e, ...more] = await enc(h, id);
      expect(more).toHaveLength(0);
      expect(e).toMatchObject({ itemKind: 'orth', modality: 'reading', evidenceKind: 'exposure', assistance: 0, weight: 0, sentenceId: `${TH_STORY}/s0` });
      expect(await h.store.encounters.where('itemId', id)).toEqual([]);
      expect(await h.golearn.getItemState(U, id)).toMatchObject({ itemKind: 'orth', lang: 'th', encounterCount: 1 });
    }
    // nothing but the expected orth items exist
    const orthRows = (await h.store.learnerItems.where('userId', U)).filter((r) => r.itemKind === 'orth').map((r) => r.itemId);
    expect(new Set(orthRows)).toEqual(wanted);
  });

  it('a language whose adapter cannot decode yields none (Thai without decode, Spanish with a decoding Thai)', async () => {
    const plain = await thai({});
    await plain.view(U, 'th', TH_STORY, 0);
    expect((await plain.store.learnerItems.where('userId', U)).some((r) => r.itemKind === 'orth')).toBe(false);
    const es = createHarness({ decode: ['th'] });
    await buildSpanish(es.store);
    await es.view(U, 'es', ES_STORY, 0);
    expect((await es.store.learnerItems.where('userId', U)).some((r) => r.itemKind === 'orth')).toBe(false);
  });

  it('a report of understanding demonstrates the orth items like any other item', async () => {
    const h = await thai();
    await h.understood(U, 'th', TH_STORY, [0]);
    const id = orthOf('รัก')[0];
    expect((await enc(h, id))[0]).toMatchObject({ evidenceKind: 'demonstrated', weight: 1 });
    expect((await h.golearn.getItemState(U, id))!.reading.evidence).toBeGreaterThan(0);
  });

  it('an author-supplied decoding or a dictionary respelling steers the decoding; decodings are cached per form, not per spelling alone', async () => {
    const h = await thai();
    // The second sentence has the same spelling "รัก" as the first, but its analysis carries a dictionary respelling.
    await h.store.analyses.put({
      id: 'an:resp', tokenId: `${TH_STORY}/s1/t1`, lang: 'th', morph: {}, confidence: 0.99, provenance: 'lexicon', analyzer: 'dict:test',
      createdAt: '2026-01-01T00:00:00.000Z', notes: { respelling: 'rak' },
    });
    await h.view(U, 'th', TH_STORY, 0);
    await h.view(U, 'th', TH_STORY, 1);
    const plain = (await enc(h, ids.orth('th', 'tone:' + fakeDecode('รัก')[0].tone)))[0];
    expect(plain).toBeDefined();
    expect((await enc(h, ids.orth('th', 'tone:rising'))).map((e) => e.sentenceId)).toEqual([`${TH_STORY}/s1`]);
  });

  it('listening never yields orth items', async () => {
    const h = await thai();
    await h.listen(U, 'th', TH_STORY, [0]);
    expect((await h.store.encounters.where('userId', U)).length).toBeGreaterThan(0);
    expect((await h.store.encounters.where('userId', U)).some((e) => e.itemKind === 'orth')).toBe(false);
  });
});

describe('orth items never leak into word measures', () => {
  async function play(h: Harness) {
    await h.view(U, 'th', TH_STORY, 0, 's1');
    await h.decoding(U, 'th', TH_STORY, 0, 2, F('รัก'), featuresOf('รัก'), { session: 's1' });
    await h.view(U, 'th', TH_STORY, 1, 's1');
    await h.help(U, 'th', TH_STORY, 1, 1, F('รัก'), 1, 's1');
    await h.report(U, 'th', TH_STORY, [0, 1], { session: 's1' });
    for (const s of ['s2', 's3', 's4']) await h.viewAll(U, 'th', TH_STORY, 2, s);
  }

  it('coverage, recommendations, vocabulary lists and word queries are identical with and without decoding', async () => {
    const a = await thai({ decode: ['th'] });
    const b = await thai({});
    await play(a);
    await play(b);
    expect((await a.store.learnerItems.where('userId', U)).some((r) => r.itemKind === 'orth')).toBe(true);
    expect((await b.store.learnerItems.where('userId', U)).some((r) => r.itemKind === 'orth')).toBe(false);

    expect(await a.golearn.coverage(U, TH_STORY)).toEqual(await b.golearn.coverage(U, TH_STORY));
    expect(await a.golearn.recommend(U, { includeUnpublished: true })).toEqual(await b.golearn.recommend(U, { includeUnpublished: true }));
    for (const modality of ['reading', 'listening', 'writing'] as const) {
      expect(await a.golearn.listKnown(U, 'th', modality, 'encountered')).toEqual(await b.golearn.listKnown(U, 'th', modality, 'encountered'));
    }
    expect(await a.golearn.queryItem(U, { surface: 'รัก', lang: 'th' })).toEqual(await b.golearn.queryItem(U, { surface: 'รัก', lang: 'th' }));
    expect(await a.golearn.readingProgress(U, TH_STORY)).toEqual(await b.golearn.readingProgress(U, TH_STORY));
    const forecastA = await a.golearn.predictDifficulty(U, TH_STORY);
    const forecastB = await b.golearn.predictDifficulty(U, TH_STORY);
    expect(forecastA).toEqual(forecastB);
  });

  it('an orth item can still be asked for by id (history and explanation), and explains itself as a spelling feature', async () => {
    const h = await thai();
    await h.view(U, 'th', TH_STORY, 0);
    const id = orthOf('รัก')[0];
    expect((await h.golearn.queryItem(U, { itemId: id, lang: 'th' }))).toMatchObject({ itemKind: 'orth', exists: true, relatedSeen: false });
    expect((await h.golearn.explainItem(U, id)).summary).toMatch(/^Met/);
    expect((await h.golearn.itemHistory(U, id)).itemKind).toBe('orth');
  });
});

describe('DecodingRevealed is item-targeted help (level 1) for the word and its writing-system items', () => {
  it('assists the form and the orth items of the decoding, in this sentence only, and leaves the lemma and other words alone', async () => {
    const h = await thai();
    await h.view(U, 'th', TH_STORY, 0);
    await h.view(U, 'th', TH_STORY, 1);
    await h.decoding(U, 'th', TH_STORY, 0, 2, F('รัก'), featuresOf('รัก'));
    const s0 = (id: string) => enc(h, id).then((l) => l.find((e) => e.sentenceId === `${TH_STORY}/s0`)!);
    const s1 = (id: string) => enc(h, id).then((l) => l.find((e) => e.sentenceId === `${TH_STORY}/s1`)!);

    expect(await s0(F('รัก'))).toMatchObject({ evidenceKind: 'assisted', assistance: 1, itemHelp: 1 });
    for (const f of featuresOf('รัก')) expect(await s0(ids.orth('th', f))).toMatchObject({ evidenceKind: 'assisted', assistance: 1, itemHelp: 1 });
    // another word of the same sentence that shares no feature is untouched
    const own = orthOf('โลก').filter((id) => !orthOf('รัก').includes(id));
    expect(own.length).toBeGreaterThan(0);
    for (const id of own) expect(await s0(id)).toMatchObject({ evidenceKind: 'exposure', assistance: 0 });
    expect(await s0(F('โลก'))).toMatchObject({ evidenceKind: 'exposure' });
    // the lemma is not what was decoded
    expect(await s0(ids.lemma('th', 'รัก', 'VERB'))).toMatchObject({ evidenceKind: 'exposure', assistance: 0 });
    // the same word in the other sentence keeps its help-free exposure
    expect(await s1(F('รัก'))).toMatchObject({ evidenceKind: 'exposure', assistance: 0 });
  });

  it('help given before the view (tap-before-view) lands on the same encounters, and a report cannot demonstrate a decoded item', async () => {
    const h = await thai();
    await h.decoding(U, 'th', TH_STORY, 0, 2, F('รัก'), featuresOf('รัก'));
    await h.understood(U, 'th', TH_STORY, [0]);
    expect((await enc(h, F('รัก')))[0]).toMatchObject({ evidenceKind: 'assisted', assistance: 1, weight: 0 });
    expect((await enc(h, orthOf('รัก')[0]))[0]).toMatchObject({ evidenceKind: 'assisted', weight: 0 });
    expect((await enc(h, F('โลก')))[0]).toMatchObject({ evidenceKind: 'demonstrated', weight: 1 });
  });

  it('the romanization rescue is kept on the encounters it touched (word and orth items), only for that sitting and sentence', async () => {
    const h = await thai();
    await h.view(U, 'th', TH_STORY, 0);
    await h.view(U, 'th', TH_STORY, 1);
    await h.decoding(U, 'th', TH_STORY, 0, 2, F('รัก'), featuresOf('รัก'), { romanization: false });
    expect((await enc(h, F('รัก'))).some((e) => e.romanized)).toBe(false);
    await h.decoding(U, 'th', TH_STORY, 0, 2, F('รัก'), featuresOf('รัก'), { romanization: true });
    const rak = await enc(h, F('รัก'));
    expect(rak.find((e) => e.sentenceId === `${TH_STORY}/s0`)!.romanized).toBe(true);
    expect(rak.find((e) => e.sentenceId === `${TH_STORY}/s1`)!.romanized).toBeUndefined();
    for (const f of featuresOf('รัก')) expect((await enc(h, ids.orth('th', f))).find((e) => e.sentenceId === `${TH_STORY}/s0`)!.romanized).toBe(true);
    expect((await enc(h, F('โลก')))[0].romanized).toBeUndefined();
  });

  it('NoteOpened has no effect on evidence', async () => {
    const h = await thai();
    await h.view(U, 'th', TH_STORY, 0);
    const snapshot = async () => ({
      items: (await h.store.learnerItems.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)),
      encounters: (await h.store.encounters.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)),
    });
    const before = await snapshot();
    await h.noteOpened(U, 'th', TH_STORY, 0);
    await h.golearn.settled();
    expect(await snapshot()).toEqual(before);
    expect((await h.bus.history({ userId: U, types: ['NoteOpened'] }))).toHaveLength(1); // it is in the log, it just changes nothing
  });
});

describe('derived state with orth items rebuilds identically from the log', () => {
  const snapshot = async (h: Harness) => {
    const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : 1);
    return { items: (await h.store.learnerItems.where('userId', U)).sort(byId), encounters: (await h.store.encounters.where('userId', U)).sort(byId) };
  };

  async function play(h: Harness) {
    await h.view(U, 'th', TH_STORY, 0, 's1');
    await h.decoding(U, 'th', TH_STORY, 0, 2, F('รัก'), featuresOf('รัก'), { session: 's1' });
    await h.decoding(U, 'th', TH_STORY, 1, 1, F('รัก'), featuresOf('รัก'), { session: 's1', romanization: true }); // before its view
    await h.view(U, 'th', TH_STORY, 1, 's1');
    await h.report(U, 'th', TH_STORY, [0, 1], { session: 's1' });
    await h.rescue(U, 'th', TH_STORY, [1], 's1');
    for (const s of ['s2', 's3', 's4', 's5']) await h.viewAll(U, 'th', TH_STORY, 2, s);
    await h.noteOpened(U, 'th', TH_STORY, 0, 's5');
  }

  it('rebuild() reproduces items and encounters byte for byte, including orth rows and the romanization flag', async () => {
    const h = await thai();
    await play(h);
    const before = await snapshot(h);
    expect(before.items.some((r) => r.itemKind === 'orth')).toBe(true);
    expect(before.encounters.some((e) => e.itemKind === 'orth')).toBe(false); // writing-system items are aggregates, not rows
    expect((before.encounters as StoredEncounter[]).some((e) => e.romanized)).toBe(true);
    await h.golearn.rebuild(U);
    expect(await snapshot(h)).toEqual(before);
  });

  it('a second, cold GoLearn on the same store folds the same log into the same state (live == replay)', async () => {
    const live = await thai();
    await play(live);
    const replayed = await thai();
    // replay the exact events into a fresh store with the fixture texts, folding live
    for (const e of (await live.bus.history({ userId: U })).filter((x) => x.type !== 'PhraseEncountered')) await replayed.bus.emit({ ...e, at: e.at } as never);
    expect(await snapshot(replayed)).toEqual(await snapshot(live));
  });

  it('an older policy stamp: a user stamped under the old policy is rebuilt through ensureCurrent and gains the orth items', async () => {
    const h = await thai();
    await play(h);
    const full = await snapshot(h);
    // simulate state computed under an older policy: no orth rows at all, old stamp
    for (const e of await h.store.encounters.where('userId', U)) if (e.itemKind === 'orth') await h.store.encounters.delete(e.id);
    for (const r of await h.store.learnerItems.where('userId', U)) if (r.itemKind === 'orth') await h.store.learnerItems.delete(r.id);
    await h.store.meta.put({ id: `golearn.policy:${U}`, value: 'evidence@4', updatedAt: 'then' });
    expect((await snapshot(h)).items.length).toBeLessThan(full.items.length);

    expect(await h.golearn.ensureCurrent(U)).toBe(true);
    expect((await h.store.meta.get(`golearn.policy:${U}`))!.value).toBe('evidence@7');
    expect(await snapshot(h)).toEqual(full);
    expect(await h.golearn.ensureCurrent(U)).toBe(false);
  });
});

