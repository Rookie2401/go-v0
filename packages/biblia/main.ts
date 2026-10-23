/** Entry point: the real environment (fetch, the document, the extension's Repository when this page is an extension page, the GoReview app's account when this page is bundled in the iPhone app) for `createBibliaApp`. */
import { createBibliaApp } from './src/app';
import { fetchJsonWith } from './src/data';
import { makeRecorder } from './src/repo';
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

const started = (async () => {
  const mobile = createMobileRuntime(window);
  const app = await inApp();
  const recorder = app ? makeRecorder(undefined, app) : mobile.native
    ? { ...makeRecorder(undefined), reason: 'Sign in to GoReview (the app this page belongs to) to record what you read; until then Biblia is a reader only.' }
    : makeRecorder();
  return createBibliaApp({
    win: window, doc: document,
    source: fetchJsonWith((input, init) => globalThis.fetch(input, init), './'),
    recorder,
    ...(mobile.native ? { backUrl: '../index.html#/review' } : {}),
    storage: (() => { try { const s = window.localStorage; s.getItem('biblia:probe'); return s; } catch { return undefined; } })(),
    now: () => new Date(),
  });
})();
started.catch((e) => {
  const el = document.getElementById('app');
  if (el) el.textContent = `Biblia could not start: ${e instanceof Error ? e.message : String(e)}`;
});
// development only: a handle for inspecting the running app (the card's closed shadow root) from the browser console; never in a build
if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) void started.then((app) => { (window as unknown as { __biblia?: unknown }).__biblia = app; });
