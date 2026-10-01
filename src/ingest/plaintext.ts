/**
 * Plain text → import documents. The exact text of a book (a .txt the learner made from a copy he is entitled to
 * use) becomes one version 2 document per chapter, each a personal copy (source.rights 'personal-copy', authorship
 * 'published'): readable on this device, labelled "Your copy", never bundled. See docs/IMPORT.md, "Your own copy of a
 * book". Nothing here reads or writes a file; `scripts/corpus-convert.mts` is the command-line wrapper.
 *
 * Exactness: a paragraph is a non-empty line of the input, stored as a raw paragraph `{ text }`. The only change ever
 * made to a line is trimming plain indentation (spaces and tabs) at its two ends, and that is reported in `notes`.
 * No Unicode normalisation, no re-spacing, no added spaces; sentence boundaries inside a paragraph are left to the
 * importer. A chapter heading line becomes the title of its section (its text is kept, exactly).
 */
import type { LanguageCode, TextKind, Work } from '../core';
import type { CorpusDocument, DocWork } from './format';

export interface PlainTextOptions {
  lang: LanguageCode;
  /** The curriculum work this is a copy of (title, author, stage come from it). */
  work?: Work;
  /** Used when there is no work: a free-standing text. */
  title?: string;
  contentType?: TextKind;
  /** Stable slug prefix for the produced documents; default derives from the work slug or the title. */
  idPrefix?: string;
  /**
   * How chapters are found: 'auto' recognises common Thai/English chapter headings ("บทที่ ๑", "ตอนที่ 3", "Chapter 4")
   * on their own line; 'none' makes one document; a RegExp source string is matched against whole lines.
   */
  chapters?: 'auto' | 'none' | string;
  /** Who is importing and from what copy ("my paperback, 12th printing") — recorded in source.provenance. */
  copyNote?: string;
}

export interface PlainTextResult {
  documents: CorpusDocument[];
  /** What was recognised and what was not, in plain words ("14 chapters found by headings like 'บทที่ ๑'"). */
  notes: string[];
}

// Chapter words, written as escapes so no editor can change a character:
//   บทที่ (U+0E1A U+0E17 U+0E17 U+0E35 U+0E48), ตอนที่ (U+0E15 U+0E2D U+0E19 …), ภาคที่ (U+0E20 U+0E32 U+0E04 …).
// "ที่" is accepted with the tone mark before or after the vowel, as sloppy files have both orders.
const THI = '\\u0E17(?:\\u0E35\\u0E48|\\u0E48\\u0E35)';
const CHAPTER_WORD = `(?:\\u0E1A\\u0E17${THI}|\\u0E15\\u0E2D\\u0E19${THI}|\\u0E20\\u0E32\\u0E04${THI}|chapter)`;
/** Western digits and Thai digits ๐–๙ (U+0E50–U+0E59). */
const DIGITS = '[0-9\\u0E50-\\u0E59]+';
const AUTO_HEADING = new RegExp(`^(${CHAPTER_WORD})\\s*(${DIGITS})(.*)$`, 'iu');
const HEADING_SEPARATOR = /^[\s:：.\-–—)\]]/u;
const MAX_TITLE_LENGTH = 100;
const INDENT = /^[ \t]+|[ \t]+$/g;

interface Heading { line: string; title?: string; number?: number }

const thaiDigitsToAscii = (s: string): string => s.replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0E50));

function autoHeading(line: string): Heading | undefined {
  const m = AUTO_HEADING.exec(line);
  if (!m) return undefined;
  const rest = m[3];
  let title: string | undefined;
  if (rest !== '') {
    if (!HEADING_SEPARATOR.test(rest)) return undefined; // "บทที่ 1abc": not a heading
    title = rest.replace(/^[\s:：.\-–—)\]]+/u, '').trim();
    if (title.length > MAX_TITLE_LENGTH) return undefined; // a sentence that happens to begin with a chapter word
  }
  return { line, ...(title ? { title } : {}), number: Number(thaiDigitsToAscii(m[2])) };
}

function headingMatcher(mode: string): ((line: string) => Heading | undefined) | undefined {
  if (mode === 'none') return undefined;
  if (mode === 'auto') return autoHeading;
  let re: RegExp;
  try { re = new RegExp(`^(?:${mode})$`, 'u'); }
  catch (e) { throw new Error(`chapters: "${mode}" is not a valid regular expression (${e instanceof Error ? e.message : String(e)})`); }
  return (line) => {
    const m = re.exec(line);
    if (!m) return undefined;
    const title = m.groups?.title?.trim();
    return { line, ...(title ? { title } : {}) };
  };
}

const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

interface Block { heading?: Heading; paragraphs: string[] }

/**
 * Turn the exact text of a book into one v2 import document per chapter. The text is never altered: paragraphs are
 * the text's own lines; sentence boundaries inside a paragraph are left to the importer. The documents are personal
 * copies (source.rights 'personal-copy', authorship 'published'): readable on this device, never bundled.
 */
