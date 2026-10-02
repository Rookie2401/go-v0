/**
 * The readings the Spanish adapter makes from the shape of a word alone - a pronoun after a conjugated verb (díjole), a
 * name written with a capital inside the sentence - meet a dictionary in the importer (PLAN10: the dictionary decides
 * what the rules only guess). The real adapter, the real planner, a dictionary of a few entries written for this test.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, DictionaryEntry } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { createMemoryLexiconSource } from '../../src/dict';
import { plainTextToDocuments, planWithDictionary } from '../../src/ingest';
import { CONFIRMED_BY_DICTIONARY, LEMMA_IN_DICTIONARY } from '../../src/ingest/plan';

const registry = createAdapterRegistry();
const DICT_ID = 'kaikki-es@test';

const head = (form: string, pos: DictionaryEntry['pos'], glosses: string[]): DictionaryEntry =>
  ({ form, lang: 'es', pos, glosses, senses: glosses.map((gloss) => ({ gloss })) });

async function readings(text: string, entries: DictionaryEntry[] | undefined): Promise<Map<string, { candidates: AnalysisCandidate[]; analyzer: string }>> {
  const { documents } = plainTextToDocuments(text, { lang: 'es', title: 'Prueba (synthetic)', idPrefix: 'literary-probe', chapters: 'none' });
  const { plans } = await planWithDictionary(documents, registry, entries ? () => createMemoryLexiconSource('es', entries, { id: DICT_ID }) : undefined);
  const out = new Map<string, { candidates: AnalysisCandidate[]; analyzer: string }>();
  for (const s of plans[0].sentences) s.tokens.forEach((t, i) => { if (t.isWord) out.set(t.surface, { candidates: s.analyzed[i].candidates, analyzer: s.analyzed[i].analyzer }); });
  return out;
}

describe('díjole meets the dictionary', () => {
  const TEXT = 'Entonces díjole que no.';

  it('without a dictionary: the adapter\'s reading from the shape, a guess at 0.6 with its parts', async () => {
    const r = (await readings(TEXT, undefined)).get('díjole')!;
    expect(r.candidates[0]).toMatchObject({ lemma: 'decir', pos: 'VERB', unconfirmed: true, confidence: 0.6 });
    expect(r.candidates[0].parts!.map((p) => p.text)).toEqual(['díjo', 'le']);
  });

  it('the dictionary lacks the form but lists the verb: the reading stands, no longer a guess, with its parts', async () => {
    const r = (await readings(TEXT, [head('decir', 'VERB', ['to say', 'to tell'])])).get('díjole')!;
    expect(r.analyzer).toBe(`dict:${DICT_ID}`);
    expect(r.candidates).toHaveLength(1);
    const c = r.candidates[0];
    expect(c).toMatchObject({ lemma: 'decir', pos: 'VERB', confidence: LEMMA_IN_DICTIONARY, origin: 'rule' });
    expect(c.unconfirmed).toBeUndefined();
    expect(c.notes).toMatchObject({ lemmaStatus: 'in the dictionary', enclisis: 'after a conjugated verb' });
    expect(c.parts!.map((p) => p.text)).toEqual(['díjo', 'le']);
    expect(c.gloss).toBeTruthy();
  });

  it('a dictionary that lists the same writing as a word of its own decides: the guess from the shape goes', async () => {
    // "pasela" is not a word; the entry is written for this test. The adapter alone reads pasé + la.
    const alone = (await readings('Vio la pasela ayer.', undefined)).get('pasela')!;
    expect(alone.candidates[0]).toMatchObject({ lemma: 'pasar', unconfirmed: true });
    const r = (await readings('Vio la pasela ayer.', [head('pasela', 'NOUN', ['(an entry written for this test)']), head('pasar', 'VERB', ['to pass'])])).get('pasela')!;
    expect(r.candidates.map((c) => [c.lemma, c.pos, c.origin])).toEqual([['pasela', 'NOUN', 'dictionary']]);
  });
});

describe('a name guessed from its capital meets the dictionary', () => {
  it('the dictionary does not know the word: the guess stays a guess, first', async () => {
    const r = (await readings('La Zurbela salió temprano.', [head('salir', 'VERB', ['to leave'])])).get('Zurbela')!;
    expect(r.candidates[0]).toMatchObject({ lemma: 'Zurbela', pos: 'PROPN', unconfirmed: true, confidence: 0.5 });
  });

  it('the dictionary lists it as a name: both agree, and it is no longer a guess', async () => {
    // as the build files it: under the normalized form, with the writing kept (DictionaryEntry.written)
    const entry: DictionaryEntry = { ...head('zurbela', 'PROPN', ['a village (an entry written for this test)']), written: 'Zurbela' };
    const r = (await readings('La Zurbela salió temprano.', [entry])).get('Zurbela')!;
    // (the lemma is the form the entry is filed under, in lower case: a known limit, docs/spanish/DICTIONARY.md)
    expect(r.candidates[0]).toMatchObject({ lemma: 'zurbela', pos: 'PROPN', origin: 'dictionary', confidence: CONFIRMED_BY_DICTIONARY });
    expect(r.candidates[0].unconfirmed).toBeUndefined();
    expect(r.candidates.some((c) => c.unconfirmed === true)).toBe(false);
  });

  it('the dictionary lists it as an ordinary word: the dictionary\'s reading, not the name', async () => {
    const r = (await readings('Compró una Zurbela nueva.', [head('zurbela', 'NOUN', ['(an entry written for this test)'])])).get('Zurbela')!;
    expect(r.candidates.map((c) => [c.lemma, c.pos])).toEqual([['zurbela', 'NOUN']]);
  });
});
