// Builds the Hindi ladder's b1-bridge unit documents and applies the recycling paragraphs (2026-10-08).
//   node data/ladder/hi/authoring/build.mjs     builds every authoring/units/*.txt into units/<id>.json, then applies authoring/recalls.txt
// Authoring unit file (authoring/units/<id>.txt):
//   id: hi-b1-02   title: ...   domain: narrative   topics: a, b, c   notes: ...      (header lines, one per key)
//   ---
//   ## Section title
//   Hindi sentence || English sentence             (one sentence per line; a blank line starts a new paragraph in the same section)
// Recall file (authoring/recalls.txt): blocks "=== <unit id>", then optionally "## <section title>" lines (each starts a new section;
// without one the lines become a new paragraph at the end of the unit's last section), then "Hindi || English" lines.
// recalls-applied.json remembers what an earlier run added, so editing a block and running again replaces it.
// Every document is written the way the existing units are (JSON.stringify, two spaces, final newline).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ladderDir = path.resolve(here, '..');
const unitsDir = path.join(ladderDir, 'units');
const DATE = '2026-10-08';
const BOM = String.fromCharCode(0xfeff);
const readText = (f) => fs.readFileSync(f, 'utf8').split(BOM).join('').split('\r\n').join('\n').split('\n');

function parseSentences(lines) {
  // returns sections [{title, paragraphs:[{sentences:[{text, english}]}]}]
  const sections = [];
  let cur = null;
  let para = null;
  const flushPara = () => {
    if (para && para.sentences.length) {
      if (!cur) { cur = { title: '', paragraphs: [] }; sections.push(cur); }
      cur.paragraphs.push(para);
    }
    para = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); continue; }
    if (line.startsWith('## ')) { flushPara(); cur = { title: line.slice(3).trim(), paragraphs: [] }; sections.push(cur); continue; }
    const bar = line.indexOf(' || ');
    if (bar < 0) throw new Error(`no " || " in line: ${line}`);
    if (!para) para = { sentences: [] };
    para.sentences.push({ text: line.slice(0, bar).trim().normalize('NFC'), english: line.slice(bar + 4).trim() });
  }
  flushPara();
  return sections;
}

function buildUnit(file) {
  const text = readText(file);
  const cut = text.indexOf('---');
  if (cut < 0) throw new Error(`${file}: no --- line`);
  const head = {};
  for (const l of text.slice(0, cut)) {
    const m = /^(\w+):\s*(.*)$/u.exec(l);
    if (m) head[m[1]] = m[2].trim();
  }
  const sections = parseSentences(text.slice(cut + 1));
  const id = head.id;
  if (!id || !id.startsWith('hi-b1-')) throw new Error(`${file}: only hi-b1-* units are built here`);
  const domain = head.domain || 'narrative';
  const topics = (head.topics || domain).split(',').map((s) => s.trim()).filter(Boolean);
  const doc = {
    schemaVersion: 2,
    id,
    lang: 'hi',
    title: head.title,
    contentType: head.contentType || 'story',
    corpus: { id: 'ladder-hi', kind: 'comprehensible-input', title: 'Ladder — Hindi' },
    source: {
      id: `src:hi:${id}`,
      title: `"${head.title}" (ladder unit, machine-drafted)`,
      author: 'Go course authors (drafted by an AI model)',
      attribution: 'Course-authored controlled Hindi for the B1 bridge. Drafted by an AI model; not yet reviewed by a native speaker.',
      provenance: "Drafted by an AI model for the course ladder; not reviewed by a native speaker. It is controlled Hindi written for learners (everyday modern Hindi, the ladder's characters) and may contain unnatural phrasing. The English lines are the drafter's own.",
      rights: 'owner-authored',
      licenseNote: 'Owned by the course authors; machine-drafted, not yet native-reviewed.',
      authorship: 'generated',
    },
    review: { status: 'unreviewed', notes: head.notes || '' },
    difficulty: 'B1',
    topics,
    editorialTags: ['machine-drafted', 'needs-native-review'],
    prepTargets: [],
    generated: true,
    english: { source: 'drafted with the text; not reviewed' },
    streams: ['acquisition'],
    domains: [domain],
    pipeline: { state: 'machine-draft', history: [{ state: 'machine-draft', at: DATE, by: { kind: 'tool', name: 'ladder drafting agent' } }] },
    sections,
  };
  if (head.adapted) {
    // an adapted unit (a library work retold): the source block carries the work's attribution and its share-alike term
    const a = ADAPTED_SOURCES[head.adapted];
    if (!a) throw new Error(`${file}: unknown adapted source ${head.adapted}`);
    doc.source = {
      id: `src:hi:${id}`,
      title: `"${head.title}" (ladder unit, adapted and machine-drafted)`,
      author: `Go course authors (drafted by an AI model), after ${a.author}`,
      edition: a.edition,
      url: a.url,
      attribution: a.attribution,
      provenance: a.provenance,
      rights: 'licensed',
      licenseNote: a.licenseNote,
      licence: 'CC BY-SA 4.0, adapted (share-alike)',
      authorship: 'generated',
    };
    doc.editorialTags = ['machine-drafted', 'needs-native-review', 'adapted-literature'];
  }
  fs.writeFileSync(path.join(unitsDir, `${id}.json`), JSON.stringify(doc, null, 2) + '\n');
  return id;
}

