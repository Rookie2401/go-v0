// Takes verses out of the repository's own Masoretic text (packages/biblia/public/data/he: Miqra according to the Masorah + the Open
// Scriptures reading of each word) and writes them as "REF\ttext\tgold-json" lines. Usage: node extract.mjs out.tsv Gen.1.1-5 Deut.6.4-9 Ps.23 ...
import fs from 'node:fs';
const DIR = 'C:/Users/CJWal/dev/go-v0/packages/biblia/public/data/he';
const [out, ...refs] = process.argv.slice(2);
const lines = [];
for (const ref of refs) {
  const [book, ch, vv] = ref.split('.');
  const b = JSON.parse(fs.readFileSync(`${DIR}/${book}.json`, 'utf8'));
  const chapter = b.chapters[Number(ch) - 1];
  const [a, z] = vv ? vv.split('-').map(Number) : [1, chapter.verses.length];
  for (const v of chapter.verses) {
    if (v.n < a || v.n > (z ?? a)) continue;
    lines.push(`${book}.${ch}.${v.n}\t${v.t}\t${JSON.stringify(v.w)}`);
  }
}
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`${lines.length} verses → ${out}`);
