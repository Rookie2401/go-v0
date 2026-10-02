/**
 * Capitals: the dictionary files every headword under its normalized form, and keeps the source's own spelling beside it
 * (`DictionaryEntry.written`). An entry written with capitals is a reading only of a word written that way: the acronym
 * PA is not a reading of "pa", the name Rosa not of "una rosa". A FAKE adapter (the Spanish adapter with its `analyze`
 * replaced and every optional method off unless a test supplies one) and an in-memory dictionary stand in.
 */
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore, ids, type AdapterRegistry, type AnalysisCandidate, type AnalyzedToken, type DictionaryEntry, type LanguageAdapter } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { createMemoryLexiconSource, mapKaikkiLine } from '../../src/dict';
import { collectWordForms, importDocuments, loadBundledCorpus, planDocument, planWithDictionary, type CorpusDocument } from '../../src/ingest';
import { entryAppliesTo, writtenCase } from '../../src/ingest/plan';
import { fixtureLines, thNormalize } from '../dict/helpers';
import { baseDoc, clock } from './helpers';

const real = createAdapterRegistry();
const esReal = real.get('es');
const FAKE = 'adapter-es@fake';

const entry = (form: string, over: Partial<DictionaryEntry> = {}): DictionaryEntry => ({ form, lang: 'es', glosses: [], ...over });
const hand = (lemma: string, pos: AnalysisCandidate['pos'], over: Partial<AnalysisCandidate> = {}): AnalysisCandidate => ({ lemma, pos, morph: {}, confidence: 1, ...over });
const guess = (lemma: string, pos: AnalysisCandidate['pos']): AnalysisCandidate => ({ lemma, pos, morph: {}, confidence: 0.5, origin: 'rule', unconfirmed: true, notes: { source: 'rule' } });
const keep: NonNullable<LanguageAdapter['refine']> = (_tokens, analyzed) => analyzed;

function fake(table: Record<string, AnalysisCandidate[]>, over: Partial<LanguageAdapter> = {}): AdapterRegistry {
  const adapter: LanguageAdapter = {
    ...esReal, version: 'fake', refine: undefined, lemmaVariants: undefined, varietiesFromTags: undefined, morphFromTags: undefined,
    analyze: (tokens): AnalyzedToken[] => tokens.map((token) => ({
      token, analyzer: FAKE,
      candidates: token.isWord ? (table[token.normalized] ?? []).map((c) => ({ ...c, morph: { ...c.morph }, ...(c.notes ? { notes: { ...c.notes } } : {}) })) : [],
    })),
    ...over,
  };
  return { get: (lang) => (lang === 'es' ? adapter : real.get(lang)), all: () => real.all() };
}
const docOf = (...sentences: string[]): CorpusDocument => ({ ...baseDoc(), sections: [{ paragraphs: [{ sentences: sentences.map((text) => ({ text })) }] }] });
const dictOf = (...entries: DictionaryEntry[]): Map<string, DictionaryEntry[]> => {
  const m = new Map<string, DictionaryEntry[]>();
  for (const e of entries) m.set(e.form, [...(m.get(e.form) ?? []), e]);
  return m;
};
const wordsOf = (plan: ReturnType<typeof planDocument>, sentence = 0) => plan.sentences[sentence].analyzed.filter((a) => a.token.isWord);
const readings = (a: AnalyzedToken) => a.candidates.map((c) => [c.lemma, c.pos, c.origin ?? 'adapter']);

// the acronym and the word share a form; so do the name and the flower
const PA = entry('pa', { written: 'PA', pos: 'NOUN', glosses: ['abbreviation of presión arterial'], altOf: ['presión arterial'], senses: [{ gloss: 'abbreviation of presión arterial', tags: ['abbreviation', 'alt-of'] }] });
const PA_WORD = entry('pa', { pos: 'ADP', glosses: ['apocopic form of para'], altOf: ['para'], senses: [{ gloss: 'apocopic form of para', tags: ['alt-of', 'apocopic', 'colloquial'] }] });
const PARA = entry('para', { pos: 'ADP', glosses: ['for', 'to'] });
const ROSA_NAME = entry('rosa', { written: 'Rosa', pos: 'PROPN', glosses: ['a female given name'] });
const ROSA = entry('rosa', { pos: 'NOUN', glosses: ['rose'] });

