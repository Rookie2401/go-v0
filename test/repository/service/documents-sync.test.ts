// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PrivateDocument } from '../../../packages/repository-contract/src';
import { createHarness, makeEvent, raw, signUp } from './fakes';

describe('documents', () => {
  it('creates at revision 0, updates with the right revision, and answers a stale write with 409 and the current version', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const created = await s.api.putDocument('d1', { languageId: 'sq', kind: 'testimony', title: 'Day one', body: 'first' }, 0);
    expect(created.ok && created.data.document).toMatchObject({ docId: 'd1', revision: 1, learnerId: s.learnerId, deviceId: 'dev-1' });
    expect(created.ok && created.data.document).not.toHaveProperty('body');
    const v2 = await s.api.putDocument('d1', { languageId: 'sq', kind: 'testimony', body: 'second' }, 1);
    expect(v2.ok && v2.data.document.revision).toBe(2);
    h.clock.advance(5000);
    const stale = await raw(h, 'PUT', '/documents/d1', { token: s.token, body: { doc: { languageId: 'sq', kind: 'testimony', body: 'from a stale device' }, expectedRevision: 1 } });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: 'conflict', current: { docId: 'd1', revision: 2, body: 'second' } });
    const now = await s.api.getDocument('d1');
    expect(now.ok && now.data.document.body).toBe('second');
    // creating over an existing document with expectedRevision 0 is a conflict too
    expect((await raw(h, 'PUT', '/documents/d1', { token: s.token, body: { doc: { languageId: 'sq', kind: 'note', body: 'x' }, expectedRevision: 0 } })).status).toBe(409);
  });

  it('lists metadata without bodies, returns the body on GET, and deletes', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    await s.api.putDocument('d1', { languageId: 'sq', kind: 'draft', body: 'BODY ONE' }, 0);
    await s.api.putDocument('d2', { languageId: 'sq', kind: 'note', body: 'BODY TWO' }, 0);
    const list = await s.api.listDocuments();
    expect(list.ok && list.data.documents.map((d) => d.docId).sort()).toEqual(['d1', 'd2']);
    expect(JSON.stringify(list)).not.toContain('BODY');
    expect((await s.api.deleteDocument('d1')).ok).toBe(true);
    const gone = await s.api.getDocument('d1');
    expect(!gone.ok && gone.status).toBe(404);
    expect((await s.api.deleteDocument('d1')).ok).toBe(false);
    const after = await s.api.listDocuments();
    expect(after.ok && after.data.documents.map((d) => d.docId)).toEqual(['d2']);
    // the body is physically gone from the store
    expect(h.store.dump()).not.toContain('BODY ONE');
  });

  it('validates the document and the address', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const put = (id: string, body: unknown) => raw(h, 'PUT', `/documents/${id}`, { token: s.token, body });
    expect((await put('d1', { doc: { docId: 'other', languageId: 'sq', kind: 'note', body: 'x' }, expectedRevision: 0 })).body.error).toBe('id-mismatch');
    expect((await put('d1', { doc: { languageId: 'sq', kind: 'poem', body: 'x' }, expectedRevision: 0 })).status).toBe(422);
    expect((await put('d1', { doc: { languageId: 'sq', kind: 'note', body: 5 }, expectedRevision: 0 })).status).toBe(422);
    expect((await put('d1', { doc: { languageId: 'sq', kind: 'note', body: 'x' } })).status).toBe(422);
    expect((await put('d1', { doc: { languageId: 'sq', kind: 'note', body: 'x' }, expectedRevision: -1 })).status).toBe(422);
    expect((await put('d1', { expectedRevision: 0 })).status).toBe(422);
  });
});

