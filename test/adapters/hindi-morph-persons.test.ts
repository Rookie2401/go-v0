import { describe, expect, it } from 'vitest';
import { analyzeHindiForm, describeHindiMorph, inflectHindi, type HindiAnalysis } from '../../src/adapters/hindi/morphology';
import { VERBS, read } from './hindi-morph-helpers';

const finite = (r: HindiAnalysis[], lemma: string) => r.filter((a) => a.lemma === lemma && a.morph.VerbForm === 'Fin');
const persons = (r: HindiAnalysis[]) => r.map((a) => a.morph.Person);

describe('one reading per person', () => {
  it('-े / -ेगा / -ेगी / है: third, then second singular intimate (Polite=Infm), identical otherwise', () => {
    for (const [w, extra] of [['करे', { Mood: 'Sub' }], ['करेगा', { Mood: 'Ind', Tense: 'Fut', Gender: 'Masc' }], ['करेगी', { Tense: 'Fut', Gender: 'Fem' }], ['जाएगा', { Tense: 'Fut', Gender: 'Masc' }]] as const) {
      const r = finite(read(w), w.startsWith('कर') ? 'करना' : 'जाना').filter((a) => Object.entries(extra).every(([k, v]) => a.morph[k] === v));
      expect(persons(r), w).toEqual(['3', '2']);
      expect(r[0].morph.Polite, w).toBeUndefined();
      expect(r[1].morph).toMatchObject({ Polite: 'Infm', Number: 'Sing' });
      const { Person: _a, Polite: _b, ...rest0 } = r[0].morph;
      const { Person: _c, Polite: _d, ...rest1 } = r[1].morph;
      void [_a, _b, _c, _d];
      expect(rest1, w).toEqual(rest0);
      expect(r[1].confidence, w).toBe(r[0].confidence);
      expect(r[1].rule, w).toBe(r[0].rule);
    }
    const hai = read('है').filter((a) => a.lemma === 'होना');
    expect(persons(hai)).toEqual(['3', '2']);
    expect(hai[0].pos).toBe('AUX');
  });

  it('-ें / -ेंगे / -ेंगी / हैं: third, first, then second with plural agreement (the polite आप, Polite=Form)', () => {
    for (const [w, lemma, extra] of [['करें', 'करना', { Mood: 'Sub' }], ['करेंगे', 'करना', { Tense: 'Fut', Gender: 'Masc' }], ['करेंगी', 'करना', { Tense: 'Fut', Gender: 'Fem' }],
      ['जाएँ', 'जाना', { Mood: 'Sub' }], ['लेंगे', 'लेना', { Tense: 'Fut' }], ['हैं', 'होना', { Tense: 'Pres' }], ['हों', 'होना', { Mood: 'Sub' }]] as const) {
      const r = finite(read(w), lemma).filter((a) => Object.entries(extra).every(([k, v]) => a.morph[k] === v));
      expect(persons(r), w).toEqual(['3', '1', '2']);
      expect(r.map((a) => a.morph.Number), w).toEqual(['Plur', 'Plur', 'Plur']);
      expect(r.map((a) => a.morph.Polite), w).toEqual([undefined, undefined, 'Form']);
      expect(new Set(r.map((a) => a.confidence)).size, w).toBe(1);
    }
  });

  it('the तुम forms in -ो keep Polite=Fam, and a form of one person stays one reading', () => {
    expect(finite(read('करोगे'), 'करना').map((a) => [a.morph.Person, a.morph.Polite])).toEqual([['2', 'Fam']]);
    expect(finite(read('हो'), 'होना').filter((a) => a.morph.Tense === 'Pres').map((a) => [a.morph.Person, a.morph.Polite])).toEqual([['2', 'Fam']]);
    expect(finite(read('करूँ'), 'करना').map((a) => a.morph.Person)).toEqual(['1']);
    expect(finite(read('हूँ'), 'होना').map((a) => a.morph.Person)).toEqual(['1']);
    for (const w of ['करता', 'गया', 'था', 'थे']) for (const a of read(w)) expect(a.morph.Polite, w).toBeUndefined();
  });

  it('no Person (and no Number) in any reading is a comma list; Polite=Form / Infm only where they belong', () => {
    const forms = new Set<string>();
    for (const l of [...VERBS, 'होना']) for (const g of inflectHindi(l, l === 'होना' ? 'AUX' : 'VERB')) forms.add(g.form);
    expect(forms.size).toBeGreaterThan(700);
    for (const w of forms) {
      for (const a of [...read(w), ...analyzeHindiForm(w, {})]) {
        expect(a.morph.Person ?? '', `${w} Person`).not.toContain(',');
        expect(a.morph.Number ?? '', `${w} Number`).not.toContain(',');
        if (a.morph.Polite === 'Form' && a.morph.Mood !== 'Imp') expect(a.morph).toMatchObject({ Person: '2', Number: 'Plur' });
        if (a.morph.Polite === 'Infm' && a.morph.Mood !== 'Imp') expect(a.morph).toMatchObject({ Person: '2', Number: 'Sing' });
      }
    }
  });

  it('inflectHindi generates each person as its own cell, and every cell reads back', () => {
    const rows = inflectHindi('करना', 'VERB');
    const cell = (form: string) => rows.filter((r) => r.form === form && r.morph.Mood === 'Sub').map((r) => r.morph.Person);
    expect(cell('करे')).toEqual(['3', '2']);
    expect(cell('करें')).toEqual(['3', '1', '2']);
    for (const g of rows) {
      expect(g.morph.Person ?? '').not.toContain(',');
      expect(read(g.form).some((a) => a.lemma === 'करना' && JSON.stringify(a.morph) === JSON.stringify(g.morph)), `${g.form} ${JSON.stringify(g.morph)}`).toBe(true);
    }
  });

  it('describeHindiMorph puts each person in words, never raw feature names', () => {
    const t = (w: string, lemma: string) => finite(read(w), lemma).map((a) => describeHindiMorph(a.morph, a.pos));
    expect(t('करें', 'करना').filter((x) => /subjunctive/.test(x))).toEqual(['third person plural, subjunctive', 'first person plural, subjunctive', 'you (आप), subjunctive']);
    expect(t('करे', 'करना')).toEqual(['third person singular, subjunctive', 'you (तू), subjunctive']);
    expect(t('करेंगे', 'करना')).toEqual(['third person plural, future (masculine)', 'first person plural, future (masculine)', 'you (आप), future (masculine)']);
    expect(t('हैं', 'होना')[2]).toBe('you (आप), present (is / am / are)');
    for (const w of ['करें', 'करे', 'करेंगे', 'करेगा', 'हैं', 'है', 'हो', 'होगा', 'जाएँ']) for (const x of t(w, w.startsWith('कर') ? 'करना' : w.startsWith('जा') ? 'जाना' : 'होना')) expect(x, w).not.toMatch(/Person|Polite|Number|VerbForm|,\d|\d,/);
  });
});

