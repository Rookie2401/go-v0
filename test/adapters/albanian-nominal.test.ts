/**
 * Albanian nominal morphology (package Q1): noun declension from three stated facts, adjective forms, readings by ending
 * for a word outside the list, and the word lists themselves. The expected forms below were written out by hand from the
 * declension tables, not produced by the rules under test. Machine-drafted, not checked by a native speaker.
 */
import { describe, expect, it } from 'vitest';
import { guessNoun, nounForms } from '../../src/adapters/albanian/morph-noun';
import { adjectiveForms } from '../../src/adapters/albanian/morph-adjective';
import { SQ_NOUNS } from '../../src/adapters/albanian/lexicon-nouns';
import { SQ_ADJECTIVES, SQ_ADVERBS } from '../../src/adapters/albanian/lexicon-modifiers';
import { A, N } from '../../src/adapters/albanian/types';
import type { SqForm, SqLexeme } from '../../src/adapters/albanian/types';

const sig = (f: SqForm): string => `${f.form}|${f.morph.Case}|${f.morph.Number}|${f.morph.Definite}`;
const got = (lex: SqLexeme): string[] => nounForms(lex).map(sig).sort();

/** The nine cells of a noun, in the order of the coordinator's table; '-' = no such form. */
function cells(lemma: string, slots: string): string[] {
  const [defNom, defAcc, defGen, indGen, indPl, defPl, gdPl, ablPl] = slots.split(' ');
  const rows: Array<[string, string, string, string]> = [
    [defNom, 'Nom', 'Sing', 'Def'],
    [defAcc, 'Acc', 'Sing', 'Def'],
    [defGen, 'Gen,Dat,Abl', 'Sing', 'Def'],
    [lemma, 'Nom,Acc', 'Sing', 'Ind'],
    [indGen, 'Gen,Dat,Abl', 'Sing', 'Ind'],
    [indPl, 'Nom,Acc', 'Plur', 'Ind'],
    [defPl, 'Nom,Acc', 'Plur', 'Def'],
    [gdPl, 'Gen,Dat,Abl', 'Plur', 'Def,Ind'],
    [ablPl, 'Abl', 'Plur', 'Ind'],
  ];
  return rows.filter(([f]) => f && f !== '-').map(([f, c, n, d]) => `${f}|${c}|${n}|${d}`).sort();
}

