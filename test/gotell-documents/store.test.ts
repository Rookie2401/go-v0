import { describe, expect, it } from 'vitest';
import { createDraftStore, createLocalDraftStore, createSyncingDraftStore, DraftStoreError, newVersion, judgeFromAssistance, encodeRecord } from '../../packages/gotell/src/documents';
import type { DraftRecord } from '../../packages/gotell/src/types';
import { blankRecord, makeWorld } from './world';
import type { Device, World } from './world';

const T1 = '2026-10-09T09:00:00.000Z';

const withText = (r: DraftRecord, text: string, device: string, at = T1): DraftRecord => newVersion(r, text, judgeFromAssistance([]), device, at);

async function remoteStore(w: World, d: Device) { return createDraftStore({ api: d.netApi, identity: d.identity, now: w.clock.now }); }

describe('remote draft store (one private document per draft)', () => {
  it('round-trips a record through a PrivateDocument whose body is the record JSON', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    const store = await remoteStore(w, d);
    const rec = withText(blankRecord({ title: 'Familja ime' }), 'Unë kam një familje. Ajo është e madhe.', 'dev-1');
    const saved = await store.save(rec, 0);
    expect(saved).toEqual({ ok: true, revision: 1 });

    const doc = await d.api.getDocument(rec.draftId);
    expect(doc.ok && doc.data.document.kind).toBe('draft');
    expect(doc.ok && doc.data.document.title).toBe('Familja ime');
    expect(doc.ok && JSON.parse(doc.data.document.body)).toEqual(JSON.parse(encodeRecord(rec)));

    const loaded = await store.load(rec.draftId);
    expect(loaded?.revision).toBe(1);
    expect(loaded?.record).toEqual(rec);
    expect(loaded?.record.versions).toHaveLength(1);
  });

  it('stores testimony mode as the testimony kind and lists drafts and testimonies, newest first', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    const store = await remoteStore(w, d);
    const a = blankRecord({ mode: 'testimony', title: 'Dëshmia ime', text: 'Unë besoj.' });
    const b = blankRecord({ title: 'Letër', text: 'Të përshëndes.' });
    await store.save(a, 0);
    w.clock.advance(60_000);
    await store.save(b, 0);
    await d.api.putDocument('note-1', { languageId: 'sq', kind: 'note', body: 'a note' }, 0);
    await d.api.putDocument('other-lang', { languageId: 'es', kind: 'draft', body: 'hola' }, 0);

    const doc = await d.api.getDocument(a.draftId);
    expect(doc.ok && doc.data.document.kind).toBe('testimony');
    const list = await store.list();
    expect(list.map((x) => x.docId)).toEqual([b.draftId, a.draftId]);
    expect(list.map((x) => x.kind)).toEqual(['draft', 'testimony']);
  });

  it('turns a non-JSON body from an older client into { text: body, versions: [] }', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    const store = await remoteStore(w, d);
    await d.api.putDocument('old-1', { languageId: 'sq', kind: 'draft', title: 'Old', body: 'Plain text from an old client.\nSecond line.' }, 0);
    const loaded = await store.load('old-1');
    expect(loaded?.record.text).toBe('Plain text from an old client.\nSecond line.');
    expect(loaded?.record.versions).toEqual([]);
    expect(loaded?.record.assistance).toEqual([]);
    expect(loaded?.record.draftId).toBe('old-1');
    expect(loaded?.record.title).toBe('Old');
    expect(loaded?.record.languageId).toBe('sq');

    // JSON that is not a draft record is text too, never an error
    await d.api.putDocument('old-2', { languageId: 'sq', kind: 'draft', body: '"just a string"' }, 0);
    expect((await store.load('old-2'))?.record.text).toBe('"just a string"');
    await d.api.putDocument('old-3', { languageId: 'sq', kind: 'draft', body: '{"hello":1}' }, 0);
    expect((await store.load('old-3'))?.record.text).toBe('{"hello":1}');

    // saving the migrated record writes the new shape, the text intact
    const rec = loaded!.record;
    expect(await store.save({ ...rec, text: `${rec.text}\nThird line.` }, loaded!.revision)).toEqual({ ok: true, revision: 2 });
    expect((await store.load('old-1'))?.record.text).toContain('Third line.');
  });

  it('validates a JSON body leniently: a record with missing fields opens with defaults', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    const store = await remoteStore(w, d);
    await d.api.putDocument('partial', { languageId: 'sq', kind: 'draft', body: JSON.stringify({ text: 'Përshëndetje.', versions: [{ versionId: 'v1', text: 'Përshëndetje.' }, { nonsense: true }], mode: 'bogus' }) }, 0);
    const r = (await store.load('partial'))!.record;
    expect(r.text).toBe('Përshëndetje.');
    expect(r.mode).toBe('free');
    expect(r.versions.map((v) => v.versionId)).toEqual(['v1']);
    expect(r.versions[0].sentences).toEqual([]);
  });

  it('is optimistic: a stale save returns the current record and revision, and writes nothing', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    const store = await remoteStore(w, d);
    const rec = blankRecord({ text: 'one' });
    expect(await store.save(rec, 0)).toEqual({ ok: true, revision: 1 });
    expect(await store.save({ ...rec, text: 'two' }, 1)).toEqual({ ok: true, revision: 2 });
    const stale = await store.save({ ...rec, text: 'stale' }, 1);
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.current.revision).toBe(2);
      expect(stale.current.record.text).toBe('two');
    }
    expect((await store.load(rec.draftId))?.record.text).toBe('two');
    // a new draft cannot overwrite an existing id with expectedRevision 0
    const clash = await store.save({ ...rec, text: 'clash' }, 0);
    expect(clash.ok).toBe(false);
  });

  it('removes a draft; removing again is harmless; other failures throw a DraftStoreError', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    const store = await remoteStore(w, d);
    const rec = blankRecord({ text: 'bye' });
    await store.save(rec, 0);
    await store.remove(rec.draftId);
    expect(await store.load(rec.draftId)).toBeUndefined();
    expect((await store.list()).map((x) => x.docId)).not.toContain(rec.draftId);
    await expect(store.remove(rec.draftId)).resolves.toBeUndefined();

    d.offline.value = true;
    await expect(store.save(blankRecord(), 0)).rejects.toThrow();
    d.offline.value = false;
    const broken = createDraftStore({ api: { ...d.api, putDocument: async () => ({ ok: false, status: 422, error: 'invalid', message: 'nope', body: {} }) } as typeof d.api, identity: d.identity });
    await expect(broken.save(blankRecord(), 0)).rejects.toBeInstanceOf(DraftStoreError);
  });
});

