// @vitest-environment node
/** Biblia's canon and numerals, over the real canon.json copied from the Biblia app (skipped when the texts have not been imported locally). */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TREE, greekNumeral, hebrewNumeral, parseCanon } from '../../packages/biblia/src/canon';

describe('numerals', () => {
  it('Hebrew: gematria with geresh / gershayim, 15 and 16 written ט״ו / ט״ז', () => {
    expect(hebrewNumeral(1)).toBe('א׳');
    expect(hebrewNumeral(10)).toBe('י׳');
    expect(hebrewNumeral(11)).toBe('י״א');
    expect(hebrewNumeral(15)).toBe('ט״ו');
    expect(hebrewNumeral(16)).toBe('ט״ז');
    expect(hebrewNumeral(23)).toBe('כ״ג');
    expect(hebrewNumeral(119)).toBe('קי״ט');
    expect(hebrewNumeral(150)).toBe('ק״נ');
  });
  it('Greek: Milesian numerals with the keraia', () => {
    expect(greekNumeral(1)).toBe('αʹ');
    expect(greekNumeral(6)).toBe('ϛʹ');
    expect(greekNumeral(16)).toBe('ιϛʹ');
    expect(greekNumeral(28)).toBe('κηʹ');
    expect(greekNumeral(150)).toBe('ρνʹ');
  });
});

const CANON = 'packages/biblia/public/data/canon.json';
describe.skipIf(!fs.existsSync(CANON))('the canon (texts imported locally)', () => {
  // read lazily: a skipped describe still runs this collector, and a fresh checkout has no imported texts
  const canon = fs.existsSync(CANON) ? parseCanon(JSON.parse(fs.readFileSync(CANON, 'utf8'))) : parseCanon([]);
  it('holds 39 Hebrew books then 27 Greek, Biblia’s "gr" renamed to el, every book in one division of the tree', () => {
    expect(canon.books).toHaveLength(66);
    expect(canon.books.filter((b) => b.lang === 'he')).toHaveLength(39);
    expect(canon.books.filter((b) => b.lang === 'el')).toHaveLength(27);
    expect(canon.books[0]).toMatchObject({ id: 'Gen', en: 'Genesis', section: 'Torah' });
    expect(canon.books[39]).toMatchObject({ id: 'Matt', lang: 'el', section: 'Gospels' });
    const placed = TREE.flatMap((t) => t.divisions.flatMap((d) => canon.booksOf(d).map((b) => b.id)));
    expect(new Set(placed).size).toBe(66);
    expect(canon.book('Gen')!.verses).toHaveLength(50);
    expect(canon.book('Gen')!.verses[0]).toBe(31);
  });
  it('navigates across book boundaries and refuses bad references', () => {
    expect(canon.adjacent('Gen', 50, 1)).toEqual({ book: 'Exod', ch: 1 });
    expect(canon.adjacent('Exod', 1, -1)).toEqual({ book: 'Gen', ch: 50 });
    expect(canon.adjacent('Gen', 1, -1)).toBeUndefined();
    expect(canon.adjacent('Rev', 22, 1)).toBeUndefined();
    expect(canon.validRef('Gen', 51)).toBe(false);
    expect(canon.validRef('Nope', 1)).toBe(false);
    expect(canon.refLabel('John', 3)).toBe('John 3');
  });
});
