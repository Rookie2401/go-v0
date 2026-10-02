import { describe, expect, it } from 'vitest';
import type { PartOfSpeech } from '../../src/core';
import { describeSqMorph } from '../../src/adapters/albanian/describe';
import { SQ_CLITICS, SQ_CLUSTERS, cliticReadings } from '../../src/adapters/albanian/clitics';
import {
  SQ_FUNCTION_READINGS,
  SQ_FUNCTION_WORDS,
  linkingArticle,
  linkingArticleReadings,
} from '../../src/adapters/albanian/function-words';
import type { SqReading } from '../../src/adapters/albanian/types';

const readingsOf = (form: string): SqReading[] => SQ_FUNCTION_READINGS.get(form) ?? [];
const find = (form: string, lemma: string, pos?: PartOfSpeech): SqReading | undefined =>
  readingsOf(form).find((r) => r.lemma === lemma && (!pos || r.pos === pos));
const keyOf = (r: SqReading): string => `${r.lemma}/${r.pos}`;

// ───────────────────────────── pronouns ─────────────────────────────

describe('personal pronouns, every case form', () => {
  // [form, lemma, person, number, gender, case]
  const PERSONAL: Array<[string, string, string, string, string | undefined, string]> = [
    ['unë', 'unë', '1', 'Sing', undefined, 'Nom'], ['mua', 'unë', '1', 'Sing', undefined, 'Acc,Dat'], ['meje', 'unë', '1', 'Sing', undefined, 'Abl'],
    ['ti', 'ti', '2', 'Sing', undefined, 'Nom'], ['ty', 'ti', '2', 'Sing', undefined, 'Acc,Dat'], ['teje', 'ti', '2', 'Sing', undefined, 'Abl'],
    ['ai', 'ai', '3', 'Sing', 'Masc', 'Nom'], ['ajo', 'ai', '3', 'Sing', 'Fem', 'Nom'], ['atë', 'ai', '3', 'Sing', 'Masc,Fem', 'Acc'],
    ['atij', 'ai', '3', 'Sing', 'Masc', 'Gen,Dat'], ['asaj', 'ai', '3', 'Sing', 'Fem', 'Gen,Dat'],
    ['tij', 'ai', '3', 'Sing', 'Masc', 'Abl'], ['saj', 'ai', '3', 'Sing', 'Fem', 'Abl'],
    ['ata', 'ai', '3', 'Plur', 'Masc', 'Nom,Acc'], ['ato', 'ai', '3', 'Plur', 'Fem', 'Nom,Acc'],
    ['atyre', 'ai', '3', 'Plur', undefined, 'Gen,Dat'], ['tyre', 'ai', '3', 'Plur', undefined, 'Abl'],
    ['ne', 'ne', '1', 'Plur', undefined, 'Nom,Acc'], ['neve', 'ne', '1', 'Plur', undefined, 'Acc,Dat'], ['nesh', 'ne', '1', 'Plur', undefined, 'Abl'],
    ['ju', 'ju', '2', 'Plur', undefined, 'Nom,Acc'], ['juve', 'ju', '2', 'Plur', undefined, 'Acc,Dat'], ['jush', 'ju', '2', 'Plur', undefined, 'Abl'],
  ];
  it.each(PERSONAL)('%s is a form of %s (person %s, %s, gender %s, case %s)', (form, lemma, person, number, gender, cas) => {
    const strong = readingsOf(form).filter((r) => r.lemma === lemma && r.pos === 'PRON' && r.morph.Clitic === undefined);
    expect(strong, form).toHaveLength(1);
    const m = strong[0].morph;
    expect(m).toMatchObject({ PronType: 'Prs', Person: person, Number: number, Case: cas });
    expect(m.Gender).toBe(gender);
    expect(m.VerbForm, 'a pronoun is not a finite verb').toBeUndefined();
  });

  it('the short object forms are the same pronouns marked as clitics', () => {
    const clitics: Array<[string, string, string, string, string]> = [
      ['më', 'unë', '1', 'Sing', 'Acc,Dat'], ['të', 'ti', '2', 'Sing', 'Acc,Dat'], ['na', 'ne', '1', 'Plur', 'Acc,Dat'], ['ju', 'ju', '2', 'Plur', 'Acc,Dat'],
    ];
    for (const [form, lemma, person, number, cas] of clitics) {
      const r = readingsOf(form).find((x) => x.lemma === lemma && x.pos === 'PRON' && x.morph.Clitic === 'Yes');
      expect(r, form).toBeDefined();
      expect(r!.morph).toMatchObject({ PronType: 'Prs', Person: person, Number: number, Case: cas });
    }
    const e = readingsOf('e').find((r) => r.pos === 'PRON')!;
    expect(e.morph).toMatchObject({ Person: '3', Number: 'Sing', Case: 'Acc', Clitic: 'Yes' });
    const i = readingsOf('i').filter((r) => r.pos === 'PRON');
    expect(i.map((r) => `${r.morph.Number}/${r.morph.Case}`)).toEqual(['Sing/Dat', 'Plur/Acc']);
    const u = readingsOf('u').find((r) => r.pos === 'PRON')!;
    expect(u.morph).toMatchObject({ Person: '3', Number: 'Plur', Case: 'Dat', Clitic: 'Yes' });
  });
});

describe('demonstratives', () => {
  // [form, lemma, gender, number, case]
  const DEM: Array<[string, string, string | undefined, string, string]> = [
    ['ky', 'ky', 'Masc', 'Sing', 'Nom'], ['kjo', 'ky', 'Fem', 'Sing', 'Nom'], ['këtë', 'ky', 'Masc,Fem', 'Sing', 'Acc'],
    ['këtij', 'ky', 'Masc', 'Sing', 'Gen,Dat,Abl'], ['kësaj', 'ky', 'Fem', 'Sing', 'Gen,Dat,Abl'],
    ['këta', 'ky', 'Masc', 'Plur', 'Nom,Acc'], ['këto', 'ky', 'Fem', 'Plur', 'Nom,Acc'], ['këtyre', 'ky', undefined, 'Plur', 'Gen,Dat,Abl'],
    ['ai', 'ai', 'Masc', 'Sing', 'Nom'], ['ajo', 'ai', 'Fem', 'Sing', 'Nom'], ['atë', 'ai', 'Masc,Fem', 'Sing', 'Acc'],
    ['atij', 'ai', 'Masc', 'Sing', 'Gen,Dat,Abl'], ['asaj', 'ai', 'Fem', 'Sing', 'Gen,Dat,Abl'],
    ['ata', 'ai', 'Masc', 'Plur', 'Nom,Acc'], ['ato', 'ai', 'Fem', 'Plur', 'Nom,Acc'], ['atyre', 'ai', undefined, 'Plur', 'Gen,Dat,Abl'],
  ];
  it.each(DEM)('%s is the demonstrative %s (%s %s %s)', (form, lemma, gender, number, cas) => {
    const r = find(form, lemma, 'DET');
    expect(r, form).toBeDefined();
    expect(r!.morph).toMatchObject({ PronType: 'Dem', Number: number, Case: cas });
    expect(r!.morph.Gender).toBe(gender);
  });

  it('ai / ajo / ata / ato are TWO readings, the personal pronoun first (documented decision)', () => {
    for (const form of ['ai', 'ajo', 'atë', 'atij', 'asaj', 'ata', 'ato', 'atyre']) {
      const keys = readingsOf(form).map(keyOf);
      expect(keys.slice(0, 2), form).toEqual(['ai/PRON', 'ai/DET']);
    }
    // the ablative personal forms are not demonstrative: tij / saj / tyre are the possessive and the ablative of "ai"
    expect(find('tij', 'ai', 'DET')).toBeUndefined();
  });
});

