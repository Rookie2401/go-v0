/**
 * A word the adapter already reads from its own data, of which the dictionary has ANOTHER kind of reading (another lemma or
 * part of speech): where the adapter can order readings by context (`refine`), those readings join the token after the
 * adapter's own. Where it cannot, nothing is copied onto the token. A FAKE adapter (the Spanish adapter with its `analyze`
 * replaced and every optional method off unless the test supplies one) and an in-memory dictionary stand in.
 */
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore, ids, type AdapterRegistry, type AnalysisCandidate, type AnalyzedToken, type DictionaryEntry, type LanguageAdapter } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { createMemoryLexiconSource } from '../../src/dict';
import { collectWordForms, importDocuments, loadBundledCorpus, planDocument, type CorpusDocument } from '../../src/ingest';
import { BESIDE_CONFIDENCE, BESIDE_MAX, FUNCTION_WORD_POS, NOT_RUNNING_TEXT_LABELS } from '../../src/ingest/plan';
import { baseDoc, clock } from './helpers';

const real = createAdapterRegistry();
const esReal = real.get('es');
const FAKE = 'adapter-es@fake';

const entry = (form: string, over: Partial<DictionaryEntry> = {}): DictionaryEntry => ({ form, lang: 'es', glosses: [], ...over });
const hand = (lemma: string, pos: AnalysisCandidate['pos'], over: Partial<AnalysisCandidate> = {}): AnalysisCandidate => ({ lemma, pos, morph: {}, confidence: 1, gloss: `hand gloss of ${lemma}`, ...over });

type Refine = NonNullable<LanguageAdapter['refine']>;
/** A `refine` that changes nothing. */
const keep: Refine = (_tokens, analyzed) => analyzed;
/** A `refine` that puts the dictionary's readings first on the tokens named as given (what a neighbour rule might decide). */
const dictionaryFirst: Refine = (_tokens, analyzed, _analyzers, given) => analyzed.map((a, i) => (given?.has(i)
  ? { ...a, candidates: [...a.candidates.filter((c) => c.origin === 'dictionary'), ...a.candidates.filter((c) => c.origin !== 'dictionary')] }
  : a));

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
const lexicon = (entries: DictionaryEntry[]) => (lang: string) => (lang === 'es' ? createMemoryLexiconSource('es', entries, { id: 'd1' }) : undefined);

// "abandono": the word list reads a form of abandonar; the dictionary also has the noun
const ABANDONAR = hand('abandonar', 'VERB', { morph: { Person: '1', Number: 'Sing' } });
const NOUN = entry('abandono', { pos: 'NOUN', glosses: ['abandonment', 'neglect', 'desertion'], ipa: '/a.ban.do.no/' });
const VERB_FORM = entry('abandono', { pos: 'VERB', formOf: [{ lemma: 'abandonar', tags: ['first-person', 'singular'] }] });

