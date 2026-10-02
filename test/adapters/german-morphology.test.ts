/**
 * The German word-form engine (package GA): generation tables written from the grammar, and analysis of single
 * written forms against a small FIXTURE lexicon (the real lexicon is another package's work).
 */
import { describe, expect, it } from 'vitest';
import {
  analyzeGermanForm, conjugateGerman, declineAdjective, declineNoun, describeGermanMorph,
} from '../../src/adapters/german/morphology';
import type {
  DeAdjective, DeCell, DeClosedForm, DeContraction, DeLexiconView, DeNoun, DePrefixKind, DeReading, DeVerb,
} from '../../src/adapters/german/types';

// ---------------------------------------------------------------------------------------------------------------
// fixture lexicon

const noun = (n: Partial<DeNoun> & Pick<DeNoun, 'lemma' | 'gender'>): DeNoun => ({ gloss: n.lemma.toLowerCase(), ...n });
const NOUNS: DeNoun[] = [
  noun({ lemma: 'Mann', gender: 'm', genSg: 'Mannes', plural: 'Männer' }),
  noun({ lemma: 'Frau', gender: 'f', genSg: 'Frau', plural: 'Frauen' }),
  noun({ lemma: 'Kind', gender: 'n', genSg: 'Kindes', plural: 'Kinder' }),
  noun({ lemma: 'Haus', gender: 'n', genSg: 'Hauses', plural: 'Häuser' }),
  noun({ lemma: 'Herz', gender: 'n', genSg: 'Herzens', plural: 'Herzen', irregular: { 'D sg': 'Herzen' } }),
  noun({ lemma: 'Student', gender: 'm', genSg: 'Studenten', plural: 'Studenten', weak: true }),
  noun({ lemma: 'Name', gender: 'm', genSg: 'Namens', plural: 'Namen', weak: true }),
  noun({ lemma: 'Tag', gender: 'm', genSg: 'Tages', plural: 'Tage' }),
  noun({ lemma: 'Buch', gender: 'n', genSg: 'Buches', plural: 'Bücher' }),
  noun({ lemma: 'Lehrer', gender: 'm', genSg: 'Lehrers', plural: 'Lehrer' }),
  noun({ lemma: 'Eltern', gender: 'pl' }),
  noun({ lemma: 'Deutsche', gender: 'm', adjectival: true }),
];

const verb = (v: Partial<DeVerb> & Pick<DeVerb, 'lemma'>): DeVerb => ({ cls: 'weak', aux: 'haben', gloss: v.lemma, ...v });
const strong = (lemma: string, pres3: string, pret: string, part: string, extra: Partial<DeVerb> = {}): DeVerb =>
  verb({ lemma, cls: 'strong', pres3, pret, part, ...extra });
const VERBS: DeVerb[] = [
  verb({ lemma: 'machen' }), verb({ lemma: 'arbeiten' }), verb({ lemma: 'reisen', aux: 'sein' }), verb({ lemma: 'sammeln' }),
  verb({ lemma: 'wandern', aux: 'sein' }), verb({ lemma: 'studieren' }), verb({ lemma: 'lächeln' }),
  strong('fahren', 'fährt', 'fuhr', 'gefahren', { aux: 'sein' }), strong('gehen', 'geht', 'ging', 'gegangen', { aux: 'sein' }),
  strong('geben', 'gibt', 'gab', 'gegeben'), strong('nehmen', 'nimmt', 'nahm', 'genommen'), strong('lesen', 'liest', 'las', 'gelesen'),
  strong('kommen', 'kommt', 'kam', 'gekommen', { aux: 'sein' }), strong('stehen', 'steht', 'stand', 'gestanden'),
  strong('finden', 'findet', 'fand', 'gefunden'), strong('essen', 'isst', 'aß', 'gegessen'), strong('halten', 'hält', 'hielt', 'gehalten'),
  strong('sehen', 'sieht', 'sah', 'gesehen'), strong('schlafen', 'schläft', 'schlief', 'geschlafen'),
  strong('verstehen', 'versteht', 'verstand', 'verstanden'),
  verb({ lemma: 'bringen', cls: 'mixed', pres3: 'bringt', pret: 'brachte', part: 'gebracht' }),
  verb({ lemma: 'kennen', cls: 'mixed', pres3: 'kennt', pret: 'kannte', part: 'gekannt' }),
  strong('aufstehen', 'steht', 'stand', 'gestanden', { prefix: 'auf', base: 'stehen', aux: 'sein' }),
  strong('anfangen', 'fängt', 'fing', 'gefangen', { prefix: 'an', base: 'fangen' }),
  strong('anrufen', 'ruft', 'rief', 'gerufen', { prefix: 'an', base: 'rufen' }),
  verb({ lemma: 'einkaufen', prefix: 'ein', base: 'kaufen' }),
  strong('umfahren', 'fährt', 'fuhr', 'gefahren', { prefix: 'um', base: 'fahren' }), // separable: knock down
  strong('umfahren', 'umfährt', 'umfuhr', 'umfahren'), // inseparable: drive around
  ...['sein', 'haben', 'werden', 'wissen', 'tun', 'können', 'müssen', 'dürfen', 'sollen', 'wollen', 'mögen'].map((l) => verb({ lemma: l, cls: 'irregular' })),
];

const adj = (a: Partial<DeAdjective> & Pick<DeAdjective, 'lemma'>): DeAdjective => ({ gloss: a.lemma, ...a });
const ADJECTIVES: DeAdjective[] = [
  adj({ lemma: 'gut', comparative: 'besser', superlative: 'best' }), adj({ lemma: 'alt', comparative: 'älter', superlative: 'ältest' }),
  adj({ lemma: 'klein' }), adj({ lemma: 'teuer', comparative: 'teurer', superlative: 'teuerst', stem: 'teur' }),
  adj({ lemma: 'dunkel', stem: 'dunkl' }), adj({ lemma: 'rosa', indeclinable: true }), adj({ lemma: 'frisch' }), adj({ lemma: 'neu' }),
];

const cell = (c: DeCell['c'], g: DeCell['g'], decl?: DeCell['decl']): DeCell => (decl ? { c, g, decl } : { c, g });
const closed = (c: Partial<DeClosedForm> & Pick<DeClosedForm, 'form' | 'lemma' | 'pos'>): DeClosedForm => ({ gloss: c.lemma, ...c });
const CLOSED: DeClosedForm[] = [
  closed({ form: 'der', lemma: 'der', pos: 'DET', cells: [cell('N', 'm'), cell('D', 'f'), cell('G', 'f'), cell('G', 'p')], morph: { PronType: 'Art', Definite: 'Def' }, governsDecl: 'wk' }),
  closed({ form: 'die', lemma: 'der', pos: 'DET', cells: [cell('N', 'f'), cell('A', 'f'), cell('N', 'p'), cell('A', 'p')], morph: { PronType: 'Art', Definite: 'Def' }, governsDecl: 'wk' }),
  closed({ form: 'das', lemma: 'der', pos: 'DET', cells: [cell('N', 'n'), cell('A', 'n')], morph: { PronType: 'Art', Definite: 'Def' }, governsDecl: 'wk' }),
  closed({ form: 'ein', lemma: 'ein', pos: 'DET', cells: [cell('N', 'm'), cell('N', 'n'), cell('A', 'n')], morph: { PronType: 'Art', Definite: 'Ind' }, governsDecl: 'mx' }),
];
const CONTRACTIONS: DeContraction[] = [
  { form: 'im', preposition: 'in', article: 'dem', cell: cell('D', 'm'), gloss: 'in the' },
  { form: 'zum', preposition: 'zu', article: 'dem', cell: cell('D', 'm'), gloss: 'to the' },
  { form: 'zur', preposition: 'zu', article: 'der', cell: cell('D', 'f'), gloss: 'to the' },
];
const PLAIN = [{ lemma: 'und', pos: 'CONJ' as const, gloss: 'and' }];
const PREFIXES: Record<string, DePrefixKind> = { auf: 'separable', an: 'separable', ein: 'separable', ver: 'inseparable', um: 'dual' };

const lexicon: DeLexiconView = {
  nouns: (l) => NOUNS.filter((n) => n.lemma.toLowerCase() === l),
  verb: (l) => VERBS.filter((v) => v.lemma === l),
  adjective: (l) => ADJECTIVES.find((a) => a.lemma === l),
  closed: (f) => CLOSED.filter((c) => c.form === f),
  plain: (f) => (f === 'und' ? PLAIN : []),
  preposition: () => undefined,
  contraction: (f) => CONTRACTIONS.find((c) => c.form === f),
  prefixKind: (p) => PREFIXES[p],
  separableVerbsOf: (b) => VERBS.filter((v) => v.prefix && v.base === b),
  allNouns: () => NOUNS, allVerbs: () => VERBS, allAdjectives: () => ADJECTIVES,
};

