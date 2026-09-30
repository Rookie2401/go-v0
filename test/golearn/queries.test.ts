import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { createHarness } from './harness';
import { ES_JOHN, ES_STORY, buildSpanish, buildSpanishScripture } from './fixtures';

const U = 'u1';
const F = (w: string) => ids.form('es', w);
const LEMMA_CREER = ids.lemma('es', 'creer', 'VERB');

describe('queryItem / queryItems', () => {
  it('resolves a raw surface through adapter.normalize and reports exact-form seen', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    const k = await h.golearn.queryItem(U, { surface: 'CREO', lang: 'es' }); // normalized to "creo"
    expect(k.itemId).toBe(F('creo'));
    expect(k.itemKind).toBe('form');
    expect(k.exists).toBe(true);
    expect(k.exactFormSeen).toBe(true);
    expect(k.encounterCount).toBe(1);
    expect(k.textIds).toEqual([ES_STORY]);
    expect(k.reading.level).toBe('encountered');
    expect(k.lastSeenAt).toBeTruthy();
    expect(k.productionEvidence).toEqual({ independent: 0, selfRepaired: 0, assisted: 0, copied: 0 });
  });

  it('an unseen unknown word is {exists:false, exactFormSeen:false, relatedSeen:false}', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    const k = await h.golearn.queryItem(U, { surface: 'xyzzy', lang: 'es' });
    expect(k.exists).toBe(false);
    expect(k.exactFormSeen).toBe(false);
    expect(k.relatedSeen).toBe(false);
    expect(k.reading.level).toBe('unseen');
  });

  it('relatedSeen comes from the token → analysis → lemma tables', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    await h.view(U, 'es', ES_JOHN, 0, 's1', 'scripture'); // the learner has met "cree" only
    const creo = await h.golearn.queryItem(U, { surface: 'creo', lang: 'es' });
    expect(creo.exactFormSeen).toBe(false); // never met this exact form…
    expect(creo.relatedSeen).toBe(true); // …but met "cree" (same lemma creer)
    const perdona = await h.golearn.queryItem(U, { surface: 'perdona', lang: 'es' });
    expect(perdona.relatedSeen).toBe(false);
    const lemma = await h.golearn.queryItem(U, { itemId: LEMMA_CREER, lang: 'es' });
    expect(lemma.itemKind).toBe('lemma');
    expect(lemma.exactFormSeen).toBe(true);
  });

  it('relatedSeen falls back to adapter.relate for forms no text has tokenized', async () => {
    const h = createHarness({ lemmaOf: { es: { creía: 'creer', cree: 'creer' } } });
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    await h.view(U, 'es', ES_JOHN, 0, 's1', 'scripture');
    const k = await h.golearn.queryItem(U, { surface: 'Creía', lang: 'es' }); // not in any corpus text
    expect(k.exists).toBe(false);
    expect(k.relatedSeen).toBe(true);
    const other = await h.golearn.queryItem(U, { surface: 'amaba', lang: 'es' });
    expect(other.relatedSeen).toBe(false);
  });

  it('queryItems answers a batch in order; an item without id or surface is an error', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    const out = await h.golearn.queryItems(U, [
      { surface: 'dios', lang: 'es' }, { itemId: ids.phrase('es', ['creo', 'en', '_']), lang: 'es' }, { surface: 'nada', lang: 'es' },
    ]);
    expect(out.map((k) => k.exists)).toEqual([true, true, false]);
    expect(out[1].itemKind).toBe('phrase');
    await expect(h.golearn.queryItem(U, { lang: 'es' })).rejects.toThrow();
  });

  it('is per user', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view('a', 'es', ES_STORY, 0);
    expect((await h.golearn.queryItem('a', { surface: 'creo', lang: 'es' })).exists).toBe(true);
    expect((await h.golearn.queryItem('b', { surface: 'creo', lang: 'es' })).exists).toBe(false);
  });
});

describe('listKnown', () => {
  it('lists items at or above a level in a modality, strongest first', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    for (const s of ['s1', 's2', 's3']) await h.view(U, 'es', ES_STORY, 0, s);
    await h.view(U, 'es', ES_STORY, 3, 's1');
    const recognized = await h.golearn.listKnown(U, 'es', 'reading', 'recognized');
    const ids1 = recognized.map((r) => r.itemId);
    expect(ids1).toContain(F('creo'));
    expect(ids1).toContain(F('dios')); // in s0 (3×) and s3
    expect(ids1).not.toContain(F('perdona')); // only encountered once
    const enc = await h.golearn.listKnown(U, 'es', 'reading', 'encountered');
    expect(enc.length).toBeGreaterThan(recognized.length);
    expect(await h.golearn.listKnown(U, 'es', 'listening', 'encountered')).toEqual([]);
    expect(await h.golearn.listKnown(U, 'de', 'reading', 'encountered')).toEqual([]);
    await expect(h.golearn.listKnown(U, 'es', 'reading', 'mastered')).rejects.toThrow();
  });
});
