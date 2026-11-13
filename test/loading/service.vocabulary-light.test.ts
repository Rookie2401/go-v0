// @vitest-environment node
/**
 * GET /vocabulary?detail=light over a real SQLite store, in process (2026-11-13). The GoReview home's recovery scan walks a learner's whole
 * vocabulary and reads only the knowledge rows that have no catalogue unit. A full unsorted page read up to 25 events for each of its 100 rows,
 * and 35 such pages cost the 512 MB instance about 100 MB, which ran it out of memory. Proved here, as structure and not as timing:
 *  (a) the light listing is the full unsorted listing's rows, units, order and cursors, with none of the per-row detail;
 *  (b) `catalogued=false` is exactly the set the scan filtered out for itself, and a whole vocabulary answers in one response;
 *  (c) a light walk runs NO statement that names `events` or `event_units` (the full page does: the control), and reads a number of rows that
 *      grows with the vocabulary only;
 *  (d) the filters it accepts agree with the full listing's, and what the full pass alone can decide is refused.
 */
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from '../../packages/repository-contract/src';
import type { GoEvent, KnowledgeLevel } from '../../packages/repository-contract/src';
import { openSqliteStore } from '../../packages/repository-store/src';
import { createInProcessApi } from '../../packages/repository-service/src/api';
import type { RepositoryApi, VocabularyItem, VocabularyQuery } from '../../packages/repository-service/src/api';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { createClock, createFakeCrypto, createFakeEngine, createFakeLinguistics } from '../repository/service/fakes';
import { knowledgeRow, unit } from '../repository/store/fixtures';

const WORDS = 1230;      // more than two of the listing's store pages of 500
const EVENTS = 4000;

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
async function record(fn: () => Promise<unknown>): Promise<Seen[]> {
  recording = [];
  try { await fn(); return recording; } finally { recording = null; }
}
/**
 * The statements that read the event log. The knowledge page's own statement names it only inside `(? IS NULL OR EXISTS (...))`, its source-reference
 * filter: with no source reference the parameter is NULL and SQLite never evaluates the sub-query (the light listing refuses a source reference), so
 * that one guarded clause is taken out before looking.
 */
const namesTheLog = (seen: Seen[]): string[] => seen.map((s) => s.sql)
  .filter((sql) => /\b(events|event_units)\b/i.test(sql.startsWith('SELECT k.json FROM knowledge k') ? sql.replace(/\(\? IS NULL OR EXISTS \(.*\)\)/, '') : sql));

// ── the world ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-light-'));
const clock = createClock('2026-11-01T00:00:00.000Z');
const store = openSqliteStore(path.join(tmp, 'repository.sqlite'), { now: clock.now });
const deps: ServiceDeps = { store, engine: createFakeEngine(store), linguistics: createFakeLinguistics(store, clock.now), crypto: createFakeCrypto(), now: clock.now, log: () => {} };
let api: RepositoryApi;
let other: RepositoryApi;
const unitId = (i: number): string => `lemma:sq:w${String(i).padStart(4, '0')}:NOUN`;
const LEVELS: KnowledgeLevel[] = ['new', 'seen', 'recognized', 'familiar', 'known', 'automatic'];
const hasUnit = (i: number): boolean => i % 17 !== 5;        // 72 of the 1,230 have no catalogue unit
const encounters = (i: number): number => (i % 41 === 0 ? 0 : 1 + (i % 9));

