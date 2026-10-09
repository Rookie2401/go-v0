/**
 * The slice of the WebExtension API this extension uses, typed locally so the package needs no @types/chrome and tests
 * can pass a small fake. All MV3 methods used here return promises.
 */
export interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface ChromeEvent<F extends (...args: never[]) => unknown> {
  addListener(cb: F): void;
  removeListener(cb: F): void;
}

export type MessageListener = (message: unknown, sender: { tab?: { id?: number }; frameId?: number }, sendResponse: (response?: unknown) => void) => boolean | void;

export interface TabInfo { id?: number; url?: string; title?: string }

export interface ScriptInjection {
  target: { tabId: number; frameIds?: number[]; allFrames?: boolean };
  files?: string[];
}

export interface ChromeApi {
  storage: { local: StorageArea; session?: StorageArea };
  runtime: {
    lastError?: unknown;
    onMessage: ChromeEvent<MessageListener>;
    onInstalled?: ChromeEvent<() => void>;
    sendMessage(message: unknown): Promise<unknown>;
    getManifest?(): { version?: string };
  };
  tabs?: {
    query(q: { active?: boolean; currentWindow?: boolean }): Promise<TabInfo[]>;
    sendMessage(tabId: number, message: unknown, options?: { frameId?: number }): Promise<unknown>;
    onRemoved?: ChromeEvent<(tabId: number) => void>;
    onUpdated?: ChromeEvent<(tabId: number, changeInfo: { status?: string }) => void>;
  };
  scripting?: { executeScript(injection: ScriptInjection): Promise<unknown[]> };
  contextMenus?: {
    create(props: { id: string; title: string; contexts: string[] }): void | Promise<void>;
    removeAll?(): Promise<void>;
    onClicked: ChromeEvent<(info: { menuItemId: string | number; selectionText?: string; frameId?: number }, tab?: TabInfo) => void>;
  };
  commands?: { onCommand: ChromeEvent<(command: string, tab?: TabInfo) => void> };
  action?: {
    setBadgeText(d: { tabId?: number; text: string }): Promise<void>;
    setTitle(d: { tabId?: number; title: string }): Promise<void>;
    setBadgeBackgroundColor?(d: { tabId?: number; color: string }): Promise<void>;
  };
}

/**
 * The extension API, only when it is really there. An ordinary Chrome page also has a `window.chrome` object (with
 * `csi`, `loadTimes`, …) but no `storage` or `runtime.onMessage`; treating that as the extension API threw on the
 * first real-browser run (2026-10-08) and the content script never installed.
 */
export function getChrome(): ChromeApi | undefined {
  const c = (globalThis as { chrome?: Partial<ChromeApi> }).chrome;
  return c && c.storage?.local && c.runtime?.onMessage ? (c as ChromeApi) : undefined;
}

/** Messages between the action popup, the background worker and the content script. */
export const MSG = {
  setEnabled: 'golearn:set-enabled',
  getState: 'golearn:get-state',
  enable: 'golearn:enable',
  disable: 'golearn:disable',
  lookup: 'golearn:lookup',
  ping: 'golearn:ping',
} as const;

export type LookupTrigger = 'selection' | 'command' | 'menu';

export interface LookupMessage { type: typeof MSG.lookup; trigger: LookupTrigger; selectionText?: string; focus?: boolean }
export interface TabState { enabled: boolean; error?: string }
