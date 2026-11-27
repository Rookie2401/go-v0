/**
 * The full French lemma list (src/adapters/french/lexicon-full.ts over the generated lexicon-full-data.ts): nothing answers before the
 * load; after it the counts are in range, 60 spot checks hold, forms and English function words are not lemmas, the load is idempotent,
 * the callback fires once, and the load is fast. Machine-drafted list from Wiktionary (via kaikki.org): a lemma confirms that a word exists.
 */
import { describe, expect, it } from 'vitest';
import {
  frenchLexiconLoaded, frenchLexiconParseCount, frenchLexiconSize, fullFlags, fullGender, fullLemma, fullPosOf, loadFrenchLexicon,
  onFrenchLexiconLoaded, FR_FULL_SOURCE_ID,
} from '../../src/adapters/french/lexicon-full';

describe('full French lemma list', () => {
  it('answers false / undefined before the load', () => {
    expect(frenchLexiconLoaded()).toBe(false);
    expect(fullLemma('cathédrale')).toBe(false);
    expect(fullLemma('cathédrale', 'NOUN')).toBe(false);
    expect(fullGender('cathédrale')).toBeUndefined();
    expect(fullFlags('souvenir', 'VERB')).toBeUndefined();
    expect(fullPosOf('manger')).toEqual([]);
    expect(frenchLexiconSize()).toBe(0);
  });

  it('loads once, shares the load, fires the callback once, and is fast', async () => {
    let fired = 0;
    onFrenchLexiconLoaded(() => { fired++; });
    // vitest's transform of the 1 MB data module is test-runner overhead (a bundled chunk is plain text), so it is timed apart from the parse
    const tm = performance.now();
    await import('../../src/adapters/french/lexicon-full-data');
    console.log(`first import of the data module under vitest: ${(performance.now() - tm).toFixed(0)} ms`);
    const t0 = performance.now();
    const a = loadFrenchLexicon();
    const b = loadFrenchLexicon();
    await Promise.all([a, b]);
    const ms = performance.now() - t0;
    console.log(`load (dynamic import + parse): ${ms.toFixed(0)} ms; keys ${frenchLexiconSize()}`);
    expect(ms).toBeLessThan(500);
    expect(frenchLexiconLoaded()).toBe(true);
    expect(frenchLexiconParseCount()).toBe(1);
    await loadFrenchLexicon();
    expect(frenchLexiconParseCount()).toBe(1);
    expect(fired).toBe(1);
    let late = 0;
    onFrenchLexiconLoaded(() => { late++; });
    expect(late).toBe(1);
    expect(FR_FULL_SOURCE_ID).toBe('kaikki-fr@2026-10-30');
  });

  it('has the expected counts', async () => {
    const mod = await import('../../src/adapters/french/lexicon-full-data');
    const e = mod.FR_FULL_SOURCE.entries;
    console.log('entries', JSON.stringify(e), 'lines', mod.FR_FULL_SOURCE.lines);
    expect(mod.FR_FULL_SOURCE.lines).toBe(404127);
    expect(e.NOUN).toBeGreaterThan(35000); expect(e.NOUN).toBeLessThan(50000);
    expect(e.VERB).toBeGreaterThan(6000); expect(e.VERB).toBeLessThan(10000);
    expect(e.ADJ).toBeGreaterThan(14000); expect(e.ADJ).toBeLessThan(22000);
    expect(e.ADV).toBeGreaterThan(2500); expect(e.ADV).toBeLessThan(4000);
    expect(e.PROPN).toBeGreaterThan(6000); expect(e.PROPN).toBeLessThan(12000);
    expect(e.INTJ).toBeGreaterThan(200); expect(e.INTJ).toBeLessThan(500);
    const lines = mod.FR_FULL.NOUN.split('\n');
    expect(lines.length).toBe(e.NOUN);
    expect(mod.FR_FULL.VERB.split('\n').length).toBe(e.VERB);
  });

  const nouns: Array<[string, 'Masc' | 'Fem' | 'Fem,Masc']> = [
    ['cathédrale', 'Fem'], ['période', 'Fem,Masc' /* the extract has période f (period) and période m (point, locus): the union is kept */], ['départ', 'Masc'], ['accord', 'Masc'], ['stylo', 'Masc'], ['contrôle', 'Masc'],
    ['voie', 'Fem'], ['chercheur', 'Masc'], ['livre', 'Fem,Masc'], ['souvenir', 'Masc'], ['arc-en-ciel', 'Masc'], ['maison', 'Fem'],
    ['cheval', 'Masc'], ['femme', 'Fem'], ['homme', 'Masc'], ['ville', 'Fem'], ['jour', 'Masc'], ['main', 'Fem'], ['football', 'Masc'],
    ['hache', 'Fem'], ['héros', 'Masc'], ['haricot', 'Masc'], ['grand-mère', 'Fem'], ['œil', 'Masc'], ['peur', 'Fem'],
  ];
  it.each(nouns)('noun %s has gender %s', (lemma, g) => {
    expect(fullLemma(lemma, 'NOUN')).toBe(true);
    expect(fullGender(lemma)).toBe(g);
  });

  const others: Array<[string, 'VERB' | 'ADJ' | 'ADV' | 'PROPN' | 'INTJ']> = [
    ['manger', 'VERB'], ['finir', 'VERB'], ['souvenir', 'VERB'], ['aller', 'VERB'], ['être', 'VERB'], ['avoir', 'VERB'], ['évanouir', 'VERB'],
    ['heureux', 'ADJ'], ['beau', 'ADJ'], ['grand', 'ADJ'], ['important', 'ADJ'], ['vieux', 'ADJ'],
    ['lentement', 'ADV'], ['aujourd\'hui', 'ADV'], ['rapidement', 'ADV'], ['bien', 'ADV'],
    ['Paris', 'PROPN'], ['France', 'PROPN'], ['Marie', 'PROPN'], ['bonjour', 'INTJ'], ['hélas', 'INTJ'],
  ];
  it.each(others)('%s is listed as %s', (lemma, pos) => {
    expect(fullLemma(lemma, pos)).toBe(true);
    expect(fullPosOf(lemma)).toContain(pos);
  });

  it('flags and multiple parts of speech', () => {
    expect(fullFlags('souvenir', 'VERB')?.pronominal).toBe(true);
    expect(fullFlags('manger', 'VERB')?.pronominal).toBeUndefined();
    expect(fullFlags('souvenir', 'NOUN')).toEqual({});
    expect(fullPosOf('souvenir')).toEqual(expect.arrayContaining(['NOUN', 'VERB']));
    expect(fullPosOf('manger')).toEqual(expect.arrayContaining(['NOUN', 'VERB']));
    expect(fullFlags('héros', 'NOUN')?.hAspire).toBe(true);
    expect(fullFlags('haricot', 'NOUN')?.hAspire).toBe(true);
    expect(fullFlags('homme', 'NOUN')?.hAspire).toBeUndefined();
    expect(fullFlags('cathédrale', 'ADV')).toBeUndefined();
    expect(fullFlags('Paris', 'PROPN')).toBeDefined();
  });

  it('compares by normalizeFr: case, apostrophe and hyphen variants', () => {
    expect(fullLemma('Cathédrale', 'NOUN')).toBe(true);
    expect(fullLemma('paris', 'PROPN')).toBe(true);
    expect(fullLemma('aujourd’hui', 'ADV')).toBe(true);
    expect(fullLemma('arc‐en‐ciel', 'NOUN')).toBe(true);
    expect(fullLemma('cathédrale', 'VERB')).toBe(false);
    expect(fullLemma('cathédrale')).toBe(true);
  });

  it('does not list inflected forms, the wrong part of speech, or English function words', () => {
    for (const w of ['chevaux', 'mangeons', 'belles', 'mangé', 'finissons', 'cathédraler', 'zzzxq']) expect(fullLemma(w, w === 'cathédraler' ? 'VERB' : undefined)).toBe(false);
    for (const w of ['the', 'and', 'with', 'of', 'is']) expect(fullLemma(w)).toBe(false);
  });
});
