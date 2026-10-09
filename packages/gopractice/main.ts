/**
 * Entry point: builds the real environment for `createApp` (the origin's localStorage, fetch, GoListen, GoReview's builders)
 * and starts the application. Tests build their own `Deps` and call `createApp` directly.
 */
import { evidenceFor, ratingFor, registry } from '../goreview/src';
import { createRepositoryApi } from '../repository-service/src/api';
import { createMemoryArea } from '../repository-sync/src';
import { createApp } from './app';
import { createAudioDeps } from './audio';
import { loadConfig } from './config';
import { createReviewEngine } from './engine';
import { packFactsFor } from './packFacts';
import type { Deps } from './ports';
import { createWebKeyValueArea } from './state';
import { APP_VERSION } from './version';

function storageArea(): Deps['area'] {
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

export async function createRealDeps(): Promise<Deps> {
  const doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
  const config = await loadConfig(doFetch);
  const engine = createReviewEngine({
    builders: registry, evidenceFor, ratingFor,
    factsFor: packFactsFor({ fetch: doFetch, baseUrl: config.assetBaseUrl ?? './' }),
  });
  return {
    win: window, doc: document, fetch: doFetch, area: storageArea(), config,
    createApi: (baseUrl, token) => createRepositoryApi({ baseUrl, fetch: doFetch, token }),
    engine,
    audio: (consent) => createAudioDeps({ consent }),
    now: () => new Date(), newId: uuid, random: Math.random, appVersion: APP_VERSION, autoSync: true,
  };
}

async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  createApp(root, await createRealDeps());
}

if (typeof document !== 'undefined' && document.getElementById('app') && !(globalThis as { __GOPRACTICE_NO_AUTOSTART?: boolean }).__GOPRACTICE_NO_AUTOSTART) {
  void main();
}
