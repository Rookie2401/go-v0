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
  { lang: 'de', doc: 'data/corpus/de/bible-1john-1.json', translationId: 'deu1912', name: 'Lutherbibel 1912', rights: 'public-domain', base: 'https://ebible.org/deu1912' },
];
const fix = process.argv.includes('--fix');

function pageFor(ref) { const [book, ch] = ref.split('.'); return `${book}${String(ch).padStart(2, '0')}.htm`; }

async function fetchVerses(base, refs) {
  const byPage = new Map();
  for (const r of refs) { const p = pageFor(r); if (!byPage.has(p)) byPage.set(p, []); byPage.get(p).push(r); }
  const out = {};
  for (const [page, pageRefs] of byPage) {
    const url = `${base}/${page}`;
    const html = await (await fetch(url)).text();
    const t = html
      .replace(/<span class="verse" id="V(\d+)">[^<]*<\/span>/g, '\n@@$1 ')
      .replace(/<a [^>]*class="notemark"[\s\S]*?<\/a>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;|&#160;/g, ' ');
    for (const line of t.split('\n')) {
      const m = /^@@(\d+) (.*)/.exec(line);
      if (!m) continue;
      const ref = pageRefs.find((r) => r.split('.')[2] === m[1]);
      if (ref) out[ref] = { text: m[2].trim().normalize('NFC'), url };
    }
  }
  return out;
}

async function rightsStatement(base) {
  const html = await (await fetch(`${base}/copyright.htm`)).text();
  return /Public Domain/i.test(html) ? 'Public Domain (as stated on the source copyright page)' : 'NOT STATED AS PUBLIC DOMAIN';
}

const record = { checkedAt: new Date().toISOString().slice(0, 10), method: 'byte-comparison', by: 'scripts/verify-scripture.mjs', translations: [] };
let failed = false;
for (const src of SOURCES) {
  const doc = JSON.parse(fs.readFileSync(src.doc, 'utf8'));
  const sentences = doc.sections.flatMap((s) => s.paragraphs.flatMap((p) => p.sentences ?? []));
  const refs = sentences.flatMap((s) => s.verseRefs ?? []);
  const verses = await fetchVerses(src.base, refs);
  const rights = await rightsStatement(src.base);
  const entry = { lang: src.lang, translationId: src.translationId, name: src.name, source: 'eBible.org', base: src.base, rightsStatement: rights, verses: {}, mismatches: [] };
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
  if (fix && entry.mismatches.length) fs.writeFileSync(src.doc, JSON.stringify(doc, null, 2) + '\n');
  if (!/^Public Domain/.test(rights)) failed = true;
  record.translations.push(entry);
  console.log(`${src.lang} ${src.name}: ${Object.keys(entry.verses).length} verses, ${entry.mismatches.length} mismatch(es)${fix && entry.mismatches.length ? ' — corrected from source' : ''}; rights: ${rights}`);
  for (const m of entry.mismatches) console.log('   ', JSON.stringify(m));
}
fs.mkdirSync('data/verified', { recursive: true });
fs.writeFileSync('data/verified/scripture.json', JSON.stringify(record, null, 2) + '\n');
console.log('wrote data/verified/scripture.json');
if (failed) { console.error('VERIFICATION FAILED (run with --fix to adopt the source wording, then re-run).'); process.exit(1); }
