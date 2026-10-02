/**
 * Chapter headings in a Hindi book (src/ingest/headings.ts): "अध्याय 3", Devanagari digits, a title after a separator,
 * the ordinal before the word; a sentence that merely begins with a chapter word is not a heading; the other
 * languages' rules are untouched.
 */
import { describe, expect, it } from 'vitest';
import { detectHeadings, hindiHeading } from '../../src/ingest/headings';
import { plainTextToDocuments } from '../../src/ingest';

describe('hindiHeading', () => {
  it.each([
    ['अध्याय 1', 1, undefined],
    ['अध्याय १२', 12, undefined],
    ['अध्याय 3: घर की याद', 3, 'घर की याद'],
    ['भाग 2 — शहर', 2, 'शहर'],
    ['पाठ ५', 5, undefined],
    ['खंड 4', 4, undefined],
    ['खण्ड 4', 4, undefined],
    ['परिच्छेद 7', 7, undefined],
    ['पहला अध्याय', 1, undefined],
    ['दूसरा भाग: सफ़र', 2, 'सफ़र'],
    ['दसवाँ अध्याय', 10, undefined],
  ])('%s is a heading', (line, number, title) => {
    const h = hindiHeading(line);
    expect(h, line).toBeDefined();
    expect(h!.number).toBe(number);
    expect(h!.title).toBe(title);
    expect(h!.line).toBe(line);
  });

  it.each([
    'अध्याय 3 में रवि घर गया।', // a sentence
    'भाग 2 बहुत लंबा है।',
    'पाठ पढ़ो।',
    'अध्याय',
    'रवि का पहला अध्याय',
    'भाग्य 3',
    'पहला दिन',
  ])('%s is not a heading', (line) => {
    expect(hindiHeading(line)).toBeUndefined();
  });

  it('is used for Hindi only; Thai and Spanish detection is as before', () => {
    const lines = ['अध्याय 1', 'पाठ।', 'Capítulo II', 'texto.', 'บทที่ ๑'];
    expect(detectHeadings(lines, 'hi').map((h) => h.index)).toEqual([0, 2, 4]);
    expect(detectHeadings(lines, 'es').map((h) => h.index)).toEqual([2, 4]);
    expect(detectHeadings(lines, 'th').map((h) => h.index)).toEqual([4]);
  });

  it('a Hindi book in plain text is split at its headings, and the heading text is not part of the chapter', () => {
    const book = ['अध्याय 1: गाँव', '', 'रवि गाँव में रहता है।', '', 'अध्याय 2', '', 'वह शहर गया।'].join('\n');
    const r = plainTextToDocuments(book, { lang: 'hi', title: 'किताब', idPrefix: 'kitab' });
    expect(r.documents).toHaveLength(2);
    expect(r.documents[0].work?.chapter?.title ?? r.documents[0].title).toMatch(/गाँव/);
    // the heading is the chapter's title, never a paragraph of its text
    const body = JSON.stringify(r.documents[0].sections.flatMap((s) => s.paragraphs));
    expect(body).toContain('रवि गाँव में रहता है।');
    expect(body).not.toContain('अध्याय 1');
  });
});
