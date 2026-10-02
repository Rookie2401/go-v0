/**
 * The pieces the library ordering step and the library audit rest on: the canon (a chapter's place in the Bible), and
 * the rule that tells an editor's or a publisher's English paragraph from the course language.
 */
import { describe, expect, it } from 'vitest';
import { looksLikeEnglishParagraph } from '../../src/ingest/quality';
import { CANON, CANON_CHAPTERS, runningNumber } from '../../scripts/lib-canon.mjs';

describe('the canon', () => {
  it('has 66 books and 1,189 chapters, Genesis 1 first and Revelation 22 last', () => {
    expect(CANON.length).toBe(66);
    expect(CANON_CHAPTERS).toBe(1189);
    expect(runningNumber('GEN', 1)).toBe(1);
    expect(runningNumber('EXO', 1)).toBe(51);
    expect(runningNumber('PSA', 1)).toBe(479);
    expect(runningNumber('PSA', 23)).toBe(501);
    expect(runningNumber('MAT', 1)).toBe(930);
    expect(runningNumber('MRK', 1)).toBe(958);
    expect(runningNumber('ACT', 1)).toBe(1019);
    expect(runningNumber('ROM', 1)).toBe(1047);
    expect(runningNumber('REV', 22)).toBe(1189);
  });

  it('refuses a chapter the canon does not have', () => {
    expect(runningNumber('GEN', 51)).toBeUndefined();
    expect(runningNumber('GEN', 0)).toBeUndefined();
    expect(runningNumber('TOB', 1)).toBeUndefined();
  });

  it('every chapter has one place and the places run 1 … 1189 without a gap', () => {
    const places: number[] = [];
    for (const [book, n] of CANON) for (let c = 1; c <= n; c++) places.push(runningNumber(book, c)!);
    expect(places).toEqual(places.map((_, i) => i + 1));
  });
});

describe('looksLikeEnglishParagraph', () => {
  it('tells a publisher\'s English blurb from the German or Spanish story around it', () => {
    expect(looksLikeEnglishParagraph('Wondering what to do with wordless stories? Wordless stories are wonderful because they contain infinite possibilities and the children can build their own story.', 'de')).toBe(true);
    expect(looksLikeEnglishParagraph('Too Many Bananas (English) No one wanted to buy the sweet bananas that Sringeri Srinivas grew on his farm. What was he to do with them all?', 'es')).toBe(true);
    expect(looksLikeEnglishParagraph('Der Löwe rennt. Die Kuh geht. Der Löwe rennt schnell und die Kuh geht langsam über die Wiese zu dem alten Baum am Fluss.', 'de')).toBe(false);
    expect(looksLikeEnglishParagraph('Sringeri Srinivas estaba teniendo un muy mal día. Nadie quería los plátanos dulces y maduros que cultivaba en su granja y en el pueblo.', 'es')).toBe(false);
  });

  it('is not fooled by a short line or by Low German, and uses the script for Hindi and Thai', () => {
    expect(looksLikeEnglishParagraph('The end', 'de')).toBe(false); // too short to judge
    expect(looksLikeEnglishParagraph('Un as he an de See köhm, do wöör de See ganß swartgrau, un dat Water geerd so von ünnen up un stünk ganß fuul.', 'de')).toBe(false);
    expect(looksLikeEnglishParagraph('This book was made possible by the StoryWeaver platform and its donors', 'hi')).toBe(true);
    expect(looksLikeEnglishParagraph('रवि का घर गाँव में है। वह रोज़ स्कूल जाता है।', 'hi')).toBe(false);
  });
});
