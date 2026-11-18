// For each lexeme decoded under more than one part of speech, list the minority readings (surface, code, ref).
import { ARAMAIC_SEED } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/aramaic/seed';
import { decodeOshb } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/oshb';
const by = new Map<string, Map<string, string[]>>();
for (const r of ARAMAIC_SEED) {
  const id = r.lemmaId.split('/').pop()! + ' ' + r.lemma;
  const d = decodeOshb(r.lemmaId, r.morph);
  const m = by.get(id) ?? new Map(); const a = m.get(d.pos) ?? []; a.push(`${r.surface} ${r.morph} ${r.lemmaId} ${r.reference}`); m.set(d.pos, a); by.set(id, m);
}
const want = new Set((process.argv[2] ?? '').split(',').filter(Boolean));
for (const [id, m] of by) {
  if (m.size < 2 && !want.has(id.split(' ')[0])) continue;
  const sorted = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log(`== ${id}: ` + sorted.map(([p, a]) => `${p}×${a.length}`).join(', '));
  sorted.forEach(([p, a], i) => { if (i > 0 || want.has(id.split(' ')[0])) console.log(`   ${p}: ` + [...new Set(a)].slice(0, 12).join(' | ')); });
}
