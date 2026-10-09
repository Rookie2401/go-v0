/**
 * Background service worker logic: the PRIVILEGED side of the extension.
 *
 *  - Injection. The content script is injected only on a user gesture (the action popup's toggle, the context-menu item,
 *    the Alt+Shift+G command), which is what activeTab grants access for; there are no host permissions. A failed
 *    injection becomes a one-line message in the popup and on the badge, never an uncaught error.
 *  - The Repository connection (session, sync, profile cache, dictionary) lives here and nowhere else.
 *  - Messages. Every message is checked: it must come from THIS extension (`sender.id === chrome.runtime.id`), and which
 *    messages a sender may send depends on where it runs: an extension page (popup, setup page; recognised by the URL
 *    of the sending document) may do everything; a content script may only record, read the profile, ask for a gloss,
 *    an explanation, voice availability, send a correction or its metrics, and read the redacted status.
 */
import { MSG, type ChromeApi, type LookupMessage, type LookupTrigger, type MessageSender, type TabState } from '../platform';
import {
  DEFAULT_SETTINGS, SETTINGS_UNAVAILABLE, cleanText, isLanguageId, isUnitId, languageNameOf, stringRecord,
  type CorrectReply, type CorrectRequest, type GlossReply, type PageStatus, type PronounceInfoReply, type PublicStatus, type RecordReply, type SettingsReply,
} from '../protocol';
import { METRIC_KEY_PREFIX, } from '../metrics';
import { EVENT_KEY_PREFIX, getDeviceId } from '../store';
import { createGlossService, defaultPacks, type PackProvider } from './gloss';
import { createProfileService } from './profile';
import { createRecorder } from './recorder';
import { createSessionManager } from './session';
import { createSettings } from './settings';
import { createSyncService } from './sync';
import { QUEUE_PREFIX, REJECTED_PREFIX } from '../../../repository-sync/src';

export const CONTEXT_MENU_ID = 'golearn-lookup';
export const COMMAND_ID = 'lookup-selection';
export const CONTENT_FILE = 'content.js';
const stateKey = (tabId: number): string => `golearn:tab:${tabId}`;

export interface ActivateResult { ok: boolean; message?: string }

export interface BackgroundOptions {
  /** The network. Defaults to the worker's own `fetch`, with a 15 s timeout. Only the background ever calls it. */
  fetch?: typeof fetch;
  now?: () => number;
  /** The language packs (tests pass a fake). */
  packs?: PackProvider;
  timers?: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
}

type SenderKind = 'page' | 'content' | 'foreign';

const PAGE_ONLY: ReadonlySet<string> = new Set<string>([
  MSG.getState, MSG.setEnabled, MSG.serviceConfig, MSG.connect, MSG.createAccount, MSG.disconnect, MSG.syncNow,
  MSG.enrol, MSG.refreshSession, MSG.selectEnrolment, MSG.clearLocal,
]);
const CONTENT_OK: ReadonlySet<string> = new Set<string>([
  MSG.record, MSG.profile, MSG.gloss, MSG.explain, MSG.pronounceInfo, MSG.correct, MSG.metrics, MSG.status, MSG.settings,
]);

const withTimeout = (f: typeof fetch, ms: number): typeof fetch => ((input: RequestInfo | URL, init?: RequestInit) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return f(input, { ...init, signal: ctl.signal }).finally(() => clearTimeout(t));
}) as typeof fetch;

