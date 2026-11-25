/**
 * What the learner deleted on the account is deleted on the device before a figure is given (2026-11-17).
 *
 * The device's pull used to read only what the account ADDED (GET /events after a cursor). A record the learner removed on another device
 * (POST /tombstones: one event, a source, a time range) stayed on this one, was counted, and the snapshot still said verified: the
 * independent integrity suite found it (test/extension/reading-repository.test.ts, case 3). Now the account lists its deletion
 * instructions (GET /tombstones), the device carries out each one it has not carried out yet, BEFORE it reads the new events, and a
 * service that cannot list them leaves the snapshot unverified with that reason.
 *
 * The bed is the integrity suite's own (reading.support.ts): the real service handler over the memory store with the real projection
 * engine as the account, the real background worker with fake-indexeddb as the device. Nothing of the Repository is mocked.
 */
import { describe, expect, it } from 'vitest';
import { classifyWord } from '../../packages/golearn-extension/src/reading/classify';
import {
  accountEvents, accountRows, ago, classifyAll, createAccount, createReadingRig, createRealService, deviceEvents, idsOf, lookedUp, marked, sendToAccount, signIn, snapshotOf, wordOf,
} from './reading.support';

const EMAIL = 'deleter@example.test';
const LONG = 120_000;
const both = (w: string): string[] => [...wordOf('sq', w)].reverse();
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ids = (events: Array<{ id: string }>): string[] => events.map((e) => e.id).sort();
/** The events of the learner's own history: the service's own (an enrolment it made) are never copied to a device. */
const history = (events: Array<{ id: string; producer: { app: string } }>): Array<{ id: string }> => events.filter((e) => e.producer.app !== 'repository');

