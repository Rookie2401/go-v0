// @vitest-environment node
/**
 * Synchronization and the learner-model cache, in the background, against the real service handler: the debounce, the
 * alarm, the 401 that is never retried forever, offline backoff, and the cache refresh after a successful sync.
 */
import { describe, expect, it } from 'vitest';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { PROFILE_TTL_MS } from '../../packages/golearn-extension/src/background/profile';
import { PASSWORD, SERVICE, createRig, knowledgeRow, pendingEvent } from './rig';

const SESSION_KEY = 'golearn:session';
const tokenOf = async (rig: ReturnType<typeof createRig>): Promise<string> => ((await rig.fake.local.get(SESSION_KEY))[SESSION_KEY] as { token: string }).token;
const syncCalls = (rig: ReturnType<typeof createRig>): number => rig.log.filter((l) => l.path === '/sync/push').length;

describe('when a sync runs', () => {
  it('once, debounced 2 s after an event is queued: a burst of events is one round', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.connect();
    await rig.fireTimers(); // the sign-in's own round
    const before = syncCalls(rig);
    rig.timers.length = 0;
    for (const w of ['shtëpinë', 'libër', 'bukur']) await rig.content({ type: MSG.record, event: pendingEvent(w) });
    const live = rig.timers.filter((t) => !t.cleared);
    expect(rig.timers).toHaveLength(3);
    expect(live).toHaveLength(1);
    expect(live[0].ms).toBe(2000);
    expect(syncCalls(rig)).toBe(before); // nothing yet
    await rig.fireTimers();
    expect(syncCalls(rig)).toBe(before + 1);
    const st = await rig.bg.sync.status();
    expect(st).toMatchObject({ pending: 0, needsSignIn: false });
    expect(st.lastPushAt).toBeTypeOf('number');
    expect(await rig.h.store.list({ learnerId: who.learnerId, kinds: ['SelectionLookedUp'] })).toHaveLength(3);
    expect(Object.keys(await rig.fake.local.get(null)).filter((k) => k.startsWith('queue:'))).toHaveLength(0);
    // the learner's own copy on the device stays (export / delete)
    expect(Object.keys(await rig.fake.local.get(null)).filter((k) => k.startsWith('golearn:event:'))).toHaveLength(3);
  });

  it('on a chrome.alarms alarm every 5 minutes', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    expect(rig.fake.alarmsCreated).toContainEqual({ name: 'golearn-sync', periodInMinutes: 5 });
    await rig.fireTimers();
    rig.timers.length = 0;
    // an event that never got its debounced round (the worker was killed before it fired)
    await rig.content({ type: MSG.record, event: pendingEvent() });
    rig.timers.length = 0;
    const before = syncCalls(rig);
    rig.fake.alarmEvent.fire({ name: 'golearn-sync' });
    rig.fake.alarmEvent.fire({ name: 'some-other-alarm' });
    await new Promise((r) => setTimeout(r, 40));
    expect(syncCalls(rig)).toBe(before + 1);
    expect((await rig.bg.sync.status()).pending).toBe(0);
  });

  it('on request from the popup (golearn:sync-now) and the status says what happened', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    await rig.content({ type: MSG.record, event: pendingEvent() });
    const r = await rig.page({ type: MSG.syncNow });
    expect(r).toMatchObject({ ok: true, status: { pending: 0, needsSignIn: false } });
    expect((await rig.page({ type: MSG.status })).sync).toMatchObject({ pending: 0, needsSignIn: false });
  });

  it('never while signed out: nothing is sent, the events wait on the device', async () => {
    const rig = createRig();
    await rig.content({ type: MSG.record, event: pendingEvent() });
    const r = await rig.page({ type: MSG.syncNow });
    expect(r).toMatchObject({ ok: true, skipped: 'not-connected' });
    expect(rig.log).toEqual([]);
  });
});

