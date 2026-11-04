import { describe, expect, it } from 'vitest';
import { heAdapter } from '../../src/adapters/he';
import { hebrewInflectedMeaning, hebrewSkeleton, hebrewVerbShape, hebrewWordAnalysis } from '../../src/adapters/hebrew/word-analysis';

/** The compiled analyser's top reading of a word in a sentence, realized. */
const read = (sentence: string, word: string): { meaning?: string; lexical?: string; ambiguity: string[] } => {
  const tokens = heAdapter.tokenize(sentence);
  const analyses = heAdapter.analyze(tokens);
  const i = tokens.findIndex((t) => t.surface === word);
  const c = analyses[i].candidates[0];
  const a = hebrewWordAnalysis({ surface: word, lemma: c.lemma, pos: c.pos, lemmaGloss: c.gloss, morph: c.morph, alternatives: analyses[i].candidates.slice(1).map((x) => ({ lemma: x.lemma, pos: x.pos, morph: x.morph })) });
  return { meaning: a.inflectedMeaning?.text, lexical: a.lexicalMeaning?.text, ambiguity: a.ambiguity };
};
const qal = (conj: string, person: string, gender: string, number: string, over: Record<string, string> = {}) => ({ Binyan: 'Qal', Conj: conj, VerbForm: 'Fin', Person: person, Gender: gender, Number: number, ...over });

