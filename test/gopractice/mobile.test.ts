// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { afterEach } from 'vitest';
import { createMemoryArea } from '../../packages/repository-sync/src';
import { createMobileRuntime, createNativeKeyValueArea, nativeLearnerPrefix, type GoReviewNativeBridge } from '../../packages/gopractice/mobile';
import { createScopedArea, createStateStore, KEYS, learnerPrefix, type Session } from '../../packages/gopractice/state';
import type { MobileRuntime } from '../../packages/gopractice/mobile';
import { candidate, knowledgeRow, unitOf, cardAdded, defaultService, destroyRigs, ids, makeRig, type, until } from './helpers';

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

  it('renders the authenticated GoReview home and fetched vocabulary after a native sign-in', async () => {
    const service = defaultService();
    service.candidates.set('L1-e1', [candidate('det', 0.8)]);
    service.knowledge.set('L1',[{...knowledgeRow('L1',unitOf('det'),'sq',{}),level:'recognized'}]);
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
