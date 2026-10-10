/**
 * Hindi paradigm generation (Linguistic Engine V2, Stage 3): the cells come from the adapter's own morphology under the
 * features the analysis gives them, nouns decline by Case x Number with the gender a note, adjectives by Gender x Number x
 * Case, and a verb's table holds only its single-word forms: the habitual present, the progressive and the perfects are
 * constructions (the auxiliary carries tense, the participle aspect and agreement).
 */
import { describe, expect, it } from 'vitest';
import { cellOf, featureKey, mergeParadigm } from '../../src/core/paradigm';
import type { GeneratedParadigm } from '../../src/core/paradigm';
import { hiAdapter, hiLexicon } from '../../src/adapters/hi';
import { hindiCellFeatures, hindiCellsFor, HI_VERB_CONSTRUCTIONS } from '../../src/adapters/hindi/paradigm';
import { HINDI_CONSTRUCTIONS } from '../../src/adapters/hindi/constructions';

type P = 'NOUN' | 'ADJ' | 'VERB' | 'PRON' | 'PROPN' | 'AUX' | 'DET';
const gen = (lemma: string, pos: P, hint?: { features?: Record<string, string> }): GeneratedParadigm => {
  const g = hiAdapter.paradigm!(lemma, pos, hint);
  if (!g) throw new Error(`no paradigm for ${lemma}`);
  return g;
};
const form = (g: GeneratedParadigm, features: Record<string, string>): string | undefined => g.cells.find((c) => featureKey(c.features) === featureKey(features))?.form;
/** The paradigm as the card sees it with no dictionary: generated cells only. */
const asParadigm = (g: GeneratedParadigm, lemma: string, pos: P) => mergeParadigm({ languageId: 'hi', lemma, pos, kind: g.kind, notes: g.notes, sources: [] }, g.cells, []);

describe('noun-declension', () => {
  it('a noun in -ा: Case x Number, the oblique plural in -ों, gender a note', () => {
    const g = gen('कुत्ता', 'NOUN');
    expect(g.kind).toBe('noun-declension');
    expect(form(g, { Case: 'Dir', Number: 'Sing' })).toBe('कुत्ता');
    expect(form(g, { Case: 'Obl', Number: 'Sing' })).toBe('कुत्ते');
    expect(form(g, { Case: 'Dir', Number: 'Plur' })).toBe('कुत्ते');
    expect(form(g, { Case: 'Obl', Number: 'Plur' })).toBe('कुत्तों');
    expect(form(g, { Case: 'Voc', Number: 'Plur' })).toBe('कुत्तो');
    expect(g.cells.every((c) => c.features.Gender === undefined)).toBe(true);
    expect(g.notes.join(' ')).toMatch(/masculine noun/);
    expect(g.notes.join(' ')).toMatch(/postposition/);
    expect(g.template).toMatch(/-ा that changes/);
    expect(g.layout?.rows.key).toBe('Case');
    expect(g.layout?.columns.key).toBe('Number');
  });

  it('a feminine noun: the plural direct in -एँ / -ें, the oblique plural in -ों', () => {
    const g = gen('किताब', 'NOUN');
    expect(form(g, { Case: 'Dir', Number: 'Plur' })).toBe('किताबें');
    expect(form(g, { Case: 'Obl', Number: 'Plur' })).toBe('किताबों');
    expect(g.notes.join(' ')).toMatch(/feminine noun/);
  });

  it('a noun that is not in the word list gets nothing; nor does a lemma of more than one word', () => {
    expect(hiAdapter.paradigm!('ज़ज़ज़ज़', 'NOUN')).toBeUndefined();
    expect(hiAdapter.paradigm!('घृणा करना', 'VERB')).toBeUndefined();
  });

  it('keeps the nukta: forms are NFC and the dot under the letter stays', () => {
    const g = gen('आवाज़', 'NOUN');
    expect(g.cells.length).toBeGreaterThan(4);
    for (const c of g.cells) expect(c.form).toBe(c.form.normalize('NFC'));
    expect(form(g, { Case: 'Obl', Number: 'Plur' })).toBe('आवाज़ों');
    expect(form(g, { Case: 'Obl', Number: 'Plur' })!.includes('़')).toBe(true);
  });

  it('a variant spelling of a listed word is generated under the spelling asked for (no nukta)', () => {
    const g = hiAdapter.paradigm!('आवाज', 'NOUN');
    expect(g).toBeDefined();
    expect(form(g!, { Case: 'Obl', Number: 'Plur' })).toBe('आवाजों');
  });
});

