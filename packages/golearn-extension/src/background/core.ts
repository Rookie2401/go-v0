/**
 * Background service worker logic. It injects the content script only on a user gesture (the action popup's toggle,
 * the context-menu item, the Alt+Shift+G command), which is what activeTab grants access for; there are no host
 * permissions. A failed injection (a browser page, a store page, a revoked grant) becomes a one-line message in the
 * popup and on the toolbar badge, never an uncaught error.
 */
import { MSG, type ChromeApi, type LookupMessage, type LookupTrigger, type TabState } from '../platform';

export const CONTEXT_MENU_ID = 'golearn-lookup';
export const COMMAND_ID = 'lookup-selection';
export const CONTENT_FILE = 'content.js';
const stateKey = (tabId: number): string => `golearn:tab:${tabId}`;

export interface ActivateResult { ok: boolean; message?: string }

export function createBackground(chrome: ChromeApi) {
  const session = chrome.storage.session ?? chrome.storage.local;

  async function readState(tabId: number): Promise<TabState> {
    try {
      const v = (await session.get(stateKey(tabId)))[stateKey(tabId)] as TabState | undefined;
      return v ?? { enabled: false };
    } catch { return { enabled: false }; }
  }

  async function writeState(tabId: number, state: TabState): Promise<void> {
    try {
      if (!state.enabled && !state.error) await session.remove(stateKey(tabId));
      else await session.set({ [stateKey(tabId)]: state });
    } catch { /* state is a convenience */ }
  }

  async function badge(tabId: number, text: string, title: string): Promise<void> {
    try {
      await chrome.action?.setBadgeText({ tabId, text });
      await chrome.action?.setTitle({ tabId, title });
    } catch { /* the tab may be gone */ }
  }

  /** Inject the content script (idempotent: the script installs once per page) and wait until it is listening. */
  async function inject(tabId: number): Promise<ActivateResult> {
    try {
      if (!chrome.scripting) return { ok: false, message: 'GoLearn cannot run scripts in this browser.' };
      await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_FILE] });
      return { ok: true };
    } catch (e) {
      return { ok: false, message: explain(e) };
    }
  }

  async function send(tabId: number, message: unknown): Promise<unknown> {
    if (!chrome.tabs) throw new Error('tabs unavailable');
    return chrome.tabs.sendMessage(tabId, message);
  }

  /** Turn "GoLearn on" for this tab on or off. */
  async function setEnabled(tabId: number, enabled: boolean): Promise<TabState> {
    if (enabled) {
      const r = await inject(tabId);
      if (!r.ok) {
        const state: TabState = { enabled: false, error: r.message };
        await writeState(tabId, state);
        await badge(tabId, '!', `GoLearn: ${r.message}`);
        return state;
      }
      try { await send(tabId, { type: MSG.enable }); } catch { const s: TabState = { enabled: false, error: 'GoLearn could not start on this page.' }; await writeState(tabId, s); await badge(tabId, '!', s.error!); return s; }
      const state: TabState = { enabled: true };
      await writeState(tabId, state);
      await badge(tabId, 'on', 'GoLearn is on for this tab');
      return state;
    }
    try { await send(tabId, { type: MSG.disable }); } catch { /* script not present: nothing to turn off */ }
    const state: TabState = { enabled: false };
    await writeState(tabId, state);
    await badge(tabId, '', 'GoLearn is off for this tab');
    return state;
  }

  /** A one-off lookup of the current selection (command or context menu): injects if needed, then asks the page to look up. */
  async function lookupNow(tabId: number, trigger: LookupTrigger, selectionText?: string): Promise<ActivateResult> {
    const r = await inject(tabId);
    if (!r.ok) {
      await writeState(tabId, { enabled: (await readState(tabId)).enabled, error: r.message });
      await badge(tabId, '!', `GoLearn: ${r.message}`);
      return r;
    }
    try {
      const msg: LookupMessage = { type: MSG.lookup, trigger, selectionText, focus: trigger === 'command' };
      await send(tabId, msg);
      return { ok: true };
    } catch {
      const message = 'GoLearn could not reach this page.';
      await badge(tabId, '!', `GoLearn: ${message}`);
      return { ok: false, message };
    }
  }

  function register(): void {
    chrome.runtime.onInstalled?.addListener(() => {
      try {
        const create = () => chrome.contextMenus?.create({ id: CONTEXT_MENU_ID, title: 'Look up with GoLearn', contexts: ['selection'] });
        if (chrome.contextMenus?.removeAll) void chrome.contextMenus.removeAll().then(create, create); else create();
      } catch { /* the menu is optional */ }
    });
    chrome.contextMenus?.onClicked.addListener((info, tab) => {
      if (info.menuItemId === CONTEXT_MENU_ID && tab?.id !== undefined) void lookupNow(tab.id, 'menu', info.selectionText);
    });
    chrome.commands?.onCommand.addListener((command, tab) => {
      if (command !== COMMAND_ID) return;
      if (tab?.id !== undefined) { void lookupNow(tab.id, 'command'); return; }
      void chrome.tabs?.query({ active: true, currentWindow: true }).then((tabs) => { if (tabs[0]?.id !== undefined) void lookupNow(tabs[0].id, 'command'); });
    });
    chrome.tabs?.onRemoved?.addListener((tabId) => { void session.remove(stateKey(tabId)).catch(() => {}); });
    // a navigation drops the activeTab grant and the content script: the per-tab switch must not claim to be on
    chrome.tabs?.onUpdated?.addListener((tabId, change) => { if (change.status === 'loading') void writeState(tabId, { enabled: false }); });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const m = message as { type?: string; tabId?: number; enabled?: boolean } | undefined;
      if (m?.type === MSG.getState && typeof m.tabId === 'number') {
        void readState(m.tabId).then(sendResponse);
        return true;
      }
      if (m?.type === MSG.setEnabled && typeof m.tabId === 'number') {
        void setEnabled(m.tabId, !!m.enabled).then(sendResponse, () => sendResponse({ enabled: false, error: 'GoLearn could not change this tab.' } satisfies TabState));
        return true;
      }
      return;
    });
  }

  return { register, setEnabled, lookupNow, readState, inject };
}

/** A short, plain reason for a failed injection. The browser's wording is not shown raw. */
export function explain(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/cannot access|permission|not allowed|extensions gallery|chrome:\/\//i.test(text)) return 'GoLearn is not allowed to read this page.';
  if (/no tab with id|tab was closed/i.test(text)) return 'That tab is gone.';
  return 'GoLearn could not start on this page.';
}
