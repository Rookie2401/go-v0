/**
 * The French morphology engine (MORPH package, docs/french/PLAN.md): analysis by generation, plain-words descriptions, the
 * paradigm tables and the dictionary-label mapping. Machine-drafted, not checked by a native speaker.
 */
import { describe, expect, it } from 'vitest';
import type { PartOfSpeech } from '../../src/core';
import { analyzeFrenchForm, describeFrenchMorph } from '../../src/adapters/french/morphology';
import { alignDictionaryCells, frenchCellFeatureSets, frenchCellFeatures, frenchParadigm, VERB_CONSTRUCTIONS, type ParadigmContext } from '../../src/adapters/french/paradigm';
import { frenchFeaturesFromTableTags, frenchMorphFromTags, IGNORED_TABLE_TAGS, REJECT_TABLE_TAGS, unknownTableTags, USED_TABLE_TAGS } from '../../src/adapters/french/table-tags';
import { featureKey } from '../../src/core/paradigm';

/** The cell of a generated paradigm (core's `cellOf` is for a merged paradigm, which has sources and a status). */
const cellOf = (p: { cells: Array<{ features: Record<string, string>; form: string; note?: string }> }, f: Record<string, string>) => p.cells.find((c) => featureKey(c.features) === featureKey(f));

const VERBS = ['parler', 'finir', 'vendre', 'manger', 'placer', 'appeler', 'acheter', 'employer', 'envoyer', 'entrer', 'aller', 'faire', 'dire', 'être', 'avoir', 'voir', 'vivre', 'prendre', 'mettre', 'venir', 'écrire', 'partir', 'pouvoir', 'savoir', 'vouloir', 'ouvrir', 'connaître', 'revenir', 'recevoir', 'lire', 'conduire', 'rire', 'luire', 'asseoir', 'comprendre', 'prévoir', 'céder', 'payer', 'haïr', 'tenir', 'obtenir', 'mourir', 'naître', 'croire', 'boire', 'plaire', 'falloir', 'pleuvoir'];
const NOUNS = ['fut', 'cheval', 'œil', 'lion', 'chanteur', 'prix', 'ami', 'vit', 'porte', 'finit', 'dit', 'mit', 'prit'];
const ADJS = ['beau', 'vieux', 'heureux', 'blanc', 'national', 'lent', 'nouveau', 'doux', 'rouge', 'évident'];
const KNOWN: Record<string, ReadonlySet<string>> = { VERB: new Set(VERBS), AUX: new Set(['être', 'avoir']), NOUN: new Set(NOUNS), ADJ: new Set(ADJS) };
const known = (l: string, p?: PartOfSpeech): boolean => (p ? KNOWN[p]?.has(l) ?? false : Object.values(KNOWN).some((s) => s.has(l)));
const OPTS = { knownLemma: known };
const an = (f: string) => analyzeFrenchForm(f, OPTS);
const has = (f: string, lemma: string, morph: Record<string, string>) =>
  an(f).some((a) => a.lemma === lemma && Object.entries(morph).every(([k, v]) => a.morph[k] !== undefined && a.morph[k].split(',').includes(v)));

