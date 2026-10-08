/// <reference types="node" />
// Authoring tool: how does ONE unit read at its place in the ladder, from the authoring files?
//   npx vite-node data/ladder/de/authoring/draft.mts -- <unit id> [--targets lemma,lemma,...] [--make-baseline]
// Prints: words, coverage (>=3 and >=1 earlier encounters), the baseline coverage of the unit before the recycling pass (baseline.json),
// the unit's NEW lemmas (never met before) with forms and counts (EXTRA = not in the baseline's list), the lemmas that are met before but
// not yet known (1-2 encounters), and for --targets how often each target lemma occurs in the unit.
import fs from 'node:fs';
import path from 'node:path';
import { analyse, authoringOrder, dir, docOf, headDocs } from './lib';

const a = process.argv.slice(2).filter((x) => x !== '--');
const makeBaseline = a.includes('--make-baseline');
const id = a.find((x) => !x.startsWith('--') && !x.includes(','))!;
const tIdx = a.indexOf('--targets');
const targets = tIdx >= 0 ? a[tIdx + 1].split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) : [];
const order = authoringOrder();
const seen = new Map<string, number>();
const addTo = (m: Map<string, number>, lem: Map<string, { count: number }>) => { for (const [l, i] of lem) m.set(l, (m.get(l) ?? 0) + i.count); };
for (const h of headDocs()) addTo(seen, analyse(h).lem);
const basePath = path.join(dir, 'authoring/baseline.json');
if (makeBaseline) {
  const base: Record<string, { words: number; cov3: number; newLemmas: string[] }> = {};
  for (const u of order) {
    const st = analyse(docOf(u));
    let k = st.auto; const fresh: string[] = [];
    for (const [l, i] of st.lem) { if ((seen.get(l) ?? 0) >= 3) k += i.count; if (!seen.has(l)) fresh.push(l); }
    base[u.id] = { words: st.words, cov3: Number((k / st.words).toFixed(4)), newLemmas: fresh };
    addTo(seen, st.lem);
  }
  fs.writeFileSync(basePath, JSON.stringify(base, null, 1));
  console.log('baseline written for', Object.keys(base).length, 'units');
  process.exit(0);
}
const idx = order.findIndex((u) => u.id === id);
if (idx < 0) { console.error(`unit ${id} is not in the ladder order (ladder.json a1-1..a2-2, authoring/bridge-order.json)`); process.exit(2); }
for (let i = 0; i < idx; i++) addTo(seen, analyse(docOf(order[i])).lem);
const st = analyse(docOf(order[idx]));
let k3 = st.auto, k1 = st.auto;
for (const [l, i] of st.lem) { const s = seen.get(l) ?? 0; if (s >= 3) k3 += i.count; if (s >= 1) k1 += i.count; }
const base = fs.existsSync(basePath) ? JSON.parse(fs.readFileSync(basePath, 'utf8'))[id] : undefined;
const cov = k3 / st.words;
const fresh = [...st.lem.entries()].filter(([l]) => !seen.has(l));
console.log(`${id}: ${st.words} words; coverage ${(cov * 100).toFixed(1)} % (>=1 meeting: ${(k1 / st.words * 100).toFixed(1)} %); new lemmas ${fresh.length} (${(fresh.length * 100 / st.words).toFixed(1)} per 100 words)` + (base ? `; baseline coverage ${(base.cov3 * 100).toFixed(1)} % over ${base.words} words, ${base.newLemmas.length} new lemmas` : ''));
const baseNew = new Set<string>(base?.newLemmas ?? []);
const fmt = (l: string, i: { count: number; forms: Record<string, number> }) => `${l}x${i.count}(${Object.keys(i.forms).join('/')})`;
console.log('NEW lemmas' + (base ? ' (EXTRA = not new in the baseline)' : '') + ': ' + fresh.map(([l, i]) => (base && !baseNew.has(l) ? 'EXTRA ' : '') + fmt(l, i)).join('  '));
const part = [...st.lem.entries()].filter(([l]) => seen.has(l) && (seen.get(l) ?? 0) < 3);
console.log(`met 1-2 times before, not yet known (${part.length} lemmas, ${part.reduce((n, [, i]) => n + i.count, 0)} tokens): ` + part.map(([l, i]) => `${fmt(l, i)}[${seen.get(l)}]`).join('  '));
if (targets.length) {
  console.log('TARGETS: ' + targets.map((t) => `${t}=${st.lem.get(t)?.count ?? 0}${st.lem.has(t) ? '(' + Object.keys(st.lem.get(t)!.forms).join('/') + ')' : ''}[before:${seen.get(t) ?? 0}]`).join('  '));
}
const sents = order[idx].sections.flatMap((s) => s.paragraphs.flat());
if (sents.length) console.log(`sentences ${sents.length}, mean ${(st.words / sents.length).toFixed(1)} words`);

