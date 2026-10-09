// @vitest-environment node
/**
 * Offline / failure audit — GoTell and the language packs (brief §23):
 *   remote AI unavailable (GoTell keeps its local, deterministic feedback), an interrupted writing session (autosave survives, the
 *   account's version is unchanged), a lost acknowledgement while saving a draft, a language-pack update (installed pack replaced,
 *   learner state intact; a failed update leaves the old pack working).
 * Real Albanian checker and pack runtime, real draft stores over the real service (both stores), real installer.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  albanianManifest, createPackRuntime, installPack, installedKey, packFor, validateManifest, verifyInstalled, type PackManifest,
} from '../../packages/language-packs/src';
import {
  RemoteAssistantGate, createAnalyzer, createAssistance, createDraftStore, createLocalDraftStore, createSyncingDraftStore, newVersion,
  type DraftRecord, type RemoteAssistant,
} from '../../packages/gotell/src';
import { createMemoryArea } from '../../packages/repository-sync/src';
import {
  STORE_KINDS, addDevice, createNet, createStack, lookup, serverEvents, signUp, text, type Learner, type Stack, type StoreKind,
} from './privacy.support';
import { fileFetch } from './offline.support';

const stacks: Stack[] = [];
const make = (kind: StoreKind): Stack => { const s = createStack(kind); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const now = () => new Date('2026-10-09T08:00:00.000Z');

describe('remote AI unavailable: GoTell keeps its local, deterministic feedback', () => {
  const manifest = packFor('sq')!;
  const runtime = createPackRuntime(manifest, { fetch: fileFetch, baseUrl: 'http://assets.local/' });
  const analyzer = createAnalyzer({ languageId: 'sq', runtime, manifest, now });
  const TEXT = 'Unë shkoj me shoku.';                          // a sentence the ladder would take to the remote assistant at level 6
  const consent = { remoteAssistance: () => true };
  const failures: Array<[string, RemoteAssistant]> = [
    ['the network is down (fetch rejects)', { providerId: 'down', propose: async () => { throw new TypeError('Failed to fetch'); } }],
    ['the provider answers 503', { providerId: 'busy', propose: async () => { throw new Error('503 Service Unavailable'); } }],
    ['the provider answers with garbage (not a list)', { providerId: 'junk', propose: async () => ({ not: 'a list' }) as never }],
    ['the provider answers with an empty list', { providerId: 'empty', propose: async () => [] }],
    ['the provider never answers (timeout)', { providerId: 'hang', propose: () => new Promise(() => undefined) }],
  ];

  it.each(failures)('%s: level 6 is a clear refusal, nothing is shown from it, and the ladder does not throw', async (_name, remote) => {
    const analysis = analyzer.analyzeDraft('r1', TEXT, undefined);
    const assistance = createAssistance({ analyzer, remote: new RemoteAssistantGate(remote, consent), consent, now, remoteTimeoutMs: 25 });
    const issueId = analysis.sentences[0].issues[0].issueId;
    const r = await assistance.step(analysis, { draftId: 'r1', sentenceIndex: 0, issueId, level: 6, at: now().toISOString() }, []);
    expect('refused' in r).toBe(true);
    if ('refused' in r) expect(r.reason).toMatch(/remote assistant|nothing/i);
  });

  it('the feedback at levels 1 to 5 is byte-identical with a dead remote and with no remote at all: it never depended on it', async () => {
    const dead: RemoteAssistant = { providerId: 'down', propose: async () => { throw new TypeError('Failed to fetch'); } };
    const analysis = analyzer.analyzeDraft('r2', TEXT, undefined);
    const issueId = analysis.sentences[0].issues[0].issueId;
    const climb = async (remote?: RemoteAssistant) => {
      const assistance = createAssistance({ analyzer, ...(remote ? { remote: new RemoteAssistantGate(remote, consent) } : {}), consent, now });
      const out: unknown[] = [];
      for (const level of [1, 2, 3, 4, 5] as const) out.push(await assistance.step(analysis, { draftId: 'r2', sentenceIndex: 0, issueId, level, at: now().toISOString() }, []));
      return out;
    };
    expect(await climb(dead)).toEqual(await climb(undefined));
    // and the analysis itself is the same function of the text, offline or not
    expect(analyzer.analyzeDraft('r2', TEXT, undefined).sentences[0].issues.map((i) => i.category)).toEqual(analysis.sentences[0].issues.map((i) => i.category));
  });

  it('a sentence the learner or the pack can model never needs the remote: level 6 still answers locally with the remote dead', async () => {
    const dead: RemoteAssistant = { providerId: 'down', propose: async () => { throw new TypeError('Failed to fetch'); } };
    const analysis = analyzer.analyzeDraft('r3', 'Unë shkoj te libër.', undefined);
    const assistance = createAssistance({ analyzer, remote: new RemoteAssistantGate(dead, consent), consent, now });
    const r = await assistance.step(analysis, { draftId: 'r3', sentenceIndex: 0, issueId: analysis.sentences[0].issues[0].issueId, level: 6, at: now().toISOString() }, []);
    expect('refused' in r).toBe(false);
    if (!('refused' in r)) expect(r.source).toBe('pack-sentence');
  });

  it('analysis does not need the dictionary either: with every fetch failing the checker still finds the grammar problem (only glosses are lost)', async () => {
    const offlineRuntime = createPackRuntime(manifest, { fetch: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch, baseUrl: 'http://assets.local/' });
    const offline = createAnalyzer({ languageId: 'sq', runtime: offlineRuntime, manifest, now });
    const a = offline.analyzeDraft('r4', 'Unë shkoj te libër. Unë lexoj librin.', undefined);
    expect(a.sentences[0].issues[0].category).toBe('definiteness');
    expect(a.sentences[1].issues).toEqual([]);
    expect(await offlineRuntime.gloss('libër')).toBeUndefined();                       // honest: no gloss, no error
  });
});

describe.each(STORE_KINDS)('an interrupted writing session — %s store', (kind) => {
  const idOf = (w: Learner) => ({ learnerId: w.learnerId, enrolmentId: w.enrolmentId, deviceId: w.deviceId, languageId: 'sq' });
  const blank = (s: Stack): DraftRecord => ({ draftId: 'w1', languageId: 'sq', mode: 'free', title: 'Dita ime', text: '', versions: [], assistance: [], createdAt: s.clock.now(), updatedAt: s.clock.now() });
  const write = (s: Stack, who: Learner, body: string, base: DraftRecord): DraftRecord => newVersion(base, body, () => ({ authorship: 'independent', assistance: [] }), who.deviceId, () => new Date(s.clock.ms()));

  function device(s: Stack, w: Learner, area = createMemoryArea(), net = createNet(s)) {
    const local = createLocalDraftStore(area, { identity: idOf(w), now: () => new Date(s.clock.ms()) });
    const remote = createDraftStore({ api: net.api(w.token), identity: idOf(w), now: () => new Date(s.clock.ms()) });
    const syncing = createSyncingDraftStore({ local, remote, now: () => new Date(s.clock.ms()) });
    return { area, net, local, remote, syncing };
  }

  it('the writer autosaves on the device, the device is closed with the account unreachable: the reopened app has the text, and the account\'s version is unchanged until the push', async () => {
    const s = make(kind);
    const w = await signUp(s, 'ana@example.com', 'phone');
    const first = device(s, w);
    const v1 = write(s, w, 'Unë lexoj librin.', blank(s));
    expect((await first.syncing.save(v1, 0)).ok).toBe(true);                        // online: saved and pushed (revision 1)
    expect((await first.remote.load('w1'))!.revision).toBe(1);
    s.clock.advance(60_000);
    first.net.down = true;                                                          // the connection goes
    const loaded = (await first.syncing.load('w1'))!;
    const v2 = write(s, w, 'Unë lexoj librin e madh. Pastaj shkoj në shtëpi.', loaded.record);
    expect((await first.syncing.save(v2, loaded.revision)).ok).toBe(true);          // autosave: on the device
    const v3 = write(s, w, 'Unë lexoj librin e madh. Pastaj shkoj në shtëpi. Nëna është aty.', v2);
    expect((await first.local.save(v3, (await first.local.load('w1'))!.revision)).ok).toBe(true);   // a second autosave, then the tab dies
    // — the device restarts: new store objects over the same storage, still no connection —
    const reopened = device(s, w, first.area, first.net);
    const back = (await reopened.local.load('w1'))!;
    expect(back.record.text).toBe('Unë lexoj librin e madh. Pastaj shkoj në shtëpi. Nëna është aty.');
    expect(back.record.versions.map((v) => v.text)).toEqual(['Unë lexoj librin.', 'Unë lexoj librin e madh. Pastaj shkoj në shtëpi.', 'Unë lexoj librin e madh. Pastaj shkoj në shtëpi. Nëna është aty.']);
    expect(await reopened.syncing.pendingPush()).toEqual(['w1']);
    // the account still has exactly what it had
    first.net.down = false;
    const onServer = await w.api.getDocument('w1');
    expect(onServer.ok && onServer.data.document.revision).toBe(1);
    expect(onServer.ok && onServer.data.document.body).toContain('Unë lexoj librin.');
    expect(onServer.ok && onServer.data.document.body).not.toContain('Nëna është aty');
    // and when the app is next online the newest text is pushed as the next revision (no conflict with itself)
    const pushed = await reopened.syncing.push();
    expect(pushed.pushed).toEqual(['w1']);
    expect(pushed.conflicts).toEqual([]);
    const after = await w.api.getDocument('w1');
    expect(after.ok && after.data.document.revision).toBe(2);
    expect(after.ok && after.data.document.body).toContain('Nëna është aty');
    expect(await reopened.syncing.pendingPush()).toEqual([]);
  });

  it('nothing is written to the account by an unsaved device edit: the Repository log gains no event and no document row until the learner saves', async () => {
    const s = make(kind);
    const w = await signUp(s, 'ana@example.com', 'phone');
    const d = device(s, w);
    d.net.down = true;
    const before = (await serverEvents(s, w.learnerId)).length;
    await d.local.save(write(s, w, 'AUTOSAVED-ONLY-TEXT-7781 lexoj.', blank(s)), 0);
    d.net.down = false;
    expect((await serverEvents(s, w.learnerId)).length).toBe(before);
    const docs = await w.api.listDocuments();
    expect(docs.ok && docs.data.documents).toEqual([]);
    expect(text(await s.store.listDocuments(w.learnerId))).not.toContain('AUTOSAVED-ONLY-TEXT-7781');
  });

  // The acknowledgement of a draft save is lost: the account has revision 2, the device believes it is still waiting. The retry must
  // recognise its own text and settle, not turn it into a "conflict copy" of itself.
  it('the save reached the account but the answer was lost: the retry recognises its own text (no conflict copy of itself, one revision)', async () => {
    const s = make(kind);
    const w = await signUp(s, 'ana@example.com', 'phone');
    const d = device(s, w);
    const v1 = write(s, w, 'Unë lexoj librin.', blank(s));
    expect((await d.syncing.save(v1, 0)).ok).toBe(true);
    s.clock.advance(60_000);
    const cur = (await d.syncing.load('w1'))!;
    const v2 = write(s, w, 'Unë lexoj librin e madh.', cur.record);
    d.net.loseResponses = 1;                                                         // the PUT is processed, the response is lost
    const saved = await d.syncing.save(v2, cur.revision);
    expect(saved.ok).toBe(true);                                                     // saved on the device; the push is pending
    expect(await d.syncing.pendingPush()).toEqual(['w1']);
    const server = await w.api.getDocument('w1');
    expect(server.ok && server.data.document.revision).toBe(2);                      // but the account did get it
    const retry = await d.syncing.push();
    expect(retry.conflicts).toEqual([]);
    expect(retry.failed).toEqual([]);
    expect(await d.syncing.pendingPush()).toEqual([]);
    const docs = await w.api.listDocuments();
    expect(docs.ok && docs.data.documents.map((x) => x.docId)).toEqual(['w1']);      // no "(conflict copy from phone)" of itself
    const final = await w.api.getDocument('w1');
    expect(final.ok && final.data.document.revision).toBe(2);
  });

  it('two devices: the one that was killed mid-session comes back after the other saved; both texts survive', async () => {
    const s = make(kind);
    const w1 = await signUp(s, 'ana@example.com', 'phone');
    const w2 = await addDevice(s, w1, 'laptop');
    const phone = device(s, w1);
    const laptop = device(s, w2);
    expect((await phone.syncing.save(write(s, w1, 'Baza.', blank(s)), 0)).ok).toBe(true);
    s.clock.advance(1000);
    await laptop.syncing.sync();
    phone.net.down = true;
    const mine = (await phone.syncing.load('w1'))!;
    await phone.syncing.save(write(s, w1, 'PHONE-AUTOSAVE lexoj.', mine.record), mine.revision);   // killed here
    s.clock.advance(1000);
    const theirs = (await laptop.syncing.load('w1'))!;
    expect((await laptop.syncing.save(write(s, w2, 'LAPTOP-SAVED lexoj.', theirs.record), theirs.revision)).ok).toBe(true);
    phone.net.down = false;
    const reopened = device(s, w1, phone.area, phone.net);
    const out = await reopened.syncing.push();
    expect(out.conflicts.length).toBe(1);
    const all = await w1.api.listDocuments();
    const bodies: string[] = [];
    for (const m of all.ok ? all.data.documents : []) { const g = await w1.api.getDocument(m.docId); if (g.ok) bodies.push(g.data.document.body); }
    expect(bodies.some((b) => b.includes('PHONE-AUTOSAVE'))).toBe(true);
    expect(bodies.some((b) => b.includes('LAPTOP-SAVED'))).toBe(true);
  });
});

describe.each(STORE_KINDS)('a language-pack update — %s store', (kind) => {
  const current = albanianManifest();
  const bump = (m: PackManifest, version: string): PackManifest => ({ ...m, version, analyzer: { ...m.analyzer, id: `adapter-${m.languageId}@${version}`, version } });
  const storage = () => {
    const rows = new Map<string, unknown>();
    return { rows, get: (k: string) => rows.get(k), set: (k: string, v: unknown) => { rows.set(k, structuredClone(v)); } };
  };
  const deps = (st: ReturnType<typeof storage>, fetchImpl: typeof fetch = fileFetch) => ({ fetch: fetchImpl, baseUrl: 'http://assets.local/', storage: st, now: () => '2026-10-09T08:00:00.000Z' });

  it('the bumped manifest is itself valid, so the test is about the update and not about a malformed pack', () => {
    const next = bump(current, `${current.version}.1`);
    expect(validateManifest(next)).toEqual([]);
    expect(next.version).not.toBe(current.version);
  });

  it('the installed record is replaced by the new version, and "current" flips from the old manifest to the new one', async () => {
    const st = storage();
    const next = bump(current, `${current.version}.1`);
    expect((await installPack(current, deps(st))).ok).toBe(true);
    expect(await verifyInstalled(current, st)).toMatchObject({ installed: true, current: true });
    expect(await verifyInstalled(next, st)).toMatchObject({ installed: true, current: false });   // stale: the app can say "reinstall"
    const upd = await installPack(next, deps(st));
    expect(upd.ok).toBe(true);
    expect(await verifyInstalled(next, st)).toMatchObject({ installed: true, current: true });
    expect(await verifyInstalled(current, st)).toMatchObject({ installed: true, current: false });
    const rec = st.rows.get(installedKey(next.packId)) as { version: string };
    expect(rec.version).toBe(next.version);
    expect(st.rows.size).toBe(1);                                                    // replaced, not accumulated
  });

  it('the learner\'s state is untouched by the update: events, knowledge, enrolment (still naming the version it started on), documents, preferences', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    await a.api.appendEvents([lookup(a), lookup(a)]);
    await a.api.putDocument('d1', { languageId: 'sq', kind: 'draft', body: 'PRIVATE-TEXT', title: 't' }, 0);
    const before = await a.api.exportAll();
    const st = storage();
    await installPack(current, deps(st));
    expect((await installPack(bump(current, `${current.version}.1`), deps(st))).ok).toBe(true);
    const after = await a.api.exportAll();
    expect(before.ok && after.ok).toBe(true);
    if (before.ok && after.ok) expect({ ...after.data, exportedAt: 0 }).toEqual({ ...before.data, exportedAt: 0 });
    const me = await a.api.me();
    expect(me.ok && me.data.enrolments[0].packVersion).toBeTruthy();
  });

  it('an update attempted offline fails with a reason and leaves the old pack installed and working', async () => {
    const st = storage();
    await installPack(current, deps(st));
    const snapshot = JSON.stringify([...st.rows]);
    const down = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    const upd = await installPack(bump(current, `${current.version}.1`), deps(st, down));
    expect(upd).toMatchObject({ ok: false, reason: 'dictionary-unreachable' });
    expect(JSON.stringify([...st.rows])).toBe(snapshot);                              // the record is exactly as it was
    expect(await verifyInstalled(current, st)).toMatchObject({ installed: true, current: true });
    // the old pack's analysis does not depend on the failed update
    const rt = createPackRuntime(current, { fetch: down, baseUrl: 'http://assets.local/' });
    expect(rt.analyzer().kind).toBe('adapter');
  });

  it('an update whose dictionary does not match what the device holds is refused, and the old record is kept', async () => {
    const st = storage();
    await installPack(current, deps(st));
    const snapshot = JSON.stringify([...st.rows]);
    const next = bump(current, `${current.version}.1`);
    const wrongDict: PackManifest = { ...next, lexical: { ...next.lexical, dictionary: { ...next.lexical.dictionary!, entries: next.lexical.dictionary!.entries + 1 } } };
    const upd = await installPack(wrongDict, deps(st));
    expect(upd).toMatchObject({ ok: false, reason: 'dictionary-mismatch' });
    expect(JSON.stringify([...st.rows])).toBe(snapshot);
  });

  it('a storage failure while recording the update is reported, and does not claim success', async () => {
    const st = { get: () => undefined, set: () => { throw new Error('quota exceeded'); } };
    const upd = await installPack(current, { fetch: fileFetch, baseUrl: 'http://assets.local/', storage: st });
    expect(upd).toMatchObject({ ok: false, reason: 'storage-failed' });
  });

  it('a corrupted installation record is reported as not installed (or malformed), never as current, and a reinstall repairs it', async () => {
    const st = storage();
    for (const garbage of ['{not json', 42, null, { version: 7 }, { version: 'x', installedAt: 'y', verified: 'z' }, []]) {
      st.rows.set(installedKey(current.packId), garbage);
      const v = await verifyInstalled(current, st);
      expect(v.installed && v.current, JSON.stringify(garbage)).not.toBe(true);
    }
    expect((await installPack(current, deps(st))).ok).toBe(true);
    expect(await verifyInstalled(current, st)).toMatchObject({ installed: true, current: true });
  });
});
