import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import { importDocuments, plainTextToDocuments, validateBatch, type CorpusDocument } from '../../src/ingest';
import { clock, countWrites } from './helpers';
import { CAT, SCHOOL, registry, workBySlug } from './book';

const lines = (...l: string[]) => l.join('\n');
const MANA = workBySlug('mana-mani-1');
const convert = (text: string, over: Partial<Parameters<typeof plainTextToDocuments>[1]> = {}) => plainTextToDocuments(text, { lang: 'th', work: MANA, ...over });

/** What a chapter document contains, in order: the heading (section title) and each paragraph. */
const contentOf = (d: CorpusDocument): string[] => d.sections.flatMap((s) => [...(s.title !== undefined ? [s.title] : []), ...s.paragraphs.map((p) => (p as { text: string }).text)]);

const BOOK = lines(
  'คำนำ', // front matter: "preface"
  '',
  'บทที่ ๑',
  SCHOOL,
  CAT,
  '',
  'บทที่ 2 ฝนตก', // "it rains"
  CAT,
  'ตอนที่ ๓',
  SCHOOL,
  'ภาคที่ ๒',
  CAT,
  'Chapter 4',
  SCHOOL,
  'Chapter 5: The Fox',
  CAT,
);

describe('plainTextToDocuments: chapters', () => {
  it('finds Thai and English headings (Thai or Western digits, optional title) and numbers chapters in order', () => {
    const { documents, notes } = convert(BOOK);
    expect(documents.map((d) => d.id)).toEqual(['mana-mani-1-ch00', 'mana-mani-1-ch01', 'mana-mani-1-ch02', 'mana-mani-1-ch03', 'mana-mani-1-ch04', 'mana-mani-1-ch05', 'mana-mani-1-ch06']);
    expect(documents.map((d) => d.work!.chapter)).toEqual([
      { index: 0, title: 'Front matter' }, { index: 1 }, { index: 2, title: 'ฝนตก' }, { index: 3 }, { index: 4 }, { index: 5 }, { index: 6, title: 'The Fox' },
    ]);
    expect(documents.map((d) => d.title)).toEqual([
      `${MANA.title} — Front matter`, `${MANA.title} — บทที่ ๑`, `${MANA.title} — บทที่ 2 ฝนตก`, `${MANA.title} — ตอนที่ ๓`, `${MANA.title} — ภาคที่ ๒`,
      `${MANA.title} — Chapter 4`, `${MANA.title} — Chapter 5: The Fox`,
    ]);
    expect(documents[1].sections[0].title).toBe('บทที่ ๑');
    expect(contentOf(documents[0])).toEqual(['คำนำ']);
    expect(notes).toContain('6 chapters found by headings like "บทที่ ๑".');
    expect(notes.join('\n')).toMatch(/kept as chapter 0, "Front matter"/);
    // the heading numbers 1, 2, 3, 2, 4, 5 are not consecutive: said, and the order of appearance is used
    expect(notes.join('\n')).toMatch(/do not run 1, 2, 3/);
  });

  it('recognises Thai digits and a title after a separator; the heading line is kept exactly', () => {
    const { documents } = convert(lines('บทที่ ๑๒ - ชื่อ', SCHOOL, 'บทที่๑๓', CAT, 'บทที่ 14.', SCHOOL));
    expect(documents.map((d) => d.sections[0].title)).toEqual(['บทที่ ๑๒ - ชื่อ', 'บทที่๑๓', 'บทที่ 14.']);
    expect(documents.map((d) => d.work!.chapter!.title)).toEqual(['ชื่อ', undefined, undefined]);
  });

  it('accepts the tone mark and vowel of ที่ in either order', () => {
    const swapped = 'บทท่ี ๑'; // the file stores the tone mark before the vowel
    expect(convert(lines(swapped, SCHOOL)).documents[0].sections[0].title).toBe(swapped);
  });

  it('does not take body text for a heading', () => {
    const long = `บทที่ 1 ${'ฉันไปโรงเรียน'.repeat(12)}`;
    const text = lines(SCHOOL, 'บทที่ 1abc', 'บทที่', long, 'บทที่ ๑ ฉันไปโรงเรียน ' + CAT + ' แล้วก็กลับบ้าน', 'Chapters', 'chapter');
    const r = convert(text);
    // only the short "บทที่ ๑ …" line (under 100 characters) is a heading
    expect(r.documents).toHaveLength(2);
    expect(contentOf(r.documents[0])).toEqual([SCHOOL, 'บทที่ 1abc', 'บทที่', long]);
    expect(r.documents[1].sections[0].title).toContain('บทที่ ๑ ');
    expect(r.documents[1].work!.chapter!.index).toBe(1);
  });

  it('without headings the whole text is one chapter, and says so', () => {
    const r = convert(lines(SCHOOL, CAT));
    expect(r.documents.map((d) => d.id)).toEqual(['mana-mani-1-ch01']);
    expect(r.documents[0].title).toBe(MANA.title);
    expect(r.documents[0].sections[0].title).toBeUndefined();
    expect(r.notes.join('\n')).toMatch(/No chapter headings were found/);
  });

  it('chapters: "none" makes one document even when headings are there', () => {
    const r = convert(BOOK, { chapters: 'none' });
    expect(r.documents).toHaveLength(1);
    expect(contentOf(r.documents[0])).toEqual(BOOK.split('\n').filter((l) => l !== ''));
    expect(r.notes[0]).toMatch(/Chapter detection is off/);
  });

  it('a custom regular expression is matched against whole lines; a named group "title" gives the chapter title', () => {
    const text = lines('CANTO I - The Hill', SCHOOL, 'CANTO II', CAT, 'a CANTO III is not a heading', SCHOOL);
    const r = convert(text, { chapters: 'CANTO [IVX]+(?: - (?<title>.+))?' });
    expect(r.documents.map((d) => d.sections[0].title)).toEqual(['CANTO I - The Hill', 'CANTO II']);
    expect(r.documents.map((d) => d.work!.chapter!.title)).toEqual(['The Hill', undefined]);
    expect(contentOf(r.documents[1])).toEqual(['CANTO II', CAT, 'a CANTO III is not a heading', SCHOOL]);
    expect(() => convert(text, { chapters: '([' })).toThrow(/not a valid regular expression/);
  });

  it('a heading with no text after it is skipped (and said); front matter exists only if it has content', () => {
    const r = convert(lines('บทที่ ๑', 'บทที่ ๒', SCHOOL, 'บทที่ ๓'));
    expect(r.documents.map((d) => d.work!.chapter!.index)).toEqual([1]);
    expect(r.documents[0].sections[0].title).toBe('บทที่ ๒');
    expect(r.notes.filter((n) => /has no text after it and was skipped/.test(n))).toHaveLength(2);
    expect(r.documents.some((d) => d.work!.chapter!.index === 0)).toBe(false);
    expect(convert(lines('', '   ', 'บทที่ ๑', SCHOOL)).documents.map((d) => d.work!.chapter!.index)).toEqual([1]);
  });

  it('a table of contents does not become chapters', () => {
    const r = convert(lines('บทที่ ๑', 'บทที่ ๒', 'บทที่ ๓', 'บทที่ ๑', SCHOOL, 'บทที่ ๒', CAT, 'บทที่ ๓', SCHOOL));
    expect(r.documents.map((d) => d.work!.chapter!.index)).toEqual([1, 2, 3]);
    expect(r.documents.map((d) => contentOf(d)[1])).toEqual([SCHOOL, CAT, SCHOOL]);
  });

  it('chapter numbers are zero-padded to the width the book needs', () => {
    const many = Array.from({ length: 100 }, (_, i) => lines(`Chapter ${i + 1}`, SCHOOL)).join('\n');
    const ids = convert(many).documents.map((d) => d.id);
    expect(ids).toHaveLength(100);
    expect(ids[0]).toBe('mana-mani-1-ch001');
    expect(ids[99]).toBe('mana-mani-1-ch100');
    expect(convert(lines('Chapter 1', SCHOOL)).documents[0].id).toBe('mana-mani-1-ch01');
  });
});

