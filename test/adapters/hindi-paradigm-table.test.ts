/**
 * The dictionary half of a Hindi paradigm: the mapping of Wiktionary's table tags (kaikki.org rows in the shape of the real
 * dump for कुत्ता, नीला, मैं and करना) to the adapter's feature keys, and the merge with the generated cells (verified /
 * supported / generated / conflicted). The tables are template-generated and sometimes wrong; the mapper reports what a row
 * says and never corrects it. A table row of a verb that is built with an auxiliary is a construction and is not a cell.
 */
import { describe, expect, it } from 'vitest';
import { cellOf, paradigmSummary } from '../../src/core/paradigm';
import { HI_PARADIGM_CONTEXT, hiAdapter } from '../../src/adapters/hi';
import { hiParadigmFromTable, hiTableCells, type HiTableRow } from '../../src/adapters/hindi/paradigm';
import { hiTableTagsDetail } from '../../src/adapters/hindi/table-tags';

type P = 'NOUN' | 'VERB' | 'ADJ' | 'PRON' | 'PROPN';
const map = (tags: string[], pos: P, form?: string) => (hiAdapter.featuresFromTableTags as (t: string[], p: P, f?: string) => Record<string, string> | undefined)(tags, pos, form);
const rows = (list: Array<[string, string]>): HiTableRow[] => list.map(([form, tags]) => ({ form, tags: tags.split(' ') }));

const KUTTA = rows([
  ['no-table-tags', 'table-tags'], ['hi-ndecl', 'inflection-template'], ['ā-stem', 'class'],
  ['कुत्ता', 'direct singular'], ['कुत्ते', 'direct plural'], ['कुत्ते', 'oblique singular'], ['कुत्तों', 'oblique plural'], ['कुत्ते', 'singular vocative'], ['कुत्तो', 'plural vocative'],
]);
const NEELA = rows([
  ['no-table-tags', 'table-tags'], ['hi-adecl', 'inflection-template'], ['ā-stem', 'class'],
  ['नीला', 'direct masculine singular'], ['नीले', 'direct masculine plural'], ['नीली', 'direct feminine singular'], ['नीली', 'direct feminine plural'],
  ['नीले', 'masculine oblique singular'], ['नीले', 'masculine oblique plural'], ['नीली', 'feminine oblique singular'], ['नीली', 'feminine oblique plural'],
  ['नीले', 'masculine singular vocative'], ['नीले', 'masculine plural vocative'], ['नीली', 'feminine singular vocative'], ['नीली', 'feminine plural vocative'],
]);
const MAIN = rows([
  ['no-table-tags', 'table-tags'], ['l-self', 'inflection-template'],
  ['मैं', 'direct'], ['मुझ', 'indirect'], ['मैंने', 'ergative'], ['मेरा', 'genitive'], ['मुझे', 'dative'], ['मुझको', 'dative'], ['मुझसे', 'error-unrecognized-form'],
  ['मुझमें', 'inessive'], ['मुझपे', 'adessive'], ['मुझपर', 'adessive'], ['मुझतक', 'terminative'],
]);
const KARNA = rows([
  ['कर', 'stem'], ['करना', 'infinitive'], ['करने', 'infinitive oblique'], ['करकर', 'conjunctive'], ['करके', 'conjunctive'], ['करते-करते', 'progressive'],
  ['करना', 'direct infinitive masculine singular'], ['करने', 'infinitive masculine oblique singular'], ['करने', 'infinitive masculine plural'], ['करनी', 'feminine infinitive singular'], ['करनीं', 'feminine infinitive plural'],
  ['करता', 'direct habitual masculine singular'], ['करते', 'habitual masculine oblique singular'], ['करते', 'habitual masculine plural'], ['करती', 'feminine habitual singular'], ['करतीं', 'feminine habitual plural'],
  ['किया', 'direct masculine perfective singular'], ['किये', 'masculine oblique perfective singular'], ['किये', 'masculine perfective plural'], ['की', 'feminine perfective singular'], ['कीं', 'feminine perfective plural'],
  ['करनेवाला', 'agentive direct masculine prospective singular'], ['किया हुआ', 'adjectival direct masculine perfective singular'], ['करता हुआ', 'adjectival direct habitual masculine singular'],
  ['किया', 'indicative masculine perfect singular'], ['किये', 'formal indicative masculine perfect plural second-person'], ['की', 'feminine indicative perfect second-person'],
  ['करूँगा', 'first-person future indicative masculine singular'], ['करेगा', 'future indicative masculine second-person singular third-person'], ['करोगे', 'future indicative masculine plural second-person'],
  ['करेंगे', 'first-person future indicative masculine plural third-person'], ['करेंगे', 'formal future indicative masculine plural second-person'],
  ['करूँ', 'feminine first-person future masculine singular subjunctive'], ['करे', 'feminine future masculine second-person singular subjunctive third-person'], ['करो', 'feminine future masculine plural second-person subjunctive'],
  ['करें', 'feminine first-person future masculine plural subjunctive third-person'], ['करें', 'feminine formal future masculine plural second-person subjunctive'],
  ['कर', 'feminine imperative masculine present second-person singular'], ['करो', 'feminine imperative masculine plural present second-person'],
  ['कीजिये', 'feminine formal imperative masculine plural present second-person'], ['कीजिये', 'feminine imperative masculine plural present third-person'],
  ['करियो', 'feminine future imperative masculine second-person singular'], ['कीजियेगा', 'feminine formal future imperative masculine plural second-person'],
  // constructions: some carry the same tags as a single word above, with a form of more than one word
  ['किया होगा', 'future indicative masculine second-person singular third-person'], ['करता हूँ', 'first-person indicative masculine present singular'], ['करता था', 'indicative masculine past singular'],
  ['करता होगा', 'masculine past present presumptive second-person singular third-person'], ['करता', 'counterfactual masculine past singular'], ['करता हो', 'masculine present second-person singular subjunctive third-person'],
]);

