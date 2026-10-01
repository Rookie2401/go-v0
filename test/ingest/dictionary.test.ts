import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore, ids, type AdapterRegistry, type DictionaryEntry, type LexiconSource } from '../../src/core';
import { dictionaryCandidates, importDocuments, planDocument, type CorpusDocument } from '../../src/ingest';
import { clock, countWrites } from './helpers';
// the bare Thai adapter knows exactly one word (ฉัน), so these tests do not depend on how large the real lexicon is
import { CAT, SCHOOL, bareAdapter as thAdapter, bareRegistry as registry, bookDoc, lexiconOf, memoryLexicon, unknownWords } from './book';

const entry = (form: string, over: Partial<DictionaryEntry> = {}): DictionaryEntry => ({ form, lang: 'th', glosses: ['x'], ...over });

// ฉัน is in the (bare) adapter's own lexicon; ไป and โรงเรียน are not
const [GO, SCHOOL_WORD] = (() => { const t = thAdapter.tokenize(SCHOOL); return [t[1].normalized, t[2].normalized]; })();
const I_WORD = thAdapter.tokenize(SCHOOL)[0].normalized;

const ENTRIES: DictionaryEntry[] = [
  entry(SCHOOL_WORD, {
    pos: 'NOUN', glosses: ['school', 'educational institution', 'schoolhouse', 'academy'], respelling: 'rohng-rian', ipa: 'roːŋ˧ riːan˧', romanization: 'rong rian',
    register: ['standard'], classifiers: ['แห่ง'], role: 'place', definition: 'a place where pupils learn',
  }),
  entry(GO, { pos: 'VERB', glosses: ['go', 'leave'] }),
  entry(GO, { pos: 'ADV', glosses: ['away'] }),
  entry(I_WORD, { pos: 'NOUN', glosses: ['DICTIONARY MEANING THAT MUST LOSE'] }), // the adapter already analyses this word
];

const analysesOf = async (store: ReturnType<typeof createMemoryStore>, surface: string) => {
  const token = (await store.tokens.all()).find((t) => t.surface === surface)!;
  return (await store.analyses.where('tokenId', token.id)).sort((a, b) => a.id.localeCompare(b.id));
};
const tools = async (store: ReturnType<typeof createMemoryStore>) => (await store.texts.get('text:th:book-ch01'))!.transformations.map((t) => t.tool);

describe('the test premise', () => {
  it('the test adapter knows ฉัน and says nothing about the other words', () => {
    expect(unknownWords(SCHOOL)).toEqual([GO, SCHOOL_WORD]);
    expect(thAdapter.analyze(thAdapter.tokenize(SCHOOL))[0].candidates.length).toBeGreaterThan(0);
  });
});

describe('dictionaryCandidates', () => {
  it('maps an entry to a candidate: first two glosses joined, the rest as senses, pronunciation and classifiers in notes', () => {
    const [c] = dictionaryCandidates(SCHOOL_WORD, [ENTRIES[0]]);
    expect(c).toEqual({
      lemma: SCHOOL_WORD, pos: 'NOUN', morph: {}, confidence: 0.6, gloss: 'school; educational institution',
      register: ['standard'], role: 'place', definition: 'a place where pupils learn',
      notes: { respelling: 'rohng-rian', ipa: 'roːŋ˧ riːan˧', romanization: 'rong rian', senses: ['schoolhouse', 'academy'], classifiers: ['แห่ง'] },
    });
  });

  it('confidence is 0.6 for one part of speech and 0.45 for several; entry order is kept', () => {
    expect(dictionaryCandidates(GO, [ENTRIES[1]]).map((c) => c.confidence)).toEqual([0.6]);
    expect(dictionaryCandidates(GO, [ENTRIES[1], entry(GO, { pos: 'VERB', glosses: ['again'] })]).map((c) => c.confidence)).toEqual([0.6, 0.6]);
    const many = dictionaryCandidates(GO, [ENTRIES[1], ENTRIES[2]]);
    expect(many.map((c) => [c.pos, c.confidence, c.gloss])).toEqual([['VERB', 0.45, 'go; leave'], ['ADV', 0.45, 'away']]);
  });

  it('adds only what the entry has (no gloss, no notes, nothing invented)', () => {
    expect(dictionaryCandidates(GO, [entry(GO, { glosses: [] })])).toEqual([{ lemma: GO, pos: undefined, morph: {}, confidence: 0.6 }]);
    const [one] = dictionaryCandidates(GO, [entry(GO, { glosses: ['a', 'b'] })]);
    expect(one.notes).toBeUndefined();
  });
});

