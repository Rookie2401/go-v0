/**
 * The action popup: connection status (connected as <email> / not connected -> "Open GoLearn setup"), the per-tab
 * switch, the language of the enrolment, the sync status (pending events, last sync, last error), and export / delete
 * of what is on this device. Opening the popup is the user gesture that grants activeTab; the background worker injects
 * the content script when the switch is turned on. Everything about the connection comes from the background as
 * text: this page never holds a token.
 */
import { createStorageMetricsStore, exportMetrics } from '../src/metrics';
import { MSG, getChrome, type ChromeApi, type TabState } from '../src/platform';
import type { PageStatus } from '../src/protocol';
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

  async function refresh(): Promise<void> {
    countEl.textContent = String(await events.count().catch(() => 0));
    renderStatus(await status());
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
