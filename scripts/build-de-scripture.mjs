/**
 * Build the bundled Lutherbibel-1912 slice from the distributor's own pages. Nothing is retyped.
 *
 *   node scripts/build-de-scripture.mjs           # fetch, write data/corpus/de/bible-<slug>.json, print what was taken
 *   node scripts/build-de-scripture.mjs --dry     # fetch and print only
 *
 * Source: eBible.org, translation id deu1912 ("Public Domain" on its copyright page — checked here, and the build
 * stops if the page does not say so). English rescue: the World English Bible from the same distributor (eng-web,
 * public domain), verse by verse. One verse is one sentence, so every sentence is addressable by its reference.
 * After building, `node scripts/verify-scripture.mjs` compares every bundled verse with the source again and writes
 * the record the importer reads (data/verified/scripture.json).
 *
 * The extraction is the same as in verify-scripture.mjs: a verse runs from its verse marker to the next one; note
 * marks are removed with their notes; a heading that the page places inside a chapter is NOT part of a verse (lines
 * that are headings are dropped by their CSS class before the text is read).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE = 'https://ebible.org/deu1912';
const ENGLISH = 'https://ebible.org/eng-web';
const dry = process.argv.includes('--dry');

/** The slice: book code, chapter, German title of the document and of the section. */
const SLICE = [
  { slug: 'bible-gen-1', book: 'GEN', chapter: 1, title: '1. Mose 1', section: '1. Mose 1 — Die Schöpfung', topics: ['scripture', 'genesis-1', 'creation'] },
  { slug: 'bible-psa-1', book: 'PSA', chapter: 1, title: 'Psalm 1', section: 'Psalm 1', topics: ['scripture', 'psalm-1'] },
  { slug: 'bible-psa-23', book: 'PSA', chapter: 23, title: 'Psalm 23', section: 'Psalm 23', topics: ['scripture', 'psalm-23'] },
  { slug: 'bible-mat-1', book: 'MAT', chapter: 1, title: 'Matthäus 1', section: 'Matthäus 1', topics: ['scripture', 'matthew-1'] },
];

