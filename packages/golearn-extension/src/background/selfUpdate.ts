/**
 * Self-update for an UNPACKED extension (2026-11-10). The owner loads GoLearn from packages/golearn-extension/dist; a rebuilt folder changes nothing
 * until someone presses Reload at the browser's extensions page, and the browser was repeatedly found days behind the code. The build stamps itself
 * (vite.config.ts: `__GOLEARN_BUILD_ID__`, `__GOLEARN_BUILT_AT__` compiled into background.js, and dist/build.json written by the same build), so the
 * worker can compare the code it runs with the file next to it, and reload itself when the folder holds a newer build.
 *
 * A store-installed extension has a build.json that always equals its code (or none): the same code is inert there. A build.json that is missing,
 * unreadable or malformed does nothing. It is only ever asked from the worker (start, the one-minute alarm, the popup's status request), never from a
 * content script.
 *
 * Two sightings: the first check that finds a newer build.json only records it (`seen`, kept in storage: the worker may stop between checks); a later
 * check at least SETTLE_MS after that which reads the same id again may reload (a mirror can write build.json while the rest of the folder is still
 * being copied). A different id restarts the wait.
 *
 * A reload happens only when it is SAFE: the device Repository is not opening or migrating, no `record` message is being handled, and the last reload
 * this way was more than 120 s ago. It can never loop: the id reloaded to is kept; if the worker starts again still running another id, it does not
 * reload again for that same build.json id and records `stuck` instead.
 */
import type { ChromeApi } from '../platform';

declare const __GOLEARN_BUILD_ID__: string | undefined;
declare const __GOLEARN_BUILT_AT__: string | undefined;

export interface BuildInfo { id: string; builtAt: string }

export const SELF_UPDATE_KEY = 'golearn:self-update';
/** No second self-reload within this long of the last one. */
export const SELF_UPDATE_GAP_MS = 120_000;
/** A newer build.json must be seen again, unchanged, at least this long after it was first seen, before the worker reloads (a mirror may still be copying the rest of the folder). */
export const SETTLE_MS = 60_000;
/** The popup says "Updated to build …" for this long after a reload. */
export const UPDATED_NOTE_MS = 10 * 60_000;

/** What the build compiled in; undefined when running from source (unit tests without the define, a dev server). */
export function compiledBuild(): BuildInfo | undefined {
  const id = typeof __GOLEARN_BUILD_ID__ !== 'undefined' ? __GOLEARN_BUILD_ID__ : undefined;
  if (!id) return undefined;
  return { id, builtAt: typeof __GOLEARN_BUILT_AT__ !== 'undefined' && __GOLEARN_BUILT_AT__ ? __GOLEARN_BUILT_AT__ : '' };
}

/** What is kept in chrome.storage.local under SELF_UPDATE_KEY. */
export interface SelfUpdateRecord {
  /** When the last self-reload was asked for (ms since the epoch). */
  reloadedAt?: number;
  /** The build.json id it reloaded to, and the id that was running before. */
  toId?: string;
  fromId?: string;
  /** The folder's build.json said `toId` again although the worker still runs another id: the reload did not take; nothing reloads again for that id. */
  stuck?: boolean;
  /** The newer build.json first seen, and when. */
  seen?: { id: string; builtAt: string; at: number };
}

export interface UpdatedNote { updatedAt: string; updatedFrom: string }

export type CheckOutcome = 'seen' | 'settling' | 'inert' | 'same' | 'older' | 'unreadable' | 'busy' | 'too-soon' | 'stuck' | 'reloading';

export interface SelfUpdateOptions {
  chrome: ChromeApi;
  fetch: typeof fetch;
  now: () => number;
  /** The code that is running (default: what the build compiled in). Without one the service never checks. */
  build?: BuildInfo | undefined;
  /** True while the device Repository is opening or migrating, or a record message is being handled. */
  busy: () => boolean;
}

