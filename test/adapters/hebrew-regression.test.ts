/**
 * Hebrew morphology and gloss regression (the owner's audit, 2026-11-05: "I exalteded", Isaiah 1:2). Each row is a real Open Scriptures reading, written as
 * the source gives it (lemma chain, code, letters per morpheme, checked against the index on 2026-11-05), so nothing here needs the installed index; test/adapters/hebrew-tanakh-sweep.test.ts walks
 * the whole Tanakh where the index is present. The lemma glosses are the index's own.
 */
import { describe, expect, it } from 'vitest';
import { decodeOshb, oshbParts } from '../../src/adapters/hebrew/oshb';
import { pointed } from '../../src/adapters/hebrew/text';
import { hebrewWordAnalysis, hebrewInflectedMeaning } from '../../src/adapters/hebrew/word-analysis';
import { contextualRenderingFor } from '../../src/adapters/hebrew/contextual';
import { agreementOf, rootClassOf, verbComponents } from '../../src/adapters/hebrew/form-analysis';
import { isEnglishBaseVerb, isWellFormedEnglishVerb, realizeFromCitation, verbSensesOfCitation } from '../../src/core/english-verb';

interface Row { ref?: string; form: string; lemma: string; gloss: string; chain: string; code: string; seg?: string; sentence?: string }
const read = (r: Row) => {
  const reading = decodeOshb(r.chain, r.code);
  const parts = oshbParts(r.form, reading, r.seg, r.lemma, reading.pos);
  const analysis = hebrewWordAnalysis({ surface: r.form, lemma: r.lemma, pos: reading.pos, lemmaGloss: r.gloss, morph: reading.morph, parts, ...(r.ref ? { references: [r.ref] } : {}), ...(r.sentence ? { sentence: r.sentence } : {}) });
  return { reading, analysis };
};

const ISA_1_2: Row = { ref: 'Isa.1.2', form: 'וְרוֹמַמְתִּי', lemma: 'רוּם', gloss: 'be high, exalted, rise', chain: 'c/7311 a', code: 'HC/Vop1cs', seg: '1/6' };

describe('Isaiah 1:2, וְרוֹמַמְתִּי', () => {
  it('never says "exalteded": the morphological English is "And I raised", the contextual "And I brought up"', () => {
    const { reading, analysis } = read(ISA_1_2);
    expect(reading.morph).toMatchObject({ Binyan: 'Polel', Conj: 'Perf', Person: '1', Gender: 'Com', Number: 'Sing' });
    expect(analysis.lexicalMeaning?.text).toBe('be high, exalted, rise');
    expect(analysis.inflectedMeaning?.text).toBe('And I raised');
    expect(analysis.contextualMeaning?.text).toBe('And I brought up');
    expect(JSON.stringify(analysis)).not.toMatch(/eded\b/);
  });
  it('without the verse there is no contextual claim, and without the conjunction no "and"', () => {
    const bare = read({ ...ISA_1_2, ref: undefined }).analysis;
    expect(bare.contextualMeaning).toBeNull();
    expect(bare.inflectedMeaning?.text).toBe('And I raised');
    expect(read({ ...ISA_1_2, ref: undefined, form: 'רוֹמַמְתִּי', chain: '7311 a', code: 'HVop1cs', seg: undefined }).analysis.inflectedMeaning?.text).toBe('I raised');
  });
  it('is cut into the conjunction, the Polel base and the first-person ending, with the root and why the form looks as it does', () => {
    const f = read(ISA_1_2).analysis.formAnalysis!;
    expect(f.components).toEqual([{ text: 'וְ', role: 'and' }, { text: 'רוֹמַמְ', role: 'Polel verbal base' }, { text: 'תִּי', role: 'perfect first person common singular ending' }]);
    expect(f.root).toBe('רום');
    expect(f.rootMeaning).toBe('be high, exalted, rise');
    const stem = f.lines.find((l) => l.key === 'stem')!.text;
    expect(stem).toContain('Polel');
    expect(stem).toContain('hollow root');
    expect(f.lines.find((l) => l.key === 'conjugation')!.text).toContain('the sentence decides');
    expect(f.lines.find((l) => l.key === 'agreement')!.text).toBe('First person common singular.');
    expect(f.lines.find((l) => l.key === 'context')!.text).toContain('children');
    expect(f.limitation).toBeUndefined();
  });
  it('the rendering is found from the words around it on a page with no reference, and not in another verse', () => {
    const verse = 'בָּנִ֣ים גִּדַּ֔לְתִּי וְרוֹמַ֖מְתִּי וְהֵ֖ם פָּ֥שְׁעוּ בִֽי׃';
    expect(contextualRenderingFor('וְרוֹמַ֖מְתִּי', undefined, verse)?.text).toBe('And I brought up');
    expect(contextualRenderingFor('וְרוֹמַמְתִּי', undefined, 'וְרוֹמַמְתִּי אֶת שְׁמוֹ')).toBeUndefined();
    expect(contextualRenderingFor('וְרוֹמַמְתִּי', ['Ps.30.2'], verse)).toBeUndefined();
  });
});

