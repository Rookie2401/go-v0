// Builds data/ladder/nb/ladder.json and units/*.json from the authoring files in this folder (a1-1/NN.txt, a1-2/NN.txt, a2-1/NN.txt, a2-2/NN.txt, b1-bridge/NN.txt).
// Run from the repository root:  node data/ladder/nb/authoring/build.mjs
// The authoring format is described in README.txt next to this file. The JSON units are the deliverable; this script is
// only how they were produced, kept so that a reviewer's corrections can be made in the text files and rebuilt.
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const root = path.resolve(here, '..');
const AT = '2026-10-07';

// ── names: taken from data/stage0/world.json ("nb" names) when Stage 0 has chosen them, else these defaults ──
const defaults = { ana: 'Anne', luis: 'Lars', marta: 'Marta', nico: 'Nils', sam: 'Sam', city: 'Bergen' };
let names = { ...defaults };
try {
  const world = JSON.parse(fs.readFileSync(path.resolve(root, '../../stage0/world.json'), 'utf8'));
  for (const c of world.characters ?? []) if (c.names?.nb) names[c.id === 'ana' ? 'ana' : c.id] = c.names.nb;
} catch { /* defaults */ }
const fill = (s) => s.replace(/\{(ana|luis|marta|nico|sam|city)\}/g, (_, k) => names[k]);

const STAGES = ['a1-1', 'a1-2', 'a2-1', 'a2-2', 'b1-bridge'];
const LEVEL = { 'a1-1': 'A1', 'a1-2': 'A1', 'a2-1': 'A2', 'a2-2': 'A2', 'b1-bridge': 'B1' };
const units = [];
const ladderUnits = [];

for (const stage of STAGES) {
  const dir = path.join(here, stage);
  if (!fs.existsSync(dir)) continue;
  // one text file per unit (a1-1/01.txt, 02.txt, ...), read in name order
  const lines = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()
    .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r/g, '').split('\n').concat(['']));
  let cur = null;
  const flush = () => { if (cur) units.push(cur); cur = null; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('//')) continue;
    if (line.startsWith('=== ')) {
      flush();
      const [id, kind, domain, title, nbTitle, topics] = line.slice(4).split('|').map((x) => x.trim());
      cur = { stage, id, kind, domain, title, nbTitle, topics: (topics ?? '').split(',').map((x) => x.trim()).filter(Boolean), speakers: {}, note: '', sections: [] };
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('speakers:')) {
      for (const p of line.slice(9).split(',')) { const [k, v] = p.split('=').map((x) => x.trim()); if (k && v) cur.speakers[k] = v; }
      continue;
    }
    if (line.startsWith('note:')) { cur.note = line.slice(5).trim(); continue; }
    if (line.startsWith('## ')) { cur.sections.push({ title: fill(line.slice(3).trim()), paragraphs: [[]] }); continue; }
    if (line.trim() === '') { const s = cur.sections.at(-1); if (s && s.paragraphs.at(-1).length) s.paragraphs.push([]); continue; }
    if (!cur.sections.length) cur.sections.push({ title: fill(cur.nbTitle), paragraphs: [[]] });
    const m = /^(?:\[([a-z0-9]+)\]\s*)?(.+?)\s*\|\|\s*(.+)$/.exec(line);
    if (!m) throw new Error(`${cur.id}: cannot read line: ${line}`);
    const sentence = { text: fill(m[2]), english: fill(m[3]) };
    if (m[1]) sentence.speaker = m[1];
    cur.sections.at(-1).paragraphs.at(-1).push(sentence);
  }
  flush();
}

const SPEAKER_NAMES = { ana: names.ana, luis: names.luis, marta: names.marta, nico: names.nico, sam: names.sam };
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
    speakers[k] = fill(n);
  }
  const doc = {
    schemaVersion: 2,
    id: u.id,
    lang: 'nb',
    title: u.title,
    contentType: u.kind,
    corpus: { id: 'ladder-nb', kind: 'comprehensible-input', title: 'Ladder — Norwegian (Bokmål)' },
    source: {
      id: `src:nb:${u.id}`,
      title: `${u.title} (ladder unit, machine-drafted)`,
      author: 'Go course authors (drafted by an AI model)',
      attribution: 'Course-authored controlled Norwegian (Bokmål). Drafted by an AI model; not yet reviewed by a native speaker.',
      provenance: 'Drafted by an AI model for the course ladder in contemporary Bokmål (2005 norm); not reviewed by a native speaker. It is controlled, deliberately repetitive Norwegian written for learners and may contain unnatural phrasing. Facts about Norway and Bergen are general knowledge and unchecked. The English lines are the drafter\'s own.',
      rights: 'owner-authored',
      licenseNote: 'Owned by the course authors; machine-drafted, not yet native-reviewed.',
      authorship: 'generated',
    },
    review: { status: 'unreviewed', notes: `Machine-drafted by an AI model; awaiting native-speaker review. House style: moderate Bokmål with three genders (ei/-a for feminine nouns, en/-en masculine, et/-et neuter), weak past in -et, neuter definite plural in -ene, sju and tjue, "ble", "ga". ${u.note}`.trim() },
    difficulty: LEVEL[u.stage],
    topics: u.topics,
    editorialTags: ['machine-drafted', 'needs-native-review'],
    prepTargets: [],
    generated: true,
    english: { source: 'drafted with the text; not reviewed' },
    streams: ['acquisition'],
    domains: [u.domain],
    variety: 'nb',
    pipeline: { state: 'machine-draft', history: [{ state: 'machine-draft', at: AT, by: { kind: 'tool', name: 'ladder drafting agent (Claude)' } }] },
    ...(Object.keys(speakers).length ? { speakers } : {}),
    sections,
  };
  // key order like the German units: speakers after pipeline
  fs.writeFileSync(path.join(root, 'units', `${u.id}.json`), JSON.stringify(doc, null, 2) + '\n');
  ladderUnits.push({ id: u.id, stage: u.stage, kind: 'controlled', document: `units/${u.id}.json`, domain: u.domain, title: u.title });
}
fs.writeFileSync(path.join(root, 'ladder.json'), JSON.stringify({ lang: 'nb', version: 1, after: 'stage0', units: ladderUnits }, null, 2) + '\n');
console.log(`${units.length} units, ${words} words; names: ${JSON.stringify(names)}`);