describe('a 401 from the service', () => {
  it('sets needs-sign-in, keeps every event, and is not retried forever', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    // the service revokes the session (the learner signed out elsewhere, or it expired)
    expect((await rig.h.api(await tokenOf(rig)).deleteSession()).ok).toBe(true);
    await rig.content({ type: MSG.record, event: pendingEvent() });
    const r = await rig.page({ type: MSG.syncNow });
    expect(r).toMatchObject({ ok: false, skipped: 'needs-sign-in' });
    const status = await rig.page({ type: MSG.status });
    expect(status.needsSignIn).toBe(true);
    expect(status.sync).toMatchObject({ needsSignIn: true, pending: 1 });
    expect(status.sync.lastError).toMatch(/sign in/i);

    const calls = rig.log.length;
    await rig.page({ type: MSG.syncNow });
    rig.fake.alarmEvent.fire({ name: 'golearn-sync' });
    await rig.content({ type: MSG.record, event: pendingEvent('libër') });
    await rig.fireTimers();
    await new Promise((r2) => setTimeout(r2, 40));
    expect(rig.log.length).toBe(calls); // not one more request while the sign-in is dead
    expect(Object.keys(await rig.fake.local.get(null)).filter((k) => k.startsWith('queue:'))).toHaveLength(2); // nothing lost
    expect(await rig.h.store.list({ learnerId: who.learnerId, kinds: ['SelectionLookedUp'] })).toHaveLength(0);

    // signing in again clears it, and the waiting events go
    await rig.connect();
    await rig.fireTimers();
    expect((await rig.page({ type: MSG.status })).needsSignIn).toBe(false);
    expect(await rig.h.store.list({ learnerId: who.learnerId, kinds: ['SelectionLookedUp'] })).toHaveLength(2);
  });

  it('an expired session (past expiresAt) is reported the same way, without asking the service', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    rig.clock.now += 31 * 24 * 3600 * 1000; // the service session lasts 30 days
    await rig.content({ type: MSG.record, event: pendingEvent() });
    const calls = rig.log.length;
    const r = await rig.page({ type: MSG.syncNow });
    expect(r).toMatchObject({ ok: false, skipped: 'needs-sign-in' });
    expect(rig.log.length).toBe(calls);
    expect((await rig.page({ type: MSG.status })).needsSignIn).toBe(true);
  });
});

describe('offline', () => {
  it('keeps the events, reports the error and the offline state, and sends them when the connection returns', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    rig.offline.value = true;
    await rig.content({ type: MSG.record, event: pendingEvent() });
    const r = await rig.page({ type: MSG.syncNow });
    expect(r.ok).toBe(false);
    let st = (await rig.page({ type: MSG.status })).sync;
    expect(st.pending).toBe(1);
    expect(st.lastError).toMatch(/fetch/i);
    expect(st.needsSignIn).toBe(false);

    rig.offline.value = false;
    expect(await rig.page({ type: MSG.syncNow })).toMatchObject({ ok: true });
    st = (await rig.page({ type: MSG.status })).sync;
    expect(st).toMatchObject({ pending: 0 });
    expect(st.lastError).toBeUndefined();
    expect(await rig.h.store.list({ learnerId: who.learnerId, kinds: ['SelectionLookedUp'] })).toHaveLength(1);
  });

  it('setOnline(false) stops sending without an error', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    rig.bg.sync.setOnline(false);
    await rig.content({ type: MSG.record, event: pendingEvent() });
    const calls = rig.log.length;
    expect(await rig.bg.sync.syncOnce({ force: true })).toMatchObject({ ok: true, skipped: 'offline' });
    expect(rig.log.length).toBe(calls);
    expect((await rig.bg.sync.status()).online).toBe(false);
  });
});

