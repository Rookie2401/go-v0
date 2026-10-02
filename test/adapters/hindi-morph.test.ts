import { describe, expect, it } from 'vitest';
import { analyzeHindiForm, inflectHindi } from '../../src/adapters/hindi/morphology';
import { glide } from '../../src/adapters/hindi/morph-orth';
import { ADJS, NOUNS, NO_INFO, OPTS, expectReading, expectTiling, read } from './hindi-morph-helpers';

type Row = [form: string, lemma: string, want: Record<string, string>];
const D = 'Dir', O = 'Obl', V = 'Voc', S = 'Sing', P = 'Plur', M = 'Masc', F = 'Fem';
const mk = (g: string, n: string, c: string) => ({ Gender: g, Number: n, Case: c });

// ---------------------------------------------------------------------------------------------------------------
// nouns: one row per (form, reading); the same form appears once for each reading it has

const NOUN_ROWS: Row[] = [
  // masculine in -ा that changes
  ['लड़का', 'लड़का', mk(M, S, D)], ['लड़के', 'लड़का', mk(M, S, O)], ['लड़के', 'लड़का', mk(M, P, D)], ['लड़कों', 'लड़का', mk(M, P, O)], ['लड़को', 'लड़का', mk(M, P, V)],
  ['कमरा', 'कमरा', mk(M, S, D)], ['कमरे', 'कमरा', mk(M, S, O)], ['कमरे', 'कमरा', mk(M, P, D)], ['कमरों', 'कमरा', mk(M, P, O)], ['कमरो', 'कमरा', mk(M, P, V)],
  ['बच्चे', 'बच्चा', mk(M, S, O)], ['बच्चे', 'बच्चा', mk(M, P, D)], ['बच्चों', 'बच्चा', mk(M, P, O)],
  ['कुत्ता', 'कुत्ता', mk(M, S, D)], ['कुत्ते', 'कुत्ता', mk(M, P, D)], ['कुत्तों', 'कुत्ता', mk(M, P, O)],
  // masculine in -ा that keeps it
  ['पिता', 'पिता', mk(M, S, D)], ['पिता', 'पिता', mk(M, P, D)], ['पिताओं', 'पिता', mk(M, P, O)], ['पिताओ', 'पिता', mk(M, P, V)],
  ['राजा', 'राजा', mk(M, S, O)], ['राजा', 'राजा', mk(M, P, D)], ['राजाओं', 'राजा', mk(M, P, O)],
  ['नेता', 'नेता', mk(M, S, D)], ['नेताओं', 'नेता', mk(M, P, O)],
  ['चाचा', 'चाचा', mk(M, S, D)], ['चाचाओं', 'चाचा', mk(M, P, O)],
  ['दादा', 'दादा', mk(M, P, D)], ['दादाओं', 'दादा', mk(M, P, O)],
  // masculine, unmarked
  ['घर', 'घर', mk(M, S, D)], ['घर', 'घर', mk(M, S, O)], ['घर', 'घर', mk(M, P, D)], ['घरों', 'घर', mk(M, P, O)], ['घरो', 'घर', mk(M, P, V)],
  ['दिन', 'दिन', mk(M, P, D)], ['दिनों', 'दिन', mk(M, P, O)], ['शहरों', 'शहर', mk(M, P, O)], ['हाथों', 'हाथ', mk(M, P, O)], ['लोगों', 'लोग', mk(M, P, O)],
  // masculine in -ी / -ि / -ू / -ु
  ['आदमी', 'आदमी', mk(M, S, D)], ['आदमी', 'आदमी', mk(M, P, D)], ['आदमियों', 'आदमी', mk(M, P, O)], ['आदमियो', 'आदमी', mk(M, P, V)],
  ['हाथी', 'हाथी', mk(M, S, O)], ['हाथियों', 'हाथी', mk(M, P, O)], ['कवि', 'कवि', mk(M, S, D)], ['कवियों', 'कवि', mk(M, P, O)],
  ['भालू', 'भालू', mk(M, S, D)], ['भालू', 'भालू', mk(M, P, D)], ['भालुओं', 'भालू', mk(M, P, O)], ['भालुओ', 'भालू', mk(M, P, V)],
  ['साधु', 'साधु', mk(M, P, D)], ['साधुओं', 'साधु', mk(M, P, O)],
  // feminine in -ी / -ि
  ['लड़की', 'लड़की', mk(F, S, D)], ['लड़की', 'लड़की', mk(F, S, O)], ['लड़कियाँ', 'लड़की', mk(F, P, D)], ['लड़कियां', 'लड़की', mk(F, P, D)],
  ['लड़कियों', 'लड़की', mk(F, P, O)], ['लड़कियो', 'लड़की', mk(F, P, V)],
  ['रोटी', 'रोटी', mk(F, S, D)], ['रोटियाँ', 'रोटी', mk(F, P, D)], ['रोटियों', 'रोटी', mk(F, P, O)],
  ['नदियाँ', 'नदी', mk(F, P, D)], ['नदियों', 'नदी', mk(F, P, O)], ['शक्ति', 'शक्ति', mk(F, S, D)], ['शक्तियाँ', 'शक्ति', mk(F, P, D)], ['शक्तियों', 'शक्ति', mk(F, P, O)],
  // feminine in -िया
  ['चिड़िया', 'चिड़िया', mk(F, S, D)], ['चिड़ियाँ', 'चिड़िया', mk(F, P, D)], ['चिड़ियां', 'चिड़िया', mk(F, P, D)], ['चिड़ियों', 'चिड़िया', mk(F, P, O)], ['चिड़ियो', 'चिड़िया', mk(F, P, V)],
  ['गुड़ियाँ', 'गुड़िया', mk(F, P, D)], ['गुड़ियों', 'गुड़िया', mk(F, P, O)],
  // other feminines
  ['किताब', 'किताब', mk(F, S, D)], ['किताब', 'किताब', mk(F, S, O)], ['किताबें', 'किताब', mk(F, P, D)], ['किताबों', 'किताब', mk(F, P, O)], ['किताबो', 'किताब', mk(F, P, V)],
  ['रातें', 'रात', mk(F, P, D)], ['रातों', 'रात', mk(F, P, O)], ['आँखें', 'आँख', mk(F, P, D)], ['आँखों', 'आँख', mk(F, P, O)], ['बातें', 'बात', mk(F, P, D)],
  ['माता', 'माता', mk(F, S, D)], ['माताएँ', 'माता', mk(F, P, D)], ['माताएं', 'माता', mk(F, P, D)], ['माताओं', 'माता', mk(F, P, O)], ['माताओ', 'माता', mk(F, P, V)],
  ['कथाएँ', 'कथा', mk(F, P, D)], ['भाषाओं', 'भाषा', mk(F, P, O)],
  ['बहू', 'बहू', mk(F, S, D)], ['बहुएँ', 'बहू', mk(F, P, D)], ['बहुएं', 'बहू', mk(F, P, D)], ['बहुओं', 'बहू', mk(F, P, O)], ['बहुओ', 'बहू', mk(F, P, V)],
  ['वस्तुएँ', 'वस्तु', mk(F, P, D)], ['वस्तुओं', 'वस्तु', mk(F, P, O)],
];

