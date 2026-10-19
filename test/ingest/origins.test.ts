import { describe, expect, it } from 'vitest';
import {
  createMemoryStore, ids, LANGUAGES, type AdapterRegistry, type AnalyzedToken, type AppStore, type DictionaryEntry, type LanguageAdapter, type LanguageCode,
  type RawToken,
} from '../../src/core';
import { createMemoryLexiconSource } from '../../src/dict';
import { importDocuments, loadBundledCorpus, planDocument, type CorpusDocument } from '../../src/ingest';
import { baseDoc, clock } from './helpers';
import { CAT, SCHOOL, bareAdapter, bareRegistry, bookDoc, lexiconOf, memoryLexicon } from './book';

const entry = (form: string, over: Partial<DictionaryEntry> = {}): DictionaryEntry => ({ form, lang: 'th', glosses: ['x'], ...over });
const schoolTokens = bareAdapter.tokenize(SCHOOL); // ฉัน | ไป | โรงเรียน
const catTokens = bareAdapter.tokenize(CAT); // แมว | นั่ง | บน | เสื่อ
const [I, GO, SCHOOL_W] = schoolTokens.map((t) => t.normalized);
const [CATW, SIT, ON, MAT] = catTokens.map((t) => t.normalized);
const VERSION = bareAdapter.version;

/** The bare Thai adapter with its own analyze() (what each test needs the "hand" side to say). */
const withAnalyze = (analyze: (tokens: RawToken[]) => AnalyzedToken[], extra: Partial<LanguageAdapter> = {}): AdapterRegistry => ({
  get: (lang) => (lang === 'th' ? { ...bareAdapter, analyze, ...extra } : bareRegistry.get(lang)),
  all: () => bareRegistry.all(),
});
const known = (token: RawToken, c: Record<string, unknown> = {}): AnalyzedToken => ({
  token, analyzer: `adapter-th@${VERSION}`, candidates: [{ lemma: token.normalized, pos: 'NOUN', morph: {}, gloss: 'hand gloss', confidence: 1, ...c }],
});
const none = (token: RawToken): AnalyzedToken => ({ token, analyzer: `adapter-th@${VERSION}`, candidates: [] });

const rowsFor = async (store: AppStore, surface: string) => {
  const tok = (await store.tokens.all()).find((t) => t.surface === surface)!;
  return (await store.analyses.where('tokenId', tok.id)).sort((a, b) => a.id.localeCompare(b.id));
};