describe('a dictionary reading of another kind joins a word the adapter reads (only when the adapter can refine)', () => {
  it('is appended after the adapter\'s own readings at 0.45; the token stays the adapter\'s; refine gets the token as given', () => {
    const refine = vi.fn(keep);
    const registry = fake({ abandono: [ABANDONAR], al: [hand('al', 'ADP')] }, { refine });
    const plan = planDocument(docOf('Al abandono'), registry, { dictionary: dictOf(VERB_FORM, NOUN), dictionaryId: 'd1' });
    const [al, abandono] = plan.sentences[0].analyzed.filter((a) => a.token.isWord);
    expect(al.candidates.map((c) => c.lemma)).toEqual(['al']); // no entry: untouched
    expect(abandono.analyzer).toBe(FAKE);
    expect(abandono.candidates.map((c) => [c.lemma, c.pos, c.confidence, c.origin])).toEqual([['abandonar', 'VERB', 1, undefined], ['abandono', 'NOUN', 0.45, 'dictionary']]);
    expect(abandono.candidates[1]).toEqual({
      lemma: 'abandono', pos: 'NOUN', morph: {}, confidence: BESIDE_CONFIDENCE, origin: 'dictionary', sourceId: 'd1', gloss: 'abandonment; neglect',
      notes: { ipa: '/a.ban.do.no/', senses: ['desertion'] },
    });
    // the marker on the first reading is what it always was (also in the dictionary; a pronunciation it lacked)
    expect(abandono.candidates[0].notes).toEqual({ ipa: '/a.ban.do.no/', pronunciationSource: 'd1', dictionary: 'd1' });
    expect([BESIDE_CONFIDENCE, BESIDE_MAX]).toEqual([0.45, 3]);
    expect(refine).toHaveBeenCalledTimes(1);
    expect(refine.mock.calls[0][2]).toEqual(new Set([FAKE, 'dict:d1']));
    expect(refine.mock.calls[0][3]).toEqual(new Set([plan.sentences[0].analyzed.indexOf(abandono)]));
    expect(plan.dictionary).toEqual({ tool: 'dict:d1', tokens: 0, decided: 0, lemmaOnly: 0, joined: 1, units: 0, alongside: 1 });
    // such a word still counts as the adapter's
    expect(plan.coverage.bySource).toEqual({ adapter: 2, dictionary: 0, supplied: 0, corrected: 0 });
  });

  it('a kind the adapter already gives is not added (a verb and an auxiliary are one kind; lemmas are compared normalized)', () => {
    const refine = vi.fn(keep);
    const registry = fake({ abandono: [ABANDONAR], habia: [hand('Haber', 'AUX'), hand('otro', 'NOUN', { unconfirmed: true, confidence: 0.4 })] }, { refine });
    const dictionary = dictOf(VERB_FORM, entry('habia', { pos: 'VERB', formOf: [{ lemma: 'haber', tags: [] }] }), entry('habia', { pos: 'NOUN', formOf: [{ lemma: 'otro', tags: [] }] }));
    const plan = planDocument(docOf('Abandono habia'), registry, { dictionary, dictionaryId: 'd1' });
    for (const a of plan.sentences[0].analyzed.filter((x) => x.token.isWord)) expect(a.candidates.every((c) => c.origin !== 'dictionary')).toBe(true);
    expect(plan.dictionary).toMatchObject({ joined: 0, alongside: 2 });
    expect(refine).not.toHaveBeenCalled(); // only markers: nothing to order
  });

  it('the adapter\'s lemma under the headword the dictionary files it under (lemmaVariants) is the same kind', () => {
    const table = { arrepiento: [hand('arrepentir', 'VERB')] };
    const dictionary = dictOf(entry('arrepiento', { pos: 'VERB', formOf: [{ lemma: 'arrepentirse', tags: ['first-person'] }] }));
    const lemmaVariants = (lemma: string) => [`${lemma}se`];
    const same = planDocument(docOf('Arrepiento'), fake(table, { refine: keep, lemmaVariants }), { dictionary, dictionaryId: 'd1' });
    expect(same.sentences[0].analyzed[0].candidates.map((c) => c.lemma)).toEqual(['arrepentir']);
    expect(same.dictionary).toMatchObject({ joined: 0 });
    // an adapter that names no such headword: the dictionary's lemma is another reading
    const other = planDocument(docOf('Arrepiento'), fake(table, { refine: keep }), { dictionary, dictionaryId: 'd1' });
    expect(other.sentences[0].analyzed[0].candidates.map((c) => c.lemma)).toEqual(['arrepentir', 'arrepentirse']);
  });

  it('headwords come before inflected forms and other spellings, each in dictionary order, three at most', () => {
    const registry = fake({ sobre: [hand('sobre', 'NOUN')] }, { refine: keep });
    const five = dictOf(
      entry('sobre', { pos: 'VERB', formOf: [{ lemma: 'sobrar', tags: ['first-person'] }, { lemma: 'sobrar', tags: ['third-person'] }] }),
      entry('sobre', { pos: 'ADP', glosses: ['on, upon'] }),
      entry('sobre', { pos: 'ADJ', glosses: ['another spelling of sobrio'], altOf: ['sobrio'], senses: [{ gloss: 'another spelling of sobrio', tags: ['alt-of'] }] }),
      entry('sobre', { pos: 'NOUN', glosses: ['envelope'] }), // the adapter's own kind
      entry('sobre', { pos: 'ADV', glosses: ['over'] }),
      entry('sobre', { pos: 'INTJ', glosses: ['enough!'] }),
    );
    const a = planDocument(docOf('Sobre'), registry, { dictionary: five, dictionaryId: 'd1' }).sentences[0].analyzed[0];
    expect(a.candidates.map((c) => [c.lemma, c.pos, c.confidence])).toEqual([['sobre', 'NOUN', 1], ['sobre', 'ADP', 0.45], ['sobre', 'ADV', 0.45], ['sobre', 'INTJ', 0.45]]);
    const two = dictOf(five.get('sobre')![0], five.get('sobre')![2], five.get('sobre')![1]);
    const b = planDocument(docOf('Sobre'), registry, { dictionary: two, dictionaryId: 'd1' }).sentences[0].analyzed[0];
    // the headword, then the others in dictionary order; two readings that say the same (lemma, part of speech, features) are one
    expect(b.candidates.slice(1).map((c) => [c.lemma, c.pos])).toEqual([['sobre', 'ADP'], ['sobrar', 'VERB'], ['sobrio', 'ADJ']]);
    expect(b.candidates.slice(1).map((c) => c.notes)).toEqual([undefined, { formOfTags: ['first-person'] }, { altOf: 'another spelling of sobrio' }]);
  });

  it('a function word of the adapter\'s own list gets no joined reading (de eso is never the acronym ESO); the marker stays', () => {
    const refine = vi.fn(keep);
    const acronym = entry('eso', { pos: 'NOUN', glosses: ['acronym of Educación Secundaria Obligatoria'], altOf: ['Educación Secundaria Obligatoria'], senses: [{ gloss: 'acronym of Educación Secundaria Obligatoria', tags: ['Spain', 'abbreviation', 'acronym', 'alt-of'] }] });
    const noun = entry('eso', { pos: 'NOUN', glosses: ['a real noun'] }); // even a word of running text does not join a function word
    const verb = entry('eso', { pos: 'VERB', formOf: [{ lemma: 'esar', tags: ['first-person'] }] });
    const dictionary = dictOf(acronym, noun, verb);
    expect([...FUNCTION_WORD_POS].sort()).toEqual(['ADP', 'CONJ', 'DET', 'NUM', 'PART', 'PRON', 'SCONJ']);
    for (const pos of FUNCTION_WORD_POS) {
      for (const first of [hand('ese', pos, { origin: 'hand' as const }), hand('ese', pos), hand('ese', pos, { notes: { translit: 'x' } })]) {
        const plan = planDocument(docOf('Eso'), fake({ eso: [first, hand('eso', 'ADJ')] }, { refine }), { dictionary, dictionaryId: 'd1' });
        const a = plan.sentences[0].analyzed[0];
        expect(a.candidates.map((c) => [c.lemma, c.pos]), pos).toEqual([['ese', pos], ['eso', 'ADJ']]);
        expect(a.candidates[0].notes).toMatchObject({ dictionary: 'd1' });
        expect(plan.dictionary).toMatchObject({ joined: 0, alongside: 1 });
      }
    }
    expect(refine).not.toHaveBeenCalled();
  });

  it('the rule is about the FIRST reading being the adapter\'s own confirmed function word: otherwise readings join as usual', () => {
    const verb = entry('eso', { pos: 'VERB', formOf: [{ lemma: 'esar', tags: ['first-person'] }] });
    const joinedTo = (...readings: AnalysisCandidate[]) => planDocument(docOf('Eso'), fake({ eso: readings }, { refine: keep }), { dictionary: dictOf(verb), dictionaryId: 'd1' })
      .sentences[0].analyzed[0].candidates.slice(readings.length).map((c) => [c.lemma, c.pos]);
    expect(joinedTo(hand('eso', 'NOUN'))).toEqual([['esar', 'VERB']]); // a content word of the list
    expect(joinedTo(hand('eso', 'NOUN'), hand('ese', 'PRON'))).toEqual([['esar', 'VERB']]); // the function word is not first
    expect(joinedTo(hand('ese', 'PRON', { origin: 'rule' as const }))).toEqual([['esar', 'VERB']]); // read by rule, not from the list
    expect(joinedTo(hand('ese', 'PRON', { notes: { source: 'rule' } }))).toEqual([['esar', 'VERB']]);
    expect(joinedTo(hand('ese', 'PRON', { origin: 'dictionary' as const }))).toEqual([['esar', 'VERB']]);
    expect(joinedTo(hand('ese', 'ADV'))).toEqual([['esar', 'VERB']]); // an adverb is not in the set
    expect(joinedTo(hand('ese', 'PRON'))).toEqual([]);
  });

  it('an entry that is not a word of running text never joins; one that is, of the same spelling, does', () => {
    const sense = (gloss: string, ...tags: string[]) => ({ gloss, tags });
    const not = (label: string, pos: DictionaryEntry['pos'] = 'NOUN') => entry('se', { pos, glosses: [`${label} of x`], senses: [sense(`${label} of x`, 'masculine', label)] });
    expect([...NOT_RUNNING_TEXT_LABELS].sort()).toEqual(['abbreviation', 'acronym', 'initialism', 'letter', 'misspelling', 'morpheme', 'prefix', 'suffix', 'symbol']);
    const table = { se: [hand('ser', 'VERB')] };
    const joined = (...entries: DictionaryEntry[]) => planDocument(docOf('Se'), fake(table, { refine: keep }), { dictionary: dictOf(...entries), dictionaryId: 'd1' })
      .sentences[0].analyzed[0].candidates.slice(1).map((c) => [c.lemma, c.pos]);
    for (const label of NOT_RUNNING_TEXT_LABELS) {
      expect(joined(not(label)), label).toEqual([]);
      expect(joined(not(label.toUpperCase())), label).toEqual([]); // the labels are compared without regard to case
    }
    // every sense must carry one of the labels (not necessarily the same one); one ordinary sense makes it a word of the text
    const two = entry('se', { pos: 'NOUN', glosses: ['a', 'b'], senses: [sense('a', 'acronym'), sense('b', 'Abbreviation', 'masculine')] });
    expect(joined(two)).toEqual([]);
    const mixed = entry('se', { pos: 'NOUN', glosses: ['a', 'b'], senses: [sense('a', 'acronym'), sense('b', 'masculine')] });
    expect(joined(mixed)).toEqual([['se', 'NOUN']]);
    expect(joined(entry('se', { pos: 'NOUN', glosses: ['no senses kept'] }))).toEqual([['se', 'NOUN']]);
    // for another spelling the labels are those of the spelling entry (the written form's), not of its target
    const misspelling = entry('se', { pos: 'ADJ', glosses: ['misspelling of sé'], altOf: ['sé'], senses: [sense('misspelling of sé', 'alt-of', 'misspelling')] });
    const spelling = entry('se', { pos: 'ADJ', glosses: ['obsolete spelling of sé'], altOf: ['sé'], senses: [sense('obsolete spelling of sé', 'alt-of', 'obsolete')] });
    expect(joined(misspelling)).toEqual([]);
    expect(joined(spelling)).toEqual([['sé', 'ADJ']]);
    // the others of the same spelling still join, and the marker still reports the whole form
    expect(joined(not('acronym'), misspelling, entry('se', { pos: 'ADV', glosses: ['thus'] }))).toEqual([['se', 'ADV']]);
  });

  it('such an entry still explains a word the adapter cannot read, and still decides a guessed one', () => {
    const misspelling = entry('se', { pos: 'VERB', glosses: ['misspelling of sé'], altOf: ['sé'], senses: [{ gloss: 'misspelling of sé', tags: ['alt-of', 'misspelling'] }] });
    const acronym = entry('eso', { pos: 'NOUN', glosses: ['acronym of x'], senses: [{ gloss: 'acronym of x', tags: ['acronym'] }] });
    const dictionary = dictOf(misspelling, acronym);
    const unknown = planDocument(docOf('Se eso'), fake({}, { refine: keep }), { dictionary, dictionaryId: 'd1' });
    expect(unknown.sentences[0].analyzed.filter((a) => a.token.isWord).map((a) => [a.analyzer, a.candidates.map((c) => c.lemma)])).toEqual([['dict:d1', ['sé']], ['dict:d1', ['eso']]]);
    expect(unknown.dictionary).toMatchObject({ tokens: 2, joined: 0 });
    const guessed = planDocument(docOf('Eso'), fake({ eso: [hand('esar', 'VERB', { unconfirmed: true, confidence: 0.5 })] }, { refine: keep }), { dictionary, dictionaryId: 'd1' });
    expect(guessed.sentences[0].analyzed[0].candidates.map((c) => [c.lemma, c.pos, c.origin])).toEqual([['eso', 'NOUN', 'dictionary']]);
    expect(guessed.dictionary).toMatchObject({ decided: 1 });
  });

  it('the list of the form\'s pronunciations stays on the first reading only', () => {
    const registry = fake({ abandono: [hand('abandonar', 'VERB', { notes: { translit: 'x' } })] }, { refine: keep });
    const noun = entry('abandono', { pos: 'NOUN', glosses: ['abandonment'], respelling: 'a-ban-do-no', pronunciations: [{ respelling: 'a-ban-do-no' }, { respelling: 'a-ban-dó-no' }] });
    const a = planDocument(docOf('Abandono'), registry, { dictionary: dictOf(noun), dictionaryId: 'd1' }).sentences[0].analyzed[0];
    expect(a.candidates[0].notes).toEqual({ translit: 'x', readings: ['a-ban-do-no', 'a-ban-dó-no'], dictionary: 'd1' });
    expect(a.candidates[1].notes).toEqual({ respelling: 'a-ban-do-no' });
  });

  it('a joined reading gets its lemma\'s gloss and varieties exactly as a dictionary reading does elsewhere', () => {
    const registry = fake({ marcha: [hand('marcha', 'NOUN')] }, {
      refine: keep, varietiesFromTags: (tags) => tags.filter((t) => t === 'with-voseo').map(() => 'es-voseo'),
      lemmaVariants: (lemma) => [`${lemma}se`],
    });
    const dictionary = dictOf(
      entry('marcha', { pos: 'VERB', formOf: [{ lemma: 'marchar', tags: ['third-person', 'with-voseo'] }] }),
      entry('marcharse', { pos: 'VERB', glosses: ['to leave'] }),
    );
    const a = planDocument(docOf('Marcha'), registry, { dictionary, dictionaryId: 'd1' }).sentences[0].analyzed[0];
    expect(a.candidates[1]).toEqual({
      lemma: 'marchar', pos: 'VERB', morph: {}, confidence: 0.45, origin: 'dictionary', sourceId: 'd1', gloss: 'to leave', varieties: ['es-voseo'],
      notes: { formOfTags: ['third-person', 'with-voseo'], glossFrom: 'lemma', lemmaEntry: 'marcharse' },
    });
  });

  it('nothing joins a word whose first reading is a piece of a unit; an author\'s span replaces whatever joined', () => {
    const refine = vi.fn(keep);
    const unit = { head: 0, pieces: [0, 1], role: 'head', display: 'aufstehen' };
    const registry = fake({ steht: [hand('aufstehen', 'VERB', { unit }), hand('stehen', 'VERB')], auf: [hand('aufstehen', 'VERB', { unit: { ...unit, role: 'separable prefix' } })] }, { refine });
    const dictionary = dictOf(entry('steht', { pos: 'NOUN', glosses: ['x'] }), entry('auf', { pos: 'ADP', glosses: ['on'] }));
    const plan = planDocument(docOf('Steht auf'), registry, { dictionary, dictionaryId: 'd1' });
    expect(plan.sentences[0].analyzed).toEqual(planDocument(docOf('Steht auf'), registry).sentences[0].analyzed); // not even the marker
    expect(plan.dictionary).toMatchObject({ joined: 0, alongside: 0, units: 0 });
    expect(refine).not.toHaveBeenCalled();

    // an author's span replaces whatever joined
    const spanRegistry = fake({ abandono: [ABANDONAR] }, { refine: keep });
    const doc: CorpusDocument = { ...baseDoc(), sections: [{ paragraphs: [{ sentences: [{ text: 'Abandono', spans: [{ start: 0, end: 8, lemma: 'abandono', pos: 'NOUN', gloss: 'neglect (here)' }] }] }] }] };
    const a = planDocument(doc, spanRegistry, { dictionary: dictOf(NOUN), dictionaryId: 'd1' }).sentences[0].analyzed[0];
    expect(a.analyzer).toBe('import@2');
    expect(a.candidates).toHaveLength(1);
  });

  it('an adapter that cannot refine: nothing is copied onto the token, only the marker', () => {
    const registry = fake({ abandono: [ABANDONAR] });
    const plan = planDocument(docOf('Abandono'), registry, { dictionary: dictOf(VERB_FORM, NOUN), dictionaryId: 'd1' });
    const a = plan.sentences[0].analyzed[0];
    expect(a.candidates).toHaveLength(1);
    expect(a.candidates[0]).toEqual({ ...ABANDONAR, notes: { ipa: '/a.ban.do.no/', pronunciationSource: 'd1', dictionary: 'd1' } });
    expect(plan.dictionary).toEqual({ tool: 'dict:d1', tokens: 0, decided: 0, lemmaOnly: 0, joined: 0, units: 0, alongside: 1 });
  });

  it('without a dictionary nothing changes and refine is not called', () => {
    const refine = vi.fn(keep);
    const withRefine = planDocument(docOf('Al abandono'), fake({ abandono: [ABANDONAR], al: [hand('al', 'ADP')] }, { refine }));
    const without = planDocument(docOf('Al abandono'), fake({ abandono: [ABANDONAR], al: [hand('al', 'ADP')] }));
    expect(withRefine.sentences[0].analyzed).toEqual(without.sentences[0].analyzed);
    expect(withRefine.signature).toBe(without.signature);
    expect(withRefine.dictionary).toBeUndefined();
    expect(refine).not.toHaveBeenCalled();
  });

  it('a refine that loses a joined reading makes the plan throw', () => {
    const lose: Refine = (_t, analyzed) => analyzed.map((a) => ({ ...a, candidates: a.candidates.filter((c) => c.origin !== 'dictionary') }));
    expect(() => planDocument(docOf('Abandono'), fake({ abandono: [ABANDONAR] }, { refine: lose }), { dictionary: dictOf(NOUN), dictionaryId: 'd1' })).toThrow(/refine/);
  });
});