/** A fixture verb by lemma; where two share a lemma (umfahren), `prefix` picks the separable one and omitting it the inseparable one. */
const V = (lemma: string, prefix?: string): DeVerb =>
  VERBS.find((v) => v.lemma === lemma && (prefix === undefined ? !v.prefix : v.prefix === prefix)) ?? VERBS.find((v) => v.lemma === lemma)!;
const N = (lemma: string): DeNoun => NOUNS.find((n) => n.lemma === lemma)!;
const A = (lemma: string): DeAdjective => ADJECTIVES.find((a) => a.lemma === lemma)!;

// ---------------------------------------------------------------------------------------------------------------
// helpers

/** The forms of a noun by "case+gender" ('Nm', 'Gp'), the older dative left out. */
function paradigm(n: DeNoun): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of declineNoun(n)) {
    if ((f as { older?: boolean }).older) continue;
    for (const c of f.cells) out[`${c.c}${c.g}`] = f.form;
  }
  return out;
}

/** Forms of a verb in the order ich du er wir ihr sie for one tense key. */
const six = (v: DeVerb, tense: string): string[] => ['1s', '2s', '3s', '1p', '2p', '3p'].map((p) => conjugateGerman(v).forms[`${tense}.${p}`]);

const sig = (r: DeReading): string => `${r.lemma}|${r.pos}|${Object.entries(r.morph).map(([k, v]) => `${k}=${v}`).join(',')}`;
const find = (rs: DeReading[], pred: (r: DeReading) => boolean): DeReading => {
  const r = rs.find(pred);
  expect(r, `reading in ${rs.map(sig).join(' / ')}`).toBeDefined();
  return r!;
};
const an = (s: string): DeReading[] => analyzeGermanForm(s, lexicon);

describe('noun declension', () => {
  const cases: Array<[string, Record<string, string>]> = [
    ['Mann', { Nm: 'Mann', Am: 'Mann', Dm: 'Mann', Gm: 'Mannes', Np: 'Männer', Ap: 'Männer', Dp: 'Männern', Gp: 'Männer' }],
    ['Frau', { Nf: 'Frau', Af: 'Frau', Df: 'Frau', Gf: 'Frau', Np: 'Frauen', Ap: 'Frauen', Dp: 'Frauen', Gp: 'Frauen' }],
    ['Kind', { Nn: 'Kind', An: 'Kind', Dn: 'Kind', Gn: 'Kindes', Np: 'Kinder', Ap: 'Kinder', Dp: 'Kindern', Gp: 'Kinder' }],
    ['Student', { Nm: 'Student', Am: 'Studenten', Dm: 'Studenten', Gm: 'Studenten', Np: 'Studenten', Ap: 'Studenten', Dp: 'Studenten', Gp: 'Studenten' }],
    ['Name', { Nm: 'Name', Am: 'Namen', Dm: 'Namen', Gm: 'Namens', Np: 'Namen', Ap: 'Namen', Dp: 'Namen', Gp: 'Namen' }],
    ['Herz', { Nn: 'Herz', An: 'Herz', Dn: 'Herzen', Gn: 'Herzens', Np: 'Herzen', Ap: 'Herzen', Dp: 'Herzen', Gp: 'Herzen' }],
    ['Lehrer', { Nm: 'Lehrer', Am: 'Lehrer', Dm: 'Lehrer', Gm: 'Lehrers', Np: 'Lehrer', Ap: 'Lehrer', Dp: 'Lehrern', Gp: 'Lehrer' }],
    ['Haus', { Nn: 'Haus', An: 'Haus', Dn: 'Haus', Gn: 'Hauses', Np: 'Häuser', Ap: 'Häuser', Dp: 'Häusern', Gp: 'Häuser' }],
  ];
  it.each(cases)('declines %s in every case and number', (lemma, expected) => {
    expect(paradigm(N(lemma))).toEqual(expected);
  });

  it('merges forms that are spelled the same into one entry with all their cells', () => {
    const studenten = declineNoun(N('Student')).find((f) => f.form === 'Studenten')!;
    expect(studenten.cells).toHaveLength(7); // A D G singular + N A D G plural
    expect(declineNoun(N('Student')).filter((f) => f.form === 'Studenten')).toHaveLength(1);
  });

  it('gives a plural-only noun plural cells only', () => {
    const eltern = declineNoun(N('Eltern'));
    expect(eltern).toHaveLength(1);
    expect(eltern[0].form).toBe('Eltern');
    expect(eltern[0].cells.map((c) => `${c.c}${c.g}`)).toEqual(['Np', 'Ap', 'Dp', 'Gp']);
    expect(declineNoun(noun({ lemma: 'Leute', gender: 'pl' })).map((f) => f.form).sort()).toEqual(['Leute', 'Leuten']);
  });

  it('declines an adjectival noun like an adjective (der Deutsche, ein Deutscher, die Deutschen)', () => {
    const forms = declineNoun(N('Deutsche'));
    const cellsOf = (form: string) => forms.find((f) => f.form === form)?.cells.map((c) => `${c.c}${c.g}${c.decl}`) ?? [];
    expect(cellsOf('Deutsche')).toEqual(expect.arrayContaining(['Nmwk', 'Npst']));
    expect(cellsOf('Deutscher')).toEqual(expect.arrayContaining(['Nmst', 'Nmmx', 'Gpst']));
    expect(cellsOf('Deutschen')).toEqual(expect.arrayContaining(['Amwk', 'Dmwk', 'Gmmx', 'Dpwk', 'Apmx']));
    expect(cellsOf('Deutschem')).toEqual(['Dmst']);
    expect(cellsOf('Deutsches')).toEqual([]); // masculine lemma: no neuter forms
  });

  it('lists the older dative in -e for strong masculine and neuter nouns, marked, and says both when it equals another form', () => {
    const olderOf = (n: DeNoun) => declineNoun(n).filter((f) => (f as { older?: boolean }).older);
    expect(olderOf(N('Mann')).map((f) => f.form)).toEqual(['Manne']);
    expect(olderOf(N('Haus')).map((f) => f.form)).toEqual(['Hause']);
    expect(olderOf(N('Kind')).map((f) => f.form)).toEqual(['Kinde']);
    expect(olderOf(N('Mann'))[0].cells).toEqual([{ c: 'D', g: 'm' }]);
    for (const l of ['Frau', 'Student', 'Name', 'Herz', 'Lehrer', 'Deutsche', 'Eltern']) expect(olderOf(N(l)), l).toEqual([]);
    // Tag: dem Tage is also the plural die Tage; both entries are there
    const tage = declineNoun(N('Tag')).filter((f) => f.form === 'Tage');
    expect(tage).toHaveLength(2);
    expect(tage.filter((f) => (f as { older?: boolean }).older)).toHaveLength(1);
  });
});