describe('a deletion made on another device', () => {
  it('one event deleted on the account: the device removes it, the snapshot is verified, and the verdict is the account\'s', async () => {
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const word = wordOf('sq', 'fshirë');
    const mark = marked(phone, [word[1]!], 'known', { at: ago(5) });
    await sendToAccount(phone, [lookedUp(phone, both('tjetër'), { at: ago(6) }), mark]);
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const first = await snapshotOf(rig);
    expect(first).toMatchObject({ state: 'verified' });
    expect((await classifyAll(rig, 'sq', [word], first.id)).verdicts).toEqual([['known', 'known']]);

    expect((await phone.api.putTombstone({ kind: 'event', id: mark.id }, 'marked by mistake')).ok).toBe(true);
    const account = await accountRows(phone.api, idsOf([word]));
    const authoritative = classifyWord(word, (id) => account.get(id), 'sq');
    expect(authoritative).toEqual(['below', 'new']);

    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ authority: 'account', state: 'verified' });
    expect(snap.id).not.toBe(first.id); // the device's knowledge changed: batches of the old snapshot are refused
    expect((await deviceEvents(rig)).some((e) => e.id === mark.id)).toBe(false);
    expect((await classifyAll(rig, 'sq', [word], snap.id)).verdicts).toEqual([authoritative]);
    // carried out once: the next snapshot removes nothing and is the same state
    const again = await snapshotOf(rig);
    expect(again).toMatchObject({ state: 'verified' });
    expect(again.id).toBe(snap.id);
  }, LONG);

  it('a time range deleted on the account, from the middle to the very end of its history: a new device still reaches the end and holds exactly what the account holds', async () => {
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const kept = wordOf('sq', 'mbetur');
    const gone = wordOf('sq', 'hequr');
    await sendToAccount(phone, [
      marked(phone, [kept[1]!], 'known', { at: ago(30) }),
      ...Array.from({ length: 40 }, (_, i) => lookedUp(phone, both(`fjala${i}`), { at: ago(20, i * 1000) })),
      // the last events of the account, all inside the range that is deleted below
      ...Array.from({ length: 25 }, (_, i) => lookedUp(phone, both(`vonë${i}`), { at: ago(2, i * 1000) })),
      marked(phone, [gone[1]!], 'known', { at: ago(2, 60_000) }),
    ]);
    const deleted = await phone.api.putTombstone({ kind: 'range', from: ago(3), to: ago(1) });
    expect(deleted.ok && deleted.data.applied?.events).toBe(26);

    // a device that signs in afterwards: the account's head is still where it was before the deletion, and nothing lies after the last event left
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ authority: 'account', state: 'verified' });
    expect(ids(await deviceEvents(rig))).toEqual(ids(history(await accountEvents(svc, phone.learnerId))));
    const account = await accountRows(phone.api, idsOf([kept, gone]));
    expect((await classifyAll(rig, 'sq', [kept, gone], snap.id)).verdicts).toEqual([kept, gone].map((w) => classifyWord(w, (id) => account.get(id), 'sq')));
    expect((await classifyAll(rig, 'sq', [kept, gone], snap.id)).verdicts).toEqual([['known', 'known'], ['below', 'new']]);
  }, LONG);

  it('a range deleted while this device already held it: the device loses the same events; whatever the account does with an event sent into that range afterwards, the device ends the same', async () => {
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const old = wordOf('sq', 'vjetër');
    const late = wordOf('sq', 'vonuar');
    await sendToAccount(phone, [marked(phone, [old[1]!], 'known', { at: ago(10) }), lookedUp(phone, both('diçka'), { at: ago(10, 1000) })]);
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    expect((await classifyAll(rig, 'sq', [old], (await snapshotOf(rig)).id)).verdicts).toEqual([['known', 'known']]);

    expect((await phone.api.putTombstone({ kind: 'range', from: ago(11), to: ago(9) })).ok).toBe(true);
    // a device that was offline pushes, after the deletion, a mark it made INSIDE the deleted range. Whether the account takes it is the account's rule
    // (the test asserts none): the device must end with exactly the events the account has, and give the account's verdicts.
    await sendToAccount(phone, [marked(phone, [late[1]!], 'known', { at: ago(10, 5000) })]);

    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ state: 'verified' });
    expect(ids(await deviceEvents(rig))).toEqual(ids(history(await accountEvents(svc, phone.learnerId))));
    const account = await accountRows(phone.api, idsOf([old, late]));
    const authoritative = [old, late].map((w) => classifyWord(w, (id) => account.get(id), 'sq'));
    expect((await classifyAll(rig, 'sq', [old, late], snap.id)).verdicts).toEqual(authoritative);
    expect(authoritative[0]).toEqual(['below', 'new']); // the deleted mark is gone on both
  }, LONG);

  it('a service that cannot list deletions (older than this change): the events are all here, and the snapshot is NOT verified, with that reason', async () => {
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const word = wordOf('sq', 'fjalë');
    await sendToAccount(phone, [marked(phone, [word[1]!], 'known', { at: ago(3) })]);
    const rig = createReadingRig({ svc });
    rig.net.intercept = async (call, proceed) => (call.path === '/tombstones' ? json({ error: 'not-found' }, 404) : proceed());
    await signIn(rig, EMAIL);
    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ authority: 'account', state: 'unverified', reason: 'deletions-unknown' });
    expect(snap.lastVerifiedAt).toBeUndefined(); // it was never known to be level with this account
    // the device's record still answers, and the popup marks the figure as not verified
    expect((await classifyAll(rig, 'sq', [word], snap.id)).verdicts).toEqual([['known', 'known']]);
    // the service is updated: the next snapshot is verified
    rig.net.intercept = undefined;
    expect(await snapshotOf(rig)).toMatchObject({ state: 'verified' });
  }, LONG);

  it('the list of deletions is the learner\'s own: another account\'s request sees none of them, and no sign-in sees nothing', async () => {
    const svc = createRealService();
    const a = await createAccount(svc, EMAIL);
    const b = await createAccount(svc, 'other@example.test', ['sq'], 'tablet');
    const mark = marked(a, [wordOf('sq', 'imja')[1]!], 'known', { at: ago(1) });
    await sendToAccount(a, [mark]);
    expect((await a.api.putTombstone({ kind: 'event', id: mark.id })).ok).toBe(true);
    const mine = await a.api.listTombstones();
    expect(mine.ok && mine.data.tombstones.map((t) => t.scope)).toEqual([{ kind: 'event', id: mark.id }]);
    const theirs = await b.api.listTombstones();
    expect(theirs.ok && theirs.data.tombstones).toEqual([]);
  }, LONG);
});