export function createBackground(chrome: ChromeApi, bg: BackgroundOptions = {}) {
  const local = chrome.storage.local;
  const cache = chrome.storage.session ?? chrome.storage.local;
  const stateArea = chrome.storage.session ?? chrome.storage.local;
  const now = bg.now ?? Date.now;
  const doFetch: typeof fetch = bg.fetch ?? withTimeout(((i: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(i, init)) as typeof fetch, 15_000);
  const version = chrome.runtime.getManifest?.().version ?? '0.0.0';

  let deviceIdP: Promise<string> | undefined;
  const deviceId = (): Promise<string> => (deviceIdP ??= getDeviceId(local));

  // ───────────── the services, wired together ─────────────
  const settings = createSettings(local);
  const packs = bg.packs ?? defaultPacks;
  const packAvailable = (l: string): boolean => packs.manifest(l)?.status === 'installable';
  const holder: { recorder?: ReturnType<typeof createRecorder>; sync?: ReturnType<typeof createSyncService>; profile?: ReturnType<typeof createProfileService> } = {};
  const session = createSessionManager({
    extensionId: chrome.runtime.id,
    area: local, fetch: doFetch, now, packAvailable,
    onConnect: async (s) => {
      await holder.profile?.clear();
      await holder.recorder?.setAsideForeign(s.learnerId);
      if (s.enrolmentId && s.languageId) await holder.recorder?.reattributeQueued(s.learnerId, s.enrolmentId, s.languageId);
      await holder.sync?.onSignedIn();
    },
    onEnrolmentChange: async (s) => {
      if (s.enrolmentId && s.languageId) await holder.recorder?.reattributeQueued(s.learnerId, s.enrolmentId, s.languageId);
      holder.sync?.schedule();
    },
    onDisconnect: async () => { await holder.profile?.clear(); },
  });
  const gloss = createGlossService({ area: local, session, fetch: doFetch, packs, now });
  const profile = createProfileService({ area: cache, session, settings: settings.get, now });
  const sync = createSyncService({ area: local, session, deviceId, now, timers: bg.timers, onSynced: async () => { await profile.refreshAfterSync(); } });
  const recorder = createRecorder({ area: local, queue: sync.queue, session, deviceId, version, onQueued: () => sync.schedule() });
  holder.recorder = recorder; holder.sync = sync; holder.profile = profile;

  // ───────────── per-tab state, injection ─────────────
  async function readState(tabId: number): Promise<TabState> {
    try {
      const v = (await stateArea.get(stateKey(tabId)))[stateKey(tabId)] as TabState | undefined;
      return v ?? { enabled: false };
    } catch { return { enabled: false }; }
  }

  async function writeState(tabId: number, state: TabState): Promise<void> {
    try {
      if (!state.enabled && !state.error) await stateArea.remove(stateKey(tabId));
      else await stateArea.set({ [stateKey(tabId)]: state });
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

  // ───────────── status ─────────────
  async function publicStatus(): Promise<PublicStatus> {
    // cheap: a lookup asks for this, so it must not scan the queue
    const [s, needsSignIn] = await Promise.all([session.status(), sync.needsSignIn()]);
    const languageId = s.languageId ?? 'sq';
    return {
      ok: true,
      connected: s.connected,
      needsSignIn: needsSignIn || (s.connected && s.expired),
      languageId,
      languageName: languageNameOf(languageId),
      packAvailable: gloss.packAvailable(languageId),
    };
  }

  async function pageStatus(): Promise<PageStatus> {
    const [pub, s, st, sy] = await Promise.all([publicStatus(), session.status(), settings.get(), sync.status()]);
    return {
      ...pub, email: s.email, baseUrl: s.baseUrl, assetBase: s.assetBase, expiresAt: s.expiresAt, hasEnrolment: s.hasEnrolment, settings: st,
      needsSignIn: pub.needsSignIn || sy.needsSignIn,
      sync: { pending: sy.pending, localOnly: sy.localOnly, rejected: sy.rejected, lastPushAt: sy.lastPushAt, lastError: sy.lastError, online: sy.online, needsSignIn: sy.needsSignIn || (s.connected && s.expired) },
    };
  }

  // ───────────── content-facing handlers (inputs are validated again here) ─────────────
  async function correct(raw: unknown): Promise<CorrectReply> {
    const r = (raw ?? {}) as Partial<CorrectRequest>;
    const formOk = typeof r.formId === 'string' && /^form:[a-z]{2,3}:[^\s,?#&%\u0000-\u001f]{1,160}$/u.test(r.formId);
    if (!formOk || !isLanguageId(r.languageId)) return { ok: false, posted: false, message: 'Not a valid correction.' };
    const lexemeId = r.lexemeId === undefined ? undefined : isUnitId(r.lexemeId) && r.lexemeId.startsWith('lemma:') ? r.lexemeId : null;
    const features = r.features === undefined ? undefined : stringRecord(r.features);
    if (lexemeId === null || (r.features !== undefined && !features)) return { ok: false, posted: false, message: 'Not a valid correction.' };
    if (lexemeId === undefined && !features) return { ok: false, posted: false, message: 'A correction needs a lemma or features.' };
    const reason = cleanText(r.reason, 300);
    const a = await session.authenticated();
    if (!a) return { ok: true, posted: false, reason: (await session.status()).connected ? 'needs-sign-in' : 'not-connected' };
    try {
      const res = await a.api.correct({ formId: r.formId!, languageId: r.languageId, ...(lexemeId ? { lexemeId } : {}), ...(features ? { features } : {}), ...(reason ? { reason } : {}), ...(a.session.enrolmentId ? { enrolmentId: a.session.enrolmentId } : {}) });
      if (res.ok) return { ok: true, posted: true };
      if (res.status === 401) { await sync.noteUnauthorized(); return { ok: true, posted: false, reason: 'needs-sign-in' }; }
      return { ok: true, posted: false, reason: 'refused', message: cleanText(res.message, 200) };
    } catch {
      return { ok: true, posted: false, reason: 'offline' };
    }
  }

  async function storeMetric(raw: unknown): Promise<{ ok: boolean }> {
    const row = (raw as { row?: unknown } | undefined)?.row as { id?: unknown; t?: unknown; at?: unknown } | undefined;
    if (!row || typeof row.id !== 'string' || row.id.length > 80 || !/^m:[\w:.-]+$/.test(row.id) || typeof row.at !== 'string' || !row.t || typeof row.t !== 'object') return { ok: false };
    if (JSON.stringify(row).length > 3_000) return { ok: false };
    try { await local.set({ [METRIC_KEY_PREFIX + row.id]: row }); return { ok: true }; } catch { return { ok: false }; }
  }

  async function pronounceInfo(raw: unknown): Promise<PronounceInfoReply> {
    const languageId = (raw as { languageId?: unknown } | undefined)?.languageId;
    const st = await settings.get();
    if (!isLanguageId(languageId)) return { ok: false, deviceVoice: 'no', remoteConsent: false, sources: [], note: 'Not a valid language.' };
    return {
      ok: true, deviceVoice: 'maybe', remoteConsent: st.remoteSpeechConsent, sources: [],
      note: 'Pronunciation uses a voice installed on this device. Remote voices are not played inside web pages by this version.',
    };
  }

  async function clearLocal(): Promise<{ ok: true; events: number; metrics: number; queued: number }> {
    const all = await local.get(null);
    const keys = Object.keys(all);
    const events = keys.filter((k) => k.startsWith(EVENT_KEY_PREFIX));
    const metrics = keys.filter((k) => k.startsWith(METRIC_KEY_PREFIX));
    const queued = keys.filter((k) => k.startsWith(QUEUE_PREFIX) || k.startsWith(REJECTED_PREFIX));
    const drop = [...events, ...metrics, ...queued];
    if (drop.length) await local.remove(drop);
    await profile.clear();
    return { ok: true, events: events.length, metrics: metrics.length, queued: queued.length };
  }

  // ───────────── the message router ─────────────
  function classify(sender: MessageSender | undefined): SenderKind {
    const myId = chrome.runtime.id;
    if (!sender || !myId || sender.id !== myId) return 'foreign';
    // an extension page is recognised by the document it runs in; a content script runs in a web page and always has a tab
    if (typeof sender.url === 'string' && /^(chrome|moz)-extension:\/\//.test(sender.url) && sender.url.startsWith(`${sender.url.split('://')[0]}://${myId}/`)) return 'page';
    if (sender.tab) return 'content';
    return 'foreign';
  }

  async function handle(type: string, m: Record<string, unknown>, kind: Exclude<SenderKind, 'foreign'>): Promise<unknown> {
    switch (type) {
      case MSG.getState: return typeof m.tabId === 'number' ? readState(m.tabId) : { enabled: false };
      case MSG.setEnabled:
        return typeof m.tabId === 'number'
          ? setEnabled(m.tabId, !!m.enabled).catch(() => ({ enabled: false, error: 'GoLearn could not change this tab.' }) satisfies TabState)
          : { enabled: false };
      case MSG.status: return kind === 'page' ? pageStatus() : publicStatus();
      case MSG.settings: {
        const req = (m ?? {}) as { op?: string; patch?: unknown };
        if (req.op === 'set') return kind === 'page' ? settings.set(req.patch) : ({ ok: false, settings: DEFAULT_SETTINGS, error: 'forbidden' } satisfies SettingsReply);
        return { ok: true, settings: await settings.get(), unavailable: SETTINGS_UNAVAILABLE } satisfies SettingsReply;
      }
      case MSG.record: {
        const reply = await recorder.record(m.event, kind);
        return reply satisfies RecordReply;
      }
      case MSG.profile: {
        const languageId = typeof m.languageId === 'string' ? m.languageId : 'sq';
        const reply = await profile.knowledgeFor(m.unitIds, languageId);
        if (reply.error === 'needs-sign-in') await sync.noteUnauthorized();
        return reply;
      }
      case MSG.gloss: return gloss.glossFor(m) satisfies Promise<GlossReply>;
      case MSG.explain: return gloss.explainFor(m);
      case MSG.pronounceInfo: return pronounceInfo(m);
      case MSG.correct: return correct(m);
      case MSG.metrics: return storeMetric(m);
      // ── extension pages only ──
      case MSG.serviceConfig: {
        const req = m as { op?: string; baseUrl?: string; assetBase?: string };
        if (req.op === 'set') return session.setService({ baseUrl: String(req.baseUrl ?? ''), assetBase: req.assetBase });
        return { ok: true, status: await session.status() };
      }
      case MSG.connect: return session.connect({ baseUrl: String(m.baseUrl ?? ''), email: String(m.email ?? ''), password: String(m.password ?? ''), deviceId: await deviceId() });
      case MSG.createAccount: return session.createAccount({ baseUrl: String(m.baseUrl ?? ''), email: String(m.email ?? ''), password: String(m.password ?? ''), displayName: typeof m.displayName === 'string' ? m.displayName : undefined, deviceId: await deviceId() });
      case MSG.disconnect: return session.disconnect();
      case MSG.syncNow: return { ...(await sync.syncOnce({ force: true })), status: await sync.status() };
      case MSG.refreshSession: return session.refresh();
      case MSG.selectEnrolment: return session.selectEnrolment(String(m.enrolmentId ?? ''));
      case MSG.enrol: {
        const goals = Array.isArray(m.goals) ? (m.goals as Array<{ kind: 'reading' }>) : [{ kind: 'reading' as const }];
        return session.enrol({ languageId: String(m.languageId ?? ''), packId: String(m.packId ?? ''), packVersion: String(m.packVersion ?? ''), goals, ...(typeof m.varietyId === 'string' ? { varietyId: m.varietyId } : {}), ...(typeof m.scriptId === 'string' ? { scriptId: m.scriptId } : {}), ...(typeof m.teamId === 'string' && m.teamId ? { teamId: m.teamId } : {}) });
      }
      case MSG.clearLocal: return clearLocal();
      default: return { ok: false, error: 'unknown-message' };
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
    chrome.tabs?.onRemoved?.addListener((tabId) => { void stateArea.remove(stateKey(tabId)).catch(() => {}); });
    // a navigation drops the activeTab grant and the content script: the per-tab switch must not claim to be on
    chrome.tabs?.onUpdated?.addListener((tabId, change) => { if (change.status === 'loading') void writeState(tabId, { enabled: false }); });

    sync.registerAlarm(chrome);

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const m = message as Record<string, unknown> | undefined;
      const type = m?.type;
      if (typeof type !== 'string' || !type.startsWith('golearn:')) return;
      // messages that GoLearn sends to a content script are not for the background
      if (type === MSG.enable || type === MSG.disable || type === MSG.lookup || type === MSG.ping) return;
      const kind = classify(sender);
      const allowed = kind === 'page' ? (PAGE_ONLY.has(type) || CONTENT_OK.has(type)) : kind === 'content' ? CONTENT_OK.has(type) : false;
      if (!allowed) { sendResponse({ ok: false, error: 'forbidden' }); return; }
      void handle(type, m!, kind as 'page' | 'content').then(sendResponse, () => sendResponse({ ok: false, error: 'internal' }));
      return true;
    });
  }

  return { register, setEnabled, lookupNow, readState, inject, session, sync, recorder, profile, gloss, settings, status: pageStatus, handle };
}

/** A short, plain reason for a failed injection. The browser's wording is not shown raw. */
export function explain(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/cannot access|permission|not allowed|extensions gallery|chrome:\/\//i.test(text)) return 'GoLearn is not allowed to read this page.';
  if (/no tab with id|tab was closed/i.test(text)) return 'That tab is gone.';
  return 'GoLearn could not start on this page.';
}
