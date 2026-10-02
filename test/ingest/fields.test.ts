import { describe, expect, it } from 'vitest';
import { createMemoryStore, ids, type AdapterRegistry, type AnalyzedToken, type DictionaryEntry, type LanguageAdapter, type RawToken } from '../../src/core';
import { dictionaryCandidates, importDocuments, planDocument, type CorpusDocument } from '../../src/ingest';
import { baseDoc, clock, errorCodes, issuesOf, registry } from './helpers';
import { memoryLexicon } from './book';

const esAdapter = registry.get('es');
const doc = (over: Partial<CorpusDocument> = {}): CorpusDocument => ({ ...baseDoc(), ...over });

describe('document fields: streams, domains, variety', () => {
  it('are validated: arrays of short slugs, and a short variety code', () => {
    expect(errorCodes(doc({ streams: ['library', 'honduras'], domains: ['engineering', 'church-history'], variety: 'es-HN' }))).toEqual([]);
    expect(errorCodes(doc({ variety: 'es-hist' }))).toEqual([]);
    for (const bad of [{ streams: 'library' }, { streams: ['Library'] }, { streams: [1] }, { streams: ['a'.repeat(41)] }, { domains: ['two words'] }, { domains: [''] }, { variety: 'es_HN' }, { variety: 'x'.repeat(25) }, { variety: 3 }]) {
      expect(errorCodes(doc(bad as unknown as Partial<CorpusDocument>)), JSON.stringify(bad)).toEqual(['invalid-value']);
    }
    const issue = issuesOf(doc({ streams: ['Bad Slug'] }))[0];
    expect(issue).toMatchObject({ path: 'streams', code: 'invalid-value' });
    expect(issue.hint).toMatch(/streams/);
  });

  it('are not unknown fields (no warning), and reach the Text; a document without them leaves them absent', async () => {
    expect(issuesOf(doc({ streams: ['acquisition'], domains: ['nutrition'], variety: 'es-HN' }))).toEqual([]);
    const store = createMemoryStore();
    const r = await importDocuments(store, registry, [doc({ streams: ['acquisition', 'honduras'], domains: ['nutrition'], variety: 'es-HN' }), doc({ id: 'plain', source: { ...baseDoc().source, id: 'src:plain' } })], { clock });
    expect(r.ok).toBe(true);
    expect(await store.texts.get('text:es:test-doc')).toMatchObject({ streams: ['acquisition', 'honduras'], domains: ['nutrition'], variety: 'es-HN' });
    const plain = (await store.texts.get('text:es:plain'))!;
    expect(plain.streams).toBeUndefined();
    expect(plain.domains).toBeUndefined();
    expect(plain.variety).toBeUndefined();
  });

  it('changing them is a metadata edit: the text updates, the content version does not move, and the same document again is unchanged', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [doc({ streams: ['library'] })], { clock });
    const again = await importDocuments(store, registry, [doc({ streams: ['library'] })], { clock });
    expect(again.documents[0].action).toBe('unchanged');
    const changed = await importDocuments(store, registry, [doc({ streams: ['library', 'knowledge'], variety: 'es-ES' })], { clock });
    expect(changed.documents[0]).toMatchObject({ action: 'updated', contentVersion: 1 });
    expect(await store.texts.get('text:es:test-doc')).toMatchObject({ streams: ['library', 'knowledge'], variety: 'es-ES', contentVersion: 1 });
  });
});

/** The Spanish adapter with whatever the test needs the adapter to say about a made-up word. */
const withAnalyze = (analyze: (tokens: RawToken[]) => AnalyzedToken[], extra: Partial<LanguageAdapter> = {}): AdapterRegistry => ({
  get: (lang) => (lang === 'es' ? { ...esAdapter, analyze, ...extra } : registry.get(lang)),
  all: () => registry.all(),
});
const FORM = 'zzzxyz'; // not a Spanish word: the adapter cannot analyse it
const oneWord = (): CorpusDocument => doc({ sections: [{ paragraphs: [{ text: 'Zzzxyz.' }] }], english: undefined });

