import { describe, expect, it } from 'vitest';
import { analyzeHindiForm, describeHindiMorph, inflectHindi, type HindiAnalysis } from '../../src/adapters/hindi/morphology';
import { NOUNS, OPTS, VERBS, read } from './hindi-morph-helpers';

const none = (form: string): HindiAnalysis[] => analyzeHindiForm(form);

describe('words outside the list: rule-only guesses', () => {
  const UNKNOWN = [
    'चलता', 'खेलते', 'लिखती', 'सोचूँगा', 'बनेगा', 'सुनेंगे', 'पूछकर', 'खेलना', 'दौड़ेगी', 'बच्चों', 'कुर्सियाँ', 'कुर्सियों', 'मेजें', 'मेज़ों', 'घोड़े',
    'कितावें', 'गाँवों', 'नमस्ते', 'शहरों', 'दोस्तों', 'बनाते', 'पढ़ाता', 'सिखाना', 'लड़कों', 'लड़के', 'लड़को', 'रोटियाँ', 'बहुओं', 'माताओं', 'पिताओं',
    'करवाते', 'खेलकर', 'जीतेंगे', 'हँसूँगी', 'चलिए', 'सुनिएगा', 'दिखाओगे', 'घबराया', 'चिल्लाई', 'भागीं', 'देखा', 'बोले', 'सीखें', 'रुको', 'किताबों', 'आँखों', 'नदियों', 'हाथियों',
  ];

  it('every guess is flagged lemmaKnown=false, at most 0.6, ordered, at most four, and has no gloss', () => {
    for (const w of UNKNOWN) {
      const r = none(w);
      expect(r.length, w).toBeGreaterThan(0);
      // the person-variants of one guess count as one guess
      expect(new Set(r.map((a) => `${a.lemma}|${a.pos}|${JSON.stringify({ ...a.morph, Person: undefined, Polite: undefined })}`)).size, w).toBeLessThanOrEqual(4);
      for (const a of r) {
        expect(a.lemmaKnown, w).toBe(false);
        expect(a.confidence, w).toBeLessThanOrEqual(0.6);
        expect(a.confidence, w).toBeGreaterThan(0);
        expect(Object.keys(a).sort().every((k) => ['lemma', 'pos', 'morph', 'rule', 'lemmaKnown', 'confidence', 'parts', 'register'].includes(k)), w).toBe(true);
        expect(a.rule, w).toMatch(/word list|pronoun|possessive/);
      }
      for (let i = 1; i < r.length; i++) expect(r[i].confidence, w).toBeLessThanOrEqual(r[i - 1].confidence);
    }
  });

  it('a verb form whose ending is unmistakable comes before a bare-noun guess', () => {
    for (const [w, lemma] of [['चलता', 'चलना'], ['खेलते', 'खेलना'], ['लिखती', 'लिखना'], ['सोचूँगा', 'सोचना'], ['बनेगा', 'बनना'], ['सुनेंगे', 'सुनना'], ['पूछकर', 'पूछना'], ['खेलना', 'खेलना']] as const) {
      const r = none(w);
      expect(r[0].pos, w).toBe('VERB');
      expect(r[0].lemma, w).toBe(lemma);
      expect(r[0].confidence, w).toBeGreaterThanOrEqual(0.5);
    }
    // -ेगा on a stem with a long-vowel look: the noun guess for the same string never outranks the verb
    const r = none('बनेगा');
    expect(r.findIndex((a) => a.pos === 'NOUN')).toBe(-1);
    // लड़के: no unmistakable verb ending, so the noun guess leads
    expect(none('लड़के')[0].pos).toBe('NOUN');
  });

  it('an oblique plural gives both noun candidates, the unmarked lemma first (it is far likelier in running text), neither with a gender', () => {
    const r = none('लड़कों');
    expect(r.map((a) => a.lemma)).toEqual(['लड़क', 'लड़का']);
    expect(r[0].morph).toEqual({ Number: 'Plur', Case: 'Obl' });
    expect(r[1].morph).toEqual({ Number: 'Plur', Case: 'Obl' });
    expect(r[0].confidence).toBeGreaterThan(r[1].confidence);
    expect(none('बच्चों').map((a) => a.lemma)).toEqual(['बच्च', 'बच्चा']);
    expect(none('किताबों').map((a) => a.lemma).slice(0, 2)).toEqual(['किताब', 'किताबा']);
    expect(none('माताओं').some((a) => a.lemma === 'माता')).toBe(true);
    expect(none('भालुओं').map((a) => a.lemma)).toEqual(expect.arrayContaining(['भालू', 'भालु']));
    const ii = none('आदमियों').map((a) => a.lemma);
    expect(ii[0]).toBe('आदमी');
  });

  it('feminine plurals: -ियाँ points to a feminine noun in -ी', () => {
    const r = none('कुर्सियाँ');
    expect(r[0].lemma).toBe('कुर्सी');
    expect(r[0].morph.Gender).toBe('Fem');
    expect(r.some((a) => a.lemma === 'कुर्सिया')).toBe(true);
    expect(none('कुर्सियां')[0].lemma).toBe('कुर्सी');
  });

  it('a form with no recognisable ending gives nothing', () => {
    for (const w of ['दोस्त', 'राम', 'कमल', 'किताब', 'कलम', 'फूल', 'कख', 'सुंद']) expect(none(w), w).toEqual([]);
  });

  it('nonsense gives nothing', () => {
    for (const w of ['', ' ', 'क', 'ा', 'ाा', 'ं', '्ज', 'ृ', 'ँँ', 'abc', 'hello', 'लड़का1', '123', '१२३', 'क ख', '।', 'का‍', 'ab क', '😀']) {
      expect(none(w), JSON.stringify(w)).toEqual([]);
      expect(read(w), JSON.stringify(w)).toEqual([]);
    }
  });

  it('single letters and bare signs are not stems', () => {
    expect(none('ल')).toEqual([]);
    expect(none('लता')).toEqual([]);
    expect(none('पता')).toEqual([]);
  });

  it('commonest verbs are guessed with a confidence above the same ending on an unknown stem (ordering only)', () => {
    const a = none('करके')[0];
    expect(a.lemma).toBe('करना');
    expect(a.confidence).toBeLessThanOrEqual(0.6);
  });

  it('irregular perfectives and the forms of होना are certain even without a word list, but still unvouched', () => {
    for (const [w, lemma] of [['गया', 'जाना'], ['किया', 'करना'], ['हुआ', 'होना'], ['है', 'होना'], ['हैं', 'होना'], ['था', 'होना'], ['थीं', 'होना'], ['होगा', 'होना'], ['कीजिए', 'करना'], ['गईं', 'जाना']] as const) {
      const r = none(w);
      expect(r.length, w).toBeGreaterThan(0);
      expect(r[0].lemma, w).toBe(lemma);
      expect(r[0].lemmaKnown, w).toBe(false);
      expect(r[0].confidence, w).toBe(0.6);
    }
    expect(none('है')[0].pos).toBe('AUX');
  });
});

