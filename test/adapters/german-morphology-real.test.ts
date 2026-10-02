/**
 * The German word-form engine on the REAL lexicon (`deLexiconView`): forms from the grammar, every entry generating
 * without trouble, every generated form analysing back to its own lemma, and the cost of the index.
 */
import { describe, expect, it } from 'vitest';
import { analyzeGermanForm, conjugateGerman, declineAdjective, declineNoun } from '../../src/adapters/german/morphology';
import { deLexiconView as lex } from '../../src/adapters/german/lexicon';
import type { DeLexiconView, DeReading } from '../../src/adapters/german/types';

const an = (s: string, view: DeLexiconView = lex): DeReading[] => analyzeGermanForm(s, view);
const sig = (r: DeReading): string => `${r.lemma}|${r.pos}|${JSON.stringify(r.morph)}`;

/** The surface has a reading of this lemma whose features include every given one (unions compared as written). */
function reads(surface: string, lemma: string, morph: Record<string, string> = {}, extra: (r: DeReading) => boolean = () => true): void {
  const rs = an(surface).filter((r) => r.lemma === lemma);
  const hit = rs.find((r) => Object.entries(morph).every(([k, v]) => r.morph[k] === v) && extra(r));
  expect(hit, `${surface} as ${lemma} ${JSON.stringify(morph)}; readings: ${an(surface).map(sig).join(' / ')}`).toBeDefined();
}

