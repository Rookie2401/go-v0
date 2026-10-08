/// <reference types="node" />
// Scratch tool (German ladder, b1-bridge package): coverage after the ladder's current last unit of EVERY library text.
// Usage: npx vite-node data/ladder/de/authoring/place-all.mts [--after <unitId>] [--min 150] [--max 3000]
import fs from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../../../../src/adapters';
import { loadLadder, resolveTextDocument } from '../../../../src/ladder';
import { analyseDocument, Progress } from '../../../../src/ladder/analyse';
import { POLICY } from '../../../../src/ladder/policy';

const root = path.resolve('.');
const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string, d: string): string => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const after = opt('--after', '');
const min = Number(opt('--min', '150')), max = Number(opt('--max', '3000'));
const adapter = createAdapterRegistry().get('de');
const loaded = loadLadder('de', root);
const progress = new Progress(POLICY.minEncounters);
for (const h of loaded.head) progress.add(analyseDocument(adapter, h.doc));
for (const lu of loaded.units) {
  if (lu.status === 'ok' && lu.doc) progress.add(analyseDocument(adapter, lu.doc));
  if (after && lu.unit.id === after) break;
}
const idx = path.join(root, 'public/library/de/index');
const rows: any[] = [];
for (const f of fs.readdirSync(idx).filter((n) => n.startsWith('library-'))) rows.push(...JSON.parse(fs.readFileSync(path.join(idx, f), 'utf8')).rows);
const out: string[] = [];
for (const r of rows) {
  const w = r.features?.words ?? 0;
  if (w < min || w > max) continue;
  const f = resolveTextDocument('de', root, r.id);
  if (!f.doc) continue;
  const st = analyseDocument(adapter, f.doc);
  const cov = progress.coverage(st);
  const nl = progress.newLemmas(st).length;
  out.push(`${(cov.cov3 * 100).toFixed(1)}\t${st.words}\t${nl}\t${(nl * 100 / st.words).toFixed(1)}\t${r.id}\t${r.workId.replace('work:germany-de:', '')}\t${r.rights}\t${r.genre ?? ''}\t${r.title.slice(0, 40)}`);
}
out.sort((a, b) => Number(b.split('\t')[0]) - Number(a.split('\t')[0]));
console.log('cov3\twords\tnewL\t/100w\ttextId\twork\trights\tgenre\ttitle');
console.log(out.join('\n'));
