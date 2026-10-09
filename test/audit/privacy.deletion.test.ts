// @vitest-environment node
/**
 * Privacy audit (2) deletion: a private document, the whole account, tombstones, and what another device sees afterwards.
 * Real service, real stores (memory and SQLite, the SQLite file is read back through a second connection), real sync client
 * and GoTell's real syncing draft store.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { GoEvent, Tombstone } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { applyTombstone } from '../../packages/repository-store/src';
import {
  createDraftStore, createLocalDraftStore, createSyncingDraftStore, newVersion, type DraftRecord,
} from '../../packages/gotell/src';
import { createMemoryArea } from '../../packages/repository-sync/src';
import {
  PASSWORD, STORE_KINDS, addDevice, bytesPresent, createDevice, createNet, createStack, dumpStore, lookup, raw, review, rowCounts, serverEvents, signUp, tablesContaining, text,
  type Learner, type Stack, type StoreKind,
} from './privacy.support';

const stacks: Stack[] = [];
const make = (kind: StoreKind): Stack => { const s = createStack(kind); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const BODY = 'DOC-BODY-SECRET-5150';
const TITLE = 'DOC-TITLE-SECRET-5150';

async function withDoc(who: Learner, docId = 'd1'): Promise<void> {
  const r = await who.api.putDocument(docId, { languageId: 'sq', kind: 'draft', body: BODY, title: TITLE }, 0);
  expect(r.ok).toBe(true);
}

describe.each(STORE_KINDS)('document deletion — %s store', (kind) => {
  it('is gone from list and get, tombstoned in the store (no body, deletedAt set, revision advanced), and absent from a later export body', async () => {
    const s = make(kind);
    const a = await signUp(s, 'alpha@example.com', 'a-phone');
    await withDoc(a);
    expect((await a.api.listDocuments()).ok && (await a.api.listDocuments())).toBeTruthy();
    expect((await a.api.deleteDocument('d1')).ok).toBe(true);
    const list = await a.api.listDocuments();
    expect(list.ok && list.data.documents.map((d) => d.docId)).toEqual([]);
    const got = await a.api.getDocument('d1');
    expect(got.ok).toBe(false);
    expect(got.ok ? 0 : got.status).toBe(404);
    expect((await a.api.deleteDocument('d1')).ok).toBe(false); // already deleted
    const held = await s.store.getDocument(a.learnerId, 'd1');
    expect(held?.deletedAt).toBeTruthy();
    expect(held?.body).toBe('');
    expect(held?.revision).toBe(2);
    const ex = await a.api.exportAll();
    expect(ex.ok).toBe(true);
    if (ex.ok) {
      expect(text(ex.data)).not.toContain(BODY);
      const d = (ex.data.documents as Array<{ docId: string; body: string; deletedAt?: string }>).find((x) => x.docId === 'd1');
      expect(d?.body).toBe('');
      expect(d?.deletedAt).toBeTruthy();
    }
    expect(await dumpStore(s, [a.learnerId])).not.toContain(BODY);
  });

  // DEFECT P-03: the tombstone row keeps the document's TITLE (the learner's own words: "My testimony about …"), its id, kind
  // and device; it is in the store file, in GET /export and in the next /sync/pull of every device.
  it('P-03 (fixed): a deleted document keeps none of the learner\'s words, title included', async () => {
    const s = make(kind);
    const a = await signUp(s, 'alpha@example.com', 'a-phone');
    await withDoc(a);
    expect((await a.api.deleteDocument('d1')).ok).toBe(true);
    const ex = await a.api.exportAll();
    expect(ex.ok && text(ex.data)).not.toContain(TITLE);
    expect(await dumpStore(s, [a.learnerId])).not.toContain(TITLE);
    const pull = await a.api.syncPull({ deviceId: a.deviceId, afterSeq: 0 });
    expect(pull.ok && text(pull.data)).not.toContain(TITLE);
  });

  it('a stale PUT with the old revision cannot bring the deleted text back', async () => {
    const s = make(kind);
    const a = await signUp(s, 'alpha@example.com', 'a-phone');
    await withDoc(a);
    expect((await a.api.deleteDocument('d1')).ok).toBe(true);
    const back = await a.api.putDocument('d1', { languageId: 'sq', kind: 'draft', body: BODY, title: TITLE }, 1);
    expect(back.ok).toBe(false);
    expect(back.ok ? 0 : back.status).toBe(409);
    expect((await a.api.getDocument('d1')).ok).toBe(false);
    expect(await dumpStore(s, [a.learnerId])).not.toContain(BODY);
  });

  // DEFECT P-04: a deletion made through the sync client's own document store (`LocalDocuments.remove`, documented as "pushed like
  // any edit") is sent with `deletedAt`, but the service's `parseDocument` keeps no client-sent field except body and title. The
  // server therefore stores an EMPTY, LIVE document (revision + 1, title kept): still listed, not tombstoned, and no other
  // device is ever told it was deleted. (GoTell does not use this path: it calls DELETE /documents/:id, tested below.)
  it('P-04 (fixed): a document deleted through the sync client is deleted on the server and on the learner\'s other device', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a1 = await signUp(s, 'alpha@example.com', 'a-phone');
    const a2 = await addDevice(s, a1, 'a-laptop');
    const phone = createDevice(a1, net);
    const laptop = createDevice(a2, net);
    await phone.docs.save({ docId: 'd1', learnerId: a1.learnerId, languageId: 'sq', kind: 'draft', title: TITLE, body: BODY });
    expect((await phone.client.syncOnce()).ok).toBe(true);
    s.clock.advance(1000);
    expect((await laptop.client.syncOnce()).ok).toBe(true);
    expect((await laptop.docs.get('d1'))?.doc.body).toBe(BODY);
    s.clock.advance(1000);
    await phone.docs.remove('d1');
    expect((await phone.client.syncOnce()).ok).toBe(true);
    s.clock.advance(1000);
    expect((await laptop.client.syncOnce()).ok).toBe(true);
    expect((await s.store.getDocument(a1.learnerId, 'd1'))?.deletedAt).toBeTruthy();   // tombstoned on the server
    const list = await a1.api.listDocuments();
    expect(list.ok && list.data.documents.map((d) => d.docId)).toEqual([]);              // no longer listed
    expect((await laptop.docs.get('d1'))?.doc.deletedAt).toBeTruthy();                  // the other device knows
  });

  it('what that path does deliver: the text is gone from the server and from the other device (the empty shell is not)', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a1 = await signUp(s, 'alpha@example.com', 'a-phone');
    const a2 = await addDevice(s, a1, 'a-laptop');
    const phone = createDevice(a1, net);
    const laptop = createDevice(a2, net);
    await phone.docs.save({ docId: 'd1', learnerId: a1.learnerId, languageId: 'sq', kind: 'draft', title: 'T', body: BODY });
    await phone.client.syncOnce(); s.clock.advance(1000);
    await laptop.client.syncOnce(); s.clock.advance(1000);
    await phone.docs.remove('d1');
    await phone.client.syncOnce(); s.clock.advance(1000);
    await laptop.client.syncOnce();
    expect((await laptop.docs.get('d1'))?.doc.body).toBe('');
    expect(text(laptop.area.dump())).not.toContain(BODY);
    expect(await dumpStore(s, [a1.learnerId])).not.toContain(BODY);
  });

  // DEFECT P-05: /sync/pull returns documents with `updatedAt > documentsSince` (strictly greater) and the client's cursor is the
  // newest `updatedAt` it has seen. A document written in the same millisecond as that cursor, after the device pulled, is never
  // delivered. Server time has millisecond resolution; the clock is frozen here to make the coincidence deterministic.
  it('P-05 (fixed): a document written in the same millisecond as the device\'s cursor still reaches that device', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a1 = await signUp(s, 'alpha@example.com', 'a-phone');
    const a2 = await addDevice(s, a1, 'a-laptop');
    const phone = createDevice(a1, net);
    const laptop = createDevice(a2, net);
    await phone.docs.save({ docId: 'first', learnerId: a1.learnerId, languageId: 'sq', kind: 'draft', body: 'one' });
    await phone.client.syncOnce();
    await laptop.client.syncOnce();                                                       // the laptop's cursor is now this millisecond
    await phone.docs.save({ docId: 'second', learnerId: a1.learnerId, languageId: 'sq', kind: 'draft', body: 'two' });
    await phone.client.syncOnce();                                                        // server time has not moved
    await laptop.client.syncOnce();
    expect((await laptop.docs.get('second'))?.doc.body).toBe('two');
  });

  it('GoTell: the deletion on one device removes the draft from the other device\'s list and local copy', async () => {
    const s = make(kind);
    const a1 = await signUp(s, 'alpha@example.com', 'a-phone');
    const a2 = await addDevice(s, a1, 'a-laptop');
    const idOf = (w: Learner) => ({ learnerId: w.learnerId, enrolmentId: w.enrolmentId, deviceId: w.deviceId, languageId: 'sq' });
    const now = () => new Date(s.clock.ms());
    const stores = (w: Learner) => {
      const local = createLocalDraftStore(createMemoryArea(), { identity: idOf(w), now });
      const syncing = createSyncingDraftStore({ local, remote: createDraftStore({ api: w.api, identity: idOf(w), now }), now });
      return { local, syncing };
    };
    const phone = stores(a1);
    const laptop = stores(a2);
    const rec: DraftRecord = newVersion({ draftId: 'g1', languageId: 'sq', mode: 'free', title: 'T', text: '', versions: [], assistance: [], createdAt: now().toISOString(), updatedAt: now().toISOString() }, 'Unë lexoj librin.', () => ({ authorship: 'independent', assistance: [] }), a1.deviceId, now);
    expect((await phone.syncing.save(rec, 0)).ok).toBe(true);
    s.clock.advance(1000);
    await laptop.syncing.sync();
    expect((await laptop.local.list()).map((d) => d.docId)).toEqual(['g1']);
    s.clock.advance(1000);
    await phone.syncing.remove('g1');
    expect(await phone.syncing.pendingPush()).toEqual([]);
    s.clock.advance(1000);
    const out = await laptop.syncing.sync();
    expect(out.pull.removed).toContain('g1');
    expect((await laptop.local.list()).map((d) => d.docId)).toEqual([]);
    expect(await laptop.local.load('g1')).toBeUndefined();
    expect(text((laptop.local.area as unknown as ReturnType<typeof createMemoryArea>).dump())).not.toContain('Unë lexoj librin.');
  });

  it('FINDING: an offline edit on a device that had not yet seen the deletion survives as a conflict copy; the deleted docId stays deleted', async () => {
    const s = make(kind);
    const a1 = await signUp(s, 'alpha@example.com', 'a-phone');
    const a2 = await addDevice(s, a1, 'a-laptop');
    const idOf = (w: Learner) => ({ learnerId: w.learnerId, enrolmentId: w.enrolmentId, deviceId: w.deviceId, languageId: 'sq' });
    const now = () => new Date(s.clock.ms());
    const stores = (w: Learner) => {
      const local = createLocalDraftStore(createMemoryArea(), { identity: idOf(w), now });
      return createSyncingDraftStore({ local, remote: createDraftStore({ api: w.api, identity: idOf(w), now }), now });
    };
    const phone = stores(a1);
    const laptop = stores(a2);
    const base: DraftRecord = { draftId: 'g1', languageId: 'sq', mode: 'free', title: 'T', text: '', versions: [], assistance: [], createdAt: now().toISOString(), updatedAt: now().toISOString() };
    const v1 = newVersion(base, 'Unë lexoj.', () => ({ authorship: 'independent', assistance: [] }), a1.deviceId, now);
    expect((await phone.save(v1, 0)).ok).toBe(true);
    s.clock.advance(1000);
    await laptop.sync();
    const mine = (await laptop.load('g1'))!;
    s.clock.advance(1000);
    await phone.remove('g1');                                                         // deleted on the server
    s.clock.advance(1000);
    const edited = newVersion(mine.record, 'OFFLINE-EDIT-AFTER-DELETE lexoj.', () => ({ authorship: 'independent', assistance: [] }), a2.deviceId, now);
    const saved = await laptop.save(edited, mine.revision);                          // the laptop has not pulled: it pushes on top of revision 1
    expect(saved.ok).toBe(false);                                                     // told it conflicted
    expect((await laptop.pendingPush()).some((id) => id.includes(':conflict:'))).toBe(true); // the copy is waiting on the device, not lost
    await laptop.push();
    expect((await a1.api.getDocument('g1')).ok).toBe(false);                         // the deleted docId stays deleted
    const docs = await a1.api.listDocuments();
    const copies = docs.ok ? docs.data.documents.filter((d) => d.docId.includes(':conflict:')) : [];
    expect(copies.length).toBe(1);                                                    // the text lives on as an explicit copy the learner can see and delete
  });
});

describe.each(STORE_KINDS)('account deletion (DELETE /me) — %s store', (kind) => {
  async function world() {
    const s = make(kind);
    const a = await signUp(s, 'alpha@example.com', 'a-phone');
    const a2 = await addDevice(s, a, 'a-laptop');
    const b = await signUp(s, 'bravo@example.com', 'b-phone');
    await s.store.putTeam({ teamId: 't1', name: 'T1', createdAt: s.clock.now() });
    await s.store.putTeamMember('t1', a.learnerId, 'member', s.clock.now());
    await s.store.putTeamMember('t1', b.learnerId, 'leader', s.clock.now());
    const evs: GoEvent[] = [lookup(a), review(a), review(a, { correct: false })];
    expect((await a.api.appendEvents(evs)).ok).toBe(true);
    await withDoc(a, 'a-doc');
    expect((await a.api.putTombstone({ kind: 'event', id: 'x' })).ok).toBe(true);
    expect((await b.api.appendEvents([lookup(b)])).ok).toBe(true);
    expect((await b.api.putDocument('b-doc', { languageId: 'sq', kind: 'note', body: 'BRAVO-KEEPS-THIS', title: 'b' }, 0)).ok).toBe(true);
    return { s, a, a2, b, evs };
  }

  it('a wrong or missing confirmation deletes nothing', async () => {
    const { s, a } = await world();
    const before = (await serverEvents(s, a.learnerId)).length;
    const wrong = await a.api.deleteMe('someone-else@example.com');
    expect(wrong.ok).toBe(false);
    expect(wrong.ok ? 0 : wrong.status).toBe(422);
    const missing = await raw(s, 'DELETE', '/me', { token: a.token, body: {} });
    expect(missing.status).toBe(422);
    const empty = await raw(s, 'DELETE', '/me', { token: a.token });
    expect([400, 422]).toContain(empty.status);
    expect((await serverEvents(s, a.learnerId)).length).toBe(before);
    expect((await a.api.me()).ok).toBe(true);
    expect((await a.api.getDocument('a-doc')).ok).toBe(true);
  });

  it('erases events, documents, knowledge, enrolments, devices, tombstones, team membership and every session; the file keeps nothing of the learner', async () => {
    const { s, a, a2, evs } = await world();
    const del = await a.api.deleteMe(a.email.toUpperCase()); // the confirmation is case-insensitive like the sign-in
    expect(del.ok).toBe(true);
    expect(del.ok ? del.status : 0).toBe(204);
    expect(await s.store.list({ learnerId: a.learnerId, limit: 1000 })).toEqual([]);
    expect(await s.store.getKnowledge(a.learnerId)).toEqual([]);
    expect(await s.store.listDocuments(a.learnerId)).toEqual([]);
    expect(await s.store.listEnrolments(a.learnerId)).toEqual([]);
    expect(await s.store.listTombstones(a.learnerId)).toEqual([]);
    expect(await s.store.getLearner(a.learnerId)).toBeUndefined();
    expect((await s.store.listTeamMembers('t1')).map((m) => m.learnerId)).toEqual([(await s.store.listTeamMembers('t1'))[0].learnerId]);
    expect((await s.store.listTeamMembers('t1')).some((m) => m.learnerId === a.learnerId)).toBe(false);
    for (const who of [a, a2]) {
      const me = await who.api.me();
      expect(me.ok).toBe(false);
      expect(me.ok ? 0 : me.status).toBe(401);                       // both devices' tokens are dead
      expect((await who.api.syncPull({ deviceId: who.deviceId, afterSeq: 0 })).ok).toBe(false);
    }
    const signIn = await s.api().createSession({ email: a.email, password: PASSWORD, deviceId: 'a-phone' });
    expect(signIn.ok).toBe(false);
    const counts = rowCounts(s, a.learnerId);
    if (counts) for (const [table, n] of Object.entries(counts)) expect(n, `${table} rows left for the erased learner`).toBe(0);
    const dump = await dumpStore(s, [a.learnerId]);
    for (const secret of [a.learnerId, a.email, a.accountId, a.enrolmentId, 'a-phone', 'a-laptop', BODY, TITLE, ...evs.map((e) => e.id), a.token, a2.token]) {
      expect(dump, `${secret} must not survive the erasure`).not.toContain(secret);
    }
    if (kind === 'sqlite') {
      const { createHash } = await import('node:crypto');
      for (const token of [a.token, a2.token]) expect(dump).not.toContain(createHash('sha256').update(token).digest('hex'));
    }
  });

  it('leaves every other learner, their team and their documents exactly as they were', async () => {
    const { s, b, a } = await world();
    const before = await b.api.exportAll();
    expect((await a.api.deleteMe(a.email)).ok).toBe(true);
    const after = await b.api.exportAll();
    expect(before.ok && after.ok).toBe(true);
    if (before.ok && after.ok) {
      const strip = (d: Record<string, unknown>) => ({ ...d, exportedAt: 0 });
      expect(strip(after.data)).toEqual(strip(before.data));
    }
    expect((await s.store.listTeamMembers('t1')).length).toBe(1);
    expect((await b.api.getDocument('b-doc')).ok).toBe(true);
  });

  it('releases the email: a new account with it starts empty and cannot see the old data', async () => {
    const { s, a } = await world();
    expect((await a.api.deleteMe(a.email)).ok).toBe(true);
    const again = await signUp(s, a.email, 'a-new-phone');
    expect(again.learnerId).not.toBe(a.learnerId);
    const ex = await again.api.exportAll();
    expect(ex.ok).toBe(true);
    if (ex.ok) {
      const kinds = (ex.data.events as GoEvent[]).map((e) => e.kind);
      expect(kinds).toEqual(['EnrolmentChanged']);
      expect(ex.data.documents).toEqual([]);
      expect(text(ex.data)).not.toContain(BODY);
    }
  });

  it('no log line the service wrote mentions the account\'s email, id or token', async () => {
    const { s, a } = await world();
    expect((await a.api.deleteMe(a.email)).ok).toBe(true);
    const logs = s.logs.join('\n');
    for (const secret of [a.email, a.learnerId, a.token]) expect(logs).not.toContain(secret);
    expect(logs).toMatch(/^DELETE \/me 204 /m);
  });
});

describe.each(STORE_KINDS)('deletion instructions (tombstones) — %s store', (kind) => {
  // DEFECT P-02: POST /tombstones answers 201 for an event, a source or a range, and deletes nothing. The service README says
  // so ("records the instruction; it deletes nothing by itself"), but REPOSITORY-API-AND-OPERATIONS §5 promises "per source,
  // range or event through tombstones that the store applies physically", the store package has `applyTombstone` for exactly
  // this, and nothing calls it. A learner who asks to forget a book reading history is told 201 and keeps all of it.
  it('P-02 (fixed): an event tombstone sent to the API removes the event, and the projection no longer counts it', async () => {
    const s = make(kind);
    const a = await signUp(s, 'alpha@example.com', 'a-phone');
    const ev = review(a, { correct: true });
    expect((await a.api.appendEvents([ev])).ok).toBe(true);
    const before = await a.api.knowledge(['lemma:sq:libër:NOUN']);
    expect(before.ok && before.data.knowledge.length).toBe(1);
    expect((await a.api.putTombstone({ kind: 'event', id: ev.id })).ok).toBe(true);
    expect((await serverEvents(s, a.learnerId)).some((e) => e.id === ev.id)).toBe(false);
    const after = await a.api.knowledge(['lemma:sq:libër:NOUN']);
    expect(after.ok && after.data.knowledge.length).toBe(0);
  });

  it('P-02 (fixed): a source tombstone sent to the API removes every event naming that source', async () => {
    const s = make(kind);
    const a = await signUp(s, 'alpha@example.com', 'a-phone');
    const ev = lookup(a, { subject: { itemIds: ['form:sq:shtëpinë'], sentenceKey: 'ab12', sourceRef: { kind: 'web', title: 'A private page', locator: '/private' } } });
    expect((await a.api.appendEvents([ev])).ok).toBe(true);
    expect((await a.api.putTombstone({ kind: 'source', sourceRef: { kind: 'web', title: 'A private page' } })).ok).toBe(true);
    expect((await serverEvents(s, a.learnerId)).some((e) => e.id === ev.id)).toBe(false);
  });

  it('the instruction is at least recorded, owned by the caller, and listed in the export', async () => {
    const s = make(kind);
    const a = await signUp(s, 'alpha@example.com', 'a-phone');
    const t = await a.api.putTombstone({ kind: 'event', id: 'some-event' }, 'please forget');
    expect(t.ok).toBe(true);
    const ex = await a.api.exportAll();
    expect(ex.ok && (ex.data.tombstones as Tombstone[]).map((x) => x.learnerId)).toEqual([a.learnerId]);
  });

  it('the store-level deletion (applyTombstone) does what the API does not: removes the event, drops the projection and refuses the id afterwards', async () => {
    const s = make(kind);
    const a = await signUp(s, 'alpha@example.com', 'a-phone');
    const keep = review(a, { correct: true });
    const gone = review(a, { correct: false, subject: { itemIds: ['lemma:sq:shtëpi:NOUN'], cardId: 'c2' } });
    expect((await a.api.appendEvents([keep, gone])).ok).toBe(true);
    const t: Tombstone = { tombstoneId: 'ts-1', learnerId: a.learnerId, scope: { kind: 'event', id: gone.id }, createdAt: s.clock.now() };
    const res = await applyTombstone(s.store, t);
    expect(res.events).toBe(1);
    const ids = (await serverEvents(s, a.learnerId)).map((e) => e.id);
    expect(ids).toContain(keep.id);
    expect(ids).not.toContain(gone.id);
    expect(await s.store.getKnowledge(a.learnerId)).toEqual([]);                     // dropped, to be refolded
    await createProjectionEngine({ store: s.store, now: s.clock.now }).project(a.learnerId);
    const rows = await s.store.getKnowledge(a.learnerId);
    expect(rows.map((r) => r.unitId)).toEqual(['lemma:sq:libër:NOUN']);              // only what survived
    const again = await a.api.appendEvents([gone]);                                   // a stale device re-sends it
    expect(again.ok && again.data.stored).toBe(0);
  });
});

describe('physical erasure in the SQLite file', () => {
  // The looked-up surface is NOT a needle: since the certification fix (`registerSurfaces`) a SelectionLookedUp event registers the surface in the
  // SHARED linguistic tables (units, analyses), which carry no learner id and are not the learner's rows (see the FINDING test below).
  const NEEDLES = ['erase-me@example.com', 'ERASE-TITLE-5150', 'ERASE-BODY-5150', 'ERASE-DEDUPE-5150'];
  const SURFACE = 'erasemeword';

  async function erased() {
    const s = make('sqlite');
    const a = await signUp(s, 'erase-me@example.com', 'a-phone');
    expect((await a.api.putDocument('d1', { languageId: 'sq', kind: 'draft', body: 'ERASE-BODY-5150', title: 'ERASE-TITLE-5150' }, 0)).ok).toBe(true);
    expect((await a.api.appendEvents([lookup(a, { dedupeKey: 'ERASE-DEDUPE-5150', payload: { surface: 'erasemeword', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] } })])).ok).toBe(true);
    expect(bytesPresent(s, NEEDLES)['-wal']?.length).toBeGreaterThan(0);          // sanity: the probe can see the learner's data while it exists
    expect((await a.api.deleteDocument('d1')).ok).toBe(true);
    expect((await a.api.deleteMe(a.email)).ok).toBe(true);
    return s;
  }

  it('the SQL view is clean after DELETE /me (no table holds any needle)', async () => {
    const s = await erased();
    for (const n of NEEDLES) expect(tablesContaining(s, n), n).toEqual([]);
  });

  it('FINDING: the word the learner looked up stays in the shared linguistic tables only (units, analyses), with no learner id', async () => {
    const s = await erased();
    expect(tablesContaining(s, SURFACE).sort()).toEqual(['analyses', 'units']);
  });

  // DEFECT P-11: erasure is logical. Neither the document deletion nor DELETE /me sets `PRAGMA secure_delete`, checkpoints the
  // write-ahead log or vacuums, so the learner's plaintext (email, document title, event keys, and until the next checkpoint the
  // document body too) stays in `repository.sqlite-wal` and, after a checkpoint, in the free pages of `repository.sqlite`.
  it('P-11 (fixed): after DELETE /me and a checkpoint, no byte of the learner\'s email, title or event keys remains in the database file or its WAL', async () => {
    const s = await erased();
    const found = bytesPresent(s, NEEDLES, { checkpoint: true });
    expect(Object.values(found).flat()).toEqual([]);
  });

  it('P-11 (fixed): straight after DELETE /me (no checkpoint yet) the write-ahead log does not hold the deleted document body', async () => {
    const s = await erased();
    expect(bytesPresent(s, ['ERASE-BODY-5150'])['-wal']).toEqual([]);
  });

  it('P-11: deleting one document (account kept) already removes its title and body from the log and the file', async () => {
    const s = make('sqlite');
    const a = await signUp(s, 'keep-me@example.com', 'a-phone');
    expect((await a.api.putDocument('d1', { languageId: 'sq', kind: 'draft', body: 'DOC-ONLY-BODY-7', title: 'DOC-ONLY-TITLE-7' }, 0)).ok).toBe(true);
    expect(bytesPresent(s, ['DOC-ONLY-BODY-7'])['-wal']?.length).toBeGreaterThan(0);
    expect((await a.api.deleteDocument('d1')).ok).toBe(true);
    expect(Object.values(bytesPresent(s, ['DOC-ONLY-BODY-7', 'DOC-ONLY-TITLE-7'])).flat()).toEqual([]);
    expect(bytesPresent(s, ['keep-me@example.com']).main).toContain('keep-me@example.com');   // the account is still there, of course
  });

  it('P-11: compact() (the operator VACUUM step) leaves a store that still opens, holds the remaining learner and none of the erased one', async () => {
    const s = await erased();
    const keep = await signUp(s, 'survivor@example.com', 'b-phone');
    expect((await keep.api.putDocument('k1', { languageId: 'sq', kind: 'note', body: 'SURVIVOR-BODY', title: 'SURVIVOR-TITLE' }, 0)).ok).toBe(true);
    await (s.store as { compact?: () => Promise<void> }).compact!();
    expect((await keep.api.getDocument('k1')).ok).toBe(true);
    expect(Object.values(bytesPresent(s, NEEDLES)).flat()).toEqual([]);
  });
});
