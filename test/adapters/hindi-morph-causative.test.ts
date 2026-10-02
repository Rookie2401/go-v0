import { describe, expect, it } from 'vitest';
import { analyzeHindiForm, inflectHindi, type HindiAnalyzeOptions, type HindiLemmaInfo } from '../../src/adapters/hindi/morphology';
import { validWordShape } from '../../src/adapters/hindi/morph-orth';
import { OPTS } from './hindi-morph-helpers';

const BASES = ['करना', 'बोलना', 'सीखना', 'देखना', 'जागना', 'बनना', 'पढ़ना', 'सुनना', 'सिलना', 'उठना', 'खाना', 'पीना', 'देना', 'सोना', 'सीना', 'मिलना', 'चलना'];
const verbs = (extra: string[] = [], info: Record<string, HindiLemmaInfo> = {}): HindiAnalyzeOptions => ({
  knownLemma: (l, p) => (BASES.includes(l) || extra.includes(l)) && (!p || p === 'VERB' || p === 'AUX'),
  lemmaInfo: (l, p) => (p === 'VERB' ? info[l] : undefined),
});
const PERF_MS = { VerbForm: 'Part', Aspect: 'Perf', Gender: 'Masc', Number: 'Sing', Voice: 'Cau' };

describe('causatives by rule, from a vouched base', () => {
  // [form, causative infinitive, base infinitive, first | second]
  const ROWS: Array<[string, string, string, 'first' | 'second']> = [
    ['बुलाया', 'बुलाना', 'बोलना', 'first'], ['सिखाया', 'सिखाना', 'सीखना', 'first'], ['दिखाया', 'दिखाना', 'देखना', 'first'], ['जगाया', 'जगाना', 'जागना', 'first'],
    ['खिलाया', 'खिलाना', 'खाना', 'first'], ['पिलाया', 'पिलाना', 'पीना', 'first'], ['दिलाया', 'दिलाना', 'देना', 'first'], ['सुलाया', 'सुलाना', 'सोना', 'first'],
    ['बनाया', 'बनाना', 'बनना', 'first'], ['पढ़ाया', 'पढ़ाना', 'पढ़ना', 'first'], ['सुनाया', 'सुनाना', 'सुनना', 'first'], ['सिलाया', 'सिलाना', 'सिलना', 'first'],
    ['उठाया', 'उठाना', 'उठना', 'first'], ['मिलाया', 'मिलाना', 'मिलना', 'first'], ['चलाया', 'चलाना', 'चलना', 'first'], ['कराया', 'कराना', 'करना', 'first'],
    ['करवाया', 'करवाना', 'करना', 'second'], ['बनवाया', 'बनवाना', 'बनना', 'second'], ['पढ़वाया', 'पढ़वाना', 'पढ़ना', 'second'], ['सुनवाया', 'सुनवाना', 'सुनना', 'second'],
    ['सिलवाया', 'सिलवाना', 'सिलना', 'second'], ['दिखवाया', 'दिखवाना', 'देखना', 'second'], ['खिलवाया', 'खिलवाना', 'खाना', 'second'], ['पिलवाया', 'पिलवाना', 'पीना', 'second'],
    ['सिलवाए', 'सिलवाना', 'सिलना', 'second'], ['सिलवाई', 'सिलवाना', 'सिलना', 'second'],
  ];

  it(`${ROWS.length} forms: a VERB reading of the causative infinitive, Voice=Cau, unconfirmed ≤ 0.6, before any noun guess`, () => {
    for (const [form, lemma, base, kind] of ROWS) {
      const r = analyzeHindiForm(form, verbs());
      expect(r.length, form).toBeGreaterThan(0);
      const a = r[0];
      expect(a, form).toMatchObject({ lemma, pos: 'VERB', lemmaKnown: false });
      expect(a.confidence, form).toBeLessThanOrEqual(0.6);
      expect(a.morph.Voice, form).toBe('Cau');
      expect(a.notes, form).toEqual({ derivedFrom: base, causative: kind });
      expect(a.rule, form).toContain(`causative of ${base}: to have / make someone ${base}`);
      expect(Object.keys(a), form).not.toContain('gloss');
      expect(r.findIndex((x) => x.pos === 'NOUN'), form).not.toBe(0);
      // the same lemma, whether or not the base is the only thing the list holds
      expect(r.some((x) => x.pos === 'NOUN' && x.lemma.endsWith('ा')), form).toBe(false);
    }
    expect(analyzeHindiForm('सिलवाया', verbs())[0].morph).toEqual(PERF_MS);
  });

  it('the verb features of the ending are all there (infinitive, imperfective, future, command, conjunctive)', () => {
    const o = verbs();
    const want: Array<[string, Record<string, string>]> = [
      ['करवाना', { VerbForm: 'Inf' }], ['करवाने', { VerbForm: 'Inf', Case: 'Obl' }], ['करवाता', { VerbForm: 'Part', Aspect: 'Imp', Gender: 'Masc', Number: 'Sing' }],
      ['करवाएगा', { Tense: 'Fut', Person: '3', Gender: 'Masc' }], ['करवाऊँगी', { Tense: 'Fut', Person: '1', Gender: 'Fem' }], ['करवाइए', { Mood: 'Imp', Polite: 'Form' }],
      ['करवाओ', { Mood: 'Imp', Polite: 'Fam' }], ['करवाकर', { VerbForm: 'Conv' }], ['करवाई', { Aspect: 'Perf', Gender: 'Fem', Number: 'Sing' }], ['करवाए', { Aspect: 'Perf', Gender: 'Masc', Number: 'Plur' }],
      ['बनवाया', { Aspect: 'Perf' }], ['बुलाएँगे', { Tense: 'Fut', Gender: 'Masc' }], ['दिखाइए', { Mood: 'Imp', Polite: 'Form' }], ['खिलाती', { Aspect: 'Imp', Gender: 'Fem' }],
    ];
    for (const [form, f] of want) {
      const a = analyzeHindiForm(form, o).find((x) => x.pos === 'VERB' && x.morph.Voice === 'Cau' && Object.entries(f).every(([k, v]) => x.morph[k] === v));
      expect(a, form).toBeTruthy();
      expect(a!.lemma.endsWith('ना')).toBe(true);
      expect(a!.lemmaKnown).toBe(false);
    }
  });

  it('a causative the list vouches for is confident and still carries Voice=Cau and derivedFrom, with or without lemmaInfo.causativeOf', () => {
    for (const info of [{} as Record<string, HindiLemmaInfo>, { करवाना: { pos: 'VERB', causativeOf: 'करना' } as HindiLemmaInfo }]) {
      const a = analyzeHindiForm('करवाया', verbs(['करवाना'], info))[0];
      expect(a).toMatchObject({ lemma: 'करवाना', pos: 'VERB', lemmaKnown: true });
      expect(a.confidence).toBeGreaterThanOrEqual(0.8);
      expect(a.morph.Voice).toBe('Cau');
      expect(a.notes).toEqual({ derivedFrom: 'करना', causative: 'second' });
    }
    const b = analyzeHindiForm('दिखाया', verbs(['दिखाना']))[0];
    expect(b).toMatchObject({ lemma: 'दिखाना', lemmaKnown: true });
    expect(b.notes).toEqual({ derivedFrom: 'देखना', causative: 'first' });
  });

  it('derived only when the base is vouched: बताना, a base not on the list, and the plain verbs are not causatives', () => {
    const plain = analyzeHindiForm('बताया', verbs(['बताना']))[0];
    expect(plain).toMatchObject({ lemma: 'बताना', lemmaKnown: true });
    expect(plain.morph.Voice).toBeUndefined();
    expect(plain.notes).toBeUndefined();
    for (const w of ['रेंगवाया', 'रेंगाया', 'घुमाया']) {
      const r = analyzeHindiForm(w, verbs());
      expect(r.length, w).toBeGreaterThan(0);
      for (const a of r) { expect(a.morph.Voice, w).toBeUndefined(); expect(a.notes, w).toBeUndefined(); }
    }
    // जाना / खाना / आना (a single consonant before the -ा) are never read as causatives
    for (const w of ['गया', 'खाया', 'आया', 'लाया', 'पाया']) for (const a of analyzeHindiForm(w, OPTS)) expect(a.morph.Voice, w).toBeUndefined();
    // a stem in -वा is tried as a verb first, even when the base is not vouched
    const g = analyzeHindiForm('रेंगवाया', {});
    expect(g[0]).toMatchObject({ lemma: 'रेंगवाना', pos: 'VERB', lemmaKnown: false });
  });

  it('a lemma without lemmaInfo.causativeOf but with one set generates the same forms (round trip)', () => {
    const info: HindiLemmaInfo = { pos: 'VERB', causativeOf: 'करना' };
    const o = verbs(['करवाना'], { करवाना: info });
    const rows = inflectHindi('करवाना', 'VERB', info);
    expect(rows.length).toBeGreaterThan(25);
    for (const g of rows) {
      expect(g.morph.Voice, g.form).toBe('Cau');
      const hit = analyzeHindiForm(g.form, o).find((a) => a.lemma === 'करवाना' && JSON.stringify(a.morph) === JSON.stringify(g.morph));
      expect(hit, `${g.form} ${JSON.stringify(g.morph)}`).toBeTruthy();
      expect(hit!.lemmaKnown).toBe(true);
    }
    // and the same forms without the flag differ only by Voice
    const plain = inflectHindi('करवाना', 'VERB');
    expect(plain.map((x) => x.form)).toEqual(rows.map((x) => x.form));
    expect(plain.every((x) => x.morph.Voice === undefined)).toBe(true);
  });
});

