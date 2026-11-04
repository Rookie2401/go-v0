import { describe, expect, it } from 'vitest';
import { answerVariants, citationAsInfinitive, englishIng, englishParticiple, englishPast, englishThirdSingular, realizeEnglishVerb, realizeFromCitation, verbSensesOfCitation, type VerbShape } from '../../src/core/english-verb';

const fin = (over: Partial<VerbShape> = {}): VerbShape => ({ finite: true, person: '3', number: 'Sing', gender: 'Masc', ...over });

describe('verbSensesOfCitation: the three citation conventions', () => {
  it('reads a Greek first-person citation, every sense of it first person', () => {
    expect(verbSensesOfCitation('I say, speak')).toEqual([{ head: 'say', tail: '' }, { head: 'speak', tail: '' }]);
    expect(verbSensesOfCitation('I come into being, am born')).toEqual([{ head: 'come', tail: 'into being' }, { head: 'be', tail: 'born' }]);
    expect(verbSensesOfCitation('I am powerful, am able')).toEqual([{ head: 'be', tail: 'powerful' }, { head: 'be', tail: 'able' }]);
    expect(verbSensesOfCitation('I believe, have faith in')).toEqual([{ head: 'believe', tail: '' }, { head: 'have', tail: 'faith in' }]);
  });
  it('reads an infinitive and a bare citation, with semicolon groups and parenthetical notes', () => {
    expect(verbSensesOfCitation('to come, go in, enter')).toEqual([{ head: 'come', tail: '' }, { head: 'go', tail: 'in' }, { head: 'enter', tail: '' }]);
    expect(verbSensesOfCitation('love, like; fall in love with; be fond of')).toEqual([{ head: 'love', tail: '' }, { head: 'like', tail: '' }, { head: 'fall', tail: 'in love with' }, { head: 'be', tail: 'fond of' }]);
    expect(verbSensesOfCitation('see; look at, perceive; (PASS) seem, seem good')).toEqual([{ head: 'see', tail: '' }, { head: 'look', tail: 'at' }, { head: 'perceive', tail: '' }, { head: 'seem', tail: '', passive: true }, { head: 'seem', tail: 'good', passive: true }]);
    expect(verbSensesOfCitation('make/build (something), do')).toEqual([{ head: 'make', tail: '' }, { head: 'build', tail: '' }, { head: 'do', tail: '' }]); // Whitaker's slashes
  });
  it('leaves out senses headed by a modal, a determiner or a pronoun, and gives [] for nothing usable', () => {
    expect(verbSensesOfCitation('I can')).toEqual([]);
    expect(verbSensesOfCitation('I will')).toEqual([]);
    expect(verbSensesOfCitation('the house')).toEqual([]);
    expect(verbSensesOfCitation('')).toEqual([]);
    expect(verbSensesOfCitation(undefined)).toEqual([]);
  });
  it('writes a first-person citation as an infinitive for the lemma meaning, and leaves the others as they are', () => {
    expect(citationAsInfinitive('I say, speak')).toBe('to say, speak');
    expect(citationAsInfinitive('I come into being, am born')).toBe('to come into being, be born');
    expect(citationAsInfinitive('to eat')).toBe('to eat');
    expect(citationAsInfinitive('love, lovely, loveable')).toBe('love, lovely, loveable');
  });
});

describe('English inflection', () => {
  it('regular pasts, participles, third persons and -ing forms', () => {
    expect(['love', 'try', 'stop', 'open', 'bless', 'enter', 'visit'].map(englishPast)).toEqual(['loved', 'tried', 'stopped', 'opened', 'blessed', 'entered', 'visited']);
    expect(['love', 'try', 'go', 'do', 'pass', 'watch', 'say', 'have', 'be'].map(englishThirdSingular)).toEqual(['loves', 'tries', 'goes', 'does', 'passes', 'watches', 'says', 'has', 'is']);
    expect(['love', 'see', 'be', 'lie', 'die', 'stop', 'run', 'open', 'flee'].map(englishIng)).toEqual(['loving', 'seeing', 'being', 'lying', 'dying', 'stopping', 'running', 'opening', 'fleeing']);
  });
  it('irregular verbs, including the biblical ones and prefixed forms', () => {
    expect(['say', 'go', 'come', 'write', 'give', 'speak', 'smite', 'slay', 'beget', 'swear', 'know', 'see', 'become', 'forgive', 'overcome', 'withhold'].map(englishPast))
      .toEqual(['said', 'went', 'came', 'wrote', 'gave', 'spoke', 'smote', 'slew', 'begot', 'swore', 'knew', 'saw', 'became', 'forgave', 'overcame', 'withheld']);
    expect(['write', 'give', 'speak', 'smite', 'slay', 'beget', 'swear', 'know', 'see', 'become', 'forgive', 'eat', 'do', 'be'].map(englishParticiple))
      .toEqual(['written', 'given', 'spoken', 'smitten', 'slain', 'begotten', 'sworn', 'known', 'seen', 'become', 'forgiven', 'eaten', 'done', 'been']);
  });
});

