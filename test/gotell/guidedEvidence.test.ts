/** Guided help (docs/GOTELL-GUIDED.md, package D): assist ranges -> production kinds, the lookup audit event, drafts. */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { ProductionRecorded, TestimonyWordSupplied } from '../../src/core';
import type { SuppliedWord, TextAssist } from '../../src/gotell/predict/types';
import { makeWorld } from './fakes';
import type { World } from './fakes';
import { esAdapter, esStoryA } from './fixtures';

const produced = async (w: World) => (await w.bus.history({ userId: 'A', types: ['ProductionRecorded'] })) as ProductionRecorded[];
const kindOf = (evs: ProductionRecorded[], itemId: string) => evs.filter((e) => e.itemId === itemId).map((e) => e.kind);
const F = (word: string) => ids.form('es', word);
const supplied = async (w: World) => (await w.bus.history({ userId: 'A', types: ['TestimonyWordSupplied'] })) as TestimonyWordSupplied[];

async function setup() {
  const w = await makeWorld([esAdapter()]);
  await esStoryA(w, 'A');
  const t = await w.gotell.getOrCreateTestimony('A', 'es');
  return { w, t };
}

describe('acceptRevision: guided and supplied ranges', () => {
  // 'Yo no sé.'  Yo = [0,2)  no = [3,5)  sé = [6,8)
  it('a token inside a supplied range is supplied, inside a guided range guided, the rest unchanged', async () => {
    const { w, t } = await setup();
    const assist: TextAssist = { supplied: [{ start: 3, end: 5 }], guided: [{ start: 0, end: 2 }] };
    await w.gotell.acceptRevision(t.id, 'Yo no sé.', { assist });
    const evs = await produced(w);
    expect(kindOf(evs, F('no'))).toEqual(['supplied']);
    expect(kindOf(evs, F('yo'))).toEqual(['guided']);
    expect(kindOf(evs, F('sé'))).toEqual(['independent']);
    expect(evs.filter((e) => e.itemKind === 'lemma' && e.itemId === ids.lemma('es', 'yo', 'PRON')).map((e) => e.kind)).toEqual(['guided']);
    expect(evs.every((e) => e.modality === 'writing')).toBe(true);
  });

  it('a token straddling a range edge is left as it was', async () => {
    const { w, t } = await setup();
    await w.gotell.acceptRevision(t.id, 'Yo no sé.', { assist: { supplied: [{ start: 4, end: 7 }], guided: [{ start: 0, end: 1 }] } });
    expect((await produced(w)).every((e) => e.kind === 'independent')).toBe(true);
  });

  it('without assist nothing changes, and the revision carries no assist', async () => {
    const { w, t } = await setup();
    const rev = await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    expect(rev.assist).toBeUndefined();
    expect((await produced(w)).every((e) => e.kind === 'independent')).toBe(true);
    expect(await supplied(w)).toEqual([]);
  });

  it('ranges are full-text offsets: the second sentence is located after the first', async () => {
    const { w, t } = await setup();
    const text = 'Yo no sé. Casa luz.';
    const at = text.indexOf('Casa');
    const assist: TextAssist = { supplied: [{ start: at, end: at + 4 }], guided: [{ start: text.indexOf('luz'), end: text.indexOf('luz') + 3 }] };
    const rev = await w.gotell.acceptRevision(t.id, text, { assist });
    expect(rev.assist).toEqual(assist);
    expect((await w.store.revisions.get(rev.id))!.assist).toEqual(assist);
    const evs = await produced(w);
    expect(kindOf(evs, F('casa'))).toEqual(['supplied']);
    expect(kindOf(evs, F('luz'))).toEqual(['guided']);
    expect(kindOf(evs, F('yo'))).toEqual(['independent']); // offsets 0-2 are not in any range
    // the same offsets inside the FIRST sentence would not have matched the second one
    expect(kindOf(evs, F('no'))).toEqual(['independent']);
  });

  it('a suggestion that says less (copied) is not upgraded by a guided range', async () => {
    const { w, t } = await setup();
    const a = await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.acceptSuggestion(a.suggestions[0].id);
    // 'la' comes from the accepted suggestion (assisted); marking it guided must not make it look better
    const text = a.suggestions[0].suggested;
    const la = text.toLowerCase().indexOf('la');
    await w.gotell.acceptRevision(t.id, text, { assist: { supplied: [], guided: [{ start: la, end: la + 2 }] } });
    expect(kindOf(await produced(w), F('la'))).toEqual(['assisted']);
  });

  it('checking (submitDraft) still records no production evidence, assist or not', async () => {
    const { w, t } = await setup();
    await w.gotell.saveDraft('A', 'es', 'Yo no sé.', { assist: { supplied: [{ start: 3, end: 5 }], guided: [] } });
    await w.gotell.submitDraft(t.id, 'Yo no sé.');
    expect(await produced(w)).toEqual([]);
    expect(await supplied(w)).toEqual([]);
  });
});