describe('possessives', () => {
  // [form, lemma, gender, number, case, definite]
  const POSS: Array<[string, string, string | undefined, string | undefined, string | undefined, string | undefined]> = [
    ['im', 'im', 'Masc', 'Sing', 'Nom', undefined], ['ime', 'im', 'Fem', 'Sing', 'Nom', undefined],
    ['tim', 'im', 'Masc', 'Sing', 'Acc,Gen,Dat,Abl', undefined], ['time', 'im', 'Fem', 'Sing', 'Acc,Gen,Dat,Abl', undefined],
    ['mi', 'im', 'Masc', 'Plur', undefined, undefined], ['mia', 'im', 'Fem', 'Plur', undefined, undefined],
    ['imi', 'im', 'Masc', 'Sing', 'Nom', 'Def'], ['imja', 'im', 'Fem', 'Sing', 'Nom', 'Def'],
    ['mitë', 'im', 'Masc', 'Plur', undefined, 'Def'], ['miat', 'im', 'Fem', 'Plur', undefined, 'Def'],
    ['yt', 'yt', 'Masc', 'Sing', 'Nom', undefined], ['jote', 'yt', 'Fem', 'Sing', 'Nom', undefined],
    ['tënd', 'yt', 'Masc', 'Sing', 'Acc,Gen,Dat,Abl', undefined], ['tënde', 'yt', 'Fem', 'Sing', 'Acc,Gen,Dat,Abl', undefined],
    ['tu', 'yt', 'Masc', 'Plur', undefined, undefined], ['tua', 'yt', 'Fem', 'Plur', undefined, undefined],
    ['yti', 'yt', 'Masc', 'Sing', 'Nom', 'Def'], ['jotja', 'yt', 'Fem', 'Sing', 'Nom', 'Def'],
    ['ynë', 'ynë', 'Masc', 'Sing', 'Nom', undefined], ['jonë', 'ynë', 'Fem', 'Sing', 'Nom', undefined],
    ['tonë', 'ynë', undefined, 'Sing', 'Acc,Gen,Dat,Abl', undefined], ['tanë', 'ynë', 'Masc', 'Plur', undefined, undefined],
    ['tona', 'ynë', 'Fem', 'Plur', undefined, undefined],
    ['juaj', 'juaj', undefined, 'Sing', 'Nom', undefined], ['tuaj', 'juaj', undefined, 'Sing', 'Acc,Gen,Dat,Abl', undefined],
    ['tuaja', 'juaj', 'Fem', 'Plur', undefined, undefined],
    ['tij', 'tij', undefined, undefined, undefined, undefined], ['saj', 'saj', undefined, undefined, undefined, undefined],
    ['tyre', 'tyre', undefined, undefined, undefined, undefined],
  ];
  it.each(POSS)('%s is a form of the possessive %s', (form, lemma, gender, number, cas, definite) => {
    const r = find(form, lemma, 'DET');
    expect(r, form).toBeDefined();
    expect(r!.morph.Poss).toBe('Yes');
    expect(r!.morph.Gender).toBe(gender);
    expect(r!.morph.Number).toBe(number);
    expect(r!.morph.Case).toBe(cas);
    expect(r!.morph.Definite).toBe(definite);
    expect(r!.role).toMatch(/agrees/);
  });

  it('tij / saj / tyre are articulated (i tij) and read possessive first, then as the ablative of ai', () => {
    for (const form of ['tij', 'saj', 'tyre']) {
      const r = readingsOf(form);
      expect(r[0].lemma).toBe(form);
      expect(r[0].articulated).toBe(true);
      expect(r[1].lemma).toBe('ai');
      expect(r[1].morph.Case).toBe('Abl');
    }
  });

  it('the plural masculine of "your" (tuaj) is the same written form as the oblique singular: both readings kept', () => {
    const tuaj = readingsOf('tuaj').filter((r) => r.lemma === 'juaj');
    expect(tuaj).toHaveLength(2);
    expect(tuaj.map((r) => r.morph.Number).sort()).toEqual(['Plur', 'Sing']);
  });
});

describe('question words, relatives, indefinites', () => {
  it('kush, çfarë, ç\' and cili', () => {
    expect(find('kush', 'kush')!.morph).toMatchObject({ PronType: 'Int', Case: 'Nom' });
    expect(find('kë', 'kush')!.morph).toMatchObject({ PronType: 'Int', Case: 'Acc' });
    expect(find('kujt', 'kush')!.morph).toMatchObject({ PronType: 'Int', Case: 'Gen,Dat,Abl' });
    expect(find('çfarë', 'çfarë')!.morph.PronType).toBe('Int');
    expect(find("ç'", 'çfarë')!.morph.PronType).toBe('Int');
    const cili: Array<[string, string, string, string]> = [
      ['cili', 'Masc', 'Sing', 'Nom'], ['cila', 'Fem', 'Sing', 'Nom'], ['cilin', 'Masc', 'Sing', 'Acc'], ['cilën', 'Fem', 'Sing', 'Acc'],
      ['cilit', 'Masc', 'Sing', 'Gen,Dat,Abl'], ['cilës', 'Fem', 'Sing', 'Gen,Dat,Abl'],
      ['cilët', 'Masc', 'Plur', 'Nom,Acc'], ['cilat', 'Fem', 'Plur', 'Nom,Acc'], ['cilëve', 'Masc', 'Plur', 'Gen,Dat,Abl'], ['cilave', 'Fem', 'Plur', 'Gen,Dat,Abl'],
    ];
    for (const [form, gender, number, cas] of cili) {
      const r = find(form, 'cili', 'PRON')!;
      expect(r.morph, form).toMatchObject({ PronType: 'Int,Rel', Gender: gender, Number: number, Case: cas });
    }
    // the relative "i cili" is the linking article + cili: the role says so, the lexeme is not itself articulated
    expect(find('cili', 'cili')!.role).toMatch(/i cili/);
  });

  it('sa, ku, kur, si, pse, që', () => {
    for (const [form, pos] of [['sa', 'ADV'], ['ku', 'ADV'], ['kur', 'ADV'], ['si', 'ADV'], ['pse', 'ADV']] as Array<[string, PartOfSpeech]>) {
      expect(find(form, form, pos)!.morph.PronType, form).toMatch(/Int/);
    }
    expect(find('që', 'që', 'PRON')!.morph.PronType).toBe('Rel');
    expect(find('që', 'që', 'SCONJ')).toBeDefined();
    expect(readingsOf('pse')).toHaveLength(1);
  });

  it('indefinites, negatives and quantifiers', () => {
    const IND: Array<[string, PartOfSpeech, string]> = [
      ['disa', 'DET', 'Ind'], ['shumë', 'DET', 'Ind'], ['pak', 'DET', 'Ind'], ['çdo', 'DET', 'Ind'], ['secili', 'PRON', 'Ind'],
      ['gjithë', 'DET', 'Ind'], ['dikush', 'PRON', 'Ind'], ['diçka', 'PRON', 'Ind'], ['tjetër', 'DET', 'Ind'], ['njëri', 'PRON', 'Ind'],
      ['asnjë', 'DET', 'Neg'], ['askush', 'PRON', 'Neg'], ['asgjë', 'PRON', 'Neg'],
    ];
    for (const [form, pos, type] of IND) {
      const r = find(form, form, pos);
      expect(r, form).toBeDefined();
      expect(r!.morph.PronType, form).toBe(type);
    }
    expect(find('vetë', 'vetë', 'PRON')!.role).toMatch(/emphatic/);
    expect(find('shumë', 'shumë', 'ADV')).toBeDefined();
    expect(find('pak', 'pak', 'ADV')).toBeDefined();
    expect(find('një', 'një', 'DET')!.morph.Definite).toBe('Ind');
    expect(find('gjitha', 'gjithë')!.morph).toMatchObject({ Gender: 'Fem', Number: 'Plur' });
  });
});

