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
import { createActiveService } from './active';
import { createGlossService, defaultPacks, type PackProvider } from './gloss';
import { createFormsService } from './forms';
import { levelOf } from '../../../language-packs/src/manifest';
import { PACKS } from '../../../language-packs/src/registry';
import { createLocalRepoService } from './localRepo';
import { createProfileService } from './profile';
import { createRecorder } from './recorder';
import { createSessionManager } from './session';
import { createSettings } from './settings';
import { restrictStorageToTrustedContexts } from './storageAccess';
import { createSyncService } from './sync';
import { createLocalTranslationService } from './translation';
import { createSpeechService } from './speech';
import { QUARANTINE_PREFIX, QUEUE_PREFIX, REJECTED_PREFIX } from '../../../repository-sync/src';

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
  /** The service address the extension ships with; read from app/config.json when absent (tests pass one). */
  defaultServiceUrl?: string;
}

type SenderKind = 'page' | 'content' | 'foreign';

const PAGE_ONLY: ReadonlySet<string> = new Set<string>([
  MSG.getState, MSG.setEnabled, MSG.serviceConfig, MSG.connect, MSG.createAccount, MSG.disconnect, MSG.syncNow,
  MSG.enrol, MSG.refreshSession, MSG.selectEnrolment, MSG.useLanguage, MSG.clearLocal, MSG.localRepo,
  MSG.speechConfig,
]);
const CONTENT_OK: ReadonlySet<string> = new Set<string>([
  MSG.record, MSG.profile, MSG.gloss, MSG.entry, MSG.explain, MSG.pronounceInfo, MSG.correct, MSG.metrics, MSG.status, MSG.settings,
  MSG.keepWarm,
  MSG.active, // a content script may read the Active switches (to start on a page); only an extension page may set them (active.ts checks the kind)
  MSG.activeProfile, // the scan's learner-model question: device rows only, and only while Active is on (below)
  MSG.confirmForms, // the scan's dictionary question: public dictionary data only, forms in, lemmas out
  MSG.translateSentence,
  MSG.speech,
]);

type TimedRequestInit = RequestInit & { timeoutMs?: number };
const withTimeout = (f: typeof fetch, ms: number): typeof fetch => ((input: RequestInfo | URL, init?: TimedRequestInit) => {
  const ctl = new AbortController();
  const incoming = init?.signal;
  const abort = () => ctl.abort(incoming?.reason);
  if (incoming?.aborted) abort(); else incoming?.addEventListener('abort', abort, { once: true });
  const requestedTimeout = init?.timeoutMs;
  const timeout = typeof requestedTimeout === 'number' && Number.isFinite(requestedTimeout)
    ? Math.max(1, Math.min(60_000, requestedTimeout)) : ms;
  const t = setTimeout(() => ctl.abort(), timeout);
  const { timeoutMs: _timeoutMs, ...forward } = init ?? {};
  return f(input, { ...forward, signal: ctl.signal }).finally(() => {
    clearTimeout(t);
    incoming?.removeEventListener('abort', abort);
  });
}) as typeof fetch;

