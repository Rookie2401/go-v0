/**
 * Entry point: builds the real environment for `createApp` (the origin's localStorage, fetch, GoListen, GoReview's builders)
 * and starts the application. Tests build their own `Deps` and call `createApp` directly.
 */
import { evidenceFor, ratingFor, registry } from '../goreview/src';
import { createRepositoryApi } from '../repository-service/src/api';
import { createMemoryArea } from '../repository-sync/src';
import { createApp } from './app';
import { createAudioDeps } from './audio';
import { getExtension, localRepoFor } from './localBinding';
import { loadConfig } from './config';
import { createReviewEngine } from './engine';
import { packFactsFor } from './packFacts';
import type { Deps } from './ports';
import { createWebKeyValueArea } from './state';
import { createMobileRuntime } from './mobile';
import { APP_VERSION } from './version';

function storageArea(mobile: ReturnType<typeof createMobileRuntime>): Deps['area'] {
  if (mobile.native) {
    if (mobile.area) return mobile.area;
    throw new NativeStorageUnavailableError();
  }
  try {
    const s = window.localStorage;
    s.getItem('gopractice:probe');
    return createWebKeyValueArea(s);
  } catch {
    // storage blocked (a private window): the app works for this visit, and nothing is kept afterwards
    return createMemoryArea();
  }
}

const uuid = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.floor(Math.random() * 36 ** 8).toString(36)}`);

class NativeStorageUnavailableError extends Error {}

/** Bound waits for repository requests on a phone with a stale tunnel or no route. Asset fetches keep using `doFetch`. */
export function withApiRequestTimeout(fetcher: typeof fetch, timeoutMs = 8_000): typeof fetch {
  return (input, init = {}) => {
    const controller = new AbortController();
    const upstream = init.signal;
    const abort = (): void => controller.abort(upstream?.reason);
    if (upstream?.aborted) abort();
    else upstream?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Repository request timed out', 'TimeoutError')), timeoutMs);
    return fetcher(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timer);
      upstream?.removeEventListener('abort', abort);
    });
  };
}

export async function createRealDeps(): Promise<Deps> {
  const mobile = createMobileRuntime(window);
  if (mobile.native && !(await mobile.probe?.())) throw new NativeStorageUnavailableError();
  const doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
  const apiFetch = withApiRequestTimeout(doFetch);
  const config = await loadConfig(doFetch);
  const engine = createReviewEngine({
    builders: registry, evidenceFor, ratingFor,
    factsFor: packFactsFor({ fetch: doFetch, baseUrl: config.assetBaseUrl ?? './' }),
  });
  // Inside the GoLearn extension (this page is served from chrome-extension://…/practice/) GoPractice works on the device with no account: the
  // on-device Repository is reached through the extension's worker. Anywhere else (the hosted copy) there is none, and an account is needed.
  const ext = getExtension();
  return {
    win: window, doc: document, fetch: doFetch, area: storageArea(mobile), config, mobile,
    ...(ext ? { local: async () => localRepoFor(ext) } : {}),
    links: {
      ...(ext ? { setup: '../app/index.html#/languages', biblia: '../biblia/index.html' } : config.extensionUrl ? { extension: config.extensionUrl } : {}),
      ...(config.bibliaUrl ? { biblia: config.bibliaUrl } : {}),
    },
    createApi: (baseUrl, token) => createRepositoryApi({ baseUrl, fetch: apiFetch, token }),
    engine,
    audio: (consent) => createAudioDeps({ consent,
      ...(ext ? { extensionRuntime: ext.runtime, extensionUrl: `${location.protocol}//${location.host}${location.pathname}` } : config.speechProxyBase ? { speechProxyBase: config.speechProxyBase } : {}),
    }),
    ...(document.querySelector('meta[name="goreview-edition"][content="review"]') ? { edition: 'review' as const } : {}),
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

async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  try {
    createApp(root, await createRealDeps());
  } catch (error) {
    if (error instanceof NativeStorageUnavailableError) showNativeStorageError(root);
    else {
      const message = document.createElement('p');
      message.className = 'error';
      message.setAttribute('role', 'alert');
      message.textContent = `GoReview could not start: ${error instanceof Error ? error.message : String(error)}`;
      root.replaceChildren(message);
    }
  }
}

if (typeof document !== 'undefined' && document.getElementById('app') && !(globalThis as { __GOPRACTICE_NO_AUTOSTART?: boolean }).__GOPRACTICE_NO_AUTOSTART) {
  void main();
}
