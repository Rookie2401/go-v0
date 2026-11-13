/**
 * GoLearn Active, the privileged half: the two switches (golearn:active), the host permission check, and the dynamic
 * content script that reads a page on load. The popup asks the browser for the permission inside the learner's own
 * click (a worker cannot); this service only checks that it was granted, registers or unregisters the script, and
 * tells open pages to start or stop. It never grants itself anything.
 *
 * The browser can withdraw the access on its own: its extension menu set to "on click", an update or a reload of the
 * extension (Brave does this). Active then stops, records that the BROWSER switched it off and when (`offBy`, `offAt`),
 * the popup says so instead of showing a bare "off", and Active comes back by itself as soon as the browser gives the
 * access back (2026-10-31: the owner saw Active "deactivating itself" with nothing to say why). The learner's own
 * switch, on or off, clears the record. Every change goes through one queue, so the popup's switch and a browser event
 * arriving at the same moment cannot interleave a register with an unregister.
 *
 * The registration excludes every host of every refusing reader (src/active/exclude.ts, from the registry); the content
 * script's own scan checks the registry again before it reads anything.
 */
import { activeExcludeMatches } from '../active/exclude';
import { MSG, type ChromeApi, type StorageArea } from '../platform';
import { ACTIVE_ORIGINS, DEFAULT_ACTIVE, type ActivateMessage, type ActiveReply, type ActiveSettings } from '../protocol';

export const ACTIVE_KEY = 'golearn:active';
export const ACTIVE_SCRIPT_ID = 'golearn-active';
/** How long a language switch waits for the open pages to scan again before it answers (the pages carry on by themselves). */
export const RESTART_WAIT_MS = 1500;

export interface ActiveServiceOptions {
  chrome: ChromeApi;
  area: StorageArea;
  /** The content script file the registration names (core.ts CONTENT_FILE). */
  contentFile: string;
  /** Epoch ms; the time stamped on a browser switch-off. */
  now?: () => number;
}

export function sanitizeActive(raw: unknown): ActiveSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: ActiveSettings = { active: r.active === true, speakOnClick: r.speakOnClick !== false };
  if (!out.active && r.offBy === 'browser') {
    out.offBy = 'browser';
    if (typeof r.offAt === 'string' && Number.isFinite(Date.parse(r.offAt))) out.offAt = r.offAt;
  }
  return out;
}

