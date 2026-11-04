import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeMorphGnt } from '../../src/adapters/greek/morphgnt';
import type { GreekFormIndex } from '../../src/adapters/greek/index-store';
import { greekInflectedMeaning, greekWordAnalysis } from '../../src/adapters/greek/word-analysis';
import { elAdapter } from '../../src/adapters/el';

const morph = (tense: string, person = '1', number = 'Sing', over: Record<string, string> = {}) => ({ VerbForm: 'Fin', Tense: tense, Voice: 'Act', Mood: 'Ind', Person: person, Number: number, ...over });
const fullIndexPath = 'public/lexicon/el/koine-index.json';
const hasFullIndex = existsSync(fullIndexPath);
const fullIndex = hasFullIndex ? JSON.parse(readFileSync(fullIndexPath, 'utf8')) as GreekFormIndex : undefined;
/** The compiled analyser's top reading of a word in a sentence, realized. */
const read = (sentence: string, word: string): { meaning?: string; lexical?: string; ambiguity: string[] } => {
  const tokens = elAdapter.tokenize(sentence);
  const analyses = elAdapter.analyze(tokens);
  const i = tokens.findIndex((t) => t.surface === word);
  const c = analyses[i].candidates[0];
  const a = greekWordAnalysis({ surface: word, lemma: c.lemma, pos: c.pos, lemmaGloss: c.gloss, morph: c.morph, alternatives: analyses[i].candidates.slice(1).map((x) => ({ lemma: x.lemma, pos: x.pos, morph: x.morph })) });
  return { meaning: a.inflectedMeaning?.text, lexical: a.lexicalMeaning?.text, ambiguity: a.ambiguity };
};

