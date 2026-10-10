/**
 * German paradigm generation (Linguistic Engine V2, Stage 3): what `deAdapter.paradigm()` produces for a noun, an adjective, a
 * verb and a determiner, that it is made of the same forms and features as the analysis (round trips over the word list), and
 * the highlight of the selected form. Expected forms are written out by hand from German grammar, not produced by the rules
 * under test. Machine-drafted word list; no native review.
 */
import { describe, expect, it } from 'vitest';
import { cellOf, featureKey } from '../../src/core/paradigm';
import type { GeneratedParadigm } from '../../src/core/paradigm';
import { deAdapter } from '../../src/adapters/de';
import { deCellsFor, germanCellFeatures, germanParadigm } from '../../src/adapters/german/paradigm';
import { deLexiconView } from '../../src/adapters/german/lexicon';
import { analyzeGermanForm } from '../../src/adapters/german/morphology';
import { nounForms as declineNoun } from '../../src/adapters/german/morph-noun';

const para = (lemma: string, pos: 'NOUN' | 'ADJ' | 'VERB' | 'DET', hint?: { features?: Record<string, string> }): GeneratedParadigm => {
  const p = germanParadigm(lemma, pos, hint);
  if (!p) throw new Error(`no paradigm for ${lemma}`);
  return p;
};
/** The forms of the cells with exactly these features, usual form first. */
const forms = (p: GeneratedParadigm, f: Record<string, string>): string[] => p.cells.filter((c) => featureKey(c.features) === featureKey(f)).map((c) => c.form);

describe('the adapter exposes generation', () => {
  it('has paradigm and featuresFromTableTags', () => {
    expect(typeof deAdapter.paradigm).toBe('function');
    expect(typeof deAdapter.featuresFromTableTags).toBe('function');
    expect(deAdapter.paradigm!('Haus', 'NOUN')?.kind).toBe('noun-declension');
  });
  it('generates nothing for a part of speech it has no tables for, or a word it does not hold', () => {
    expect(germanParadigm('und', 'CONJ')).toBeUndefined();
    expect(germanParadigm('Xyzzyplatz', 'NOUN')).toBeUndefined();
    expect(germanParadigm('xyzzyhaft', 'ADJ')).toBeUndefined();
    expect(germanParadigm('Haus', 'ADV')).toBeUndefined();
  });
});