describe('numerals and ordinals', () => {
  const CARDINALS = [
    'zero', 'një', 'dy', 'tre', 'katër', 'pesë', 'gjashtë', 'shtatë', 'tetë', 'nëntë', 'dhjetë', 'njëmbëdhjetë', 'dymbëdhjetë', 'trembëdhjetë',
    'katërmbëdhjetë', 'pesëmbëdhjetë', 'gjashtëmbëdhjetë', 'shtatëmbëdhjetë', 'tetëmbëdhjetë', 'nëntëmbëdhjetë', 'njëzet',
    'tridhjetë', 'dyzet', 'pesëdhjetë', 'gjashtëdhjetë', 'shtatëdhjetë', 'tetëdhjetë', 'nëntëdhjetë', 'njëqind', 'mijë',
  ];
  it.each(CARDINALS)('%s is a numeral', (form) => {
    expect(find(form, form, 'NUM'), form).toBeDefined();
  });

  it('tre is masculine, tri the feminine', () => {
    expect(find('tre', 'tre', 'NUM')!.morph.Gender).toBe('Masc');
    expect(find('tri', 'tre', 'NUM')!.morph.Gender).toBe('Fem');
  });

  it('ordinals are articulated adjectives (i parë, e parë, të parë, të para)', () => {
    for (const o of ['parë', 'dytë', 'tretë', 'katërt', 'pestë', 'gjashtë', 'shtatë', 'tetë', 'nëntë', 'dhjetë']) {
      const r = find(o, o, 'ADJ');
      expect(r, o).toBeDefined();
      expect(r!.articulated, o).toBe(true);
      expect(r!.role).toMatch(/ordinal/);
    }
    expect(find('para', 'parë', 'ADJ')!.morph).toMatchObject({ Gender: 'Fem', Number: 'Plur' });
  });

  it('gjashtë, shtatë, tetë, nëntë, dhjetë are numeral AND ordinal: both kept, numeral first', () => {
    for (const f of ['gjashtë', 'shtatë', 'tetë', 'nëntë', 'dhjetë']) {
      expect(readingsOf(f).map(keyOf)).toEqual([`${f}/NUM`, `${f}/ADJ`]);
    }
  });
});

// ───────────────────────────── prepositions, conjunctions, particles ─────────────────────────────

describe('prepositions govern a case', () => {
  const GOVERNS: Record<string, 'Nom' | 'Acc' | 'Abl'> = {
    nga: 'Nom', te: 'Nom', tek: 'Nom',
    'në': 'Acc', me: 'Acc', 'për': 'Acc', pa: 'Acc', mbi: 'Acc', 'nën': 'Acc', 'ndër': 'Acc', 'më': 'Acc', 'nëpër': 'Acc',
    prej: 'Abl', ndaj: 'Abl', sipas: 'Abl', 'afër': 'Abl', 'pranë': 'Abl', larg: 'Abl', para: 'Abl', pas: 'Abl', 'përpara': 'Abl',
    'gjatë': 'Abl', rreth: 'Abl', drejt: 'Abl', 'kundër': 'Abl', midis: 'Abl', 'ndërmjet': 'Abl',
  };
  it.each(Object.entries(GOVERNS))('%s governs %s', (prep, cas) => {
    const r = find(prep, prep, 'ADP');
    expect(r, prep).toBeDefined();
    expect(r!.governs).toBe(cas);
    const lx = SQ_FUNCTION_WORDS.find((w) => w.lemma === prep && w.pos === 'ADP')!;
    expect(lx.governs).toBe(cas);
  });

  it('only prepositions govern a case', () => {
    for (const w of SQ_FUNCTION_WORDS) if (w.governs) expect(w.pos, w.lemma).toBe('ADP');
  });

  it('prepositions that are also adverbs keep both readings, the preposition first', () => {
    for (const f of ['afër', 'larg', 'pranë', 'përpara', 'drejt', 'rreth', 'kundër']) {
      expect(readingsOf(f).map((r) => r.pos), f).toEqual(['ADP', 'ADV']);
    }
  });
});

describe('conjunctions and particles', () => {
  it('coordinating and subordinating conjunctions', () => {
    for (const f of ['dhe', 'e', 'edhe', 'por', 'ose', 'apo', 'prandaj', 'pra']) expect(find(f, f, 'CONJ'), f).toBeDefined();
    for (const f of ['se', 'që', 'sepse', 'kur', 'nëse', 'megjithëse', 'ndërsa', 'sa', 'si', 'derisa']) expect(find(f, f, 'SCONJ'), f).toBeDefined();
  });

  it('particles: nuk (and s\'), mos, po, do, të, duke, pa, le, u, a', () => {
    for (const f of ['nuk', 'mos', 'po', 'do', 'të', 'duke', 'pa', 'le', 'u', 'a']) expect(find(f, f, 'PART'), f).toBeDefined();
    expect(find("s'", 'nuk', 'PART')).toBeDefined();
    expect(find('po', 'po', 'INTJ')!.gloss).toBe('yes');
    expect(find('po', 'po', 'PART')!.role).toMatch(/going on/);
    expect(find('do', 'do', 'PART')!.role).toMatch(/future/);
    expect(find('të', 'të', 'PART')!.role).toMatch(/subjunctive/);
    expect(find('a', 'a', 'PART')!.role).toMatch(/question/);
    expect(find('u', 'u', 'PART')!.role).toMatch(/non-active/);
    expect(find('pa', 'pa', 'PART')!.role).toMatch(/participle/);
  });
});

// ───────────────────────────── the linking article ─────────────────────────────

