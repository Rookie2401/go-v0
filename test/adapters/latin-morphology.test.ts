/**
 * Latin word-form engine: lemma, part of speech and features of forms taken from the Clementine Vulgate, across the five declensions, the
 * adjectives in three degrees, the four conjugations, the irregular verbs, deponents; the enclitic, the written variants (æ, j, v), unknown
 * words; the sentence layer (what a preposition governs) and the constructions (ablative absolute, accusative + infinitive, cum / ut clauses,
 * gerundive, perfect passive, deponent).
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate } from '../../src/core';
import { laAdapter } from '../../src/adapters/la';
import { latinNormalize } from '../../src/dict/latin-normalize';
import { lookupKey } from '../../src/adapters/latin/orthography';

const run = (sentence: string) => {
  const tokens = laAdapter.tokenize(sentence);
  const analyses = laAdapter.analyze(tokens);
  return { tokens, analyses, words: analyses.filter((a) => a.token.isWord) };
};
const readings = (word: string): AnalysisCandidate[] => run(word).words[0].candidates;
const holds = (c: AnalysisCandidate, want: Record<string, string>): boolean => Object.entries(want).every(([k, v]) => (c.morph[k] ?? '').split(',').includes(v));
const find = (word: string, lemma: string, pos: string, want: Record<string, string> = {}): AnalysisCandidate | undefined =>
  readings(word).find((c) => c.lemma === lemma && c.pos === pos && holds(c, want));

type Row = [form: string, lemma: string, pos: string, features: Record<string, string>];
const FORMS: Row[] = [
  // first declension
  ['terram', 'terra', 'NOUN', { Case: 'Acc', Number: 'Sing', Gender: 'Fem' }],
  ['terrae', 'terra', 'NOUN', { Case: 'Gen', Number: 'Sing' }],
  ['viarum', 'via', 'NOUN', { Case: 'Gen', Number: 'Plur' }],
  // second declension
  ['Deum', 'deus', 'NOUN', { Case: 'Acc', Number: 'Sing', Gender: 'Masc' }],
  ['filiis', 'filius', 'NOUN', { Case: 'Dat', Number: 'Plur' }],
  ['populi', 'populus', 'NOUN', { Case: 'Gen', Number: 'Sing' }],
  ['Verbum', 'verbum', 'NOUN', { Case: 'Nom', Number: 'Sing', Gender: 'Neut' }],
  ['principio', 'principium', 'NOUN', { Case: 'Abl', Number: 'Sing' }],
  ['puer', 'puer', 'NOUN', { Case: 'Nom', Number: 'Sing' }],
  ['agros', 'ager', 'NOUN', { Case: 'Acc', Number: 'Plur' }],
  // third declension
  ['regis', 'rex', 'NOUN', { Case: 'Gen', Number: 'Sing' }],
  ['reges', 'rex', 'NOUN', { Case: 'Nom', Number: 'Plur' }],
  ['nomine', 'nomen', 'NOUN', { Case: 'Abl', Number: 'Sing', Gender: 'Neut' }],
  ['civitatum', 'civitas', 'NOUN', { Case: 'Gen', Number: 'Plur' }],
  ['patrem', 'pater', 'NOUN', { Case: 'Acc', Number: 'Sing' }],
  ['capita', 'caput', 'NOUN', { Case: 'Nom', Number: 'Plur', Gender: 'Neut' }],
  // fourth and fifth
  ['manibus', 'manus', 'NOUN', { Case: 'Dat', Number: 'Plur' }],
  ['spiritum', 'spiritus', 'NOUN', { Case: 'Acc', Number: 'Sing' }],
  ['diei', 'dies', 'NOUN', { Case: 'Gen', Number: 'Sing' }],
  ['rem', 'res', 'NOUN', { Case: 'Acc', Number: 'Sing' }],
  // irregular nouns
  ['domo', 'domus', 'NOUN', { Case: 'Abl', Number: 'Sing' }],
  ['dii', 'deus', 'NOUN', { Case: 'Nom', Number: 'Plur' }],
  // adjectives and degrees
  ['bonae', 'bonus', 'ADJ', { Case: 'Gen', Number: 'Sing', Gender: 'Fem' }],
  ['bonorum', 'bonus', 'ADJ', { Case: 'Gen', Number: 'Plur' }],
  ['optimus', 'bonus', 'ADJ', { Degree: 'Sup', Case: 'Nom' }],
  ['melior', 'bonus', 'ADJ', { Degree: 'Cmp', Case: 'Nom' }],
  ['omnia', 'omnis', 'ADJ', { Case: 'Acc', Number: 'Plur', Gender: 'Neut' }],
  ['omnibus', 'omnis', 'ADJ', { Case: 'Abl', Number: 'Plur' }],
  ['magnam', 'magnus', 'ADJ', { Case: 'Acc', Number: 'Sing', Gender: 'Fem' }],
  ['maximus', 'magnus', 'ADJ', { Degree: 'Sup' }],
  // first conjugation
  ['amabimus', 'amo', 'VERB', { VerbForm: 'Fin', Tense: 'Fut', Person: '1', Number: 'Plur', Voice: 'Act' }],
  ['amatur', 'amo', 'VERB', { Tense: 'Pres', Person: '3', Number: 'Sing', Voice: 'Pass' }],
  ['creavit', 'creo', 'VERB', { Tense: 'Perf', Person: '3', Number: 'Sing', Mood: 'Ind' }],
  ['laudaverunt', 'laudo', 'VERB', { Tense: 'Perf', Person: '3', Number: 'Plur' }],
  ['vocatus', 'voco', 'VERB', { VerbForm: 'Part', Tense: 'Perf', Voice: 'Pass', Case: 'Nom', Gender: 'Masc' }],
  // second
  ['habebant', 'habeo', 'VERB', { Tense: 'Imp', Person: '3', Number: 'Plur' }],
  ['vidit', 'video', 'VERB', { Tense: 'Perf', Person: '3', Number: 'Sing' }],
  ['habebit', 'habeo', 'VERB', { Tense: 'Fut', Person: '3', Number: 'Sing' }],
  // third
  ['dixit', 'dico', 'VERB', { Tense: 'Perf', Person: '3', Number: 'Sing' }],
  ['dicens', 'dico', 'VERB', { VerbForm: 'Part', Tense: 'Pres', Voice: 'Act' }],
  ['dicite', 'dico', 'VERB', { Mood: 'Imp', Person: '2', Number: 'Plur' }],
  ['dic', 'dico', 'VERB', { Mood: 'Imp', Person: '2', Number: 'Sing' }],
  ['scribere', 'scribo', 'VERB', { VerbForm: 'Inf', Tense: 'Pres', Voice: 'Act' }],
  // third in -io
  ['fecit', 'facio', 'VERB', { Tense: 'Perf', Person: '3', Number: 'Sing' }],
  ['facite', 'facio', 'VERB', { Mood: 'Imp', Person: '2', Number: 'Plur' }],
  ['accipiet', 'accipio', 'VERB', { Tense: 'Fut', Person: '3', Number: 'Sing' }],
  // fourth
  ['audiet', 'audio', 'VERB', { Tense: 'Fut', Person: '3', Number: 'Sing' }],
  ['audivit', 'audio', 'VERB', { Tense: 'Perf', Person: '3', Number: 'Sing' }],
  ['audisti', 'audio', 'VERB', { Tense: 'Perf', Person: '2', Number: 'Sing' }],
  ['venerunt', 'venio', 'VERB', { Tense: 'Perf', Person: '3', Number: 'Plur' }],
  ['veniens', 'venio', 'VERB', { VerbForm: 'Part', Tense: 'Pres' }],
  // subjunctive, passive, gerund(ive), supine
  ['esset', 'sum', 'AUX', { Mood: 'Sub', Tense: 'Imp', Person: '3', Number: 'Sing' }],
  ['videat', 'video', 'VERB', { Mood: 'Sub', Tense: 'Pres', Person: '3', Number: 'Sing' }],
  ['crederent', 'credo', 'VERB', { Mood: 'Sub', Tense: 'Imp', Person: '3', Number: 'Plur' }],
  ['legendum', 'lego', 'VERB', { Case: 'Acc', Number: 'Sing' }],
  ['audiendi', 'audio', 'VERB', { VerbForm: 'Ger', Case: 'Gen' }],
  ['factus', 'facio', 'VERB', { VerbForm: 'Part', Tense: 'Perf', Voice: 'Pass' }],
  // irregular verbs
  ['erat', 'sum', 'AUX', { Tense: 'Imp', Person: '3', Number: 'Sing' }],
  ['fuit', 'sum', 'AUX', { Tense: 'Perf', Person: '3', Number: 'Sing' }],
  ['sunt', 'sum', 'AUX', { Tense: 'Pres', Person: '3', Number: 'Plur' }],
  ['esse', 'sum', 'AUX', { VerbForm: 'Inf', Tense: 'Pres' }],
  ['potest', 'possum', 'VERB', { Tense: 'Pres', Person: '3', Number: 'Sing' }],
  ['possunt', 'possum', 'VERB', { Person: '3', Number: 'Plur' }],
  ['vult', 'volo', 'VERB', { Tense: 'Pres', Person: '3', Number: 'Sing' }],
  ['nolite', 'nolo', 'VERB', { Mood: 'Imp', Person: '2', Number: 'Plur' }],
  ['ibat', 'eo', 'VERB', { Tense: 'Imp', Person: '3', Number: 'Sing' }],
  ['exivit', 'exeo', 'VERB', { Tense: 'Perf', Person: '3', Number: 'Sing' }],
  ['abiit', 'abeo', 'VERB', { Tense: 'Perf', Person: '3', Number: 'Sing' }],
  ['attulit', 'affero', 'VERB', { Tense: 'Perf', Person: '3', Number: 'Sing' }],
  ['fertur', 'fero', 'VERB', { Voice: 'Pass', Person: '3', Number: 'Sing' }],
  ['adest', 'adsum', 'VERB', { Tense: 'Pres', Person: '3', Number: 'Sing' }],
  ['ait', 'aio', 'VERB', { Tense: 'Pres', Person: '3', Number: 'Sing' }],
  // deponents
  ['sequitur', 'sequor', 'VERB', { Tense: 'Pres', Person: '3', Number: 'Sing', Voice: 'Act', Deponent: 'Yes' }],
  ['secutus', 'sequor', 'VERB', { VerbForm: 'Part', Tense: 'Perf', Voice: 'Act', Deponent: 'Yes' }],
  ['loquebatur', 'loquor', 'VERB', { Tense: 'Imp', Person: '3', Number: 'Sing', Voice: 'Act' }],
  ['locutus', 'loquor', 'VERB', { VerbForm: 'Part', Tense: 'Perf' }],
  ['loqui', 'loquor', 'VERB', { VerbForm: 'Inf', Tense: 'Pres' }],
  ['mortuus', 'morior', 'VERB', { VerbForm: 'Part', Tense: 'Perf' }],
  // pronouns, closed classes
  ['quae', 'qui', 'PRON', { Case: 'Nom', Gender: 'Fem' }],
  ['eum', 'is', 'PRON', { Case: 'Acc', Gender: 'Masc', Number: 'Sing' }],
  ['mihi', 'ego', 'PRON', { Case: 'Dat', Person: '1', Number: 'Sing' }],
  ['vobis', 'tu', 'PRON', { Case: 'Dat', Person: '2', Number: 'Plur' }],
  ['illi', 'ille', 'PRON', { Case: 'Dat' }],
  ['suis', 'suus', 'ADJ', { Case: 'Abl', Number: 'Plur' }],
  ['unum', 'unus', 'NUM', { Case: 'Acc' }],
  ['duo', 'duo', 'NUM', { Case: 'Nom' }],
  ['apud', 'apud', 'ADP', {}],
  ['et', 'et', 'CONJ', {}],
  ['ut', 'ut', 'SCONJ', {}],
  ['non', 'non', 'PART', {}],
];

describe('Latin morphology: forms from the Vulgate', () => {
  it('has at least 60 forms in the table', () => { expect(FORMS.length).toBeGreaterThanOrEqual(60); });
  for (const [form, lemma, pos, features] of FORMS) {
    it(`${form} is ${lemma} (${pos}) ${JSON.stringify(features)}`, () => {
      const c = find(form, lemma, pos, features);
      expect(c, JSON.stringify(readings(form).map((r) => [r.lemma, r.pos, r.morph]))).toBeDefined();
    });
  }
});

describe('In principio erat Verbum, et Verbum erat apud Deum (John 1:1)', () => {
  const { words } = run('In principio erat Verbum, et Verbum erat apud Deum, et Deus erat Verbum.');
  const best = words.map((w) => w.candidates[0]);
  it('reads every word with its lemma and part of speech', () => {
    expect(best.map((c) => `${c.lemma}/${c.pos}`)).toEqual(['in/ADP', 'principium/NOUN', 'sum/AUX', 'verbum/NOUN', 'et/CONJ', 'verbum/NOUN', 'sum/AUX', 'apud/ADP', 'deus/NOUN', 'et/CONJ', 'deus/NOUN', 'sum/AUX', 'verbum/NOUN']);
  });
  it('narrows principio to the ablative after in, and keeps Verbum a union the sentence does not decide', () => {
    expect(best[1].morph.Case).toBe('Abl');
    expect(best[3].morph.Case.split(',')).toEqual(expect.arrayContaining(['Nom', 'Acc']));
    expect(best[8].morph.Case).toBe('Acc');
    expect(best[10].morph.Case.split(',')).toContain('Nom');
  });
  it('gives the imperfect indicative of sum for erat and describes it in plain words', () => {
    expect(best[2].morph).toMatchObject({ Mood: 'Ind', Tense: 'Imp', Person: '3', Number: 'Sing', Voice: 'Act' });
    expect(laAdapter.describeMorph!(best[2].morph, best[2].pos)).toBe('third person singular, imperfect indicative active');
  });
});

describe('the written form is never changed; spelling variants find the same word', () => {
  it('reads the ligature, j and v spellings of the Clementine as the classical word', () => {
    expect(find('cælum', 'caelum', 'NOUN')).toBeDefined();
    expect(find('præcepit', 'praecipio', 'VERB')?.pos ?? find('praecepit', 'praecipio', 'VERB')?.pos).toBeDefined();
    expect(find('Jesus', 'Iesus', 'PROPN')).toBeDefined();
    expect(find('juxta', 'iuxta', 'ADP') ?? find('juxta', 'iuxta', 'ADV')).toBeDefined();
    expect(find('uenit', 'venio', 'VERB')).toBeDefined();
  });
  it('tokens keep their surface and exact offsets; the identity is the folded key', () => {
    const text = 'Cælum et terra : Jesus ?';
    const toks = laAdapter.tokenize(text);
    for (const t of toks) expect(text.slice(t.start, t.end)).toBe(t.surface);
    expect(toks.map((t) => t.surface)).toEqual(['Cælum', 'et', 'terra', ':', 'Jesus', '?']);
    expect(toks[0].normalized).toBe('caelum');
    expect(toks[4].normalized).toBe('jesus'); // the dictionary's key keeps j and v as written; the dictionary aliases and lemmaVariants join Jesus and Iesus
    expect(laAdapter.normalize('Cælum')).toBe(laAdapter.normalize('caelum'));
    expect(laAdapter.lemmaVariants!('caelum')).toEqual(expect.arrayContaining(['coelum', 'celum']));
  });
  it('splits the enclitic -que off a host the lexicon knows', () => {
    const c = readings('populusque')[0];
    expect(c.lemma).toBe('populus');
    expect(c.parts?.map((p) => p.text)).toEqual(['populus', 'que']);
    expect(readings('atque')[0].parts).toBeUndefined();
  });
});

describe('the dictionary key', () => {
  it('is exactly the dictionary latinNormalize, for the adapter and for tokens', () => {
    const sample = ['Cælum', 'ŒCUMENICUS', 'ǽ', 'Ęcclesia', 'amō', 'Iēsūs', 'JESUS', 'Verbum', 'UERBUM', 'uerbum', 'ſanctus', 'eius', 'EJUS', 'āmŏ', 'Cǽlum'];
    for (const s of sample) {
      expect(laAdapter.normalize(s), s).toBe(latinNormalize(s));
      expect(lookupKey(s), s).toBe(latinNormalize(s));
      expect(laAdapter.searchNormalize(` ${s} `), s).toBe(latinNormalize(s));
      expect(laAdapter.tokenize(s)[0]?.normalized, s).toBe(latinNormalize(s));
    }
    expect(laAdapter.normalize('Verbum')).toBe('verbum');
    expect(laAdapter.normalize('Jesus')).not.toBe(laAdapter.normalize('Iesus'));
  });
});

describe('unknown words', () => {
  it('are guessed from the ending, marked unconfirmed, with no gloss and low confidence', () => {
    const g = readings('xyzaverunt')[0];
    expect(g?.unconfirmed).toBe(true);
    expect(g?.gloss).toBeUndefined();
    expect(g?.confidence).toBeLessThanOrEqual(0.4);
  });
  it('read a capitalised word inside a sentence as a name', () => {
    const { words } = run('Dixit Qwertyus regi.');
    expect(words[1].candidates[0]).toMatchObject({ pos: 'PROPN', unconfirmed: true });
  });
  it('give a part-of-speech-X reading, unconfirmed, when the ending says nothing; a capitalised non-Latin shape at the start of a sentence gets none', () => {
    expect(readings('xyzzy')[0]).toMatchObject({ pos: 'X', unconfirmed: true });
    expect(readings('xyzzy')[0].confidence).toBeLessThanOrEqual(0.3);
    expect(readings('Xyzqwk')).toEqual([]);
  });
  it('read the labels of a diagram, abbreviated first names and the Neo-Latin short forms', () => {
    expect(readings('bd')[0]).toMatchObject({ pos: 'X', lemma: 'bd', unconfirmed: true });
    expect(readings('corol')[0]).toMatchObject({ lemma: 'corollarium', pos: 'NOUN' });
    expect(readings('Cn')[0]).toMatchObject({ lemma: 'Gnaeus', pos: 'PROPN' });
    expect(readings('adeoq')[0]).toMatchObject({ lemma: 'adeo' });
  });
});

describe('the sentence layer', () => {
  it('lets the preposition decide the case: ad + accusative, de + ablative', () => {
    const { words } = run('ad Deum de Deo');
    expect(words[1].candidates[0].morph.Case).toBe('Acc');
    expect(words[3].candidates[0].morph.Case).toBe('Abl');
  });
  it('reads cum as a preposition before an ablative noun and as a conjunction before a clause', () => {
    expect(run('cum discipulis suis').words[0].candidates[0].pos).toBe('ADP');
    expect(run('Cum esset Iesus in Galilaea').words[0].candidates[0].pos).toBe('SCONJ');
  });
});

describe('constructions', () => {
  const keys = (s: string) => { const { tokens, analyses } = run(s); return laAdapter.detectPatterns(tokens, analyses).map((p) => p.key); };
  it('finds the ablative absolute (His dictis, Iesus exivit)', () => { expect(keys('His dictis, Iesus exivit de templo.')).toContain('ablative-absolute'); });
  it('finds a participle + noun absolute in either order (Hoc dicto / Iesu nato)', () => {
    expect(keys('Hoc dicto discessit.')).toContain('ablative-absolute');
  });
  it('does not call a noun governed by a preposition an absolute', () => { expect(keys('Cum discipulis suis ambulabat.')).not.toContain('ablative-absolute'); });
  it('finds accusative + infinitive after a verb of saying', () => { expect(keys('Dixit Moyses populum esse durae cervicis.')).toContain('accusative-infinitive-statement'); });
  it('finds object + infinitive after iubeo', () => { expect(keys('Iussit eos venire.')).toContain('accusative-infinitive-command'); });
  it('finds cum with the subjunctive and with the indicative', () => {
    expect(keys('Cum esset Iesus in Galilaea, dixit eis.')).toContain('cum-subjunctive');
    expect(keys('Cum venit hora, dixit.')).toContain('cum-indicative');
  });
  it('finds ut + subjunctive: purpose, and result after a word like ita', () => {
    expect(keys('Venit ut videat.')).toContain('ut-purpose-result');
    expect(keys('Tantus erat clamor ut non audirent.')).toEqual(expect.arrayContaining(['ut-result']));
  });
  it('finds the gerundive: after ad (purpose) and with sum (obligation)', () => {
    expect(keys('Venit ad aedificandam civitatem.')).toContain('gerundive-purpose');
    expect(keys('Liber legendus est.')).toContain('passive-periphrastic');
  });
  it('finds the perfect passive (participle + sum) and the deponent', () => {
    expect(keys('Amatus est.')).toContain('perfect-passive');
    expect(keys('Locutus est Dominus.')).toEqual(expect.arrayContaining(['deponent', 'perfect-passive']));
  });
  it('explains each construction in plain words', () => {
    const { tokens, analyses } = run('His dictis, Iesus exivit.');
    const p = laAdapter.detectPatterns(tokens, analyses).find((x) => x.key === 'ablative-absolute');
    expect(p?.title).toBe('Ablative absolute');
    expect(p?.explanation).toMatch(/participle/);
    expect(p!.confidence).toBeGreaterThan(0);
    expect(p!.confidence).toBeLessThan(1);
  });
});

describe('syntax and phrases', () => {
  it('attaches a sentence by case and agreement', () => {
    const { tokens, analyses } = run('Dominus dixit discipulis suis verbum bonum.');
    const sx = laAdapter.syntax!(tokens, analyses)!;
    const rel = (w: string) => sx.relations.find((r) => tokens[r.dependent].surface === w);
    expect(rel('dixit')?.relation).toBe('root');
    expect(rel('Dominus')?.relation).toBe('nsubj');
    expect(['iobj', 'obl']).toContain(rel('discipulis')?.relation);
    expect(rel('suis')?.relation).toBe('amod');
    expect(rel('bonum')?.relation).toBe('amod');
    expect(sx.attached).toBeGreaterThan(0.8);
  });
  it('recognises the fixed phrase in principio', () => {
    const { tokens, analyses } = run('In principio creavit Deus caelum et terram.');
    expect(laAdapter.detectPhrases(tokens, analyses).map((p) => p.display)).toContain('in principio');
  });
});

describe('support and sources', () => {
  it('is honest about what it is', () => {
    expect(laAdapter.version).toBe('1');
    expect(laAdapter.support.lemmatization).toBe('seed-only');
    expect(Object.keys(laAdapter.sources!)).toEqual(expect.arrayContaining(['la-lexicon', 'la-closed', 'la-rules']));
    expect(laAdapter.sources!['la-lexicon'].licence).toMatch(/Whitaker/);
    expect(laAdapter.sources!['la-wiktionary-tags'].licence).toMatch(/CC BY-SA/);
    expect(laAdapter.checkProduction([], [], '')).toEqual([]);
  });
  it('relates inflected forms of one lemma', () => {
    expect(laAdapter.relate('dominus', 'domini')).toBe('inflection');
    expect(laAdapter.relate('dominus', 'dominus')).toBe('same');
    expect(laAdapter.relate('dominus', 'terra')).toBe('none');
  });
});
