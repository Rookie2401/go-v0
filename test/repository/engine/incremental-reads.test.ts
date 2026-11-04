// @vitest-environment node
/**
 * A new event folds only what it touches (the readiness audit of 2026-11-03, D2: each batch re-read the learner's whole log, 4 s at 100,000 events on one
 * process, stalling every other learner), and gives exactly what a rebuild gives. The rows are compared with a rebuild after every batch of a generated
 * history that has what makes the shortcut dangerous: words seen under an old id, reviews with chains and several items, retractions, deleted ranges.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { GoEvent, UnitKnowledge } from '../../../packages/repository-contract/src';
import { createProjectionEngine } from '../../../packages/repository-engine/src';
import { createMemoryStore, openSqliteStore } from '../../../packages/repository-store/src';

const L = 'learner-1';
const T0 = Date.parse('2026-06-01T08:00:00.000Z');
const at = (n: number): string => new Date(T0 + n * 60_000).toISOString();
const base = (id: string, n: number, kind: string, itemIds: string[], payload: Record<string, unknown>, extra: Partial<GoEvent> = {}): GoEvent => ({
  id, v: 3, learnerId: L, enrolmentId: 'E', languageId: 'sq', at: at(n), producer: { app: 'golearn-ext', version: '1', deviceId: 'D' }, kind, subject: { itemIds }, payload, evidence: { quality: 'moderate', sourceReliability: 1 }, ...extra,
} as GoEvent);
const lookup = (id: string, n: number, unit: string): GoEvent =>
  base(id, n, 'SelectionLookedUp', [unit], { surface: 'x', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] });
const review = (id: string, n: number, items: string[], card: string, rating: number, previous: string | null | undefined): GoEvent =>
  base(id, n, 'CardReviewed', items, {
    cardKind: 'recognition', family: 'written-recognition', assessmentDimension: 'written-recognition', rating, grade: rating === 1 ? 'again' : 'good', correct: rating > 1,
    outcome: rating > 1 ? 'correct' : 'incorrect', responseMode: 'typed', hinted: false, retrievalAttempted: true, ...(previous === undefined ? {} : { expectedPreviousReviewId: previous }),
  }, { subject: { itemIds: items, cardId: card } });

function pseudo(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const tmp = mkdtempSync(join(tmpdir(), 'incremental-'));
afterAll(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* locked on Windows */ } });
const stores = {
  memory: () => createMemoryStore({ now: () => at(100_000) }),
  sqlite: (name: string) => openSqliteStore(join(tmp, `${name}.sqlite`)),
};
const clean = (rows: UnitKnowledge[]): string => JSON.stringify([...rows].sort((a, b) => (a.unitId < b.unitId ? -1 : 1)));

