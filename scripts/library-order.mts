/// <reference types="node" />
/**
 * npm run library:order -- <lang> [--manifest data/sources/course-library/<lang>.json] [--in data/sources] [--dry]
 *
 * Puts the INPUTS of a library build in order before the build runs. It changes source files under the input
 * directory and the build manifest, says exactly what it changed, and writes a record beside the manifest
 * (`<lang>.order-report.json`). Run it again and it changes nothing. With --dry nothing is written.
 *
 *  Scripture       the chapters of a Bible are put in the order of the canon and numbered by their place in it
 *                  (Genesis 1 = 1 … Revelation 22 = 1189), so that bundled chapters and library chapters of the same
 *                  Bible fall into one sequence whichever is installed
 *  collections     a work that is one text is chapter 1; a collection is numbered 1, 2, 3 … in the order it has
 *  duplicates      a text whose words are exactly those of an earlier text of the same work is left out (once is enough)
 *  apparatus       in a reader taken from a children's library, a paragraph that looks like English (the catalogue's
 *                  English description, notes for adults) is not the book: it is left out and the document's provenance
 *                  says how many paragraphs were; a reader with fewer than 15 words left is withheld (a wordless book)
 *  annotated       a source whose quality check finds English editorial sections mixed into the text (an annotated
 *  editions        school edition: preface, notes, exercises, vocabulary) is withheld until the source is cut down to
 *                  the book — the build is never asked to publish an editor's English as reading in the course language
 *  undivided       a book whose chapters were not found (most of it stands before the first recognised heading, or
 *  books           one "chapter" runs to tens of thousands of words) is withheld until its headings are marked
 *  streams         a work is filed under a stream its catalogue record has
 *
 * Nothing is rewritten: a verse, a sentence, a word is never changed. What is left out is listed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { COURSES, createMemoryStore, ids } from '../src/core';
import type { LanguageCode, Work } from '../src/core';
import { createCourseCatalog } from '../src/course';
import type { CorpusDocument } from '../src/ingest';
import { plainTextToDocuments } from '../src/ingest/plaintext';
import { inspectText, looksLikeEnglishParagraph } from '../src/ingest/quality';
import type { BuildEntry, BuildManifest } from '../src/library/build';
import { bookIndex, runningNumber } from './lib-canon.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--');
const lang = args.find((a) => !a.startsWith('--')) as LanguageCode | undefined;
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
if (!lang) { console.error('usage: npm run library:order -- <lang> [--manifest <file>] [--in <dir>] [--dry]'); process.exit(1); }
const dry = args.includes('--dry');
const manifestFile = opt('manifest') ?? `data/sources/course-library/${lang}.json`;
const inDir = opt('in') ?? 'data/sources';
/** A reader with fewer words of story than this is not offered as a reading text (a wordless book, a counting chart). */
const MIN_WORDS = 15;
/** A single reading unit longer than this was not divided into chapters: nobody reads 25,000 words as one chapter. */
const MAX_CHAPTER_WORDS = 25000;
/** The first time a source file is changed its original is kept beside it, so the step can be undone and compared. */
const keepOriginal = (file: string) => { const copy = `${file}.before-order`; if (!fs.existsSync(copy)) fs.copyFileSync(file, copy); };

type Manifest = BuildManifest & { withheld?: Array<{ slug: string; title: string; reason: string }> };
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Manifest;
const manifestAsRead = JSON.stringify(manifest); // entries are changed in place below: compare with this to know whether the manifest changed
const course = COURSES.find((c) => c.lang === lang)!;
const store = createMemoryStore();
const catalog = createCourseCatalog({ store });
await catalog.install(course.id);
const works = new Map<string, Work>((await store.works.where('courseId', course.id)).map((w) => [w.id, w]));

const changes: string[] = [];
const leftOut: Array<{ work: string; text: string; why: string }> = [];
const withheld: Array<{ slug: string; title: string; reason: string }> = [...(manifest.withheld ?? [])];
const say = (s: string) => { changes.push(s); console.log(`  ${s}`); };