describe('planDocument with a dictionary (pure, synchronous)', () => {
  const dictionary = new Map<string, DictionaryEntry[]>([[SCHOOL_WORD, [ENTRIES[0]]], [GO, [ENTRIES[1], ENTRIES[2]]], [I_WORD, [ENTRIES[3]]]]);

  it('fills only the words the adapter cannot analyse', () => {
    const plain = planDocument(bookDoc(), registry);
    const plan = planDocument(bookDoc(), registry, { dictionary, dictionaryId: 'd1' });
    expect(plain.dictionary).toBeUndefined();
    expect(plan.dictionary).toEqual({ tool: 'dict:d1', tokens: 2 });
    const [i, go, school] = plan.sentences[0].analyzed;
    expect(i).toEqual(plain.sentences[0].analyzed[0]); // adapter lexicon wins
    expect(go.analyzer).toBe('dict:d1');
    expect(go.candidates.map((c) => c.pos)).toEqual(['VERB', 'ADV']);
    expect(school.analyzer).toBe('dict:d1');
    expect(plan.coverage.coverage).toBeGreaterThan(plain.coverage.coverage);
    expect(plan.sentences[1].analyzed.every((a) => a.analyzer.startsWith('adapter-'))).toBe(true); // nothing in the dictionary for the cat sentence
  });

  it('the signature includes the dictionary id', () => {
    const none = planDocument(bookDoc(), registry).signature;
    const d1 = planDocument(bookDoc(), registry, { dictionary, dictionaryId: 'd1' }).signature;
    const d2 = planDocument(bookDoc(), registry, { dictionary, dictionaryId: 'd2' }).signature;
    const empty = planDocument(bookDoc(), registry, { dictionary: new Map(), dictionaryId: 'd1' }).signature;
    expect(new Set([none, d1, d2, empty]).size).toBe(4);
    expect(planDocument(bookDoc(), registry, { dictionary, dictionaryId: 'd1' }).signature).toBe(d1);
  });
});