describe('the cap counts the person-variants of one guess as one guess', () => {
  it('an unknown verb in -ें still shows its noun alternative', () => {
    for (const w of ['सीखें', 'मेजें', 'रातें', 'लिखें']) {
      const r = analyzeHindiForm(w, {});
      expect(r.some((a) => a.pos === 'VERB'), w).toBe(true);
      expect(r.some((a) => a.pos === 'NOUN'), w).toBe(true);
      expect(r.every((a) => !a.lemmaKnown && a.confidence <= 0.6), w).toBe(true);
      const groups = new Set(r.map((a) => `${a.lemma}|${a.pos}|${JSON.stringify({ ...a.morph, Person: undefined, Polite: undefined })}`));
      expect(groups.size, w).toBeLessThanOrEqual(4);
    }
    // the three persons of the verb guess are together
    const v = analyzeHindiForm('सीखें', {}).filter((a) => a.pos === 'VERB');
    expect(v.map((a) => a.morph.Person)).toEqual(['3', '1', '2']);
  });

  it('still at most four distinct guesses', () => {
    for (const w of ['चलते', 'लड़कों', 'बच्चे', 'कुर्सियों', 'दिखाओगे', 'चलेंगे']) {
      const r = analyzeHindiForm(w, {});
      const groups = new Set(r.map((a) => `${a.lemma}|${a.pos}|${JSON.stringify({ ...a.morph, Person: undefined, Polite: undefined })}`));
      expect(groups.size, w).toBeLessThanOrEqual(4);
    }
  });
});
