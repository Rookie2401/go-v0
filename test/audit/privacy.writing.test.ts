// @vitest-environment node
/**
 * Privacy audit (7) private writing access: another learner, an anonymous request, a revoked or garbage token and a mission-team
 * leader account must all be refused every document, and no refusal may disclose whether the document exists or what it says.
 * The writing itself is GoTell's real draft store (each draft is one private document whose body is the JSON of the draft).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createDraftStore, exportLearnerWriting, newVersion, type DraftRecord } from '../../packages/gotell/src';
import {
  STORE_KINDS, createStack, lookup, makeTeam, raw, serverEvents, signUp, tablesContaining, text,
  type Learner, type Stack, type StoreKind,
} from './privacy.support';

const stacks: Stack[] = [];
const make = (kind: StoreKind): Stack => { const s = createStack(kind); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const PHRASE = 'Zoti im është bariu, TESTIMONY-PHRASE-8830';
const TITLE = 'Dëshmia ime TITLE-8830';
const now = () => new Date('2026-10-09T08:00:00.000Z');
const idOf = (w: Learner) => ({ learnerId: w.learnerId, enrolmentId: w.enrolmentId, deviceId: w.deviceId, languageId: 'sq' });

interface World { s: Stack; owner: Learner; other: Learner; leader: Learner; revoked: string; secrets: string[] }

async function world(kind: StoreKind): Promise<World> {
  const s = make(kind);
  const owner = await signUp(s, 'owner@example.com', 'o-phone');
  const other = await signUp(s, 'other@example.com', 'x-phone');
  const leader = await signUp(s, 'leader@example.com', 'l-phone');
  await makeTeam(s, 'albania', [{ who: owner, role: 'member' }, { who: leader, role: 'leader' }]);
  const rec: DraftRecord = newVersion({ draftId: 'testimony-1', languageId: 'sq', mode: 'testimony', title: TITLE, text: '', versions: [], assistance: [], createdAt: now().toISOString(), updatedAt: now().toISOString() }, PHRASE, () => ({ authorship: 'independent', assistance: [] }), owner.deviceId, now);
  const saved = await createDraftStore({ api: owner.api, identity: idOf(owner), now }).save(rec, 0);
  expect(saved.ok).toBe(true);
  expect((await owner.api.putDocument('note-1', { languageId: 'sq', kind: 'note', body: 'NOTE-BODY-8830', title: 'NOTE-TITLE-8830' }, 0)).ok).toBe(true);
  // a token that used to work and was revoked
  const second = await s.api().createSession({ email: other.email, password: other.password, deviceId: 'x-old' });
  const revoked = second.ok ? second.data.token : '';
  await s.api(revoked).deleteSession();
  return { s, owner, other, leader, revoked, secrets: [PHRASE, TITLE, 'testimony-1', 'NOTE-BODY-8830', 'NOTE-TITLE-8830', 'note-1', owner.learnerId, owner.email] };
}

type Call = [method: string, path: string, body?: unknown];
const documentCalls = (): Call[] => [
  ['GET', '/documents'], ['GET', '/documents/testimony-1'], ['GET', '/documents/note-1'],
  ['PUT', '/documents/testimony-1', { doc: { languageId: 'sq', kind: 'draft', body: 'hijack' }, expectedRevision: 1 }],
  ['DELETE', '/documents/testimony-1'], ['DELETE', '/documents/note-1'],
  ['GET', '/export'], ['POST', '/sync/pull', { deviceId: 'x-phone', afterSeq: 0 }],
];

describe.each(STORE_KINDS)('private writing access — %s store', (kind) => {
  it('an anonymous request, a garbage token and a revoked token are refused on every document route, and the refusal says nothing about the document', async () => {
    const w = await world(kind);
    const tokens: Array<string | undefined> = [undefined, 'garbage', w.revoked, w.revoked.slice(0, -2) + 'xx', ''];
    for (const token of tokens) {
      for (const [method, path, body] of [...documentCalls(), ['POST', '/writing', { observation: {} }] as Call]) {
        const r = await raw(w.s, method, path, { ...(token ? { token } : {}), ...(body !== undefined ? { body } : {}) });
        expect(r.status, `${method} ${path} with ${token === undefined ? 'no token' : `token ${token.slice(0, 6)}…`}`).toBe(401);
        for (const secret of w.secrets) expect(r.text).not.toContain(secret);
        expect(r.body.error).toBe('unauthorized');
      }
    }
    expect((await w.owner.api.getDocument('testimony-1')).ok).toBe(true);
  });

  it('another learner and a team leader are refused: not found, indistinguishable from a document that never existed, nothing changed', async () => {
    const w = await world(kind);
    const before = await w.owner.api.exportAll();
    for (const who of [w.other, w.leader]) {
      for (const id of ['testimony-1', 'note-1']) {
        const real = await raw(w.s, 'GET', `/documents/${id}`, { token: who.token });
        const none = await raw(w.s, 'GET', `/documents/never-existed-${id}`, { token: who.token });
        expect(real.status).toBe(404);
        expect(real.status).toBe(none.status);
        expect({ ...real.body, message: real.body.message }).toEqual(none.body);        // same error, same message: no existence oracle
        const del = await raw(w.s, 'DELETE', `/documents/${id}`, { token: who.token });
        expect(del.status).toBe(404);
        for (const secret of w.secrets) { expect(real.text).not.toContain(secret); expect(del.text).not.toContain(secret); }
      }
      const list = await who.api.listDocuments();
      expect(list.ok && list.data.documents.map((d) => d.docId)).toEqual([]);
    }
    const after = await w.owner.api.exportAll();
    expect(before.ok && after.ok).toBe(true);
    if (before.ok && after.ok) expect({ ...after.data, exportedAt: 0 }).toEqual({ ...before.data, exportedAt: 0 });
  });

  it('no view the other learner or the leader has (list, export, sync pull, events, knowledge, GoTell\'s own list/load/export) contains a word of the writing', async () => {
    const w = await world(kind);
    for (const who of [w.other, w.leader]) {
      const views = [
        await who.api.listDocuments(), await who.api.exportAll(), await who.api.syncPull({ deviceId: who.deviceId, afterSeq: 0, documentsSince: '2000-01-01T00:00:00.000Z' }),
        await who.api.listEvents({ limit: 1000 }), await who.api.knowledge(), await who.api.me(),
      ];
      const t = text(views);
      for (const secret of w.secrets) expect(t, `${secret} reached ${who.email}`).not.toContain(secret);
      const store = createDraftStore({ api: who.api, identity: idOf(who), now });
      expect(await store.list()).toEqual([]);
      expect(await store.load('testimony-1')).toBeUndefined();
      const out = await exportLearnerWriting(who.api, { now });
      expect(out.ok && out.count).toBe(0);
      expect(out.ok && out.json + out.text).not.toContain(PHRASE);
    }
  });

  it('a PUT, a sync push or a /writing from another learner naming the owner\'s document id writes the writer\'s OWN document and never the owner\'s', async () => {
    const w = await world(kind);
    const put = await w.other.api.putDocument('testimony-1', { languageId: 'sq', kind: 'draft', body: 'OTHER-WRITES-THIS' }, 0);
    expect(put.ok).toBe(true);
    const push = await w.leader.api.syncPush({ deviceId: w.leader.deviceId, events: [], documents: [{ doc: { docId: 'note-1', learnerId: w.leader.learnerId, languageId: 'sq', kind: 'note', body: 'LEADER-WRITES-THIS', revision: 1, deviceId: w.leader.deviceId, updatedAt: w.s.clock.now() }, expectedRevision: 0 }], clientTime: w.s.clock.now() });
    expect(push.ok).toBe(true);
    const mine = await w.owner.api.getDocument('testimony-1');
    expect(mine.ok && mine.data.document.body).toContain(PHRASE);
    expect(mine.ok && mine.data.document.revision).toBe(1);
    expect(mine.ok && mine.data.document.learnerId).toBe(w.owner.learnerId);
    const note = await w.owner.api.getDocument('note-1');
    expect(note.ok && note.data.document.body).toBe('NOTE-BODY-8830');
    // the writers' copies are theirs
    const theirs = await w.other.api.getDocument('testimony-1');
    expect(theirs.ok && theirs.data.document.body).toBe('OTHER-WRITES-THIS');
  });

  it('the writing is in no event, no knowledge row, no log line and (SQLite) nowhere in the file except the document row itself', async () => {
    const w = await world(kind);
    // the owner also records evidence about the draft, as GoTell does: counts and hashes, never text
    expect((await w.owner.api.appendEvents([lookup(idOf(w.owner), { kind: 'DraftSaved', producer: { app: 'gopractice-tell', version: '1', deviceId: w.owner.deviceId }, subject: { draftId: 'testimony-1' }, payload: { draftId: 'testimony-1', mode: 'testimony', wordCount: 7, sentenceCount: 1 } })])).ok).toBe(true);
    const events = text(await serverEvents(w.s, w.owner.learnerId));
    expect(events).not.toContain(PHRASE);
    expect(events).not.toContain('TESTIMONY-PHRASE');
    expect(text(await w.s.store.getKnowledge(w.owner.learnerId))).not.toContain('TESTIMONY-PHRASE');
    expect(w.s.logs.join('\n')).not.toContain('TESTIMONY-PHRASE');
    if (w.s.file) {
      expect(tablesContaining(w.s, 'TESTIMONY-PHRASE')).toEqual(['documents']);   // exactly one place: the owner's document row
    }
  });

  it('the owner can still read and export everything after every attack above (the refusals changed nothing)', async () => {
    const w = await world(kind);
    for (const who of [w.other, w.leader]) for (const [method, path, body] of documentCalls()) await raw(w.s, method, path, { token: who.token, ...(body !== undefined ? { body } : {}) });
    const out = await exportLearnerWriting(w.owner.api, { now });
    expect(out.ok && out.count).toBe(2);                                    // the draft and the plain note: every private document of the learner
    expect(out.ok && out.text).toContain(PHRASE);
    const note = await w.owner.api.getDocument('note-1');
    expect(note.ok && note.data.document.body).toBe('NOTE-BODY-8830');
  });
});