describe('noun: Case × Number, the article and the gender as notes', () => {
  const haus = para('Haus', 'NOUN');
  it('Haus: every cell, with the older dative in -e as the second form of its cell', () => {
    expect(haus.cells.map((c) => c.features.Number).filter((n) => n === 'Sing')).toHaveLength(5); // Nom, Gen, Dat, Dat (older), Acc
    expect(forms(haus, { Case: 'Nom', Number: 'Sing' })).toEqual(['Haus']);
    expect(forms(haus, { Case: 'Gen', Number: 'Sing' })).toEqual(['Hauses']);
    expect(forms(haus, { Case: 'Dat', Number: 'Sing' })).toEqual(['Haus', 'Hause']);
    expect(forms(haus, { Case: 'Acc', Number: 'Sing' })).toEqual(['Haus']);
    expect(forms(haus, { Case: 'Nom', Number: 'Plur' })).toEqual(['Häuser']);
    expect(forms(haus, { Case: 'Gen', Number: 'Plur' })).toEqual(['Häuser']);
    expect(forms(haus, { Case: 'Dat', Number: 'Plur' })).toEqual(['Häusern']);
    expect(forms(haus, { Case: 'Acc', Number: 'Plur' })).toEqual(['Häuser']);
  });
  it('has a layout in Nom, Gen, Dat, Acc order, the gender and the article in the notes, and a dictionary-style template', () => {
    expect(haus.layout?.rows.key).toBe('Case');
    expect(haus.layout?.rows.values.map(([v]) => v)).toEqual(['Nom', 'Gen', 'Dat', 'Acc']);
    expect(haus.layout?.columns.key).toBe('Number');
    expect(haus.template).toBe('das Haus, des Hauses, die Häuser');
    expect(haus.notes[0]).toMatch(/neuter \(das Haus\)/);
    expect(haus.notes[0]).toMatch(/dem Haus, das Haus \/ die Häuser, der Häuser, den Häusern, die Häuser/);
    expect(haus.notes.join(' ')).toMatch(/older, literary/);
  });
  it('a weak noun (n-declension): every case but the nominative singular ends in -en', () => {
    const p = para('Student', 'NOUN');
    expect(forms(p, { Case: 'Nom', Number: 'Sing' })).toEqual(['Student']);
    for (const c of ['Gen', 'Dat', 'Acc']) expect(forms(p, { Case: c, Number: 'Sing' })).toEqual(['Studenten']);
    expect(forms(p, { Case: 'Dat', Number: 'Plur' })).toEqual(['Studenten']);
    expect(p.template).toBe('der Student, des Studenten, die Studenten (weak noun)');
    expect(p.notes.join(' ')).toMatch(/Weak noun/);
  });
  it('irregular plurals come from the lexicon row: Mann → Männer, Männern; genitive Mannes or Manns', () => {
    const p = para('Mann', 'NOUN');
    expect(forms(p, { Case: 'Nom', Number: 'Plur' })).toEqual(['Männer']);
    expect(forms(p, { Case: 'Dat', Number: 'Plur' })).toEqual(['Männern']);
    expect(forms(p, { Case: 'Gen', Number: 'Sing' })).toEqual(['Mannes', 'Manns']);
  });
  it('a plural-only noun has plural cells only', () => {
    const p = para('Eltern', 'NOUN');
    expect(p.cells).toHaveLength(4);
    expect(p.cells.every((c) => c.features.Number === 'Plur')).toBe(true);
    expect(p.notes[0]).toMatch(/plural only/);
  });
  it('an adjectival noun adds the declension as a section: die Deutsche, eine Deutsche, Deutsche', () => {
    const p = para('Deutsche', 'NOUN');
    expect(p.cells).toHaveLength(24);
    expect(p.layout?.sections).toEqual(['Decl']);
    expect(forms(p, { Case: 'Gen', Number: 'Sing', Decl: 'Weak' })).toEqual(['Deutschen']);
    expect(forms(p, { Case: 'Gen', Number: 'Sing', Decl: 'Strong' })).toEqual(['Deutscher']);
    expect(forms(p, { Case: 'Dat', Number: 'Plur', Decl: 'Mixed' })).toEqual(['Deutschen']);
  });
  it('a noun listed under two genders is chosen by the hint', () => {
    const band = deLexiconView.nouns('see').map((n) => n.gender);
    expect(band.length).toBeGreaterThan(1);
    expect(para('See', 'NOUN', { features: { Gender: 'Fem' } }).template).toMatch(/^die See/);
    expect(para('See', 'NOUN', { features: { Gender: 'Masc' } }).template).toMatch(/^der See/);
    expect(para('See', 'NOUN').notes.join(' ')).toMatch(/more than one word/);
  });
  it('the cell of an analysed noun form: Gender is dropped, a union reading finds every cell it could be', () => {
    expect(germanCellFeatures('NOUN', { Case: 'Gen', Gender: 'Neut', Number: 'Sing' })).toEqual({ Case: 'Gen', Number: 'Sing' });
    expect(cellOf({ cells: haus.cells.map((c) => ({ ...c, sources: ['generated' as const], status: 'generated' as const })) } as never, { Case: 'Gen', Number: 'Sing' })?.form).toBe('Hauses');
    const cells = deCellsFor({ cells: haus.cells.map((c) => ({ ...c, sources: ['generated' as const], status: 'generated' as const })) }, { Case: 'Nom,Acc', Number: 'Plur' });
    expect(cells.map((c) => c.features.Case)).toEqual(['Nom', 'Acc']);
  });
});