describe('every stored analysis says where it comes from (origin + sourceId)', () => {
  it('hand, rule, an adapter-stated origin, dictionary, corpus (author span) and reviewed (correction)', async () => {
    const reg = withAnalyze((tokens) => tokens.map((t) => {
      if (t.normalized === I) return known(t); // no origin stated: a lexicon hit is "hand"
      if (t.normalized === GO) return known(t, { notes: { source: 'rule' } }); // rule-derived
      if (t.normalized === SCHOOL_W) return known(t, { origin: 'hand', sourceId: 'adapter-th@9:hand' }); // states its own
      return none(t);
    }));
    const doc: CorpusDocument = {
      ...bookDoc(),
      sections: [{ paragraphs: [
        { sentences: [{ id: 'a', text: SCHOOL }] },
        { sentences: [{
          id: 'b', text: CAT,
          spans: [{ start: catTokens[1].start, end: catTokens[1].end, lemma: SIT, pos: 'VERB', gloss: 'sit (here)' }],
          corrections: [
            { start: catTokens[2].start, end: catTokens[2].end, lemma: ON, pos: 'ADP', by: 'Khun Somchai', at: '2026-02-01' },
            { start: catTokens[3].start, end: catTokens[3].end, lemma: MAT, pos: 'NOUN', by: 'Khun Somchai', at: '2026-02-01' },
          ],
        }] },
      ] }],
    };
    const store = createMemoryStore();
    const lexicon = lexiconOf(memoryLexicon([entry(CATW, { pos: 'NOUN', glosses: ['cat'] }), entry(MAT, { pos: 'NOUN', glosses: ['mat'] })], 'kaikki-th@t'));
    expect((await importDocuments(store, reg, [doc], { clock, lexicon })).ok).toBe(true);

    expect(await rowsFor(store, 'ฉัน')).toMatchObject([{ origin: 'hand', sourceId: `adapter-th@${VERSION}`, provenance: 'lexicon' }]);
    expect(await rowsFor(store, 'ไป')).toMatchObject([{ origin: 'rule', sourceId: `adapter-th@${VERSION}`, provenance: 'machine' }]);
    expect((await rowsFor(store, 'โรงเรียน'))[0]).toMatchObject({ origin: 'hand', sourceId: 'adapter-th@9:hand' });
    expect(await rowsFor(store, CATW)).toMatchObject([{ origin: 'dictionary', sourceId: 'kaikki-th@t', analyzer: 'dict:kaikki-th@t', provenance: 'lexicon' }]);
    expect(await rowsFor(store, SIT)).toMatchObject([{ origin: 'corpus', sourceId: 'import@2', analyzer: 'import@2' }]);
    expect(await rowsFor(store, ON)).toMatchObject([{ origin: 'reviewed', sourceId: 'human:Khun Somchai', provenance: 'human' }]);
    const mat = await rowsFor(store, MAT);
    expect(mat.map((a) => [a.origin, a.sourceId])).toEqual(expect.arrayContaining([['dictionary', 'kaikki-th@t'], ['reviewed', 'human:Khun Somchai']]));

    // nothing is stored without them
    for (const a of await store.analyses.all()) { expect(a.origin, a.id).toBeDefined(); expect(a.sourceId, a.id).toBeDefined(); expect(a.syllables).toBeUndefined(); }
  });

  it('an alternative of an author span is `corpus` too; an adapter alternative is labelled like its adapter', async () => {
    const reg = withAnalyze((tokens) => tokens.map((t) => (t.normalized === I
      ? { ...known(t), candidates: [...known(t).candidates, { lemma: I, pos: 'PRON' as const, morph: {}, confidence: 0.4, gloss: 'second' }] }
      : none(t))));
    const doc: CorpusDocument = {
      ...bookDoc(),
      sections: [{ paragraphs: [{ sentences: [{ id: 'a', text: SCHOOL, spans: [{ start: schoolTokens[1].start, end: schoolTokens[1].end, lemma: GO, pos: 'VERB', alternatives: [{ lemma: GO, pos: 'NOUN', confidence: 0.3 }] }] }] }] }],
    };
    const store = createMemoryStore();
    await importDocuments(store, reg, [doc], { clock });
    const [go] = await rowsFor(store, 'ไป');
    expect(go.alternatives).toEqual([{ lemmaId: ids.lemma('th', GO, 'NOUN'), pos: 'NOUN', morph: {}, confidence: 0.3, origin: 'corpus', sourceId: 'import@2' }]);
    const [i] = await rowsFor(store, 'ฉัน');
    expect(i.alternatives).toEqual([{ lemmaId: ids.lemma('th', I, 'PRON'), pos: 'PRON', morph: {}, confidence: 0.4, origin: 'hand', sourceId: `adapter-th@${VERSION}` }]);
  });
});

