/**
 * GoLearn Active, the privileged half: the two switches (golearn:active), the host permission check, and the dynamic
 * content script that reads a page on load. The popup asks the browser for the permission inside the learner's own
 * click (a worker cannot); this service only checks that it was granted, registers or unregisters the script, and
 * tells open pages to start or stop. It never grants itself anything: with the permission gone (the learner revoked it
 * in the popup or in the browser's settings), Active turns itself off and says so.
 *
 * The registration excludes every host of every refusing reader (src/active/exclude.ts, from the registry); the content
 * script's own scan checks the registry again before it reads anything.
 */
import { activeExcludeMatches } from '../active/exclude';
import { MSG, type ChromeApi, type StorageArea } from '../platform';
import { ACTIVE_ORIGINS, DEFAULT_ACTIVE, type ActivateMessage, type ActiveReply, type ActiveSettings } from '../protocol';

export const ACTIVE_KEY = 'golearn:active';
export const ACTIVE_SCRIPT_ID = 'golearn-active';

export interface ActiveServiceOptions {
  chrome: ChromeApi;
  area: StorageArea;
  /** The content script file the registration names (core.ts CONTENT_FILE). */
  contentFile: string;
}

export function sanitizeActive(raw: unknown): ActiveSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { active: r.active === true, speakOnClick: r.speakOnClick !== false };
}

export function createActiveService(o: ActiveServiceOptions) {
  const { chrome, area } = o;
  const origins = [...ACTIVE_ORIGINS];

  async function get(): Promise<ActiveSettings> {
    try { return sanitizeActive((await area.get(ACTIVE_KEY))[ACTIVE_KEY]); } catch { return { ...DEFAULT_ACTIVE }; }
  }

  async function store(s: ActiveSettings): Promise<boolean> {
    try { await area.set({ [ACTIVE_KEY]: s }); return true; } catch { return false; }
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

  /** Change the switches. Turning Active on needs the permission to be there already (the popup asked for it). */
  async function set(patch: Partial<ActiveSettings> | undefined): Promise<ActiveReply> {
    const cur = await get();
    const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
    const next: ActiveSettings = { ...cur };
    if (typeof p.speakOnClick === 'boolean') next.speakOnClick = p.speakOnClick;
    if (typeof p.active === 'boolean') next.active = p.active;

    if (next.active && !cur.active) {
      if (!supported()) { next.active = false; await store(next); return reply(next, { ok: false, error: 'unsupported', message: 'This browser cannot register GoLearn on pages.' }); }
      if (!(await granted())) { next.active = false; await store(next); return reply(next, { ok: false, error: 'permission', message: 'The browser has not allowed GoLearn to read pages, so Active stays off.' }); }
      if (!(await register())) { next.active = false; await store(next); return reply(next, { ok: false, error: 'register-failed', message: 'GoLearn could not register itself for pages.' }); }
      if (!(await store(next))) return reply(next, { ok: false, error: 'storage', message: 'The switch could not be saved.' });
      await activateFrontTab(next.speakOnClick);
      return reply(next);
    }
    if (!next.active && cur.active) {
      await unregister();
      await store(next);
      await broadcast({ type: MSG.deactivate });
      return reply(next);
    }
    if (!(await store(next))) return reply(next, { ok: false, error: 'storage', message: 'The switch could not be saved.' });
    if (next.active && next.speakOnClick !== cur.speakOnClick) await broadcast({ type: MSG.activate, speak: next.speakOnClick } satisfies ActivateMessage);
    return reply(next);
  }

  /** At worker start: keep the registration and the switch in agreement with the permission (which the learner may have revoked). */
  async function restore(): Promise<void> {
    const s = await get();
    if (!s.active) return;
    if (!(await granted())) { await unregister(); await store({ ...s, active: false }); return; }
    if (!(await registered())) await register();
  }

  function watchPermission(): void {
    chrome.permissions?.onRemoved?.addListener((p) => {
      if (!p.origins?.some((x) => origins.includes(x))) return;
      void get().then((s) => (s.active ? set({ active: false }) : undefined));
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
    await broadcast({ type: MSG.activate, speak: s.speakOnClick } satisfies ActivateMessage);
  }

  return { get, set, granted, registered, register, unregister, restore, watchPermission, handle, activateFrontTab, restart };
}

export type ActiveService = ReturnType<typeof createActiveService>;
