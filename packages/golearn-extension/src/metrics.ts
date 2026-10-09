/**
 * Instrumentation. performance.now() marks for each phase of a lookup; one row per completed lookup is appended to
 * storage; exportMetrics() returns them as JSON with a summary. Every number comes from a clock reading; nothing is
 * estimated, defaulted or smoothed, and a summary of zero rows has null statistics rather than zeros.
 */
import type { StorageArea } from './platform';
import { createMemoryStorageArea } from './store';

export const METRIC_KEY_PREFIX = 'golearn:metric:';

export const PHASES = ['selectionObtained', 'contextExtracted', 'parsed', 'popupPositioned', 'firstInfoShown'] as const;
export type CorePhase = (typeof PHASES)[number];
/** Marks of work that runs beside the card and never delays it: the event reaching the queue, the learner model, the dictionary. */
export const ASYNC_PHASES = ['eventQueued', 'profileArrived', 'glossArrived'] as const;
export type Phase = CorePhase | (typeof ASYNC_PHASES)[number];

export interface MemorySample { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }

export interface MetricsRow {
  id: string;
  at: string;
  readerId: string;
  contextKind: 'sentence' | 'fragment' | 'none' | 'n/a';
  tokenCount: number;
  /** Characters of context analysed (a length, never the text). */
  contextChars: number;
  /** True for the first lookup after the content script loaded (includes the analyser's first-call index build). */
  coldStart: boolean;
  /** Milliseconds from the trigger to each mark. Absent for a phase the lookup never reached. */
  t: Partial<Record<Phase, number>>;
  /** Milliseconds each phase took (difference from the previous mark that exists). */
  dt: Partial<Record<CorePhase, number>>;
  /** Heap at the end of the lookup when the browser exposes performance.memory (Chrome); otherwise null. */
  memory: MemorySample | null;
  /** performance.now() at the end of the content script's module evaluation (load cost), first row only. */
  moduleLoadMs?: number;
  outcome: 'shown' | 'failed';
  failure?: string;
}

export interface PerfLike { now(): number; memory?: MemorySample }

export class LookupTimer {
  private readonly t0: number;
  private readonly marks: Partial<Record<Phase, number>> = {};
  constructor(private readonly perf: PerfLike = performance) { this.t0 = perf.now(); }
  mark(phase: Phase): number {
    const v = this.perf.now() - this.t0;
    this.marks[phase] = v;
    return v;
  }
  get t(): Partial<Record<Phase, number>> { return { ...this.marks }; }
  get dt(): Partial<Record<CorePhase, number>> {
    const out: Partial<Record<CorePhase, number>> = {};
    let prev = 0;
    for (const p of PHASES) {
      const v = this.marks[p];
      if (v === undefined) continue;
      out[p] = v - prev;
      prev = v;
    }
    return out;
  }
  memory(): MemorySample | null {
    const m = this.perf.memory;
    return m && typeof m.usedJSHeapSize === 'number'
      ? { usedJSHeapSize: m.usedJSHeapSize, totalJSHeapSize: m.totalJSHeapSize, jsHeapSizeLimit: m.jsHeapSizeLimit }
      : null;
  }
}

export interface MetricsStore {
  append(row: MetricsRow): Promise<void>;
  list(): Promise<MetricsRow[]>;
  clear(): Promise<number>;
}

export function createStorageMetricsStore(area: StorageArea): MetricsStore {
  const rows = async (): Promise<Array<[string, MetricsRow]>> =>
    Object.entries(await area.get(null)).filter(([k]) => k.startsWith(METRIC_KEY_PREFIX)).map(([k, v]) => [k, v as MetricsRow]);
  return {
    async append(row) { await area.set({ [METRIC_KEY_PREFIX + row.id]: row }); },
    async list() { return (await rows()).map(([, v]) => v).sort((a, b) => a.at.localeCompare(b.at)); },
    async clear() {
      const keys = (await rows()).map(([k]) => k);
      if (keys.length) await area.remove(keys);
      return keys.length;
    },
  };
}

export const createMemoryMetricsStore = (): MetricsStore => createStorageMetricsStore(createMemoryStorageArea());

// ───────────────────────────── summary ─────────────────────────────

export interface PhaseStat { n: number; p50: number | null; p95: number | null }
export interface MetricsSummary {
  count: number;
  shown: number;
  failed: number;
  coldStarts: number;
  /** Cumulative time from the trigger to each mark. */
  cumulative: Record<Phase, PhaseStat>;
  /** Time spent in each phase. */
  perPhase: Record<CorePhase, PhaseStat>;
  heap: { n: number; p50: number | null; p95: number | null };
}

/** Nearest-rank percentile of a sample; null for an empty sample. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * s.length));
  return s[Math.min(s.length, rank) - 1];
}

const stat = (values: number[]): PhaseStat => ({ n: values.length, p50: percentile(values, 50), p95: percentile(values, 95) });

export function summarize(rows: MetricsRow[]): MetricsSummary {
  const cumulative = {} as Record<Phase, PhaseStat>;
  const perPhase = {} as Record<CorePhase, PhaseStat>;
  for (const p of PHASES) {
    cumulative[p] = stat(rows.map((r) => r.t[p]).filter((v): v is number => typeof v === 'number'));
    perPhase[p] = stat(rows.map((r) => r.dt[p]).filter((v): v is number => typeof v === 'number'));
  }
  for (const p of ASYNC_PHASES) cumulative[p] = stat(rows.map((r) => r.t[p]).filter((v): v is number => typeof v === 'number'));
  const heap = rows.map((r) => r.memory?.usedJSHeapSize).filter((v): v is number => typeof v === 'number');
  return {
    count: rows.length,
    shown: rows.filter((r) => r.outcome === 'shown').length,
    failed: rows.filter((r) => r.outcome === 'failed').length,
    coldStarts: rows.filter((r) => r.coldStart).length,
    cumulative, perPhase,
    heap: { n: heap.length, p50: percentile(heap, 50), p95: percentile(heap, 95) },
  };
}

/** The rows and their summary as JSON text. */
export async function exportMetrics(store: MetricsStore): Promise<string> {
  const rows = await store.list();
  return JSON.stringify({ summary: summarize(rows), rows }, null, 2);
}