describe('plainTextToDocuments: the text is not altered', () => {
  it('the paragraphs are the input lines: concatenated, they reproduce the non-empty lines', () => {
    const input = lines('คำนำ', 'บทที่ ๑', SCHOOL, '', '', CAT + '  ' + SCHOOL, '   ', 'บทที่ ๒', 'a b  c\td', CAT);
    const { documents } = convert(input);
    const got = documents.flatMap(contentOf);
    expect(got).toEqual(input.split('\n').filter((l) => l.trim() !== ''));
    expect(got.join('\n')).toBe(input.split('\n').filter((l) => l.trim() !== '').join('\n'));
    // inner spacing (two spaces, a tab) is exactly as it was: no re-spacing, no added spaces
    expect(documents[2].sections[0].paragraphs.map((p) => (p as { text: string }).text)).toEqual(['a b  c\td', CAT]);
  });

  it('only plain indentation is trimmed, and the notes say how many lines it touched', () => {
    const input = lines(`  \t${SCHOOL}`, `${CAT}   `, ` ${SCHOOL}`, `${CAT}　`);
    const r = convert(input);
    const texts = contentOf(r.documents[0]);
    expect(texts).toEqual([SCHOOL, CAT, ` ${SCHOOL}`, `${CAT}　`]); // NBSP and the ideographic space are not indentation
    expect(r.notes.join('\n')).toMatch(/Spaces or tabs at the start or end of 2 lines were trimmed\. That is the only change made to the text\./);
    expect(convert(lines(SCHOOL, CAT)).notes.join('\n')).not.toMatch(/trimmed/);
  });

  it('keeps text that is not NFC, and says so', () => {
    const decomposed = 'café';
    const r = convert(lines(SCHOOL, decomposed));
    expect(contentOf(r.documents[0])[1]).toBe(decomposed);
    expect(r.notes.join('\n')).toMatch(/1 paragraph is not in Unicode NFC/);
  });

  it('handles a byte order mark and CRLF / CR line endings', () => {
    const r = convert(`﻿${SCHOOL}\r\n${CAT}\r\n\r\n${SCHOOL}\rบทที่ ๑\r\n${CAT}`);
    expect(r.documents.map(contentOf)).toEqual([[SCHOOL, CAT, SCHOOL], ['บทที่ ๑', CAT]]);
    expect(r.notes.join('\n')).toMatch(/byte order mark/);
    expect(r.notes.join('\n')).toMatch(/CRLF/);
    expect(contentOf(r.documents[0])[0].startsWith('﻿')).toBe(false);
  });

  it('warns about replacement characters (a file that was not UTF-8)', () => {
    expect(convert(lines(SCHOOL, `${CAT}�`)).notes.join('\n')).toMatch(/replacement characters/);
  });

  it('an empty text gives no documents', () => {
    const r = convert('\n  \n');
    expect(r.documents).toEqual([]);
    expect(r.notes.join('\n')).toMatch(/no content/);
  });
});

