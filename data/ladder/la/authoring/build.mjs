// Builds data/ladder/la/ladder.json and units/*.json from the authoring files in this folder (a1-1/NN.txt).
// Run from the repository root:  node data/ladder/la/authoring/build.mjs
// Format: see README.txt next to this file. The JSON units are the deliverable; this script is how they were produced,
// kept so that a Latinist's corrections can be made in the text files and rebuilt.
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const root = path.resolve(here, '..');
const AT = '2026-11-13';

// Names are written in the text in the case the sentence needs (Annae, Marcum ...); only the speaker labels come from here.
const SPEAKER_NAMES = { ana: 'Anna', luis: 'Lucius', marta: 'Martha', nico: 'Marcus', sam: 'Samuel' };

const STAGES = ['a1-1'];
const LEVEL = { 'a1-1': 'A1' };
const units = [];
const ladderUnits = [];

for (const stage of STAGES) {
  const dir = path.join(here, stage);
  if (!fs.existsSync(dir)) continue;
  const lines = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()
    .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r/g, '').split('\n').concat(['']));
  let cur = null;
  const flush = () => { if (cur) units.push(cur); cur = null; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('//')) continue;
    if (line.startsWith('=== ')) {
      flush();
      const [id, kind, domain, title, laTitle, topics] = line.slice(4).split('|').map((x) => x.trim());
      cur = { stage, id, kind, domain, title, laTitle, topics: (topics ?? '').split(',').map((x) => x.trim()).filter(Boolean), speakers: {}, note: '', sections: [] };
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('speakers:')) {
      for (const p of line.slice(9).split(',')) { const [k, v] = p.split('=').map((x) => x.trim()); if (k && v) cur.speakers[k] = v; }
      continue;
    }
    if (line.startsWith('note:')) { cur.note = line.slice(5).trim(); continue; }
    if (line.startsWith('## ')) { cur.sections.push({ title: line.slice(3).trim(), paragraphs: [[]] }); continue; }
    if (line.trim() === '') { const s = cur.sections.at(-1); if (s && s.paragraphs.at(-1).length) s.paragraphs.push([]); continue; }
    if (!cur.sections.length) cur.sections.push({ title: cur.laTitle, paragraphs: [[]] });
    const m = /^(?:\[([a-z0-9]+)\]\s*)?(.+?)\s*\|\|\s*(.+)$/.exec(line);
    if (!m) throw new Error(`${cur.id}: cannot read line: ${line}`);
    const sentence = { text: m[2], english: m[3] };
    if (m[1]) sentence.speaker = m[1];
    cur.sections.at(-1).paragraphs.at(-1).push(sentence);
  }
  flush();
}

fs.mkdirSync(path.join(root, 'units'), { recursive: true });
let words = 0;
for (const u of units) {
  const used = new Set();
  const sections = u.sections.map((s) => ({
    title: s.title,
    paragraphs: s.paragraphs.filter((p) => p.length).map((p) => ({ sentences: p })),
  }));
  for (const s of sections) for (const p of s.paragraphs) for (const x of p.sentences) { if (x.speaker) used.add(x.speaker); words += x.text.split(/\s+/).length; }
  const speakers = {};
  for (const k of used) {
    const n = u.speakers[k] ?? SPEAKER_NAMES[k];
    if (!n) throw new Error(`${u.id}: speaker "${k}" has no name (add a speakers: line)`);
    speakers[k] = n;
  }
  const doc = {
    schemaVersion: 2,
    id: u.id,
    lang: 'la',
    title: u.title,
    contentType: u.kind,
    corpus: { id: 'ladder-la', kind: 'comprehensible-input', title: 'Ladder — Latin (Church Latin)' },
    source: {
      id: `src:la:${u.id}`,
      title: `${u.title} (ladder unit, machine-drafted)`,
      author: 'Go course authors (drafted by an AI model)',
      attribution: 'Course-authored controlled Church Latin. Drafted by an AI model; not yet reviewed by a Latinist.',
      provenance: 'Drafted by an AI model for the course ladder in simple Ecclesiastical (Church) Latin; not reviewed by a Latinist. It is controlled, deliberately repetitive Latin written for learners and may contain unidiomatic phrasing. The English lines are the drafter\'s own.',
      rights: 'owner-authored',
      licenseNote: 'Owned by the course authors; machine-drafted, not yet reviewed by a Latinist.',
      authorship: 'generated',
    },
    review: { status: 'unreviewed', notes: `Machine-drafted by an AI model; awaiting review by a Latinist. House style: simple Church Latin, spelled without macrons, with u/v and i/j as in Stage 0 (v and i only); present tense, with a few perfects (venit, vidit, fuit, dixit) in the last units. ${u.note}`.trim() },
    difficulty: LEVEL[u.stage],
    topics: u.topics,
    editorialTags: ['machine-drafted', 'needs-latinist-review'],
    prepTargets: [],
    generated: true,
    english: { source: 'drafted with the text; not reviewed' },
    streams: ['acquisition'],
    domains: [u.domain],
    variety: 'la',
    pipeline: { state: 'machine-draft', history: [{ state: 'machine-draft', at: AT, by: { kind: 'tool', name: 'ladder drafting agent' } }] },
    ...(Object.keys(speakers).length ? { speakers } : {}),
    sections,
  };
  fs.writeFileSync(path.join(root, 'units', `${u.id}.json`), JSON.stringify(doc, null, 2) + '\n');
  ladderUnits.push({ id: u.id, stage: u.stage, kind: 'controlled', document: `units/${u.id}.json`, domain: u.domain, title: u.title });
}
fs.writeFileSync(path.join(root, 'ladder.json'), JSON.stringify({ lang: 'la', version: 1, after: 'stage0', units: ladderUnits }, null, 2) + '\n');
console.log(`${units.length} units, ${words} words`);
