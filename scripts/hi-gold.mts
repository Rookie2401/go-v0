/// <reference types="node" />
/**
 * npm run hi:gold -- status
 * npm run hi:gold -- accept --by "<reviewer's name>" (--id <id>[,<id>…] | --all) [--date YYYY-MM-DD]
 *
 * The review workflow of the Hindi gold set (scripts/hi-gold-lib.mts explains the two files).
 *   status   counts by state and category, stale items, problems. Exit 1 on a malformed file.
 *   accept   a NAMED REVIEWER takes drafts into the gold set, as they stand in gold-draft.jsonl at that moment — so
 *            the reviewer first corrects a draft there (the sentence, the expected readings, the units) and then
 *            accepts it. Refused without --by, for an unknown id, and for a name that looks like a tool or a model.
 * Nothing here judges Hindi: acceptance is a person's statement, recorded with the name, the date and a hash.
 */
import { DRAFT_FILE, GOLD_FILE, acceptDrafts, readItems, soundGold, writeItems } from './hi-gold-lib.mts';

const args = process.argv.slice(2).filter((a) => a !== '--');
const cmd = args[0];
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const fail = (m: string): never => { console.error(m); process.exit(1); };
const USAGE = 'usage: npm run hi:gold -- status | accept --by "<name>" (--id <id>[,<id>] | --all) [--date YYYY-MM-DD]';

const drafts = readItems(DRAFT_FILE);
const gold = readItems(GOLD_FILE);
const problems = [...drafts.problems, ...gold.problems];

if (cmd === 'status') {
  const { sound, stale } = soundGold(gold.items);
  const cats = new Map<string, { draft: number; gold: number }>();
  const bump = (c: string, k: 'draft' | 'gold') => { const e = cats.get(c) ?? { draft: 0, gold: 0 }; e[k]++; cats.set(c, e); };
  const acceptedIds = new Set(sound.map((i) => i.id));
  const open = drafts.items.filter((i) => !acceptedIds.has(i.id));
  for (const i of open) bump(i.category, 'draft');
  for (const i of sound) bump(i.category, 'gold');
  console.log(`hi:gold - ${sound.length} accepted by a reviewer, ${open.length} draft(s) awaiting review, ${stale.length} stale`);
  for (const [c, n] of [...cats.entries()].sort()) console.log(`  ${c.padEnd(22)} accepted ${String(n.gold).padStart(3)}   drafts ${String(n.draft).padStart(3)}`);
  const reviewers = new Map<string, number>();
  for (const i of sound) reviewers.set(i.acceptedBy!, (reviewers.get(i.acceptedBy!) ?? 0) + 1);
  if (reviewers.size) console.log(`  reviewers: ${[...reviewers.entries()].map(([n, k]) => `${n} (${k})`).join(', ')}`);
  for (const i of stale) console.log(`  STALE ${i.id}: changed after it was accepted, or accepted without a reviewer — not counted`);
  for (const p of problems) console.log(`  PROBLEM ${p}`);
  if (sound.length === 0) console.log('  The gold set is empty: nothing about Hindi analysis has been measured against a native reviewer yet.');
  process.exit(problems.length ? 1 : 0);
}

if (cmd === 'accept') {
  if (problems.length) fail(`fix the files first:\n${problems.join('\n')}`);
  const r = acceptDrafts(drafts.items, gold.items, { by: opt('by'), date: opt('date'), all: args.includes('--all'), ids: (opt('id') ?? '').split(',').map((x) => x.trim()).filter(Boolean) });
  if (!r.ok) { fail(`${r.reason}\n${USAGE}`); throw new Error('unreachable'); }
  writeItems(GOLD_FILE, r.gold);
  console.log(`hi:gold - ${r.accepted.length} item(s) accepted by ${opt('by')!.trim()}; the gold set now holds ${r.gold.length}`);
  process.exit(0);
}

fail(USAGE);
