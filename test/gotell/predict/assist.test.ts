import { describe, expect, it } from 'vitest';
import { esAdapter } from '../../../src/adapters/es';
import {
  EMPTY_ASSIST, addRange, applySupplied, editBetween, findParenthetical, pendingSupplied, rangeAt, shiftAssist, shiftRanges,
} from '../../../src/gotell/predict';
import type { TextAssist } from '../../../src/gotell/predict';

describe('editBetween', () => {
  it('finds an insertion, a deletion and a replacement', () => {
    expect(editBetween('hello world', 'hello big world')).toEqual({ start: 6, removed: 0, inserted: 4 });
    expect(editBetween('hello big world', 'hello world')).toEqual({ start: 6, removed: 4, inserted: 0 });
    expect(editBetween('hello world', 'hello there')).toEqual({ start: 6, removed: 5, inserted: 5 });
    expect(editBetween('abc', 'abc')).toEqual({ start: 3, removed: 0, inserted: 0 });
    expect(editBetween('', 'abc')).toEqual({ start: 0, removed: 0, inserted: 3 });
  });

  it('never lets the prefix and suffix overlap on repeated characters', () => {
    expect(editBetween('aa', 'aaa')).toEqual({ start: 2, removed: 0, inserted: 1 });
    expect(editBetween('aaa', 'aa')).toEqual({ start: 2, removed: 1, inserted: 0 });
  });
});

describe('shiftRanges', () => {
  const r = [{ start: 2, end: 5 }, { start: 8, end: 12 }];

  it('leaves ranges before the edit and shifts ranges after it', () => {
    expect(shiftRanges(r, { start: 6, removed: 0, inserted: 3 })).toEqual([{ start: 2, end: 5 }, { start: 11, end: 15 }]);
    expect(shiftRanges(r, { start: 6, removed: 2, inserted: 0 })).toEqual([{ start: 2, end: 5 }, { start: 6, end: 10 }]);
    expect(shiftRanges(r, { start: 0, removed: 0, inserted: 1 })).toEqual([{ start: 3, end: 6 }, { start: 9, end: 13 }]);
  });

  it('drops ranges that overlap the edit, inserts included', () => {
    expect(shiftRanges(r, { start: 3, removed: 0, inserted: 1 })).toEqual([{ start: 9, end: 13 }]);      // strictly inside
    expect(shiftRanges(r, { start: 4, removed: 6, inserted: 0 })).toEqual([]);                          // spans both
    expect(shiftRanges(r, { start: 1, removed: 2, inserted: 2 })).toEqual([{ start: 8, end: 12 }]);     // clips the start
    expect(shiftRanges(r, { start: 10, removed: 1, inserted: 1 })).toEqual([{ start: 2, end: 5 }]);     // inside the second
  });

  it('keeps a range when the edit is exactly at its boundary (typing next to a word)', () => {
    expect(shiftRanges(r, { start: 5, removed: 0, inserted: 2 })).toEqual([{ start: 2, end: 5 }, { start: 10, end: 14 }]);
    expect(shiftRanges(r, { start: 2, removed: 0, inserted: 2 })).toEqual([{ start: 4, end: 7 }, { start: 10, end: 14 }]);
    expect(shiftRanges(r, { start: 5, removed: 3, inserted: 0 })).toEqual([{ start: 2, end: 5 }, { start: 8 - 3, end: 12 - 3 }]);
  });

  it('shifts through a real text edit', () => {
    const before = 'Yo creo en Dios';
    const after = 'Ya creo en Dios';
    expect(shiftRanges([{ start: 7, end: 9 }], editBetween(before, after))).toEqual([{ start: 7, end: 9 }]);
    expect(shiftRanges([{ start: 0, end: 2 }], editBetween(before, after))).toEqual([]);
    expect(shiftRanges([{ start: 11, end: 15 }], editBetween(before, 'Yo no creo en Dios'))).toEqual([{ start: 14, end: 18 }]);
  });

  it('shifts both lists of an assist', () => {
    const a: TextAssist = { supplied: [{ start: 10, end: 14 }], guided: [{ start: 0, end: 3 }, { start: 4, end: 9 }] };
    expect(shiftAssist(a, { start: 4, removed: 0, inserted: 1 })).toEqual({ supplied: [{ start: 11, end: 15 }], guided: [{ start: 0, end: 3 }, { start: 5, end: 10 }] });
  });
});

