/** Protected listening-assessment texts never enter the library index, and an earlier row for one is removed. */
import { describe, expect, it } from 'vitest';
import { buildFixtureText } from '../../src/core';
import { createLibrary } from '../../src/library';
import { clock, registry, spanishStore } from './helpers';

const lib = (store: Parameters<typeof createLibrary>[0]['store']) => createLibrary({ store, adapters: registry, clock, fetch: (async () => new Response('', { status: 404 })) as typeof fetch });

describe('indexStore and listening-assessment texts', () => {
  it('does not index a text with a listeningAssessmentId', async () => {
    const { store, text } = await spanishStore();
    const protectedText = await buildFixtureText(store, { lang: 'es', slug: 'prueba-protegida', sentences: [{ tokens: [{ surface: 'Hola', lemma: 'hola', pos: 'INTJ' }] }] });
    await store.texts.put({ ...protectedText, listeningAssessmentId: 'assessment:1' });
    const l = lib(store);
    expect(await l.indexStore('es')).toBe(1); // only the ordinary text
    expect(await l.entry(text.id)).toBeTruthy();
    expect(await l.entry(protectedText.id)).toBeUndefined();
    expect((await store.catalog.all()).map((r) => r.id)).toEqual([text.id]);
    expect((await l.search({ lang: 'es' })).items.map((i) => i.id)).toEqual([text.id]);
  });

  it('removes a row an earlier index wrote before the text became protected material', async () => {
    const { store } = await spanishStore();
    const later = await buildFixtureText(store, { lang: 'es', slug: 'luego-protegida', sentences: [{ tokens: [{ surface: 'Hola', lemma: 'hola', pos: 'INTJ' }] }] });
    const l = lib(store);
    expect(await l.indexStore('es')).toBe(2);
    expect(await l.entry(later.id)).toBeTruthy();
    await store.texts.put({ ...later, listeningAssessmentId: 'assessment:2' });
    expect(await l.indexStore('es')).toBe(1); // the stale row is removed
    expect(await l.entry(later.id)).toBeUndefined();
    expect(await store.catalog.count()).toBe(1);
  });
});
