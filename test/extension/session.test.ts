// @vitest-environment node
/**
 * The Repository connection lives only in the background: connect / create account / disconnect through the typed API
 * client against the REAL service handler, what is stored where, what is never said to a content script, and the
 * re-attribution of events recorded before the account existed.
 */
import { describe, expect, it } from 'vitest';
import { validateBaseUrl } from '../../packages/golearn-extension/src/background/session';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { PASSWORD, SERVICE, createRig, pendingEvent } from './rig';

const SESSION_KEY = 'golearn:session';
const SERVICE_KEY = 'golearn:service';

describe('the service address', () => {
  it('must be https, or http on a loopback host; no credentials, query or fragment survive', () => {
    expect(validateBaseUrl('https://repo.example/')).toEqual({ ok: true, url: 'https://repo.example' });
    expect(validateBaseUrl('https://repo.example/api/?x=1#y')).toEqual({ ok: true, url: 'https://repo.example/api' });
    expect(validateBaseUrl('http://localhost:8790')).toEqual({ ok: true, url: 'http://localhost:8790' });
    expect(validateBaseUrl('http://127.0.0.1:8790/')).toEqual({ ok: true, url: 'http://127.0.0.1:8790' });
    expect(validateBaseUrl('http://dev.localhost:3000')).toMatchObject({ ok: true });
    for (const bad of ['http://repo.example', 'ftp://repo.example', 'javascript:alert(1)', 'https://user:pw@repo.example', 'repo.example', '', undefined, 42]) {
      expect(validateBaseUrl(bad), String(bad)).toMatchObject({ ok: false });
    }
  });

  it('is checked before any network call: an insecure address is refused and nothing is sent', async () => {
    const rig = createRig();
    const r = await rig.page({ type: MSG.connect, baseUrl: 'http://repo.example', email: 'a@b.co', password: PASSWORD });
    expect(r).toMatchObject({ ok: false, error: 'insecure-url' });
    expect(rig.log).toEqual([]);
    expect((await rig.fake.local.get(null))[SESSION_KEY]).toBeUndefined();
  });
});

