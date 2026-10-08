// Authoring tool: distributes the recycling still missing over the editable (controlled) units of each window.
//   node data/ladder/de/authoring/plan.mjs <inspect.json> <out recall-plan.json> [--units a2-2,a1-2 | --from <unit id> --to <unit id>]
// For every new lemma of a judged unit that is not met 3 times within the next 6 units, it picks (3 - w6) distinct later controlled units
// of the window (spaced, load-balanced) and assigns the lemma there: one token per slot.
import fs from 'node:fs';
const [, , inFile, outFile, ...rest] = process.argv;
const r = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const from = rest.includes('--from') ? rest[rest.indexOf('--from') + 1] : null;
const to = rest.includes('--to') ? rest[rest.indexOf('--to') + 1] : null;
const iFrom = from ? r.findIndex((u) => u.id === from) : 0;
const iTo = to ? r.findIndex((u) => u.id === to) : r.length - 1;
const WIN = 6;
const ONLY = rest.includes('--only') ? new Set(rest[rest.indexOf('--only') + 1].split(',')) : null;
const UNMET = rest.includes('--unmet') ? Number(rest[rest.indexOf('--unmet') + 1]) : 0.2;
const load = new Map();
const plan = {};
const top = (forms) => Object.entries(forms).sort((a, b) => b[1] - a[1])[0][0];
const editable = (u) => u.kind === 'controlled' && u.words > 0;
let slots = 0, unplaceable = 0;
for (let i = iFrom; i <= iTo; i++) {
  const u = r[i];
  if (i + WIN >= r.length) break; // window incomplete: not judged
  if (ONLY && !ONLY.has(u.id)) continue;
  const fail = u.lemmas.filter((l) => l.w6 < 3).sort((a, b) => b.w6 - a.w6 || a.own - b.own);
  // fully fix the cheapest ones until the unmet share is <= UNMET; the rest get one token if they would otherwise be orphans
  const allowed = Math.floor(UNMET * u.lemmas.length);
  const nFull = Math.max(0, fail.length - allowed);
  const items = fail.map((l, ix) => ({ ...l, need: ix < nFull ? 3 - l.w6 : (l.total === 0 ? 1 : 0) })).filter((l) => l.need > 0);
  for (const l of items) {
    const need = l.need;
    const cand = [];
    for (let o = 1; o <= WIN; o++) if (editable(r[i + o])) cand.push(o);
    if (cand.length < need) { unplaceable += need - cand.length; }
    const k = Math.min(need, cand.length);
    // best k-subset: minimise load, prefer spread
    let best = null;
    const rec = (start, chosen) => {
      if (chosen.length === k) {
        let score = 0;
        for (const o of chosen) score += Math.pow(load.get(i + o) ?? 0, 2);
        const sorted = [...chosen].sort((a, b) => a - b);
        let mingap = 9; for (let x = 1; x < sorted.length; x++) mingap = Math.min(mingap, sorted[x] - sorted[x - 1]);
        score -= (k > 1 ? mingap : 0) * 6;
        score += chosen.reduce((s, o) => s + o, 0) * 0.2; // slight preference for earlier
        if (!best || score < best.score) best = { score, chosen: [...chosen] };
        return;
      }
      for (let c = start; c < cand.length; c++) { chosen.push(cand[c]); rec(c + 1, chosen); chosen.pop(); }
    };
    rec(0, []);
    if (!best) continue;
    for (const o of best.chosen) {
      const t = r[i + o];
      load.set(i + o, (load.get(i + o) ?? 0) + 1);
      (plan[t.id] ??= []).push({ lemma: l.lemma, form: top(l.forms), from: u.id, own: l.own, ctx: l.first });
      slots++;
    }
  }
}
fs.writeFileSync(outFile, JSON.stringify(plan, null, 1));
console.log(`${slots} slots over ${Object.keys(plan).length} units; unplaceable (no editable unit in window): ${unplaceable}`);
for (const [id, v] of Object.entries(plan)) console.log(id, v.length);
