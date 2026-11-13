/**
 * Entry point: builds the real environment for `createApp` (the origin's localStorage, fetch, GoListen, GoReview's builders)
 * and starts the application. Tests build their own `Deps` and call `createApp` directly.
 */
import { SIGN_IN_TIMEOUT_MS } from './signin';
import { evidenceFor, ratingFor, registry } from '../src';
import { createRepositoryApi } from '../../repository-service/src/api';
import { createMemoryArea } from '../../repository-sync/src';
import { createApp } from './app';
import { loadBuiltInAdapter } from '../../language-packs/src/builtins';
import { createAudioDeps } from './audio';
import { getExtension, localRepoFor } from './localBinding';
import { resolveConfig } from './config';
import { createReviewEngine } from './engine';
import { packFactsFor } from './packFacts';
import type { Deps } from './ports';
import { createIndexedDbKeyValueArea, createWebKeyValueArea } from './state';
import { createMobileRuntime } from './mobile';
import { withRequestTimeout } from '../../repository-service/src/requestTimeout';
import { resolveServiceUrl } from './config';
import { APP_VERSION } from './version';

function storageArea(mobile: ReturnType<typeof createMobileRuntime>): Deps['area'] {
  if (mobile.native) {
    if (mobile.area) return mobile.area;
    throw new NativeStorageUnavailableError();
  }
  let s: Storage | undefined;
  try { s = window.localStorage; s.getItem('gopractice:probe'); } catch { s = undefined; }
  // IndexedDB first (2026-10-26): localStorage's ~5 MB is shared by every app on this origin (GitHub Pages serves GoReview, the GoLearn
  // setup app and the old PWA from one), and the learner's event log is one row per event, so a few thousand events exceeded it and
  // sync failed with "The quota has been exceeded". GoReview's rows (gopractice:*, u:*) are moved out of localStorage once, on first use.
  try {
    const idb = window.indexedDB;
    if (idb) return createIndexedDbKeyValueArea(idb, 'gopractice', s ? { from: s, prefixes: ['gopractice:', 'u:'] } : undefined);
  } catch { /* no IndexedDB here: localStorage below */ }
  if (s) return createWebKeyValueArea(s);
  // storage blocked (a private window): the app works for this visit, and nothing is kept afterwards
  return createMemoryArea();
}