describe('addRange / rangeAt', () => {
  it('adds in order, merges overlaps, keeps touching words apart', () => {
    expect(addRange([], { start: 5, end: 8 })).toEqual([{ start: 5, end: 8 }]);
    expect(addRange([{ start: 5, end: 8 }], { start: 0, end: 2 })).toEqual([{ start: 0, end: 2 }, { start: 5, end: 8 }]);
    expect(addRange([{ start: 0, end: 4 }, { start: 6, end: 9 }], { start: 3, end: 7 })).toEqual([{ start: 0, end: 9 }]);
    expect(addRange([{ start: 0, end: 4 }], { start: 4, end: 8 })).toEqual([{ start: 0, end: 4 }, { start: 4, end: 8 }]);
    expect(addRange([{ start: 0, end: 4 }], { start: 6, end: 6 })).toEqual([{ start: 0, end: 4 }]);
  });

  it('does not mutate its input', () => {
    const input = [{ start: 0, end: 4 }];
    addRange(input, { start: 2, end: 9 });
    expect(input).toEqual([{ start: 0, end: 4 }]);
  });

  it('rangeAt is half-open', () => {
    const rs = [{ start: 2, end: 5 }, { start: 8, end: 10 }];
    expect(rangeAt(rs, 1)).toBeUndefined();
    expect(rangeAt(rs, 2)).toEqual({ start: 2, end: 5 });
    expect(rangeAt(rs, 4)).toEqual({ start: 2, end: 5 });
    expect(rangeAt(rs, 5)).toBeUndefined();
    expect(rangeAt(rs, 9)).toEqual({ start: 8, end: 10 });
  });
});

describe('findParenthetical', () => {
  it('matches only with the caret right after the closing parenthesis', () => {
    expect(findParenthetical('Yo (water)')).toEqual({ english: 'water', start: 3, end: 10 });
    expect(findParenthetical('(water)')).toEqual({ english: 'water', start: 0, end: 7 });
    expect(findParenthetical('Yo (water) ')).toBeNull();
    expect(findParenthetical('Yo (water')).toBeNull();
    expect(findParenthetical('Yo water)')).toBeNull();
  });

  it('accepts multi-word English and trims it', () => {
    expect(findParenthetical("I (don't know)")?.english).toBe("don't know");
    expect(findParenthetical('Es (living water)')?.english).toBe('living water');
    expect(findParenthetical('Es (water )')?.english).toBe('water');
  });

  it('rejects things that are not an English request', () => {
    expect(findParenthetical('Es ()')).toBeNull();
    expect(findParenthetical('Es (123)')).toBeNull();
    expect(findParenthetical('Es (agua2)')).toBeNull();
    expect(findParenthetical('Es (' + 'a'.repeat(60) + ')')).toBeNull();
    expect(findParenthetical('Es ( water)')).toBeNull();
  });

  it('uses the last parenthetical', () => {
    expect(findParenthetical('A (one) B (two)')).toEqual({ english: 'two', start: 10, end: 15 });
  });
});