describe('real lexicon: nouns', () => {
  const rows: Array<[string, string, Record<string, string>]> = [
    ['Männern', 'Mann', { Case: 'Dat', Gender: 'Masc', Number: 'Plur' }],
    ['Männer', 'Mann', { Case: 'Nom,Acc,Gen', Gender: 'Masc', Number: 'Plur' }],
    ['Mannes', 'Mann', { Case: 'Gen', Gender: 'Masc', Number: 'Sing' }],
    ['Manns', 'Mann', { Case: 'Gen', Gender: 'Masc', Number: 'Sing' }],
    ['Frauen', 'Frau', { Case: 'Nom,Acc,Dat,Gen', Gender: 'Fem', Number: 'Plur' }],
    ['Frau', 'Frau', { Case: 'Nom,Acc,Dat,Gen', Gender: 'Fem', Number: 'Sing' }],
    ['Kindes', 'Kind', { Case: 'Gen', Gender: 'Neut', Number: 'Sing' }],
    ['Kinds', 'Kind', { Case: 'Gen', Gender: 'Neut', Number: 'Sing' }],
    ['Kindern', 'Kind', { Case: 'Dat', Gender: 'Neut', Number: 'Plur' }],
    ['Häusern', 'Haus', { Case: 'Dat', Gender: 'Neut', Number: 'Plur' }],
    ['Hauses', 'Haus', { Case: 'Gen', Gender: 'Neut', Number: 'Sing' }],
    ['Herzen', 'Herz', { Case: 'Dat', Gender: 'Neut', Number: 'Sing' }],
    ['Herzen', 'Herz', { Case: 'Nom,Acc,Dat,Gen', Gender: 'Neut', Number: 'Plur' }],
    ['Herzens', 'Herz', { Case: 'Gen', Gender: 'Neut', Number: 'Sing' }],
    ['Studenten', 'Student', { Case: 'Acc,Dat,Gen', Gender: 'Masc', Number: 'Sing' }],
    ['Namens', 'Name', { Case: 'Gen', Gender: 'Masc', Number: 'Sing' }],
    ['Namen', 'Name', { Case: 'Acc,Dat', Gender: 'Masc', Number: 'Sing' }],
    ['Herrn', 'Herr', { Case: 'Acc,Dat,Gen', Gender: 'Masc', Number: 'Sing' }],
    ['Herren', 'Herr', { Case: 'Nom,Acc,Dat,Gen', Gender: 'Masc', Number: 'Plur' }],
    ['Jungen', 'Junge', { Case: 'Acc,Dat,Gen', Gender: 'Masc', Number: 'Sing' }],
    ['Menschen', 'Mensch', { Case: 'Nom,Acc,Dat,Gen', Gender: 'Masc', Number: 'Plur' }],
    ['Buchstabens', 'Buchstabe', { Case: 'Gen', Gender: 'Masc', Number: 'Sing' }],
    ['Glaubens', 'Glaube', { Case: 'Gen', Gender: 'Masc', Number: 'Sing' }],
    ['Müttern', 'Mutter', { Case: 'Dat', Gender: 'Fem', Number: 'Plur' }],
    ['Brüdern', 'Bruder', { Case: 'Dat', Gender: 'Masc', Number: 'Plur' }],
    ['Vaters', 'Vater', { Case: 'Gen', Gender: 'Masc', Number: 'Sing' }],
    ['Wörtern', 'Wort', { Case: 'Dat', Gender: 'Neut', Number: 'Plur' }],
    ['Worten', 'Wort', { Case: 'Dat', Gender: 'Neut', Number: 'Plur' }],
    ['Augen', 'Auge', { Case: 'Nom,Acc,Dat,Gen', Gender: 'Neut', Number: 'Plur' }],
    ['Leuten', 'Leute', { Case: 'Dat', Number: 'Plur' }],
    ['Eltern', 'Eltern', { Case: 'Nom,Acc,Dat,Gen', Number: 'Plur' }],
    ['Autos', 'Auto', { Case: 'Nom,Acc,Dat,Gen', Gender: 'Neut', Number: 'Plur' }],
    ['Füßen', 'Fuß', { Case: 'Dat', Gender: 'Masc', Number: 'Plur' }],
    ['Fußes', 'Fuß', { Case: 'Gen', Gender: 'Masc', Number: 'Sing' }],
    ['Städten', 'Stadt', { Case: 'Dat', Gender: 'Fem', Number: 'Plur' }],
  ];
  it.each(rows)('%s is a form of %s', (surface, lemma, morph) => reads(surface, lemma, morph));

  it('has no form of a noun the grammar does not give', () => {
    expect(an('Weltens').some((r) => r.lemma === 'Welt' && r.lemmaKnown)).toBe(false);
    expect(an('Fußs').some((r) => r.lemmaKnown)).toBe(false); // stem in ß: only -es
    expect(an('Tischs').some((r) => r.lemma === 'Tisch' && r.lemmaKnown)).toBe(false);
    expect(an('Hauss').some((r) => r.lemmaKnown)).toBe(false);
  });

  it('the older dative in -e, literary, and said alongside the plural where they coincide', () => {
    reads('Manne', 'Mann', { Case: 'Dat', Gender: 'Masc', Number: 'Sing' }, (r) => r.register?.[0] === 'literary' && /older dative/.test(r.rule));
    reads('Hause', 'Haus', { Case: 'Dat', Number: 'Sing' }, (r) => r.register?.[0] === 'literary');
    reads('Tage', 'Tag', { Number: 'Plur' }, (r) => r.register === undefined);
    reads('Tage', 'Tag', { Case: 'Dat', Number: 'Sing' }, (r) => r.register?.[0] === 'literary' && /also/.test(r.rule));
    reads('Jahre', 'Jahr', { Case: 'Dat', Number: 'Sing' }, (r) => r.register?.[0] === 'literary');
    expect(an('Frauen').every((r) => r.register === undefined)).toBe(true);
  });

  it('adjectival nouns decline like adjectives for every gender and the plural', () => {
    reads('Deutsche', 'Deutsche', { Gender: 'Masc,Fem,Neut', Number: 'Sing' });
    reads('Deutschen', 'Deutsche', { Number: 'Plur' });
    reads('Deutscher', 'Deutsche', { Gender: 'Masc,Fem', Number: 'Sing' });
    reads('Erwachsenen', 'Erwachsene', { Number: 'Plur' });
    reads('Verwandter', 'Verwandte', { Number: 'Sing' });
    const r = an('Deutscher').find((x) => x.lemma === 'Deutsche' && x.morph.Number === 'Sing')!;
    expect(r.cells!.some((c) => c.c === 'D' && c.g === 'f' && c.decl === 'st')).toBe(true); // mit deutscher Frau: die Deutsche, dative
    expect(r.pos).toBe('NOUN');
  });
});