export function createBackground(chrome: ChromeApi, bg: BackgroundOptions = {}) {
  // before anything is stored: the token must not be readable from a content script's context
  restrictStorageToTrustedContexts(chrome);
  const local = chrome.storage.local;
  const cache = chrome.storage.session ?? chrome.storage.local;
  const stateArea = chrome.storage.session ?? chrome.storage.local;
  const now = bg.now ?? Date.now;
  // Test/integration callers that inject fetch keep their original Request and
  // AbortSignal semantics. Production fetch still receives the central timeout
  // wrapper, including the bounded per-request override used by translation.
  const defaultFetch = ((i: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(i, init)) as typeof fetch;
  const doFetch: typeof fetch = bg.fetch ?? withTimeout(defaultFetch, 15_000);
  const version = chrome.runtime.getManifest?.().version ?? '0.0.0';

  let deviceIdP: Promise<string> | undefined;
  const deviceId = (): Promise<string> => (deviceIdP ??= getDeviceId(local));

  // ───────────── the services, wired together ─────────────
  const settings = createSettings(local);
  const speech = createSpeechService({ area: local, settings: settings.get, fetch: doFetch,
    extensionId: chrome.runtime.id,
    account: async () => {
      const authenticated = await session.authenticated();
        return authenticated ? { baseUrl: authenticated.service.baseUrl, token: authenticated.session.token, learnerId: authenticated.session.learnerId } : undefined;
    },
    hasPermission: async (origin) => await chrome.permissions?.contains({ origins: [origin] }) === true,
  });
  const packs = bg.packs ?? defaultPacks;
  const packAvailable = (l: string): boolean => packs.manifest(l)?.status === 'installable';
  const holder: { recorder?: ReturnType<typeof createRecorder>; sync?: ReturnType<typeof createSyncService>; profile?: ReturnType<typeof createProfileService>; local?: ReturnType<typeof createLocalRepoService> } = {};
  /** The service address the extension ships with (app/config.json's serviceUrl), read once; undefined outside an extension or without one.
   * When there is one it is the address in use, whatever golearn:service holds (2026-10-28: no client can change the service address). */
  let defaultServiceP: Promise<string | undefined> | undefined;
  function defaultServiceUrl(): Promise<string | undefined> {
    defaultServiceP ??= (async () => {
      if (bg.defaultServiceUrl) return bg.defaultServiceUrl.replace(/\/+$/, '');
      try {
        const url = chrome.runtime.getURL?.('app/config.json');
        if (!url) return undefined;
        const res = await doFetch(url);
        if (!res.ok) return undefined;
        const cfg = JSON.parse(await res.text()) as { serviceUrl?: unknown };
        return typeof cfg.serviceUrl === 'string' && /^https?:\/\//.test(cfg.serviceUrl) ? cfg.serviceUrl.replace(/\/+$/, '') : undefined;
      } catch { return undefined; }
    })();
    return defaultServiceP;
  }

  const session = createSessionManager({
    extensionId: chrome.runtime.id,
    area: local, fetch: doFetch, now, packAvailable, shippedBaseUrl: defaultServiceUrl,
    onConnect: async (s) => {
      await holder.profile?.clear();
      await holder.recorder?.setAsideForeign(s.learnerId);
      if (s.enrolmentId && s.languageId) await holder.recorder?.reattributeQueued(s.learnerId, s.enrolmentId, s.languageId);
      await holder.recorder?.fileWaitingMarks(s);
      await holder.sync?.onSignedIn();
      await holder.local?.afterSignIn(); // the device's history goes up once, then the account's comes down (failures are recorded, never thrown)
    },
    onEnrolmentChange: async (s) => {
      if (s.enrolmentId && s.languageId) await holder.recorder?.reattributeQueued(s.learnerId, s.enrolmentId, s.languageId);
      await holder.recorder?.fileWaitingMarks(s);
      holder.sync?.schedule();
      // events that waited for an enrolment in their language can go now. Not waited for (2026-11-08): it uploads and pulls, and a language
      // switch selects an enrolment, so a slow or hanging service held the popup on "Switching to …" for two request timeouts (30 s)
      void holder.local?.afterEnrolment();
    },
    onDisconnect: async () => { await holder.profile?.clear(); },
  });
  const gloss = createGlossService({ area: local, session, fetch: doFetch, packs, now, getURL: (path) => chrome.runtime.getURL?.(path) });
  const forms = createFormsService({ gloss });
  const translation = createLocalTranslationService({
    fetch: doFetch,
    extensionId: chrome.runtime.id,
    getURL: (path) => chrome.runtime.getURL?.(path) ?? '',
    hasLoopbackPermission: chrome.permissions?.contains
      ? () => chrome.permissions!.contains!({ origins: [['http:', '', '127.0.0.1:8792', '*'].join('/') ] })
      : undefined,
  });
  // GoLearn Active: the switches, the host-permission check and the dynamic content script (the popup asks the browser for the permission)
  const active = createActiveService({ chrome, area: local, contentFile: CONTENT_FILE, now });
  // the device's own Repository: GoLearn works with no account, and the account only keeps the history across devices
  const localRepo = createLocalRepoService({ area: local, deviceId, session, packs, now });
  const profile = createProfileService({ area: cache, session, settings: settings.get, now, local: localRepo.forProfile });
  const sync = createSyncService({ area: local, session, deviceId, now, timers: bg.timers, onSynced: async () => {
    await profile.refreshAfterSync();
    // the account's enrolments are read again now and then (a language chosen on another device; a session from before they were kept): marks waiting for one go up
    const s = await session.refreshEnrolments();
    if (s && await holder.recorder?.fileWaitingMarks(s)) holder.sync?.schedule();
  } });
  const recorder = createRecorder({ area: local, queue: sync.queue, session, deviceId, version, now: Date.now, onQueued: () => sync.schedule(), onRecorded: (e, attributed) => localRepo.record(e, attributed) });
  holder.recorder = recorder; holder.sync = sync; holder.profile = profile; holder.local = localRepo;

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
    const [s, needsSignIn, onDevice] = await Promise.all([session.status(), sync.needsSignIn(), localRepo.activeLanguage()]);
    // the language the learner chose on THIS device (the popup's switch, the setup page's Use for reading); with none, the account's enrolment;
    // with none, Albanian (the reference language). The device's choice comes first (2026-11-08): the account's enrolment follows it in the
    // background, and while the service is slow or unreachable the account's old language must not undo a switch the learner just made.
    const languageId = onDevice ?? s.languageId ?? 'sq';
    // the languages the reader resolves against: the ones the learner chose (device enrolments, account enrolment), so a page in the
    // chosen language is recognised from its own word list and no other pack's chunk is loaded to compare; with none chosen, every pack
    const all = Object.keys(PACKS).filter((l) => { const m = packs.manifest(l); return !!m && levelOf(m) !== 'planned'; });
    const chosen = [...new Set([onDevice, s.languageId, ...(await localRepo.chosenLanguages())].filter((l): l is string => !!l && all.includes(l)))];
    return {
      ok: true,
      connected: s.connected,
      needsSignIn: needsSignIn || (s.connected && s.expired),
      languageId,
      languageName: languageNameOf(languageId),
      packAvailable: gloss.packAvailable(languageId),
      installedLanguages: chosen.length ? chosen : all,
    };
  }

  /**
   * The popup's language switch (2026-10-25): make `languageId`, one of the chosen languages, the one GoLearn reads in. On the device the
   * open enrolment in that language becomes the active one (the worker records against it); signed in, the account's open enrolment in
   * it is selected too. Pages that are Active start again, so they resolve and scan in the new language.
   * A language with no enrolment anywhere is refused: it is chosen in the setup page, where the pack is downloaded.
   *
   * Nothing here waits on the service (2026-11-08: signed in, a slow or unreachable service held the popup on "Switching to …" for up to
   * 40 s, and the switch was then undone by the account's old language): the device switches at once, the account's enrolment is taken from
   * the list kept on the session, and only when that list has none in this language is the service asked, in the background.
   */
  async function useLanguage(languageId: string): Promise<{ ok: boolean; languageId?: string; languageName?: string; where?: 'device' | 'account' | 'both'; message?: string }> {
    if (!isLanguageId(languageId)) return { ok: false, message: 'Not a language.' };
    let onDevice = false;
    const list = await localRepo.handle({ op: 'enrolments' }) as { ok: boolean; enrolments?: Array<{ enrolmentId: string; languageId: string; endedAt?: string; explicit: boolean }> };
    const have = list.ok ? (list.enrolments ?? []).find((e) => e.languageId === languageId && !e.endedAt && e.explicit) : undefined;
    if (have) {
      const r = await localRepo.handle({ op: 'select', enrolmentId: have.enrolmentId }) as { ok: boolean };
      onDevice = r.ok;
    } else {
      // a language chosen on the account (the hosted setup app, another device) but not yet on this one: enrol it here too, as the setup
      // page's Download would, so the switch works even while the service cannot be reached (2026-10-27). The dictionary pack is not
      // fetched by this; meanings then come from the service or the hosted copy, and Settings says "no pack yet" until it is downloaded.
      const chosen = (await accountLanguages()).languages.includes(languageId) || !!packs.manifest(languageId);
      if (chosen) {
        const r = await localRepo.handle({ op: 'enrol', languageId, goals: [{ kind: 'reading' }] }) as { ok: boolean };
        onDevice = r.ok;
      }
    }
    let onAccount = (await session.selectKnownLanguage(languageId))?.ok === true;
    if (!onAccount && !onDevice) onAccount = await selectOnAccount(languageId); // nothing on this device: only the account can serve, so it is waited for
    else if (!onAccount) void selectOnAccount(languageId).catch(() => false);
    if (!onDevice && !onAccount) return { ok: false, message: `${languageNameOf(languageId)} is not one of your chosen languages here. Download it in GoLearn setup first.` };
    await active.restart();
    return { ok: true, languageId, languageName: languageNameOf(languageId), where: onDevice && onAccount ? 'both' : onDevice ? 'device' : 'account' };
  }

  /**
   * The account's newest open enrolment in `languageId`, asked of the service and selected: the slow path of a switch, for a language the kept
   * list does not have (chosen on another device since it was read). Skipped when the learner has meanwhile switched this device to another language.
   */
  async function selectOnAccount(languageId: string): Promise<boolean> {
    const a = await session.authenticated();
    if (!a) return false;
    let r: Awaited<ReturnType<typeof a.api.listEnrolments>> | undefined;
    try { r = await a.api.listEnrolments(); } catch { return false; }
    const remote = r?.ok ? r.data.enrolments.filter((e) => e.languageId === languageId && !e.endedAt).sort((x, y) => y.startedAt.localeCompare(x.startedAt))[0] : undefined;
    if (!remote) return false;
    const onDevice = await localRepo.activeLanguage();
    if (onDevice && onDevice !== languageId) return false;
    return (await session.selectEnrolment(remote.enrolmentId)).ok;
  }

  /**
   * The languages of the account's open enrolments: read from the service when signed in and it answers within a moment, and kept in
   * storage so that the next time it does not answer (the owner's network filters a name, the address is stale) the popup still lists
   * them (2026-10-27). `fresh` is false only when neither the service nor the stored copy gave a list.
   * A stored copy is answered at once and the service is asked again in the background (2026-11-08: every popup opening waited up to 2.5 s
   * on a slow service, and once more after each switch); only with no copy yet does the answer wait, up to 2.5 s.
   */
  const ACCOUNT_LANGUAGES_KEY = 'golearn:account-languages';
  async function accountLanguages(): Promise<{ languages: string[]; fresh: boolean }> {
    const a = await session.authenticated();
    if (!a) return { languages: [], fresh: true };
    let kept: string[] | undefined;
    try {
      const k = (await local.get(ACCOUNT_LANGUAGES_KEY))[ACCOUNT_LANGUAGES_KEY] as { learnerId?: string; languages?: unknown } | undefined;
      if (k && k.learnerId === a.session.learnerId && Array.isArray(k.languages)) kept = k.languages.filter((l): l is string => typeof l === 'string');
    } catch { /* no copy */ }
    const ask = a.api.listEnrolments().then(async (r) => {
      if (!r.ok) return undefined;
      const live = [...new Set(r.data.enrolments.filter((e) => !e.endedAt).map((e) => e.languageId))];
      try { await local.set({ [ACCOUNT_LANGUAGES_KEY]: { learnerId: a.session.learnerId, languages: live } }); } catch { /* the list still serves this call */ }
      return live;
    }, () => undefined);
    if (kept) return { languages: kept, fresh: true };
    const quiet = new Promise<string[] | undefined>((resolve) => setTimeout(() => resolve(undefined), 2500));
    const live = await Promise.race([ask, quiet]);
    return live ? { languages: live, fresh: true } : { languages: [], fresh: false };
  }

  /** A session from before the name was kept (2026-10-28): the enrolments are re-read once per worker life, which stores the name for the next status. */
  let nameAsked = false;
  async function pageStatus(): Promise<PageStatus> {
    const [pub, s, st, sy] = await Promise.all([publicStatus(), session.status(), settings.get(), sync.status()]);
    if (s.connected && !s.expired && !s.displayName && !nameAsked) { nameAsked = true; void session.refresh().catch(() => undefined); }
    // `revocationPending`: the last sign-out could not reach the service (audit P-08); the setup page may say so
    const out: PageStatus & { revocationPending?: boolean } = {
      // a language chosen on this device counts: an account without an enrolment yet must not make the popup say "choose a language"
      ...pub, email: s.email, displayName: s.displayName, baseUrl: s.baseUrl, assetBase: s.assetBase, expiresAt: s.expiresAt, hasEnrolment: s.hasEnrolment || pub.installedLanguages !== undefined && (await localRepo.chosenLanguages()).length > 0, settings: st,
      // the popup's language switch lists these: the account's enrolment first, then the device's open enrolments in setup order, then the
      // account's other open enrolments (a language chosen in the hosted setup app or on another device; read from the service when it
      // answers within a moment, else the copy kept from the last time it did)
      ...(await (async () => {
        const acct = await accountLanguages();
        return {
          chosenLanguages: [...new Set([s.languageId, ...(await localRepo.chosenLanguages()), ...acct.languages].filter((l): l is string => !!l))],
          accountLanguagesFresh: acct.fresh,
        };
      })()),
      needsSignIn: pub.needsSignIn || sy.needsSignIn,
      sync: { pending: sy.pending, localOnly: sy.localOnly, rejected: sy.rejected, lastPushAt: sy.lastPushAt, lastError: sy.lastError, online: sy.online, needsSignIn: sy.needsSignIn || (s.connected && s.expired) },
      ...(s.revocationPending ? { revocationPending: true } : {}),
    };
    return out;
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
      ok: true, deviceVoice: 'maybe', remoteConsent: st.remoteSpeechConsent && st.localOnlySpeech === false, sources: [],
      note: st.localOnlySpeech !== false ? 'Local-only speech: a matching installed voice is required.' : 'Azure speech uses the authenticated backend when source permissions allow it; matching device voices provide fallback.',
    };
  }

  async function clearLocal(): Promise<{ ok: true; events: number; metrics: number; queued: number }> {
    await localRepo.clear().catch(() => undefined); // the device-local Repository too: nothing of the learner's history stays on the device
    const all = await local.get(null);
    const keys = Object.keys(all);
    const events = keys.filter((k) => k.startsWith(EVENT_KEY_PREFIX));
    const metrics = keys.filter((k) => k.startsWith(METRIC_KEY_PREFIX));
    const queued = keys.filter((k) => k.startsWith(QUEUE_PREFIX) || k.startsWith(REJECTED_PREFIX) || k.startsWith(QUARANTINE_PREFIX));
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

  async function handle(type: string, m: Record<string, unknown>, kind: Exclude<SenderKind, 'foreign'>, sender?: MessageSender): Promise<unknown> {
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
        // an exception (a full or failing store) is a reason the card can show, not a bare 'internal'
        const reply = await recorder.record(m.event, kind).catch((e: unknown): RecordReply => ({ ok: false, error: `failed: ${e instanceof Error ? e.message : String(e)}` }));
        return reply satisfies RecordReply;
      }
      case MSG.profile: {
        const languageId = typeof m.languageId === 'string' ? m.languageId : 'sq';
        const reply = await profile.knowledgeFor(m.unitIds, languageId);
        if (reply.error === 'needs-sign-in') await sync.noteUnauthorized();
        return reply;
      }
      case MSG.gloss: return gloss.glossFor(m) satisfies Promise<GlossReply>;
      case MSG.entry: return gloss.entryFor(m);
      case MSG.confirmForms: return forms.confirm(m);
      case MSG.explain: return gloss.explainFor(m);
      case MSG.pronounceInfo: return pronounceInfo(m);
      case MSG.speechConfig: return kind === 'page' ? speech.configure(m) : { ok: false };
      case MSG.speech: return speech.handle(m, `${sender?.tab?.id ?? 'page'}:${sender?.frameId ?? 0}`, sender?.url);
      case MSG.correct: return correct(m);
      case MSG.metrics: return storeMetric(m);
      case MSG.keepWarm: void localRepo.open(); return { ok: true }; // a page is being read: start the open (once), answer at once; the reply resets the browser's idle timer
      case MSG.active: if (kind === 'content') void localRepo.open(); return active.handle(m, kind); // a page load pre-warms the device Repository
      case MSG.activeProfile: {
        // the words on the learner's screen, by the learner's own switch: never trimmed like a long selection, never sent to the service
        const s = await active.get();
        if (!s.active || !(await active.granted())) return { ok: false, error: 'inactive' };
        const languageId = typeof m.languageId === 'string' ? m.languageId : 'sq';
        return profile.knowledgeFor(m.unitIds, languageId, { deviceOnly: true });
      }
      case MSG.translateSentence:
        if (kind !== 'content') return { ok: false, reason: 'unavailable' };
        return translation.translate(m);
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
      case MSG.useLanguage: return useLanguage(String(m.languageId ?? ''));
      case MSG.enrol: {
        const goals = Array.isArray(m.goals) ? (m.goals as Array<{ kind: 'reading' }>) : [{ kind: 'reading' as const }];
        return session.enrol({ languageId: String(m.languageId ?? ''), packId: String(m.packId ?? ''), packVersion: String(m.packVersion ?? ''), goals, ...(typeof m.varietyId === 'string' ? { varietyId: m.varietyId } : {}), ...(typeof m.scriptId === 'string' ? { scriptId: m.scriptId } : {}), ...(typeof m.teamId === 'string' && m.teamId ? { teamId: m.teamId } : {}) });
      }
      case MSG.clearLocal: return clearLocal();
      case MSG.localRepo: return localRepo.handle(m);
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
    // the device-local Repository is NOT opened here (2026-11-10): every worker wake (the one-minute sync alarm too) refolded the whole history. It opens on the first
    // message that needs it (status, profile, record, keep-warm, active) instead.
    void active.restore(); // keep Active's registration in step with the permission the learner may have withdrawn meanwhile
    active.watchPermission();

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const m = message as Record<string, unknown> | undefined;
      const type = m?.type;
      if (typeof type !== 'string' || !type.startsWith('golearn:')) return;
      // messages that GoLearn sends to a content script are not for the background
      if (type === MSG.enable || type === MSG.disable || type === MSG.lookup || type === MSG.ping || type === MSG.activate || type === MSG.deactivate) return;
      const kind = classify(sender);
      const allowed = kind === 'page' ? (PAGE_ONLY.has(type) || CONTENT_OK.has(type)) : kind === 'content' ? CONTENT_OK.has(type) : false;
      if (!allowed) { sendResponse({ ok: false, error: 'forbidden' }); return; }
      void handle(type, m!, kind as 'page' | 'content', sender).then(sendResponse, () => sendResponse({ ok: false, error: 'internal' }));
      return true;
    });
  }

  return { register, setEnabled, lookupNow, readState, inject, session, sync, recorder, profile, gloss, settings, local: localRepo, active, translation, status: pageStatus, handle };
}

/** A short, plain reason for a failed injection. The browser's wording is not shown raw. */
export function explain(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/cannot access|permission|not allowed|extensions gallery|chrome:\/\//i.test(text)) return 'GoLearn is not allowed to read this page.';
  if (/no tab with id|tab was closed/i.test(text)) return 'That tab is gone.';
  return 'GoLearn could not start on this page.';
}