//                lemma       gender def       plural        slots: defNom defAcc defGen indGen indPl defPl gd-pl abl-pl
const TABLE: Array<[string, 'm' | 'f', string, string, string]> = [
  ['libër', 'm', 'libri', 'libra', 'libri librin librit libri libra librat librave librash'],
  ['shok', 'm', 'shoku', 'shokë', 'shoku shokun shokut shoku shokë shokët shokëve shokësh'],
  ['mal', 'm', 'mali', 'male', 'mali malin malit mali male malet maleve malesh'],
  ['vëlla', 'm', 'vëllai', 'vëllezër', 'vëllai vëllanë vëllait vëllai vëllezër vëllezërit vëllezërve vëllezërish'],
  ['vajzë', 'f', 'vajza', 'vajza', 'vajza vajzën vajzës vajze vajza vajzat vajzave vajzash'],
  ['shtëpi', 'f', 'shtëpia', 'shtëpi', 'shtëpia shtëpinë shtëpisë shtëpie shtëpi shtëpitë shtëpive shtëpish'],
  ['lule', 'f', 'lulja', 'lule', 'lulja lulen lules luleje lule lulet luleve lulesh'],
  ['rrugë', 'f', 'rruga', 'rrugë', 'rruga rrugën rrugës rruge rrugë rrugët rrugëve rrugësh'],
  ['kafe', 'f', 'kafeja', 'kafe', 'kafeja kafenë kafesë kafeje kafe kafetë kafeve kafesh'],
  ['djalë', 'm', 'djali', 'djem', 'djali djalin djalit djali djem djemtë djemve djemsh'],
  ['burrë', 'm', 'burri', 'burra', 'burri burrin burrit burri burra burrat burrave burrash'],
  ['njeri', 'm', 'njeriu', 'njerëz', 'njeriu njeriun njeriut njeriu njerëz njerëzit njerëzve njerëzish'],
  ['mësues', 'm', 'mësuesi', 'mësues', 'mësuesi mësuesin mësuesit mësuesi mësues mësuesit mësuesve mësuesish'],
  ['mësuese', 'f', 'mësuesja', 'mësuese', 'mësuesja mësuesen mësueses mësueseje mësuese mësueset mësueseve mësuesesh'],
  ['dhomë', 'f', 'dhoma', 'dhoma', 'dhoma dhomën dhomës dhome dhoma dhomat dhomave dhomash'],
  ['motër', 'f', 'motra', 'motra', 'motra motrën motrës motre motra motrat motrave motrash'],
  ['sy', 'm', 'syri', 'sy', 'syri syrin syrit syri sy sytë syve sysh'],
  ['gjë', 'f', 'gjëja', 'gjëra', 'gjëja gjënë gjësë gjëje gjëra gjërat gjërave gjërash'],
  ['dhi', 'f', 'dhia', 'dhi', 'dhia dhinë dhisë dhie dhi dhitë dhive dhish'],
  ['qytet', 'm', 'qyteti', 'qytete', 'qyteti qytetin qytetit qyteti qytete qytetet qyteteve qytetesh'],
  ['muaj', 'm', 'muaji', 'muaj', 'muaji muajin muajit muaji muaj muajt muajve muajsh'],
  ['kalë', 'm', 'kali', 'kuaj', 'kali kalin kalit kali kuaj kuajt kuajve kuajsh'],
  ['lumë', 'm', 'lumi', 'lumenj', 'lumi lumin lumit lumi lumenj lumenjtë lumenjve lumenjsh'],
  ['mik', 'm', 'miku', 'miq', 'miku mikun mikut miku miq miqtë miqve miqsh'],
  ['baba', 'm', 'babai', 'baballarë', 'babai babanë babait babai baballarë baballarët baballarëve baballarësh'],
  ['vit', 'm', 'viti', 'vite', 'viti vitin vitit viti vite vitet viteve vitesh'],
  ['re', 'f', 'reja', 're', 'reja renë resë reje re retë reve resh'],
  ['mendje', 'f', 'mendja', 'mendje', 'mendja mendjen mendjes - mendje mendjet mendjeve mendjesh'],
  ['fe', 'f', 'feja', 'fe', 'feja fenë fesë feje fe fetë feve fesh'],
  ['shi', 'm', 'shiu', 'shira', 'shiu shiun shiut shiu shira shirat shirave shirash'],
  ['zog', 'm', 'zogu', 'zogj', 'zogu zogun zogut zogu zogj zogjtë zogjve zogjsh'],
  ['shtrat', 'm', 'shtrati', 'shtretër', 'shtrati shtratin shtratit shtrati shtretër shtretërit shtretërve shtretërish'],
  ['mace', 'f', 'macja', 'mace', 'macja macen maces maceje mace macet maceve macesh'],
  ['engjëll', 'm', 'engjëlli', 'engjëj', 'engjëlli engjëllin engjëllit engjëlli engjëj engjëjt engjëjve engjëjsh'],
  ['pasdite', 'f', 'pasdita', 'pasdite', 'pasdita pasditen pasdites pasdite pasdite pasditet pasditeve pasditesh'],
  ['gjuhë', 'f', 'gjuha', 'gjuhë', 'gjuha gjuhën gjuhës gjuhe gjuhë gjuhët gjuhëve gjuhësh'],
];