describe('parts and varieties from a candidate reach the stored analysis', () => {
  it('parts (units inside a written word) and varieties are carried as the adapter states them', async () => {
    const parts = [
      { text: 'dec', start: 0, end: 3, lemma: 'decir', pos: 'VERB' as const, morph: { VerbForm: 'Inf' } },
      { text: 'se', start: 3, end: 5, pos: 'PRON' as const, role: 'indirect object pronoun' },
      { text: 'lo', start: 5, end: 7, pos: 'PRON' as const, role: 'direct object pronoun' },
    ];
    const reg = withAnalyze((tokens) => tokens.map((token) => ({
      token, analyzer: 'adapter-es@t',
      candidates: token.isWord ? [{ lemma: 'decir', pos: 'VERB' as const, morph: {}, confidence: 0.8, gloss: 'say', parts, varieties: ['voseo', 'es-HN'] }] : [],
    })));
    const store = createMemoryStore();
    await importDocuments(store, reg, [oneWord()], { clock });
    const [a] = await store.analyses.all();
    expect(a.parts).toEqual(parts);
    expect(a.parts).not.toBe(parts); // a copy: the plan never aliases the adapter's data
    expect(a.varieties).toEqual(['voseo', 'es-HN']);
    expect(a.origin).toBe('hand');
  });

  it('a candidate without them stores neither', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [baseDoc()], { clock });
    for (const a of await store.analyses.all()) { expect(a.parts).toBeUndefined(); expect(a.varieties).toBeUndefined(); }
  });
});