describe('table tags -> adapter features', () => {
  it('noun rows are Case x Number', () => {
    expect(map(['direct', 'singular'], 'NOUN')).toEqual({ Case: 'Dir', Number: 'Sing' });
    expect(map(['oblique', 'plural'], 'NOUN')).toEqual({ Case: 'Obl', Number: 'Plur' });
    expect(map(['plural', 'vocative'], 'PROPN')).toEqual({ Case: 'Voc', Number: 'Plur' });
  });
  it('not cells: the template header, the class, the romanization, a row with no case', () => {
    expect(map(['table-tags'], 'NOUN')).toBeUndefined();
    expect(map(['inflection-template'], 'NOUN')).toBeUndefined();
    expect(map(['class'], 'NOUN')).toBeUndefined();
    expect(map(['romanization'], 'NOUN')).toBeUndefined();
    expect(map(['feminine'], 'NOUN')).toBeUndefined();
  });
  it('adjective rows: the masculine keeps its case, the feminine has none (as the analysis)', () => {
    expect(map(['direct', 'masculine', 'singular'], 'ADJ')).toEqual({ Gender: 'Masc', Number: 'Sing', Case: 'Dir' });
    expect(map(['masculine', 'oblique', 'plural'], 'ADJ')).toEqual({ Gender: 'Masc', Number: 'Plur', Case: 'Obl' });
    expect(map(['feminine', 'oblique', 'singular'], 'ADJ')).toEqual({ Gender: 'Fem', Number: 'Sing' });
    expect(map(['feminine', 'plural', 'vocative'], 'ADJ')).toEqual({ Gender: 'Fem', Number: 'Plur' });
  });
  it('pronoun rows: indirect is the oblique stem, the postposition rows are Obl + Adp, the broken से row is not placed', () => {
    expect(map(['indirect'], 'PRON')).toEqual({ Case: 'Obl' });
    expect(map(['ergative'], 'PRON')).toEqual({ Case: 'Erg' });
    expect(map(['inessive'], 'PRON')).toEqual({ Case: 'Obl', Adp: 'में' });
    expect(map(['adessive', 'singular'], 'PRON')).toEqual({ Case: 'Obl', Adp: 'पर', Number: 'Sing' });
    expect(map(['error-unrecognized-form'], 'PRON')).toBeUndefined();
    expect(hiTableTagsDetail(['error-unrecognized-form', 'singular'], 'PRON').skipped).toBe('error');
  });
  it('a possessive pronoun (मेरा) has an adjective table', () => {
    expect(map(['direct', 'masculine', 'singular'], 'PRON')).toEqual({ Gender: 'Masc', Number: 'Sing', Case: 'Dir' });
  });
  it('verb rows: the single words map, with the same keys as the analysis', () => {
    expect(map(['stem'], 'VERB')).toEqual({ VerbForm: 'Stem' });
    expect(map(['direct', 'infinitive', 'masculine', 'singular'], 'VERB')).toEqual({ VerbForm: 'Inf', Gender: 'Masc', Case: 'Dir' });
    expect(map(['feminine', 'infinitive', 'singular'], 'VERB')).toEqual({ VerbForm: 'Inf', Gender: 'Fem' });
    expect(map(['habitual', 'masculine', 'oblique', 'singular'], 'VERB')).toEqual({ VerbForm: 'Part', Aspect: 'Imp', Gender: 'Masc', Number: 'Sing', Case: 'Obl' });
    expect(map(['feminine', 'perfective', 'plural'], 'VERB')).toEqual({ VerbForm: 'Part', Aspect: 'Perf', Gender: 'Fem', Number: 'Plur' });
    expect(map(['conjunctive'], 'VERB')).toEqual({ VerbForm: 'Conv' });
    expect(map(['indicative', 'masculine', 'perfect', 'singular'], 'VERB')).toEqual({ VerbForm: 'Part', Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' });
  });
  it('a row for several persons gives a cell for each, the third person first', () => {
    const tags = ['feminine', 'future', 'masculine', 'second-person', 'singular', 'subjunctive', 'third-person'];
    const sub = hiTableTagsDetail(tags, 'VERB', 'करे');
    expect(sub.bundles).toEqual([
      { VerbForm: 'Fin', Mood: 'Sub', Person: '3', Number: 'Sing' },
      { VerbForm: 'Fin', Mood: 'Sub', Person: '2', Number: 'Sing', Polite: 'Infm' },
    ]);
    expect(map(tags, 'VERB')).toEqual(sub.bundles[0]);
    const fut = hiTableTagsDetail(['first-person', 'future', 'indicative', 'masculine', 'plural', 'third-person'], 'VERB', 'करेंगे');
    expect(fut.bundles.map((b) => b.Person)).toEqual(['3', '1']);
    expect(hiTableTagsDetail(['formal', 'future', 'indicative', 'masculine', 'plural', 'second-person'], 'VERB', 'करेंगे').bundles).toEqual([
      { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Fut', Gender: 'Masc', Person: '2', Number: 'Plur', Polite: 'Form' },
    ]);
  });
  it('tum has no number in a cell, as in the analysis', () => {
    expect(map(['feminine', 'future', 'masculine', 'plural', 'second-person', 'subjunctive'], 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Sub', Person: '2', Polite: 'Fam' });
  });
  it('commands: present and the later (future) command', () => {
    expect(map(['feminine', 'imperative', 'masculine', 'present', 'second-person', 'singular'], 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Polite: 'Infm' });
    expect(map(['feminine', 'formal', 'future', 'imperative', 'masculine', 'plural', 'second-person'], 'VERB')).toEqual({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Polite: 'Form', Tense: 'Fut' });
    expect(hiTableTagsDetail(['feminine', 'imperative', 'masculine', 'plural', 'present', 'third-person'], 'VERB').skipped).toBe('not-modelled');
  });
  it('constructions are not cells: the habitual present and past, the presumptive, the "adjectival" participle, the compound subjunctive', () => {
    for (const tags of [
      ['first-person', 'indicative', 'masculine', 'present', 'singular'], ['indicative', 'masculine', 'past', 'singular'],
      ['masculine', 'past', 'present', 'presumptive', 'second-person', 'singular', 'third-person'], ['adjectival', 'direct', 'masculine', 'perfective', 'singular'],
      ['counterfactual', 'masculine', 'past', 'singular'], ['masculine', 'present', 'second-person', 'singular', 'subjunctive', 'third-person'],
    ]) expect(map(tags, 'VERB', 'x y'), tags.join(' ')).toBeUndefined();
    expect(hiTableTagsDetail(['agentive', 'direct', 'masculine', 'prospective', 'singular'], 'VERB').skipped).toBe('not-modelled');
  });
  it('a future row has the tags of the perfect + future construction: it needs the form', () => {
    const tags = ['future', 'indicative', 'masculine', 'second-person', 'singular', 'third-person'];
    expect(hiTableTagsDetail(tags, 'VERB').skipped).toBe('needs-form');
    expect(map(tags, 'VERB', 'करेगा')).toMatchObject({ Tense: 'Fut', Person: '3' });
    expect(map(tags, 'VERB', 'किया होगा')).toBeUndefined();
  });
  it('a noun table in a verb entry (and the reverse) is not placed', () => {
    expect(hiTableTagsDetail(['direct', 'singular'], 'VERB').bundles).toEqual([]);
    expect(hiTableTagsDetail(['habitual', 'masculine', 'singular'], 'NOUN').skipped).toBe('wrong-table');
  });
  it('no tag of the real tables is unknown', () => {
    for (const r of [...KUTTA, ...NEELA, ...MAIN, ...KARNA]) expect(hiTableTagsDetail(r.tags, 'VERB').unknown, r.tags.join(' ')).toEqual([]);
  });
});

describe('the merge with the dictionary table', () => {
  it('कुत्ता: every generated cell the table has is verified; the singular vocative is the dictionary\'s alone', () => {
    const p = hiParadigmFromTable('कुत्ता', 'NOUN', KUTTA, HI_PARADIGM_CONTEXT)!;
    expect(p.kind).toBe('noun-declension');
    expect(cellOf(p, { Case: 'Obl', Number: 'Plur' })).toMatchObject({ form: 'कुत्तों', status: 'verified', sources: ['generated', 'wiktionary'] });
    expect(cellOf(p, { Case: 'Dir', Number: 'Sing' })?.status).toBe('verified');
    expect(cellOf(p, { Case: 'Voc', Number: 'Sing' })).toMatchObject({ form: 'कुत्ते', status: 'supported', sources: ['wiktionary'] });
    expect(p.status).toBe('supported');
    expect(paradigmSummary(p)).toEqual({ verified: 5, supported: 1, generated: 0, conflicted: 0 });
    expect(p.sources.map((s) => s.id)).toEqual(['adapter-hi', 'kaikki-hi']);
  });

  it('नीला: the feminine cells carry no case and agree, the masculine vocative is supported only', () => {
    const p = hiParadigmFromTable('नीला', 'ADJ', NEELA, HI_PARADIGM_CONTEXT)!;
    expect(cellOf(p, { Gender: 'Fem', Number: 'Plur' })).toMatchObject({ form: 'नीली', status: 'verified' });
    expect(cellOf(p, { Gender: 'Masc', Number: 'Sing', Case: 'Obl' })).toMatchObject({ form: 'नीले', status: 'verified' });
    expect(cellOf(p, { Gender: 'Masc', Number: 'Sing', Case: 'Voc' })?.status).toBe('supported');
    expect(paradigmSummary(p).conflicted).toBe(0);
    expect(paradigmSummary(p).generated).toBe(0);
  });

  it('मैं: the postposition forms and the broken से row; the dictionary\'s पे and पर, the rules\' form first', () => {
    const p = hiParadigmFromTable('मैं', 'PRON', MAIN, HI_PARADIGM_CONTEXT)!;
    expect(cellOf(p, { Case: 'Erg' })?.status).toBe('verified');
    expect(cellOf(p, { Case: 'Obl' })?.status).toBe('verified');
    expect(cellOf(p, { Case: 'Dat' })).toMatchObject({ form: 'मुझे', status: 'verified' });
    expect(cellOf(p, { Case: 'Gen' })).toMatchObject({ form: 'मेरा', status: 'verified' });
    expect(cellOf(p, { Case: 'Obl', Adp: 'पर' })).toMatchObject({ form: 'मुझपर', status: 'verified' });
    expect(cellOf(p, { Case: 'Obl', Adp: 'में' })?.status).toBe('verified');
    // the dictionary flags its own से row as an error: the rules' form stands alone
    expect(cellOf(p, { Case: 'Obl', Adp: 'से' })).toMatchObject({ form: 'मुझसे', status: 'generated' });
    expect(cellOf(p, { Case: 'Obl', Adp: 'तक' })?.status).toBe('supported');
  });

  it('करना: the single words are verified, the constructions are left out, the later commands are supported only', () => {
    const p = hiParadigmFromTable('करना', 'VERB', KARNA, HI_PARADIGM_CONTEXT)!;
    const sum = paradigmSummary(p);
    expect(sum.conflicted).toBe(0);
    expect(sum.verified).toBeGreaterThan(28);
    expect(cellOf(p, { VerbForm: 'Part', Aspect: 'Perf', Gender: 'Masc', Number: 'Plur' })).toMatchObject({ form: 'किए', status: 'verified' });
    expect(cellOf(p, { VerbForm: 'Part', Aspect: 'Perf', Gender: 'Masc', Number: 'Plur' })?.alternatives).toContain('किये');
    expect(cellOf(p, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Fut', Person: '3', Number: 'Sing', Gender: 'Masc' })).toMatchObject({ form: 'करेगा', status: 'verified' });
    expect(cellOf(p, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Fut', Person: '2', Number: 'Sing', Polite: 'Infm', Gender: 'Masc' })?.status).toBe('verified');
    expect(cellOf(p, { VerbForm: 'Fin', Mood: 'Sub', Person: '2', Polite: 'Fam' })).toMatchObject({ form: 'करो', status: 'verified' });
    expect(cellOf(p, { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Polite: 'Form' })).toMatchObject({ form: 'कीजिए', status: 'verified' });
    expect(cellOf(p, { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Polite: 'Infm', Tense: 'Fut' })).toMatchObject({ form: 'करियो', status: 'supported' });
    // no construction became a cell, and the future cell holds no "किया होगा"
    expect(p.cells.some((c) => /\s/.test(c.form) || (c.alternatives ?? []).some((a) => /\s/.test(a)))).toBe(false);
    expect(p.constructions).toContain('habitual-present');
    const t = hiTableCells(KARNA, 'VERB');
    expect(t.skipped.construction).toBeGreaterThan(5);
    expect(t.skipped['not-modelled']).toBeGreaterThan(1);
  });

  it('a disagreement is conflicted with both forms: the rules\' पिऊँ, the dictionary\'s पियूँ', () => {
    const p = hiParadigmFromTable('पीना', 'VERB', rows([['पियूँ', 'feminine first-person future masculine singular subjunctive']]), HI_PARADIGM_CONTEXT)!;
    const cell = cellOf(p, { VerbForm: 'Fin', Mood: 'Sub', Person: '1', Number: 'Sing' });
    expect(cell?.status).toBe('conflicted');
    expect(cell?.form).toBe('पियूँ');
    expect(cell?.alternatives).toContain('पिऊँ');
    expect(p.status).toBe('conflicted');
  });

  it('a word the adapter does not hold is the dictionary alone, said so; an entry of two genders uses the table that agrees', () => {
    const t = rows([['no-table-tags', 'table-tags'], ['hi-ndecl', 'inflection-template'], ['ज़ज़ज़', 'direct singular'], ['ज़ज़ज़', 'oblique singular']]);
    const p = hiParadigmFromTable('ज़ज़ज़', 'NOUN', t, HI_PARADIGM_CONTEXT)!;
    expect(p.cells.every((c) => c.status === 'supported')).toBe(true);
    expect(p.notes[0]).toMatch(/does not generate/);
    const two = rows([
      ['no-table-tags', 'table-tags'], ['hi-ndecl', 'inflection-template'], ['किताब', 'direct singular'], ['किताब', 'direct plural'],
      ['no-table-tags', 'table-tags'], ['hi-ndecl', 'inflection-template'], ['किताब', 'direct singular'], ['किताबें', 'direct plural'],
    ]);
    expect(cellOf(hiParadigmFromTable('किताब', 'NOUN', two, HI_PARADIGM_CONTEXT)!, { Case: 'Dir', Number: 'Plur' })).toMatchObject({ form: 'किताबें', status: 'verified' });
  });

  it('keeps NFC and the nukta in the dictionary forms', () => {
    const p = hiParadigmFromTable('आवाज़', 'NOUN', rows([['आवाज़ों', 'oblique plural']]), HI_PARADIGM_CONTEXT)!;
    const cell = cellOf(p, { Case: 'Obl', Number: 'Plur' })!;
    expect(cell.status).toBe('verified');
    expect(cell.form).toBe(cell.form.normalize('NFC'));
    expect(cell.form.includes('़')).toBe(true);
  });
});