describe('noun declension: every form of a noun from lemma, definite form and plural', () => {
  it('has at least 25 declension rows', () => expect(TABLE.length).toBeGreaterThanOrEqual(25));
  for (const [lemma, gender, def, plural, slots] of TABLE) {
    it(`${lemma} (${gender}): ${def}`, () => {
      expect(got(N(lemma, gender, def, plural, 'x'))).toEqual(cells(lemma, slots));
    });
  }

  it('irregular nouns are completed by explicit forms', () => {
    const grua = N('grua', 'f', 'gruaja', 'gra', 'woman', { forms: ['gruan: acc sg def', 'gruas: gen dat abl sg def', 'gratë: nom acc pl def'] });
    expect(got(grua)).toEqual(cells('grua', 'gruaja gruan gruas - gra gratë grave grash'));
    const dore = N('dorë', 'f', 'dora', 'duar', 'hand', { forms: ['duart: nom acc pl def'] });
    expect(got(dore)).toEqual(cells('dorë', 'dora dorën dorës dore duar duart duarve duarsh'));
    const nate = N('natë', 'f', 'nata', 'net', 'night', { forms: ['netët: nom acc pl def', 'netëve: gen dat abl pl def indef', '-: abl pl indef'] });
    expect(got(nate)).toEqual(cells('natë', 'nata natën natës nate net netët netëve -'));
    const dere = N('derë', 'f', 'dera', 'dyer', 'door', { forms: ['dyert: nom acc pl def'] });
    expect(got(dere)).toEqual(cells('derë', 'dera derën derës dere dyer dyert dyerve dyersh'));
  });

  it('a noun with no plural gets singular forms only', () => {
    expect(got(N('bukë', 'f', 'buka', undefined, 'bread'))).toEqual(cells('bukë', 'buka bukën bukës buke - - - -'));
    expect(got(N('shëndet', 'm', 'shëndeti', undefined, 'health'))).toEqual(cells('shëndet', 'shëndeti shëndetin shëndetit shëndeti - - - -'));
    expect(got(N('ujë', 'm', 'uji', 'ujëra', 'water'))).toEqual(cells('ujë', 'uji ujin ujit uji ujëra ujërat ujërave ujërash'));
  });

  it('a form of a shape the rules do not know gets only the definite nominative and the plural', () => {
    const f = nounForms(N('xyz', 'f', 'xyzoa', 'xyzoa', 'x'));
    expect(f.some((x) => x.morph.Case === 'Acc' && x.morph.Number === 'Sing')).toBe(false);
    expect(f.some((x) => x.form === 'xyzoa' && x.morph.Number === 'Plur')).toBe(true);
  });
});

