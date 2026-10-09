import { getChrome } from '../platform';
import { createBackground } from './core';

const chromeApi = getChrome();
if (chromeApi) {
  const bg = createBackground(chromeApi);
  bg.register();
  // a sign of the connection coming and going; the sync client backs off while offline and tries again when it returns
  const g = globalThis as { addEventListener?: (type: string, cb: () => void) => void; navigator?: { onLine?: boolean } };
  if (g.navigator?.onLine === false) bg.sync.setOnline(false);
  g.addEventListener?.('online', () => bg.sync.setOnline(true));
  g.addEventListener?.('offline', () => bg.sync.setOnline(false));
}