describe('adjective declension', () => {
  // endings by [gender][case N A D G] for the three declensions, from the grammar
  const TABLES: Record<'st' | 'wk' | 'mx', Record<'m' | 'f' | 'n' | 'p', string[]>> = {
    st: { m: ['er', 'en', 'em', 'en'], f: ['e', 'e', 'er', 'er'], n: ['es', 'es', 'em', 'en'], p: ['e', 'e', 'en', 'er'] },
    wk: { m: ['e', 'en', 'en', 'en'], f: ['e', 'e', 'en', 'en'], n: ['e', 'e', 'en', 'en'], p: ['en', 'en', 'en', 'en'] },
    mx: { m: ['er', 'en', 'en', 'en'], f: ['e', 'e', 'en', 'en'], n: ['es', 'es', 'en', 'en'], p: ['en', 'en', 'en', 'en'] },
  };
  it('fills every cell of strong, weak and mixed declension for gut', () => {
    const forms = declineAdjective(A('gut'));
    for (const decl of ['st', 'wk', 'mx'] as const) {
      for (const g of ['m', 'f', 'n', 'p'] as const) {
        (['N', 'A', 'D', 'G'] as const).forEach((c, i) => {
          const expected = `gut${TABLES[decl][g][i]}`;
          const holders = forms.filter((f) => f.cells.some((x) => x.c === c && x.g === g && x.decl === decl));
          expect(holders.map((f) => f.form), `${decl} ${g} ${c}`).toEqual([expected]);
        });
      }
    }
    // 4 cases x 4 genders x 3 declensions, each once
    expect(forms.flatMap((f) => f.cells)).toHaveLength(48);
  });

  it('reads like the phrases it stands for', () => {
    const holds = (form: string, c: DeCell['c'], g: DeCell['g'], decl: 'st' | 'wk' | 'mx') =>
      declineAdjective(A('gut')).find((f) => f.form === form)!.cells.some((x) => x.c === c && x.g === g && x.decl === decl);
    expect(holds('guter', 'N', 'm', 'st')).toBe(true); // guter Wein
    expect(holds('gute', 'N', 'm', 'wk')).toBe(true); // der gute Wein
    expect(holds('guter', 'N', 'm', 'mx')).toBe(true); // ein guter Wein
    expect(holds('gutes', 'N', 'n', 'mx')).toBe(true); // ein gutes Kind
    expect(holds('gute', 'N', 'n', 'wk')).toBe(true); // das gute Kind
    expect(holds('gutem', 'D', 'm', 'st')).toBe(true); // mit gutem Wein
    expect(holds('guten', 'D', 'm', 'wk')).toBe(true); // dem guten Mann
    expect(holds('guter', 'G', 'p', 'st')).toBe(true); // guter Dinge
    expect(holds('guter', 'D', 'f', 'st')).toBe(true); // mit guter Milch
    expect(holds('guten', 'D', 'p', 'st')).toBe(true); // mit guten Freunden
  });

  it('gives the uninflected form as a form with no cells', () => {
    const forms = declineAdjective(A('gut'));
    expect(forms[0]).toEqual({ form: 'gut', cells: [] });
    expect(declineAdjective(A('gut'), 'cmp')[0]).toEqual({ form: 'besser', cells: [] });
  });

  const comparison: Array<[string, string[], string[], string[]]> = [
    ['gut', ['gut', 'gute', 'guten'], ['besser', 'bessere', 'besseren', 'besserem', 'besserer', 'besseres'], ['beste', 'besten', 'bestem', 'bester', 'bestes']],
    ['alt', ['alt', 'alte', 'alten'], ['älter', 'ältere', 'älteren'], ['älteste', 'ältesten', 'ältestes']],
    ['klein', ['klein', 'kleine'], ['kleiner', 'kleinere', 'kleineren'], ['kleinste', 'kleinsten']],
    ['teuer', ['teuer', 'teure', 'teuren', 'teurem', 'teurer', 'teures'], ['teurer', 'teurere', 'teureren'], ['teuerste', 'teuersten']],
    ['dunkel', ['dunkel', 'dunkle', 'dunklen', 'dunklem', 'dunkler', 'dunkles'], ['dunkler', 'dunklere', 'dunkleren'], ['dunkelste', 'dunkelsten']],
    ['frisch', ['frisch', 'frische'], ['frischer', 'frischere'], ['frischeste', 'frischesten']],
    ['neu', ['neu', 'neue'], ['neuer', 'neuere'], ['neueste', 'neuesten']],
  ];
  it.each(comparison)('compares %s', (lemma, pos, cmp, sup) => {
    const forms = (d: 'pos' | 'cmp' | 'sup') => declineAdjective(A(lemma), d).map((f) => f.form);
    expect(forms('pos')).toEqual(expect.arrayContaining(pos));
    expect(forms('cmp')).toEqual(expect.arrayContaining(cmp));
    expect(forms('sup')).toEqual(expect.arrayContaining(sup));
  });

  it('keeps the superlative without an uninflected form and gives an indeclinable adjective one form for everything', () => {
    expect(declineAdjective(A('gut'), 'sup').every((f) => f.cells.length > 0)).toBe(true);
    const rosa = declineAdjective(A('rosa'));
    expect(rosa).toHaveLength(1);
    expect(rosa[0].form).toBe('rosa');
    expect(rosa[0].cells).toHaveLength(48);
    expect(declineAdjective(A('rosa'), 'cmp')).toEqual([]);
  });
});

describe('verb conjugation: weak verbs', () => {
  it('machen', () => {
    const v = V('machen');
    expect(six(v, 'pres')).toEqual(['mache', 'machst', 'macht', 'machen', 'macht', 'machen']);
    expect(six(v, 'pret')).toEqual(['machte', 'machtest', 'machte', 'machten', 'machtet', 'machten']);
    expect(six(v, 'subj1')).toEqual(['mache', 'machest', 'mache', 'machen', 'machet', 'machen']);
    expect(six(v, 'subj2')).toEqual(six(v, 'pret'));
    const f = conjugateGerman(v).forms;
    expect([f['imp.2s'], f['imp.2p'], f.inf, f['inf.zu'], f['part.past'], f['part.pres']]).toEqual(['mach', 'macht', 'machen', 'zu machen', 'gemacht', 'machend']);
    expect(conjugateGerman(v).split).toBeUndefined();
  });

  it('arbeiten takes an inserted e', () => {
    const v = V('arbeiten');
    expect(six(v, 'pres')).toEqual(['arbeite', 'arbeitest', 'arbeitet', 'arbeiten', 'arbeitet', 'arbeiten']);
    expect(six(v, 'pret')).toEqual(['arbeitete', 'arbeitetest', 'arbeitete', 'arbeiteten', 'arbeitetet', 'arbeiteten']);
    expect(six(v, 'subj1')).toEqual(['arbeite', 'arbeitest', 'arbeite', 'arbeiten', 'arbeitet', 'arbeiten']);
    const f = conjugateGerman(v).forms;
    expect([f['imp.2s'], f['imp.2p'], f['part.past']]).toEqual(['arbeite', 'arbeitet', 'gearbeitet']);
  });

  it('reisen merges du -st into -t', () => {
    const v = V('reisen');
    expect(six(v, 'pres')).toEqual(['reise', 'reist', 'reist', 'reisen', 'reist', 'reisen']);
    expect(six(v, 'pret')).toEqual(['reiste', 'reistest', 'reiste', 'reisten', 'reistet', 'reisten']);
    expect(conjugateGerman(v).forms['part.past']).toBe('gereist');
  });

  it('sammeln (-eln) drops the stem e before -e', () => {
    const v = V('sammeln');
    expect(six(v, 'pres')).toEqual(['sammle', 'sammelst', 'sammelt', 'sammeln', 'sammelt', 'sammeln']);
    expect(six(v, 'pret')).toEqual(['sammelte', 'sammeltest', 'sammelte', 'sammelten', 'sammeltet', 'sammelten']);
    const f = conjugateGerman(v).forms;
    expect([f['imp.2s'], f['part.past'], f['part.pres']]).toEqual(['sammle', 'gesammelt', 'sammelnd']);
    expect(six(V('wandern'), 'pres')).toEqual(['wandere', 'wanderst', 'wandert', 'wandern', 'wandert', 'wandern']);
  });

  it('studieren (-ieren) takes no ge-; verstehen (inseparable) takes none either', () => {
    const v = V('studieren');
    expect(six(v, 'pres')).toEqual(['studiere', 'studierst', 'studiert', 'studieren', 'studiert', 'studieren']);
    expect(six(v, 'pret')).toEqual(['studierte', 'studiertest', 'studierte', 'studierten', 'studiertet', 'studierten']);
    expect(conjugateGerman(v).forms['part.past']).toBe('studiert');
    expect(conjugateGerman(v).forms['part.pres']).toBe('studierend');
    // a weak verb with an inseparable prefix and no listed participle
    const erleben = verb({ lemma: 'erleben' });
    expect(conjugateGerman(erleben).forms['part.past']).toBe('erlebt');
    expect(conjugateGerman(verb({ lemma: 'bearbeiten' })).forms['part.past']).toBe('bearbeitet');
    expect(conjugateGerman(verb({ lemma: 'bellen' })).forms['part.past']).toBe('gebellt');
    expect(conjugateGerman(verb({ lemma: 'beten' })).forms['part.past']).toBe('gebetet');
  });

  it('e-insertion after consonant + m / n, but not after l, r, h', () => {
    const f = (l: string) => six(verb({ lemma: l }), 'pres')[1];
    expect([f('atmen'), f('öffnen'), f('zeichnen'), f('rechnen')]).toEqual(['atmest', 'öffnest', 'zeichnest', 'rechnest']);
    expect([f('lernen'), f('filmen'), f('wohnen'), f('kommen')]).toEqual(['lernst', 'filmst', 'wohnst', 'kommst']);
    expect(six(verb({ lemma: 'tanzen' }), 'pres')[1]).toBe('tanzt');
    expect(six(verb({ lemma: 'mixen' }), 'pres')[1]).toBe('mixt');
    expect(six(verb({ lemma: 'baden' }), 'pret')).toEqual(['badete', 'badetest', 'badete', 'badeten', 'badetet', 'badeten']);
  });
});

