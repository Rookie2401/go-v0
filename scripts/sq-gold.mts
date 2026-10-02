/// <reference types="node" />
/**
 * The Albanian gold set: status, drafting, accepting, checking.
 *
 *   npm run sq:gold -- status [--dir <gold dir>]
 *   npm run sq:gold -- draft --in <file with one sentence per line> --category <key> [--out <file.jsonl>]
 *                       [--variety sq] [--source-kind reviewer-written] [--ref <text>] [--licence <text>] [--dir <gold dir>]
 *   npm run sq:gold -- accept --id <id> --by "<name>" [--file <file.jsonl>] [--confirm-unchanged] [--dir <gold dir>]
 *   npm run sq:gold -- check [--dir <gold dir>]
 *
 * The gold lives in data/benchmarks/sq/gold/*.jsonl (format: SCHEMA.md there). There is NO reviewed item yet and none
 * is ever made here: `draft` writes DRAFT items from the adapter's own analysis, which is the machine's opinion and
 * not gold; only a named reviewer's `accept` turns one into evidence, and `check` looks at nothing else.
 *
 * Exit codes: 0 fine (including "no reviewed items yet: nothing is being checked"), 1 on bad arguments, a refused
 * accept, a malformed file, or a regression against reviewed items.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  AcceptRefused, GOLD_CATEGORIES, GOLD_SOURCE_KINDS, GOLD_TARGET_TOTAL, acceptGoldItem, checkAgainstGold, draftGoldItem, goldStatus, isReviewed,
  parseGoldJsonl, toGoldJsonl, validateGoldItem, type GoldCategory, type GoldItem, type GoldSourceKind,
} from '../src/bench/sq/gold';

const USAGE = [
  'usage: npm run sq:gold -- status',
  '       npm run sq:gold -- draft --in <file, one sentence per line> --category <key> [--out <file.jsonl>] [--variety sq] [--source-kind <kind>] [--ref <text>] [--licence <text>]',
  '       npm run sq:gold -- accept --id <id> --by "<name>" [--file <file.jsonl>] [--confirm-unchanged]',
  '       npm run sq:gold -- check',
  `categories: ${GOLD_CATEGORIES.join(', ')}`,
].join('\n');

const args = process.argv.slice(2).filter((a) => a !== '--');
const command = args[0];
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (k: string): boolean => args.includes(`--${k}`);
const die = (message: string): never => { console.error(message); process.exit(1); };

/** The adapter is loaded only by the commands that analyse (draft, check): status and accept stay fast. */
const loadAdapter = async () => (await import('../src/adapters')).createAdapterRegistry().get('sq');

const dir = path.resolve(opt('dir') ?? 'data/benchmarks/sq/gold');

interface Loaded { file: string; items: GoldItem[] }

/** Every .jsonl of the gold directory (plus `extra`), parsed; a malformed line stops the tool. */
function load(extra?: string): Loaded[] {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().map((f) => path.join(dir, f)) : [];
  if (extra && existsSync(extra) && !files.map((f) => path.resolve(f)).includes(path.resolve(extra))) files.push(extra);
  const out: Loaded[] = [];
  const bad: string[] = [];
  for (const file of files) {
    const parsed = parseGoldJsonl(readFileSync(file, 'utf8'));
    for (const p of parsed.problems) bad.push(`${file} line ${p.line}: ${p.message}`);
    out.push({ file, items: parsed.items });
  }
  if (bad.length) die(bad.join('\n'));
  return out;
}

function validateAll(all: Loaded[]): void {
  const lines: string[] = [];
  const ids = new Map<string, string>();
  for (const { file, items } of all) {
    for (const it of items) {
      const problems = validateGoldItem(it);
      if (problems.length) lines.push(`${file}: ${String(it.id)}: ${problems.join('; ')}`);
      if (ids.has(it.id)) lines.push(`${file}: id ${it.id} is also in ${ids.get(it.id)}`);
      else ids.set(it.id, file);
    }
  }
  if (lines.length) die(`the gold files have problems:\n${lines.join('\n')}`);
}

function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

