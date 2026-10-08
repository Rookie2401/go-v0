/// <reference types="node" />
/**
 * npm run sq:ladder-build
 *
 * Builds the authored parts of the Albanian ladder from their authoring files in data/ladder/sq/authoring/:
 *   a1.txt   stage a1-1 (rewritten 2026-10-08: the 72 forty-word units are 17 scenes of 150-250 words)
 *   b1.txt   stage b1-bridge (new controlled units, 2026-10-08)
 * and writes
 *   - data/ladder/sq/units/<id>.json   one import document (format v2, corpus "ladder-sq") per unit written there
 *   - data/ladder/sq/ladder.json       every unit in stage order, Stage 0 first ("after": "stage0")
 *
 * The authoring files, top to bottom:
 *   # <unit id> | <stage> | <domain> | <story|dialogue|nonfiction> | <title>   starts a unit written in this file
 *   <Albanian sentence> || <English rescue>                             one sentence; a blank line starts a paragraph
 *   @ <corpus id> | <stage> | <domain>                                  places a course text of data/corpus/sq IN PLACE
 *   // …                                                                 a note for the writer; ignored
 *
 * The stages a1-2, a2-1 and a2-2 are NOT authored here: their units are their own files in data/ladder/sq/units/ (drafted
 * from data/ladder/sq/PLAN-A1-2-A2.md), they are kept as they are and sit between the two authored stages.
 *
 * Every unit written here is a machine draft: its `pipeline` block records the drafting tool and nothing else, so no
 * person's review is claimed and nothing can be published from it (docs/LADDER.md). The date of the draft is kept when a
 * unit's text is unchanged, so a rebuild changes nothing it does not have to. Run `npm run ladder:check -- sq` after it.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'data/ladder/sq';
/** Authoring files, each with the stage it writes. */
const SOURCES: Array<{ file: string; stage: string }> = [
  { file: path.join(DIR, 'authoring', 'a1.txt'), stage: 'a1-1' },
  { file: path.join(DIR, 'authoring', 'b1.txt'), stage: 'b1-bridge' },
];
const STAGE_ORDER = ['a1-1', 'a1-2', 'a2-1', 'a2-2', 'b1-bridge'];
const LEVEL: Record<string, string> = { 'a1-1': 'A1', 'a1-2': 'A1', 'a2-1': 'A2', 'a2-2': 'A2', 'b1-bridge': 'B1' };
const TODAY = new Date().toISOString().slice(0, 10);
const TOOL = { kind: 'tool', name: 'Albanian ladder drafting (Claude), scripts/sq-ladder-build.mts' };

type Kind = 'story' | 'dialogue' | 'nonfiction';
interface Written { id: string; stage: string; domain: string; type: Kind; title: string; paragraphs: Array<Array<{ text: string; english: string }>> }
type Entry = { written: Written } | { placed: { corpusId: string; stage: string; domain: string } };