describe('entryAppliesTo: is this entry a reading of a word written like that?', () => {
  const applies = (written: string | undefined, surface: string) => entryAppliesTo(surface, written === undefined ? {} : { written });
  const table: Array<[written: string | undefined, surface: string, applies: boolean, why: string]> = [
    ['PA', 'pa', false, 'an all-capitals word is not a reading of the small word'],
    ['PA', 'PA', true, 'the same spelling'],
    ['PA', 'Pa', false, 'a sentence-initial "Pa" is the small word with a capital, not the initialism'],
    [undefined, 'pa', true, 'an entry written as its form applies to any word'],
    [undefined, 'PA', true, ''],
    [undefined, 'Pa', true, ''],
    ['ESO', 'eso', false, ''],
    ['ESO', 'Eso', false, ''],
    ['ESO', 'ESO', true, ''],
    ['TVE', 'tve', false, ''],
    ['EE. UU.', 'EE. UU.', true, ''],
    ['EE. UU.', 'ee. uu.', false, ''],
    ['McDonald', 'Mcdonald', false, 'two capitals: only the same spelling …'],
    ['McDonald', 'McDonald', true, ''],
    ['McDonald', 'MCDONALD', true, '… or a word all in capitals'],
    ['Rosa', 'rosa', false, 'a capitalised word is not a reading of the small word'],
    ['Rosa', 'Rosa', true, 'also when it only opens a sentence: the adapter then has both readings to choose from'],
    ['Rosa', 'ROSA', true, 'a headline'],
    ['Marte', 'marte', false, ''],
    ['Dios', 'Dios', true, ''],
    ['Sr.', 'sr.', false, ''],
    ['Sr.', 'Sr.', true, ''],
    ['iPhone', 'iphone', true, 'a small letter first: no rule'],
    ['pH', 'ph', true, ''],
    ['café', 'café', true, 'no capital at all: any word'],
    ['Café', 'Café', true, 'spellings are compared in NFC'],
    ['É', 'é', false, 'a capital with an accent is a capital'],
    ['É', 'É', true, ''],
    ['ขนม', 'ขนม', true, 'a script without capitals'],
  ];
  it.each(table)('written %j, token %j: %s (%s)', (written, surface, want) => {
    expect(applies(written, surface)).toBe(want);
  });

  it('an all-capitals token (a headline) takes every entry of its form', () => {
    for (const written of ['PA', 'Pa', undefined]) expect(applies(written, 'PA')).toBe(true);
    for (const written of ['ROSA', 'Rosa', undefined]) expect(applies(written, 'ROSA')).toBe(true);
  });

  it('writtenCase names the three cases', () => {
    expect(['PA', 'ESO', 'EE. UU.', 'McDonald', 'DNI', 'ÑU'].map(writtenCase)).toEqual(Array(6).fill('capitals'));
    expect(['Rosa', 'Marte', 'Dios', 'Sr.', 'Ñ', 'A'].map(writtenCase)).toEqual(Array(6).fill('capitalised'));
    expect(['rosa', 'iPhone', 'pH', 'iOS', 'ขนม', '1.º', ''].map(writtenCase)).toEqual(Array(7).fill('any'));
  });
});