beforeAll(async () => {
  const anon = createInProcessApi(deps);
  const account = async (email: string) => {
    const created = await anon.createAccount({ email, password: 'correct horse battery', displayName: email });
    if (!created.ok) throw new Error('createAccount');
    const session = await anon.createSession({ email, password: 'correct horse battery', deviceId: 'dev-1', platform: 'test' });
    if (!session.ok) throw new Error('createSession');
    const signed = createInProcessApi(deps, session.data.token);
    const e = await signed.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    if (!e.ok) throw new Error('enrol');
    return { api: signed, learnerId: created.data.learnerId, enrolmentId: e.data.enrolment.enrolmentId };
  };
  const a = await account('light-main@example.test');
  const b = await account('light-other@example.test');
  api = a.api; other = b.api;

  await store.putUnits(Array.from({ length: WORDS }, (_, i) => i).filter(hasUnit).map((i) => unit(unitId(i), i % 7 === 0 ? 'provisional' : 'verified', { label: `w${i}` })));
  await store.putKnowledge(Array.from({ length: WORDS }, (_, i) => ({
    ...knowledgeRow(a.learnerId, unitId(i)), level: LEVELS[(i * 7) % 6], encounters: encounters(i), ...(i % 5 === 0 ? { analysisStatus: 'provisional' as const } : {}),
  })));
  // the other learner knows a unit of its own and shares none of the unit-less ones
  await store.putKnowledge([{ ...knowledgeRow(b.learnerId, 'lemma:sq:private:NOUN'), level: 'seen', encounters: 2 }]);

  const events: GoEvent[] = [];
  for (let k = 0; k < EVENTS; k++) {
    const i = (k * 131) % WORDS;
    events.push({
      id: `light-${k}`, v: CONTRACT_VERSION, learnerId: a.learnerId, enrolmentId: a.enrolmentId, languageId: 'sq', at: new Date(Date.parse('2026-09-01T00:00:00.000Z') + k * 60_000).toISOString(),
      producer: { app: 'golearn-ext', version: '1', deviceId: 'dev-1' }, kind: k % 4 === 0 ? 'EncounterRecorded' : 'SelectionLookedUp',
      subject: { itemIds: [unitId(i)], sourceRef: { kind: 'demo', title: `Reader ${k % 5}` } },
      payload: k % 4 === 0 ? { contextKind: 'fragment', surface: `s${k % 6}x${i}` } : { surface: `f${k % 4}x${i}`, tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] },
    } as GoEvent);
  }
  for (let at = 0; at < events.length; at += 500) {
    const out = await store.append(a.learnerId, events.slice(at, at + 500));
    if (out.some((o) => !o.stored)) throw new Error('seed event refused');
  }
}, 120_000);