describe('Hebrew verb English realization', () => {
  it('reads the compiled Tanakh index: the conjugation and person of each word (the owner, 2026-11-03)', () => {
    expect(read('וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר', 'וַיֹּאמֶר')).toMatchObject({ meaning: 'And he said', lexical: 'to say' });
    expect(read('וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר', 'יְהִי')).toMatchObject({ meaning: 'May he be', ambiguity: ['May he be', 'He will be'] });
    expect(read('וַתֹּאמֶר', 'וַתֹּאמֶר')).toMatchObject({ meaning: 'And she said', ambiguity: ['And she said', 'And you said'] });
    expect(read('וְאָהַבְתָּ אֵת יְהוָה', 'וְאָהַבְתָּ').meaning).toBe('And you will love');
    expect(read('שְׁמַע יִשְׂרָאֵל', 'שְׁמַע').meaning).toBe('Hear!');
    expect(read('שִׁמְרוּ', 'שִׁמְרוּ').meaning).toBe('Keep! (plural)');
    expect(read('לֹא תֹאכְלוּ מִמֶּנּוּ', 'תֹאכְלוּ').meaning).toBe('You (plural) will eat');
    expect(read('שָׁמַרְתִּי', 'שָׁמַרְתִּי').meaning).toBe('I kept');
    expect(read('שְׁמַרְתֶּם', 'שְׁמַרְתֶּם').meaning).toBe('You (plural) kept');
    expect(read('יִשְׁמְרוּ', 'יִשְׁמְרוּ').meaning).toBe('They will keep');
    expect(read('הָיְתָה', 'הָיְתָה').meaning).toBe('She was');
    expect(read('וַיְדַבֵּר', 'וַיְדַבֵּר').meaning).toBe('And he spoke'); // Piel: the citation's own sense
    expect(read('לֵאמֹר', 'לֵאמֹר').meaning).toBe('to say');
    expect(read('הֹלֵךְ בַּדֶּרֶךְ', 'הֹלֵךְ').meaning).toBe('going');
    expect(read('כָּתוּב בַּתּוֹרָה', 'כָּתוּב').meaning).toBe('written');
  });

  it('writes the derived stems literally only where the citation is the Qal sense', () => {
    expect(read('וַיָּבֵא אֹתוֹ', 'וַיָּבֵא').meaning).toBe('And he caused to come'); // Hifil of בוא "come"
    expect(read('הִגִּיד לְךָ', 'הִגִּיד').meaning).toBe('He declared'); // Strong's "be conspicuous, declare, tell": the Hifil's own sense
    expect(read('נִמְצָא', 'נִמְצָא').meaning).toBe('He was found'); // Nifal of a transitive root
    expect(read('נִשְׁבַּע יְהוָה', 'נִשְׁבַּע').meaning).toBe('He swore'); // a Nifal that is the verb itself
    expect(hebrewInflectedMeaning('קָדַשׁ', qal('Perf', '3', 'Masc', 'Sing', { Binyan: 'Hitpael' }), 'to be set apart, consecrate, sanctify')).toBe('He consecrated himself');
    expect(hebrewInflectedMeaning('קָדַשׁ', qal('Imp', '2', 'Masc', 'Plur', { Binyan: 'Hitpael' }), 'to be set apart, consecrate, sanctify')).toBe('Consecrate yourselves! (plural)');
    expect(hebrewInflectedMeaning('פָּלַל', qal('Perf', '3', 'Masc', 'Sing', { Binyan: 'Hitpael' }), 'to intervene, interpose, pray')).toBe('He intervened'); // not in the reflexive list: the citation
    expect(hebrewInflectedMeaning('בּוֹא', qal('Perf', '3', 'Masc', 'Sing', { Binyan: 'Hofal' }), 'to come, go in, enter')).toBe('He was caused to come');
    expect(hebrewInflectedMeaning('דָבַר', qal('Perf', '3', 'Masc', 'Sing', { Binyan: 'Pual' }), 'to speak')).toBe('He was spoken');
    expect(hebrewInflectedMeaning('שָׁאַר', qal('Perf', '3', 'Masc', 'Plur', { Binyan: 'Nifal' }), 'to remain, be left')).toBe('They remained');
    expect(hebrewInflectedMeaning('אֹיֵב', qal('Perf', '3', 'Masc', 'Sing', { Binyan: 'Nifal' }), 'be hostile to, enemy')).toBe('He was hostile to'); // a stative citation is never made passive
  });

  it('writes the cohortative and the jussive, and the gender of the second and third persons', () => {
    expect(hebrewInflectedMeaning('שָׁמַר', qal('Coh', '1', 'Com', 'Sing'), 'to keep, watch')).toBe('Let me keep');
    expect(hebrewInflectedMeaning('שָׁמַר', qal('Coh', '1', 'Com', 'Plur'), 'to keep, watch')).toBe('Let us keep');
    expect(hebrewInflectedMeaning('שָׁמַר', qal('Juss', '3', 'Fem', 'Sing'), 'to keep, watch')).toBe('May she keep');
    expect(hebrewInflectedMeaning('שָׁמַר', qal('Impf', '2', 'Fem', 'Sing'), 'to keep, watch')).toBe('You will keep');
    expect(hebrewInflectedMeaning('שָׁמַר', qal('Perf', '3', 'Fem,Masc', 'Plur'), 'to keep, watch')).toBe('They kept');
    expect(hebrewInflectedMeaning('שָׁמַר', qal('WeQatal', '2', 'Masc', 'Plur'), 'to keep, watch')).toBe('And you (plural) will keep');
  });

  it('refuses a reading it cannot write and a citation without a verb', () => {
    expect(hebrewVerbShape('שָׁמַר', { Binyan: 'Qal', Conj: 'Perf', VerbForm: 'Fin', Gender: 'Masc', Number: 'Sing' }, 'to keep')).toBeUndefined(); // no person
    expect(hebrewVerbShape('שָׁמַר', { Binyan: 'Qal', VerbForm: 'Fin', Person: '3', Gender: 'Masc', Number: 'Sing' }, 'to keep')).toBeUndefined(); // no conjugation
    expect(hebrewInflectedMeaning('שָׁמַר', qal('Perf', '3', 'Masc', 'Sing'), 'the keeper')).toBeUndefined();
    expect(hebrewInflectedMeaning('שָׁמַר', qal('Perf', '3', 'Masc', 'Sing'), undefined)).toBeUndefined();
  });

  it('matches a root by its consonants, whatever the pointing or the final letter', () => {
    expect(hebrewSkeleton('בּוֹא')).toBe('בוא');
    expect(hebrewSkeleton('הָלַךְ')).toBe('הלכ');
    expect(hebrewSkeleton(undefined)).toBe('');
  });
});