describe('readings: one SqForm per distinct reading, unions in the conventional order', () => {
  const libri = nounForms(N('libër', 'm', 'libri', 'libra', 'book'));
  const of = (list: SqForm[], form: string) => list.filter((f) => f.form === form);

  it('libri is two readings: definite nominative singular, and indefinite genitive/dative/ablative singular', () => {
    const r = of(libri, 'libri');
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.morph).sort((a, b) => a.Definite.localeCompare(b.Definite))).toEqual([
      { Case: 'Nom', Number: 'Sing', Definite: 'Def', Gender: 'Masc' },
      { Case: 'Gen,Dat,Abl', Number: 'Sing', Definite: 'Ind', Gender: 'Masc' },
    ]);
  });

  it('vajza is two readings: definite nominative singular, and indefinite nominative/accusative plural', () => {
    const r = of(nounForms(N('vajzë', 'f', 'vajza', 'vajza', 'girl')), 'vajza');
    expect(r.map(sig).sort()).toEqual(['vajza|Nom,Acc|Plur|Ind', 'vajza|Nom|Sing|Def']);
  });

  it('nominative and accusative share one reading in the plural and in the indefinite singular', () => {
    expect(of(libri, 'librat').map((f) => f.morph.Case)).toEqual(['Nom,Acc']);
    expect(of(libri, 'libra').map((f) => f.morph.Case)).toEqual(['Nom,Acc']);
    expect(of(libri, 'libër').map((f) => f.morph)).toEqual([{ Case: 'Nom,Acc', Number: 'Sing', Definite: 'Ind', Gender: 'Masc' }]);
  });

  it('genitive and dative are never alone; the -ve form is plural, definite or indefinite; -sh is the indefinite ablative', () => {
    for (const f of libri) if (/Gen|Dat/.test(f.morph.Case)) expect(f.morph.Case).toBe('Gen,Dat,Abl');
    expect(of(libri, 'librave')[0].morph).toMatchObject({ Case: 'Gen,Dat,Abl', Number: 'Plur', Definite: 'Def,Ind' });
    expect(of(libri, 'librash')[0].morph).toMatchObject({ Case: 'Abl', Number: 'Plur', Definite: 'Ind' });
  });

  it('a form that is the definite plural and a genitive singular keeps both readings (mësuesit)', () => {
    const r = of(nounForms(N('mësues', 'm', 'mësuesi', 'mësues', 'teacher')), 'mësuesit');
    expect(r.map(sig).sort()).toEqual(['mësuesit|Gen,Dat,Abl|Sing|Def', 'mësuesit|Nom,Acc|Plur|Def']);
  });

  it('kafe is a singular and a plural reading of one written form', () => {
    expect(of(nounForms(N('kafe', 'f', 'kafeja', 'kafe', 'coffee')), 'kafe').map(sig).sort()).toEqual(['kafe|Nom,Acc|Plur|Ind', 'kafe|Nom,Acc|Sing|Ind']);
  });

  it('carries the gender; every form has a rule in plain words; no two readings are identical', () => {
    for (const [lemma, gender, def, plural] of TABLE) {
      const fs = nounForms(N(lemma, gender, def, plural, 'x'));
      const ids = fs.map((f) => JSON.stringify([f.form, Object.entries(f.morph).sort()]));
      expect(new Set(ids).size).toBe(ids.length);
      for (const f of fs) {
        expect(f.morph.Gender).toBe(gender === 'm' ? 'Masc' : 'Fem');
        expect(f.rule).toMatch(/singular|plural/);
      }
    }
    expect(of(libri, 'librin')[0].rule).toBe('definite accusative singular');
  });
});

describe('proper names decline like nouns', () => {
  const name = (lemma: string, g: 'm' | 'f', def: string): SqLexeme => ({ ...N(lemma, g, def, undefined, 'x'), pos: 'PROPN' });

  it('a name that is already definite: Beni, Benin, Benit · Ana, Anën, Anës', () => {
    expect(got(name('Beni', 'm', 'Beni'))).toEqual(['Beni|Nom|Sing|Def', 'Benin|Acc|Sing|Def', 'Benit|Gen,Dat,Abl|Sing|Def'].sort());
    expect(got(name('Ana', 'f', 'Ana'))).toEqual(['Ana|Nom|Sing|Def', 'Anën|Acc|Sing|Def', 'Anës|Gen,Dat,Abl|Sing|Def'].sort());
    expect(got(name('Elira', 'f', 'Elira'))).toEqual(['Elira|Nom|Sing|Def', 'Elirën|Acc|Sing|Def', 'Elirës|Gen,Dat,Abl|Sing|Def'].sort());
  });

  it('a name with the article, and a place name, take the whole singular paradigm', () => {
    expect(got(name('Dritan', 'm', 'Dritani'))).toEqual(cells('Dritan', 'Dritani Dritanin Dritanit Dritani - - - -'));
    expect(got(name('Shqipëri', 'f', 'Shqipëria'))).toEqual(cells('Shqipëri', 'Shqipëria Shqipërinë Shqipërisë Shqipërie - - - -'));
    expect(got(name('Tiranë', 'f', 'Tirana'))).toEqual(cells('Tiranë', 'Tirana Tiranën Tiranës Tirane - - - -'));
    expect(got(name('Durrës', 'm', 'Durrësi'))).toEqual(cells('Durrës', 'Durrësi Durrësin Durrësit Durrësi - - - -'));
  });
});

