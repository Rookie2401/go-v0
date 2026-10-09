// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AssistancePreferences, PrivateDocument } from '../../../packages/repository-contract/src';
import { conflictDocId, isConflictCopy, mergeDocument, mergePreferences, preferenceWinner } from '../../../packages/repository-sync/src';
import { FakeServer, LEARNER, makeClock, makeDevice } from './helpers';

const doc = (over: Partial<PrivateDocument> = {}): PrivateDocument => ({
  docId: 'draft-1', learnerId: LEARNER, languageId: 'es', kind: 'draft', title: 'Mi día', body: 'Hola.', revision: 1, deviceId: 'phone',
  updatedAt: '2026-10-08T12:00:00.000Z', ...over,
});

describe('mergeDocument rules', () => {
  it('nothing, or the same revision, is nothing', () => {
    expect(mergeDocument(undefined, undefined, false).action).toBe('keep-local');
    expect(mergeDocument(doc(), doc(), false).action).toBe('keep-local');
  });

  it('no local copy takes the remote; remote newer and local clean takes the remote', () => {
    expect(mergeDocument(undefined, doc(), false)).toMatchObject({ action: 'take-remote', keep: { revision: 1 } });
    expect(mergeDocument(doc(), doc({ revision: 3, body: 'x' }), false).action).toBe('take-remote');
    expect(mergeDocument(doc({ revision: 3 }), doc({ revision: 2 }), false).action).toBe('keep-local'); // a stale response never rolls back
  });

  it('local dirty on top of the remote revision is pushed (expectedRevision = remote.revision)', () => {
    const r = mergeDocument(doc({ revision: 3, body: 'mine' }), doc({ revision: 2 }), true);
    expect(r.action).toBe('push-local');
    expect(r.keep?.body).toBe('mine');
    expect(mergeDocument(doc({ revision: 1 }), undefined, true).action).toBe('push-local');
  });

  it('local dirty but the remote advanced is a conflict: remote keeps the docId, local text becomes a copy', () => {
    const local = doc({ revision: 2, body: 'local text', deviceId: 'phone' });
    const remote = doc({ revision: 2, body: 'remote text', deviceId: 'laptop' });
    const r = mergeDocument(local, remote, true);
    expect(r.action).toBe('conflict');
    expect(r.keep).toEqual(remote);
    expect(r.conflictCopy!.docId).toBe('draft-1:conflict:phone:2');
    expect(r.conflictCopy!.docId).toBe(conflictDocId(local));
    expect(isConflictCopy(r.conflictCopy!.docId)).toBe(true);
    expect(r.conflictCopy!.title).toBe('Mi día (conflict copy from phone)');
    expect(r.conflictCopy!.body).toBe('local text');
    expect(r.conflictCopy!.revision).toBe(1);
  });

  it('an explicit baseRevision decides "on top of": three coalesced local edits on revision 1 against remote 3 conflict', () => {
    const r = mergeDocument(doc({ revision: 9, body: 'many edits' }), doc({ revision: 3, body: 'other' }), true, 1);
    expect(r.action).toBe('conflict');
    expect(mergeDocument(doc({ revision: 9 }), doc({ revision: 3 }), true, 3).action).toBe('push-local');
  });

  it('identical content on both sides is not a conflict', () => {
    expect(mergeDocument(doc({ revision: 2 }), doc({ revision: 2 }), true).action).toBe('take-remote');
  });

  it('a local deletion against newer remote text leaves the text; a remote deletion against local edits keeps the local text as a copy', () => {
    const del = doc({ revision: 2, body: '', deletedAt: '2026-10-08T13:00:00.000Z' });
    expect(mergeDocument(del, doc({ revision: 2, body: 'newer text' }), true)).toMatchObject({ action: 'take-remote', keep: { body: 'newer text' } });
    const remoteDeleted = doc({ revision: 2, body: '', deletedAt: '2026-10-08T13:00:00.000Z', deviceId: 'laptop' });
    const r = mergeDocument(doc({ revision: 2, body: 'my edits' }), remoteDeleted, true);
    expect(r.action).toBe('conflict');
    expect(r.keep!.deletedAt).toBeTruthy();
    expect(r.conflictCopy).toMatchObject({ body: 'my edits' });
    expect(r.conflictCopy!.deletedAt).toBeUndefined();
  });
});

