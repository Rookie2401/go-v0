// A comma INSIDE brackets is not an item boundary: an item boundary is a comma or semicolon outside every bracket (round or square, nested or not).
// Before, a gloss such as "sound [of a person, an animal]" accepted "an animal]" because the square bracket was not counted.
import { describe, expect, it } from 'vitest';
import { acceptedMeanings } from '../../../packages/goreview/src/exercises/shared';
import { glossParts } from '../../../packages/goreview/src/grading/normalize';
import type { UnitFacts } from '../../../packages/goreview/src/types';

const lex = (g: string): UnitFacts => ({ glosses: [g], lexiconGlossCount: 1 }) as unknown as UnitFacts;
const dict = (g: string): UnitFacts => ({ glosses: [g], lexiconGlossCount: 0, glossAttribution: 'x' }) as unknown as UnitFacts;
const BAD = /[()[\]]|^\s*\S*\)\s*$|\bas an animal\]/u;

describe('brackets are not split', () => {
  it('round brackets: "(of a person, an animal)" stays inside its item', () => {
    expect(glossParts('sound (of a person, an animal), noise')).toEqual(['sound (of a person, an animal), noise', 'sound (of a person, an animal)', 'noise']);
    for (const make of [lex, dict]) expect(acceptedMeanings(make('sound (of a person, an animal), noise')).filter((a) => a.includes('an animal') && !a.includes('sound'))).toEqual([]);
  });
  it('square brackets: no answer is a fragment of a bracket', () => {
    expect(glossParts('to move [with x, y], to go')).toEqual(['to move [with x, y], to go', 'to move [with x, y]', 'to go']);
    for (const make of [lex, dict]) expect(acceptedMeanings(make('to move [with x, y], to go')).filter((a) => /^y\]|\]$/u.test(a) && !a.startsWith('to move'))).toEqual([]);
  });
  it('nested brackets: the whole nest is one aside', () => {
    expect(glossParts('meeting (with (a person, a group)), assembly')).toEqual(['meeting (with (a person, a group)), assembly', 'meeting (with (a person, a group))', 'assembly']);
  });
  it('a bracket at the start: its comma is not a boundary either', () => {
    expect(glossParts('(of a person, an animal) sound, noise')).toEqual(['(of a person, an animal) sound, noise', '(of a person, an animal) sound', 'noise']);
  });
  it('an unbalanced closing bracket does not break the split, and a gloss without brackets is split as before', () => {
    expect(glossParts('house, home')).toEqual(['house, home', 'house', 'home']);
    expect(glossParts('a), b')).toContain('b');
  });
  it('no answer carries an unclosed bracket (the case BAD names)', () => {
    expect(BAD.test('sound')).toBe(false);
  });
});
