// Looks up keys in the two full indexes (as built). Usage: node idx.mjs <pointed or unpointed key> ...
import fs from 'node:fs';
const B = JSON.parse(fs.readFileSync('C:/Users/CJWal/dev/go-v0/public/lexicon/he/biblical-index.json', 'utf8'));
const M = JSON.parse(fs.readFileSync('C:/Users/CJWal/dev/go-v0/public/lexicon/he/modern-index.json', 'utf8'));
const strip = (s) => s.normalize('NFC').replace(/[\u0591-\u05C7\u034F]/g, '');
for (const k0 of process.argv.slice(2)) {
  const k = k0.normalize('NFC');
  console.log(`== ${k}`);
  for (const [name, I] of [['BIB', B], ['MOD', M]]) {
    const keys = strip(k) === k ? [k, ...(I.consonantal[k] ?? [])] : [k];
    for (const key of [...new Set(keys)]) for (const r of I.forms[key] ?? []) {
      const id = r[0].split('/').pop().replace(/\+$/, '');
      console.log(`  ${name} ${key}  ${JSON.stringify(r)}  lemma=${JSON.stringify(I.lemmas[id] ?? null).slice(0, 110)}`);
    }
  }
}
