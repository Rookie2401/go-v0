/// <reference types="node" />
/**
 * npm run gold:draft -- <file.json|file.txt> --stratum <stratum> [--kind words|units] [--n 60] [--seed 1] [--held-out]
 *                       [--title <t>] [--rights <rights-safe|personal-copy|derived-cc-by-sa>] [--dir <gold dir>] [--force]
 *
 * Samples from a lawfully supplied text (a v2 corpus document, or plain text) and writes the adapter's segmentation as a
 * DRAFT in the editing format, for a person to correct. A draft is never gold: it becomes gold only when a named person
 * accepts it with gold:accept --by.
 *   --kind words (default)  sentences, word boundaries:  <dir>/<stratum>/<name>.s<seed>.draft.txt
 *   --kind units            paragraphs, reading-unit boundaries (formats of src/bench/units/gold.ts):
 *                           <dir>/units/<name>.s<seed>.units-draft.txt  (+ .meta.json beside it)
 * <dir> is data/private/benchmarks/th (git-ignored). Sentences / paragraphs already accepted or already in a draft are not
 * sampled again. With --held-out (words only) the sampled sentences are marked held out; no text is printed to the screen.
 * Reads only the file you give it; downloads nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { thAdapter } from '../src/adapters/th';
import {
  COURSE_DIR, UNITS_SUBDIR, findUnitFiles, loadGoldDir, writeText,
} from '../src/bench/gold/io-node';
import {
  collectCandidates, makeDraft, sentencesOfDocument, sentencesOfPlainText, sourceMetaOfDocument, type SourceMeta,
} from '../src/bench/gold/draft';
import { fromEditing, toEditing } from '../src/bench/gold/format';
import { COURSE_STRATA, GOLD_RIGHTS, type GoldRights } from '../src/bench/gold/types';
import {
  collectParagraphs, makeUnitsDraft, paragraphsOfDocument, paragraphsOfPlainText, type UnitsDraftMeta,
} from '../src/bench/gold/units-tools';
import { parseJsonl } from '../src/bench/units/gold';
import { adapterSystem } from '../src/bench/words/systems';

const USAGE = `usage: npm run gold:draft -- <file.json|file.txt> --stratum <${COURSE_STRATA.join('|')}> [--kind words|units] [--n 60] [--seed 1] [--held-out] [--title <t>] [--rights <${GOLD_RIGHTS.join('|')}>] [--dir <gold dir>] [--force]`;
const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
const flags = new Set<string>();
let file: string | undefined;
for (let i = 0; i < args.length; i++) {
  const k = args[i];
  if (k === '--held-out' || k === '--force') { flags.add(k.slice(2)); continue; }
  if (!k.startsWith('--')) { if (file) fail(`unexpected argument: ${k}`); file = k; continue; }
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) fail(`bad argument: ${k}`);
  opt[k.slice(2)] = v; i++;
}
for (const k of Object.keys(opt)) if (!['stratum', 'n', 'seed', 'title', 'rights', 'kind', 'dir'].includes(k)) fail(`unknown option --${k}`);
if (!file) fail('a text file is required');
if (!opt.stratum || !(COURSE_STRATA as readonly string[]).includes(opt.stratum)) fail(`--stratum is required, one of ${COURSE_STRATA.join(', ')}`);
const kind = opt.kind ?? 'words';
if (kind !== 'words' && kind !== 'units') fail('--kind must be words or units');
if (kind === 'units' && flags.has('held-out')) fail('--held-out applies to word sentences only (reading-unit gold has no held-out flag)');
const n = opt.n === undefined ? 60 : Number(opt.n);
const seed = opt.seed === undefined ? 1 : Number(opt.seed);
if (!Number.isInteger(n) || n < 1) fail('--n must be a positive whole number');
if (!Number.isInteger(seed)) fail('--seed must be a whole number');
if (opt.rights !== undefined && !(GOLD_RIGHTS as readonly string[]).includes(opt.rights)) fail(`--rights must be one of ${GOLD_RIGHTS.join(', ')}`);
if (!fs.existsSync(file as string)) fail(`cannot read ${file}`);
const root = (opt.dir ?? COURSE_DIR).replace(/\\/gu, '/');

try {
  const input = file as string;
  const raw = fs.readFileSync(input, 'utf8').replace(/^﻿/u, '');
  const isJson = input.toLowerCase().endsWith('.json');
  const doc: unknown = isJson ? JSON.parse(raw) : undefined;
  let source: SourceMeta;
  if (isJson) {
    const meta = sourceMetaOfDocument(doc);
    if (!meta) throw new Error('the document has no source.title; give --title');
    source = meta;
  } else {
    source = { title: path.basename(input), licence: 'supplied by the course owner; rights not stated (kept private, never committed)', rights: 'personal-copy' };
  }
  if (opt.title) source = { ...source, title: opt.title };
  if (opt.rights) source = { ...source, rights: opt.rights as GoldRights };
  const base = path.basename(input).replace(/\.[^.]+$/u, '').replace(/[^A-Za-z0-9._-]+/gu, '-').slice(0, 40) || 'text';

  if (kind === 'words') {
    const sentences = isJson ? sentencesOfDocument(doc, thAdapter.segmentSentences) : sentencesOfPlainText(raw, thAdapter.segmentSentences);
    const cands = collectCandidates(sentences);
    // do not sample a sentence twice: skip ids already accepted or already drafted
    const dir = path.join(root, opt.stratum);
    const exclude = new Set<string>(loadGoldDir(root).sentences.map((s) => s.id));
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.draft.txt')) for (const e of fromEditing(fs.readFileSync(path.join(dir, f), 'utf8')).entries) exclude.add(e.id);
    }
    const draft = makeDraft(cands.sentences, { stratum: opt.stratum, n, seed, heldOut: flags.has('held-out'), source }, adapterSystem.segment, exclude);
    if (draft.entries.length === 0) throw new Error('no sentences left to sample (all are already in the gold set or in a draft, or the text has none)');
    const out = path.join(dir, `${base}.s${seed}${flags.has('held-out') ? '.heldout' : ''}.draft.txt`).replace(/\\/gu, '/');
    if (fs.existsSync(out) && !flags.has('force')) throw new Error(`${out} already exists (a person may be correcting it); pass --force to replace it`);
    writeText(out, toEditing(draft.entries, draft.comments));
    console.log(`gold:draft - ${draft.entries.length} sentences drafted for stratum ${opt.stratum}${flags.has('held-out') ? ' (HELD OUT: not shown)' : ''}`);
    console.log(`  candidates in the text:   ${cands.sentences.length} usable of ${sentences.length}`);
    const sk = cands.skipped;
    console.log(`  skipped:                  not NFC ${sk.notNfc}, forbidden character ${sk.forbiddenCharacter}, no Thai ${sk.noThai}, duplicate ${sk.duplicate}`);
    console.log(`  draft written to:         ${out} (git-ignored)`);
    console.log('  next: correct the "|" boundaries in any text editor, then npm run gold:accept -- <draft> --by "Your Name"');
  } else {
    const paragraphs = isJson ? paragraphsOfDocument(doc) : paragraphsOfPlainText(raw);
    const cands = collectParagraphs(paragraphs);
    const dir = path.join(root, UNITS_SUBDIR);
    const exclude = new Set<string>();
    for (const f of findUnitFiles(root)) for (const c of parseJsonl(fs.readFileSync(f, 'utf8'))) exclude.add(c.id);
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.units-draft.txt.meta.json')) continue;
        try { for (const c of (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as UnitsDraftMeta).cases) exclude.add(c.id); } catch { /* unreadable sidecar: skip */ }
      }
    }
    const draft = makeUnitsDraft(cands.paragraphs, { stratum: opt.stratum, n, seed, source }, exclude);
    if (draft.cases.length === 0) throw new Error('no paragraphs left to sample (all are already in the gold set or in a draft, or the text has none)');
    const out = path.join(dir, `${base}.${opt.stratum}.s${seed}.units-draft.txt`).replace(/\\/gu, '/');
    if (fs.existsSync(out) && !flags.has('force')) throw new Error(`${out} already exists (a person may be correcting it); pass --force to replace it`);
    writeText(out, draft.editing);
    writeText(`${out}.meta.json`, JSON.stringify(draft.meta, null, 1) + '\n');
    console.log(`gold:draft - ${draft.cases.length} paragraphs drafted as reading units for stratum ${opt.stratum}`);
    console.log(`  candidates in the text:   ${cands.paragraphs.length} usable of ${paragraphs.length}`);
    const sk = cands.skipped;
    console.log(`  skipped:                  not NFC ${sk.notNfc}, forbidden character ${sk.forbiddenCharacter}, no Thai ${sk.noThai}, duplicate ${sk.duplicate}`);
    console.log(`  draft written to:         ${out} (+ .meta.json beside it; git-ignored)`);
    console.log('  next: one unit per line, blank line between paragraphs; move line breaks only (a space between units is written ␣ at the end of a line),');
    console.log('        then npm run gold:accept -- <draft> --kind units --by "Your Name"');
  }
} catch (e) {
  console.error(`gold:draft failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
