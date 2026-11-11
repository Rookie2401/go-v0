// @vitest-environment node
/**
 * GET /vocabulary over a real SQLite store, in process. Three things are proved here:
 *  (a) every page of every walk (each sort, each filter the route supports) is byte-identical to the responses recorded from the code BEFORE the
 *      performance fix (service.vocabulary.golden.json; regenerate only deliberately, with RECORD_VOCAB_GOLDEN=1 on code whose responses are trusted);
 *  (b) STRUCTURE (not timing): one unsorted page and one sorted page run no statement that scans `events` or `event_units`, and read a bounded
 *      number of rows with 3,000 events stored;
 *  (c) the order of a sorted listing is computed once per walk, not once per page, and an append between two pages leaves a consistent listing.
 */
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from '../../packages/repository-contract/src';
import type { GoEvent, KnowledgeLevel, LinguisticUnit, UnitAlias } from '../../packages/repository-contract/src';
import { openSqliteStore } from '../../packages/repository-store/src';
import { createInProcessApi } from '../../packages/repository-service/src/api';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { handle } from '../../packages/repository-service/src/handler';
import { createClock, createFakeCrypto, createFakeEngine, createFakeLinguistics } from '../repository/service/fakes';
import { alias, knowledgeRow, unit } from '../repository/store/fixtures';

const GOLDEN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'service.vocabulary.golden.json');
const RECORD = process.env.RECORD_VOCAB_GOLDEN === '1';
const UNITS = 240;
const EVENTS = 3000;

// ── statement recorder (the store prepares through StatementSync) ──
interface Seen { sql: string; rows: number }
let recording: Seen[] | null = null;
{
  const proto = Object.getPrototypeOf(new DatabaseSync(':memory:').prepare('select 1')) as Record<string, (...a: unknown[]) => unknown>;
  for (const m of ['all', 'get', 'run'] as const) {
    const orig = proto[m];
    proto[m] = function (this: StatementSync, ...a: unknown[]) {
      const r = orig.apply(this, a);
      if (recording) recording.push({ sql: (this as unknown as { sourceSQL: string }).sourceSQL.replace(/\s+/g, ' ').trim(), rows: Array.isArray(r) ? r.length : r && m === 'get' ? 1 : 0 });
      return r;
    };
  }
}

// ── the world ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-svc-'));
const dbFile = path.join(tmp, 'repository.sqlite');
const clock = createClock('2026-11-01T00:00:00.000Z');
const store = openSqliteStore(dbFile, { now: clock.now });
const deps: ServiceDeps = { store, engine: createFakeEngine(store), linguistics: createFakeLinguistics(store, clock.now), crypto: createFakeCrypto(), now: clock.now, log: () => {} };
let token = '', learnerId = '', enrolmentId = '';
const unitId = (i: number): string => `lemma:sq:w${String(i).padStart(3, '0')}:NOUN`;
const LEVELS: KnowledgeLevel[] = ['new', 'seen', 'recognized', 'familiar', 'known', 'automatic'];

let seedNo = 0;
const rand = (): number => { seedNo = (seedNo * 1664525 + 1013904223) % 4294967296; return seedNo / 4294967296; };
let evNo = 0;
const BASE = Date.parse('2026-09-01T00:00:00.000Z');