describe('document sync across two devices', () => {
  it('two devices editing one draft: the second to push gets a conflict copy, nothing is erased', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    const a = makeDevice('phone', server, clock); const b = makeDevice('laptop', server, clock);
    const base = { docId: 'draft-1', learnerId: LEARNER, languageId: 'es', kind: 'draft' as const, title: 'Mi día' };

    await a.docs.save({ ...base, body: 'Hola. Me llamo Ana.' });
    await a.client.syncOnce();
    await b.client.syncOnce();
    expect((await b.docs.get('draft-1'))!.doc.body).toBe('Hola. Me llamo Ana.');
    expect(server.docs.get('draft-1')!.revision).toBe(1);

    // offline divergence
    clock.advance(1000);
    await a.docs.save({ ...base, body: 'Hola. Me llamo Ana. Vivo en Madrid.' });
    clock.advance(1000);
    await b.docs.save({ ...base, body: 'Hola. Me llamo Ana. Tengo un gato.' });
    await b.docs.save({ ...base, body: 'Hola. Me llamo Ana. Tengo dos gatos.' }); // coalesces into the same pending revision
    expect((await b.docs.get('draft-1'))).toMatchObject({ baseRevision: 1, dirty: true, doc: { revision: 2 } });

    await a.client.syncOnce();   // A wins the race: revision 2 on the server
    const rb = await b.client.syncOnce();
    expect(rb.documents!.conflicts).toEqual([{ docId: 'draft-1', copyId: 'draft-1:conflict:laptop:2' }]);

    // the server holds both texts
    expect(server.docs.get('draft-1')!.body).toContain('Madrid');
    const copy = server.docs.get('draft-1:conflict:laptop:2')!;
    expect(copy.body).toBe('Hola. Me llamo Ana. Tengo dos gatos.');
    expect(copy.title).toBe('Mi día (conflict copy from laptop)');
    // B shows the remote under the docId and keeps the copy; both are clean now
    expect((await b.docs.get('draft-1'))).toMatchObject({ dirty: false, doc: { body: expect.stringContaining('Madrid') } });
    expect((await b.docs.get('draft-1:conflict:laptop:2'))).toMatchObject({ dirty: false });
    expect((await b.client.status()).conflictCopies).toEqual(['draft-1:conflict:laptop:2']);
    expect((await b.client.status()).dirtyDocuments).toBe(0);

    // A learns about the copy on its next sync; both devices end with both texts
    await a.client.syncOnce();
    expect((await a.docs.get('draft-1:conflict:laptop:2'))!.doc.body).toContain('dos gatos');
    expect((await a.docs.get('draft-1'))!.doc.body).toContain('Madrid');
  });

  it('a conflict found on pull (before pushing) is resolved the same way', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    const a = makeDevice('phone', server, clock); const b = makeDevice('laptop', server, clock);
    const base = { docId: 'n1', learnerId: LEARNER, languageId: 'es', kind: 'note' as const };
    await a.docs.save({ ...base, body: 'v1' }); await a.client.syncOnce(); await b.client.syncOnce();
    clock.advance(1000);
    await a.docs.save({ ...base, body: 'A edit' }); await a.client.syncOnce();
    await b.docs.save({ ...base, body: 'B edit' });
    await b.client.pull(); // the remote document arrives while B is dirty
    expect((await b.docs.get('n1'))!.doc.body).toBe('A edit');
    expect((await b.docs.get('n1:conflict:laptop:2'))).toMatchObject({ dirty: true, doc: { body: 'B edit' } });
    await b.client.pushDocuments();
    expect(server.docs.get('n1:conflict:laptop:2')!.body).toBe('B edit');
  });

  it('an edit made while the push is in flight stays dirty on top of the accepted revision', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    const a = makeDevice('phone', server, clock);
    const base = { docId: 'd', learnerId: LEARNER, languageId: 'es', kind: 'draft' as const };
    await a.docs.save({ ...base, body: 'first' });
    const orig = server.push.bind(server);
    server.push = async (req) => { const r = await orig(req); await a.docs.save({ ...base, body: 'second' }); return r; };
    await a.client.pushDocuments();
    server.push = orig;
    expect(await a.docs.get('d')).toMatchObject({ dirty: true, baseRevision: 1, doc: { revision: 2, body: 'second' } });
    await a.client.pushDocuments();
    expect(server.docs.get('d')).toMatchObject({ revision: 2, body: 'second' });
  });

  it('a document push that fails in transport keeps the document dirty and backs off', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    const a = makeDevice('phone', server, clock);
    await a.docs.save({ docId: 'd', learnerId: LEARNER, languageId: 'es', kind: 'draft', body: 'text' });
    server.failNext = 1;
    const r = await a.client.syncOnce({ force: true });
    expect(r.ok).toBe(false);
    expect((await a.client.status())).toMatchObject({ dirtyDocuments: 1, lastError: 'network down' });
    expect((await a.client.status()).nextRetryAt).toBeGreaterThan(clock.now());
    clock.advance(1500);
    expect((await a.client.syncOnce()).ok).toBe(true);
    expect(server.docs.get('d')!.body).toBe('text');
  });

  it('deleting a document is an edit like any other', async () => {
    const clock = makeClock(); const server = new FakeServer(clock);
    const a = makeDevice('phone', server, clock);
    await a.docs.save({ docId: 'd', learnerId: LEARNER, languageId: 'es', kind: 'draft', body: 'secret' });
    await a.client.syncOnce();
    await a.docs.remove('d');
    await a.client.syncOnce();
    expect(server.docs.get('d')).toMatchObject({ body: '', revision: 2 });
    expect(server.docs.get('d')!.deletedAt).toBeTruthy();
  });
});

