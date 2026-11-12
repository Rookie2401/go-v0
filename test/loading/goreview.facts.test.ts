// @vitest-environment node
/**
 * The intake's fact fetch (2026-11-11). On a first sign-in the review home screen waited for dictionary shards for EVERY candidate the
 * fact-free first pass would test (about 226 in the browser), though the deck takes `maxNew` of them. This file pins:
 *   (a) the golden: for fixed inputs the ordered intake outcomes (unit, decision, proposed card, every reason) and the planner's selection
 *       are exactly what the unmodified code produced (test/loading/goreview.facts.golden.json, recorded BEFORE any change);
 *   (b) the cost: how many facts / dictionary lookups the fetch makes, against the new-card budget.
 *
 * Re-record the golden (only after a deliberate change of intake behaviour): GOREVIEW_RECORD=1 npx vitest run test/loading/goreview.facts.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { planSession } from '../../packages/goreview/src';
import { fakeScheduler, NOW, prefs } from '../goreview/intake/fixtures';
import { FACTS_NOT_EXAMINED, factsBudgetFor } from '../../packages/goreview/src/intake/fetch';
import { makeCandidates, makeDeckForms, makeRig, project } from './goreview.facts.rig';

const GOLDEN = path.resolve(process.cwd(), 'test/loading/goreview.facts.golden.json');
type Case = { outcomes: ReturnType<typeof project>[]; selection: string[] };
type Golden = Record<string, Case>;

const CASES: Array<{ name: string; n: number; deck: number; maxNew: number }> = [
  { name: 'cands250-deck0-maxNew10', n: 250, deck: 0, maxNew: 10 },
  { name: 'cands250-deck100-maxNew10', n: 250, deck: 100, maxNew: 10 },
  { name: 'cands250-deck0-maxNew3', n: 250, deck: 0, maxNew: 3 },
];

async function runCase(c: { n: number; deck: number; maxNew: number }, extra: Record<string, unknown> = {}) {
  const cands = makeCandidates(c.n);
  const deck = makeDeckForms(c.deck, cands);
  const { out, counts } = await makeRig().run(cands, { maxNew: c.maxNew }, deck, extra);
  const plan = planSession({ deck, intake: out, preferences: prefs({ maxNew: c.maxNew }), audio: { available: true, eligibleForEvidence: true, reason: 'test' },
    scheduler: fakeScheduler, now: NOW, random: () => 0.5 });
  return { out, counts, selection: plan.items.filter((i) => i.isNew).map((i) => i.item.itemId) };
}

describe('intake facts: the golden', () => {
  it('the outcomes and the selection equal the recorded ones, run twice', async () => {
    const got: Golden = {};
    for (const c of CASES) {
      const a = await runCase(c);
      const b = await runCase(c);
      expect(b.out.map(project), `${c.name}: deterministic`).toEqual(a.out.map(project));
      expect(b.selection).toEqual(a.selection);
      got[c.name] = { outcomes: a.out.map(project), selection: a.selection };
    }
    if (process.env.GOREVIEW_RECORD === '1') { fs.writeFileSync(GOLDEN, JSON.stringify(got, null, 1) + '\n'); return; }
    const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as Golden;
    for (const c of CASES) {
      expect(got[c.name]!.selection, `${c.name}: selection`).toEqual(golden[c.name]!.selection);
      expect(got[c.name]!.outcomes, `${c.name}: outcomes`).toEqual(golden[c.name]!.outcomes);
    }
    expect(got['cands250-deck0-maxNew10']!.selection.length).toBeGreaterThan(0);
  }, 120000);
});

describe('intake facts: what the fetch costs', () => {
  const golden = (): Golden => JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as Golden;

  it('today (the engine passes no budget): one facts lookup per testable candidate plus one per existing form card, about one dictionary lookup each', async () => {
    const cands = makeCandidates(250);
    const { counts, out } = await makeRig().run(cands, { maxNew: 10 }, makeDeckForms(100, cands));
    const testable = out.filter((o) => o.proposed || o.decision === 'needs-validation' || o.decision === 'too-uncertain').length;
    expect(counts.factsFor).toBe(counts.candidates + 100);
    expect(counts.gloss).toBeGreaterThan(counts.factsFor * 0.9);
    expect(testable).toBeGreaterThan(0);
  }, 60000);

  it('with a budget the cards chosen are the same: the planner selection and the order of the test-now words equal the golden ones', async () => {
    for (const c of CASES) {
      const r = await runCase(c, { factsBudget: factsBudgetFor(c.maxNew) });
      const g = golden()[c.name]!;
      expect(r.selection, `${c.name}: selection`).toEqual(g.selection);
      expect(r.out.filter((o) => o.decision === 'test-now').map((o) => o.unitId), `${c.name}: test-now`)
        .toEqual(g.outcomes.filter((o) => o.decision === 'test-now').map((o) => o.unitId));
    }
  }, 120000);

  it('a budget the input cannot fill examines everything and changes nothing', async () => {
    const c = CASES[1]!;
    const full = await runCase(c);
    const loose = await runCase(c, { factsBudget: 100000 });
    expect(loose.out.map(project)).toEqual(full.out.map(project));
    expect(loose.counts.factsFor).toBe(full.counts.factsFor);
  }, 60000);

  it('STRUCTURAL: the lookups are bounded by the budget plus a margin, and do not grow when the candidate count doubles', async () => {
    const maxNew = 10;
    const budget = factsBudgetFor(maxNew);
    const margin = 8; // the window of a second round, when some examined candidates fail the with-facts intake
    const seen: number[] = [];
    for (const n of [250, 500]) {
      const { counts, out } = await makeRig().run(makeCandidates(n), { maxNew }, [], { factsBudget: budget });
      expect(counts.factsFor, `n=${n}`).toBeLessThanOrEqual(budget + margin * 2);
      expect(counts.gloss, `n=${n}`).toBeLessThanOrEqual(counts.factsFor);
      // a gloss reads its word's shard and, for an inflected form, the headword's: at most two shard files per facts lookup
      expect(counts.shardFetches, `n=${n}`).toBeLessThanOrEqual(2 * counts.factsFor);
      seen.push(counts.factsFor);
      // the words never examined are marked as such, rank below the examined ones and are not asked now
      const unexamined = out.filter((o) => o.reasons.includes(FACTS_NOT_EXAMINED));
      expect(unexamined.length).toBeGreaterThan(n / 2);
      for (const o of unexamined) { expect(o.decision).toBe('low-priority'); expect(o.proposed).toBeDefined(); }
      expect(out.filter((o) => o.decision === 'test-now').length).toBe(maxNew);
    }
    expect(Math.abs(seen[1]! - seen[0]!)).toBeLessThanOrEqual(margin);
  }, 120000);

  it('STRUCTURAL: the existing form cards still cost one lookup each (the facts of a deck form decide whether a candidate is already covered)', async () => {
    const cands = makeCandidates(250);
    const budget = factsBudgetFor(10);
    const a = await makeRig().run(cands, { maxNew: 10 }, makeDeckForms(0, cands), { factsBudget: budget });
    const b = await makeRig().run(cands, { maxNew: 10 }, makeDeckForms(100, cands), { factsBudget: budget });
    expect(b.counts.factsFor - a.counts.factsFor).toBe(100);
  }, 60000);
});
