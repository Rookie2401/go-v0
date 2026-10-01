/**
 * The importer stores what an adapter says about a lexical unit written as several words (contract v9:
 * `AnalysisCandidate.unit`, token indexes → `TokenAnalysis.unit`, token ids) and about an older spelling
 * (`orthography`). Language-neutral: a fake adapter makes the statements, so no real adapter's data is assumed.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { createMemoryStore } from '../../src/core';
import type { AdapterRegistry, LanguageAdapter } from '../../src/core';
import { importDocuments, loadBundledCorpus } from '../../src/ingest';

const real = createAdapterRegistry();
const clock = () => '2026-10-01T00:00:00.000Z';
const template = loadBundledCorpus().find((d) => d.lang === 'de' && d.id === 'story-01')!;
const doc = (text: string) => ({ ...template, id: 'unit-probe', title: 'unit probe', sections: [{ paragraphs: [{ sentences: [{ text }] }] }] }) as unknown as typeof template;

/** German adapter whose "steht … auf" is one unit, aufstehen, and whose "daß" is an older spelling of dass. */
function adapter(headIndex: (words: string[]) => { head: number; pieces: number[] } | undefined): LanguageAdapter {
  const de = real.get('de');
  return {
    ...de,
    version: 'unit-test',
    analyze: (tokens) => {
      const out = de.analyze(tokens).map((a) => ({ ...a, analyzer: 'adapter-de@unit-test' }));
      const u = headIndex(tokens.map((t) => t.surface));
      tokens.forEach((t, i) => {
        if (u && u.pieces.includes(i)) {
          out[i] = { ...out[i], candidates: [{ lemma: 'aufstehen', pos: 'VERB', morph: {}, confidence: 0.8, unit: { head: u.head, pieces: u.pieces, role: i === u.head ? 'head' : 'separable prefix', display: 'aufstehen' } }] };
        }
        if (t.surface === 'daß') out[i] = { ...out[i], candidates: [{ lemma: 'dass', pos: 'SCONJ', morph: {}, confidence: 0.9, orthography: { modern: 'dass', period: 'de-1901', confidence: 0.95 } }] };
      });
      return out;
    },
  };
}
const registry = (a: LanguageAdapter): AdapterRegistry => ({ get: (l) => (l === 'de' ? a : real.get(l)), all: () => real.all().map((x) => (x.lang === 'de' ? a : x)) });

describe('importer: units written as several words, and older spellings', () => {
  it('stores the unit on every piece by token id, with the head named', async () => {
    const store = createMemoryStore();
    const a = adapter((w) => ({ head: w.indexOf('steht'), pieces: [w.indexOf('steht'), w.indexOf('auf')] }));
    const r = await importDocuments(store, registry(a), [doc('Er steht früh auf.')], { clock });
    expect(r.ok, JSON.stringify(r.documents.map((d) => d.issues))).toBe(true);
    const tokens = await store.tokens.all();
    const steht = tokens.find((t) => t.surface === 'steht')!;
    const auf = tokens.find((t) => t.surface === 'auf')!;
    const [as] = await store.analyses.where('tokenId', steht.id);
    const [ap] = await store.analyses.where('tokenId', auf.id);
    expect(as.unit).toEqual({ headTokenId: steht.id, pieceTokenIds: [steht.id, auf.id], role: 'head', display: 'aufstehen' });
    expect(ap.unit).toEqual({ headTokenId: steht.id, pieceTokenIds: [steht.id, auf.id], role: 'separable prefix', display: 'aufstehen' });
    // every piece carries the unit's lemma
    expect((await store.lemmas.get(as.lemmaId!))?.lemma).toBe('aufstehen');
    expect(ap.lemmaId).toBe(as.lemmaId);
    // a word that is no piece of a unit has no unit
    const er = tokens.find((t) => t.surface === 'Er')!;
    expect((await store.analyses.where('tokenId', er.id))[0]?.unit).toBeUndefined();
  });

  it('stores the relation of an older spelling without changing the text', async () => {
    const store = createMemoryStore();
    const r = await importDocuments(store, registry(adapter(() => undefined)), [doc('Er sagt, daß er kommt.')], { clock });
    expect(r.ok).toBe(true);
    const token = (await store.tokens.all()).find((t) => t.surface === 'daß')!;
    expect(token.surface).toBe('daß');
    const [a] = await store.analyses.where('tokenId', token.id);
    expect(a.orthography).toEqual({ modern: 'dass', period: 'de-1901', confidence: 0.95 });
    expect((await store.sentences.all())[0].text).toBe('Er sagt, daß er kommt.');
  });

  it('a unit that names a token outside the sentence stops the import: nothing is written', async () => {
    const store = createMemoryStore();
    const a = adapter((w) => ({ head: w.indexOf('steht'), pieces: [w.indexOf('steht'), 99] }));
    await expect(importDocuments(store, registry(a), [doc('Er steht früh auf.')], { clock })).rejects.toThrow(/names token 99/);
    expect(await store.texts.count()).toBe(0);
    expect(await store.analyses.count()).toBe(0);
  });
});