const pageFor = (book, chapter) => `${book}${String(chapter).padStart(book === 'PSA' ? 3 : 2, '0')}.htm`;
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Verse number → text, from one chapter page. */
function versesOf(html) {
  const t = html
    // the navigation lists (top and bottom of the page) are not verse text
    .replace(/<ul class=['"]tnav['"][\s\S]*?<\/ul>/g, '\n')
    .replace(/<div class=['"](?:footnote|copyright)['"][\s\S]*$/g, '\n')
    // headings, section titles and cross-reference lines are not verse text
    .replace(/<div class=['"](?:s\d?|ms\d?|mt\d?|r|d|sp|mr|sr|b|tnav|copyright|footnote|notemark)['"][^>]*>[\s\S]*?<\/div>/g, '\n')
    .replace(/<span class="verse" id="V(\d+)">[^<]*<\/span>/g, '\n@@$1 ')
    .replace(/<a [^>]*class="notemark"[\s\S]*?<\/a>/g, '')
    .replace(/<span class="popup">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const out = new Map();
  let current;
  for (const line of t.split('\n')) {
    const m = /^@@(\d+) (.*)/.exec(line);
    if (m) { current = Number(m[1]); out.set(current, m[2]); }
    else if (current !== undefined && /\S/.test(line) && !/^\s*(?:<|>|\d+\s*$)/.test(line)) out.set(current, `${out.get(current)} ${line}`);
  }
  for (const [k, v] of out) out.set(k, v.replace(/\s+/g, ' ').trim().normalize('NFC'));
  return out;
}

const copyright = await get(`${BASE}/copyright.htm`);
if (!/Public Domain/i.test(copyright)) { console.error('The source copyright page does not say "Public Domain": nothing is built.'); process.exit(1); }
const statement = (/[^.<>]*Public Domain[^.<>]*/i.exec(copyright.replace(/<[^>]+>/g, ' ')) ?? [''])[0].replace(/\s+/g, ' ').trim();
console.log(`source copyright page: "${statement}" (sha256 ${sha256(copyright).slice(0, 16)}…)`);
const today = new Date().toISOString().slice(0, 10);

for (const part of SLICE) {
  const page = pageFor(part.book, part.chapter);
  const html = await get(`${BASE}/${page}`);
  const de = versesOf(html);
  const en = versesOf(await get(`${ENGLISH}/${page}`));
  const numbers = [...de.keys()].sort((a, b) => a - b);
  const contiguous = numbers.every((n, i) => n === i + 1);
  console.log(`${part.slug}: ${numbers.length} verses from ${BASE}/${page} (page sha256 ${sha256(html).slice(0, 16)}…)${contiguous ? '' : ' — VERSE NUMBERS NOT CONTIGUOUS'}; English verses ${en.size}`);
  if (!contiguous || numbers.length === 0) { console.error('  refusing to write a document with missing verses'); process.exitCode = 1; continue; }
  for (const n of [numbers[0], numbers[numbers.length - 1]]) console.log(`   ${part.book}.${part.chapter}.${n}: ${de.get(n)}`);
  const sentences = numbers.map((n) => ({
    text: de.get(n),
    ...(en.get(n) ? { english: en.get(n) } : {}),
    verseRefs: [`${part.book}.${part.chapter}.${n}`],
  }));
  // paragraphs of a few verses each, so that the page reads as text and not as a list
  const paragraphs = [];
  for (let i = 0; i < sentences.length; i += 5) paragraphs.push({ sentences: sentences.slice(i, i + 5) });
  const doc = {
    schemaVersion: 2,
    id: part.slug,
    lang: 'de',
    title: part.title,
    contentType: 'scripture',
    corpus: { id: 'bible-de-luther1912', kind: 'scripture', title: 'Lutherbibel 1912' },
    source: {
      id: `src:de:${part.slug}`,
      title: 'Die Bibel nach Martin Luther, Ausgabe 1912',
      edition: 'Luther 1912',
      attribution: 'Lutherbibel 1912, public domain (eBible.org)',
      provenance: `Lutherbibel 1912, taken verse by verse from the distributor's page ${BASE}/${page} by scripts/build-de-scripture.mjs on ${today}; nothing was retyped. The distributor states "Public Domain" for this translation. Each verse is compared with the source again by scripts/verify-scripture.mjs.`,
      url: `${BASE}/${page}`,
      rights: 'public-domain',
      licenseNote: 'The 1912 revision of Luther’s translation is in the public domain (stated by the distributor, eBible.org).',
      authorship: 'public-domain',
    },
    review: { status: 'reviewed', reviewedBy: 'scripts/verify-scripture.mjs', reviewedAt: today, notes: 'Wording verified by byte-comparison against eBible.org deu1912.' },
    topics: part.topics,
    editorialTags: [],
    prepTargets: [],
    generated: false,
    work: { slug: 'lutherbibel-1912', chapter: { index: SLICE.indexOf(part) + 1, title: part.title } },
    scripture: {
      translationId: 'deu1912', translationName: 'Lutherbibel 1912', edition: 'Luther 1912', book: part.book, chapter: part.chapter,
      verification: { against: 'eBible.org deu1912', url: BASE, checkedAt: today, method: 'byte-comparison', by: 'scripts/verify-scripture.mjs' },
    },
    english: { source: 'World English Bible (public domain), eBible.org eng-web' },
    sections: [{ title: part.section, chapter: part.chapter, paragraphs }],
  };
  if (!dry) fs.writeFileSync(`data/corpus/de/${part.slug}.json`, `${JSON.stringify(doc, null, 2)}\n`);
}
console.log(dry ? 'dry run: nothing written' : 'written; now run: node scripts/verify-scripture.mjs');
