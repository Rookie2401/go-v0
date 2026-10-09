// @vitest-environment node
/**
 * Privacy audit (1) learner-data export and portability, over the REAL service and both real stores.
 *
 * Two learners with unmistakable markers in every field; A's export must hold all of A and none of B, no credential of any
 * kind, and (portability) the file must be usable to restore the learner: the projection folded from the exported events
 * equals the live one. Tests titled DEFECT are `it.fails`: they state the secure/intended behaviour and pass while the
 * defect exists.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, type GoEvent } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createMemoryStore, exportLearner, importLearner, type LearnerExport } from '../../packages/repository-store/src';
import { createDraftStore, exportLearnerWriting, newVersion, type DraftRecord } from '../../packages/gotell/src';
import {
  PASSWORD, STORE_KINDS, comparableKnowledge, createStack, fastCrypto, lookup, production, raw, review, serverEvents, signUp, text,
  type Learner, type Stack, type StoreKind,
} from './privacy.support';

const stacks: Stack[] = [];
const make = (kind: StoreKind): Stack => { const s = createStack(kind); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const A_BODY = 'ALPHA-PRIVATE-BODY-7741';
const A_TITLE = 'ALPHA-TITLE-7741';
const B_BODY = 'BRAVO-PRIVATE-BODY-9902';
const B_SURFACE = 'bravoword';

interface World { s: Stack; a: Learner; b: Learner; aEvents: GoEvent[]; bEvents: GoEvent[] }

/** A: lookup + review + writing observation with a document + consent + a second language enrolment; B: the same kinds with other markers. */
async function world(kind: StoreKind): Promise<World> {
  const s = make(kind);
  const a = await signUp(s, 'alpha@example.com', 'a-phone');
  const b = await signUp(s, 'bravo@example.com', 'b-phone');
  const aEvents = [
    lookup(a), review(a, { correct: true }), review(a, { correct: false, at: '2026-10-09T07:58:00.000Z' }),
    lookup(a, { kind: 'ConsentGiven', producer: { app: 'golearn-app', version: '1', deviceId: a.deviceId }, subject: {}, payload: { consent: 'remote-speech' } }),
  ];
  expect((await a.api.appendEvents(aEvents)).ok).toBe(true);
  const w = await a.api.submitWriting({
    observation: production(a, { id: 'a-prod-1' }),
    document: { doc: { docId: 'a-doc', learnerId: a.learnerId, languageId: 'sq', kind: 'draft', title: A_TITLE, body: A_BODY, revision: 1, deviceId: a.deviceId, updatedAt: s.clock.now() }, expectedRevision: 0 },
  });
  expect(w.ok).toBe(true);
  const bEvents = [lookup(b, { payload: { surface: B_SURFACE, tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] }, subject: { itemIds: ['form:sq:bravoword'], sentenceKey: 'bb99' } }), review(b)];
  expect((await b.api.appendEvents(bEvents)).ok).toBe(true);
  expect((await b.api.putDocument('b-doc', { languageId: 'sq', kind: 'note', body: B_BODY, title: 'BRAVO-TITLE' }, 0)).ok).toBe(true);
  expect((await a.api.putTombstone({ kind: 'event', id: 'nothing-here' }, 'test receipt')).ok).toBe(true);
  return { s, a, b, aEvents, bEvents };
}

