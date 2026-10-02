/**
 * The German linguistic gold sets, run against the real adapter. Evaluator: src/bench/de/gold.ts (the same one
 * `npx vite-node scripts/de-gold.mts` reports with).
 *
 *   round 1  data/benchmarks/de/gold.json    written before the adapter existed; development data since
 *   round 2  data/benchmarks/de/gold-2.json  written after the adapter landed, first run unseen (25 of 35); development data since
 *   round 3… data/benchmarks/de/gold-N.json  each first run unseen and recorded in docs/german/STATUS.md
 *
 * WHAT A GREEN RUN MEANS, AND WHAT IT DOES NOT. A sentence is CORRECT when every expectation on it holds. A sentence
 * the adapter is known not to get right is listed in data/benchmarks/de/known-limits.json with its reason and the exact
 * expectations that fail. For such a sentence the test passes only while it fails EXACTLY as recorded:
 *   - a failure that is not recorded      → the test fails (a regression inside a sentence that was already failing)
 *   - a recorded failure that has gone    → the test fails (update the record, so the list cannot go stale)
 *   - no failure at all                   → the test fails (remove the entry)
 * So a green run says "nothing changed against the record", NOT "all sentences are correct". The correctness score is
 * the number of correct sentences; the summary test prints it per round, apart from the number of known limits.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { compareWithLimit, evaluateRound, failuresOf, roundLine, type GoldFile, type KnownLimits } from '../../src/bench/de/gold';

const DIR = 'data/benchmarks/de';
const LIMITS_FILE = `${DIR}/known-limits.json`;
const files = fs.readdirSync(DIR).filter((f) => /^gold(-\d+)?\.json$/.test(f)).sort((a, b) => a.length - b.length || a.localeCompare(b));
const rounds = files.map((file, i) => ({ name: `Round ${i + 1} (${file})`, file, gold: JSON.parse(fs.readFileSync(`${DIR}/${file}`, 'utf8')) as GoldFile }));
const all = rounds.flatMap((r) => r.gold.sentences);
const limits: KnownLimits = fs.existsSync(LIMITS_FILE) ? JSON.parse(fs.readFileSync(LIMITS_FILE, 'utf8')) : {};

const de = createAdapterRegistry().get('de');

describe('German gold sets', () => {
  it('are well formed: unique ids, a category and a text each; every known limit names a sentence, a reason and its failing expectations', () => {
    const ids = all.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of all) { expect(s.category, s.id).toBeTruthy(); expect(s.text, s.id).toBeTruthy(); }
    for (const [id, limit] of Object.entries(limits)) {
      expect(ids, `known limit ${id}`).toContain(id);
      expect(limit.reason?.trim(), `known limit ${id} needs its reason`).toBeTruthy();
      expect(limit.expected?.length ?? 0, `known limit ${id} must list the expectations that fail`).toBeGreaterThan(0);
    }
    expect(rounds[0].gold.sentences.length).toBeGreaterThanOrEqual(80);
  });

  it.each(all.map((s) => [s.id, s.text, s] as const))('%s — %s', (_id, _text, s) => {
    const failures = failuresOf(de, s);
    const limit = limits[s.id];
    if (!limit) {
      expect(failures.map((f) => f.detail), s.note ?? s.disputed ?? '').toEqual([]);
      return;
    }
    expect(failures.length, `${s.id} is recorded as a known limit ("${limit.reason}") but is now correct: remove it from ${LIMITS_FILE}`).toBeGreaterThan(0);
    const { appeared, resolved } = compareWithLimit(failures, limit);
    expect(appeared, `${s.id}: failures that the known limit does not record — a regression inside a sentence that was already failing`).toEqual([]);
    expect(resolved, `${s.id}: recorded failures that no longer occur — update "expected" in ${LIMITS_FILE}`).toEqual([]);
  });

  it('correctness per round (printed for the status document): correct sentences are counted apart from known limits', () => {
    for (const r of rounds) {
      const result = evaluateRound(de, r.name, r.gold.sentences, limits);
      console.info(roundLine(result));
      // the score is what is correct; a known limit is never counted as correct
      expect(result.correct + result.knownLimits + result.regressions).toBe(result.total);
      expect(result.correct).toBe(result.results.filter((x) => x.failures.length === 0).length);
      expect(result.regressions, `${r.name}: failing sentences that are not recorded as known limits`).toBe(0);
    }
  });
});

describe('the known-limit record cannot hide a change', () => {
  const limit = { reason: 'example', expected: ['Der: Case=Nom', '+passive-perfect'] };
  const f = (key: string) => ({ key, detail: key });

  it('the same failures: nothing appeared, nothing resolved', () => {
    expect(compareWithLimit([f('Der: Case=Nom'), f('+passive-perfect')], limit)).toEqual({ still: ['Der: Case=Nom', '+passive-perfect'], appeared: [], resolved: [] });
  });
  it('a further failure on the same sentence is visible', () => {
    expect(compareWithLimit([f('Der: Case=Nom'), f('+passive-perfect'), f('liest: Person=3')], limit).appeared).toEqual(['liest: Person=3']);
  });
  it('a failure that went away is visible, also when another took its place', () => {
    const c = compareWithLimit([f('Der: Case=Nom'), f('-modal-particle')], limit);
    expect(c.resolved).toEqual(['+passive-perfect']);
    expect(c.appeared).toEqual(['-modal-particle']);
  });
  it('a round reports correct, known-limit and unrecorded sentences apart', () => {
    const sentences = [
      { id: 'a', category: 'x', text: 'Ich gehe ins Haus.', tokens: [{ form: 'Haus', lemma: 'Haus' }] },
      { id: 'b', category: 'x', text: 'Ich gehe ins Haus.', tokens: [{ form: 'Haus', lemma: 'Garten' }] },
      { id: 'c', category: 'y', text: 'Ich gehe ins Haus.', tokens: [{ form: 'Haus', lemma: 'Garten' }] },
    ];
    const r = evaluateRound(de, 'example', sentences, { b: { reason: 'deliberately wrong expectation', expected: ['Haus: lemma'] } });
    expect([r.total, r.correct, r.knownLimits, r.regressions]).toEqual([3, 1, 1, 1]);
    expect(r.results.map((x) => x.standing)).toEqual(['correct', 'known-limit', 'regression']);
    expect(roundLine(r)).toContain('1 of 3 sentences correct (33.3 %); 1 recorded as known limits, 1 unrecorded failures');
  });
});