describe('importDocuments with ImportOptions.lexicon', () => {
  it('stores dictionary analyses: lexicon provenance, analyzer dict:<id>, uncertain, with register / role / definition and no syllables', async () => {
    const store = createMemoryStore();
    const r = await importDocuments(store, registry, [bookDoc()], { clock, lexicon: lexiconOf(memoryLexicon(ENTRIES, 'kaikki-th@test')) });
    expect(r.ok).toBe(true);

    const [school] = await analysesOf(store, SCHOOL_WORD);
    expect(school).toMatchObject({
      provenance: 'lexicon', analyzer: 'dict:kaikki-th@test', confidence: 0.6, pos: 'NOUN', lemmaId: ids.lemma('th', SCHOOL_WORD, 'NOUN'),
      register: ['standard'], role: 'place', definition: 'a place where pupils learn',
      notes: { respelling: 'rohng-rian', ipa: 'roːŋ˧ riːan˧', romanization: 'rong rian', senses: ['schoolhouse', 'academy'], classifiers: ['แห่ง'] },
    });
    expect(school.syllables).toBeUndefined();
    expect((await store.lemmas.get(ids.lemma('th', SCHOOL_WORD, 'NOUN')))!.gloss).toBe('school; educational institution');

    const [go] = await analysesOf(store, GO);
    expect(go).toMatchObject({ pos: 'VERB', confidence: 0.45, provenance: 'lexicon', analyzer: 'dict:kaikki-th@test' });
    expect(go.alternatives).toEqual([{ lemmaId: ids.lemma('th', GO, 'ADV'), pos: 'ADV', morph: {}, confidence: 0.45 }]);

    for (const a of await store.analyses.all()) expect(a.syllables).toBeUndefined();
  });

  it('the adapter lexicon wins over the dictionary for a word both know', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [bookDoc()], { clock, lexicon: lexiconOf(memoryLexicon(ENTRIES, 'd1')) });
    const rows = await analysesOf(store, I_WORD);
    expect(rows).toHaveLength(1);
    expect(rows[0].analyzer.startsWith('adapter-th@')).toBe(true);
    expect((await store.lemmas.all()).some((l) => l.gloss?.includes('MUST LOSE'))).toBe(false);
  });

  it('an author span and a human correction win over the dictionary', async () => {
    const store = createMemoryStore();
    const doc: CorpusDocument = {
      ...bookDoc(),
      sections: [{ paragraphs: [{ sentences: [{
        id: 'a', text: SCHOOL,
        spans: [{ start: 3, end: 5, lemma: GO, pos: 'VERB', gloss: 'go (here)' }],
        corrections: [{ start: 5, end: 13, lemma: SCHOOL_WORD, pos: 'NOUN', gloss: 'school (here)', by: 'Khun Somchai', at: '2026-02-01' }],
      }] }] }],
    };
    await importDocuments(store, registry, [doc], { clock, lexicon: lexiconOf(memoryLexicon(ENTRIES, 'd1')) });
    const go = await analysesOf(store, GO);
    expect(go.map((a) => a.analyzer)).toEqual(['import@2']); // the span replaced the dictionary analysis
    expect(go[0].confidence).toBe(1);
    const school = await analysesOf(store, SCHOOL_WORD);
    const human = school.find((a) => a.provenance === 'human')!;
    const dict = school.find((a) => a.analyzer === 'dict:d1')!;
    expect(human.supersedes).toBe(dict.id); // the correction supersedes the dictionary row (which stays as history)
  });

  it('the report coverage reflects the dictionary; lookups ask once per document for unknown forms only', async () => {
    const without = await importDocuments(createMemoryStore(), registry, [bookDoc()], { clock });
    const src = memoryLexicon(ENTRIES, 'd1');
    const lookup = vi.spyOn(src, 'lookup');
    const withDict = await importDocuments(createMemoryStore(), registry, [bookDoc()], { clock, lexicon: lexiconOf(src) });
    expect(withDict.documents[0].analysisCoverage.coverage).toBeGreaterThan(without.documents[0].analysisCoverage.coverage);
    expect(withDict.documents[0].analysisCoverage.analysed).toBe(without.documents[0].analysisCoverage.analysed + 2);
    expect(lookup).toHaveBeenCalledTimes(1);
    const asked = lookup.mock.calls[0][0] as string[];
    expect(asked).not.toContain(I_WORD); // known to the adapter: never looked up
    expect(asked).toEqual(expect.arrayContaining([GO, SCHOOL_WORD]));
    expect(asked).toEqual(unknownWords(SCHOOL).concat(unknownWords(CAT)).filter((f, i, all) => all.indexOf(f) === i));
  });

  it('installing, changing and removing a dictionary re-analyses on the next import; the same dictionary is a no-op', async () => {
    const store = createMemoryStore();
    const first = await importDocuments(store, registry, [bookDoc()], { clock });
    const plainRows = (await store.analyses.all()).length;
    expect(first.documents[0].action).toBe('created');

    const d1 = lexiconOf(memoryLexicon(ENTRIES, 'd1'));
    const installed = await importDocuments(store, registry, [bookDoc()], { clock, lexicon: d1 });
    expect(installed.documents[0]).toMatchObject({ action: 'updated', contentVersion: 1, sentencesAdded: 0, sentencesRetired: 0 });
    expect((await store.analyses.all()).filter((a) => a.analyzer === 'dict:d1').length).toBeGreaterThan(0);
    expect((await store.analyses.all()).length).toBeGreaterThan(plainRows);

    const w = countWrites(store);
    const same = await importDocuments(store, registry, [bookDoc()], { clock, lexicon: d1 });
    expect(same.documents[0].action).toBe('unchanged');
    expect(w.count()).toBe(0);

    const changed = await importDocuments(store, registry, [bookDoc()], { clock, lexicon: lexiconOf(memoryLexicon(ENTRIES, 'd2')) });
    expect(changed.documents[0].action).toBe('updated');
    const analyzers = new Set((await store.analyses.all()).map((a) => a.analyzer));
    expect(analyzers.has('dict:d2')).toBe(true);
    expect(analyzers.has('dict:d1')).toBe(false); // the old dictionary's analyses were replaced

    const removed = await importDocuments(store, registry, [bookDoc()], { clock, lexicon: lexiconOf(undefined) });
    expect(removed.documents[0].action).toBe('updated');
    expect([...new Set((await store.analyses.all()).map((a) => a.analyzer))].some((a) => a.startsWith('dict:'))).toBe(false);
    expect((await store.analyses.all()).length).toBe(plainRows);
    expect((await store.texts.get('text:th:book-ch01'))!.contentVersion).toBe(1);

    const log = await tools(store);
    expect(log.filter((t) => t.startsWith('dict:'))).toEqual(['dict:d1', 'dict:d2', 'dict:none']);
    // and nothing changes once it has settled
    const w2 = countWrites(store);
    expect((await importDocuments(store, registry, [bookDoc()], { clock })).documents[0].action).toBe('unchanged');
    expect(w2.count()).toBe(0);
  });

  it('a language without an installed dictionary imports exactly as before', async () => {
    const a = createMemoryStore();
    const b = createMemoryStore();
    await importDocuments(a, registry, [bookDoc()], { clock });
    const noInfo: LexiconSource = { lang: 'th', info: async () => undefined, lookup: async () => { throw new Error('must not be called'); } };
    await importDocuments(b, registry, [bookDoc()], { clock, lexicon: lexiconOf(noInfo) });
    expect(await b.analyses.all()).toEqual(await a.analyses.all());
    expect(await b.texts.all()).toEqual(await a.texts.all());
  });

  it('a dictionary that cannot be read does not block the import: the report says so', async () => {
    const store = createMemoryStore();
    const broken: LexiconSource = { lang: 'th', info: async () => ({ id: 'd1', lang: 'th', attribution: '', licence: '', entries: 0, builtAt: '', hasFrequency: false }), lookup: async () => { throw new Error('shard missing'); } };
    const r = await importDocuments(store, registry, [bookDoc()], { clock, lexicon: lexiconOf(broken) });
    expect(r.ok).toBe(true);
    expect(r.documents[0].note).toBe('dictionary not used: shard missing');
    expect((await store.analyses.all()).some((a) => a.analyzer.startsWith('dict:'))).toBe(false);
  });

  it('a batch shares lookups: a form already asked about for an earlier chapter is not asked again', async () => {
    const src = memoryLexicon(ENTRIES, 'd1');
    const lookup = vi.spyOn(src, 'lookup');
    const docs = [bookDoc({ id: 'c1' }), bookDoc({ id: 'c2' })];
    const store = createMemoryStore();
    await importDocuments(store, registry, docs, { clock, lexicon: lexiconOf(src) });
    expect(lookup).toHaveBeenCalledTimes(1); // the second chapter has nothing new to ask
    expect((await store.analyses.all()).filter((a) => a.analyzer === 'dict:d1').length).toBe(4); // two words in each chapter
  });
});