describe('noun round trip over the whole word list', () => {
  it('every form the engine declines is a cell, and the analysis of the form names that cell', () => {
    let checked = 0;
    for (const noun of deLexiconView.allNouns()) {
      if (noun.adjectival) continue;
      const same = deLexiconView.nouns(noun.lemma.toLowerCase()).filter((n) => n.gender === noun.gender);
      if (same.length > 1) continue; // two entries of one gender (Friede / Frieden): the paradigm shows the first
      const hint = noun.gender === 'pl' ? undefined : { features: { Gender: { m: 'Masc', f: 'Fem', n: 'Neut' }[noun.gender] } };
      const p = germanParadigm(noun.lemma, 'NOUN', hint);
      expect(p, noun.lemma).toBeDefined();
      for (const f of declineNoun(noun)) for (const c of f.cells) {
        const feat = { Case: { N: 'Nom', G: 'Gen', D: 'Dat', A: 'Acc' }[c.c], Number: c.g === 'p' ? 'Plur' : 'Sing' };
        const forms2 = p!.cells.filter((x) => featureKey(x.features) === featureKey(feat)).map((x) => x.form);
        expect(forms2, `${noun.lemma} ${featureKey(feat)}`).toContain(f.form);
        // the analysis of the written form has a reading of this noun whose case set and number contain the cell
        if (f.older) continue;
        const reading = analyzeGermanForm(f.form, deLexiconView).find((r) => r.lemma === noun.lemma && r.pos === 'NOUN' && r.morph.Number === feat.Number && (r.morph.Case ?? '').split(',').includes(feat.Case));
        expect(reading, `${f.form} as ${noun.lemma} ${featureKey(feat)}`).toBeDefined();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });
});

describe('adjective: three declensions as sections, three degrees', () => {
  const gut = para('gut', 'ADJ');
  const f = (features: Record<string, string>) => forms(gut, features);
  it('gut: strong, weak and mixed, Case × Gender / plural', () => {
    expect(f({ Decl: 'Strong', Case: 'Nom', Gender: 'Masc', Number: 'Sing' })).toEqual(['guter']);
    expect(f({ Decl: 'Weak', Case: 'Nom', Gender: 'Masc', Number: 'Sing' })).toEqual(['gute']);
    expect(f({ Decl: 'Mixed', Case: 'Nom', Gender: 'Masc', Number: 'Sing' })).toEqual(['guter']);
    expect(f({ Decl: 'Strong', Case: 'Dat', Gender: 'Fem', Number: 'Sing' })).toEqual(['guter']);
    expect(f({ Decl: 'Weak', Case: 'Dat', Gender: 'Fem', Number: 'Sing' })).toEqual(['guten']);
    expect(f({ Decl: 'Strong', Case: 'Gen', Gender: 'Masc', Number: 'Sing' })).toEqual(['guten']);
    expect(f({ Decl: 'Strong', Case: 'Nom', Gender: 'Neut', Number: 'Sing' })).toEqual(['gutes']);
    expect(f({ Decl: 'Mixed', Case: 'Acc', Gender: 'Neut', Number: 'Sing' })).toEqual(['gutes']);
    expect(f({ Decl: 'Strong', Case: 'Nom', Number: 'Plur' })).toEqual(['gute']);
    expect(f({ Decl: 'Weak', Case: 'Nom', Number: 'Plur' })).toEqual(['guten']);
    expect(f({ Decl: 'Strong', Case: 'Dat', Number: 'Plur' })).toEqual(['guten']);
    expect(f({ Decl: 'Strong', Case: 'Gen', Number: 'Plur' })).toEqual(['guter']);
  });
  it('comparative and superlative are cells with Degree, declined with the same endings', () => {
    expect(f({ Degree: 'Cmp', Position: 'Pred' })).toEqual(['besser']);
    expect(f({ Degree: 'Sup', Position: 'Pred' })).toEqual(['am besten']);
    expect(f({ Position: 'Pred' })).toEqual(['gut']);
    expect(f({ Degree: 'Cmp', Decl: 'Strong', Case: 'Nom', Gender: 'Masc', Number: 'Sing' })).toEqual(['besserer']);
    expect(f({ Degree: 'Sup', Decl: 'Weak', Case: 'Nom', Gender: 'Fem', Number: 'Sing' })).toEqual(['beste']);
    expect(f({ Degree: 'Sup', Decl: 'Mixed', Case: 'Gen', Gender: 'Masc', Number: 'Sing' })).toEqual(['besten']);
  });
  it('has 3 degrees × 3 declensions × 16 cells and the uninflected forms', () => {
    expect(gut.cells).toHaveLength(3 * 3 * 16 + 3);
    expect(gut.layout?.sections).toEqual(['Degree', 'Decl']);
    expect(gut.layout?.columns.key).toBe('Gender');
    expect(gut.layout?.rows.key).toBe('Case');
  });
  it('a stem change: teuer → teurer, dunkel → dunkler; an umlaut comparison: groß → größer, am größten', () => {
    expect(forms(para('teuer', 'ADJ'), { Decl: 'Strong', Case: 'Nom', Gender: 'Masc', Number: 'Sing' })).toEqual(['teurer']);
    expect(forms(para('dunkel', 'ADJ'), { Decl: 'Weak', Case: 'Nom', Gender: 'Fem', Number: 'Sing' })).toEqual(['dunkle']);
    const g = para('groß', 'ADJ');
    expect(forms(g, { Degree: 'Cmp', Position: 'Pred' })).toEqual(['größer']);
    expect(forms(g, { Degree: 'Sup', Position: 'Pred' })).toEqual(['am größten']);
  });
  it('an indeclinable adjective has one form in every cell and no comparison', () => {
    const p = para('rosa', 'ADJ');
    expect(p.cells).toHaveLength(48);
    expect(new Set(p.cells.map((c) => c.form))).toEqual(new Set(['rosa']));
    expect(p.cells.some((c) => c.features.Degree)).toBe(false);
  });
  it('the cell of an analysed adjective form: an uninflected reading is the Position Pred cell', () => {
    expect(germanCellFeatures('ADJ', { Degree: 'Cmp' })).toEqual({ Degree: 'Cmp', Position: 'Pred' });
    expect(germanCellFeatures('ADJ', {})).toEqual({ Position: 'Pred' });
    expect(germanCellFeatures('ADJ', { Case: 'Nom', Gender: 'Masc', Number: 'Sing', Decl: 'Strong' })).toEqual({ Case: 'Nom', Gender: 'Masc', Number: 'Sing', Decl: 'Strong' });
    const cells = deCellsFor({ cells: gut.cells.map((c) => ({ ...c, sources: ['generated' as const], status: 'generated' as const })) }, { Case: 'Nom', Gender: 'Masc,Neut', Number: 'Sing', Decl: 'Weak' });
    expect(cells.map((c) => `${c.features.Gender}:${c.form}`)).toEqual(['Masc:gute', 'Neut:gute']);
  });
});

describe('cellsFor: the adapter projects an analysed reading onto its cells', () => {
  const full = (lemma: string, pos: 'NOUN' | 'ADJ' | 'VERB') => {
    const g = para(lemma, pos);
    return { kind: g.kind, pos, cells: g.cells.map((c) => ({ ...c, sources: ['generated' as const], status: 'generated' as const })) };
  };
  it('is wired into the adapter', () => { expect(typeof deAdapter.cellsFor).toBe('function'); });
  it('a noun reading carries Gender and a union of cases; the cells do not', () => {
    const hits = deAdapter.cellsFor!(full('Haus', 'NOUN'), { Case: 'Nom,Acc', Gender: 'Neut', Number: 'Plur' }, 'Häuser');
    expect(hits.map((c) => c.features.Case)).toEqual(['Nom', 'Acc']);
  });
  it('an uninflected adjective (no Case in the reading) is the Position cell, by degree', () => {
    expect(deAdapter.cellsFor!(full('gut', 'ADJ'), { Degree: 'Cmp' }, 'besser').map((c) => c.form)).toEqual(['besser']);
    expect(deAdapter.cellsFor!(full('gut', 'ADJ'), {}, 'gut').map((c) => c.form)).toEqual(['gut']);
  });
  it('a verb form: the surface picks the main-clause or the subordinate-clause cell of a separable verb', () => {
    const p = full('aufstehen', 'VERB');
    const f = { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1,3', Number: 'Plur' };
    expect(deAdapter.cellsFor!(p, f, 'aufstehen').map((c) => c.form).sort()).toEqual(['aufstehen', 'aufstehen']);
    expect(deAdapter.cellsFor!(p, { ...f, Person: '3', Number: 'Sing' }, 'steht').map((c) => c.form)).toEqual(['steht auf']);
  });
});

describe('adjective round trip over the whole word list', () => {
  it('every declined form the analysis reads is a cell of the paradigm', () => {
    let checked = 0;
    for (const adj of deLexiconView.allAdjectives()) {
      const p = germanParadigm(adj.lemma, 'ADJ');
      expect(p, adj.lemma).toBeDefined();
      const byForm = new Map<string, string[]>();
      for (const c of p!.cells) byForm.set(c.form.toLowerCase(), [...(byForm.get(c.form.toLowerCase()) ?? []), featureKey(c.features)]);
      for (const c of p!.cells) {
        if (c.features.Position || c.form.includes(' ')) continue;
        const readings = analyzeGermanForm(c.form, deLexiconView).filter((r) => r.lemma === adj.lemma && r.pos === 'ADJ');
        const hit = readings.some((r) => {
          const m = r.morph;
          return (m.Degree ?? '') === (c.features.Degree ?? '') && (m.Case ?? '').split(',').includes(c.features.Case) && (m.Decl ?? '').split(',').includes(c.features.Decl)
            && (m.Number ?? '').split(',').includes(c.features.Number) && (c.features.Gender === undefined || (m.Gender ?? '').split(',').includes(c.features.Gender));
        });
        expect(hit, `${c.form} ${featureKey(c.features)}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });
});

describe('verb: Mood × Tense × Person × Number, imperative, participles, constructions apart', () => {
  const gehen = para('gehen', 'VERB');
  const v = (features: Record<string, string>) => forms(gehen, features);
  const fin = (Mood: string, Tense: string | undefined, Person: string, Number: string) => ({ VerbForm: 'Fin', Mood, ...(Tense ? { Tense } : {}), Person, Number });
  it('gehen: a strong verb in full', () => {
    expect(v(fin('Ind', 'Pres', '1', 'Sing'))).toEqual(['gehe']);
    expect(v(fin('Ind', 'Pres', '2', 'Sing'))).toEqual(['gehst']);
    expect(v(fin('Ind', 'Pres', '3', 'Sing'))).toEqual(['geht']);
    expect(v(fin('Ind', 'Pres', '2', 'Plur'))).toEqual(['geht']);
    expect(v(fin('Ind', 'Past', '1', 'Sing'))).toEqual(['ging']);
    expect(v(fin('Ind', 'Past', '2', 'Sing'))).toEqual(['gingst']);
    expect(v(fin('Ind', 'Past', '3', 'Plur'))).toEqual(['gingen']);
    expect(v(fin('Sub', 'Pres', '3', 'Sing'))).toEqual(['gehe']);
    expect(v(fin('Sub', 'Pres', '2', 'Sing'))).toEqual(['gehest']);
    expect(v(fin('Sub', 'Past', '1', 'Sing'))).toEqual(['ginge']);
    expect(v(fin('Sub', 'Past', '3', 'Plur'))).toEqual(['gingen']);
    expect(v({ VerbForm: 'Inf' })).toEqual(['gehen']);
    expect(v({ VerbForm: 'Inf', Variant: 'Zu' })).toEqual(['zu gehen']);
    expect(v({ VerbForm: 'Part', Tense: 'Past' })).toEqual(['gegangen']);
    expect(v({ VerbForm: 'Part', Tense: 'Pres' })).toEqual(['gehend']);
    expect(v(fin('Imp', undefined, '2', 'Plur'))).toEqual(['geht']);
    expect(v(fin('Imp', undefined, '2', 'Sing'))).toContain('geh');
  });
  it('4 finite tables × 6 persons, the imperative and the non-finite forms; the periphrastic tenses are constructions, not cells', () => {
    expect(gehen.cells.filter((c) => c.features.VerbForm === 'Fin' && c.features.Mood !== 'Imp').length).toBeGreaterThanOrEqual(24);
    expect(gehen.layout?.sections).toEqual(['VerbForm', 'Mood', 'Tense', 'Variant']);
    expect(gehen.constructions).toEqual(expect.arrayContaining(['sentence-bracket-perfect', 'pluperfect', 'future', 'passive']));
    expect(gehen.cells.some((c) => /\b(?:hat|ist|wird|wurde|werde)\b/.test(c.form))).toBe(false);
    expect(gehen.notes.join(' ')).toMatch(/Konjunktiv I is Mood Sub with Tense Pres/);
    expect(gehen.template).toBe('strong verb');
  });
  it('strong and mixed verbs follow their principal parts (hand-written forms)', () => {
    const rows: Array<[string, string, string, string, string, string, string]> = [
      // lemma, 2sg pres, 3sg pres, 1sg pret, 1sg Konj II, participle, imperative sg
      ['fahren', 'fährst', 'fährt', 'fuhr', 'führe', 'gefahren', 'fahr'],
      ['geben', 'gibst', 'gibt', 'gab', 'gäbe', 'gegeben', 'gib'],
      ['sehen', 'siehst', 'sieht', 'sah', 'sähe', 'gesehen', 'sieh'],
      ['nehmen', 'nimmst', 'nimmt', 'nahm', 'nähme', 'genommen', 'nimm'],
      ['kommen', 'kommst', 'kommt', 'kam', 'käme', 'gekommen', 'komm'],
      ['lesen', 'liest', 'liest', 'las', 'läse', 'gelesen', 'lies'],
      ['schreiben', 'schreibst', 'schreibt', 'schrieb', 'schriebe', 'geschrieben', 'schreib'],
      ['bringen', 'bringst', 'bringt', 'brachte', 'brächte', 'gebracht', 'bring'],
      ['denken', 'denkst', 'denkt', 'dachte', 'dächte', 'gedacht', 'denk'],
      ['laufen', 'läufst', 'läuft', 'lief', 'liefe', 'gelaufen', 'lauf'],
    ];
    for (const [lemma, du, er, pret, subj2, part, imp] of rows) {
      const p = para(lemma, 'VERB');
      expect(forms(p, fin('Ind', 'Pres', '2', 'Sing')), lemma).toEqual([du]);
      expect(forms(p, fin('Ind', 'Pres', '3', 'Sing')), lemma).toEqual([er]);
      expect(forms(p, fin('Ind', 'Past', '1', 'Sing')), lemma).toEqual([pret]);
      expect(forms(p, fin('Sub', 'Past', '1', 'Sing')), lemma).toContain(subj2);
      expect(forms(p, { VerbForm: 'Part', Tense: 'Past' }), lemma).toEqual([part]);
      expect(forms(p, fin('Imp', undefined, '2', 'Sing')), lemma).toContain(imp);
    }
  });
  it('the irregular verbs come from their tables: sein, haben, werden, können', () => {
    expect(forms(para('sein', 'VERB'), fin('Ind', 'Pres', '1', 'Sing'))).toEqual(['bin']);
    expect(forms(para('sein', 'VERB'), fin('Ind', 'Pres', '3', 'Sing'))).toEqual(['ist']);
    expect(forms(para('sein', 'VERB'), fin('Sub', 'Pres', '3', 'Sing'))).toEqual(['sei']);
    expect(forms(para('haben', 'VERB'), fin('Ind', 'Pres', '3', 'Sing'))).toEqual(['hat']);
    expect(forms(para('werden', 'VERB'), fin('Ind', 'Past', '1', 'Sing'))[0]).toBe('wurde');
    expect(forms(para('können', 'VERB'), fin('Ind', 'Pres', '1', 'Sing'))).toEqual(['kann']);
    expect(forms(para('können', 'VERB'), fin('Ind', 'Past', '1', 'Sing'))).toEqual(['konnte']);
    expect(para('können', 'VERB').template).toBe('irregular verb');
  });
  it('a weak verb with the inserted -e-: arbeiten', () => {
    const p = para('arbeiten', 'VERB');
    expect(forms(p, fin('Ind', 'Pres', '2', 'Sing'))).toEqual(['arbeitest']);
    expect(forms(p, fin('Ind', 'Pres', '3', 'Sing'))).toEqual(['arbeitet']);
    expect(forms(p, fin('Ind', 'Past', '1', 'Sing'))).toEqual(['arbeitete']);
    expect(forms(p, { VerbForm: 'Part', Tense: 'Past' })).toEqual(['gearbeitet']);
    expect(p.template).toBe('weak verb');
  });
  it('a separable verb: the particle noted, finite forms separated in the main clause and written on in the subordinate clause', () => {
    const p = para('aufstehen', 'VERB');
    expect(forms(p, fin('Ind', 'Pres', '3', 'Sing'))).toEqual(['steht auf']);
    expect(forms(p, { ...fin('Ind', 'Pres', '3', 'Sing'), Clause: 'Sub' })).toEqual(['aufsteht']);
    expect(forms(p, fin('Ind', 'Past', '1', 'Sing'))).toEqual(['stand auf']);
    expect(forms(p, { ...fin('Ind', 'Past', '1', 'Sing'), Clause: 'Sub' })).toEqual(['aufstand']);
    expect(forms(p, fin('Imp', undefined, '2', 'Plur'))).toEqual(['steht auf']);
    expect(forms(p, fin('Imp', undefined, '2', 'Sing'))[0]).toBe('steh auf');
    expect(forms(p, { VerbForm: 'Inf' })).toEqual(['aufstehen']);
    expect(forms(p, { VerbForm: 'Inf', Variant: 'Zu' })).toEqual(['aufzustehen']);
    expect(forms(p, { VerbForm: 'Part', Tense: 'Past' })).toEqual(['aufgestanden']);
    expect(p.layout?.sections).toEqual(['VerbForm', 'Clause', 'Mood', 'Tense', 'Variant']);
    expect(p.template).toBe('strong verb, separable (auf-)');
    expect(p.notes.join(' ')).toMatch(/particle "auf"/);
    expect(p.notes.join(' ')).toMatch(/Perfect auxiliary: sein/);
    expect(p.constructions).toContain('separable-prefix-verb');
    expect(p.cells.some((c) => c.features.Mood === 'Imp' && c.features.Clause)).toBe(false);
  });
  it('an inseparable verb has no particle and no ge- in the participle: verstehen', () => {
    const p = para('verstehen', 'VERB');
    expect(forms(p, { VerbForm: 'Part', Tense: 'Past' })).toEqual(['verstanden']);
    expect(forms(p, fin('Ind', 'Pres', '3', 'Sing'))).toEqual(['versteht']);
    expect(p.cells.some((c) => c.features.Clause)).toBe(false);
  });
  it('the separable and the inseparable verb of one spelling are told apart by the hint: umfahren', () => {
    expect(forms(para('umfahren', 'VERB', { features: { Separable: 'Yes' } }), fin('Ind', 'Pres', '3', 'Sing'))).toEqual(['fährt um']);
    expect(forms(para('umfahren', 'VERB', { features: { Separable: 'No' } }), fin('Ind', 'Pres', '3', 'Sing'))).toEqual(['umfährt']);
  });
  it('a reflexive verb is conjugated without the pronoun, which the notes name', () => {
    const p = para('freuen', 'VERB');
    expect(forms(p, fin('Ind', 'Pres', '1', 'Sing'))).toEqual(['freue']);
    expect(p.notes.join(' ')).toMatch(/Reflexive verb/);
    expect(p.constructions).toContain('reflexive-verb');
  });
});

describe('verb round trip over the whole word list', () => {
  it('every cell of a listed verb that is one written word is a form the analysis reads, with these features', () => {
    let checked = 0;
    let n = 0;
    for (const verb of deLexiconView.allVerbs()) {
      // every strong / mixed / irregular verb and every fifth weak one (the weak rules are checked by the sample)
      if (verb.cls === 'weak' && n++ % 5 !== 0) continue;
      if (deLexiconView.verb(verb.lemma.toLowerCase()).filter((x) => !!x.prefix === !!verb.prefix).length > 1) continue;
      const lemma = verb.lemma.replace(/^sich /, '');
      const p = germanParadigm(lemma, 'VERB', { features: { Separable: verb.prefix ? 'Yes' : 'No' } });
      expect(p, verb.lemma).toBeDefined();
      for (const c of p!.cells) {
        // the main-clause forms of a separable verb are two words (steht auf); the subordinate-clause and non-finite forms are one
        if (c.form.includes(' ')) continue;
        const readings = analyzeGermanForm(c.form, deLexiconView).filter((r) => r.pos === 'VERB' && r.lemma === verb.lemma);
        const f = c.features;
        const ok = readings.some((r) => {
          const m = r.morph;
          if (m.VerbForm !== f.VerbForm) return false;
          if (f.VerbForm === 'Fin') return m.Mood === f.Mood && (f.Mood === 'Imp' || m.Tense === f.Tense) && (m.Person ?? '').split(',').includes(f.Person) && m.Number === f.Number;
          if (f.VerbForm === 'Part') return m.Tense === f.Tense;
          return true;
        });
        expect(ok, `${verb.lemma}: ${c.form} ${featureKey(f)}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10000);
  }, 120_000);
});

describe('determiners', () => {
  it('der: the definite article, Case × Gender / plural', () => {
    const p = para('der', 'DET');
    expect(p.kind).toBe('determiner-paradigm');
    expect(p.cells).toHaveLength(16);
    expect(forms(p, { Case: 'Nom', Gender: 'Masc', Number: 'Sing' })).toEqual(['der']);
    expect(forms(p, { Case: 'Gen', Gender: 'Fem', Number: 'Sing' })).toEqual(['der']);
    expect(forms(p, { Case: 'Dat', Gender: 'Neut', Number: 'Sing' })).toEqual(['dem']);
    expect(forms(p, { Case: 'Acc', Gender: 'Masc', Number: 'Sing' })).toEqual(['den']);
    expect(forms(p, { Case: 'Dat', Number: 'Plur' })).toEqual(['den']);
    expect(forms(p, { Case: 'Gen', Number: 'Plur' })).toEqual(['der']);
    expect(p.template).toBe('definite article');
    expect(p.notes.join(' ')).toMatch(/weak endings/);
  });
  it('ein has no plural, kein has one; the possessives decline like ein', () => {
    const ein = para('ein', 'DET');
    expect(ein.cells.some((c) => c.features.Number === 'Plur')).toBe(false);
    expect(forms(ein, { Case: 'Nom', Gender: 'Masc', Number: 'Sing' })).toEqual(['ein']);
    expect(forms(ein, { Case: 'Acc', Gender: 'Masc', Number: 'Sing' })).toEqual(['einen']);
    expect(forms(ein, { Case: 'Dat', Gender: 'Fem', Number: 'Sing' })).toEqual(['einer']);
    expect(ein.notes.join(' ')).toMatch(/mixed endings/);
    const kein = para('kein', 'DET');
    expect(forms(kein, { Case: 'Dat', Number: 'Plur' })).toEqual(['keinen']);
    const mein = para('mein', 'DET');
    expect(forms(mein, { Case: 'Gen', Gender: 'Neut', Number: 'Sing' })).toEqual(['meines']);
    expect(forms(mein, { Case: 'Nom', Number: 'Plur' })).toEqual(['meine']);
    expect(mein.template).toBe('possessive determiner (declines like ein)');
    expect(forms(para('unser', 'DET'), { Case: 'Gen', Gender: 'Fem', Number: 'Sing' })).toEqual(['unserer', 'unsrer']);
  });
  it('dieser declines with strong endings and is followed by weak adjectives', () => {
    const p = para('dieser', 'DET');
    expect(forms(p, { Case: 'Nom', Gender: 'Masc', Number: 'Sing' })).toEqual(['dieser']);
    expect(forms(p, { Case: 'Acc', Gender: 'Neut', Number: 'Sing' })).toEqual(['dieses']);
    expect(p.notes.join(' ')).toMatch(/weak endings/);
  });
  it('the cells of every determiner in the closed-class table are generated', () => {
    for (const l of ['der', 'ein', 'kein', 'mein', 'dein', 'sein', 'ihr', 'unser', 'euer', 'Ihr', 'dieser', 'jener', 'jeder', 'welcher', 'mancher', 'solcher']) {
      expect(germanParadigm(l, 'DET'), l).toBeDefined();
    }
  });
});

describe('words the list does not hold', () => {
  it('a verb is generated only by an explicit guess path, and says so', () => {
    const weak = para('zwitschern', 'VERB');
    expect(weak.notes[0]).toMatch(/^Guessed:/);
    expect(weak.template).toBeUndefined();
    expect(forms(weak, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' })).toEqual(['zwitschert']);
    const derived = para('mitfliegen', 'VERB');
    expect(derived.notes[0]).toMatch(/^Guessed:.*mit- \+ fliegen/);
    expect(forms(derived, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' })).toEqual(['flog mit']);
  });
  it('a verb that starts like a separable or two-way prefix over an unknown rest is not guessed', () => {
    expect(germanParadigm('aufwerten', 'VERB')).toBeUndefined();
    expect(germanParadigm('umfärben', 'VERB')).toBeUndefined();
  });
  it('a noun or adjective is never guessed', () => {
    expect(germanParadigm('Zwitscherer', 'NOUN')).toBeUndefined();
    expect(germanParadigm('zwitscherig', 'ADJ')).toBeUndefined();
  });
});
