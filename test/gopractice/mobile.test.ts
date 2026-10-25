// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { afterEach } from 'vitest';
import { createMemoryArea } from '../../packages/repository-sync/src';
import { createMobileRuntime, createNativeKeyValueArea, nativeLearnerPrefix, type GoReviewNativeBridge } from '../../packages/gopractice/mobile';
import { createScopedArea, createStateStore, KEYS, learnerPrefix, type Session } from '../../packages/gopractice/state';
import type { MobileRuntime } from '../../packages/gopractice/mobile';
import { createInProcessApi } from '../../packages/repository-service/src/api';
import type { Transport } from '../../packages/repository-sync/src';
import { createRemote, review as realReview } from '../repository-local/support';
import { candidate, cardAdded, defaultService, destroyRigs, ids, makeRig, type, until, type FakeService } from './helpers';

const session: Session = { token: 'secret-token', learnerId: 'learner-A', email: 'a@example.org', expiresAt: '2027-01-01T00:00:00.000Z', serviceUrl: 'https://repo.example.org' };

function memoryMobile(area = createMemoryArea(), failWrites = false): MobileRuntime & { secret(): Session | undefined } {
  let stored: Session | undefined;
  return {
    native: true, platform: 'ios', bridgeAvailable: true, area,
    async getSession(serviceUrl) { return stored?.serviceUrl === serviceUrl ? stored : undefined; },
    async setSession(value) { if (failWrites) throw new Error('Keychain refused the write'); stored = value; },
    async clearSession(serviceUrl) { if (stored?.serviceUrl === serviceUrl) stored = undefined; },
    secret: () => stored,
  };
}

afterEach(() => destroyRigs());

function bridgeFake() {
  const values: Record<string, unknown> = {};
  let secret: Session | undefined;
  const bridge: GoReviewNativeBridge = {
    async getSession(_options) { return secret ? { session: secret } : {}; },
    async setSession({ session: value }) { secret = value; },
    async clearSession(_options) { secret = undefined; },
    async storageGet({ keys } = {}) { return { values: Object.fromEntries(Object.entries(values).filter(([k]) => !keys || keys.includes(k))) }; },
    async storageSet({ values: next }) { Object.assign(values, next); },
    async storageRemove({ keys }) { for (const key of keys) delete values[key]; },
    async storageList({ prefix }) { return { keys: Object.keys(values).filter((k) => k.startsWith(prefix)) }; },
  };
  return { bridge, values, readSecret: () => secret };
}

