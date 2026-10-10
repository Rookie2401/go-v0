// @vitest-environment node
/**
 * The device-local Repository inside the background worker: GoLearn with no account, and what an account adds.
 * A real worker (createBackground) over the fake chrome and the service handler (the rig of the sync tests); the local Repository
 * is the real package over the fake chrome.storage.local.
 */
import { describe, expect, it } from 'vitest';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { PROFILE_TTL_MS } from '../../packages/golearn-extension/src/background/profile';
import { LOCAL_PREFIX } from '../../packages/golearn-extension/src/background/localRepo';
import { connectLocalRepository } from '../../packages/repository-local/src';
import { createRig, pendingEvent } from './rig';

type Rig = ReturnType<typeof createRig>;
const local = (rig: Rig, request: Record<string, unknown>) => rig.page({ type: MSG.localRepo, ...request });
const LEMMA = 'lemma:sq:shtëpi:NOUN';
const exposure = (row: { dimensions: Record<string, { observations: number }> } | undefined): number => row?.dimensions.exposure?.observations ?? 0;

describe('with no account', () => {
  it('an encounter is in the device\'s own knowledge, and the card\'s model lines are answered from it', async () => {
    const rig = createRig();
    const event = pendingEvent('shtëpinë');
    expect(event.subject.itemIds).toContain(LEMMA);
    expect(await rig.content({ type: MSG.record, event })).toMatchObject({ ok: true, attributed: 'local' });

    const k = await local(rig, { op: 'knowledge', unitIds: [LEMMA] });
    expect(k.ok).toBe(true);
    expect(exposure(k.knowledge[0])).toBe(1);

    const profile = await rig.content({ type: MSG.profile, unitIds: [LEMMA], languageId: 'sq' });
    expect(profile).toMatchObject({ ok: true, connected: false, source: 'device' });
    expect(exposure(profile.rows[LEMMA])).toBe(1);
    expect(JSON.stringify(profile)).not.toMatch(/learnerId|enrolmentId|deviceId/); // the card sees the seven dimensions, never an identity

    const st = await local(rig, { op: 'status' });
    expect(st).toMatchObject({ ok: true, available: true, pendingUpload: 1, uploaded: 0 });
    expect(st.events).toBeGreaterThanOrEqual(1);
    expect(rig.log).toEqual([]); // nothing left the device
  });

  it('the same event is in the local log, the queue and the Repository, with one id', async () => {
    const rig = createRig();
    const event = pendingEvent('libër');
    await rig.content({ type: MSG.record, event });
    const rows = await rig.fake.local.get(null);
    expect(Object.keys(rows).filter((k) => k.startsWith('queue:'))).toHaveLength(1);
    const exported = await local(rig, { op: 'export' });
    expect(exported).toMatchObject({ ok: true, format: 'golearn-local-export@1' });
    const mine = exported.events.filter((e: { kind: string }) => e.kind === 'SelectionLookedUp');
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(event.id);
    // the Repository's rows live under their own prefix and hold the event under "event"
    expect(Object.keys(rows).some((k) => k.startsWith(`${LOCAL_PREFIX}event:`))).toBe(true);
  });

  it('only an extension page may use the device Repository: a content script and another extension are refused', async () => {
    const rig = createRig();
    expect(await rig.content({ type: MSG.localRepo, op: 'status' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await rig.content({ type: MSG.localRepo, op: 'export' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await rig.fake.dispatch({ type: MSG.localRepo, op: 'status' }, { id: 'other', url: 'chrome-extension://other/app/index.html' })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('the language the learner chooses on the device is the active one, and the account is not needed for it', async () => {
    const rig = createRig();
    expect(await rig.page({ type: MSG.status })).toMatchObject({ connected: false, languageId: 'sq' });
    const chosen = await local(rig, { op: 'enrol', languageId: 'es', goals: [{ kind: 'reading' }] });
    expect(chosen).toMatchObject({ ok: true, enrolment: { languageId: 'es', explicit: true, active: true } });
    expect(await rig.page({ type: MSG.status })).toMatchObject({ connected: false, languageId: 'es' });
    expect(await rig.content({ type: MSG.status })).toMatchObject({ languageId: 'es' });
    // choosing it again is the same enrolment; a second language can be chosen and selected
    const again = await local(rig, { op: 'enrol', languageId: 'es' });
    expect(again.enrolment.enrolmentId).toBe(chosen.enrolment.enrolmentId);
    const de = await local(rig, { op: 'enrol', languageId: 'de' });
    expect((await local(rig, { op: 'status' })).languageId).toBe('de');
    expect(await local(rig, { op: 'select', enrolmentId: chosen.enrolment.enrolmentId })).toMatchObject({ ok: true });
    expect((await local(rig, { op: 'status' })).languageId).toBe('es');
    expect(await local(rig, { op: 'end', enrolmentId: de.enrolment.enrolmentId })).toMatchObject({ ok: true });
    expect((await local(rig, { op: 'enrolments' })).enrolments.map((e: { languageId: string }) => e.languageId)).toEqual(['es']);
  });

  it('a lookup in a language the learner has not chosen is recorded, and does not change the active language', async () => {
    const rig = createRig();
    await local(rig, { op: 'enrol', languageId: 'es' });
    await rig.content({ type: MSG.record, event: pendingEvent('shtëpinë') }); // an Albanian lookup
    const st = await local(rig, { op: 'status' });
    expect(st.languageId).toBe('es');
    expect(st.enrolments.map((e: { languageId: string; explicit: boolean }) => `${e.languageId}:${e.explicit}`).sort()).toEqual(['es:true', 'sq:false']);
    expect(st.events).toBeGreaterThanOrEqual(1);
    // choosing Albanian replaces the automatic enrolment; the earlier lookup stays in the log
    await local(rig, { op: 'enrol', languageId: 'sq' });
    const after = await local(rig, { op: 'knowledge', unitIds: [LEMMA] });
    expect(exposure(after.knowledge[0])).toBe(1);
  });

  it('the Repository API is reachable by message (as the page\'s LocalRepository), except accounts and sessions', async () => {
    const rig = createRig();
    const repo = connectLocalRepository((m) => rig.page(m as Record<string, unknown>), MSG.localRepo);
    const id = await repo.identity();
    expect(id.learnerId).toBeTruthy();
    const enrolled = await repo.api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    expect(enrolled.ok).toBe(true);
    const list = await repo.api.listEnrolments();
    expect(list.ok && list.data.enrolments.map((e) => e.languageId)).toEqual(['sq']);
    await rig.content({ type: MSG.record, event: pendingEvent('libër') });
    const k = await repo.api.knowledge(['lemma:sq:libër:NOUN']);
    expect(k.ok && exposure(k.data.knowledge[0] as never)).toBe(1);
    expect((await repo.exportEvents()).some((e) => e.kind === 'SelectionLookedUp')).toBe(true);
    // no password on this device: the account routes are not forwarded
    const refused = await rig.page({ type: MSG.localRepo, op: 'api', method: 'createSession', args: [{ email: 'local@device', password: 'x', deviceId: 'd' }] });
    expect(refused).toMatchObject({ ok: false });
    expect(await rig.page({ type: MSG.localRepo, op: 'api', method: 'constructor', args: [] })).toMatchObject({ ok: false });
    expect(await rig.page({ type: MSG.localRepo, op: 'nope' })).toMatchObject({ ok: false });
  });

  it('"clear local data" clears the device Repository too: no event, no unit, no row of it stays', async () => {
    const rig = createRig();
    await local(rig, { op: 'enrol', languageId: 'sq' });
    await rig.content({ type: MSG.record, event: pendingEvent('shtëpinë') });
    expect((await local(rig, { op: 'status' })).events).toBeGreaterThan(0);
    const cleared = await rig.page({ type: MSG.clearLocal });
    expect(cleared).toMatchObject({ ok: true });
    const st = await local(rig, { op: 'status' });
    expect(st).toMatchObject({ events: 0, pendingUpload: 0, enrolments: [] });
    expect(st.languageId).toBeUndefined();
    const left = Object.keys(await rig.fake.local.get(null)).filter((k) => /event:|unit:|analysis:|relation:/.test(k));
    expect(left).toEqual([]);
    expect(JSON.stringify(await rig.fake.local.get(null))).not.toContain('shtëpi');
    expect(exposure((await local(rig, { op: 'knowledge', unitIds: [LEMMA] })).knowledge[0])).toBe(0);
  });
});

describe('signing in', () => {
  const uploads = (rig: Rig): number => rig.log.filter((l) => l.method === 'POST' && l.path === '/events').length;
  const stored = async (rig: Rig, learnerId: string) => (await rig.h.store.list({ learnerId, kinds: ['SelectionLookedUp'] })).map((e) => e.id).sort();

  it('uploads the device\'s history once, under the account, and a second sign-in uploads nothing new', async () => {
    const rig = createRig();
    const a = pendingEvent('shtëpinë');
    const b = pendingEvent('libër');
    const c = pendingEvent('bukur');
    for (const e of [a, b, c]) await rig.content({ type: MSG.record, event: e });
    expect((await local(rig, { op: 'status' })).pendingUpload).toBe(3);

    const who = await rig.signUp();
    expect(await rig.connect()).toMatchObject({ ok: true });
    // the sign-in waited for the upload: the account already holds the three events, with the account's ids
    expect(await stored(rig, who.learnerId)).toEqual([a.id, b.id, c.id].sort());
    const first = await local(rig, { op: 'status' });
    expect(first).toMatchObject({ pendingUpload: 0, uploaded: 3 });
    expect(first.lastUpload).toMatchObject({ sent: 3, duplicates: 0, failed: 0 });
    const sent = uploads(rig);
    expect(sent).toBeGreaterThanOrEqual(1);

    // the sync queue sends the same events too (they were re-attributed): the account still holds each exactly once
    await rig.fireTimers();
    expect(await stored(rig, who.learnerId)).toEqual([a.id, b.id, c.id].sort());

    // sign out, sign in again: nothing is uploaded
    await rig.page({ type: MSG.disconnect });
    const again = await rig.connect();
    expect(again).toMatchObject({ ok: true });
    expect(uploads(rig)).toBe(sent);
    const second = await local(rig, { op: 'status' });
    expect(second.lastUpload).toMatchObject({ sent: 0, duplicates: 0, failed: 0 });
    expect(await stored(rig, who.learnerId)).toHaveLength(3);
    // the local copy is still there
    expect(second.events).toBe(first.events);
  });

  it('events recorded while signed in are the account\'s already: a later sign-in does not send them again', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.connect();
    const e = pendingEvent('shtëpinë');
    expect(await rig.content({ type: MSG.record, event: e })).toMatchObject({ ok: true, attributed: 'account' });
    await rig.fireTimers();
    expect((await local(rig, { op: 'status' })).pendingUpload).toBe(0);
    await rig.page({ type: MSG.disconnect });
    const before = uploads(rig);
    await rig.connect();
    expect(uploads(rig)).toBe(before);
    expect(await stored(rig, who.learnerId)).toEqual([e.id]);
  });

  it('a sign-in that fails does not upload anything', async () => {
    const rig = createRig();
    await rig.content({ type: MSG.record, event: pendingEvent('shtëpinë') });
    await rig.signUp();
    const bad = await rig.page({ type: 'golearn:connect', baseUrl: 'https://repo.example', email: 'ana@example.com', password: 'wrong password entirely' });
    expect(bad).toMatchObject({ ok: false });
    expect(uploads(rig)).toBe(0);
    expect((await local(rig, { op: 'status' })).pendingUpload).toBe(1);
  });

  it('an upload the account cannot take leaves the events pending and says so; they go up at the next try', async () => {
    const rig = createRig();
    await rig.content({ type: MSG.record, event: pendingEvent('shtëpinë') });
    await rig.signUp();
    expect(await rig.connect()).toMatchObject({ ok: true });
    expect((await local(rig, { op: 'status' })).pendingUpload).toBe(0);
    // take the markers away (as if the upload had never been confirmed), then lose the network
    const marks = Object.keys(await rig.fake.local.get(null)).filter((k) => k.startsWith(`${LOCAL_PREFIX}uploaded:`));
    expect(marks).toHaveLength(1);
    await rig.fake.local.remove(marks);
    rig.offline.value = true;
    expect(await local(rig, { op: 'upload' })).toMatchObject({ ok: false });
    const st = await local(rig, { op: 'status' });
    expect(st.pendingUpload).toBe(1);
    expect(st.lastUpload.failed).toBeGreaterThan(0);
    rig.offline.value = false;
    // the account already holds it (the first upload): a duplicate answer is success
    expect(await local(rig, { op: 'upload' })).toMatchObject({ ok: true, upload: { sent: 0, duplicates: 1, failed: 0 } });
    expect((await local(rig, { op: 'status' })).pendingUpload).toBe(0);
  });

  it('never enrols the account in a language it did not choose: the events wait, and go when the account has an enrolment in that language', async () => {
    const rig = createRig();
    const who = await rig.signUp(); // the account is enrolled in Albanian only
    await rig.connect();
    const de = { ...pendingEvent('Haus'), languageId: 'de' };
    expect(await rig.content({ type: MSG.record, event: de })).toMatchObject({ ok: true, attributed: 'local' }); // not the account's language: kept on the device
    const waiting = await local(rig, { op: 'upload' });
    expect(waiting).toMatchObject({ ok: true, upload: { sent: 0, failed: 0, waiting: 1 } });
    expect((await local(rig, { op: 'status' })).pendingUpload).toBe(1);
    expect((await rig.h.store.list({ learnerId: who.learnerId, kinds: ['SelectionLookedUp'] }))).toHaveLength(0);
    // the learner enrols the account in German (the setup page): the waiting event goes without another request from the page
    const enrolled = await rig.page({ type: MSG.enrol, languageId: 'de', packId: 'pack:de', packVersion: '1', goals: [{ kind: 'reading' }] });
    expect(enrolled).toMatchObject({ ok: true });
    expect((await local(rig, { op: 'status' })).pendingUpload).toBe(0);
    expect((await rig.h.store.list({ learnerId: who.learnerId, kinds: ['SelectionLookedUp'] })).map((e) => e.id)).toEqual([de.id]);
  });
});

describe('the card\'s model lines when the account cannot be reached', () => {
  it('come from the device\'s own Repository for a unit the cache does not hold', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    await rig.content({ type: MSG.record, event: pendingEvent('shtëpinë') }); // recorded and (once synced) known to the account
    await rig.fireTimers();
    rig.clock.now += PROFILE_TTL_MS + 1000;
    rig.offline.value = true;
    const reply = await rig.content({ type: MSG.profile, unitIds: [LEMMA], languageId: 'sq' });
    expect(reply).toMatchObject({ ok: true, connected: true, stale: true, error: 'offline', source: 'device' });
    expect(exposure(reply.rows[LEMMA])).toBe(1);
    // a unit this device has never met: no row, and the error says why
    const none = await rig.content({ type: MSG.profile, unitIds: ['lemma:sq:zog:NOUN'], languageId: 'sq' });
    expect(none).toMatchObject({ connected: true, error: 'offline', rows: {} });
    expect(none.source).toBeUndefined();
  });

  it('are the account\'s when it answers; the device only fills what the account does not hold', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.connect();
    await rig.content({ type: MSG.record, event: pendingEvent('shtëpinë') });
    await rig.fireTimers();
    const online = await rig.content({ type: MSG.profile, unitIds: [LEMMA], languageId: 'sq' });
    expect(online).toMatchObject({ ok: true, connected: true });
    expect(online.source).toBeUndefined();
    expect(who.learnerId).toBeTruthy();
  });
});
