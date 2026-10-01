/// <reference types="node" />
/**
 * npm run gold:draft -- <file.json|file.txt> --stratum <stratum> [--n 60] [--seed 1] [--held-out]
 *                       [--title <t>] [--rights <public-domain|licensed|owner-authored|generated|personal-copy>] [--force]
 * Samples sentences from a lawfully supplied text (a v2 corpus document, or plain text with a newline between
 * sentences) and writes the adapter's word segmentation as a DRAFT in the editing format, for a person to correct:
 *   data/private/benchmarks/th/<stratum>/<name>.s<seed>.draft.txt   (git-ignored)
 * Sentences already accepted (or already in a draft) are not sampled again. With --held-out the sampled sentences are
 * marked held out; no sentence text is printed to the screen. Reads only the file you give it; downloads nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { thAdapter } from '../src/adapters/th';
import { COURSE_DIR, loadGoldDir, writeText } from '../src/bench/gold/io-node';
import {
  collectCandidates, makeDraft, sentencesOfDocument, sentencesOfPlainText, sourceMetaOfDocument, type SourceMeta,
} from '../src/bench/gold/draft';
import { fromEditing, toEditing } from '../src/bench/gold/format';
import { COURSE_STRATA, GOLD_RIGHTS, type GoldRights } from '../src/bench/gold/types';
import { adapterSystem } from '../src/bench/words/systems';

const USAGE = `usage: npm run gold:draft -- <file.json|file.txt> --stratum <${COURSE_STRATA.join('|')}> [--n 60] [--seed 1] [--held-out] [--title <t>] [--rights <r>] [--force]`;
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
for (const k of Object.keys(opt)) if (!['stratum', 'n', 'seed', 'title', 'rights'].includes(k)) fail(`unknown option --${k}`);
if (!file) fail('a text file is required');
if (!opt.stratum || !(COURSE_STRATA as readonly string[]).includes(opt.stratum)) fail(`--stratum is required, one of ${COURSE_STRATA.join(', ')}`);
const n = opt.n === undefined ? 60 : Number(opt.n);
const seed = opt.seed === undefined ? 1 : Number(opt.seed);
if (!Number.isInteger(n) || n < 1) fail('--n must be a positive whole number');
if (!Number.isInteger(seed)) fail('--seed must be a whole number');
if (opt.rights !== undefined && !(GOLD_RIGHTS as readonly string[]).includes(opt.rights)) fail(`--rights must be one of ${GOLD_RIGHTS.join(', ')}`);
if (!fs.existsSync(file as string)) fail(`cannot read ${file}`);

try {
  const input = file as string;
  const raw = fs.readFileSync(input, 'utf8').replace(/^﻿/u, '');
  const isJson = input.toLowerCase().endsWith('.json');
  let sentences: string[];
  let source: SourceMeta;
  if (isJson) {
    const doc: unknown = JSON.parse(raw);
    sentences = sentencesOfDocument(doc, thAdapter.segmentSentences);
    const meta = sourceMetaOfDocument(doc);
    if (!meta) throw new Error('the document has no source.title; give --title');
    source = meta;
  } else {
    sentences = sentencesOfPlainText(raw, thAdapter.segmentSentences);
    source = { title: path.basename(input), licence: 'supplied by the course owner; rights not stated (kept private, never committed)', rights: 'personal-copy' };
  }
  if (opt.title) source = { ...source, title: opt.title };
  if (opt.rights) source = { ...source, rights: opt.rights as GoldRights };

  const cands = collectCandidates(sentences);
  // do not sample a sentence twice: skip ids already accepted or already drafted
  const dir = path.join(COURSE_DIR, opt.stratum);
  const exclude = new Set<string>(loadGoldDir(COURSE_DIR).sentences.map((s) => s.id));
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.draft.txt')) for (const e of fromEditing(fs.readFileSync(path.join(dir, f), 'utf8')).entries) exclude.add(e.id);
  }
  const draft = makeDraft(cands.sentences, { stratum: opt.stratum, n, seed, heldOut: flags.has('held-out'), source }, adapterSystem.segment, exclude);
  if (draft.entries.length === 0) throw new Error('no sentences left to sample (all are already in the gold set or in a draft, or the text has none)');

  const base = path.basename(input).replace(/\.[^.]+$/u, '').replace(/[^A-Za-z0-9._-]+/gu, '-').slice(0, 40) || 'text';
  const out = path.join(dir, `${base}.s${seed}${flags.has('held-out') ? '.heldout' : ''}.draft.txt`).replace(/\\/gu, '/');
  if (fs.existsSync(out) && !flags.has('force')) throw new Error(`${out} already exists (a person may be correcting it); pass --force to replace it`);
  writeText(out, toEditing(draft.entries, draft.comments));

  console.log(`gold:draft - ${draft.entries.length} sentences drafted for stratum ${opt.stratum}${flags.has('held-out') ? ' (HELD OUT: not shown)' : ''}`);
  console.log(`  candidates in the text:   ${cands.sentences.length} usable of ${sentences.length}`);
  const sk = cands.skipped;
  console.log(`  skipped:                  not NFC ${sk.notNfc}, forbidden character ${sk.forbiddenCharacter}, no Thai ${sk.noThai}, duplicate ${sk.duplicate}`);
  console.log(`  draft written to:         ${out} (git-ignored)`);
  console.log('  next: correct the "|" boundaries in any text editor, then npm run gold:accept -- <draft> --by "Your Name"');
} catch (e) {
  console.error(`gold:draft failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