describe('adjective-declension', () => {
  it('a marked adjective: Gender x Number x Case, the feminine with no case', () => {
    const g = gen('छोटा', 'ADJ');
    expect(g.kind).toBe('adjective-declension');
    expect(form(g, { Gender: 'Masc', Number: 'Sing', Case: 'Dir' })).toBe('छोटा');
    expect(form(g, { Gender: 'Masc', Number: 'Sing', Case: 'Obl' })).toBe('छोटे');
    expect(form(g, { Gender: 'Masc', Number: 'Plur', Case: 'Dir' })).toBe('छोटे');
    expect(form(g, { Gender: 'Fem', Number: 'Sing' })).toBe('छोटी');
    expect(form(g, { Gender: 'Fem', Number: 'Plur' })).toBe('छोटी');
    expect(g.template).toMatch(/-ा/);
  });

  it('an adjective that does not change: one row and a note', () => {
    const g = gen('सुंदर', 'ADJ');
    expect(g.cells).toHaveLength(1);
    expect(g.cells[0]).toMatchObject({ form: 'सुंदर', features: {} });
    expect(g.notes.join(' ')).toMatch(/does not change/);
  });

  it('an ordinal in -वाँ takes its forms from the word list', () => {
    const g = gen('पाँचवाँ', 'ADJ');
    expect(form(g, { Gender: 'Fem', Number: 'Sing' })).toMatch(/पाँचवीं/);
    expect(form(g, { Gender: 'Masc', Number: 'Sing', Case: 'Obl' })).toBe('पाँचवें');
  });

  it('adds the older glide spelling as an alternative (नई / नयी)', () => {
    const g = gen('नया', 'ADJ');
    const cell = cellOf(asParadigm(g, 'नया', 'ADJ'), { Gender: 'Fem', Number: 'Sing' });
    expect([cell?.form, ...(cell?.alternatives ?? [])]).toEqual(expect.arrayContaining(['नई', 'नयी']));
  });
});

describe('pronoun-paradigm', () => {
  it('मैं: direct, oblique stem, ने, the fused dative with the को form beside it, postposition forms, the possessive', () => {
    const g = gen('मैं', 'PRON');
    expect(g.kind).toBe('pronoun-paradigm');
    expect(form(g, { Case: 'Dir' })).toBe('मैं');
    expect(form(g, { Case: 'Obl' })).toBe('मुझ');
    expect(form(g, { Case: 'Erg' })).toBe('मैंने');
    expect(form(g, { Case: 'Dat' })).toBe('मुझे');
    expect(g.cells.filter((c) => featureKey(c.features) === featureKey({ Case: 'Dat' })).map((c) => c.form)).toContain('मुझको');
    expect(form(g, { Case: 'Obl', Adp: 'में' })).toBe('मुझमें');
    expect(form(g, { Case: 'Gen' })).toBe('मेरा');
  });
});

