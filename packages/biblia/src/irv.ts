/**
 * The Hindi edition's text: the Indian Revised Version (IRV) Hindi 2019, read from the publisher's USFM files (eBible.org `hin2017`, committed in
 * data/sources/hi/usfm with the archive and its copyright page). Pure functions, no file access: the build (vite.config.ts) and the tests feed them
 * the files.
 *
 * Kept exactly as the publisher wrote it: the wording of every verse, and the Psalm superscriptions and the acrostic letter headings of Psalm 119
 * (`\d`, part of the printed text). Left out, because they are the edition's apparatus rather than the text: the book introductions (`\is`,
 * `\ip`, `\io` …), the section headings (`\s`, `\ms`, `\mr`), the study notes (`\f … \f*`) and the inline cross-references set in bold italic
 * (`\bdit (रोम. 10:4) \bdit*`). Character styles (`\it`, `\wj`, `\k`, `\qs`, `\tl` …) are dropped and their words kept. The cleaning rules are the
 * repository's importer's (scripts/build-hi-scripture-full.mjs); test/biblia/hindi.test.ts holds this extraction to the verse-by-verse record in
 * data/verified/scripture.json.
 *
 * Licence of the text (eBible.org/hin2017/copyright.htm, checked 2026-11-21): © 2017, 2018, 2019 Bridge Connectivity Solutions, Creative Commons
 * Attribution Share-Alike 4.0. The files this module writes are a share-alike adaptation (selection and layout only, no wording changed) and
 * carry the same licence.
 */

export interface HiVerse {
  n: number;
  /** the verse as the IRV prints it */
  t: string;
  /** a paragraph begins with this verse */
  p?: 1;
  /** a superscription or heading that stands before this verse (a Psalm title before verse 1; the letter names of Psalm 119) */
  d?: string;
}
export interface HiChapter { n: number; verses: HiVerse[] }
export interface HiBook { book: string; chapters: HiChapter[] }

export interface IrvBookInfo { id: string; usfm: string; en: string; section: string }

/** The 66 books in the IRV's order (the Protestant canon), with the Biblia ids (OSIS) and English names of the original edition. */
export const IRV_BOOKS: readonly IrvBookInfo[] = [
  ['Gen', 'GEN', 'Genesis', 'Law'], ['Exod', 'EXO', 'Exodus', 'Law'], ['Lev', 'LEV', 'Leviticus', 'Law'], ['Num', 'NUM', 'Numbers', 'Law'], ['Deut', 'DEU', 'Deuteronomy', 'Law'],
  ['Josh', 'JOS', 'Joshua', 'History'], ['Judg', 'JDG', 'Judges', 'History'], ['Ruth', 'RUT', 'Ruth', 'History'], ['1Sam', '1SA', '1 Samuel', 'History'], ['2Sam', '2SA', '2 Samuel', 'History'],
  ['1Kgs', '1KI', '1 Kings', 'History'], ['2Kgs', '2KI', '2 Kings', 'History'], ['1Chr', '1CH', '1 Chronicles', 'History'], ['2Chr', '2CH', '2 Chronicles', 'History'],
  ['Ezra', 'EZR', 'Ezra', 'History'], ['Neh', 'NEH', 'Nehemiah', 'History'], ['Esth', 'EST', 'Esther', 'History'],
  ['Job', 'JOB', 'Job', 'Wisdom'], ['Ps', 'PSA', 'Psalms', 'Wisdom'], ['Prov', 'PRO', 'Proverbs', 'Wisdom'], ['Eccl', 'ECC', 'Ecclesiastes', 'Wisdom'], ['Song', 'SNG', 'Song of Songs', 'Wisdom'],
  ['Isa', 'ISA', 'Isaiah', 'Prophets'], ['Jer', 'JER', 'Jeremiah', 'Prophets'], ['Lam', 'LAM', 'Lamentations', 'Prophets'], ['Ezek', 'EZK', 'Ezekiel', 'Prophets'], ['Dan', 'DAN', 'Daniel', 'Prophets'],
  ['Hos', 'HOS', 'Hosea', 'Prophets'], ['Joel', 'JOL', 'Joel', 'Prophets'], ['Amos', 'AMO', 'Amos', 'Prophets'], ['Obad', 'OBA', 'Obadiah', 'Prophets'], ['Jonah', 'JON', 'Jonah', 'Prophets'],
  ['Mic', 'MIC', 'Micah', 'Prophets'], ['Nah', 'NAM', 'Nahum', 'Prophets'], ['Hab', 'HAB', 'Habakkuk', 'Prophets'], ['Zeph', 'ZEP', 'Zephaniah', 'Prophets'], ['Hag', 'HAG', 'Haggai', 'Prophets'],
  ['Zech', 'ZEC', 'Zechariah', 'Prophets'], ['Mal', 'MAL', 'Malachi', 'Prophets'],
  ['Matt', 'MAT', 'Matthew', 'Gospels'], ['Mark', 'MRK', 'Mark', 'Gospels'], ['Luke', 'LUK', 'Luke', 'Gospels'], ['John', 'JHN', 'John', 'Gospels'], ['Acts', 'ACT', 'Acts', 'Acts'],
  ['Rom', 'ROM', 'Romans', 'Paul'], ['1Cor', '1CO', '1 Corinthians', 'Paul'], ['2Cor', '2CO', '2 Corinthians', 'Paul'], ['Gal', 'GAL', 'Galatians', 'Paul'], ['Eph', 'EPH', 'Ephesians', 'Paul'],
  ['Phil', 'PHP', 'Philippians', 'Paul'], ['Col', 'COL', 'Colossians', 'Paul'], ['1Thess', '1TH', '1 Thessalonians', 'Paul'], ['2Thess', '2TH', '2 Thessalonians', 'Paul'],
  ['1Tim', '1TI', '1 Timothy', 'Paul'], ['2Tim', '2TI', '2 Timothy', 'Paul'], ['Titus', 'TIT', 'Titus', 'Paul'], ['Phlm', 'PHM', 'Philemon', 'Paul'],
  ['Heb', 'HEB', 'Hebrews', 'General'], ['Jas', 'JAS', 'James', 'General'], ['1Pet', '1PE', '1 Peter', 'General'], ['2Pet', '2PE', '2 Peter', 'General'],
  ['1John', '1JN', '1 John', 'General'], ['2John', '2JN', '2 John', 'General'], ['3John', '3JN', '3 John', 'General'], ['Jude', 'JUD', 'Jude', 'General'], ['Rev', 'REV', 'Revelation', 'Revelation'],
].map(([id, usfm, en, section]) => ({ id, usfm, en, section }));