if (command === 'status') {
  const all = load();
  validateAll(all);
  const items = all.flatMap((l) => l.items);
  const s = goldStatus(items);
  console.log(`gold set in ${dir}: ${s.total} item(s) in ${all.length} file(s)`);
  console.log(`  draft ${s.byStatus.draft} (the machine's opinion: not evidence)  native-reviewed ${s.byStatus['native-reviewed']}  approved ${s.byStatus.approved}  rejected ${s.byStatus.rejected}`);
  console.log(`  reviewed (the only items that count): ${s.reviewed} of the target ${GOLD_TARGET_TOTAL}`);
  console.log('');
  console.log('  category              target  reviewed  draft  rejected  also tagged');
  for (const c of s.categories) {
    console.log(`  ${c.category.padEnd(20)} ${String(c.target).padStart(7)} ${String(c.reviewed).padStart(9)} ${String(c.draft).padStart(6)} ${String(c.rejected).padStart(9)} ${String(c.tagged).padStart(12)}`);
  }
  console.log(`  ${'total'.padEnd(20)} ${String(s.targetTotal).padStart(7)} ${String(s.reviewed).padStart(9)}`);
  console.log('');
  console.log('An item counts toward its first category; later categories are tags. Only native-reviewed and approved items count toward a target.');
  if (s.reviewed === 0) console.log('No reviewed item exists yet: the gold set is empty. Drafts are not gold.');
} else if (command === 'draft') {
  const inFile = opt('in');
  const category = opt('category');
  if (!inFile || !category) die(USAGE);
  if (!(GOLD_CATEGORIES as readonly string[]).includes(category!)) die(`unknown category "${category}"\ncategories: ${GOLD_CATEGORIES.join(', ')}`);
  if (!existsSync(inFile!)) die(`${inFile} does not exist`);
  const kind = (opt('source-kind') ?? 'reviewer-written') as GoldSourceKind;
  if (!GOLD_SOURCE_KINDS.includes(kind)) die(`--source-kind must be one of ${GOLD_SOURCE_KINDS.join(', ')}`);
  const source = { kind, ...(opt('ref') ? { ref: opt('ref') } : {}), ...(opt('licence') ? { licence: opt('licence') } : {}) };
  const outFile = path.resolve(opt('out') ?? path.join(dir, `${category}.jsonl`));

  const sentences = readFileSync(inFile!, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (sentences.length === 0) die(`${inFile} has no sentence (one per line; lines starting # are ignored)`);

  const all = load(outFile);
  const seen = new Set(all.flatMap((l) => l.items.map((i) => i.text)));
  const seenIds = new Set(all.flatMap((l) => l.items.map((i) => i.id)));
  const adapter = await loadAdapter();

  const drafts: GoldItem[] = [];
  let skipped = 0;
  for (const s of sentences) {
    const item = draftGoldItem(s, adapter, { category: category as GoldCategory, variety: opt('variety'), source });
    if (seen.has(item.text) || seenIds.has(item.id)) { skipped++; continue; }
    const problems = validateGoldItem(item);
    if (problems.length) die(`cannot draft "${s}": ${problems.join('; ')}`);
    seen.add(item.text);
    seenIds.add(item.id);
    drafts.push(item);
  }
  mkdirSync(path.dirname(outFile), { recursive: true });
  const existing = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
  writeAtomic(outFile, (existing && !existing.endsWith('\n') ? existing + '\n' : existing) + toGoldJsonl(drafts));
  console.log(`${drafts.length} draft item(s) written to ${outFile} (category ${category}, adapter ${adapter.name}@${adapter.version})${skipped ? `; ${skipped} already in the gold files, skipped` : ''}`);
  console.log('These drafts are the MACHINE\'S OPINION, written out for a native reviewer to correct. They are not gold and count for nothing');
  console.log('until a named reviewer has corrected them and run `accept`; `check` ignores them. Correct the lemma, UPOS, features and parts');
  console.log('of each token in the file, then: npm run sq:gold -- accept --id <id> --by "<name>"');
} else if (command === 'accept') {
  const id = opt('id');
  if (!id) die(USAGE);
  const by = opt('by');
  if (!by || !by.trim()) die('accept refuses without --by "<name>": a reviewed item must name its reviewer');
  const file = opt('file') ? path.resolve(opt('file')!) : undefined;
  const all = file ? [{ file, items: parseGoldJsonl(existsSync(file) ? readFileSync(file, 'utf8') : '').items }] : load();
  if (file && !existsSync(file)) die(`${file} does not exist`);
  const hits = all.filter((l) => l.items.some((i) => i.id === id));
  if (hits.length === 0) die(`no item with id ${id}`);
  if (hits.length > 1 || hits[0].items.filter((i) => i.id === id).length > 1) die(`id ${id} occurs more than once; fix the files first`);
  const target = hits[0];
  const item = target.items.find((i) => i.id === id)!;
  let accepted: GoldItem;
  try {
    accepted = acceptGoldItem(item, { by, confirmUnchanged: flag('confirm-unchanged') });
  } catch (err) {
    if (err instanceof AcceptRefused) die(`accept ${id} ${err.message}`);
    throw err;
  }
  writeAtomic(target.file, toGoldJsonl(target.items.map((i) => (i.id === id ? accepted : i))));
  console.log(`${id} is now native-reviewed by ${by!.trim()} (${accepted.review.reviewedAt}) in ${target.file}`);
  console.log('This records that the named person says they checked the analysis; the tool cannot verify that they read Albanian.');
} else if (command === 'check') {
  const all = load();
  const items = all.flatMap((l) => l.items);
  // the adapter is needed only when there is something to check against
  if (!items.some(isReviewed)) {
    console.log(`${items.length} item(s) in ${all.length} file(s); ${items.length} draft or rejected item(s) left out (never evidence)`);
    console.log('no reviewed items yet: nothing is being checked');
    process.exit(0);
  }
  const adapter = await loadAdapter();
  const res = checkAgainstGold(items, adapter);
  console.log(`adapter ${adapter.name}@${adapter.version}; ${items.length} item(s) in ${all.length} file(s); ${res.skipped} draft or rejected item(s) left out (never evidence)`);
  if (res.invalid.length) {
    for (const bad of res.invalid) console.log(`  INVALID reviewed item ${bad.id}: ${bad.problems.join('; ')}`);
    process.exit(1);
  }
  if (res.checked === 0) {
    console.log('no reviewed items yet: nothing is being checked');
    process.exit(0);
  }
  console.log(`${res.checked} reviewed item(s) checked`);
  if (res.regressions.length === 0) {
    console.log(`no regressions in the ${res.checked} reviewed item(s) (this says nothing about sentences that are not in the gold set)`);
  } else {
    console.log(`${res.regressions.length} regression(s):`);
    for (const r of res.regressions) console.log(`  [${r.kind}] ${r.id}${r.token ? ` "${r.token}"` : ''}: expected ${r.expected}; got ${r.got}`);
    process.exit(1);
  }
} else {
  die(USAGE);
}
