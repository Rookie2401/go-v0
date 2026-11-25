/**
 * Biblia's translation editions read their text from the publisher's USFM files (Hindi IRV, Thai OTCV, German Schlachter 1951, Spanish
 * Reina-Valera 1909). Pure functions, no file access: the build (vite.config.ts) and the tests feed them the files.
 *
 * Kept exactly as the publisher wrote it: the wording of every verse, and the superscriptions that stand before a verse (`\d`: the Psalm
 * titles; `\qa`: the acrostic letter headings of Psalm 119 and Lamentations). Left out, because they are the edition's apparatus rather than
 * its text: book introductions (`\is`, `\ip`, `\io` …), section and parallel-passage headings (`\s`, `\ms`, `\mr`, `\r`, `\sp`, `\cl` …), study
 * notes (`\f … \f*`), cross-references (`\x … \x*`), and any character style an edition names in `dropSpans` (the IRV sets inline
 * cross-references in `\bdit`). Every other character style (`\wj`, `\it`, `\add`, `\nd`, `\w word|strong="…"` …) is dropped and its words kept.
 * Paragraph markers (`\p`, `\m`, `\pi`, `\b` …) become Biblia's paragraph breaks; poetry and list lines (`\q1`, `\li1` …) continue the verse.
 * A verse number may begin a line of its own or follow a marker on the same line, and a line may hold several verses.
 */

export interface TextVerse {
  n: number;
  /** the verse as the edition prints it */
  t: string;
  /** a paragraph begins with this verse */
  p?: 1;
  /** a superscription that stands before this verse (a Psalm title before verse 1; a letter of Psalm 119); two lines are kept as two */
  d?: string;
}
export interface TextChapter { n: number; verses: TextVerse[] }
export interface TextBook { book: string; chapters: TextChapter[] }

export interface BookInfo66 { id: string; usfm: string; en: string; section: string }

/** The 66 books of the Protestant canon in its usual order, with Biblia's ids (OSIS, as the original edition) and English names. */
export const PROTESTANT_BOOKS: readonly BookInfo66[] = [
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

export interface UsfmOptions {
  /** character styles whose whole span (marker, words and end marker) is apparatus to leave out, e.g. ['bdit'] for the IRV's inline cross-references */
  dropSpans?: readonly string[];
  /**
   * 'delimiter': the space after an opening marker is only its separator, as the USFM standard has it (the OTCV writes "รวม\litl 12 คน\litl*",
   * read รวม12 คน). 'keep' (the default): that space stays, as eBible.org's own pages render the IRV ("मैं\wj*\it \+wj व्यवस्था" is two words).
   */
  markerSpace?: 'keep' | 'delimiter';
  /** stretches of the source's own apparatus inside verses to leave out (the Schlachter files print German verse numbers as "(03-2)") */
  dropPatterns?: readonly RegExp[];
}

/** The wording of a stretch of USFM: notes and cross-references removed, character styles dropped, their words kept. */
export function cleanUsfm(input: string, opts: UsfmOptions = {}): string {
  let s = input.normalize('NFC');
  // footnotes and cross-references are apparatus, not verse wording
  s = s.replace(/\\(?:f|fe|ef|x)\b[\s\S]*?\\(?:f|fe|ef|x)\*/g, '');
  // word markup may carry a pipe and attributes (\w word|strong="H7225"\w*, nested as \+w): keep the word
  s = s.replace(/\\(\+?)w\s+([^|\\]+?)(?:\|[^\\]*)?\\\1w\*/g, '$2');
  for (const tag of opts.dropSpans ?? []) s = s.replace(new RegExp(`\\\\${tag}\\b[\\s\\S]*?\\\\${tag}\\*`, 'g'), '');
  // every other marker goes; the text and the space around it stay ("मैं\wj*\it \+wj व्यवस्था" is two words), or, by the standard, an opening
  // marker takes its one separating space with it
  s = opts.markerSpace === 'delimiter' ? s.replace(/\\\+?[A-Za-z][A-Za-z0-9-]*(?:\*| )?/g, '') : s.replace(/\\\+?[A-Za-z][A-Za-z0-9-]*\*?/g, '');
  for (const re of opts.dropPatterns ?? []) s = s.replace(re, ' ');
  return s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?।])/g, '$1').trim();
}

/** Paragraph, poetry and list markers whose line continues the verse text (`\q1 …` carries words; `\p` alone starts a paragraph). */
const CONTINUATION = /^\\(p|m|nb|pi\d?|po|pm|pmo|pmc|pmr|pc|pr|mi|cls|q\d?|qc|qr|qm\d?|li\d?|lh|lf|lim\d?|b)(?:\s+|$)/;
/** The markers among those that begin a new paragraph (a break before the verse that follows). */
const PARAGRAPH = /^(p|m|nb|pi\d?|po|pm|pmo|pc|pr|mi)$/;
/** Lines of apparatus: introductions, headings, titles of the book, book ids, explanatory insertions. */
const APPARATUS = /^\\(id|ide|h|toc\d?|toca\d?|mt\d?|mte\d?|is\d?|ip|ipi|io\d?|iot|ili\d?|ie|iex|imt\d?|s\d?|ms\d?|mr|r|sr|sp|sd\d?|cl|cp|cd|rem|periph|usfm|sts)\b/;

export interface ParsedBook { usfm: string; name: string; book: TextBook }

/**
 * One USFM file → the book: its own name (`\toc1`, else `\h`) and its chapters of verses. Throws on a verse number that repeats or goes
 * backwards, or a chapter without verses, so a damaged file stops the build.
 */
