/**
 * The dictionary half of a German paradigm: the mapping of Wiktionary table tags (kaikki.org rows, copied from the real dump
 * for Student, groß, aufstehen, Haus and der) to the adapter's feature keys, and the merge with the generated cells
 * (verified / supported / generated / conflicted). The tables are template-generated and sometimes wrong; the mapper reports
 * what a row says and never corrects it.
 */
import { describe, expect, it } from 'vitest';
import { cellOf, paradigmSummary } from '../../src/core/paradigm';
import { deAdapter } from '../../src/adapters/de';
import { deParadigmFromTable, deTableRowDetail } from '../../src/adapters/german/paradigm';
import type { DeTableRow } from '../../src/adapters/german/paradigm';
import { tableForm, tableNote, unknownTableTags } from '../../src/adapters/german/table-tags';

const map = (tags: string, pos: 'NOUN' | 'ADJ' | 'VERB' | 'DET') => deAdapter.featuresFromTableTags!(tags.split(' '), pos);
const rows = (list: Array<[string, string]>): DeTableRow[] => list.map(([form, tags]) => ({ form, tags: tags.split(' ') }));

/** Haus's table as the dump has it (the dative singular lists two spellings). */
const HAUS = rows([
  ['Haus', 'nominative singular'], ['Häuser', 'definite nominative plural'], ['Hauses', 'genitive singular'], ['Häuser', 'definite genitive plural'],
  ['Haus', 'dative singular'], ['Hause', 'dative singular'], ['Häusern', 'dative definite plural'], ['Haus', 'accusative singular'], ['Häuser', 'accusative definite plural'],
]);