// --suggest: what the authentic units that follow (up to the next controlled unit) still miss after this unit, as lemma lists (token counts in the text)
if (a.includes('--suggest')) {
  const s2 = new Map(seen); addTo(s2, st.lem);
  const tIdx2 = a.indexOf('--target-cov'); const tcov = tIdx2 >= 0 ? Number(a[tIdx2 + 1]) : 0.935;
  for (let j = idx + 1; j < order.length && order[j].kind === 'authentic'; j++) {
    const tx = analyse(docOf(order[j]));
    let k = tx.auto; const miss: Array<[string, number, number, string]> = [];
    for (const [l, i] of tx.lem) { const sn = s2.get(l) ?? 0; if (sn >= 3) k += i.count; else miss.push([l, i.count, sn, Object.keys(i.forms).slice(0, 2).join('/')]); }
    miss.sort((x, y) => y[1] - x[1]);
    const need: string[] = []; let kk = k;
    for (const m of miss) { if (kk / tx.words >= tcov) break; kk += m[1]; need.push(`${m[0]}[${m[3]}]x${m[1]}${m[2] ? '(seen' + m[2] + ')' : ''}`); }
    console.log(`SUGGEST for ${order[j].id} (${tx.words}w, now ${(k / tx.words * 100).toFixed(1)} %): to reach ${(tcov * 100).toFixed(1)} % teach ${need.length}: ${need.join('  ')}`);
    addTo(s2, tx.lem);
  }
}

// --plan: the recall slots assigned to this unit in authoring/recall-plan.json; counted in the section(s) titled "Erinnerst du dich..." only
const planPath = path.join(dir, 'authoring/recall-plan.json');
if (fs.existsSync(planPath) && !a.includes('--no-plan')) {
  const planAll = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const slots: Array<{ lemma: string; form: string; from: string }> = planAll[id] ?? [];
  if (slots.length) {
    const u = order[idx];
    const recallSecs = u.sections.filter((s) => s.title.startsWith('Erinnerst du dich'));
    const rdoc = { lang: 'de', id: 'recall', sections: recallSecs.map((s) => ({ title: s.title, paragraphs: s.paragraphs.filter((p) => p.length).map((p) => ({ sentences: p })) })) };
    const rl = recallSecs.length ? analyse(rdoc) : { words: 0, lem: new Map<string, { count: number }>() };
    const want = new Map<string, number>(); for (const s of slots) want.set(s.lemma, (want.get(s.lemma) ?? 0) + 1);
    const missing: string[] = [];
    for (const [l, n] of want) { const have = rl.lem.get(l)?.count ?? 0; if (have < n) missing.push(`${l}(${slots.find((s) => s.lemma === l)!.form}, from ${slots.find((s) => s.lemma === l)!.from}) ${have}/${n}`); }
    console.log(`RECALL SECTION: ${rl.words} words; assigned ${want.size} lemmas, ${missing.length} still MISSING` + (missing.length ? ': ' + missing.join('; ') : ' - all placed'));
    const bc = base ? base.cov3 : 0;
    console.log(`RECALL CHECK: coverage ${(cov * 100).toFixed(1)} % vs baseline ${(bc * 100).toFixed(1)} % -> ${cov + 0.0005 >= bc ? 'OK' : 'LOWER THAN BASELINE'}; extra new lemmas (not new in the baseline): ${fresh.filter(([l]) => base && !baseNew.has(l)).length}`);
  }
}