describe('the dictionary stands beside the hand lexicon, never in its place', () => {
  const handI = (extra: Record<string, unknown> = {}) => withAnalyze((tokens) => tokens.map((t) => (t.normalized === I ? known(t, extra) : none(t))));

  it('hand analysis unchanged (the dictionary is only marked, its entries are not copied); a human correction above it, superseded row kept', async () => {
    const dict = [entry(I, { pos: 'PRON', glosses: ['I', 'me'] }), entry(I, { pos: 'NOUN', glosses: ['a name'] })];
    const doc: CorpusDocument = {
      ...bookDoc(),
      sections: [{ paragraphs: [{ sentences: [{ id: 'a', text: SCHOOL, corrections: [{ start: 0, end: 3, lemma: I, pos: 'PRON', gloss: 'I (checked)', by: 'Khun Somchai', at: '2026-02-01' }] }] }] }],
    };
    const withoutDict = createMemoryStore();
    await importDocuments(withoutDict, handI(), [doc], { clock });
    const before = (await rowsFor(withoutDict, 'ฉัน')).find((a) => a.provenance !== 'human')!;

    const store = createMemoryStore();
    await importDocuments(store, handI(), [doc], { clock, lexicon: lexiconOf(memoryLexicon(dict, 'kaikki-th@2026-09-28')) });
    const rows = await rowsFor(store, 'ฉัน');
    const hand = rows.find((a) => a.provenance !== 'human')!;
    const human = rows.find((a) => a.provenance === 'human')!;
    // the hand row is exactly what it was, plus the alternatives
    const { alternatives, notes, ...rest } = hand;
    const { notes: beforeNotes, ...beforeRest } = before;
    expect(beforeNotes).toBeUndefined();
    expect(rest).toEqual(beforeRest);
    expect(notes).toEqual({ dictionary: 'kaikki-th@2026-09-28' });
    expect(hand).toMatchObject({ origin: 'hand', confidence: 1, pos: 'NOUN', analyzer: `adapter-th@${VERSION}` });
    expect(alternatives).toBeUndefined();

    // the correction sits above both and supersedes the hand row, which is kept
    expect(human).toMatchObject({ origin: 'reviewed', sourceId: 'human:Khun Somchai', supersedes: hand.id, confidence: 1 });
    expect(rows).toHaveLength(2);
    // the dictionary did not touch the hand lemma's gloss
    expect((await store.lemmas.get(ids.lemma('th', I, 'NOUN')))!.gloss).toBe('hand gloss');
    expect((await store.lemmas.get(ids.lemma('th', I, 'PRON')))?.gloss).toBeUndefined(); // (the correction's lemma; the dictionary adds no gloss)
  });

  it('pronunciation from the dictionary only when the adapter has none, with its source named', async () => {
    const dict = [entry(I, { pos: 'PRON', glosses: ['I'], respelling: 'chan', ipa: 'tɕʰan˩˩˦', romanization: 'chan' })];
    const lexicon = lexiconOf(memoryLexicon(dict, 'd1'));

    const bare = createMemoryStore();
    await importDocuments(bare, handI(), [bookDoc()], { clock, lexicon });
    const [a] = await rowsFor(bare, 'ฉัน');
    expect(a.notes).toEqual({ respelling: 'chan', ipa: 'tɕʰan˩˩˦', pronunciationSource: 'd1', dictionary: 'd1' });
    expect(a.origin).toBe('hand'); // still the hand analysis; only the pronunciation notes come from the dictionary

    for (const own of [{ translit: 'chan' }, { respelling: 'chan-x' }, { ipa: 'x' }]) {
      const store = createMemoryStore();
      await importDocuments(store, handI({ notes: own }), [bookDoc()], { clock, lexicon });
      const [row] = await rowsFor(store, 'ฉัน');
      expect(row.notes, JSON.stringify(own)).toEqual({ ...own, dictionary: 'd1' });
    }

    const noPron = createMemoryStore();
    await importDocuments(noPron, handI(), [bookDoc()], { clock, lexicon: lexiconOf(memoryLexicon([entry(I, { pos: 'PRON', glosses: ['I'] })], 'd1')) });
    expect((await rowsFor(noPron, 'ฉัน'))[0].notes).toEqual({ dictionary: 'd1' });
  });

  it('phrase and pattern detection sees the adapter\'s analysis only', () => {
    const seen: number[] = [];
    const reg = withAnalyze((tokens) => tokens.map((t) => (t.normalized === I ? known(t) : none(t))), {
      detectPhrases: (_tokens, analyzed) => { seen.push(...analyzed.map((a) => a.candidates.length)); return []; },
    });
    planDocument(bookDoc(), reg, { dictionary: new Map([[I, [entry(I, { pos: 'PRON' }), entry(I, { pos: 'NOUN' })]]]), dictionaryId: 'd1' });
    expect(seen.slice(0, 3)).toEqual([1, 0, 0]);
  });

  it('a dictionary-only word keeps its behaviour plus the origin fields', async () => {
    const store = createMemoryStore();
    await importDocuments(store, handI(), [bookDoc()], { clock, lexicon: lexiconOf(memoryLexicon([entry(GO, { pos: 'VERB', glosses: ['go'] }), entry(GO, { pos: 'ADV', glosses: ['away'] })], 'd1')) });
    const [go] = await rowsFor(store, 'ไป');
    expect(go).toMatchObject({ analyzer: 'dict:d1', origin: 'dictionary', sourceId: 'd1', pos: 'VERB', confidence: 0.45, provenance: 'lexicon' });
    expect(go.alternatives).toEqual([{ lemmaId: ids.lemma('th', GO, 'ADV'), pos: 'ADV', morph: {}, confidence: 0.45, origin: 'dictionary', sourceId: 'd1' }]);
    expect(go.notes).toBeUndefined();
  });
});