describe('plainTextToDocuments: what each document says', () => {
  it('is a personal copy of the work: source, attribution, provenance, corpus, review', () => {
    const { documents } = convert(lines('บทที่ ๑', SCHOOL), { copyNote: 'my paperback, 12th printing' });
    const d = documents[0];
    expect(d).toMatchObject({
      schemaVersion: 2, lang: 'th', contentType: 'story', corpus: { id: 'personal-th', kind: 'comprehensible-input', title: 'Your books' },
      review: { status: 'unreviewed' }, generated: false, topics: [], editorialTags: [], prepTargets: [],
      work: { slug: 'mana-mani-1', courseId: 'thailand-th', chapter: { index: 1 } },
    });
    expect(d.source).toMatchObject({
      id: 'src:th:mana-mani-1', title: MANA.title, rights: 'personal-copy', authorship: 'published', publisher: MANA.publisher,
      attribution: `${MANA.title}${MANA.author ? ` — ${MANA.author}` : ''}. Your own copy; not distributed.`,
      provenance: 'Supplied by the learner from a personal copy (my paperback, 12th printing); transcription not checked.',
    });
    expect(convert(lines(SCHOOL)).documents[0].source.provenance).toBe('Supplied by the learner from a personal copy; transcription not checked.');
  });

  it('attribution names the author when the work has one', () => {
    const withAuthor = { ...MANA, author: 'An Author' };
    expect(plainTextToDocuments(SCHOOL, { lang: 'th', work: withAuthor }).documents[0].source).toMatchObject({
      author: 'An Author', attribution: `${MANA.title} — An Author. Your own copy; not distributed.`,
    });
  });

  it('contentType, idPrefix and a free-standing title', () => {
    const r = plainTextToDocuments(lines('Chapter 1', SCHOOL), { lang: 'th', title: 'My Book!', contentType: 'nonfiction' });
    expect(r.documents[0]).toMatchObject({ id: 'my-book-ch01', contentType: 'nonfiction', title: 'My Book! — Chapter 1' });
    expect(r.documents[0].work).toBeUndefined();
    expect(r.documents[0].source.id).toBe('src:th:my-book');
    expect(plainTextToDocuments(SCHOOL, { lang: 'th', title: 'เป็ดหาย' }).documents[0].id).toBe('book-ch01'); // no ASCII in the title: a neutral prefix
    expect(convert(SCHOOL, { idPrefix: 'mine' }).documents[0].id).toBe('mine-ch01');
    expect(() => plainTextToDocuments(SCHOOL, { lang: 'th' })).toThrow(/work or a title/);
  });
});