export function createSelfUpdate(opts: SelfUpdateOptions) {
  const build = opts.build ?? compiledBuild();
  const area = opts.chrome.storage.local;
  let running: Promise<CheckOutcome> | undefined;

  async function readRecord(): Promise<SelfUpdateRecord> {
    try {
      const v = (await area.get(SELF_UPDATE_KEY))[SELF_UPDATE_KEY];
      return v && typeof v === 'object' ? (v as SelfUpdateRecord) : {};
    } catch { return {}; }
  }

  async function readFolder(): Promise<BuildInfo | undefined> {
    try {
      const url = opts.chrome.runtime.getURL?.('build.json');
      if (!url) return undefined;
      const res = await opts.fetch(url, { cache: 'no-store' });
      if (!res.ok) return undefined;
      const j = JSON.parse(await res.text()) as { id?: unknown; builtAt?: unknown };
      if (!j || typeof j.id !== 'string' || !j.id.trim()) return undefined;
      return { id: j.id.trim(), builtAt: typeof j.builtAt === 'string' ? j.builtAt : '' };
    } catch { return undefined; }
  }

  async function run(): Promise<CheckOutcome> {
    if (!build) return 'inert';
    const folder = await readFolder();
    if (!folder) return 'unreadable';
    if (folder.id === build.id) return 'same';
    // a folder whose stamp is older than the code running is not "newer"
    const theirs = Date.parse(folder.builtAt);
    const mine = Date.parse(build.builtAt);
    if (Number.isFinite(theirs) && Number.isFinite(mine) && theirs < mine) return 'older';
    const rec = await readRecord();
    // we asked for this very build before and are still not running it: the reload did not take. Never again for this id.
    if (rec.toId === folder.id && rec.reloadedAt !== undefined) {
      if (!rec.stuck) { try { await area.set({ [SELF_UPDATE_KEY]: { ...rec, stuck: true } satisfies SelfUpdateRecord }); } catch { /* a note */ } }
      return 'stuck';
    }
    // two sightings: the first only records the newer build.json; a reload needs a later check, SETTLE_MS on, that reads the same id again
    if (!rec.seen || rec.seen.id !== folder.id) {
      try { await area.set({ [SELF_UPDATE_KEY]: { ...rec, seen: { id: folder.id, builtAt: folder.builtAt, at: opts.now() } } satisfies SelfUpdateRecord }); } catch { /* a note */ }
      return 'seen';
    }
    if (opts.now() - rec.seen.at < SETTLE_MS) return 'settling';
    if (opts.busy()) return 'busy';
    if (rec.reloadedAt !== undefined && opts.now() - rec.reloadedAt <= SELF_UPDATE_GAP_MS) return 'too-soon';
    if (typeof opts.chrome.runtime.reload !== 'function') return 'inert';
    // the record is written BEFORE the reload: the next worker life reads it
    try { await area.set({ [SELF_UPDATE_KEY]: { reloadedAt: opts.now(), toId: folder.id, fromId: build.id } satisfies SelfUpdateRecord }); } catch { return 'unreadable'; }
    opts.chrome.runtime.reload();
    return 'reloading';
  }

  /** One check at a time; never throws. */
  function check(): Promise<CheckOutcome> {
    running ??= run().catch((): CheckOutcome => 'unreadable').finally(() => { running = undefined; });
    return running;
  }

  /** For the status: set for 10 minutes after the worker came up as the build it reloaded to. */
  async function note(): Promise<UpdatedNote | undefined> {
    if (!build) return undefined;
    const rec = await readRecord();
    if (rec.reloadedAt === undefined || rec.toId !== build.id || typeof rec.fromId !== 'string') return undefined;
    const age = opts.now() - rec.reloadedAt;
    if (age < 0 || age >= UPDATED_NOTE_MS) return undefined;
    return { updatedAt: new Date(rec.reloadedAt).toISOString(), updatedFrom: rec.fromId };
  }

  return { check, note, build };
}

export type SelfUpdateService = ReturnType<typeof createSelfUpdate>;
