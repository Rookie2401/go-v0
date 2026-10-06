/// <reference types="node" />
/**
 * npm run sq:ladder-build
 *
 * Builds the Albanian ladder from its authoring file, data/ladder/sq/authoring/a1.txt:
 *   - data/ladder/sq/units/<id>.json   one import document (format v2, corpus "ladder-sq") per unit written there
 *   - data/ladder/sq/ladder.json       every unit in the order of the file, Stage 0 first ("after": "stage0")
 *
 * The authoring file, top to bottom:
 *   # <unit id> | <stage> | <domain> | <story|dialogue> | <title>      starts a unit written in this file
 *   <Albanian sentence> || <English rescue>                             one sentence; a blank line starts a paragraph
 *   @ <corpus id> | <stage> | <domain>                                  places a course text of data/corpus/sq IN PLACE
 *   // …                                                                 a note for the writer; ignored
 *
 * Every unit written here is a machine draft: its `pipeline` block records the drafting tool and nothing else, so no
 * person's review is claimed and nothing can be published from it (docs/LADDER.md). The date of the draft is kept when a
 * unit's text is unchanged, so a rebuild changes nothing it does not have to. Run `npm run ladder:check -- sq` after it.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'data/ladder/sq';
const SRC = path.join(DIR, 'authoring', 'a1.txt');
const TODAY = new Date().toISOString().slice(0, 10);
const TOOL = { kind: 'tool', name: 'Albanian ladder drafting (Claude), scripts/sq-ladder-build.mts' };

interface Written { id: string; stage: string; domain: string; type: 'story' | 'dialogue'; title: string; paragraphs: Array<Array<{ text: string; english: string }>> }
type Entry = { written: Written } | { placed: { corpusId: string; stage: string; domain: string } };

const entries: Entry[] = [];
let cur: Written | undefined;
const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
lines.forEach((raw, n) => {
  const line = raw.trim();
  const where = `${SRC}:${n + 1}`;
  if (line.startsWith('//')) return;
  if (line.startsWith('#')) {
    const [id, stage, domain, type, title] = line.slice(1).split('|').map((s) => s.trim());
    if (!id || !stage || !domain || !title || (type !== 'story' && type !== 'dialogue')) throw new Error(`${where}: "# id | stage | domain | story|dialogue | title"`);
    cur = { id, stage, domain, type, title, paragraphs: [[]] };
    entries.push({ written: cur });
    return;
  }
  if (line.startsWith('@')) {
    const [corpusId, stage, domain] = line.slice(1).split('|').map((s) => s.trim());
    if (!corpusId || !stage || !domain) throw new Error(`${where}: "@ corpus id | stage | domain"`);
    cur = undefined;
    entries.push({ placed: { corpusId, stage, domain } });
    return;
  }
  if (!line) { if (cur && cur.paragraphs[cur.paragraphs.length - 1].length) cur.paragraphs.push([]); return; }
  if (!cur) throw new Error(`${where}: a sentence outside a unit`);
  const [text, english] = line.split('||').map((s) => s.trim());
  if (!text || !english) throw new Error(`${where}: "Albanian || English"`);
  cur.paragraphs[cur.paragraphs.length - 1].push({ text, english });
});

fs.mkdirSync(path.join(DIR, 'units'), { recursive: true });
const units: Array<Record<string, unknown>> = [];
const ids = new Set<string>();
for (const e of entries) {
  if ('placed' in e) {
    const file = `data/corpus/sq/${e.placed.corpusId}.json`;
    if (!fs.existsSync(file)) throw new Error(`no corpus text ${file}`);
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as { title: string };
    const id = `sq-${e.placed.stage}-${e.placed.corpusId}`;
    if (ids.has(id)) throw new Error(`unit ${id} twice`);
    ids.add(id);
    units.push({ id, stage: e.placed.stage, kind: 'controlled', document: `../../corpus/sq/${e.placed.corpusId}.json`, domain: e.placed.domain, title: doc.title });
    continue;
  }
  const w = e.written;
  if (ids.has(w.id)) throw new Error(`unit ${w.id} twice`);
  ids.add(w.id);
  const paragraphs = w.paragraphs.filter((p) => p.length);
  const file = path.join(DIR, 'units', `${w.id}.json`);
  const sections = [{ title: w.title, paragraphs: paragraphs.map((p) => ({ sentences: p })) }];
  let drafted = TODAY;
  if (fs.existsSync(file)) {
    const old = JSON.parse(fs.readFileSync(file, 'utf8')) as { sections?: unknown; pipeline?: { history?: Array<{ at?: string }> } };
    if (JSON.stringify(old.sections) === JSON.stringify(sections) && old.pipeline?.history?.[0]?.at) drafted = old.pipeline.history[0].at;
  }
  const doc = {
    schemaVersion: 2, id: w.id, lang: 'sq', title: w.title, contentType: w.type,
    corpus: { id: 'ladder-sq', kind: 'comprehensible-input', title: 'Albanian ladder' },
    source: {
      id: `src:sq:${w.id}`, title: `Albanian ladder, ${w.stage}: ${w.title} (machine-drafted)`,
      author: 'Go course authors (drafted by an AI model)',
      attribution: 'Course-authored controlled Standard Albanian for the reading ladder. Drafted by an AI model; not reviewed by a native speaker.',
      provenance: 'Drafted by an AI model against the ladder gate (coverage and new words measured by npm run ladder:check) and the word-form checks of npm run sq:check-texts. Not reviewed by a native speaker: it may contain unnatural or incorrect Albanian. The English lines are the drafter\'s own.',
      rights: 'owner-authored', licenseNote: 'Owned by the course authors; machine-drafted, not yet native-reviewed.', authorship: 'generated',
    },
    review: { status: 'unreviewed', notes: 'Machine-drafted ladder unit; awaiting a named native reviewer (npm run review:packet).' },
    difficulty: 'A1', topics: [w.domain], editorialTags: ['machine-drafted', 'needs-native-review', 'ladder'], prepTargets: [],
    generated: true, english: { source: 'drafted with the text; not reviewed' },
    streams: ['acquisition'], domains: [w.domain], variety: 'sq',
    sections,
    pipeline: { state: 'machine-draft', history: [{ state: 'machine-draft', at: drafted, by: TOOL }] },
  };
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  units.push({ id: w.id, stage: w.stage, kind: 'controlled', document: `units/${w.id}.json`, domain: w.domain, title: w.title });
}

// This file authors a1-1 only. Units of later stages (a1-2 … b1-bridge: their own unit files, drafted from
// data/ladder/sq/PLAN-A1-2-A2.md) are kept: in the ladder, after these, and on disk.
const ladderFile = path.join(DIR, 'ladder.json');
const later: Array<{ id: string; stage: string }> = fs.existsSync(ladderFile)
  ? (JSON.parse(fs.readFileSync(ladderFile, 'utf8')) as { units: Array<{ id: string; stage: string }> }).units.filter((u) => u.stage !== 'a1-1')
  : [];
// a1-1 units written earlier and no longer in the file are removed (they were drafts of this file, nothing else refers to them)
for (const f of fs.readdirSync(path.join(DIR, 'units'))) if (f.endsWith('.json') && f.startsWith('sq-a1-1-') && !ids.has(f.slice(0, -5))) fs.rmSync(path.join(DIR, 'units', f));

fs.writeFileSync(ladderFile, `${JSON.stringify({ lang: 'sq', version: 1, after: 'stage0', units: [...units, ...later] }, null, 2)}\n`, 'utf8');
const written = entries.filter((e) => 'written' in e).length;
console.log(`sq:ladder-build - ${units.length} units (${written} written in ${SRC}, ${units.length - written} course texts placed in place) -> ${DIR}/ladder.json`);