describe('real lexicon: adjectives', () => {
  const rows: Array<[string, string, Record<string, string>]> = [
    ['guten', 'gut', { Case: 'Nom,Acc,Dat,Gen', Gender: 'Masc,Fem,Neut', Number: 'Sing,Plur', Decl: 'Strong,Weak,Mixed' }],
    ['gutem', 'gut', { Case: 'Dat', Gender: 'Masc,Neut', Number: 'Sing', Decl: 'Strong' }],
    ['bessere', 'gut', { Degree: 'Cmp' }],
    ['besten', 'gut', { Degree: 'Sup' }],
    ['besser', 'gut', { Degree: 'Cmp' }],
    ['älteren', 'alt', { Degree: 'Cmp' }],
    ['älteste', 'alt', { Degree: 'Sup' }],
    ['teure', 'teuer', { Case: 'Nom,Acc' }],
    ['teurer', 'teuer', { Degree: 'Cmp' }],
    ['teuersten', 'teuer', { Degree: 'Sup' }],
    ['dunklen', 'dunkel', {}],
    ['dunkelste', 'dunkel', { Degree: 'Sup' }],
    ['müde', 'müde', {}],
    ['müder', 'müde', { Degree: 'Cmp' }],
    ['müden', 'müde', { Case: 'Nom,Acc,Dat,Gen' }],
    ['bösen', 'böse', {}],
    ['leiser', 'leise', { Degree: 'Cmp' }],
    ['weiseste', 'weise', { Degree: 'Sup' }],
    ['höher', 'hoch', { Degree: 'Cmp' }],
    ['hohe', 'hoch', { Case: 'Nom,Acc' }],
    ['höchsten', 'hoch', { Degree: 'Sup' }],
    ['größere', 'groß', { Degree: 'Cmp' }],
    ['größten', 'groß', { Degree: 'Sup' }],
    ['rosa', 'rosa', {}],
    ['schönen', 'schön', {}],
    ['edlen', 'edel', {}],
  ];
  it.each(rows)('%s is a form of %s', (surface, lemma, morph) => reads(surface, lemma, morph));

  it('an indeclinable adjective fills every cell; müde is both uninflected and the -e form', () => {
    expect(an('lila').find((r) => r.lemma === 'lila')!.cells).toHaveLength(48);
    const mued = an('müde').filter((r) => r.lemma === 'müde');
    expect(mued.some((r) => r.cells === undefined)).toBe(true);
    expect(mued.some((r) => r.cells !== undefined)).toBe(true);
    expect(declineAdjective(lex.adjective('müde')!).map((f) => f.form)).toEqual(['müde', 'müder', 'müdes', 'müden', 'müdem']);
    expect(declineAdjective(lex.adjective('müde')!, 'cmp').map((f) => f.form)).toContain('müdere');
  });
});

