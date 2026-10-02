import { describe, expect, it } from 'vitest';
import { analyseCorpus, firstLemmaOccurrences, firstStageOfLemmas, NO_STAGE } from '../../src/authoring/analyse';
import { selectCourseTexts, stageOfFromMap, compareStageKeys } from '../../src/authoring/select';
import { fakeAdapter, mkDoc } from './fake';

const stageOf = stageOfFromMap({ 'work-a': '0', 'work-b': '1' });

describe('analyseCorpus', () => {
  it('lists occurrences with docId, stage, sentence and a running word position across documents', () => {
    const a = mkDoc('a', ['el gato come.', 'el gato.'], { slug: 'work-a' });
    const b = mkDoc('b', ['gatos comen.'], { slug: 'work-b' });
    const an = analyseCorpus([a, b], fakeAdapter, { stageOf });
    expect(an.docs.map((d) => [d.id, d.stage, d.words, d.sentences])).toEqual([['a', '0', 5, 2], ['b', '1', 2, 1]]);
    expect(an.totalWords).toBe(7);
    const gato = an.occurrences.filter((o) => o.key === 'gato|NOUN');
    expect(gato.map((o) => [o.docId, o.stage, o.sentence, o.position, o.form])).toEqual([['a', '0', 0, 1, 'gato'], ['a', '0', 1, 4, 'gato'], ['b', '1', 0, 5, 'gatos']]);
    expect(an.stageOrder).toEqual(['0', '1']);
  });

  it('puts a document without a stage under "?" and last in the stage order', () => {
    const an = analyseCorpus([mkDoc('x', ['el gato.'], { slug: 'unknown' }), mkDoc('a', ['el gato.'])], fakeAdapter, { stageOf });
    expect(an.docs[0].stage).toBe(NO_STAGE);
    expect(an.stageOrder).toEqual(['0', NO_STAGE]);
    expect(analyseCorpus([mkDoc('x', ['el gato.'])], fakeAdapter).docs[0].stage).toBe('?');
  });

  it('counts a token with no reading as unread (?form) and an unconfirmed reading as a guess, neither as a lemma', () => {
    const an = analyseCorpus([mkDoc('a', ['el zzz casi.'])], fakeAdapter, { stageOf });
    expect(an.occurrences.map((o) => [o.key, o.kind])).toEqual([['el|DET', 'lemma'], ['?zzz', 'unread'], ['casar|VERB', 'guess']]);
    expect(an.docs[0]).toMatchObject({ words: 3, lemmaOccurrences: 1, guesses: 1, unread: 1 });
    expect(firstLemmaOccurrences(an).has('casar|VERB')).toBe(false);
  });

  it('counts a unit once, on its head piece, but both pieces are running words', () => {
    const an = analyseCorpus([mkDoc('a', ['el gato steht auf.'])], fakeAdapter, { stageOf });
    const unit = an.occurrences.filter((o) => o.key === 'aufstehen|VERB');
    expect(unit).toHaveLength(1);
    expect(unit[0].form).toBe('steht');
    expect(an.docs[0].words).toBe(4);
  });

  it('collects constructions and phrase units with their positions', () => {
    const an = analyseCorpus([mkDoc('a', ['quiero tengo.', 'por favor.'])], fakeAdapter, { stageOf });
    expect(an.constructions.map((c) => [c.key, c.sentence, c.position])).toEqual([['pat:querer', 0, 0], ['pat:tener', 0, 1]]);
    expect(an.phrases.map((p) => [p.key, p.sentence, p.position])).toEqual([['por favor', 1, 2]]);
  });

  it('segments raw paragraphs through the adapter', () => {
    const an = analyseCorpus([mkDoc('a', ['el gato. el perro.'], { raw: true })], fakeAdapter, { stageOf });
    expect(an.docs[0].sentences).toBe(2);
    expect(an.occurrences.find((o) => o.key === 'perro|NOUN')?.sentence).toBe(1);
  });

  it('knows the earliest stage of each lemma', () => {
    const an = analyseCorpus([mkDoc('a', ['el gato.'], { slug: 'work-a' }), mkDoc('b', ['el perro gato.'], { slug: 'work-b' })], fakeAdapter, { stageOf });
    const fs = firstStageOfLemmas(an);
    expect([fs.get('gato|NOUN'), fs.get('perro|NOUN')]).toEqual(['0', '1']);
  });
});

describe('selectCourseTexts and stage keys', () => {
  it('keeps course-written non-Scripture texts of the language and sorts by (stage, work, chapter, id)', () => {
    const d1 = mkDoc('z', ['el gato.'], { slug: 'work-b', chapter: 1 });
    const d2 = mkDoc('y', ['el gato.'], { slug: 'work-a', chapter: 2 });
    const d3 = mkDoc('x', ['el gato.'], { slug: 'work-a', chapter: 1 });
    const scripture = { ...mkDoc('s', ['el gato.']), contentType: 'scripture' as const };
    const pd = { ...mkDoc('p', ['el gato.']), source: { ...mkDoc('p', []).source, rights: 'public-domain' as const } };
    const other = { ...mkDoc('o', ['el gato.']), lang: 'de' as const };
    const out = selectCourseTexts([d1, d2, d3, scripture, pd, other], 'es', stageOf).map((d) => d.id);
    expect(out).toEqual(['x', 'y', 'z']);
  });

  it('orders stage keys: numbers, letter+number, others, open, ?', () => {
    expect(['?', 'open', 's10', 's2', '1', '0', 'zz'].sort(compareStageKeys)).toEqual(['0', '1', 's2', 's10', 'zz', 'open', '?']);
  });
});