export function parseUsfmBook(usfm: string, id: string, opts: UsfmOptions = {}): ParsedBook {
  const clean = (s: string): string => cleanUsfm(s, opts);
  const lines = usfm.replace(/^\uFEFF/, '').split(/\r?\n/);
  let code = '';
  let name = '';
  let heading = '';
  const chapters: TextChapter[] = [];
  let chapter: TextChapter | undefined;
  let verse: TextVerse | undefined;
  let paragraphPending = false;
  let titlePending = '';
  const addTitle = (d: string): void => { if (d) titlePending = titlePending ? `${titlePending}\n${d}` : d; };
  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    let m: RegExpExecArray | null;
    if ((m = /^\\id\s+(\S+)/.exec(line))) { code = m[1]; continue; }
    if ((m = /^\\toc1\s+(.+)$/.exec(line))) { if (!name) name = clean(m[1]); continue; }
    if ((m = /^\\h\s+(.+)$/.exec(line))) { heading = clean(m[1]); continue; }
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
    // a superscription (\d) or an acrostic heading (\qa): its own line before the verse. A \d line may itself begin a verse ("\d \v 1 …",
    // Habakkuk 3:1 in the OTCV): then what stands before the verse number is the title and the verse goes on as usual.
    if ((m = /^\\(d|qa)(?:\s+(.*))?$/.exec(line))) {
      const body = m[2] ?? '';
      const at = body.search(/\\v\s+\d/);
      if (at < 0) { addTitle(clean(body)); continue; }
      addTitle(clean(body.slice(0, at)));
      line = body.slice(at);
    }
    if (!chapter) continue; // the book's introduction, before \c 1
    let rest = line;
    const cont = CONTINUATION.exec(rest);
    if (cont) {
      // a blank line (\b) separates paragraphs too: the verse after it begins one
      if (PARAGRAPH.test(cont[1]) || cont[1] === 'b') paragraphPending = true;
      rest = rest.slice(cont[0].length);
    }
    for (const part of rest.split(/(?=\\v\s+\d+)/)) {
      const v = /^\\v\s+(\d+)\s*([\s\S]*)$/.exec(part);
      if (v) {
        const n = Number(v[1]);
        const last = chapter.verses[chapter.verses.length - 1];
        if (last && n <= last.n) throw new Error(`${id} ${chapter.n}:${n} follows verse ${last.n}`);
        verse = { n, t: clean(v[2]) };
        if (paragraphPending && chapter.verses.length) verse.p = 1;
        if (titlePending) { verse.d = titlePending; titlePending = ''; }
        paragraphPending = false;
        chapter.verses.push(verse);
      } else if (verse) {
        const more = clean(part);
        if (more) verse.t = verse.t ? `${verse.t} ${more}` : more;
      }
    }
  }
  if (chapter && !chapter.verses.length) throw new Error(`${id} ${chapter.n}: a chapter without verses`);
  if (!chapters.length) throw new Error(`${id}: no chapters`);
  // a verse with no words (the OTCV keeps the number of a verse modern texts omit, Matthew 17:21, with only a note) is left out, as print
  // leaves it out; a paragraph or a title it carried passes to the verse after it
  for (const c of chapters) {
    const kept: TextVerse[] = [];
    let carry: Pick<TextVerse, 'p' | 'd'> = {};
    for (const v of c.verses) {
      if (!v.t) { carry = { ...(v.p || carry.p ? { p: 1 as const } : {}), ...(v.d ?? carry.d ? { d: v.d ?? carry.d } : {}) }; continue; }
      if (carry.p && kept.length) v.p = 1;
      if (carry.d && !v.d) v.d = carry.d;
      carry = {};
      kept.push(v);
    }
    if (!kept.length) throw new Error(`${id} ${c.n}: a chapter whose verses are all empty`);
    c.verses = kept;
  }
  // the punctuation rule of cleanUsfm, applied once more across joined continuation lines
  for (const c of chapters) for (const v of c.verses) v.t = v.t.replace(/\s+([,.;:!?।])/g, '$1');
  return { usfm: code, name: name || heading, book: { book: id, chapters } };
}

/** A row of an edition's canon.json (the shape the reader's `parseCanon` takes). */
export interface CanonRow<L extends string = string> { id: string; lang: L; en: string; native: string; section: string; verses: number[] }

/**
 * Every book of the 66 from its file contents (keyed by USFM book code, e.g. `GEN`): the books in canon order and the canon rows. Throws when a
 * book has no file, or a file's `\id` is not the book it was given for.
 */
export function buildEditionText<L extends string>(files: ReadonlyMap<string, string>, lang: L, opts: UsfmOptions = {}): { canon: CanonRow<L>[]; books: TextBook[] } {
  const canon: CanonRow<L>[] = [];
  const books: TextBook[] = [];
  for (const info of PROTESTANT_BOOKS) {
    const text = files.get(info.usfm);
    if (text === undefined) throw new Error(`the file for ${info.en} (${info.usfm}) is missing`);
    const parsed = parseUsfmBook(text, info.id, opts);
    if (parsed.usfm !== info.usfm) throw new Error(`the file given for ${info.usfm} says \\id ${parsed.usfm}`);
    if (!parsed.name) throw new Error(`${info.usfm}: no book name (\\toc1 or \\h)`);
    books.push(parsed.book);
    canon.push({ id: info.id, lang, en: info.en, native: parsed.name, section: info.section, verses: parsed.book.chapters.map((c) => c.verses.length) });
  }
  return { canon, books };
}