function mk(who: { learnerId: string; enrolmentId: string }, kind: GoEvent['kind'], ids: string[], atMs: number, payload: Record<string, unknown>, extra: { sourceRef?: Record<string, unknown>; cardId?: string } = {}): GoEvent {
  return {
    id: `v-${evNo++}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq', at: new Date(atMs).toISOString(),
    producer: { app: 'golearn-ext', version: '1', deviceId: 'dev-1' }, kind,
    subject: { itemIds: ids, ...(extra.sourceRef ? { sourceRef: extra.sourceRef as never } : {}), ...(extra.cardId ? { cardId: extra.cardId } : {}) }, payload,
  } as GoEvent;
}

async function appendAll(l: string, events: GoEvent[]): Promise<void> {
  for (let i = 0; i < events.length; i += 500) {
    const out = await store.append(l, events.slice(i, i + 500));
    const bad = out.find((o) => !o.stored);
    if (bad) throw new Error(`seed event refused: ${JSON.stringify(bad)}`);
  }
}

beforeAll(async () => {
  const anon = createInProcessApi(deps);
  const mkAccount = async (email: string) => {
    const created = await anon.createAccount({ email, password: 'correct horse battery', displayName: email });
    if (!created.ok) throw new Error('createAccount');
    const session = await anon.createSession({ email, password: 'correct horse battery', deviceId: 'dev-1', platform: 'test' });
    if (!session.ok) throw new Error('createSession');
    const api = createInProcessApi(deps, session.data.token);
    const e = await api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    if (!e.ok) throw new Error('enrol');
    return { learnerId: created.data.learnerId, token: session.data.token, enrolmentId: e.data.enrolment.enrolmentId };
  };
  const a = await mkAccount('vocab-main@example.test');
  const b = await mkAccount('vocab-other@example.test');
  ({ learnerId, token, enrolmentId } = a);

  // units: ordinary words, a few homographs (same label), some accented, some unresolved, a few with no unit row at all
  const units: LinguisticUnit[] = [];
  for (let i = 0; i < UNITS; i++) {
    if (i % 37 === 5) continue; // no unit row: the listing must still work from the knowledge row and the event surfaces
    const label = i % 29 === 3 ? 'ujë' : i % 17 === 4 ? `çë${i % 3}` : i % 11 === 2 ? `Ëmër${i % 4}` : `w${String(i).padStart(3, '0')}`;
    units.push(unit(unitId(i), i % 7 === 0 ? 'provisional' : 'verified', { label }));
  }
  await store.putUnits(units);
  // knowledge: for both learners (the second one shares the first 40 units, so event_units are shared across learners)
  const rowsOf = (l: string, count: number) => Array.from({ length: count }, (_, i) => {
    const base = knowledgeRow(l, unitId(i));
    return {
      ...base, level: LEVELS[(i * 7) % 6], uncertainty: Math.round(rand() * 10) / 10, retention: { ...base.retention, estimate: Math.round(rand() * 8) / 10 },
      encounters: i % 41 === 0 ? 0 : 1 + (i % 9), ...(i % 5 === 0 ? { analysisStatus: 'provisional' as const } : {}),
    };
  });
  await store.putKnowledge(rowsOf(learnerId, UNITS));
  await store.putKnowledge(rowsOf(b.learnerId, 40));
  const aliases: UnitAlias[] = [alias(unitId(3), unitId(4)), alias(unitId(8), unitId(9)), alias(unitId(150), unitId(151))];
  await store.putAliases(aliases);

  // events for the main learner: mostly lookups and encounters, spread over 90 days, many with identical instants (ties in `recent`)
  const events: GoEvent[] = [];
  const who = { learnerId, enrolmentId };
  for (let k = 0; events.length < EVENTS - 160; k++) {
    const i = Math.floor(rand() * rand() * UNITS); // skewed: low ids are met often
    if (i % 41 === 0) continue; // knowledge row says 0 encounters and there are no events
    if (i % 43 === 7) continue; // encounters > 0 but no encounter events at all (only a review card, below)
    const atMs = BASE + Math.floor(rand() * 90) * 86_400_000 + (k % 4) * 3_600_000; // whole hours: plenty of equal instants
    const kind = k % 5 === 0 ? 'EncounterRecorded' : k % 23 === 0 ? 'AssistanceRequested' : 'SelectionLookedUp';
    const ids = k % 13 === 0 ? [unitId(i), unitId((i + 1) % UNITS)] : [unitId(i)];
    const sourceRef = k % 3 === 0 ? { kind: 'demo', title: `Reader ${k % 5}` } : k % 7 === 0 ? { kind: 'web', locator: `https://example.test/p${k % 4}` } : undefined;
    const payload = kind === 'AssistanceRequested' ? { assistance: 'gloss' }
      : kind === 'EncounterRecorded' ? { contextKind: 'fragment', surface: `s${k % 6}x${i}` }
        : { surface: `f${k % 4}x${i}`, tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] };
    events.push(mk(who, kind as GoEvent['kind'], ids, atMs, payload, { ...(sourceRef ? { sourceRef } : {}) }));
  }
  // cards: added for 70 units, some suspended, some dismissed, some invalidated, with equal-instant pairs
  for (let i = 0; i < 70; i++) {
    const u = unitId(i * 3), at = BASE + (10 + i) * 86_400_000, cardId = `card-${i}`;
    events.push(mk(who, 'CardAdded', [u], at, { cardKind: 'recognition', family: 'meaning-to-form' }, { cardId }));
    if (i % 4 === 1) events.push(mk(who, 'CardRemoved', [u], at + 1000, { reason: 'suspended' }, { cardId }));
    if (i % 4 === 2) events.push(mk(who, 'CardRemoved', [u], at + 1000, { reason: 'dismissed' }, { cardId }));
    if (i % 4 === 3) { events.push(mk(who, 'ReviewItemInvalidated', [u], at + 2000, { reason: 'pack-superseded' }, { cardId })); events.push(mk(who, 'CardRemoved', [u], at + 2000, { reason: 'suspended' }, { cardId })); }
    if (i % 9 === 0) events.push(mk(who, 'CardAdded', [u], at + 5000, { cardKind: 'recognition', family: 'form-to-meaning' }, { cardId: `card-${i}-b` }));
    events.push(mk(who, 'CardReviewed', [u], at + 86_400_000, { cardKind: 'recognition', grade: 'good', correct: true, hinted: false }, { cardId }));
  }
  while (events.length < EVENTS) events.push(mk(who, 'SelectionLookedUp', [unitId(i0(events.length))], BASE + events.length * 60_000, { surface: 'pad', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] }));
  events.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
  await appendAll(learnerId, events);
  // the second learner meets some of the same units
  await appendAll(b.learnerId, Array.from({ length: 120 }, (_, k) => mk({ learnerId: b.learnerId, enrolmentId: b.enrolmentId }, 'SelectionLookedUp', [unitId(k % 40)], BASE + 200 * 86_400_000 + k * 1000,
    { surface: 'other', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] })));
}, 120_000);
const i0 = (n: number): number => (n * 7) % 40;

