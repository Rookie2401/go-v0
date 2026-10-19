// Step 1 of scripts/latin-build-closed.mjs: run from the Romance app's folder with  npx vite-node <this file> <out>/closed.json  (reads that app's src/lexicon, writes only the JSON).
import fs from 'node:fs';
import { PRONOUNS } from 'C:/Users/CJWal/dev/romance-v0/src/lexicon/pronouns';
import { NUMERALS } from 'C:/Users/CJWal/dev/romance-v0/src/lexicon/numerals';
import { PARTICLES, ENCLITICS } from 'C:/Users/CJWal/dev/romance-v0/src/lexicon/particles';
import { PREPOSITIONS } from 'C:/Users/CJWal/dev/romance-v0/src/lexicon/prepositions';
import { IRREGULAR_VERBS } from 'C:/Users/CJWal/dev/romance-v0/src/lexicon/irregular';
const strip = (s: string) => s.normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC');
const out: any = {};
for (const [k, list] of Object.entries({ PRONOUNS, NUMERALS, PARTICLES, ENCLITICS, PREPOSITIONS, IRREGULAR_VERBS })) {
  out[k] = (list as any[]).map((l) => ({ key: l.key, lemma: strip(l.lemma), pos: l.pos, gloss: l.gloss, gender: l.gender, pronoun_type: l.pronoun_type, governs: l.governs, forms: l.forms.map((f: any) => ({ s: strip(f.surface), f: f.features })) }));
}
fs.writeFileSync(process.argv[2] ?? 'closed.json', JSON.stringify(out));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]: any) => [k, [v.length, v.reduce((a: number, l: any) => a + l.forms.length, 0)]])));