describe('local draft store (offline)', () => {
  it('saves, loads, lists and removes on the device; a never-synced draft is purged outright', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    const local = createLocalDraftStore(d.area, { identity: d.identity, now: w.clock.now });
    const rec = blankRecord({ title: 'Offline', text: 'Shkruaj pa internet.' });
    expect(await local.save(rec, 0)).toEqual({ ok: true, revision: 1 });
    expect(await local.save({ ...rec, text: 'Shkruaj përsëri.' }, 1)).toEqual({ ok: true, revision: 1 }); // still the one pending revision
    expect((await local.load(rec.draftId))?.record.text).toBe('Shkruaj përsëri.');
    expect((await local.list()).map((x) => x.docId)).toEqual([rec.draftId]);
    const stale = await local.save({ ...rec, text: 'stale' }, 7);
    expect(stale.ok).toBe(false);
    await local.remove(rec.draftId);
    expect(await local.load(rec.draftId)).toBeUndefined();
    expect(await d.area.list('doc:')).toEqual([]);
  });
});

describe('syncing draft store', () => {
  async function syncing(w: World, d: Device) {
    const local = createLocalDraftStore(d.area, { identity: d.identity, now: w.clock.now });
    const remote = createDraftStore({ api: d.netApi, identity: d.identity, now: w.clock.now });
    return { local, remote, store: createSyncingDraftStore({ local, remote, now: w.clock.now }) };
  }

  it('saves locally while offline, keeps it pending, and pushes when the network returns', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    const { store } = await syncing(w, d);
    const rec = withText(blankRecord({ title: 'Pa rrjet' }), 'Sot jam në tren.', 'dev-1');

    d.offline.value = true;
    expect(await store.save(rec, 0)).toEqual({ ok: true, revision: 1 });
    expect(await store.pendingPush()).toEqual([rec.draftId]);
    expect((await store.load(rec.draftId))?.record.text).toBe('Sot jam në tren.');
    const none = await d.api.listDocuments();
    expect(none.ok && none.data.documents).toHaveLength(0);

    const failed = await store.push();
    expect(failed.failed).toHaveLength(1);
    expect(await store.pendingPush()).toEqual([rec.draftId]);

    d.offline.value = false;
    const pushed = await store.push();
    expect(pushed.pushed).toEqual([rec.draftId]);
    expect(await store.pendingPush()).toEqual([]);
    const onServer = await d.api.getDocument(rec.draftId);
    expect(onServer.ok && JSON.parse(onServer.data.document.body).text).toBe('Sot jam në tren.');
    expect((await store.load(rec.draftId))?.revision).toBe(1);

    // an online save pushes at once
    const again = await store.save({ ...rec, text: 'Sot jam në shtëpi.' }, 1);
    expect(again).toEqual({ ok: true, revision: 2 });
    expect(await store.pendingPush()).toEqual([]);
    const srv2 = await d.api.getDocument(rec.draftId);
    expect(srv2.ok && srv2.data.document.revision).toBe(2);
  });

  it('two devices that disagree: the remote keeps the docId, the local text is kept as a conflict copy', async () => {
    const w = await makeWorld();
    const a = await w.device('dev-a');
    const b = await w.device('dev-b');
    const sa = (await syncing(w, a)).store;
    const sb = (await syncing(w, b)).store;

    const rec = blankRecord({ title: 'Dëshmi', text: 'Original.' });
    await sa.save(rec, 0);
    await sb.pull();
    expect((await sb.load(rec.draftId))?.record.text).toBe('Original.');

    // A edits and syncs; B edits offline on the same base
    await sa.save({ ...rec, text: 'Edit from A.' }, 1);
    b.offline.value = true;
    const loadedB = (await sb.load(rec.draftId))!;
    expect(await sb.save({ ...loadedB.record, text: 'Edit from B, written offline.' }, loadedB.revision)).toEqual({ ok: true, revision: 2 });
    b.offline.value = false;

    const outcome = await sb.push();
    expect(outcome.conflicts).toHaveLength(1);
    const copyId = `${rec.draftId}:conflict:dev-b:2`;
    expect(outcome.conflicts[0].copyId).toBe(copyId);

    // B now shows A's text under the docId, and B's words under the copy; both are on the server
    expect((await sb.load(rec.draftId))?.record.text).toBe('Edit from A.');
    const copy = await sb.load(copyId);
    expect(copy?.record.text).toBe('Edit from B, written offline.');
    expect(copy?.record.draftId).toBe(copyId);
    expect(copy?.record.title).toContain('conflict copy from dev-b');
    const serverDocs = await a.api.listDocuments();
    expect(serverDocs.ok && serverDocs.data.documents.map((d) => d.docId).sort()).toEqual([copyId, rec.draftId].sort());
    const serverCopy = await a.api.getDocument(copyId);
    expect(serverCopy.ok && JSON.parse(serverCopy.data.document.body).text).toBe('Edit from B, written offline.');
    expect(await sb.pendingPush()).toEqual([]);
    expect(sb.conflicts()).toHaveLength(1);

    // A pulls and sees the copy too: nothing was lost anywhere
    await sa.pull();
    expect((await sa.list()).map((x) => x.docId).sort()).toEqual([copyId, rec.draftId].sort());
  });

  it('a save that meets a conflict returns the remote record as current, with the local text safe in the copy', async () => {
    const w = await makeWorld();
    const a = await w.device('dev-a');
    const b = await w.device('dev-b');
    const sa = (await syncing(w, a)).store;
    const sb = (await syncing(w, b)).store;
    const rec = blankRecord({ text: 'base' });
    await sa.save(rec, 0);
    await sb.pull();
    await sa.save({ ...rec, text: 'A wins the docId' }, 1);
    const r = await sb.save({ ...rec, text: 'B was online but stale' }, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.current.record.text).toBe('A wins the docId');
    const copy = await sb.load(`${rec.draftId}:conflict:dev-b:2`);
    expect(copy?.record.text).toBe('B was online but stale');
  });

  it('identical text written on both devices is not a conflict', async () => {
    const w = await makeWorld();
    const a = await w.device('dev-a');
    const b = await w.device('dev-b');
    const sa = (await syncing(w, a)).store;
    const sb = (await syncing(w, b)).store;
    const rec = blankRecord({ text: 'same' });
    await sa.save(rec, 0);
    await sb.pull();
    await sa.save({ ...rec, text: 'same words' }, 1);
    const r = await sb.save({ ...rec, text: 'same words' }, 1);
    expect(r.ok).toBe(false); // the remote's record is returned, but no copy is made
    expect(sb.conflicts()).toHaveLength(0);
    expect((await sb.list()).map((x) => x.docId)).toEqual([rec.draftId]);
  });

  it('deletes everywhere: online at once; offline pending until pushed; pull drops drafts deleted elsewhere', async () => {
    const w = await makeWorld();
    const a = await w.device('dev-a');
    const b = await w.device('dev-b');
    const sa = (await syncing(w, a)).store;
    const sb = (await syncing(w, b)).store;
    const one = blankRecord({ text: 'one' });
    const two = blankRecord({ text: 'two' });
    await sa.save(one, 0);
    await sa.save(two, 0);
    await sb.pull();

    await sa.remove(one.draftId);
    expect(await sa.load(one.draftId)).toBeUndefined();
    expect((await a.api.getDocument(one.draftId)).ok).toBe(false);
    expect(await sa.pendingPush()).toEqual([]);
    expect(await a.area.list('doc:')).toEqual([`doc:${two.draftId}`]);

    const pulled = await sb.pull();
    expect(pulled.removed).toEqual([one.draftId]);
    expect((await sb.list()).map((x) => x.docId)).toEqual([two.draftId]);

    a.offline.value = true;
    await sa.remove(two.draftId);
    expect(await sa.pendingPush()).toEqual([two.draftId]);
    expect(await sa.load(two.draftId)).toBeUndefined();
    a.offline.value = false;
    expect((await sa.push()).deleted).toEqual([two.draftId]);
    expect((await a.api.getDocument(two.draftId)).ok).toBe(false);
  });

  it('a deletion never overrides text written elsewhere; an edit against a remote deletion is kept as a copy', async () => {
    const w = await makeWorld();
    const a = await w.device('dev-a');
    const b = await w.device('dev-b');
    const sa = (await syncing(w, a)).store;
    const sb = (await syncing(w, b)).store;
    const keep = blankRecord({ text: 'v1' });
    const gone = blankRecord({ text: 'v1' });
    await sa.save(keep, 0);
    await sa.save(gone, 0);
    await sb.pull();

    // B deletes `keep` offline while A edits it
    b.offline.value = true;
    await sb.remove(keep.draftId);
    await sa.save({ ...keep, text: 'v2 from A' }, 1);
    b.offline.value = false;
    const r = await sb.push();
    expect(r.deleted).toEqual([]);
    expect((await sb.load(keep.draftId))?.record.text).toBe('v2 from A');

    // A deletes `gone` while B edits it offline
    await sa.remove(gone.draftId);
    b.offline.value = true;
    const loaded = (await sb.load(gone.draftId))!;
    await sb.save({ ...loaded.record, text: 'B kept writing' }, loaded.revision);
    b.offline.value = false;
    const r2 = await sb.push();
    expect(r2.conflicts).toHaveLength(1);
    expect((await sb.load(r2.conflicts[0].copyId))?.record.text).toBe('B kept writing');
    expect(await sb.load(gone.draftId)).toBeUndefined();
    expect((await a.api.getDocument(r2.conflicts[0].copyId)).ok).toBe(true);
  });
});