describe('realizeEnglishVerb', () => {
  const love = { head: 'love', tail: '' };
  it('writes every person and number in the present, with the gender where known', () => {
    const cases: Array<[VerbShape['person'], VerbShape['number'], VerbShape['gender'] | undefined, string]> = [
      ['1', 'Sing', undefined, 'I love'], ['2', 'Sing', undefined, 'You love'], ['3', 'Sing', undefined, 'He, she, or it loves'], ['3', 'Sing', 'Masc', 'He loves'],
      ['3', 'Sing', 'Fem', 'She loves'], ['3', 'Sing', 'Neut', 'It loves'], ['1', 'Plur', undefined, 'We love'], ['2', 'Plur', undefined, 'You (plural) love'], ['3', 'Plur', 'Masc', 'They love'],
    ];
    for (const [person, number, gender, expected] of cases) expect(realizeEnglishVerb(love, { finite: true, person, number, ...(gender ? { gender } : {}) })).toBe(expected);
  });
  it('writes the times of the indicative, active and passive', () => {
    expect(realizeEnglishVerb(love, fin({ time: 'past' }))).toBe('He loved');
    expect(realizeEnglishVerb(love, fin({ time: 'progressive-past' }))).toBe('He was loving');
    expect(realizeEnglishVerb(love, fin({ time: 'future' }))).toBe('He will love');
    expect(realizeEnglishVerb(love, fin({ time: 'perfect' }))).toBe('He has loved');
    expect(realizeEnglishVerb(love, fin({ time: 'perfect', person: '1' }))).toBe('I have loved');
    expect(realizeEnglishVerb(love, fin({ time: 'pluperfect' }))).toBe('He had loved');
    expect(realizeEnglishVerb(love, fin({ time: 'future-perfect' }))).toBe('He will have loved');
    expect(realizeEnglishVerb(love, fin({ passive: true }))).toBe('He is loved');
    expect(realizeEnglishVerb(love, fin({ passive: true, time: 'past', person: '2', number: 'Plur' }))).toBe('You (plural) were loved');
    expect(realizeEnglishVerb(love, fin({ passive: true, time: 'progressive-past' }))).toBe('He was being loved');
    expect(realizeEnglishVerb(love, fin({ passive: true, time: 'future' }))).toBe('He will be loved');
    expect(realizeEnglishVerb(love, fin({ passive: true, time: 'perfect' }))).toBe('He has been loved');
    expect(realizeEnglishVerb(love, fin({ passive: true, time: 'pluperfect' }))).toBe('He had been loved');
  });
  it('a copula keeps its own forms and takes no passive; a stative verb has a simple past for its imperfect', () => {
    const be = { head: 'be', tail: '' };
    expect(realizeEnglishVerb(be, fin({ person: '1' }))).toBe('I am');
    expect(realizeEnglishVerb(be, fin({ person: '2' }))).toBe('You are');
    expect(realizeEnglishVerb(be, fin())).toBe('He is');
    expect(realizeEnglishVerb(be, fin({ time: 'progressive-past' }))).toBe('He was');
    expect(realizeEnglishVerb(be, fin({ time: 'progressive-past', number: 'Plur' }))).toBe('They were');
    expect(realizeEnglishVerb(be, fin({ time: 'future', passive: true }))).toBe('He will be');
    expect(realizeEnglishVerb({ head: 'be', tail: 'able' }, fin({ person: '2', number: 'Plur' }))).toBe('You (plural) are able');
    expect(realizeEnglishVerb({ head: 'have', tail: '' }, fin({ time: 'progressive-past' }))).toBe('He had');
    expect(realizeEnglishVerb({ head: 'know', tail: '' }, fin({ time: 'progressive-past', person: '1', number: 'Plur' }))).toBe('We knew');
  });
  it('writes the moods: subjunctive, optative, imperative, jussive, cohortative', () => {
    expect(realizeEnglishVerb(love, fin({ mood: 'subjunctive' }))).toBe('He may love');
    expect(realizeEnglishVerb(love, fin({ mood: 'subjunctive', time: 'progressive-past' }))).toBe('He might love');
    expect(realizeEnglishVerb(love, fin({ mood: 'subjunctive', time: 'perfect' }))).toBe('He may have loved');
    expect(realizeEnglishVerb(love, fin({ mood: 'subjunctive', time: 'pluperfect', passive: true }))).toBe('He might have been loved');
    expect(realizeEnglishVerb(love, fin({ mood: 'optative', person: '1' }))).toBe('I might love');
    expect(realizeEnglishVerb(love, fin({ mood: 'imperative', person: '2' }))).toBe('Love!');
    expect(realizeEnglishVerb(love, fin({ mood: 'imperative', person: '2', number: 'Plur' }))).toBe('Love! (plural)');
    expect(realizeEnglishVerb(love, fin({ mood: 'imperative', person: '2', passive: true }))).toBe('Be loved!');
    expect(realizeEnglishVerb(love, fin({ mood: 'imperative' }))).toBe('Let him love');
    expect(realizeEnglishVerb(love, fin({ mood: 'imperative', gender: undefined, number: 'Plur' }))).toBe('Let them love');
    expect(realizeEnglishVerb(love, fin({ mood: 'jussive' }))).toBe('May he love');
    expect(realizeEnglishVerb(love, fin({ mood: 'cohortative', person: '1', number: 'Plur' }))).toBe('Let us love');
    expect(realizeEnglishVerb(love, fin({ mood: 'cohortative', person: '1' }))).toBe('Let me love');
  });
  it('writes the non-finite forms', () => {
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'infinitive' })).toBe('to love');
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'infinitive', passive: true })).toBe('to be loved');
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'infinitive', time: 'perfect' })).toBe('to have loved');
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'infinitive', time: 'future' })).toBe('to be about to love');
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'participle' })).toBe('loving');
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'participle', passive: true })).toBe('being loved');
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'participle', time: 'past' })).toBe('having loved');
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'participle', time: 'past', passive: true })).toBe('having been loved');
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'participle', time: 'perfect', passive: true })).toBe('loved');
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'participle', time: 'future' })).toBe('about to love');
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'gerund' })).toBe('loving');
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'gerundive' })).toBe('to be loved');
    expect(realizeEnglishVerb(love, { finite: false, nonFinite: 'supine' })).toBe('to love');
    expect(realizeEnglishVerb(love, { finite: false })).toBeUndefined();
  });
  it('carries a sense tail, a prefix and a stem nuance', () => {
    expect(realizeEnglishVerb({ head: 'come', tail: 'into being' }, fin({ time: 'past', gender: undefined }))).toBe('He, she, or it came into being');
    expect(realizeEnglishVerb({ head: 'fall', tail: 'in love with' }, fin({ time: 'past', person: '1' }))).toBe('I fell in love with');
    expect(realizeEnglishVerb({ head: 'say', tail: '' }, fin({ time: 'past', prefix: 'and ' }))).toBe('And he said');
    expect(realizeEnglishVerb({ head: 'come', tail: '' }, fin({ time: 'past', nuance: 'causative' }))).toBe('He caused to come');
    expect(realizeEnglishVerb({ head: 'come', tail: '' }, fin({ time: 'past', nuance: 'causative', passive: true }))).toBe('He was caused to come');
    expect(realizeEnglishVerb({ head: 'sanctify', tail: '' }, fin({ time: 'past', nuance: 'reflexive' }))).toBe('He sanctified himself');
    expect(realizeEnglishVerb({ head: 'sanctify', tail: '' }, fin({ mood: 'imperative', person: '2', number: 'Plur', nuance: 'reflexive' }))).toBe('Sanctify yourselves! (plural)');
    expect(realizeEnglishVerb({ head: 'hide', tail: '' }, { finite: false, nonFinite: 'participle', nuance: 'reflexive' })).toBe('hiding oneself');
  });
  it('refuses a finite shape with no person or number', () => {
    expect(realizeEnglishVerb(love, { finite: true, number: 'Sing' })).toBeUndefined();
    expect(realizeEnglishVerb(love, { finite: true, person: '2' })).toBeUndefined();
  });
});