const uuid = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.floor(Math.random() * 36 ** 8).toString(36)}`);

class NativeStorageUnavailableError extends Error {}
class ConfigUnavailableError extends Error {}

/** A built app (the hosted review and web builds, the extension) must know its service address; only the development server may fall back to the default. */
const isProductionBuild = (): boolean => { const mode = (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE; return mode === 'review' || mode === 'extension' || mode === 'production'; };

/** Bound waits for repository requests on a phone with a stale tunnel or no route. Asset fetches keep using `doFetch`. */
export function withApiRequestTimeout(fetcher: typeof fetch, timeoutMs = 8_000): typeof fetch {
  return withRequestTimeout(fetcher, timeoutMs);
}

export async function createRealDeps(fetcher?: typeof fetch): Promise<Deps> {
  const mobile = createMobileRuntime(window);
  if (mobile.native && !(await mobile.probe?.())) throw new NativeStorageUnavailableError();
  const rawFetch: typeof fetch = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  const doFetch: typeof fetch = (input, init = {}) => {
    const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let path = value;
    try { path = new URL(value, location.href).pathname; } catch { /* relative-path matcher below */ }
    // signing in or creating an account may meet a service that is waking up or redeploying: it gets 45 s, not 8 (the owner, 2026-11-12)
    const method = (init.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    const signIn = method === 'POST' && /\/(sessions|accounts)$/.test(path);
    const timeout = signIn ? SIGN_IN_TIMEOUT_MS : path.endsWith('/sync/wait') ? 30_000 : /\/sync\/wait(?:\?|$)/.test(value) ? 30_000 : 8_000;
    return withApiRequestTimeout(rawFetch, timeout)(input, init);
  };
  const apiFetch = doFetch;
  const speechFetch = withRequestTimeout(rawFetch, 30_000);
  const ext = getExtension();
  let keptConfig: Storage | undefined;
  try { keptConfig = window.localStorage; } catch { keptConfig = undefined; }
  // config.json, else the last good copy of it kept on this device; never silently the development address in a built app (2026-11-10)
  const resolved = await resolveConfig(doFetch, keptConfig);
  // the extension works on the device with no service address at all (an account is optional there)
  if (resolved.source === 'none' && isProductionBuild() && !ext) throw new ConfigUnavailableError();
  const config = resolved.config;
  const engine = createReviewEngine({
    builders: registry, evidenceFor, ratingFor,
    warmLanguage: (languageId) => { loadBuiltInAdapter(languageId).catch(() => { /* met again, and reported, when the language is first used */ }); },
    factsFor: packFactsFor({ fetch: doFetch, baseUrl: config.assetBaseUrl ?? './', lexiconBaseUrl: './' }),
  });
  // Inside the GoLearn extension (this page is served from chrome-extension://…/review/) GoReview works on the device with no account: the
  // on-device Repository is reached through the extension's worker. Anywhere else (the hosted copy) there is none, and an account is needed.
  const HOSTED_SETUP = 'https://rookie2401.github.io/go-v0/app/index.html#/languages';
  return {
    win: window, doc: document, fetch: doFetch, area: storageArea(mobile), config, mobile,
    ...(ext ? { local: async () => localRepoFor(ext) } : {}),
    links: {
      ...(ext ? { setup: '../app/index.html#/languages', biblia: '../../biblia/index.html' } : { setup: HOSTED_SETUP, ...(config.extensionUrl ? { extension: config.extensionUrl } : {}) }),
      ...(config.bibliaUrl ? { biblia: config.bibliaUrl } : {}),
      ...(config.supportEmail ? { support: config.supportEmail } : {}),
    },
    createApi: (baseUrl, token) => createRepositoryApi({ baseUrl, fetch: apiFetch, token }),
    engine,
    audio: (consent, accountToken) => createAudioDeps({ consent, fetch: speechFetch,
      ...(!ext ? { speechProxyBase: `${resolveServiceUrl(config).replace(/\/+$/, '')}/api/speech`, ...(accountToken ? { accountToken } : {}) } : {}),
      ...(ext ? { extensionRuntime: ext.runtime, extensionUrl: `${location.protocol}//${location.host}${location.pathname}` } : {}),
    }),
    ...(document.querySelector('meta[name="goreview-edition"][content="review"]') ? { edition: 'review' as const } : {}),
    enableGoTell: import.meta.env.DEV && import.meta.env.VITE_GOREVIEW_GOTELL === 'true',
    now: () => new Date(), newId: uuid, random: Math.random, appVersion: APP_VERSION, autoSync: true,
  };
}

function showNativeStorageError(root: HTMLElement): void {
  const section = document.createElement('section');
  section.className = 'card error';
  section.setAttribute('role', 'alert');
  const title = document.createElement('h1');
  title.textContent = 'GoReview couldn’t open your saved data';
  const message = document.createElement('p');
  message.textContent = 'Try again, or close and reopen the app. Your saved data has not been replaced.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn primary';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => { void main(); });
  section.append(title, message, retry);
  root.replaceChildren(section);
}

function showConfigError(root: HTMLElement): void {
  const section = document.createElement('section');
  section.className = 'card error';
  section.setAttribute('role', 'alert');
  const title = document.createElement('h1');
  title.textContent = 'GoReview couldn’t load its settings';
  const message = document.createElement('p');
  message.textContent = 'Check your connection, then try again. Your saved data has not been replaced.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn primary';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => { void main(); });
  section.append(title, message, retry);
  root.replaceChildren(section);
}

async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  try {
    createApp(root, await createRealDeps());
  } catch (error) {
    if (error instanceof NativeStorageUnavailableError) showNativeStorageError(root);
    else if (error instanceof ConfigUnavailableError) showConfigError(root);
    else {
      const message = document.createElement('p');
      message.className = 'error';
      message.setAttribute('role', 'alert');
      message.textContent = `GoReview could not start: ${error instanceof Error ? error.message : String(error)}`;
      root.replaceChildren(message);
    }
  }
}

if (typeof document !== 'undefined' && document.getElementById('app') && !(globalThis as { __GOREVIEW_NO_AUTOSTART?: boolean }).__GOREVIEW_NO_AUTOSTART) {
  void main();
}
