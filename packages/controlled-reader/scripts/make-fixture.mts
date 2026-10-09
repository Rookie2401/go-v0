/**
 * Builds the two EPUB fixtures of the controlled reader prototype:
 *   test/fixtures/epub/udha-sample.epub  — 3 chapters (~20 sentences each) of the owner-authored Albanian course texts
 *                                           data/corpus/sq/udha-1-01 … udha-1-06 (machine-drafted, unreviewed; the
 *                                           script REFUSES any document that is not rights "owner-authored" /
 *                                           authorship "generated" — never the Bible sample)
 *   test/fixtures/epub/protected-sample.epub — SYNTHETIC: the udha book plus a META-INF/encryption.xml naming a content
 *                                           document (nothing is really encrypted); the refusal check's fixture
 *   test/fixtures/epub/rtl-sample.epub   — one short right-to-left Hebrew chapter (5 lines, written for this fixture)
 * Inline <em> / <span> are added at deterministic places so sentences cross element boundaries (the sentence
 * reconstruction test needs that). Run: npm run reader:fixture. Deterministic: same inputs, same bytes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEpub, xmlEscape, type BuildChapter } from './epub-builder';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORPUS = path.join(ROOT, 'data/corpus/sq');
const OUT = path.join(ROOT, 'test/fixtures/epub');

interface Sentence { text: string }
interface CorpusDoc {
  id: string; title: string; lang: string; generated?: boolean;
  source: { rights?: string; authorship?: string };
  sections: { title?: string; paragraphs: { sentences: Sentence[] }[] }[];
}

function load(id: string): CorpusDoc {
  const doc = JSON.parse(fs.readFileSync(path.join(CORPUS, `${id}.json`), 'utf8')) as CorpusDoc;
  if (!/^(udha|misioni)-/.test(doc.id)) throw new Error(`${id}: only udha-* / misioni-* documents may be used`);
  if (doc.source.rights !== 'owner-authored' || doc.source.authorship !== 'generated') {
    throw new Error(`${id}: rights "${doc.source.rights}" / authorship "${doc.source.authorship}" — only owner-authored, generated documents may enter a fixture`);
  }
  return doc;
}

/** Markup one sentence so its words straddle inline elements in a repeating pattern. */
function markup(text: string, index: number): string {
  const w = text.split(' ').map(xmlEscape);
  const k = index % 4;
  if (k === 0 && w.length >= 2) w[0] = `<em>${w[0]}</em>`;
  else if (k === 1 && w.length >= 3) w[1] = `<span class="w">${w[1]}</span>`;
  else if (k === 2 && w.length >= 4) { w[1] = `<em>${w[1]}`; w[2] = `<span class="w">${w[2]}</span></em>`; }
  return w.join(' ');
}

/** Ground truth for the tests: the corpus's own sentence entries per paragraph, per chapter (no markup). */
const truth: string[][][] = [];

function chapterFrom(ids: string[], chapterId: string): BuildChapter & { sentences: number } {
  let count = 0;
  const paragraphsOut: string[][] = [];
  truth.push(paragraphsOut);
  const parts: string[] = [];
  const docs = ids.map(load);
  docs.forEach((doc, di) => {
    parts.push(di === 0 ? `<h1>${xmlEscape(doc.title)}</h1>` : `<h2>${xmlEscape(doc.title)}</h2>`);
    for (const section of doc.sections) {
      for (const p of section.paragraphs) {
        parts.push(`<p>${p.sentences.map((s) => markup(s.text, count++)).join(' ')}</p>`);
        paragraphsOut.push(p.sentences.map((s) => s.text));
      }
    }
  });
  return { id: chapterId, title: docs[0].title, body: parts.join('\n'), sentences: count };
}

const ENCRYPTION_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">',
  '<enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><enc:CipherData><enc:CipherReference URI="OEBPS/ch1.xhtml"/></enc:CipherData></enc:EncryptedData>',
  '</encryption>',
  '',
].join('\n');

fs.mkdirSync(OUT, { recursive: true });

const chapters = [
  chapterFrom(['udha-1-01', 'udha-1-02'], 'ch1'),
  chapterFrom(['udha-1-03', 'udha-1-04'], 'ch2'),
  chapterFrom(['udha-1-05', 'udha-1-06'], 'ch3'),
];
const udha = buildEpub({
  identifier: 'urn:go:controlled-reader:udha-sample:1',
  title: 'Udha 1 — mostër (Go owner-authored sample)',
  creator: 'Go course authors (drafted by an AI model)',
  language: 'sq',
  modified: '2026-10-08T00:00:00Z',
  chapters,
});
fs.writeFileSync(path.join(OUT, 'udha-sample.epub'), udha);
fs.writeFileSync(path.join(OUT, 'udha-sample.sentences.json'), `${JSON.stringify({ note: 'ground truth for tests: the course corpus sentence entries (owner-authored, machine-drafted) per paragraph per chapter', chapters: truth }, null, 1)}
`);

// A SYNTHETIC protected file for the refusal check: the same book with a META-INF/encryption.xml that lists a content
// document. Nothing in it is really encrypted; it exists so that the reader's DRM refusal can be exercised by hand and
// in tests. (Real protected books are never added to the repo.)
const protectedBook = buildEpub({
  identifier: 'urn:go:controlled-reader:protected-sample:1',
  title: 'Protected sample (synthetic refusal fixture)',
  creator: 'Go course authors (drafted by an AI model)',
  language: 'sq',
  modified: '2026-10-08T00:00:00Z',
  chapters,
  extra: [{ name: 'META-INF/encryption.xml', data: ENCRYPTION_XML }],
});
fs.writeFileSync(path.join(OUT, 'protected-sample.epub'), protectedBook);

// Right-to-left fixture: five short unpointed Hebrew lines written for this fixture; <em> crosses one sentence.
const lines = [
  'שלום, שמי דוד.',
  'אני גר <em>בירושלים</em>.',
  'זה הבית שלי.',
  'הבית <span class="w">קטן</span> ויפה.',
  'אני אוהב את הבית.',
];
const rtl = buildEpub({
  identifier: 'urn:go:controlled-reader:rtl-sample:1',
  title: 'דוגמה קצרה (Go owner-written RTL sample)',
  creator: 'Go course authors (drafted by an AI model)',
  language: 'he',
  direction: 'rtl',
  modified: '2026-10-08T00:00:00Z',
  chapters: [{ id: 'ch1', title: 'דוגמה', body: `<h1>דוגמה</h1>\n${lines.map((l) => `<p>${l}</p>`).join('\n')}` }],
});
fs.writeFileSync(path.join(OUT, 'rtl-sample.epub'), rtl);

console.log(`udha-sample.epub  ${udha.length} bytes; chapters: ${chapters.map((c) => `${c.title} (${c.sentences} sentences)`).join(', ')}`);
console.log(`protected-sample.epub ${protectedBook.length} bytes (synthetic: encryption.xml lists OEBPS/ch1.xhtml)`);
console.log(`rtl-sample.epub   ${rtl.length} bytes; ${lines.length} lines`);
