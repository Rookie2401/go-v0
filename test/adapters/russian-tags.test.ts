/**
 * Russian tag bundles → features (src/adapters/russian/tags.ts, describe.ts).
 *
 * TOP_BUNDLES is the 300 commonest bundles of "<pos> <tags>" in the real Wiktionary extract (data/dictionaries/kaikki.org-dictionary-Russian
 * .jsonl.gz, read 2026-11-17: the rows of inflection tables plus the labels of form-of senses, counted together). Every one must map to
 * at least one feature and name no label the reader does not know.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  RU_FEATURES, isKnownRuTag, resetRuUnknownTags, ruFeaturesFromTableTags, ruFeaturesOfCode, ruMorphFromTags, ruUnknownTags,
} from '../../src/adapters/russian/tags';
import { describeRuMorph } from '../../src/adapters/russian/describe';

const TOP_BUNDLES: string[] = [
  'verb feminine|instrumental',
  'noun instrumental|singular',
  'noun genitive|singular',
  'noun prepositional|singular',
  'noun dative|singular',
  'noun nominative|singular',
  'noun accusative|singular',
  'noun instrumental|plural',
  'noun dative|plural',
  'noun plural|prepositional',
  'noun genitive|plural',
  'noun nominative|plural',
  'noun accusative|plural',
  'verb accusative|animate|masculine',
  'verb accusative|animate|plural',
  'verb accusative|feminine',
  'verb accusative|inanimate|masculine',
  'verb accusative|inanimate|plural',
  'verb accusative|neuter',
  'verb dative|feminine',
  'verb dative|masculine|neuter',
  'verb dative|plural',
  'verb feminine|genitive',
  'verb feminine|nominative',
  'verb feminine|prepositional',
  'verb genitive|masculine|neuter',
  'verb genitive|plural',
  'verb instrumental|masculine|neuter',
  'verb instrumental|plural',
  'verb masculine|neuter|prepositional',
  'verb masculine|nominative',
  'verb neuter|nominative',
  'verb nominative|plural',
  'verb plural|prepositional',
  'verb adverbial|participle|past',
  'noun form-of|instrumental|plural',
  'noun dative|form-of|plural',
  'adj feminine|instrumental',
  'noun form-of|plural|prepositional',
  'noun form-of|genitive|singular',
  'noun accusative|form-of|nominative|plural',
  'noun form-of|genitive|plural',
  'verb masculine|past|singular',
  'verb neuter|past|singular',
  'verb feminine|past|plural',
  'verb masculine|past|plural',
  'verb neuter|past|plural',
  'verb imperative|second-person|singular',
  'verb first-person|future|plural',
  'verb future|plural|second-person',
  'verb future|second-person|singular',
  'verb future|singular|third-person',
  'verb future|plural|third-person',
  'verb imperative|plural|second-person',
  'verb active|participle|past',
  'verb participle|passive|past',
  'verb adverbial|participle|present',
  'verb present|second-person|singular',
  'verb first-person|plural|present',
  'verb plural|present|second-person',
  'verb plural|present|third-person',
  'verb present|singular|third-person',
  'verb first-person|future|singular',
  'verb active|participle|present',
  'verb feminine|past|singular',
  'verb first-person|present|singular',
  'verb participle|passive|present',
  'noun dative|form-of|singular',
  'noun form-of|prepositional|singular',
  'adj nominative|plural',
  'adj accusative|feminine',
  'adj dative|plural',
  'adj feminine|nominative',
  'adj genitive|plural',
  'adj instrumental|plural',
  'adj plural|prepositional',
  'adj dative|feminine',
  'adj feminine|genitive',
  'adj feminine|prepositional',
  'adj masculine|nominative',
  'adj accusative|inanimate|plural',
  'adj neuter|nominative',
  'adj accusative|animate|masculine',
  'adj accusative|animate|plural',
  'adj accusative|inanimate|masculine',
  'adj accusative|neuter',
  'adj dative|masculine|neuter',
  'adj genitive|masculine|neuter',
  'adj instrumental|masculine|neuter',
  'adj masculine|neuter|prepositional',
  'verb feminine|short-form',
  'verb masculine|short-form',
  'verb neuter|short-form',
  'verb plural|short-form',
  'verb imperfective|infinitive',
  'noun accusative|form-of|singular',
  'verb infinitive|perfective',
  'verb form-of|imperfective|indicative|present|singular|third-person',
  'verb active|form-of|imperfective|participle|present',
  'verb form-of|imperfective|indicative|present|second-person|singular',
  'verb form-of|imperfective|indicative|plural|present|third-person',
  'verb form-of|imperfective|indicative|plural|present|second-person',
  'verb first-person|form-of|imperfective|indicative|plural|present',
  'verb active|form-of|imperfective|participle|past',
  'verb adverbial|form-of|imperfective|participle|past',
  'verb first-person|form-of|imperfective|indicative|present|singular',
  'verb adverbial|form-of|imperfective|participle|present',
  'verb adverbial|form-of|participle|past|perfective',
  'verb form-of|future|indicative|perfective|singular|third-person',
  'verb form-of|future|indicative|perfective|second-person|singular',
  'verb first-person|form-of|future|indicative|perfective|plural',
  'verb form-of|future|indicative|perfective|plural|second-person',
  'verb form-of|future|indicative|perfective|plural|third-person',
  'verb form-of|imperative|imperfective|second-person|singular',
  'verb form-of|imperative|imperfective|plural|second-person',
  'verb active|form-of|participle|past|perfective',
  'verb form-of|imperfective|indicative|masculine|past|singular',
  'verb first-person|form-of|future|indicative|perfective|singular',
  'verb form-of|imperfective|indicative|neuter|past|singular',
  'verb feminine|form-of|imperfective|indicative|past|singular',
  'verb form-of|imperfective|indicative|past|plural',
  'noun dative|form-of|prepositional|singular',
  'verb form-of|imperative|perfective|second-person|singular',
  'noun form-of|nominative|plural',
  'verb form-of|imperative|perfective|plural|second-person',
  'verb form-of|indicative|masculine|past|perfective|singular',
  'verb form-of|indicative|neuter|past|perfective|singular',
  'verb feminine|form-of|indicative|past|perfective|singular',
  'verb form-of|indicative|past|perfective|plural',
  'adj plural|short-form',
  'adj masculine|short-form',
  'adj feminine|short-form',
  'name instrumental|singular',
  'adj neuter|short-form',
  'verb adverbial|form-of|imperfective|participle|past|short-form',
  'noun accusative|form-of|genitive|plural',
  'verb adverbial|form-of|participle|past|perfective|short-form',
  'name dative|singular',
  'name genitive|singular',
  'name prepositional|singular',
  'name nominative|singular',
  'name accusative|singular',
  'noun accusative|form-of|genitive|singular',
  'verb form-of|imperfective|participle|passive|present',
  'verb form-of|participle|passive|past|perfective',
  'noun dated|instrumental|singular',
  'noun dative|form-of|genitive|prepositional|singular',
  'verb form-of|passive',
  'name instrumental|plural',
  'name dative|plural',
  'name plural|prepositional',
  'name genitive|plural',
  'name nominative|plural',
  'name accusative|plural',
  'noun dated|genitive|singular',
  'noun dated|dative|singular',
  'noun dated|prepositional|singular',
  'noun dated|nominative|singular',
  'noun dated|instrumental|plural',
  'noun dated|dative|plural',
  'noun dated|plural|prepositional',
  'noun accusative|dated|singular',
  'noun dated|genitive|plural',
  'noun dated|nominative|plural',
  'noun accusative|dated|plural',
  'adj form-of|masculine|short-form|singular',
  'adj form-of|neuter|short-form|singular',
  'adj form-of|plural|short-form',
  'adj feminine|form-of|short-form|singular',
  'verb form-of|imperfective|participle|passive|past',
  'noun feminine|form-of',
  'noun feminine|form-of|genitive|inanimate|plural',
  'name feminine|instrumental',
  'name accusative|feminine',
  'name dative|feminine',
  'name feminine|genitive',
  'name feminine|nominative',
  'name feminine|prepositional',
  'name masculine|nominative',
  'name accusative|masculine',
  'name dative|masculine',
  'name genitive|masculine',
  'name instrumental|masculine',
  'name masculine|prepositional',
  'noun diminutive|form-of',
  'adj dated|feminine|instrumental',
  'name feminine|instrumental|rare',
  'name dated|instrumental|singular',
  'noun accusative|irregular|plural',
  'noun irregular|nominative|plural',
  'noun accusative|form-of|inanimate|plural',
  'noun accusative|animate|form-of|plural',
  'noun accusative|animate|plural',
  'verb adverbial|dated|participle|past',
  'noun accusative|animate|singular',
  'noun accusative|inanimate|plural',
  'noun accusative|inanimate|singular',
  'noun feminine|form-of|inanimate|instrumental|singular',
  'verb form-of|imperfective|indicative|masculine|past|perfective|singular',
  'verb form-of|imperfective|indicative|neuter|past|perfective|singular',
  'verb form-of|imperfective|indicative|past|perfective|plural',
  'verb feminine|form-of|imperfective|indicative|past|perfective|singular',
  'verb form-of|imperative|imperfective|perfective|second-person|singular',
  'noun genitive|irregular|plural',
  'verb form-of|imperative|imperfective|perfective|plural|second-person',
  'adj feminine|form-of|nominative|singular',
  'noun form-of|instrumental',
  'noun dative|form-of',
  'adj feminine|instrumental|possessive',
  'adj accusative|animate|dated|masculine',
  'adj dated|genitive|masculine|neuter',
  'noun form-of|prepositional',
  'name dated|dative|singular',
  'name dated|genitive|singular',
  'name dated|prepositional|singular',
  'name dated|nominative|singular',
  'name accusative|dated|singular',
  'adj accusative|animate|dated|feminine|masculine|neuter',
  'adj dated|dative|feminine',
  'adj dated|dative|feminine|masculine|neuter',
  'adj dated|dative|masculine|neuter',
  'adj dated|feminine|genitive',
  'adj dated|feminine|genitive|masculine|neuter',
  'adj dated|feminine|instrumental|masculine|neuter',
  'adj dated|feminine|masculine|neuter|prepositional',
  'adj dated|feminine|prepositional',
  'adj dated|instrumental|masculine|neuter',
  'adj accusative|dated|feminine',
  'adj accusative|dated|feminine|inanimate|neuter|plural',
  'adj accusative|dated|inanimate|masculine',
  'adj accusative|dated|inanimate|masculine|plural',
  'adj accusative|dated|neuter',
  'adj dated|feminine|neuter|nominative|plural',
  'adj dated|feminine|nominative',
  'adj dated|masculine|neuter|prepositional',
  'adj dated|masculine|nominative',
  'adj dated|masculine|nominative|plural',
  'adj dated|neuter|nominative',
  'noun form-of|genitive',
  'noun accusative|animate|form-of|singular',
  'verb dated|masculine|past|singular',
  'pron feminine|instrumental|personal|pronoun|singular|third-person',
  'verb adverbial|dated|participle|present',
  'adj accusative|form-of|neuter|nominative|singular',
  'noun alt-of|dated',
  'verb dated|neuter|past|singular',
  'verb dated|imperative|second-person|singular',
  'verb dated|present|second-person|singular',
  'adv comparative|form-of',
  'adj dated|feminine|masculine|neuter|short-form',
  'verb dated|first-person|plural|present',
  'verb dated|first-person|present|singular',
  'verb dated|plural|present|second-person',
  'verb dated|plural|present|third-person',
  'suffix dative|plural',
  'suffix instrumental|plural',
  'suffix plural|prepositional',
  'verb dated|imperative|plural|second-person',
  'verb dated|feminine|past|plural',
  'verb dated|masculine|past|plural',
  'verb dated|neuter|past|plural',
  'verb dated|participle|passive|past',
  'suffix instrumental|singular',
  'verb active|dated|participle|past',
  'verb dated|present|singular|third-person',
  'noun accusative|form-of|genitive|plural|prepositional',
  'suffix nominative|plural',
  'verb active|dated|participle|present',
  'verb dated|feminine|past|singular',
  'verb dated|participle|passive|present',
  'suffix genitive|plural',
  'verb dated|first-person|future|plural',
  'verb dated|first-person|future|singular',
  'verb dated|future|plural|second-person',
  'verb dated|future|plural|third-person',
  'verb dated|future|second-person|singular',
  'verb dated|future|singular|third-person',
  'adj alt-of|alternative',
  'adj form-of|nominative|plural',
  'adj accusative|form-of|inanimate|plural',
  'noun partitive|singular',
  'pron accusative|first-person|personal|pronoun',
  'pron accusative|personal|pronoun|second-person',
  'pron dative|first-person|personal|pronoun',
  'pron dative|personal|pronoun|second-person',
  'pron first-person|genitive|personal|pronoun',
  'pron first-person|instrumental|personal|pronoun',
  'pron first-person|nominative|personal|pronoun',
  'pron first-person|personal|prepositional|pronoun',
  'pron genitive|personal|pronoun|second-person',
  'pron instrumental|personal|pronoun|second-person',
  'pron nominative|personal|pronoun|second-person',
  'pron personal|prepositional|pronoun|second-person',
  'adj dated|neuter|short-form',
  'adj accusative|animate|form-of|plural',
  'adj dated|feminine|short-form',
  'adj dated|masculine|short-form',
  'adj form-of|genitive|masculine|neuter|singular',
  'noun locative|singular',
  'noun form-of|genitive|plural|prepositional',
];

const PLAN_KEYS = ['Case', 'Number', 'Gender', 'Animacy', 'Person', 'Tense', 'Mood', 'VerbForm', 'Voice', 'Aspect', 'Degree', 'Variant', 'Reflex'];

afterEach(() => resetRuUnknownTags());

describe('ruFeaturesOfCode', () => {
  it('a noun row: case and number from the row, gender and animacy from the lexeme', () => {
    expect(ruFeaturesOfCode('accusative|singular', 'NOUN', 'Animacy=Inan|Gender=Fem').morph)
      .toEqual({ Case: 'Acc', Number: 'Sing', Gender: 'Fem', Animacy: 'Inan' });
  });

  it('a noun row with a case and no number is singular; one with a plural is not', () => {
    expect(ruFeaturesOfCode('genitive', 'NOUN', 'Animacy=Inan|Gender=Fem').morph).toMatchObject({ Case: 'Gen', Number: 'Sing' });
    expect(ruFeaturesOfCode('nominative|plural', 'NOUN', 'Animacy=Inan|Gender=Fem').morph).toMatchObject({ Case: 'Nom', Number: 'Plur', Gender: 'Fem' });
  });

  it("the row's own animacy tag wins over the lexeme's", () => {
    expect(ruFeaturesOfCode('accusative|animate|masculine', 'ADJ', '').morph).toEqual({ Case: 'Acc', Animacy: 'Anim', Gender: 'Masc', Number: 'Sing' });
    expect(ruFeaturesOfCode('accusative|inanimate|singular', 'NOUN', 'Animacy=Anim|Gender=Masc').morph.Animacy).toBe('Inan');
  });

  it('the second locative, the partitive and the vocative are their own cases', () => {
    expect(ruFeaturesOfCode('locative|singular', 'NOUN', 'Gender=Masc').morph.Case).toBe('Loc');
    expect(ruFeaturesOfCode('partitive|singular', 'NOUN', 'Gender=Masc').morph.Case).toBe('Par');
    expect(ruFeaturesOfCode('singular|vocative', 'PROPN', 'Gender=Fem').morph.Case).toBe('Voc');
    expect(ruFeaturesOfCode('instrumental|singular', 'NOUN', '').morph.Case).toBe('Ins');
    expect(ruFeaturesOfCode('plural|prepositional', 'NOUN', '').morph.Case).toBe('Prep');
  });

  it('a perfective past: finite, indicative, the aspect from the lexeme, no subcategorisation key', () => {
    expect(ruFeaturesOfCode('feminine|past|singular', 'VERB', 'Aspect=Perf|Subcat=Tran').morph)
      .toEqual({ Gender: 'Fem', Tense: 'Past', Number: 'Sing', VerbForm: 'Fin', Mood: 'Ind', Aspect: 'Perf' });
  });

  it('the present, and the "future" the source gives a perfective verb', () => {
    expect(ruFeaturesOfCode('first-person|present|singular', 'VERB', 'Aspect=Imp').morph)
      .toEqual({ Person: '1', Tense: 'Pres', Number: 'Sing', VerbForm: 'Fin', Mood: 'Ind', Aspect: 'Imp' });
    expect(ruFeaturesOfCode('first-person|future|singular', 'VERB', 'Aspect=Perf').morph)
      .toEqual({ Person: '1', Tense: 'Fut', Number: 'Sing', VerbForm: 'Fin', Mood: 'Ind', Aspect: 'Perf' });
  });

  it('a past plural has no gender', () => {
    expect(ruFeaturesOfCode('masculine|past|plural', 'VERB', 'Aspect=Imp').morph).toEqual({ Tense: 'Past', Number: 'Plur', VerbForm: 'Fin', Mood: 'Ind', Aspect: 'Imp' });
  });

  it('the imperative and the infinitive', () => {
    expect(ruFeaturesOfCode('imperative|plural', 'VERB', 'Aspect=Imp').morph).toEqual({ Mood: 'Imp', Number: 'Plur', VerbForm: 'Fin', Aspect: 'Imp' });
    expect(ruFeaturesOfCode('imperative|second-person|singular', 'VERB', 'Aspect=Perf').morph).toEqual({ Mood: 'Imp', Person: '2', Number: 'Sing', VerbForm: 'Fin', Aspect: 'Perf' });
    expect(ruFeaturesOfCode('infinitive|imperfective', 'VERB', '').morph).toEqual({ VerbForm: 'Inf', Aspect: 'Imp' });
    // the lexeme's aspect decides
    expect(ruFeaturesOfCode('imperfective|infinitive', 'VERB', 'Aspect=Imp,Perf').morph.Aspect).toBe('Imp,Perf');
  });

  it('participles, with and without the declension merged in', () => {
    expect(ruFeaturesOfCode('active|participle|present', 'VERB', 'Aspect=Imp').morph)
      .toEqual({ VerbForm: 'Part', Voice: 'Act', Tense: 'Pres', Aspect: 'Imp' });
    expect(ruFeaturesOfCode('active|genitive|masculine|participle|present|singular', 'VERB', 'Aspect=Imp').morph)
      .toEqual({ VerbForm: 'Part', Voice: 'Act', Tense: 'Pres', Case: 'Gen', Gender: 'Masc', Number: 'Sing', Aspect: 'Imp' });
    expect(ruFeaturesOfCode('masculine|participle|passive|past|short-form', 'VERB', 'Aspect=Perf').morph)
      .toEqual({ VerbForm: 'Part', Voice: 'Pass', Tense: 'Past', Variant: 'Short', Gender: 'Masc', Number: 'Sing', Aspect: 'Perf' });
  });

  it("adverbial participles: a verb form of their own with a tense, nothing of the noun's agreement", () => {
    expect(ruFeaturesOfCode('adverbial|participle|past', 'VERB', 'Aspect=Perf').morph).toEqual({ VerbForm: 'Conv', Tense: 'Past', Aspect: 'Perf' });
    expect(ruFeaturesOfCode('adverbial|participle|past|short-form', 'VERB', 'Aspect=Perf').morph).toEqual({ VerbForm: 'Conv', Tense: 'Past', Aspect: 'Perf' });
    expect(ruFeaturesOfCode('adverbial|participle|present', 'VERB', 'Aspect=Imp').morph).toEqual({ VerbForm: 'Conv', Tense: 'Pres', Aspect: 'Imp' });
  });

  it('short forms and comparatives', () => {
    expect(ruFeaturesOfCode('masculine|short-form', 'ADJ', '').morph).toEqual({ Variant: 'Short', Gender: 'Masc', Number: 'Sing' });
    expect(ruFeaturesOfCode('plural|short-form', 'ADJ', '').morph).toEqual({ Variant: 'Short', Number: 'Plur' });
    expect(ruFeaturesOfCode('comparative', 'ADJ', '').morph).toEqual({ Degree: 'Cmp' });
    expect(ruFeaturesOfCode('comparative', 'ADV', '').morph).toEqual({ Degree: 'Cmp' });
  });

  it('adjective and pronoun rows: a gender with no number is singular; a plural drops the gender', () => {
    expect(ruFeaturesOfCode('feminine|instrumental', 'ADJ', '').morph).toEqual({ Gender: 'Fem', Case: 'Ins', Number: 'Sing' });
    expect(ruFeaturesOfCode('genitive|masculine|neuter', 'ADJ', '').morph).toEqual({ Case: 'Gen', Gender: 'Masc,Neut', Number: 'Sing' });
    expect(ruFeaturesOfCode('accusative|animate|plural', 'ADJ', '').morph).toEqual({ Case: 'Acc', Animacy: 'Anim', Number: 'Plur' });
    expect(ruFeaturesOfCode('feminine|nominative|plural', 'PRON', '').morph).toEqual({ Case: 'Nom', Number: 'Plur' });
    // a personal pronoun row gives a person and a case and invents no number
    expect(ruFeaturesOfCode('first-person|genitive|personal|pronoun', 'PRON', '').morph).toEqual({ Person: '1', Case: 'Gen' });
    expect(ruFeaturesOfCode('genitive|personal|pronoun|reflexive', 'PRON', '').morph).toEqual({ Case: 'Gen', Reflex: 'Yes' });
  });

  it('a numeral row with a gender and no number gets no number', () => {
    expect(ruFeaturesOfCode('masculine|neuter|nominative', 'NUM', '').morph).toEqual({ Gender: 'Masc,Neut', Case: 'Nom' });
    expect(ruFeaturesOfCode('nominative|plural', 'NUM', '').morph).toEqual({ Case: 'Nom', Number: 'Plur' });
    expect(ruFeaturesOfCode('feminine|nominative', 'ADJ', '').morph.Number).toBe('Sing');
  });

  it('a union of cases in one bundle is sorted', () => {
    expect(ruFeaturesOfCode('accusative|nominative|plural', 'NOUN', 'Animacy=Inan|Gender=Fem').morph.Case).toBe('Acc,Nom');
  });

  it('register labels go to usage and never to morph', () => {
    const r = ruFeaturesOfCode('dated|instrumental|singular', 'NOUN', 'Gender=Fem');
    expect(r.usage).toEqual(['dated']);
    expect(Object.values(r.morph)).not.toContain('dated');
    expect(Object.keys(r.morph).sort()).toEqual(['Case', 'Gender', 'Number']);
    expect(ruFeaturesOfCode('colloquial|dated|nonstandard|proscribed|rare', 'NOUN', '').usage).toEqual(['colloquial', 'dated', 'nonstandard', 'proscribed', 'rare']);
  });

  it('only the keys and values of the plan appear', () => {
    const valid: Record<string, Set<string>> = {};
    for (const f of RU_FEATURES) valid[f.key] = new Set(Object.keys(f.values));
    for (const line of TOP_BUNDLES) {
      const sp = line.indexOf(' ');
      const { morph } = ruFeaturesOfCode(line.slice(sp + 1), line.slice(0, sp), 'Animacy=Inan|Gender=Fem|Aspect=Perf|Subcat=Tran');
      for (const [k, v] of Object.entries(morph)) {
        expect(PLAN_KEYS, `${line} → ${k}`).toContain(k);
        for (const piece of v.split(',')) expect(valid[k].has(piece), `${line} → ${k}=${v}`).toBe(true);
      }
    }
  });
});

describe('the unknown labels', () => {
  it('an unknown label is ignored and counted', () => {
    resetRuUnknownTags();
    const r = ruFeaturesOfCode('accusative|zzz-not-a-label|singular', 'NOUN', '');
    expect(r.morph).toEqual({ Case: 'Acc', Number: 'Sing' });
    expect(ruUnknownTags()).toEqual([['zzz-not-a-label', 1]]);
    ruFeaturesOfCode('zzz-not-a-label', 'NOUN', '');
    expect(ruUnknownTags()).toEqual([['zzz-not-a-label', 2]]);
    expect(isKnownRuTag('zzz-not-a-label')).toBe(false);
    expect(isKnownRuTag('accusative')).toBe(true);
    expect(isKnownRuTag('dated')).toBe(true);
  });

  it('the 300 commonest bundles of the real data each map to a feature and name no unknown label', () => {
    resetRuUnknownTags();
    const unmapped: string[] = [];
    for (const line of TOP_BUNDLES) {
      const sp = line.indexOf(' ');
      const { morph } = ruFeaturesOfCode(line.slice(sp + 1), line.slice(0, sp), '');
      // a sense that only says "diminutive of" or "alternative form of" names a relation between words, not a form
      if (Object.keys(morph).length === 0 && !/(^|[ |])(diminutive|alt-of)([|]|$)/.test(line)) unmapped.push(line);
    }
    expect(TOP_BUNDLES.length).toBe(300);
    expect(unmapped).toEqual([]);
    expect(ruUnknownTags()).toEqual([]);
  });
});

describe('ruMorphFromTags (a form-of sense)', () => {
  it('reads the labels of a dictionary sense', () => {
    expect(ruMorphFromTags(['form-of', 'instrumental', 'singular'])).toEqual({ Case: 'Ins', Number: 'Sing' });
    expect(ruMorphFromTags(['form-of', 'accusative', 'nominative', 'plural'])).toEqual({ Case: 'Acc,Nom', Number: 'Plur' });
    expect(ruMorphFromTags(['form-of', 'imperfective', 'indicative', 'present', 'singular', 'third-person']))
      .toEqual({ Aspect: 'Imp', Mood: 'Ind', Tense: 'Pres', Number: 'Sing', Person: '3', VerbForm: 'Fin' });
    expect(ruMorphFromTags(['adverbial', 'form-of', 'participle', 'past', 'perfective'])).toEqual({ VerbForm: 'Conv', Tense: 'Past', Aspect: 'Perf' });
    expect(ruMorphFromTags(['form-of', 'masculine', 'short-form', 'singular'])).toEqual({ Gender: 'Masc', Variant: 'Short', Number: 'Sing' });
  });

  it('a register label gives no feature, an alternative-form sense gives none at all', () => {
    expect(ruMorphFromTags(['form-of', 'dative', 'colloquial'])).toEqual({ Case: 'Dat', Number: 'Sing' });
    expect(ruMorphFromTags(['alt-of', 'alternative'])).toEqual({});
  });
});

describe('ruFeaturesFromTableTags (one row of a dictionary table)', () => {
  it('a cell gives its features', () => {
    expect(ruFeaturesFromTableTags(['nominative', 'singular'], 'NOUN')).toEqual({ Case: 'Nom', Number: 'Sing' });
    expect(ruFeaturesFromTableTags(['plural', 'prepositional'], 'NOUN')).toEqual({ Case: 'Prep', Number: 'Plur' });
    expect(ruFeaturesFromTableTags(['feminine', 'past', 'singular'], 'VERB')).toEqual({ Gender: 'Fem', Tense: 'Past', Number: 'Sing', VerbForm: 'Fin', Mood: 'Ind' });
    expect(ruFeaturesFromTableTags(['imperfective', 'infinitive'], 'VERB')).toEqual({ Aspect: 'Imp', VerbForm: 'Inf' });
    expect(ruFeaturesFromTableTags(['adverbial', 'participle', 'past'], 'VERB')).toEqual({ VerbForm: 'Conv', Tense: 'Past' });
  });

  it("the template's own rows and the head line's relations are not cells", () => {
    for (const t of ['canonical', 'romanization', 'table-tags', 'inflection-template', 'class', 'diminutive', 'augmentative', 'relational']) {
      expect(ruFeaturesFromTableTags([t], 'NOUN'), t).toBeUndefined();
    }
    expect(ruFeaturesFromTableTags(['animate', 'canonical', 'feminine'], 'NOUN')).toBeUndefined();
    expect(ruFeaturesFromTableTags(['perfective'], 'VERB')).toBeUndefined();
    expect(ruFeaturesFromTableTags(['error-unrecognized-form'], 'PROPN')).toBeUndefined();
  });

  it('the declined participles of a verb entry (no participle label on the row) are not cells of the verb', () => {
    expect(ruFeaturesFromTableTags(['feminine', 'instrumental'], 'VERB')).toBeUndefined();
    expect(ruFeaturesFromTableTags(['feminine', 'short-form'], 'VERB')).toBeUndefined();
  });

  it('the analytic future: Tense=Fut with person and number', () => {
    expect(ruFeaturesFromTableTags(['first-person', 'future', 'singular'], 'VERB', 'бу́ду чита́ть'))
      .toEqual({ Person: '1', Tense: 'Fut', Number: 'Sing', VerbForm: 'Fin', Mood: 'Ind' });
  });
});

describe('RU_FEATURES', () => {
  it('has one entry per feature key of the plan, each with its values and an explanation with a Russian example', () => {
    expect(RU_FEATURES.map((f) => f.key)).toEqual(PLAN_KEYS);
    for (const f of RU_FEATURES) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(Object.keys(f.values).length).toBeGreaterThan(0);
      expect(f.explain).toMatch(/[а-яё]/i);
    }
  });

  it('Case names the six cases; Aspect does not say "finished"; Tense says what a perfective present means', () => {
    const c = RU_FEATURES.find((f) => f.key === 'Case')!.explain.toLowerCase();
    for (const w of ['nominative', 'genitive', 'dative', 'accusative', 'instrumental', 'prepositional']) expect(c).toContain(w);
    const a = RU_FEATURES.find((f) => f.key === 'Aspect')!.explain.toLowerCase();
    expect(a).not.toMatch(/finished|complete[d]? action/);
    expect(a).toContain('single whole');
    expect(a).toContain('process');
    expect(RU_FEATURES.find((f) => f.key === 'Tense')!.explain).toMatch(/perfective.*future/);
  });
});

describe('describeRuMorph', () => {
  it('a noun', () => {
    expect(describeRuMorph({ Case: 'Acc', Number: 'Sing', Gender: 'Fem', Animacy: 'Inan' }, 'NOUN')).toBe('accusative singular, feminine, inanimate');
  });
  it('a verb: past, present, imperative, infinitive', () => {
    expect(describeRuMorph({ Tense: 'Past', Gender: 'Fem', Number: 'Sing', VerbForm: 'Fin', Mood: 'Ind', Aspect: 'Perf' }, 'VERB')).toBe('past, feminine singular, perfective');
    expect(describeRuMorph({ Person: '1', Number: 'Sing', Tense: 'Pres', VerbForm: 'Fin', Mood: 'Ind', Aspect: 'Imp' }, 'VERB')).toBe('1st person singular, present, imperfective');
    expect(describeRuMorph({ Mood: 'Imp', Person: '2', Number: 'Plur', VerbForm: 'Fin', Aspect: 'Imp' }, 'VERB')).toBe('imperative, 2nd person plural, imperfective');
    expect(describeRuMorph({ VerbForm: 'Inf', Aspect: 'Perf' }, 'VERB')).toBe('infinitive, perfective');
  });
  it('participles and adverbial participles', () => {
    expect(describeRuMorph({ VerbForm: 'Part', Voice: 'Act', Tense: 'Pres', Case: 'Gen', Number: 'Sing', Gender: 'Masc' }, 'VERB')).toBe('present active participle, genitive singular masculine');
    expect(describeRuMorph({ VerbForm: 'Conv', Tense: 'Past', Aspect: 'Perf' }, 'VERB')).toBe('past adverbial participle (having …), perfective');
    expect(describeRuMorph({ VerbForm: 'Conv', Tense: 'Pres', Aspect: 'Imp' }, 'VERB')).toBe('present adverbial participle (while …), imperfective');
  });
  it('short forms, comparatives, unions', () => {
    expect(describeRuMorph({ Variant: 'Short', Gender: 'Masc', Number: 'Sing' }, 'ADJ')).toBe('short form, masculine singular');
    expect(describeRuMorph({ Degree: 'Cmp' }, 'ADJ')).toBe('comparative');
    expect(describeRuMorph({ Case: 'Acc,Nom', Number: 'Plur' }, 'ADJ')).toBe('nominative or accusative plural');
    expect(describeRuMorph({ Case: 'Gen', Gender: 'Masc,Neut', Number: 'Sing' }, 'ADJ')).toBe('genitive singular masculine or neuter');
    expect(describeRuMorph({ Case: 'Dat,Gen,Ins,Prep', Number: 'Sing', Gender: 'Fem' }, 'ADJ')).toBe('genitive, dative, instrumental or prepositional singular feminine');
  });
});
