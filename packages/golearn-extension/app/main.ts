/**
 * Entry point. Builds the real environment for `createApp`: in the extension (chrome.storage.local, messages to the
 * background worker) or as a hosted web app (the origin’s own localStorage, no extension API). The two differ only in
 * `deps`; every screen is the same code.
 */
import { createRepositoryApi } from '../../repository-service/src/api';
import { getChrome, type StorageArea } from '../src/platform';
import { createMemoryStorageArea } from '../src/store';
import { createApp } from './app';
import { createPackBindings } from './bindings';
import { loadConfig } from './config';
import { openLocalRepo } from './localBinding';
import type { Deps } from './ports';
import { createWebStorageArea } from './state';
import { APP_VERSION } from './version';

function webArea(): StorageArea {
  try {
    const s = window.localStorage;
    s.getItem('golearn:probe');
    return createWebStorageArea(s);
  } catch {
    // storage blocked (a private window): the app still works for this visit, and says nothing is kept
    return createMemoryStorageArea();
  }
}

export async function createRealDeps(): Promise<Deps> {
  const doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
  const chrome = getChrome();
  return {
    win: window, doc: document, chrome, fetch: doFetch,
    area: chrome ? chrome.storage.local : webArea(),
    packs: createPackBindings(),
    openLocal: openLocalRepo,
    config: await loadConfig(doFetch),
    createApi: (baseUrl, token) => createRepositoryApi({ baseUrl, fetch: doFetch, token }),
    download(filename, blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    now: () => new Date(),
    closeWindow() { try { window.close(); } catch { /* the browser refuses */ } return window.closed === true; },
    async copyText(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } },
    appVersion: APP_VERSION,
  };
}

async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  createApp(root, await createRealDeps());
}

if (typeof document !== 'undefined' && document.getElementById('app') && !(globalThis as { __GOLEARN_APP_NO_AUTOSTART?: boolean }).__GOLEARN_APP_NO_AUTOSTART) {
  void main();
}