describe('variant readings', () => {
  const readingsEntry = entry(I, {
    pos: 'PRON', glosses: ['I'], respelling: 'chan', ipa: 'a',
    pronunciations: [{ respelling: 'chan', ipa: 'a' }, { respelling: 'chǎn', tags: ['colloquial'] }, { respelling: 'chan' }],
  });
  const handI = withAnalyze((tokens) => tokens.map((t) => (t.normalized === I ? known(t) : none(t))));

  it('several readings are stored in notes.readings, first one first, without duplicates', async () => {
    const lexicon = lexiconOf(memoryLexicon([readingsEntry, entry(GO, { pos: 'VERB', respelling: 'pai', pronunciations: [{ respelling: 'pai' }, { respelling: 'bpai' }] })], 'd1'));
    const store = createMemoryStore();
    await importDocuments(store, handI, [bookDoc()], { clock, lexicon });
    // beside the hand analysis: the readings are the dictionary's, and say so
    const [i] = await rowsFor(store, 'ฉัน');
    expect(i.notes).toMatchObject({ readings: ['chan', 'chǎn'], respelling: 'chan', pronunciationSource: 'd1', dictionary: 'd1' });
    expect(i.notes).not.toHaveProperty('readingsSource');
    expect(i.origin).toBe('hand');
    // a dictionary-only word carries them on its own analysis
    const [go] = await rowsFor(store, 'ไป');
    expect(go.notes).toMatchObject({ respelling: 'pai', readings: ['pai', 'bpai'] });
  });

  it('one reading stores no list', async () => {
    const store = createMemoryStore();
    await importDocuments(store, handI, [bookDoc()], { clock, lexicon: lexiconOf(memoryLexicon([entry(I, { respelling: 'chan', pronunciations: [{ respelling: 'chan' }] })], 'd1')) });
    expect((await rowsFor(store, 'ฉัน'))[0].notes?.readings).toBeUndefined();
  });

  it('readings count across the entries of a form', async () => {
    const store = createMemoryStore();
    await importDocuments(store, handI, [bookDoc()], { clock, lexicon: lexiconOf(memoryLexicon([entry(I, { pos: 'PRON', respelling: 'a' }), entry(I, { pos: 'NOUN', respelling: 'b' })], 'd1')) });
    expect((await rowsFor(store, 'ฉัน'))[0].notes?.readings).toEqual(['a', 'b']);
  });
});

describe('re-import with a changed dictionary id', () => {
  it('replaces the dictionary marker and pronunciation on the hand row, keeps the row, never bumps the content version', async () => {
    const reg = withAnalyze((tokens) => tokens.map((t) => (t.normalized === I ? known(t) : none(t))));
    const dict = (id: string, gloss: string) => lexiconOf(memoryLexicon([entry(I, { pos: 'PRON', glosses: [gloss], respelling: 'chan' })], id));
    const store = createMemoryStore();
    await importDocuments(store, reg, [bookDoc()], { clock });
    const handId = (await rowsFor(store, 'ฉัน'))[0].id;
    expect((await rowsFor(store, 'ฉัน'))[0].notes).toBeUndefined();

    const r1 = await importDocuments(store, reg, [bookDoc()], { clock, lexicon: dict('kaikki-th@1', 'one') });
    expect(r1.documents[0]).toMatchObject({ action: 'updated', contentVersion: 1 });
    let [row] = await rowsFor(store, 'ฉัน');
    expect(row.id).toBe(handId);
    expect(row.alternatives).toBeUndefined();
    expect(row.notes).toEqual({ respelling: 'chan', pronunciationSource: 'kaikki-th@1', dictionary: 'kaikki-th@1' });

    const same = await importDocuments(store, reg, [bookDoc()], { clock, lexicon: dict('kaikki-th@1', 'one') });
    expect(same.documents[0].action).toBe('unchanged');

    const r2 = await importDocuments(store, reg, [bookDoc()], { clock, lexicon: dict('kaikki-th@2', 'two') });
    expect(r2.documents[0]).toMatchObject({ action: 'updated', contentVersion: 1 });
    [row] = await rowsFor(store, 'ฉัน');
    expect(row.id).toBe(handId);
    expect(row.alternatives).toBeUndefined();
    expect(row.notes).toEqual({ respelling: 'chan', pronunciationSource: 'kaikki-th@2', dictionary: 'kaikki-th@2' });

    const gone = await importDocuments(store, reg, [bookDoc()], { clock, lexicon: lexiconOf(undefined) });
    expect(gone.documents[0].action).toBe('updated');
    [row] = await rowsFor(store, 'ฉัน');
    expect(row.alternatives).toBeUndefined();
    expect(row.notes).toBeUndefined();
    expect(row.origin).toBe('hand');
  });
});

