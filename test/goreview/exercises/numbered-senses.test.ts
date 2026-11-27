// A meaning that numbers several senses ("1. chief, leader 2. big") is several meanings. acceptedMeanings used to split it at the commas only, so it
// accepted "leader 2. big" and "1. chief" as answers. Numbering is now a separator between senses; a string without numbering gives what it always gave.
import { describe, expect, it } from 'vitest';
import { acceptedMeanings, splitNumberedSenses } from '../../../packages/goreview/src/exercises/shared';
import type { UnitFacts } from '../../../packages/goreview/src/types';

const lex = (g: string): UnitFacts => ({ glosses: [g], lexiconGlossCount: 1 }) as unknown as UnitFacts;
const dict = (g: string): UnitFacts => ({ glosses: [g], lexiconGlossCount: 0, glossAttribution: 'x' }) as unknown as UnitFacts;
const NUMBER_DOT = /\d+\.\s/u;

// the OLD function's output (before numbering was a separator), copied from a run of the previous version on unnumbered samples
const OLD: Record<string, string[]> = {
  'lex|to say; to tell': ['to say; to tell', 'to say', 'to tell'], 'dict|to say; to tell': ['to say; to tell', 'to say', 'to tell'],
  'lex|water (fresh)': ['water (fresh)'], 'dict|water (fresh)': [],
  'lex|3.5 mm jack': ['3.5 mm jack'], 'dict|3.5 mm jack': ['3.5 mm jack'],
  'lex|book': ['book'], 'dict|book': ['book'],
  'lex|house, home': ['house, home', 'house', 'home'], 'dict|house, home': ['house, home', 'house', 'home'],
  'lex|to believe, to trust in, to give credence to': ['to believe, to trust in, to give credence to', 'to believe', 'to trust in', 'to give credence to'],
  'dict|to believe, to trust in, to give credence to': ['to believe', 'to trust in', 'to give credence to'],
  'lex|a municipality of Sogn og Fjordane, Norway': ['a municipality of Sogn og Fjordane, Norway', 'a municipality of Sogn og Fjordane', 'Norway'],
  'dict|a municipality of Sogn og Fjordane, Norway': [],
  'lex|to lend, to loan': ['to lend, to loan', 'to lend', 'to loan'], 'dict|to lend, to loan': ['to lend, to loan', 'to lend', 'to loan'],
  'lex|in, at, on': ['in, at, on', 'in', 'at', 'on'], 'dict|in, at, on': ['in, at, on', 'in', 'at', 'on'],
};

describe('a numbered meaning is split at its numbers', () => {
  it('"1. chief, leader 2. big" accepts chief, leader and big, and nothing with a number in it', () => {
    for (const make of [lex, dict]) {
      const got = acceptedMeanings(make('1. chief, leader 2. big'));
      expect(got).toEqual(expect.arrayContaining(['chief', 'leader', 'big']));
      expect(got.filter((a) => NUMBER_DOT.test(a))).toEqual([]);
      expect(got).not.toContain('leader 2. big');
      expect(got).not.toContain('1. chief');
    }
  });
  it('splits at a number-dot followed by a space and a letter, at the start or after a space; never at a decimal point', () => {
    expect(splitNumberedSenses('1. to say 2. To nap')).toEqual(['to say', 'To nap']);
    expect(splitNumberedSenses('a plain 2. easy')).toEqual(['a plain', 'easy']);
    expect(splitNumberedSenses('3.5 mm jack')).toEqual(['3.5 mm jack']);
    expect(splitNumberedSenses('version 2.5 beta')).toEqual(['version 2.5 beta']);
    expect(splitNumberedSenses('water (fresh)')).toEqual(['water (fresh)']);
  });
  it.each(Object.keys(OLD))('an unnumbered meaning gives exactly what it gave before: %s', (key) => {
    const [kind, ...rest] = key.split('|');
    expect(acceptedMeanings((kind === 'lex' ? lex : dict)(rest.join('|')))).toEqual(OLD[key]);
  });
});

describe('over every pack\'s sample glosses (the Alphabet Sprint starter words of every language)', () => {
  it('no accepted answer carries a number-dot, and an unnumbered gloss is never rewritten', async () => {
    const mods = import.meta.glob('../../../packages/language-packs/src/alphabet-sprint/words/*.ts', { eager: true }) as Record<string, { WORDS?: ReadonlyArray<{ gloss: string }> }>;
    let n = 0;
    for (const m of Object.values(mods)) for (const w of m.WORDS ?? []) {
      n++;
      if (!NUMBER_DOT.test(w.gloss)) expect(splitNumberedSenses(w.gloss)).toEqual([w.gloss]);
      for (const make of [lex, dict]) expect(acceptedMeanings(make(w.gloss)).filter((a) => NUMBER_DOT.test(a)), w.gloss).toEqual([]);
    }
    expect(n).toBeGreaterThan(500);
  });
});
