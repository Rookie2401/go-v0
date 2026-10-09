import { describe, expect, it } from 'vitest';
import { LookupTimer, PHASES, createMemoryMetricsStore, exportMetrics, percentile, summarize, type MetricsRow } from '../../packages/golearn-extension/src/metrics';

const row = (i: number, over: Partial<MetricsRow> = {}): MetricsRow => ({
  id: `m${i}`, at: `2026-10-08T10:00:${String(i).padStart(2, '0')}.000Z`, readerId: 'web-generic', contextKind: 'sentence', tokenCount: 1, contextChars: 40,
  coldStart: i === 0, t: { selectionObtained: 1, contextExtracted: 2 + i, parsed: 5 + i, popupPositioned: 6 + i, firstInfoShown: 20 + i },
  dt: { selectionObtained: 1, contextExtracted: 1 + i, parsed: 3, popupPositioned: 1, firstInfoShown: 14 }, memory: null, outcome: 'shown', ...over,
});

describe('LookupTimer', () => {
  it('marks are performance.now() differences from the trigger, and dt is the difference between marks', () => {
    let now = 1000;
    const timer = new LookupTimer({ now: () => now, memory: { usedJSHeapSize: 5, totalJSHeapSize: 9, jsHeapSizeLimit: 99 } });
    now += 2; timer.mark('selectionObtained');
    now += 3; timer.mark('contextExtracted');
    now += 10; timer.mark('parsed');
    now += 1; timer.mark('popupPositioned');
    now += 16; timer.mark('firstInfoShown');
    expect(timer.t).toEqual({ selectionObtained: 2, contextExtracted: 5, parsed: 15, popupPositioned: 16, firstInfoShown: 32 });
    expect(timer.dt).toEqual({ selectionObtained: 2, contextExtracted: 3, parsed: 10, popupPositioned: 1, firstInfoShown: 16 });
    expect(timer.memory()).toEqual({ usedJSHeapSize: 5, totalJSHeapSize: 9, jsHeapSizeLimit: 99 });
  });

  it('a lookup that stopped early has only the marks it reached; memory is null when the browser has none', () => {
    let now = 0;
    const timer = new LookupTimer({ now: () => now });
    now = 4; timer.mark('selectionObtained');
    expect(Object.keys(timer.t)).toEqual(['selectionObtained']);
    expect(timer.memory()).toBeNull();
    expect(PHASES).toHaveLength(5);
  });
});

describe('summary', () => {
  it('nearest-rank percentiles, and null (not zero) for an empty sample', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([10, 1, 5], 50)).toBe(5);
  });

  it('counts, cold starts and per-phase p50/p95 come from the rows only', () => {
    const rows = [0, 1, 2, 3].map((i) => row(i));
    rows.push(row(4, { outcome: 'failed', t: { selectionObtained: 1 }, dt: { selectionObtained: 1 }, failure: 'no-selection' }));
    const s = summarize(rows);
    expect(s.count).toBe(5);
    expect(s.shown).toBe(4);
    expect(s.failed).toBe(1);
    expect(s.coldStarts).toBe(1);
    expect(s.cumulative.selectionObtained).toEqual({ n: 5, p50: 1, p95: 1 });
    expect(s.cumulative.parsed.n).toBe(4); // the failed lookup never reached it
    expect(s.cumulative.firstInfoShown.p50).toBe(21);
    expect(s.cumulative.firstInfoShown.p95).toBe(23);
    expect(s.heap).toEqual({ n: 0, p50: null, p95: null });
  });

  it('an empty set summarises to zero counts and null statistics', () => {
    const s = summarize([]);
    expect(s.count).toBe(0);
    for (const p of PHASES) expect(s.cumulative[p]).toEqual({ n: 0, p50: null, p95: null });
  });

  it('heap statistics appear only when rows carry a memory sample', () => {
    const rows = [row(0, { memory: { usedJSHeapSize: 100, totalJSHeapSize: 200, jsHeapSizeLimit: 900 } }), row(1, { memory: { usedJSHeapSize: 300, totalJSHeapSize: 400, jsHeapSizeLimit: 900 } }), row(2)];
    expect(summarize(rows).heap).toEqual({ n: 2, p50: 100, p95: 300 });
  });
});

describe('metrics store and export', () => {
  it('appends rows, lists them in time order, exports rows with their summary as JSON, and clears', async () => {
    const store = createMemoryMetricsStore();
    await store.append(row(2)); await store.append(row(0)); await store.append(row(1));
    expect((await store.list()).map((r) => r.id)).toEqual(['m0', 'm1', 'm2']);
    const parsed = JSON.parse(await exportMetrics(store));
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.summary.count).toBe(3);
    expect(Object.keys(parsed.summary.cumulative)).toEqual([...PHASES]);
    expect(await store.clear()).toBe(3);
    expect(JSON.parse(await exportMetrics(store)).summary.count).toBe(0);
  });

  it('rows hold lengths and counts, never text', async () => {
    const store = createMemoryMetricsStore();
    await store.append(row(0));
    expect(Object.keys((await store.list())[0]).sort()).toEqual(['at', 'coldStart', 'contextChars', 'contextKind', 'dt', 'id', 'memory', 'outcome', 'readerId', 't', 'tokenCount']);
  });
});