describe('a word the adapter cannot read is explained only by entries written the way it is', () => {
  it('"pa" is the preposition, never the initialism PA; "PA" is both; a sentence-initial "Pa" is the preposition', () => {
    const dictionary = dictOf(PA, PA_WORD, PARA);
    const plan = planDocument(docOf('Me voy pa mi casa.', 'La PA es alta.', 'Pa mi casa.'), fake({}), { dictionary, dictionaryId: 'd1' });
    const pa = wordsOf(plan, 0).find((a) => a.token.surface === 'pa')!;
    expect(pa.analyzer).toBe('dict:d1');
    expect(pa.candidates.map((c) => [c.lemma, c.pos, c.gloss])).toEqual([['para', 'ADP', 'for; to']]);
    const upper = wordsOf(plan, 1).find((a) => a.token.surface === 'PA')!;
    expect(upper.candidates.map((c) => [c.lemma, c.pos])).toEqual([['presión arterial', 'NOUN'], ['para', 'ADP']]);
    const initial = wordsOf(plan, 2).find((a) => a.token.surface === 'Pa')!;
    expect(initial.candidates.map((c) => [c.lemma, c.pos])).toEqual([['para', 'ADP']]);
  });

  it('with only the capital entry the small word stays unknown (and is not counted as analysed)', () => {
    const plan = planDocument(docOf('Voy pa casa'), fake({}), { dictionary: dictOf(PA), dictionaryId: 'd1' });
    const pa = wordsOf(plan).find((a) => a.token.surface === 'pa')!;
    expect(pa.candidates).toEqual([]);
    expect(pa.analyzer).toBe(FAKE);
    expect(plan.dictionary).toMatchObject({ tokens: 0 });
    expect(plan.coverage.unanalysed).toContain('pa');
  });

  it('a guessed word is decided only by entries written the way it is; with none, its guesses stay', () => {
    const table = { rosa: [guess('rosar', 'VERB'), guess('rosa', 'NOUN')] };
    const lower = wordsOf(planDocument(docOf('una rosa'), fake(table), { dictionary: dictOf(ROSA_NAME), dictionaryId: 'd1' })).find((a) => a.token.surface === 'rosa')!;
    expect(lower.analyzer).toBe(FAKE);
    expect(lower.candidates.every((c) => c.unconfirmed === true)).toBe(true);
    const both = wordsOf(planDocument(docOf('una rosa'), fake(table), { dictionary: dictOf(ROSA_NAME, ROSA), dictionaryId: 'd1' })).find((a) => a.token.surface === 'rosa')!;
    expect(both.candidates.map((c) => [c.lemma, c.pos, c.confidence])).toEqual([['rosa', 'NOUN', 0.7]]); // the flower alone, one part of speech
    const name = wordsOf(planDocument(docOf('con Rosa'), fake(table), { dictionary: dictOf(ROSA_NAME, ROSA), dictionaryId: 'd1' })).find((a) => a.token.surface === 'Rosa')!;
    expect(name.candidates.map((c) => [c.lemma, c.pos])).toEqual([['rosa', 'PROPN'], ['rosa', 'NOUN']]);
  });
});

describe('a word the adapter reads: a capital entry joins and marks only a word written that way', () => {
  const table = { rosa: [hand('rosa', 'NOUN')], la: [hand('la', 'DET')], con: [hand('con', 'ADP')] };

  it('nothing joins "rosa" and it is not even marked; the name joins "Rosa"', () => {
    const refine = vi.fn(keep);
    const plan = planDocument(docOf('la rosa', 'con Rosa'), fake(table, { refine }), { dictionary: dictOf(ROSA_NAME), dictionaryId: 'd1' });
    const flower = wordsOf(plan, 0).find((a) => a.token.surface === 'rosa')!;
    expect(readings(flower)).toEqual([['rosa', 'NOUN', 'adapter']]);
    expect(flower.candidates[0].notes).toBeUndefined(); // the dictionary has nothing for a word written like this
    const name = wordsOf(plan, 1).find((a) => a.token.surface === 'Rosa')!;
    expect(readings(name)).toEqual([['rosa', 'NOUN', 'adapter'], ['rosa', 'PROPN', 'dictionary']]);
    expect(name.candidates[0].notes).toEqual({ dictionary: 'd1' });
    expect(plan.dictionary).toMatchObject({ joined: 1, alongside: 1 });
    expect(refine).toHaveBeenCalledTimes(1); // only the sentence with the name
  });

  it('a sentence-initial capital gets both the name and the common word; a headline word too', () => {
    const plan = planDocument(docOf('Rosa es una flor', 'LA ROSA'), fake(table, { refine: keep }), { dictionary: dictOf(ROSA_NAME, ROSA), dictionaryId: 'd1' });
    for (const a of [wordsOf(plan, 0)[0], wordsOf(plan, 1)[1]]) expect(readings(a)).toEqual([['rosa', 'NOUN', 'adapter'], ['rosa', 'PROPN', 'dictionary']]);
  });

  it('the pronunciation and readings of the marker come only from entries that apply', () => {
    const acronym = entry('pa', { written: 'PA', pos: 'NOUN', glosses: ['x'], ipa: '/pe.a/' });
    const word = entry('pa', { pos: 'ADV', glosses: ['y'], ipa: '/pa/' });
    const plan = planDocument(docOf('pa PA'), fake({ pa: [hand('pa', 'ADP')] }), { dictionary: dictOf(acronym, word), dictionaryId: 'd1' });
    const [lower, upper] = wordsOf(plan);
    expect(lower.candidates[0].notes).toEqual({ ipa: '/pa/', pronunciationSource: 'd1', dictionary: 'd1' });
    expect(upper.candidates[0].notes).toEqual({ ipa: '/pe.a/', pronunciationSource: 'd1', readings: ['/pe.a/', '/pa/'], dictionary: 'd1' });
  });
});