describe('TestimonyWordSupplied', () => {
  const words: SuppliedWord[] = [
    { english: 'no', surface: 'no', itemId: F('no'), known: true },
    { english: 'house', surface: 'casa', itemId: F('casa'), known: false },
  ];

  it('is emitted once per supplied word, with the lookup details, after the revision is accepted', async () => {
    const { w, t } = await setup();
    const rev = await w.gotell.acceptRevision(t.id, 'Yo no sé. Casa luz.', { assist: { supplied: [{ start: 3, end: 5 }], guided: [] }, supplied: [...words, words[0]] });
    const evs = await supplied(w);
    expect(evs).toHaveLength(2); // the duplicate entry did not double it
    expect(evs.map((e) => e.itemId).sort()).toEqual([F('casa'), F('no')].sort());
    const casa = evs.find((e) => e.itemId === F('casa'))!;
    expect(casa).toMatchObject({ testimonyId: t.id, revisionId: rev.id, english: 'house', word: 'casa', surface: 'testimony', known: false, lang: 'es', userId: 'A' });
    expect(casa.dedupeKey).toBe(`tws:${rev.id}:${F('casa')}`);
  });

  it('is deduped when the same text is saved again', async () => {
    const { w, t } = await setup();
    const opts = { assist: { supplied: [{ start: 3, end: 5 }], guided: [] }, supplied: words };
    await w.gotell.acceptRevision(t.id, 'Yo no sé.', opts);
    await w.gotell.acceptRevision(t.id, 'Yo no sé.', opts); // identical text: idempotent
    expect(await supplied(w)).toHaveLength(2);
    expect((await produced(w)).filter((e) => e.itemId === F('no'))).toHaveLength(1);
  });

  it('is not a fold type: it creates no learner state by itself', async () => {
    const { w, t } = await setup();
    await w.gotell.acceptRevision(t.id, 'Yo sé.', { supplied: words });
    expect((await supplied(w)).length).toBe(2);
    expect(await w.store.learnerItems.get(ids.learnerItem('A', F('casa')))).toBeUndefined();
  });
});

describe('drafts keep the assist', () => {
  const assist: TextAssist = { supplied: [{ start: 3, end: 5 }], guided: [{ start: 0, end: 2 }] };

  it('saveDraft stores it and getDraft returns it; a later save without assist does not keep stale ranges', async () => {
    const w = await makeWorld([esAdapter()]);
    const d = await w.gotell.saveDraft('A', 'es', 'Yo no sé', { assist });
    expect(d.assist).toEqual(assist);
    expect((await w.gotell.getDraft('A', 'es'))!.assist).toEqual(assist);
    const d2 = await w.gotell.saveDraft('A', 'es', 'Yo no sé más');
    expect(d2.assist).toBeUndefined();
    expect((await w.gotell.getDraft('A', 'es'))!.assist).toBeUndefined();
    const d3 = await w.gotell.saveDraft('A', 'es', 'Yo no sé más', { assist, expectedSeq: d2.seq });
    expect(d3.assist).toEqual(assist);
  });

  it('restoring a saved version brings its assist back, and accepting a revision keeps the draft assist', async () => {
    const { w, t } = await setup();
    await w.gotell.saveDraft('A', 'es', 'Yo no sé.', { assist });
    const rev = await w.gotell.acceptRevision(t.id, 'Yo no sé.', { assist });
    expect((await w.gotell.getDraft('A', 'es'))!.assist).toEqual(assist);
    await w.gotell.saveDraft('A', 'es', 'otra cosa');
    const restored = await w.gotell.restoreRevisionAsDraft(rev.id);
    expect(restored).toMatchObject({ text: 'Yo no sé.', basedOnRevisionId: rev.id, assist });
  });
});
