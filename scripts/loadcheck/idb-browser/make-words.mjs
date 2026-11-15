// Writes words.json: the same 750 Albanian lemmas that bench-open.ts uses (same filter, same order).
//   node scripts/loadcheck/idb-browser/make-words.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');
const freq = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/dict/sq/frequency.json'), 'utf8'));
const words = freq.lemmas.map(([w]) => w).filter((w) => /^[a-zçë]{3,}$/.test(w)).slice(0, 750);
fs.writeFileSync(path.join(here, 'words.json'), JSON.stringify(words) + '\n');
console.log(`wrote ${words.length} words to ${path.join(here, 'words.json')}`);