describe('the forms override on a lexeme', () => {
  const base = N('test', 'm', 'testi', 'teste', 'x');
  it('ADDS a reading the rules do not make', () => {
    const f = nounForms({ ...base, forms: ['testeve: dat pl indef'] });
    expect(f.map(sig)).toContain('testeve|Dat|Plur|Ind');
    expect(f.map(sig)).toContain('testeve|Gen,Dat,Abl|Plur|Def,Ind'); // the generated one stays
    expect(f.find((x) => x.morph.Case === 'Dat')?.rule).toContain('listed in the word list');
  });
  it('REPLACES the generated reading with the same Case, Number and Definite', () => {
    const f = nounForms({ ...base, forms: ['testat: nom acc pl def'] }).map(sig);
    expect(f).toContain('testat|Nom,Acc|Plur|Def');
    expect(f).not.toContain('testet|Nom,Acc|Plur|Def');
  });
  it('REMOVES a generated reading with the form "-"', () => {
    const f = nounForms({ ...base, forms: ['-: abl pl indef'] }).map(sig);
    expect(f.some((x) => x.endsWith('|Abl|Plur|Ind'))).toBe(false);
    expect(f).toContain('testet|Nom,Acc|Plur|Def');
  });
  it('a typo in the tags is an error, not a silent pass', () => {
    expect(() => nounForms({ ...base, forms: ['x: nomm'] })).toThrow();
  });
});

describe('guessNoun: a word outside the list', () => {
  const guess = (w: string) => guessNoun(w);
  it('reads by the ending, marked as a guess, with no gloss and low confidence', () => {
    const cases: Array<[string, string, string, string]> = [
      ['librin', 'libr', 'Acc', 'Sing'],
      ['shokun', 'shok', 'Acc', 'Sing'],
      ['librit', 'libr', 'Gen,Dat,Abl', 'Sing'],
      ['shokut', 'shok', 'Gen,Dat,Abl', 'Sing'],
      ['vajzën', 'vajzë', 'Acc', 'Sing'],
      ['vajzës', 'vajzë', 'Gen,Dat,Abl', 'Sing'],
      ['librat', 'libr', 'Nom,Acc', 'Plur'],
      ['malet', 'mal', 'Nom,Acc', 'Plur'],
      ['shokët', 'shok', 'Nom,Acc', 'Plur'],
      ['librave', 'libr', 'Gen,Dat,Abl', 'Plur'],
      ['shokëve', 'shok', 'Gen,Dat,Abl', 'Plur'],
      ['maleve', 'mal', 'Gen,Dat,Abl', 'Plur'],
      ['librash', 'libr', 'Abl', 'Plur'],
      ['shokësh', 'shok', 'Abl', 'Plur'],
    ];
    for (const [w, lemma, c, n] of cases) {
      const r = guess(w);
      expect(r.length, w).toBeGreaterThan(0);
      expect(r.length, w).toBeLessThanOrEqual(3);
      const hit = r.find((x) => x.lemma === lemma && x.morph.Case === c && x.morph.Number === n);
      expect(hit, w).toBeDefined();
      for (const x of r) {
        expect(x.pos).toBe('NOUN');
        expect(x.lemmaKnown).toBe(false);
        expect(x.origin).toBe('rule');
        expect(x.confidence).toBeLessThanOrEqual(0.5);
        expect(x.gloss).toBeUndefined();
        expect(x.rule).toContain('guess');
      }
    }
  });
  it('says which ending it read', () => {
    expect(guess('librave')[0].rule).toBe('by its ending -ave: plural, genitive or dative; the lemma is a guess');
    expect(guess('librin')[0].rule).toContain('-in');
  });
  it('keeps both readings of -it (genitive singular and definite plural)', () => {
    expect(guess('mësuesit').map(sig2).sort()).toEqual(['Gen,Dat,Abl|Sing', 'Nom,Acc|Plur']);
  });
  it('gives none when the ending says nothing', () => {
    for (const w of ['tani', 'dhe', 'mirë', 'nuk', 'është', 'si', 'a', '', 'mish']) expect(guess(w), w).toEqual([]);
  });
  it('never gives a reading to a stem shorter than two letters', () => {
    expect(guess('ut')).toEqual([]);
    expect(guess('ave')).toEqual([]);
  });
});
const sig2 = (r: { morph: Record<string, string> }): string => `${r.morph.Case}|${r.morph.Number}`;