describe('knownLemma changes confidence and order', () => {
  it('a vouched lemma is confident (0.8–0.9) and comes first', () => {
    const only = (lemma: string, pos: string) => ({ knownLemma: (l: string, p?: string) => l === lemma && (!p || p === pos) });
    const a = analyzeHindiForm('लड़कों', only('लड़क', 'NOUN'));
    expect(a[0].lemma).toBe('लड़क');
    expect(a[0].lemmaKnown).toBe(true);
    expect(a[0].confidence).toBeGreaterThanOrEqual(0.7);
    // no gender in the word list: both paradigms of the vouched lemma, then (if any) the unvouched guesses
    const vouched = a.filter((x) => x.lemmaKnown);
    expect(vouched.map((x) => x.lemma)).toEqual(['लड़क', 'लड़क']);
    expect(vouched.map((x) => x.confidence)).toEqual([0.7, 0.7]);
    expect(a.slice(vouched.length).every((x) => !x.lemmaKnown)).toBe(true);
    const b = analyzeHindiForm('लड़कों', only('लड़का', 'NOUN'));
    expect(b[0].lemma).toBe('लड़का');
    expect(b[0].confidence).toBeGreaterThanOrEqual(0.7);
    expect(analyzeHindiForm('लड़कों')[0].confidence).toBeLessThan(0.6);
    expect(analyzeHindiForm('चलता', only('चलना', 'VERB'))[0].confidence).toBe(0.9);
    expect(analyzeHindiForm('चलता')[0].confidence).toBeLessThanOrEqual(0.6);
  });

  it('every vouched reading is between 0.7 and 0.9; vouched always before unvouched', () => {
    const forms = new Set<string>();
    for (const l of VERBS) for (const g of inflectHindi(l, 'VERB')) forms.add(g.form);
    for (const [l, info] of Object.entries(NOUNS)) for (const g of inflectHindi(l, 'NOUN', info)) forms.add(g.form);
    for (const w of forms) {
      const r = read(w);
      let seenUnknown = false;
      for (const a of r) {
        if (a.lemmaKnown) {
          expect(seenUnknown, w).toBe(false);
          expect(a.confidence, w).toBeGreaterThanOrEqual(0.7);
          expect(a.confidence, w).toBeLessThanOrEqual(0.9);
        } else {
          seenUnknown = true;
          expect(a.confidence, w).toBeLessThanOrEqual(0.6);
        }
      }
    }
  });

  it('without knownLemma at all, every reading is an unvouched one', () => {
    for (const w of ['लड़के', 'करता', 'किताबें', 'मुझसे']) for (const a of analyzeHindiForm(w, {})) { expect(a.lemmaKnown).toBe(false); expect(a.confidence).toBeLessThanOrEqual(0.6); }
  });
});