describe('the bundled Thai documents with a dictionary: this rule changes nothing (the Thai adapter cannot refine)', () => {
  const docs = loadBundledCorpus().filter((d) => d.lang === 'th');

  it('every word the adapter reads keeps exactly its own readings, with a dictionary that has another kind of reading for every word', () => {
    expect(docs.length).toBeGreaterThan(0);
    expect(real.get('th').refine).toBeUndefined();
    let read = 0;
    for (const doc of docs) {
      const dictionary = new Map<string, DictionaryEntry[]>(
        [...collectWordForms(doc, real)].map((f) => [f, [{ form: f, lang: 'th', pos: 'X', glosses: ['another kind of reading'] }, { form: f, lang: 'th', pos: 'INTJ', glosses: [], formOf: [{ lemma: `${f}x`, tags: [] }] }]]),
      );
      const plain = planDocument(doc, real);
      const plan = planDocument(doc, real, { dictionary, dictionaryId: 'd1' });
      expect(plan.dictionary).toMatchObject({ joined: 0, units: 0 });
      plan.sentences.forEach((s, si) => s.analyzed.forEach((a, ti) => {
        const before = plain.sentences[si].analyzed[ti];
        if (!a.token.isWord || a.analyzer !== before.analyzer || s.spanTokens.has(ti)) return; // a word only the dictionary knew, or an author's span
        if (!before.candidates.length) return;
        read++;
        // the same readings, in the same order; the first one only gained the marker's notes
        const [first, ...rest] = a.candidates;
        const [first0, ...rest0] = before.candidates;
        expect(rest).toEqual(rest0);
        expect({ ...first, notes: undefined }).toEqual({ ...first0, notes: undefined });
        expect(first.notes).toMatchObject({ ...(first0.notes ?? {}), dictionary: 'd1' });
        expect(a.candidates.some((c) => c.origin === 'dictionary' && c.sourceId === 'd1')).toBe(false);
      }));
    }
    expect(read).toBeGreaterThan(20);
  });
});