describe('verb conjugation: strong and mixed verbs', () => {
  const rows: Array<[string, string[], string[], string[], string[], string, string, string]> = [
    ['fahren', ['fahre', 'fährst', 'fährt', 'fahren', 'fahrt', 'fahren'], ['fuhr', 'fuhrst', 'fuhr', 'fuhren', 'fuhrt', 'fuhren'],
      ['fahre', 'fahrest', 'fahre', 'fahren', 'fahret', 'fahren'], ['führe', 'führest', 'führe', 'führen', 'führet', 'führen'], 'fahr', 'fahrt', 'gefahren'],
    ['geben', ['gebe', 'gibst', 'gibt', 'geben', 'gebt', 'geben'], ['gab', 'gabst', 'gab', 'gaben', 'gabt', 'gaben'],
      ['gebe', 'gebest', 'gebe', 'geben', 'gebet', 'geben'], ['gäbe', 'gäbest', 'gäbe', 'gäben', 'gäbet', 'gäben'], 'gib', 'gebt', 'gegeben'],
    ['nehmen', ['nehme', 'nimmst', 'nimmt', 'nehmen', 'nehmt', 'nehmen'], ['nahm', 'nahmst', 'nahm', 'nahmen', 'nahmt', 'nahmen'],
      ['nehme', 'nehmest', 'nehme', 'nehmen', 'nehmet', 'nehmen'], ['nähme', 'nähmest', 'nähme', 'nähmen', 'nähmet', 'nähmen'], 'nimm', 'nehmt', 'genommen'],
    ['lesen', ['lese', 'liest', 'liest', 'lesen', 'lest', 'lesen'], ['las', 'last', 'las', 'lasen', 'last', 'lasen'],
      ['lese', 'lesest', 'lese', 'lesen', 'leset', 'lesen'], ['läse', 'läsest', 'läse', 'läsen', 'läset', 'läsen'], 'lies', 'lest', 'gelesen'],
    ['kommen', ['komme', 'kommst', 'kommt', 'kommen', 'kommt', 'kommen'], ['kam', 'kamst', 'kam', 'kamen', 'kamt', 'kamen'],
      ['komme', 'kommest', 'komme', 'kommen', 'kommet', 'kommen'], ['käme', 'kämest', 'käme', 'kämen', 'kämet', 'kämen'], 'komm', 'kommt', 'gekommen'],
    ['gehen', ['gehe', 'gehst', 'geht', 'gehen', 'geht', 'gehen'], ['ging', 'gingst', 'ging', 'gingen', 'gingt', 'gingen'],
      ['gehe', 'gehest', 'gehe', 'gehen', 'gehet', 'gehen'], ['ginge', 'gingest', 'ginge', 'gingen', 'ginget', 'gingen'], 'geh', 'geht', 'gegangen'],
    ['finden', ['finde', 'findest', 'findet', 'finden', 'findet', 'finden'], ['fand', 'fandest', 'fand', 'fanden', 'fandet', 'fanden'],
      ['finde', 'findest', 'finde', 'finden', 'findet', 'finden'], ['fände', 'fändest', 'fände', 'fänden', 'fändet', 'fänden'], 'finde', 'findet', 'gefunden'],
    ['essen', ['esse', 'isst', 'isst', 'essen', 'esst', 'essen'], ['aß', 'aßt', 'aß', 'aßen', 'aßt', 'aßen'],
      ['esse', 'essest', 'esse', 'essen', 'esset', 'essen'], ['äße', 'äßest', 'äße', 'äßen', 'äßet', 'äßen'], 'iss', 'esst', 'gegessen'],
    ['halten', ['halte', 'hältst', 'hält', 'halten', 'haltet', 'halten'], ['hielt', 'hieltest', 'hielt', 'hielten', 'hieltet', 'hielten'],
      ['halte', 'haltest', 'halte', 'halten', 'haltet', 'halten'], ['hielte', 'hieltest', 'hielte', 'hielten', 'hieltet', 'hielten'], 'halte', 'haltet', 'gehalten'],
    ['sehen', ['sehe', 'siehst', 'sieht', 'sehen', 'seht', 'sehen'], ['sah', 'sahst', 'sah', 'sahen', 'saht', 'sahen'],
      ['sehe', 'sehest', 'sehe', 'sehen', 'sehet', 'sehen'], ['sähe', 'sähest', 'sähe', 'sähen', 'sähet', 'sähen'], 'sieh', 'seht', 'gesehen'],
    ['schlafen', ['schlafe', 'schläfst', 'schläft', 'schlafen', 'schlaft', 'schlafen'], ['schlief', 'schliefst', 'schlief', 'schliefen', 'schlieft', 'schliefen'],
      ['schlafe', 'schlafest', 'schlafe', 'schlafen', 'schlafet', 'schlafen'], ['schliefe', 'schliefest', 'schliefe', 'schliefen', 'schliefet', 'schliefen'], 'schlaf', 'schlaft', 'geschlafen'],
    ['stehen', ['stehe', 'stehst', 'steht', 'stehen', 'steht', 'stehen'], ['stand', 'standest', 'stand', 'standen', 'standet', 'standen'],
      ['stehe', 'stehest', 'stehe', 'stehen', 'stehet', 'stehen'], ['stünde', 'stündest', 'stünde', 'stünden', 'stündet', 'stünden'], 'steh', 'steht', 'gestanden'],
    ['verstehen', ['verstehe', 'verstehst', 'versteht', 'verstehen', 'versteht', 'verstehen'], ['verstand', 'verstandest', 'verstand', 'verstanden', 'verstandet', 'verstanden'],
      ['verstehe', 'verstehest', 'verstehe', 'verstehen', 'verstehet', 'verstehen'], ['verstünde', 'verstündest', 'verstünde', 'verstünden', 'verstündet', 'verstünden'], 'versteh', 'versteht', 'verstanden'],
    ['bringen', ['bringe', 'bringst', 'bringt', 'bringen', 'bringt', 'bringen'], ['brachte', 'brachtest', 'brachte', 'brachten', 'brachtet', 'brachten'],
      ['bringe', 'bringest', 'bringe', 'bringen', 'bringet', 'bringen'], ['brächte', 'brächtest', 'brächte', 'brächten', 'brächtet', 'brächten'], 'bring', 'bringt', 'gebracht'],
    ['kennen', ['kenne', 'kennst', 'kennt', 'kennen', 'kennt', 'kennen'], ['kannte', 'kanntest', 'kannte', 'kannten', 'kanntet', 'kannten'],
      ['kenne', 'kennest', 'kenne', 'kennen', 'kennet', 'kennen'], ['kennte', 'kenntest', 'kennte', 'kennten', 'kenntet', 'kennten'], 'kenn', 'kennt', 'gekannt'],
  ];
  it.each(rows)('%s: present, preterite, Konjunktiv I and II, imperative, participle', (lemma, pres, pret, subj1, subj2, imp2s, imp2p, part) => {
    const v = V(lemma);
    expect(six(v, 'pres')).toEqual(pres);
    expect(six(v, 'pret')).toEqual(pret);
    expect(six(v, 'subj1')).toEqual(subj1);
    expect(six(v, 'subj2')).toEqual(subj2);
    const f = conjugateGerman(v).forms;
    expect([f['imp.2s'], f['imp.2p'], f['part.past'], f.inf, f['part.pres']]).toEqual([imp2s, imp2p, part, lemma, `${lemma}d`]);
  });

  it('uses the listed Konjunktiv II exceptions', () => {
    const k2 = (pret: string, lemma = 'x') => six(strong(lemma, 'x', pret, 'x'), 'subj2')[0];
    expect([k2('half'), k2('starb'), k2('warf'), k2('begann'), k2('stand')]).toEqual(['hülfe', 'stürbe', 'würfe', 'begönne', 'stünde']);
  });
});

