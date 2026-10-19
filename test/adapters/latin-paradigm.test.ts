/**
 * Latin paradigms: the generated cells of nouns of all five declensions, adjectives, regular and irregular verbs, deponents; the layout;
 * the dictionary's table tags; and the round trip: every one-word generated cell analyses back to its lemma with its own features.
 */
import { describe, expect, it } from 'vitest';
import { cellOf, mergeParadigm } from '../../src/core/paradigm';
import type { PartOfSpeech } from '../../src/core';
import { laAdapter } from '../../src/adapters/la';
import { latinLexicon } from '../../src/adapters/latin/lexicon';

const para = (lemma: string, pos: PartOfSpeech) => laAdapter.paradigm!(lemma, pos);
const asCells = (cells: Array<{ form: string; features: Record<string, string>; note?: string }>) => cells.map((c) => ({ ...c, sources: ['generated' as const], status: 'generated' as const }));
const form = (lemma: string, pos: PartOfSpeech, features: Record<string, string>): string | undefined => {
  const p = para(lemma, pos);
  return p ? cellOf({ cells: asCells(p.cells) }, features)?.form : undefined;
};

describe('noun paradigms', () => {
  // lemma, then Nom Gen Dat Acc Abl Voc singular, then Nom Gen Dat Acc Abl plural
  const CASES: Array<[string, string[], string[]]> = [
    ['terra', ['terra', 'terrae', 'terrae', 'terram', 'terra', 'terra'], ['terrae', 'terrarum', 'terris', 'terras', 'terris']],
    ['dominus', ['dominus', 'domini', 'domino', 'dominum', 'domino', 'domine'], ['domini', 'dominorum', 'dominis', 'dominos', 'dominis']],
    ['verbum', ['verbum', 'verbi', 'verbo', 'verbum', 'verbo', 'verbum'], ['verba', 'verborum', 'verbis', 'verba', 'verbis']],
    ['rex', ['rex', 'regis', 'regi', 'regem', 'rege', 'rex'], ['reges', 'regum', 'regibus', 'reges', 'regibus']],
    ['civitas', ['civitas', 'civitatis', 'civitati', 'civitatem', 'civitate', 'civitas'], ['civitates', 'civitatum', 'civitatibus', 'civitates', 'civitatibus']],
    ['nomen', ['nomen', 'nominis', 'nomini', 'nomen', 'nomine', 'nomen'], ['nomina', 'nominum', 'nominibus', 'nomina', 'nominibus']],
    ['manus', ['manus', 'manus', 'manui', 'manum', 'manu', 'manus'], ['manus', 'manuum', 'manibus', 'manus', 'manibus']],
    ['res', ['res', 'rei', 'rei', 'rem', 're', 'res'], ['res', 'rerum', 'rebus', 'res', 'rebus']],
  ];
  for (const [lemma, sg, pl] of CASES) {
    it(`${lemma} declines`, () => {
      const f = (Case: string, Number: string) => form(lemma, 'NOUN', { Case, Number });
      expect(['Nom', 'Gen', 'Dat', 'Acc', 'Abl', 'Voc'].map((c) => f(c, 'Sing'))).toEqual(sg);
      expect(['Nom', 'Gen', 'Dat', 'Acc', 'Abl'].map((c) => f(c, 'Plur'))).toEqual(pl);
    });
  }
  it('a plural-only noun has plural cells only, and the layout has a row per case', () => {
    const p = para('tenebrae', 'NOUN')!;
    expect(p.cells.every((c) => c.features.Number === 'Plur')).toBe(true);
    expect(p.kind).toBe('noun-declension');
    expect(p.layout!.rows.values.map(([v]) => v)).toEqual(['Nom', 'Gen', 'Dat', 'Acc', 'Abl', 'Voc']);
  });
  it('gives deus and domus their irregular forms and domus a locative', () => {
    expect(form('deus', 'NOUN', { Case: 'Voc', Number: 'Sing' })).toBe('deus');
    expect(form('domus', 'NOUN', { Case: 'Loc', Number: 'Sing' })).toBe('domi');
    expect(form('domus', 'NOUN', { Case: 'Abl', Number: 'Sing' })).toBe('domo');
  });
  it('makes no table for an indeclinable word or an unknown lemma', () => {
    expect(para('et', 'CONJ')).toBeUndefined();
    expect(para('nonexistentum', 'NOUN')).toBeUndefined();
  });
});