describe('importing a word with a joined reading', () => {
  const entries = [NOUN, VERB_FORM, entry('abandonar', { pos: 'VERB', glosses: ['to abandon (dictionary)'] })];
  const tokenRow = async (store: ReturnType<typeof createMemoryStore>) => {
    const token = (await store.tokens.all()).find((t) => t.surface === 'Abandono')!;
    const rows = await store.analyses.where('tokenId', token.id);
    expect(rows).toHaveLength(1);
    return rows[0];
  };

  it('left where it was joined: an alternative that carries its own gloss; the adapter\'s reading is the analysis', async () => {
    const store = createMemoryStore();
    const r = await importDocuments(store, fake({ abandono: [ABANDONAR] }, { refine: keep }), [docOf('Abandono')], { clock, lexicon: lexicon(entries) });
    expect(r.ok).toBe(true);
    const row = await tokenRow(store);
    expect(row).toMatchObject({ analyzer: FAKE, origin: 'hand', confidence: 1, lemmaId: ids.lemma('es', 'abandonar', 'VERB') });
    expect(row.alternatives).toEqual([{ lemmaId: ids.lemma('es', 'abandono', 'NOUN'), pos: 'NOUN', morph: {}, confidence: 0.45, gloss: 'abandonment; neglect', origin: 'dictionary', sourceId: 'd1' }]);
    expect((await store.lemmas.get(ids.lemma('es', 'abandonar', 'VERB')))!.gloss).toBe('hand gloss of abandonar'); // the hand gloss, not the dictionary's
    expect((await store.lemmas.get(ids.lemma('es', 'abandono', 'NOUN')))!.gloss).toBeUndefined(); // a reading beside a hand one does not fill a lemma
    expect(r.documents[0].analysisCoverage.bySource).toEqual({ adapter: 1, dictionary: 0, supplied: 0, corrected: 0 });
    const record = (await store.texts.get('text:es:test-doc'))!.transformations.find((t) => t.tool === 'dict:d1')!;
    expect(record.description).toContain('1 word token(s) the adapter reads also got the dictionary\'s reading(s) of another word or part of speech, after the adapter\'s own');
    expect(record.description).toContain('0 unit(s) written as several words');
  });

  it('moved to the front by refine: stored as the analysis, a dictionary reading, with its gloss on the lemma row', async () => {
    const store = createMemoryStore();
    await importDocuments(store, fake({ abandono: [ABANDONAR] }, { refine: dictionaryFirst }), [docOf('Abandono')], { clock, lexicon: lexicon(entries) });
    const row = await tokenRow(store);
    expect(row).toMatchObject({
      analyzer: FAKE, origin: 'dictionary', sourceId: 'd1', provenance: 'lexicon', confidence: 0.45, pos: 'NOUN', lemmaId: ids.lemma('es', 'abandono', 'NOUN'),
      notes: { ipa: '/a.ban.do.no/', senses: ['desertion'], dictionary: 'd1' },
    });
    expect((await store.lemmas.get(ids.lemma('es', 'abandono', 'NOUN')))!.gloss).toBe('abandonment; neglect');
    expect(row.alternatives).toEqual([{ lemmaId: ids.lemma('es', 'abandonar', 'VERB'), pos: 'VERB', morph: { Person: '1', Number: 'Sing' }, confidence: 1, origin: 'hand', sourceId: FAKE }]);
    expect((await store.lemmas.get(ids.lemma('es', 'abandonar', 'VERB')))!.gloss).toBe('hand gloss of abandonar');
  });

  it('a joined inflected form moved to the front: the lemma\'s gloss when the lemma entry is found, never the form\'s label', async () => {
    const table = { marcha: [hand('marcha', 'NOUN')] };
    const form = entry('marcha', { pos: 'VERB', glosses: ['third-person singular of marchar'], formOf: [{ lemma: 'marchar', tags: ['third-person'] }] });
    const withLemma = createMemoryStore();
    await importDocuments(withLemma, fake(table, { refine: dictionaryFirst }), [docOf('Marcha')], { clock, lexicon: lexicon([form, entry('marchar', { pos: 'VERB', glosses: ['to march', 'to go'] })]) });
    expect((await withLemma.lemmas.get(ids.lemma('es', 'marchar', 'VERB')))!.gloss).toBe('to march; to go');
    const withoutLemma = createMemoryStore();
    await importDocuments(withoutLemma, fake(table, { refine: dictionaryFirst }), [docOf('Marcha')], { clock, lexicon: lexicon([form]) });
    expect((await withoutLemma.lemmas.get(ids.lemma('es', 'marchar', 'VERB')))!.gloss).toBeUndefined();
    expect((await withoutLemma.analyses.all())[0]).toMatchObject({ origin: 'dictionary', pos: 'VERB' });
  });
});
