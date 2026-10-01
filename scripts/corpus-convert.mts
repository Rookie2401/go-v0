/// <reference types="node" />
/**
 * npm run corpus:convert -- <book.txt|book.epub> --lang th|es|... (--work <slug> | --title "...") [--chapters auto|none|<regex>]
 *                           [--copy-note "..."] [--out data/private/<lang>/<slug>]
 *
 * Turns the exact text of a book (a UTF-8 .txt made from a copy you are entitled to use) into one version 2 import
 * document per chapter, each a personal copy (rights "personal-copy", authorship "published"), validates every one with
 * the real validator and writes them as JSON files. The text is never altered: one paragraph per non-empty line, only
 * plain indentation trimmed (and reported). The work is looked up in the course ladder (src/course); `--title`
 * overrides its title, and without `--work` a free-standing text needs `--title`.
 *
 * Personal copies are never bundled: the command refuses to write inside data/corpus, and the default folder
 * data/private/ is git-ignored. Import the files with Settings -> Content -> Import texts.
 *
 * Exit codes: 0 converted (files written); 1 usage error, unreadable input, unknown work, a document that does not
 * validate (nothing is written then), or an output folder inside data/corpus.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EpubError, epubToDocuments, plainTextToDocuments, type PlainTextOptions, type PlainTextResult } from '../src/ingest';
import { THAI_WORKS } from '../src/course/thai';
import { SPANISH_WORKS } from '../src/course/spanish';
import type { LanguageCode, Work } from '../src/core';
import { LANGUAGES } from '../src/core';
import { validateAndPrint } from './corpus-cli.mts';

const USAGE = 'usage: npm run corpus:convert -- <book.txt|book.epub> --lang th|es|... (--work <slug> | --title "...") [--author "..."] [--chapters auto|none|<regex>] [--headings 1,40,...] ' +
  '[--paragraphs lines|blank-line] [--unwrap] [--strip-boilerplate] [--source-kind plain|gutenberg|wikisource|epub|ocr] [--variety es-HN] [--streams a,b] [--domains a,b] [--copy-note "..."] [--out data/private/<lang>/<slug>]';
const fail = (msg: string): never => { console.error(msg); process.exit(1); };

// ── arguments ──
const argv = process.argv.slice(2).filter((a) => a !== '--');
const FLAGS = ['lang', 'work', 'title', 'author', 'chapters', 'headings', 'paragraphs', 'source-kind', 'variety', 'streams', 'domains', 'copy-note', 'out'];
const SWITCHES = ['unwrap', 'strip-boilerplate'];
const flags = new Map<string, string>();
const switches = new Set<string>();
const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { positional.push(a); continue; }
  const eq = a.indexOf('=');
  const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
  if (SWITCHES.includes(name) && eq < 0) { switches.add(name); continue; }
  if (!FLAGS.includes(name)) fail(`unknown option --${name}\n${USAGE}`);
  if (eq > 0) { flags.set(name, a.slice(eq + 1)); continue; }
  const value = argv[i + 1];
  if (value === undefined) fail(`--${name} needs a value\n${USAGE}`);
  flags.set(name, value as string);
  i++;
}
if (positional.length !== 1) fail(`expected exactly one text file\n${USAGE}`);
const input = positional[0];

const lang = flags.get('lang');
if (!lang || !(LANGUAGES as readonly string[]).includes(lang)) fail(`--lang is required and must be one of ${LANGUAGES.join(', ')}\n${USAGE}`);
const language = lang as LanguageCode;

// ── the work ──
const slugOf = (w: Work) => w.id.slice(`work:${w.courseId}:`.length);
const ladder: Work[] = language === 'th' ? THAI_WORKS : language === 'es' ? SPANISH_WORKS : [];
const slug = flags.get('work');
let work: Work | undefined;
if (slug !== undefined) {
  work = ladder.find((w) => slugOf(w) === slug);
  if (!work) {
    fail(ladder.length
      ? `unknown work "${slug}" for ${language}. Works in the ladder: ${ladder.map(slugOf).join(', ')}\nFor a text that is not in the ladder, leave out --work and give --title.`
      : `there is no course ladder for "${language}", so --work cannot be looked up. Give --title instead.`);
  }
}
const title = flags.get('title');
if (!work && !title && !/.epub$/i.test(input)) fail(`give --work <slug> (a work of the ladder) or --title "..."\n${USAGE}`);
if (work && title) work = { ...work, title };

// ── options ──
const list = (v: string | undefined) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined);
const paragraphs = flags.get('paragraphs');
if (paragraphs !== undefined && paragraphs !== 'lines' && paragraphs !== 'blank-line') fail(`--paragraphs must be "lines" or "blank-line"\n${USAGE}`);
const sourceKind = flags.get('source-kind');
if (sourceKind !== undefined && !['plain', 'gutenberg', 'wikisource', 'epub', 'ocr'].includes(sourceKind)) fail(`--source-kind must be plain, gutenberg, wikisource, epub or ocr\n${USAGE}`);
const headingList = flags.get('headings') === undefined ? undefined : flags.get('headings')!.split(',').map((x) => Number(x.trim()));
if (headingList?.some((n) => !Number.isInteger(n) || n < 1)) fail(`--headings is a comma-separated list of line numbers (1 or more)\n${USAGE}`);
const options: PlainTextOptions = {
  lang: language, work, title, author: flags.get('author'), chapters: flags.get('chapters') ?? 'auto', headings: headingList, copyNote: flags.get('copy-note'),
  ...(paragraphs ? { paragraphs: paragraphs as 'lines' | 'blank-line' } : {}), unwrap: switches.has('unwrap'), stripBoilerplate: switches.has('strip-boilerplate'),
  ...(sourceKind ? { sourceKind: sourceKind as PlainTextOptions['sourceKind'] } : {}), variety: flags.get('variety'), streams: list(flags.get('streams')), domains: list(flags.get('domains')),
};

// ── read and convert (an EPUB is read where it is; a protected one is refused, never worked around) ──
let result: PlainTextResult | undefined;
try {
  if (/\.epub$/i.test(input)) {
    let bytes: Uint8Array = new Uint8Array();
    try { bytes = new Uint8Array(fs.readFileSync(input)); } catch (e) { fail(`cannot read ${input}: ${e instanceof Error ? e.message : String(e)}`); }
    result = await epubToDocuments(bytes, options);
  } else {
    let text = '';
    try { text = fs.readFileSync(input, 'utf8'); } catch (e) { fail(`cannot read ${input}: ${e instanceof Error ? e.message : String(e)}`); }
    result = plainTextToDocuments(text, options);
  }
} catch (e) {
  fail(e instanceof EpubError ? `corpus:convert - ${e.message} [${e.code}]` : `corpus:convert - ${e instanceof Error ? e.message : String(e)}`);
}
const { documents, notes, quality, removed, headings } = result!;

// ── where to write: never inside the bundled corpus ──
const root = process.cwd();
const out = path.resolve(root, flags.get('out') ?? path.join('data', 'private', language, work ? slugOf(work) : documents[0]?.source.id.split(':').pop() ?? 'book'));
const bundled = path.resolve(root, 'data', 'corpus');
const inside = (child: string, parent: string) => { const r = path.relative(parent, child); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
if (inside(out, bundled)) fail(`refusing to write inside ${path.relative(root, bundled)}: personal copies are never bundled. Use a folder such as data/private/${language}/<name>.`);

console.log(`corpus:convert - ${input}`);
for (const n of notes) console.log(`  ${n}`);
console.log(`  source quality: ${quality.verdict}${quality.flags.length ? ` (${quality.flags.map((f) => `${f.code} x${f.count}, ${f.severity}`).join('; ')})` : ''}`);
for (const f of quality.flags) console.log(`    ${f.code}: ${f.message}${f.sample ? ` e.g. "${f.sample}"` : ''}`);
if (headings.length) console.log(`  headings (line: text) - pass a corrected list with --headings: ${headings.map((h) => `${h.line}: ${h.text}`).slice(0, 40).join(' | ')}${headings.length > 40 ? ' | ...' : ''}`);
if (!documents.length) fail('nothing to write: the text has no content.');

// ── validate with the real validator; write only when every document is valid ──
const files = documents.map((d) => path.join(out, `${d.id}.json`));
const run = validateAndPrint(files.map((file, i) => ({ file: path.relative(root, file), doc: documents[i] as unknown })));
if (run.errors) {
  console.error(`corpus:convert - ${run.errors} error(s); nothing written. Check --lang and the text.`);
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
files.forEach((file, i) => fs.writeFileSync(file, `${JSON.stringify(documents[i], null, 2)}\n`, 'utf8'));
if (removed.length) {
  // what --strip-boilerplate removed stays retrievable (a .txt, so corpus:validate does not mistake it for a document)
  fs.writeFileSync(path.join(out, 'removed-boilerplate.txt'), removed.map((r) => `# ${r.label}, lines ${r.startLine}-${r.endLine}\n${r.text}\n`).join('\n'), 'utf8');
  console.log(`corpus:convert - the ${removed.length} removed block(s) are kept in ${path.relative(root, path.join(out, 'removed-boilerplate.txt'))}`);
}
console.log(`corpus:convert - wrote ${files.length} document(s) to ${path.relative(root, out)} (${run.warnings} warning(s)). Import them in Settings -> Content -> Import texts; they stay on this device.`);