describe.each(STORE_KINDS)('learner-data export — %s store', (kind) => {
  it('contains every event, enrolment, document body, knowledge row, tombstone and the device of the learner', async () => {
    const { s, a, aEvents } = await world(kind);
    const r = await a.api.exportAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ex = r.data as Record<string, any>;
    expect(ex.format).toBe('go-repository-export@1');
    expect(ex.contractVersion).toBe(CONTRACT_VERSION);
    const held = (await serverEvents(s, a.learnerId)).map((e) => e.id).sort();
    expect((ex.events as GoEvent[]).map((e) => e.id).sort()).toEqual(held);
    for (const e of aEvents) expect((ex.events as GoEvent[]).map((x) => x.id)).toContain(e.id);
    expect((ex.events as GoEvent[]).map((e) => e.id)).toContain('a-prod-1');
    expect((ex.enrolments as Array<{ enrolmentId: string }>).map((e) => e.enrolmentId)).toEqual([a.enrolmentId]);
    const doc = (ex.documents as Array<{ docId: string; body: string; title?: string }>).find((d) => d.docId === 'a-doc');
    expect(doc?.body).toBe(A_BODY);
    expect(doc?.title).toBe(A_TITLE);
    expect((ex.knowledge as unknown[]).length).toBeGreaterThan(0);
    expect((ex.tombstones as unknown[]).length).toBe(1);
    expect((ex.devices as Array<{ deviceId: string }>).map((d) => d.deviceId)).toContain('a-phone');
    expect(ex.learner?.learnerId).toBe(a.learnerId);
    expect(typeof ex.exportedAt).toBe('string');
  });

  it('contains nothing of another learner: no id, email, event, document body, device or surface', async () => {
    const { a, b, bEvents } = await world(kind);
    const r = await a.api.exportAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = text(r.data);
    for (const secret of [b.learnerId, b.accountId, b.email, b.enrolmentId, b.deviceId, B_BODY, 'BRAVO-TITLE', 'b-doc', B_SURFACE, 'bb99', ...bEvents.map((e) => e.id)]) {
      expect(t, `B's ${secret} must not appear in A's export`).not.toContain(secret);
    }
  });

  it('holds no session token, token digest, password, password hash or credential field', async () => {
    const { s, a } = await world(kind);
    const second = await s.api().createSession({ email: a.email, password: PASSWORD, deviceId: 'a-laptop' });
    expect(second.ok).toBe(true);
    const extra = second.ok ? second.data.token : '';
    const r = await a.api.exportAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = text(r.data);
    for (const token of [a.token, extra]) {
      expect(t).not.toContain(token);
      expect(t).not.toContain(fastCrypto.sha256(token));
    }
    expect(t).not.toContain(PASSWORD);
    expect(t).not.toContain(fastCrypto.sha256(`salt:${PASSWORD}`));
    expect(t).not.toMatch(/passwordHash|password_hash|tokenHash|token_hash|fast\$|scrypt/i);
    expect(Object.keys((r.data as Record<string, any>).account).sort()).toEqual(['accountId', 'createdAt', 'email']);
  });

  it('the raw response is a download with a file name and is never cached', async () => {
    const { s, a } = await world(kind);
    const r = await raw(s, 'GET', '/export', { token: a.token });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/attachment; filename="go-repository-export\.json"/);
    expect(r.headers.get('cache-control')).toMatch(/no-store/);
    expect(() => JSON.parse(r.text)).not.toThrow();
  });

  it('is complete beyond one page: 1,250 events all appear (the service pages internally)', async () => {
    const s = make(kind);
    const a = await signUp(s, 'many@example.com', 'many-phone');
    for (let i = 0; i < 5; i++) {
      const batch = Array.from({ length: 250 }, () => lookup(a));
      const res = await a.api.appendEvents(batch);
      expect(res.ok).toBe(true);
    }
    const r = await a.api.exportAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = (r.data.events as GoEvent[]).map((e) => e.id);
    // 1,250 lookups + the EnrolmentChanged the service wrote at sign-up
    expect(ids.length).toBe(1250 + 1);
    expect(new Set(ids).size).toBe(ids.length);
  }, 60_000);

  it('a deleted document appears in the export with no body (only the fact of deletion)', async () => {
    const { a } = await world(kind);
    expect((await a.api.deleteDocument('a-doc')).ok).toBe(true);
    const r = await a.api.exportAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = text(r.data);
    expect(t).not.toContain(A_BODY);
    const doc = (r.data.documents as Array<{ docId: string; body: string; deletedAt?: string }>).find((d) => d.docId === 'a-doc');
    expect(doc?.body ?? '').toBe('');
    expect(doc?.deletedAt).toBeTruthy();
  });

  it('events for two languages are both exported, each keeping its language and enrolment', async () => {
    const { a } = await world(kind);
    const es = await a.api.enrol({ languageId: 'es', packId: 'pack:es', packVersion: '1', goals: [{ kind: 'reading' }] });
    expect(es.ok).toBe(true);
    if (!es.ok) return;
    const ev = lookup({ learnerId: a.learnerId, enrolmentId: es.data.enrolment.enrolmentId, deviceId: a.deviceId }, { languageId: 'es', subject: { itemIds: ['form:es:casa'], sentenceKey: 'es01' }, payload: { surface: 'casa', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] } });
    expect((await a.api.appendEvents([ev])).ok).toBe(true);
    const r = await a.api.exportAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const evs = r.data.events as GoEvent[];
    expect(new Set(evs.map((e) => e.languageId))).toEqual(new Set(['sq', 'es']));
    expect(evs.find((e) => e.id === ev.id)?.enrolmentId).toBe(es.data.enrolment.enrolmentId);
    expect((r.data.enrolments as unknown[]).length).toBe(2);
  });
});