afterAll(async () => {
  await store.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows may still hold the WAL for a moment */ }
});

// ── requests ──
interface Got { status: number; text: string; etagOk: boolean }
async function get(query: Record<string, string | number | boolean | undefined>): Promise<Got> {
  const qs = Object.entries({ languageId: 'sq', ...query }).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  const res = await handle(new Request(`http://repository.local/vocabulary?${qs}`, { headers: { Authorization: `Bearer ${token}` } }), deps);
  const raw = await res.text();
  // The ETag is the hash of the raw body (the learner id inside it is random per run), so it is checked here against the body, not recorded.
  const etagOk = res.status !== 200 || res.headers.get('ETag') === `W/"${createHash('sha256').update(raw).digest('hex').slice(0, 32)}"`;
  return { status: res.status, text: raw.split(learnerId).join('LEARNER'), etagOk };
}
const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 24);
interface PageRec { status: number; n: number; body: string; etagOk: boolean }
async function walk(query: Record<string, string | number | boolean | undefined>): Promise<{ pages: PageRec[]; ids: string[] }> {
  const pages: PageRec[] = []; const ids: string[] = [];
  let after: string | undefined;
  for (let guard = 0; guard < 400; guard++) {
    const g = await get({ ...query, ...(after ? { after } : {}) });
    const body = g.status === 200 ? (JSON.parse(g.text) as { items: Array<{ knowledge: { unitId: string } }>; nextCursor?: string }) : undefined;
    pages.push({ status: g.status, n: body?.items.length ?? -1, body: sha(g.text), etagOk: g.etagOk });
    if (!body) break;
    ids.push(...body.items.map((i) => i.knowledge.unitId));
    if (!body.nextCursor) break;
    after = body.nextCursor;
  }
  return { pages, ids };
}

