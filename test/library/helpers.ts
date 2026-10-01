import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FIXTURE_ANALYZER, buildFixtureText, createMemoryStore, ids, type AppStore, type CatalogText, type FixtureTextSpec, type Text } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';

export const registry = createAdapterRegistry();
export const NOW = '2026-10-01T00:00:00.000Z';
export const clock = () => NOW;

export const tmpDir = (prefix: string): string => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** A small Spanish text with analyses chosen to exercise every feature. 11 word tokens in 3 live sentences. */
export const SPANISH_SPEC: FixtureTextSpec = {
  lang: 'es', slug: 'muestra', title: 'La muestra',
  sentences: [
    { tokens: [
      { surface: 'Yo', lemma: 'yo', pos: 'PRON', morph: { PronType: 'Prs', Case: 'Nom' } },
      { surface: 'creo', lemma: 'creer', pos: 'VERB', morph: { Mood: 'Ind' } },
      { surface: 'que', lemma: 'que', pos: 'SCONJ' },
      { surface: 'Dios', lemma: 'Dios', pos: 'PROPN' },
      { surface: 'es', lemma: 'ser', pos: 'AUX', morph: { Mood: 'Ind' } },
      { surface: 'bueno', lemma: 'bueno', pos: 'ADJ' },
      { surface: '.', isWord: false },
    ], phrases: [{ pattern: ['creo', 'que'], tokenIndexes: [1, 2] }] },
    { tokens: [
      { surface: 'Quiero', lemma: 'querer', pos: 'VERB', morph: { Mood: 'Ind' } },
      { surface: 'que', lemma: 'que', pos: 'SCONJ' },
      { surface: 'vengas', lemma: 'venir', pos: 'VERB', morph: { Mood: 'Sub' } },
      { surface: '.', isWord: false },
    ], patterns: [{ key: 'subjunctive', tokenIndexes: [2] }] },
    { tokens: [
      { surface: 'Dímelo', lemma: 'decir', pos: 'VERB', morph: { Mood: 'Imp' } },
      { surface: 'ahora' }, // no analysis at all
      { surface: '.', isWord: false },
    ] },
  ],
};

/** Add a second analysis row to a fixture token (the fixture builder writes one). */
export async function addAnalysis(store: AppStore, tokenId: string, patch: Record<string, unknown>, id = `${tokenId}:extra`): Promise<void> {
  const base = (await store.analyses.get(ids.analysis(tokenId, FIXTURE_ANALYZER))) ?? { tokenId, lang: 'es', morph: {}, confidence: 0.9, provenance: 'lexicon', analyzer: 'extra@1', createdAt: '2026-01-01T00:00:00.000Z' };
  await store.analyses.put({ ...(base as object), id, analyzer: 'extra@1', ...patch } as never);
}

export async function spanishStore(): Promise<{ store: AppStore; text: Text }> {
  const store = createMemoryStore();
  const text = await buildFixtureText(store, SPANISH_SPEC);
  return { store, text };
}

/** A synthetic catalogue row. */
export const catalogRow = (n: number, over: Partial<CatalogText> = {}): CatalogText => ({
  id: ids.text('es', `obra-${String(n).padStart(6, '0')}`), lang: 'es', title: `Obra ${n}`, stream: 'library', rights: 'verified-public-domain',
  location: 'library', published: false, features: { words: 100 + (n % 50), sentences: 10, uniqueForms: 60, meanSentenceWords: 10 }, ...over,
});
