// @vitest-environment node
/**
 * Sync timing in the background worker (the owner's complaint: "slow and inconsistent"): events waiting after a failure are retried on a short
 * ladder and never held back by the sync client's own backoff, the connection coming back sends them at once, the alarm runs every minute (and an
 * install that still has the old 5-minute alarm gets the new one), and the worker never retries a dead sign-in or an offline browser.
 */
import { describe, expect, it } from 'vitest';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { RETRY_BASE_MS, RETRY_MAX_MS, SYNC_ALARM, SYNC_DEBOUNCE_MS, SYNC_PERIOD_MINUTES } from '../../packages/golearn-extension/src/background/sync';
import { createRig, pendingEvent } from './rig';

const pushes = (rig: ReturnType<typeof createRig>): number => rig.log.filter((l) => l.path === '/sync/push').length;
const live = (rig: ReturnType<typeof createRig>) => rig.timers.filter((t) => !t.cleared && !t.fired);
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 30));

describe('events waiting after a failed round', () => {
  it('are retried after 5 s, 10 s, 20 s, 30 s, 30 s ... without waiting for the next alarm', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    rig.offline.value = true;
    await rig.content({ type: MSG.record, event: pendingEvent() });
    await rig.fireTimers(); // the debounce round: the first failure
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      const next = live(rig);
      expect(next).toHaveLength(1);
      delays.push(next[0].ms);
      next[0].fire(); // the retry runs, fails again, arms the next
      await settle();
    }
    expect(delays[0]).toBe(RETRY_BASE_MS);
    expect(delays.slice(0, 4)).toEqual([5_000, 10_000, 20_000, 30_000]);
    expect(Math.max(...delays)).toBe(RETRY_MAX_MS);
    expect((await rig.bg.sync.status()).pending).toBe(1); // still there
  });

  it('go at the first retry once the service is back, and the ladder stops', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    rig.offline.value = true;
    await rig.content({ type: MSG.record, event: pendingEvent() });
    await rig.fireTimers(); // the debounce round fails
    const retry = live(rig).find((t) => t.ms === RETRY_BASE_MS);
    expect(retry).toBeDefined();
    rig.offline.value = false;
    retry!.fire();
    await settle();
    expect((await rig.bg.sync.status()).pending).toBe(0);
    expect(await rig.h.store.list({ learnerId: who.learnerId, kinds: ['SelectionLookedUp'] })).toHaveLength(1);
    rig.timers.length = 0;
    await rig.bg.sync.syncOnce();
    expect(live(rig)).toHaveLength(0); // nothing waiting, nothing armed
  });

  it('are sent by the next debounce round even while the sync client is in its backoff', async () => {
    const rig = createRig();
    const who = await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    rig.offline.value = true;
    await rig.content({ type: MSG.record, event: pendingEvent('libër') });
    await rig.bg.sync.syncOnce(); // fails: the client is now in backoff (the clock does not move)
    rig.offline.value = false;
    await rig.content({ type: MSG.record, event: pendingEvent('bukur') });
    const before = pushes(rig);
    const debounce = live(rig).find((t) => t.ms === SYNC_DEBOUNCE_MS);
    expect(debounce).toBeDefined();
    debounce!.fire();
    await settle();
    expect(pushes(rig)).toBeGreaterThan(before); // not "skipped: backoff"
    expect((await rig.bg.sync.status()).pending).toBe(0);
    expect(await rig.h.store.list({ learnerId: who.learnerId, kinds: ['SelectionLookedUp'] })).toHaveLength(2);
  });

  it('are sent at once by the alarm, backoff or not', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    rig.offline.value = true;
    await rig.content({ type: MSG.record, event: pendingEvent() });
    await rig.bg.sync.syncOnce();
    rig.offline.value = false;
    rig.fake.alarmEvent.fire({ name: SYNC_ALARM });
    await settle();
    expect((await rig.bg.sync.status()).pending).toBe(0);
  });

  it('are not retried by the ladder while the browser is offline or the sign-in is dead', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    rig.bg.sync.setOnline(false);
    await rig.content({ type: MSG.record, event: pendingEvent() });
    rig.timers.length = 0;
    expect(await rig.bg.sync.syncOnce()).toMatchObject({ ok: true, skipped: 'offline' });
    expect(live(rig)).toHaveLength(0);
  });
});

describe('the connection coming back', () => {
  it('asks for a round at once (a forced debounce), not after the backoff', async () => {
    const rig = createRig();
    await rig.signUp();
    await rig.connect();
    await rig.fireTimers();
    rig.bg.sync.setOnline(false);
    await rig.content({ type: MSG.record, event: pendingEvent() });
    rig.timers.length = 0;
    rig.bg.sync.setOnline(true);
    const t = live(rig);
    expect(t).toHaveLength(1);
    expect(t[0].ms).toBe(SYNC_DEBOUNCE_MS);
    t[0].fire();
    await settle();
    expect((await rig.bg.sync.status()).pending).toBe(0);
  });
});

describe('the alarm', () => {
  it('runs every minute', () => {
    expect(SYNC_PERIOD_MINUTES).toBe(1);
  });

  it('replaces an alarm left by an older install that ran every 5 minutes', async () => {
    const rig = createRig();
    await settle(); // the worker's own registration has finished
    rig.fake.alarmsCreated.length = 0;
    rig.fake.alarmsCreated.push({ name: SYNC_ALARM, periodInMinutes: 5 });
    rig.bg.sync.registerAlarm(rig.fake);
    await settle();
    expect(rig.fake.alarmsCreated.filter((a) => a.periodInMinutes === 1)).toHaveLength(1);
  });

  it('is left alone when it is already the 1-minute alarm', async () => {
    const rig = createRig();
    await settle(); // the worker's own registration has finished
    rig.fake.alarmsCreated.length = 0;
    rig.fake.alarmsCreated.push({ name: SYNC_ALARM, periodInMinutes: 1 });
    rig.bg.sync.registerAlarm(rig.fake);
    await settle();
    expect(rig.fake.alarmsCreated).toHaveLength(1);
  });
});
