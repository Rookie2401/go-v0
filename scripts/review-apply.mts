/// <reference types="node" />
/**
 * npm run review:apply -- <return.json> [--unit <path to the unit document>] [--date YYYY-MM-DD]
 *
 * Records a reviewer's return (written by `npm run review:packet`, filled in by a person) on the unit it came from:
 *  - the return must be a person's: a name and a competence (native / near-native / professional) are required;
 *  - the corrections replace exactly the sentences they name; every other sentence stays byte-identical;
 *  - the unit's pipeline history gets `in-review` (when it is not there already), then `corrections-pending` (when something
 *    changed) or `reviewed` (when nothing did; a unit with corrections pending goes straight to `reviewed`), with the checklist.
 * A `reviewed` sign-off needs the whole checklist answered and no item left at "problem". A return made from an older wording
 * of the unit is refused: make a fresh packet after corrections, so the reviewer reads what is there now.
 * The unit is found from the return (`unit.path`, from the folder you ran the packet in), or with --unit.
 *
 * Nothing is written when the return is refused or when the result would not validate. Exit codes: 0 recorded; 1 usage error,
 * unreadable file, refusal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { computePublished, validateBatch, type CorpusDocument } from '../src/ingest';
import { applyReturn, isCalendarDate, parseReturn, pipelineSummary } from '../src/ingest/pipeline';
import { printIssues, printPublication, registry } from './corpus-cli.mts';

const USAGE = 'usage: npm run review:apply -- <return.json> [--unit <path to the unit document>] [--date YYYY-MM-DD]';
const fail = (msg: string): never => { console.error(msg); process.exit(1); };

const argv = process.argv.slice(2).filter((a) => a !== '--');
const flags = new Map<string, string>();
const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { positional.push(a); continue; }
  const eq = a.indexOf('=');
  const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
  if (!['unit', 'date'].includes(name)) fail(`unknown option --${name}\n${USAGE}`);
  if (eq > 0) { flags.set(name, a.slice(eq + 1)); continue; }
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value\n${USAGE}`);
  flags.set(name, value);
  i++;
}
if (positional.length !== 1) fail(`expected exactly one return file\n${USAGE}`);
const returnFile = path.resolve(positional[0]);
const date = flags.get('date');
if (date !== undefined && !isCalendarDate(date)) fail(`--date "${date}" is not a date; write YYYY-MM-DD\n${USAGE}`);

const readJson = (file: string, what: string): { raw: string; value: unknown } => {
  let raw = '';
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { return fail(`cannot read ${what} ${file}: ${e instanceof Error ? e.message : String(e)}`); }
  try { return { raw, value: JSON.parse(raw.replace(/^﻿/, '')) as unknown }; } catch (e) { return fail(`${what} ${file}: not valid JSON: ${e instanceof Error ? e.message : String(e)}`); }
};
const refuse = (title: string, refusals: Array<{ code: string; message: string; hint: string }>): never => {
  console.error(title);
  for (const r of refusals) console.error(`  REFUSED ${r.message} [${r.code}]\n        hint: ${r.hint}`);
  return process.exit(1);
};

// ── the return ──
const ret = readJson(returnFile, 'return');
const parsed = parseReturn(ret.value);
if (!parsed.ok) refuse(`review:apply - refused ${returnFile}`, parsed.refusals);
if (!parsed.ok) process.exit(1); // (narrowing for the type checker)
const value = parsed.value;

// ── the unit ──
const unitFile = flags.has('unit')
  ? path.resolve(flags.get('unit')!)
  : [path.resolve(value.unitPath ?? ''), path.resolve(path.dirname(returnFile), value.unitPath ?? '')].find((p) => value.unitPath && fs.existsSync(p));
if (!unitFile) fail(`cannot find the unit: the return names ${value.unitPath ? `"${value.unitPath}", which is not here` : 'no unit.path'}. Run this from the folder you made the packet in, or pass --unit <path>.\n${USAGE}`);
const unit = readJson(unitFile!, 'unit');
const doc = unit.value as CorpusDocument;

const result = applyReturn(doc, value, { segment: (text) => registry.get(doc.lang).segmentSentences(text), ...(date ? { at: date } : {}) });
if (!result.ok) refuse(`review:apply - refused ${returnFile} for ${unitFile}`, result.refusals);
if (!result.ok) process.exit(1); // (narrowing for the type checker)
const { doc: next, changes, entries, previousState, state, warnings } = result;

// the result must still be a valid unit, or nothing is written
const batch = validateBatch([next], { registry });
const errors = batch.documents[0].issues.filter((i) => i.severity === 'error');
if (errors.length) {
  console.error(`review:apply - ${unitFile} would not validate after the review; nothing written`);
  printIssues(errors);
  process.exit(1);
}

const eol = unit.raw.includes('\r\n') ? '\r\n' : '\n';
const serialise = (d: unknown) => JSON.stringify(d, null, 2).replace(/\n/g, eol) + eol;
const reformatted = serialise(doc) !== unit.raw.replace(/^﻿/, '');
fs.writeFileSync(unitFile!, serialise(next), 'utf8');

console.log(`review:apply - ${returnFile}`);
console.log(`  unit ${unitFile}  [${next.id}]`);
console.log(`  reviewer: ${value.reviewer.name} (${value.reviewer.competence}${value.reviewer.variety ? `, ${value.reviewer.variety}` : ''}; ${value.reviewer.role})`);
console.log(`  ${changes.length ? `${changes.length} sentence(s) corrected` : 'no sentence changed'}${changes.length ? '; every other sentence is byte-identical' : ''}`);
for (const c of changes) {
  console.log(`    ${c.n}. ${JSON.stringify(c.before)}\n       -> ${JSON.stringify(c.after)}${c.note ? `   (${c.note})` : ''}`);
  if (c.dropped.length) console.log(`       dropped with the old wording: ${c.dropped.join(', ')}`);
}
console.log(`  history: ${entries.map((e) => e.state).join(' -> ')} (was ${previousState})`);
console.log(`  new state: ${state}`);
if (value.blank.length && !changes.length) console.log(`  checklist left blank: ${value.blank.join(', ')}`);
for (const w of warnings) console.log(`  note: ${w}`);
if (reformatted) console.log('  note: the file was written in the standard 2-space JSON layout (its layout differed); the text of every sentence is unchanged');
console.log(`  pipeline: ${pipelineSummary(next).line}`);
const gate = computePublished(next as unknown as Record<string, unknown>);
printPublication(gate.unpublishedReasons, 0, '  ');
if (state === 'corrections-pending') console.log('next: make a fresh packet of the corrected unit (npm run review:packet) and send it back for confirmation; a return with no corrections moves the unit to reviewed');
else if (state === 'reviewed') console.log('next: the reviewed human recording (npm run audio:packet), then state audio-ready');
