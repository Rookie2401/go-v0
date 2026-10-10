import { describe, expect, it } from 'vitest';
import { esAdapter } from '../../src/adapters/es';
import { cellOf, mergeParadigm } from '../../src/core/paradigm';
import { tableRow, unknownTableTags } from '../../src/adapters/spanish/table-tags';
import { spanishCellFeatures } from '../../src/adapters/spanish/paradigm';

const map = (tags: string[], pos: 'VERB' | 'NOUN' | 'ADJ' = 'VERB') => esAdapter.featuresFromTableTags!(tags, pos);

/** Rows copied from kaikki.org's Spanish dictionary (hablar, niño, bonito, grande, quejarse), with their tags as Wiktionary spells them. */
describe('featuresFromTableTags: the tags of real kaikki rows', () => {
  it('maps the finite forms to the keys and values the analysis uses', () => {
    expect(map(['first-person', 'indicative', 'plural', 'present'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Plur' });
    expect(map(['first-person', 'indicative', 'plural', 'preterite'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past', Person: '1', Number: 'Plur' });
    expect(map(['imperfect', 'indicative', 'second-person', 'singular'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Imp', Person: '2', Number: 'Sing' });
    expect(map(['future', 'indicative', 'plural', 'third-person'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Fut', Person: '3', Number: 'Plur' });
  });
  it('the conditional (tagged indicative too) is Mood Cnd with no Tense', () => {
    expect(map(['conditional', 'first-person', 'indicative', 'singular'])).toEqual({ VerbForm: 'Fin', Mood: 'Cnd', Person: '1', Number: 'Sing' });
  });
  it('tú is the plain second person; the vos row carries Variety=Voseo', () => {
    expect(map(['indicative', 'informal', 'present', 'second-person', 'singular'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '2', Number: 'Sing' });
    expect(map(['indicative', 'informal', 'present', 'second-person', 'singular', 'vos-form'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '2', Number: 'Sing', Variety: 'Voseo' });
    expect(map(['informal', 'present', 'second-person', 'singular', 'subjunctive', 'vos-form'])).toMatchObject({ Mood: 'Sub', Variety: 'Voseo' });
  });
  it('the imperfect subjunctive is -ra unless the row says -se', () => {
    expect(map(['imperfect', 'plural', 'subjunctive', 'third-person'])).toEqual({ VerbForm: 'Fin', Mood: 'Sub', Tense: 'Imp', Person: '3', Number: 'Plur', Variant: 'Ra' });
    expect(map(['imperfect', 'imperfect-se', 'plural', 'subjunctive', 'third-person'])).toMatchObject({ Variant: 'Se' });
    expect(map(['first-person', 'future', 'singular', 'subjunctive'])).toEqual({ VerbForm: 'Fin', Mood: 'Sub', Tense: 'Fut', Person: '1', Number: 'Sing' });
  });
  it('imperatives: usted / ustedes are Polite=Form (third person); the negative command is not a cell', () => {
    expect(map(['imperative', 'informal', 'second-person', 'singular'])).toEqual({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' });
    expect(map(['imperative', 'informal', 'second-person', 'singular', 'vos-form'])).toMatchObject({ Variety: 'Voseo' });
    expect(map(['formal', 'imperative', 'second-person-semantically', 'singular', 'third-person'])).toEqual({ VerbForm: 'Fin', Mood: 'Imp', Person: '3', Number: 'Sing', Polite: 'Form' });
    expect(map(['imperative', 'plural', 'second-person'])).toEqual({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Plur' });
    expect(map(['first-person', 'imperative', 'plural'])).toEqual({ VerbForm: 'Fin', Mood: 'Imp', Person: '1', Number: 'Plur' });
    expect(map(['imperative', 'negative', 'second-person', 'singular'])).toBeUndefined();
  });
  it('non-finite forms, with the participle agreeing', () => {
    expect(map(['infinitive'])).toEqual({ VerbForm: 'Inf' });
    expect(map(['gerund'])).toEqual({ VerbForm: 'Ger' });
    expect(map(['feminine', 'participle', 'past', 'plural'])).toEqual({ VerbForm: 'Part', Gender: 'Fem', Number: 'Plur' });
  });
  it('rows that are not cells map to undefined: bookkeeping, clitic-attached forms, a person-by-person infinitive', () => {
    expect(map(['table-tags'])).toBeUndefined();
    expect(map(['inflection-template'])).toBeUndefined();
    expect(map(['canonical'])).toBeUndefined();
    expect(map(['combined-form', 'dative', 'infinitive', 'object-first-person', 'object-singular'])).toBeUndefined();
    expect(map(['combined-form', 'accusative', 'imperative', 'informal', 'object-singular', 'object-third-person', 'second-person', 'singular', 'with-tú'])).toBeUndefined();
    expect(map(['first-person', 'infinitive', 'singular'])).toBeUndefined(); // quejarme
    expect(map(['unheard-of'])).toBeUndefined();
    expect(map(['present'])).toBeUndefined(); // names no mood
  });
  it('unknown tags are ignored, and reported by unknownTableTags', () => {
    expect(map(['first-person', 'indicative', 'present', 'singular', 'zork'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing' });
    expect(unknownTableTags(['first-person', 'zork', 'informal', 'combined-form'])).toEqual(['zork']);
    expect(tableRow(['present', 'present', 'indicative', 'first-person', 'singular', 'first-person'], 'VERB')).toHaveProperty('features');
  });
  it('two persons in one row are not a cell', () => {
    expect(map(['first-person', 'third-person', 'indicative', 'present', 'singular'])).toBeUndefined();
  });
  it('nouns and adjectives: Number, Gender; both genders in one row means no Gender (an invariable form)', () => {
    expect(map(['plural'], 'NOUN')).toEqual({ Number: 'Plur' });
    expect(map(['feminine'], 'NOUN')).toEqual({ Gender: 'Fem', Number: 'Sing' });
    expect(map(['feminine', 'plural'], 'NOUN')).toEqual({ Gender: 'Fem', Number: 'Plur' });
    expect(map(['masculine', 'plural'], 'ADJ')).toEqual({ Gender: 'Masc', Number: 'Plur' });
    expect(map(['feminine', 'masculine', 'plural'], 'ADJ')).toEqual({ Number: 'Plur' });
    expect(map(['diminutive'], 'NOUN')).toBeUndefined();
    expect(map(['alternative'], 'NOUN')).toBeUndefined();
    expect(map(['superlative'], 'ADJ')).toBeUndefined();
    expect(map(['plural'], 'ADV' as never)).toBeUndefined();
  });
});

describe('the dictionary half and the generated half meet on the same cell', () => {
  it('hablamos: the present row and the preterite row each find a generated cell, both verified', () => {
    const g = esAdapter.paradigm!('hablar', 'VERB')!;
    const rows = [
      { form: 'hablamos', tags: ['first-person', 'indicative', 'plural', 'present'] },
      { form: 'hablamos', tags: ['first-person', 'indicative', 'plural', 'preterite'] },
      { form: 'hablás', tags: ['indicative', 'informal', 'present', 'second-person', 'singular', 'vos-form'] },
      { form: 'hablarme', tags: ['combined-form', 'dative', 'infinitive', 'object-first-person', 'object-singular'] },
    ];
    const dict = rows.flatMap((r) => { const f = esAdapter.featuresFromTableTags!(r.tags, 'VERB'); return f ? [{ features: f, form: r.form }] : []; });
    expect(dict).toHaveLength(3);
    const p = mergeParadigm({ languageId: 'es', lemma: 'hablar', pos: 'VERB', kind: g.kind, notes: [], sources: [] }, g.cells, dict);
    const cands = esAdapter.analyze(esAdapter.tokenize('hablamos'))[0].candidates.filter((c) => c.lemma === 'hablar');
    const cells = cands.map((c) => cellOf(p, spanishCellFeatures('VERB', c.morph, c.varieties)));
    expect(cells.map((c) => c?.status)).toEqual(['verified', 'verified']);
    const vos = esAdapter.analyze(esAdapter.tokenize('hablás'))[0].candidates.find((c) => c.lemma === 'hablar')!;
    expect(cellOf(p, spanishCellFeatures('VERB', vos.morph, vos.varieties))).toMatchObject({ form: 'hablás', status: 'verified' });
  });
});