describe('dictionary formOf: the inflected form is analysed as its lemma', () => {
  const inflected: DictionaryEntry = { form: FORM, lang: 'es', pos: 'VERB', glosses: ['first-person singular present indicative of zzzlemma'], formOf: [{ lemma: 'zzzlemma', tags: ['first-person', 'singular', 'present', 'indicative'] }], respelling: 'zzz' };
  const none = withAnalyze((tokens) => tokens.map((token) => ({ token, analyzer: 'adapter-es@t', candidates: [] })));
  const lexicon = (entries: DictionaryEntry[]) => (lang: string) => (lang === 'es' ? memoryLexicon(entries, 'es-dict@1') as never : undefined);

  it('a candidate with lemma = the form-of lemma, morph from the adapter\'s morphFromTags, origin dictionary', () => {
    const tagsSeen: string[][] = [];
    const [c] = dictionaryCandidates(FORM, [inflected], 'es-dict@1', (tags) => { tagsSeen.push([...tags]); return { Person: '1', Number: 'Sing', Tense: 'Pres' }; });
    expect(c).toMatchObject({
      lemma: 'zzzlemma', pos: 'VERB', morph: { Person: '1', Number: 'Sing', Tense: 'Pres' }, origin: 'dictionary', sourceId: 'es-dict@1', confidence: 0.6,
      notes: { formOfTags: ['first-person', 'singular', 'present', 'indicative'], respelling: 'zzz' },
    });
    expect(tagsSeen).toEqual([['first-person', 'singular', 'present', 'indicative']]);
    // without the adapter's help the tags are kept as the source's own words and morph stays empty: never guessed
    expect(dictionaryCandidates(FORM, [inflected])[0].morph).toEqual({});
  });

  it('one candidate per lemma the form belongs to, in order; the readings sit on the first only', () => {
    const two: DictionaryEntry = { ...inflected, formOf: [{ lemma: 'aaa', tags: ['plural'] }, { lemma: 'bbb', tags: ['singular'] }], pronunciations: [{ respelling: 'x' }, { respelling: 'y' }] };
    const cs = dictionaryCandidates(FORM, [two], 'd');
    expect(cs.map((c) => c.lemma)).toEqual(['aaa', 'bbb']);
    expect(cs[0].notes?.readings).toEqual(['x', 'y']);
    expect(cs[1].notes?.readings).toBeUndefined();
    // an entry that is not a form-of keeps its own lemma
    expect(dictionaryCandidates(FORM, [{ form: FORM, lang: 'es', glosses: ['x'] }])[0].lemma).toBe(FORM);
  });

  it('stored for a word only the dictionary knows: lemma row of the lemma, form description kept off the lemma gloss', async () => {
    const reg = withAnalyze(none.get('es').analyze.bind(none.get('es')), { morphFromTags: (tags): Record<string, string> => (tags.includes('first-person') ? { Person: '1' } : {}) });
    const store = createMemoryStore();
    const r = await importDocuments(store, reg, [oneWord()], { clock, lexicon: lexicon([inflected]) });
    expect(r.ok).toBe(true);
    const [a] = await store.analyses.all();
    expect(a).toMatchObject({ origin: 'dictionary', sourceId: 'es-dict@1', analyzer: 'dict:es-dict@1', provenance: 'lexicon', pos: 'VERB', morph: { Person: '1' }, lemmaId: ids.lemma('es', 'zzzlemma', 'VERB') });
    expect(a.notes).toMatchObject({ formOfTags: ['first-person', 'singular', 'present', 'indicative'] });
    // "first-person singular present … of zzzlemma" describes the FORM; it must never become the lemma's gloss
    expect((await store.lemmas.get(ids.lemma('es', 'zzzlemma', 'VERB')))!.gloss).toBeUndefined();
    expect(await store.lemmas.get(ids.lemma('es', FORM, 'VERB'))).toBeUndefined();
  });

  it('beside a word the adapter analyses, a form-of entry changes nothing but the marker when the adapter cannot reorder; and the plan signature follows the dictionary id', async () => {
    const analyze = (tokens: RawToken[]): AnalyzedToken[] => tokens.map((token) => ({ token, analyzer: 'adapter-es@t', candidates: token.isWord ? [{ lemma: 'cosa', pos: 'NOUN' as const, morph: {}, confidence: 1, gloss: 'thing' }] : [] }));
    // an adapter that cannot order readings by context (no `refine`): the entry is never copied onto the token
    const hand = withAnalyze(analyze, { refine: undefined });
    const store = createMemoryStore();
    await importDocuments(store, hand, [oneWord()], { clock, lexicon: lexicon([inflected]) });
    const [a] = await store.analyses.all();
    expect(a).toMatchObject({ lemmaId: ids.lemma('es', 'cosa', 'NOUN'), origin: 'hand' });
    expect(a.alternatives).toBeUndefined();
    expect(a.notes).toMatchObject({ dictionary: 'es-dict@1', respelling: 'zzz', pronunciationSource: 'es-dict@1' });

    // an adapter that can (PLAN10, joined readings): the dictionary's reading of ANOTHER word joins, after the adapter's own and below it
    const refining = withAnalyze(analyze, { refine: (_tokens, analyzed) => analyzed });
    const store2 = createMemoryStore();
    await importDocuments(store2, refining, [oneWord()], { clock, lexicon: lexicon([inflected]) });
    const [b] = await store2.analyses.all();
    expect(b).toMatchObject({ lemmaId: ids.lemma('es', 'cosa', 'NOUN'), origin: 'hand', analyzer: 'adapter-es@t' });
    expect(b.alternatives).toEqual([expect.objectContaining({ lemmaId: ids.lemma('es', 'zzzlemma', 'VERB'), origin: 'dictionary', confidence: 0.45 })]);

    const map = new Map([[FORM, [inflected]]]);
    expect(planDocument(oneWord(), none, { dictionary: map, dictionaryId: 'a' }).signature).not.toBe(planDocument(oneWord(), none, { dictionary: map, dictionaryId: 'b' }).signature);
  });
});
