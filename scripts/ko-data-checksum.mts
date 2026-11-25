/// <reference types="node" />
/**
 * npm run ko:data-checksum -- [--write] [--date YYYY-MM-DD]
 *
 * One checksum for each folder of the built Korean data, so a release can be recomputed and compared:
 *   public/dict/ko       the dictionary (manifest, short shards, full/, forms/, reverse/)
 *   public/lexicon/ko    the stem lexicon shards (standard/)
 * The checksum of a folder is the sha256 of the text made of one line per file, sorted by relative path (plain code-unit order, "/" as the
 * separator): "<relative path><TAB><sha256 of the file's bytes><LF>". The same in any shell:
 *   cd public/dict/ko && find . -type f | sed 's|^\./||' | LC_ALL=C sort | while read f; do printf '%s\t%s\n' "$f" "$(sha256sum "$f" | cut -d' ' -f1)"; done | sha256sum
 * With --write the figures are recorded in docs/korean/INDEX.md (between the ko-data-checksums markers, which a lexicon rebuild keeps).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => a !== '--');
const write = args.includes('--write');
const di = args.indexOf('--date');
const date = di >= 0 ? args[di + 1] : new Date().toISOString().slice(0, 10);
const FOLDERS = ['public/dict/ko', 'public/lexicon/ko'];

function walk(root: string, dir = ''): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(path.join(root, dir))) {
    const rel = dir ? `${dir}/${name}` : name;
    if (fs.statSync(path.join(root, rel)).isDirectory()) out.push(...walk(root, rel)); else out.push(rel);
  }
  return out;
}

export function folderChecksum(root: string): { files: number; bytes: number; sha256: string } {
  const rels = walk(root).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let bytes = 0;
  const lines = rels.map((rel) => {
    const buf = fs.readFileSync(path.join(root, rel));
    bytes += buf.length;
    return `${rel}\t${crypto.createHash('sha256').update(buf).digest('hex')}\n`;
  });
  return { files: rels.length, bytes, sha256: crypto.createHash('sha256').update(lines.join('')).digest('hex') };
}

const results = FOLDERS.map((f) => ({ folder: f, ...folderChecksum(f) }));
for (const r of results) console.log(`${r.folder}: ${r.files} files, ${r.bytes} bytes, sha256 ${r.sha256}`);

if (write) {
  const START = '<!-- ko-data-checksums -->';
  const END = '<!-- /ko-data-checksums -->';
  const block = `${START}\n## Built data checksums (${date})\n\nRecomputed with \`npm run ko:data-checksum\` (scripts/ko-data-checksum.mts): the sha256 of one line per file, sorted by relative path, "path TAB sha256 of the file".\n\n| folder | files | bytes | sha256 |\n|---|---|---|---|\n${results.map((r) => `| ${r.folder} | ${r.files} | ${r.bytes} | \`${r.sha256}\` |`).join('\n')}\n${END}\n`;
  const file = 'docs/korean/INDEX.md';
  let doc = fs.readFileSync(file, 'utf8');
  const a = doc.indexOf(START);
  const b = doc.indexOf(END);
  doc = a >= 0 && b > a ? doc.slice(0, a) + block + doc.slice(b + END.length).replace(/^\n/, '') : `${doc.replace(/\n*$/, '\n')}\n${block}`;
  fs.writeFileSync(file, doc);
  console.log(`recorded in ${file}`);
}
