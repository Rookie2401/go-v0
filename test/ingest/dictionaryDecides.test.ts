/**
 * PLAN10 rule 1-6: the dictionary decides what the rules only guess. A FAKE adapter (the Spanish adapter with its `analyze`,
 * `morphFromTags` and `refine` replaced) and an in-memory dictionary stand in, so nothing here depends on the real Spanish readings.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryStore, ids, type AdapterRegistry, type AnalysisCandidate, type AnalyzedToken, type DictionaryEntry, type LanguageAdapter, type LexiconSource,
} from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { createMemoryLexiconSource } from '../../src/dict';
import { loadBundledCorpus, planDocument, planWithDictionary, previewDocuments, importDocuments, dictionaryCandidates, type CorpusDocument, type DocSpan } from '../../src/ingest';
import { BELOW_A_UNIT, CONFIRMED_BY_DICTIONARY, LEMMA_IN_DICTIONARY, analyseDocument } from '../../src/ingest/plan';
import { baseDoc, clock } from './helpers';

const real = createAdapterRegistry();
const esReal = real.get('es');
const FAKE = 'adapter-es@fake';

const entry = (form: string, over: Partial<DictionaryEntry> = {}): DictionaryEntry => ({ form, lang: 'es', glosses: [], ...over });

/** A reading by rule that its adapter only guesses at. */
const guess = (lemma: string, pos: AnalysisCandidate['pos'], morph: Record<string, string> = {}, over: Partial<AnalysisCandidate> = {}): AnalysisCandidate => ({
  lemma, pos, morph, confidence: 0.6, origin: 'rule', unconfirmed: true, notes: { source: 'rule', rule: `rule-${lemma}`, lemmaStatus: 'inferred' }, ...over,
});

const TAGS: Record<string, Record<string, string>> = {
  'first-person': { Person: '1' }, 'second-person': { Person: '2' }, 'third-person': { Person: '3' },
  singular: { Number: 'Sing' }, plural: { Number: 'Plur' }, imperfect: { Tense: 'Imp' }, present: { Tense: 'Pres' },
};
const morphFromTags = (tags: readonly string[]): Record<string, string> => Object.assign({}, ...tags.map((t) => TAGS[t] ?? {}));

/**
 * The Spanish adapter with a table of readings per normalized form (a form not in the table: no reading at all). The optional
 * methods the importer asks an adapter for are off unless a test supplies its own, so that no test depends on the real ones.
 */
function fake(table: Record<string, AnalysisCandidate[]>, over: Partial<LanguageAdapter> = {}): { adapter: LanguageAdapter; registry: AdapterRegistry } {
  const adapter: LanguageAdapter = {
    ...esReal, version: 'fake', morphFromTags, refine: undefined, lemmaVariants: undefined, varietiesFromTags: undefined,
    analyze: (tokens): AnalyzedToken[] => tokens.map((token) => ({
      token, analyzer: FAKE,
      candidates: token.isWord ? (table[token.normalized] ?? []).map((c) => ({ ...c, morph: { ...c.morph }, ...(c.notes ? { notes: { ...c.notes } } : {}) })) : [],
    })),
    ...over,
  };
  return { adapter, registry: { get: (lang) => (lang === 'es' ? adapter : real.get(lang)), all: () => real.all() } };
}

const docOf = (...sentences: Array<string | { text: string; spans?: DocSpan[] }>): CorpusDocument => ({
  ...baseDoc(), sections: [{ paragraphs: [{ sentences: sentences.map((s) => (typeof s === 'string' ? { text: s } : s)) }] }],
});
const dictOf = (...entries: DictionaryEntry[]): Map<string, DictionaryEntry[]> => {
  const m = new Map<string, DictionaryEntry[]>();
  for (const e of entries) m.set(e.form, [...(m.get(e.form) ?? []), e]);
  return m;
};

const TRABUCAR_RULE = guess('trabucar', 'VERB', { Person: '3', Number: 'Plur', Tense: 'Imp' }, {
  parts: [{ text: 'Trabucaban', start: 0, end: 10, lemma: 'trabucar', pos: 'VERB' }], varieties: ['rule-variety'],
});
const TRABUCAR_FORM = entry('trabucaban', { pos: 'VERB', formOf: [{ lemma: 'trabucar', tags: ['third-person', 'plural', 'imperfect'] }] });
const TRABUCAR_LEMMA = entry('trabucar', { pos: 'VERB', glosses: ['to upset', 'to stumble', 'to confuse'] });

describe('a word the rules only guessed at, decided by the dictionary', () => {
  it('keeps the rule features and parts, takes the lemma gloss, stores 0.7 as a dictionary reading', () => {
    const { registry } = fake({ trabucaban: [TRABUCAR_RULE] });
    const plan = planDocument(docOf('Trabucaban'), registry, { dictionary: dictOf(TRABUCAR_FORM, TRABUCAR_LEMMA), dictionaryId: 'd1' });
    const a = plan.sentences[0].analyzed[0];
    expect(a.analyzer).toBe('dict:d1');
    expect(a.candidates).toHaveLength(1);
    const [c] = a.candidates;
    expect(c).toEqual({
      lemma: 'trabucar', pos: 'VERB', morph: { Person: '3', Number: 'Plur', Tense: 'Imp' },
      parts: [{ text: 'Trabucaban', start: 0, end: 10, lemma: 'trabucar', pos: 'VERB' }], varieties: ['rule-variety'],
      gloss: 'to upset; to stumble', origin: 'dictionary', sourceId: 'd1', confidence: 0.7,
      notes: { formOfTags: ['third-person', 'plural', 'imperfect'], glossFrom: 'lemma', rule: 'rule-trabucar' },
    });
    expect(CONFIRMED_BY_DICTIONARY).toBe(0.7);
    expect(c.unconfirmed).toBeUndefined();
    expect(c.notes?.lemmaStatus).toBeUndefined();
    expect(plan.dictionary).toEqual({ tool: 'dict:d1', tokens: 0, decided: 1, lemmaOnly: 0, joined: 0, units: 0, alongside: 0 });
  });

  it('of two guesses the dictionary confirms one: the other is dropped', () => {
    const { registry } = fake({ trabucaban: [TRABUCAR_RULE, guess('trabucir', 'VERB', { Person: '3', Number: 'Plur', Tense: 'Imp' })] });
    const plan = planDocument(docOf('Trabucaban'), registry, { dictionary: dictOf(TRABUCAR_FORM, TRABUCAR_LEMMA), dictionaryId: 'd1' });
    const cands = plan.sentences[0].analyzed[0].candidates;
    expect(cands.map((c) => [c.lemma, c.confidence])).toEqual([['trabucar', 0.7]]);
  });

  it('two rule readings with the same lemma and different features give one reading each (those that do not contradict the tags)', () => {
    const { registry } = fake({
      trabucaban: [TRABUCAR_RULE, guess('trabucar', 'VERB', { Person: '1', Number: 'Sing', Tense: 'Imp' }), guess('trabucar', 'VERB', { Person: '1,3', Number: 'Plur', Tense: 'Imp' })],
    });
    const plan = planDocument(docOf('Trabucaban'), registry, { dictionary: dictOf(TRABUCAR_FORM, TRABUCAR_LEMMA), dictionaryId: 'd1' });
    // the first-person singular guess contradicts the dictionary's tags; "1,3" intersects "3" and so agrees
    expect(plan.sentences[0].analyzed[0].candidates.map((c) => c.morph.Person)).toEqual(['3', '1,3']);
  });

  it('a guess the dictionary contradicts on features: the dictionary reading stands alone, at the usual 0.6', () => {
    const { registry } = fake({ trabucaban: [TRABUCAR_RULE] });
    const form = entry('trabucaban', { pos: 'VERB', formOf: [{ lemma: 'trabucar', tags: ['first-person', 'singular', 'imperfect'] }] });
    const plan = planDocument(docOf('Trabucaban'), registry, { dictionary: dictOf(form, TRABUCAR_LEMMA), dictionaryId: 'd1' });
    const a = plan.sentences[0].analyzed[0];
    expect(a.analyzer).toBe('dict:d1');
    expect(a.candidates).toHaveLength(1);
    expect(a.candidates[0]).toMatchObject({ lemma: 'trabucar', morph: { Person: '1', Number: 'Sing', Tense: 'Imp' }, confidence: 0.6, origin: 'dictionary', sourceId: 'd1' });
    expect(a.candidates[0].parts).toBeUndefined();
    expect(a.candidates[0].notes?.rule).toBeUndefined();
  });

  it('a form with entries for two parts of speech: each is matched on its own; one no rule matched keeps the 0.45 of a many-reading form', () => {
    const { registry } = fake({ canto: [guess('cantar', 'VERB', { Person: '1', Number: 'Sing', Tense: 'Pres' })] });
    const dictionary = dictOf(
      entry('canto', { pos: 'NOUN', glosses: ['song', 'chant'] }),
      entry('canto', { pos: 'VERB', formOf: [{ lemma: 'cantar', tags: ['first-person', 'singular', 'present'] }] }),
      entry('cantar', { pos: 'VERB', glosses: ['to sing'] }),
    );
    const a = planDocument(docOf('Canto'), registry, { dictionary, dictionaryId: 'd1' }).sentences[0].analyzed[0];
    expect(a.candidates.map((c) => [c.lemma, c.pos, c.confidence, c.gloss])).toEqual([['canto', 'NOUN', 0.45, 'song; chant'], ['cantar', 'VERB', 0.7, 'to sing']]);
    expect(a.candidates[1].morph).toEqual({ Person: '1', Number: 'Sing', Tense: 'Pres' });
  });

  it('a verb and an auxiliary count as the same word class; a dictionary part of speech that is absent fits any', () => {
    const { registry } = fake({ habia: [guess('haber', 'AUX', { Tense: 'Imp' })], quizas: [guess('quizas', 'ADV')] });
    const dictionary = dictOf(entry('habia', { pos: 'VERB', formOf: [{ lemma: 'haber', tags: ['imperfect'] }] }), entry('quizas', { glosses: ['perhaps'] }));
    const [habia, quizas] = planDocument(docOf('Habia quizas'), registry, { dictionary, dictionaryId: 'd1' }).sentences[0].analyzed.filter((a) => a.token.isWord);
    expect(habia.candidates.map((c) => [c.pos, c.confidence])).toEqual([['VERB', 0.7]]); // the dictionary's part of speech
    expect(quizas.candidates.map((c) => [c.lemma, c.pos, c.confidence, c.gloss])).toEqual([['quizas', 'ADV', 0.7, 'perhaps']]); // the rule's part of speech
  });

  it('removes exact duplicates (same lemma, part of speech and features)', () => {
    const { registry } = fake({ trabucaban: [TRABUCAR_RULE, { ...TRABUCAR_RULE, notes: { source: 'rule', rule: 'another-rule' } }] });
    const a = planDocument(docOf('Trabucaban'), registry, { dictionary: dictOf(TRABUCAR_FORM), dictionaryId: 'd1' }).sentences[0].analyzed[0];
    expect(a.candidates).toHaveLength(1);
    expect(a.candidates[0].notes?.rule).toBe('rule-trabucar'); // the first stays
  });

  it('a form the dictionary does not have: guesses and analyzer unchanged', () => {
    const { registry } = fake({ trabucaban: [TRABUCAR_RULE, guess('trabucir', 'VERB')] });
    const plan = planDocument(docOf('Trabucaban'), registry, { dictionary: dictOf(entry('otra', { glosses: ['x'] })), dictionaryId: 'd1' });
    const plain = planDocument(docOf('Trabucaban'), registry);
    expect(plan.sentences[0].analyzed[0]).toEqual(plain.sentences[0].analyzed[0]);
    expect(plan.sentences[0].analyzed[0].analyzer).toBe(FAKE);
    expect(plan.sentences[0].analyzed[0].candidates.every((c) => c.unconfirmed === true)).toBe(true);
    expect(plan.dictionary).toMatchObject({ tokens: 0, decided: 0, lemmaOnly: 0, joined: 0, units: 0, alongside: 0 });
  });

  it('a reading the adapter vouches for is never replaced: the dictionary only stands beside it', () => {
    const sure: AnalysisCandidate = { lemma: 'cantar', pos: 'VERB', morph: { Tense: 'Pres' }, confidence: 1, origin: 'hand' };
    for (const cands of [[sure], [sure, guess('cantir', 'VERB')]]) {
      const { registry } = fake({ canto: cands });
      const dictionary = dictOf(entry('canto', { pos: 'NOUN', glosses: ['song'] }));
      const plan = planDocument(docOf('Canto'), registry, { dictionary, dictionaryId: 'd1' });
      const a = plan.sentences[0].analyzed[0];
      expect(a.analyzer).toBe(FAKE);
      expect(a.candidates.map((c) => c.lemma)).toEqual(cands.map((c) => c.lemma));
      expect(a.candidates[0].notes).toEqual({ dictionary: 'd1' });
      expect(plan.dictionary).toMatchObject({ tokens: 0, decided: 0, alongside: 1 });
    }
  });

  it('a form-of entry whose lemma has no entry (or no gloss): no gloss for the candidate, none for the lemma', async () => {
    const label = entry('trabucaban', { pos: 'VERB', glosses: ['third-person plural imperfect of trabucar'], formOf: [{ lemma: 'trabucar', tags: ['third-person', 'plural', 'imperfect'] }] });
    for (const dictionary of [[label], [label, entry('trabucar', { pos: 'VERB', glosses: [' '] })]]) {
      const { registry } = fake({ trabucaban: [TRABUCAR_RULE] });
      const c = planDocument(docOf('Trabucaban'), registry, { dictionary: dictOf(...dictionary), dictionaryId: 'd1' }).sentences[0].analyzed[0].candidates[0];
      expect(c.notes?.glossFrom).toBeUndefined();
      expect(c.confidence).toBe(0.7);
      const store = createMemoryStore();
      await importDocuments(store, registry, [docOf('Trabucaban')], { clock, lexicon: () => createMemoryLexiconSource('es', dictionary, { id: 'd1' }) });
      // the form's label never becomes the lemma's gloss
      expect((await store.lemmas.get(ids.lemma('es', 'trabucar', 'VERB')))!.gloss).toBeUndefined();
    }
  });
});

