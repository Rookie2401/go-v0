/// <reference types="node" />
// Authoring tool: lemma encounter counts of the learner after Stage 0 + the ladder's units up to --upto <unit id> (default all).
import fs from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../../../../src/adapters';
import { loadLadder } from '../../../../src/ladder';
import { analyseDocument } from '../../../../src/ladder/analyse';
const a = process.argv.slice(2).filter((x) => x !== '--');
const out = a[0]; const upto = a[1] === '--upto' ? a[2] : '';
const adapter = createAdapterRegistry().get('de');
const loaded = loadLadder('de', path.resolve('.'));
const seen = new Map<string, number>();
const add = (doc: any) => { const st = analyseDocument(adapter, doc); for (const [l, n] of st.lemmas) seen.set(l, (seen.get(l) ?? 0) + n); };
for (const h of loaded.head) add(h.doc);
for (const lu of loaded.units) { if (lu.doc) add(lu.doc); if (upto && lu.unit.id === upto) break; }
fs.writeFileSync(out, JSON.stringify(Object.fromEntries(seen)));
console.log(seen.size, 'lemmas seen');