describe('separable verbs', () => {
  it('aufstehen: forms written together, split, participle and zu-infinitive', () => {
    const c = conjugateGerman(V('aufstehen'));
    expect(six(V('aufstehen'), 'pres')).toEqual(['aufstehe', 'aufstehst', 'aufsteht', 'aufstehen', 'aufsteht', 'aufstehen']);
    expect(six(V('aufstehen'), 'pret')).toEqual(['aufstand', 'aufstandest', 'aufstand', 'aufstanden', 'aufstandet', 'aufstanden']);
    expect(six(V('aufstehen'), 'subj2')[0]).toBe('aufstünde');
    expect([c.forms.inf, c.forms['inf.zu'], c.forms['part.past'], c.forms['part.pres']]).toEqual(['aufstehen', 'aufzustehen', 'aufgestanden', 'aufstehend']);
    expect(c.split!['pres.3s']).toEqual(['steht', 'auf']);
    expect(c.split!['pret.3s']).toEqual(['stand', 'auf']);
    expect(c.split!['imp.2s']).toEqual(['steh', 'auf']);
    expect(c.split!['subj1.3s']).toEqual(['stehe', 'auf']);
  });

  it('anfangen, anrufen (strong) and einkaufen (weak)', () => {
    const fang = conjugateGerman(V('anfangen'));
    expect([fang.forms['pres.2s'], fang.forms['pres.3s'], fang.forms['pret.1s'], fang.forms['part.past'], fang.forms['inf.zu']]).toEqual(['anfängst', 'anfängt', 'anfing', 'angefangen', 'anzufangen']);
    expect(fang.split!['pres.3s']).toEqual(['fängt', 'an']);
    expect(fang.split!['imp.2s']).toEqual(['fang', 'an']);
    const ruf = conjugateGerman(V('anrufen'));
    expect([ruf.forms['pres.3s'], ruf.forms['pret.3s'], ruf.forms['part.past']]).toEqual(['anruft', 'anrief', 'angerufen']);
    const kauf = conjugateGerman(V('einkaufen'));
    expect([kauf.forms['pres.3s'], kauf.forms['pret.3s'], kauf.forms['part.past'], kauf.forms['inf.zu']]).toEqual(['einkauft', 'einkaufte', 'eingekauft', 'einzukaufen']);
    expect(kauf.split!['pret.3s']).toEqual(['kaufte', 'ein']);
  });

  it('um|fahren (separable) differs from umfahren (inseparable)', () => {
    const sep = conjugateGerman(V('umfahren', 'um'));
    expect([sep.forms['pres.3s'], sep.forms['pret.3s'], sep.forms['part.past'], sep.forms['inf.zu']]).toEqual(['umfährt', 'umfuhr', 'umgefahren', 'umzufahren']);
    expect(sep.split!['pres.3s']).toEqual(['fährt', 'um']);
    const insep = conjugateGerman(V('umfahren'));
    expect([insep.forms['pres.3s'], insep.forms['pret.3s'], insep.forms['part.past'], insep.forms['inf.zu']]).toEqual(['umfährt', 'umfuhr', 'umfahren', 'zu umfahren']);
    expect(insep.split).toBeUndefined();
    expect(six(V('umfahren'), 'subj2')[0]).toBe('umführe');
  });
});

describe('irregular verbs', () => {
  const rows: Array<[string, string[], string[], string[], string[], string[]]> = [
    ['sein', ['bin', 'bist', 'ist', 'sind', 'seid', 'sind'], ['war', 'warst', 'war', 'waren', 'wart', 'waren'], ['sei', 'seiest', 'sei', 'seien', 'seiet', 'seien'],
      ['wäre', 'wärest', 'wäre', 'wären', 'wäret', 'wären'], ['sei', 'seid', 'gewesen', 'seiend']],
    ['haben', ['habe', 'hast', 'hat', 'haben', 'habt', 'haben'], ['hatte', 'hattest', 'hatte', 'hatten', 'hattet', 'hatten'], ['habe', 'habest', 'habe', 'haben', 'habet', 'haben'],
      ['hätte', 'hättest', 'hätte', 'hätten', 'hättet', 'hätten'], ['hab', 'habt', 'gehabt', 'habend']],
    ['werden', ['werde', 'wirst', 'wird', 'werden', 'werdet', 'werden'], ['wurde', 'wurdest', 'wurde', 'wurden', 'wurdet', 'wurden'], ['werde', 'werdest', 'werde', 'werden', 'werdet', 'werden'],
      ['würde', 'würdest', 'würde', 'würden', 'würdet', 'würden'], ['werde', 'werdet', 'geworden', 'werdend']],
    ['wissen', ['weiß', 'weißt', 'weiß', 'wissen', 'wisst', 'wissen'], ['wusste', 'wusstest', 'wusste', 'wussten', 'wusstet', 'wussten'], ['wisse', 'wissest', 'wisse', 'wissen', 'wisset', 'wissen'],
      ['wüsste', 'wüsstest', 'wüsste', 'wüssten', 'wüsstet', 'wüssten'], ['wisse', 'wisst', 'gewusst', 'wissend']],
    ['tun', ['tue', 'tust', 'tut', 'tun', 'tut', 'tun'], ['tat', 'tatst', 'tat', 'taten', 'tatet', 'taten'], ['tue', 'tuest', 'tue', 'tuen', 'tuet', 'tuen'],
      ['täte', 'tätest', 'täte', 'täten', 'tätet', 'täten'], ['tu', 'tut', 'getan', 'tuend']],
  ];
  it.each(rows)('%s', (lemma, pres, pret, subj1, subj2, rest) => {
    const v = V(lemma);
    expect(six(v, 'pres')).toEqual(pres);
    expect(six(v, 'pret')).toEqual(pret);
    expect(six(v, 'subj1')).toEqual(subj1);
    expect(six(v, 'subj2')).toEqual(subj2);
    const f = conjugateGerman(v).forms;
    expect([f['imp.2s'], f['imp.2p'], f['part.past'], f['part.pres']]).toEqual(rest);
    expect(f.inf).toBe(lemma);
  });

  const modals: Array<[string, string[], string[], string[], string]> = [
    ['können', ['kann', 'kannst', 'kann', 'können', 'könnt', 'können'], ['konnte', 'konntest', 'konnte', 'konnten', 'konntet', 'konnten'], ['könnte', 'könntest', 'könnte', 'könnten', 'könntet', 'könnten'], 'gekonnt'],
    ['müssen', ['muss', 'musst', 'muss', 'müssen', 'müsst', 'müssen'], ['musste', 'musstest', 'musste', 'mussten', 'musstet', 'mussten'], ['müsste', 'müsstest', 'müsste', 'müssten', 'müsstet', 'müssten'], 'gemusst'],
    ['dürfen', ['darf', 'darfst', 'darf', 'dürfen', 'dürft', 'dürfen'], ['durfte', 'durftest', 'durfte', 'durften', 'durftet', 'durften'], ['dürfte', 'dürftest', 'dürfte', 'dürften', 'dürftet', 'dürften'], 'gedurft'],
    ['sollen', ['soll', 'sollst', 'soll', 'sollen', 'sollt', 'sollen'], ['sollte', 'solltest', 'sollte', 'sollten', 'solltet', 'sollten'], ['sollte', 'solltest', 'sollte', 'sollten', 'solltet', 'sollten'], 'gesollt'],
    ['wollen', ['will', 'willst', 'will', 'wollen', 'wollt', 'wollen'], ['wollte', 'wolltest', 'wollte', 'wollten', 'wolltet', 'wollten'], ['wollte', 'wolltest', 'wollte', 'wollten', 'wolltet', 'wollten'], 'gewollt'],
    ['mögen', ['mag', 'magst', 'mag', 'mögen', 'mögt', 'mögen'], ['mochte', 'mochtest', 'mochte', 'mochten', 'mochtet', 'mochten'], ['möchte', 'möchtest', 'möchte', 'möchten', 'möchtet', 'möchten'], 'gemocht'],
  ];
  it.each(modals)('modal verb %s', (lemma, pres, pret, subj2, part) => {
    const v = V(lemma);
    expect(six(v, 'pres')).toEqual(pres);
    expect(six(v, 'pret')).toEqual(pret);
    expect(six(v, 'subj2')).toEqual(subj2);
    const f = conjugateGerman(v).forms;
    expect(f['part.past']).toBe(part);
    expect(f['imp.2s']).toBeUndefined(); // a modal verb has no imperative
  });

  it('conjugates a separable compound of an irregular verb from its table', () => {
    const c = conjugateGerman(verb({ lemma: 'wehtun', cls: 'irregular', prefix: 'weh', base: 'tun' }));
    expect([c.forms['pres.3s'], c.forms['pret.3s'], c.forms['part.past'], c.forms['inf.zu']]).toEqual(['wehtut', 'wehtat', 'wehgetan', 'wehzutun']);
    expect(c.split!['pres.3s']).toEqual(['tut', 'weh']);
    expect(conjugateGerman(verb({ lemma: 'vertun', cls: 'irregular' })).forms['part.past']).toBe('vertan');
  });
});