const FILTERS: Record<string, Record<string, string | number | boolean>> = {
  none: {}, level: { level: 'seen' }, search: { search: 'w01' }, searchSurface: { search: 'x1' }, searchAccent: { search: 'ËMËR'.toLowerCase() }, minEnc: { minEncounters: 5 },
  assisted: { requiresAssistance: true }, unassisted: { requiresAssistance: false }, unresolved: { unresolved: true }, resolved: { unresolved: false },
  reviewActive: { reviewStatus: 'active' }, reviewSuspended: { reviewStatus: 'suspended' }, reviewNone: { reviewStatus: 'none' },
  firstFrom: { firstEncounterFrom: '2026-09-20T00:00:00Z' }, firstTo: { firstEncounterTo: '2026-09-15T00:00:00Z' },
  lastFrom: { lastEncounterFrom: '2026-11-01T00:00:00Z' }, lastTo: { lastEncounterTo: '2026-10-01T00:00:00Z' },
  sourceTitle: { sourceRef: 'Reader 2' }, sourceLocator: { sourceRef: 'https://example.test/p1' },
  combo: { level: 'familiar', minEncounters: 2, requiresAssistance: false, reviewStatus: 'none', lastEncounterFrom: '2026-08-01T00:00:00Z' },
};
const SORTS: Array<string | undefined> = [undefined, 'knowledge', 'recent', 'alphabetical'];

function cases(): Array<{ name: string; query: Record<string, string | number | boolean | undefined> }> {
  const out: Array<{ name: string; query: Record<string, string | number | boolean | undefined> }> = [];
  for (const sort of SORTS) for (const [f, q] of Object.entries(FILTERS)) out.push({ name: `${sort ?? 'unsorted'} | ${f} | limit 30`, query: { ...q, limit: 30, sort } });
  for (const sort of SORTS) { out.push({ name: `${sort ?? 'unsorted'} | none | limit 100`, query: { limit: 100, sort } }); out.push({ name: `${sort ?? 'unsorted'} | none | limit 7`, query: { limit: 7, sort } }); }
  return out;
}

describe('GET /vocabulary: responses identical to the recorded ones', () => {
  it('records or compares every walk', async () => {
    const got: Record<string, unknown> = {};
    for (const c of cases()) { const w = await walk(c.query); got[c.name] = { pages: w.pages, total: w.ids.length, ids: sha(w.ids.join('|')) }; }
    // errors and stale cursors
    const errs: Record<string, unknown> = {};
    for (const [name, q] of Object.entries({
      badSort: { sort: 'nope' }, badCursor: { sort: 'recent', after: 'v1.%7B%22sort%22%3A%22recent%22%2C%22unitId%22%3A%22nope%22%7D' }, wrongSortCursor: { sort: 'recent', after: `v1.${encodeURIComponent(JSON.stringify({ sort: 'alphabetical', unitId: unitId(1), label: 'x' }))}` },
      garbageCursor: { sort: 'knowledge', after: 'garbage' }, badLevel: { level: 'x' }, badDate: { firstEncounterFrom: 'yesterday' }, badBool: { unresolved: 'maybe' },
    } as Record<string, Record<string, string>>)) { const g = await get(q); errs[name] = { status: g.status, body: sha(g.text) }; }
    got.__errors = errs;
    if (RECORD) { fs.writeFileSync(GOLDEN, JSON.stringify(got, null, 1) + '\n'); return; }
    const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(got)).toEqual(Object.keys(want));
    for (const k of Object.keys(want)) expect(got[k], k).toEqual(want[k]);
    // the recording is not vacuous: the sorted walks really span several pages and every sort returns the whole vocabulary
    const full = got['recent | none | limit 30'] as { pages: unknown[]; total: number };
    expect(full.pages.length).toBeGreaterThan(5);
    expect(full.total).toBeGreaterThan(150);
  }, 300_000);
});