describe('the linking article', () => {
  type Row = ['Masc' | 'Fem', 'Sing' | 'Plur', 'Nom' | 'Acc' | 'Gen' | 'Dat' | 'Abl', 'Def' | 'Ind', boolean, string, string];
  // [gender, number, case, definite, adjacent, expected first form, the phrase it comes from]
  const ROWS: Row[] = [
    ['Masc', 'Sing', 'Nom', 'Def', true, 'i', 'djali i mirë'],
    ['Masc', 'Sing', 'Nom', 'Ind', false, 'i', 'një djalë i mirë'],
    ['Masc', 'Sing', 'Nom', 'Def', false, 'i', 'djali im i mirë'],
    ['Masc', 'Sing', 'Acc', 'Def', true, 'e', 'djalin e mirë'],
    ['Masc', 'Sing', 'Acc', 'Ind', false, 'të', 'një djalë të mirë'],
    ['Masc', 'Sing', 'Acc', 'Def', false, 'të', 'djalin tim të mirë'],
    ['Masc', 'Sing', 'Gen', 'Def', true, 'të', 'djalit të mirë'],
    ['Masc', 'Sing', 'Dat', 'Ind', false, 'të', 'një djali të mirë'],
    ['Masc', 'Sing', 'Abl', 'Def', true, 'të', 'prej djalit të mirë'],
    ['Fem', 'Sing', 'Nom', 'Def', true, 'e', 'vajza e mirë'],
    ['Fem', 'Sing', 'Nom', 'Ind', false, 'e', 'një vajzë e mirë'],
    ['Fem', 'Sing', 'Acc', 'Def', true, 'e', 'vajzën e mirë'],
    ['Fem', 'Sing', 'Acc', 'Ind', false, 'të', 'një vajzë të mirë'],
    ['Fem', 'Sing', 'Gen', 'Def', true, 'së', 'vajzës së mirë'],
    ['Fem', 'Sing', 'Dat', 'Def', true, 'së', 'vajzës së mirë (dative)'],
    ['Fem', 'Sing', 'Abl', 'Def', true, 'së', 'prej vajzës së mirë'],
    ['Fem', 'Sing', 'Gen', 'Ind', false, 'të', 'një vajze të mirë'],
    ['Fem', 'Sing', 'Gen', 'Def', false, 'të', 'vajzës sime të mirë'],
    ['Masc', 'Plur', 'Nom', 'Def', true, 'e', 'djemtë e mirë'],
    ['Fem', 'Plur', 'Nom', 'Def', true, 'e', 'vajzat e mira'],
    ['Masc', 'Plur', 'Nom', 'Ind', false, 'të', 'djem të mirë'],
    ['Masc', 'Plur', 'Nom', 'Def', false, 'të', 'djemtë e mi të mirë'],
    ['Fem', 'Plur', 'Acc', 'Def', true, 'e', 'vajzat e mira (accusative)'],
    ['Masc', 'Plur', 'Acc', 'Ind', false, 'të', 'djem të mirë (accusative)'],
    ['Masc', 'Plur', 'Gen', 'Def', true, 'të', 'djemve të mirë'],
    ['Fem', 'Plur', 'Dat', 'Def', true, 'të', 'vajzave të mira'],
    ['Fem', 'Plur', 'Abl', 'Ind', false, 'të', 'prej vajzash të mira'],
  ];

  it.each(ROWS)('%s %s %s %s adjacent=%s gives %s (%s)', (gender, number, cas, definite, adjacent, expected) => {
    expect(linkingArticle({ gender, number, case: cas, definite, adjacent })).toEqual([expected]);
  });

  it('without `adjacent`, a definite noun allows both the near and the far form, the usual first', () => {
    expect(linkingArticle({ gender: 'Masc', number: 'Sing', case: 'Acc', definite: 'Def' })).toEqual(['e', 'të']);
    expect(linkingArticle({ gender: 'Fem', number: 'Sing', case: 'Gen', definite: 'Def' })).toEqual(['së', 'të']);
    expect(linkingArticle({ gender: 'Fem', number: 'Plur', case: 'Nom', definite: 'Def' })).toEqual(['e', 'të']);
    expect(linkingArticle({ gender: 'Masc', number: 'Sing', case: 'Acc', definite: 'Ind' })).toEqual(['të']);
    expect(linkingArticle({ gender: 'Masc', number: 'Sing', case: 'Nom', definite: 'Def' })).toEqual(['i']);
    // an indefinite noun is never "directly after a definite noun", whatever `adjacent` says
    expect(linkingArticle({ gender: 'Fem', number: 'Sing', case: 'Gen', definite: 'Ind', adjacent: true })).toEqual(['të']);
  });

  it('neuter nouns are not covered: the answer is empty', () => {
    expect(linkingArticle({ gender: 'Neut', number: 'Sing', case: 'Nom', definite: 'Def' })).toEqual([]);
  });

  it('every row, read backwards: the form is compatible with exactly the features that produce it', () => {
    for (const [gender, number, cas, definite, , expected] of ROWS) {
      const readings = linkingArticleReadings(expected);
      const hit = readings.some(
        (r) => r.gender === gender && r.number === number && r.case.split(',').includes(cas) && r.definite.split(',').includes(definite),
      );
      expect(hit, `${expected} for ${gender} ${number} ${cas} ${definite}`).toBe(true);
    }
  });

  it('read backwards, every claimed reading really produces the form, and nothing produced is missed', () => {
    for (const form of ['i', 'e', 'të', 'së']) {
      const readings = linkingArticleReadings(form);
      expect(readings.length, form).toBeGreaterThan(0);
      for (const r of readings) {
        for (const c of r.case.split(',')) {
          for (const d of r.definite.split(',')) {
            const produced = [true, false].flatMap((adjacent) =>
              linkingArticle({ gender: r.gender as 'Masc' | 'Fem', number: r.number as 'Sing' | 'Plur', case: c as 'Nom', definite: d as 'Def', adjacent }),
            );
            expect(produced, `${form}: ${JSON.stringify(r)}`).toContain(form);
          }
        }
      }
      // completeness
      for (const gender of ['Masc', 'Fem'] as const) for (const number of ['Sing', 'Plur'] as const)
        for (const cas of ['Nom', 'Acc', 'Gen', 'Dat', 'Abl'] as const) for (const definite of ['Def', 'Ind'] as const)
          for (const adjacent of [true, false]) {
            if (!linkingArticle({ gender, number, case: cas, definite, adjacent }).includes(form)) continue;
            const hit = readings.some((r) => r.gender === gender && r.number === number && r.case.split(',').includes(cas) && r.definite.split(',').includes(definite));
            expect(hit, `${form} missed for ${gender} ${number} ${cas} ${definite}`).toBe(true);
          }
    }
  });

  it('a word that is not a linking article has no readings; the specific shapes of i and së', () => {
    expect(linkingArticleReadings('a')).toEqual([]);
    expect(linkingArticleReadings('i')).toEqual([{ gender: 'Masc', number: 'Sing', case: 'Nom', definite: 'Def,Ind' }]);
    expect(linkingArticleReadings('së')).toEqual([{ gender: 'Fem', number: 'Sing', case: 'Gen,Dat,Abl', definite: 'Def' }]);
  });

  it('is its own lexeme: DET, PronType Art, a role in plain words and NO English gloss', () => {
    const lx = SQ_FUNCTION_WORDS.find((w) => w.pos === 'DET' && w.lemma === 'i')!;
    expect(lx).toBeDefined();
    expect(lx.gloss).toBe('');
    expect(lx.role).toMatch(/linking article/);
    expect(lx.role).toMatch(/agrees with that noun/);
    for (const form of ['i', 'e', 'të', 'së']) {
      const r = readingsOf(form).find((x) => x.pos === 'DET' && x.lemma === 'i')!;
      expect(r, form).toBeDefined();
      expect(r.gloss, form).toBeUndefined();
      expect(r.morph.PronType).toBe('Art');
      expect(r.role).toMatch(/linking article/);
      // the feature unions of the reading are what linkingArticleReadings says
      const rs = linkingArticleReadings(form);
      const union = (key: 'gender' | 'number' | 'case'): string => {
        const order = key === 'gender' ? ['Masc', 'Fem'] : key === 'number' ? ['Sing', 'Plur'] : ['Nom', 'Acc', 'Gen', 'Dat', 'Abl'];
        return order.filter((v) => rs.some((x) => x[key].split(',').includes(v))).join(',');
      };
      expect(r.morph.Gender, form).toBe(union('gender'));
      expect(r.morph.Number, form).toBe(union('number'));
      expect(r.morph.Case, form).toBe(union('case'));
    }
  });
});