describe('pendingSupplied', () => {
  const text0 = 'Yo (water)';
  const paren = findParenthetical(text0)!;
  const target = { surface: 'agua' };
  const at = (typedAfter: string, space = ' ') => {
    const t = text0 + (typedAfter ? space + typedAfter : '');
    return pendingSupplied(t, paren, t.length, target, esAdapter);
  };

  it('reports nothing typed, partial, complete and broken', () => {
    expect(at('')).toEqual({ typed: '', complete: false, broken: false });
    expect(at('a')).toEqual({ typed: 'a', complete: false, broken: false });
    expect(at('agu')).toEqual({ typed: 'agu', complete: false, broken: false });
    expect(at('agua')).toEqual({ typed: 'agua', complete: true, broken: false });
    expect(at('ab')).toMatchObject({ complete: false, broken: true });
    expect(at('aguas')).toMatchObject({ complete: false, broken: true });
  });

  it('skips exactly one optional space and compares case-insensitively', () => {
    expect(at('agua', '')).toMatchObject({ typed: 'agua', complete: true });
    expect(at('Agua')).toMatchObject({ complete: true });
    const t = text0 + '  a';
    expect(pendingSupplied(t, paren, t.length, target, esAdapter).typed).toBe(' a');
  });

  it('works without an adapter and when the caret is before the word', () => {
    const t = text0 + ' agua';
    expect(pendingSupplied(t, paren, t.length, target).complete).toBe(true);
    expect(pendingSupplied(t, paren, paren.end, target)).toEqual({ typed: '', complete: false, broken: false });
  });

  it('treats a Thai-style target (no space) the same way', () => {
    const t = 'ฉัน(water)น้ำ';
    const p = findParenthetical('ฉัน(water)')!;
    expect(pendingSupplied(t, p, t.length, { surface: 'น้ำ' })).toMatchObject({ typed: 'น้ำ', complete: true });
  });
});

describe('applySupplied', () => {
  it('deletes the parenthetical and one following space and records the supplied range', () => {
    const text = 'Yo (water) agua es vida';
    const paren = findParenthetical('Yo (water)')!;
    const r = applySupplied(text, EMPTY_ASSIST, paren, 'agua');
    expect(r.text).toBe('Yo agua es vida');
    expect(r.assist).toEqual({ supplied: [{ start: 3, end: 7 }], guided: [] });
    expect(r.caret).toBe(7);
    expect(r.text.slice(r.assist.supplied[0].start, r.assist.supplied[0].end)).toBe('agua');
  });

  it('works without the space (Thai) and keeps what the learner typed', () => {
    const text = 'ฉัน(water)น้ำ';
    const paren = findParenthetical('ฉัน(water)')!;
    const r = applySupplied(text, EMPTY_ASSIST, paren, 'น้ำ');
    expect(r.text).toBe('ฉันน้ำ');
    expect(r.assist.supplied).toEqual([{ start: 3, end: 6 }]);
    expect(r.caret).toBe(6);
    expect(applySupplied('Yo (water) Agua', EMPTY_ASSIST, findParenthetical('Yo (water)')!, 'agua').text).toBe('Yo Agua');
  });

  it('shifts existing ranges across the deletion and drops none that are clear of it', () => {
    const text = 'Creo en Dios. Yo (water) agua';
    const before: TextAssist = { supplied: [{ start: 0, end: 4 }], guided: [{ start: 8, end: 12 }] };
    const r = applySupplied(text, before, findParenthetical('Creo en Dios. Yo (water)')!, 'agua');
    expect(r.text).toBe('Creo en Dios. Yo agua');
    expect(r.assist.supplied).toEqual([{ start: 0, end: 4 }, { start: 17, end: 21 }]);
    expect(r.assist.guided).toEqual([{ start: 8, end: 12 }]);
  });

  it('shifts ranges that come after the request', () => {
    const text = '(water) agua y Dios';
    const before: TextAssist = { supplied: [], guided: [{ start: 15, end: 19 }] };
    const r = applySupplied(text, before, findParenthetical('(water)')!, 'agua');
    expect(r.text).toBe('agua y Dios');
    expect(r.assist.guided).toEqual([{ start: 7, end: 11 }]);
    expect(r.assist.supplied).toEqual([{ start: 0, end: 4 }]);
  });

  it('is pure', () => {
    const before: TextAssist = { supplied: [{ start: 0, end: 2 }], guided: [] };
    applySupplied('ab (x) cd', before, findParenthetical('ab (x)')!, 'cd');
    expect(before).toEqual({ supplied: [{ start: 0, end: 2 }], guided: [] });
    expect(EMPTY_ASSIST).toEqual({ supplied: [], guided: [] });
  });
});
