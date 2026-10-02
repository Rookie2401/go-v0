/**
 * Verify bundled Scripture wording against a published source, byte for byte, and record the result.
 *
 *   node scripts/verify-scripture.mjs            # check every entry in SOURCES, write data/verified/scripture.json
 *   node scripts/verify-scripture.mjs --fix      # also replace differing bundled text with the source text
 *
 * Only translations whose rights are established at the source are listed. Nothing is retyped: verse text is
 * extracted from the fetched page and compared (after NFC) with the corpus document. The output file is the
 * provenance record the import pipeline reads (`scripture.verification`).
 */
import fs from 'node:fs';

const SOURCES = [
  { lang: 'es', doc: 'data/corpus/es/bible-1john-1.json', translationId: 'spaRV1909', name: 'Reina-Valera 1909', rights: 'public-domain', base: 'https://ebible.org/spaRV1909' },
  // one translation, several bundled documents: one record entry holds the verses of all of them
  { lang: 'de', docs: ['data/corpus/de/bible-1john-1.json', 'data/corpus/de/bible-gen-1.json', 'data/corpus/de/bible-psa-1.json', 'data/corpus/de/bible-psa-23.json', 'data/corpus/de/bible-mat-1.json'],
    translationId: 'deu1912', name: 'Lutherbibel 1912', rights: 'public-domain', base: 'https://ebible.org/deu1912' },
  // a LICENSED translation (not public domain): the copyright page must state this licence and this rights holder
  { lang: 'hi', docs: ['data/corpus/hi/bible-1john-1.json', 'data/corpus/hi/bible-gen-1.json', 'data/corpus/hi/bible-psa-1.json', 'data/corpus/hi/bible-psa-23.json', 'data/corpus/hi/bible-mrk-1.json'],
    translationId: 'hin2017', name: 'इंडियन रिवाइज्ड वर्जन (IRV) हिंदी - 2019', rights: 'licensed', base: 'https://ebible.org/hin2017',
    licence: 'Creative Commons Attribution Share-Alike license 4.0', holder: 'copyright © 2017, 2018, 2019 Bridge Connectivity Solutions' },
];
const fix = process.argv.includes('--fix');

// the distributor numbers Psalm pages with three digits (PSA023.htm), every other book with two (GEN01.htm)
function pageFor(ref) { const [book, ch] = ref.split('.'); return `${book}${String(ch).padStart(book === 'PSA' ? 3 : 2, '0')}.htm`; }