// ───────────────────────────── the ambiguous little words ─────────────────────────────

describe('ambiguous little words keep every reading, none above 0.6', () => {
  const EXPECT: Record<string, string[]> = {
    e: ['ai/PRON', 'i/DET', 'e/CONJ'],
    i: ['ai/PRON', 'ai/PRON', 'i/DET'],
    'të': ['të/PART', 'ti/PRON', 'i/DET'],
    'më': ['unë/PRON', 'më/ADV', 'më/ADP'],
    u: ['u/PART', 'ai/PRON'],
    ju: ['ju/PRON', 'ju/PRON'],
    po: ['po/PART', 'po/INTJ'],
    pa: ['pa/ADP', 'pa/PART'],
    si: ['si/ADV', 'si/SCONJ'],
    sa: ['sa/ADV', 'sa/SCONJ'],
    'që': ['që/PRON', 'që/SCONJ'],
    'shumë': ['shumë/ADV', 'shumë/DET'],
    pak: ['pak/ADV', 'pak/DET'],
    kur: ['kur/ADV', 'kur/SCONJ'],
    'një': ['një/NUM', 'një/DET'],
  };
  it.each(Object.entries(EXPECT))('%s', (form, keys) => {
    const rs = readingsOf(form);
    expect(rs.map(keyOf)).toEqual(keys);
    for (const r of rs) expect(r.confidence, `${form} ${keyOf(r)}`).toBeLessThanOrEqual(0.6);
    // best first, strictly decreasing
    for (let i = 1; i < rs.length; i++) expect(rs[i].confidence).toBeLessThan(rs[i - 1].confidence);
  });

  it('e: object clitic first, then the linking article, then "and" (the brief\'s order)', () => {
    const rs = readingsOf('e');
    expect(rs[0].morph).toMatchObject({ Clitic: 'Yes', Case: 'Acc' });
    expect(rs[1].morph.PronType).toBe('Art');
    expect(rs[2].gloss).toBe('and');
  });

  it('do and pa have a verb reading in another word list, so even their single/first reading stays at 0.6 or below', () => {
    expect(readingsOf('do')).toHaveLength(1);
    expect(readingsOf('do')[0].confidence).toBeLessThanOrEqual(0.6);
    expect(readingsOf('dhe')[0].confidence).toBeLessThanOrEqual(0.6);
    expect(readingsOf('a')).toHaveLength(1);
  });

  it('a form with one reading is confident (0.9)', () => {
    expect(readingsOf('kush')[0].confidence).toBe(0.9);
    expect(readingsOf('nuk')[0].confidence).toBe(0.9);
    expect(readingsOf('sepse')[0].confidence).toBe(0.9);
  });
});

describe('the whole list', () => {
  it('has no duplicate lemma + part of speech, and every word has a gloss or a role', () => {
    const seen = new Set<string>();
    for (const w of SQ_FUNCTION_WORDS) {
      const k = `${w.lemma}/${w.pos}`;
      expect(seen.has(k), `duplicate ${k}`).toBe(false);
      seen.add(k);
      expect(Boolean(w.gloss) || Boolean(w.role), `${k} has neither gloss nor role`).toBe(true);
    }
    expect(SQ_FUNCTION_WORDS.length).toBeGreaterThan(120);
  });

  it('every lemma and every form is NFC and lower case', () => {
    for (const w of SQ_FUNCTION_WORDS) {
      expect(w.lemma, w.lemma).toBe(w.lemma.normalize('NFC'));
      expect(w.lemma, w.lemma).toBe(w.lemma.toLowerCase());
    }
    for (const [form, rs] of SQ_FUNCTION_READINGS) {
      expect(form).toBe(form.normalize('NFC'));
      expect(form).toBe(form.toLowerCase());
      expect(form).toBe(form.trim());
      expect(rs.length, form).toBeGreaterThan(0);
    }
  });

  it('every reading is hand-listed, known, explained, and an ambiguous form never exceeds 0.6', () => {
    for (const [form, rs] of SQ_FUNCTION_READINGS) {
      for (const r of rs) {
        expect(r.origin, form).toBe('hand');
        expect(r.lemmaKnown, form).toBe(true);
        expect(r.rule.length, form).toBeGreaterThan(3);
        expect(Boolean(r.gloss) || Boolean(r.role), `${form} ${keyOf(r)}`).toBe(true);
        expect(r.confidence).toBeGreaterThan(0);
        expect(r.confidence).toBeLessThanOrEqual(0.92);
        if (rs.length > 1) expect(r.confidence, `${form} ${keyOf(r)}`).toBeLessThanOrEqual(0.6);
        expect(r.morph.VerbForm, `${form}: a closed-class word is not a finite verb`).toBeUndefined();
      }
    }
  });

  it('every form of every lexeme is reachable in the map, and its lemma form is too', () => {
    for (const w of SQ_FUNCTION_WORDS) {
      const forms = (w.forms ?? [w.lemma]).map((f) => f.split(':')[0].trim());
      for (const f of forms) expect(find(f, w.lemma, w.pos), `${w.lemma}/${w.pos} ${f}`).toBeDefined();
    }
  });

  it('describing a reading never throws and gives words, never a raw feature name', () => {
    for (const rs of SQ_FUNCTION_READINGS.values()) {
      for (const r of rs) {
        const d = describeSqMorph(r.morph, r.pos);
        expect(typeof d).toBe('string');
        expect(d).not.toMatch(/Case|Number|PronType|Gender|Person/);
      }
    }
  });
});

// ───────────────────────────── clitics and clusters ─────────────────────────────

describe('the clitic table', () => {
  it('lists më, të, e, i (twice), na, ju, u', () => {
    expect(SQ_CLITICS.map((c) => c.form)).toEqual(['më', 'të', 'e', 'i', 'i', 'na', 'ju', 'u']);
    const i = SQ_CLITICS.filter((c) => c.form === 'i');
    expect(i.map((c) => `${c.number}/${c.cases.join(',')}`)).toEqual(['Sing/Dat', 'Plur/Acc']);
    for (const c of SQ_CLITICS) expect(c.gloss.length).toBeGreaterThan(0);
    expect(SQ_CLITICS.find((c) => c.form === 'më')).toMatchObject({ person: '1', number: 'Sing', cases: ['Acc', 'Dat'] });
    expect(SQ_CLITICS.find((c) => c.form === 'e')).toMatchObject({ person: '3', number: 'Sing', cases: ['Acc'] });
    expect(SQ_CLITICS.find((c) => c.form === 'u')).toMatchObject({ person: '3', number: 'Plur', cases: ['Dat'] });
  });
});

