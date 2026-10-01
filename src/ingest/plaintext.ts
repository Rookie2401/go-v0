/**
 * Plain text → import documents. The exact text of a book (a .txt the learner made from a copy he is entitled to
 * use) becomes one version 2 document per chapter, each a personal copy (source.rights 'personal-copy', authorship
 * 'published'): readable on this device, labelled "Your copy", never bundled. See docs/IMPORT.md, "Your own copy of a
 * book". Nothing here reads or writes a file; `scripts/corpus-convert.mts` is the command-line wrapper.
 *
 * Exactness: a paragraph is a non-empty line of the input (Thai and the default) or a block of lines between blank lines
 * (Western prose that is hard-wrapped), stored as a raw paragraph `{ text }`. The only change ever made to a line is
 * trimming plain indentation (spaces and tabs) at its two ends, and that is reported in `notes`. Two things are done only
 * on request, and every one is counted in the result: `unwrap` joins the lines of a block (a single space; a hyphenated
 * line break is re-joined unless the word is hyphenated elsewhere in the text) and `stripBoilerplate` removes exactly the
 * lines `inspectText` identified as boilerplate, keeping them retrievable in the result. No Unicode normalisation, no
 * re-spacing, no added spaces; sentence boundaries inside a paragraph are left to the importer. A chapter heading line
 * becomes the title of its section (its text is kept, exactly).
 */
import type { LanguageCode, QualityReport, TextKind, Work } from '../core';
import type { CorpusDocument, DocWork } from './format';
import { autoHeading, detectHeadings, westernHeading, type Heading } from './headings';
import { findBoilerplate, inspectText, looksHardWrapped, type QualityOptions } from './quality';

export interface PlainTextOptions {
  lang: LanguageCode;
  /** The curriculum work this is a copy of (title, author, stage come from it). */
  work?: Work;
  /** Used when there is no work: a free-standing text. */
  title?: string;
  /** Used when there is no work: who wrote it (the credit line of a free-standing book). */
  author?: string;
  contentType?: TextKind;
  /** Stable slug prefix for the produced documents; default derives from the work slug or the title. */
  idPrefix?: string;
  /**
   * How chapters are found: 'auto' recognises common Thai/English chapter headings ("บทที่ ๑", "ตอนที่ 3", "Chapter 4") and, for
   * the other languages, Spanish and English ones ("Capítulo I", "CAPÍTULO PRIMERO", "Libro segundo", "Parte tercera", "I.")
   * on their own line; 'none' makes one document; a RegExp source string is matched against whole lines.
   */
  chapters?: 'auto' | 'none' | string;
  /**
   * Line numbers (1-based, physical lines of the file) that are chapter headings. The correction path: call once, read
   * `headings` in the result, call again with the corrected list. It wins over `chapters`.
   */
  headings?: number[];
  /**
   * What a paragraph is: 'lines' (every non-empty line) or 'blank-line' (the lines between blank lines). Default: 'blank-line'
   * when the text has hard-wrapped lines (never for Thai), otherwise 'lines'.
   */
  paragraphs?: 'lines' | 'blank-line';
  /** Join the lines of a blank-line paragraph (single space; hyphenated line breaks re-joined unless the word is hyphenated elsewhere). Counted. */
  unwrap?: boolean;
  /** Remove ONLY the lines `inspectText` identified as boilerplate (licence header and footer, production credits, copyright lines); they stay in `removed`. */
  stripBoilerplate?: boolean;
  /** Where the text came from, for the quality check. */
  sourceKind?: QualityOptions['sourceKind'];
  /** Catalogue facts and variety, carried to every document (`Text.streams / domains / variety`). */
  streams?: string[];
  domains?: string[];
  variety?: string;
  /** Who is importing and from what copy ("my paperback, 12th printing") — recorded in source.provenance. */
  copyNote?: string;
}

export interface PlainTextResult {
  documents: CorpusDocument[];
  /** What was recognised and what was not, in plain words ("14 chapters found by headings like 'บทที่ ๑'"). */
  notes: string[];
  /** The headings detected (or given): line number (1-based), the heading line and its title. Pass a corrected list of lines as `headings` to change them. */
  headings: Array<{ line: number; text: string; title?: string }>;
  /** The source-quality report (also stored on each document as `quality`). */
  quality: QualityReport;
  /** What `stripBoilerplate` removed, exactly (1-based inclusive lines and the text), so nothing is lost. */
  removed: Array<{ kind: 'boilerplate' | 'title-page-noise'; label: string; startLine: number; endLine: number; text: string }>;
  /** What `unwrap` did: line breaks joined with a space, hyphenated breaks re-joined, hyphenated breaks kept as real hyphens. */
  unwrapped?: { spaces: number; dehyphenated: number; hyphenKept: number };
}