/** The wording of a stretch of USFM: apparatus removed, character styles dropped, their words kept (the repository importer's rules). */
export function cleanIrv(input: string): string {
  let s = input.normalize('NFC');
  // footnotes (the IRV's study notes) and cross-references are apparatus, not verse wording
  s = s.replace(/\\(?:f|fe|ef|x)\b[\s\S]*?\\(?:f|fe|ef|x)\*/g, '');
  // word markup may carry a pipe and attributes: keep the word
  s = s.replace(/\\w\s+([^|\\]+?)(?:\|[^\\]*)?\\w\*/g, '$1');
  // the inline cross-references set in bold italic, e.g. "(रोम. 10:4)"
  s = s.replace(/\\bdit\b[\s\S]*?\\bdit\*/g, '');
  // every other marker goes; the text and the space around it stay (the IRV writes "मैं\wj*\it \+wj व्यवस्था": two words)
  s = s.replace(/\\\+?[A-Za-z][A-Za-z0-9-]*\*?/g, '');
  return s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?।])/g, '$1').trim();
}

/** Paragraph and poetry markers whose line continues the verse text (`\q1 …` carries words; `\p` alone starts a paragraph). */
const CONTINUATION = /^\\(p|m|nb|pi\d?|q\d?|qc|qr|qm\d?|qa|li\d?|b)(?:\s+|$)/;
/** Lines of apparatus: introductions, headings, titles of the book, book ids. */
const APPARATUS = /^\\(id|ide|h|toc\d?|mt\d?|mte\d?|is\d?|ip|ipi|io\d?|iot|ili\d?|ie|imt\d?|s\d?|ms\d?|mr|r|sr|sp|cl|cp|cd|rem|periph)\b/;

export interface ParsedBook { usfm: string; name: string; book: HiBook }

/**
 * One USFM file → the book: its own Hindi name (`\toc1`, else `\h`) and its chapters of verses. Throws on a verse number that repeats or goes
 * backwards, or a chapter without verses, so a damaged file stops the build.
 */