describe('dictionaryCandidates: the lemma\'s gloss', () => {
  const form = entry('canto', { pos: 'VERB', formOf: [{ lemma: 'cantar', tags: ['first-person'] }, { lemma: 'cantar2', tags: [] }] });
  it('prefers an entry with a compatible part of speech, takes its first two glosses, and marks where the gloss came from', () => {
    const lemmas = new Map([['cantar', [entry('cantar', { pos: 'NOUN', glosses: ['noun gloss'] }), entry('cantar', { pos: 'VERB', glosses: ['to sing', 'to chant', 'to tell'] })]]]);
    const [c, other] = dictionaryCandidates('canto', [form], 'd1', undefined, (l) => lemmas.get(l));
    expect(c).toMatchObject({ lemma: 'cantar', gloss: 'to sing; to chant', notes: { glossFrom: 'lemma', formOfTags: ['first-person'] } });
    expect(other.gloss).toBeUndefined(); // the second lemma has no entry
    expect(other.notes?.glossFrom).toBeUndefined();
  });
  it('skips lemma entries without glosses of their own (and form-of entries); without the callback nothing changes', () => {
    const lemmas = new Map([['cantar', [
      entry('cantar', { pos: 'VERB', glosses: [] }), entry('cantar', { pos: 'VERB', glosses: ['label of a form'], formOf: [{ lemma: 'x', tags: [] }] }),
      entry('cantar', { pos: 'AUX', glosses: ['to sing (aux)'] }),
    ]]]);
    expect(dictionaryCandidates('canto', [form], 'd1', undefined, (l) => lemmas.get(l))[0].gloss).toBe('to sing (aux)'); // a verb and an auxiliary fit
    expect(dictionaryCandidates('canto', [form], 'd1')[0].notes?.glossFrom).toBeUndefined();
  });
  it('no gloss rather than a wrong-class gloss: a verb form is never glossed with the noun\'s meaning', () => {
    const lemmas = new Map([['cantar', [entry('cantar', { pos: 'NOUN', glosses: ['singing'] })]]]);
    const [c] = dictionaryCandidates('canto', [form], 'd1', undefined, (l) => lemmas.get(l));
    expect(c.gloss).toBeUndefined();
    expect(c.notes?.glossFrom).toBeUndefined();
    // a form-of candidate with no part of speech fits any entry
    const noPos = entry('canto', { formOf: [{ lemma: 'cantar', tags: [] }] });
    expect(dictionaryCandidates('canto', [noPos], 'd1', undefined, (l) => lemmas.get(l))[0]).toMatchObject({ gloss: 'singing', notes: { glossFrom: 'lemma' } });
  });
});

