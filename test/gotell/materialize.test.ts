/** An accepted revision is materialized as a real private Text (addressable sentences + tokens). */
import { describe, expect, it } from 'vitest';
import { createMemoryStore, seedBasics, StoreEventBus, ids } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { createGoTell, isTestimonyText, testimonySlug } from '../../src/gotell';
import { makeWorld, FakeGoLearn } from './fakes';
import { esAdapter, esStoryA } from './fixtures';

describe('revision -> private Text', () => {
  it('creates a testimony Text + corpus + source with sentences and tokens', async () => {
    const w = await makeWorld([esAdapter()]);
    await esStoryA(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const rev = await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa.');
    expect(rev.textId).toBe(ids.text('es', testimonySlug('A', 1)));
    expect(testimonySlug('A', 1)).toMatch(/^testimony-a-[0-9a-f]{6}-r1$/);
    const text = (await w.store.texts.get(rev.textId!))!;
    expect(text.kind).toBe('testimony');
    expect(text.generated).toBe(false);
    expect(text.tags).toEqual(['private', 'testimony']);
    expect(isTestimonyText(text)).toBe(true);
    expect(isTestimonyText((await w.store.texts.get('text:es:story-a'))!)).toBe(false);
    expect((await w.store.corpora.get('testimony:A'))!.kind).toBe('testimony');
    expect(await w.store.sources.get('src:testimony:A')).toMatchObject({ rights: 'user-private', authorship: 'learner' });

    const sentences = (await w.store.sentences.where('textId', rev.textId!)).sort((a, b) => a.index - b.index);
    expect(sentences.map((s) => s.text)).toEqual(rev.sentences.map((s) => s.text));
    expect(sentences.map((s) => s.textHash)).toEqual(rev.sentences.map((s) => s.textHash));
    const tokens = await w.store.tokens.where('sentenceId', sentences[0].id);
    expect(tokens.filter((x) => x.isWord).map((x) => x.surface)).toEqual(['Yo', 'no', 'sé']);
    expect(await w.store.rescues.where('textId', rev.textId!)).toEqual([]);
  });

  it('each revision gets its own Text; identical re-save creates no second Text', async () => {
    const w = await makeWorld([esAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const r1 = await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    const r2 = await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa.');
    await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa.');
    expect(r1.textId).not.toBe(r2.textId);
    const tests = (await w.store.texts.all()).filter(isTestimonyText);
    expect(tests.map((x) => x.id).sort()).toEqual([r1.textId, r2.textId].sort());
    // the earlier revision's Text is untouched by the later one
    expect((await w.store.sentences.where('textId', r1.textId!))).toHaveLength(1);
  });

  it('per-user slugs are slug-safe and never collide', () => {
    expect(testimonySlug('a', 2)).toBe('testimony-a-r2'); // already slug-safe: kept as is
    expect(testimonySlug('A', 2)).toMatch(/^testimony-a-[0-9a-f]{6}-r2$/);
    expect(testimonySlug('user_1', 1)).toMatch(/^testimony-user-1-[0-9a-f]{6}-r1$/);
    expect(testimonySlug('A', 1)).not.toBe(testimonySlug('a', 1)); // altered ids carry a hash, so no collisions
  });

  it('Thai revision is tokenized by the real adapter without spaces; Texts of two users stay separate', async () => {
    const store = createMemoryStore();
    await seedBasics(store, 'u1', 'thailand-th');
    const bus = new StoreEventBus(store);
    const adapters = createAdapterRegistry();
    const gotell = createGoTell({ store, bus, adapters, golearn: new FakeGoLearn(store) });
    const tt = await gotell.getOrCreateTestimony('u1', 'th');
    const text = 'ตอนเด็กฉันรู้จักพระเยซูแต่ฉันไม่เข้าใจบาปของฉัน';
    const rev = await gotell.acceptRevision(tt.id, text);
    expect(rev.textId).toBe(ids.text('th', 'testimony-u1-r1'));
    const sentences = await store.sentences.where('textId', rev.textId!);
    expect(sentences).toHaveLength(1);
    const words = (await store.tokens.where('sentenceId', sentences[0].id)).filter((t) => t.isWord).sort((a, b) => a.index - b.index);
    expect(words.length).toBeGreaterThanOrEqual(4);
    expect(words.map((t) => t.surface).join('')).toBe(text);
    expect(words.every((t) => !/\s/.test(t.surface))).toBe(true);
    expect(words.every((t) => sentences[0].text.slice(t.start, t.end) === t.surface)).toBe(true);

    const other = await gotell.getOrCreateTestimony('u2', 'th');
    const r2 = await gotell.acceptRevision(other.id, text);
    expect(r2.textId).toBe(ids.text('th', 'testimony-u2-r1'));
    expect(r2.textId).not.toBe(rev.textId);
    // privacy still guards the accessors even though the Text row is shared
    await expect(gotell.forUser('u2').listRevisions(tt.id)).rejects.toThrow(/not owned|not permitted/);
  });
});