// Rights text of the library works that an adapted unit retells (copied from data/sources/course-library/hi.json; nothing is marked verified here).
const ADAPTED_SOURCES = {
  'bharatendu-andher-nagari': {
    author: 'भारतेंदु हरिश्चंद्र',
    edition: 'भारतेंदु-नाटकावली, first edition VS 1992 / 1935 (Hindi Wikisource, parent revision 517232)',
    url: 'https://hi.wikisource.org/wiki/भारतेंदु-नाटकावली',
    attribution: 'Adapted from "अंधेर नगरी" by भारतेंदु हरिश्चंद्र (1881), Hindi Wikisource transcription of भारतेंदु-नाटकावली (https://hi.wikisource.org/wiki/भारतेंदु-नाटकावली, parent revision 517232 and six act-page revisions), CC BY-SA 4.0. This is a short retelling written for the course ladder; it is an adaptation, not the original text. Adapted and machine-drafted; not reviewed by a native speaker. Share-alike: CC BY-SA 4.0.',
    provenance: 'Retold for learners in the vocabulary of the Hindi ladder from the library play text:hi:bharatendu-andher-nagari (the first plot of the play: the market where everything costs one taka a ser, the wall that fell, the king who hangs himself). The retelling is machine-drafted by an AI model, in plain narrative sentences instead of verse and dialogue, and leaves out the songs and most of the minor characters; not reviewed by a native speaker. The English lines are the drafter\'s own.',
    licenseNote: 'CC BY-SA 4.0, adapted (share-alike). The underlying 1881 play is recorded in the library as public domain in India and the United States (canModify true); the Wikisource transcription is under CC BY-SA 4.0, so this adaptation carries the attribution and the share-alike term. Changes: simplified and shortened retelling in prose, new sentences. Machine-drafted, not yet native-reviewed.',
  },
};

function applyRecalls(file) {
  const blocks = [];
  let cur = null;
  for (const l of readText(file)) {
    if (l.startsWith('=== ')) { cur = { id: l.slice(4).trim(), lines: [] }; blocks.push(cur); }
    else if (cur && !l.startsWith('//')) cur.lines.push(l);
  }
  const manifestFile = path.join(here, 'recalls-applied.json');
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
  const applied = [];
  for (const b of blocks) {
    const f = path.join(unitsDir, `${b.id}.json`);
    if (!fs.existsSync(f)) { console.log(`recall: ${b.id}: no such unit file, skipped`); continue; }
    const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
    const old = new Set(manifest[b.id] || []);
    if (old.size) {
      for (const sec of doc.sections) for (const p of sec.paragraphs) p.sentences = (p.sentences || []).filter((x) => !old.has(x.text));
      for (const sec of doc.sections) sec.paragraphs = sec.paragraphs.filter((p) => (p.sentences || []).length);
      doc.sections = doc.sections.filter((sec) => sec.paragraphs.length);
    }
    const parts = [];
    let part = null;
    for (const l of b.lines) {
      if (l.startsWith('## ')) { part = { title: l.slice(3).trim(), lines: [] }; parts.push(part); }
      else { if (!part) { part = { title: null, lines: [] }; parts.push(part); } part.lines.push(l); }
    }
    const added = [];
    for (const p of parts) {
      const secs = parseSentences(p.title ? [`## ${p.title}`, ...p.lines] : p.lines);
      if (!secs.length) continue;
      if (p.title) doc.sections.push(...secs);
      else doc.sections[doc.sections.length - 1].paragraphs.push(...secs.flatMap((s) => s.paragraphs));
      for (const sec of secs) for (const q of sec.paragraphs) for (const x of q.sentences) added.push(x.text);
    }
    manifest[b.id] = added;
    const mark = `${DATE}: recycling paragraph(s) added by the Hindi content package`;
    if (!doc.review.notes.includes(mark)) doc.review.notes += ` ${mark} so that this unit brings back the new words of earlier units (they are recall sentences, not new vocabulary).`;
    fs.writeFileSync(f, JSON.stringify(doc, null, 2) + '\n');
    applied.push(b.id);
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return applied;
}

// The b1-bridge entries of ladder.json come from authoring/bridge.json (an ordered list of {id, kind, textId?, domain, title?}); the other units stay as they are.
function syncLadder() {
  const bf = path.join(here, 'bridge.json');
  if (!fs.existsSync(bf)) return;
  const bridge = JSON.parse(fs.readFileSync(bf, 'utf8'));
  const lf = path.join(ladderDir, 'ladder.json');
  const ladder = JSON.parse(fs.readFileSync(lf, 'utf8'));
  const keep = ladder.units.filter((u) => u.stage !== 'b1-bridge');
  const b = bridge.map((e) => {
    const u = { id: e.id, stage: 'b1-bridge', kind: e.kind };
    if (e.kind === 'authentic') u.textId = e.textId;
    else u.document = `units/${e.id}.json`;
    u.domain = e.domain;
    if (e.title) u.title = e.title;
    return u;
  });
  ladder.units = [...keep, ...b];
  fs.writeFileSync(lf, JSON.stringify(ladder, null, 2) + '\n');
  console.log(`ladder.json: ${keep.length} earlier units + ${b.length} b1-bridge units`);
}

const udir = path.join(here, 'units');
const built = fs.existsSync(udir) ? fs.readdirSync(udir).filter((n) => n.endsWith('.txt')).sort().map((n) => buildUnit(path.join(udir, n))) : [];
console.log(`built ${built.length} unit(s): ${built.join(' ')}`);
const rf = path.join(here, 'recalls.txt');
if (fs.existsSync(rf)) console.log(`recalls applied to: ${applyRecalls(rf).join(' ') || '(none)'}`);
syncLadder();