describe('POST /sync/push', () => {
  const pushBody = (h: ReturnType<typeof createHarness>, over: Record<string, unknown> = {}) => ({ deviceId: 'dev-1', clientTime: h.clock.now(), events: [], ...over });

  it('reports the clock skew of a client an hour ahead, and keeps the events as the client stamped them', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const ahead = new Date(Date.parse(h.clock.now()) + 3_600_000).toISOString();
    const ev = makeEvent({ learnerId: s.learnerId, enrolmentId: s.enrolmentId }, { at: ahead });
    const r = await s.api.syncPush({ deviceId: 'dev-1', clientTime: ahead, events: [ev] });
    expect(r.ok && r.data.clockSkewMs).toBe(3_600_000);
    expect(r.ok && r.data.serverTime).toBe(h.clock.now());
    expect(r.ok && r.data.outcomes).toEqual([{ id: ev.id, stored: true }]);
    expect(r.ok && r.data.head).toBe(2);
    const stored = await h.store.get(s.learnerId, ev.id);
    expect(stored?.at).toBe(ahead);
    expect(stored?.recordedAt).toBe(h.clock.now());
    const behind = await s.api.syncPush({ deviceId: 'dev-1', clientTime: new Date(Date.parse(h.clock.now()) - 90_000).toISOString(), events: [] });
    expect(behind.ok && behind.data.clockSkewMs).toBe(-90_000);
  });

  it('folds after a push, dedupes a replay, and stamps the device', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const ev = makeEvent({ learnerId: s.learnerId, enrolmentId: s.enrolmentId });
    const before = h.engine.projectCalls.length;
    await s.api.syncPush({ deviceId: 'dev-1', clientTime: h.clock.now(), events: [ev] });
    expect(h.engine.projectCalls.length).toBe(before + 1);
    const again = await s.api.syncPush({ deviceId: 'dev-1', clientTime: h.clock.now(), events: [ev] });
    expect(again.ok && again.data.outcomes[0]).toMatchObject({ stored: false, duplicateOf: ev.id });
    expect((await h.store.getDevice(s.learnerId, 'dev-1'))?.lastSyncAt).toBe(h.clock.now());
  });

  it('applies documents under the revision rule and reports each result', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    await s.api.putDocument('d1', { languageId: 'sq', kind: 'draft', body: 'server v1' }, 0);
    const doc = (docId: string, body: string) => ({ docId, learnerId: s.learnerId, languageId: 'sq', kind: 'draft' as const, body, revision: 0, deviceId: 'dev-1', updatedAt: h.clock.now() });
    const r = await s.api.syncPush({ deviceId: 'dev-1', clientTime: h.clock.now(), events: [], documents: [{ doc: doc('d1', 'stale'), expectedRevision: 0 }, { doc: doc('d2', 'new'), expectedRevision: 0 }] });
    expect(r.ok && r.data.documents).toHaveLength(2);
    expect(r.ok && r.data.documents[0]).toMatchObject({ docId: 'd1', ok: false, current: { revision: 1, body: 'server v1' } });
    expect(r.ok && r.data.documents[1]).toEqual({ docId: 'd2', ok: true });
    expect((await s.api.getDocument('d2')).ok).toBe(true);
    expect((await h.store.getDocument(s.learnerId, 'd1'))?.body).toBe('server v1');
  });

  it('rejects an invalid batch whole, a bad clientTime, and another learner or device', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const who = { learnerId: s.learnerId, enrolmentId: s.enrolmentId };
    const good = makeEvent(who);
    const calls = h.store.appendCalls;
    const bad = await raw(h, 'POST', '/sync/push', { token: s.token, body: pushBody(h, { events: [good, makeEvent(who, { id: '' })] }) });
    expect(bad.status).toBe(422);
    expect(bad.body.issues[0].index).toBe(1);
    expect(h.store.appendCalls).toBe(calls);
    expect(await h.store.get(s.learnerId, good.id)).toBeUndefined();
    expect((await raw(h, 'POST', '/sync/push', { token: s.token, body: pushBody(h, { clientTime: 'yesterday-ish' }) })).status).toBe(422);
    expect((await raw(h, 'POST', '/sync/push', { token: s.token, body: pushBody(h, { deviceId: 'someone-elses' }) })).status).toBe(403);
    expect((await raw(h, 'POST', '/sync/push', { token: s.token, body: pushBody(h, { documents: [{ doc: { languageId: 'sq', kind: 'x', body: '' }, expectedRevision: 0 }] }) })).status).toBe(422);
  });
});

describe('POST /sync/pull', () => {
  it('pages through the log by seq without gaps or repeats', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const who = { learnerId: s.learnerId, enrolmentId: s.enrolmentId };
    const events = Array.from({ length: 24 }, () => makeEvent(who));
    await s.api.syncPush({ deviceId: 'dev-1', clientTime: h.clock.now(), events });
    const seen: number[] = [];
    let afterSeq = 0;
    let pages = 0;
    for (;;) {
      const r = await s.api.syncPull({ deviceId: 'dev-1', afterSeq, limit: 10 });
      if (!r.ok) throw new Error('pull failed');
      pages++;
      expect(r.data.events.length).toBeLessThanOrEqual(10);
      expect(r.data.head).toBe(25);
      expect(r.data.serverTime).toBe(h.clock.now());
      if (!r.data.events.length) break;
      seen.push(...r.data.events.map((e) => e.seq));
      afterSeq = r.data.events[r.data.events.length - 1].seq;
    }
    expect(seen).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(pages).toBe(4);
  });

  it('returns documents updated since a time, deleted ones without their body', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    await s.api.putDocument('old', { languageId: 'sq', kind: 'note', body: 'OLD BODY' }, 0);
    h.clock.advance(60_000);
    const cut = h.clock.now();
    h.clock.advance(60_000);
    await s.api.putDocument('new', { languageId: 'sq', kind: 'note', body: 'NEW BODY' }, 0);
    await s.api.putDocument('gone', { languageId: 'sq', kind: 'note', body: 'GONE BODY' }, 0);
    await s.api.deleteDocument('gone');
    const all = await s.api.syncPull({ deviceId: 'dev-1', afterSeq: 0 });
    expect(all.ok && all.data.documents.map((d) => d.docId).sort()).toEqual(['gone', 'new', 'old']);
    const since = await s.api.syncPull({ deviceId: 'dev-1', afterSeq: 0, documentsSince: cut });
    expect(since.ok && since.data.documents.map((d) => d.docId).sort()).toEqual(['gone', 'new']);
    const gone = since.ok ? (since.data.documents.find((d) => d.docId === 'gone') as PrivateDocument) : undefined;
    expect(gone?.deletedAt).toBeDefined();
    expect(gone?.body).toBe('');
    expect(since.ok && since.data.documents.find((d) => d.docId === 'new')?.body).toBe('NEW BODY');
  });

  it('validates its request', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const pull = (body: unknown) => raw(h, 'POST', '/sync/pull', { token: s.token, body });
    expect((await pull({ deviceId: 'dev-1' })).status).toBe(422);
    expect((await pull({ deviceId: 'dev-1', afterSeq: -3 })).status).toBe(422);
    expect((await pull({ deviceId: 'dev-1', afterSeq: 0, limit: 0 })).status).toBe(422);
    expect((await pull({ deviceId: 'dev-1', afterSeq: 0, documentsSince: 'soon' })).status).toBe(422);
    // an over-large limit is clamped to 1000
    expect((await pull({ deviceId: 'dev-1', afterSeq: 0, limit: 50_000 })).status).toBe(200);
  });
});