describe('table tags → adapter features', () => {
  it('a noun row: Case × Number; definite is an article context and is ignored', () => {
    expect(map('nominative singular', 'NOUN')).toEqual({ Case: 'Nom', Number: 'Sing' });
    expect(map('dative definite plural', 'NOUN')).toEqual({ Case: 'Dat', Number: 'Plur' });
    expect(map('genitive singular', 'NOUN')).toEqual({ Case: 'Gen', Number: 'Sing' });
    expect(map('accusative definite plural', 'NOUN')).toEqual({ Case: 'Acc', Number: 'Plur' });
  });
  it('an adjectival noun row keeps the declension (the table lists strong, weak and mixed)', () => {
    expect(map('genitive singular weak', 'NOUN')).toEqual({ Case: 'Gen', Number: 'Sing', Decl: 'Weak' });
    expect(map('mixed nominative plural', 'NOUN')).toEqual({ Case: 'Nom', Number: 'Plur', Decl: 'Mixed' });
  });
  it('an adjective row: Decl × Case × Gender (singular) / Number, Degree for the other two degrees', () => {
    expect(map('masculine nominative singular strong without-article', 'ADJ')).toEqual({ Decl: 'Strong', Case: 'Nom', Number: 'Sing', Gender: 'Masc' });
    expect(map('definite includes-article masculine nominative singular weak', 'ADJ')).toEqual({ Decl: 'Weak', Case: 'Nom', Number: 'Sing', Gender: 'Masc' });
    expect(map('includes-article indefinite masculine mixed nominative singular', 'ADJ')).toEqual({ Decl: 'Mixed', Case: 'Nom', Number: 'Sing', Gender: 'Masc' });
    expect(map('genitive plural strong without-article', 'ADJ')).toEqual({ Decl: 'Strong', Case: 'Gen', Number: 'Plur' });
    expect(map('comparative dative feminine singular strong without-article', 'ADJ')).toEqual({ Degree: 'Cmp', Decl: 'Strong', Case: 'Dat', Number: 'Sing', Gender: 'Fem' });
    expect(map('accusative definite includes-article plural superlative weak', 'ADJ')).toEqual({ Degree: 'Sup', Decl: 'Weak', Case: 'Acc', Number: 'Plur' });
  });
  it('the uninflected predicative rows repeat one form under four genders: all are the Position cell', () => {
    for (const g of ['masculine predicative singular', 'feminine predicative singular', 'neuter predicative singular', 'plural predicative']) expect(map(g, 'ADJ')).toEqual({ Position: 'Pred' });
    expect(map('comparative masculine predicative singular', 'ADJ')).toEqual({ Degree: 'Cmp', Position: 'Pred' });
    expect(map('masculine predicative singular superlative', 'ADJ')).toEqual({ Degree: 'Sup', Position: 'Pred' });
  });
  it('a finite verb row: Konjunktiv I is Sub + Pres, Konjunktiv II is Sub + Past, like the analysis', () => {
    expect(map('first-person indicative present singular', 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing' });
    expect(map('indicative preterite second-person singular', 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past', Person: '2', Number: 'Sing' });
    expect(map('singular subjunctive subjunctive-i third-person', 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Sub', Tense: 'Pres', Person: '3', Number: 'Sing' });
    expect(map('first-person plural subjunctive subjunctive-ii', 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Sub', Tense: 'Past', Person: '1', Number: 'Plur' });
    expect(map('formal first-person rare singular subjunctive subjunctive-ii', 'VERB')).toMatchObject({ Mood: 'Sub', Tense: 'Past' });
  });
  it('the imperative has no tense; the subordinate-clause form of a separable verb is Clause Sub', () => {
    expect(map('imperative second-person singular', 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' });
    expect(map('imperative plural second-person', 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Plur' });
    expect(map('indicative present singular subordinate-clause third-person', 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing', Clause: 'Sub' });
  });
  it('infinitive, zu-infinitive and the participles', () => {
    expect(map('infinitive', 'VERB')).toEqual({ VerbForm: 'Inf' });
    expect(map('infinitive infinitive-zu', 'VERB')).toEqual({ VerbForm: 'Inf', Variant: 'Zu' });
    expect(map('participle present', 'VERB')).toEqual({ VerbForm: 'Part', Tense: 'Pres' });
    expect(map('participle past', 'VERB')).toEqual({ VerbForm: 'Part', Tense: 'Past' });
  });
  it('determiner rows: Case × Gender (singular) / plural; definite is ignored', () => {
    expect(map('definite masculine nominative singular', 'DET')).toEqual({ Case: 'Nom', Number: 'Sing', Gender: 'Masc' });
    expect(map('dative definite plural', 'DET')).toEqual({ Case: 'Dat', Number: 'Plur' });
  });
  it('rows that are not cells map to nothing: headers, the auxiliary, the class, the periphrastic tenses, declined participles', () => {
    for (const t of ['table-tags', 'inflection-template', 'auxiliary', 'class']) expect(map(t, 'VERB')).toBeUndefined();
    expect(map('first-person indicative multiword-construction perfect singular', 'VERB')).toBeUndefined();
    expect(map('first-person future future-i multiword-construction singular subjunctive subjunctive-i', 'VERB')).toBeUndefined();
    expect(map('feminine nominative singular', 'VERB')).toBeUndefined(); // a verb entry's declined participle
    expect(map('table-tags', 'NOUN')).toBeUndefined();
    expect(map('diminutive neuter', 'NOUN')).toBeUndefined();
    expect(map('nominative singular', 'ADV' as never)).toBeUndefined();
  });
  it('a row that names two values of one feature, or too few features, is not a cell', () => {
    expect(map('first-person third-person indicative present singular', 'VERB')).toBeUndefined();
    expect(map('nominative accusative singular', 'NOUN')).toBeUndefined();
    expect(map('masculine nominative singular', 'ADJ')).toBeUndefined(); // no declension
    expect(map('present singular third-person', 'VERB')).toBeUndefined(); // no mood
  });
  it('reports the tags it does not know, and ignores usage labels', () => {
    expect(unknownTableTags(['nominative', 'archaic', 'rare', 'Austria', 'possessive', 'error-unrecognized-form'])).toEqual(['possessive', 'error-unrecognized-form']);
    expect(deTableRowDetail(['nominative', 'singular', 'frobnicated'], 'NOUN').unknown).toEqual(['frobnicated']);
    expect(deTableRowDetail(['table-tags'], 'NOUN').skipped).toBe('not-a-cell');
    expect(tableNote(['archaic', 'indicative', 'preterite'])).toBe('archaic');
  });
});

describe('table forms', () => {
  it('the article of an "includes-article" row is not part of the form', () => {
    expect(tableForm('der große', ['definite', 'includes-article', 'masculine', 'nominative', 'singular', 'weak'])).toBe('große');
    expect(tableForm('keine großen', ['includes-article', 'indefinite', 'mixed', 'negative', 'plural'])).toBe('großen');
    expect(tableForm('eines großen', ['includes-article', 'genitive'])).toBe('großen');
    expect(tableForm('am größten', ['masculine', 'predicative', 'singular', 'superlative'])).toBe('am größten');
  });
  it('a dash is an empty cell, "older also: daß" is an annotation, and a cited reflexive infinitive loses its pronoun', () => {
    expect(tableForm('-', ['nominative', 'plural'])).toBeUndefined();
    expect(tableForm('older also: daß', ['definite'])).toBeUndefined();
    expect(tableForm('sich sputen', ['infinitive'])).toBe('sputen');
    expect(tableForm('sich gesputet', ['participle', 'past'])).toBe('gesputet');
  });
});

describe('merging the dictionary table with the generated cells', () => {
  it('Haus: every cell verified, the older dative in -e is a second spelling of a verified cell', () => {
    const p = deParadigmFromTable('Haus', 'NOUN', HAUS)!;
    const s = paradigmSummary(p);
    expect(s).toEqual({ verified: 8, supported: 0, generated: 0, conflicted: 0 });
    expect(p.status).toBe('verified');
    const dat = cellOf(p, { Case: 'Dat', Number: 'Sing' })!;
    expect(dat.status).toBe('verified');
    expect(dat.form).toBe('Haus');
    expect(dat.alternatives).toEqual(['Hause']);
    expect(p.sources.map((x) => x.id)).toEqual([expect.stringMatching(/^adapter-de@/), 'kaikki-de']);
    expect(p.languageId).toBe('de');
  });
  it('a cell only the rules have is generated; a cell only the table has is supported; a disagreement is conflicted with both forms', () => {
    const generatedOnly = deParadigmFromTable('Haus', 'NOUN', [])!;
    expect(paradigmSummary(generatedOnly)).toMatchObject({ generated: 8, verified: 0 });
    expect(generatedOnly.status).toBe('generated');
    const withExtras = deParadigmFromTable('Haus', 'NOUN', [...HAUS.filter((r) => !r.tags.includes('accusative')), { form: 'Hausen', tags: ['accusative', 'plural'] }, { form: 'Häuslein', tags: ['vocative', 'singular'] }])!;
    const acc = cellOf(withExtras, { Case: 'Acc', Number: 'Plur' })!;
    expect(acc.status).toBe('conflicted');
    expect(acc.form).toBe('Hausen');
    expect(acc.alternatives).toEqual(['Häuser']);
    expect(cellOf(withExtras, { Case: 'Acc', Number: 'Sing' })!.status).toBe('generated');
    expect(withExtras.status).toBe('conflicted');
    const unknown = deParadigmFromTable('Zwitscherer', 'NOUN', rows([['Zwitscherer', 'nominative singular'], ['Zwitscherern', 'dative plural']]))!;
    expect(unknown.cells.every((c) => c.status === 'supported' && c.sources.join() === 'wiktionary')).toBe(true);
    expect(unknown.notes[0]).toMatch(/not in the word list/);
  });
  it('nothing generated and no usable row: no paradigm', () => {
    expect(deParadigmFromTable('Zwitscherer', 'NOUN', rows([['table-tags', 'table-tags']]))).toBeUndefined();
  });
  it('the table spelling that agrees with the rules goes first, so a listed variant does not make the cell a conflict', () => {
    const p = deParadigmFromTable('lachen', 'VERB', rows([
      ['lache', 'imperative second-person singular'], ['lach', 'imperative second-person singular'],
    ]))!;
    const imp = cellOf(p, { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' })!;
    expect(imp.status).toBe('verified');
    expect([imp.form, ...(imp.alternatives ?? [])].sort()).toEqual(['lach', 'lache']);
  });
  it('a separable verb: main-clause cells, subordinate-clause cells (Clause Sub) and the multiword rows left out', () => {
    const p = deParadigmFromTable('aufstehen', 'VERB', rows([
      ['aufstehen', 'infinitive'], ['aufzustehen', 'infinitive infinitive-zu'], ['aufgestanden', 'participle past'], ['aufstehend', 'participle present'],
      ['steht auf', 'indicative present singular third-person'], ['aufsteht', 'indicative present singular subordinate-clause third-person'],
      ['stand auf', 'indicative preterite singular third-person'], ['stünde auf', 'singular subjunctive subjunctive-ii third-person'], ['stände auf', 'singular subjunctive subjunctive-ii third-person'],
      ['steh auf', 'imperative second-person singular'], ['stehe auf', 'imperative second-person singular'], ['steht auf', 'imperative plural second-person'],
      ['haben or sein', 'auxiliary'], ['habe aufgestanden', 'first-person indicative multiword-construction perfect singular'], ['irregular strong', 'table-tags'],
    ], ))!;
    const s = paradigmSummary(p);
    expect(s.verified).toBe(10);
    expect(s.conflicted).toBe(0);
    expect(p.cells.some((c) => /aufgestanden/.test(c.form) && c.features.VerbForm === 'Fin')).toBe(false);
    const sub = cellOf(p, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing', Clause: 'Sub' })!;
    expect(sub.form).toBe('aufsteht');
    expect(sub.status).toBe('verified');
    const k2 = cellOf(p, { VerbForm: 'Fin', Mood: 'Sub', Tense: 'Past', Person: '3', Number: 'Sing' })!;
    expect(k2.status).toBe('verified');
    expect([k2.form, ...(k2.alternatives ?? [])].sort()).toEqual(['stände auf', 'stünde auf']);
  });
  it('an adjective: the article-bearing weak and mixed rows are compared without the article; a real disagreement is kept (rosa)', () => {
    const gutRows = rows([
      ['guter', 'masculine nominative singular strong without-article'], ['der gute', 'definite includes-article masculine nominative singular weak'],
      ['ein guter', 'includes-article indefinite masculine mixed nominative singular'], ['guten', 'indefinite mixed nominative plural'], ['keine guten', 'includes-article indefinite mixed negative nominative plural'],
      ['gut', 'masculine predicative singular'], ['gut', 'plural predicative'], ['besser', 'comparative'], ['besser', 'comparative masculine predicative singular'], ['am besten', 'masculine predicative singular superlative'],
    ]);
    const p = deParadigmFromTable('gut', 'ADJ', gutRows)!;
    expect(cellOf(p, { Decl: 'Weak', Case: 'Nom', Gender: 'Masc', Number: 'Sing' })).toMatchObject({ form: 'gute', status: 'verified' });
    expect(cellOf(p, { Decl: 'Mixed', Case: 'Nom', Number: 'Plur' })).toMatchObject({ form: 'guten', status: 'verified' });
    expect(cellOf(p, { Position: 'Pred' })).toMatchObject({ form: 'gut', status: 'verified' });
    expect(cellOf(p, { Degree: 'Cmp', Position: 'Pred' })).toMatchObject({ form: 'besser', status: 'verified' });
    expect(cellOf(p, { Degree: 'Sup', Position: 'Pred' })).toMatchObject({ form: 'am besten', status: 'verified' });
    const rosa = deParadigmFromTable('rosa', 'ADJ', rows([['rosaner', 'masculine nominative singular strong without-article']]))!;
    const c = cellOf(rosa, { Decl: 'Strong', Case: 'Nom', Gender: 'Masc', Number: 'Sing' })!;
    expect(c.status).toBe('conflicted');
    expect(c.form).toBe('rosaner');
    expect(c.alternatives).toEqual(['rosa']);
  });
  it('a determiner: der verified in all sixteen cells', () => {
    const p = deParadigmFromTable('der', 'DET', rows([
      ['der', 'definite masculine nominative singular'], ['die', 'definite feminine nominative singular'], ['das', 'definite neuter nominative singular'], ['die', 'definite nominative plural'],
      ['des', 'definite genitive masculine singular'], ['der', 'definite feminine genitive singular'], ['dem', 'dative definite masculine singular'], ['den', 'dative definite plural'],
    ]))!;
    expect(paradigmSummary(p)).toMatchObject({ verified: 8, generated: 8, conflicted: 0 });
  });
});