describe('analysis: nouns', () => {
  it('Männern: dative plural of Mann, with its rule and gloss', () => {
    const rs = an('Männern');
    expect(rs).toHaveLength(1);
    const r = rs[0];
    expect([r.lemma, r.pos, r.lemmaKnown]).toEqual(['Mann', 'NOUN', true]);
    expect(r.morph).toEqual({ Case: 'Dat', Number: 'Plur' });
    expect(r.cells).toEqual([{ c: 'D', g: 'p' }]);
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
    expect(r.confidence).toBeLessThanOrEqual(0.92);
    expect(r.gloss).toBe('mann');
    expect(r.rule).toMatch(/dative plural/);
    expect(r.rule).toMatch(/capital/);
  });

  it('Herzen: dative singular (irregular) and the plural in every case', () => {
    const rs = an('Herzen');
    expect(rs.map(sig)).toEqual([
      'Herz|NOUN|Case=Dat,Gender=Neut,Number=Sing',
      'Herz|NOUN|Case=Nom,Acc,Dat,Gen,Number=Plur',
    ]);
    expect(an('Herz').map(sig)).toEqual(['Herz|NOUN|Case=Nom,Acc,Gender=Neut,Number=Sing']);
    expect(an('Herzens').map(sig)).toEqual(['Herz|NOUN|Case=Gen,Gender=Neut,Number=Sing']);
  });

  it('Studenten: several readings of one weak noun', () => {
    const rs = an('Studenten');
    expect(rs.map(sig)).toEqual([
      'Student|NOUN|Case=Acc,Dat,Gen,Gender=Masc,Number=Sing',
      'Student|NOUN|Case=Nom,Acc,Dat,Gen,Number=Plur',
    ]);
    expect(rs[0].rule).toMatch(/weak/);
    expect(rs[0].cells).toHaveLength(3);
    expect(rs[1].cells).toHaveLength(4);
  });

  it('a lower-case surface gets no noun reading; a capitalised one gets the noun and the lower-case readings', () => {
    expect(an('mann').filter((r) => r.lemmaKnown)).toEqual([]);
    expect(an('männern')).toEqual([]);
    const mann = an('Mann');
    expect(mann[0].lemma).toBe('Mann');
    expect(mann[0].morph).toEqual({ Case: 'Nom,Acc,Dat', Gender: 'Masc', Number: 'Sing' });
    const gehen = an('Gehen');
    expect(gehen.some((r) => r.pos === 'NOUN')).toBe(false);
    const inf = find(gehen, (r) => r.lemma === 'gehen' && r.morph.VerbForm === 'Inf');
    expect(inf.rule).toMatch(/first word of a sentence/);
    // the same word in lower case: same verb readings, no capital note
    expect(find(an('gehen'), (r) => r.morph.VerbForm === 'Inf').rule).not.toMatch(/capital/);
    expect(an('MANN')[0].lemma).toBe('Mann');
  });

  it('reports the older dative singular as literary, and says both when it is also the plural', () => {
    const manne = an('Manne');
    expect(manne).toHaveLength(1);
    expect(manne[0].morph).toEqual({ Case: 'Dat', Gender: 'Masc', Number: 'Sing' });
    expect(manne[0].register).toEqual(['literary']);
    expect(manne[0].rule).toMatch(/older dative/);
    const tage = an('Tage');
    expect(tage).toHaveLength(2);
    expect(tage[0].register).toBeUndefined();
    expect(tage[0].morph).toEqual({ Case: 'Nom,Acc,Gen', Number: 'Plur' });
    expect(tage[1].register).toEqual(['literary']);
    expect(tage[1].rule).toMatch(/older dative/);
    expect(tage[1].rule).toMatch(/also/);
  });

  it('plural-only and adjectival nouns', () => {
    expect(an('Eltern').map(sig)).toEqual(['Eltern|NOUN|Case=Nom,Acc,Dat,Gen,Number=Plur']);
    const d = an('Deutscher');
    expect(d[0].morph).toEqual({ Case: 'Nom', Gender: 'Masc', Number: 'Sing', Decl: 'Strong,Mixed' });
    expect(d[1].morph).toEqual({ Case: 'Gen', Number: 'Plur', Decl: 'Strong' });
    expect(an('Deutschen')[0].lemma).toBe('Deutsche');
  });
});

describe('analysis: adjectives', () => {
  it('guten: every possibility, in one reading', () => {
    const rs = an('guten');
    const r = find(rs, (x) => x.lemma === 'gut' && !x.morph.Degree);
    expect(r.pos).toBe('ADJ');
    expect(r.morph).toEqual({ Case: 'Nom,Acc,Dat,Gen', Gender: 'Masc,Fem,Neut', Number: 'Sing,Plur', Decl: 'Strong,Weak,Mixed' });
    expect(r.cells).toHaveLength(26);
    expect(r.cells!.some((c) => c.c === 'A' && c.g === 'm' && c.decl === 'wk')).toBe(true);
    expect(r.cells!.some((c) => c.c === 'N' && c.g === 'm')).toBe(false); // there is no nominative masculine in -en
    expect(rs.filter((x) => x.lemma === 'gut')).toHaveLength(1);
  });

  it('gutem is dative masculine or neuter singular, strong', () => {
    const r = an('gutem')[0];
    expect(r.morph).toEqual({ Case: 'Dat', Gender: 'Masc,Neut', Number: 'Sing', Decl: 'Strong' });
    expect(describeGermanMorph(r.morph)).toBe('masculine or neuter dative singular; strong declension (no article)');
  });

  it('bessere is a comparative form of gut, in the -e cells of all three declensions', () => {
    const r = an('bessere')[0];
    expect(r.lemma).toBe('gut');
    expect(r.morph.Degree).toBe('Cmp');
    expect(r.morph.Decl).toBe('Strong,Weak,Mixed');
    expect(r.cells!.every((c) => (c.c === 'N' || c.c === 'A'))).toBe(true);
    expect(an('beste')[0].morph.Degree).toBe('Sup');
    expect(an('älteren')[0]).toMatchObject({ lemma: 'alt', morph: expect.objectContaining({ Degree: 'Cmp' }) });
  });

  it('gives the uninflected form as its own reading with no cells', () => {
    const r = find(an('gut'), (x) => x.lemma === 'gut' && x.pos === 'ADJ');
    expect(r.cells).toBeUndefined();
    expect(r.morph).toEqual({});
    expect(r.rule).toMatch(/uninflected: predicative or adverbial/);
    const cmp = an('besser')[0];
    expect(cmp.morph).toEqual({ Degree: 'Cmp' });
    expect(cmp.cells).toBeUndefined();
  });

  it('keeps two degrees apart when a form belongs to both (dunkler: comparative, and positive masculine nominative)', () => {
    const rs = an('dunkler').filter((x) => x.lemma === 'dunkel');
    expect(rs.map((r) => r.morph.Degree ?? 'pos').sort()).toEqual(['Cmp', 'pos']);
  });

  it('an indeclinable adjective is one reading that fills every cell', () => {
    const r = an('rosa')[0];
    expect(r.lemma).toBe('rosa');
    expect(r.cells).toHaveLength(48);
    expect(r.rule).toMatch(/indeclinable/);
  });

  it('participles of lexicon verbs inflected like adjectives', () => {
    const sl = find(an('schlafende'), (r) => r.lemma === 'schlafen');
    expect([sl.pos, sl.morph.VerbForm, sl.morph.Tense]).toEqual(['VERB', 'Part', 'Pres']);
    expect(sl.cells!.length).toBeGreaterThan(5);
    expect(sl.morph.Decl).toBeDefined();
    const gl = find(an('gelesene'), (r) => r.lemma === 'lesen');
    expect([gl.morph.VerbForm, gl.morph.Tense]).toEqual(['Part', 'Past']);
    expect(gl.rule).toMatch(/like an adjective/);
    const au = find(an('aufgestandene'), (r) => r.lemma === 'aufstehen');
    expect(au.prefix).toEqual({ text: 'auf', attached: true });
  });
});