describe.each(['memory', 'sqlite'] as const)('an incremental fold equals a rebuild (%s store)', (kind) => {
  it.each([1, 2, 3, 4])('over a generated history with aliases, chains, several items and retractions, seed %i', async (seed) => {
    const live = stores[kind](`live-${seed}`);
    const engine = createProjectionEngine({ store: live, now: () => at(100_000) });
    const rnd = pseudo(seed);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    const units = Array.from({ length: 12 }, (_, i) => `form:sq:w${i}`);
    await live.putAliases?.([{ oldId: 'form:sq:old0', newId: 'form:sq:w0', mapping: 'certain', packVersion: '1', reason: 'renamed', createdAt: at(0) } as never]);
    await live.putAliases?.([{ oldId: 'form:sq:older0', newId: 'form:sq:old0', mapping: 'certain', packVersion: '1', reason: 'renamed', createdAt: at(0) } as never]);
    const last = new Map<string, string | null>();
    let n = 0;
    const log: GoEvent[] = [];
    for (let batch = 0; batch < 25; batch++) {
      const events: GoEvent[] = [];
      for (let i = 0, size = 1 + Math.floor(rnd() * 4); i < size; i++) {
        n++;
        const id = `e${seed}-${n}`;
        const roll = rnd();
        if (roll < 0.45) events.push(lookup(id, n, pick([...units, 'form:sq:old0', 'form:sq:older0'])));
        else if (roll < 0.85) {
          const unit = pick(units);
          const items = roll < 0.6 ? [unit, pick(units)] : [unit];
          const card = `card:${items.join('+')}`;
          // a chain, a legacy review with no predecessor, or a sibling on the same predecessor
          const previous = roll < 0.75 ? (last.get(card) ?? null) : roll < 0.8 ? undefined : (last.get(card) ?? null);
          events.push(review(id, n, [...new Set(items)], `card:${[...new Set(items)].join('+')}`, rnd() < 0.25 ? 1 : 3, previous));
          last.set(`card:${[...new Set(items)].join('+')}`, id);
        } else if (log.length) {
          const target = pick(log.filter((e) => e.kind === 'CardReviewed').concat(log.slice(0, 1)));
          if (target.kind === 'CardReviewed') {
            events.push({ ...target, id, at: at(n), correctionOf: target.id, payload: { ...target.payload, rating: null, challenged: true }, evidence: { quality: 'none' } } as GoEvent);
          } else events.push(lookup(id, n, pick(units)));
        } else events.push(lookup(id, n, pick(units)));
      }
      log.push(...events);
      await live.append(L, events);
      await engine.project(L);
      const got = await live.getKnowledge(L);
      // the same log folded from nothing, on a store of its own
      const fresh = stores[kind](`fresh-${seed}-${batch}`);
      await fresh.putAliases?.(await live.aliasesFor(['form:sq:old0', 'form:sq:older0']));
      await fresh.append(L, log);
      const freshEngine = createProjectionEngine({ store: fresh, now: () => at(100_000) });
      await freshEngine.rebuild(L);
      expect(clean(got), `batch ${batch}`).toBe(clean(await fresh.getKnowledge(L)));
      await fresh.close();
    }
    await live.close();
  }, 120_000);
});

describe('what a new event reads', () => {
  const counting = (inner: ReturnType<typeof stores.sqlite>) => {
    let wholeLogReads = 0, read = 0;
    const store = new Proxy(inner, {
      get(target, key, receiver) {
        const v = Reflect.get(target, key, receiver) as unknown;
        if (key === 'list') {
          return async (f: { afterSeq?: number }) => { if (!f.afterSeq) wholeLogReads++; const rows = await inner.list(f as never); read += rows.length; return rows; };
        }
        if (key === 'listEventsOfUnits') {
          return async (l: string, ids: string[]) => { const rows = await inner.listEventsOfUnits!(l, ids); read += rows.length; return rows; };
        }
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    });
    return { store, stats: () => ({ wholeLogReads, read }), reset: () => { wholeLogReads = 0; read = 0; } };
  };

  it('a lookup of one word in a log of 5,000 events reads that word\'s events, not the log', async () => {
    const inner = stores.sqlite('size');
    const history = Array.from({ length: 5000 }, (_, i) => lookup(`h${i}`, i, `form:sq:w${i % 500}`));
    for (let i = 0; i < history.length; i += 500) await inner.append(L, history.slice(i, i + 500));
    const c = counting(inner);
    const engine = createProjectionEngine({ store: c.store, now: () => at(100_000) });
    await engine.project(L);
    await inner.append(L, [lookup('new', 6000, 'form:sq:w7')]);
    c.reset();
    await engine.project(L);
    expect(c.stats().wholeLogReads).toBe(0);
    expect(c.stats().read).toBeLessThanOrEqual(12); // the new event, and that word's ten earlier ones
    const row = (await inner.getKnowledge(L, ['form:sq:w7']))[0]!;
    expect(row.encounters).toBe(11);
    await inner.close();
  });

  it('falls back to the whole log when a review\'s predecessor is not among the word\'s events, and the rows still equal a rebuild', async () => {
    const inner = stores.sqlite('fallback');
    await inner.append(L, [review('r1', 1, ['form:sq:a'], 'card:x', 3, null)]);
    const c = counting(inner);
    const engine = createProjectionEngine({ store: c.store, now: () => at(100_000) });
    await engine.project(L);
    await inner.append(L, [review('r2', 2, ['form:sq:b'], 'card:x', 3, 'r1')]);
    c.reset();
    await engine.project(L);
    expect(c.stats().wholeLogReads).toBe(1);
    const live = clean(await inner.getKnowledge(L));
    await engine.rebuild(L);
    expect(clean(await inner.getKnowledge(L))).toBe(live);
    await inner.close();
  });
});
