/**
 * Build the bundled slice of the Hindi Bible from the distributor's own pages. Nothing is retyped.
 *
 *   node scripts/build-hi-scripture.mjs           # fetch, write data/corpus/hi/bible-<slug>.json, print what was taken
 *   node scripts/build-hi-scripture.mjs --dry     # fetch and print only
 *
 * Translation: इंडियन रिवाइज्ड वर्जन (IRV) हिंदी - 2019 (Indian Revised Version, Hindi), eBible.org id hin2017,
 * copyright © 2017, 2018, 2019 Bridge Connectivity Solutions, made available under the Creative Commons Attribution
 * Share-Alike licence 4.0. The licence is read from the distributor's copyright page HERE, every time, and the build
 * stops if the page no longer says so. It is a licence, not the public domain: the text may be shared and adapted
 * provided the copyright and source are named, changes are indicated, and the text is passed on under the same licence.
 *
 * What is taken: the verse text exactly as the page gives it. What is not taken: the translators' footnotes (the
 * † marks and their notes), section headings and cross-references (also those set in parentheses inside a verse) — a selection, stated in every document's
 * provenance; no word of a verse is changed. One verse is one sentence, so every sentence is addressable by its
 * reference. English rescue: the World English Bible (public domain) from the same distributor, verse by verse; it is
 * a separate text and not a translation of the Hindi.
 *
 * After building, `node scripts/verify-scripture.mjs` compares every bundled verse with the source again and writes
 * the record the importer reads (data/verified/scripture.json).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE = 'https://ebible.org/hin2017';
const ENGLISH = 'https://ebible.org/eng-web';
const LICENCE = /Creative Commons Attribution Share-Alike license 4\.0/i;
const HOLDER = /copyright © 2017, 2018, 2019 Bridge Connectivity Solutions/i;
const NAME = 'इंडियन रिवाइज्ड वर्जन (IRV) हिंदी - 2019';
const dry = process.argv.includes('--dry');

/** The slice: book code, chapter, Hindi title of the document and of the section. */
const SLICE = [
  { slug: 'bible-gen-1', book: 'GEN', chapter: 1, title: 'उत्पत्ति 1', section: 'उत्पत्ति 1', topics: ['scripture', 'genesis-1', 'creation'] },
  { slug: 'bible-psa-1', book: 'PSA', chapter: 1, title: 'भजन संहिता 1', section: 'भजन संहिता 1', topics: ['scripture', 'psalm-1'] },
  { slug: 'bible-psa-23', book: 'PSA', chapter: 23, title: 'भजन संहिता 23', section: 'भजन संहिता 23', topics: ['scripture', 'psalm-23'] },
  { slug: 'bible-mrk-1', book: 'MRK', chapter: 1, title: 'मरकुस 1', section: 'मरकुस 1', topics: ['scripture', 'mark-1', 'gospel'] },
];

