/**
 * German chapter headings in a learner's own plain-text book: "Kapitel 1", "Erstes Kapitel", "1. Kapitel", "Zweiter Teil".
 * A sentence that merely begins with such words is not a heading; the other languages are unaffected.
 */
import { describe, expect, it } from 'vitest';
import { detectHeadings, germanHeading } from '../../src/ingest/headings';
import { plainTextToDocuments } from '../../src/ingest';

describe('germanHeading', () => {
  it.each([
    ['Kapitel 1', 1, undefined],
    ['KAPITEL 12', 12, undefined],
    ['Kapitel IV', 4, undefined],
    ['Kapitel drei', 3, undefined],
    ['Kapitel 2: Die Reise', 2, 'Die Reise'],
    ['Kapitel 7 Der Brief', 7, 'Der Brief'],
    ['Kapitel II. Am See', 2, 'Am See'],
    ['1. Kapitel', 1, undefined],
    ['Erstes Kapitel', 1, undefined],
    ['Zweites Kapitel. Der Wald', 2, 'Der Wald'],
    ['Dritter Teil', 3, undefined],
    ['Zwölftes Kapitel', 12, undefined],
    ['IV. Kapitel', 4, undefined],
    ['Erster Aufzug', 1, undefined],
    ['Teil 2', 2, undefined],
    ['Zweites Buch', 2, undefined],
  ] as Array<[string, number, string | undefined]>)('%s', (line, number, title) => {
    const h = germanHeading(line);
    expect(h, line).toBeDefined();
    expect(h!.number).toBe(number);
    expect(h!.title).toBe(title);
    expect(h!.kind).toBe('numbered');
  });

  it.each([
    'Kapitel',
    'Kapitel 1 war das schwerste.',
    'Erster Teil der Reise war schwer.',
    'Teil eins der Geschichte beginnt hier',
    'Das erste Kapitel ist kurz.',
    'Buch 3 ist mein liebstes!',
    'Kapitelweise 1',
    'Erstes Kapitelchen',
    'Am 3. Teil arbeiten wir noch.',
  ])('not a heading: %s', (line) => {
    expect(germanHeading(line)).toBeUndefined();
  });

  it('is used for German only, and the Western and "Chapter N" forms still work in German', () => {
    const lines = ['Kapitel 1', '', 'Text.', '', 'Kapitel 2', '', 'Mehr Text.'];
    expect(detectHeadings(lines, 'de').map((f) => f.index)).toEqual([0, 4]);
    expect(detectHeadings(lines, 'es')).toEqual([]);
    expect(detectHeadings(lines, 'th')).toEqual([]);
    expect(detectHeadings(['Chapter 1', '', 'Text.'], 'de').map((f) => f.index)).toEqual([0]);
    expect(detectHeadings(['I.', '', 'Text.', '', 'II.', '', 'Text.'], 'de').map((f) => f.index)).toEqual([0, 4]);
  });

  it('a plain-text German book is cut into its chapters', () => {
    const book = ['Erstes Kapitel', '', 'Am Montag steht Jonas früh auf.', '', 'Zweites Kapitel. Der Brief', '', 'Er schreibt einen Brief.', ''].join('\n');
    const { documents } = plainTextToDocuments(book, { lang: 'de', title: 'Mein Buch (synthetic)', idPrefix: 'mein-buch', paragraphs: 'blank-line' });
    expect(documents.length).toBe(2);
    expect(JSON.stringify(documents[1])).toContain('Der Brief');
  });
});