describe('real lexicon: verbs', () => {
  const rows: Array<[string, string, Record<string, string>]> = [
    ['fährst', 'fahren', { Mood: 'Ind', Tense: 'Pres', Person: '2', Number: 'Sing' }],
    ['fuhr', 'fahren', { Mood: 'Ind', Tense: 'Past', Person: '1,3', Number: 'Sing' }],
    ['führe', 'fahren', { Mood: 'Sub', Tense: 'Past', Person: '1,3', Number: 'Sing' }],
    ['gefahren', 'fahren', { VerbForm: 'Part', Tense: 'Past' }],
    ['gib', 'geben', { Mood: 'Imp', Person: '2', Number: 'Sing' }],
    ['gibst', 'geben', { Person: '2', Number: 'Sing' }],
    ['nimmt', 'nehmen', { Person: '3', Number: 'Sing' }],
    ['las', 'lesen', { Tense: 'Past', Person: '1,3' }],
    ['läse', 'lesen', { Mood: 'Sub', Tense: 'Past' }],
    ['liest', 'lesen', { Person: '2,3', Number: 'Sing' }],
    ['ging', 'gehen', { Tense: 'Past', Person: '1,3', Number: 'Sing' }],
    ['gegangen', 'gehen', { VerbForm: 'Part' }],
    ['kämen', 'kommen', { Mood: 'Sub', Tense: 'Past', Person: '1,3', Number: 'Plur' }],
    ['sieht', 'sehen', { Person: '3', Number: 'Sing' }],
    ['aßt', 'essen', { Tense: 'Past', Person: '2', Number: 'Sing' }],
    ['isst', 'essen', { Person: '2,3', Number: 'Sing' }],
    ['hältst', 'halten', { Person: '2', Number: 'Sing' }],
    ['findest', 'finden', { Person: '2', Number: 'Sing' }],
    ['fandet', 'finden', { Tense: 'Past', Person: '2', Number: 'Plur' }],
    ['arbeitest', 'arbeiten', { Person: '2', Number: 'Sing' }],
    ['arbeitete', 'arbeiten', { Tense: 'Past', Person: '1,3', Number: 'Sing' }],
    ['gearbeitet', 'arbeiten', { VerbForm: 'Part', Tense: 'Past' }],
    ['sammle', 'sammeln', { Person: '1', Number: 'Sing' }],
    ['sammelst', 'sammeln', { Person: '2', Number: 'Sing' }],
    ['studiert', 'studieren', { VerbForm: 'Part', Tense: 'Past' }],
    ['reist', 'reisen', { Person: '2,3', Number: 'Sing' }],
    ['wandere', 'wandern', { Person: '1', Number: 'Sing' }],
    ['lächelt', 'lächeln', { Person: '3', Number: 'Sing' }],
    ['läuft', 'laufen', { Person: '3', Number: 'Sing' }],
    ['hilf', 'helfen', { Mood: 'Imp' }],
    ['würfe', 'werfen', { Mood: 'Sub', Tense: 'Past' }],
    ['stürbe', 'sterben', { Mood: 'Sub', Tense: 'Past' }],
    ['begönne', 'beginnen', { Mood: 'Sub', Tense: 'Past' }],
    ['bringt', 'bringen', { Person: '3', Number: 'Sing' }],
    ['brachte', 'bringen', { Tense: 'Past', Person: '1,3', Number: 'Sing' }],
    ['brächte', 'bringen', { Mood: 'Sub', Tense: 'Past' }],
    ['gebracht', 'bringen', { VerbForm: 'Part' }],
    ['kannte', 'kennen', { Mood: 'Ind', Tense: 'Past' }],
    ['kennte', 'kennen', { Mood: 'Sub', Tense: 'Past' }],
    ['dächte', 'denken', { Mood: 'Sub', Tense: 'Past' }],
    ['wandte', 'wenden', { Mood: 'Ind', Tense: 'Past' }],
    ['bitte', 'bitten', { Person: '1', Number: 'Sing' }],
    ['lädt', 'laden', { Person: '3', Number: 'Sing' }],
    ['tritt', 'treten', { Person: '3', Number: 'Sing' }],
  ];
  it.each(rows)('%s is a form of %s', (surface, lemma, morph) => reads(surface, lemma, morph));

  it('inseparable verbs: no ge-, no prefix reading', () => {
    for (const [surface, lemma] of [['verstanden', 'verstehen'], ['versteht', 'verstehen'], ['erzählt', 'erzählen'], ['besucht', 'besuchen'],
      ['beantwortet', 'beantworten'], ['bekommen', 'bekommen'], ['gehört', 'gehören'], ['gehorcht', 'gehorchen'], ['wiederholt', 'wiederholen'],
      ['überlegt', 'überlegen'], ['untersucht', 'untersuchen'], ['verändert', 'verändern'], ['erinnert', 'erinnern']] as const) {
      reads(surface, lemma, {}, (r) => r.prefix === undefined || r.prefix.attached === false);
    }
    reads('verstanden', 'verstehen', { VerbForm: 'Part', Tense: 'Past' }, (r) => r.parts === undefined);
    reads('verstünde', 'verstehen', { Mood: 'Sub', Tense: 'Past' });
    // ge- is kept where the letters only look like a prefix
    reads('gebetet', 'beten', { VerbForm: 'Part' });
    reads('geerbt', 'erben', { VerbForm: 'Part' });
    expect(conjugateGerman(lex.verb('beten')[0]).forms['part.past']).toBe('gebetet');
    expect(conjugateGerman(lex.verb('erben')[0]).forms['part.past']).toBe('geerbt');
    expect(conjugateGerman(lex.verb('anbeten')[0]).forms['part.past']).toBe('angebetet');
  });

  it('separable verbs: attached forms, detached readings, participle and zu-infinitive', () => {
    reads('aufsteht', 'aufstehen', { Person: '3', Number: 'Sing' }, (r) => r.prefix?.attached === true);
    reads('steht', 'aufstehen', { Person: '3', Number: 'Sing' }, (r) => r.prefix?.text === 'auf' && r.prefix.attached === false);
    reads('steht', 'stehen', { Person: '3', Number: 'Sing' }, (r) => r.prefix === undefined);
    reads('aufgestanden', 'aufstehen', { VerbForm: 'Part' }, (r) => r.parts?.map((p) => p.text).join('|') === 'auf|ge|standen');
    reads('aufzustehen', 'aufstehen', { VerbForm: 'Inf' }, (r) => r.parts?.map((p) => p.kind).join('|') === 'prefix|marker|stem');
    reads('angefangen', 'anfangen', { VerbForm: 'Part' });
    reads('anzufangen', 'anfangen', { VerbForm: 'Inf' });
    reads('fängt', 'anfangen', { Person: '3', Number: 'Sing' }, (r) => r.prefix?.attached === false);
    reads('angerufen', 'anrufen', { VerbForm: 'Part' });
    reads('einkauft', 'einkaufen', { Person: '3' }, (r) => r.prefix?.attached === true);
    reads('eingekauft', 'einkaufen', { VerbForm: 'Part' });
    reads('einzukaufen', 'einkaufen', { VerbForm: 'Inf' });
    reads('kaufte', 'einkaufen', { Tense: 'Past' }, (r) => r.prefix?.attached === false);
    reads('mitgebracht', 'mitbringen', { VerbForm: 'Part' });
    reads('aufgemacht', 'aufmachen', { VerbForm: 'Part' });
    reads('stattgefunden', 'stattfinden', { VerbForm: 'Part' });
    reads('stattzufinden', 'stattfinden', { VerbForm: 'Inf' });
    reads('zurückgekehrt', 'zurückkehren', { VerbForm: 'Part' });
    reads('angekommen', 'ankommen', { VerbForm: 'Part' });
    // the detached readings come after the base verb's own
    const rs = an('steht');
    expect(rs.findIndex((r) => r.lemma === 'aufstehen')).toBeGreaterThan(rs.map((r) => r.lemma).lastIndexOf('stehen'));
  });

  it('um|fahren and umfahren', () => {
    const rs = an('umfährt').filter((r) => r.lemma === 'umfahren');
    expect(rs.some((r) => r.prefix === undefined)).toBe(true);
    expect(rs.some((r) => r.prefix?.attached === true)).toBe(true);
    reads('umgefahren', 'umfahren', { VerbForm: 'Part' }, (r) => r.prefix?.attached === true);
    reads('umfahren', 'umfahren', { VerbForm: 'Part' }, (r) => r.prefix === undefined);
    reads('fährt', 'umfahren', {}, (r) => r.prefix?.attached === false);
  });

  const irregular: Array<[string, string, Record<string, string>]> = [
    ['bin', 'sein', { Person: '1', Number: 'Sing' }], ['bist', 'sein', { Person: '2' }], ['ist', 'sein', { Person: '3', Number: 'Sing' }],
    ['sind', 'sein', { Person: '1,3', Number: 'Plur' }], ['seid', 'sein', { Person: '2', Number: 'Plur' }], ['war', 'sein', { Tense: 'Past' }],
    ['wäre', 'sein', { Mood: 'Sub', Tense: 'Past' }], ['gewesen', 'sein', { VerbForm: 'Part' }], ['sei', 'sein', { Mood: 'Imp' }],
    ['habe', 'haben', { Person: '1', Number: 'Sing' }], ['hat', 'haben', { Person: '3', Number: 'Sing' }], ['hätte', 'haben', { Mood: 'Sub' }],
    ['wird', 'werden', { Person: '3', Number: 'Sing' }], ['wurde', 'werden', { Mood: 'Ind', Tense: 'Past' }], ['würde', 'werden', { Mood: 'Sub' }],
    ['geworden', 'werden', { VerbForm: 'Part' }], ['worden', 'werden', { VerbForm: 'Part' }],
    ['weiß', 'wissen', { Person: '1,3', Number: 'Sing' }], ['wusste', 'wissen', { Tense: 'Past' }], ['wüsste', 'wissen', { Mood: 'Sub' }],
    ['tut', 'tun', { Person: '3', Number: 'Sing' }], ['tat', 'tun', { Tense: 'Past' }], ['täte', 'tun', { Mood: 'Sub' }], ['getan', 'tun', { VerbForm: 'Part' }],
    ['kann', 'können', { Person: '1,3', Number: 'Sing' }], ['könnte', 'können', { Mood: 'Sub' }], ['muss', 'müssen', { Person: '1,3' }],
    ['müsste', 'müssen', { Mood: 'Sub' }], ['darf', 'dürfen', { Person: '1,3' }], ['soll', 'sollen', { Person: '1,3' }], ['will', 'wollen', { Person: '1,3' }],
    ['möchte', 'mögen', { Mood: 'Sub', Tense: 'Past' }], ['mag', 'mögen', { Person: '1,3' }],
  ];
  it.each(irregular)('%s is a form of %s', (surface, lemma, morph) => reads(surface, lemma, morph));
});

