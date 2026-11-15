// node analyse.mjs <file.cpuprofile> [top]  -> self time and inclusive time by function (minified names resolved by url:line:col)
import fs from 'node:fs';
const [file, topS = '30'] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const ch of n.children ?? []) parent.set(ch, n.id);
const dt = new Map();
for (let i = 0; i < p.samples.length; i++) dt.set(p.samples[i], (dt.get(p.samples[i]) ?? 0) + (p.timeDeltas[i + 1] ?? 0));
const key = (n) => { const f = n.callFrame; const u = f.url.split('/').pop(); return `${f.functionName || '(anon)'} ${u}:${f.lineNumber + 1}:${f.columnNumber + 1}`; };
const self = new Map(), incl = new Map();
let total = 0, idle = 0;
for (const [id, t] of dt) {
  const n = byId.get(id); total += t;
  const name = n.callFrame.functionName;
  if (name === '(idle)' || name === '(program)') { idle += t; }
  self.set(key(n), (self.get(key(n)) ?? 0) + t);
  const seen = new Set(); let cur = id;
  while (cur !== undefined) { const k = key(byId.get(cur)); if (!seen.has(k)) { incl.set(k, (incl.get(k) ?? 0) + t); seen.add(k); } cur = parent.get(cur); }
}
const ms = (us) => (us / 1000).toFixed(0).padStart(6);
console.log(`total ${ms(total)} ms, idle/program ${ms(idle)} ms, busy ${ms(total - idle)} ms`);
console.log('--- self');
for (const [k, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, Number(topS))) console.log(ms(t), k);
console.log('--- inclusive');
for (const [k, t] of [...incl].sort((a, b) => b[1] - a[1]).slice(0, Number(topS) * 2)) console.log(ms(t), k);
