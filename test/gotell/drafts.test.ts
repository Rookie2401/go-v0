/** Autosaved drafts: private, per learner + language, never evidence and never a version. */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { DraftConflictError } from '../../src/gotell';
import { makeWorld } from './fakes';
import { esAdapter, esStoryA, thAdapter } from './fixtures';

const FORBIDDEN = /not found or not owned|not permitted/;

describe('drafts: persistence', () => {
  it('no draft until one is saved; save upserts with a monotonic seq', async () => {
    const w = await makeWorld([esAdapter()]);
    expect(await w.gotell.getDraft('A', 'es')).toBeUndefined();
    const d1 = await w.gotell.saveDraft('A', 'es', 'Yo no');
    expect(d1).toMatchObject({ id: ids.draft('A', 'es'), userId: 'A', lang: 'es', text: 'Yo no', seq: 1 });
    expect(d1.basedOnRevisionId).toBeUndefined();
    const d2 = await w.gotell.saveDraft('A', 'es', 'Yo no sé');
    expect(d2.seq).toBe(2);
    expect(d2.updatedAt >= d1.updatedAt).toBe(true);
    expect(await w.gotell.getDraft('A', 'es')).toEqual(d2);
    expect(await w.store.drafts.count()).toBe(1); // one row per learner + language
  });

  it('saving a draft is never evidence and never a version', async () => {
    const w = await makeWorld([esAdapter()]);
    await esStoryA(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const textsBefore = await w.store.texts.count();
    const eventsBefore = (await w.store.events.all()).length;
    for (let i = 0; i < 25; i++) await w.gotell.saveDraft('A', 'es', `Yo no sé ${'x'.repeat(i)}`);
    await w.gotell.clearDraft('A', 'es');
    await w.gotell.saveDraft('A', 'es', 'La casa.');
    expect((await w.store.events.all()).length).toBe(eventsBefore); // not one event
    expect(await w.store.texts.count()).toBe(textsBefore);
    expect(await w.store.suggestions.count()).toBe(0);
    expect(await w.gotell.listRevisions(t.id)).toEqual([]);
    expect((await w.store.testimonies.get(t.id))!.currentRevisionId).toBeUndefined();
  });

  it('survives a "reload": a new GoTell over the same store sees the draft', async () => {
    const w = await makeWorld([esAdapter()]);
    await w.gotell.saveDraft('A', 'es', 'Mi historia');
    const { createGoTell } = await import('../../src/gotell');
    const again = createGoTell({ store: w.store, bus: w.bus, adapters: w.registry, golearn: w.golearn });
    expect((await again.getDraft('A', 'es'))!.text).toBe('Mi historia');
  });

  it('clearDraft removes the draft but keeps seq monotonic (a later draft can never reuse an old seq)', async () => {
    const w = await makeWorld([esAdapter()]);
    await w.gotell.saveDraft('A', 'es', 'uno');
    await w.gotell.saveDraft('A', 'es', 'dos');
    await w.gotell.clearDraft('A', 'es');
    expect(await w.gotell.getDraft('A', 'es')).toBeUndefined();
    const d = await w.gotell.saveDraft('A', 'es', 'tres');
    expect(d.seq).toBe(4);
    await w.gotell.clearDraft('A', 'es');
    await w.gotell.clearDraft('A', 'es'); // clearing nothing is fine
    expect(await w.gotell.getDraft('A', 'es')).toBeUndefined();
  });
});

describe('drafts: conflicts', () => {
  it('a stale tab cannot overwrite newer writing: DraftConflict, and the newer draft is untouched', async () => {
    const w = await makeWorld([esAdapter()]);
    const a = await w.gotell.saveDraft('A', 'es', 'Yo', { expectedSeq: 0 });
    expect(a.seq).toBe(1);
    const tab1 = await w.gotell.saveDraft('A', 'es', 'Yo no', { expectedSeq: 1 });
    const tab2 = w.gotell.saveDraft('A', 'es', 'Yo no sé (stale)', { expectedSeq: 1 }); // another tab still at seq 1
    await expect(tab2).rejects.toMatchObject({ name: 'DraftConflict' });
    await expect(tab2).rejects.toBeInstanceOf(DraftConflictError);
    const err = await w.gotell.saveDraft('A', 'es', 'x', { expectedSeq: 1 }).then(() => undefined, (e: unknown) => e as DraftConflictError);
    expect(err).toBeInstanceOf(DraftConflictError);
    expect(err!.name).toBe('DraftConflict');
    expect(err!.current?.seq).toBe(2);
    expect(err!.current?.text).toBe('Yo no');
    expect(err!.expectedSeq).toBe(1);
    expect((await w.gotell.getDraft('A', 'es'))!).toEqual(tab1);
    // the tab that re-reads and retries succeeds
    const retry = await w.gotell.saveDraft('A', 'es', 'Yo no sé', { expectedSeq: 2 });
    expect(retry.seq).toBe(3);
  });

  it('without expectedSeq the save always wins (explicit overwrite)', async () => {
    const w = await makeWorld([esAdapter()]);
    await w.gotell.saveDraft('A', 'es', 'uno');
    await w.gotell.saveDraft('A', 'es', 'dos');
    expect((await w.gotell.saveDraft('A', 'es', 'tres')).seq).toBe(3);
  });

  it('a cleared draft holds no writing, so a tab that expected the old one is not refused', async () => {
    const w = await makeWorld([esAdapter()]);
    await w.gotell.saveDraft('A', 'es', 'uno');
    await w.gotell.clearDraft('A', 'es');
    const d = await w.gotell.saveDraft('A', 'es', 'nuevo', { expectedSeq: 1 });
    expect(d.text).toBe('nuevo');
    expect(d.seq).toBe(3);
  });
});

describe('drafts: isolation and ownership', () => {
  it('per learner and per language: independent text and independent seq', async () => {
    const w = await makeWorld([esAdapter(), thAdapter()]);
    await w.gotell.saveDraft('A', 'es', 'A en español');
    await w.gotell.saveDraft('A', 'es', 'A en español 2');
    await w.gotell.saveDraft('A', 'th', 'ฉันรู้จัก');
    await w.gotell.saveDraft('B', 'es', 'B en español');
    expect((await w.gotell.getDraft('A', 'es'))).toMatchObject({ text: 'A en español 2', seq: 2 });
    expect((await w.gotell.getDraft('A', 'th'))).toMatchObject({ text: 'ฉันรู้จัก', seq: 1 });
    expect((await w.gotell.getDraft('B', 'es'))).toMatchObject({ text: 'B en español', seq: 1 });
    await w.gotell.clearDraft('A', 'es');
    expect(await w.gotell.getDraft('A', 'es')).toBeUndefined();
    expect((await w.gotell.getDraft('A', 'th'))!.text).toBe('ฉันรู้จัก'); // switching language back restores it
    expect((await w.gotell.getDraft('B', 'es'))!.text).toBe('B en español');
    expect(await w.gotell.getDraft('B', 'th')).toBeUndefined();
  });

  it('a user-bound GoTell cannot read, write, clear or restore another learner\'s draft', async () => {
    const w = await makeWorld([esAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const rev = await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    await w.gotell.saveDraft('A', 'es', 'secreto');
    const asB = w.gotell.forUser('B');
    await expect(asB.getDraft('A', 'es')).rejects.toThrow(FORBIDDEN);
    await expect(asB.saveDraft('A', 'es', 'hack')).rejects.toThrow(FORBIDDEN);
    await expect(asB.clearDraft('A', 'es')).rejects.toThrow(FORBIDDEN);
    await expect(asB.restoreRevisionAsDraft(rev.id)).rejects.toThrow(FORBIDDEN);
    expect((await w.gotell.getDraft('A', 'es'))!.text).toBe('secreto');
    // B cannot base his own draft on A's revision either
    await expect(w.gotell.saveDraft('B', 'es', 'x', { basedOnRevisionId: rev.id })).rejects.toThrow(FORBIDDEN);
    await expect(w.gotell.forUser('A').getDraft('A', 'es')).resolves.toMatchObject({ text: 'secreto' });
  });
});

describe('drafts and versions', () => {
  it('acceptRevision keeps the draft, marks what it is based on, and does not make the writer\'s tab stale', async () => {
    const w = await makeWorld([esAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const d = await w.gotell.saveDraft('A', 'es', 'Yo no sé.');
    const rev = await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    const after = (await w.gotell.getDraft('A', 'es'))!;
    expect(after.text).toBe('Yo no sé.');
    expect(after.basedOnRevisionId).toBe(rev.id);
    expect(after.seq).toBe(d.seq); // unchanged: the tab that saved the version can keep autosaving
    const next = await w.gotell.saveDraft('A', 'es', 'Yo no sé. La casa.', { expectedSeq: d.seq });
    expect(next.basedOnRevisionId).toBe(rev.id); // keeps descending from that version
  });

  it('with no draft, acceptRevision does not invent one', async () => {
    const w = await makeWorld([esAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    expect(await w.gotell.getDraft('A', 'es')).toBeUndefined();
  });

  it('restoreRevisionAsDraft copies a version into the working draft; the version, history and evidence are untouched', async () => {
    const w = await makeWorld([esAdapter()]);
    await esStoryA(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const r1 = await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    const r2 = await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa.');
    await w.gotell.saveDraft('A', 'es', 'algo a medio escribir');
    const eventsBefore = (await w.store.events.all()).length;
    const textsBefore = await w.store.texts.count();
    const snapshot = structuredClone(await w.gotell.listRevisions(t.id));

    const d = await w.gotell.restoreRevisionAsDraft(r1.id);
    expect(d.text).toBe('Yo no sé.');
    expect(d.basedOnRevisionId).toBe(r1.id);
    expect(d.seq).toBeGreaterThan(1);
    expect((await w.gotell.getDraft('A', 'es'))!.text).toBe('Yo no sé.');
    expect(await w.gotell.listRevisions(t.id)).toEqual(snapshot);
    expect((await w.store.testimonies.get(t.id))!.currentRevisionId).toBe(r2.id);
    expect((await w.store.events.all()).length).toBe(eventsBefore);
    expect(await w.store.texts.count()).toBe(textsBefore);
  });

  it('restoring then saving the same text as a version creates a new revision (history only grows)', async () => {
    const w = await makeWorld([esAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const r1 = await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    await w.gotell.acceptRevision(t.id, 'La casa.');
    const d = await w.gotell.restoreRevisionAsDraft(r1.id);
    const r3 = await w.gotell.acceptRevision(t.id, d.text);
    expect(r3.number).toBe(3);
    expect(r3.parentRevisionId).toBe(ids.revision(t.id, 2));
  });

  it('an unknown revision cannot be restored', async () => {
    const w = await makeWorld([esAdapter()]);
    await expect(w.gotell.restoreRevisionAsDraft('tst:nope/r1')).rejects.toThrow(FORBIDDEN);
  });
});