describe('the citation is not a list of base verbs', () => {
  it('reads a state with its "be" left out, and the verb of a participle', () => {
    expect(verbSensesOfCitation('be high, exalted, rise')).toEqual([{ head: 'be', tail: 'high' }, { head: 'be', tail: 'exalted', base: 'exalt', baseTail: '' }, { head: 'rise', tail: '' }]);
    expect(verbSensesOfCitation('be, become, much')).toEqual([{ head: 'be', tail: 'much' }, { head: 'become', tail: 'much' }]);
    expect(verbSensesOfCitation('be dry, dried up, withered')[1]).toEqual({ head: 'be', tail: 'dried up', base: 'dry', baseTail: 'up' });
    expect(verbSensesOfCitation('fearing')).toEqual([{ head: 'fear', tail: '' }]);
    expect(verbSensesOfCitation('utterly destroy, annihilate')[0]).toEqual({ head: 'destroy', tail: '' });
    expect(verbSensesOfCitation("wife's father, wife's mother")).toEqual([]);
    expect(verbSensesOfCitation('quickly, speedily')).toEqual([]);
    expect(verbSensesOfCitation('good, pleasant')).toEqual([]);
  });
  it('knows a base verb from a participle, adjective, noun or adverb', () => {
    for (const w of ['exalt', 'need', 'feed', 'sing', 'bring', 'cling', 'rise', 'apply']) expect(isEnglishBaseVerb(w), w).toBe(true);
    for (const w of ['exalted', 'finished', 'enduring', 'fearing', 'broken', 'good', 'high', 'quickly', 'seer']) expect(isEnglishBaseVerb(w), w).toBe(false);
  });
  it.each([
    ['be high, exalted, rise', 'Polel', 'I exalted'], ['be firm, be set up, established', 'Polel', 'I established'], ['be complete, at an end, finished', 'Piel', 'I finished'],
    ['be set apart, consecrated, be hallowed', 'Piel', 'I consecrated'], ['be dry, dried up, withered', 'Hifil', 'I dried up'], ['be dispersed, scattered, disperse', 'Hifil', 'I scattered'],
    ['be heavy, weighty, burdensome', 'Hifil', 'I made heavy'], ['be clean, pure, be clean ceremonially', 'Piel', 'I made clean'],
  ])('%s in the %s: one ending, on a real verb', (gloss, binyan, expected) => {
    expect(hebrewInflectedMeaning('שׁשׁשׁ', { Binyan: binyan, Conj: 'Perf', VerbForm: 'Fin', Person: '1', Gender: 'Com', Number: 'Sing' }, gloss)).toBe(expected);
  });
  it('the passive and reflexive stems take the state, the Qal stays a state', () => {
    const f = (binyan: string, gloss: string, lemma = 'שׁשׁשׁ') => hebrewInflectedMeaning(lemma, { Binyan: binyan, Conj: 'Perf', VerbForm: 'Fin', Person: '3', Gender: 'Masc', Number: 'Sing' }, gloss);
    expect(f('Qal', 'be high, exalted, rise')).toBe('He was high');
    expect(f('Polal', 'be high, exalted, rise')).toBe('He was exalted');
    expect(f('Nifal', 'be firm, be set up, established')).toBe('He was established');
    expect(f('Hofal', 'be twisted')).toBe('He was twisted');
    expect(f('Hitpael', 'be clean, pure, be clean ceremonially')).toBe('He made himself clean');
    expect(f('Hitpolel', 'be high, exalted, rise', 'רוּם')).toBe('He exalted himself');
  });
  it('refuses rather than invents: a noun or adverb citation gives no English of the form, and the card says so', () => {
    expect(hebrewInflectedMeaning('שׁשׁשׁ', { Binyan: 'Qal', Conj: 'Perf', VerbForm: 'Fin', Person: '3', Gender: 'Masc', Number: 'Sing' }, 'good, pleasant')).toBeUndefined();
    expect(hebrewInflectedMeaning('שׁשׁשׁ', { Binyan: 'Piel', Conj: 'Imp', VerbForm: 'Fin', Person: '2', Gender: 'Masc', Number: 'Sing' }, 'quickly, speedily')).toBeUndefined();
    const a = hebrewWordAnalysis({ surface: 'טוֹב', lemma: 'טוֹב', pos: 'VERB', lemmaGloss: 'good, pleasant', morph: { Binyan: 'Qal', Conj: 'Perf', VerbForm: 'Fin', Person: '3', Gender: 'Masc', Number: 'Sing' } });
    expect(a.inflectedMeaning).toBeNull();
    expect(a.lexicalMeaning?.text).toBe('good, pleasant');
    expect(a.formAnalysis?.limitation).toContain('lemma meaning');
  });
  it('the guard: no malformed conjugation passes, and real doubles do', () => {
    for (const bad of ['I exalteded', 'He finisheded', 'enduringing', 'fearinging', 'They dismayeded', 'I sanctifieded']) expect(isWellFormedEnglishVerb(bad), bad).toBe(false);
    for (const good of ['I needed', 'He exceeded', 'singing', 'bringing out', 'I will give a ringing cry', 'And he preceded', 'feeding', 'He exalted himself']) expect(isWellFormedEnglishVerb(good), good).toBe(true);
    expect(realizeFromCitation('exalted', { finite: true, time: 'past', person: '1', number: 'Sing' })).toBe('I was exalted');
  });
});