const entries: Entry[] = [];
for (const src of SOURCES) {
  if (!fs.existsSync(src.file)) continue;
  let cur: Written | undefined;
  const lines = fs.readFileSync(src.file, 'utf8').split(/\r?\n/);
  lines.forEach((raw, n) => {
    const line = raw.trim();
    const where = `${src.file}:${n + 1}`;
    if (line.startsWith('//')) return;
    if (line.startsWith('#')) {
      const [id, stage, domain, type, title] = line.slice(1).split('|').map((s) => s.trim());
      if (!id || !stage || !domain || !title || (type !== 'story' && type !== 'dialogue' && type !== 'nonfiction')) throw new Error(`${where}: "# id | stage | domain | story|dialogue|nonfiction | title"`);
      if (stage !== src.stage) throw new Error(`${where}: unit ${id} is stage ${stage}, but this file writes ${src.stage}`);
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
}

fs.mkdirSync(path.join(DIR, 'units'), { recursive: true });
const byStage = new Map<string, Array<Record<string, unknown>>>();
const push = (stage: string, u: Record<string, unknown>): void => { const l = byStage.get(stage) ?? []; l.push(u); byStage.set(stage, l); };
const ids = new Set<string>();
for (const e of entries) {
  if ('placed' in e) {
    const file = `data/corpus/sq/${e.placed.corpusId}.json`;
    if (!fs.existsSync(file)) throw new Error(`no corpus text ${file}`);
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as { title: string };
    const id = `sq-${e.placed.stage}-${e.placed.corpusId}`;
    if (ids.has(id)) throw new Error(`unit ${id} twice`);
    ids.add(id);
    push(e.placed.stage, { id, stage: e.placed.stage, kind: 'controlled', document: `../../corpus/sq/${e.placed.corpusId}.json`, domain: e.placed.domain, title: doc.title });
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
  const bridge = w.stage === 'b1-bridge';
  const doc = {
    schemaVersion: 2, id: w.id, lang: 'sq', title: w.title, contentType: w.type,
    corpus: { id: 'ladder-sq', kind: 'comprehensible-input', title: 'Albanian ladder' },
    source: {
      id: `src:sq:${w.id}`, title: `Albanian ladder, ${w.stage}: ${w.title} (machine-drafted)`,
      author: 'Go course authors (drafted by an AI model)',
      attribution: `Course-authored controlled Standard Albanian for the ${bridge ? 'B1 bridge of the ' : ''}reading ladder. Drafted by an AI model; not reviewed by a native speaker.`,
      provenance: `Drafted by an AI model against the ladder gate (coverage and new words measured by npm run ladder:check) and the word-form checks of npm run sq:check-texts. Not reviewed by a native speaker: it may contain unnatural or incorrect Albanian.${bridge ? ' It is new text written for the bridge, not an adaptation of any library text; the facts it states about places are common knowledge and have not been checked by a person.' : ''} The English lines are the drafter's own.`,
      rights: 'owner-authored', licenseNote: 'Owned by the course authors; machine-drafted, not yet native-reviewed.', authorship: 'generated',
    },
    review: { status: 'unreviewed', notes: `Machine-drafted ladder unit; awaiting a named native reviewer (npm run review:packet).${w.domain === 'church' || w.domain === 'testimony' ? ' Church or testimony content: needs a theological reviewer as well.' : ''}` },
    difficulty: LEVEL[w.stage] ?? 'A1', topics: [w.domain], editorialTags: ['machine-drafted', 'needs-native-review', 'ladder'], prepTargets: [],
    generated: true, english: { source: 'drafted with the text; not reviewed' },
    streams: ['acquisition'], domains: [w.domain], variety: 'sq',
    sections,
    pipeline: { state: 'machine-draft', history: [{ state: 'machine-draft', at: drafted, by: TOOL }] },
  };
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  push(w.stage, { id: w.id, stage: w.stage, kind: 'controlled', document: `units/${w.id}.json`, domain: w.domain, title: w.title });
}

// Stages that are not authored here (a1-2 … a2-2) are kept from the ladder as it stands; stages that are authored here are
// replaced by their authoring file (a unit written earlier and no longer in the file is removed from the ladder and from disk:
// it was a draft of that file, nothing else refers to it).
const authored = new Set(SOURCES.filter((s) => fs.existsSync(s.file)).map((s) => s.stage));
const ladderFile = path.join(DIR, 'ladder.json');
const kept: Array<{ id: string; stage: string }> = fs.existsSync(ladderFile)
  ? (JSON.parse(fs.readFileSync(ladderFile, 'utf8')) as { units: Array<{ id: string; stage: string }> }).units.filter((u) => !authored.has(u.stage))
  : [];
for (const u of kept) push(u.stage, u as unknown as Record<string, unknown>);
for (const f of fs.readdirSync(path.join(DIR, 'units'))) {
  if (!f.endsWith('.json')) continue;
  const id = f.slice(0, -5);
  const stage = STAGE_ORDER.find((s) => id.startsWith(s === 'b1-bridge' ? 'sq-b1-' : `sq-${s}-`));
  if (stage && authored.has(stage) && !ids.has(id)) fs.rmSync(path.join(DIR, 'units', f));
}

const all: Array<Record<string, unknown>> = [];
for (const stage of STAGE_ORDER) all.push(...(byStage.get(stage) ?? []));
fs.writeFileSync(ladderFile, `${JSON.stringify({ lang: 'sq', version: 1, after: 'stage0', units: all }, null, 2)}\n`, 'utf8');
const written = entries.filter((e) => 'written' in e).length;
console.log(`sq:ladder-build - ${all.length} units (${written} written in ${SOURCES.filter((s) => fs.existsSync(s.file)).map((s) => path.basename(s.file)).join(' + ')}, ${entries.length - written} course texts placed in place, ${kept.length} kept from the other stages) -> ${DIR}/ladder.json`);