export function plainTextToDocuments(text: string, opts: PlainTextOptions): PlainTextResult {
  const bookTitle = (opts.work?.title ?? opts.title ?? '').trim();
  if (!bookTitle) throw new Error('plainTextToDocuments: give the work or a title');
  const notes: string[] = [];
  const mode = opts.chapters ?? 'auto';

  // ── lines: BOM and line endings are handled, nothing else in the text is touched ──
  let body = text;
  if (body.startsWith('﻿')) { body = body.slice(1); notes.push('A byte order mark at the start of the file was removed.'); }
  if (/\r/.test(body)) notes.push('Windows line endings (CRLF) were read as ordinary line breaks.');
  if (body.includes('�')) notes.push('The text contains replacement characters (�): the file may not be UTF-8, or part of it is damaged. Check it before reading.');
  const lines = body.split(/\r\n|\r|\n/);

  const match = headingMatcher(mode);
  const blocks: Block[] = [{ paragraphs: [] }];
  let blank = 0;
  let trimmed = 0;
  let notNfc = 0;
  let paragraphs = 0;
  for (const raw of lines) {
    const line = raw.replace(INDENT, '');
    if (line.trim() === '') { blank++; continue; }
    if (line !== raw) trimmed++;
    const heading = match?.(line);
    if (heading) { blocks.push({ heading, paragraphs: [] }); continue; }
    blocks[blocks.length - 1].paragraphs.push(line);
    paragraphs++;
    if (line !== line.normalize('NFC')) notNfc++;
  }

  // ── chapters: headed blocks that have text; text before the first heading is front matter ──
  const headed = blocks.filter((b) => b.heading);
  const kept = headed.filter((b) => b.paragraphs.length > 0);
  const empty = headed.filter((b) => b.paragraphs.length === 0);
  const front = blocks[0].paragraphs.length > 0 ? blocks[0] : undefined;

  if (mode === 'none') notes.push('Chapter detection is off: the whole text is one chapter.');
  else if (headed.length === 0) notes.push(mode === 'auto'
    ? 'No chapter headings were found (a heading is a line such as "บทที่ ๑", "ตอนที่ 3" or "Chapter 4" on its own), so the whole text is one chapter.'
    : 'No line matched the chapter pattern, so the whole text is one chapter.');
  else {
    const first = headed[0].heading!.line;
    notes.push(`${kept.length} chapter${kept.length === 1 ? '' : 's'} found by headings like "${first}".`);
    const numbers = kept.map((b) => b.heading!.number).filter((n): n is number => n !== undefined);
    if (numbers.length === kept.length && numbers.some((n, i) => n !== i + 1)) {
      notes.push(`The heading numbers (${numbers.slice(0, 8).join(', ')}${numbers.length > 8 ? ', …' : ''}) do not run 1, 2, 3, …; chapters are numbered in the order they appear.`);
    }
  }
  for (const b of empty) notes.push(`The heading "${b.heading!.line}" has no text after it and was skipped.`);
  if (front && headed.length) notes.push('The text before the first heading is kept as chapter 0, "Front matter".');
  notes.push(`${paragraphs} paragraph${paragraphs === 1 ? '' : 's'} read, one for each non-empty line; ${blank} blank line${blank === 1 ? '' : 's'} skipped.`);
  if (trimmed) notes.push(`Spaces or tabs at the start or end of ${trimmed} line${trimmed === 1 ? '' : 's'} were trimmed. That is the only change made to the text.`);
  if (notNfc) notes.push(`${notNfc} paragraph${notNfc === 1 ? ' is' : 's are'} not in Unicode NFC; they are stored exactly as supplied.`);
  if (paragraphs === 0) notes.push('The text has no content.');

  // ── one document per chapter ──
  type Chapter = { index: number; heading?: Heading; front: boolean; paragraphs: string[] };
  const chapters: Chapter[] = [];
  if (headed.length === 0 || mode === 'none') {
    const all = blocks.flatMap((b) => b.paragraphs);
    if (all.length) chapters.push({ index: 1, front: false, paragraphs: all });
  } else {
    if (front) chapters.push({ index: 0, front: true, paragraphs: front.paragraphs });
    kept.forEach((b, i) => chapters.push({ index: i + 1, heading: b.heading, front: false, paragraphs: b.paragraphs }));
  }

  const workSlug = opts.work ? opts.work.id.slice(`work:${opts.work.courseId}:`.length) : undefined;
  const prefix = opts.idPrefix ?? workSlug ?? (slugify(opts.title ?? '') || 'book');
  const width = Math.max(2, String(chapters.length).length);
  const author = opts.work?.author?.trim();
  const copy = opts.copyNote?.trim();
  const provenance = `Supplied by the learner from a personal copy${copy ? ` (${copy})` : ''}; transcription not checked.`;

  const documents = chapters.map((ch): CorpusDocument => {
    const heading = ch.heading?.line;
    const chapterTitle = ch.front ? 'Front matter' : ch.heading?.title;
    const work: DocWork | undefined = workSlug
      ? { slug: workSlug, courseId: opts.work!.courseId, chapter: { index: ch.index, ...(chapterTitle ? { title: chapterTitle } : {}) } }
      : undefined;
    return {
      schemaVersion: 2,
      id: `${prefix}-ch${String(ch.index).padStart(width, '0')}`,
      lang: opts.lang,
      title: ch.front ? `${bookTitle} — Front matter` : heading ? `${bookTitle} — ${heading}` : bookTitle,
      contentType: opts.contentType ?? 'story',
      corpus: { id: `personal-${opts.lang}`, kind: 'comprehensible-input', title: 'Your books' },
      source: {
        id: `src:${opts.lang}:${prefix}`,
        title: bookTitle,
        ...(author ? { author } : {}),
        ...(opts.work?.publisher ? { publisher: opts.work.publisher } : {}),
        ...(opts.work?.edition ? { edition: opts.work.edition } : {}),
        attribution: `${bookTitle}${author ? ` — ${author}` : ''}. Your own copy; not distributed.`,
        provenance,
        rights: 'personal-copy',
        licenseNote: 'Personal copy: kept on this device, never bundled or shared.',
        authorship: 'published',
      },
      review: { status: 'unreviewed' },
      topics: [],
      editorialTags: [],
      prepTargets: [],
      generated: false,
      ...(work ? { work } : {}),
      sections: [{ ...(heading ? { title: heading } : {}), paragraphs: ch.paragraphs.map((p) => ({ text: p })) }],
    };
  });

  return { documents, notes };
}