const INDENT = /^[ \t]+|[ \t]+$/g;

/** The original matcher for a custom regular expression (or none). */
function customMatcher(mode: string): ((line: string) => Heading | undefined) | undefined {
  if (mode === 'none' || mode === 'auto') return undefined;
  let re: RegExp;
  try { re = new RegExp(`^(?:${mode})$`, 'u'); }
  catch (e) { throw new Error(`chapters: "${mode}" is not a valid regular expression (${e instanceof Error ? e.message : String(e)})`); }
  return (line) => {
    const m = re.exec(line);
    if (!m) return undefined;
    const title = m.groups?.title?.trim();
    return { line, ...(title ? { title } : {}), kind: 'numbered' };
  };
}

const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

interface Block { heading?: Heading; headingLine?: number; paragraphs: string[] }

/**
 * Turn the exact text of a book into one v2 import document per chapter. The text is never altered: paragraphs are
 * the text's own lines (or blocks); sentence boundaries inside a paragraph are left to the importer. The documents are personal
 * copies (source.rights 'personal-copy', authorship 'published'): readable on this device, never bundled.
 */
export function plainTextToDocuments(text: string, opts: PlainTextOptions): PlainTextResult {
  const bookTitle = (opts.work?.title ?? opts.title ?? '').trim();
  if (!bookTitle) throw new Error('plainTextToDocuments: give the work or a title');
  const notes: string[] = [];
  const mode = opts.chapters ?? 'auto';
  const lang = opts.lang;

  // ── lines: BOM and line endings are handled, nothing else in the text is touched ──
  let body = text;
  if (body.startsWith('﻿')) { body = body.slice(1); notes.push('A byte order mark at the start of the file was removed.'); }
  if (/\r/.test(body)) notes.push('Windows line endings (CRLF) were read as ordinary line breaks.');
  if (body.includes('�')) notes.push('The text contains replacement characters (�): the file may not be UTF-8, or part of it is damaged. Check it before reading.');
  const lines = body.split(/\r\n|\r|\n/);

  const quality = inspectText(body, { lang, sourceKind: opts.sourceKind });

  // ── boilerplate: removed only on request, and only what the quality check identified ──
  const removedLines = new Set<number>();
  const removed: PlainTextResult['removed'] = [];
  if (opts.stripBoilerplate) {
    for (const r of findBoilerplate(lines)) {
      for (let i = r.startLine; i <= r.endLine; i++) removedLines.add(i);
      removed.push({ kind: r.kind, label: r.label, startLine: r.startLine + 1, endLine: r.endLine + 1, text: lines.slice(r.startLine, r.endLine + 1).join('\n') });
    }
  }
  /** The lines as the converter reads them: indentation trimmed, removed lines gone (blank). */
  const work = lines.map((l, i) => (removedLines.has(i) ? '' : l.replace(INDENT, '')));
  const stripped = lines.map((l, i) => (removedLines.has(i) ? '' : l));

  // ── what a paragraph is ──
  const wrapped = lang !== 'th' && looksHardWrapped(stripped, lang);
  const pmode = opts.paragraphs ?? (wrapped ? 'blank-line' : 'lines');

  // ── headings ──
  const headingAt = new Map<number, Heading>();
  if (opts.headings) {
    for (const n of opts.headings) {
      const i = n - 1;
      if (Number.isInteger(i) && i >= 0 && i < work.length && work[i] !== '') headingAt.set(i, autoHeading(work[i]) ?? (lang === 'th' ? undefined : westernHeading(work[i])) ?? { line: work[i], kind: 'numbered' });
    }
  } else if (mode === 'auto') {
    for (const { index, heading } of detectHeadings(work, lang)) headingAt.set(index, heading);
  } else if (mode !== 'none') {
    const match = customMatcher(mode)!;
    work.forEach((l, i) => { if (l !== '') { const h = match(l); if (h) headingAt.set(i, h); } });
  }

  // ── unwrapping (only on request): every join is counted ──
  const unwrapStats = { spaces: 0, dehyphenated: 0, hyphenKept: 0 };
  const hyphenated = new Set<string>();
  if (opts.unwrap && pmode === 'blank-line') {
    for (const l of work) for (const m of l.matchAll(/\p{L}+(?:-\p{L}+)+/gu)) hyphenated.add(m[0].toLowerCase());
  }
  const joinLines = (cur: string[]): string => {
    if (!opts.unwrap || cur.length === 1) return cur.join('\n');
    let out = cur[0];
    for (let k = 1; k < cur.length; k++) {
      const next = cur[k];
      const left = /(\p{L}+)-$/u.exec(out);
      const right = /^(\p{L}+)/u.exec(next);
      if (left && !/--$/.test(out) && /^\p{Ll}/u.test(next) && right) {
        if (hyphenated.has(`${left[1]}-${right[1]}`.toLowerCase())) { out += next; unwrapStats.hyphenKept++; } // a real hyphen: keep it
        else { out = out.slice(0, -1) + next; unwrapStats.dehyphenated++; }
      } else { out += ` ${next}`; unwrapStats.spaces++; }
    }
    return out;
  };

  // ── blocks ──
  const blocks: Block[] = [{ paragraphs: [] }];
  let blank = 0;
  let trimmed = 0;
  let notNfc = 0;
  let paragraphs = 0;
  let cur: string[] = [];
  const addParagraph = (p: string) => {
    blocks[blocks.length - 1].paragraphs.push(p);
    paragraphs++;
    if (p !== p.normalize('NFC')) notNfc++;
  };
  const flush = () => { if (cur.length) { addParagraph(joinLines(cur)); cur = []; } };
  lines.forEach((raw, i) => {
    const line = work[i];
    if (line === '') { if (!removedLines.has(i)) blank++; flush(); return; }
    if (line !== raw) trimmed++;
    const heading = headingAt.get(i);
    if (heading) { flush(); blocks.push({ heading, headingLine: i + 1, paragraphs: [] }); return; }
    if (pmode === 'lines') addParagraph(line); else cur.push(line);
  });
  flush();

  // ── chapters: headed blocks that have text; text before the first heading is front matter ──
  const headed = blocks.filter((b) => b.heading);
  const kept = headed.filter((b) => b.paragraphs.length > 0);
  const empty = headed.filter((b) => b.paragraphs.length === 0);
  const front = blocks[0].paragraphs.length > 0 ? blocks[0] : undefined;

  if (mode === 'none' && !opts.headings) notes.push('Chapter detection is off: the whole text is one chapter.');
  else if (headed.length === 0) notes.push(mode === 'auto' || opts.headings
    ? 'No chapter headings were found (a heading is a line such as "บทที่ ๑", "ตอนที่ 3", "Capítulo I" or "Chapter 4" on its own), so the whole text is one chapter.'
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
  if (front && headed.length && !(mode === 'none' && !opts.headings)) notes.push('The text before the first heading is kept as chapter 0, "Front matter".');
  if (pmode === 'lines') {
    notes.push(`${paragraphs} paragraph${paragraphs === 1 ? '' : 's'} read, one for each non-empty line; ${blank} blank line${blank === 1 ? '' : 's'} skipped.`);
    if (opts.unwrap) notes.push('Unwrap has no effect here: every line is its own paragraph (set paragraphs to "blank-line" to join lines).');
  } else {
    notes.push(`${paragraphs} paragraph${paragraphs === 1 ? '' : 's'} read, each the lines between blank lines (${blank} blank line${blank === 1 ? '' : 's'} between them).`);
    if (!opts.unwrap) notes.push('The line breaks inside a paragraph are kept exactly as they are (unwrap is off).');
  }
  if (trimmed) notes.push(`Spaces or tabs at the start or end of ${trimmed} line${trimmed === 1 ? '' : 's'} were trimmed. That is the only change made to the text${opts.unwrap || removed.length ? ' unless you asked for more (see below)' : ''}.`);
  if (notNfc) notes.push(`${notNfc} paragraph${notNfc === 1 ? ' is' : 's are'} not in Unicode NFC; they are stored exactly as supplied.`);
  if (paragraphs === 0) notes.push('The text has no content.');
  if (opts.unwrap && pmode === 'blank-line') {
    const { spaces, dehyphenated, hyphenKept } = unwrapStats;
    notes.push(`Unwrap joined ${spaces + dehyphenated + hyphenKept} line break${spaces + dehyphenated + hyphenKept === 1 ? '' : 's'}: ${spaces} with a single space, ${dehyphenated} hyphenated break${dehyphenated === 1 ? '' : 's'} re-joined into one word, ${hyphenKept} kept their hyphen because the word is hyphenated elsewhere in the text.`);
  }
  if (opts.stripBoilerplate) {
    const lineCount = removedLines.size;
    notes.push(removed.length
      ? `Removed ${removed.length} boilerplate block${removed.length === 1 ? '' : 's'} (${lineCount} line${lineCount === 1 ? '' : 's'}): ${removed.map((r) => `${r.label}, lines ${r.startLine}-${r.endLine}`).join('; ')}. The removed text is in the result's "removed" list.`
      : 'No boilerplate was found to remove.');
  }
  if (quality.verdict !== 'clean') {
    const codes = quality.flags.map((f) => `${f.code}${f.severity === 'serious' ? ' (serious)' : ''}`).join(', ');
    notes.push(quality.verdict === 'damaged'
      ? `The source looks damaged: ${codes}. You can still import it as your own copy, but look at the flagged places first.`
      : `Source check: usable, with ${quality.flags.length} note${quality.flags.length === 1 ? '' : 's'}: ${codes}.`);
  }

  // ── one document per chapter ──
  type Chapter = { index: number; heading?: Heading; front: boolean; paragraphs: string[] };
  const chapters: Chapter[] = [];
  if (headed.length === 0 || (mode === 'none' && !opts.headings)) {
    const all = blocks.flatMap((b) => b.paragraphs);
    if (all.length) chapters.push({ index: 1, front: false, paragraphs: all });
  } else {
    if (front) chapters.push({ index: 0, front: true, paragraphs: front.paragraphs });
    kept.forEach((b, i) => chapters.push({ index: i + 1, heading: b.heading, front: false, paragraphs: b.paragraphs }));
  }

  const workSlug = opts.work ? opts.work.id.slice(`work:${opts.work.courseId}:`.length) : undefined;
  const prefix = opts.idPrefix ?? workSlug ?? (slugify(opts.title ?? '') || 'book');
  const width = Math.max(2, String(chapters.length).length);
  const author = (opts.work?.author ?? opts.author)?.trim();
  const copy = opts.copyNote?.trim();
  const provenance = `Supplied by the learner from a personal copy${copy ? ` (${copy})` : ''}; transcription not checked.`;

  const documents = chapters.map((ch): CorpusDocument => {
    const heading = ch.heading?.line;
    const chapterTitle = ch.front ? 'Front matter' : ch.heading?.title;
    const docWork: DocWork | undefined = workSlug
      ? { slug: workSlug, courseId: opts.work!.courseId, chapter: { index: ch.index, ...(chapterTitle ? { title: chapterTitle } : {}) } }
      : undefined;
    return {
      schemaVersion: 2,
      id: `${prefix}-ch${String(ch.index).padStart(width, '0')}`,
      lang,
      title: ch.front ? `${bookTitle} — Front matter` : heading ? `${bookTitle} — ${heading}` : bookTitle,
      contentType: opts.contentType ?? 'story',
      corpus: { id: `personal-${lang}`, kind: 'comprehensible-input', title: 'Your books' },
      source: {
        id: `src:${lang}:${prefix}`,
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
      ...(docWork ? { work: docWork } : {}),
      ...(opts.streams?.length ? { streams: [...opts.streams] } : {}),
      ...(opts.domains?.length ? { domains: [...opts.domains] } : {}),
      ...(opts.variety ? { variety: opts.variety } : {}),
      quality,
      sections: [{ ...(heading ? { title: heading } : {}), paragraphs: ch.paragraphs.map((p) => ({ text: p })) }],
    };
  });

  return {
    documents, notes, quality, removed,
    headings: headed.map((b) => ({ line: b.headingLine!, text: b.heading!.line, ...(b.heading!.title ? { title: b.heading!.title } : {}) })),
    ...(opts.unwrap && pmode === 'blank-line' ? { unwrapped: unwrapStats } : {}),
  };
}