describe('a lemma\'s gloss is never taken from an entry written with a capital the lemma does not have', () => {
  it('an inflected form: "rosas" of rosa is not glossed from the name Rosa; "Rosas" of Rosa is', () => {
    const rosas = entry('rosas', { pos: 'NOUN', formOf: [{ lemma: 'rosa', tags: ['plural'] }] });
    const nameAsNoun = entry('rosa', { written: 'Rosa', pos: 'NOUN', glosses: ['a surname'] });
    const only = wordsOf(planDocument(docOf('las rosas'), fake({}), { dictionary: dictOf(rosas, nameAsNoun), dictionaryId: 'd1' })).find((a) => a.token.surface === 'rosas')!;
    expect(only.candidates.map((c) => [c.lemma, c.gloss, c.notes?.glossFrom])).toEqual([['rosa', undefined, undefined]]);
    const withWord = wordsOf(planDocument(docOf('las rosas'), fake({}), { dictionary: dictOf(rosas, nameAsNoun, ROSA), dictionaryId: 'd1' })).find((a) => a.token.surface === 'rosas')!;
    expect(withWord.candidates.map((c) => [c.lemma, c.gloss])).toEqual([['rosa', 'rose']]);
    // the plural of the name is written with the capital in the source: its lemma is the name
    const plural = entry('rosas', { written: 'Rosas', pos: 'NOUN', formOf: [{ lemma: 'rosa', tags: ['plural'] }] });
    const names = wordsOf(planDocument(docOf('las Rosas'), fake({}), { dictionary: dictOf(plural, nameAsNoun), dictionaryId: 'd1' })).find((a) => a.token.surface === 'Rosas')!;
    expect(names.candidates.map((c) => [c.lemma, c.gloss, c.notes?.glossFrom])).toEqual([['rosa', 'a surname', 'lemma']]);
  });

  it('a guess whose form the dictionary lacks: the lemma as the adapter writes it decides', () => {
    const marte = entry('marte', { written: 'Marte', pos: 'NOUN', glosses: ['Mars'] });
    const small = planDocument(docOf('martes'), fake({ martes: [guess('marte', 'NOUN')] }), { dictionary: dictOf(marte), dictionaryId: 'd1' });
    expect(wordsOf(small)[0].candidates[0]).toMatchObject({ lemma: 'marte', unconfirmed: true });
    expect(small.dictionary).toMatchObject({ lemmaOnly: 0 });
    const capital = planDocument(docOf('martes'), fake({ martes: [guess('Marte', 'NOUN')] }), { dictionary: dictOf(marte), dictionaryId: 'd1' });
    expect(wordsOf(capital)[0].candidates[0]).toMatchObject({ lemma: 'Marte', gloss: 'Mars', notes: { lemmaStatus: 'in the dictionary' } });
    expect(capital.dictionary).toMatchObject({ lemmaOnly: 1 });
  });

  it('a guessed unit, and a headword the adapter names as a variant, follow the same rule', () => {
    const unit = { head: 0, pieces: [0], role: 'head', display: 'marte' };
    const marte = entry('marte', { written: 'Marte', pos: 'VERB', glosses: ['Mars'] });
    const table = { va: [hand('ir', 'VERB'), { ...guess('marte', 'VERB'), unit }] };
    const plan = planDocument(docOf('va'), fake(table), { dictionary: dictOf(marte), dictionaryId: 'd1' });
    expect(wordsOf(plan)[0].candidates.map((c) => c.lemma)).toEqual(['ir']); // the unit's lemma is not listed as written: the guess goes
    const variant = planDocument(docOf('martes'), fake({ martes: [guess('mart', 'VERB')] }, { lemmaVariants: () => ['marte'] }), { dictionary: dictOf(marte), dictionaryId: 'd1' });
    expect(wordsOf(variant)[0].candidates[0].unconfirmed).toBe(true);
    const capitalVariant = planDocument(docOf('martes'), fake({ martes: [guess('mart', 'VERB')] }, { lemmaVariants: () => ['Marte'] }), { dictionary: dictOf(marte), dictionaryId: 'd1' });
    expect(wordsOf(capitalVariant)[0].candidates[0]).toMatchObject({ lemma: 'mart', gloss: 'Mars', notes: { lemmaEntry: 'Marte' } });
  });

  it('the import: the lemma row of the small word never gets the capital entry\'s gloss', async () => {
    const store = createMemoryStore();
    const src = createMemoryLexiconSource('es', [entry('rosas', { pos: 'NOUN', formOf: [{ lemma: 'rosa', tags: ['plural'] }] }), entry('rosa', { written: 'Rosa', pos: 'NOUN', glosses: ['a surname'] })], { id: 'd1' });
    await importDocuments(store, fake({}), [docOf('las rosas')], { clock, lexicon: (lang) => (lang === 'es' ? src : undefined) });
    const lemma = await store.lemmas.get(ids.lemma('es', 'rosa', 'NOUN'));
    expect(lemma).toBeDefined();
    expect(lemma!.gloss).toBeUndefined();
  });
});