export function parseIrvBook(usfm: string, id: string): ParsedBook {
  const lines = usfm.replace(/^\uFEFF/, '').split(/\r?\n/);
  let code = '';
  let name = '';
  let heading = '';
  const chapters: HiChapter[] = [];
  let chapter: HiChapter | undefined;
  let verse: HiVerse | undefined;
  let paragraphPending = false;
  let titlePending = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpExecArray | null;
    if ((m = /^\\id\s+(\S+)/.exec(line))) { code = m[1]; continue; }
    if ((m = /^\\toc1\s+(.+)$/.exec(line))) { name = cleanIrv(m[1]); continue; }
    if ((m = /^\\h\s+(.+)$/.exec(line))) { heading = cleanIrv(m[1]); continue; }
    if ((m = /^\\c\s+(\d+)/.exec(line))) {
      const n = Number(m[1]);
      if (chapter && !chapter.verses.length) throw new Error(`${id} ${chapter.n}: a chapter without verses`);
      if (n !== chapters.length + 1) throw new Error(`${id}: chapter ${n} follows chapter ${chapters.length}`);
      chapter = { n, verses: [] };
      chapters.push(chapter);
      verse = undefined; paragraphPending = false; titlePending = '';
      continue;
    }
    if (APPARATUS.test(line)) continue;
    if ((m = /^\\d(?:\s+(.*))?$/.exec(line))) {
      const d = cleanIrv(m[1] ?? '');
      // a title of two lines (Psalm 88) keeps its line break: the reader shows it as the IRV prints it
      if (d) titlePending = titlePending ? `${titlePending}\n${d}` : d;
      continue;
    }
    if (!chapter) continue; // the book's introduction, before \c 1
    // a verse may begin a line of its own or follow a paragraph / poetry marker on the same line ("\q1 \v 3 …")
    let rest = line;
    const cont = CONTINUATION.exec(rest);
    if (cont) {
      if (/^(p|m|nb|pi\d?)$/.test(cont[1])) paragraphPending = true;
      rest = rest.slice(cont[0].length);
    }
    // a line may hold several verses
    const parts = rest.split(/(?=\\v\s+\d+)/);
    for (const part of parts) {
      const v = /^\\v\s+(\d+)\s*([\s\S]*)$/.exec(part);
      if (v) {
        const n = Number(v[1]);
        const last = chapter.verses[chapter.verses.length - 1];
        if (last && n <= last.n) throw new Error(`${id} ${chapter.n}:${n} follows verse ${last.n}`);
        verse = { n, t: cleanIrv(v[2]) };
        if (paragraphPending && chapter.verses.length) verse.p = 1;
        if (titlePending) { verse.d = titlePending; titlePending = ''; }
        paragraphPending = false;
        chapter.verses.push(verse);
      } else if (verse) {
        const more = cleanIrv(part);
        if (more) verse.t = verse.t ? `${verse.t} ${more}` : more;
      }
    }
  }
  if (chapter && !chapter.verses.length) throw new Error(`${id} ${chapter.n}: a chapter without verses`);
  if (!chapters.length) throw new Error(`${id}: no chapters`);
  // the punctuation rule of cleanIrv, applied once more across joined continuation lines
  for (const c of chapters) for (const v of c.verses) v.t = v.t.replace(/\s+([,.;:!?।])/g, '$1');
  return { usfm: code, name: name || heading, book: { book: id, chapters } };
}

/** A row of the Hindi edition's canon.json (the shape the reader's `parseCanon` takes). */
export interface HiCanonRow { id: string; lang: 'hi'; en: string; native: string; section: string; verses: number[] }

/**
 * Every IRV book from its file contents (keyed by USFM book code, e.g. `GEN`): the books in canon order and the canon rows. Throws when a book
 * of the 66 has no file, or a file's `\id` is not the book it was given for.
 */
export function buildIrv(files: ReadonlyMap<string, string>): { canon: HiCanonRow[]; books: HiBook[] } {
  const canon: HiCanonRow[] = [];
  const books: HiBook[] = [];
  for (const info of IRV_BOOKS) {
    const text = files.get(info.usfm);
    if (text === undefined) throw new Error(`the IRV file for ${info.en} (${info.usfm}) is missing`);
    const parsed = parseIrvBook(text, info.id);
    if (parsed.usfm !== info.usfm) throw new Error(`the file given for ${info.usfm} says \\id ${parsed.usfm}`);
    if (!parsed.name) throw new Error(`${info.usfm}: no book name (\\toc1 or \\h)`);
    books.push(parsed.book);
    canon.push({ id: info.id, lang: 'hi', en: info.en, native: parsed.name, section: info.section, verses: parsed.book.chapters.map((c) => c.verses.length) });
  }
  return { canon, books };
}

/** The attribution the licence asks for, as shown in the app and written beside the data (SOURCES.json). */
export const IRV_ATTRIBUTION = {
  title: 'इंडियन रिवाइज्ड वर्जन (IRV) हिंदी - 2019',
  english: 'The Indian Revised Version Holy Bible in the Hindi language of India',
  copyright: 'Copyright © 2017, 2018, 2019 Bridge Connectivity Solutions',
  licence: 'Creative Commons Attribution Share-Alike 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  source: 'https://ebible.org/hin2017/',
  sourceDate: 'source files dated 2023-04-11',
  changes: 'The verse wording is unchanged. The book introductions, section headings, study notes and the cross-references the edition sets apart as notes are not shown (16 verses keep a reference printed inside the verse, as eBible.org’s own text does); the verses are laid out by Biblia. These changes are not endorsed by the original licensor.',
} as const;