async function fetchVerses(base, refs) {
  const byPage = new Map();
  for (const r of refs) { const p = pageFor(r); if (!byPage.has(p)) byPage.set(p, []); byPage.get(p).push(r); }
  const out = {};
  for (const [page, pageRefs] of byPage) {
    const url = `${base}/${page}`;
    const html = await (await fetch(url)).text();
    const t = html
      // headings and cross-reference lines that the page places between verses are not verse text
      .replace(/<div class=['"](?:s\d?|ms\d?|mt\d?|r|d|sp|mr|sr|b)['"][^>]*>[\s\S]*?<\/div>/g, '\n')
      .replace(/<span class="verse" id="V(\d+)">[^<]*<\/span>/g, '\n@@$1 ')
      .replace(/<a [^>]*class="notemark"[\s\S]*?<\/a>/g, '')
      // a cross-reference set inside a verse in parentheses ("(इब्रा. 1:10, इब्रा. 11:3)", marked as a character style by
      // the source) is apparatus like a footnote, not verse text: it is left out, and only when it is exactly that
      .replace(/<span class=['"]bdit['"]>\s*\([^<()]*\d+\s*[:.]\s*\d+[^<()]*\)\s*<\/span>/g, ' ') // a space, not nothing: the reference stands between two words (राज्य … निकट); whitespace is collapsed below
    // two inline style spans set side by side with no space between them (राज्य</span><span class='it'>निकट in the
    // distributor's page, \wj* \it in its USFM) are two words: the marker boundary is a word boundary. Without this the
    // two words would be joined into one that no dictionary has.
    .replace(/(?<=\p{L})<\/span>(?=(?:<span\b[^>]*>)+\p{L})/gu, '</span> ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;|&#160;/g, ' ');
    const clean = (x) => x.replace(/\s+/g, ' ').trim().normalize('NFC');
    for (const line of t.split('\n')) {
      const m = /^@@(\d+) (.*)/.exec(line);
      if (!m) continue;
      const ref = pageRefs.find((r) => r.split('.')[2] === m[1]);
      if (ref) out[ref] = { text: clean(m[2]), url };
    }
  }
  return out;
}

async function rightsStatement(base, src) {
  const html = await (await fetch(`${base}/copyright.htm`)).text();
  if (src?.licence) {
    const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    return plain.includes(src.licence) && plain.includes(src.holder)
      ? `${src.licence}; ${src.holder} (as stated on the source copyright page)`
      : 'THE EXPECTED LICENCE OR RIGHTS HOLDER IS NOT STATED';
  }
  return /Public Domain/i.test(html) ? 'Public Domain (as stated on the source copyright page)' : 'NOT STATED AS PUBLIC DOMAIN';
}

const record = { checkedAt: new Date().toISOString().slice(0, 10), method: 'byte-comparison', by: 'scripts/verify-scripture.mjs', translations: [] };
let failed = false;
for (const src of SOURCES) {
  const rights = await rightsStatement(src.base, src);
  const entry = { lang: src.lang, translationId: src.translationId, name: src.name, source: 'eBible.org', base: src.base, rightsStatement: rights, verses: {}, mismatches: [] };
  for (const path of src.docs ?? [src.doc]) {
  const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
  const sentences = doc.sections.flatMap((s) => s.paragraphs.flatMap((p) => p.sentences ?? []));
  const refs = sentences.flatMap((s) => s.verseRefs ?? []);
  const verses = await fetchVerses(src.base, refs);
  const before = entry.mismatches.length;
  for (const s of sentences) {
    // Verification is per verse; a sentence spanning several verses is compared against their concatenation.
    const expected = (s.verseRefs ?? []).map((r) => verses[r]?.text).join(' ');
    if (!expected) { entry.mismatches.push({ refs: s.verseRefs, problem: 'verse not found at source' }); failed = true; continue; }
    const same = s.text.normalize('NFC') === expected;
    if (!same) {
      entry.mismatches.push({ refs: s.verseRefs, bundled: s.text, source: expected });
      if (fix) s.text = expected; else failed = true;
    }
    for (const r of s.verseRefs ?? []) entry.verses[r] = verses[r];
  }
  if (fix && entry.mismatches.length > before) fs.writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  }
  if (!(src.licence ? rights.startsWith(src.licence) : /^Public Domain/.test(rights))) failed = true;
  record.translations.push(entry);
  console.log(`${src.lang} ${src.name}: ${Object.keys(entry.verses).length} verses, ${entry.mismatches.length} mismatch(es)${fix && entry.mismatches.length ? ' — corrected from source' : ''}; rights: ${rights}`);
  for (const m of entry.mismatches) console.log('   ', JSON.stringify(m));
}
fs.mkdirSync('data/verified', { recursive: true });
// The corpus documents embed `checkedAt`. Re-running the check must not make that date drift: when the result is
// identical to the stored record, the record is left untouched and the confirmation is only reported.
const OUT = 'data/verified/scripture.json';
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : undefined;
// Each translation carries the date ITS verses were last found changed or added; the record's own date stays that of
// its first writing while any translation is unchanged, because documents verified then embed it.
const strip = ({ checkedAt: _d, ...rest }) => rest;
for (const t of record.translations) {
  const old = prev?.translations.find((p) => p.lang === t.lang && p.translationId === t.translationId);
  // Bulk USFM verification records contain the complete translation. The normal
  // slice checker must retain that verified bulk record while refreshing the
  // bundled slice; otherwise a routine rerun would silently truncate it.
  if (old?.sourceArchive && Object.keys(old.verses ?? {}).length > Object.keys(t.verses ?? {}).length) {
    t.verses = { ...old.verses, ...t.verses };
    t.sourceArchive = old.sourceArchive;
  }
  t.checkedAt = old && JSON.stringify(strip(old)) === JSON.stringify(strip(t)) ? (old.checkedAt ?? prev.checkedAt) : record.checkedAt;
}
// A translation this script does not check (one verified by another script against its own archive, e.g. the Thai
// release) is kept as it stands: a run here must never drop it.
for (const old of prev?.translations ?? []) {
  if (!record.translations.some((t) => t.lang === old.lang && t.translationId === old.translationId)) record.translations.push(old);
}
if (prev && record.translations.some((t) => t.checkedAt !== record.checkedAt)) record.checkedAt = prev.checkedAt;
if (prev && JSON.stringify(prev.translations.map(strip)) === JSON.stringify(record.translations.map(strip))) {
  console.log(`unchanged since ${prev.checkedAt}: ${OUT} left as is (confirmed again ${record.checkedAt})`);
} else {
  fs.writeFileSync(OUT, JSON.stringify(record, null, 2) + '\n');
  console.log(`wrote ${OUT}`);
}
if (failed) { console.error('VERIFICATION FAILED (run with --fix to adopt the source wording, then re-run).'); process.exit(1); }