describe('real lexicon: contractions', () => {
  const rows: Array<[string, string, string[], string[]]> = [
    ['im', 'in', ['Dm', 'Dn'], ['i', 'm']],
    ['am', 'an', ['Dm', 'Dn'], ['a', 'm']],
    ['beim', 'bei', ['Dm', 'Dn'], ['bei', 'm']],
    ['vom', 'von', ['Dm', 'Dn'], ['vo', 'm']],
    ['zum', 'zu', ['Dm', 'Dn'], ['zu', 'm']],
    ['zur', 'zu', ['Df'], ['zu', 'r']],
    ['ins', 'in', ['An'], ['in', 's']],
    ['ans', 'an', ['An'], ['an', 's']],
    ['aufs', 'auf', ['An'], ['auf', 's']],
    ['fürs', 'für', ['An'], ['für', 's']],
  ];
  it.each(rows)('%s = %s + the article, cells %j', (surface, prep, cells, parts) => {
    const r = an(surface).find((x) => x.pos === 'ADP' && x.lemma === prep)!;
    expect(r, surface).toBeDefined();
    expect(r.cells!.map((c) => `${c.c}${c.g}`)).toEqual(cells);
    expect(r.parts!.map((p) => p.text)).toEqual(parts);
    expect(r.parts![1]).toMatchObject({ lemma: 'der', pos: 'DET', kind: 'contracted' });
  });
});

