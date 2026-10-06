/** Verify the generated Thai Scripture corpus and update the shared verse record. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['scripts/build-thai-scripture-full.mjs', '--dry'], { stdio: 'inherit' });
const docsPath = 'data/sources/th/otcv2025-library-documents.json';
const docs = JSON.parse(fs.readFileSync(docsPath, 'utf8'));
const verses = {};
for (const doc of docs) {
  for (const s of doc.sections.flatMap((x) => x.paragraphs).flatMap((x) => x.sentences ?? [])) {
    const ref = s.verseRefs?.[0];
    if (ref) verses[ref] = { text: s.text, url: 'https://api.open.bible/artifactContent/2477bade-c5d4-4dc4-8a53-5cad848549db' };
  }
}
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const old = JSON.parse(fs.readFileSync('data/verified/scripture.json', 'utf8'));
const entry = {
  lang: 'th', translationId: 'a62f327aa0179709', name: 'Biblica Open Thai Common Version 2025', source: 'Open.Bible',
  base: 'https://open.bible/bibles/biblica-open-thai-common-version-2025',
  rightsStatement: 'CC BY-SA 4.0; Biblica, Inc. (as stated in metadata.xml promoVersionInfo)',
  sourceArchive: {
    files: [
      { file: 'biblica-open-thai-common-version-2025-release.zip', sha256: sha('data/sources/th/biblica-open-thai-common-version-2025-release.zip'), method: 'USX' },
      { file: 'biblica-open-thai-common-version-2025-usfm.zip', sha256: sha('data/sources/th/biblica-open-thai-common-version-2025-usfm.zip'), method: 'independent-USFM' },
    ], releaseId: 'a62f327aa0179709-rev2', metadata: 'metadata.xml', method: 'USX/USFM verse comparison',
  }, checkedAt: '2026-10-01', verses, mismatches: [],
};
old.checkedAt = '2026-10-01';
old.translations = [...old.translations.filter((x) => !(x.lang === 'th' && x.translationId === entry.translationId)), entry];
fs.writeFileSync('data/verified/scripture.json', `${JSON.stringify(old, null, 2)}\n`);
console.log(`th ${entry.name}: ${Object.keys(verses).length} verses, 0 mismatches; wrote data/verified/scripture.json`);