describe('Greek verb English realization', () => {
  it('uses the analyzer features and the citation gloss, keeping the citation as an infinitive lemma meaning', () => {
    const result = greekWordAnalysis({ surface: 'Ἀγαπήσεις', lemma: 'ἀγαπάω', lemmaGloss: 'I love', morph: morph('Fut', '2') });
    expect(result.inflectedMeaning?.text).toBe('You will love');
    expect(result.lexicalMeaning?.text).toBe('to love');
    expect(greekWordAnalysis({ surface: 'λέγει', lemma: 'λέγω', lemmaGloss: 'I say, speak', morph: morph('Pres', '3') }).lexicalMeaning?.text).toBe('to say, speak');
  });

  it('realizes every person and number of the present and future active indicative', () => {
    const samples: Array<[string, string, string, string]> = [
      ['Pres', '1', 'Sing', 'I love'], ['Pres', '2', 'Sing', 'You love'], ['Pres', '3', 'Sing', 'He, she, or it loves'], ['Pres', '1', 'Plur', 'We love'],
      ['Pres', '2', 'Plur', 'You (plural) love'], ['Pres', '3', 'Plur', 'They love'], ['Fut', '1', 'Sing', 'I will love'], ['Fut', '2', 'Sing', 'You will love'],
      ['Fut', '3', 'Sing', 'He, she, or it will love'], ['Fut', '1', 'Plur', 'We will love'], ['Fut', '2', 'Plur', 'You (plural) will love'], ['Fut', '3', 'Plur', 'They will love'],
    ];
    for (const [tense, person, number, expected] of samples) expect(greekInflectedMeaning('x', 'ἀγαπάω', morph(tense, person, number), 'I love')).toBe(expected);
  });

  it('realizes the other tenses, moods and voices (the owner, 2026-11-03: a second person was shown as the first-person citation)', () => {
    expect(greekInflectedMeaning('x', 'ἀγαπάω', morph('Aor', '3'), 'I love')).toBe('He, she, or it loved');
    expect(greekInflectedMeaning('x', 'ἀγαπάω', morph('Impf', '3', 'Plur'), 'I love')).toBe('They were loving');
    expect(greekInflectedMeaning('x', 'ἀγαπάω', morph('Perf', '1'), 'I love')).toBe('I have loved');
    expect(greekInflectedMeaning('x', 'ἀγαπάω', morph('Plup', '2'), 'I love')).toBe('You had loved');
    expect(greekInflectedMeaning('x', 'ἀγαπάω', morph('Pres', '2', 'Plur', { Mood: 'Sub' }), 'I love')).toBe('You (plural) may love');
    expect(greekInflectedMeaning('x', 'ἀγαπάω', morph('Aor', '2', 'Plur', { Mood: 'Sub' }), 'I love')).toBe('You (plural) may love'); // aspect, not time
    expect(greekInflectedMeaning('x', 'ἀγαπάω', morph('Aor', '1', 'Sing', { Mood: 'Opt' }), 'I love')).toBe('I might love');
    expect(greekInflectedMeaning('x', 'ἀγαπάω', morph('Pres', '2', 'Plur', { Mood: 'Imp' }), 'I love')).toBe('Love! (plural)');
    expect(greekInflectedMeaning('x', 'ἀγαπάω', morph('Aor', '3', 'Sing', { Mood: 'Imp' }), 'I love')).toBe('Let him, her, or it love');
    expect(greekInflectedMeaning('x', 'ἀγαπάω', morph('Pres', '3', 'Sing', { Voice: 'Pass' }), 'I love')).toBe('He, she, or it is loved');
    expect(greekInflectedMeaning('x', 'ἀγαπάω', morph('Aor', '3', 'Sing', { Voice: 'Pass' }), 'I love')).toBe('He, she, or it was loved');
    expect(greekInflectedMeaning('x', 'ἀγαπάω', morph('Fut', '3', 'Sing', { Voice: 'Pass' }), 'I love')).toBe('He, she, or it will be loved');
    expect(greekInflectedMeaning('x', 'γράφω', morph('Perf', '3', 'Sing', { Voice: 'Pass' }), 'I write')).toBe('He, she, or it has been written');
    // a middle of an ordinary verb is written as the active sense; a deponent (lemma in -μαι) keeps its sense in the middle and the passive
    expect(greekInflectedMeaning('x', 'λύω', morph('Pres', '1', 'Sing', { Voice: 'Mid' }), 'I loose, untie')).toBe('I loose');
    expect(greekInflectedMeaning('x', 'ἔρχομαι', morph('Pres', '3', 'Sing', { Voice: 'Mid' }), 'I come, go')).toBe('He, she, or it comes');
    expect(greekInflectedMeaning('x', 'ἀποκρίνομαι', morph('Aor', '3', 'Sing', { Voice: 'Pass' }), 'I answer, reply')).toBe('He, she, or it answered');
    expect(greekInflectedMeaning('x', 'γίνομαι', morph('Aor', '3', 'Sing', { Voice: 'Mid' }), 'I come into being, am born')).toBe('He, she, or it came into being');
  });

  it('εἰμί keeps its own forms (ἔσται is middle in form); οἶδα is a perfect with a present meaning', () => {
    expect(greekInflectedMeaning('x', 'εἰμί', morph('Pres', '1'), 'I am, exist')).toBe('I am');
    expect(greekInflectedMeaning('x', 'εἰμί', morph('Impf', '3'), 'I am, exist')).toBe('He, she, or it was');
    expect(greekInflectedMeaning('x', 'εἰμί', morph('Impf', '3', 'Plur'), 'I am, exist')).toBe('They were');
    expect(greekInflectedMeaning('x', 'εἰμί', morph('Fut', '3', 'Sing', { Voice: 'Mid' }), 'I am, exist')).toBe('He, she, or it will be');
    expect(greekInflectedMeaning('x', 'οἶδα', morph('Perf', '1', 'Plur'), 'I know, remember')).toBe('We know');
    expect(greekInflectedMeaning('x', 'οἶδα', morph('Plup', '3'), 'I know, remember')).toBe('He, she, or it knew');
    expect(greekInflectedMeaning('x', 'ἔχω', morph('Impf', '3'), 'I have, hold, possess')).toBe('He, she, or it had');
  });

  it('realizes infinitives and participles by tense and voice', () => {
    expect(greekInflectedMeaning('x', 'λαμβάνω', { VerbForm: 'Inf', Tense: 'Aor', Voice: 'Act' }, 'I receive, take')).toBe('to receive');
    expect(greekInflectedMeaning('x', 'λέγω', { VerbForm: 'Part', Tense: 'Pres', Voice: 'Act', Case: 'Nom', Number: 'Plur', Gender: 'Masc' }, 'I say, speak')).toBe('saying');
    expect(greekInflectedMeaning('x', 'ἀκούω', { VerbForm: 'Part', Tense: 'Aor', Voice: 'Act', Case: 'Nom', Number: 'Sing', Gender: 'Masc' }, 'I hear, listen')).toBe('having heard');
    expect(greekInflectedMeaning('x', 'γράφω', { VerbForm: 'Part', Tense: 'Perf', Voice: 'Pass', Case: 'Acc', Number: 'Sing', Gender: 'Neut' }, 'I write')).toBe('written');
    expect(greekInflectedMeaning('x', 'βαπτίζω', { VerbForm: 'Part', Tense: 'Aor', Voice: 'Pass', Case: 'Nom', Number: 'Sing', Gender: 'Masc' }, 'I dip, submerge, baptize')).toBe('having been dipped');
    expect(greekInflectedMeaning('x', 'ἀποκρίνομαι', { VerbForm: 'Part', Tense: 'Aor', Voice: 'Pass', Case: 'Nom', Number: 'Sing', Gender: 'Masc' }, 'I answer, reply')).toBe('having answered');
  });

  it('rejects features that do not describe one form, a blank surface, no lemma, and a citation with no verb', () => {
    const unknowns = [
      greekInflectedMeaning('x', 'ἀγαπάω', { ...morph('Pres'), Person: '0' }, 'I love'),
      greekInflectedMeaning('x', 'ἀγαπάω', { ...morph('Pres'), Number: 'Dual' }, 'I love'),
      greekInflectedMeaning('x', 'ἀγαπάω', { VerbForm: 'Fin', Tense: 'Pres', Voice: 'Act', Mood: 'Ind', Number: 'Sing' }, 'I love'),
      greekInflectedMeaning('', 'ἀγαπάω', morph('Pres'), 'I love'),
      greekInflectedMeaning('x', undefined, morph('Pres'), 'I love'),
      greekInflectedMeaning('x', 'ἀγαπάω', morph('Pres'), 'I will'),
      greekInflectedMeaning('x', 'ἀγαπάω', morph('Pres'), 'I can'),
      greekInflectedMeaning('x', 'ἀγαπάω', morph('Pres'), undefined),
      greekWordAnalysis({ surface: 'ἀγαπῶ', lemma: 'ἀγαπάω', pos: 'NOUN', lemmaGloss: 'I love', morph: morph('Pres') }).inflectedMeaning?.text,
    ];
    expect(unknowns).toEqual(Array(unknowns.length).fill(undefined));
  });

  it('does not manufacture an ambiguity from semantically duplicate analyzer candidates', () => {
    const base = morph('Fut', '2');
    const result = greekWordAnalysis({ surface: 'ἀγαπήσεις', lemma: 'ἀγαπάω', lemmaGloss: 'I love', morph: base,
      alternatives: [{ morph: { ...base } }, { morph: { ...base, VerbForm: undefined as unknown as string } }] });
    expect(result.inflectedMeaning?.text).toBe('You will love');
    expect(result.ambiguity).toEqual([]);
  });

  it('realizes a genuinely different reading as the other possible meaning', () => {
    const result = greekWordAnalysis({ surface: 'ἀγαπῶ', lemma: 'ἀγαπάω', pos: 'VERB', lemmaGloss: 'I love', morph: morph('Pres'),
      alternatives: [{ morph: { ...morph('Pres'), Mood: 'Sub' } }] });
    expect(result.inflectedMeaning?.text).toBe('I love');
    expect(result.ambiguity).toEqual(['I love', 'I may love']);
  });

  it('reads the compiled New Testament index: the person, tense and voice of each word, not the citation', () => {
    expect(read('εἶπεν δὲ αὐτῷ', 'εἶπεν')).toMatchObject({ meaning: 'He, she, or it said', lexical: 'to say, speak' });
    expect(read('ἐν ἀρχῇ ἦν ὁ λόγος', 'ἦν').meaning).toBe('He, she, or it was');
    expect(read('καὶ ἀπεκρίθη αὐτοῖς', 'ἀπεκρίθη').meaning).toBe('He, she, or it answered');
    expect(read('ἔρχεται ὁ Ἰησοῦς', 'ἔρχεται').meaning).toBe('He, she, or it comes');
    expect(read('καὶ ἐγένετο', 'ἐγένετο').meaning).toBe('He, she, or it came into being');
    expect(read('γέγραπται γάρ', 'γέγραπται').meaning).toBe('He, she, or it has been written');
    expect(read('ποιήσατε καρπόν', 'ποιήσατε').meaning).toBe('Do! (plural)');
    expect(read('ἵνα πιστεύητε', 'πιστεύητε').meaning).toBe('You (plural) may believe');
    expect(read('σωθήσεται', 'σωθήσεται').meaning).toBe('He, she, or it will be saved');
    expect(read('ἐλήλυθεν ἡ ὥρα', 'ἐλήλυθεν').meaning).toBe('He, she, or it has come');
    expect(read('οἴδαμεν', 'οἴδαμεν').meaning).toBe('We know');
    expect(read('ἀκούσας δέ', 'ἀκούσας').meaning).toBe('having heard');
    // a form the index reads two ways: the other reading is realized beside it
    expect(read('ἔλεγον', 'ἔλεγον')).toMatchObject({ meaning: 'They were saying', ambiguity: ['They were saying', 'I was saying'] });
  });

  it.skipIf(!hasFullIndex)('realizes readings from the full index, with the citation as the lemma meaning', () => {
    const picks = [
      ['ἀγαπάω', 'ἀγαπήσεις', 'Fut', '2', 'Sing', 'You will love'],
      ['γράφω', 'γράψω', 'Fut', '1', 'Sing', 'I will write'],
      ['ἀγοράζω', 'ἀγοράζει', 'Pres', '3', 'Sing', 'He, she, or it buys'],
      ['ἔχω', 'ἔχει', 'Pres', '3', 'Sing', 'He, she, or it has'],
    ] as const;
    for (const [lemma, form, tense, person, number, expected] of picks) {
      const rows = fullIndex!.forms[form];
      const row = rows?.find(([id, code]) => id === lemma && decodeMorphGnt(code, lemma).morph.Tense === tense && decodeMorphGnt(code, lemma).morph.Person === person && decodeMorphGnt(code, lemma).morph.Number === number);
      expect(row, `${form} should be an indexed MorphGNT reading`).toBeDefined();
      const reading = decodeMorphGnt(row![1], lemma);
      expect(greekInflectedMeaning(form, lemma, reading.morph, fullIndex!.lemmas[lemma]?.[1])).toBe(expected);
    }
    const gal = greekWordAnalysis({ surface: 'ἀγαπήσεις', lemma: 'ἀγαπάω', lemmaGloss: fullIndex!.lemmas['ἀγαπάω'][1], morph: morph('Fut', '2'), references: ['GAL.5.14'] });
    expect(gal.inflectedMeaning?.text).toBe('You will love');
    expect(gal.contextualMeaning?.text).toBe('You shall love');
  });
});
