/**
 * The dictionary's labels on a German form (`deMorphFromTags`), its region labels (`deVarietiesFromTags`) and the
 * varieties table. The label sets are the ones Wiktionary's German entries are expected to carry on form-of senses; the
 * inventory was written from knowledge of its conventions and has to be checked against the real file.
 */
import { describe, expect, it } from 'vitest';
import { varietyLine, varietyStanding, type VarietyPolicy } from '../../src/core';
import { DE_LABEL_VARIETIES, deMorphFromTags, deVarietiesFromTags } from '../../src/adapters/german/tags';
import { DE_VARIETIES, DE_VARIETY_CODES } from '../../src/adapters/german/varieties';

const morph = (labels: string) => deMorphFromTags(labels === '' ? [] : labels.split(' '));
const varieties = (labels: string) => deVarietiesFromTags(labels === '' ? [] : labels.split(' '));

const ROWS: Array<[labels: string, features: Record<string, string>]> = [
  // nouns, articles, pronouns
  ['nominative singular masculine', { Case: 'Nom', Number: 'Sing', Gender: 'Masc' }],
  ['genitive plural', { Case: 'Gen', Number: 'Plur' }],
  ['dative singular feminine', { Case: 'Dat', Number: 'Sing', Gender: 'Fem' }],
  ['accusative singular neuter', { Case: 'Acc', Number: 'Sing', Gender: 'Neut' }],
  ['accusative dative plural', { Case: 'Acc,Dat', Number: 'Plur' }],
  ['dative accusative plural', { Case: 'Acc,Dat', Number: 'Plur' }],
  ['genitive nominative accusative singular neuter', { Case: 'Nom,Acc,Gen', Number: 'Sing', Gender: 'Neut' }],
  ['nominative accusative feminine plural', { Case: 'Nom,Acc', Gender: 'Fem', Number: 'Plur' }],
  ['neuter masculine genitive singular', { Case: 'Gen', Number: 'Sing', Gender: 'Masc,Neut' }],
  ['feminine neuter masculine nominative singular', { Case: 'Nom', Number: 'Sing', Gender: 'Masc,Fem,Neut' }],
  ['first-person singular dative', { Case: 'Dat', Number: 'Sing', Person: '1' }],
  ['Nominative SINGULAR Masculine', { Case: 'Nom', Number: 'Sing', Gender: 'Masc' }],
  ['form-of no-gloss nominative', { Case: 'Nom' }],
  // adjectives
  ['nominative strong masculine singular', { Case: 'Nom', Gender: 'Masc', Number: 'Sing', Decl: 'Strong' }],
  ['dative singular weak masculine', { Case: 'Dat', Gender: 'Masc', Number: 'Sing', Decl: 'Weak' }],
  ['mixed nominative plural', { Case: 'Nom', Number: 'Plur', Decl: 'Mixed' }],
  ['weak mixed genitive plural', { Case: 'Gen', Number: 'Plur', Decl: 'Weak,Mixed' }],
  ['mixed strong weak accusative neuter singular', { Case: 'Acc', Gender: 'Neut', Number: 'Sing', Decl: 'Strong,Weak,Mixed' }],
  ['comparative', { Degree: 'Cmp' }],
  ['superlative nominative singular', { Case: 'Nom', Number: 'Sing', Degree: 'Sup' }],
  ['comparative superlative', {}], // both degrees: undecided, so neither
  ['definite nominative singular', { Case: 'Nom', Number: 'Sing' }], // definite / indefinite are article contexts: ignored
  ['indefinite genitive plural', { Case: 'Gen', Number: 'Plur' }],
  // finite verbs
  ['first-person singular present indicative', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing' }],
  ['third-person singular present indicative', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' }],
  ['indicative preterite second-person plural', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past', Person: '2', Number: 'Plur' }],
  ['first-person third-person singular preterite indicative', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past', Person: '1,3', Number: 'Sing' }],
  ['third-person first-person plural present indicative', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1,3', Number: 'Plur' }],
  ['first-person second-person third-person plural present subjunctive', { VerbForm: 'Fin', Mood: 'Sub', Tense: 'Pres', Person: '1,2,3', Number: 'Plur' }],
  ['past indicative third-person singular', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past', Person: '3', Number: 'Sing' }],
  ['past subjunctive third-person plural', { VerbForm: 'Fin', Mood: 'Sub', Tense: 'Past', Person: '3', Number: 'Plur' }],
  ['indicative present preterite first-person singular', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres,Past', Person: '1', Number: 'Sing' }],
  ['present indicative subjunctive third-person singular', { VerbForm: 'Fin', Mood: 'Ind,Sub', Tense: 'Pres', Person: '3', Number: 'Sing' }],
  // Konjunktiv I and II
  ['subjunctive-i first-person singular', { VerbForm: 'Fin', Mood: 'Sub', Tense: 'Pres', Person: '1', Number: 'Sing' }],
  ['third-person singular subjunctive-i', { VerbForm: 'Fin', Mood: 'Sub', Tense: 'Pres', Person: '3', Number: 'Sing' }],
  ['subjunctive-ii third-person plural', { VerbForm: 'Fin', Mood: 'Sub', Tense: 'Past', Person: '3', Number: 'Plur' }],
  ['first-person third-person singular subjunctive-ii', { VerbForm: 'Fin', Mood: 'Sub', Tense: 'Past', Person: '1,3', Number: 'Sing' }],
  ['subjunctive-i subjunctive-ii third-person singular', { VerbForm: 'Fin', Mood: 'Sub', Tense: 'Pres,Past', Person: '3', Number: 'Sing' }],
  // imperatives: a mood with person and number, no tense
  ['imperative second-person singular', { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' }],
  ['second-person plural imperative', { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Plur' }],
  ['imperative present second-person singular', { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' }],
  // non-finite forms
  ['infinitive', { VerbForm: 'Inf' }],
  ['infinitive present', { VerbForm: 'Inf' }],
  ['participle past', { VerbForm: 'Part', Tense: 'Past' }],
  ['past participle', { VerbForm: 'Part', Tense: 'Past' }],
  ['participle present', { VerbForm: 'Part', Tense: 'Pres' }],
  ['present participle', { VerbForm: 'Part', Tense: 'Pres' }],
  ['participle past nominative masculine singular strong', { VerbForm: 'Part', Tense: 'Past', Case: 'Nom', Gender: 'Masc', Number: 'Sing', Decl: 'Strong' }],
  ['participle past indicative', { VerbForm: 'Part', Tense: 'Past' }], // a participle has no mood
  // "past" alone is not a tense label; present / preterite alone are
  ['past', {}],
  ['past singular', { Number: 'Sing' }],
  ['preterite', { Tense: 'Past' }],
  ['present', { Tense: 'Pres' }],
  // unknown labels are ignored, never guessed
  ['', {}],
  ['form-of', {}],
  ['archaic dated rare', {}],
  ['colloquial first-person singular present indicative', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing' }],
  ['conditional third-person singular', { Person: '3', Number: 'Sing' }],
];

describe('deMorphFromTags', () => {
  it.each(ROWS)('%j', (labels, features) => {
    expect(morph(labels)).toEqual(features);
  });

  it('has at least 50 rows', () => { expect(ROWS.length).toBeGreaterThanOrEqual(50); });

  it('the order of the labels does not matter', () => {
    const base = ['third-person', 'singular', 'present', 'indicative'];
    const expected = morph(base.join(' '));
    expect(expected).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' });
    for (const perm of [[...base].reverse(), [base[2], base[0], base[3], base[1]], [base[1], base[3], base[0], base[2]]]) {
      expect(deMorphFromTags(perm)).toEqual(expected);
    }
  });

  it('a label written with spaces or capitals is the same label', () => {
    expect(deMorphFromTags(['First Person', 'Singular', 'Present', 'Indicative'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing' });
  });

  it('a comma list is always in the order of PLAN11', () => {
    expect(morph('genitive accusative dative nominative')['Case']).toBe('Nom,Acc,Dat,Gen');
    expect(morph('third-person second-person first-person')['Person']).toBe('1,2,3');
    expect(morph('neuter feminine masculine')['Gender']).toBe('Masc,Fem,Neut');
    expect(morph('plural singular')['Number']).toBe('Sing,Plur');
    expect(morph('mixed weak strong')['Decl']).toBe('Strong,Weak,Mixed');
    expect(morph('imperative subjunctive indicative')['Mood']).toBe('Ind,Sub,Imp');
  });

  it('every value it can return belongs to the conventions of PLAN11', () => {
    const allowed: Record<string, readonly string[]> = {
      Case: ['Nom', 'Acc', 'Dat', 'Gen'], Gender: ['Masc', 'Fem', 'Neut'], Number: ['Sing', 'Plur'], Person: ['1', '2', '3'],
      Mood: ['Ind', 'Sub', 'Imp'], Tense: ['Pres', 'Past'], VerbForm: ['Fin', 'Inf', 'Part'], Degree: ['Cmp', 'Sup'], Decl: ['Strong', 'Weak', 'Mixed'],
    };
    for (const [labels] of ROWS) {
      for (const [k, v] of Object.entries(morph(labels))) {
        expect(allowed[k], `${labels}: feature ${k}`).toBeDefined();
        for (const part of v.split(',')) expect(allowed[k], `${labels}: ${k}=${v}`).toContain(part);
      }
    }
  });

  it('a finite verb always has VerbForm Fin; a form with no mood never does', () => {
    for (const [labels] of ROWS) {
      const m = morph(labels);
      if (m.Mood) expect(m.VerbForm, labels).toBe('Fin');
      if (m.VerbForm === 'Inf') expect(Object.keys(m), labels).toEqual(['VerbForm']);
    }
  });
});

describe('deVarietiesFromTags', () => {
  it.each<[string, string[]]>([
    ['Austria', ['de-AT']],
    ['Austrian', ['de-AT']],
    ['Switzerland', ['de-CH']],
    ['Swiss', ['de-CH']],
    ['Southern-Germany', ['de-south']],
    ['Bavaria', ['de-south']],
    ['Northern-Germany', ['de-north']],
    ['dialectal', ['de-dialect']],
    ['regional', ['de-dialect']],
    ['Austria Switzerland', ['de-AT', 'de-CH']],
    ['Austria Austrian', ['de-AT']], // each code once
    ['Austria Bavaria dialectal', ['de-AT', 'de-south', 'de-dialect']],
    ['Germany', []], // not a label that marks a variety
    ['Liechtenstein', []], // an unmapped region is not guessed
    ['colloquial archaic dated', []],
    ['form-of nominative singular', []],
    ['', []],
  ])('%j → %j', (labels, codes) => {
    expect(varieties(labels)).toEqual(codes);
  });

  it('a label is read in any capitalisation, and a space is a hyphen', () => {
    expect(deVarietiesFromTags(['AUSTRIA'])).toEqual(['de-AT']);
    expect(deVarietiesFromTags(['southern Germany'])).toEqual(['de-south']);
  });

  it('every code it can return exists in DE_VARIETIES', () => {
    for (const [label, code] of Object.entries(DE_LABEL_VARIETIES)) {
      expect(DE_VARIETIES[code], `${label} → ${code}`).toBeDefined();
      expect(deVarietiesFromTags([label])).toEqual([code]);
    }
  });
});

describe('DE_VARIETIES', () => {
  const policy: VarietyPolicy = { target: 'de-DE', within: [] };
  const standing = (code: string) => varietyStanding([code], policy, DE_VARIETIES);

  it('has the codes the course needs, each stored under its own code', () => {
    for (const code of ['de-DE', 'de-AT', 'de-CH', 'de-south', 'de-north', 'de-1901', 'de-pre1901', 'de-dialect']) {
      expect(DE_VARIETIES[code]?.code).toBe(code);
      expect(DE_VARIETIES[code].label.length).toBeGreaterThan(2);
    }
    expect(DE_VARIETY_CODES.length).toBe(Object.keys(DE_VARIETIES).length);
  });

  it('kinds', () => {
    expect(DE_VARIETIES['de-DE'].kind).toBe('national');
    expect(DE_VARIETIES['de-AT'].kind).toBe('national');
    expect(DE_VARIETIES['de-CH'].kind).toBe('national');
    expect(DE_VARIETIES['de-1901'].kind).toBe('historical');
    expect(DE_VARIETIES['de-pre1901'].kind).toBe('historical');
    expect(DE_VARIETIES['de-dialect'].kind).toBe('regional');
    expect(DE_VARIETIES['de-south'].kind).toBe('regional');
    expect(DE_VARIETIES['de-north'].kind).toBe('regional');
  });

  it('the historical varieties say the words are the same and only the spelling is older', () => {
    expect(DE_VARIETIES['de-1901'].label).toBe('spelling before 1996');
    expect(DE_VARIETIES['de-pre1901'].label).toBe('spelling before 1901');
    for (const c of ['de-1901', 'de-pre1901']) expect(DE_VARIETIES[c].note).toMatch(/words are the same/);
  });

  it('standing for a learner of de-DE', () => {
    expect(standing('de-DE')).toBe('target');
    expect(standing('de-AT')).toBe('receptive');
    expect(standing('de-CH')).toBe('receptive');
    expect(standing('de-dialect')).toBe('receptive');
    expect(standing('de-1901')).toBe('historical');
    expect(standing('de-pre1901')).toBe('historical');
  });

  it('no tag is general; an unknown code is receptive, never the target', () => {
    expect(varietyStanding([], policy, DE_VARIETIES)).toBe('general');
    expect(varietyStanding(['de-XX'], policy, DE_VARIETIES)).toBe('receptive');
  });

  it('the plain sentence for the word sheet', () => {
    expect(varietyLine(['de-AT'], policy, DE_VARIETIES)).toContain('Austria');
    expect(varietyLine(['de-1901'], policy, DE_VARIETIES)).toContain('spelling before 1996');
    expect(varietyLine(['de-1901'], policy, DE_VARIETIES)).toContain('older language');
    expect(varietyLine(['de-DE'], policy, DE_VARIETIES)).toContain('aiming to use');
  });
});