describe('GoReview native runtime', () => {
  it('isolates local account queues when services reuse the same learner ID', () => {
    expect(nativeLearnerPrefix('learner-A', 'https://one.example.org')).not.toBe(nativeLearnerPrefix('learner-A', 'https://two.example.org'));
  });

  it('keeps the bearer session in secure storage and never writes it to the general area or localStorage', async () => {
    localStorage.clear();
    const { bridge, values, readSecret } = bridgeFake();
    const area = createNativeKeyValueArea(bridge);
    const state = createStateStore(area, {
      get: async () => (await bridge.getSession({ serviceUrl: 'https://repo.example.org' }) as { session?: Session }).session,
      set: (value) => bridge.setSession({ session: value }),
      clear: () => bridge.clearSession({ serviceUrl: 'https://repo.example.org' }),
    });

    await state.setSession(session);
    await area.set({ 'u:learner-A:queue:1': { id: 'event-1' }, 'u:learner-B:queue:1': { id: 'event-2' } });

    expect(await state.getSession()).toEqual(session);
    expect(readSecret()).toEqual(session);
    expect(values).not.toHaveProperty('gopractice:session');
    expect(JSON.stringify(values)).not.toContain(session.token);
    expect(localStorage.length).toBe(0);

    const own = createScopedArea(area, learnerPrefix('learner-A'));
    expect(await own.list('queue:')).toEqual(['queue:1']);
    await state.clearSession();
    expect(readSecret()).toBeUndefined();
    expect((await own.get('queue:1'))['queue:1']).toEqual({ id: 'event-1' });
  });

  it('routes app activation to the resume event and identifies the iOS platform', async () => {
    const { bridge } = bridgeFake();
    const target = window as Window & { Capacitor?: unknown };
    let activate: ((state: { isActive: boolean }) => void) | undefined;
    target.Capacitor = {
      getPlatform: () => 'ios', isNativePlatform: () => true, isPluginAvailable: () => true,
      Plugins: { GoReviewNative: bridge },
      App: { addListener: async (_name: string, cb: (state: { isActive: boolean }) => void) => { activate = cb; return { remove() {} }; } },
    };
    const runtime = createMobileRuntime(window);
    const onResume = vi.fn();
    window.addEventListener('resume', onResume);
    const remove = runtime.installLifecycle?.(window);
    await Promise.resolve();
    activate?.({ isActive: false });
    expect(onResume).not.toHaveBeenCalled();
    activate?.({ isActive: true });
    expect(runtime.native).toBe(true);
    expect(runtime.platform).toBe('ios');
    expect(onResume).toHaveBeenCalledTimes(1);
    remove?.();
    window.removeEventListener('resume', onResume);
    delete target.Capacitor;
  });

  it('fails closed for a native shell without the secure bridge', async () => {
    const target = window as Window & { Capacitor?: unknown };
    target.Capacitor = { getPlatform: () => 'ios', isNativePlatform: () => true, isPluginAvailable: () => false };
    const runtime = createMobileRuntime(window);
    expect(runtime.native).toBe(true);
    expect(runtime.bridgeAvailable).toBe(false);
    expect(runtime.area).toBeUndefined();
    await expect(runtime.setSession(session)).rejects.toThrow(/Secure native session storage/);
    delete target.Capacitor;
  });

  it('signs in with the iOS platform, syncs after resume, and marks expired auth while keeping the secure session', async () => {
    const mobile = memoryMobile();
    const rig = await makeRig({ mobile });
    const signed = await rig.app.ctx.signIn({ email: 'ana@example.org', password: 'correct-horse-battery' });
    expect(signed.ok).toBe(true);
    expect(rig.service.platforms).toContain('ios');
    expect(mobile.secret()?.serviceUrl).toBe('https://repository.example.org');
    expect((await rig.area.get(KEYS.session))[KEYS.session]).toBeUndefined();

    const data = await rig.app.ctx.data();
    const stopSync = vi.spyOn(data!.sync, 'stop');
    const startSync = vi.spyOn(data!.sync, 'start');
    rig.deps.win.dispatchEvent(new Event('suspend'));
    expect(stopSync).toHaveBeenCalledTimes(1);

    const fromGoLearn = cardAdded(ids('L1', 'sq'), 'qen', 'meaning-to-form', '2026-10-08T10:00:00.000Z');
    rig.service.inject('L1', fromGoLearn);
    rig.deps.autoSync = true;
    rig.deps.win.dispatchEvent(new Event('resume'));
    expect(startSync).toHaveBeenCalledWith(30_000);
    await until(async () => (await rig.app.ctx.events('sq')).some((e) => e.id === fromGoLearn.id), 'the resume sync pull');

    rig.service.tokens.clear();
    rig.deps.win.dispatchEvent(new Event('resume'));
    await until(async () => (await rig.app.ctx.syncView()).authExpired, 'native auth expiry');
    expect(mobile.secret()?.token).toBeTruthy();
  });

  it('keeps an offline native queue and catches up with another device on app resume through the real Repository handler', async () => {
    const remote = createRemote();
    const email = 'native-sync@example.org';
    const password = 'correct horse battery staple';
    const account = await remote.signUp(email, 'seed-device');
    const serverEvents = async () => {
      const result = await account.api.listEvents();
      if (!result.ok) throw new Error(`Repository event read failed: ${result.status} ${result.message}`);
      return result.data.events;
    };
    const service = { api: (token?: string) => createInProcessApi(remote.deps, token) } as unknown as FakeService;
    const deviceOneNetwork = { online: true };
    const deviceTwoNetwork = { online: true };
    const transport = (network: { online: boolean }) => (api: import('../../packages/repository-service/src/api').RepositoryApi): Transport => ({
      async push(req) {
        if (!network.online) throw new Error('network unavailable');
        const r = await api.syncPush(req);
        if (!r.ok) throw new Error(r.message);
        return r.data;
      },
      async pull(req) {
        if (!network.online) throw new Error('network unavailable');
        const r = await api.syncPull(req);
        if (!r.ok) throw new Error(r.message);
        return r.data;
      },
    });

    const areaOne = createMemoryArea();
    const mobileOne = memoryMobile(areaOne);
    const first = await makeRig({ service, area: areaOne, mobile: mobileOne, transport: transport(deviceOneNetwork) });
    expect((await first.app.ctx.signIn({ email, password })).ok).toBe(true);
    await first.app.ctx.syncNow({ force: true });

    const firstIdentity = (await first.app.ctx.identity())!;
    const offlineEvent = realReview(firstIdentity, 'lemma:sq:offline-native:NOUN', remote.clock);
    deviceOneNetwork.online = false;
    expect((await first.app.ctx.record([offlineEvent])).queued).toBe(1);
    await first.app.ctx.syncNow({ force: true });
    await until(async () => await (await first.app.ctx.data())?.queue.size() === 1, 'the offline native queue to remain pending');
    expect((await serverEvents()).some((e) => e.id === offlineEvent.id)).toBe(false);
    destroyRigs();

    const areaTwo = createMemoryArea();
    const second = await makeRig({ service, area: areaTwo, mobile: memoryMobile(areaTwo), transport: transport(deviceTwoNetwork) });
    expect((await second.app.ctx.signIn({ email, password })).ok).toBe(true);
    const secondIdentity = (await second.app.ctx.identity())!;
    const otherDeviceEvent = realReview(secondIdentity, 'lemma:sq:other-device:NOUN', remote.clock);
    expect((await second.app.ctx.record([otherDeviceEvent])).queued).toBe(1);
    await second.app.ctx.syncNow({ force: true });
    await until(async () => (await serverEvents()).some((e) => e.id === otherDeviceEvent.id), 'the other device event to reach the Repository');
    destroyRigs();

    deviceOneNetwork.online = false;
    const reopened = await makeRig({ service, area: areaOne, mobile: mobileOne, transport: transport(deviceOneNetwork) });
    const reloaded = await reopened.app.ctx.data();
    expect(reloaded).toBeDefined();
    await reopened.app.ctx.whenSynced();
    expect(await reloaded!.queue.size()).toBe(1);
    expect((await reopened.app.ctx.events('sq')).some((e) => e.id === otherDeviceEvent.id)).toBe(false);

    deviceOneNetwork.online = true;
    reopened.deps.win.dispatchEvent(new Event('resume'));
    await until(async () => (await reopened.app.ctx.events('sq')).some((e) => e.id === otherDeviceEvent.id), 'the resumed device to pull the other device event');
    await until(async () => (await reloaded!.queue.size()) === 0, 'the resumed device to flush its queued event');
    expect((await serverEvents()).map((e) => e.id)).toEqual(expect.arrayContaining([offlineEvent.id, otherDeviceEvent.id]));
    expect((await reopened.app.ctx.events('sq')).map((e) => e.id)).toEqual(expect.arrayContaining([offlineEvent.id, otherDeviceEvent.id]));
  });

  it('renders the authenticated GoReview home and fetched vocabulary after a native sign-in', async () => {
    const service = defaultService();
    service.candidates.set('L1-e1', [candidate('det', 0.8)]);
    const mobile = memoryMobile();
    const rig = await makeRig({ service, mobile });
    type(rig.q<HTMLInputElement>('#signin-email'), 'ana@example.org');
    type(rig.q<HTMLInputElement>('#signin-password'), 'correct-horse-battery');
    rig.q<HTMLFormElement>('#signin-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await until(() => !!mobile.secret() && rig.app.current() === 'review' && !!rig.root.querySelector('#review-home'), 'the authenticated home render');
    await until(() => rig.root.querySelector('#deck-count')?.textContent === '1 card ready', 'the first synced candidate card');
    expect(rig.root.querySelector('#language-name')?.textContent).toContain('Albanian');
    expect(rig.root.querySelector('#entry-tell')).not.toBeNull();
    expect(rig.root.querySelector('#sync-indicator')?.textContent).toMatch(/Online|Syncing/);
    expect(rig.root.textContent).not.toContain('This screen could not be shown');
  });

  it('clears the previous native account on service change while retaining its queued events under its origin', async () => {
    const mobile = memoryMobile();
    const rig = await makeRig({ mobile });
    expect((await rig.app.ctx.signIn({ email: 'ana@example.org', password: 'correct-horse-battery' })).ok).toBe(true);
    rig.service.netDown = true;
    await rig.app.ctx.record([cardAdded(ids('L1', 'sq'), 'zog', 'meaning-to-form', '2026-10-08T10:00:00.000Z')]);
    const oldPrefix = nativeLearnerPrefix('L1', 'https://repository.example.org');
    expect(await rig.area.list(`${oldPrefix}queue:`)).toHaveLength(1);
    await rig.go('settings');
    expect(rig.q('#settings-service').textContent).toContain('queued events stay with the previous service');
    expect(rig.q('#settings-service').textContent).toContain('Switch back to sync them');

    expect(await rig.app.ctx.saveService('https://other.example.org')).toEqual({ ok: true });
    expect(mobile.secret()).toBeUndefined();
    expect((await rig.area.get(KEYS.profile))[KEYS.profile]).toBeUndefined();
    expect(await rig.area.list(`${oldPrefix}queue:`)).toHaveLength(1);

    rig.service.netDown = false;
    expect((await rig.app.ctx.signIn({ email: 'ana@example.org', password: 'correct-horse-battery' })).ok).toBe(true);
    const current = await rig.app.ctx.data();
    expect(await current?.queue.size()).toBe(0);
    expect(await rig.area.list(`${oldPrefix}queue:`)).toHaveLength(1);
  });

  it('reports secure session write failures without persisting the bearer token in local storage', async () => {
    localStorage.clear();
    const mobile = memoryMobile(createMemoryArea(), true);
    const rig = await makeRig({ mobile });
    const result = await rig.app.ctx.signIn({ email: 'ana@example.org', password: 'correct-horse-battery' });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('save the sign-in securely') });
    expect(localStorage.length).toBe(0);
    expect((await rig.area.get(KEYS.session))[KEYS.session]).toBeUndefined();
  });

  it('shows a retryable screen instead of going blank when authenticated identity loading fails', async () => {
    const rig = await makeRig({ mobile: memoryMobile() });
    expect((await rig.app.ctx.signIn({ email: 'ana@example.org', password: 'correct-horse-battery' })).ok).toBe(true);
    const unavailable = vi.spyOn(rig.app.ctx, 'identity').mockRejectedValueOnce(new Error('temporary native read failure'));

    await rig.go('settings');
    expect(rig.root.textContent).toContain('GoReview could not load your saved account data. Try again.');
    expect(rig.root.querySelector('button')?.textContent).toBe('Try again');

    unavailable.mockRestore();
    rig.root.querySelector<HTMLButtonElement>('button')?.click();
    await until(() => !!rig.root.querySelector('#screen h1'), 'the retry render');
    await rig.app.ready();
    expect(rig.root.textContent).toContain('Settings');
  });

  it('keeps a visible loading state while an authenticated native identity read is pending', async () => {
    const rig = await makeRig({ mobile: memoryMobile() });
    expect((await rig.app.ctx.signIn({ email: 'ana@example.org', password: 'correct-horse-battery' })).ok).toBe(true);
    const identity = await rig.app.ctx.identity();
    let finish!: (value: typeof identity) => void;
    const pending = new Promise<typeof identity>((resolve) => { finish = resolve; });
    vi.spyOn(rig.app.ctx, 'identity').mockReturnValue(pending);

    void rig.app.go('settings');
    await until(() => rig.root.querySelector('#screen h1')?.textContent === 'Settings', 'the settings heading');
    expect(rig.root.textContent).toContain('Loading your saved account data…');

    finish(identity);
    await until(() => !rig.root.textContent?.includes('Loading your saved account data…'), 'the settled identity read');
    expect(rig.root.textContent).toContain('Settings');
  });
});