describe('clusters', () => {
  const EXPECTED: Record<string, string[][]> = {
    ma: [['më', 'e']],
    ta: [['të', 'e'], ['të', 'e']], // to you + it; the particle të + it
    ia: [['i', 'e'], ['i', 'i']],
    jua: [['ju', 'e'], ['ju', 'i']],
    ua: [['u', 'e'], ['u', 'i']],
    "m'i": [['më', 'i']],
    "t'i": [['të', 'i'], ['të', 'i']],
    "m'u": [['më', 'u']],
    "t'u": [['të', 'u'], ['të', 'u'], ['të', 'u']],
    iu: [['i', 'u']],
    "t'ia": [['të', 'ia']],
    "t'ua": [['të', 'ua']],
  };

  it('the table holds exactly the forms and make-ups listed, nothing else', () => {
    const got: Record<string, string[][]> = {};
    for (const c of SQ_CLUSTERS) (got[c.form] ??= []).push(c.components);
    expect(got).toEqual(EXPECTED);
    expect(SQ_CLUSTERS).toHaveLength(19);
  });

  it('every cluster says it is unverified, and names each component in plain words', () => {
    for (const c of SQ_CLUSTERS) {
      expect(c.attested).toBe("drafter's knowledge — not yet checked against a treebank or a grammar");
      expect(c.components).toHaveLength(2);
      expect(c.roles).toHaveLength(c.components.length);
      for (const r of c.roles) expect(r.length).toBeGreaterThan(3);
      expect(c.gloss.length).toBeGreaterThan(3);
    }
  });

  it('ta and t\'i keep BOTH make-ups: two pronouns, and the particle të + a pronoun', () => {
    for (const form of ['ta', "t'i"]) {
      const cs = SQ_CLUSTERS.filter((c) => c.form === form);
      expect(cs.some((c) => /particle/.test(c.roles[0]))).toBe(true);
      expect(cs.some((c) => /to you/.test(c.roles[0]))).toBe(true);
    }
    expect(SQ_CLUSTERS.filter((c) => c.form === "t'u").map((c) => c.roles.join(' | '))).toEqual([
      'to you, singular (indirect object pronoun) | non-active particle (u)',
      'subjunctive particle (të) | non-active particle (u)',
      'subjunctive particle (të) | to them (indirect object pronoun)',
    ]);
  });

  /**
   * The fusion rule, written independently of the implementation:
   *  - më / të + e          → m / t + a        (ma, ta)
   *  - më / të + i or u     → m' / t' + i or u (m'i, t'i, m'u, t'u)
   *  - i / ju / u + e or i  → i / ju / u + a   (ia, jua, ua)
   *  - i + u                → iu
   *  - të + ia / ua         → t' + ia / ua     (t'ia, t'ua)
   */
  function fuse(first: string, second: string): string {
    if (first === 'më' || first === 'të') {
      const stem = first.slice(0, -1);
      return second === 'e' ? `${stem}a` : `${stem}'${second}`;
    }
    return second === 'u' ? `${first}u` : `${first}a`;
  }

  it('the components fuse into the written form by the rule', () => {
    for (const c of SQ_CLUSTERS) expect(fuse(c.components[0], c.components[1]), `${c.form} = ${c.components.join(' + ')}`).toBe(c.form);
  });

  it('a cluster read as a token: one reading per make-up, parts cut the form exactly', () => {
    for (const form of Object.keys(EXPECTED)) {
      const rs = cliticReadings(form, () => []);
      expect(rs, form).toHaveLength(EXPECTED[form].length);
      for (const r of rs) {
        expect(r.parts, form).toHaveLength(2);
        expect(r.parts!.map((p) => p.text).join(''), form).toBe(form);
        expect(r.parts![0].start).toBe(0);
        expect(r.parts![0].end).toBe(r.parts![1].start);
        expect(r.parts![1].end).toBe(form.length);
        for (const p of r.parts!) expect(p.text).toBe(form.slice(p.start, p.end));
        expect(r.lemma).toBe(r.parts![0].lemma);
        expect(r.pos).toBe(r.parts![0].pos);
        if (rs.length > 1) expect(r.confidence).toBeLessThanOrEqual(0.6);
        expect(r.lemmaKnown).toBe(true);
      }
    }
  });
});