describe('the learner-model cache', () => {
  const unit = 'lemma:sq:shtëpi:NOUN';

  it('is read from the Repository once per unit and then from the cache, in chrome.storage.session, with a 10-minute lifetime', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.h.store.putKnowledge([knowledgeRow(who.learnerId, unit, { exposure: { observations: 3 }, readingRecognition: { score: 0.5, confidence: 0.6, observations: 2 } })]);
    await rig.connect();
    const ask = () => rig.content({ type: MSG.profile, unitIds: [unit, 'lemma:sq:diçka:NOUN'], languageId: 'sq' });
    const first = await ask();
    expect(first).toMatchObject({ ok: true, connected: true, depth: 'brief', depthOrigin: 'default' });
    expect(first.rows[unit].dimensions.exposure.observations).toBe(3);
    expect(first.rows['lemma:sq:diçka:NOUN']).toBeUndefined(); // never met: no row, and that is cached too
    const asked = () => rig.log.filter((l) => l.path === '/knowledge').length;
    expect(asked()).toBe(1);
    await ask();
    expect(asked()).toBe(1);
    expect(Object.keys(await rig.fake.sessionArea.get(null))).toContain(`golearn:know:${unit}`);
    expect(Object.keys(await rig.fake.local.get(null)).some((k) => k.startsWith('golearn:know:'))).toBe(false);
    rig.clock.now += PROFILE_TTL_MS + 1000;
    await ask();
    expect(asked()).toBe(2); // the lifetime ended
  });

  it('rows carry the seven dimensions and no learner id', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.h.store.putKnowledge([knowledgeRow(who.learnerId, unit, { grammaticalUnderstanding: { negative: 2, positive: 1, observations: 3, confidence: 0.4, score: 0.3 } })]);
    await rig.connect();
    const r = await rig.content({ type: MSG.profile, unitIds: [unit], languageId: 'sq' });
    expect(Object.keys(r.rows[unit].dimensions).sort()).toEqual(['assistedRecognition', 'contextualProduction', 'exposure', 'grammaticalUnderstanding', 'listeningRecognition', 'productiveRetrieval', 'readingRecognition']);
    expect(JSON.stringify(r)).not.toContain(who.learnerId);
    expect(r.rows[unit].dimensions.grammaticalUnderstanding).toEqual({ score: 0.3, confidence: 0.4, observations: 3, positive: 1, negative: 2 });
  });

  it('is refreshed after each successful sync, so what GoPractice changed reaches the reader at the next lookup', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.h.store.putKnowledge([knowledgeRow(who.learnerId, unit, { exposure: { observations: 1 } })]);
    await rig.connect();
    await rig.fireTimers();
    const ask = async () => (await rig.content({ type: MSG.profile, unitIds: [unit], languageId: 'sq' })).rows[unit].dimensions.exposure.observations;
    expect(await ask()).toBe(1);
    // GoPractice's activity: the projection changes on the server
    await rig.h.store.putKnowledge([knowledgeRow(who.learnerId, unit, { exposure: { observations: 7 } })]);
    expect(await ask()).toBe(1); // within the lifetime the cache answers
    await rig.content({ type: MSG.record, event: pendingEvent() });
    await rig.fireTimers(); // a sync round
    expect(await ask()).toBe(7); // refreshed by the sync, not by the clock
  });

  it('answers from the cache, marked stale, when the service cannot be reached', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.h.store.putKnowledge([knowledgeRow(who.learnerId, unit, { exposure: { observations: 4 } })]);
    await rig.connect();
    await rig.content({ type: MSG.profile, unitIds: [unit], languageId: 'sq' });
    rig.clock.now += PROFILE_TTL_MS + 1000;
    rig.offline.value = true;
    const r = await rig.content({ type: MSG.profile, unitIds: [unit], languageId: 'sq' });
    expect(r).toMatchObject({ ok: true, connected: true, stale: true, error: 'offline' });
    expect(r.rows[unit].dimensions.exposure.observations).toBe(4);
  });

  it('says not connected when there is no session, and ignores malformed unit ids', async () => {
    const rig = createRig();
    expect(await rig.content({ type: MSG.profile, unitIds: [unit], languageId: 'sq' })).toMatchObject({ ok: true, connected: false, rows: {} });
    const who = await rig.signUp();
    await rig.h.store.putKnowledge([knowledgeRow(who.learnerId, unit, { exposure: { observations: 1 } })]);
    await rig.connect();
    const n = rig.log.length;
    const r = await rig.content({ type: MSG.profile, unitIds: ['../../etc/passwd', 'lemma:sq:a,b', 'x:y', 42, '', 'lemma:sq:a?b=c'], languageId: 'sq' });
    expect(r.rows).toEqual({});
    expect(rig.log.slice(n).filter((l) => l.path === '/knowledge')).toHaveLength(0); // nothing valid to ask: no request
  });

  it('the explicit explanation depth in settings beats the Repository\'s preference', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    expect(await rig.content({ type: MSG.profile, unitIds: [], languageId: 'sq' })).toMatchObject({ depth: 'brief', depthOrigin: 'default' });
    await rig.page({ type: MSG.settings, op: 'set', patch: { explanationDepth: 'explanatory' } });
    expect(await rig.content({ type: MSG.profile, unitIds: [], languageId: 'sq' })).toMatchObject({ depth: 'explanatory', depthOrigin: 'settings' });
  });
});

describe('sanity of the fixtures', () => {
  it('the rig talks to the real handler (a wrong password is the service\'s own 401)', async () => {
    const rig = createRig();
    await rig.signUp();
    const bad = await rig.h.api().createSession({ email: 'ana@example.com', password: PASSWORD + 'x', deviceId: 'd' });
    expect(bad.ok).toBe(false);
    expect(SERVICE).toBe('https://repo.example');
  });
});
