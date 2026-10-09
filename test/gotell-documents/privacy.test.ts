import { describe, expect, it } from 'vitest';
import { createLocalDraftStore, createDraftStore, createSyncingDraftStore, newVersion } from '../../packages/gotell/src/documents';
import {
  RemoteAssistantGate, RemoteAssistanceNotConsented, deleteDraft, exportLearnerWriting, forgetDevice, gateRemoteAssistant, privacyStatement, redact,
} from '../../packages/gotell/src/privacy';
import type { ConsentGate, RemoteAssistant } from '../../packages/gotell/src/types';
import { correctionAccepted } from '../../packages/gotell/src/evidence';
import { createLocalQueue } from '../../packages/repository-sync/src';
import { blankRecord, makeWorld } from './world';

const SECRET_SENTENCE = 'Zoti është bariu im, nuk do të kem mungesë.';

describe('privacyStatement', () => {
  it('says what is stored where, what is never sent, and that team membership gives no access', () => {
    const s = privacyStatement();
    expect(s.sections.map((x) => x.heading)).toEqual(['What is stored, and where', 'What is never sent', 'Who can see it', 'Your control']);
    expect(s.text).toMatch(/private documents in your own account/);
    expect(s.text).toMatch(/counts and hashes only/);
    expect(s.text).toMatch(/never put in a learning event/);
    expect(s.text).toMatch(/Being in a team gives nobody access/);
    expect(s.text).toMatch(/Nothing you write is sent to an outside service/);
  });
});

describe('exportLearnerWriting', () => {
  it('contains every draft (every kind, conflict copies included) with its versions, and no token', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    const store = createDraftStore({ api: d.api, identity: d.identity });
    const a = newVersion(blankRecord({ title: 'Dëshmia', mode: 'testimony' }), SECRET_SENTENCE, () => ({ authorship: 'independent', assistance: [] }), 'dev-1', '2026-10-09T09:00:00.000Z');
    const b = newVersion(blankRecord({ title: 'Letër' }), 'Të dashur Ana. Si je?', () => ({ authorship: 'independent', assistance: [] }), 'dev-1', '2026-10-09T09:01:00.000Z');
    await store.save(a, 0);
    await store.save(b, 0);
    await d.api.putDocument('note-1', { languageId: 'sq', kind: 'note', body: 'plain note from an old client' }, 0);
    await d.api.putDocument(`${b.draftId}:conflict:dev-2:3`, { languageId: 'sq', kind: 'draft', title: 'Letër (conflict copy from dev-2)', body: 'text of the copy' }, 0);
    const gone = blankRecord({ text: 'deleted text' });
    await store.save(gone, 0);
    await store.remove(gone.draftId);

    const out = await exportLearnerWriting(d.api, { now: '2026-10-09T10:00:00.000Z' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.count).toBe(4);
    const bundle = JSON.parse(out.json);
    expect(bundle).toMatchObject({ format: 'gotell-writing-export', version: 1, exportedAt: '2026-10-09T10:00:00.000Z', count: 4 });
    expect(bundle.drafts.map((x: { docId: string }) => x.docId).sort()).toEqual([a.draftId, b.draftId, 'note-1', `${b.draftId}:conflict:dev-2:3`].sort());
    const exportedA = bundle.drafts.find((x: { docId: string }) => x.docId === a.draftId);
    expect(exportedA.kind).toBe('testimony');
    expect(exportedA.record.versions).toHaveLength(1);
    expect(exportedA.record.text).toBe(SECRET_SENTENCE);
    expect(bundle.drafts.find((x: { docId: string }) => x.docId === 'note-1').record.text).toBe('plain note from an old client');
    expect(out.json).not.toContain('deleted text');

    expect(out.text).toContain('Dëshmia');
    expect(out.text).toContain(SECRET_SENTENCE);
    expect(out.text).toContain('Të dashur Ana. Si je?');
    expect(out.text).toContain('text of the copy');
    expect(out.text).toContain('4 drafts');

    for (const blob of [out.json, out.text]) {
      expect(blob).not.toContain(d.token);
      expect(blob).not.toMatch(/Bearer|passwordHash|correct horse/);
    }
    expect(out.failed).toEqual([]);
  });

  it('reports a documented failure instead of throwing when the service cannot be reached', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    d.offline.value = true;
    const out = await exportLearnerWriting(d.netApi);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toMatch(/cannot be reached/);
  });
});

describe('deleteDraft', () => {
  it('removes the draft through the store, and reports a failure in words', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    const store = createDraftStore({ api: d.netApi, identity: d.identity });
    const rec = blankRecord({ text: SECRET_SENTENCE });
    await store.save(rec, 0);
    expect(await deleteDraft(store, rec.draftId)).toEqual({ ok: true });
    expect(await store.load(rec.draftId)).toBeUndefined();
    const stored = await w.deps.store.getDocument(w.learnerId, rec.draftId);
    expect(stored?.body).toBe(''); // the text is physically gone, not just hidden
    expect(stored?.deletedAt).toBeTruthy();

    d.offline.value = true;
    const r = await deleteDraft(store, 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBeTruthy();
  });
});

