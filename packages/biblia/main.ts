/**
 * Entry point: the real environment (fetch, the document, the extension's Repository when this page is an extension page, the GoReview app's account
 * when this page is bundled in the iPhone app, the Repository service named in config.json when this is the standalone web edition) for `createBibliaApp`.
 */
import { createBibliaApp } from './src/app';
import { fetchJsonWith } from './src/data';
import { accountRecorder, extensionSend, makeRecorder, noRecorder, type AccountRecorder, type Recorder } from './src/repo';
import { createAccountService, normalizeServiceAddress, type AccountService } from './src/account';
import { createEventQueue } from './src/queue';
import { createSyncStatus } from './src/syncStatus';
import { createMobileRuntime } from '../gopractice/mobile';
import { loadConfig } from '../gopractice/config';
import { createRepositoryApi } from '../repository-service/src/api';

/** Inside the GoReview iPhone app (a native Capacitor platform): the app's Repository address (its config.json, one folder up) and its signed-in session, from Keychain. */
async function inApp(): Promise<{ api: ReturnType<typeof createRepositoryApi>; learnerId: string; deviceId: string } | undefined> {
  const mobile = createMobileRuntime(window);
  if (!mobile.native) return undefined;
  try {
    const config = await loadConfig((input, init) => globalThis.fetch(new URL(String(input), new URL('../', location.href)).href, init));
    const serviceUrl = config.serviceUrl;
    if (!serviceUrl) return undefined;
    const session = await mobile.getSession(serviceUrl);
    if (!session) return undefined;
    return { api: createRepositoryApi({ baseUrl: serviceUrl, fetch: globalThis.fetch.bind(globalThis), token: session.token }), learnerId: session.learnerId, deviceId: `iphone:${mobile.platform}` };
  } catch { return undefined; }
}

/** The standalone web edition: the build injects <meta name="biblia-edition" content="standalone">; then the page connects to the service in config.json. */
const isStandalone = (): boolean => document.querySelector('meta[name="biblia-edition"]')?.getAttribute('content') === 'standalone';

const storage = ((): Storage | undefined => { try { const s = window.localStorage; s.getItem('biblia:probe'); return s; } catch { return undefined; } })();

/** The account (sign-in state, the screen) and its recorder, over the Repository service config.json names. Without an address the page stays a reader and says so. */
/** The Repository address chosen on this device in place of config.json's (the sign-in screen's "Service address", 2026-10-25); absent = the usual one. */
const SERVICE_OVERRIDE_KEY = 'biblia:serviceUrl';
type ServiceAddress = { current: string; standard: string; set(url: string | undefined): void };

async function standalone(): Promise<{ recorder: AccountRecorder; account: AccountService; serviceAddress: ServiceAddress } | { recorder: Recorder; account?: undefined; serviceAddress?: undefined }> {
  const config = await loadConfig((input, init) => globalThis.fetch(input, init));
  if (!config.serviceUrl) return { recorder: noRecorder('This copy of Biblia names no Repository service in its config.json, so it is a reader only and nothing is kept.') };
  const standard = config.serviceUrl.replace(/\/+$/, '');
  const override = normalizeServiceAddress(storage?.getItem(SERVICE_OVERRIDE_KEY) ?? '');
  const serviceUrl = override && override !== standard ? override : standard;
  const serviceAddress: ServiceAddress = {
    current: serviceUrl,
    standard,
    set(url) {
      try { if (url && url !== standard) storage?.setItem(SERVICE_OVERRIDE_KEY, url); else storage?.removeItem(SERVICE_OVERRIDE_KEY); } catch { /* no storage: nothing to keep */ }
      // sessions, queues and levels are kept per address: the page starts again on the new one
      window.setTimeout(() => window.location.reload(), 150);
    },
  };
  const account = createAccountService({ serviceUrl, ...(storage ? { storage } : {}), fetch: (input, init) => globalThis.fetch(input, init) });
  const recorder = accountRecorder({
    session: () => { const s = account.session(); const api = account.api(); return s && api ? { api, learnerId: s.learnerId, deviceId: s.deviceId } : undefined; },
    queue: createEventQueue(storage),
    ...(storage ? { storage } : {}),
    win: window,
    subscribeSession: (listener) => account.subscribe(listener),
    onAppended: (events) => account.emitAppended(events),
    onAuthExpired: () => account.expire(),
  });
  return { recorder, account, serviceAddress };
}

const started = (async () => {
  const mobile = createMobileRuntime(window);
  const app = await inApp();
  // The standalone marker wins wherever the GoReview app's session is not present: the hosted web edition, and (2026-10-24) Biblia's own
  // native shell (packages/biblia-ios), which bundles the standalone edition and signs in on its own.
  const own = !app && !extensionSend() && isStandalone() ? await standalone() : undefined;
  const recorder = own ? own.recorder : app ? makeRecorder(undefined, app) : mobile.native
    ? { ...makeRecorder(undefined), reason: 'Sign in to GoReview (the app this page belongs to) to record what you read; until then Biblia is a reader only.' }
    : makeRecorder();
  const running = await createBibliaApp({
    win: window, doc: document,
    source: fetchJsonWith((input, init) => globalThis.fetch(input, init), './'),
    recorder,
    ...(own?.account ? { account: own.account, serviceAddress: own.serviceAddress } : {}),
    // the way back to GoReview exists only when this page is bundled INSIDE the GoReview app (not in Biblia's own shell, which has the marker)
    ...(mobile.native && !isStandalone() ? { backUrl: '../index.html#/review' } : {}),
    ...(storage ? { storage } : {}),
    now: () => new Date(),
  });
  if (own?.account) {
    const syncStatus = createSyncStatus({ doc: document, account: own.account, recorder: own.recorder });
    document.getElementById('app')?.before(syncStatus.element);
    const destroy = running.destroy.bind(running);
    running.destroy = () => { syncStatus.destroy(); destroy(); };
  }
  // The standalone Biblia bundled in a native shell receives Capacitor resume as a browser-style event.
  // The recorder owns the listener; tie the native bridge subscription to the app lifetime as well.
  if (own?.account && mobile.native) {
    const removeLifecycle = mobile.installLifecycle?.(window);
    if (removeLifecycle) {
      const destroy = running.destroy.bind(running);
      running.destroy = () => { removeLifecycle(); destroy(); };
    }
  }
  // a kept sign-in is confirmed with the service, then what waited in the offline queue is sent
  if (own?.account) void (async () => { await own.account!.start(); await own.recorder.flush?.(); })();
  return running;
})();
started.catch((e) => {
  const el = document.getElementById('app');
  if (el) el.textContent = `Biblia could not start: ${e instanceof Error ? e.message : String(e)}`;
});
// development only: a handle for inspecting the running app (the card's closed shadow root) from the browser console; never in a build
if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) void started.then((app) => { (window as unknown as { __biblia?: unknown }).__biblia = app; });
