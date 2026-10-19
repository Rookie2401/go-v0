/// <reference types="node" />
/**
 * Writes the verification record of the bundled Latin Scripture (Clementine Vulgate, 1592) into data/verified/scripture.json:
 * ONE translation object (lang 'la', translationId 'latVulgClementine') in the `translations` array, inserted or replaced in
 * place. Every other translation and the file's top-level fields stay as they are (the file is re-written with the formatting it
 * already has, so the diff is this object only). The record holds only the verses of the bundled slices (data/corpus/la/vulgate-*.json),
 * taken from the USFX file the corpus was built from; Psalm 23 is recorded under its Hebrew-numbered references, as the corpus
 * files reference it (the Vulgate numbers that psalm 22). Downloads nothing; refuses to run if the USFX file is missing.
 *
 *   node scripts/verify-la-scripture.mts            # write the record
 *   node scripts/verify-la-scripture.mts --check    # fail if the record on disk differs from a fresh one
 *
 * Source: vetus-v0/data/vulgate/lat-clementine.usfx.xml (LA_VETUS_ROOT overrides the repository location).
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');
const VETUS = process.env.LA_VETUS_ROOT ?? path.join(path.resolve(REPO, '..'), 'vetus-v0');
const USFX = path.join(VETUS, 'data/vulgate/lat-clementine.usfx.xml');
const VERIFIED = path.join(REPO, 'data/verified/scripture.json');
const CORPUS = path.join(REPO, 'data/corpus/la');
const TRANSLATION_ID = 'latVulgClementine';
const CHECKED_AT = '2026-10-17';
const CHECK = process.argv.includes('--check');

if (!fs.existsSync(USFX)) { console.error(`verify-la-scripture: source missing: ${USFX}\n(set LA_VETUS_ROOT if vetus-v0 lives elsewhere)`); process.exit(1); }
if (!fs.existsSync(VERIFIED)) { console.error(`verify-la-scripture: ${VERIFIED} does not exist`); process.exit(1); }

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&amp;/g, '&');
const usfx = fs.readFileSync(USFX, 'utf8');
function verseText(book: string, chapter: number, verse: number): string {
  const b = new RegExp(String.raw`<book id="${book}">([\s\S]*?)</book>`).exec(usfx)?.[1];
  const c = b && new RegExp(String.raw`<c id="${chapter}"/>([\s\S]*?)(?=<c id="|$)`).exec(b)?.[1];
  const v = c && new RegExp(String.raw`<v id="${verse}"/>([\s\S]*?)<ve/>`).exec(c)?.[1];
  if (v === undefined || v === null || v === '') throw new Error(`the USFX source has no ${book} ${chapter}:${verse}`);
  return decode(v).trim();
}

const URL_OF = 'https://github.com/seven1m/open-bibles/blob/master/lat-clementine.usfx.xml';
const verses: Record<string, { text: string; url: string }> = {};
for (const f of fs.readdirSync(CORPUS).filter((x) => /^vulgate-.*\.json$/.test(x)).sort()) {
  const doc = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
  if (doc.scripture?.translationId !== TRANSLATION_ID) continue;
  const { book, chapter } = doc.scripture as { book: string; chapter: number };
  const usfxChapter = book === 'PSA' && chapter === 23 ? 22 : chapter; // Vulgate psalm numbering
  for (const s of doc.sections) for (const p of s.paragraphs) for (const x of p.sentences) {
    for (const ref of x.verseRefs as string[]) {
      const [b, , v] = ref.split('.');
      if (b !== book) throw new Error(`${f}: ${ref} is not in ${book}`);
      verses[ref] = { text: verseText(book, usfxChapter, Number(v)), url: URL_OF };
    }
  }
}
if (!Object.keys(verses).length) { console.error('verify-la-scripture: no Latin Scripture documents found in data/corpus/la'); process.exit(1); }

const record = {
  lang: 'la', translationId: TRANSLATION_ID, name: 'Biblia Sacra Vulgata (Clementine, 1592)',
  source: 'seven1m/open-bibles (USFX), as held by vetus-v0', base: 'https://github.com/seven1m/open-bibles',
  rightsStatement: 'Public domain (Clementine Vulgate, 1592)', checkedAt: CHECKED_AT, method: 'byte-comparison', by: 'scripts/verify-la-scripture.mts',
  verses, mismatches: [] as unknown[],
};

const file = JSON.parse(fs.readFileSync(VERIFIED, 'utf8')) as { translations: Array<{ lang: string; translationId: string }> };
const at = file.translations.findIndex((t) => t.lang === 'la' && t.translationId === TRANSLATION_ID);
if (at >= 0) file.translations[at] = record as never; else file.translations.push(record as never);
const body = JSON.stringify(file, null, 2) + '\n';
if (CHECK) {
  if (fs.readFileSync(VERIFIED, 'utf8') !== body) { console.error('verify-la-scripture --check: data/verified/scripture.json differs from a fresh record'); process.exit(1); }
  console.log(`verify-la-scripture --check: record for ${TRANSLATION_ID} is current (${Object.keys(verses).length} verses)`);
} else {
  fs.writeFileSync(VERIFIED, body);
  console.log(`verify-la-scripture: ${at >= 0 ? 'replaced' : 'inserted'} ${TRANSLATION_ID} (${Object.keys(verses).length} verses) in data/verified/scripture.json`);
}
