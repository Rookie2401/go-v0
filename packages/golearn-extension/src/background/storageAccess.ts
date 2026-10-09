/**
 * Keep the worker's storage out of reach of content scripts. By default `chrome.storage.local` is readable from content
 * scripts (`TRUSTED_AND_UNTRUSTED_CONTEXTS`), and the sign-in token lives there (`golearn:session`). The shipped content
 * bundle never touches storage, so this is defence in depth: a future bug in a content script (or a page that gets hold of
 * one) would still not be able to read the token. `setAccessLevel` exists from Chrome 102 (`session`) / 114 (`local`), so it
 * is feature-detected and a failure is ignored: an older browser keeps working without the protection.
 */
import type { ChromeApi } from '../platform';

type Restrictable = { setAccessLevel?: (opts: { accessLevel: 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }) => unknown };

/** Returns how many storage areas accepted the call (0 where the API is missing). */
export function restrictStorageToTrustedContexts(chrome: ChromeApi): number {
  let done = 0;
  for (const area of [chrome.storage.local, chrome.storage.session] as Array<Restrictable | undefined>) {
    if (!area || typeof area.setAccessLevel !== 'function') continue;
    try {
      const pending = area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      void Promise.resolve(pending).catch(() => { /* not supported in this browser version */ });
      done++;
    } catch { /* not supported in this browser version */ }
  }
  return done;
}
