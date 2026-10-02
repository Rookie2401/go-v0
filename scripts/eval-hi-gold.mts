/// <reference types="node" />
/**
 * npm run hi:eval-gold [-- --include-drafts] [--show N] [--category <name>]
 *
 * Run the Hindi adapter over the gold set and say, per category, how many items it reads as the reviewer says.
 * By default only items a named reviewer accepted are used (data/benchmarks/hi/gold.jsonl). While that file is empty
 * the command says so and measures nothing. `--include-drafts` also runs the model-drafted items of gold-draft.jsonl:
 * useful for finding defects, and labelled on every line as NOT a measurement — a draft's expectation may itself be wrong.
 *
 * An item passes when every statement it makes holds for the adapter's FIRST reading: lemma, part of speech, the
 * listed features, the parts of a fused word, the register layer; every listed multiword unit is found and no
 * forbidden one; every listed construction is found; the sentence count. A statement about how a word is said passes
 * when the engine says exactly that with confidence, and counts as "left open" (neither passed nor failed) when the
 * engine marks the word uncertain. Each failure is printed with the harm the item names: what a learner would be told.
 */
import { DRAFT_FILE, GOLD_FILE, readItems, soundGold, type GoldItem } from './hi-gold-lib.mts';
import { hi, judge } from './hi-gold-judge.mts';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const includeDrafts = args.includes('--include-drafts');
const show = Number(opt('show') ?? 20);
const only = opt('category');

const gold = readItems(GOLD_FILE);
const drafts = readItems(DRAFT_FILE);
for (const p of [...gold.problems, ...drafts.problems]) console.error(`PROBLEM ${p}`);
if (gold.problems.length || drafts.problems.length) process.exit(1);
const { sound, stale } = soundGold(gold.items);
const acceptedIds = new Set(sound.map((i) => i.id));
const openDrafts = drafts.items.filter((d) => !acceptedIds.has(d.id));

const report = (title: string, items: GoldItem[], note: string) => {
  const list = only ? items.filter((i) => i.category === only) : items;
  const cats = new Map<string, { n: number; pass: number; fail: number; open: number }>();
  const failed: Array<{ item: GoldItem; failures: string[] }> = [];
  for (const item of list) {
    const o = judge(item);
    const c = cats.get(item.category) ?? { n: 0, pass: 0, fail: 0, open: 0 };
    c.n++; c[o.verdict]++;
    cats.set(item.category, c);
    if (o.verdict === 'fail') failed.push({ item, failures: o.failures });
  }
  const total = [...cats.values()].reduce((a, c) => ({ n: a.n + c.n, pass: a.pass + c.pass, fail: a.fail + c.fail, open: a.open + c.open }), { n: 0, pass: 0, fail: 0, open: 0 });
  console.log(`hi:eval-gold - ${title}: ${total.n} item(s), ${total.pass} as expected, ${total.fail} not, ${total.open} left open (the engine says "uncertain")${note} — adapter ${hi.version}`);
  for (const [c, v] of [...cats.entries()].sort()) console.log(`  ${c.padEnd(22)} ${String(v.pass).padStart(3)} / ${String(v.n).padStart(3)}${v.open ? `  (${v.open} left open)` : ''}`);
  for (const f of failed.slice(0, show)) {
    console.log(`  ✗ [${f.item.category}] ${f.item.id}: ${f.item.sentence}`);
    for (const x of f.failures) console.log(`      ${x}`);
    console.log(`      harm: ${f.item.harm}`);
  }
  if (failed.length > show) console.log(`  … and ${failed.length - show} more (use --show N)`);
};

if (sound.length === 0) console.log('hi:eval-gold - the gold set is empty: no item has been accepted by a native reviewer, so nothing is measured.');
else report('GOLD (accepted by a reviewer)', sound, '');
if (stale.length) console.log(`  ${stale.length} stale item(s) not counted (npm run hi:gold -- status)`);
if (includeDrafts) report('DRAFTS — NOT A MEASUREMENT', openDrafts, '; the expectations are a model\'s and may themselves be wrong');
else if (openDrafts.length) console.log(`  ${openDrafts.length} model-drafted item(s) await review (run with --include-drafts to see how the adapter reads them; that is defect-finding, not measurement).`);