describe('adjective paradigms', () => {
  it('bonus has three genders in three degrees', () => {
    const f = (features: Record<string, string>) => form('bonus', 'ADJ', features);
    expect(f({ Case: 'Gen', Number: 'Sing', Gender: 'Fem' })).toBe('bonae');
    expect(f({ Case: 'Acc', Number: 'Sing', Gender: 'Neut' })).toBe('bonum');
    expect(f({ Degree: 'Cmp', Case: 'Nom', Number: 'Sing', Gender: 'Masc' })).toBe('melior');
    expect(f({ Degree: 'Cmp', Case: 'Nom', Number: 'Sing', Gender: 'Neut' })).toBe('melius');
    expect(f({ Degree: 'Sup', Case: 'Nom', Number: 'Sing', Gender: 'Masc' })).toBe('optimus');
    expect(f({ Degree: 'Cmp', Case: 'Nom', Number: 'Plur', Gender: 'Neut' })).toBe('meliora');
  });
  it('fortis (third declension), pulcher (-er) and the regular superlatives', () => {
    expect(form('fortis', 'ADJ', { Case: 'Acc', Number: 'Sing', Gender: 'Masc' })).toBe('fortem');
    expect(form('fortis', 'ADJ', { Case: 'Nom', Number: 'Plur', Gender: 'Neut' })).toBe('fortia');
    expect(form('fortis', 'ADJ', { Degree: 'Sup', Case: 'Nom', Number: 'Sing', Gender: 'Masc' })).toBe('fortissimus');
    expect(form('pulcher', 'ADJ', { Case: 'Gen', Number: 'Sing', Gender: 'Fem' })).toBe('pulchrae');
    expect(form('pulcher', 'ADJ', { Degree: 'Sup', Case: 'Nom', Number: 'Sing', Gender: 'Masc' })).toBe('pulcherrimus');
  });
});

describe('verb paradigms', () => {
  const v = (lemma: string, features: Record<string, string>) => form(lemma, 'VERB', { VerbForm: 'Fin', ...features });
  it('the four conjugations in the present, future and perfect', () => {
    expect(v('amo', { Mood: 'Ind', Tense: 'Pres', Voice: 'Act', Person: '2', Number: 'Sing' })).toBe('amas');
    expect(v('amo', { Mood: 'Ind', Tense: 'Fut', Voice: 'Act', Person: '1', Number: 'Plur' })).toBe('amabimus');
    expect(v('habeo', { Mood: 'Ind', Tense: 'Imp', Voice: 'Act', Person: '3', Number: 'Plur' })).toBe('habebant');
    expect(v('dico', { Mood: 'Ind', Tense: 'Fut', Voice: 'Act', Person: '1', Number: 'Sing' })).toBe('dicam');
    expect(v('dico', { Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '3', Number: 'Plur' })).toBe('dixerunt');
    expect(v('facio', { Mood: 'Ind', Tense: 'Pres', Voice: 'Act', Person: '3', Number: 'Plur' })).toBe('faciunt');
    expect(v('audio', { Mood: 'Sub', Tense: 'Imp', Voice: 'Act', Person: '1', Number: 'Sing' })).toBe('audirem');
    expect(v('audio', { Mood: 'Ind', Tense: 'Pres', Voice: 'Pass', Person: '3', Number: 'Plur' })).toBe('audiuntur');
  });
  it('the perfect passive is a two-word cell, the deponent is active in meaning', () => {
    expect(v('amo', { Mood: 'Ind', Tense: 'Perf', Voice: 'Pass', Person: '3', Number: 'Sing' })).toBe('amatus est');
    expect(v('amo', { Mood: 'Ind', Tense: 'Pqp', Voice: 'Pass', Person: '3', Number: 'Plur' })).toBe('amati erant');
    expect(v('sequor', { Mood: 'Ind', Tense: 'Pres', Voice: 'Act', Person: '3', Number: 'Sing' })).toBe('sequitur');
    expect(v('sequor', { Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '3', Number: 'Sing' })).toBe('secutus est');
    expect(para('sequor', 'VERB')!.notes.join(' ')).toMatch(/Deponent/);
  });
  it('the irregular verbs come from the Romance tables', () => {
    expect(v('sum', { Mood: 'Ind', Tense: 'Imp', Voice: 'Act', Person: '3', Number: 'Sing' })).toBe('erat');
    expect(v('possum', { Mood: 'Ind', Tense: 'Pres', Voice: 'Act', Person: '3', Number: 'Sing' })).toBe('potest');
    expect(v('volo', { Mood: 'Ind', Tense: 'Pres', Voice: 'Act', Person: '3', Number: 'Sing' })).toBe('vult');
    expect(v('eo', { Mood: 'Ind', Tense: 'Fut', Voice: 'Act', Person: '3', Number: 'Sing' })).toBe('ibit');
    expect(v('exeo', { Mood: 'Ind', Tense: 'Pres', Voice: 'Act', Person: '3', Number: 'Plur' })).toBe('exeunt');
    expect(v('affero', { Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '3', Number: 'Sing' })).toBe('attulit');
  });
  it('infinitives, the layout and the notes', () => {
    const p = para('amo', 'VERB')!;
    expect(p.kind).toBe('verb-conjugation');
    expect(p.layout!.sections).toEqual(['VerbForm', 'Mood', 'Voice', 'Tense']);
    expect(cellOf({ cells: asCells(p.cells) }, { VerbForm: 'Inf', Tense: 'Pres', Voice: 'Act' })?.form).toBe('amare');
    expect(p.template).toContain('amo, amare, amavi, amatum');
  });
});

