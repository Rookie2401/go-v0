import { describe, expect, it } from 'vitest';
import { laAdapter } from '../../src/adapters/la';
import { latinInflectedMeaning, latinVerbShape, latinWordAnalysis } from '../../src/adapters/latin/word-analysis';

/** The analyser's top reading of a word, realized, with the other readings. */
const read = (word: string): { meaning?: string; lexical?: string; ambiguity: string[] } => {
  const tokens = laAdapter.tokenize(word);
  const analyses = laAdapter.analyze(tokens);
  const c = analyses[0].candidates[0];
  const a = latinWordAnalysis({ surface: word, lemma: c.lemma, pos: c.pos, lemmaGloss: c.gloss, morph: c.morph, alternatives: analyses[0].candidates.slice(1).map((x) => ({ lemma: x.lemma, pos: x.pos, morph: x.morph })) });
  return { meaning: a.inflectedMeaning?.text, lexical: a.lexicalMeaning?.text, ambiguity: a.ambiguity };
};
const fin = (tense: string, mood: string, voice: string, person: string, number: string) => ({ VerbForm: 'Fin', Mood: mood, Tense: tense, Voice: voice, Person: person, Number: number });
const AMO = 'love, like; fall in love with; be fond of';

describe('Latin verb English realization', () => {
  it('reads the analyser: person, tense, mood and voice of each form, the citation kept as the lemma meaning', () => {
    expect(read('amas')).toMatchObject({ meaning: 'You love', lexical: AMO });
    expect(read('amabimus').meaning).toBe('We will love');
    expect(read('amaverat').meaning).toBe('He, she, or it had loved');
    expect(read('dixit').meaning).toBe('He, she, or it said');
    expect(read('dicebat').meaning).toBe('He, she, or it was saying');
    expect(read('habebat').meaning).toBe('He, she, or it had'); // a state: no "was having"
    expect(read('fecerunt').meaning).toBe('They made');
    expect(read('audivimus').meaning).toBe('We heard');
    expect(read('credis').meaning).toBe('You believe');
    expect(read('vidi').meaning).toBe('I saw');
    expect(read('venite').meaning).toBe('Come! (plural)');
    expect(read('amate')).toMatchObject({ meaning: 'Love! (plural)', ambiguity: ['Love! (plural)', 'loved'] });
    expect(read('amemus').meaning).toBe('We may love');
    expect(read('amaretur').meaning).toBe('He, she, or it might be loved');
    expect(read('amavisset').meaning).toBe('He, she, or it might have loved');
    expect(read('amabatur').meaning).toBe('He, she, or it was being loved');
    expect(read('dicitur').meaning).toBe('He, she, or it is said');
  });

  it('sum keeps its own forms; a deponent is read as the active it is; Whitaker\'s "(PASS)" sense serves the passive', () => {
    expect(read('est').meaning).toBe('He, she, or it is');
    expect(read('erat').meaning).toBe('He, she, or it was');
    expect(read('erunt').meaning).toBe('They will be');
    expect(read('sumus').meaning).toBe('We are');
    expect(read('estis').meaning).toBe('You (plural) are');
    expect(read('fuit').meaning).toBe('He, she, or it was');
    expect(read('loquitur').meaning).toBe('He, she, or it speaks');
    expect(read('locutus').meaning).toBe('having spoken');
    expect(read('videtur').meaning).toBe('He, she, or it seems');
  });

  it('writes the non-finite forms', () => {
    expect(read('amare').meaning).toBe('to love');
    expect(read('amans').meaning).toBe('loving');
    expect(read('amatus').meaning).toBe('loved');
    expect(read('amaturus').meaning).toBe('about to love');
    expect(read('amandum')).toMatchObject({ meaning: 'to be loved', ambiguity: ['to be loved', 'loving'] }); // gerundive, and the gerund as the other reading
    expect(latinInflectedMeaning({ VerbForm: 'Inf', Tense: 'Perf', Voice: 'Act' }, AMO)).toBe('to have loved');
    expect(latinInflectedMeaning({ VerbForm: 'Inf', Tense: 'Fut', Voice: 'Act' }, AMO)).toBe('to be about to love');
    expect(latinInflectedMeaning({ VerbForm: 'Sup', Voice: 'Act' }, AMO)).toBe('to love');
  });

  it('a form the analyser reads two ways (venit: perfect or present) shows one and lists the other', () => {
    expect(read('venit')).toMatchObject({ meaning: 'He, she, or it came', ambiguity: ['He, she, or it came', 'He, she, or it comes'] });
    expect(read('dicam')).toMatchObject({ meaning: 'I will say', ambiguity: ['I will say', 'I may say'] });
  });

  it('refuses a list-valued or incomplete reading on its own, and the future perfect is written', () => {
    expect(latinVerbShape({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Perf,Pres', Voice: 'Act', Person: '3', Number: 'Sing' })).toBeUndefined();
    expect(latinVerbShape({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Voice: 'Act', Number: 'Sing' })).toBeUndefined();
    expect(latinInflectedMeaning(fin('FutPerf', 'Ind', 'Act', '1', 'Plur'), AMO)).toBe('We will have loved');
    expect(latinInflectedMeaning(fin('Perf', 'Sub', 'Act', '3', 'Sing'), AMO)).toBe('He, she, or it may have loved');
  });
});
