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
import { CONFIRMED_BY_DICTIONARY, LEMMA_IN_DICTIONARY } from '../../src/ingest/plan';
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

/** The Spanish adapter with a table of readings per normalized form (a form not in the table: no reading at all). */
function fake(table: Record<string, AnalysisCandidate[]>, over: Partial<LanguageAdapter> = {}): { adapter: LanguageAdapter; registry: AdapterRegistry } {
  const adapter: LanguageAdapter = {
    ...esReal, version: 'fake', morphFromTags,
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
    expect(plan.dictionary).toEqual({ tool: 'dict:d1', tokens: 0, decided: 1, lemmaOnly: 0, alongside: 0 });
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
    expect(plan.dictionary).toMatchObject({ tokens: 0, decided: 0, lemmaOnly: 0, alongside: 0 });
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
    expect(plan.dictionary).toEqual({ tool: 'dict:d1', tokens: 0, decided: 0, lemmaOnly: 1, alongside: 0 });
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
    // a word the adapter vouches for only gets the marker: no readings were supplied
    const sure = fake({ canto: [{ lemma: 'cantar', pos: 'VERB', morph: {}, confidence: 1 }] }, { refine });
    planDocument(docOf('Canto'), sure.registry, { dictionary: dictOf(entry('canto', { pos: 'NOUN', glosses: ['song'] })), dictionaryId: 'd1' });
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
      expect(d).toEqual({ tool: 'dict:x', tokens: 0, decided: 0, lemmaOnly: 0, alongside: 0 });
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