// ── structure ──
function plansOf(sqls: string[]): Map<string, string[]> {
  const ro = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const out = new Map<string, string[]>();
    for (const sql of new Set(sqls)) {
      if (!/^(WITH|SELECT)/i.test(sql)) continue;
      const n = (sql.match(/\?/g) ?? []).length;
      out.set(sql, (ro.prepare('EXPLAIN QUERY PLAN ' + sql).all(...Array.from({ length: n }, () => 'x')) as Array<{ detail: string }>).map((r) => r.detail));
    }
    return out;
  } finally { ro.close(); }
}
/**
 * A statement reads the log in bulk when a plan row either SCANs events/event_units (or the alias they were given), or SEARCHes them by an index that
 * does not pin the row by id, event_id, unit_id or seq: a bare (learner_id=? AND language_id=?) range is every event of the learner, which is what made
 * the listing cost grow with the log. (The spec's regex /SCAN (events|event_units)/ would not have seen those: they print as SEARCH.)
 */
function logScans(sql: string, plan: string[]): string[] {
  const names = new Set(['events', 'event_units']);
  for (const m of sql.matchAll(/\b(?:FROM|JOIN)\s+(events|event_units)(?:\s+(?:AS\s+)?(?!ON\b|WHERE\b|JOIN\b|CROSS\b|INNER\b|LEFT\b|GROUP\b|ORDER\b|USING\b)(\w+))?/gi)) if (m[2]) names.add(m[2]);
  return plan.filter((p) => {
    const scan = /^SCAN (?:TABLE )?(\w+)/i.exec(p);
    if (scan) return names.has(scan[1]);
    const search = /^SEARCH (?:TABLE )?(\w+)(?: USING (?:COVERING )?(?:INTEGER PRIMARY KEY|INDEX \S+)(?: \((.*)\))?)?/i.exec(p);
    if (!search || !names.has(search[1])) return false;
    return !/\b(?:id|event_id|unit_id|seq)=\?/.test(search[2] ?? '');
  });
}
async function record(fn: () => Promise<unknown>): Promise<Seen[]> {
  recording = [];
  try { await fn(); return recording; } finally { recording = null; }
}
const rowsOf = (seen: Seen[]): number => seen.reduce((s, x) => s + x.rows, 0);