describe('analysis: verbs', () => {
  it('united persons: sind, machten, kam, ist', () => {
    expect(an('sind').map(sig)).toEqual(['sein|VERB|VerbForm=Fin,Mood=Ind,Tense=Pres,Person=1,3,Number=Plur']);
    expect(an('ist')[0].morph).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' });
    expect(an('machten').map(sig)).toEqual([
      'machen|VERB|VerbForm=Fin,Mood=Ind,Tense=Past,Person=1,3,Number=Plur',
      'machen|VERB|VerbForm=Fin,Mood=Sub,Tense=Past,Person=1,3,Number=Plur',
    ]);
    expect(an('kam').map(sig)).toEqual(['kommen|VERB|VerbForm=Fin,Mood=Ind,Tense=Past,Person=1,3,Number=Sing']);
    expect(an('käme').map(sig)).toEqual(['kommen|VERB|VerbForm=Fin,Mood=Sub,Tense=Past,Person=1,3,Number=Sing']);
    expect(an('gehen').map(sig).sort()).toEqual([
      'gehen|VERB|VerbForm=Fin,Mood=Ind,Tense=Pres,Person=1,3,Number=Plur',
      'gehen|VERB|VerbForm=Fin,Mood=Sub,Tense=Pres,Person=1,3,Number=Plur',
      'gehen|VERB|VerbForm=Inf',
    ]);
  });

  it('every verb reading has a rule, a gloss and the confidence of a listed word', () => {
    for (const s of ['steht', 'aufsteht', 'fährt', 'wurde', 'gearbeitet', 'sammle', 'gib']) {
      for (const r of an(s)) {
        expect(r.rule.length, s).toBeGreaterThan(10);
        expect(r.gloss, s).toBeDefined();
        expect(r.lemmaKnown, s).toBe(true);
        expect(r.confidence, s).toBeGreaterThanOrEqual(0.8);
        expect(r.confidence, s).toBeLessThanOrEqual(0.92);
      }
    }
  });

  it('steht: stehen first, then the detached readings of aufstehen with attached false', () => {
    const rs = an('steht');
    const own = rs.filter((r) => r.lemma === 'stehen');
    expect(own.map((r) => r.morph.Person + r.morph.Number + (r.morph.Mood ?? ''))).toEqual(expect.arrayContaining(['3SingInd', '2PlurInd', '2PlurImp']));
    const detached = rs.filter((r) => r.lemma === 'aufstehen');
    expect(detached.length).toBe(own.length);
    for (const r of detached) expect(r.prefix).toEqual({ text: 'auf', attached: false });
    expect(rs.findIndex((r) => r.lemma === 'aufstehen')).toBeGreaterThan(rs.map((r) => r.lemma).lastIndexOf('stehen'));
    for (const r of own) expect(r.prefix).toBeUndefined();
    expect(detached[0].rule).toMatch(/standing apart/);
  });

  it('aufsteht: aufstehen attached, with its prefix as a part', () => {
    const rs = an('aufsteht');
    expect(rs.every((r) => r.lemma === 'aufstehen' && r.prefix?.attached === true)).toBe(true);
    expect(rs.map((r) => `${r.morph.Person}${r.morph.Number}`).sort()).toEqual(['2Plur', '3Sing']);
    expect(rs[0].parts).toEqual([
      { text: 'auf', start: 0, end: 3, kind: 'prefix', role: 'separable prefix' },
      { text: 'steht', start: 3, end: 8, kind: 'stem' },
    ]);
  });

  it('aufgestanden and aufzustehen: parts with prefix, marker and stem', () => {
    const p = an('aufgestanden');
    expect(p).toHaveLength(1);
    expect(p[0].morph).toEqual({ VerbForm: 'Part', Tense: 'Past' });
    expect(p[0].parts!.map((x) => [x.text, x.kind])).toEqual([['auf', 'prefix'], ['ge', 'marker'], ['standen', 'stem']]);
    expect(p[0].prefix).toEqual({ text: 'auf', attached: true });
    const z = an('aufzustehen');
    expect(z).toHaveLength(1);
    expect(z[0].morph).toEqual({ VerbForm: 'Inf' });
    expect(z[0].parts!.map((x) => [x.text, x.kind])).toEqual([['auf', 'prefix'], ['zu', 'marker'], ['stehen', 'stem']]);
    expect(z[0].parts!.map((x) => [x.start, x.end])).toEqual([[0, 3], [3, 5], [5, 11]]);
  });

  it('angefangen and anzufangen', () => {
    const p = find(an('angefangen'), (r) => r.lemma === 'anfangen');
    expect(p.morph).toEqual({ VerbForm: 'Part', Tense: 'Past' });
    expect(p.parts!.map((x) => x.text)).toEqual(['an', 'ge', 'fangen']);
    const z = an('anzufangen')[0];
    expect([z.lemma, z.morph.VerbForm]).toEqual(['anfangen', 'Inf']);
    expect(z.parts!.map((x) => [x.text, x.kind])).toEqual([['an', 'prefix'], ['zu', 'marker'], ['fangen', 'stem']]);
    expect(an('anfängt')[0].parts![1]).toMatchObject({ text: 'fängt', kind: 'stem' });
  });

  it('verstanden is both the participle and the preterite plural of verstehen, with no prefix', () => {
    const rs = an('verstanden');
    expect(rs.map(sig).sort()).toEqual([
      'verstehen|VERB|VerbForm=Fin,Mood=Ind,Tense=Past,Person=1,3,Number=Plur',
      'verstehen|VERB|VerbForm=Part,Tense=Past',
    ]);
    expect(rs.every((r) => r.prefix === undefined && r.parts === undefined)).toBe(true);
  });

  it('umfährt is the inseparable verb and also um|fahren attached; fährt gives fahren first, then um|fahren detached', () => {
    const rs = an('umfährt');
    expect(rs).toHaveLength(2);
    expect(rs.filter((r) => r.prefix === undefined)).toHaveLength(1);
    expect(rs.filter((r) => r.prefix?.attached === true)).toHaveLength(1);
    const f = an('fährt');
    expect(f[0].lemma).toBe('fahren');
    const um = f.filter((r) => r.lemma === 'umfahren');
    expect(um.length).toBeGreaterThan(0);
    expect(um.every((r) => r.prefix?.text === 'um' && r.prefix.attached === false)).toBe(true);
    expect(f.findIndex((r) => r.lemma === 'umfahren')).toBeGreaterThan(f.map((r) => r.lemma).lastIndexOf('fahren'));
  });

  it('umgefahren is the separable participle; umfahren the inseparable one and both infinitives', () => {
    const g = an('umgefahren');
    expect(g).toHaveLength(1);
    expect(g[0].prefix).toEqual({ text: 'um', attached: true });
    expect(g[0].parts!.map((x) => x.text)).toEqual(['um', 'ge', 'fahren']);
    const u = an('umfahren');
    const part = u.filter((r) => r.morph.VerbForm === 'Part');
    expect(part).toHaveLength(1);
    expect(part[0].prefix).toBeUndefined();
    expect(u.some((r) => r.morph.VerbForm === 'Inf' && r.prefix?.attached === true)).toBe(true);
    expect(u.some((r) => r.morph.VerbForm === 'Inf' && r.prefix === undefined)).toBe(true);
  });

  it('forms alike in several persons, imperatives, older and modal forms', () => {
    expect(an('arbeitet').map((r) => `${r.morph.Person}${r.morph.Number}${r.morph.Mood}`).sort()).toEqual(['2PlurImp', '2PlurInd', '2PlurSub', '3SingInd']);
    expect(an('gearbeitet')[0].morph).toEqual({ VerbForm: 'Part', Tense: 'Past' });
    expect(an('gib')[0]).toMatchObject({ lemma: 'geben', morph: { Mood: 'Imp', Person: '2', Number: 'Sing' } });
    expect(an('wurde').map(sig)).toEqual(['werden|VERB|VerbForm=Fin,Mood=Ind,Tense=Past,Person=1,3,Number=Sing']);
    expect(an('würde')[0].morph.Mood).toBe('Sub');
    const ward = an('ward');
    expect(ward[0].lemma).toBe('werden');
    expect(ward[0].register).toEqual(['literary']);
    expect(an('worden')[0].morph).toEqual({ VerbForm: 'Part', Tense: 'Past' });
    expect(an('möchte')[0]).toMatchObject({ lemma: 'mögen', morph: { Mood: 'Sub', Tense: 'Past' } });
  });
});