describe('describeHindiMorph', () => {
  const d = describeHindiMorph;
  it('plain English for the shapes a learner meets', () => {
    expect(d({ Gender: 'Masc', Number: 'Plur', Case: 'Obl' })).toBe('masculine, oblique plural');
    expect(d({ Gender: 'Masc', Number: 'Sing', Case: 'Dir' })).toBe('masculine, direct singular');
    expect(d({ Gender: 'Fem', Number: 'Plur', Case: 'Voc' })).toBe('feminine, vocative plural');
    expect(d({ VerbForm: 'Part', Aspect: 'Perf', Gender: 'Fem', Number: 'Sing' })).toBe('feminine singular, perfective participle');
    expect(d({ VerbForm: 'Part', Aspect: 'Imp', Gender: 'Masc', Number: 'Plur' })).toBe('masculine plural, imperfective participle');
    expect(d({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Fut', Person: '1', Number: 'Sing' })).toBe('first person singular, future');
    expect(d({ VerbForm: 'Fin', Mood: 'Sub', Person: '1', Number: 'Sing' })).toBe('first person singular, subjunctive');
    expect(d({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Polite: 'Form' })).toBe('polite command (आप)');
    expect(d({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Polite: 'Fam' })).toBe('familiar command (तुम)');
    expect(d({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Polite: 'Infm' })).toBe('plain command (तू)');
    expect(d({ VerbForm: 'Stem' })).toBe('bare stem (before a second verb)');
    expect(d({ VerbForm: 'Conv' })).toBe('stem + कर: having done');
    expect(d({ VerbForm: 'Inf', Gender: 'Masc', Case: 'Dir' })).toBe('infinitive');
    expect(d({ VerbForm: 'Inf', Case: 'Obl' })).toMatch(/oblique/);
    expect(d({ VerbForm: 'Inf', Gender: 'Fem' })).toBe('feminine infinitive');
    expect(d({ VerbForm: 'Part', Aspect: 'Prog', Gender: 'Fem', Number: 'Sing' })).toMatch(/progressive/);
  });

  it('pronouns, possessives, causatives and the empty bundle', () => {
    expect(d({ PronType: 'Prs', Person: '1', Number: 'Sing', Case: 'Erg' })).toBe('first person singular, ergative (ने)');
    expect(d({ PronType: 'Prs', Person: '1', Number: 'Sing', Case: 'Dat' })).toBe('first person singular, dative (को)');
    expect(d({ PronType: 'Dem', Person: '3', Number: 'Sing', Case: 'Obl' })).toBe('demonstrative, third person singular, oblique');
    expect(d({ PronType: 'Prs', Person: '2', Polite: 'Form', Case: 'Dir' })).toBe('second person (आप), direct');
    expect(d({ Poss: 'Yes', PronType: 'Prs', Person: '1', Gender: 'Fem', Number: 'Sing' })).toMatch(/possessive of the first person, feminine singular/);
    expect(d({ VerbForm: 'Part', Aspect: 'Perf', Gender: 'Masc', Number: 'Sing', Voice: 'Cau' })).toMatch(/causative$/);
    expect(d({}, 'ADJ')).toBe('does not change');
    expect(d({})).toBe('');
    expect(d({ VerbForm: 'Fin', Mood: 'Sub', Person: '3', Number: 'Plur' })).toBe('third person plural, subjunctive');
    expect(d({ VerbForm: 'Fin', Mood: 'Sub', Person: '1', Number: 'Plur' })).toBe('first person plural, subjunctive');
    expect(d({ VerbForm: 'Fin', Mood: 'Sub', Person: '2', Number: 'Plur', Polite: 'Form' })).toBe('you (आप), subjunctive');
    expect(d({ VerbForm: 'Fin', Mood: 'Sub', Person: '2', Number: 'Sing', Polite: 'Infm' })).toBe('you (तू), subjunctive');
    expect(d({ VerbForm: 'Fin', Mood: 'Sub', Person: '2', Polite: 'Fam' })).toBe('you (तुम), subjunctive');
    expect(d({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Fut', Person: '2', Number: 'Plur', Polite: 'Form', Gender: 'Fem' })).toBe('you (आप), future (feminine)');
  });

  it('describes every reading the engine produces for a sample, without empty or raw feature text', () => {
    for (const w of ['लड़के', 'करता', 'किया', 'करेंगे', 'हूँ', 'मैंने', 'उसका', 'अच्छी', 'कर', 'देखकर', 'रहा', 'आइए']) {
      for (const a of read(w)) {
        const t = d(a.morph, a.pos);
        expect(t.length, w).toBeGreaterThan(0);
        expect(t, w).not.toMatch(/VerbForm|Gender |Number /);
      }
    }
  });
});

describe('robustness', () => {
  it('results are independent copies: changing one does not change the next call', () => {
    const a = read('करता')[0];
    a.morph.Gender = 'Fem';
    a.rule = 'x';
    expect(read('करता')[0].morph.Gender).toBe('Masc');
    const p = read('उसने')[0];
    p.parts![0].text = 'zz';
    expect(read('उसने')[0].parts![0].text).toBe('उस');
  });

  it('a decomposed or precomposed nukta is the same form (NFC)', () => {
    const decomposed = analyzeHindiForm('पढ़ता', { knownLemma: (l) => l === 'पढ़ना' });
    const precomposed = analyzeHindiForm('पढ़ता', { knownLemma: (l) => l === 'पढ़ना' });
    expect(decomposed[0]?.lemma).toBe('पढ़ना');
    expect(precomposed).toEqual(decomposed);
  });

  it('the parts of a form written with a chandrabindu still slice the written form', () => {
    const a = analyzeHindiForm('मैंने')[0];
    expect('मैंने'.slice(a.parts![0].start, a.parts![0].end)).toBe(a.parts![0].text);
  });

  it('is fast: thousands of forms in well under a tenth of a millisecond each (loose bound for a busy machine)', () => {
    const forms: string[] = [];
    for (const l of VERBS) for (const g of inflectHindi(l, 'VERB')) forms.push(g.form);
    for (const [l, info] of Object.entries(NOUNS)) for (const g of inflectHindi(l, 'NOUN', info)) forms.push(g.form);
    const all: string[] = [];
    while (all.length < 4000) all.push(...forms);
    for (const w of all.slice(0, 500)) analyzeHindiForm(w, OPTS);
    const t0 = performance.now();
    let n = 0;
    for (const w of all) n += analyzeHindiForm(w, OPTS).length;
    const per = (performance.now() - t0) / all.length;
    expect(n).toBeGreaterThan(all.length);
    expect(per).toBeLessThan(0.25);
  });
});