describe('verb-conjugation', () => {
  const g = gen('करना', 'VERB');
  it('single-word forms only: stem, infinitive, both participles, conjunctive, subjunctive, future, commands', () => {
    expect(g.kind).toBe('verb-conjugation');
    expect(form(g, { VerbForm: 'Stem' })).toBe('कर');
    expect(form(g, { VerbForm: 'Inf', Gender: 'Masc', Case: 'Dir' })).toBe('करना');
    expect(form(g, { VerbForm: 'Inf', Gender: 'Masc', Case: 'Obl' })).toBe('करने');
    expect(form(g, { VerbForm: 'Part', Aspect: 'Imp', Gender: 'Masc', Number: 'Sing' })).toBe('करता');
    expect(form(g, { VerbForm: 'Part', Aspect: 'Imp', Gender: 'Fem', Number: 'Plur' })).toBe('करतीं');
    expect(form(g, { VerbForm: 'Part', Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' })).toBe('किया');
    expect(form(g, { VerbForm: 'Part', Aspect: 'Perf', Gender: 'Fem', Number: 'Sing' })).toBe('की');
    expect(form(g, { VerbForm: 'Part', Aspect: 'Perf', Gender: 'Fem', Number: 'Plur' })).toBe('कीं');
    expect(form(g, { VerbForm: 'Fin', Mood: 'Sub', Person: '1', Number: 'Sing' })).toBe('करूँ');
    expect(form(g, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Fut', Person: '3', Number: 'Sing', Gender: 'Fem' })).toBe('करेगी');
    expect(form(g, { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Polite: 'Fam' })).toBe('करो');
    expect(form(g, { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Polite: 'Form' })).toBe('कीजिए');
    expect(g.cells.some((c) => c.features.VerbForm === 'Conv')).toBe(true);
  });

  it('a form shared by several persons is one cell for each person', () => {
    expect(form(g, { VerbForm: 'Fin', Mood: 'Sub', Person: '3', Number: 'Sing' })).toBe('करे');
    expect(form(g, { VerbForm: 'Fin', Mood: 'Sub', Person: '2', Number: 'Sing', Polite: 'Infm' })).toBe('करे');
    expect(form(g, { VerbForm: 'Fin', Mood: 'Sub', Person: '1', Number: 'Plur' })).toBe('करें');
    expect(form(g, { VerbForm: 'Fin', Mood: 'Sub', Person: '2', Number: 'Plur', Polite: 'Form' })).toBe('करें');
  });

  it('the habitual, progressive and perfect tenses are constructions, with the auxiliary carrying the tense', () => {
    for (const id of ['habitual-present', 'habitual-past', 'progressive', 'present-perfect', 'pluperfect', 'compound-verb']) expect(g.constructions).toContain(id);
    for (const id of g.constructions ?? []) expect(HINDI_CONSTRUCTIONS[id], id).toBeDefined();
    expect([...HI_VERB_CONSTRUCTIONS]).toEqual(g.constructions);
    const notes = g.notes.join(' ');
    expect(notes).toMatch(/AUXILIARY carries the tense/);
    expect(notes).toMatch(/PARTICIPLE carries the aspect and the agreement/);
    // no cell mixes a participle with a tense: a participle cell has no Tense and no Mood
    for (const c of g.cells.filter((x) => x.features.VerbForm === 'Part')) expect(c.features.Tense ?? c.features.Mood).toBeUndefined();
    expect(g.cells.every((c) => !/\s/.test(c.form))).toBe(true);
  });

  it('says whether the verb takes ने, from the word list', () => {
    expect(g.notes.join(' ')).toMatch(/takes ने/);
    expect(gen('जाना', 'VERB').notes.join(' ')).toMatch(/does not take ने/);
  });

  it('the feminine -ी is noted as also the plural before a plural helping verb', () => {
    const cell = cellOf(asParadigm(g, 'करना', 'VERB'), { VerbForm: 'Part', Aspect: 'Imp', Gender: 'Fem', Number: 'Plur' });
    expect(cell?.form).toBe('करतीं');
    expect([cell?.form, ...(cell?.alternatives ?? [])]).toContain('करती');
    expect(cell?.note).toMatch(/plural/);
  });

  it('रहना: the progressive auxiliary reading is the perfective participle cell', () => {
    const rg = gen('रहना', 'VERB');
    expect(rg.notes.join(' ')).toMatch(/progressive auxiliary/);
    expect(hindiCellFeatures('VERB', { VerbForm: 'Part', Aspect: 'Prog', Gender: 'Masc', Number: 'Sing' })).toEqual({ VerbForm: 'Part', Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' });
    expect(form(rg, { VerbForm: 'Part', Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' })).toBe('रहा');
  });

  it('होना: the copula is single words of the verb', () => {
    const hg = gen('होना', 'AUX');
    expect(form(hg, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing' })).toBe('हूँ');
    expect(form(hg, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past', Gender: 'Fem', Number: 'Sing' })).toBe('थी');
    expect(form(hg, { VerbForm: 'Part', Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' })).toBe('हुआ');
  });

  it('a causative says so and carries no mark in the cells', () => {
    const cg = gen('करवाना', 'VERB');
    expect(cg.notes.join(' ')).toMatch(/causative of करना/);
    expect(cg.cells.every((c) => c.features.Voice === undefined)).toBe(true);
  });

  it('a verb in -ना that the word list does not hold is guessed from the ending, and says so; a non-verb is not', () => {
    const ug = gen('ढूलना', 'VERB');
    expect(ug.notes[0]).toMatch(/Guessed from the ending/);
    expect(ug.template).toBeUndefined();
    expect(form(ug, { VerbForm: 'Part', Aspect: 'Imp', Gender: 'Masc', Number: 'Sing' })).toBe('ढूलता');
    expect(hiAdapter.paradigm!('ढूलन', 'VERB')).toBeUndefined();
  });
});

describe('cellsFor', () => {
  it('projects an analysed reading onto its cells: a union, a missing key, the stem that is also a command', () => {
    const noun = asParadigm(gen('कुत्ता', 'NOUN'), 'कुत्ता', 'NOUN');
    expect(hiAdapter.cellsFor!(noun, { Gender: 'Masc', Number: 'Plur', Case: 'Obl' }, 'कुत्तों').map((c) => c.form)).toEqual(['कुत्तों']);
    // a reading with no Case (the word list's lemma form) names both the direct and the oblique singular
    expect(hiAdapter.cellsFor!(noun, { Gender: 'Masc', Number: 'Sing' }, 'कुत्ते').map((c) => featureKey(c.features))).toEqual([featureKey({ Case: 'Obl', Number: 'Sing' })]);
    expect(hiAdapter.cellsFor!(noun, { Number: 'Plur', Case: 'Dir,Obl' }).map((c) => c.features.Case)).toEqual(['Dir', 'Obl']);
    const verb = asParadigm(gen('करना', 'VERB'), 'करना', 'VERB');
    const stem = hiAdapter.cellsFor!(verb, { VerbForm: 'Stem' }, 'कर');
    expect(stem.map((c) => c.features.VerbForm + (c.features.Mood ?? ''))).toEqual(['Stem', 'FinImp']);
    // the progressive auxiliary reading of रहा is the perfective participle cell, and a causative mark is dropped
    const rah = asParadigm(gen('रहना', 'VERB'), 'रहना', 'VERB');
    expect(hiAdapter.cellsFor!(rah, { VerbForm: 'Part', Aspect: 'Prog', Gender: 'Masc', Number: 'Sing', Voice: 'Cau' }, 'रहा').map((c) => c.form)).toEqual(['रहा']);
  });
});

describe('round trip on the word list', () => {
  it('every cell of a listed noun, adjective or verb is found again from the analysis of its own form', () => {
    const picks: Record<string, string[]> = { NOUN: [], ADJ: [], VERB: [] };
    for (const e of hiLexicon.entries) if (picks[e.pos] && picks[e.pos].length < 120) picks[e.pos].push(e.lemma);
    let total = 0, found = 0;
    const bad: string[] = [];
    for (const pos of ['NOUN', 'ADJ', 'VERB'] as const) {
      for (const lemma of picks[pos]) {
        const g = hiAdapter.paradigm!(lemma, pos);
        if (!g) continue;
        const p = asParadigm(g, lemma, pos);
        for (const c of p.cells) {
          total++;
          const an = hiAdapter.analyze(hiAdapter.tokenize(c.form))[0];
          const hit = an.candidates.some((cand) => cand.lemma === lemma && cand.pos === pos && hindiCellsFor(p, pos, cand.morph ?? {}, c.form).some((x) => featureKey(x.features) === featureKey(c.features)));
          if (hit) found++; else if (bad.length < 8) bad.push(`${pos} ${lemma} ${c.form} ${featureKey(c.features)}`);
        }
      }
    }
    expect(total).toBeGreaterThan(2000);
    expect(found / total, bad.join('\n')).toBeGreaterThan(0.95);
  });
});
