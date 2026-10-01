/**
 * Coordinator's test: a Spanish text with words outside the word list, imported with a dictionary — on the real
 * adapter, the real importer and the real learner model (memory store). PLAN10: the dictionary decides what the
 * rules only guess.
 *
 * The dictionary here is a handful of entries written for this test in the shape the build produces (a headword with
 * its glosses and sense labels; an inflected form as a form-of entry with the source's own grammatical labels). It is
 * not an extract of Wiktionary. The words are chosen because the word list does not hold them: the first test checks
 * that precondition, so the file fails loudly if the list ever grows to cover them.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { COURSES, varietyStanding } from '../../src/core';
import type { DictionaryEntry, LexiconSource, Sentence, Token, TokenAnalysis } from '../../src/core';
import { SPANISH_COURSE_ID } from '../../src/course';
import { createMemoryLexiconSource } from '../../src/dict';
import { importDocuments, plainTextToDocuments } from '../../src/ingest';
import { CONFIRMED_BY_DICTIONARY, LEMMA_IN_DICTIONARY } from '../../src/ingest/plan';
import { liveSentences, makeApp, reader, seedUser, tokensOf, type App } from './harness';

const U = 'es-dict-learner';
const DICT_ID = 'kaikki-es@test';
const COURSE = COURSES.find((c) => c.id === SPANISH_COURSE_ID)!;

const head = (form: string, pos: DictionaryEntry['pos'], glosses: string[], tags: string[] = []): DictionaryEntry =>
  ({ form, lang: 'es', pos, glosses, senses: glosses.map((gloss) => ({ gloss, ...(tags.length ? { tags } : {}) })) });
const formOf = (form: string, pos: DictionaryEntry['pos'], lemma: string, ...tagSets: string[][]): DictionaryEntry =>
  ({ form, lang: 'es', pos, glosses: [], formOf: tagSets.map((tags) => ({ lemma, tags: ['form-of', ...tags] })) });

const ENTRIES: DictionaryEntry[] = [
  head('zurcir', 'VERB', ['to darn', 'to mend']),
  formOf('zurcía', 'VERB', 'zurcir', ['first-person', 'third-person', 'singular', 'imperfect', 'indicative']),
  head('zurra', 'NOUN', ['beating, thrashing'], ['feminine', 'colloquial']),
  formOf('zurra', 'VERB', 'zurrar', ['third-person', 'singular', 'present', 'indicative'], ['second-person', 'singular', 'imperative']),
  head('zurrar', 'VERB', ['to thrash, to beat']),
  head('guaro', 'NOUN', ['liquor distilled from sugar cane'], ['masculine', 'Honduras', 'Central-America']),
  // a word the list does hold: the dictionary stands beside it and changes nothing
  head('casa', 'NOUN', ['house']),
];

const BODY = [
  'Ella zurcía la ropa.',
  'La zurra fue larga.',
  'Él no zurra a nadie.',
  'Ellos zurraban a todos.',
  'Ellos blorfaban mucho.',
  'Bebieron guaro en la casa.',
].join('\n');

const lexicon = (): LexiconSource => createMemoryLexiconSource('es', ENTRIES, { id: DICT_ID });
const docs = () => plainTextToDocuments(BODY, { lang: 'es', title: 'Prueba del diccionario (synthetic)', idPrefix: 'dict-probe', chapters: 'none' }).documents;

interface Loaded { app: App; textId: string; sentences: Sentence[]; tokens: Token[]; }
async function load(withDictionary: boolean, app = makeApp()): Promise<Loaded> {
  const documents = docs();
  const r = await importDocuments(app.store, app.adapters, documents, { clock: app.clock.now, ...(withDictionary ? { lexicon: () => lexicon() } : {}) });
  expect(r.ok, JSON.stringify(r.documents.map((d) => d.issues))).toBe(true);
  const textId = r.documents[0].textId!;
  const sentences = await liveSentences(app.store, textId);
  const tokens = (await Promise.all(sentences.map((s) => tokensOf(app.store, s.id)))).flat();
  return { app, textId, sentences, tokens };
}
async function analysisOf(l: Loaded, surface: string, nth = 0): Promise<TokenAnalysis> {
  const token = l.tokens.filter((t) => t.surface === surface)[nth];
  expect(token, surface).toBeDefined();
  const a = (await l.app.store.analyses.where('tokenId', token.id))[0];
  expect(a, `analysis of ${surface}`).toBeDefined();
  return a;
}
const lemmaOf = async (l: Loaded, a: TokenAnalysis) => (a.lemmaId ? await l.app.store.lemmas.get(a.lemmaId) : undefined);

let withDict: Loaded;
let without: Loaded;

beforeAll(async () => {
  withDict = await load(true);
  await seedUser(withDict.app.store, U, SPANISH_COURSE_ID);
  without = await load(false);
});

describe('Spanish with a dictionary: the dictionary decides what the rules only guess', () => {
  it('precondition: the test words are outside the word list (every reading of them is a guess)', () => {
    const es = withDict.app.adapters.get('es');
    for (const w of ['zurcía', 'zurra', 'zurraban', 'blorfaban', 'guaro']) {
      const c = es.analyze(es.tokenize(w))[0].candidates;
      expect(c.length, w).toBeGreaterThan(0);
      expect(c.every((x) => x.unconfirmed === true), w).toBe(true);
    }
    expect(es.analyze(es.tokenize('casa'))[0].candidates[0].unconfirmed).toBeUndefined();
  });

  it('control — without a dictionary the word is a low-confidence guess with no meaning', async () => {
    const a = await analysisOf(without, 'zurcía');
    expect(a.confidence).toBeLessThan(0.6);
    expect(a.origin).toBe('rule');
    expect((await lemmaOf(without, a))?.gloss).toBeUndefined();
    expect((a.alternatives ?? []).length).toBeGreaterThan(0); // zurcer, zurcir, … all offered, none known
  });

  it('a guess the dictionary confirms: the dictionary\'s lemma and meaning, the rule\'s grammar, both named', async () => {
    const a = await analysisOf(withDict, 'zurcía');
    const lemma = await lemmaOf(withDict, a);
    expect(lemma?.lemma).toBe('zurcir');
    expect(lemma?.gloss).toBe('to darn; to mend');
    expect(a.origin).toBe('dictionary');
    expect(a.sourceId).toBe(DICT_ID);
    expect(a.analyzer).toBe(`dict:${DICT_ID}`);
    expect(a.confidence).toBe(CONFIRMED_BY_DICTIONARY);
    expect(a.morph).toMatchObject({ Mood: 'Ind', Tense: 'Imp', Number: 'Sing' });
    expect(String(a.notes?.rule ?? '')).toMatch(/-ir verb/);
    // the guesses the dictionary does not list are gone: no "zurcer", no "zurcír"
    const others = await Promise.all((a.alternatives ?? []).map(async (x) => (x.lemmaId ? (await withDict.app.store.lemmas.get(x.lemmaId))?.lemma : undefined)));
    expect(others.every((l) => l === 'zurcir')).toBe(true);
    // and the form's label ("first-person singular of …") never became a meaning
    expect(lemma?.gloss).not.toMatch(/person|singular|form/i);
  });

  it('a noun and a verb the word list does not hold are ordered by the same neighbour rules', async () => {
    const noun = await analysisOf(withDict, 'zurra', 0); // La zurra fue larga.
    expect(noun.pos).toBe('NOUN');
    expect((await lemmaOf(withDict, noun))?.lemma).toBe('zurra');
    expect(String(noun.notes?.context ?? '')).toMatch(/article|after/);
    expect((noun.alternatives ?? []).some((x) => x.pos === 'VERB')).toBe(true); // the verb reading is kept, below
    expect((noun.alternatives ?? []).every((x) => x.confidence < noun.confidence)).toBe(true);

    const verb = await analysisOf(withDict, 'zurra', 1); // Él no zurra a nadie.
    expect(verb.pos).toBe('VERB');
    expect((await lemmaOf(withDict, verb))?.lemma).toBe('zurrar');
    expect((await lemmaOf(withDict, verb))?.gloss).toBe('to thrash, to beat');
    expect(verb.morph).toMatchObject({ Person: '3', Number: 'Sing' });
    expect(verb.morph.Mood).not.toBe('Imp'); // after "no" it is a statement, not a command
  });

  it('a form the dictionary does not list, of a lemma it does: read by rule, meaning from the lemma, said so', async () => {
    const a = await analysisOf(withDict, 'zurraban');
    const lemma = await lemmaOf(withDict, a);
    expect(lemma?.lemma).toBe('zurrar');
    expect(lemma?.gloss).toBe('to thrash, to beat');
    expect(a.origin).toBe('rule');
    expect(a.notes?.lemmaStatus).toBe('in the dictionary');
    expect(a.notes?.lemmaSource).toBe(DICT_ID);
    expect(a.confidence).toBe(LEMMA_IN_DICTIONARY);
    expect(a.morph).toMatchObject({ Tense: 'Imp', Person: '3', Number: 'Plur' });
  });

  it('a word neither the list nor the dictionary knows stays a marked guess', async () => {
    const a = await analysisOf(withDict, 'blorfaban');
    expect(a.confidence).toBeLessThan(0.6);
    expect(a.origin).toBe('rule');
    expect(a.analyzer).toMatch(/^adapter-es@/);
    expect((await lemmaOf(withDict, a))?.gloss).toBeUndefined();
    const token = withDict.tokens.find((t) => t.surface === 'blorfaban')!;
    expect((await withDict.app.golearn.tokenSupport(U, token.id, 1)).uncertain).toBe(true);
  });

  it('a word only the dictionary knows carries the dictionary\'s region, and the course says what that means', async () => {
    const a = await analysisOf(withDict, 'guaro');
    expect(a.pos).toBe('NOUN');
    expect(a.origin).toBe('dictionary');
    expect(a.varieties).toEqual(['es-HN', 'es-CA']);
    expect(varietyStanding(a.varieties, COURSE.variety, withDict.app.adapters.get('es').varieties)).toBe('target');
    expect((await lemmaOf(withDict, a))?.gloss).toBe('liquor distilled from sugar cane');
  });

  it('a word the list holds is not touched: the dictionary stands beside it', async () => {
    const a = await analysisOf(withDict, 'casa');
    expect(a.origin).toBe('hand');
    expect(a.analyzer).toMatch(/^adapter-es@/);
    expect((await lemmaOf(withDict, a))?.gloss).toBe('house');
  });

  it('the import record counts each kind, and names the dictionary', async () => {
    const text = (await withDict.app.store.texts.get(withDict.textId))!;
    const record = text.transformations.map((t) => t.description).join(' | ');
    expect(record).toMatch(/4 word token\(s\) the rules only guessed at were decided by the dictionary/); // zurcía, zurra ×2, guaro
    expect(record).toMatch(/1 word token\(s\) the dictionary does not list were read by rule from a lemma it does list/); // zurraban
    expect(text.transformations.some((t) => t.tool === `dict:${DICT_ID}`)).toBe(true);
  });

  it('one learner model: reading the sentence credits the dictionary lemma, not a guessed one', async () => {
    const { app, textId, sentences } = withDict;
    const text = (await app.store.texts.get(textId))!;
    await reader(app, U, 'es', 's1').view(text, [sentences[0]]);
    const a = await analysisOf(withDict, 'zurcía');
    const state = await app.golearn.getItemState(U, a.lemmaId!);
    expect(state?.encounterCount).toBe(1);
  });

  it('installing the dictionary later re-analyses the text in place on its next import', async () => {
    const app = makeApp();
    const before = await load(false, app);
    const guess = await analysisOf(before, 'zurcía');
    expect(guess.origin).toBe('rule');
    const again = await importDocuments(app.store, app.adapters, docs(), { clock: app.clock.now, lexicon: () => lexicon() });
    expect(again.documents[0].action).toBe('updated');
    const after: Loaded = { app, textId: before.textId, sentences: await liveSentences(app.store, before.textId), tokens: before.tokens };
    expect(after.sentences.map((s) => s.id)).toEqual(before.sentences.map((s) => s.id)); // same sentences
    expect((await app.store.texts.get(before.textId))!.contentVersion).toBe(1); // the words did not change
    const decided = await analysisOf(after, 'zurcía');
    expect(decided.origin).toBe('dictionary');
    expect((await app.store.analyses.where('tokenId', decided.tokenId)).length).toBe(1); // the guess is not left beside it
  });
});