describe('connect', () => {
  it('signs in through the API client and stores the service and the session in chrome.storage.local, in the documented shape', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    const r = await rig.connect();
    expect(r).toMatchObject({ ok: true, status: { connected: true, email: 'ana@example.com', languageId: 'sq', hasEnrolment: true } });
    const stored = await rig.fake.local.get(null);
    expect(stored[SERVICE_KEY]).toEqual({ baseUrl: SERVICE });
    const s = stored[SESSION_KEY] as Record<string, string>;
    expect(Object.keys(s).sort()).toEqual(['email', 'enrolmentId', 'expiresAt', 'languageId', 'learnerId', 'token']);
    expect(s).toMatchObject({ learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq', email: 'ana@example.com' });
    expect(s.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(s.expiresAt)).toBeGreaterThan(Date.parse('2026-10-08T10:00:00.000Z'));
    // the device the service knows is the extension's own device id
    const deviceId = stored['golearn:deviceId'] as string;
    expect(deviceId).toMatch(/^dev-/);
    expect(rig.h.store.state.devices.get(`${who.learnerId}|${deviceId}`)).toMatchObject({ platform: 'chrome-extension' });
  });

  it('never puts the token, the password or the learner id in a reply, not even to the setup page', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    const replies = [await rig.connect(), await rig.page({ type: MSG.status }), await rig.page({ type: MSG.serviceConfig, op: 'get' })];
    const token = ((await rig.fake.local.get(SESSION_KEY))[SESSION_KEY] as { token: string }).token;
    for (const r of replies) {
      const text = JSON.stringify(r);
      expect(text).not.toContain(token);
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain(who.learnerId);
    }
  });

  it('a wrong password is a plain message and stores nothing', async () => {
    const rig = createRig();
    await rig.signUp();
    const r = await rig.page({ type: MSG.connect, baseUrl: SERVICE, email: 'ana@example.com', password: 'not the password' });
    expect(r).toMatchObject({ ok: false, error: 'bad-credentials', message: 'The email or password was not accepted.' });
    expect((await rig.fake.local.get(null))[SESSION_KEY]).toBeUndefined();
    expect((await rig.page({ type: MSG.status })).connected).toBe(false);
  });

  it('an unreachable service is a plain message', async () => {
    const rig = createRig();
    rig.offline.value = true;
    const r = await rig.connect();
    expect(r).toMatchObject({ ok: false, error: 'unreachable' });
  });

  it('createAccount makes the account, signs in, and says what is wrong with a weak password or a taken email', async () => {
    const rig = createRig();
    const weak = await rig.page({ type: MSG.createAccount, baseUrl: SERVICE, email: 'new@example.com', password: 'short' });
    expect(weak).toMatchObject({ ok: false, message: 'The password must be at least 10 characters.' });
    const ok = await rig.page({ type: MSG.createAccount, baseUrl: SERVICE, email: 'new@example.com', password: PASSWORD, displayName: 'New' });
    expect(ok).toMatchObject({ ok: true, status: { connected: true, email: 'new@example.com', hasEnrolment: false } });
    const taken = await rig.page({ type: MSG.createAccount, baseUrl: SERVICE, email: 'new@example.com', password: PASSWORD });
    expect(taken).toMatchObject({ ok: false, message: 'An account with that email already exists.' });
  });

  it('connected without an enrolment, then enrolling through the background picks the enrolment up', async () => {
    const rig = createRig();
    await rig.page({ type: MSG.createAccount, baseUrl: SERVICE, email: 'new@example.com', password: PASSWORD });
    const e = await rig.page({ type: MSG.enrol, languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    expect(e).toMatchObject({ ok: true, status: { hasEnrolment: true, languageId: 'sq' } });
    const s = (await rig.fake.local.get(SESSION_KEY))[SESSION_KEY] as { enrolmentId: string };
    expect(s.enrolmentId).toBeTruthy();
  });
});

describe('disconnect', () => {
  it('revokes the session at the service, removes it locally, and keeps the learner\'s events', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    const token = ((await rig.fake.local.get(SESSION_KEY))[SESSION_KEY] as { token: string }).token;
    await rig.content({ type: MSG.record, event: pendingEvent() });
    const r = await rig.page({ type: MSG.disconnect });
    expect(r).toEqual({ ok: true, remoteRevoked: true });
    expect(rig.log.some((l) => l.method === 'DELETE' && l.path === '/sessions/current' && l.status === 204)).toBe(true);
    const stored = await rig.fake.local.get(null);
    expect(stored[SESSION_KEY]).toBeUndefined();
    expect(stored[SERVICE_KEY]).toEqual({ baseUrl: SERVICE }); // the address is remembered
    expect((await rig.h.api(token).me()).ok).toBe(false); // the old token is dead at the service
    expect(Object.keys(stored).filter((k) => k.startsWith('golearn:event:'))).toHaveLength(1);
    expect((await rig.page({ type: MSG.status })).connected).toBe(false);
  });

  it('signs out locally even when the service cannot be reached', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    rig.offline.value = true;
    expect(await rig.page({ type: MSG.disconnect })).toEqual({ ok: true, remoteRevoked: false });
    expect((await rig.fake.local.get(null))[SESSION_KEY]).toBeUndefined();
  });
});

