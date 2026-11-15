// @vitest-environment node
/**
 * The upload path over a real SQLite store (stage 4). A 200-event POST /events spent 873 of its 1,036 ms (at 12,000 events) in one statement,
 * listEventsOfUnits, whose plan began with every event of the learner. Proved here, in structure and not in timing:
 *  (a) listEventsOfUnits returns exactly what a plain filter over the whole log returns, in the same order (two learners share units; multi-unit events appear once);
 *  (b) no statement of a 200-event push or of a single POST /events reads `events` or `event_units` in bulk by learner (plans via EXPLAIN QUERY PLAN).
 */
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from '../../packages/repository-contract/src';
import type { GoEvent } from '../../packages/repository-contract/src';
import { openSqliteStore } from '../../packages/repository-store/src';
import { createInProcessApi } from '../../packages/repository-service/src/api';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createClock, createFakeCrypto, createFakeLinguistics } from '../repository/service/fakes';

let recording: string[] | null = null;
{
  const proto = Object.getPrototypeOf(new DatabaseSync(':memory:').prepare('select 1')) as Record<string, (...a: unknown[]) => unknown>;
  for (const m of ['all', 'get', 'run'] as const) {
    const orig = proto[m];
    proto[m] = function (this: StatementSync, ...a: unknown[]) {
      if (recording) recording.push((this as unknown as { sourceSQL: string }).sourceSQL.replace(/\s+/g, ' ').trim());
      return orig.apply(this, a);
    };
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'push-svc-'));
const dbFile = path.join(tmp, 'repository.sqlite');
const clock = createClock('2026-11-01T00:00:00.000Z');
const store = openSqliteStore(dbFile, { now: clock.now });
const deps: ServiceDeps = { store, engine: createProjectionEngine({ store, now: clock.now }), linguistics: createFakeLinguistics(store, clock.now), crypto: createFakeCrypto(), now: clock.now, log: () => {} };
const unitId = (i: number): string => `lemma:sq:p${String(i).padStart(3, '0')}:NOUN`;
let evNo = 0;
const mk = (who: { learnerId: string; enrolmentId: string }, ids: string[], k: number): GoEvent => ({
  id: `p-${evNo++}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq', at: new Date(Date.parse('2026-09-01T00:00:00Z') + k * 60_000).toISOString(),
  producer: { app: 'golearn-ext', version: '1', deviceId: 'dev-1' }, kind: 'SelectionLookedUp', subject: { itemIds: ids },
  payload: { surface: `s${k}`, tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'demo', helpShown: ['surface'], mode: 'word-list-only' },
}) as GoEvent;

let api: ReturnType<typeof createInProcessApi>;
const A = { learnerId: '', enrolmentId: '' };
const B = { learnerId: '', enrolmentId: '' };

beforeAll(async () => {
  const anon = createInProcessApi(deps);
  const account = async (email: string, who: { learnerId: string; enrolmentId: string }) => {
    const c = await anon.createAccount({ email, password: 'correct horse battery', displayName: email });
    if (!c.ok) throw new Error('createAccount');
    const s = await anon.createSession({ email, password: 'correct horse battery', deviceId: 'dev-1', platform: 'test' });
    if (!s.ok) throw new Error('createSession');
    const a = createInProcessApi(deps, s.data.token);
    const e = await a.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    if (!e.ok) throw new Error('enrol');
    who.learnerId = c.data.learnerId; who.enrolmentId = e.data.enrolment.enrolmentId;
    return a;
  };
  api = await account('push-a@example.test', A);
  await account('push-b@example.test', B);
  // 3,000 events for A (some with two units), 600 for B over the same units
  for (let i = 0; i < 3000; i += 500) await store.append(A.learnerId, Array.from({ length: 500 }, (_, j) => { const k = i + j; return mk(A, k % 7 === 0 ? [unitId(k % 300), unitId((k + 1) % 300)] : [unitId(k % 300)], k); }));
  await store.append(B.learnerId, Array.from({ length: 600 }, (_, k) => mk(B, [unitId(k % 300)], k)));
}, 120_000);
afterAll(async () => { await store.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

describe('listEventsOfUnits', () => {
  it('returns exactly the learner\'s events that name one of the units, once each, in log order', async () => {
    const all = await store.list({ learnerId: A.learnerId, limit: 100_000 });
    for (const units of [[unitId(3)], [unitId(3), unitId(4), unitId(299)], [unitId(5), 'lemma:sq:nothing:NOUN'], Array.from({ length: 300 }, (_, i) => unitId(i)), []]) {
      const want = new Set(units);
      const expected = all.filter((e) => (e.subject.itemIds ?? []).some((u) => want.has(u))).sort((a, b) => a.seq - b.seq);
      const got = await store.listEventsOfUnits!(A.learnerId, units);
      expect(got.map((e) => e.seq)).toEqual(expected.map((e) => e.seq));
      expect(got).toEqual(expected);
    }
    const mine = await store.listEventsOfUnits!(B.learnerId, [unitId(3)]);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.learnerId === B.learnerId)).toBe(true);
  });
});

function logScans(sql: string, plan: string[]): string[] {
  const names = new Set(['events', 'event_units']);
  for (const m of sql.matchAll(/\b(?:FROM|JOIN)\s+(events|event_units)(?:\s+(?:AS\s+)?(?!ON\b|WHERE\b|JOIN\b|CROSS\b|INNER\b|LEFT\b|GROUP\b|ORDER\b|USING\b)(\w+))?/gi)) if (m[2]) names.add(m[2]);
  return plan.filter((p) => {
    const scan = /^SCAN (?:TABLE )?(\w+)/i.exec(p);
    if (scan) return names.has(scan[1]);
    const search = /^SEARCH (?:TABLE )?(\w+)(?: USING (?:COVERING )?(?:INTEGER PRIMARY KEY|INDEX \S+)(?: \((.*)\))?)?/i.exec(p);
    if (!search || !names.has(search[1])) return false;
    return !/\b(?:id|event_id|unit_id)=\?|\bseq>\?/.test(search[2] ?? ''); // seq>? is the projection folding only the events newer than its cursor
  });
}

describe('POST /events with 3,000 events stored', () => {
  for (const count of [200, 1]) {
    it(`${count} event(s): no statement reads events or event_units in bulk by learner`, async () => {
      const batch = Array.from({ length: count }, (_, j) => mk(A, [unitId(j % 300)], 10_000 + evNo + j));
      recording = [];
      const r = await api.appendEvents(batch as never);
      const seen = recording; recording = null;
      expect(r.ok).toBe(true);
      expect(seen.length).toBeGreaterThan(5);
      expect(seen.some((s) => /FROM event_units eu/.test(s) && /SELECT DISTINCT/.test(s))).toBe(true); // the statement under test really ran
      const ro = new DatabaseSync(dbFile, { readOnly: true });
      const bad: string[] = [];
      try {
        for (const sql of new Set(seen)) {
          if (!/^(WITH|SELECT)/i.test(sql)) continue;
          const n = (sql.match(/\?/g) ?? []).length;
          const plan = (ro.prepare('EXPLAIN QUERY PLAN ' + sql).all(...Array.from({ length: n }, () => 'x')) as Array<{ detail: string }>).map((x) => x.detail);
          const scans = logScans(sql, plan);
          if (scans.length) bad.push(`${sql.slice(0, 120)} => ${scans.join(' | ')}`);
        }
      } finally { ro.close(); }
      expect(bad).toEqual([]);
    });
  }
});