export function createActiveService(o: ActiveServiceOptions) {
  const { chrome, area } = o;
  const origins = [...ACTIVE_ORIGINS];
  const now = o.now ?? Date.now;

  /** One change at a time: the popup's switch, a browser event and the worker start can arrive together. */
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => { const run = chain.then(fn, fn); chain = run.catch(() => undefined); return run; };

  async function get(): Promise<ActiveSettings> {
    try { return sanitizeActive((await area.get(ACTIVE_KEY))[ACTIVE_KEY]); } catch { return { ...DEFAULT_ACTIVE }; }
  }

  async function store(s: ActiveSettings): Promise<boolean> {
    try { await area.set({ [ACTIVE_KEY]: sanitizeActive(s) }); return true; } catch { return false; }
  }

  /** The browser's answer, never assumed: no permissions API means nothing was granted. */
  async function granted(): Promise<boolean> {
    try { return (await chrome.permissions?.contains({ origins })) === true; } catch { return false; }
  }

  async function registered(): Promise<boolean> {
    try {
      const list = await chrome.scripting?.getRegisteredContentScripts?.({ ids: [ACTIVE_SCRIPT_ID] });
      return !!list && list.some((s) => s.id === ACTIVE_SCRIPT_ID);
    } catch { return false; }
  }

  const supported = (): boolean => typeof chrome.scripting?.registerContentScripts === 'function' && typeof chrome.scripting?.unregisterContentScripts === 'function';

  async function unregister(): Promise<void> {
    try { if (await registered()) await chrome.scripting!.unregisterContentScripts!({ ids: [ACTIVE_SCRIPT_ID] }); } catch { /* not registered */ }
  }

  async function register(): Promise<boolean> {
    if (!supported()) return false;
    await unregister();
    try {
      await chrome.scripting!.registerContentScripts!([{
        id: ACTIVE_SCRIPT_ID, js: [o.contentFile], matches: origins, excludeMatches: activeExcludeMatches(),
        runAt: 'document_idle', allFrames: true, persistAcrossSessions: true,
      }]);
      return true;
    } catch { return false; }
  }

  async function sendToTab(tabId: number, message: unknown): Promise<void> {
    try { await chrome.tabs?.sendMessage(tabId, message); } catch { /* no content script there: nothing to tell */ }
  }

  /** The page in front gets Active now (the script is injected if it is not there yet); every other page gets it on its next load. */
  async function activateFrontTab(speak: boolean): Promise<void> {
    let tabId: number | undefined;
    try { tabId = (await chrome.tabs?.query({ active: true, currentWindow: true }))?.[0]?.id; } catch { tabId = undefined; }
    if (tabId === undefined) return;
    try { await chrome.scripting?.executeScript({ target: { tabId, allFrames: true }, files: [o.contentFile] }); } catch { /* a page the browser does not let us into (its own pages, the store): nothing to read */ }
    const msg: ActivateMessage = { type: MSG.activate, speak };
    await sendToTab(tabId, msg);
  }

  async function broadcast(message: unknown): Promise<void> {
    let tabs: Array<{ id?: number }> = [];
    try { tabs = (await chrome.tabs?.query({})) ?? []; } catch { tabs = []; }
    await Promise.all(tabs.map((t) => (t.id === undefined ? Promise.resolve() : sendToTab(t.id, message))));
  }

  async function reply(settings: ActiveSettings, extra: Partial<ActiveReply> = {}): Promise<ActiveReply> {
    return { ok: true, settings, granted: await granted(), registered: await registered(), excluded: activeExcludeMatches().length, ...extra };
  }

  /** Turn on (the permission must be there already). Shared by the learner's switch and the browser giving the access back. */
  async function switchOn(cur: ActiveSettings, next: ActiveSettings): Promise<ActiveReply> {
    const off = (error: ActiveReply['error'], message: string) => ({ ok: false as const, error, message });
    // a failed attempt keeps a browser switch-off on record: the access is still the browser's to give back
    const keep: ActiveSettings = { ...next, active: false, ...(cur.offBy ? { offBy: cur.offBy, ...(cur.offAt ? { offAt: cur.offAt } : {}) } : {}) };
    if (!supported()) { await store(keep); return reply(sanitizeActive(keep), off('unsupported', 'This browser cannot register GoLearn on pages.')); }
    if (!(await granted())) { await store(keep); return reply(sanitizeActive(keep), off('permission', 'The browser has not allowed GoLearn to read pages, so Active stays off.')); }
    if (!(await register())) { await store(keep); return reply(sanitizeActive(keep), off('register-failed', 'GoLearn could not register itself for pages.')); }
    const on: ActiveSettings = { active: true, speakOnClick: next.speakOnClick };
    if (!(await store(on))) return reply(on, off('storage', 'The switch could not be saved.'));
    await activateFrontTab(on.speakOnClick);
    return reply(on);
  }

  /** The browser withdrew the access: stop everywhere and say that it was the browser, and when. */
  async function browserSwitchedOff(): Promise<void> {
    const s = await get();
    if (!s.active) return;
    await unregister();
    await store({ active: false, speakOnClick: s.speakOnClick, offBy: 'browser', offAt: new Date(now()).toISOString() });
    await broadcast({ type: MSG.deactivate });
  }

  /** The browser gave the access back after it had taken it: Active returns as the learner left it. */
  async function browserGaveBack(): Promise<void> {
    const s = await get();
    if (s.active || s.offBy !== 'browser' || !(await granted())) return;
    await switchOn(s, { ...s, active: true });
  }

  /** Change the switches (the learner, from an extension page). Turning Active on needs the permission to be there already (the popup asked for it). */
  function set(patch: Partial<ActiveSettings> | undefined): Promise<ActiveReply> {
    return serial(async () => {
      const cur = await get();
      const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
      const next: ActiveSettings = { active: cur.active, speakOnClick: cur.speakOnClick };
      if (typeof p.speakOnClick === 'boolean') next.speakOnClick = p.speakOnClick;
      if (typeof p.active === 'boolean') next.active = p.active;
      else if (cur.offBy) { next.offBy = cur.offBy; if (cur.offAt) next.offAt = cur.offAt; } // only the learner's own on/off clears the record

      if (next.active && !cur.active) return switchOn(cur, next);
      if (!next.active && cur.active) {
        await unregister();
        await store(next);
        await broadcast({ type: MSG.deactivate });
        return reply(next);
      }
      if (!(await store(next))) return reply(next, { ok: false, error: 'storage', message: 'The switch could not be saved.' });
      if (next.active && next.speakOnClick !== cur.speakOnClick) await broadcast({ type: MSG.activate, speak: next.speakOnClick } satisfies ActivateMessage);
      return reply(sanitizeActive(next));
    });
  }

  /**
   * At worker start: keep the registration and the switch in agreement with the permission. With the access gone while Active was on,
   * the browser switched it off (recorded as such); with the access back after the browser had switched it off, it comes back.
   */
  function restore(): Promise<void> {
    return serial(async () => {
      const s = await get();
      if (!s.active) { if (s.offBy === 'browser') await browserGaveBack(); return; }
      if (!(await granted())) { await browserSwitchedOff(); return; }
      if (!(await registered())) await register();
    });
  }

  function watchPermission(): void {
    chrome.permissions?.onRemoved?.addListener((p) => {
      if (!p.origins?.some((x) => origins.includes(x))) return;
      void serial(browserSwitchedOff);
    });
    chrome.permissions?.onAdded?.addListener((p) => {
      if (!p.origins?.some((x) => origins.includes(x))) return;
      void serial(browserGaveBack);
    });
  }

  /** The message handler: an extension page may get and set; a content script may only get (what it needs to start). */
  async function handle(m: Record<string, unknown>, kind: 'page' | 'content'): Promise<ActiveReply> {
    if (m.op === 'set') {
      if (kind !== 'page') return reply(await get(), { ok: false, error: 'forbidden' });
      return set(m.patch as Partial<ActiveSettings> | undefined);
    }
    return reply(await get());
  }

  /** After the reading language changed (the popup's switch, 2026-10-25): every page that is Active stops and starts again, so it resolves and scans in the new language. Nothing when Active is off. */
  async function restart(): Promise<void> {
    const s = await get();
    if (!s.active) return;
    await broadcast({ type: MSG.deactivate });
    // a page answers `activate` only once it has scanned again (its words, its language's analyser, the learner's rows): the switch waits a
    // moment for that, never longer (2026-11-09: the popup waited for every open tab, and stayed on "Switching to …" while one was slow)
    const started = broadcast({ type: MSG.activate, speak: s.speakOnClick } satisfies ActivateMessage);
    await Promise.race([started, new Promise<void>((resolve) => setTimeout(resolve, RESTART_WAIT_MS))]);
  }

  return { get, set, granted, registered, register, unregister, restore, watchPermission, handle, activateFrontTab, restart };
}

export type ActiveService = ReturnType<typeof createActiveService>;