describe('register, role and definition from any candidate; decoding is never stored', () => {
  // an adapter that attaches the new fields (and a decoding-only candidate for ไป) to what the Thai adapter returns
  const rich: AdapterRegistry = {
    get: (lang) => (lang === 'th'
      ? {
        ...thAdapter,
        analyze: (tokens) => thAdapter.analyze(tokens).map((a) => (a.token.normalized === GO
          ? { ...a, candidates: [{ morph: {}, confidence: 0.5, syllables: [{ text: GO, start: 0, end: GO.length, ending: 'open' as const, confidence: 0.5 }] }] }
          : { ...a, candidates: a.candidates.map((c) => ({ ...c, register: ['formal' as const], role: 'pronoun', definition: 'a word for oneself', syllables: [{ text: a.token.surface, start: 0, end: a.token.surface.length, ending: 'open' as const, confidence: 1 }] })) })),
      }
      : registry.get(lang)),
    all: () => registry.all(),
  };

  it('an adapter candidate carries register / role / definition onto the stored analysis; syllables are dropped', async () => {
    const store = createMemoryStore();
    await importDocuments(store, rich, [bookDoc()], { clock });
    const [i] = await analysesOf(store, I_WORD);
    expect(i).toMatchObject({ register: ['formal'], role: 'pronoun', definition: 'a word for oneself' });
    for (const a of await store.analyses.all()) expect(a.syllables).toBeUndefined();
  });

  it('a decoding-only candidate does not count as an analysis: the dictionary still fills the word', async () => {
    const store = createMemoryStore();
    await importDocuments(store, rich, [bookDoc()], { clock, lexicon: lexiconOf(memoryLexicon(ENTRIES, 'd1')) });
    const go = await analysesOf(store, GO);
    expect(go.map((a) => a.analyzer)).toEqual(['dict:d1']);
    const [i] = await analysesOf(store, I_WORD);
    expect(i.analyzer.startsWith('adapter-th@')).toBe(true);
  });
});