const pageFor = (book, chapter) => `${book}${String(chapter).padStart(book === 'PSA' ? 3 : 2, '0')}.htm`;
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Verse number → text, from one chapter page (the same extraction as scripts/verify-scripture.mjs). */
function versesOf(html) {
  const t = html
    .replace(/<ul class=['"]tnav['"][\s\S]*?<\/ul>/g, '\n')
    .replace(/<div class=['"](?:footnote|copyright)['"][\s\S]*$/g, '\n')
    .replace(/<div class=['"](?:s\d?|ms\d?|mt\d?|r|d|sp|mr|sr|b|tnav|copyright|footnote|notemark)['"][^>]*>[\s\S]*?<\/div>/g, '\n')
    .replace(/<span class="verse" id="V(\d+)">[^<]*<\/span>/g, '\n@@$1 ')
    .replace(/<a [^>]*class="notemark"[\s\S]*?<\/a>/g, '')
    .replace(/<span class="popup">[\s\S]*?<\/span>/g, '')
    // the cross-references the translation sets inside a verse in parentheses are apparatus, not verse text (as in verify-scripture.mjs)
    .replace(/<span class=['"]bdit['"]>\s*\([^<()]*\d+\s*[:.]\s*\d+[^<()]*\)\s*<\/span>/g, '')
    // inline tags are removed without a space, exactly as verify-scripture.mjs does: a footnote mark before a comma
    // must not leave a gap ("अच्छा है;" not "अच्छा है ;")
    .replace(/<[^>]+>/g, '')
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
const plain = copyright.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
if (!LICENCE.test(plain) || !HOLDER.test(plain)) {
  console.error('The source copyright page does not state the expected licence and rights holder: nothing is built.');
  process.exit(1);
}
console.log(`source copyright page states: "${HOLDER.exec(plain)[0]}" and "${LICENCE.exec(plain)[0]}" (sha256 ${sha256(copyright).slice(0, 16)}…)`);
const today = new Date().toISOString().slice(0, 10);

for (const part of SLICE) {
  const page = pageFor(part.book, part.chapter);
  const html = await get(`${BASE}/${page}`);
  const hi = versesOf(html);
  const en = versesOf(await get(`${ENGLISH}/${page}`));
  const numbers = [...hi.keys()].sort((a, b) => a - b);
  const contiguous = numbers.every((n, i) => n === i + 1);
  console.log(`${part.slug}: ${numbers.length} verses from ${BASE}/${page} (page sha256 ${sha256(html).slice(0, 16)}…)${contiguous ? '' : ' — VERSE NUMBERS NOT CONTIGUOUS'}; English verses ${en.size}`);
  if (!contiguous || numbers.length === 0) { console.error('  refusing to write a document with missing verses'); process.exitCode = 1; continue; }
  for (const n of [numbers[0], numbers[numbers.length - 1]]) console.log(`   ${part.book}.${part.chapter}.${n}: ${hi.get(n)}`);
  const sentences = numbers.map((n) => ({
    text: hi.get(n),
    ...(en.get(n) ? { english: en.get(n) } : {}),
    verseRefs: [`${part.book}.${part.chapter}.${n}`],
  }));
  // paragraphs of a few verses each, so that the page reads as text and not as a list
  const paragraphs = [];
  for (let i = 0; i < sentences.length; i += 5) paragraphs.push({ sentences: sentences.slice(i, i + 5) });
  const doc = {
    schemaVersion: 2,
    id: part.slug,
    lang: 'hi',
    title: part.title,
    contentType: 'scripture',
    corpus: { id: 'bible-hi-irv2019', kind: 'scripture', title: NAME },
    source: {
      id: `src:hi:${part.slug}`,
      title: NAME,
      edition: 'IRV Hindi 2019',
      publisher: 'Bridge Connectivity Solutions Pvt. Ltd.',
      attribution: `${NAME} — copyright © 2017, 2018, 2019 Bridge Connectivity Solutions; Creative Commons Attribution Share-Alike 4.0 (CC BY-SA 4.0); from eBible.org (hin2017)`,
      provenance: `Indian Revised Version (Hindi), taken verse by verse from the distributor's page ${BASE}/${page} by scripts/build-hi-scripture.mjs on ${today}; nothing was retyped. The distributor's copyright page states the Creative Commons Attribution Share-Alike licence 4.0 for this translation. A selection, not a change: the verse text is exactly the source's; the translators' footnotes, the section headings and the cross-references (the lines between verses and the references the translation sets in parentheses inside a verse) are not included. The English beside it is the World English Bible, a separate public-domain text.`,
      url: `${BASE}/${page}`,
      rights: 'licensed',
      licenseNote: 'CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), as stated by the distributor, eBible.org: share and adapt with the copyright and source named, changes indicated, and the same licence kept. This text is passed on unchanged under that licence.',
      authorship: 'licensed',
    },
    review: { status: 'reviewed', reviewedBy: 'scripts/verify-scripture.mjs', reviewedAt: today, notes: 'Wording verified by byte-comparison against eBible.org hin2017.' },
    topics: part.topics,
    editorialTags: [],
    prepTargets: [],
    generated: false,
    // the catalogue work these chapters belong to (src/course/hindi.ts): its rights record names the licence and the check
    work: { slug: 'bible-hindi', chapter: { index: SLICE.indexOf(part) + 1, title: part.title } },
    scripture: {
      translationId: 'hin2017', translationName: NAME, edition: 'IRV Hindi 2019', book: part.book, chapter: part.chapter,
      verification: { against: 'eBible.org hin2017', url: BASE, checkedAt: today, method: 'byte-comparison', by: 'scripts/verify-scripture.mjs' },
    },
    english: { source: 'World English Bible (public domain), eBible.org eng-web' },
    sections: [{ title: part.section, chapter: part.chapter, paragraphs }],
  };
  if (!dry) fs.writeFileSync(`data/corpus/hi/${part.slug}.json`, `${JSON.stringify(doc, null, 2)}\n`);
}
console.log(dry ? 'dry run: nothing written' : 'written; now run: node scripts/verify-scripture.mjs');