describe('real lexicon: every entry', () => {
  it('every noun generates forms: none empty, none repeated, a paradigm with a nominative', () => {
    for (const n of lex.allNouns()) {
      const forms = declineNoun(n);
      expect(forms.length, n.lemma).toBeGreaterThan(0);
      const modern = forms.filter((f) => !(f as { older?: boolean }).older);
      expect(new Set(modern.map((f) => f.form)).size, `${n.lemma} repeats a form`).toBe(modern.length);
      for (const f of forms) {
        expect(f.form.length, n.lemma).toBeGreaterThan(1);
        expect(f.form, n.lemma).not.toMatch(/undefined|\s/);
        expect(f.cells.length, `${n.lemma}: ${f.form}`).toBeGreaterThan(0);
      }
      expect(modern.some((f) => f.cells.some((c) => c.c === 'N')), `${n.lemma} has no nominative`).toBe(true);
    }
  });

  it('every verb generates a full table of non-empty forms', () => {
    for (const v of lex.allVerbs()) {
      const c = conjugateGerman(v);
      for (const tense of ['pres', 'pret', 'subj1', 'subj2']) {
        for (const p of ['1s', '2s', '3s', '1p', '2p', '3p']) {
          const f = c.forms[`${tense}.${p}`];
          expect(typeof f === 'string' && f.length > 1 && !/undefined|\s/.test(f), `${v.lemma} ${tense}.${p} = ${f}`).toBe(true);
        }
      }
      for (const k of ['inf', 'inf.zu', 'part.past']) expect(c.forms[k]?.length, `${v.lemma} ${k}`).toBeGreaterThan(2);
      expect(new Set(['1s', '2s', '3s', '1p', '2p'].map((p) => c.forms[`pres.${p}`])).size, `${v.lemma} present all alike`).toBeGreaterThan(2);
      if (v.prefix) {
        expect(c.split, v.lemma).toBeDefined();
        expect(c.split!['pres.3s'][1]).toBe(v.prefix);
        expect(c.forms.inf.startsWith(v.prefix), v.lemma).toBe(true);
      }
    }
  });

  it('every adjective generates forms in all degrees', () => {
    for (const a of lex.allAdjectives()) {
      expect(declineAdjective(a).length, a.lemma).toBeGreaterThan(0);
      if (!a.indeclinable) {
        expect(declineAdjective(a, 'cmp').length, a.lemma).toBe(6);
        expect(declineAdjective(a, 'sup').length, a.lemma).toBe(5);
      }
    }
  });

  it('every form of every noun analyses back to its own lemma, with its cells', () => {
    let checked = 0;
    for (const n of lex.allNouns()) {
      for (const f of declineNoun(n)) {
        const rs = an(f.form).filter((r) => r.lemma === n.lemma && r.pos === 'NOUN');
        expect(rs.length, `${f.form} → ${n.lemma}`).toBeGreaterThan(0);
        for (const cell of f.cells) {
          expect(rs.some((r) => r.cells?.some((x) => x.c === cell.c && x.g === cell.g && x.decl === cell.decl)), `${f.form} cell ${cell.c}${cell.g}`).toBe(true);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(4000);
  });

  it('every form of every verb analyses back to its own lemma', () => {
    let checked = 0;
    for (const v of lex.allVerbs()) {
      const c = conjugateGerman(v);
      for (const [key, form] of Object.entries(c.forms)) {
        if (form.includes(' ') || (v.prefix && key.startsWith('imp.'))) continue;
        const rs = an(form).filter((r) => r.lemma === v.lemma && r.pos === 'VERB');
        expect(rs.length, `${form} (${key}) → ${v.lemma}`).toBeGreaterThan(0);
        if (v.prefix) expect(rs.some((r) => r.prefix?.attached === true), `${form} keeps its prefix attached`).toBe(true);
        checked++;
      }
      // the detached forms of a separable verb come back too
      for (const [key, [base, prefix]] of Object.entries(c.split ?? {})) {
        const rs = an(base).filter((r) => r.lemma === v.lemma && r.prefix?.text === prefix && r.prefix.attached === false);
        expect(rs.length, `${base} (${key}) detached → ${v.lemma}`).toBeGreaterThan(0);
      }
    }
    expect(checked).toBeGreaterThan(20000);
  });

  it('every form of every adjective analyses back to its own lemma', () => {
    for (const a of lex.allAdjectives()) {
      for (const degree of ['pos', 'cmp', 'sup'] as const) {
        for (const f of declineAdjective(a, degree)) {
          expect(an(f.form).some((r) => r.lemma === a.lemma && r.pos === 'ADJ'), `${f.form} → ${a.lemma}`).toBe(true);
        }
      }
    }
  });
});

describe('real lexicon: cost', () => {
  it('builds the index and answers 20,000 lookups quickly', () => {
    const view: DeLexiconView = { ...lex }; // a new view: the index is built afresh
    const surfaces: string[] = [];
    for (const n of lex.allNouns().slice(0, 300)) for (const f of declineNoun(n)) surfaces.push(f.form);
    for (const v of lex.allVerbs().slice(0, 300)) surfaces.push(...Object.values(conjugateGerman(v).forms).filter((f) => !f.includes(' ')));
    for (const a of lex.allAdjectives().slice(0, 100)) surfaces.push(...declineAdjective(a).map((f) => f.form));
    surfaces.push('Blumenvase', 'blorfte', 'schnurzige', 'im', 'zum', 'die', 'und');

    const t0 = performance.now();
    an('Mann', view);
    const buildMs = performance.now() - t0;
    const t1 = performance.now();
    let readings = 0;
    for (let i = 0; i < 20000; i++) readings += an(surfaces[(i * 7919) % surfaces.length], view).length;
    const lookupMs = performance.now() - t1;
    const t2 = performance.now();
    for (let i = 0; i < 20000; i++) an(surfaces[(i * 7919) % surfaces.length], view);
    const warmMs = performance.now() - t2;
    // eslint-disable-next-line no-console
    console.log(`index build ${buildMs.toFixed(0)} ms for ${lex.allNouns().length} nouns, ${lex.allVerbs().length} verbs, ${lex.allAdjectives().length} adjectives; `
      + `20,000 first lookups ${lookupMs.toFixed(0)} ms (${surfaces.length} distinct forms), 20,000 repeated ${warmMs.toFixed(0)} ms, ${readings} readings`);
    expect(buildMs).toBeLessThan(5000);
    expect(lookupMs).toBeLessThan(2000);
    expect(warmMs).toBeLessThan(2000);
  });
});