describe('nouns: each class, with the word list giving gender and invariance', () => {
  it(`analyses ${NOUN_ROWS.length} form → reading rows`, () => {
    for (const [form, lemma, want] of NOUN_ROWS) {
      const a = expectReading(form, lemma, 'NOUN', want);
      expect(a.lemmaKnown, form).toBe(true);
      expect(a.confidence, form).toBeGreaterThanOrEqual(0.8);
      expect(a.confidence, form).toBeLessThanOrEqual(0.9);
      expect(a.rule, form).toMatch(/noun/);
    }
  });

  it('every generated form analyses back to its lemma with the features it was generated with', () => {
    let rows = 0;
    for (const [lemma, info] of Object.entries(NOUNS)) {
      for (const g of inflectHindi(lemma, 'NOUN', info)) {
        rows++;
        const hit = read(g.form).find((a) => a.lemma === lemma && a.pos === 'NOUN' && JSON.stringify(a.morph) === JSON.stringify(g.morph));
        expect(hit, `${lemma} ${g.form} ${JSON.stringify(g.morph)}`).toBeTruthy();
      }
    }
    expect(rows).toBeGreaterThan(150);
  });

  it('a form ambiguous within one paradigm is separate readings, never merged features', () => {
    const r = read('लड़के').filter((a) => a.lemma === 'लड़का');
    expect(r).toHaveLength(2);
    expect(r.map((a) => `${a.morph.Number}/${a.morph.Case}`).sort()).toEqual(['Plur/Dir', 'Sing/Obl']);
    for (const a of read('घर')) for (const v of Object.values(a.morph)) expect(v).not.toMatch(/,/);
    expect(read('घर').filter((a) => a.lemma === 'घर')).toHaveLength(3);
    expect(read('अच्छे').filter((a) => a.lemma === 'अच्छा')).toHaveLength(3);
  });

  it('the long vowel shortens before the ending', () => {
    const forms = (l: string) => inflectHindi(l, 'NOUN', NOUNS[l]).map((x) => x.form);
    expect(forms('लड़की')).toContain('लड़कियाँ');
    expect(forms('आदमी')).toContain('आदमियों');
    expect(forms('बहू')).toContain('बहुओं');
    expect(forms('भालू')).toContain('भालुओं');
    expect(forms('लड़की')).not.toContain('लड़कीयाँ');
  });

  it('the -ा nouns that keep it do not change like लड़का', () => {
    expect(read('पिते').filter((a) => a.lemma === 'पिता')).toHaveLength(0);
    expect(read('राजों').filter((a) => a.lemma === 'राजा')).toHaveLength(0);
    expect(read('लड़काओं').filter((a) => a.lemma === 'लड़का')).toHaveLength(0);
  });

  it('a masculine -ा noun whose invariance the word list does not state may be one that keeps it, at a lower confidence', () => {
    const o = { knownLemma: OPTS.knownLemma, lemmaInfo: (l: string) => (l === 'पिता' ? { pos: 'NOUN' as const, gender: 'm' as const } : undefined) };
    const r = read('पिताओं', o).filter((a) => a.lemma === 'पिता');
    expect(r).toHaveLength(1);
    expect(r[0].confidence).toBe(0.8);
    expect(r[0].morph).toEqual(mk(M, P, O));
  });

  it('without gender or invariance in the word list, the paradigms it cannot choose between are all returned, at 0.7', () => {
    const r = read('घरों', NO_INFO).filter((a) => a.lemma === 'घर');
    expect(r.map((a) => a.morph.Gender).sort()).toEqual(['Fem', 'Masc']);
    for (const a of r) expect(a.confidence).toBe(0.7);
    const p = read('पिताओं', NO_INFO).filter((a) => a.lemma === 'पिता');
    expect(p.map((a) => a.morph.Gender).sort()).toEqual(['Fem', 'Masc']);
    // a form only one class can produce is not ambiguous
    const l = read('लड़के', NO_INFO).filter((a) => a.lemma === 'लड़का');
    expect(l).toHaveLength(2);
    expect(l[0].confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('nouns ending in -ो / -े keep the singular and take -ओं / -एँ', () => {
    const o = { knownLemma: (l: string, p?: string) => (l === 'हीरो' || l === 'ब्रेड') && (!p || p === 'NOUN'), lemmaInfo: (l: string) => (l === 'हीरो' ? { pos: 'NOUN' as const, gender: 'm' as const } : undefined) };
    expect(inflectHindi('हीरो', 'NOUN', { pos: 'NOUN', gender: 'm' }).map((x) => x.form)).toContain('हीरोओं');
    expectReading('हीरोओं', 'हीरो', 'NOUN', mk(M, P, O), o);
    expectReading('हीरो', 'हीरो', 'NOUN', mk(M, S, D), o);
  });

  it('accepts the anusvara spelling of every nasalised ending', () => {
    const pairs: Array<[string, string, string]> = [
      ['लड़कियाँ', 'लड़कियां', 'लड़की'], ['चिड़ियाँ', 'चिड़ियां', 'चिड़िया'], ['माताएँ', 'माताएं', 'माता'], ['बहुएँ', 'बहुएं', 'बहू'],
      ['रोटियाँ', 'रोटियां', 'रोटी'], ['गुड़ियाँ', 'गुड़ियां', 'गुड़िया'],
    ];
    for (const [a, b, lemma] of pairs) {
      const x = read(a).filter((r) => r.lemma === lemma);
      const y = read(b).filter((r) => r.lemma === lemma);
      expect(x.length, a).toBeGreaterThan(0);
      expect(y.map((r) => r.morph), b).toEqual(x.map((r) => r.morph));
    }
    // किताबें is always spelled with ं; a stray chandrabindu is still read
    expect(read('किताबें').some((a) => a.lemma === 'किताब')).toBe(true);
    expect(read('किताबेँ').some((a) => a.lemma === 'किताब')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// adjectives, possessives, का

const ADJ_ROWS: Array<[form: string, lemma: string, pos: 'ADJ' | 'DET' | 'ADP', want: Record<string, string>]> = [
  ['अच्छा', 'अच्छा', 'ADJ', mk(M, S, D)], ['अच्छे', 'अच्छा', 'ADJ', mk(M, S, O)], ['अच्छे', 'अच्छा', 'ADJ', mk(M, P, D)], ['अच्छे', 'अच्छा', 'ADJ', mk(M, P, O)],
  ['अच्छी', 'अच्छा', 'ADJ', { Gender: F, Number: S }], ['अच्छी', 'अच्छा', 'ADJ', { Gender: F, Number: P }],
  ['छोटा', 'छोटा', 'ADJ', mk(M, S, D)], ['छोटे', 'छोटा', 'ADJ', mk(M, P, D)], ['छोटी', 'छोटा', 'ADJ', { Gender: F }],
  ['बड़ा', 'बड़ा', 'ADJ', mk(M, S, D)], ['बड़े', 'बड़ा', 'ADJ', mk(M, S, O)], ['बड़ी', 'बड़ा', 'ADJ', { Gender: F, Number: P }],
  ['काले', 'काला', 'ADJ', mk(M, P, O)], ['काली', 'काला', 'ADJ', { Gender: F, Number: S }],
  ['का', 'का', 'ADP', mk(M, S, D)], ['के', 'का', 'ADP', mk(M, S, O)], ['के', 'का', 'ADP', mk(M, P, D)], ['की', 'का', 'ADP', { Gender: F, Number: S }], ['की', 'का', 'ADP', { Gender: F, Number: P }],
  ['वाला', 'वाला', 'ADJ', mk(M, S, D)], ['वाले', 'वाला', 'ADJ', mk(M, P, D)], ['वाली', 'वाला', 'ADJ', { Gender: F }],
  ['सा', 'सा', 'ADJ', mk(M, S, D)], ['से', 'सा', 'ADJ', mk(M, S, O)], ['सी', 'सा', 'ADJ', { Gender: F }],
  ['मेरा', 'मेरा', 'DET', { ...mk(M, S, D), Poss: 'Yes', Person: '1' }], ['मेरे', 'मेरा', 'DET', { ...mk(M, S, O), Poss: 'Yes' }], ['मेरी', 'मेरा', 'DET', { Gender: F, Poss: 'Yes' }],
  ['तेरा', 'तेरा', 'DET', { ...mk(M, S, D), Person: '2' }], ['तेरी', 'तेरा', 'DET', { Gender: F }],
  ['हमारा', 'हमारा', 'DET', { ...mk(M, S, D), Person: '1' }], ['हमारे', 'हमारा', 'DET', mk(M, P, D)], ['हमारी', 'हमारा', 'DET', { Gender: F }],
  ['तुम्हारा', 'तुम्हारा', 'DET', { ...mk(M, S, D), Person: '2' }], ['तुम्हारे', 'तुम्हारा', 'DET', mk(M, P, O)], ['तुम्हारी', 'तुम्हारा', 'DET', { Gender: F }],
  ['अपना', 'अपना', 'DET', { ...mk(M, S, D), Poss: 'Yes' }], ['अपने', 'अपना', 'DET', mk(M, S, O)], ['अपनी', 'अपना', 'DET', { Gender: F, Poss: 'Yes' }],
];

describe('adjectives, possessives and का', () => {
  it(`analyses ${ADJ_ROWS.length} agreeing-form rows`, () => {
    for (const [form, lemma, pos, want] of ADJ_ROWS) expectReading(form, lemma, pos, want);
  });

  it('adjectives in -या: -ए / -ई today, -ये / -यी in the older spelling, both reading back to the -या lemma', () => {
    const YA: Array<[string, string]> = [['नया', 'नए'], ['पराया', 'पराए'], ['खोया', 'खोए'], ['मुरझाया', 'मुरझाए'], ['घबराया', 'घबराए']];
    for (const [lemma, ye] of YA) {
      const stem = ye.slice(0, -1);
      const olderE = glide(ye);
      expect(olderE, lemma).toBe(stem + 'य' + 'े');
      for (const e of [ye, olderE]) {
        expectReading(e, lemma, 'ADJ', mk(M, S, O));
        expectReading(e, lemma, 'ADJ', mk(M, P, D));
        expectReading(e, lemma, 'ADJ', mk(M, P, O));
        expect(read(e).filter((a) => a.lemma === lemma && a.pos === 'ADJ'), e).toHaveLength(3);
      }
      for (const i of [stem + 'ई', stem + 'यी']) {
        expectReading(i, lemma, 'ADJ', { Gender: F, Number: S });
        expectReading(i, lemma, 'ADJ', { Gender: F, Number: P });
      }
      expectReading(lemma, lemma, 'ADJ', mk(M, S, D));
      // generation is the same rule, and the round trip holds
      const forms = inflectHindi(lemma, 'ADJ', ADJS[lemma]).map((x) => x.form);
      expect(forms, lemma).toContain(ye);
      expect(forms, lemma).toContain(stem + 'ई');
    }
    expect(read('नए').find((a) => a.lemma === 'नया')!.rule).toContain('-य- of नया is not written before -ए / -ई');
    expect(read('नये').find((a) => a.lemma === 'नया')!.rule).toMatch(/older spelling/);
    // the same glide rule serves the perfective participles of vowel-stem verbs (one rule, not two tables)
    expect(glide('गए')).toBe('गये');
    expect(glide('आई')).toBe('आयी');
    expect(glide('नई')).toBe('नयी');
    expect(read('गयी').some((a) => a.lemma === 'जाना')).toBe(true);
  });

  it('an adjective that does not change carries no feature', () => {
    for (const w of ['सुंदर', 'लाल']) {
      const r = read(w).filter((a) => a.lemma === w);
      expect(r).toHaveLength(1);
      expect(r[0].pos).toBe('ADJ');
      expect(r[0].morph).toEqual({});
      expect(r[0].lemmaKnown).toBe(true);
    }
    // it does not take -े / -ी
    expect(read('सुंदरे').filter((a) => a.lemma === 'सुंदर')).toHaveLength(0);
  });

  it('an adjective in -ा the word list marks invariant does not take -े', () => {
    const o = { ...OPTS, lemmaInfo: (l: string, p: Parameters<NonNullable<typeof OPTS.lemmaInfo>>[1]) => (l === 'काला' ? { pos: 'ADJ' as const, invariant: true } : OPTS.lemmaInfo!(l, p)) };
    expect(read('काले', o).filter((a) => a.lemma === 'काला' && a.lemmaKnown)).toHaveLength(0);
    expect(read('काला', o).find((a) => a.lemma === 'काला')?.morph).toEqual({});
  });

  it('every generated adjective form analyses back with its features', () => {
    for (const [lemma, info] of Object.entries(ADJS)) {
      for (const g of inflectHindi(lemma, 'ADJ', info)) {
        const hit = read(g.form).find((a) => a.lemma === lemma && JSON.stringify(a.morph) === JSON.stringify(g.morph));
        expect(hit, `${lemma} ${g.form}`).toBeTruthy();
      }
    }
  });

  it('is not guessed for a lemma nobody vouched for (an adjective ending says little)', () => {
    const r = analyzeHindiForm('नीला');
    expect(r.every((a) => a.pos !== 'ADJ')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// pronouns and fused forms

type PRow = [form: string, lemma: string, want: Record<string, string>, parts?: [string, string]];
const PRON_ROWS: PRow[] = [
  ['मैं', 'मैं', { Person: '1', Number: S, Case: D }], ['हम', 'हम', { Person: '1', Number: P, Case: D }], ['तू', 'तू', { Person: '2', Polite: 'Infm' }], ['तुम', 'तुम', { Person: '2', Polite: 'Fam' }],
  ['आप', 'आप', { Person: '2', Polite: 'Form' }], ['यह', 'यह', { PronType: 'Dem', Number: S }], ['वह', 'वह', { PronType: 'Dem', Number: S }], ['ये', 'ये', { PronType: 'Dem', Number: P }],
  ['वे', 'वे', { PronType: 'Dem', Number: P }], ['कौन', 'कौन', { PronType: 'Int' }], ['क्या', 'क्या', { PronType: 'Int' }], ['जो', 'जो', { PronType: 'Rel' }],
  ['कोई', 'कोई', { PronType: 'Ind' }], ['कुछ', 'कुछ', { PronType: 'Ind' }], ['सब', 'सब', { PronType: 'Ind' }],
  // ergative: the direct form or the oblique stem + ने
  ['मैंने', 'मैं', { Case: 'Erg', Person: '1' }, ['मैं', 'ने']], ['हमने', 'हम', { Case: 'Erg' }, ['हम', 'ने']], ['तूने', 'तू', { Case: 'Erg' }, ['तू', 'ने']],
  ['तुमने', 'तुम', { Case: 'Erg' }, ['तुम', 'ने']], ['आपने', 'आप', { Case: 'Erg' }, ['आप', 'ने']], ['उसने', 'वह', { Case: 'Erg', Number: S }, ['उस', 'ने']],
  ['इसने', 'यह', { Case: 'Erg' }, ['इस', 'ने']], ['उन्होंने', 'वे', { Case: 'Erg', Number: P }, ['उन्हों', 'ने']], ['इन्होंने', 'ये', { Case: 'Erg', Number: P }, ['इन्हों', 'ने']],
  ['जिसने', 'जो', { Case: 'Erg' }, ['जिस', 'ने']], ['जिन्होंने', 'जो', { Case: 'Erg', Number: P }, ['जिन्हों', 'ने']], ['किसने', 'कौन', { Case: 'Erg' }, ['किस', 'ने']],
  ['किन्होंने', 'कौन', { Case: 'Erg', Number: P }, ['किन्हों', 'ने']], ['सबने', 'सब', { Case: 'Erg' }, ['सब', 'ने']],
  // fused datives
  ['मुझे', 'मैं', { Case: 'Dat' }], ['तुझे', 'तू', { Case: 'Dat' }], ['हमें', 'हम', { Case: 'Dat' }], ['तुम्हें', 'तुम', { Case: 'Dat' }], ['उसे', 'वह', { Case: 'Dat' }],
  ['उन्हें', 'वे', { Case: 'Dat' }], ['इसे', 'यह', { Case: 'Dat' }], ['इन्हें', 'ये', { Case: 'Dat' }], ['जिसे', 'जो', { Case: 'Dat' }], ['जिन्हें', 'जो', { Case: 'Dat' }],
  ['किसे', 'कौन', { Case: 'Dat' }], ['किन्हें', 'कौन', { Case: 'Dat' }],
  // the oblique stem + a postposition, written together
  ['मुझको', 'मैं', { Case: 'Dat' }, ['मुझ', 'को']], ['मुझसे', 'मैं', { Case: 'Obl' }, ['मुझ', 'से']], ['मुझमें', 'मैं', { Case: 'Obl' }, ['मुझ', 'में']], ['मुझपर', 'मैं', { Case: 'Obl' }, ['मुझ', 'पर']],
  ['तुझको', 'तू', { Case: 'Dat' }, ['तुझ', 'को']], ['तुझसे', 'तू', { Case: 'Obl' }, ['तुझ', 'से']],
  ['हमको', 'हम', { Case: 'Dat' }, ['हम', 'को']], ['हमसे', 'हम', { Case: 'Obl' }, ['हम', 'से']], ['हममें', 'हम', { Case: 'Obl' }, ['हम', 'में']],
  ['तुमको', 'तुम', { Case: 'Dat' }, ['तुम', 'को']], ['तुमसे', 'तुम', { Case: 'Obl' }, ['तुम', 'से']], ['तुममें', 'तुम', { Case: 'Obl' }, ['तुम', 'में']],
  ['आपको', 'आप', { Case: 'Dat' }, ['आप', 'को']], ['आपसे', 'आप', { Case: 'Obl' }, ['आप', 'से']], ['आपमें', 'आप', { Case: 'Obl' }, ['आप', 'में']],
  ['उसको', 'वह', { Case: 'Dat' }, ['उस', 'को']], ['उससे', 'वह', { Case: 'Obl' }, ['उस', 'से']], ['उसमें', 'वह', { Case: 'Obl' }, ['उस', 'में']], ['उसपर', 'वह', { Case: 'Obl' }, ['उस', 'पर']],
  ['इसको', 'यह', { Case: 'Dat' }, ['इस', 'को']], ['इससे', 'यह', { Case: 'Obl' }, ['इस', 'से']], ['इसमें', 'यह', { Case: 'Obl' }, ['इस', 'में']], ['इसपर', 'यह', { Case: 'Obl' }, ['इस', 'पर']],
  ['उनको', 'वे', { Case: 'Dat' }, ['उन', 'को']], ['उनसे', 'वे', { Case: 'Obl' }, ['उन', 'से']], ['उनमें', 'वे', { Case: 'Obl' }, ['उन', 'में']],
  ['इनको', 'ये', { Case: 'Dat' }, ['इन', 'को']], ['इनसे', 'ये', { Case: 'Obl' }, ['इन', 'से']],
  ['किसको', 'कौन', { Case: 'Dat' }, ['किस', 'को']], ['किससे', 'कौन', { Case: 'Obl' }, ['किस', 'से']], ['किसमें', 'कौन', { Case: 'Obl' }, ['किस', 'में']],
  ['जिसको', 'जो', { Case: 'Dat' }, ['जिस', 'को']], ['जिससे', 'जो', { Case: 'Obl' }, ['जिस', 'से']], ['जिनमें', 'जो', { Case: 'Obl' }, ['जिन', 'में']],
  ['सबको', 'सब', { Case: 'Dat' }, ['सब', 'को']], ['सबसे', 'सब', { Case: 'Obl' }, ['सब', 'से']],
  // bare oblique stems
  ['मुझ', 'मैं', { Case: O }], ['इस', 'यह', { Case: O }], ['उस', 'वह', { Case: O }], ['इन', 'ये', { Case: O }], ['उन', 'वे', { Case: O }], ['किस', 'कौन', { Case: O }], ['किसी', 'कोई', { Case: O }],
];

describe('pronouns and fused forms', () => {
  it(`analyses ${PRON_ROWS.length} pronoun rows; a fused word is ONE reading with parts that tile the form`, () => {
    for (const [form, lemma, want, parts] of PRON_ROWS) {
      const all = read(form).filter((a) => a.pos === 'PRON' && a.lemma === lemma);
      const a = all.find((x) => Object.entries(want).every(([k, v]) => x.morph[k] === v));
      expect(a, `${form} ${lemma} ${JSON.stringify(want)}`).toBeTruthy();
      if (parts) {
        expectTiling(form, a!);
        expect(a!.parts!.map((p) => p.text)).toEqual(parts);
        const [stem, pp] = a!.parts!;
        expect(stem.kind).toBe('stem');
        expect(stem.lemma).toBe(lemma);
        expect(pp.kind).toBe('clitic');
        expect(pp.pos).toBe('ADP');
        expect(all.filter((x) => x.morph.Case === a!.morph.Case && x.parts)).toHaveLength(1);
      }
    }
  });

  it('Case is what the postposition gives: ने Erg, को Dat, का के की Gen, otherwise Obl', () => {
    expect(read('उसने')[0].morph.Case).toBe('Erg');
    expect(read('उसको')[0].morph.Case).toBe('Dat');
    expect(read('उससे')[0].morph.Case).toBe('Obl');
    for (const w of ['उसका', 'उसके', 'उसकी', 'इसका', 'उनका', 'आपका']) {
      const r = read(w);
      expect(r.length, w).toBeGreaterThan(0);
      for (const a of r) { expect(a.morph.Case, w).toBe('Gen'); expect(a.pos, w).toBe('DET'); expectTiling(w, a); }
    }
    expect(read('उसका')[0].lemma).toBe('उसका');
    expect(read('आपकी').map((a) => a.morph.Gender)).toEqual(['Fem', 'Fem']);
  });

  it('a fused word is not attempted for a noun written with its postposition', () => {
    for (const w of ['लड़केने', 'घरमें', 'लड़कोंको', 'किताबसे']) {
      const r = read(w);
      expect(r.some((a) => a.parts), w).toBe(false);
      expect(r.some((a) => a.lemmaKnown), w).toBe(false);
    }
  });

  it('the closed table is certain whether or not the word list has the pronoun, but unvouched readings stay at 0.6', () => {
    const none = analyzeHindiForm('उसने');
    expect(none).toHaveLength(1);
    expect(none[0].lemmaKnown).toBe(false);
    expect(none[0].confidence).toBe(0.6);
    const withList = analyzeHindiForm('उसने', { knownLemma: (l) => l === 'वह' });
    expect(withList[0].lemmaKnown).toBe(true);
    expect(withList[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('the determiner use of यह / वह / कोई is a reading only when the word list vouches for it', () => {
    expect(read('यह').some((a) => a.pos === 'DET')).toBe(false);
    const det = analyzeHindiForm('यह', { knownLemma: (l, p) => l === 'यह' && p === 'DET' });
    expect(det.some((a) => a.pos === 'DET' && a.lemmaKnown)).toBe(true);
  });

  it('every generated pronoun form analyses back', () => {
    let rows = 0;
    for (const l of ['मैं', 'हम', 'तू', 'तुम', 'आप', 'यह', 'वह', 'ये', 'वे', 'कौन', 'जो', 'सब']) {
      for (const g of inflectHindi(l, 'PRON')) {
        rows++;
        expect(read(g.form).some((a) => a.lemma === l && JSON.stringify(a.morph) === JSON.stringify(g.morph)), `${l} ${g.form}`).toBe(true);
      }
    }
    expect(rows).toBeGreaterThan(100);
  });
});