describe('rule 2b: the dictionary lacks the form but has the lemma of a guess', () => {
  const RULE = guess('trabucar', 'VERB', { Person: '3', Number: 'Plur', Tense: 'Imp' }, { parts: [{ text: 'Trabucaban', start: 0, end: 10, lemma: 'trabucar', pos: 'VERB' }], register: ['colloquial' as never], varieties: ['v'] });
  const lemmaOnly = (...e: DictionaryEntry[]) => dictOf(...e);

  it('keeps the guesses whose lemma is listed, as the rule\'s readings with the lemma\'s gloss; drops the others', () => {
    const { registry } = fake({ trabucaban: [RULE, guess('trabucir', 'VERB'), guess('trabuco', 'NOUN', {}, { confidence: 0.5 })] });
    const plan = planDocument(docOf('Trabucaban'), registry, { dictionary: lemmaOnly(TRABUCAR_LEMMA, entry('trabuco', { pos: 'NOUN', glosses: ['a blunderbuss'] })), dictionaryId: 'd1' });
    const a = plan.sentences[0].analyzed[0];
    expect(a.analyzer).toBe('dict:d1');
    expect(a.candidates).toEqual([
      {
        lemma: 'trabucar', pos: 'VERB', morph: { Person: '3', Number: 'Plur', Tense: 'Imp' }, parts: RULE.parts, register: ['colloquial'], varieties: ['v'],
        gloss: 'to upset; to stumble', origin: 'rule', confidence: LEMMA_IN_DICTIONARY,
        notes: { source: 'rule', rule: 'rule-trabucar', lemmaStatus: 'in the dictionary', lemmaSource: 'd1' },
      },
      // a confidence below 0.6 is raised to 0.6
      { lemma: 'trabuco', pos: 'NOUN', morph: {}, gloss: 'a blunderbuss', origin: 'rule', confidence: 0.6, notes: { source: 'rule', rule: 'rule-trabuco', lemmaStatus: 'in the dictionary', lemmaSource: 'd1' } },
    ]);
    expect(LEMMA_IN_DICTIONARY).toBe(0.6);
    expect(plan.dictionary).toEqual({ tool: 'dict:d1', tokens: 0, decided: 0, lemmaOnly: 1, joined: 0, units: 0, alongside: 0 });
    expect(plan.coverage.bySource).toEqual({ adapter: 0, dictionary: 1, supplied: 0, corrected: 0 });
  });

  it('a higher confidence is left alone', () => {
    const { registry } = fake({ trabucaban: [{ ...RULE, confidence: 0.8 }] });
    const c = planDocument(docOf('Trabucaban'), registry, { dictionary: lemmaOnly(TRABUCAR_LEMMA), dictionaryId: 'd1' }).sentences[0].analyzed[0].candidates[0];
    expect(c.confidence).toBe(0.8);
  });

  it('nothing in the dictionary: the guesses stay, unconfirmed, with the adapter as analyzer', () => {
    const { registry } = fake({ trabucaban: [RULE, guess('trabucir', 'VERB')] });
    // a lemma entry of the wrong class, a form-of only entry and one without glosses do not count
    const dictionary = lemmaOnly(entry('trabucar', { pos: 'NOUN', glosses: ['x'] }), entry('trabucir', { pos: 'VERB', glosses: ['x'], formOf: [{ lemma: 'y', tags: [] }] }), entry('otra', { glosses: [] }));
    const plan = planDocument(docOf('Trabucaban'), registry, { dictionary, dictionaryId: 'd1' });
    expect(plan.sentences[0].analyzed[0]).toEqual(planDocument(docOf('Trabucaban'), registry).sentences[0].analyzed[0]);
    expect(plan.sentences[0].analyzed[0].analyzer).toBe(FAKE);
    expect(plan.dictionary).toMatchObject({ lemmaOnly: 0, decided: 0 });
  });

  it('a form the dictionary has is decided as before (the lemma entry alone does not matter)', () => {
    const { registry } = fake({ trabucaban: [RULE] });
    const plan = planDocument(docOf('Trabucaban'), registry, { dictionary: lemmaOnly(TRABUCAR_FORM, TRABUCAR_LEMMA), dictionaryId: 'd1' });
    expect(plan.dictionary).toMatchObject({ decided: 1, lemmaOnly: 0 });
    expect(plan.sentences[0].analyzed[0].candidates[0].origin).toBe('dictionary');
  });

  it('refine is called for a sentence with such a token', () => {
    const refine = vi.fn((_t: unknown, analyzed: AnalyzedToken[], _names: ReadonlySet<string>) => analyzed);
    const { registry } = fake({ trabucaban: [RULE] }, { refine });
    planDocument(docOf('Trabucaban'), registry, { dictionary: lemmaOnly(TRABUCAR_LEMMA), dictionaryId: 'd1' });
    expect(refine).toHaveBeenCalledTimes(1);
    expect(refine.mock.calls[0][2]).toEqual(new Set([FAKE, 'dict:d1']));
  });

  it('the second lookup round asks for the guessed lemmas, once; preview and import agree; the lemma row gets the gloss', async () => {
    const { registry } = fake({ trabucaban: [RULE, guess('trabucir', 'VERB')] });
    const mk = () => {
      const src = createMemoryLexiconSource('es', [TRABUCAR_LEMMA], { id: 'd1' });
      return { src, lookup: vi.spyOn(src, 'lookup'), lexicon: (lang: string) => (lang === 'es' ? src : undefined) };
    };
    const a = mk();
    const docs = [{ ...docOf('Trabucaban'), id: 'c1' }, { ...docOf('Trabucaban'), id: 'c2' }];
    await planWithDictionary(docs, registry, a.lexicon);
    expect(a.lookup.mock.calls.map((c) => c[0])).toEqual([['trabucaban'], ['trabucar', 'trabucir']]); // the second document asks for nothing new

    const doc = docOf('Trabucaban');
    const p = mk();
    const [preview] = await previewDocuments(createMemoryStore(), registry, [doc], { lexicon: p.lexicon });
    const i = mk();
    const store = createMemoryStore();
    const report = await importDocuments(store, registry, [doc], { clock, lexicon: i.lexicon });
    expect(preview.analysisCoverage).toEqual(report.documents[0].analysisCoverage);
    expect(report.documents[0].analysisCoverage.bySource).toEqual({ adapter: 0, dictionary: 1, supplied: 0, corrected: 0 });
    expect(p.lookup).toHaveBeenCalledTimes(2);
    expect(i.lookup).toHaveBeenCalledTimes(2);

    expect((await store.lemmas.get(ids.lemma('es', 'trabucar', 'VERB')))!.gloss).toBe('to upset; to stumble'); // the rule reading's lemma gets the dictionary's gloss
    expect((await store.lemmas.get(ids.lemma('es', 'trabucir', 'VERB')))).toBeUndefined(); // the dropped guess left nothing behind
    const token = (await store.tokens.all()).find((t) => t.surface === 'Trabucaban')!;
    const [row] = await store.analyses.where('tokenId', token.id);
    expect(row).toMatchObject({ analyzer: 'dict:d1', origin: 'rule', confidence: 0.6, notes: { lemmaStatus: 'in the dictionary', lemmaSource: 'd1' } });
    const record = (await store.texts.get('text:es:test-doc'))!.transformations.find((t) => t.tool === 'dict:d1')!;
    expect(record.description).toContain('1 word token(s) the dictionary does not list were read by rule from a lemma it does list');
  });

  it('no second round when no guess exists and nothing is form-of', async () => {
    const { registry } = fake({ hola: [{ lemma: 'hola', pos: 'INTJ', morph: {}, confidence: 1 }] });
    const src = createMemoryLexiconSource('es', [], { id: 'd1' });
    const lookup = vi.spyOn(src, 'lookup');
    await planWithDictionary([docOf('Hola')], registry, () => src);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});

describe('region labels as varieties (varietiesFromTags)', () => {
  const VARS: Record<string, string> = { Honduras: 'es-HN', 'Central-America': 'es-CA', 'with-voseo': 'es-voseo', Spain: 'es-ES' };
  const varietiesFromTags = (tags: readonly string[]) => tags.filter((t) => VARS[t]).map((t) => VARS[t]);
  const sense = (gloss: string, ...tags: string[]) => ({ gloss, tags });

  it('a headword: the labels common to every sense become varieties; one regional sense among general ones marks nothing', () => {
    const all = entry('chele', { pos: 'ADJ', glosses: ['pale', 'fair'], senses: [sense('pale', 'Honduras', 'Central-America'), sense('fair', 'Honduras', 'colloquial')] });
    expect(dictionaryCandidates('chele', [all], 'd1', undefined, undefined, varietiesFromTags)[0].varieties).toEqual(['es-HN']);
    const one = entry('chele', { pos: 'ADJ', glosses: ['pale', 'fair'], senses: [sense('pale', 'Honduras'), sense('fair')] });
    expect(dictionaryCandidates('chele', [one], 'd1', undefined, undefined, varietiesFromTags)[0].varieties).toBeUndefined();
    expect(dictionaryCandidates('chele', [entry('chele', { glosses: ['x'] })], 'd1', undefined, undefined, varietiesFromTags)[0].varieties).toBeUndefined(); // no senses: no labels
  });

  it('a form-of candidate: the relation\'s tags, and the lemma entry\'s every-sense labels when its gloss came from it', () => {
    const form = entry('cantás', { pos: 'VERB', formOf: [{ lemma: 'cantar', tags: ['second-person', 'with-voseo'] }] });
    const lemma = entry('cantar', { pos: 'VERB', glosses: ['to sing'], senses: [sense('to sing', 'Honduras', 'Central-America'), sense('to chant', 'Honduras')] });
    const lemmas = (l: string) => (l === 'cantar' ? [lemma] : undefined);
    expect(dictionaryCandidates('cantás', [form], 'd1', undefined, lemmas, varietiesFromTags)[0].varieties).toEqual(['es-voseo', 'es-HN']);
    // without the lemma's gloss (wrong class / no entry) only the relation's own tags count
    expect(dictionaryCandidates('cantás', [form], 'd1', undefined, undefined, varietiesFromTags)[0].varieties).toEqual(['es-voseo']);
    const noTags = entry('canto', { pos: 'VERB', formOf: [{ lemma: 'cantar', tags: ['first-person'] }] });
    expect(dictionaryCandidates('canto', [noTags], 'd1', undefined, undefined, varietiesFromTags)[0].varieties).toBeUndefined();
  });

  it('no function: nothing is set', () => {
    const e = entry('chele', { pos: 'ADJ', glosses: ['pale'], senses: [sense('pale', 'Honduras')] });
    expect(dictionaryCandidates('chele', [e], 'd1')[0].varieties).toBeUndefined();
    const form = entry('cantás', { pos: 'VERB', formOf: [{ lemma: 'cantar', tags: ['with-voseo'] }] });
    expect(dictionaryCandidates('cantás', [form], 'd1')[0].varieties).toBeUndefined();
  });

  it('planDocument passes the adapter\'s function; a merged reading keeps the union with the rule reading\'s varieties', () => {
    const form = entry('cantas', { pos: 'VERB', formOf: [{ lemma: 'cantar', tags: ['second-person', 'singular', 'with-voseo'] }] });
    const rule = guess('cantar', 'VERB', { Person: '2', Number: 'Sing' }, { varieties: ['es-AR'] });
    const withFn = fake({ cantas: [rule] }, { varietiesFromTags });
    const a = planDocument(docOf('Cantas'), withFn.registry, { dictionary: dictOf(form), dictionaryId: 'd1' }).sentences[0].analyzed[0];
    expect([...a.candidates[0].varieties!].sort()).toEqual(['es-AR', 'es-voseo']);
    const without = fake({ cantas: [rule] }, { varietiesFromTags: undefined });
    const b = planDocument(docOf('Cantas'), without.registry, { dictionary: dictOf(form), dictionaryId: 'd1' }).sentences[0].analyzed[0];
    expect(b.candidates[0].varieties).toEqual(['es-AR']); // only the rule's own
  });
});

describe('refine (PLAN10 rule 5)', () => {
  const table = { trabucaban: [TRABUCAR_RULE], hola: [] as AnalysisCandidate[] };
  const dictionary = dictOf(TRABUCAR_FORM, TRABUCAR_LEMMA, entry('hola', { pos: 'INTJ', glosses: ['hello'] }));

  it('is called exactly once for a sentence with a decided token, with the analyzer names, and its result is used', () => {
    const refine = vi.fn((_t: unknown, analyzed: AnalyzedToken[], _names: ReadonlySet<string>) => analyzed.map((a) => ({ ...a, candidates: [...a.candidates].reverse() })));
    const { registry } = fake({ ...table, otra: [guess('otro', 'ADJ')] }, { refine });
    const plan = planDocument(docOf('Trabucaban', 'Otra'), registry, { dictionary, dictionaryId: 'd1' });
    expect(refine).toHaveBeenCalledTimes(1);
    expect(refine.mock.calls[0][2]).toEqual(new Set([FAKE, 'dict:d1']));
    expect(plan.sentences[1].analyzed[0].candidates[0].lemma).toBe('otro');
  });

  it('is also called for a word only the dictionary knew', () => {
    const refine = vi.fn((_t, analyzed: AnalyzedToken[]) => analyzed);
    const { registry } = fake(table, { refine });
    planDocument(docOf('Hola'), registry, { dictionary, dictionaryId: 'd1' });
    expect(refine).toHaveBeenCalledTimes(1);
  });

  it('is never called without a dictionary, or when the dictionary changed no token', () => {
    const refine = vi.fn((_t, analyzed: AnalyzedToken[]) => analyzed);
    const { registry } = fake(table, { refine });
    planDocument(docOf('Trabucaban'), registry);
    planDocument(docOf('Trabucaban'), registry, {});
    planDocument(docOf('Trabucaban'), registry, { dictionary: dictOf(entry('otra', { glosses: ['x'] })), dictionaryId: 'd1' });
    // a word the adapter vouches for, of which the dictionary has no other kind of reading, only gets the marker: no readings
    // were supplied (a reading of another kind would join it: test/ingest/dictionaryBeside.test.ts)
    const sure = fake({ canto: [{ lemma: 'cantar', pos: 'VERB', morph: {}, confidence: 1 }] }, { refine });
    const plan = planDocument(docOf('Canto'), sure.registry, { dictionary: dictOf(entry('canto', { pos: 'VERB', formOf: [{ lemma: 'cantar', tags: ['first-person'] }] })), dictionaryId: 'd1' });
    expect(plan.dictionary).toMatchObject({ alongside: 1, joined: 0 });
    expect(refine).not.toHaveBeenCalled();
  });

  it('a refine that drops a reading, invents one, or returns the wrong number of tokens makes the plan throw', () => {
    const two = { trabucaban: [TRABUCAR_RULE, guess('trabucir', 'VERB', { Person: '3', Number: 'Plur', Tense: 'Imp' })] };
    const both = dictOf(TRABUCAR_FORM, entry('trabucaban', { pos: 'VERB', formOf: [{ lemma: 'trabucir', tags: ['third-person'] }] }));
    const run = (refine: LanguageAdapter['refine']) => () => planDocument(docOf('Trabucaban'), fake(two, { refine }).registry, { dictionary: both, dictionaryId: 'd1' });
    expect(run((_t, a) => a)).not.toThrow();
    expect(run((_t, a) => a.map((x) => ({ ...x, candidates: x.candidates.slice(0, 1) })))).toThrow(/refine/);
    expect(run((_t, a) => a.map((x) => ({ ...x, candidates: [...x.candidates, { lemma: 'nuevo', pos: 'NOUN' as const, morph: {}, confidence: 0.1 }] })))).toThrow(/refine/);
    expect(run((_t, a) => a.map((x) => ({ ...x, candidates: x.candidates.map((c) => ({ ...c, lemma: 'otro' })) })))).toThrow(/refine/);
    expect(run((_t, a) => a.slice(1))).toThrow(/refine/);
  });

  it('runs before the author spans: a span on a decided token still wins', () => {
    const seen: string[] = [];
    const refine = vi.fn((_t, analyzed: AnalyzedToken[]) => { seen.push(analyzed[0].analyzer); return analyzed; });
    const { registry } = fake(table, { refine });
    const doc = docOf({ text: 'Trabucaban', spans: [{ start: 0, end: 10, lemma: 'trabucar', pos: 'VERB', gloss: 'was upsetting (here)' }] });
    const plan = planDocument(doc, registry, { dictionary, dictionaryId: 'd1' });
    expect(refine).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['dict:d1']); // refine saw the dictionary's reading, not the span
    const a = plan.sentences[0].analyzed[0];
    expect(a.analyzer).toBe('import@2');
    expect(a.candidates[0]).toMatchObject({ origin: 'corpus', confidence: 1, gloss: 'was upsetting (here)' });
    expect(plan.sentences[0].spanTokens.has(0)).toBe(true);
  });
});

describe('the plan without a dictionary is what it was', () => {
  const docs = loadBundledCorpus().filter((d) => d.lang === 'es').slice(0, 3);

  it('nothing differs, nothing is refined, and an empty dictionary changes only the dictionary fields', () => {
    expect(docs.length).toBeGreaterThan(0);
    const refine = vi.fn(esReal.refine?.bind(esReal));
    const adapter: LanguageAdapter = { ...esReal, refine };
    const registry: AdapterRegistry = { get: (lang) => (lang === 'es' ? adapter : real.get(lang)), all: () => real.all() };
    for (const doc of docs) {
      const plain = planDocument(doc, registry);
      expect(plain.dictionary).toBeUndefined();
      expect(planDocument(doc, registry, {})).toEqual(plain);
      expect(planDocument(doc, registry)).toEqual(plain); // deterministic
      const { dictionary: d, signature: s, ...withEmpty } = planDocument(doc, registry, { dictionary: new Map(), dictionaryId: 'x' });
      const { dictionary: d0, signature: s0, ...rest } = plain;
      expect(withEmpty).toEqual(rest);
      expect(d).toEqual({ tool: 'dict:x', tokens: 0, decided: 0, lemmaOnly: 0, joined: 0, units: 0, alongside: 0 });
      expect([d0, s0 === s]).toEqual([undefined, false]);
    }
    expect(refine).not.toHaveBeenCalled();
  });
});

describe('statistics and the import', () => {
  const lexicon = (entries: DictionaryEntry[], src = createMemoryLexiconSource('es', entries, { id: 'd1' })) => (lang: string) => (lang === 'es' ? src : undefined);
  const entries = [TRABUCAR_FORM, TRABUCAR_LEMMA];

  it('decided tokens count as dictionary in the coverage breakdown', () => {
    const { registry } = fake({ trabucaban: [TRABUCAR_RULE], otra: [guess('otro', 'ADJ')], hola: [{ lemma: 'hola', pos: 'INTJ', morph: {}, confidence: 1 }] });
    const plan = planDocument(docOf('Trabucaban otra hola'), registry, { dictionary: dictOf(...entries), dictionaryId: 'd1' });
    expect(plan.coverage.bySource).toEqual({ adapter: 2, dictionary: 1, supplied: 0, corrected: 0 });
    expect(plan.coverage.analysed).toBe(3);
  });

  it('asks for the lemmas in a second round, and only once', async () => {
    const { registry } = fake({ trabucaban: [TRABUCAR_RULE] });
    const src = createMemoryLexiconSource('es', entries, { id: 'd1' });
    const lookup = vi.spyOn(src, 'lookup');
    const docs = [{ ...docOf('Trabucaban'), id: 'c1' }, { ...docOf('Trabucaban otra'), id: 'c2' }];
    const { plans } = await planWithDictionary(docs, registry, lexicon(entries, src));
    expect(lookup.mock.calls.map((c) => c[0])).toEqual([['trabucaban'], ['trabucar'], ['otra']]); // the 2nd document asks for its new form only; its lemma is already known
    expect(plans[0].sentences[0].analyzed[0].candidates[0]).toMatchObject({ gloss: 'to upset; to stumble', confidence: 0.7 });
    expect(plans[1].dictionary?.decided).toBe(1);
  });

  it('does not recurse: the lemma entries are not asked about their own form-of lemmas', async () => {
    const { registry } = fake({ trabucaban: [TRABUCAR_RULE] });
    const chain = [TRABUCAR_FORM, entry('trabucar', { pos: 'VERB', glosses: [], formOf: [{ lemma: 'trabuco', tags: [] }] }), entry('trabuco', { glosses: ['x'] })];
    const src = createMemoryLexiconSource('es', chain, { id: 'd1' });
    const lookup = vi.spyOn(src, 'lookup');
    await planWithDictionary([docOf('Trabucaban')], registry, lexicon(chain, src));
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('a form whose lemma is also a word of the text is asked once; no second round when there are no form-of entries', async () => {
    const { registry } = fake({});
    const src = createMemoryLexiconSource('es', [entry('trabucar', { glosses: ['x'] }), entry('hola', { glosses: ['y'] })], { id: 'd1' });
    const lookup = vi.spyOn(src, 'lookup');
    await planWithDictionary([docOf('Trabucar hola')], registry, lexicon([], src));
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('the preview and the import agree', async () => {
    const { registry } = fake({ trabucaban: [TRABUCAR_RULE] });
    const doc = docOf('Trabucaban');
    const [preview] = await previewDocuments(createMemoryStore(), registry, [doc], { lexicon: lexicon(entries) });
    const report = await importDocuments(createMemoryStore(), registry, [doc], { clock, lexicon: lexicon(entries) });
    expect(preview.analysisCoverage).toEqual(report.documents[0].analysisCoverage);
    expect(report.documents[0].analysisCoverage.bySource).toEqual({ adapter: 0, dictionary: 1, supplied: 0, corrected: 0 });
  });

  it('imports a decided word as a dictionary analysis with its lemma\'s gloss, and the record says so', async () => {
    const { registry } = fake({ trabucaban: [TRABUCAR_RULE] });
    const store = createMemoryStore();
    const r = await importDocuments(store, registry, [docOf('Trabucaban')], { clock, lexicon: lexicon(entries) });
    expect(r.ok).toBe(true);
    const token = (await store.tokens.all()).find((t) => t.surface === 'Trabucaban')!;
    const [row, ...more] = await store.analyses.where('tokenId', token.id);
    expect(more).toEqual([]);
    expect(row).toMatchObject({
      origin: 'dictionary', sourceId: 'd1', analyzer: 'dict:d1', provenance: 'lexicon', confidence: 0.7, pos: 'VERB', lemmaId: ids.lemma('es', 'trabucar', 'VERB'),
      morph: { Person: '3', Number: 'Plur', Tense: 'Imp' }, notes: { glossFrom: 'lemma', rule: 'rule-trabucar', formOfTags: ['third-person', 'plural', 'imperfect'] },
    });
    expect(row.parts).toHaveLength(1);
    expect(row.varieties).toEqual(['rule-variety']);
    expect((await store.lemmas.get(ids.lemma('es', 'trabucar', 'VERB')))!.gloss).toBe('to upset; to stumble');
    const text = (await store.texts.get('text:es:test-doc'))!;
    const record = text.transformations.find((t) => t.tool === 'dict:d1')!;
    expect(record.description).toContain('1 word token(s) the rules only guessed at were decided by the dictionary');
    expect(record.description).toContain('0 word token(s) the adapter could not analyse');
  });

  it('the dictionary tool is part of the signature, so installing a dictionary re-analyses the text', async () => {
    const { registry } = fake({ trabucaban: [TRABUCAR_RULE] });
    const store = createMemoryStore();
    await importDocuments(store, registry, [docOf('Trabucaban')], { clock });
    const before = (await store.analyses.all())[0];
    expect(before).toMatchObject({ analyzer: FAKE, origin: 'rule' });
    const again = await importDocuments(store, registry, [docOf('Trabucaban')], { clock, lexicon: lexicon(entries) });
    expect(again.documents[0].action).toBe('updated');
    expect((await store.analyses.all()).map((a) => a.analyzer)).toEqual(['dict:d1']);
  });

  it('a dictionary that cannot be read for the lemmas does not block: the import falls back and says why', async () => {
    const { registry } = fake({ trabucaban: [TRABUCAR_RULE] });
    const base = createMemoryLexiconSource('es', entries, { id: 'd1' });
    const src: LexiconSource = { ...base, lookup: async (forms) => { if (forms.includes('trabucar')) throw new Error('shard missing'); return base.lookup(forms); } };
    const r = await importDocuments(createMemoryStore(), registry, [docOf('Trabucaban')], { clock, lexicon: () => src });
    expect(r.documents[0].note).toBe('dictionary not used: shard missing');
  });
});

const lexiconOf = (entries: DictionaryEntry[]) => {
  const src = createMemoryLexiconSource('es', entries, { id: 'd1' });
  return { src, lookup: vi.spyOn(src, 'lookup'), lexicon: (lang: string) => (lang === 'es' ? src : undefined) };
};

describe('an entry that is only another spelling (altOf) is a reading of its target', () => {
  const LABEL = 'alternative form of oscuro';
  const OBSCURO = entry('obscuro', { pos: 'ADJ', glosses: [LABEL], altOf: ['oscuro'], senses: [{ gloss: LABEL, tags: ['alt-of', 'alternative', 'archaic'] }], ipa: '/obs/' });
  const OSCURO = entry('oscuro', { pos: 'ADJ', glosses: ['dark', 'obscure', 'gloomy'] });
  const lemmas = (...e: DictionaryEntry[]) => (l: string) => e.filter((x) => x.form === l);

  it('the candidate\'s lemma is the target, its gloss the target\'s own; the form\'s label stays in the notes', () => {
    expect(dictionaryCandidates('obscuro', [OBSCURO], 'd1', undefined, lemmas(OSCURO))).toEqual([{
      lemma: 'oscuro', pos: 'ADJ', morph: {}, confidence: 0.6, origin: 'dictionary', sourceId: 'd1', gloss: 'dark; obscure',
      notes: { ipa: '/obs/', altOf: LABEL, glossFrom: 'lemma' },
    }]);
  });

  it('with no entry for the target the candidate keeps its own gloss, and still reads as the target', () => {
    for (const lemmaEntries of [undefined, lemmas(), lemmas(entry('oscuro', { pos: 'NOUN', glosses: ['darkness'] }))]) {
      const [c] = dictionaryCandidates('obscuro', [OBSCURO], 'd1', undefined, lemmaEntries);
      expect(c).toMatchObject({ lemma: 'oscuro', gloss: LABEL, notes: { altOf: LABEL } });
      expect(c.notes?.glossFrom).toBeUndefined();
    }
  });

  it('one candidate per target; region labels of the spelling and of the target become varieties', () => {
    const two = entry('obscuro', { pos: 'ADJ', glosses: [LABEL, 'obsolete spelling of escuro'], altOf: ['oscuro', 'escuro'], senses: [{ gloss: LABEL, tags: ['alt-of', 'Mexico'] }, { gloss: 'obsolete spelling of escuro', tags: ['Alt-of', 'Mexico'] }] });
    const target = entry('oscuro', { pos: 'ADJ', glosses: ['dark'], senses: [{ gloss: 'dark', tags: ['Honduras'] }] });
    const varieties = (tags: readonly string[]) => tags.filter((t) => t === 'Mexico' || t === 'Honduras').map((t) => `es-${t.slice(0, 2).toUpperCase()}`);
    const cands = dictionaryCandidates('obscuro', [two], 'd1', undefined, lemmas(target), varieties);
    expect(cands.map((c) => [c.lemma, c.gloss, c.notes?.altOf, c.notes?.glossFrom, c.varieties])).toEqual([
      ['oscuro', 'dark', LABEL, 'lemma', ['es-ME', 'es-HO']],
      ['escuro', `${LABEL}; obsolete spelling of escuro`, LABEL, undefined, ['es-ME']],
    ]);
  });

  it('an entry with a sense of its own, a form-of entry, or one whose senses were not kept is not "only another spelling"', () => {
    const own = entry('obscuro', { pos: 'ADJ', glosses: ['murky'], altOf: ['oscuro'], senses: [{ gloss: 'murky' }, { gloss: LABEL, tags: ['alt-of'] }] });
    const noSenses = entry('obscuro', { pos: 'ADJ', glosses: [LABEL], altOf: ['oscuro'] });
    for (const e of [own, noSenses]) {
      const [c] = dictionaryCandidates('obscuro', [e], 'd1', undefined, lemmas(OSCURO));
      expect(c.lemma).toBe('obscuro');
      expect(c.notes?.altOf).toBeUndefined();
    }
    const formOf = entry('obscuros', { pos: 'ADJ', altOf: ['oscuros'], formOf: [{ lemma: 'obscuro', tags: ['plural'] }], senses: [{ gloss: 'x', tags: ['alt-of'] }] });
    expect(dictionaryCandidates('obscuros', [formOf], 'd1')[0]).toMatchObject({ lemma: 'obscuro', notes: { formOfTags: ['plural'] } });
  });

  it('an entry that is only another spelling is not a lemma\'s own entry: its label is no meaning', () => {
    const form = entry('obscuros', { pos: 'ADJ', formOf: [{ lemma: 'obscuro', tags: ['plural'] }] });
    const [c] = dictionaryCandidates('obscuros', [form], 'd1', undefined, lemmas(OBSCURO));
    expect(c.gloss).toBeUndefined();
    expect(c.notes?.glossFrom).toBeUndefined();
  });

  it('a rule reading with the target as its lemma merges with it, and carries what the rule says about the spelling', () => {
    const orthography = { modern: 'oscuro', period: 'es-hist', confidence: 0.9 };
    const { registry } = fake({ obscuro: [guess('oscuro', 'ADJ', { Gender: 'Masc' }, { orthography }), guess('obscurar', 'VERB')] });
    const plan = planDocument(docOf('Obscuro'), registry, { dictionary: dictOf(OBSCURO, OSCURO), dictionaryId: 'd1' });
    expect(plan.sentences[0].analyzed[0].candidates).toEqual([{
      lemma: 'oscuro', pos: 'ADJ', morph: { Gender: 'Masc' }, orthography, gloss: 'dark; obscure', origin: 'dictionary', sourceId: 'd1', confidence: 0.7,
      notes: { ipa: '/obs/', altOf: LABEL, glossFrom: 'lemma', rule: 'rule-oscuro' },
    }]);
    expect(plan.dictionary).toMatchObject({ decided: 1 });
  });

  it('the second lookup round asks for the target; the target\'s lemma row gets the target\'s gloss, never the label', async () => {
    const { registry } = fake({});
    const a = lexiconOf([OBSCURO, OSCURO]);
    const store = createMemoryStore();
    await importDocuments(store, registry, [docOf('Obscuro')], { clock, lexicon: a.lexicon });
    expect(a.lookup.mock.calls.map((c) => c[0])).toEqual([['obscuro'], ['oscuro']]);
    expect((await store.lemmas.get(ids.lemma('es', 'oscuro', 'ADJ')))!.gloss).toBe('dark; obscure');
    expect((await store.analyses.all())[0]).toMatchObject({ origin: 'dictionary', analyzer: 'dict:d1', notes: { altOf: LABEL, glossFrom: 'lemma' } });

    const b = lexiconOf([OBSCURO]);
    const bare = createMemoryStore();
    await importDocuments(bare, registry, [docOf('Obscuro')], { clock, lexicon: b.lexicon });
    const lemma = await bare.lemmas.get(ids.lemma('es', 'oscuro', 'ADJ'));
    expect(lemma).toBeDefined();
    expect(lemma!.gloss).toBeUndefined(); // "alternative form of oscuro" is not what oscuro means
  });
});

describe('a guessed unit written as several words is decided by the unit\'s lemma, never by the written form\'s entry', () => {
  // the shape the German adapter emits for a separable verb outside its word list: each piece keeps its ordinary readings and
  // gets, after them, an unconfirmed reading with the unit's lemma
  const unitReading = (head: number, particle: number, i: number): AnalysisCandidate => ({
    lemma: 'einladen', pos: 'VERB', morph: {}, confidence: 0.5, unconfirmed: true, origin: 'rule', notes: { source: 'rule', rule: 'stranded particle' },
    unit: { head, pieces: [head, particle], role: i === head ? 'head' : 'separable prefix', display: 'einladen' },
  });
  const sure = (lemma: string, pos: AnalysisCandidate['pos'], confidence = 1): AnalysisCandidate => ({ lemma, pos, morph: {}, confidence });
  const TABLE = { er: [sure('er', 'PRON')], 'lädt': [sure('laden', 'VERB')], uns: [sure('wir', 'PRON')], ein: [sure('ein', 'DET'), sure('ein', 'ADV', 0.3)] };
  const SENTENCE = 'Er lädt uns ein';
  function unitAdapter(table: Record<string, AnalysisCandidate[]>, over: Partial<LanguageAdapter> = {}, guessUnit = true) {
    const plain = fake(table).adapter;
    return fake(table, {
      analyze: (tokens) => {
        const out = plain.analyze(tokens);
        const head = tokens.findIndex((t) => t.normalized === 'lädt');
        const particle = tokens.findIndex((t) => t.normalized === 'ein');
        if (!guessUnit || head < 0 || particle < 0) return out;
        return out.map((a, i) => (i === head || i === particle ? { ...a, candidates: [...a.candidates, unitReading(head, particle, i)] } : a));
      },
      ...over,
    });
  }
  const EINLADEN = entry('einladen', { pos: 'VERB', glosses: ['to invite', 'to load in', 'to treat'] });
  const pieces = (plan: ReturnType<typeof planDocument>) => {
    const an = plan.sentences[0].analyzed;
    const head = an.findIndex((a) => a.token.normalized === 'lädt');
    const particle = an.findIndex((a) => a.token.normalized === 'ein');
    return { an, head, particle, laedt: an[head], ein: an[particle] };
  };

  it('5. with no dictionary the unit guesses stay where the adapter put them, after the ordinary readings', () => {
    const { laedt, ein, head, particle } = pieces(planDocument(docOf(SENTENCE), unitAdapter(TABLE).registry));
    expect(laedt.candidates.map((c) => [c.lemma, c.unconfirmed])).toEqual([['laden', undefined], ['einladen', true]]);
    expect(ein.candidates.map((c) => [c.lemma, c.pos, c.unconfirmed])).toEqual([['ein', 'DET', undefined], ['ein', 'ADV', undefined], ['einladen', 'VERB', true]]);
    expect(ein.candidates[2].unit).toEqual({ head, pieces: [head, particle], role: 'separable prefix', display: 'einladen' });
    expect(laedt.analyzer).toBe(FAKE);
  });

  it('3. the dictionary lists the unit\'s lemma: on every piece that reading leads, the rule\'s own, no longer a guess', () => {
    const refine = vi.fn((_t: unknown, analyzed: AnalyzedToken[], _names: ReadonlySet<string>, _given?: ReadonlySet<number>) => analyzed);
    const plan = planDocument(docOf(SENTENCE), unitAdapter(TABLE, { refine }).registry, { dictionary: dictOf(EINLADEN), dictionaryId: 'd1' });
    const { laedt, ein, head, particle, an } = pieces(plan);
    const promoted = (role: string) => ({
      lemma: 'einladen', pos: 'VERB', morph: {}, confidence: LEMMA_IN_DICTIONARY, origin: 'rule', gloss: 'to invite; to load in',
      unit: { head, pieces: [head, particle], role, display: 'einladen' },
      notes: { source: 'rule', rule: 'stranded particle', lemmaStatus: 'in the dictionary', lemmaSource: 'd1' },
    });
    expect(laedt.candidates).toEqual([promoted('head'), { lemma: 'laden', pos: 'VERB', morph: {}, confidence: BELOW_A_UNIT }]);
    // the other readings stay below it, at 0.4 at most (a lower one is left as it is)
    expect(ein.candidates).toEqual([promoted('separable prefix'), { lemma: 'ein', pos: 'DET', morph: {}, confidence: 0.4 }, { lemma: 'ein', pos: 'ADV', morph: {}, confidence: 0.3 }]);
    expect([laedt.analyzer, ein.analyzer]).toEqual(['dict:d1', 'dict:d1']);
    expect(an.filter((a) => a.token.isWord && a !== laedt && a !== ein).every((a) => a.analyzer === FAKE)).toBe(true);
    expect(refine).toHaveBeenCalledTimes(1);
    expect(refine.mock.calls[0][3]).toEqual(new Set([head, particle]));
    expect(plan.dictionary).toEqual({ tool: 'dict:d1', tokens: 0, decided: 0, lemmaOnly: 0, joined: 0, units: 1, alongside: 0 });
    expect(plan.coverage.bySource).toEqual({ adapter: 2, dictionary: 2, supplied: 0, corrected: 0 });
    expect(BELOW_A_UNIT).toBe(0.4);
  });

  it('3. the entry must be the lemma\'s own, of the right word class: a noun or a form-of entry confirms nothing', () => {
    for (const e of [entry('einladen', { pos: 'NOUN', glosses: ['inviting'] }), entry('einladen', { pos: 'VERB', glosses: ['x'], formOf: [{ lemma: 'y', tags: [] }] })]) {
      const plan = planDocument(docOf(SENTENCE), unitAdapter(TABLE).registry, { dictionary: dictOf(e), dictionaryId: 'd1' });
      expect(pieces(plan).laedt.candidates.map((c) => c.lemma)).toEqual(['laden']);
      expect(plan.dictionary).toMatchObject({ units: 0 });
    }
  });

  it('4. the dictionary does not list the unit\'s lemma: the guess goes from every piece and nothing else about those words changes', () => {
    const refine = vi.fn((_t: unknown, analyzed: AnalyzedToken[], _names: ReadonlySet<string>, _given?: ReadonlySet<number>) => analyzed);
    // the dictionary has the written forms (and so marks the words), not the unit's lemma
    const dictionary = dictOf(entry('lädt', { pos: 'VERB', formOf: [{ lemma: 'laden', tags: [] }] }), entry('ein', { pos: 'DET', glosses: ['a'] }));
    const plan = planDocument(docOf(SENTENCE), unitAdapter(TABLE, { refine }).registry, { dictionary, dictionaryId: 'd1' });
    const withoutGuess = planDocument(docOf(SENTENCE), unitAdapter(TABLE, { refine }, false).registry, { dictionary, dictionaryId: 'd1' });
    expect(plan.sentences[0].analyzed).toEqual(withoutGuess.sentences[0].analyzed);
    expect(pieces(plan).laedt.candidates.map((c) => c.lemma)).toEqual(['laden']);
    expect(pieces(plan).laedt.analyzer).toBe(FAKE);
    expect(plan.dictionary).toEqual(withoutGuess.dictionary);
    expect(plan.dictionary).toMatchObject({ units: 0, alongside: 2 });
    expect(refine).not.toHaveBeenCalled(); // nothing was supplied, so there is nothing to order again
  });

  it('1. the written form\'s entry never replaces or drops a unit reading: a guessed piece is decided, the unit reading is judged on its own', () => {
    const guessed = { ...TABLE, 'lädt': [guess('laden', 'VERB', { Person: '3' }), guess('lädten', 'VERB')] };
    const form = entry('lädt', { pos: 'VERB', formOf: [{ lemma: 'laden', tags: ['third-person'] }] });
    const laden = entry('laden', { pos: 'VERB', glosses: ['to load'] });
    // rule 1 (the form has an entry) with the unit's lemma listed: the merged reading and the unit reading both stand
    const both = pieces(planDocument(docOf(SENTENCE), unitAdapter(guessed).registry, { dictionary: dictOf(form, laden, EINLADEN), dictionaryId: 'd1' })).laedt;
    expect(both.candidates.map((c) => [c.lemma, c.origin, c.confidence, !!c.unit])).toEqual([['einladen', 'rule', 0.6, true], ['laden', 'dictionary', 0.4, false]]);
    // rule 2b (the form has no entry, its lemma has): the same
    const byLemma = planDocument(docOf(SENTENCE), unitAdapter(guessed).registry, { dictionary: dictOf(laden, EINLADEN), dictionaryId: 'd1' });
    expect(pieces(byLemma).laedt.candidates.map((c) => [c.lemma, c.origin, c.confidence, !!c.unit])).toEqual([['einladen', 'rule', 0.6, true], ['laden', 'rule', 0.4, false]]);
    expect(byLemma.dictionary).toMatchObject({ lemmaOnly: 1, units: 1 });
    // the form decided, the unit's lemma not listed: only the unit guess goes
    const decided = planDocument(docOf(SENTENCE), unitAdapter(guessed).registry, { dictionary: dictOf(form, laden), dictionaryId: 'd1' });
    expect(pieces(decided).laedt.candidates.map((c) => [c.lemma, c.origin, c.confidence])).toEqual([['laden', 'dictionary', 0.7]]);
    expect(decided.dictionary).toMatchObject({ decided: 1, units: 0 });
    // nothing in the dictionary for the form or its lemma: the guesses about the word stay, the unit is still judged by its own lemma
    const untouched = pieces(planDocument(docOf(SENTENCE), unitAdapter(guessed).registry, { dictionary: dictOf(EINLADEN), dictionaryId: 'd1' })).laedt;
    expect(untouched.candidates.map((c) => [c.lemma, c.unconfirmed, c.confidence])).toEqual([['einladen', undefined, 0.6], ['laden', true, 0.4], ['lädten', true, 0.4]]);
  });

  it('1. a piece that has only the unit guess is read from the form\'s entry, and the unit reading still waits for its own verdict', () => {
    const noReading = { ...TABLE, ein: [] };
    const dictionary = dictOf(entry('ein', { pos: 'DET', glosses: ['a'] }), EINLADEN);
    const { ein } = pieces(planDocument(docOf(SENTENCE), unitAdapter(noReading).registry, { dictionary, dictionaryId: 'd1' }));
    expect(ein.candidates.map((c) => [c.lemma, c.pos, c.origin, c.confidence])).toEqual([['einladen', 'VERB', 'rule', 0.6], ['ein', 'DET', 'dictionary', 0.4]]);
  });

  it('a unit the word list vouches for is never touched by the dictionary', () => {
    const unit = (i: number) => ({ head: 1, pieces: [1, 3], role: i === 1 ? 'head' : 'separable prefix', display: 'einladen' });
    const { adapter } = fake(TABLE);
    const confirmed = fake(TABLE, { analyze: (tokens) => adapter.analyze(tokens).map((a, i) => (a.token.normalized === 'lädt' || a.token.normalized === 'ein'
      ? { ...a, candidates: [{ lemma: 'einladen', pos: 'VERB' as const, morph: {}, confidence: 0.9, unit: unit(i) }, ...a.candidates] } : a)) });
    const dictionary = dictOf(entry('lädt', { pos: 'NOUN', glosses: ['x'] }), entry('ein', { pos: 'NUM', glosses: ['one'] }));
    const plan = planDocument(docOf(SENTENCE), confirmed.registry, { dictionary, dictionaryId: 'd1' });
    expect(plan.sentences[0].analyzed).toEqual(planDocument(docOf(SENTENCE), confirmed.registry).sentences[0].analyzed);
    expect(plan.dictionary).toMatchObject({ units: 0, joined: 0, alongside: 0 });
  });

  it('2. the second lookup round asks for the unit\'s lemma; the import stores the unit on every piece and the lemma row has the gloss', async () => {
    const a = lexiconOf([EINLADEN]);
    const store = createMemoryStore();
    const r = await importDocuments(store, unitAdapter(TABLE).registry, [docOf(SENTENCE)], { clock, lexicon: a.lexicon });
    expect(r.ok).toBe(true);
    expect(a.lookup.mock.calls.map((c) => c[0])).toEqual([['er', 'lädt', 'uns', 'ein'], ['einladen']]);
    const tokens = await store.tokens.all();
    const laedt = tokens.find((t) => t.surface === 'lädt')!;
    const ein = tokens.find((t) => t.surface === 'ein')!;
    const [al] = await store.analyses.where('tokenId', laedt.id);
    const [ae] = await store.analyses.where('tokenId', ein.id);
    expect(al).toMatchObject({ origin: 'rule', analyzer: 'dict:d1', confidence: 0.6, provenance: 'machine', lemmaId: ids.lemma('es', 'einladen', 'VERB'), notes: { lemmaStatus: 'in the dictionary', lemmaSource: 'd1' } });
    expect(al.unit).toEqual({ headTokenId: laedt.id, pieceTokenIds: [laedt.id, ein.id], role: 'head', display: 'einladen' });
    expect(ae.unit).toEqual({ headTokenId: laedt.id, pieceTokenIds: [laedt.id, ein.id], role: 'separable prefix', display: 'einladen' });
    expect(ae.lemmaId).toBe(al.lemmaId);
    expect((await store.lemmas.get(al.lemmaId!))!.gloss).toBe('to invite; to load in');
    const record = (await store.texts.get('text:es:test-doc'))!.transformations.find((t) => t.tool === 'dict:d1')!;
    expect(record.description).toContain('1 unit(s) written as several words were read by rule from a lemma the dictionary lists');
    // preview and import agree
    const [preview] = await previewDocuments(createMemoryStore(), unitAdapter(TABLE).registry, [docOf(SENTENCE)], { lexicon: lexiconOf([EINLADEN]).lexicon });
    expect(preview.analysisCoverage).toEqual(r.documents[0].analysisCoverage);
  });
});

describe('lemmaVariants: a lemma the dictionary files under another headword', () => {
  const lemmaVariants = (lemma: string, pos?: AnalysisCandidate['pos']) => (pos === 'VERB' ? [`${lemma}nos`, `${lemma}se`] : []);
  const PRONOMINAL = entry('arrepentirse', { pos: 'VERB', glosses: ['to regret', 'to repent'] });
  const FORM = entry('arrepiento', { pos: 'VERB', formOf: [{ lemma: 'arrepentir', tags: ['first-person'] }] });
  const RULE = guess('arrepentir', 'VERB', { Person: '1' });

  it('a form-of candidate: the variant\'s entry gives the gloss, the lemma stays, the notes name the headword used', () => {
    const lemmas = (l: string) => [PRONOMINAL].filter((e) => e.form === l);
    const [c] = dictionaryCandidates('arrepiento', [FORM], 'd1', undefined, lemmas, undefined, lemmaVariants);
    expect(c).toMatchObject({ lemma: 'arrepentir', gloss: 'to regret; to repent', notes: { glossFrom: 'lemma', lemmaEntry: 'arrepentirse', formOfTags: ['first-person'] } });
    // without the function, or for another word class, there is no gloss
    expect(dictionaryCandidates('arrepiento', [FORM], 'd1', undefined, lemmas)[0].gloss).toBeUndefined();
    expect(dictionaryCandidates('arrepiento', [{ ...FORM, pos: 'NOUN' }], 'd1', undefined, lemmas, undefined, lemmaVariants)[0].gloss).toBeUndefined();
  });

  it('the lemma\'s own entry comes first; variants are tried in order; a variant of the wrong word class is no entry', () => {
    const own = entry('arrepentir', { pos: 'VERB', glosses: ['own entry'] });
    const first = entry('arrepentirnos', { pos: 'VERB', glosses: ['first variant'] });
    const pick = (...e: DictionaryEntry[]) => dictionaryCandidates('arrepiento', [FORM], 'd1', undefined, (l) => e.filter((x) => x.form === l), undefined, lemmaVariants)[0];
    expect([pick(own, first, PRONOMINAL).gloss, pick(own, first, PRONOMINAL).notes?.lemmaEntry]).toEqual(['own entry', undefined]);
    expect([pick(first, PRONOMINAL).gloss, pick(first, PRONOMINAL).notes?.lemmaEntry]).toEqual(['first variant', 'arrepentirnos']);
    expect(pick({ ...first, pos: 'NOUN' }, PRONOMINAL).notes?.lemmaEntry).toBe('arrepentirse');
    // an own entry of the wrong word class does not stop the search
    expect(pick({ ...own, pos: 'NOUN' }, PRONOMINAL).notes?.lemmaEntry).toBe('arrepentirse');
  });

  it('a decided word keeps the adapter\'s lemma and gets the variant\'s gloss', () => {
    const { registry } = fake({ arrepiento: [RULE] }, { lemmaVariants });
    const [c] = planDocument(docOf('Arrepiento'), registry, { dictionary: dictOf(FORM, PRONOMINAL), dictionaryId: 'd1' }).sentences[0].analyzed[0].candidates;
    expect(c).toMatchObject({ lemma: 'arrepentir', confidence: 0.7, origin: 'dictionary', gloss: 'to regret; to repent', notes: { lemmaEntry: 'arrepentirse', rule: 'rule-arrepentir' } });
  });

  it('rule 2b: a guess whose lemma is filed under a variant is confirmed by it', () => {
    const { registry } = fake({ arrepiento: [RULE, guess('arrepientar', 'VERB')] }, { lemmaVariants });
    const plan = planDocument(docOf('Arrepiento'), registry, { dictionary: dictOf(PRONOMINAL), dictionaryId: 'd1' });
    expect(plan.sentences[0].analyzed[0].candidates).toEqual([{
      lemma: 'arrepentir', pos: 'VERB', morph: { Person: '1' }, confidence: 0.6, origin: 'rule', gloss: 'to regret; to repent',
      notes: { source: 'rule', rule: 'rule-arrepentir', lemmaStatus: 'in the dictionary', lemmaSource: 'd1', lemmaEntry: 'arrepentirse' },
    }]);
    expect(plan.dictionary).toMatchObject({ lemmaOnly: 1 });
    // an adapter without the function: the guesses stay
    const none = planDocument(docOf('Arrepiento'), fake({ arrepiento: [RULE] }).registry, { dictionary: dictOf(PRONOMINAL), dictionaryId: 'd1' });
    expect(none.sentences[0].analyzed[0].candidates[0].unconfirmed).toBe(true);
  });

  it('a guessed unit whose lemma is filed under a variant is confirmed by it', () => {
    const unit = { head: 0, pieces: [0], role: 'head', display: 'arrepentir' };
    const { registry } = fake({ arrepiento: [{ lemma: 'pentir', pos: 'VERB', morph: {}, confidence: 1 }, { ...RULE, unit }] }, { lemmaVariants });
    const [c] = planDocument(docOf('Arrepiento'), registry, { dictionary: dictOf(PRONOMINAL), dictionaryId: 'd1' }).sentences[0].analyzed[0].candidates;
    expect(c).toMatchObject({ lemma: 'arrepentir', unit, gloss: 'to regret; to repent', notes: { lemmaEntry: 'arrepentirse' } });
    expect(c.unconfirmed).toBeUndefined();
  });

  it('the variants are part of the second lookup round (form-of lemmas and guessed lemmas alike); the lemma row gets the gloss', async () => {
    const { registry } = fake({ arrepiento: [RULE], otra: [guess('otrar', 'VERB'), guess('otro', 'ADJ')] }, { lemmaVariants });
    const a = lexiconOf([FORM, PRONOMINAL]);
    const store = createMemoryStore();
    await importDocuments(store, registry, [docOf('Arrepiento otra')], { clock, lexicon: a.lexicon });
    expect(a.lookup.mock.calls.map((c) => c[0])).toEqual([
      ['arrepiento', 'otra'],
      ['arrepentir', 'arrepentirnos', 'arrepentirse', 'otrar', 'otrarnos', 'otrarse', 'otro'], // an adjective has no variants here
    ]);
    const lemma = await store.lemmas.get(ids.lemma('es', 'arrepentir', 'VERB'));
    expect(lemma).toMatchObject({ lemma: 'arrepentir', gloss: 'to regret; to repent' });
    expect(await store.lemmas.get(ids.lemma('es', 'arrepentirse', 'VERB'))).toBeUndefined(); // the reading keeps the adapter's lemma
  });
});

describe('one analysis per document', () => {
  const TABLE = { trabucaban: [TRABUCAR_RULE], hola: [{ lemma: 'hola', pos: 'INTJ' as const, morph: {}, confidence: 1 }] };
  const DOC = docOf('Trabucaban', 'Hola', 'Hola trabucaban');
  const counting = () => {
    const { adapter, registry } = fake(TABLE);
    const analyze = vi.spyOn(adapter, 'analyze');
    const tokenize = vi.spyOn(adapter, 'tokenize');
    return { registry, analyze, tokenize };
  };

  it('planWithDictionary analyses every sentence once (lookups and plan start from the same analysis)', async () => {
    const c = counting();
    const { plans } = await planWithDictionary([DOC], c.registry, lexiconOf([TRABUCAR_FORM, TRABUCAR_LEMMA]).lexicon);
    expect(c.analyze).toHaveBeenCalledTimes(3);
    expect(c.tokenize).toHaveBeenCalledTimes(3);
    expect(plans[0].dictionary).toMatchObject({ decided: 2 });
    // and so does the preview
    const p = counting();
    await previewDocuments(createMemoryStore(), p.registry, [DOC], { lexicon: lexiconOf([TRABUCAR_FORM, TRABUCAR_LEMMA]).lexicon });
    expect(p.analyze.mock.calls.length).toBeLessThanOrEqual(6); // validation reads the text itself; planning adds one pass, not two
  });

  it('a plan made from a supplied analysis equals the plan that analyses the text itself', () => {
    const { registry } = fake(TABLE);
    const options = { dictionary: dictOf(TRABUCAR_FORM, TRABUCAR_LEMMA), dictionaryId: 'd1' };
    const c = counting();
    const analysis = analyseDocument(DOC, c.registry);
    expect(c.analyze).toHaveBeenCalledTimes(3);
    const fromAnalysis = planDocument(DOC, c.registry, { ...options, analysis });
    expect(c.analyze).toHaveBeenCalledTimes(3); // not analysed again
    expect(fromAnalysis).toEqual({ ...planDocument(DOC, registry, options), adapter: fromAnalysis.adapter });
    expect(planDocument(DOC, c.registry, { analysis })).toEqual({ ...planDocument(DOC, registry), adapter: fromAnalysis.adapter });
    // the analysis is not changed by the plan: a second plan from it is the same
    expect(planDocument(DOC, c.registry, { ...options, analysis }).signature).toBe(fromAnalysis.signature);
  });

  it('an analysis of another text is refused; without the option the plan analyses the text as before', () => {
    const c = counting();
    const other = analyseDocument(docOf('Hola', 'Trabucaban'), c.registry);
    expect(() => planDocument(DOC, c.registry, { analysis: other })).toThrow(/analysis supplied/);
    c.analyze.mockClear();
    planDocument(DOC, c.registry);
    expect(c.analyze).toHaveBeenCalledTimes(3);
    // no dictionary installed: planWithDictionary plans exactly as planDocument does
    c.analyze.mockClear();
    void planWithDictionary([DOC], c.registry);
    expect(c.analyze).toHaveBeenCalledTimes(3);
  });
});

describe('where the dictionary supplies the list, a headword comes before an inflected form or another spelling', () => {
  // dictionary order: the inflected form first, then another spelling, then two headwords
  const FORM = entry('canto', { pos: 'VERB', formOf: [{ lemma: 'cantar', tags: ['first-person', 'singular', 'present'] }], respelling: 'can-to', pronunciations: [{ respelling: 'can-to' }, { respelling: 'cán-to' }] });
  const SPELLING = entry('canto', { pos: 'ADJ', glosses: ['obsolete spelling of cuanto'], altOf: ['cuanto'], senses: [{ gloss: 'obsolete spelling of cuanto', tags: ['alt-of'] }] });
  const NOUN = entry('canto', { pos: 'NOUN', glosses: ['song'] });
  const EDGE = entry('canto', { pos: 'NOUN', glosses: ['edge'], etymology: 2 });
  const dictionary = dictOf(FORM, SPELLING, NOUN, EDGE, entry('cantar', { pos: 'VERB', glosses: ['to sing'] }));
  const order = (cands: readonly AnalysisCandidate[]) => cands.map((c) => [c.lemma, c.pos, c.gloss]);

  it('a word only the dictionary knows: headwords first, each group in dictionary order, before refine runs', () => {
    const seen: unknown[] = [];
    const refine = vi.fn((_t: unknown, analyzed: AnalyzedToken[]) => { seen.push(order(analyzed[0].candidates)); return analyzed; });
    const { registry } = fake({}, { refine });
    const a = planDocument(docOf('Canto'), registry, { dictionary, dictionaryId: 'd1' }).sentences[0].analyzed[0];
    const expected = [['canto', 'NOUN', 'song'], ['canto', 'NOUN', 'edge'], ['cantar', 'VERB', 'to sing'], ['cuanto', 'ADJ', 'obsolete spelling of cuanto']];
    expect(order(a.candidates)).toEqual(expected);
    expect(seen).toEqual([expected]); // refine was handed the list in that order
    // the list of the form's pronunciations is still on the first reading, and only there
    expect(a.candidates.map((c) => c.notes?.readings)).toEqual([['can-to', 'cán-to'], undefined, undefined, undefined]);
    expect(a.candidates[2].notes).toEqual({ respelling: 'can-to', formOfTags: ['first-person', 'singular', 'present'], glossFrom: 'lemma' });
    // dictionaryCandidates itself keeps dictionary order (the reader's view of an entry list does not change)
    expect(dictionaryCandidates('canto', dictionary.get('canto')!, 'd1').map((c) => c.pos)).toEqual(['VERB', 'ADJ', 'NOUN', 'NOUN']);
  });

  it('a decided word: the same order, and a reading the rule and the dictionary agree on keeps its place within its group', () => {
    const { registry } = fake({ canto: [guess('cantar', 'VERB', { Person: '1' }), guess('cuanto', 'ADJ', { Gender: 'Masc' }), guess('cantir', 'VERB')] });
    const a = planDocument(docOf('Canto'), registry, { dictionary, dictionaryId: 'd1' }).sentences[0].analyzed[0];
    // (the two noun headwords say the same - lemma, part of speech, features - and a decided word lists such a reading once)
    expect(a.candidates.map((c) => [c.lemma, c.pos, c.confidence, c.gloss])).toEqual([['canto', 'NOUN', 0.45, 'song'], ['cantar', 'VERB', 0.7, 'to sing'], ['cuanto', 'ADJ', 0.7, 'obsolete spelling of cuanto']]);
    expect(a.candidates[1].morph).toEqual({ Person: '1' });
    expect(a.candidates[0].notes?.readings).toEqual(['can-to', 'cán-to']);
    expect(a.candidates[1].notes?.readings).toBeUndefined();
  });

  it('a list that is already headword-first, or has no headword, is left as the dictionary gives it', () => {
    const { registry } = fake({});
    const noHead = planDocument(docOf('Canto'), registry, { dictionary: dictOf(FORM, SPELLING), dictionaryId: 'd1' }).sentences[0].analyzed[0];
    expect(noHead.candidates.map((c) => [c.lemma, c.notes?.readings])).toEqual([['cantar', ['can-to', 'cán-to']], ['cuanto', undefined]]);
    const headFirst = planDocument(docOf('Canto'), registry, { dictionary: dictOf(NOUN, FORM), dictionaryId: 'd1' }).sentences[0].analyzed[0];
    expect(headFirst.candidates.map((c) => c.lemma)).toEqual(['canto', 'cantar']);
  });
});