describe('analysis of verb forms', () => {
  it('faisons → faire, first person plural present (and the nous command)', () => {
    expect(has('faisons', 'faire', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Plur' })).toBe(true);
    expect(has('faisons', 'faire', { Mood: 'Imp', Person: '1', Number: 'Plur' })).toBe(true);
  });
  it('entra → entrer, third person singular passé simple', () => {
    const r = an('entra');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ lemma: 'entrer', pos: 'VERB', lemmaKnown: true, morph: { Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' }, register: ['literary'] });
  });
  it('fut: être passé simple, beside the noun it also is', () => {
    expect(has('fut', 'être', { Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' })).toBe(true);
    expect(an('fut').some((a) => a.lemma === 'fut' && a.pos === 'NOUN')).toBe(true);
    expect(an('fut').every((a) => a.confidence <= 0.75)).toBe(true);
  });
  it('eut, vint, prit, mit', () => {
    expect(has('eut', 'avoir', { Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' })).toBe(true);
    expect(has('vint', 'venir', { Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' })).toBe(true);
    expect(has('vint', 'revenir', { Tense: 'Past' })).toBe(false); // revenir is known but its form is revint
    expect(has('prit', 'prendre', { Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' })).toBe(true);
    expect(has('mit', 'mettre', { Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' })).toBe(true);
  });
  it('vit: voir passé simple AND vivre present', () => {
    expect(has('vit', 'voir', { Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' })).toBe(true);
    expect(has('vit', 'vivre', { Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' })).toBe(true);
    expect(an('vit').every((a) => a.confidence <= 0.75)).toBe(true);
  });
  it('dit: present and passé simple of dire, and the participle', () => {
    expect(has('dit', 'dire', { Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' })).toBe(true);
    expect(has('dit', 'dire', { Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' })).toBe(true);
    expect(has('dit', 'dire', { VerbForm: 'Part', Tense: 'Past', Gender: 'Masc', Number: 'Sing' })).toBe(true);
  });
  it('finit: present or passé simple of finir, none above 0.75', () => {
    const r = an('finit');
    expect(r.filter((a) => a.lemma === 'finir').map((a) => a.morph.Tense).sort()).toEqual(['Past', 'Pres']);
    expect(r.every((a) => a.confidence <= 0.75)).toBe(true);
  });
  it('parlât, eût, fût: the literary subjunctive', () => {
    expect(has('parlât', 'parler', { Mood: 'Sub', Tense: 'Imp', Person: '3', Number: 'Sing' })).toBe(true);
    expect(has('eût', 'avoir', { Mood: 'Sub', Tense: 'Imp', Person: '3', Number: 'Sing' })).toBe(true);
    expect(has('fût', 'être', { Mood: 'Sub', Tense: 'Imp', Person: '3', Number: 'Sing' })).toBe(true);
    expect(an('fût')[0].register).toEqual(['literary']);
  });
  it('allé, allée, allés, allées: the four participles of aller', () => {
    expect(has('allé', 'aller', { VerbForm: 'Part', Gender: 'Masc', Number: 'Sing' })).toBe(true);
    expect(has('allée', 'aller', { VerbForm: 'Part', Gender: 'Fem', Number: 'Sing' })).toBe(true);
    expect(has('allés', 'aller', { VerbForm: 'Part', Gender: 'Masc', Number: 'Plur' })).toBe(true);
    expect(has('allées', 'aller', { VerbForm: 'Part', Gender: 'Fem', Number: 'Plur' })).toBe(true);
  });
  it('écrites → écrire participle feminine plural', () => {
    const r = an('écrites');
    expect(r[0]).toMatchObject({ lemma: 'écrire', pos: 'VERB', morph: { VerbForm: 'Part', Tense: 'Past', Gender: 'Fem', Number: 'Plur' } });
  });
  it('spelling changes: mangeons, plaçait, appelle, achète, emploie, enverrai', () => {
    expect(has('mangeons', 'manger', { Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Plur' })).toBe(true);
    expect(has('plaçait', 'placer', { Mood: 'Ind', Tense: 'Imp', Person: '3', Number: 'Sing' })).toBe(true);
    expect(has('appelle', 'appeler', { Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing' })).toBe(true);
    expect(has('appelle', 'appeler', { Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' })).toBe(true);
    expect(has('appelle', 'appeler', { Mood: 'Sub', Tense: 'Pres' })).toBe(true);
    expect(has('appelle', 'appeler', { Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe(true);
    expect(has('achète', 'acheter', { Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' })).toBe(true);
    expect(has('emploie', 'employer', { Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' })).toBe(true);
    expect(has('enverrai', 'envoyer', { Mood: 'Ind', Tense: 'Fut', Person: '1', Number: 'Sing' })).toBe(true);
    expect(has('cèderai', 'céder', { Mood: 'Ind', Tense: 'Fut' })).toBe(true);
    expect(an('cèderai')[0].rule).toMatch(/1990/);
    expect(has('paie', 'payer', { Mood: 'Ind', Tense: 'Pres', Person: '1' })).toBe(true);
    expect(has('paye', 'payer', { Mood: 'Ind', Tense: 'Pres', Person: '3' })).toBe(true);
  });
  it('prefixed verbs: reviens, comprenons, prévoirai, permis', () => {
    expect(has('reviens', 'revenir', { Mood: 'Ind', Tense: 'Pres', Person: '1' })).toBe(true);
    expect(has('reviens', 'revenir', { Mood: 'Ind', Tense: 'Pres', Person: '2' })).toBe(true);
    expect(has('comprenons', 'comprendre', { Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Plur' })).toBe(true);
    expect(has('prévoirai', 'prévoir', { Mood: 'Ind', Tense: 'Fut', Person: '1' })).toBe(true);
    expect(has('connaît', 'connaître', { Mood: 'Ind', Tense: 'Pres', Person: '3' })).toBe(true);
    // reconnaître is in no list here: the rule alone reads it, inferred
    const r = an('reconnaissons').find((a) => a.lemma === 'reconnaître');
    expect(r).toMatchObject({ lemmaKnown: false });
    expect(r!.confidence).toBeLessThanOrEqual(0.6);
  });
  it('irregular + known lemma outranks regular + known lemma; both are above a rule guess', () => {
    const irregular = an('allé')[0].confidence;
    const regular = an('parlât')[0].confidence;
    const guess = analyzeFrenchForm('zorbons', { knownLemma: () => false })[0].confidence;
    expect(irregular).toBeGreaterThan(regular);
    expect(regular).toBeGreaterThan(guess);
    expect(irregular).toBeLessThanOrEqual(0.9);
  });
});

describe('analysis of noun and adjective forms', () => {
  it('chevaux → cheval, yeux → œil', () => {
    expect(an('chevaux')[0]).toMatchObject({ lemma: 'cheval', pos: 'NOUN', morph: { Number: 'Plur' }, lemmaKnown: true });
    expect(an('yeux')[0]).toMatchObject({ lemma: 'œil', pos: 'NOUN', morph: { Number: 'Plur' } });
  });
  it('belle → beau, vieille → vieux, heureuse, blanche, nationales', () => {
    expect(an('belle')[0]).toMatchObject({ lemma: 'beau', pos: 'ADJ', morph: { Gender: 'Fem', Number: 'Sing' } });
    expect(an('vieille')[0]).toMatchObject({ lemma: 'vieux', pos: 'ADJ', morph: { Gender: 'Fem', Number: 'Sing' } });
    expect(an('heureuse')[0]).toMatchObject({ lemma: 'heureux', pos: 'ADJ', morph: { Gender: 'Fem', Number: 'Sing' } });
    expect(an('blanche')[0]).toMatchObject({ lemma: 'blanc', pos: 'ADJ', morph: { Gender: 'Fem', Number: 'Sing' } });
    expect(an('nationales')[0]).toMatchObject({ lemma: 'national', pos: 'ADJ', morph: { Gender: 'Fem', Number: 'Plur' } });
  });
  it('lentement → lent, as a derived (weaker) reading', () => {
    const a = an('lentement')[0];
    expect(a).toMatchObject({ lemma: 'lent', pos: 'ADV', lemmaKnown: true });
    expect(a.confidence).toBeLessThanOrEqual(0.6);
  });
  it('readings that differ only in person, number or gender are one reading with a comma list', () => {
    expect(an('parle')[0].morph.Person).toBe('1,3');
    expect(an('rouge')[0].morph).toMatchObject({ Gender: 'Fem,Masc' });
    expect(an('prix')[0].morph.Number).toBe('Plur,Sing');
  });
});

describe('unknown words: rule readings only, never confident', () => {
  it('a lemma the list does not hold stays at 0.6 or below with lemmaKnown false', () => {
    for (const w of ['zorbons', 'flurbait', 'brabouillera', 'sglorpé', 'tapis']) {
      const r = analyzeFrenchForm(w, { knownLemma: known });
      for (const a of r) {
        expect(a.confidence, `${w}: ${a.lemma}`).toBeLessThanOrEqual(0.6);
        expect(a.lemmaKnown, `${w}: ${a.lemma}`).toBe(false);
      }
    }
  });
  it('an unknown word in -s is not confidently a plural', () => {
    const r = analyzeFrenchForm('tapis', { knownLemma: () => false });
    expect(r.every((a) => a.confidence <= 0.6)).toBe(true);
    expect(r.some((a) => a.pos === 'NOUN' && a.lemma === 'tapis' && a.morph.Number === 'Sing')).toBe(true);
    // a known singular makes it a plural at full strength
    expect(an('amis')[0]).toMatchObject({ lemma: 'ami', pos: 'NOUN', morph: { Number: 'Plur' }, lemmaKnown: true });
    expect(an('amis')[0].confidence).toBeGreaterThan(0.8);
  });
  it('an unknown -ir verb is read as a second-group verb, inferred, and says so', () => {
    const r = analyzeFrenchForm('tapissons', { knownLemma: () => false }).filter((a) => a.pos === 'VERB');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((a) => a.confidence <= 0.6 && !a.lemmaKnown)).toBe(true);
    const g = analyzeFrenchForm('grandissons', { knownLemma: () => false }).find((a) => a.lemma === 'grandir');
    expect(g?.rule).toMatch(/second-group/);
  });
  it('a verb in no list is read through the irregular families only with attested prefixes', () => {
    // comprenons is no guess for xyzprendre, but comprendre is a listed prefix
    const r = analyzeFrenchForm('comprenons', { knownLemma: () => false });
    expect(r.some((a) => a.lemma === 'comprendre' && a.confidence <= 0.6)).toBe(true);
    expect(r.some((a) => a.lemma === 'xyzprendre')).toBe(false);
  });
  it('words with other shapes give nothing', () => {
    expect(analyzeFrenchForm('', OPTS)).toEqual([]);
    expect(analyzeFrenchForm('123', OPTS)).toEqual([]);
    expect(analyzeFrenchForm("l'", OPTS)).toEqual([]);
    expect(analyzeFrenchForm('peut-être', OPTS)).toEqual([]);
    expect(analyzeFrenchForm('a-t-il', OPTS)).toEqual([]);
  });
  it('works without a word list (verb rules only)', () => {
    const r = analyzeFrenchForm('chantions');
    expect(r.some((a) => a.lemma === 'chanter')).toBe(true);
    expect(r.every((a) => !a.lemmaKnown && a.confidence <= 0.6)).toBe(true);
  });
});

describe('describeFrenchMorph', () => {
  it('plain words', () => {
    expect(describeFrenchMorph({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' })).toBe('third person singular, passé simple (the literary past)');
    expect(describeFrenchMorph({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Plur' })).toBe('first person plural, present');
    expect(describeFrenchMorph({ VerbForm: 'Part', Tense: 'Past', Gender: 'Fem', Number: 'Sing' })).toBe('past participle, feminine singular');
    expect(describeFrenchMorph({ VerbForm: 'Fin', Mood: 'Sub', Tense: 'Imp', Person: '3', Number: 'Sing' })).toBe('imperfect subjunctive (literary), third person singular');
    expect(describeFrenchMorph({ VerbForm: 'Fin', Mood: 'Cnd', Tense: 'Pres', Person: '1', Number: 'Sing' })).toBe('conditional, first person singular');
    expect(describeFrenchMorph({ Gender: 'Fem', Number: 'Plur' }, 'ADJ')).toBe('feminine plural');
    expect(describeFrenchMorph({ VerbForm: 'Inf' })).toBe('infinitive');
    expect(describeFrenchMorph({ VerbForm: 'Part', Tense: 'Pres' })).toBe('present participle');
    expect(describeFrenchMorph({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe('imperative, second person singular');
    expect(describeFrenchMorph({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1,3', Number: 'Sing' })).toBe('first or third person singular, present');
    expect(describeFrenchMorph({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Imp', Person: '3', Number: 'Plur' })).toBe('third person plural, imperfect');
    expect(describeFrenchMorph({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Fut', Person: '2', Number: 'Sing' })).toBe('second person singular, future');
    expect(describeFrenchMorph({ Gender: 'Fem,Masc', Number: 'Plur,Sing' }, 'ADJ')).toBe('masculine or feminine singular or plural'.replace('masculine or feminine', 'feminine or masculine'));
    expect(describeFrenchMorph({})).toBe('');
  });
});

describe('speed: the adapter calls the engine for every word of a page', () => {
  it('20,000 analyses of mixed forms in well under 2 seconds', () => {
    const forms = ['parle', 'parlons', 'mangeons', 'plaçait', 'appelle', 'achète', 'emploie', 'enverrai', 'faisons', 'entra', 'fut', 'eut', 'vint', 'prit', 'mit', 'vit', 'dit', 'finit', 'parlât', 'eût', 'fût',
      'allé', 'allée', 'écrites', 'chevaux', 'yeux', 'belle', 'vieille', 'heureuse', 'blanche', 'nationales', 'lentement', 'reviens', 'comprenons', 'tapis', 'zorbons', 'maison', 'les', 'très', 'sommes', 'avaient', 'sera', 'finissons', 'vendons', 'prévoirai', 'connaît'];
    // 20,000 analyses over a few hundred distinct forms (a page repeats its words), then a block of distinct unknown forms
    const many: string[] = [];
    for (let i = 0; i < 20000; i++) many.push(i % 5 === 0 ? forms[i % forms.length] + (i % 97 === 0 ? 's' : '') : forms[(i * 7) % forms.length]);
    const t0 = performance.now();
    let n = 0;
    for (const f of many) n += analyzeFrenchForm(f, OPTS).length;
    const dt = performance.now() - t0;
    expect(n).toBeGreaterThan(20000);
    expect(dt).toBeLessThan(1500);
  });
  it('distinct unknown forms: a few thousand in well under 2 seconds', () => {
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 2000; i++) n += analyzeFrenchForm(`zorb${i.toString(36)}ons`, OPTS).length;
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(n).toBeGreaterThan(0);
  });
});

describe('table tags: the real labels of the French extract', () => {
  it('form-of labels → features', () => {
    expect(frenchMorphFromTags(['first-person', 'form-of', 'indicative', 'plural', 'present'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Plur' });
    expect(frenchMorphFromTags(['form-of', 'historic', 'past', 'singular', 'third-person'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' });
    expect(frenchMorphFromTags(['form-of', 'imperfect', 'singular', 'subjunctive', 'third-person'])).toEqual({ VerbForm: 'Fin', Mood: 'Sub', Tense: 'Imp', Person: '3', Number: 'Sing' });
    expect(frenchMorphFromTags(['form-of', 'imperfect', 'indicative', 'plural', 'second-person'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Imp', Person: '2', Number: 'Plur' });
    expect(frenchMorphFromTags(['conditional', 'first-person', 'form-of', 'plural'])).toEqual({ VerbForm: 'Fin', Mood: 'Cnd', Tense: 'Pres', Person: '1', Number: 'Plur' });
    expect(frenchMorphFromTags(['first-person', 'form-of', 'future', 'singular'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Fut', Person: '1', Number: 'Sing' });
    expect(frenchMorphFromTags(['form-of', 'imperative', 'plural', 'second-person'])).toEqual({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Plur' });
    expect(frenchMorphFromTags(['form-of', 'participle', 'past'])).toEqual({ VerbForm: 'Part', Tense: 'Past' });
    expect(frenchMorphFromTags(['form-of', 'participle', 'present'])).toEqual({ VerbForm: 'Part', Tense: 'Pres' });
    expect(frenchMorphFromTags(['feminine', 'form-of', 'participle', 'plural'])).toEqual({ VerbForm: 'Part', Tense: 'Past', Gender: 'Fem', Number: 'Plur' });
    expect(frenchMorphFromTags(['form-of', 'masculine', 'participle', 'plural'])).toEqual({ VerbForm: 'Part', Tense: 'Past', Gender: 'Masc', Number: 'Plur' });
    // a form shared by two readings: a comma list in alphabetical order
    expect(frenchMorphFromTags(['first-person', 'form-of', 'indicative', 'present', 'singular', 'subjunctive', 'third-person'])).toEqual({
      VerbForm: 'Fin', Mood: 'Ind,Sub', Tense: 'Pres', Person: '1,3', Number: 'Sing',
    });
    expect(frenchMorphFromTags(['feminine', 'form-of', 'masculine', 'plural'])).toEqual({ Gender: 'Fem,Masc', Number: 'Plur' });
    expect(frenchMorphFromTags(['form-of', 'plural'])).toEqual({ Number: 'Plur' });
    expect(frenchMorphFromTags(['form-of', 'rare'])).toEqual({});
  });
  it('table rows → one cell each; compound tenses, IPA rows and alternatives are not cells', () => {
    const row = (tags: string[], pos = 'VERB', form?: string) => frenchFeaturesFromTableTags(tags, pos, form);
    expect(row(['first-person', 'indicative', 'present', 'singular'], 'VERB', 'parle')).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing' });
    expect(row(['first-person', 'historic', 'indicative', 'past', 'plural'], 'VERB', 'parlâmes')).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past', Person: '1', Number: 'Plur' });
    expect(row(['future', 'indicative', 'plural', 'second-person'], 'VERB', 'parlerez')).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Fut', Person: '2', Number: 'Plur' });
    expect(row(['conditional', 'second-person', 'singular'], 'VERB', 'parlerais')).toEqual({ VerbForm: 'Fin', Mood: 'Cnd', Tense: 'Pres', Person: '2', Number: 'Sing' });
    expect(row(['imperfect', 'plural', 'second-person', 'subjunctive'], 'VERB', 'parlassiez')).toEqual({ VerbForm: 'Fin', Mood: 'Sub', Tense: 'Imp', Person: '2', Number: 'Plur' });
    expect(row(['imperative', 'second-person', 'singular'], 'VERB', 'parle')).toEqual({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' });
    expect(row(['infinitive'], 'VERB', 'parler')).toEqual({ VerbForm: 'Inf' });
    expect(row(['gerund', 'participle', 'present'], 'VERB', 'parlant')).toEqual({ VerbForm: 'Part', Tense: 'Pres' });
    expect(row(['participle', 'past'], 'VERB', 'parlé')).toEqual({ VerbForm: 'Part', Tense: 'Past', Gender: 'Masc', Number: 'Sing' });
    // not cells
    expect(row(['indicative', 'multiword-construction', 'perfect', 'present'], 'VERB', "j'ai parlé")).toBeUndefined();
    expect(row(['infinitive', 'multiword-construction'], 'VERB', 'avoir + past participle')).toBeUndefined();
    expect(row(['first-person', 'indicative', 'present', 'singular'], 'VERB', 'paʁl')).toBeUndefined();
    expect(row(['gerund', 'multiword-construction', 'participle', 'present'], 'VERB', 'ayant + past participle')).toBeUndefined();
    expect(row(['table-tags'], 'VERB', 'no-table-tags')).toBeUndefined();
    expect(row(['inflection-template'], 'VERB', 'fr-conj-auto')).toBeUndefined();
    expect(row(['alternative', 'nonstandard'], 'NOUN', 'oeil')).toBeUndefined();
    expect(row(['canonical'], 'NOUN')).toBeUndefined();
    expect(row(['first-person', 'indicative', 'singular', 'third-person'], 'VERB')).toBeUndefined();
    // nouns and adjectives
    expect(row(['plural'], 'NOUN', 'chevaux')).toEqual({ Number: 'Plur' });
    expect(row(['feminine'], 'ADJ', 'belle')).toEqual({ Gender: 'Fem', Number: 'Sing' });
    expect(row(['masculine', 'plural'], 'ADJ', 'beaux')).toEqual({ Gender: 'Masc', Number: 'Plur' });
    expect(row(['feminine', 'plural'], 'ADJ', 'belles')).toEqual({ Gender: 'Fem', Number: 'Plur' });
    expect(row(['feminine', 'masculine', 'plural'], 'ADJ', 'heureux')).toEqual({ Number: 'Plur' });
    expect(row(['before-vowel', 'masculine', 'singular'], 'ADJ', 'bel')).toEqual({ Gender: 'Masc', Number: 'Sing' });
    expect(row(['plural'], 'ADV')).toBeUndefined();
  });
  it('the three tag sets are disjoint and cover the labels the extract uses', () => {
    for (const t of USED_TABLE_TAGS) { expect(IGNORED_TABLE_TAGS.has(t)).toBe(false); expect(REJECT_TABLE_TAGS.has(t)).toBe(false); }
    for (const t of IGNORED_TABLE_TAGS) expect(REJECT_TABLE_TAGS.has(t)).toBe(false);
    const extract = ['first-person', 'second-person', 'third-person', 'singular', 'plural', 'masculine', 'feminine', 'indicative', 'subjunctive', 'imperative', 'conditional', 'present', 'imperfect', 'future', 'historic', 'past', 'participle', 'gerund', 'infinitive',
      'multiword-construction', 'perfect', 'pluperfect', 'anterior', 'reflexive', 'table-tags', 'inflection-template', 'alternative', 'canonical', 'form-of', 'before-vowel', 'obsolete', 'archaic', 'rare', 'dated', 'Quebec', 'Louisiana', 'Canada', 'nonstandard', 'colloquial', 'slang'];
    expect(unknownTableTags(extract)).toEqual([]);
    expect(unknownTableTags(['tag-from-another-extract'])).toEqual(['tag-from-another-extract']);
  });
});

describe('paradigms', () => {
  const ctx: ParadigmContext = { known: (l, p) => known(l, p), genderOf: (l) => (l === 'chanteur' || l === 'lion' ? 'Masc' : undefined) };

  it('a verb: the cells are the engine forms, keyed by the analysis features', () => {
    const p = frenchParadigm('parler', 'VERB', ctx)!;
    expect(p.kind).toBe('verb-conjugation');
    expect(p.constructions).toEqual([...VERB_CONSTRUCTIONS]);
    expect(VERB_CONSTRUCTIONS).toEqual(['passe-compose', 'plus-que-parfait', 'futur-proche']);
    expect(cellOf(p, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Plur' })?.form).toBe('parlons');
    expect(cellOf(p, { VerbForm: 'Fin', Mood: 'Cnd', Tense: 'Pres', Person: '3', Number: 'Sing' })?.form).toBe('parlerait');
    expect(cellOf(p, { VerbForm: 'Fin', Mood: 'Sub', Tense: 'Imp', Person: '3', Number: 'Sing' })?.form).toBe('parlât');
    expect(cellOf(p, { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' })?.form).toBe('parle');
    expect(cellOf(p, { VerbForm: 'Part', Tense: 'Past', Gender: 'Fem', Number: 'Plur' })?.form).toBe('parlées');
    expect(cellOf(p, { VerbForm: 'Inf' })?.form).toBe('parler');
    // the literary tenses say so
    expect(cellOf(p, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' })?.note).toMatch(/literary/);
    // the long imperative before en and y is a second cell with a note
    expect(p.cells.filter((c) => c.features.Mood === 'Imp' && c.features.Person === '2' && c.features.Number === 'Sing').map((c) => c.form)).toEqual(['parle', 'parles']);
    // every analysed form of a verb finds its cell
    for (const f of ['parlons', 'parlât', 'parlées', 'parle']) {
      for (const a of an(f).filter((x) => x.lemma === 'parler')) {
        for (const feats of frenchCellFeatureSets('VERB', a.morph)) expect(cellOf(p, feats), `${f} ${JSON.stringify(feats)}`).toBeTruthy();
      }
    }
  });

  it('an irregular and a defective verb', () => {
    const e = frenchParadigm('être', 'AUX', ctx)!;
    expect(cellOf(e, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Plur' })?.form).toBe('sont');
    expect(cellOf(e, { VerbForm: 'Part', Tense: 'Past' })?.form).toBe('été');
    expect(e.template).toBe('irregular');
    const f = frenchParadigm('falloir', 'VERB', ctx)!;
    expect(f.cells.filter((c) => c.features.Mood === 'Ind' && c.features.Tense === 'Pres').map((c) => c.form)).toEqual(['faut']);
    expect(f.notes.join(' ')).toMatch(/Defective/);
    expect(frenchParadigm('comprendre', 'VERB', ctx)!.template).toBe('irregular (like prendre)');
  });

  it('a pronominal verb: the cells are the base verb, the pronoun is in the note', () => {
    const p = frenchParadigm('se laver', 'VERB', ctx)!;
    expect(cellOf(p, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing' })).toMatchObject({ form: 'lave', note: 'me lave' });
    expect(cellOf(p, { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' })?.note).toMatch(/lave-toi/);
    expect(p.template).toMatch(/pronominal/);
  });

  it('a noun with its feminine counterpart when the word list has it; an adjective with four cells', () => {
    const k2: ParadigmContext = { known: (l, p) => (l === 'chanteuse' && p === 'NOUN') || known(l, p), genderOf: ctx.genderOf };
    const n = frenchParadigm('chanteur', 'NOUN', k2)!;
    expect(n.cells.map((c) => `${c.features.Gender ?? ''}/${c.features.Number}/${c.form}`)).toEqual(['/Sing/chanteur', '/Plur/chanteurs', 'Fem/Sing/chanteuse', 'Fem/Plur/chanteuses']);
    expect(frenchParadigm('chanteur', 'NOUN', ctx)!.cells).toHaveLength(2);
    expect(frenchParadigm('cheval', 'NOUN', ctx)!.cells.map((c) => c.form)).toEqual(['cheval', 'chevaux']);
    const a = frenchParadigm('beau', 'ADJ', ctx)!;
    expect(cellOf(a, { Gender: 'Fem', Number: 'Sing' })?.form).toBe('belle');
    expect(cellOf(a, { Gender: 'Masc', Number: 'Plur' })?.form).toBe('beaux');
    expect(a.cells.find((c) => c.form === 'bel')?.note).toMatch(/vowel/);
    expect(frenchParadigm('table', 'PRON', ctx)).toBeUndefined();
    expect(frenchParadigm('trois mots', 'NOUN', ctx)).toBeUndefined();
  });

  it('cell features of analysed forms', () => {
    expect(frenchCellFeatures('VERB', { VerbForm: 'Fin', Mood: 'Imp', Tense: 'Pres', Person: '2', Number: 'Sing' })).toEqual({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' });
    expect(frenchCellFeatures('NOUN', { Gender: 'Masc', Number: 'Plur' })).toEqual({ Number: 'Plur' });
    expect(frenchCellFeatureSets('VERB', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1,3', Number: 'Sing' })).toEqual([
      { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing' }, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' },
    ]);
  });

  it('alignDictionaryCells puts the dictionary form that matches the rules first', () => {
    const gen = [{ features: { Number: 'Plur' }, form: 'chevaux' }];
    const dict = [{ features: { Number: 'Plur' }, form: 'chevals' }, { features: { Number: 'Plur' }, form: 'chevaux' }];
    expect(alignDictionaryCells(gen, dict).map((d) => d.form)).toEqual(['chevaux', 'chevals']);
  });
});
