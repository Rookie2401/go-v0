// The transliteration line of the N commonest pointed forms of the Tanakh index (Hebrew readings only), for reading by eye.
import fs from 'node:fs';
import { transliterateHebrew } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/pronunciation';
const B = JSON.parse(fs.readFileSync('C:/Users/CJWal/dev/go-v0/public/lexicon/he/biblical-index.json', 'utf8'));
const N = Number(process.argv[2] ?? 300);
const rows = Object.entries(B.forms as Record<string, any[]>).map(([k, rs]) => [k, rs.filter((r) => r[1][0] === 'H').reduce((s, r) => s + r[2], 0)] as [string, number]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, N);
let line = '';
rows.forEach(([k, n], i) => { line += `${k} ${transliterateHebrew(k)?.text ?? '—'} (${n}) | `; if (i % 6 === 5) { console.log(line); line = ''; } });
console.log(line);
console.log('tokens covered: ' + rows.reduce((s, r) => s + r[1], 0));