describe('no impossible lemma', () => {
  it('no returned lemma ends in two आ or has an impossible shape, vouched base or not', () => {
    const forms = ['सिलवाए', 'सिलवाई', 'सिलवाओं', 'करवाए', 'करवाएँ', 'बनाए', 'बनाओं', 'पिलाए', 'कौओं', 'कौए', 'कुएँ', 'दिखाए', 'रेंगवाए', 'सुलाई', 'जगाओ', 'खिलाएँगे'];
    for (const w of forms) {
      for (const o of [{}, verbs(), OPTS]) {
        for (const a of analyzeHindiForm(w, o)) {
          expect(validWordShape(a.lemma), `${w} → ${a.lemma}`).toBe(true);
          expect(/[ाआ]आ$/.test(a.lemma), `${w} → ${a.lemma}`).toBe(false);
        }
      }
    }
  });

  it('validWordShape', () => {
    for (const ok of ['कौआ', 'कुआँ', 'सिलवाना', 'आना', 'पढ़ना', 'दुआ']) expect(validWordShape(ok), ok).toBe(true);
    for (const bad of ['सिलवाआ', 'ाक', 'काा', 'कीा', 'आा', 'क््ख', 'कंा', 'कआआ']) expect(validWordShape(bad), bad).toBe(false);
  });
});

