import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { ARAMAIC_SEED } from '../src/adapters/aramaic/seed.ts';

const rows = [...ARAMAIC_SEED].map((row) => ({ ...row }));
const ids = new Set<string>();
for (const [index, row] of rows.entries()) {
  for (const key of ['surface', 'lemma', 'lemmaId', 'morph', 'reference', 'gloss', 'glossStatus', 'seg', 'sourceWordId'] as const) {
    if (typeof row[key] !== 'string' || (key !== 'gloss' && !row[key])) throw new Error(`row ${index}: missing ${key}`);
  }
  if (!row.lemma || !['external', 'unavailable'].includes(row.glossStatus) || (!row.gloss && row.glossStatus !== 'unavailable')) throw new Error(`row ${index}: invalid lemma/gloss status`);
  if (!/^A/.test(row.morph)) throw new Error(`row ${index}: morphology is not A-coded`);
  const seg = row.seg.split('/').map(Number);
  if (seg.some((offset) => !Number.isInteger(offset) || offset < 1) || seg.reduce((a, b) => a + b, 0) !== [...row.surface].filter((char) => /[\u05D0-\u05EA]/u.test(char)).length) throw new Error(`row ${index}: segment offsets do not cover the consonants`);
  if (ids.has(row.sourceWordId)) throw new Error(`duplicate sourceWordId ${row.sourceWordId}`);
  ids.add(row.sourceWordId);
}
const bookOf = (reference: string) => /^(?:Dan(?:iel)?)/i.test(reference) ? 'DAN' : /^(?:Ezr(?:a)?)/i.test(reference) ? 'EZR' : /^(?:Jer(?:emiah)?)/i.test(reference) ? 'JER' : /^(?:Gen(?:esis)?)/i.test(reference) ? 'GEN' : 'UNKNOWN';
const counts = Object.fromEntries(['DAN', 'EZR', 'JER', 'GEN'].map((book) => [book, rows.filter((row) => bookOf(row.reference) === book).length]));
if (rows.length !== 4828 || JSON.stringify(counts) !== JSON.stringify({ DAN: 3599, EZR: 1212, JER: 15, GEN: 2 })) throw new Error(`unexpected source scope: ${rows.length} rows ${JSON.stringify(counts)}`);
if (new Set(rows.map((row) => row.reference)).size !== 269 || rows.some((row) => bookOf(row.reference) === 'UNKNOWN')) throw new Error('references do not cover the verified 269-verse Aramaic scope');
const body = JSON.stringify(rows);
const sourceFiles = ['scripts/arc-export.mts', 'src/adapters/aramaic/seed.ts', 'data/sources/aramaic/oshb-aramaic-snapshot.xml', 'data/sources/aramaic/strong-aramaic-entries.xml', 'data/sources/aramaic/lexical-index-aramaic-entries.xml'];
const sourceChecksums = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
const adapterManifestPath = process.argv[3];
if (!adapterManifestPath) throw new Error('pass the built adapter-manifest.json as the second argument');
const adapter = JSON.parse(await readFile(adapterManifestPath, 'utf8'));
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (adapter.schema !== 'golearn-aramaic-adapter@1' || adapter.sourceRevision !== sourceRevision || !/^[a-f0-9]{64}$/.test(adapter.sha256)) throw new Error('adapter bundle is stale or invalid; rebuild it from this source revision');
const adapterSourceChecksums = Object.fromEntries(await Promise.all(Object.keys(adapter.sourceChecksums ?? {}).map(async (file) => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
if (!Object.keys(adapterSourceChecksums).length || JSON.stringify(adapterSourceChecksums) !== JSON.stringify(adapter.sourceChecksums)) throw new Error('adapter source inputs changed; rebuild the standalone bundle');
const manifest = {
  schema: 'golearn-aramaic-export@1',
  language: 'arc',
  variety: 'arc-bib',
  source: 'Open Scriptures Hebrew Bible (OSHB) and Open Scriptures HebrewLexicon, Aramaic qere readings',
  sourceUrl: ['https://github.com/openscriptures/morphhb', 'https://github.com/openscriptures/HebrewLexicon'],
  sourceLicense: 'OSHB morphology and HebrewLexicon Strong/LexicalIndex transcription: CC BY 4.0; WLC base text and Strong dictionary text: public domain',
  sourceRevision,
  sourceChecksums,
  adapter: { file: 'adapter.js', typesFile: adapter.typesFile, sha256: adapter.sha256, sourceRevision: adapter.sourceRevision, sourceChecksums: adapter.sourceChecksums, buildTool: adapter.buildTool, format: adapter.format, standalone: adapter.standalone, licenseFile: adapter.licenseFile, exports: adapter.exports, contract: adapter.contract },
  fields: ['surface', 'lemma', 'lemmaId', 'morph', 'reference', 'gloss', 'glossStatus', 'seg', 'sourceWordId'],
  tokens: rows.length,
  glossAvailable: rows.filter((row) => row.glossStatus === 'external' && row.gloss).length,
  glossUnavailable: rows.filter((row) => row.glossStatus === 'unavailable').length,
  distinctReferences: new Set(rows.map((row) => row.reference)).size,
  sha256: createHash('sha256').update(body).digest('hex'),
};
const bundle = { manifest, rows };
const output = process.argv[2];
if (output) await writeFile(output, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
else process.stdout.write(JSON.stringify(bundle, null, 2) + '\n');