describe('adjective forms', () => {
  const forms = (lex: SqLexeme): string[] => adjectiveForms(lex).map((f) => `${f.form}|${f.morph.Gender}|${f.morph.Number}`).sort();
  const ROWS: Array<[SqLexeme, string[]]> = [
    [A('mirë', true, 'good', { plF: 'mira' }), ['mira|Fem|Plur', 'mirë|Masc,Fem|Sing', 'mirë|Masc|Plur']],
    [A('keq', true, 'bad', { fem: 'keqe', plM: 'këqij', plF: 'këqija' }), ['keq|Masc|Sing', 'keqe|Fem|Sing', 'këqij|Masc|Plur', 'këqija|Fem|Plur']],
    [A('madh', true, 'big', { fem: 'madhe', plM: 'mëdhenj', plF: 'mëdha' }), ['madh|Masc|Sing', 'madhe|Fem|Sing', 'mëdhenj|Masc|Plur', 'mëdha|Fem|Plur']],
    [A('vogël', true, 'small', { plM: 'vegjël', plF: 'vogla' }), ['vegjël|Masc|Plur', 'vogël|Masc,Fem|Sing', 'vogla|Fem|Plur']],
    [A('ri', true, 'young', { fem: 're', plM: 'rinj', plF: 'reja' }), ['reja|Fem|Plur', 're|Fem|Sing', 'ri|Masc|Sing', 'rinj|Masc|Plur']],
    [A('bukur', true, 'beautiful', { plF: 'bukura' }), ['bukur|Masc,Fem|Sing', 'bukur|Masc|Plur', 'bukura|Fem|Plur']],
    [A('fundit', true, 'last'), ['fundit|Masc,Fem|Sing,Plur']],
    [A('zi', true, 'black', { fem: 'zezë', plM: 'zinj', plF: 'zeza' }), ['zeza|Fem|Plur', 'zezë|Fem|Sing', 'zi|Masc|Sing', 'zinj|Masc|Plur']],
    [A('kuq', true, 'red', { fem: 'kuqe', plF: 'kuqe' }), ['kuq|Masc|Sing,Plur', 'kuqe|Fem|Sing,Plur']],
    [A('vetëm', true, 'alone', { fem: 'vetme', plF: 'vetme' }), ['vetme|Fem|Sing,Plur', 'vetëm|Masc|Sing,Plur']],
    [A('tjetër', true, 'other', { plM: 'tjerë', plF: 'tjera' }), ['tjera|Fem|Plur', 'tjerë|Masc|Plur', 'tjetër|Masc,Fem|Sing']],
    [A('besnik', false, 'faithful', { fem: 'besnike', plM: 'besnikë', plF: 'besnike' }), ['besnik|Masc|Sing', 'besnike|Fem|Sing,Plur', 'besnikë|Masc|Plur']],
    [A('shqiptar', false, 'Albanian', { fem: 'shqiptare', plM: 'shqiptarë', plF: 'shqiptare' }), ['shqiptar|Masc|Sing', 'shqiptare|Fem|Sing,Plur', 'shqiptarë|Masc|Plur']],
    [A('gati', false, 'ready'), ['gati|Masc,Fem|Sing,Plur']],
    [A('huaj', true, 'foreign', { plF: 'huaja' }), ['huaj|Masc,Fem|Sing', 'huaj|Masc|Plur', 'huaja|Fem|Plur']],
  ];
  it('has at least 12 rows', () => expect(ROWS.length).toBeGreaterThanOrEqual(12));
  for (const [lex, want] of ROWS) {
    it(`${lex.articulated ? 'i ' : ''}${lex.lemma}`, () => expect(forms(lex)).toEqual([...want].sort()));
  }
  it('the article is a fact of the lexeme, never part of a form; each form has a rule', () => {
    for (const [lex] of ROWS) for (const f of adjectiveForms(lex)) {
      expect(f.form).not.toMatch(/ /);
      expect(f.rule).toMatch(/masculine|feminine/);
    }
  });
  it('the forms override adds or replaces by Gender and Number', () => {
    const f = adjectiveForms(A('mirë', true, 'good', { forms: ['mira: f pl', 'mirë: f sg'] }));
    expect(f.filter((x) => x.morph.Gender === 'Fem' && x.morph.Number === 'Plur').map((x) => x.form)).toEqual(['mira']);
    expect(f.filter((x) => x.morph.Gender === 'Fem' && x.morph.Number === 'Sing').map((x) => x.form)).toEqual(['mirë']);
  });
});