describe('preference conflicts', () => {
  const prefs = (over: Partial<AssistancePreferences>): AssistancePreferences => ({
    learnerId: LEARNER, updatedAt: '2026-10-08T12:00:00.000Z',
    explanationDepth: { value: 'brief', origin: 'default' },
    terminology: { value: 'plain', origin: 'default' },
    transliteration: { value: 'on-request', origin: 'default' },
    pronunciationFirst: { value: false, origin: 'default' },
    translationAvailable: { value: true, origin: 'default' },
    visualAssistance: { value: 'standard', origin: 'default' },
    accessibility: { value: [], origin: 'default' },
    ...over,
  });

  it('explicit beats inferred beats default, whatever the timestamps', () => {
    const phone = { deviceId: 'phone', prefs: prefs({ updatedAt: '2026-10-01T00:00:00.000Z', explanationDepth: { value: 'explanatory', origin: 'explicit' } }) };
    const laptop = { deviceId: 'laptop', prefs: prefs({ updatedAt: '2026-10-08T00:00:00.000Z', explanationDepth: { value: 'label', origin: 'inferred', basis: '20 lookups' }, terminology: { value: 'grammatical', origin: 'inferred' } }) };
    const m = mergePreferences(phone, laptop);
    expect(m.explanationDepth).toEqual({ value: 'explanatory', origin: 'explicit' }); // older, but explicit
    expect(m.terminology.value).toBe('grammatical');                                  // inferred beats default
    expect(m.updatedAt).toBe('2026-10-08T00:00:00.000Z');
    expect(mergePreferences(laptop, phone)).toEqual(m);                                 // commutative
  });

  it('among explicit values the later updatedAt wins; a tie goes to the smaller deviceId', () => {
    const early = { deviceId: 'zeta', prefs: prefs({ updatedAt: '2026-10-01T00:00:00.000Z', terminology: { value: 'plain', origin: 'explicit' } }) };
    const late = { deviceId: 'alpha', prefs: prefs({ updatedAt: '2026-10-02T00:00:00.000Z', terminology: { value: 'grammatical', origin: 'explicit' } }) };
    expect(mergePreferences(early, late).terminology.value).toBe('grammatical');
    const tieA = { deviceId: 'alpha', prefs: prefs({ terminology: { value: 'grammatical', origin: 'explicit' } }) };
    const tieB = { deviceId: 'beta', prefs: prefs({ terminology: { value: 'plain', origin: 'explicit' } }) };
    expect(mergePreferences(tieA, tieB).terminology.value).toBe('grammatical');
    expect(mergePreferences(tieB, tieA).terminology.value).toBe('grammatical');
    expect(preferenceWinner({ origin: 'explicit', updatedAt: 'x', deviceId: 'a' }, { origin: 'explicit', updatedAt: 'x', deviceId: 'b' })).toBe(true);
  });

  it('merges field by field, so two devices that each set a different field both keep their choice', () => {
    const a = { deviceId: 'phone', prefs: prefs({ updatedAt: '2026-10-02T00:00:00.000Z', transliteration: { value: 'always', origin: 'explicit' } }) };
    const b = { deviceId: 'laptop', prefs: prefs({ updatedAt: '2026-10-03T00:00:00.000Z', pronunciationFirst: { value: true, origin: 'explicit' } }) };
    const m = mergePreferences(a, b);
    expect(m.transliteration.value).toBe('always');
    expect(m.pronunciationFirst.value).toBe(true);
  });
});
