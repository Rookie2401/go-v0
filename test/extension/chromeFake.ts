/**
 * A tiny fake of the chrome.* surface the extension uses (packages/golearn-extension/src/platform.ts ChromeApi).
 * Events are plain emitters; storage areas are Map-backed; scripting.executeScript can be told to throw.
 */
import { createMemoryStorageArea } from '../../packages/golearn-extension/src/store';
import type { ChromeApi, ChromeEvent, MessageListener, ScriptInjection, StorageArea, TabInfo } from '../../packages/golearn-extension/src/platform';

export function emitter<F extends (...args: never[]) => unknown>() {
  const fns = new Set<F>();
  const ev: ChromeEvent<F> & { fire(...args: Parameters<F>): unknown[]; listeners: Set<F> } = {
    addListener: (cb) => { fns.add(cb); },
    removeListener: (cb) => { fns.delete(cb); },
    fire: (...args) => [...fns].map((f) => f(...args)),
    listeners: fns,
  };
  return ev;
}

export interface ChromeFake extends ChromeApi {
  local: ReturnType<typeof createMemoryStorageArea>;
  sessionArea: ReturnType<typeof createMemoryStorageArea>;
  injected: ScriptInjection[];
  messagesToTabs: Array<{ tabId: number; message: unknown }>;
  badges: Array<{ tabId?: number; text: string }>;
  titles: Array<{ tabId?: number; title: string }>;
  menus: Array<{ id: string; title: string; contexts: string[] }>;
  /** Make the next executeScript calls throw this error (until cleared with undefined). */
  failInjection(error: Error | undefined): void;
  /** Where a message sent to a tab goes (e.g. the content script's runtime.onMessage listeners). */
  tabListeners: Set<MessageListener>;
  events: {
    onMessage: ReturnType<typeof emitter<MessageListener>>;
    onInstalled: ReturnType<typeof emitter<() => void>>;
    onRemoved: ReturnType<typeof emitter<(tabId: number) => void>>;
    onUpdated: ReturnType<typeof emitter<(tabId: number, changeInfo: { status?: string }) => void>>;
    menuClicked: ReturnType<typeof emitter<(info: { menuItemId: string | number; selectionText?: string; frameId?: number }, tab?: TabInfo) => void>>;
    command: ReturnType<typeof emitter<(command: string, tab?: TabInfo) => void>>;
  };
  activeTabId: number;
}

export function createChromeFake(): ChromeFake {
  const local = createMemoryStorageArea();
  const sessionArea = createMemoryStorageArea();
  const onMessage = emitter<MessageListener>();
  const onInstalled = emitter<() => void>();
  const onRemoved = emitter<(tabId: number) => void>();
  const onUpdated = emitter<(tabId: number, changeInfo: { status?: string }) => void>();
  const menuClicked = emitter<(info: { menuItemId: string | number; selectionText?: string; frameId?: number }, tab?: TabInfo) => void>();
  const command = emitter<(command: string, tab?: TabInfo) => void>();
  let failure: Error | undefined;
  const fake: ChromeFake = {
    local, sessionArea,
    injected: [], messagesToTabs: [], badges: [], titles: [], menus: [],
    tabListeners: new Set(),
    activeTabId: 7,
    failInjection(e) { failure = e; },
    events: { onMessage, onInstalled, onRemoved, onUpdated, menuClicked, command },
    storage: { local: local as StorageArea, session: sessionArea as StorageArea },
    runtime: {
      onMessage,
      onInstalled,
      // a message from the popup goes to the background listeners, which answer through sendResponse
      sendMessage: (message) => new Promise((resolve) => {
        let answered = false;
        for (const f of onMessage.listeners) {
          const r = f(message, {}, (resp) => { answered = true; resolve(resp); });
          if (r === true) return;
        }
        if (!answered) resolve(undefined);
      }),
      getManifest: () => ({ version: '0.0.1' }),
    },
    tabs: {
      query: async () => [{ id: fake.activeTabId }],
      sendMessage: (tabId, message) => new Promise((resolve, reject) => {
        fake.messagesToTabs.push({ tabId, message });
        if (!fake.tabListeners.size) { reject(new Error('Could not establish connection. Receiving end does not exist.')); return; }
        for (const f of fake.tabListeners) {
          const r = f(message, { tab: { id: tabId } }, resolve);
          if (r !== true) { resolve(undefined); return; }
        }
      }),
      onRemoved,
      onUpdated,
    },
    scripting: {
      executeScript: async (injection) => {
        if (failure) throw failure;
        fake.injected.push(injection);
        return [{}];
      },
    },
    contextMenus: {
      create: (props) => { fake.menus.push(props); },
      removeAll: async () => { fake.menus.length = 0; },
      onClicked: menuClicked,
    },
    commands: { onCommand: command },
    action: {
      setBadgeText: async (d) => { fake.badges.push(d); },
      setTitle: async (d) => { fake.titles.push(d); },
    },
  };
  return fake;
}
