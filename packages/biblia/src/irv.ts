/**
 * The Hindi edition's text: the Indian Revised Version (IRV) Hindi 2019, read from the publisher's USFM files (eBible.org `hin2017`, committed in
 * data/sources/hi/usfm with the archive and its copyright page) by the general reader in usfm.ts, with the IRV's one particularity: its inline
 * cross-references are set in bold italic (`\bdit (रोम. 10:4) \bdit*`) and are left out as apparatus. test/biblia/hindi.test.ts holds the
 * extraction to the verse-by-verse record in data/verified/scripture.json.
 *
 * Licence of the text (eBible.org/hin2017/copyright.htm, checked 2026-11-21): © 2017, 2018, 2019 Bridge Connectivity Solutions, Creative Commons
 * Attribution Share-Alike 4.0. The files the build writes are a share-alike adaptation (selection and layout only, no wording changed) and
 * carry the same licence.
 */
import { PROTESTANT_BOOKS, buildEditionText, cleanUsfm, parseUsfmBook, type BookInfo66, type CanonRow, type ParsedBook, type TextBook, type TextChapter, type TextVerse, type UsfmOptions } from './usfm';

export type HiVerse = TextVerse;
export type HiChapter = TextChapter;
export type HiBook = TextBook;
export type IrvBookInfo = BookInfo66;
export type HiCanonRow = CanonRow<'hi'>;
export type { ParsedBook };

/** The 66 books in the IRV's order (the Protestant canon). */
export const IRV_BOOKS = PROTESTANT_BOOKS;

export const IRV_OPTIONS: UsfmOptions = { dropSpans: ['bdit'] };

export const cleanIrv = (input: string): string => cleanUsfm(input, IRV_OPTIONS);
export const parseIrvBook = (usfm: string, id: string): ParsedBook => parseUsfmBook(usfm, id, IRV_OPTIONS);
export const buildIrv = (files: ReadonlyMap<string, string>): { canon: HiCanonRow[]; books: HiBook[] } => buildEditionText(files, 'hi', IRV_OPTIONS);

/** The attribution the licence asks for, as shown in the app and written beside the data (SOURCES.json). */
export const IRV_ATTRIBUTION = {
  title: 'इंडियन रिवाइज्ड वर्जन (IRV) हिंदी - 2019',
  english: 'The Indian Revised Version Holy Bible in the Hindi language of India',
  copyright: 'Copyright © 2017, 2018, 2019 Bridge Connectivity Solutions',
  licence: 'Creative Commons Attribution Share-Alike 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  source: 'https://ebible.org/hin2017/',
  sourceLabel: 'eBible.org (hin2017)',
  sourceDate: 'source files dated 2023-04-11',
  changes: 'The verse wording is unchanged. The book introductions, section headings, study notes and the cross-references the edition sets apart as notes are not shown (16 verses keep a reference printed inside the verse, as eBible.org’s own text does); the verses are laid out by Biblia. These changes are not endorsed by the original licensor.',
} as const;