describe('cliticReadings', () => {
  const rd = (lemma: string, pos: PartOfSpeech, morph: Record<string, string>, rule: string, lemmaKnown = true): SqReading =>
    ({ lemma, pos, morph, confidence: 0.9, lemmaKnown, rule, origin: 'hand' });
  const VERBS: Record<string, SqReading[]> = {
    jam: [rd('jam', 'AUX', { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', VerbForm: 'Fin' }, 'first person singular present of jam')],
    'është': [rd('jam', 'AUX', { Person: '3', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', VerbForm: 'Fin' }, 'third person singular present of jam')],
    kam: [rd('kam', 'VERB', { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', VerbForm: 'Fin' }, 'first person singular present of kam')],
    ke: [rd('kam', 'VERB', { Person: '2', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', VerbForm: 'Fin' }, 'second person singular present of kam')],
    jep: [
      rd('jap', 'VERB', { Person: '2', Number: 'Sing', Mood: 'Imp', VerbForm: 'Fin' }, 'second person singular imperative of jap'),
      rd('jap', 'VERB', { Person: '3', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', VerbForm: 'Fin' }, 'third person singular present of jap'),
    ],
    merr: [rd('marr', 'VERB', { Person: '2', Number: 'Sing', Mood: 'Imp', VerbForm: 'Fin' }, 'second person singular imperative of marr')],
    'shtëp': [rd('shtëp', 'VERB', { Mood: 'Imp', Number: 'Sing' }, 'a guess by ending', false)],
    'ngrënë': [rd('ha', 'VERB', { VerbForm: 'Part' }, 'participle of ha')],
  };
  const verb = (f: string): SqReading[] => VERBS[f] ?? [];

  const shape = (r: SqReading): Array<[string, number, number, string | undefined, string | undefined]> =>
    r.parts!.map((p) => [p.text, p.start, p.end, p.lemma, p.kind]);

  it('a bare clitic gives its pronoun readings (no parts: it is one word), at 0.6 or below', () => {
    for (const f of ['më', 'të', 'e', 'i', 'na', 'ju', 'u']) {
      const rs = cliticReadings(f, verb);
      expect(rs.length, f).toBe(SQ_CLITICS.filter((c) => c.form === f).length);
      for (const r of rs) {
        expect(r.pos).toBe('PRON');
        expect(r.morph.Clitic).toBe('Yes');
        expect(r.parts).toBeUndefined();
        expect(r.confidence).toBeLessThanOrEqual(0.6);
        // the same reading the function-word list gives, so a merge can dedupe
        const twin = readingsOf(f).find((x) => x.lemma === r.lemma && x.pos === r.pos && x.morph.Number === r.morph.Number && x.morph.Case === r.morph.Case && x.morph.Clitic === 'Yes');
        expect(twin, `${f} ${JSON.stringify(r.morph)}`).toBeDefined();
        expect(twin!.morph).toEqual(r.morph);
      }
    }
    expect(cliticReadings('e', verb)[0].rule).toMatch(/him, her, it/);
  });

  it('ma = më + e, exact offsets and the make-up in plain words', () => {
    const [r] = cliticReadings('ma', verb);
    expect(r.rule).toBe('më + e: to me, it / him / her');
    expect(shape(r)).toEqual([['m', 0, 1, 'unë', 'clitic'], ['a', 1, 2, 'ai', 'clitic']]);
    expect(r.parts![0].role).toBe('to me (indirect object pronoun)');
    expect(r.parts![1].role).toBe('it / him / her (direct object pronoun)');
    expect(r.lemma).toBe('unë');
    expect(r.pos).toBe('PRON');
  });

  it('ta has two readings: to you + it, and the particle të + it', () => {
    const rs = cliticReadings('ta', verb);
    expect(rs).toHaveLength(2);
    expect(rs.map((r) => `${r.lemma}/${r.pos}`)).toEqual(['ti/PRON', 'të/PART']);
    expect(shape(rs[1])).toEqual([['t', 0, 1, 'të', 'contracted'], ['a', 1, 2, 'ai', 'clitic']]);
  });

  it('ia = i + e or i + i; jua = ju + e or ju + i; ua = u + e or u + i', () => {
    for (const [form, first, cut] of [['ia', 'i', 1], ['jua', 'ju', 2], ['ua', 'u', 1]] as const) {
      const rs = cliticReadings(form, verb);
      expect(rs, form).toHaveLength(2);
      expect(rs[0].rule.startsWith(`${first} + e:`)).toBe(true);
      expect(rs[1].rule.startsWith(`${first} + i:`)).toBe(true);
      for (const r of rs) expect(shape(r).map((x) => x.slice(0, 3))).toEqual([[form.slice(0, cut), 0, cut], ['a', cut, cut + 1]]);
    }
  });

  it("apostrophe clusters: m'i, t'i, m'u, t'u, t'ia, t'ua cut at the apostrophe", () => {
    expect(shape(cliticReadings("m'i", verb)[0])).toEqual([["m'", 0, 2, 'unë', 'clitic'], ['i', 2, 3, 'ai', 'clitic']]);
    expect(cliticReadings("t'i", verb).map((r) => `${r.lemma}/${r.pos}`)).toEqual(['ti/PRON', 'të/PART']);
    expect(shape(cliticReadings("m'u", verb)[0])).toEqual([["m'", 0, 2, 'unë', 'clitic'], ['u', 2, 3, 'u', 'contracted']]);
    expect(cliticReadings("t'u", verb).map((r) => `${r.lemma}/${r.pos}`)).toEqual(['ti/PRON', 'të/PART', 'të/PART']);
    expect(shape(cliticReadings("t'ia", verb)[0])).toEqual([["t'", 0, 2, 'të', 'contracted'], ['ia', 2, 4, 'ai', 'clitic']]);
    expect(shape(cliticReadings("t'ua", verb)[0])).toEqual([["t'", 0, 2, 'të', 'contracted'], ['ua', 2, 4, 'ai', 'clitic']]);
    expect(shape(cliticReadings('iu', verb)[0])).toEqual([['i', 0, 1, 'ai', 'clitic'], ['u', 1, 2, 'u', 'contracted']]);
  });

  it("s'jam = s' + jam and s'kam, s'është", () => {
    const [r] = cliticReadings("s'jam", verb);
    expect(r.lemma).toBe('jam');
    expect(r.pos).toBe('AUX');
    expect(r.morph).toMatchObject({ Person: '1', Number: 'Sing', Tense: 'Pres' });
    expect(shape(r)).toEqual([["s'", 0, 2, 'nuk', 'contracted'], ['jam', 2, 5, 'jam', 'contracted']]);
    expect(r.parts![0].role).toMatch(/negation/);
    expect(r.rule).toMatch(/^s' \+ jam: negation: not, then first person singular present of jam$/);
    expect(shape(cliticReadings("s'kam", verb)[0])).toEqual([["s'", 0, 2, 'nuk', 'contracted'], ['kam', 2, 5, 'kam', 'contracted']]);
    const [e] = cliticReadings("s'është", verb);
    expect(shape(e)).toEqual([["s'", 0, 2, 'nuk', 'contracted'], ['është', 2, 7, 'jam', 'contracted']]);
    expect(e.lemma).toBe('jam');
  });

  it("s'e and s'më: s' with a pronoun", () => {
    const [e] = cliticReadings("s'e", verb);
    expect(shape(e)).toEqual([["s'", 0, 2, 'nuk', 'contracted'], ['e', 2, 3, 'ai', 'clitic']]);
    expect(e.lemma).toBe('ai');
    expect(e.pos).toBe('PRON');
    const [m] = cliticReadings("s'më", verb);
    expect(shape(m)).toEqual([["s'", 0, 2, 'nuk', 'contracted'], ['më', 2, 4, 'unë', 'clitic']]);
    // s' + a fused pair
    const ia = cliticReadings("s'ia", verb);
    expect(ia).toHaveLength(2);
    expect(shape(ia[0])).toEqual([["s'", 0, 2, 'nuk', 'contracted'], ['i', 2, 3, 'ai', 'clitic'], ['a', 3, 4, 'ai', 'clitic']]);
  });

  it("ç'është and ç'ke: ç' = what", () => {
    const [r] = cliticReadings("ç'është", verb);
    expect(shape(r)).toEqual([["ç'", 0, 2, 'çfarë', 'contracted'], ['është', 2, 7, 'jam', 'contracted']]);
    expect(r.parts![0].role).toMatch(/what/);
    expect(r.parts![0].pos).toBe('PRON');
    const [k] = cliticReadings("ç'ke", verb);
    expect(shape(k)).toEqual([["ç'", 0, 2, 'çfarë', 'contracted'], ['ke', 2, 4, 'kam', 'contracted']]);
    expect(k.lemma).toBe('kam');
  });

  it('an imperative with attached pronouns: jepma = jep + më + e, merre = merr + e', () => {
    const rs = cliticReadings('jepma', verb);
    expect(rs).toHaveLength(1); // only the imperative reading of "jep" counts
    const r = rs[0];
    expect(r.lemma).toBe('jap');
    expect(r.pos).toBe('VERB');
    expect(r.morph.Mood).toBe('Imp');
    expect(shape(r)).toEqual([['jep', 0, 3, 'jap', undefined], ['m', 3, 4, 'unë', 'clitic'], ['a', 4, 5, 'ai', 'clitic']]);
    expect(r.rule).toBe('jep + më + e: second person singular imperative of jap, with the attached pronouns to me, it / him / her');
    expect(r.confidence).toBeLessThanOrEqual(0.6);

    const [m] = cliticReadings('merre', verb);
    expect(m.lemma).toBe('marr');
    expect(shape(m)).toEqual([['merr', 0, 4, 'marr', undefined], ['e', 4, 5, 'ai', 'clitic']]);
    expect(m.rule).toMatch(/^merr \+ e: /);

    // jepi = give him / give them: both readings of i
    const i = cliticReadings('jepi', verb);
    expect(i.map((x) => x.parts![1].morph!.Case)).toEqual(['Dat', 'Acc']);
    expect(cliticReadings('jepia', verb)).toHaveLength(2);
    expect(shape(cliticReadings('jepua', verb)[0])).toEqual([['jep', 0, 3, 'jap', undefined], ['u', 3, 4, 'ai', 'clitic'], ['a', 4, 5, 'ai', 'clitic']]);
  });

  it('"më thuaj" is two words: nothing to split; a guessed verb never makes an attached reading', () => {
    expect(cliticReadings('thuaj', verb)).toEqual([]);
    expect(cliticReadings('shtëpi', verb)).toEqual([]); // "shtëp" is only a guess (lemmaKnown false)
    expect(cliticReadings('ngrënë', verb)).toEqual([]); // a participle is not an imperative
  });

  it('returns nothing for other words, odd input and unknown apostrophe forms', () => {
    for (const f of ['libri', 'xyz', '', "x'y", "'", "s'", "ç'", "s'xyz", 'constructor', 'toString', "t'e", "t'ju"]) {
      expect(cliticReadings(f, verb), JSON.stringify(f)).toEqual([]);
    }
  });

  it('never throws on any form of the function-word list or the cluster table', () => {
    for (const f of SQ_FUNCTION_READINGS.keys()) expect(() => cliticReadings(f, verb)).not.toThrow();
    for (const c of SQ_CLUSTERS) expect(() => cliticReadings(c.form, () => [])).not.toThrow();
  });
});

// ───────────────────────────── plain-words descriptions ─────────────────────────────

describe('describeSqMorph', () => {
  const CASES: Array<[string, Record<string, string>, PartOfSpeech | undefined, string]> = [
    ['definite accusative', { Case: 'Acc', Number: 'Sing', Definite: 'Def' }, 'NOUN', 'definite accusative singular'],
    ['open case', { Case: 'Gen,Dat,Abl', Number: 'Sing', Definite: 'Ind' }, 'NOUN', 'indefinite singular, genitive, dative or ablative'],
    ['plain plural', { Case: 'Nom', Number: 'Plur', Definite: 'Ind' }, 'NOUN', 'indefinite nominative plural'],
    ['nom or acc plural', { Case: 'Nom,Acc', Number: 'Plur', Definite: 'Def' }, 'NOUN', 'definite plural, nominative or accusative'],
    ['two cases', { Case: 'Gen,Dat', Number: 'Plur', Definite: 'Def' }, 'NOUN', 'definite plural, genitive or dative'],
    ['ablative', { Case: 'Abl', Number: 'Sing', Definite: 'Ind' }, 'NOUN', 'indefinite ablative singular'],
    ['number only', { Number: 'Plur' }, 'NOUN', 'plural'],
    ['with gender', { Case: 'Gen,Dat', Number: 'Sing', Definite: 'Def', Gender: 'Fem' }, 'NOUN', 'definite feminine singular, genitive or dative'],
    ['both numbers', { Case: 'Nom,Acc', Number: 'Sing,Plur' }, 'NOUN', 'singular or plural, nominative or accusative'],
    ['aorist', { Person: '3', Number: 'Sing', Tense: 'Past', Mood: 'Ind' }, 'VERB', 'third person singular, aorist (simple past)'],
    ['present', { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', VerbForm: 'Fin' }, 'VERB', 'first person singular, present'],
    ['imperfect', { Person: '3', Number: 'Plur', Tense: 'Imp', Mood: 'Ind' }, 'VERB', 'third person plural, imperfect'],
    ['subjunctive', { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Sub' }, 'VERB', 'first person singular, present subjunctive (the form used after të)'],
    ['non-active subjunctive', { Person: '2', Number: 'Sing', Tense: 'Pres', Mood: 'Sub', Voice: 'Mid' }, 'VERB', 'second person singular, present subjunctive (the form used after të), non-active'],
    ['non-active present', { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', Voice: 'Mid' }, 'VERB', 'first person singular, present, non-active'],
    ['non-active aorist', { Person: '1', Number: 'Sing', Tense: 'Past', Mood: 'Ind', Voice: 'Mid' }, 'VERB', 'first person singular, aorist (simple past), non-active'],
    ['admirative', { Person: '3', Number: 'Sing', Tense: 'Pres', Mood: 'Adm' }, 'VERB', 'third person singular, present admirative (surprise)'],
    ['optative', { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Opt' }, 'VERB', 'first person singular, present optative (a wish)'],
    ['imperative', { Person: '2', Number: 'Sing', Mood: 'Imp' }, 'VERB', 'second person singular, imperative'],
    ['participle', { VerbForm: 'Part' }, 'VERB', 'participle'],
    ['non-active participle', { VerbForm: 'Part', Voice: 'Mid' }, 'VERB', 'participle, non-active'],
    ['article with everything', { PronType: 'Art', Gender: 'Masc', Number: 'Sing', Case: 'Nom' }, 'DET', 'linking article (agrees with a masculine singular noun in the nominative)'],
    ['article after a definite noun', { PronType: 'Art', Gender: 'Fem', Number: 'Sing', Case: 'Gen,Dat,Abl', Definite: 'Def' }, 'DET',
      'linking article (agrees with a feminine singular noun in the genitive, dative or ablative, standing directly after a definite noun)'],
    ['bare article', { PronType: 'Art' }, 'DET', 'linking article'],
    ['personal pronoun', { PronType: 'Prs', Person: '1', Number: 'Sing', Case: 'Nom' }, 'PRON', 'personal pronoun, first person singular, nominative'],
    ['personal pronoun with gender', { PronType: 'Prs', Person: '3', Number: 'Sing', Gender: 'Fem', Case: 'Gen,Dat' }, 'PRON', 'personal pronoun, third person singular feminine, genitive or dative'],
    ['clitic', { PronType: 'Prs', Clitic: 'Yes', Person: '3', Number: 'Sing', Case: 'Acc' }, 'PRON', 'short (clitic) object pronoun, third person singular, accusative'],
    ['demonstrative', { PronType: 'Dem', Gender: 'Fem', Number: 'Sing', Case: 'Nom' }, 'DET', 'demonstrative, feminine nominative singular'],
    ['possessive', { Poss: 'Yes', Gender: 'Masc', Number: 'Sing', Case: 'Nom' }, 'DET', 'possessive, masculine nominative singular'],
    ['definite possessive', { Poss: 'Yes', Gender: 'Fem', Number: 'Plur', Definite: 'Def' }, 'DET', 'possessive, definite feminine plural'],
    ['interrogative', { PronType: 'Int', Case: 'Acc' }, 'PRON', 'interrogative, accusative'],
    ['relative or interrogative', { PronType: 'Int,Rel', Gender: 'Masc', Number: 'Sing', Case: 'Nom' }, 'PRON', 'interrogative or relative, masculine nominative singular'],
    ['indefinite', { PronType: 'Ind' }, 'PRON', 'indefinite'],
    ['negative', { PronType: 'Neg' }, 'PRON', 'negative'],
    ['adjective form', { Gender: 'Fem', Number: 'Plur' }, 'ADJ', 'feminine plural'],
    ['comparative', { Degree: 'Cmp' }, 'ADJ', 'comparative'],
  ];
  it.each(CASES)('%s', (_name, morph, pos, expected) => {
    expect(describeSqMorph(morph, pos)).toBe(expected);
  });

  it('is more than 25 bundles', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(25);
  });

  it('never throws: unknown features and values are skipped', () => {
    expect(describeSqMorph({})).toBe('');
    expect(describeSqMorph({}, 'NOUN')).toBe('');
    expect(describeSqMorph({ Wibble: 'x' })).toBe('');
    expect(describeSqMorph({ Case: 'Voc' })).toBe('');
    expect(describeSqMorph({ Case: 'Nom', Wibble: 'x', Number: 'Dual' })).toBe('nominative');
    expect(describeSqMorph({ Case: 'Nom,Voc,Acc', Number: 'Sing' })).toBe('singular, nominative or accusative');
    expect(describeSqMorph({ Tense: 'Fut', Person: '3' }, 'VERB')).toBe('third person');
    expect(describeSqMorph({ Mood: 'Cnd', Person: '9' }, 'VERB')).toBe('');
    expect(describeSqMorph(undefined as unknown as Record<string, string>)).toBe('');
    expect(describeSqMorph(null as unknown as Record<string, string>)).toBe('');
    expect(describeSqMorph({ Case: undefined as unknown as string, Number: 7 as unknown as string })).toBe('');
    expect(describeSqMorph({ constructor: 'x', toString: 'y', Case: 'constructor' })).toBe('');
  });

  it('describes every reading of every closed-class form without raw feature names', () => {
    let nonEmpty = 0;
    for (const rs of SQ_FUNCTION_READINGS.values()) for (const r of rs) if (describeSqMorph(r.morph, r.pos)) nonEmpty++;
    expect(nonEmpty).toBeGreaterThan(150);
  });
});
