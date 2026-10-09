// @vitest-environment node
/**
 * Contract v3 keeps v2 (and v1) working end to end: the v2 events the existing suites build still validate, are stored by both stores, are
 * ingested by the service, and project to the same knowledge as the same events written as v3. A v3 field the engine does not read yet
 * (language evidence, a typed source) changes nothing about what a projection computes from the rest.
 */
import { describe, expect, it } from 'vitest';
import { validateEvent } from '../../packages/repository-contract/src';
import type { GoEvent, UnitKnowledge } from '../../packages/repository-contract/src';
import { createMemoryStore, openSqliteStore } from '../../packages/repository-store/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createInProcessApi } from '../../packages/repository-service/src/api';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';
import { nodeCrypto } from '../../packages/repository-service/src/crypto-node';
import { createLinguisticService } from '../../packages/repository-linguistics/src';
import { encounter, ev } from './store/fixtures';

const clock = () => '2026-10-09T12:00:00.000Z';
const LEMMA = 'lemma:sq:shtëpi:NOUN';

const history = (learnerId: string, v: number): GoEvent[] => {
  const base = { v, learnerId };
  return [
    ev('h1', { ...base, kind: 'SelectionLookedUp', at: '2026-10-08T10:00:00.000Z' }),
    encounter('h2', { ...base, at: '2026-10-08T10:01:00.000Z', subject: { itemIds: [LEMMA], sentenceKey: 's2', sourceRef: { kind: 'ebook', title: 'Book' } } }),
    ev('h3', { ...base, kind: 'CardReviewed', at: '2026-10-08T11:00:00.000Z', producer: { app: 'gopractice-review', version: '1', deviceId: 'dev-1' }, subject: { itemIds: [LEMMA], cardId: 'c1' },
      payload: { cardKind: 'recall', grade: 'good', correct: true, hinted: false } }),
    ev('h4', { ...base, kind: 'PackInstalled', at: '2026-10-08T12:00:00.000Z', subject: {}, payload: { packId: 'pack:sq' } }),
    ev('h5', { ...base, kind: 'ItemMarked', at: '2026-10-08T12:30:00.000Z', subject: { itemIds: [LEMMA] }, payload: { mark: 'saved' } }),
  ].map((e, i) => ({ ...e, id: `${learnerId}-${i}`, dedupeKey: `${learnerId}-${i}` }));
};

const dims = (rows: UnitKnowledge[]) => rows.map((r) => ({ unitId: r.unitId, dimensions: r.dimensions, retention: r.retention, uncertainty: r.uncertainty, analysisStatus: r.analysisStatus }));

describe('v2 events under contract v3', () => {
  it('the events the existing suites build validate as v1, v2 and v3', () => {
    for (const v of [1, 2, 3]) for (const e of history('L1', v)) expect(validateEvent(e), `v${v} ${e.kind}`).toEqual([]);
  });

  it.each([['memory', () => createMemoryStore({ now: clock })], ['sqlite', () => openSqliteStore(':memory:', { now: clock })]] as const)('%s store: v1, v2 and v3 events are stored side by side and read back as written', async (_n, open) => {
    const store = open();
    for (const v of [1, 2, 3]) {
      const out = await store.append(`L${v}`, history(`L${v}`, v));
      expect(out.every((o) => o.stored), `v${v}`).toBe(true);
      expect((await store.list({ learnerId: `L${v}` })).map((e) => e.v), `v${v}`).toEqual(Array(5).fill(v));
    }
    await store.close();
  });

  it('project to the same knowledge as the same events written as v3', async () => {
    const store = createMemoryStore({ now: clock });
    const engine = createProjectionEngine({ store, now: clock });
    const rows: Record<number, UnitKnowledge[]> = {};
    for (const v of [1, 2, 3]) {
      await store.append(`L${v}`, history(`L${v}`, v));
      await engine.project(`L${v}`);
      rows[v] = await store.getKnowledge(`L${v}`);
      expect(rows[v].length, `v${v}`).toBeGreaterThan(0);
    }
    expect(dims(rows[2])).toEqual(dims(rows[3]));
    expect(dims(rows[1])).toEqual(dims(rows[3]));
  });

  it('v3 fields the engine does not read change nothing it computes: language evidence and a typed source reference', async () => {
    const store = createMemoryStore({ now: clock });
    const engine = createProjectionEngine({ store, now: clock });
    const plain = history('P', 3);
    const rich = history('R', 3).map((e) => (e.kind === 'SelectionLookedUp'
      ? { ...e, payload: { ...e.payload, language: { languageId: 'sq', basis: 'detection', confidence: 0.5, override: false } },
        subject: { ...e.subject, sourceRef: { kind: 'scripture', provider: 'biblegateway', translationId: 'NIV', book: 'JHN', chapter: 3, verse: 16, confidence: 0.9 } } } as GoEvent
      : e));
    for (const e of rich) expect(validateEvent(e), e.kind).toEqual([]);
    await store.append('P', plain);
    await store.append('R', rich);
    await engine.project('P');
    await engine.project('R');
    // the lookup's own language-basis weighting belongs to the engine; here the point is that the rows exist and the untouched units agree
    const p = dims(await store.getKnowledge('P')).filter((r) => r.unitId === LEMMA);
    const r = dims(await store.getKnowledge('R')).filter((x) => x.unitId === LEMMA);
    expect(r.length).toBe(p.length);
    expect(r[0].dimensions.readingRecognition).toEqual(p[0].dimensions.readingRecognition);
    expect(r[0].dimensions.productiveRetrieval).toEqual(p[0].dimensions.productiveRetrieval);
  });

  it('the service ingests v2 and v3 events in one batch and reports both back', async () => {
    const store = createMemoryStore({ now: clock });
    const linguistics = createLinguisticService(store, { now: clock });
    const deps: ServiceDeps = { store, engine: createProjectionEngine({ store, now: clock }), linguistics: adaptLinguistics(linguistics), crypto: nodeCrypto, now: clock, log: () => {} };
    const api = createInProcessApi(deps);
    expect((await api.createAccount({ email: 'v2@example.test', password: 'correct horse battery staple' })).ok).toBe(true);
    const session = await api.createSession({ email: 'v2@example.test', password: 'correct horse battery staple', deviceId: 'dev-1' });
    if (!session.ok) throw new Error('no session');
    const enrol = await api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    if (!enrol.ok) throw new Error('no enrolment');
    const mk = (v: number, i: number): GoEvent => ({
      ...ev(`svc-${v}-${i}`, { v, learnerId: session.data.learnerId, enrolmentId: enrol.data.enrolment.enrolmentId, at: '2026-10-09T11:59:00.000Z' }),
      producer: { app: 'golearn-ext', version: '1', deviceId: 'dev-1' }, dedupeKey: `svc-${v}-${i}`,
    });
    const r = await api.appendEvents([mk(1, 0), mk(2, 0), mk(3, 0)]);
    expect(r.ok && r.data.stored).toBe(3);
    const list = await api.listEvents();
    expect(list.ok && list.data.events.filter((e) => e.id.startsWith('svc-')).map((e) => e.v).sort()).toEqual([1, 2, 3]);
    expect(list.ok && list.data.events.every((e) => typeof e.recordedAt === 'string')).toBe(true);
    await store.close();
  });
});
