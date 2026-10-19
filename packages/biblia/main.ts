/** Entry point: the real environment (fetch, the document, the extension's Repository when this page is an extension page) for `createBibliaApp`. */
import { createBibliaApp } from './src/app';
import { fetchJsonWith } from './src/data';
import { makeRecorder } from './src/repo';

const started = createBibliaApp({
  win: window, doc: document,
  source: fetchJsonWith((input, init) => globalThis.fetch(input, init), './'),
  recorder: makeRecorder(),
  storage: (() => { try { const s = window.localStorage; s.getItem('biblia:probe'); return s; } catch { return undefined; } })(),
  now: () => new Date(),
});
started.catch((e) => {
  const el = document.getElementById('app');
  if (el) el.textContent = `Biblia could not start: ${e instanceof Error ? e.message : String(e)}`;
});
// development only: a handle for inspecting the running app (the card's closed shadow root) from the browser console; never in a build
if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) void started.then((app) => { (window as unknown as { __biblia?: unknown }).__biblia = app; });