/** The audit's table and more, one row for each principal stem and form. */
const ROWS: Array<Row & { binyan: string; conj: string; agreement?: string; english: string; context?: string; components?: string[] }> = [
  { ref: 'Gen.1.1', form: 'בָּרָא', lemma: 'בָּרָא', gloss: 'shape, create, fashion', chain: '1254 a', code: 'HVqp3ms', binyan: 'Qal', conj: 'Perf', agreement: 'third person masculine singular', english: 'He shaped', context: 'He created' },
  { ref: 'Gen.1.3', form: 'יְהִי', lemma: 'הָיָה', gloss: 'to be, become, happen', chain: '1961', code: 'HVqj3ms', binyan: 'Qal', conj: 'Juss', english: 'May he be', context: 'Let there be' },
  { ref: 'Gen.1.3', form: 'וַיְהִי', lemma: 'הָיָה', gloss: 'to be, become, happen', chain: 'c/1961', code: 'HC/Vqw3ms', seg: '1/3', binyan: 'Qal', conj: 'Wayyiqtol', english: 'And he was', context: 'And there was', components: ['וַ', 'יְ', 'הִי'] },
  { ref: 'Exod.20.2', form: 'הוֹצֵאתִיךָ', lemma: 'יָצָא', gloss: 'to go out, come out', chain: '3318', code: 'HVhp1cs/Sp2ms', seg: '6/1', binyan: 'Hifil', conj: 'Perf', agreement: 'first person common singular', english: 'I brought you out', context: 'I brought you out', components: ['הוֹצֵא', 'תִי', 'ךָ'] },
  { ref: 'Ps.23.1', form: 'אֶחְסָר', lemma: 'חָסֵר', gloss: 'lack, need, be lacking', chain: '2637', code: 'HVqi1cs', binyan: 'Qal', conj: 'Impf', english: 'I will lack', context: 'I shall not lack', components: ['אֶ', 'חְסָר'] },
  { ref: 'Gen.12.1', form: 'לֶךְ', lemma: 'יָלַךְ', gloss: 'to go, walk', chain: '3212', code: 'HVqv2ms', binyan: 'Qal', conj: 'Imp', english: 'Go!', context: 'Go!' },
  { form: 'נִמְצָא', lemma: 'מָצָא', gloss: 'to find, attain', chain: '4672', code: 'HVNp3ms', binyan: 'Nifal', conj: 'Perf', english: 'He was found' },
  { form: 'דִּבֶּר', lemma: 'דָבַר', gloss: 'to speak', chain: '1696', code: 'HVpp3ms', binyan: 'Piel', conj: 'Perf', english: 'He spoke' },
  { form: 'יֻלַּד', lemma: 'יָלַד', gloss: 'to bear, beget, bring forth', chain: '3205', code: 'HVPp3ms', binyan: 'Pual', conj: 'Perf', english: 'He was born' },
  { form: 'הֵבִיא', lemma: 'בּוֹא', gloss: 'to come, go in, enter', chain: '935', code: 'HVhp3ms', binyan: 'Hifil', conj: 'Perf', english: 'He brought' },
  { form: 'הוּבָא', lemma: 'בּוֹא', gloss: 'to come, go in, enter', chain: '935', code: 'HVHp3ms', binyan: 'Hofal', conj: 'Perf', english: 'He was brought' },
  { form: 'הִתְקַדְּשׁוּ', lemma: 'קָדַשׁ', gloss: 'be set apart, consecrated, be hallowed', chain: '6942', code: 'HVtv2mp', binyan: 'Hitpael', conj: 'Imp', english: 'Consecrate yourselves! (plural)' },
  { form: 'כּוֹנֵן', lemma: 'כּוּן', gloss: 'be firm, be set up, established', chain: '3559 a', code: 'HVop3ms', binyan: 'Polel', conj: 'Perf', english: 'He established' },
  { form: 'כּוֹנָנוּ', lemma: 'כּוּן', gloss: 'be firm, be set up, established', chain: '3559 a', code: 'HVOp3cp', binyan: 'Polal', conj: 'Perf', english: 'They were established' },
  { form: 'קִלְקַל', lemma: 'קָלַל', gloss: 'be slight, swift, trifling', chain: '7043', code: 'HVlp3ms', binyan: 'Pilpel', conj: 'Perf', english: 'He made slight' },
  { form: 'וַיִּשְׁתַּחוּ', lemma: 'שָׁחָה', gloss: 'bow down, depresses it, prostrate oneself', chain: 'c/7812', code: 'HC/Vtw3ms', seg: '1/5', binyan: 'Hitpael', conj: 'Wayyiqtol', english: 'And he bowed down' },
  { form: 'וְאָמַרְתָּ', lemma: 'אָמַר', gloss: 'to say', chain: 'c/559', code: 'HC/Vqq2ms', seg: '1/4', binyan: 'Qal', conj: 'WeQatal', english: 'And you will say', components: ['וְ', 'אָמַרְ', 'תָּ'] },
  { form: 'אֶשְׁמְרָה', lemma: 'שָׁמַר', gloss: 'to keep, watch, guard, observe', chain: '8104', code: 'HVqh1cs', binyan: 'Qal', conj: 'Coh', english: 'Let me keep' },
  { form: 'כְּתֹב', lemma: 'כָּתַב', gloss: 'write, write down, describe in writing', chain: '3789', code: 'HVqv2ms', binyan: 'Qal', conj: 'Imp', english: 'Write!' },
  { form: 'הֹלֵךְ', lemma: 'הָלַךְ', gloss: 'to go, walk', chain: '1980', code: 'HVqrmsa', binyan: 'Qal', conj: 'Part', english: 'going' },
  { form: 'כָּתוּב', lemma: 'כָּתַב', gloss: 'write, write down, describe in writing', chain: '3789', code: 'HVqsmsa', binyan: 'Qal', conj: 'PassPart', english: 'written' },
  { form: 'לֵאמֹר', lemma: 'אָמַר', gloss: 'to say', chain: 'l/559', code: 'HR/Vqc', seg: '1/3', binyan: 'Qal', conj: 'InfCons', english: 'to say' },
  { form: 'שָׁמוֹר', lemma: 'שָׁמַר', gloss: 'to keep, watch, guard, observe', chain: '8104', code: 'HVqa', binyan: 'Qal', conj: 'InfAbs', english: 'to keep' },
  { form: 'קָם', lemma: 'קוּם', gloss: 'to arise, stand up', chain: '6965 b', code: 'HVqp3ms', binyan: 'Qal', conj: 'Perf', english: 'He arose' }, // hollow
  { form: 'סָבְבוּ', lemma: 'סָבַב', gloss: 'turn about, go around, surround', chain: '5437', code: 'HVqp3cp', binyan: 'Qal', conj: 'Perf', english: 'They turned about' }, // geminate
  { form: 'עָשְׂתָה', lemma: 'עָשָׂה', gloss: 'to do, make', chain: '6213 a', code: 'HVqp3fs', binyan: 'Qal', conj: 'Perf', english: 'She did', components: ['עָשְׂ', 'תָה'] }, // final he
  { form: 'נָתַתִּי', lemma: 'נָתַן', gloss: 'to give, put, set', chain: '5414', code: 'HVqp1cs', binyan: 'Qal', conj: 'Perf', english: 'I gave', components: ['נָתַ', 'תִּי'] }, // irregular: the root's nun is absorbed
  { form: 'שְׁלָחַנִי', lemma: 'שָׁלַח', gloss: 'to send, stretch out', chain: '7971', code: 'HVqp3ms/Sp1cs', seg: '3/2', binyan: 'Qal', conj: 'Perf', english: 'He sent me' }, // pronominal suffix
  { form: 'יְכוֹנְנֶהָ', lemma: 'כּוּן', gloss: 'be firm, be set up, established', chain: '3559 a', code: 'HVoi3ms/Sp3fs', seg: '5/1', binyan: 'Polel', conj: 'Impf', english: 'He will establish her' },
];