describe('plainTextToDocuments: the documents import', () => {
  it('validate with the real validator and import as personal copies, published, in the right chapters', async () => {
    const { documents } = convert(BOOK, { copyNote: 'test copy' });
    const batch = validateBatch(documents, { registry });
    expect(batch.ok).toBe(true);
    for (const d of batch.documents) expect(d.issues.filter((i) => i.severity === 'error'), d.id).toEqual([]);

    const store = createMemoryStore();
    const r = await importDocuments(store, registry, documents, { clock });
    expect(r.ok).toBe(true);
    expect(r.documents.every((d) => d.action === 'created' && d.published)).toBe(true);
    const texts = (await store.texts.where('workId', MANA.id)).sort((a, b) => a.chapter!.index - b.chapter!.index);
    expect(texts.map((t) => t.chapter!.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(texts.every((t) => t.personalCopy === true && t.published && t.reviewStatus === 'unreviewed')).toBe(true);
    expect(texts.map((t) => t.corpusId)).toEqual(Array(7).fill('personal-th'));
    expect((await store.corpora.get('personal-th'))!.title).toBe('Your books');
  });

  it('the stored text is the input: paragraphs and sentences, byte for byte', async () => {
    const input = lines('บทที่ ๑', SCHOOL, CAT);
    const { documents } = convert(input);
    const store = createMemoryStore();
    await importDocuments(store, registry, documents, { clock });
    const textId = 'text:th:mana-mani-1-ch01';
    const paragraphs = (await store.paragraphs.where('textId', textId)).sort((a, b) => a.index - b.index);
    expect(paragraphs.map((p) => p.originalText)).toEqual([SCHOOL, CAT]);
    const sentences = (await store.sentences.where('textId', textId)).sort((a, b) => a.index - b.index);
    expect(sentences.map((s) => s.text).join('')).toBe(SCHOOL + CAT);
    expect((await store.sections.where('textId', textId))[0].title).toBe('บทที่ ๑');
  });

  it('re-importing the same book changes nothing; revising one chapter updates only that chapter (version 2)', async () => {
    const store = createMemoryStore();
    const first = convert(BOOK).documents;
    await importDocuments(store, registry, first, { clock });
    const w = countWrites(store);
    const again = await importDocuments(store, registry, convert(BOOK).documents, { clock });
    expect(again.documents.map((d) => d.action)).toEqual(Array(7).fill('unchanged'));
    expect(w.count()).toBe(0);

    const revised = convert(BOOK.replace(`ตอนที่ ๓\n${SCHOOL}`, `ตอนที่ ๓\n${SCHOOL}วันนี้`)).documents; // chapter 3 gets a changed line
    const r = await importDocuments(store, registry, revised, { clock });
    expect(r.documents.map((d) => d.action)).toEqual(['unchanged', 'unchanged', 'unchanged', 'updated', 'unchanged', 'unchanged', 'unchanged']);
    expect(r.documents[3]).toMatchObject({ contentVersion: 2, sentencesAdded: 1, sentencesRetired: 1 });
    expect((await store.texts.get('text:th:mana-mani-1-ch03'))!.personalCopy).toBe(true);
  });
});