describe('realizeFromCitation', () => {
  it('takes the first usable sense, or the marked passive sense for a passive shape', () => {
    expect(realizeFromCitation('I say, speak', fin({ time: 'past', gender: undefined }))).toBe('He, she, or it said');
    const video = 'see; look at, perceive; consider; (PASS) seem, seem good, appear, be seen';
    expect(realizeFromCitation(video, fin({ gender: undefined }))).toBe('He, she, or it sees');
    expect(realizeFromCitation(video, fin({ gender: undefined, passive: true }))).toBe('He, she, or it seems');
    expect(realizeFromCitation('love, like', fin({ gender: undefined, passive: true }))).toBe('He, she, or it is loved');
    expect(realizeFromCitation('I can', fin())).toBeUndefined();
    expect(realizeFromCitation(undefined, fin())).toBeUndefined();
  });
});

describe('answerVariants: the realized meaning as an answer key', () => {
  it('spells out each pronoun of "he, she, or it", drops "(plural)" and "!", keeps the text first', () => {
    expect(answerVariants('He, she, or it said')).toEqual(['He, she, or it said', 'he said', 'she said', 'it said']);
    expect(answerVariants('You (plural) love')).toEqual(['You (plural) love', 'You love']);
    expect(answerVariants('Do! (plural)')).toEqual(['Do! (plural)', 'Do']);
    expect(answerVariants('Let him, her, or it come')).toEqual(['Let him, her, or it come', 'let him come', 'let her come', 'let it come']);
    expect(answerVariants('You will love')).toEqual(['You will love']);
  });
});