describe('a masculine -ता noun the list vouches for is not an abstract noun', () => {
  const o = (info?: HindiLemmaInfo): HindiAnalyzeOptions => ({
    knownLemma: (l, p) => (l === 'देवता' && (!p || p === 'NOUN')) || (l === 'देव' && (!p || p === 'NOUN')),
    lemmaInfo: (l, p) => (p === 'NOUN' && l === 'देवता' ? info : undefined),
  });
  it('gender comes from lemmaInfo, or stays unstated; never derivedFrom', () => {
    const m = analyzeHindiForm('देवताओं', o({ pos: 'NOUN', gender: 'm' }));
    expect(m[0]).toMatchObject({ lemma: 'देवता', pos: 'NOUN', lemmaKnown: true });
    expect(m[0].morph).toMatchObject({ Gender: 'Masc', Number: 'Plur', Case: 'Obl' });
    expect(m[0].notes).toBeUndefined();
    expect(analyzeHindiForm('देवता', o({ pos: 'NOUN', gender: 'm' })).every((a) => a.morph.Gender !== 'Fem' && !a.notes)).toBe(true);
    const none = analyzeHindiForm('देवता', o());
    expect(none.filter((a) => a.lemmaKnown && a.lemma === 'देवता').every((a) => !a.notes)).toBe(true);
    expect(none.some((a) => a.notes?.derivedFrom)).toBe(false);
    // not vouched: the abstract-noun rule still applies
    const unvouched = analyzeHindiForm('देवता', { knownLemma: (l, p) => l === 'देव' && (!p || p === 'NOUN') });
    expect(unvouched[0]).toMatchObject({ lemma: 'देवता', pos: 'NOUN', lemmaKnown: false });
    expect(unvouched[0].notes).toEqual({ derivedFrom: 'देव' });
  });
});