describe('lookups', () => {
  it('a guess whose only entries are written another way still has its lemma asked for in the second round', async () => {
    const lemma = entry('pasar', { pos: 'VERB', glosses: ['to pass'] });
    const src = createMemoryLexiconSource('es', [PA, lemma], { id: 'd1' });
    const lookup = vi.spyOn(src, 'lookup');
    const { plans } = await planWithDictionary([docOf('pa')], fake({ pa: [guess('pasar', 'VERB')] }), (lang) => (lang === 'es' ? src : undefined));
    expect(lookup.mock.calls.map((c) => c[0])).toEqual([['pa'], ['presión arterial', 'pasar']]);
    expect(wordsOf(plans[0])[0].candidates[0]).toMatchObject({ lemma: 'pasar', gloss: 'to pass', origin: 'rule' });
    expect(plans[0].dictionary).toMatchObject({ lemmaOnly: 1, decided: 0 });
  });
});

describe('a script without capitals: nothing changes', () => {
  const docs = loadBundledCorpus().filter((d) => d.lang === 'th');

  it('no Thai fixture entry carries a spelling of its own', () => {
    const parsed = (l: string): unknown => { try { return JSON.parse(l); } catch { return undefined; } }; // the fixture has bad lines on purpose
    const entries = fixtureLines().map((l) => mapKaikkiLine(parsed(l), thNormalize, 'th').entry).filter((e): e is DictionaryEntry => e !== undefined);
    expect(entries.length).toBeGreaterThan(20);
    expect(entries.filter((e) => e.written !== undefined)).toEqual([]);
  });

  it('the bundled Thai documents plan the same whether or not the entries carry a (caseless) spelling of their own', () => {
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      const plain = [...collectWordForms(doc, real)].map((f): [string, DictionaryEntry[]] => [f, [{ form: f, lang: 'th', pos: 'NOUN', glosses: ['a meaning'] }]]);
      const spelt = plain.map(([f, list]): [string, DictionaryEntry[]] => [f, list.map((e) => ({ ...e, written: `${f}​` }))]);
      const a = planDocument(doc, real, { dictionary: new Map(plain), dictionaryId: 'd1' });
      const b = planDocument(doc, real, { dictionary: new Map(spelt), dictionaryId: 'd1' });
      expect(b.signature).toBe(a.signature);
      expect(b.sentences.map((s) => s.analyzed)).toEqual(a.sentences.map((s) => s.analyzed));
      expect(b.dictionary).toEqual(a.dictionary);
      expect(a.dictionary!.tokens + a.dictionary!.alongside).toBeGreaterThan(0);
    }
  });
});
