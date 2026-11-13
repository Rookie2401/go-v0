// @vitest-environment jsdom
/**
 * MEASUREMENT, not a regression test: skipped unless PROBE_FOLD=1 (run it with `npx vite-node scripts/loadcheck/goreview/probe-fold.ts`).
 * Per answered card: events read from the local log, events passed through the fold, and wall milliseconds, on histories of 3,000 and 12,000 events.
 */
import { afterEach, it, vi } from 'vitest';

const probe = vi.hoisted(() => {
  const rows: Record<string, { n: number; ms: number; events: number }> = {};
  const wrap = <F extends (...a: never[]) => unknown>(name: string, fn: F, size?: (a: never[]) => number): F => ((...a: never[]) => {
    const t = performance.now();
    try { return fn(...a); } finally { const r = (rows[name] ??= { n: 0, ms: 0, events: 0 }); r.n += 1; r.ms += performance.now() - t; r.events += size ? size(a) : 0; }
  }) as F;
  return { rows, wrap, reset: () => { for (const k of Object.keys(rows)) delete rows[k]; } };
});
vi.mock('../../packages/goreview/src/scheduler/deck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/goreview/src/scheduler/deck')>();
  return { ...actual, foldDeckItems: probe.wrap('fold', actual.foldDeckItems, (a) => ((a[0] as unknown[]) ?? []).length) };
});

import { CONTRACT_VERSION, type GoEvent } from '../../packages/repository-contract/src';
import { cardAdded, destroyRigs, ids, key, makeRig, reviewed, seed, settleRefresh, type, unitOf, until, type Rig } from '../goreview-app/helpers';

afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
const DAY = 86_400_000;

function history(total: number, cards: number): GoEvent[] {
  const out: GoEvent[] = [];
  const lookups = total - cards * 5;
  const base = Date.parse('2026-01-01T09:00:00.000Z');
  for (let i = 0; i < lookups; i++) {
    out.push({
      id: `lookup-${i}`, v: CONTRACT_VERSION, learnerId: 'L1', enrolmentId: A.enrolmentId, languageId: 'sq', at: new Date(base + i * 1_500_000).toISOString(),
      producer: { app: 'golearn-ext', version: 'test', deviceId: 'dev-old' }, kind: 'SelectionLookedUp',
      subject: { itemIds: [unitOf(`look${i % 600}`)] }, payload: { surface: `look${i % 600}`, tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'test', helpShown: [] }, dedupeKey: `lookup-${i}`,
    });
  }
  for (let c = 0; c < cards; c++) {
    const label = `card${c}`;
    out.push(cardAdded(A, label, 'meaning-to-form', new Date(Date.parse('2026-08-10T09:00:00.000Z') + c * 60_000).toISOString()));
    for (let r = 0; r < 4; r++) {
      const failedLast = c < 12 && r === 3;
      out.push(reviewed(A, label, 'meaning-to-form', failedLast ? 1 : 3, new Date(Date.parse('2026-08-15T10:00:00.000Z') + r * 6 * DAY + c * 60_000).toISOString()));
    }
  }
  return out;
}

const present = (rig: Rig): string | undefined => rig.root.querySelector('#session .exercise')?.getAttribute('data-item') ?? undefined;
const median = (v: number[]): number => [...v].sort((a, b) => a - b)[v.length >> 1] ?? 0;

async function measure(total: number, cards: number): Promise<void> {
  const rig = await makeRig({ signedIn: true });
  await seed(rig, history(total, cards));
  await rig.go('settings'); await rig.go('review');
  await until(() => !!rig.root.querySelector('#current-deck'), 'the current deck', 2000);
  await settleRefresh(rig);
  const ctx = rig.app.ctx;
  const realEvents = ctx.events.bind(ctx);
  (ctx as { events: typeof ctx.events }).events = (async (lang?: string) => {
    const t = performance.now(); const r = await realEvents(lang);
    const row = (probe.rows.read ??= { n: 0, ms: 0, events: 0 }); row.n += 1; row.ms += performance.now() - t; row.events += r.length; return r;
  }) as typeof ctx.events;
  const logSize = (await realEvents('sq')).length;
  rig.q('#start-session').click();
  await until(() => !!present(rig), 'the first exercise', 2000);
  const rowsOut: Array<Record<string, number>> = [];
  const col2 = (k: string): number[] => rowsOut.map((r) => r[k]!);
  for (let i = 0; i < 20; i++) {
    const shown = present(rig)!;
    const input = rig.root.querySelector<HTMLInputElement>('#answer-input');
    if (input) { type(input, shown.split(':')[4]); key('Enter', input); } else rig.qa('.choice')[0]!.click();
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback', 2000);
    probe.reset();
    const t0 = performance.now();
    rig.q('#next').click();
    await until(() => (present(rig) !== undefined && present(rig) !== shown) || !!rig.root.querySelector('#summary'), 'the next card', 2000);
    const wall = performance.now() - t0;
    const f = probe.rows.fold ?? { n: 0, ms: 0, events: 0 }, rd = probe.rows.read ?? { n: 0, ms: 0, events: 0 };
    rowsOut.push({ folds: f.n, foldEvents: f.events, foldMs: f.ms, reads: rd.n, readEvents: rd.events, readMs: rd.ms, wallMs: wall });
    if (rig.root.querySelector('#summary')) break;
  }
  console.log('PROBE series foldEvents', JSON.stringify(col2('foldEvents')), 'wallMs', JSON.stringify(col2('wallMs').map(Math.round)));
  const col = (k: string): number[] => rowsOut.map((r) => r[k]!);
  const fmt = (k: string): string => `${Math.round(median(col(k)) * 10) / 10} (max ${Math.round(Math.max(...col(k)) * 10) / 10})`;
  console.log(`PROBE log=${logSize} answers=${rowsOut.length} | folds/answer median ${fmt('folds')} | events through fold ${fmt('foldEvents')} | log reads/answer ${fmt('reads')} | events read ${fmt('readEvents')} | fold ms ${fmt('foldMs')} | read ms ${fmt('readMs')} | whole answer step ms ${fmt('wallMs')}`);
}

const on = process.env.PROBE_FOLD === '1';
it.runIf(on)('probe 3,000 events', () => measure(3000, 200), 900_000);
it.runIf(on)('probe 12,000 events', () => measure(12000, 500), 900_000);
