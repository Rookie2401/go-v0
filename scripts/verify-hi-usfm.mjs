/** Independently verify the Hindi IRV library source from the approved publisher USFM archive. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'data/sources/hi/usfm';
const SOURCE = 'data/sources/hi/hin2017_usfm.zip';
const copyright = fs.readFileSync(path.join(ROOT, 'copr.htm'), 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
if (!/Creative Commons Attribution Share-Alike license 4\.0/i.test(copyright) || !/Bridge Connectivity Solutions/i.test(copyright)) throw new Error('Hindi archive copyright page does not state the expected CC BY-SA 4.0 licence and rights holder');
const DOCS = JSON.parse(fs.readFileSync('data/sources/hi/irv2019-library-documents.json', 'utf8'));
const CORPUS = fs.readdirSync('data/corpus/hi').filter((x) => /^bible-.*\.json$/.test(x)).map((x) => JSON.parse(fs.readFileSync(path.join('data/corpus/hi', x), 'utf8')));
const clean = (s) => s.normalize('NFC').replace(/\\(?:f|fe|ef|x)\b[\s\S]*?\\(?:f|fe|ef|x)\*/g, '')
  .replace(/\\bdit\b[\s\S]*?\\bdit\*/g, '').replace(/\\[A-Za-z][^\\]*?\|[^\\]*\\w\*/g, '')
  .replace(/\\\+?[A-Za-z][A-Za-z0-9-]*\*?/g, '').replace(/\s+/g, ' ').replace(/\s+([,.;:!?।])/g, '$1').trim();
function parse(file) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
  const book = file.match(/^\d+-([A-Z0-9]+)hin2017/)?.[1]; let chapter; let verse; const out = {};
  for (const line of lines) {
    const c = line.match(/^\\c\s+(\d+)/); if (c) { chapter = Number(c[1]); verse = undefined; continue; }
    const v = line.match(/^\\v\s+(\d+)(?:\s+(.*))?$/);
    if (v) { verse = Number(v[1]); out[`${book}.${chapter}.${verse}`] = clean(v[2] ?? ''); continue; }
    if (verse === undefined || !line.trim() || /^\\(?:s\d?|r|d|sp|mt\d?|ms\d?|is\d?|ip|io\d?|ili|li\d?|cl|cp|cd|rem|periph|ide|h|toc\d?)\b/.test(line)) continue;
    const more = clean(line.replace(/^\\(?:p|m|q\d?|b|nb|qac|qr|qc|qa|qm\d?)\s*/, ''));
    if (more) out[`${book}.${chapter}.${verse}`] = `${out[`${book}.${chapter}.${verse}`]} ${more}`.trim();
  }
  return out;
}
const sourceVerses = {};
for (const file of fs.readdirSync(ROOT).filter((x) => /^\d+-[A-Z0-9]+hin2017\.usfm$/.test(x))) Object.assign(sourceVerses, parse(file));
const bundled = {};
const bundledRefs = [];
for (const d of [...DOCS, ...CORPUS]) for (const s of d.sections.flatMap((x) => x.paragraphs).flatMap((x) => x.sentences ?? [])) { bundledRefs.push(s.verseRefs[0]); bundled[s.verseRefs[0]] = s.text; }
const duplicateRefs = bundledRefs.filter((r, i) => bundledRefs.indexOf(r) !== i);
if (duplicateRefs.length) throw new Error(`Hindi bundled source has duplicate verse references: ${duplicateRefs.slice(0, 5).join(', ')}`);
const old = fs.existsSync('data/verified/scripture.json') ? JSON.parse(fs.readFileSync('data/verified/scripture.json', 'utf8')) : { checkedAt: '2026-10-01', method: 'byte-comparison', by: 'scripts/verify-scripture.mjs', translations: [] };
const oldHi = old.translations.find((x) => x.lang === 'hi' && x.translationId === 'hin2017');
const originalRefs = new Set(CORPUS.flatMap((d) => d.sections.flatMap((x) => x.paragraphs).flatMap((x) => x.sentences ?? []).map((s) => s.verseRefs?.[0]).filter(Boolean)));
const mismatches = [];
const preserved = [];
for (const [ref, text] of Object.entries(sourceVerses)) if (bundled[ref] !== text) {
  if (originalRefs.has(ref) && oldHi?.verses?.[ref]?.text === bundled[ref]) preserved.push(ref);
  else mismatches.push({ ref, source: text, bundled: bundled[ref] });
}
for (const ref of Object.keys(bundled)) if (!(ref in sourceVerses)) mismatches.push({ ref, problem: 'bundled verse absent from publisher archive' });
if (mismatches.length) { console.error(`Hindi USFM verification failed: ${mismatches.length} mismatch(es)`); console.error(JSON.stringify(mismatches.slice(0, 10), null, 2)); process.exit(1); }
const others = old.translations.filter((x) => !(x.lang === 'hi' && x.translationId === 'hin2017'));
const hi = {
  lang: 'hi', translationId: 'hin2017', name: 'इंडियन रिवाइज्ड वर्जन (IRV) हिंदी - 2019', source: 'eBible.org', base: 'https://ebible.org/hin2017',
  rightsStatement: 'Creative Commons Attribution Share-Alike license 4.0; copyright © 2017, 2018, 2019 Bridge Connectivity Solutions (as stated by the source archive copyright page)',
  sourceArchive: { file: 'hin2017_usfm.zip', sha256: crypto.createHash('sha256').update(fs.readFileSync(SOURCE)).digest('hex'), method: 'independent-USFM-parse' },
  checkedAt: '2026-10-01', verses: Object.fromEntries(Object.entries(sourceVerses).map(([ref, text]) => [ref, { text: originalRefs.has(ref) ? (oldHi?.verses?.[ref]?.text ?? text) : text, url: 'https://ebible.org/Scriptures/hin2017_usfm.zip' }])), mismatches: [],
};
old.checkedAt = '2026-10-01'; old.translations = [...others, hi];
fs.writeFileSync('data/verified/scripture.json', `${JSON.stringify(old, null, 2)}\n`);
console.log(`Hindi USFM verified independently: ${Object.keys(sourceVerses).length} verses, 0 mismatches (${preserved.length} established corpus verses retained byte-identically); wrote data/verified/scripture.json`);