describe('the principal stems and forms', () => {
  it.each(ROWS.map((r) => [`${r.form} ${r.code}`, r] as const))('%s', (_label, r) => {
    const { reading, analysis } = read(r);
    expect(reading.pos).toBe('VERB');
    expect(reading.morph.Binyan).toBe(r.binyan);
    expect(reading.morph.Conj).toBe(r.conj);
    expect(analysis.lemma).toBe(r.lemma);
    expect(analysis.inflectedMeaning?.text).toBe(r.english);
    expect(isWellFormedEnglishVerb(analysis.inflectedMeaning!.text)).toBe(true);
    if (r.agreement) expect(agreementOf(reading.morph)).toBe(r.agreement);
    if (r.context) expect(analysis.contextualMeaning?.text).toBe(r.context);
    else expect(analysis.contextualMeaning).toBeNull();
    if (r.components) expect(analysis.formAnalysis?.components.map((c) => c.text)).toEqual(r.components);
    // however it is cut, the pieces are the word: no letter or point is lost or added
    expect(analysis.formAnalysis!.components.map((c) => c.text).join('').normalize('NFC')).toBe(pointed(r.form).normalize('NFC'));
  });

  it('does not force a cut: a 3ms perfect has no ending, and a form that does not show the expected ending stays whole', () => {
    expect(verbComponents('אָמַר', { Conj: 'Perf', Person: '3', Gender: 'Masc', Number: 'Sing' }, 'Qal')).toEqual([{ text: 'אָמַר', role: 'Qal verb' }]);
    expect(verbComponents('אָמַר', { Conj: 'Perf', Person: '1', Gender: 'Com', Number: 'Sing' }, 'Qal')).toEqual([{ text: 'אָמַר', role: 'Qal verb' }]); // the features name an ending the letters do not show
    expect(verbComponents('יִשְׁמְרוּ', { Conj: 'Impf', Person: '3', Gender: 'Masc', Number: 'Plur' }, 'Qal').map((c) => c.text)).toEqual(['יִ', 'שְׁמְר', 'וּ']);
  });

  it('names the class of a root', () => {
    expect(['רומ', 'סבב', 'עשה', 'נתנ', 'ישב', 'שמע', 'כתב'].map(rootClassOf)).toEqual(['hollow', 'geminate', 'III-he', 'I-nun', 'I-yod', 'guttural', 'strong']);
  });

  it('keeps points and ignores cantillation: the cantillated verse form is the same word, and its pieces keep their points', () => {
    const cantillated = 'וְרוֹמַ֖מְתִּי';
    const r = read({ ...ISA_1_2, form: cantillated, seg: '1/6' });
    expect(r.analysis.contextualMeaning?.text).toBe('And I brought up');
    expect(r.analysis.formAnalysis?.components.map((c) => c.text)).toEqual(['וְ', 'רוֹמַמְ', 'תִּי']);
  });

  it('is not used for a non-verb: a noun has no form analysis and no verb English', () => {
    const a = hebrewWordAnalysis({ surface: 'דָּבָר', lemma: 'דָּבָר', pos: 'NOUN', lemmaGloss: 'word, thing', morph: { Gender: 'Masc', Number: 'Sing' } });
    expect(a.formAnalysis).toBeUndefined();
    expect(a.inflectedMeaning).toBeNull();
  });
});