describe('events recorded before the account existed', () => {
  it('are attributed to local:<deviceId> and stay out of the sync queue\'s way, then are re-attributed on connect and reach the service', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    const a = await rig.content({ type: MSG.record, event: pendingEvent('shtëpinë') });
    const b = await rig.content({ type: MSG.record, event: pendingEvent('libër') });
    expect(a).toMatchObject({ ok: true, attributed: 'local' });
    expect(b).toMatchObject({ ok: true, attributed: 'local' });
    const deviceId = (await rig.fake.local.get('golearn:deviceId'))['golearn:deviceId'] as string;
    const queued = Object.entries(await rig.fake.local.get(null)).filter(([k]) => k.startsWith('queue:')).map(([, v]) => (v as { event: { learnerId: string; enrolmentId: string; producer: { deviceId: string } } }).event);
    expect(queued).toHaveLength(2);
    for (const e of queued) { expect(e.learnerId).toBe(`local:${deviceId}`); expect(e.enrolmentId).toBe('local-enrolment:sq'); expect(e.producer.deviceId).toBe(deviceId); }
    expect((await rig.bg.sync.status())).toMatchObject({ pending: 0, localOnly: 2 });

    await rig.connect();
    const after = Object.entries(await rig.fake.local.get(null)).filter(([k]) => k.startsWith('queue:') || k.startsWith('golearn:event:')).map(([, v]) => (v as { event?: { learnerId: string }; learnerId?: string }));
    for (const row of after) expect(row.event?.learnerId ?? row.learnerId).toBe(who.learnerId); // queue rows and the local log, both
    await rig.fireTimers();
    expect(await rig.h.store.head(who.learnerId)).toBeGreaterThanOrEqual(3); // EnrolmentChanged + the two lookups
    const stored = (await rig.h.store.list({ learnerId: who.learnerId, kinds: ['SelectionLookedUp'] })).map((e) => e.enrolmentId);
    expect(stored).toEqual([who.enrolmentId, who.enrolmentId]);
    expect(Object.keys(await rig.fake.local.get(null)).filter((k) => k.startsWith('queue:'))).toHaveLength(0);
  });

  it('re-attribution waits for an enrolment in the event\'s language', async () => {
    const rig = createRig();
    await rig.content({ type: MSG.record, event: pendingEvent() });
    await rig.page({ type: MSG.createAccount, baseUrl: SERVICE, email: 'new@example.com', password: PASSWORD });
    let queued = Object.values(await rig.fake.local.get(null)).filter((v) => (v as { event?: unknown })?.event) as Array<{ event: { learnerId: string } }>;
    expect(queued[0].event.learnerId).toMatch(/^local:/); // signed in but not enrolled: still local
    await rig.page({ type: MSG.enrol, languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    queued = Object.values(await rig.fake.local.get(null)).filter((v) => (v as { event?: unknown })?.event) as Array<{ event: { learnerId: string } }>;
    expect(queued[0].event.learnerId).not.toMatch(/^local:/);
  });

  it('events queued under another account are set aside, not sent as the new learner and not dropped', async () => {
    const rig = createRig();
    await rig.signUp('ana@example.com');
    await rig.connect('ana@example.com');
    await rig.content({ type: MSG.record, event: pendingEvent('shtëpinë') }); // queued as Ana
    await rig.page({ type: MSG.disconnect });
    const ben = await rig.signUp('ben@example.com');
    const r = await rig.connect('ben@example.com');
    expect(r.ok).toBe(true);
    const keys = Object.keys(await rig.fake.local.get(null));
    expect(keys.filter((k) => k.startsWith('queue:'))).toHaveLength(0);
    expect(keys.filter((k) => k.startsWith('rejected:'))).toHaveLength(1);
    await rig.fireTimers();
    expect(await rig.h.store.list({ learnerId: ben.learnerId, kinds: ['SelectionLookedUp'] })).toHaveLength(0);
  });
});

describe('enrolment through the background', () => {
  it('carries language, variety, script, pack, goals to POST /enrolments, with no team', async () => {
    const rig = createRig();
    await rig.page({ type: MSG.createAccount, baseUrl: SERVICE, email: 'new@example.com', password: PASSWORD });
    const goals = [{ kind: 'reading' }, { kind: 'listening', priority: 2 }];
    const e = await rig.page({ type: MSG.enrol, languageId: 'sq', varietyId: 'sq-standard', scriptId: 'Latn', packId: 'pack:sq', packVersion: '9', goals, teamId: undefined });
    expect(e).toMatchObject({ ok: true, status: { hasEnrolment: true, languageId: 'sq' } });
    const enrolment = [...rig.h.store.state.enrolments.values()][0];
    expect(enrolment).toMatchObject({ languageId: 'sq', varietyId: 'sq-standard', scriptId: 'Latn', packId: 'pack:sq', packVersion: '9', goals });
    expect(enrolment.teamId).toBeUndefined();
    expect(rig.log.some((l) => l.method === 'POST' && l.path === '/enrolments' && l.status === 201)).toBe(true);
  });
});