describe('the dictionary half: Wiktionary table tags', () => {
  const tags = (...t: string[]) => laAdapter.featuresFromTableTags!(t, 'VERB');
  it('maps verb rows', () => {
    expect(tags('active', 'first-person', 'indicative', 'present', 'singular')).toEqual({ VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', Voice: 'Act', Person: '1', Number: 'Sing' });
    expect(tags('active', 'future', 'indicative', 'perfect', 'singular', 'third-person')).toMatchObject({ Tense: 'FutPerf' });
    expect(tags('infinitive', 'passive', 'present')).toEqual({ VerbForm: 'Inf', Tense: 'Pres', Voice: 'Pass' });
    expect(tags('future', 'participle', 'passive')).toMatchObject({ VerbForm: 'Gdv' });
    expect(tags('accusative', 'gerund', 'noun-from-verb')).toEqual({ VerbForm: 'Ger', Case: 'Acc' });
  });
  it('ignores a form the adapter does not model (sigmatic future, potential infinitive, the inflection-template row)', () => {
    expect(tags('active', 'first-person', 'future', 'sigmatic', 'singular')).toBeUndefined();
    expect(tags('active', 'infinitive', 'perfect', 'potential')).toBeUndefined();
    expect(tags('inflection-template')).toBeUndefined();
  });
  it('maps noun and adjective rows (a noun keeps no gender)', () => {
    expect(laAdapter.featuresFromTableTags!(['genitive', 'plural'], 'NOUN')).toEqual({ Case: 'Gen', Number: 'Plur' });
    expect(laAdapter.featuresFromTableTags!(['feminine', 'genitive', 'singular'], 'ADJ')).toEqual({ Case: 'Gen', Number: 'Sing', Gender: 'Fem' });
    expect(laAdapter.morphFromTags!(['first-person', 'plural', 'imperfect', 'subjunctive'])).toMatchObject({ Person: '1', Number: 'Plur', Tense: 'Imp', Mood: 'Sub' });
  });
  it('merges with a dictionary table: agreeing cells are verified', () => {
    const g = para('terra', 'NOUN')!;
    const merged = mergeParadigm({ languageId: 'la', lemma: 'terra', pos: 'NOUN', kind: g.kind, notes: [], sources: [] }, g.cells, [{ features: { Case: 'Gen', Number: 'Plur' }, form: 'terrarum' }]);
    expect(cellOf(merged, { Case: 'Gen', Number: 'Plur' })!.status).toBe('verified');
  });
});

describe('cellsFor', () => {
  it('finds every cell a union reading could be, and ignores Gender on a noun', () => {
    const p = para('verbum', 'NOUN')!;
    const cells = laAdapter.cellsFor!({ cells: asCells(p.cells), kind: p.kind, pos: 'NOUN' }, { Case: 'Acc,Nom', Number: 'Sing', Gender: 'Neut' }, 'verbum');
    expect(cells.map((c) => c.features.Case).sort()).toEqual(['Acc', 'Nom']);
  });
});

describe('round trip: every generated one-word cell analyses back to its lemma and its own features', () => {
  const lexicon = latinLexicon();
  const named = ['terra', 'dominus', 'verbum', 'rex', 'civitas', 'nomen', 'manus', 'res', 'deus', 'domus', 'tenebrae', 'bonus', 'fortis', 'pulcher', 'amo', 'habeo', 'dico', 'facio', 'audio', 'sequor', 'morior', 'sum', 'possum', 'volo', 'eo', 'fero', 'exeo', 'affero', 'adsum', 'prosum', 'hic', 'qui', 'ego', 'unus', 'duo'];
  const lexemes = named.map((n) => lexicon.byLemma.get(n)?.[0]).filter((l): l is NonNullable<typeof l> => !!l);
  const sample = lexicon.lexemes.filter((_, i) => i % 7 === 0);
  const all = [...new Set([...lexemes, ...sample])];
  it('covers a wide range of lexemes', () => { expect(all.length).toBeGreaterThan(150); });
  it('reads each cell back', () => {
    const failures: string[] = [];
    for (const lex of all) {
      for (const cell of lex.cells()) {
        if (cell.periphrastic) {
          // two words: the first one must read as a verb form (the participle, or the infinitive's participle)
          const first = cell.form.split(' ')[0];
          const r = laAdapter.analyze(laAdapter.tokenize(first))[0].candidates;
          if (!r.some((c) => c.pos === 'VERB' || c.pos === 'AUX')) failures.push(`${lex.lemma}: ${cell.form} (first word ${first} unread)`);
          continue;
        }
        const reads = laAdapter.analyze(laAdapter.tokenize(cell.form))[0].candidates;
        const ok = reads.some((c) => c.lemma === lex.lemma && Object.entries(cell.features).every(([k, v]) => (c.morph[k] ?? '').split(',').includes(v)));
        if (!ok) failures.push(`${lex.lemma}: ${cell.form} ${JSON.stringify(cell.features)} -> ${JSON.stringify(reads.slice(0, 2).map((c) => [c.lemma, c.morph]))}`);
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });
});