afterAll(async () => {
  await store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Every page of a walk, by its cursors. */
async function walk(client: RepositoryApi, query: Omit<VocabularyQuery, 'languageId' | 'after'>): Promise<{ items: VocabularyItem[]; pages: number; details: Array<string | undefined> }> {
  const items: VocabularyItem[] = [];
  const details: Array<string | undefined> = [];
  let after: string | undefined;
  let pages = 0;
  for (;;) {
    const page = await client.vocabulary({ languageId: 'sq', ...query, ...(after ? { after } : {}) });
    if (!page.ok) throw new Error(`vocabulary: ${page.status} ${page.message}`);
    pages += 1;
    items.push(...page.data.items);
    details.push(page.data.detail);
    after = page.data.nextCursor;
    if (!after) return { items, pages, details };
    if (pages > 100) throw new Error('the walk does not end');
  }
}
const ids = (items: VocabularyItem[]): string[] => items.map((x) => x.knowledge.unitId);

describe('GET /vocabulary?detail=light', () => {
  it('lists the rows, units, order and cursors of the full unsorted listing, with none of the per-row detail', async () => {
    const full = await walk(api, { limit: 100 });
    const light = await walk(api, { limit: 100, detail: 'light' });
    expect(full.items.length).toBe(Array.from({ length: WORDS }, (_, i) => i).filter((i) => encounters(i) > 0).length);
    expect(ids(light.items)).toEqual(ids(full.items));
    expect(light.pages).toBe(full.pages);
    expect(light.items.map((x) => x.knowledge)).toEqual(full.items.map((x) => x.knowledge));
    expect(light.items.map((x) => x.unit)).toEqual(full.items.map((x) => x.unit));
    expect(light.details.every((d) => d === 'light')).toBe(true);
    expect(full.details.every((d) => d === undefined)).toBe(true);
    for (const item of light.items) {
      expect(item.surfaceForms).toEqual(item.unit ? [item.unit.label] : []);
      expect(item.sources).toEqual([]);
      expect(Object.keys(item).sort()).toEqual(item.unit ? ['knowledge', 'sources', 'surfaceForms', 'unit'] : ['knowledge', 'sources', 'surfaceForms']);
    }
    // the full listing does carry what the light one leaves out: otherwise the comparison above would prove nothing
    expect(full.items.some((x) => x.sources.length > 0 && x.surfaceForms.length > 1)).toBe(true);
  });

  it('catalogued=false is exactly what the recovery scan kept for itself, in one response; catalogued=true is the rest', async () => {
    const full = await walk(api, { limit: 100 });
    const scanKept = full.items.filter((item) => !item.unit); // workspace.ts recoveryScan's own filter
    expect(scanKept.length).toBeGreaterThan(50);
    const one = await api.vocabulary({ languageId: 'sq', limit: 100, detail: 'light', catalogued: false });
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    expect(one.data.nextCursor).toBeUndefined();
    expect(ids(one.data.items)).toEqual(ids(scanKept));
    expect(one.data.items.map((x) => x.knowledge)).toEqual(scanKept.map((x) => x.knowledge));
    expect(one.data.catalog).toEqual((await api.vocabulary({ languageId: 'sq', limit: 1 }) as { ok: true; data: { catalog: unknown } }).data.catalog);
    const rest = await walk(api, { limit: 100, detail: 'light', catalogued: true });
    expect(ids(rest.items)).toEqual(ids(full.items.filter((item) => !!item.unit)));
    // and it pages when it has to
    const small = await walk(api, { limit: 10, detail: 'light', catalogued: false });
    expect(ids(small.items)).toEqual(ids(scanKept));
    expect(small.pages).toBeGreaterThanOrEqual(Math.ceil(scanKept.length / 10));
  });

  it('reads nothing of the event log, and a number of rows that grows with the vocabulary only (the full page is the control)', async () => {
    const lightSeen = await record(() => api.vocabulary({ languageId: 'sq', limit: 100, detail: 'light', catalogued: false }));
    expect(namesTheLog(lightSeen)).toEqual([]);
    const lightRows = lightSeen.reduce((n, s) => n + s.rows, 0);
    expect(lightRows).toBeLessThanOrEqual(2 * WORDS + 50); // each knowledge row and each unit once, and the request's own few
    const lightWalk = await record(() => walk(api, { limit: 100, detail: 'light' }));
    expect(namesTheLog(lightWalk)).toEqual([]);

    const fullSeen = await record(() => api.vocabulary({ languageId: 'sq', limit: 100 }));
    expect(namesTheLog(fullSeen).length).toBeGreaterThan(0); // the recorder sees the log when it is read
    expect(fullSeen.reduce((n, s) => n + s.rows, 0)).toBeGreaterThan(300); // one page of 100 rows with their events
  });

  it('agrees with the full listing on the filters it takes', async () => {
    for (const query of [{ level: 'seen' as const }, { minEncounters: 5 }, { unresolved: true }, { unresolved: false }, { level: 'known' as const, minEncounters: 3, unresolved: false }]) {
      const full = await walk(api, { limit: 100, ...query });
      const light = await walk(api, { limit: 100, detail: 'light', ...query });
      expect(ids(light.items), JSON.stringify(query)).toEqual(ids(full.items));
      expect(full.items.length, JSON.stringify(query)).toBeGreaterThan(0);
    }
  });

  it('refuses what only the full pass can decide, and catalogued without light', async () => {
    const refused = async (query: Omit<VocabularyQuery, 'languageId'>): Promise<number> => { const r = await api.vocabulary({ languageId: 'sq', ...query }); return r.ok ? 200 : r.status; };
    expect(await refused({ catalogued: false })).toBe(422);
    expect(await refused({ detail: 'full', catalogued: true })).toBe(422);
    expect(await refused({ detail: 'light', sort: 'recent' })).toBe(422);
    expect(await refused({ detail: 'light', search: 'w1' })).toBe(422);
    expect(await refused({ detail: 'light', requiresAssistance: true })).toBe(422);
    expect(await refused({ detail: 'light', reviewStatus: 'active' })).toBe(422);
    expect(await refused({ detail: 'light', sourceRef: 'Reader 1' })).toBe(422);
    expect(await refused({ detail: 'light', lastEncounterFrom: '2026-10-01T00:00:00Z' })).toBe(422);
    expect(await refused({ detail: 'nonsense' as 'light' })).toBe(422);
    expect(await refused({ detail: 'full' })).toBe(200); // the default, named
  });

  it('never shows another learner a row', async () => {
    const mine = await walk(other, { limit: 100, detail: 'light' });
    expect(ids(mine.items)).toEqual(['lemma:sq:private:NOUN']);
    const none = await walk(other, { limit: 100, detail: 'light', catalogued: true });
    expect(none.items).toEqual([]);
  });
});
