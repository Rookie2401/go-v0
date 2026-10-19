/// <reference types="node" />
/**
 * npm run biblia:import -- [--biblia C:/Users/CJWal/dev/biblia-v0]
 *
 * Copies the TEXTS of the Biblia app into packages/biblia/public/data/ — nothing else of it (none of its parsing code, lexica or
 * state): the Tanakh as the Miqra according to the Masorah text aligned with the Open Scriptures morphology (he/<Book>.json), the SBL Greek
 * New Testament with MorphGNT's analysis (el/<Book>.json, Biblia's "gr"), the two SOURCES.json statements, and the canon table
 * (canon.json: book ids, names, sections, verse counts). The per-word morphology columns travel with the text because they are the
 * sources' own readings of those very words; the new Biblia hands them to the GoLearn analysers as gold hints and never decodes them itself.
 *
 * The copy is git-ignored (packages/biblia/public/data/): rebuild with this script. Licences: MAM CC BY-SA 4.0 (via Sefaria), OSHB CC BY 4.0,
 * SBLGNT CC BY 4.0, MorphGNT CC BY-SA 3.0 — restated in packages/biblia/public/data/SOURCES.json.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) { if (!args[i].startsWith('--') || args[i + 1] === undefined) { console.error(`bad argument ${args[i]}`); process.exit(1); } opt[args[i].slice(2)] = args[i + 1]; }
const biblia = opt.biblia ?? 'C:/Users/CJWal/dev/biblia-v0';
const src = path.join(biblia, 'public', 'data');
const canonSrc = path.join(biblia, 'src', 'data', 'canon.json');
if (!fs.existsSync(path.join(src, 'he')) || !fs.existsSync(path.join(src, 'gr')) || !fs.existsSync(canonSrc)) { console.error(`Biblia data not found under ${biblia}`); process.exit(1); }
const out = path.join('packages', 'biblia', 'public', 'data');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'he'), { recursive: true });
fs.mkdirSync(path.join(out, 'el'), { recursive: true });

let bytes = 0; let books = 0;
const copy = (from: string, to: string): void => { fs.copyFileSync(from, to); bytes += fs.statSync(to).size; };
for (const f of fs.readdirSync(path.join(src, 'he'))) { copy(path.join(src, 'he', f), path.join(out, 'he', f)); if (f !== 'SOURCES.json') books++; }
for (const f of fs.readdirSync(path.join(src, 'gr'))) { copy(path.join(src, 'gr', f), path.join(out, 'el', f)); if (f !== 'SOURCES.json') books++; }
// the canon: Biblia's "gr" language code becomes "el" (the Go language id for Greek)
const canon = (JSON.parse(fs.readFileSync(canonSrc, 'utf8')) as Array<{ lang: string }>).map((b) => ({ ...b, lang: b.lang === 'gr' ? 'el' : b.lang }));
fs.writeFileSync(path.join(out, 'canon.json'), JSON.stringify(canon));
const he = JSON.parse(fs.readFileSync(path.join(src, 'he', 'SOURCES.json'), 'utf8'));
const gr = JSON.parse(fs.readFileSync(path.join(src, 'gr', 'SOURCES.json'), 'utf8'));
fs.writeFileSync(path.join(out, 'SOURCES.json'), JSON.stringify({
  copiedFrom: biblia, copiedAt: new Date().toISOString().slice(0, 10),
  he: { text: he.text, morphology: he.morphology, note: 'Tanakh: Miqra according to the Masorah text with the Open Scriptures Hebrew Bible morphology aligned per word by the Biblia app\u2019s build (scripts/build-tanakh.mjs).' },
  el: { text: gr.text, morphology: gr.morphology, note: 'Greek New Testament: the SBL edition with MorphGNT\u2019s analysis per word, as the Biblia app\u2019s build (scripts/build-gnt.mjs) carries them.' },
  parsing: 'None of the Biblia app\u2019s parsing code is used here. The per-word morphology columns are passed to the Go analysers (adapter-he, adapter-el) as the sources\u2019 own readings; the card, the period decision and the Variants tab are GoLearn\u2019s.',
}, null, 2));
console.log(`biblia:import — ${books} books (${canon.length} in the canon), ${(bytes / 1e6).toFixed(1)} MB copied to ${out}`);