describe('forgetDevice', () => {
  it('clears local drafts, the document tombstones, the event queue and the sync cursors, and leaves other keys alone', async () => {
    const w = await makeWorld();
    const d = await w.device('dev-1');
    const local = createLocalDraftStore(d.area, { identity: d.identity, now: w.clock.now });
    const store = createSyncingDraftStore({ local, remote: createDraftStore({ api: d.netApi, identity: d.identity }) });
    d.offline.value = true;
    await store.save(blankRecord({ text: 'one' }), 0);
    await store.save(blankRecord({ text: 'two' }), 0);
    const queue = createLocalQueue(d.area, { now: () => Date.parse('2026-10-09T09:00:00.000Z') });
    const ev = correctionAccepted({ correctionId: 'c', issueIds: [], categories: [] }, d.identity, '2026-10-09T09:00:00.000Z');
    expect((await queue.enqueue(ev)).ok).toBe(true);
    await d.area.set({ 'sync:cursor': 12, 'sync:docsSince': '2026-10-09T09:00:00.000Z', 'ui:theme': 'dark', 'quarantine:x': {}, 'rejected:y': {} });

    const counts = await forgetDevice(d.area);
    expect(counts).toMatchObject({ drafts: 2, queued: 1, rejected: 1 });
    expect(counts.other).toBe(3); // quarantine row + two sync keys
    expect(Object.keys(await d.area.get(null))).toEqual(['ui:theme']);
    expect(await local.list()).toEqual([]);
    expect(await store.pendingPush()).toEqual([]);
    expect(await queue.size()).toBe(0);
  });
});

describe('RemoteAssistantGate', () => {
  function fake(): RemoteAssistant & { calls: Array<unknown> } {
    const calls: unknown[] = [];
    return { providerId: 'test-provider', calls, async propose(input) { calls.push(input); return [{ suggested: 'x', explanation: 'y', confidence: 0.5 }]; } };
  }

  it('refuses without consent, makes no call, and logs nothing of the text', async () => {
    const inner = fake();
    const logs: string[] = [];
    const consent: ConsentGate = { remoteAssistance: () => false };
    const gate = new RemoteAssistantGate(inner, consent, (l) => logs.push(l));
    await expect(gate.propose({ languageId: 'sq', sentence: SECRET_SENTENCE, intendedMeaning: 'The Lord is my shepherd' })).rejects.toBeInstanceOf(RemoteAssistanceNotConsented);
    expect(inner.calls).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs.join('\n')).not.toContain('Zoti');
    expect(logs.join('\n')).not.toContain('shepherd');
    expect(gate.providerId).toBe('test-provider');
  });

  it('reads consent on every call, passes the input through when granted, and logs lengths only', async () => {
    const inner = fake();
    const logs: string[] = [];
    let on = true;
    const gate = gateRemoteAssistant(inner, { remoteAssistance: () => on }, (l) => logs.push(l));
    const out = await gate.propose({ languageId: 'sq', sentence: SECRET_SENTENCE, intendedMeaning: 'The Lord is my shepherd' });
    expect(out).toHaveLength(1);
    expect(inner.calls).toEqual([{ languageId: 'sq', sentence: SECRET_SENTENCE, intendedMeaning: 'The Lord is my shepherd' }]);
    expect(logs.join('\n')).toMatch(/\[text withheld: 43 characters, 9 words\]/);
    expect(logs.join('\n')).not.toContain('Zoti');
    expect(logs.join('\n')).not.toContain('shepherd');

    on = false; // withdrawn between two calls
    await expect(gate.propose({ languageId: 'sq', sentence: 'Përshëndetje.' })).rejects.toThrow(/Remote assistance is off/);
    expect(inner.calls).toHaveLength(1);
  });

  it('logs a provider failure by name only and rethrows', async () => {
    const logs: string[] = [];
    const broken: RemoteAssistant = { providerId: 'p', async propose() { throw new RangeError(`leaked ${SECRET_SENTENCE}`); } };
    const gate = new RemoteAssistantGate(broken, { remoteAssistance: () => true }, (l) => logs.push(l));
    await expect(gate.propose({ languageId: 'sq', sentence: 'x' })).rejects.toThrow(RangeError);
    expect(logs.join('\n')).not.toContain('Zoti');
    expect(logs.join('\n')).toContain('RangeError');
  });
});

describe('redact', () => {
  it('reports lengths only', () => {
    expect(redact(SECRET_SENTENCE)).toBe('[text withheld: 43 characters, 9 words]');
    expect(redact('Po')).toBe('[text withheld: 2 characters, 1 word]');
    expect(redact('')).toBe('[text withheld: 0 characters, 0 words]');
    expect(redact(undefined)).toBe('[no text]');
    expect(redact(SECRET_SENTENCE)).not.toContain('Zoti');
  });
});