describe('the word lists', () => {
  const all: SqLexeme[] = [...SQ_NOUNS, ...SQ_ADJECTIVES, ...SQ_ADVERBS];
  const lower = (s: string) => s === s.toLowerCase();

  it('are of the planned size', () => {
    expect(SQ_NOUNS.length).toBeGreaterThanOrEqual(330);
    expect(SQ_ADJECTIVES.length + SQ_ADVERBS.length).toBeGreaterThanOrEqual(120);
    expect(SQ_ADJECTIVES.filter((a) => a.articulated).length).toBeGreaterThanOrEqual(60);
    expect(SQ_ADJECTIVES.filter((a) => !a.articulated).length).toBeGreaterThanOrEqual(10);
  });

  it('have no duplicate lemma + part of speech, every word a non-empty gloss, NFC spelling', () => {
    const seen = new Set<string>();
    for (const w of all) {
      const id = `${w.lemma}|${w.pos}`;
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
      expect(w.gloss.trim().length, id).toBeGreaterThan(0);
      expect(w.lemma, id).toBe(w.lemma.normalize('NFC'));
      expect(w.lemma, id).not.toMatch(/^\s|\s$/);
    }
  });

  it('every noun has gender and definite form, and a plural unless it has none; every form is NFC and lower case (proper names capitalised)', () => {
    for (const n of SQ_NOUNS) {
      expect(['NOUN', 'PROPN']).toContain(n.pos);
      expect(['m', 'f', 'n'], n.lemma).toContain(n.gender);
      expect(n.def, n.lemma).toBeTruthy();
      if (n.plural === undefined) expect(Object.keys(n)).not.toContain('plural');
      const fs = nounForms(n);
      expect(fs.length, n.lemma).toBeGreaterThanOrEqual(3);
      expect(fs.some((f) => f.form === n.def && f.morph.Case === 'Nom' && f.morph.Definite === 'Def'), n.lemma).toBe(true);
      if (n.plural) expect(fs.some((f) => f.form === n.plural && f.morph.Number === 'Plur'), n.lemma).toBe(true);
      const ids = new Set<string>();
      for (const f of fs) {
        expect(f.form, n.lemma).toBe(f.form.normalize('NFC'));
        if (n.pos === 'NOUN') expect(lower(f.form), `${n.lemma}: ${f.form}`).toBe(true);
        else expect(f.form[0], `${n.lemma}: ${f.form}`).toBe(f.form[0].toUpperCase());
        expect(f.rule.length, `${n.lemma}: ${f.form}`).toBeGreaterThan(0);
        const id = JSON.stringify([f.form, Object.entries(f.morph).sort()]);
        expect(ids.has(id), `${n.lemma}: ${f.form}`).toBe(false);
        ids.add(id);
      }
    }
  });

  it('every noun with an accusative also has a genitive, and a masculine noun in -i/-u or a feminine in -a has both', () => {
    for (const n of SQ_NOUNS) {
      const fs = nounForms(n);
      const acc = fs.some((f) => f.morph.Case === 'Acc' && f.morph.Definite === 'Def');
      const gen = fs.some((f) => f.morph.Case === 'Gen,Dat,Abl' && f.morph.Number === 'Sing' && f.morph.Definite === 'Def');
      expect(acc, n.lemma).toBe(gen);
      if (n.lemma !== 'grua') expect(acc, `${n.lemma} (${n.def}) has no rule`).toBe(true);
    }
  });

  it('every adjective produces forms without throwing: lower case, NFC, no article inside', () => {
    for (const a of SQ_ADJECTIVES) {
      expect(a.pos).toBe('ADJ');
      expect(typeof a.articulated, a.lemma).toBe('boolean');
      const fs = adjectiveForms(a);
      expect(fs.length, a.lemma).toBeGreaterThanOrEqual(1);
      expect(fs.some((f) => f.form === a.lemma), a.lemma).toBe(true);
      for (const f of fs) {
        expect(f.form).toBe(f.form.normalize('NFC'));
        expect(lower(f.form), f.form).toBe(true);
        expect(f.form).not.toMatch(/ /);
      }
    }
  });

  it('adverbs are single lower-case words of part of speech ADV', () => {
    for (const w of SQ_ADVERBS) {
      expect(w.pos).toBe('ADV');
      expect(w.lemma).toMatch(/^[a-zçë]+$/);
    }
  });

  it('say that they are machine-drafted', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['lexicon-nouns.ts', 'lexicon-modifiers.ts']) {
      expect(readFileSync(new URL(`../../src/adapters/albanian/${f}`, import.meta.url), 'utf8')).toMatch(/MACHINE-DRAFTED/);
    }
  });

  it('spot checks of listed words', () => {
    const noun = (l: string) => SQ_NOUNS.find((n) => n.lemma === l)!;
    expect(got(noun('libër'))).toEqual(cells('libër', 'libri librin librit libri libra librat librave librash'));
    expect(got(noun('grua'))).toEqual(cells('grua', 'gruaja gruan gruas - gra gratë grave grash'));
    expect(got(noun('natë'))).toEqual(cells('natë', 'nata natën natës nate net netët netëve -'));
    expect(nounForms(noun('Beni')).map((f) => f.form).sort()).toEqual(['Beni', 'Benin', 'Benit']);
    const adj = (l: string) => SQ_ADJECTIVES.find((a) => a.lemma === l)!;
    expect(adj('mirë').articulated).toBe(true);
    expect(adj('besnik').articulated).toBe(false);
    expect(adj('madh')).toMatchObject({ fem: 'madhe', plM: 'mëdhenj', plF: 'mëdha' });
    for (const l of ['Zot', 'Perëndi', 'Bibël', 'kishë', 'lutje', 'besim', 'mëkat', 'falje', 'hir', 'shpëtim', 'kryq', 'ringjallje', 'dëshmi']) {
      expect(SQ_NOUNS.some((n) => n.lemma.toLowerCase() === l.toLowerCase()), l).toBe(true);
    }
    for (const l of ['Beni', 'Ana', 'Arta', 'Dritan', 'Mira', 'Gjergj', 'Elira', 'Shqipëri', 'Tiranë', 'Durrës', 'Shkodër', 'Korçë', 'Vlorë', 'Kosovë', 'Prishtinë']) {
      expect(SQ_NOUNS.some((n) => n.lemma === l && n.pos === 'PROPN'), l).toBe(true);
    }
  });
});