describe('analysis: closed classes', () => {
  it('im, zum, zur: the preposition and the article, with offsets', () => {
    const im = an('im');
    expect(im).toHaveLength(1);
    expect([im[0].lemma, im[0].pos]).toEqual(['in', 'ADP']);
    expect(im[0].cells).toEqual([{ c: 'D', g: 'm' }]);
    expect(im[0].parts).toEqual([
      { text: 'i', start: 0, end: 1, lemma: 'in', pos: 'ADP', kind: 'contracted' },
      { text: 'm', start: 1, end: 2, lemma: 'der', pos: 'DET', morph: { Case: 'Dat', Gender: 'Masc', Number: 'Sing', PronType: 'Art', Definite: 'Def' }, kind: 'contracted' },
    ]);
    expect(an('zum')[0].parts!.map((p) => p.text)).toEqual(['zu', 'm']);
    expect(an('zur')[0].parts!.map((p) => p.text)).toEqual(['zu', 'r']);
    expect(an('Zum')[0].parts!.map((p) => p.text)).toEqual(['Zu', 'm']);
  });

  it('articles with their cells and features; plain words', () => {
    const die = an('die');
    expect(die[0]).toMatchObject({ lemma: 'der', pos: 'DET', lemmaKnown: true });
    expect(die[0].morph).toEqual({ Case: 'Nom,Acc', Gender: 'Fem', Number: 'Sing,Plur', PronType: 'Art', Definite: 'Def' });
    expect(die[0].cells).toHaveLength(4);
    expect(an('Die')[0].rule).toMatch(/capital/);
    expect(an('und')[0]).toMatchObject({ lemma: 'und', pos: 'CONJ', gloss: 'and' });
  });
});

describe('analysis: words the lexicon does not hold', () => {
  const guessOk = (rs: DeReading[]) => {
    expect(rs.length).toBeGreaterThan(0);
    expect(rs.length).toBeLessThanOrEqual(4);
    for (const r of rs) {
      expect(r.lemmaKnown).toBe(false);
      expect(r.confidence).toBeLessThanOrEqual(0.6);
      expect(r.gloss).toBeUndefined();
      expect(r.rule).toMatch(/guess/);
    }
    expect(rs.map((r) => r.confidence)).toEqual([...rs.map((r) => r.confidence)].sort((a, b) => b - a));
  };

  it('Blumenvase: a noun with the word itself as lemma and no gender or number claimed', () => {
    const rs = an('Blumenvase');
    guessOk(rs);
    expect(rs[0]).toMatchObject({ lemma: 'Blumenvase', pos: 'NOUN' });
    expect(rs[0].morph).toEqual({ Case: 'Nom,Acc,Dat,Gen' });
    // an ending is removed only where three or more letters stay
    expect(an('Ratten').some((r) => r.lemma === 'Ratt' || r.lemma === 'Ratte')).toBe(true);
    expect(an('Abes').every((r) => r.lemma !== 'Ab')).toBe(true);
  });

  it('blorfte, blorfen, schnurzige: weak verb and adjective guesses, never a strong verb', () => {
    const a = an('blorfte');
    guessOk(a);
    expect(a[0]).toMatchObject({ lemma: 'blorfen', pos: 'VERB' });
    expect(a[0].morph).toMatchObject({ Tense: 'Past', Person: '1,3', Number: 'Sing' });
    const b = an('blorfen');
    guessOk(b);
    expect(b[0]).toMatchObject({ lemma: 'blorfen', pos: 'VERB', morph: { VerbForm: 'Inf' } });
    const c = an('schnurzige');
    guessOk(c);
    expect(c[0]).toMatchObject({ lemma: 'schnurzig', pos: 'ADJ' });
    expect(c[0].cells!.every((x) => x.c === 'N' || x.c === 'A')).toBe(true);
    const d = an('geblorft');
    guessOk(d);
    expect(d[0]).toMatchObject({ lemma: 'blorfen', morph: { VerbForm: 'Part', Tense: 'Past' } });
    for (const s of ['blorfte', 'blorfen', 'schnurzige', 'geblorft', 'Blumenvase']) expect(an(s).every((r) => r.pos !== 'VERB' || /weak verb/.test(r.rule))).toBe(true);
  });

  it('takes the inserted e out of the stem, and guesses a capitalised word as a noun only', () => {
    expect(an('arbeitetet')[0]).toMatchObject({ lemma: 'arbeiten', pos: 'VERB', morph: { Tense: 'Past', Person: '2', Number: 'Plur' } });
    expect(an('Blumenvase').every((r) => r.pos === 'NOUN')).toBe(true);
    expect(an('Hunde').map((r) => r.lemma)).toEqual(['Hunde', 'Hund']);
    expect(an('Hunde')[1].morph).toEqual({ Case: 'Nom,Acc,Gen', Number: 'Plur' });
  });

  it('says nothing about what is not a plain word', () => {
    expect(an('')).toEqual([]);
    expect(an('ab3d')).toEqual([]);
    expect(an('xyz')).toEqual([]);
  });
});

describe('describeGermanMorph', () => {
  const d = describeGermanMorph;
  it('nouns, adjectives and unions', () => {
    expect(d({ Case: 'Dat', Number: 'Plur' })).toBe('dative plural');
    expect(d({ Case: 'Acc', Gender: 'Masc', Number: 'Sing', Decl: 'Weak' })).toBe('masculine accusative singular; weak declension (after der, dieser …)');
    expect(d({ Case: 'Nom,Acc', Number: 'Plur' })).toBe('nominative or accusative plural');
    expect(d({ Case: 'Nom,Acc,Dat,Gen', Gender: 'Masc,Fem,Neut', Number: 'Sing,Plur', Decl: 'Strong,Weak,Mixed' }))
      .toBe('masculine, feminine or neuter nominative, accusative, dative or genitive singular or plural; strong, weak or mixed declension');
    expect(d({ Degree: 'Cmp' })).toBe('comparative');
    expect(d({ Degree: 'Sup' })).toBe('superlative');
    expect(d({ Case: 'Dat', Gender: 'Neut', Number: 'Sing', Decl: 'Mixed' })).toBe('neuter dative singular; mixed declension (after ein, kein, mein …)');
  });
  it('verbs', () => {
    expect(d({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' })).toBe('third person singular, present');
    expect(d({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past', Person: '1,3', Number: 'Sing' })).toBe('first or third person singular, preterite');
    expect(d({ VerbForm: 'Fin', Mood: 'Sub', Tense: 'Past', Person: '3', Number: 'Sing' })).toBe('Konjunktiv II, third person singular');
    expect(d({ VerbForm: 'Fin', Mood: 'Sub', Tense: 'Pres', Person: '1,3', Number: 'Plur' })).toBe('Konjunktiv I, first or third person plural');
    expect(d({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' })).toBe('imperative, second person singular');
    expect(d({ VerbForm: 'Part', Tense: 'Past' })).toBe('past participle');
    expect(d({ VerbForm: 'Part', Tense: 'Pres' })).toBe('present participle');
    expect(d({ VerbForm: 'Inf' })).toBe('infinitive');
    expect(d({})).toBe('');
  });
  it('articles and pronouns', () => {
    expect(d({ PronType: 'Art', Definite: 'Def', Case: 'Nom', Gender: 'Masc', Number: 'Sing' })).toBe('definite article, masculine nominative singular');
    expect(d({ PronType: 'Art', Definite: 'Ind', Case: 'Dat', Gender: 'Fem', Number: 'Sing' })).toBe('indefinite article, feminine dative singular');
  });
});

describe('speed and isolation', () => {
  it('analyses 20,000 mixed forms in well under two seconds once the index is built', () => {
    const surfaces = [
      'Männern', 'Herzen', 'Studenten', 'guten', 'gutem', 'bessere', 'steht', 'aufsteht', 'aufgestanden', 'aufzustehen',
      'verstanden', 'umfährt', 'fährt', 'umgefahren', 'im', 'zum', 'Gehen', 'Mann', 'mann', 'der', 'und', 'schlafende',
      'Blumenvase', 'blorfte', 'schnurzige', 'ist', 'wurde', 'machten', 'Kinder', 'Häusern', 'gearbeitet', 'sammle',
    ];
    an('Mann'); // builds the index
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 20000; i++) n += an(surfaces[i % surfaces.length]).length;
    const ms = performance.now() - t0;
    expect(n).toBeGreaterThan(20000);
    expect(ms).toBeLessThan(1000);
  });

  it('builds a separate index for each lexicon view', () => {
    const tiny: DeLexiconView = { ...lexicon, allNouns: () => [N('Mann')], allVerbs: () => [], allAdjectives: () => [] };
    expect(analyzeGermanForm('Männern', tiny)).toHaveLength(1);
    expect(analyzeGermanForm('machen', tiny).every((r) => !r.lemmaKnown)).toBe(true);
    expect(an('machen')[0].lemmaKnown).toBe(true);
  });

  it('returns copies: changing a reading does not change the next answer', () => {
    const a = an('Männern');
    a[0].morph.Case = 'Gen';
    a[0].cells![0].c = 'G';
    expect(an('Männern')[0].morph.Case).toBe('Dat');
    expect(an('Männern')[0].cells![0].c).toBe('D');
  });
});