describe('the other languages retain analysis facts and persist source descriptors when available', () => {
  it('the bundled es / de / sq / hi documents: only the explicit source snapshot extends the existing analysis record', async () => {
    // Thai, Hebrew and Greek are left out: their analysers carry an external source inside the adapter (the Thai dictionary; the Open Scriptures /
    // MorphGNT / Wiktionary form indexes of he and el), so their bundled readings legitimately have origin 'dictionary'. Latin has course texts only.
    const EXTERNAL_INSIDE_ADAPTER = new Set(['th', 'he', 'el', 'la']);
    const docs = loadBundledCorpus().filter((d) => !EXTERNAL_INSIDE_ADAPTER.has(d.lang));
    expect((await Promise.resolve(docs)).length).toBeGreaterThan(0);
    const store = createMemoryStore();
    const reg = bareRegistry;
    expect((await importDocuments(store, reg, docs, { clock })).ok).toBe(true);
    const allowed = new Set(['id', 'tokenId', 'lang', 'lemmaId', 'pos', 'morph', 'notes', 'gloss', 'register', 'role', 'definition', 'confidence', 'provenance', 'origin', 'sourceId', 'sourceInfo', 'analyzer', 'createdAt', 'supersedes', 'alternatives', 'parts', 'varieties', 'unit', 'orthography']); // sourceInfo snapshots the matching adapter descriptor; parts/varieties and unit/orthography are existing analyzer outputs.
    const allowedAlt = new Set(['lemmaId', 'pos', 'morph', 'confidence', 'origin', 'sourceId']);
    const rows = await store.analyses.all();
    expect(rows.length).toBeGreaterThan(300);
    const kinds = new Set<string>();
    for (const a of rows) {
      for (const k of Object.keys(a)) expect(allowed.has(k), k).toBe(true);
      expect(['hand', 'rule']).toContain(a.origin);
      expect(a.sourceId!.startsWith(`adapter-${a.lang}@${reg.get(a.lang as LanguageCode).version}`), a.sourceId).toBe(true); // the adapter may name its own source, e.g. adapter-es@1:hand
      const descriptor = reg.get(a.lang as LanguageCode).sources?.[a.sourceId!];
      if (descriptor) expect(a.sourceInfo).toEqual(descriptor);
      else expect(a.sourceInfo).toBeUndefined();
      expect(a.notes && 'readings' in a.notes).toBeFalsy();
      for (const alt of a.alternatives ?? []) {
        for (const k of Object.keys(alt)) expect(allowedAlt.has(k), k).toBe(true);
        expect(['hand', 'rule']).toContain(alt.origin);
      }
      kinds.add(`${a.lang}:${a.origin}`);
    }
    for (const lang of LANGUAGES.filter((l) => !EXTERNAL_INSIDE_ADAPTER.has(l))) expect([...kinds].some((k) => k.startsWith(`${lang}:`)), lang).toBe(true);
  });

  it('a Spanish text imports identically with and without an installed (here empty) dictionary for another language', async () => {
    const a = createMemoryStore();
    const b = createMemoryStore();
    await importDocuments(a, bareRegistry, [baseDoc()], { clock });
    await importDocuments(b, bareRegistry, [baseDoc()], { clock, lexicon: lexiconOf(memoryLexicon([], 'd1')) }); // a Thai dictionary only
    expect(await b.analyses.all()).toEqual(await a.analyses.all());
    expect(await b.texts.all()).toEqual(await a.texts.all());
  });

  it('a dictionary installed for Spanish is marked on the hand analysis there too', async () => {
    const store = createMemoryStore();
    const es = createMemoryLexiconSource('es', [{ form: 'hola', lang: 'es', pos: 'INTJ', glosses: ['hello (dictionary)'] }], { id: 'es-dict@1' });
    await importDocuments(store, bareRegistry, [baseDoc()], { clock, lexicon: (l) => (l === 'es' ? es : undefined) });
    const [row] = await store.analyses.all();
    const v = bareRegistry.get('es').version;
    expect(row).toMatchObject({ analyzer: `adapter-es@${v}`, origin: 'hand' });
    expect(row.sourceId!.startsWith(`adapter-es@${v}`)).toBe(true);
    expect(row.alternatives).toBeUndefined();
    expect(row.notes).toMatchObject({ dictionary: 'es-dict@1' });
  });
});