describe('GET /vocabulary: structure with 3,000 events stored', () => {
  it('has the log it claims to', async () => {
    expect(await store.head(learnerId)).toBeGreaterThanOrEqual(EVENTS);
  });
  for (const [label, query] of [['an unsorted page of 100', { limit: 100 }], ['a sorted page of 100 (recent)', { limit: 100, sort: 'recent' }], ['a sorted page of 100 (knowledge)', { limit: 100, sort: 'knowledge' }]] as const) {
    it(`${label}: no statement scans events or event_units, and the rows read stay bounded`, async () => {
      await get({ limit: 1 }); // warm: the projection check and statement preparation are not the page
      const seen = await record(() => get(query));
      const plans = plansOf(seen.map((s) => s.sql));
      const bad: string[] = [];
      for (const [sql, plan] of plans) { const scans = logScans(sql, plan); if (scans.length) bad.push(`${sql.slice(0, 120)} => ${scans.join(' | ')}`); }
      expect(bad).toEqual([]);
      expect(rowsOf(seen)).toBeLessThanOrEqual(40 * 100);
    });
  }

  it('a later page of a sorted walk does less than the first page\'s work (statement calls plus rows) and never reads the whole vocabulary again: the order is not recomputed', async () => {
    for (const sort of ['recent', 'knowledge', 'alphabetical']) {
      await get({ limit: 1, sort }); // a different limit/cursor shape from the walk; also lets the cache window be fresh for nothing in particular
      clock.advance(60_000); // a new moment: the first page of the walk below may not borrow from the line above
      let after: string | undefined; const work: number[] = []; const ranVocabularyScan: boolean[] = []; const widest: number[] = [];
      for (let p = 0; p < 3; p++) {
        let next: string | undefined;
        const seen = await record(async () => { const g = await get({ limit: 30, sort, ...(after ? { after } : {}) }); next = (JSON.parse(g.text) as { nextCursor?: string }).nextCursor; });
        work.push(seen.length + rowsOf(seen));
        ranVocabularyScan.push(seen.some((s) => /^SELECT k\.json FROM knowledge k/.test(s.sql)));
        widest.push(Math.max(...seen.map((s) => s.rows)));
        after = next; if (!after) break;
      }
      expect(work.length, sort).toBeGreaterThanOrEqual(3);
      // Page 1 orders the whole vocabulary (and then enriches its own 30 rows); pages 2 and 3 only enrich theirs. Enriching 30 rows is itself a good part of
      // page 1's cost at this size (about 10 events per unit), so no fixed fraction holds (it varies with which units a page holds: 1167 then 746 then 541 for alphabetical); the claim is that it is less, and the next two lines.
      expect(work[1], `${sort}: ${work.join(', ')}`).toBeLessThan(work[0]);
      expect(work[2], `${sort}: ${work.join(', ')}`).toBeLessThan(work[0]);
      expect(ranVocabularyScan[0], `${sort}: page 1 orders the vocabulary`).toBe(true);
      expect(ranVocabularyScan.slice(1), `${sort}: pages 2 and 3 do not read the vocabulary again`).toEqual([false, false]);
      expect(widest.slice(1).every((w) => w <= 30 * 25), `${sort}: widest statement on a later page ${widest.join(', ')}`).toBe(true);
    }
  });

  it('an append between two pages of a sorted walk keeps the listing consistent: no unit the append did not touch is lost or repeated, and the cursor still resolves', async () => {
    const before = await walk({ limit: 30, sort: 'recent' });
    const first = await get({ limit: 30, sort: 'recent' });
    const page1 = JSON.parse(first.text) as { items: Array<{ knowledge: { unitId: string } }>; nextCursor: string };
    const page1Ids = page1.items.map((i) => i.knowledge.unitId);
    // touch a unit deep in the order (it jumps to the front) and a unit the listing has not met events for
    const touched = before.ids[before.ids.length - 5];
    clock.advance(120_000);
    const out = await store.append(learnerId, [mk({ learnerId, enrolmentId }, 'SelectionLookedUp', [touched], Date.parse('2026-12-01T00:00:00.000Z'), { surface: 'late', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] })]);
    expect(out[0].stored).toBe(true);
    const rest: string[] = [];
    let after: string | undefined = page1.nextCursor;
    for (let guard = 0; guard < 50 && after; guard++) {
      const g = await get({ limit: 30, sort: 'recent', after });
      expect(g.status).toBe(200);
      const b = JSON.parse(g.text) as { items: Array<{ knowledge: { unitId: string } }>; nextCursor?: string };
      rest.push(...b.items.map((i) => i.knowledge.unitId));
      after = b.nextCursor;
    }
    const seenIds = [...page1Ids, ...rest];
    expect(new Set(seenIds).size).toBe(seenIds.length); // none repeated
    const expected = before.ids.filter((id) => id !== touched);
    expect(expected.filter((id) => !seenIds.includes(id))).toEqual([]); // none the append did not touch is lost
    // and a fresh walk after the append shows the touched unit first
    const fresh = await walk({ limit: 30, sort: 'recent' });
    expect(fresh.ids[0]).toBe(touched);
    expect(fresh.ids.length).toBe(before.ids.length);
  });
});
