// Builds the German ladder from the authoring files in this folder. Run from the repository root:
//   node data/ladder/de/authoring/build.mjs
// - every authoring/<stage>/<unit id>.txt REPLACES the speakers and sections of data/ladder/de/units/<unit id>.json (all other fields of an
//   existing unit are kept); a unit file that does not exist yet is created from the header line (new b1-bridge units);
// - data/ladder/de/ladder.json: the entries of a1-1 ... a2-2 are kept as they are; the b1-bridge entries are rewritten from
//   authoring/bridge-order.json (authentic units: the library text id; controlled units: the file in authoring/b1-bridge/).
// Format of a unit file (see README.txt):
//   === <unit id>  [ | <contentType> | <domain> | <English title> | <German title> | <topics, comma separated> ]   (the | fields only for NEW units)
//   speakers: <id>=<display name>, ...
//   note: <text for review.notes>                       (new units)
//   ## <section title>
//   [speaker] <German sentence> || <English sentence>   (a blank line starts a new paragraph)
import fs from 'node:fs';
import path from 'node:path';

const root = 'data/ladder/de';
const AT = '2026-10-08';
const STAGES = ['a1-1', 'a1-2', 'a2-1', 'a2-2', 'b1-bridge'];
const template = JSON.parse(fs.readFileSync(path.join(root, 'units', 'de-a2-2-17.json'), 'utf8'));
const ladder = JSON.parse(fs.readFileSync(path.join(root, 'ladder.json'), 'utf8'));
const order = JSON.parse(fs.readFileSync(path.join(root, 'authoring', 'bridge-order.json'), 'utf8'));

function parseFile(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n');
  let cur = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('//')) continue;
    if (line.startsWith('=== ')) {
      const [id, kind, domain, title, deTitle, topics] = line.slice(4).split('|').map((x) => x.trim());
      cur = { id, kind, domain, title, deTitle, topics: (topics ?? '').split(',').map((x) => x.trim()).filter(Boolean), speakers: {}, note: '', sections: [] };
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('speakers:')) { for (const p of line.slice(9).split(',')) { const [k, v] = p.split('=').map((x) => x.trim()); if (k && v) cur.speakers[k] = v; } continue; }
    if (line.startsWith('note:')) { cur.note = line.slice(5).trim(); continue; }
    if (line.startsWith('## ')) { cur.sections.push({ title: line.slice(3).trim(), paragraphs: [[]] }); continue; }
    if (line.trim() === '') { const s = cur.sections.at(-1); if (s && s.paragraphs.at(-1).length) s.paragraphs.push([]); continue; }
    if (!cur.sections.length) cur.sections.push({ title: cur.deTitle ?? cur.title, paragraphs: [[]] });
    const m = /^(?:\[([A-Za-z0-9]+)\]\s*)?(.+?) \|\| (.+)$/.exec(line);
    if (!m) throw new Error(`${cur.id}: cannot read line (need " || " and an English line): ${line}`);
    const s = m[1] ? { speaker: m[1], text: m[2], english: m[3] } : { text: m[2], english: m[3] };
    cur.sections.at(-1).paragraphs.at(-1).push(s);
  }
  return cur;
}

const sectionsOf = (u) => u.sections.map((s) => ({ title: s.title, paragraphs: s.paragraphs.filter((p) => p.length).map((p) => ({ sentences: p })) }));

let n = 0, created = 0;
const found = new Map();
for (const stage of STAGES) {
  const dir = path.join(root, 'authoring', stage);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt')).sort()) {
    const u = parseFile(path.join(dir, f));
    found.set(u.id, { u, stage });
    const file = path.join(root, 'units', `${u.id}.json`);
    const sections = sectionsOf(u);
    const used = new Set();
    for (const s of sections) for (const p of s.paragraphs) for (const x of p.sentences) if (x.speaker) used.add(x.speaker);
    const speakers = {};
    for (const k of used) if (!u.speakers[k]) throw new Error(`${u.id}: speaker "${k}" has no name`);
    for (const k of Object.keys(u.speakers)) if (used.has(k)) speakers[k] = u.speakers[k];
    let doc;
    if (fs.existsSync(file)) {
      doc = JSON.parse(fs.readFileSync(file, 'utf8'));
      const out = {};
      for (const [k, v] of Object.entries(doc)) { if (k === 'speakers' || k === 'sections') continue; out[k] = v; }
      if (Object.keys(speakers).length) out.speakers = speakers;
      out.sections = sections;
      doc = out;
    } else {
      if (!u.kind) throw new Error(`${u.id}: a new unit needs the full header line`);
      created++;
      const t = structuredClone(template);
      doc = {
        ...t, id: u.id, title: u.title, contentType: u.kind,
        source: { ...t.source, id: `src:de:${u.id}`, title: `${u.title} (ladder unit, machine-drafted)` },
        review: { status: 'unreviewed', notes: `Machine-drafted by an AI model (ladder drafting agent); awaiting native-speaker review. Standard German (Germany); Sie for Frau Weber, Herr Schmidt, officials, doctors and strangers; du in the team, the Gemeinde and among friends. ${u.note}`.trim() },
        difficulty: 'B1', topics: u.topics, domains: [u.domain],
        pipeline: { state: 'machine-draft', history: [{ state: 'machine-draft', at: AT, by: { kind: 'tool', name: 'ladder drafting agent (Claude)' } }] },
      };
      delete doc.speakers; delete doc.sections;
      if (Object.keys(speakers).length) doc.speakers = speakers;
      doc.sections = sections;
    }
    fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
    n++;
  }
}

// ladder.json: keep a1-1 ... a2-2, rewrite the bridge
const units = ladder.units.filter((u) => u.stage !== 'b1-bridge');
for (const o of order) {
  if (o.kind === 'authentic') units.push({ id: o.id, stage: 'b1-bridge', kind: 'authentic', textId: o.textId, domain: o.domain, title: o.title });
  else {
    const f = found.get(o.id);
    if (!f) throw new Error(`bridge-order lists ${o.id} but authoring/b1-bridge/${o.id}.txt does not exist`);
    units.push({ id: o.id, stage: 'b1-bridge', kind: 'controlled', document: `units/${o.id}.json`, domain: o.domain, title: f.u.title });
  }
}
ladder.units = units;
fs.writeFileSync(path.join(root, 'ladder.json'), JSON.stringify(ladder, null, 2) + '\n');
console.log(`${n} unit files written (${created} new); ladder.json: ${units.length} units`);
