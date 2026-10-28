// @vitest-environment node
/**
 * Privacy audit (5) device synchronisation and (6) local data cleanup.
 *
 * Devices are real: the sync client with its durable queue, local log and document store (one memory area per device, as
 * chrome.storage / localStorage would be), GoReview's application context, and the GoLearn background worker. The service is the
 * real one. Cleanup is judged by reading the device's whole storage back as text.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalDraftStore, forgetDevice, newVersion, type DraftRecord } from '../../packages/gotell/src';
import {
  PASSWORD, STORE_KINDS, addDevice, createDevice, createNet, createPracticeDevice, createStack, lookup, review, serverEvents, signUp, text,
  type Stack, type StoreKind,
} from './privacy.support';
import { accountFor, createWorkerRig } from './offline.support';

const stacks: Stack[] = [];
const make = (kind: StoreKind): Stack => { const s = createStack(kind); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const ids = (events: Array<{ id: string }>): string[] => events.map((e) => e.id);

describe.each(STORE_KINDS)('device synchronisation — %s store', (kind) => {
  it('two devices both see each other\'s events after syncing, with no duplicates anywhere, and a further round changes nothing', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a1 = await signUp(s, 'ana@example.com', 'phone');
    const a2 = await addDevice(s, a1, 'laptop');
    const phone = createDevice(a1, net);
    const laptop = createDevice(a2, net);
    const fromPhone = [lookup(a1), lookup(a1), review(a1)];
    const fromLaptop = [lookup(a2), review(a2), review(a2, { correct: false })];
    await phone.record(fromPhone);
    await laptop.record(fromLaptop);
    expect((await phone.client.syncOnce()).ok).toBe(true);
    expect((await laptop.client.syncOnce()).ok).toBe(true);
    expect((await phone.client.syncOnce()).ok).toBe(true);           // picks up what the laptop pushed
    const server = await serverEvents(s, a1.learnerId);
    const everything = [...fromPhone, ...fromLaptop].map((e) => e.id);
    expect(ids(server).filter((i) => everything.includes(i)).sort()).toEqual([...everything].sort());
    expect(new Set(ids(server)).size).toBe(server.length);
    for (const d of [phone, laptop]) {
      const mine = ids(await d.log.list({ learnerId: a1.learnerId, limit: 1000 }));
      for (const id of everything) expect(mine, `${d.deviceId} is missing ${id}`).toContain(id);
      expect(new Set(mine).size).toBe(mine.length);
      expect(await d.queue.size()).toBe(0);
    }
    // a further round is a no-op everywhere
    const headBefore = server.length;
    const localBefore = (await phone.log.list({ learnerId: a1.learnerId, limit: 1000 })).length;
    await phone.client.syncOnce(); await laptop.client.syncOnce(); await phone.client.syncOnce();
    expect((await serverEvents(s, a1.learnerId)).length).toBe(headBefore);
    expect((await phone.log.list({ learnerId: a1.learnerId, limit: 1000 })).length).toBe(localBefore);
  });

  it('the same dedupeKey sent from two devices is stored once; both devices end with one event for it', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a1 = await signUp(s, 'ana@example.com', 'phone');
    const a2 = await addDevice(s, a1, 'laptop');
    const phone = createDevice(a1, net);
    const laptop = createDevice(a2, net);
    const e1 = lookup(a1, { dedupeKey: 'shared:key:1' });
    const e2 = lookup(a2, { dedupeKey: 'shared:key:1' });
    await phone.record([e1]); await laptop.record([e2]);
    await phone.client.syncOnce();
    const r = await laptop.client.syncOnce();
    expect(r.ok).toBe(true);
    expect(r.push?.duplicates).toBe(1);                              // the server said "already have it" and the laptop treated that as success
    expect(await laptop.queue.size()).toBe(0);
    expect((await serverEvents(s, a1.learnerId)).filter((e) => e.dedupeKey === 'shared:key:1').length).toBe(1);
    await phone.client.syncOnce();
    for (const d of [phone, laptop]) expect((await d.log.list({ learnerId: a1.learnerId, limit: 1000 })).filter((e) => e.dedupeKey === 'shared:key:1').length).toBe(1);
  });

  it('a new device pulls the whole history in pages (1,300 events, 500 per page) and ends at the server head', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a1 = await signUp(s, 'ana@example.com', 'phone');
    const a2 = await addDevice(s, a1, 'laptop');
    for (let i = 0; i < 3; i++) expect((await a1.api.appendEvents(Array.from({ length: 434 }, () => lookup(a1)))).ok).toBe(true);
    const laptop = createDevice(a2, net);
    const r = await laptop.client.syncOnce();
    expect(r.ok).toBe(true);
    const server = await serverEvents(s, a1.learnerId);
    expect((await laptop.log.list({ learnerId: a1.learnerId, limit: 5000 })).length).toBe(server.length);
    expect((await laptop.client.status()).cursor).toBe(await s.store.head(a1.learnerId));
    expect(net.count('/sync/pull')).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it('GoReview on two devices: each records, each syncs, both local logs hold the union once', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'setup');
    const phone = createPracticeDevice(net, { deviceName: 'phone' });
    const laptop = createPracticeDevice(net, { deviceName: 'laptop' });
    for (const d of [phone, laptop]) expect((await d.ctx.signIn({ email: a.email, password: PASSWORD })).ok).toBe(true);
    const idP = (await phone.ctx.identity())!;
    const idL = (await laptop.ctx.identity())!;
    expect(idP.deviceId).not.toBe(idL.deviceId);
    const evP = [lookup(idP), review(idP)];
    const evL = [lookup(idL), review(idL, { correct: false })];
    expect((await phone.ctx.record(evP)).queued).toBe(2);
    expect((await laptop.ctx.record(evL)).queued).toBe(2);
    for (const d of [phone, laptop, phone]) await d.ctx.syncNow({ force: true });
    const server = ids(await serverEvents(s, a.learnerId));
    for (const e of [...evP, ...evL]) expect(server).toContain(e.id);
    for (const d of [phone, laptop]) {
      const mine = ids(await d.ctx.events());
      for (const e of [...evP, ...evL]) expect(mine).toContain(e.id);
      expect(new Set(mine).size).toBe(mine.length);
      expect((await d.ctx.syncView()).status?.pending).toBe(0);
    }
  });

  it('one device\'s offline events and the other device\'s events meet without loss when the first comes back', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a1 = await signUp(s, 'ana@example.com', 'phone');
    const a2 = await addDevice(s, a1, 'laptop');
    const phone = createDevice(a1, net);
    const laptop = createDevice(a2, net);
    net.down = true;
    await phone.record([lookup(a1), lookup(a1)]);
    expect((await phone.client.syncOnce()).ok).toBe(false);
    net.down = false;
    await laptop.record([review(a2)]);
    await laptop.client.syncOnce();
    phone.clock.ms += 120_000;                                        // past the backoff
    expect((await phone.client.syncOnce()).ok).toBe(true);
    const server = await serverEvents(s, a1.learnerId);
    expect(server.filter((e) => e.kind !== 'EnrolmentChanged').length).toBe(3);
    expect((await phone.log.list({ learnerId: a1.learnerId, limit: 100 })).filter((e) => e.kind !== 'EnrolmentChanged').length).toBe(3);
  });
});

describe.each(STORE_KINDS)('local data cleanup: the GoLearn extension — %s store', (kind) => {
  async function signedIn() {
    const s = make(kind);
    const net = createNet(s);
    const a = await accountFor(s, 'ana@example.com');
    const rig = createWorkerRig(s, net);
    expect((await rig.connect(a.email)).ok).toBe(true);
    await rig.recordLookup('shtëpinë');
    await rig.fireTimers();
    await rig.content({ type: 'golearn:profile', unitIds: ['lemma:sq:shtëpi:NOUN'], languageId: 'sq' });   // fills the knowledge cache
    return { s, net, a, rig };
  }

  it('sign-out revokes the token on the server, removes the session, and leaves no token (or its digest) in any storage area; the knowledge cache is emptied', async () => {
    const { s, a, rig } = await signedIn();
    const sessionToken = ((await rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string }).token;
    expect(await rig.storageText()).toContain(sessionToken);
    expect(Object.keys(await rig.fake.sessionArea.get(null)).some((k) => k.startsWith('golearn:know'))).toBe(true);
    const out = await rig.page({ type: 'golearn:disconnect' });
    expect(out).toMatchObject({ ok: true, remoteRevoked: true });
    const t = await rig.storageText();
    expect(t).not.toContain(sessionToken);
    expect(t).not.toContain('golearn:session');
    expect(t).not.toContain(s.deps.crypto.sha256(sessionToken));
    expect(t).not.toContain(a.email);
    expect(Object.keys(await rig.fake.sessionArea.get(null)).some((k) => k.startsWith('golearn:know'))).toBe(false);
    const dead = await s.api(sessionToken).me();
    expect(dead.ok).toBe(false);
    expect(dead.ok ? 0 : dead.status).toBe(401);
  });

  it('FINDING (by design): a plain sign-out keeps the learner\'s unsent events on the device so they can be sent at the next sign-in; the separate "clear local data" removes them', async () => {
    const { net, a, rig } = await signedIn();
    net.down = true;
    await rig.recordLookup('libër', 'Unë lexoj një libër.');
    await rig.page({ type: 'golearn:disconnect' });
    const kept = await rig.storageText();
    expect(kept).toContain(a.learnerId);                                // the events carry the learner id
    expect(kept).toContain('golearn:event:');
    expect(Object.keys(await rig.fake.local.get(null)).some((k) => k.startsWith('queue:'))).toBe(true);
    const cleared = await rig.page({ type: 'golearn:clear-local' });
    expect(cleared).toMatchObject({ ok: true });
    expect(cleared.events).toBeGreaterThanOrEqual(2);
    expect(cleared.queued).toBeGreaterThanOrEqual(1);
  });

  it('after clear-local nothing of the learner remains in either storage area: no learner id, enrolment id, email, token, event, queue row or knowledge row', async () => {
    const { net, a, rig } = await signedIn();
    net.down = true;
    await rig.recordLookup('libër', 'Unë lexoj një libër.');           // one event still waiting to be sent
    const token = ((await rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string }).token;
    await rig.page({ type: 'golearn:clear-local' });
    net.down = false;                                                   // the sign-out reaches the service (an offline one keeps the token to revoke it later: see P-08)
    await rig.page({ type: 'golearn:disconnect' });
    const t = await rig.storageText();
    for (const secret of [a.learnerId, a.enrolmentId, a.email, token, 'golearn:event:', 'queue:', 'rejected:', 'golearn:know:', 'golearn:session']) {
      expect(t, `${secret} must be gone after sign-out + clear local data`).not.toContain(secret);
    }
    // what is left is configuration, not the learner
    expect(Object.keys(await rig.fake.local.get(null)).sort()).toEqual(['golearn:deviceId', 'golearn:service', 'golearn:sync-status', 'sync:cursor']);
  });

  it('a second account signing in after a plain sign-out: the first learner\'s unsent events are set aside, never sent under the second account', async () => {
    const { s, net, a, rig } = await signedIn();
    net.down = true;
    const { eventId } = await rig.recordLookup('libër', 'Unë lexoj një libër.');
    await rig.page({ type: 'golearn:disconnect' });
    net.down = false;
    const b = await accountFor(s, 'ben@example.com');
    expect((await rig.connect(b.email)).ok).toBe(true);
    await rig.fireTimers();
    await rig.page({ type: 'golearn:sync-now' });
    expect((await serverEvents(s, b.learnerId)).some((e) => e.id === eventId)).toBe(false);
    expect((await serverEvents(s, a.learnerId)).some((e) => e.id === eventId)).toBe(false);   // and not sent to the first learner's account either (nobody was signed in as them)
    const rows = await rig.fake.local.get(null);
    const rejected = Object.keys(rows).filter((k) => k.startsWith('rejected:'));
    expect(rejected.length).toBe(1);                                    // kept on the device, flagged, not dropped
  });

  // DEFECT P-08: sign-out while the service cannot be reached removes the token locally and stops there ("local sign-out happens
  // whether or not the service could be told"); the token is gone, so the revocation can never be retried, and the session stays
  // valid on the server for its whole 30-day life. Anyone who copied the token before (a browser profile backup, a shared machine)
  // keeps a working credential after the learner believes they signed out.
  it('P-08 (fixed): a token discarded by an offline sign-out is revoked on the server once the network is back', async () => {
    const { s, net, rig } = await signedIn();
    const token = ((await rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string }).token;
    net.down = true;
    const out = await rig.page({ type: 'golearn:disconnect' });
    expect(out).toMatchObject({ ok: true, remoteRevoked: false });
    net.down = false;
    await rig.fireTimers();
    rig.advance(10 * 60_000);
    await rig.page({ type: 'golearn:sync-now' });
    const me = await s.api(token).me();
    expect(me.ok).toBe(false);
  });

  it('FINDING: the same offline sign-out is honest about it: it reports remoteRevoked:false, the status says a revocation is pending, and the only copy of the token left is the pending-revoke slot', async () => {
    const { s, net, rig } = await signedIn();
    const token = ((await rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string }).token;
    net.down = true;
    const out = await rig.page({ type: 'golearn:disconnect' });
    expect(out).toMatchObject({ ok: true, remoteRevoked: false });
    expect((await s.api(token).me()).ok).toBe(true);
    const kept = Object.entries(await rig.fake.local.get(null)).filter(([, v]) => JSON.stringify(v).includes(token)).map(([k]) => k);
    expect(kept).toEqual(['golearn:pending-revoke']);                      // no session record, no queue row, nothing else holds it
    expect((await rig.page({ type: 'golearn:status' })).revocationPending).toBe(true);
  });
});

describe.each(STORE_KINDS)('local data cleanup: GoReview and GoTell — %s store', (kind) => {
  async function signedIn(deviceName = 'web') {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'setup');
    const dev = createPracticeDevice(net, { deviceName });
    expect((await dev.ctx.signIn({ email: a.email, password: PASSWORD })).ok).toBe(true);
    const id = (await dev.ctx.identity())!;
    return { s, net, a, dev, id };
  }

  it('plain sign-out revokes the token, removes the session and every cache, and keeps only the learner\'s own prefixed rows', async () => {
    const { s, a, dev, id } = await signedIn();
    const token = ((await dev.area.get('gopractice:session'))['gopractice:session'] as { token: string }).token;
    await dev.ctx.record([lookup(id)]);
    await dev.ctx.signOut({ forget: false });
    const t = text(dev.area.dump());
    expect(t).not.toContain(token);
    expect(t).not.toContain(a.email);
    expect(Object.keys(dev.area.dump()).filter((k) => !k.startsWith(`u:${a.learnerId}:`))).toEqual(['gopractice:deviceId']);
    expect((await s.api(token).me()).ok).toBe(false);
  });

  it('sign-out with "remove this device\'s data" leaves nothing of the learner: no learner id, email, token, event, draft or preference', async () => {
    const { net, a, dev, id } = await signedIn();
    const token = ((await dev.area.get('gopractice:session'))['gopractice:session'] as { token: string }).token;
    await dev.ctx.record([lookup(id), review(id)]);
    await dev.ctx.state.setPrefs(a.learnerId, { languageId: 'sq', sessionMinutes: 7, maxNew: 1, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true });
    await dev.ctx.state.setChoice(a.learnerId, 'lemma:sq:libër:NOUN', 'later');
    net.down = false;
    await dev.ctx.signOut({ forget: true });
    const t = text(dev.area.dump());
    for (const secret of [a.learnerId, a.email, a.enrolmentId, token]) expect(t, `${secret} survived the wipe`).not.toContain(secret);
    expect(Object.keys(dev.area.dump())).toEqual(['gopractice:deviceId']);
  });

  it('sign-out while offline with unsent events says how many it left behind (pendingLeft) and keeps them under the learner\'s prefix', async () => {
    const { net, a, dev, id } = await signedIn();
    net.down = true;
    await dev.ctx.record([lookup(id), lookup(id)]);
    const out = await dev.ctx.signOut({ forget: false });
    expect(out.pendingLeft).toBe(2);
    expect(Object.keys(dev.area.dump()).filter((k) => k.startsWith(`u:${a.learnerId}:queue:`)).length).toBe(2);
  });

  it('account switch on one device: the second learner sees none of the first learner\'s rows, and the first learner\'s unsent events are still theirs and still sent once', async () => {
    const { s, net, a, dev, id } = await signedIn();
    const b = await signUp(s, 'ben@example.com', 'ben-setup');
    net.down = true;
    const mine = lookup(id);
    await dev.ctx.record([mine]);
    await dev.ctx.signOut({ forget: false });
    net.down = false;
    expect((await dev.ctx.signIn({ email: b.email, password: PASSWORD })).ok).toBe(true);
    expect(ids(await dev.ctx.events())).not.toContain(mine.id);
    await dev.ctx.syncNow({ force: true });
    expect((await serverEvents(s, b.learnerId)).some((e) => e.id === mine.id)).toBe(false);
    await dev.ctx.signOut({ forget: false });
    expect((await dev.ctx.signIn({ email: a.email, password: PASSWORD })).ok).toBe(true);
    await dev.ctx.syncNow({ force: true });
    await dev.ctx.syncNow({ force: true });
    expect((await serverEvents(s, a.learnerId)).filter((e) => e.id === mine.id).length).toBe(1);
  });

  it('GoTell "forget this device" wipes drafts, the waiting changes and the sync cursors from the learner\'s area, touches nothing else and leaves the account\'s copy alone', async () => {
    const { s, a, dev, id } = await signedIn();
    const data = (await dev.ctx.data())!;
    const identity = { learnerId: id.learnerId, enrolmentId: id.enrolmentId, deviceId: id.deviceId, languageId: 'sq' };
    const now = () => new Date('2026-10-09T08:00:00.000Z');
    const local = createLocalDraftStore(data.area, { identity, now });
    const rec: DraftRecord = newVersion({ draftId: 'g1', languageId: 'sq', mode: 'free', title: 'My testimony', text: '', versions: [], assistance: [], createdAt: now().toISOString(), updatedAt: now().toISOString() }, 'DRAFT-TEXT-ON-DEVICE-4417 lexoj.', () => ({ authorship: 'independent', assistance: [] }), id.deviceId, now);
    expect((await local.save(rec, 0)).ok).toBe(true);
    await dev.ctx.record([lookup(id)]);                                   // a waiting event too
    await data.sync.syncOnce({ force: true });                            // writes sync:cursor
    expect(text(dev.area.dump())).toContain('DRAFT-TEXT-ON-DEVICE-4417');
    const server = await a.api.putDocument('server-copy', { languageId: 'sq', kind: 'draft', body: 'ACCOUNT-COPY-STAYS', title: 't' }, 0);
    expect(server.ok).toBe(true);
    const r = await forgetDevice(data.area);
    expect(r.drafts).toBeGreaterThanOrEqual(1);
    const t = text(dev.area.dump());
    expect(t).not.toContain('DRAFT-TEXT-ON-DEVICE-4417');
    const left = Object.keys(await data.area.get(null));
    expect(left.filter((k) => /^(doc:|queue:|rejected:|quarantine:|sync:cursor|sync:docsSince)/.test(k))).toEqual([]);
    expect(Object.keys(dev.area.dump())).toContain('gopractice:session');   // the sign-in is not touched
    expect((await a.api.getDocument('server-copy')).ok).toBe(true);
    expect(s.logs.length).toBeGreaterThan(0);
  });
});