const paragraphsOf = (d: CorpusDocument): string[] => d.sections.flatMap((s) => s.paragraphs.map((p) => ('sentences' in p ? p.sentences.map((x) => x.text).join(' ') : (p as { text: string }).text)));
const wordCount = (s: string) => (s.match(/[\p{L}\p{M}]+/gu) ?? []).length;
/**
 * A paragraph of a children's-library reader that is not the story: the title page's credit lines, the platform's and
 * the licence's standing text, the catalogue's description of the book ("X (English) … This is a Level 1 book …"), or
 * a paragraph that looks like English. The credit itself is kept in the document's source attribution.
 */
const PLATFORM = /Creative Commons|creativecommons\.org|licenciad[ao] bajo|lizenziert unter|Pratham Books|StoryWeaver|Book ?Dash|African Storybook|Global Digital Library|goes digital|All Children Reading|Room to Read/i;
const DESCRIPTION = /\((English|Englisch|Inglés|Ingles|Deutsch|Español|Espanol)\)/;
const CREDIT_LINE = /^\s*(Autor(?:in|innen|en|a|es)?|Author|Illustrator(?:in|innen|en)?|Ilustrador(?:a|es)?|Ver[öo]ffentlicher|[ÜU]bersetz\w*|Traduc\w*|Traductor(?:a|es)?|Creado por|Escrito por|Ilustrado por|Editor\w*)\s*[:：]/im;
const apparatusReason = (t: string): string | undefined => {
  if (looksLikeEnglishParagraph(t, lang)) return 'English paragraph';
  if (DESCRIPTION.test(t)) return 'catalogue description';
  if (PLATFORM.test(t)) return 'platform or licence text';
  if (CREDIT_LINE.test(t) && wordCount(t) <= 40) return 'title-page credits';
  return undefined;
};
const bodySignature = (d: CorpusDocument) => crypto.createHash('sha256').update(paragraphsOf(d).join('\n').normalize('NFC').replace(/\s+/g, ' ').trim()).digest('hex');

