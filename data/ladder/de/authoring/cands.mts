/// <reference types="node" />
// Authoring tool: caches the lemma counts of every library text of 100..4000 words (library + scripture) in <out.json>.
import fs from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../../../../src/adapters';
import { resolveTextDocument } from '../../../../src/ladder';
import { analyseDocument } from '../../../../src/ladder/analyse';
const root = path.resolve('.');
const out = process.argv.slice(2).filter((a) => a !== '--')[0] ?? 'cands.json';
const adapter = createAdapterRegistry().get('de');
const idx = path.join(root, 'public/library/de/index');
const rows: any[] = [];
for (const f of fs.readdirSync(idx).filter((n) => n.startsWith('library-') || n.startsWith('scripture-'))) rows.push(...JSON.parse(fs.readFileSync(path.join(idx, f), 'utf8')).rows);
const res: any[] = [];
for (const r of rows) {
  const w = r.features?.words ?? 0;
  if (w < 100 || w > 4000) continue;
  const f = resolveTextDocument('de', root, r.id);
  if (!f.doc) continue;
  const st = analyseDocument(adapter, f.doc);
  res.push({ id: r.id, work: r.workId.replace('work:germany-de:', ''), words: st.words, auto: st.auto, rights: r.rights, genre: r.genre ?? '', title: r.title, chapter: r.chapter, lemmas: Object.fromEntries(st.lemmas) });
}
fs.writeFileSync(out, JSON.stringify(res));
console.log(res.length, 'texts cached');
