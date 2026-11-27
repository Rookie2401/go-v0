/**
 * Modern Greek simple past (the aorist). The Wiktionary tables label it "past" + "perfective"; the tag table read no tense from that, so the form's
 * English was written as a present (αγοράσαμε "We buy": 11 of the 17 false cards the deck audit named for Modern Greek, 2026-11-26). The dependent form
 * (αγοράσουμε, after θα / να) is labelled "dependent" with no "past" and keeps no tense. Also: a parenthetical note in a verb's citation is dropped
 * before its senses are split ("to wash (your body, clothes, dishes)" gave "We washed (your body").
 */
import { describe, expect, it } from 'vitest';
import { elMorphFromTags } from '../../src/adapters/greek/tags';
import { greekInflectedMeaning } from '../../src/adapters/greek/word-analysis';
import { verbSensesOfCitation } from '../../src/core/english-verb';

describe('Modern Greek: the simple past is an aorist', () => {
  it('"past" with no other tense named is the aorist; the imperfect and the dependent form are as before', () => {
    expect(elMorphFromTags(['active', 'first-person', 'indicative', 'past', 'perfective', 'plural'])).toMatchObject({ Tense: 'Aor', Aspect: 'Perf', Mood: 'Ind', Person: '1', Number: 'Plur' });
    expect(elMorphFromTags(['active', 'first-person', 'imperfect', 'imperfective', 'indicative', 'singular']).Tense).toBe('Impf');
    expect(elMorphFromTags(['active', 'first-person', 'imperfect', 'past', 'indicative', 'singular']).Tense).toBe('Impf');
    expect(elMorphFromTags(['active', 'dependent', 'first-person', 'indicative', 'perfective', 'plural']).Tense).toBeUndefined();
  });

  it('the form\'s English is in the past', () => {
    const past = elMorphFromTags(['active', 'first-person', 'indicative', 'past', 'perfective', 'plural']);
    expect(greekInflectedMeaning('αγοράσαμε', 'αγοράζω', past, 'to buy, to purchase')).toBe('We bought');
    const third = elMorphFromTags(['active', 'indicative', 'past', 'perfective', 'plural', 'third-person']);
    expect(greekInflectedMeaning('έκλεισαν', 'κλείνω', third, 'to close, shut, close off')).toBe('They closed');
    const deponent = elMorphFromTags(['indicative', 'passive', 'past', 'perfective', 'second-person', 'singular']);
    expect(greekInflectedMeaning('κοιμήθηκες', 'κοιμάμαι', deponent, 'to sleep')).toBe('You slept');
  });
});

describe('a verb citation with a parenthetical note', () => {
  it('the note is dropped before the senses are split, so its commas are not sense breaks', () => {
    expect(verbSensesOfCitation('to wash (your body, clothes, dishes)').map((s) => [s.head, s.tail])).toEqual([['wash', '']]);
    expect(verbSensesOfCitation('to close (a door; a shop), shut').map((s) => s.head)).toEqual(['close', 'shut']);
    const past = elMorphFromTags(['active', 'first-person', 'indicative', 'past', 'perfective', 'plural']);
    expect(greekInflectedMeaning('πλύναμε', 'πλένω', past, 'to wash (your body, clothes, dishes)')).toBe('We washed');
  });
  it('the passive marker at the head of a group is still read', () => {
    expect(verbSensesOfCitation('to see; (PASS) to appear').map((s) => [s.head, !!s.passive])).toEqual([['see', false], ['appear', true]]);
  });
});

describe('Modern Greek: a table header is not the tense of the row', () => {
  it('the header "perfect" over a past or dependent perfective row names the section of the aspect, not the perfect tense', () => {
    const past = elMorphFromTags(['active', 'indicative', 'past', 'perfective', 'plural', 'table:perfect', 'third-person']);
    expect(past.Tense).toBe('Aor');
    expect(greekInflectedMeaning('γέμισαν', 'γεμίζω', past, 'to fill')).toBe('They filled');
    expect(elMorphFromTags(['active', 'dependent', 'indicative', 'perfective', 'plural', 'table:perfect', 'third-person']).Tense).toBeUndefined();
    // an Ancient table's header still names the tense of a row that names none
    expect(elMorphFromTags(['active', 'indicative', 'singular', 'third-person', 'table:Epic aorist']).Tense).toBe('Aor');
  });
});

describe('a verb citation with two verbs in one sense', () => {
  it('"come or go away from" is read by its first verb', () => {
    expect(verbSensesOfCitation('I come or go away from, depart, return').map((x) => [x.head, x.tail])).toEqual([['come', 'away from'], ['depart', ''], ['return', '']]);
    const morph = { Tense: 'Aor', Mood: 'Ind', Voice: 'Act', Person: '3', Number: 'Sing', VerbForm: 'Fin' };
    expect(greekInflectedMeaning('ἀπῆλθεν', 'ἀπέρχομαι', morph, 'I come or go away from, depart, return')).toBe('He, she, or it came away from');
  });
});