const kept: BuildEntry[] = [];
for (const entry of manifest.entries) {
  const file = path.join(inDir, entry.source.file);
  const kind = entry.source.kind ?? 'plain';
  const work = works.get(ids.work(entry.courseId ?? course.id, entry.slug));

  // a stream its catalogue record has
  const primary = entry.stream ?? entry.streams?.[0] ?? 'library';
  if (work?.streams?.length && !work.streams.includes(primary)) {
    say(`${entry.slug}: filed under "${work.streams[0]}" (its catalogue stream), not "${primary}"`);
    entry.stream = work.streams[0];
    entry.streams = [...new Set([work.streams[0], ...work.streams])];
  }

  if (kind !== 'documents') {
    // an annotated edition: English editorial sections mixed into the text
    const text = fs.readFileSync(file, 'utf8');
    const report = inspectText(text, { lang, sourceKind: kind });
    const mismatch = report.flags.find((f) => f.code === 'language-mismatch');
    if (mismatch) {
      const reason = `the source has English editorial sections mixed into the text (${mismatch.count} words: ${mismatch.message.replace(/\s+/g, ' ').slice(0, 160)}) — withheld until the source is cut down to the book`;
      say(`${entry.slug}: WITHHELD — ${reason}`);
      withheld.push({ slug: entry.slug, title: entry.title, reason });
      continue;
    }
    // a book that could not be divided into chapters: converted exactly as the build will convert it, then looked at
    try {
      const stub = { id: ids.work(course.id, entry.slug), courseId: course.id, lang, stageId: ids.stage(course.id, entry.stage ?? 's0'), role: 'subsidiary', order: 0, title: entry.title, author: entry.author, purpose: [], rights: entry.rights, bibliographyVerified: false } as Work;
      const converted = plainTextToDocuments(text, { lang, work: stub, idPrefix: entry.slug, contentType: entry.contentType ?? 'story', chapters: 'auto', sourceKind: kind, ...(entry.convert ?? {}) } as Parameters<typeof plainTextToDocuments>[1]).documents;
      const sizes = converted.map((d) => ({ index: d.work?.chapter?.index, title: d.title, words: wordCount(paragraphsOf(d).join(' ')) }));
      const total = sizes.reduce((n, s) => n + s.words, 0);
      const front = sizes.find((s) => s.index === 0);
      const huge = sizes.filter((s) => s.words > MAX_CHAPTER_WORDS);
      const why = front && sizes.length > 1 && front.words > total / 2
        ? `its chapters were not found: ${front.words} of its ${total} words stand before the first heading that was recognised, and what follows is ${sizes.length - 1} piece(s) of ${sizes.filter((s) => s !== front).map((s) => s.words).slice(0, 4).join(', ')} words`
        : huge.length
          ? `it could not be divided into chapters of a readable length: ${huge.map((s) => `"${s.title.slice(0, 40)}" has ${s.words} words`).slice(0, 2).join('; ')}`
          : undefined;
      if (why) {
        const reason = `${why} — withheld until the source's headings are marked (the converter takes the line numbers of the headings)`;
        say(`${entry.slug}: WITHHELD — ${reason}`);
        withheld.push({ slug: entry.slug, title: entry.title, reason });
        continue;
      }
    } catch { /* a text the converter refuses is refused by the build, with its reason */ }
    kept.push(entry);
    continue;
  }

  // several works read one documents file (each names its books with source.only; the Hindi GDL shelves): the tool that prepares
  // the file numbers and orders them, and this step must not renumber or rewrite a file that other entries share
  if (entry.source.only) { kept.push(entry); continue; }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as CorpusDocument | CorpusDocument[];
  let docs = Array.isArray(raw) ? raw : [raw];
  const before = JSON.stringify(docs);
  const scripture = entry.contentType === 'scripture' || docs.every((d) => !!d.scripture?.book);

  if (scripture) {
    const place = (d: CorpusDocument) => runningNumber(d.scripture!.book, d.scripture!.chapter ?? 0);
    const unknown = docs.filter((d) => place(d) === undefined);
    if (unknown.length) { console.error(`${entry.slug}: ${unknown.length} chapter(s) outside the canon (${unknown.slice(0, 3).map((d) => `${d.scripture?.book} ${d.scripture?.chapter}`).join(', ')}): not ordered`); process.exit(1); }
    const wasOrder = docs.map((d) => d.id).join(',');
    docs = [...docs].sort((a, b) => place(a)! - place(b)!);
    let renumbered = 0;
    for (const d of docs) {
      const n = place(d)!;
      if (d.work?.chapter?.index !== n) renumbered++;
      d.work = { ...(d.work ?? { slug: entry.slug }), chapter: { ...(d.work?.chapter ?? {}), index: n, title: d.work?.chapter?.title ?? d.title } };
    }
    if (renumbered || wasOrder !== docs.map((d) => d.id).join(',')) {
      const books = [...new Set(docs.map((d) => d.scripture!.book))];
      say(`${entry.slug}: ${docs.length} chapters put in the order of the canon (${books.length} books, ${books[0]} … ${books[books.length - 1]}); ${renumbered} renumbered by their place in it`);
    }
    for (const b of new Set(docs.map((d) => d.scripture!.book))) if (!bookIndex.has(b)) throw new Error(`unknown book ${b}`);
  } else {
    // apparatus in a children's-library reader
    if (entry.source.file.startsWith('reading-bridge/') || /gdl/i.test(entry.source.file)) {
      for (const d of docs) {
        let removed = 0;
        for (const s of d.sections) {
          const keep = s.paragraphs.filter((p) => {
            const t = 'sentences' in p ? p.sentences.map((x) => x.text).join(' ') : (p as { text: string }).text;
            const why = apparatusReason(t);
            if (!why) return true;
            removed++;
            leftOut.push({ work: entry.slug, text: d.id, why: `${why} left out: "${t.replace(/\s+/g, ' ').slice(0, 90)}…"` });
            return false;
          });
          s.paragraphs = keep as typeof s.paragraphs;
        }
        d.sections = d.sections.filter((s) => s.paragraphs.length > 0);
        if (removed) {
          const note = ` ${removed} paragraph${removed === 1 ? '' : 's'} of the source that ${removed === 1 ? 'is' : 'are'} not the story (title-page credits, the catalogue's description, platform or licence text, notes for adults) ${removed === 1 ? 'is' : 'are'} not included as reading text; the credit is kept in the attribution and no word of the story is changed.`;
          if (d.source && !`${d.source.provenance ?? ''}`.includes('not included as reading text')) d.source = { ...d.source, provenance: `${d.source.provenance ?? ''}${note}`.trim() };
          say(`${entry.slug}: ${d.id}: ${removed} paragraph(s) that are not the story left out`);
        }
      }
      const thin = docs.filter((d) => wordCount(paragraphsOf(d).join(' ')) < MIN_WORDS);
      if (thin.length === docs.length) {
        const reason = `fewer than ${MIN_WORDS} words of the course language are left (${thin.map((d) => wordCount(paragraphsOf(d).join(' '))).join(', ')}): a wordless or nearly wordless book is not a reading text`;
        say(`${entry.slug}: WITHHELD — ${reason}`);
        withheld.push({ slug: entry.slug, title: entry.title, reason });
        continue;
      }
      docs = docs.filter((d) => !thin.includes(d));
      for (const d of thin) leftOut.push({ work: entry.slug, text: d.id, why: `fewer than ${MIN_WORDS} words: left out` });
    }
    // duplicates inside one work
    const seen = new Map<string, string>();
    const unique: CorpusDocument[] = [];
    for (const d of docs) {
      const sig = bodySignature(d);
      const first = seen.get(sig);
      if (first) { leftOut.push({ work: entry.slug, text: d.id, why: `the same words as ${first}: left out` }); continue; }
      seen.set(sig, d.id);
      unique.push(d);
    }
    if (unique.length !== docs.length) say(`${entry.slug}: ${docs.length - unique.length} text(s) with the same words as an earlier one left out (${unique.length} remain)`);
    docs = unique;
    // numbering: one text is chapter 1; a collection is 1, 2, 3 … in its own order
    const numbers = docs.map((d) => d.work?.chapter?.index);
    const want = docs.map((_, i) => i + 1);
    if (!numbers.every((n, i) => n === want[i])) {
      docs.forEach((d, i) => { d.work = { ...(d.work ?? { slug: entry.slug }), chapter: { ...(d.work?.chapter ?? {}), index: i + 1, title: d.work?.chapter?.title ?? d.title } }; });
      say(`${entry.slug}: ${docs.length === 1 ? 'the one text is chapter 1' : `${docs.length} texts numbered 1 … ${docs.length}`} (was ${numbers.slice(0, 4).map(String).join(', ')}${numbers.length > 4 ? ', …' : ''})`);
    }
  }
  if (JSON.stringify(docs) !== before && !dry) {
    const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    const shaBefore = sha(file);
    keepOriginal(file);
    fs.writeFileSync(file, JSON.stringify(Array.isArray(raw) || docs.length !== 1 ? docs : docs[0]));
    // The step renumbers, orders and leaves texts out; it never changes a word of a text it keeps. A manifest review is bound to the
    // sha256 of the FILE (build.ts applies it only when the file is the one it covered): carry it to the file as it is now, or the
    // texts would silently become unreviewed (and unpublished) just because they were numbered.
    if (entry.review?.coversSourceSha256 === shaBefore) {
      entry.review = { ...entry.review, coversSourceSha256: sha(file) };
      say(`${entry.slug}: the review of the manifest follows the renumbered file (sha256 ${shaBefore.slice(0, 12)}… → ${entry.review.coversSourceSha256.slice(0, 12)}…)`);
    }
  }
  kept.push(entry);
}

const out: Manifest = { ...manifest, entries: kept, ...(withheld.length ? { withheld } : {}) };
if (!dry && JSON.stringify(out) !== manifestAsRead) { keepOriginal(manifestFile); fs.writeFileSync(manifestFile, `${JSON.stringify(out, null, 2)}\n`); }
const reportFile = manifestFile.replace(/\.json$/, '.order-report.json');
if (!dry && (changes.length || leftOut.length)) fs.writeFileSync(reportFile, `${JSON.stringify({ lang, at: new Date().toISOString().slice(0, 10), changes, leftOut, withheld }, null, 1)}\n`);
console.log(`library:order ${lang} — ${kept.length} work(s) to build, ${withheld.length} withheld, ${leftOut.length} text(s) or paragraph(s) left out, ${changes.length} change(s)${dry ? ' (dry run: nothing written)' : changes.length ? `; record in ${reportFile}` : ''}`);
