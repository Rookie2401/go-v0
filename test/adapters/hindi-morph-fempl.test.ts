import { describe, expect, it } from 'vitest';
import { analyzeHindiForm, describeHindiMorph, inflectHindi } from '../../src/adapters/hindi/morphology';
import { VERBS, read } from './hindi-morph-helpers';

const NOTE = 'feminine plural when a plural helping verb follows (रही हैं, गई थीं); alone it would be written with a nasal mark (-ीं)';

describe('a feminine participle in -ी is also the plural before a plural helping verb', () => {
  // [form, lemma, pos, aspect]
  const FORMS: Array<[string, string, string, string]> = [
    ['करती', 'करना', 'VERB', 'Imp'], ['जाती', 'जाना', 'VERB', 'Imp'], ['पढ़ती', 'पढ़ना', 'VERB', 'Imp'], ['पीती', 'पीना', 'VERB', 'Imp'], ['सोती', 'सोना', 'VERB', 'Imp'],
    ['बोली', 'बोलना', 'VERB', 'Perf'], ['आई', 'आना', 'VERB', 'Perf'], ['आयी', 'आना', 'VERB', 'Perf'], ['खाई', 'खाना', 'VERB', 'Perf'], ['गई', 'जाना', 'VERB', 'Perf'], ['गयी', 'जाना', 'VERB', 'Perf'],
    ['की', 'करना', 'VERB', 'Perf'], ['दी', 'देना', 'VERB', 'Perf'], ['ली', 'लेना', 'VERB', 'Perf'], ['हुई', 'होना', 'AUX', 'Perf'], ['पी', 'पीना', 'VERB', 'Perf'], ['छुई', 'छूना', 'VERB', 'Perf'],
    ['सोई', 'सोना', 'VERB', 'Perf'], ['रही', 'रहना', 'VERB', 'Perf'], ['रही', 'रहना', 'AUX', 'Prog'],
  ];

  it(`${FORMS.length} forms: a plural reading identical except Number, a little behind the singular, with the explaining rule text`, () => {
    for (const [form, lemma, pos, aspect] of FORMS) {
      const r = read(form).filter((a) => a.lemma === lemma && a.pos === pos && a.morph.Aspect === aspect && a.morph.Gender === 'Fem');
      expect(r.map((a) => a.morph.Number), form).toEqual(['Sing', 'Plur']);
      const { Number: _a, ...s } = r[0].morph;
      const { Number: _b, ...p } = r[1].morph;
      void [_a, _b];
      expect(p, form).toEqual(s);
      expect(r[1].confidence, form).toBeLessThan(r[0].confidence);
      expect(r[0].confidence - r[1].confidence, form).toBeLessThanOrEqual(0.05);
      expect(r[1].rule, form).toContain(NOTE);
      expect(r[0].rule, form).not.toContain('helping verb');
      expect(r[1].lemmaKnown, form).toBe(true);
      expect(describeHindiMorph(r[1].morph, r[1].pos), form).toMatch(/^feminine plural, (imperfective|perfective participle|progressive)/);
    }
  });

  it('थी is singular only, and the nasalised forms (-ीं) are plural only', () => {
    expect(read('थी').filter((a) => a.lemma === 'होना').map((a) => a.morph.Number)).toEqual(['Sing']);
    expect(read('थीं').filter((a) => a.lemma === 'होना').map((a) => a.morph.Number)).toEqual(['Plur']);
    for (const w of ['करतीं', 'गईं', 'आईं', 'कीं', 'दीं', 'हुईं', 'रहीं']) {
      const r = read(w).filter((a) => a.morph.Gender === 'Fem' && a.morph.VerbForm === 'Part');
      expect(r.length, w).toBeGreaterThan(0);
      expect(r.every((a) => a.morph.Number === 'Plur'), w).toBe(true);
    }
  });

  it('inflectHindi offers the -ी form for the plural cell beside the -ीं form, and every cell reads back', () => {
    const cells = (lemma: string, form: string) => inflectHindi(lemma, 'VERB').filter((r) => r.form === form).map((r) => `${r.morph.Gender}/${r.morph.Number}/${r.morph.Aspect}`);
    expect(cells('करना', 'करती')).toEqual(['Fem/Sing/Imp', 'Fem/Plur/Imp']);
    expect(cells('करना', 'करतीं')).toEqual(['Fem/Plur/Imp']);
    expect(cells('जाना', 'गई')).toEqual(['Fem/Sing/Perf', 'Fem/Plur/Perf']);
    expect(cells('जाना', 'गईं')).toEqual(['Fem/Plur/Perf']);
    expect(cells('रहना', 'रही')).toEqual(['Fem/Sing/Perf', 'Fem/Sing/Prog', 'Fem/Plur/Perf', 'Fem/Plur/Prog']);
    let n = 0;
    for (const l of [...VERBS, 'होना']) for (const g of inflectHindi(l, l === 'होना' ? 'AUX' : 'VERB')) {
      if (g.morph.Gender !== 'Fem' || g.morph.Number !== 'Plur') continue;
      n++;
      expect(read(g.form).some((a) => a.lemma === l && JSON.stringify(a.morph) === JSON.stringify(g.morph)), `${l} ${g.form}`).toBe(true);
    }
    expect(n).toBeGreaterThan(100);
  });

  it('a guess pair is one guess for the cap; the singular still comes first', () => {
    for (const w of ['दौड़ती', 'चमकती', 'सजाती']) {
      const r = analyzeHindiForm(w, {});
      const fem = r.filter((a) => a.pos === 'VERB' && a.morph.Gender === 'Fem');
      expect(fem.map((a) => a.morph.Number), w).toEqual(['Sing', 'Plur']);
      expect(fem[0].confidence).toBeGreaterThan(fem[1].confidence);
      expect(fem.every((a) => !a.lemmaKnown && a.confidence <= 0.6)).toBe(true);
      expect(r[0].morph.Number, w).toBe('Sing');
    }
    // the pair costs one place: four other guesses still fit beside it
    const many = analyzeHindiForm('बोली', {});
    expect(many.length).toBeGreaterThan(0);
  });
});
