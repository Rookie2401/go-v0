/**
 * The action popup: connection status (connected as <email> / not connected -> "Open GoLearn setup"; an account is optional and
 * the extension works without one), the "Practise" link to GoPractice (the extension's own page, no account needed), the per-tab
 * switch, the language of the enrolment, the sync status (pending events, last sync, last error), and export / delete
 * of what is on this device. Opening the popup is the user gesture that grants activeTab; the background worker injects
 * the content script when the switch is turned on. Everything about the connection comes from the background as
 * text: this page never holds a token.
 */
import { ACTIVE_LEVELS, LEVEL_LEGEND } from '../src/active/levels';
import { createStorageMetricsStore, exportMetrics } from '../src/metrics';
import { MSG, getChrome, type ChromeApi, type TabState } from '../src/platform';
import { ACTIVE_ORIGINS, type ActiveReply, type ActiveSettings, type PageStatus } from '../src/protocol';
import { createStorageEncounterStore } from '../src/store';

export interface PopupHandle { refresh(): Promise<void> }

const ago = (t: number | undefined, now = Date.now()): string => {
  if (t === undefined) return 'never';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
};

export async function initPopup(doc: Document, chrome: ChromeApi): Promise<PopupHandle> {
  const $ = <T extends HTMLElement>(id: string): T => doc.getElementById(id) as T;
  const toggle = $<HTMLInputElement>('enabled');
  const errorEl = $('error');
  const countEl = $('count');
  const out = $<HTMLTextAreaElement>('output');
  const events = createStorageEncounterStore(chrome.storage.local);
  const metrics = createStorageMetricsStore(chrome.storage.local);

  let tabId: number | undefined;
  try { tabId = (await chrome.tabs?.query({ active: true, currentWindow: true }))?.[0]?.id; } catch { tabId = undefined; }

  const show = (state: TabState | undefined) => {
    toggle.checked = !!state?.enabled;
    errorEl.textContent = state?.error ?? '';
  };

  async function status(): Promise<PageStatus | undefined> {
    try {
      const s = (await chrome.runtime.sendMessage({ type: MSG.status })) as PageStatus | undefined;
      return s && s.ok === true ? s : undefined;
    } catch { return undefined; }
  }

  function renderStatus(s: PageStatus | undefined): void {
    const conn = $('connection');
    const setup = $<HTMLButtonElement>('open-setup');
    const syncLine = $('sync');
    const detail = $('sync-detail');
    const syncBtn = $<HTMLButtonElement>('sync-now');
    conn.classList.remove('warn');
    if (!s) {
      conn.textContent = 'The background worker did not answer. Reload the extension.';
      conn.classList.add('warn');
      syncLine.textContent = ''; detail.textContent = ''; syncBtn.disabled = true;
      return;
    }
    $('language').textContent = `${s.languageName} (${s.languageId})${s.packAvailable ? '' : ' - no pack yet'}`;
    if (s.connected) {
      conn.textContent = s.needsSignIn ? `Signed in as ${s.email ?? 'your account'}, but the service no longer accepts the sign-in.` : `Connected as ${s.email ?? 'your account'}`;
      if (s.needsSignIn) conn.classList.add('warn');
      setup.textContent = s.needsSignIn ? 'Sign in again' : s.hasEnrolment ? 'Open GoLearn setup' : 'Finish setup (choose a language)';
    } else {
      conn.textContent = 'Not connected. Your lookups are kept on this device.';
      setup.textContent = 'Open GoLearn setup';
    }
    const y = s.sync;
    syncBtn.disabled = !s.connected || s.needsSignIn;
    if (!s.connected) { syncLine.textContent = y.localOnly ? `${y.localOnly} event${y.localOnly === 1 ? '' : 's'} waiting for an account` : 'Nothing to sync.'; syncLine.classList.remove('warn'); detail.textContent = ''; return; }
    syncLine.textContent = `Sync: ${y.pending} pending · last sync ${ago(y.lastPushAt)}${y.online ? '' : ' · offline'}${y.rejected ? ` · ${y.rejected} refused by the service` : ''}`;
    syncLine.classList.toggle('warn', !!y.lastError);
    detail.textContent = y.lastError ?? '';
  }

  // ── GoLearn Active: the switch, Speak on click, the legend, and withdrawing the page access ──
  const activeToggle = $<HTMLInputElement>('active');
  const speakToggle = $<HTMLInputElement>('speak');
  const activeStatus = $('active-status');
  const revoke = $<HTMLButtonElement>('active-revoke');
  const legend = $('active-legend');
  for (const level of ACTIVE_LEVELS) {
    const li = doc.createElement('li');
    const sample = doc.createElement('span');
    sample.className = `sw sw-${level}`;
    sample.textContent = LEVEL_LEGEND[level].title;
    li.append(sample, `: ${LEVEL_LEGEND[level].detail} (${LEVEL_LEGEND[level].style})`);
    legend.append(li);
  }
  const isActiveReply = (v: unknown): v is ActiveReply => !!v && typeof v === 'object' && typeof (v as { ok?: unknown }).ok === 'boolean' && typeof (v as { settings?: unknown }).settings === 'object';
  async function activeCall(op: 'get' | 'set', patch?: Partial<ActiveSettings>): Promise<ActiveReply | undefined> {
    try { const r = await chrome.runtime.sendMessage({ type: MSG.active, op, ...(patch ? { patch } : {}) }); return isActiveReply(r) ? r : undefined; } catch { return undefined; }
  }
  function showActive(r: ActiveReply | undefined): void {
    activeStatus.classList.remove('warn');
    if (!r) { activeToggle.disabled = true; speakToggle.disabled = true; revoke.hidden = true; activeStatus.textContent = 'The background worker did not answer about Active.'; return; }
    activeToggle.disabled = false;
    activeToggle.checked = r.settings.active;
    speakToggle.checked = r.settings.speakOnClick;
    speakToggle.disabled = !r.settings.active;
    revoke.hidden = !r.granted;
    if (!r.ok && r.message) { activeStatus.textContent = r.message; activeStatus.classList.add('warn'); return; }
    if (r.settings.active && r.registered) activeStatus.textContent = `On. Pages you open from now on are read on this device and the words you have met are underlined (${r.excluded} refusing readers excluded). A page that is already open gets it when you reload it.`;
    else if (r.settings.active) { activeStatus.textContent = 'On, but GoLearn is not registered for pages; switch it off and on again.'; activeStatus.classList.add('warn'); }
    else if (r.granted) activeStatus.textContent = 'Off. Brave lets GoLearn read pages; switch Active on to use that, or withdraw the access below.';
    else activeStatus.textContent = 'Off. Nothing is read before you select a word.';
  }
  activeToggle.addEventListener('change', async () => {
    activeToggle.disabled = true;
    if (activeToggle.checked) {
      // the browser's own prompt, inside this click; a "no" keeps everything as it was
      let granted = false;
      try { granted = (await chrome.permissions?.request({ origins: [...ACTIVE_ORIGINS] })) === true; } catch { granted = false; }
      if (!granted) { activeToggle.checked = false; activeToggle.disabled = false; activeStatus.textContent = 'Brave did not allow GoLearn to read pages, so Active stays off.'; activeStatus.classList.add('warn'); return; }
      showActive(await activeCall('set', { active: true }));
    } else showActive(await activeCall('set', { active: false }));
  });
  speakToggle.addEventListener('change', async () => { showActive(await activeCall('set', { speakOnClick: speakToggle.checked })); });
  revoke.addEventListener('click', async () => {
    revoke.disabled = true;
    try { await chrome.permissions?.remove({ origins: [...ACTIVE_ORIGINS] }); } catch { /* the reply below says what the browser still allows */ }
    showActive(await activeCall('set', { active: false }));
    revoke.disabled = false;
  });

  async function refresh(): Promise<void> {
    countEl.textContent = String(await events.count().catch(() => 0));
    renderStatus(await status());
    showActive(await activeCall('get'));
    if (tabId === undefined) { toggle.disabled = true; errorEl.textContent = 'No active tab.'; return; }
    try { show((await chrome.runtime.sendMessage({ type: MSG.getState, tabId })) as TabState | undefined); } catch { show(undefined); }
  }

  toggle.addEventListener('change', async () => {
    if (tabId === undefined) return;
    toggle.disabled = true;
    try { show((await chrome.runtime.sendMessage({ type: MSG.setEnabled, tabId, enabled: toggle.checked })) as TabState | undefined); }
    catch { toggle.checked = false; errorEl.textContent = 'GoLearn could not change this tab.'; }
    toggle.disabled = false;
  });

  $('open-setup').addEventListener('click', () => {
    try { void chrome.runtime.openOptionsPage?.(); } catch { errorEl.textContent = 'GoLearn could not open the setup page.'; }
  });

  // GoPractice is a page of this extension (the build writes it to practice/); it needs no account
  $('practise').addEventListener('click', () => {
    const api = chrome as unknown as { runtime: { getURL?(path: string): string }; tabs?: { create?(p: { url: string }): Promise<unknown> } };
    const url = api.runtime.getURL?.('practice/index.html');
    if (!url) { errorEl.textContent = 'GoLearn could not find the practice page.'; return; }
    try {
      if (api.tabs?.create) void api.tabs.create({ url }); else window.open(url, '_blank', 'noopener');
    } catch { errorEl.textContent = 'GoLearn could not open the practice page.'; }
  });

  $('sync-now').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('sync-now');
    btn.disabled = true;
    try { await chrome.runtime.sendMessage({ type: MSG.syncNow }); } catch { /* the status below says what happened */ }
    await refresh();
  });

  const print = (text: string) => { out.hidden = false; out.value = text; out.focus(); out.select(); };
  $('export-events').addEventListener('click', async () => print(await events.exportRows()));
  $('export-metrics').addEventListener('click', async () => print(await exportMetrics(metrics)));
  const del = $<HTMLButtonElement>('delete-all');
  const deleteNote = $('delete-note');
  let armed = false;
  // the first click only arms the button; leaving it (focus moves elsewhere) disarms it, so a later click is never a surprise
  del.addEventListener('blur', () => { if (armed) { armed = false; del.textContent = 'Delete all rows'; deleteNote.textContent = 'Nothing was deleted.'; } });
  del.addEventListener('click', async () => {
    if (!armed) { armed = true; del.textContent = 'Click again to delete'; deleteNote.textContent = 'Click Delete all rows again to delete every encounter and metric stored on this device. Move on to cancel.'; return; }
    armed = false; del.textContent = 'Delete all rows'; deleteNote.textContent = '';
    await events.clear(); await metrics.clear();
    try { await chrome.runtime.sendMessage({ type: MSG.clearLocal }); } catch { /* the rows above are gone; the queue is cleared by the worker when it answers */ }
    out.hidden = true; out.value = '';
    deleteNote.textContent = 'All rows on this device were deleted.';
    await refresh();
  });

  await refresh();
  return { refresh };
}

if (typeof document !== 'undefined' && document.getElementById('golearn-popup') && getChrome()) {
  void initPopup(document, getChrome()!);
}
