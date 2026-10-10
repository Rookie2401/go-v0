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

/** What the browser tells a message listener about the sender. `id` is the sending extension; `url` the sending document. */
export interface MessageSender { id?: string; url?: string; tab?: { id?: number }; frameId?: number }

export type MessageListener = (message: unknown, sender: MessageSender, sendResponse: (response?: unknown) => void) => boolean | void;

export interface TabInfo { id?: number; url?: string; title?: string }

export interface ScriptInjection {
  target: { tabId: number; frameIds?: number[]; allFrames?: boolean };
  files?: string[];
}

export interface AlarmInfo { name: string; scheduledTime?: number; periodInMinutes?: number }

export interface PermissionsDescriptor { origins?: string[]; permissions?: string[] }

/** A dynamically registered content script (chrome.scripting.registerContentScripts). */
export interface RegisteredScript {
  id: string;
  js: string[];
  matches: string[];
  excludeMatches?: string[];
  runAt?: 'document_start' | 'document_end' | 'document_idle';
  allFrames?: boolean;
  persistAcrossSessions?: boolean;
}

export interface ChromeApi {
  storage: { local: StorageArea; session?: StorageArea };
  runtime: {
    id?: string;
    lastError?: unknown;
    onMessage: ChromeEvent<MessageListener>;
    onInstalled?: ChromeEvent<() => void>;
    onStartup?: ChromeEvent<() => void>;
    sendMessage(message: unknown): Promise<unknown>;
    getManifest?(): { version?: string };
    /** The address of a file the extension packages (its `app/` folder, `app/config.json`). */
    getURL?(path: string): string;
    openOptionsPage?(): Promise<void>;
  };
  tabs?: {
    query(q: { active?: boolean; currentWindow?: boolean }): Promise<TabInfo[]>;
    sendMessage(tabId: number, message: unknown, options?: { frameId?: number }): Promise<unknown>;
    onRemoved?: ChromeEvent<(tabId: number) => void>;
    onUpdated?: ChromeEvent<(tabId: number, changeInfo: { status?: string }) => void>;
  };
  scripting?: {
    executeScript(injection: ScriptInjection): Promise<unknown[]>;
    /** Dynamic content scripts (GoLearn Active): present in MV3 engines; absent in the fake unless a test adds them. */
    registerContentScripts?(scripts: RegisteredScript[]): Promise<void>;
    unregisterContentScripts?(filter?: { ids?: string[] }): Promise<void>;
    getRegisteredContentScripts?(filter?: { ids?: string[] }): Promise<RegisteredScript[]>;
  };
  /** Optional host permissions (GoLearn Active asks for them from the popup, inside the learner's click). */
  permissions?: {
    request(p: PermissionsDescriptor): Promise<boolean>;
    remove(p: PermissionsDescriptor): Promise<boolean>;
    contains(p: PermissionsDescriptor): Promise<boolean>;
    onRemoved?: ChromeEvent<(p: PermissionsDescriptor) => void>;
  };
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
  /** Only used by the background worker, and only if the manifest declares the "alarms" permission. */
  alarms?: {
    create(name: string, info: { periodInMinutes?: number; delayInMinutes?: number }): void | Promise<void>;
    get?(name: string): Promise<AlarmInfo | undefined>;
    clear?(name: string): Promise<boolean>;
    onAlarm: ChromeEvent<(alarm: AlarmInfo) => void>;
  };
}

/** The slice a content script gets: messaging only. A content script holds no storage, no token and no network. */
export interface ContentChromeApi {
  runtime: {
    id?: string;
    onMessage: ChromeEvent<MessageListener>;
    sendMessage(message: unknown): Promise<unknown>;
    getManifest?(): { version?: string };
    /** The address of a file the extension packages (a web accessible resource such as an analyser chunk). */
    getURL?(path: string): string;
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

/** The messaging API for a content script, only when it is really there (same page-chrome rule as `getChrome`). */
export function getContentChrome(): ContentChromeApi | undefined {
  const c = (globalThis as { chrome?: Partial<ChromeApi> }).chrome;
  return c && c.runtime?.onMessage && typeof c.runtime.sendMessage === 'function' ? ({ runtime: c.runtime } as ContentChromeApi) : undefined;
}

/** Messages between the action popup / setup page, the background worker and the content script. */
export const MSG = {
  // popup <-> background (the per-tab switch)
  setEnabled: 'golearn:set-enabled',
  getState: 'golearn:get-state',
  // background -> content
  enable: 'golearn:enable',
  disable: 'golearn:disable',
  lookup: 'golearn:lookup',
  ping: 'golearn:ping',
  // content -> background (also answered for extension pages where noted in background/router.ts)
  record: 'golearn:record',
  profile: 'golearn:profile',
  gloss: 'golearn:gloss',
  explain: 'golearn:explain',
  pronounceInfo: 'golearn:pronounce-info',
  /** The dictionary's full record of a lemma (Level 2: paradigm table, etymology, IPA, audio, relations). */
  entry: 'golearn:entry',
  correct: 'golearn:correct',
  metrics: 'golearn:metrics',
  status: 'golearn:status',
  settings: 'golearn:settings',
  // extension pages only (popup, setup page): the connection and its upkeep
  serviceConfig: 'golearn:service-config',
  connect: 'golearn:connect',
  createAccount: 'golearn:create-account',
  disconnect: 'golearn:disconnect',
  syncNow: 'golearn:sync-now',
  enrol: 'golearn:enrol',
  refreshSession: 'golearn:session-refresh',
  selectEnrolment: 'golearn:select-enrolment',
  clearLocal: 'golearn:clear-local',
  /** The device-local Repository (no account needed): see `LocalRepoRequest` in protocol.ts. Extension pages only. */
  localRepo: 'golearn:local-repo',
  /** GoLearn Active (read the page before the learner): the popup sets it, a content script may read it. See `ActiveRequest` in protocol.ts. */
  active: 'golearn:active',
  /** GoLearn Active's scan asks about the words on screen: answered from the device's own Repository only, and only while Active is on. */
  activeProfile: 'golearn:active-profile',
  /** Explicit on-demand request for the local sentence translation service. */
  translateSentence: 'golearn:translate-sentence',
  // background -> content (GoLearn Active)
  activate: 'golearn:activate',
  deactivate: 'golearn:deactivate',
} as const;

export type MessageType = (typeof MSG)[keyof typeof MSG];

/** `click` = GoLearn Active's single click on a word (no selection made by the learner). */
export type LookupTrigger = 'selection' | 'command' | 'menu' | 'click';

export interface LookupMessage { type: typeof MSG.lookup; trigger: LookupTrigger; selectionText?: string; focus?: boolean }
export interface TabState { enabled: boolean; error?: string }