describe.each(STORE_KINDS)('portability — %s store', (kind) => {
  it('the store-level export (exportLearner) restores into a fresh store with the same events, documents and, after a rebuild, the same knowledge', async () => {
    const { s, a } = await world(kind);
    const dump = await exportLearner(s.store, a.learnerId, { now: s.clock.now });
    const fresh = createMemoryStore({ now: s.clock.now });
    const summary = await importLearner(fresh, JSON.parse(JSON.stringify(dump)) as LearnerExport);
    expect(summary.events.refused).toBe(0);
    expect(summary.events.stored).toBe(dump.events.length);
    const restored = (await fresh.list({ learnerId: a.learnerId, limit: 5000 })).map((e) => e.id).sort();
    expect(restored).toEqual(dump.events.map((e) => e.id).sort());
    expect((await fresh.getDocument(a.learnerId, 'a-doc'))?.body).toBe(A_BODY);
    // knowledge is derived, not restored: folding the restored log must give what the live service shows
    const engine = createProjectionEngine({ store: fresh, now: s.clock.now });
    await engine.project(a.learnerId);
    const live = await comparableKnowledge(s, a.learnerId);
    const got = (await fresh.getKnowledge(a.learnerId)).map((k) => ({
      unitId: k.unitId, languageId: k.languageId, dimensions: k.dimensions, retention: k.retention, uncertainty: k.uncertainty, firstSeenAt: k.firstSeenAt, lastSeenAt: k.lastSeenAt, events: k.basis.events,
    })).sort((x, y) => (x.unitId < y.unitId ? -1 : 1));
    expect(got).toEqual(live);
  });

  // DEFECT P-01: GET /export and the store's importLearner share the format string 'go-repository-export@1' but not the shape
  // (the HTTP file has no top-level learnerId and lists full device objects; importLearner needs both). The file a learner
  // downloads cannot be fed back to the import that the store package provides for exactly that file.
  it('P-01 (fixed): the file GET /export returns can be restored by importLearner (the format string promises it)', async () => {
    const { a } = await world(kind);
    const r = await a.api.exportAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fresh = createMemoryStore();
    const summary = await importLearner(fresh, JSON.parse(JSON.stringify(r.data)) as LearnerExport);
    expect(summary.events.refused).toBe(0);
    expect(summary.events.stored).toBeGreaterThan(0);
    expect((await fresh.getDocument(a.learnerId, 'a-doc'))?.body).toBe(A_BODY);
  });

  it('importing the same export twice changes nothing (idempotent), and a second learner\'s export never mixes in', async () => {
    const { s, a, b } = await world(kind);
    const dump = await exportLearner(s.store, a.learnerId, { now: s.clock.now });
    const fresh = createMemoryStore({ now: s.clock.now });
    await importLearner(fresh, dump);
    const second = await importLearner(fresh, dump);
    expect(second.events.stored).toBe(0);
    expect(second.events.duplicates).toBe(dump.events.length);
    expect(await fresh.list({ learnerId: b.learnerId, limit: 100 })).toEqual([]);
    expect(text(dump)).not.toContain(B_BODY);
  });
});

describe.each(STORE_KINDS)('writing export (GoTell exportLearnerWriting) — %s store', (kind) => {
  const record = (draftId: string, title: string, textBody: string): DraftRecord => newVersion({
    draftId, languageId: 'sq', mode: 'free', title, text: '', versions: [], assistance: [], createdAt: '2026-10-09T08:00:00.000Z', updatedAt: '2026-10-09T08:00:00.000Z',
  }, textBody, () => ({ authorship: 'independent', assistance: [] }), 'dev', () => new Date('2026-10-09T08:00:00.000Z'));

  it('holds all of the learner\'s drafts and testimonies with their version history, not a deleted one, not another learner\'s, no token', async () => {
    const s = make(kind);
    const a = await signUp(s, 'writer@example.com', 'w-phone');
    const b = await signUp(s, 'other@example.com', 'o-phone');
    const idOf = (w: Learner) => ({ learnerId: w.learnerId, enrolmentId: w.enrolmentId, deviceId: w.deviceId, languageId: 'sq' });
    const st = createDraftStore({ api: a.api, identity: idOf(a), now: () => new Date('2026-10-09T08:00:00.000Z') });
    const d1 = record('d-one', 'Draft one', 'Unë lexoj librin.');
    const d2 = { ...record('d-two', 'Testimony', 'Unë kam një shtëpi.'), mode: 'testimony' as const };
    const d3 = record('d-gone', 'To delete', 'GONE-TEXT-5521 lexoj.');
    for (const d of [d1, d2, d3]) expect((await st.save(d, 0)).ok).toBe(true);
    const stb = createDraftStore({ api: b.api, identity: idOf(b), now: () => new Date('2026-10-09T08:00:00.000Z') });
    expect((await stb.save(record('b-one', 'Bravo draft', 'BRAVO-WRITING-3310'), 0)).ok).toBe(true);
    await st.remove('d-gone');
    const out = await exportLearnerWriting(a.api, { now: () => new Date('2026-10-09T08:05:00.000Z') });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.count).toBe(2);
    const parsed = JSON.parse(out.json) as { format: string; drafts: Array<{ docId: string; kind: string; record: DraftRecord }> };
    expect(parsed.format).toBe('gotell-writing-export');
    expect(parsed.drafts.map((d) => d.docId).sort()).toEqual(['d-one', 'd-two']);
    expect(parsed.drafts.find((d) => d.docId === 'd-two')?.kind).toBe('testimony');
    expect(parsed.drafts[0].record.versions.length).toBeGreaterThan(0);
    for (const forbidden of ['GONE-TEXT-5521', 'BRAVO-WRITING-3310', a.token, b.token, b.learnerId]) {
      expect(out.json).not.toContain(forbidden);
      expect(out.text).not.toContain(forbidden);
    }
    expect(out.text).toContain('Unë lexoj librin.');
  });
});
